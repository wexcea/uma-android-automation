package com.steve1316.uma_android_automation.bot.solver

import com.steve1316.uma_android_automation.bot.solver.TestFixtures.epithet
import com.steve1316.uma_android_automation.bot.solver.TestFixtures.race
import com.steve1316.uma_android_automation.bot.solver.TestFixtures.state
import com.steve1316.uma_android_automation.types.RaceGrade
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test

@DisplayName("Heuristic beam search")
class HeuristicTest {
    @Test
    fun emptyStateReturnsTrainOnlySchedule() {
        val st = state(currentTurn = 70, races = emptyList(), epithets = emptyList())
        val schedule = Heuristic.search(st)

        assertTrue(schedule.decisions.values.all { it == Decision.Train || it == Decision.Rest })
        assertTrue(schedule.projectedEpithets.isEmpty())
    }

    @Test
    fun heavilyWeightedEpithetOutweighsFansOnSameTurn() {
        // Turn 64: choice between a rich-fan G1 with no epithet hook and a smaller G1 that
        // completes an epithet. With a strong epithet weight the solver favours the epithet.
        val rich = race("Rich Stakes", 64, grade = RaceGrade.G1, fans = 100000)
        val key = race("Key Stakes", 64, grade = RaceGrade.G1, fans = 5000)
        val target =
            epithet(
                name = "Key Win",
                matchers = listOf(EpithetMatcher.WinRace("Key Stakes")),
                rewardKind = "stat",
                amount = 30,
            )
        val st =
            state(
                currentTurn = 64,
                races = listOf(rich, key),
                epithets = listOf(target),
                targetEpithets = setOf("Key Win"),
                weights = Weights(epithetValue = 100.0),
            )

        val schedule = Heuristic.search(st)
        assertTrue("Key Win" in schedule.projectedEpithets)
        val raceAt64 = schedule.decisions[64]
        assertTrue(raceAt64 is Decision.RaceDecision && raceAt64.raceKey == key.key)
    }

    @Test
    fun lockedDecisionIsHonoured() {
        val r = race("Locked Race", 30)
        val st =
            state(
                currentTurn = 28,
                races = listOf(r),
                epithets = emptyList(),
                lockedDecisions = mapOf(30 to Decision.RaceDecision(r.key)),
            )

        val schedule = Heuristic.search(st)
        val locked = schedule.decisions[30]
        assertTrue(locked is Decision.RaceDecision && locked.raceKey == r.key)
    }

    @Test
    fun ineligibleRaceIsDropped() {
        // All-G aptitudes — the race is filtered out, so Train is chosen instead.
        val r = race("Unreachable", 30)
        val st =
            state(
                currentTurn = 30,
                races = listOf(r),
                aptitudes = TestFixtures.ALL_G_APTITUDES,
            )

        val schedule = Heuristic.search(st)
        val pick = schedule.decisions[30]
        assertNotEquals(Decision.RaceDecision(r.key), pick)
    }

    @Test
    fun trainBeatsLowGradeRaceUnderDefaultWeights() {
        // Pre-OP under default weights (fanWeight = 0.0): gross 22, cost 49 -> ~ -27 net.
        // Train is +1.0, so Train wins.
        val weak = race("Weak Pre-OP", 30, grade = RaceGrade.PRE_OP, fans = 500)
        val st = state(currentTurn = 30, races = listOf(weak), epithets = emptyList())
        val schedule = Heuristic.search(st)
        assertEquals(Decision.Train, schedule.decisions[30])
    }

    @Test
    fun highGradeRaceBeatsTrainUnderDefaultWeights() {
        // G1 under default weights (fanWeight = 0.0): gross 67, cost 49 -> 18 net (no fan term).
        // Train is +1.0, so the race wins.
        val g1 = race("Big G1", 30, grade = RaceGrade.G1, fans = 50000)
        val st = state(currentTurn = 30, races = listOf(g1), epithets = emptyList())
        val schedule = Heuristic.search(st)
        val pick = schedule.decisions[30]
        assertTrue(pick is Decision.RaceDecision && pick.raceKey == g1.key)
    }

    @Test
    fun fansEpithPresetFlipsZeroNetG3FromTrainToRace() {
        // G3 under default weights nets exactly zero gross-cost and loses to Train (+1.0). With the
        // FANS_EPITAPH preset (fanWeight = 1e-3) a 5k-fan G3 contributes +5 from fans, beating Train.
        val g3 = race("G3", 30, grade = RaceGrade.G3, fans = 5000)
        val statMode = state(currentTurn = 30, races = listOf(g3), epithets = emptyList())
        val fanMode =
            state(
                currentTurn = 30,
                races = listOf(g3),
                epithets = emptyList(),
                weights = Weights(fanWeight = 1e-3),
            )

        assertEquals(Decision.Train, Heuristic.search(statMode).decisions[30])
        val pick = Heuristic.search(fanMode).decisions[30]
        assertTrue(pick is Decision.RaceDecision && pick.raceKey == g3.key)
    }

    @Test
    fun searchIsDeterministic() {
        val r1 = race("R1", 50, fans = 8000)
        val r2 = race("R2", 50, fans = 12000)
        val st = state(currentTurn = 50, races = listOf(r1, r2))

        val a = Heuristic.search(st)
        val b = Heuristic.search(st)
        assertEquals(a.decisions, b.decisions)
        assertEquals(a.totalScore, b.totalScore, 1e-9)
    }
}
