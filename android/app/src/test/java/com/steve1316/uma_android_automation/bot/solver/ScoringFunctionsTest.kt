package com.steve1316.uma_android_automation.bot.solver

import com.steve1316.uma_android_automation.bot.solver.TestFixtures.ALL_G_APTITUDES
import com.steve1316.uma_android_automation.bot.solver.TestFixtures.epithet
import com.steve1316.uma_android_automation.bot.solver.TestFixtures.race
import com.steve1316.uma_android_automation.bot.solver.TestFixtures.state
import com.steve1316.uma_android_automation.types.RaceGrade
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test

@DisplayName("ScoringFunctions")
class ScoringFunctionsTest {
    private val w = Weights()

    @Test
    fun raceValueIsHigherForHigherGrade() {
        val g1 = race("X", 20, grade = RaceGrade.G1)
        val g3 = race("Y", 20, grade = RaceGrade.G3)
        assertTrue(ScoringFunctions.raceValue(g1, w) > ScoringFunctions.raceValue(g3, w))
    }

    @Test
    fun raceValueWithFanWeightZeroIgnoresFans() {
        // Default fanWeight is 0.0 (Stat Epitaphs preset): two races of identical grade with
        // very different fan counts must produce equal raceValue.
        val small = race("Small", 20, fans = 1000)
        val big = race("Big", 20, fans = 50000)
        assertEquals(ScoringFunctions.raceValue(small, w), ScoringFunctions.raceValue(big, w), 1e-9)
    }

    @Test
    fun raceValueScalesWithFansWhenFanWeightIsPositive() {
        // With any positive fanWeight, a fan-rich race outscores a fan-poor race of the same grade.
        val tunedWeights = Weights(fanWeight = 1e-6)
        val small = race("Small", 20, fans = 1000)
        val big = race("Big", 20, fans = 50000)
        assertTrue(ScoringFunctions.raceValue(big, tunedWeights) > ScoringFunctions.raceValue(small, tunedWeights))
    }

    @Test
    fun fansEpithPresetMakesG1MeaningfullyOutscoreG3() {
        // FANS_EPITAPH preset (fanWeight = 1e-3): a 25k-fan G1 should outscore a 5k-fan G3 by a
        // margin that survives Train's 1.0 anti-race bias even when their gross-cost happens to tie.
        val tunedWeights = Weights(fanWeight = 1e-3)
        val g1 = race("G1", 30, grade = RaceGrade.G1, fans = 25000)
        val g3 = race("G3", 30, grade = RaceGrade.G3, fans = 5000)
        val delta = ScoringFunctions.raceValue(g1, tunedWeights) - ScoringFunctions.raceValue(g3, tunedWeights)
        assertTrue(delta > 1.0, "G1-G3 score delta under fanWeight=1e-3 should exceed Train's 1.0 floor; was $delta")
    }

    @Test
    fun fansEpithPresetKeepsZeroRewardGradesBelowTrain() {
        // Grades outside the BASE_REWARD table (Maiden, Debut, Finale, EX) have zero gross reward
        // but are charged the G2 cost baseline (~49 score points). Even with the FANS_EPITAPH
        // preset's fanWeight = 1e-3 and a fan-rich Maiden, raceValue stays well below Train.
        val tunedWeights = Weights(fanWeight = 1e-3)
        val maiden = race("Maiden", 30, grade = RaceGrade.MAIDEN, fans = 5000)
        assertTrue(ScoringFunctions.raceValue(maiden, tunedWeights) < ScoringFunctions.trainValue(tunedWeights))
    }

    @Test
    fun statRewardEpithetContributionEqualsAmount() {
        val ep = epithet("Stat", emptyList(), rewardKind = "stat", amount = 30, displayAmount = 15)
        assertEquals(30.0, ScoringFunctions.epithetContribution(ep, w), 1e-9)
    }

    @Test
    fun hintRewardEpithetContributionUsesHintWeight() {
        val ep = epithet("Hint", emptyList(), rewardKind = "hint", amount = 1, displayAmount = 1)
        assertEquals(w.hintWeight, ScoringFunctions.epithetContribution(ep, w), 1e-9)
    }

    @Test
    fun unknownRewardKindContributesZero() {
        val ep = epithet("Mystery", emptyList(), rewardKind = "unknown", amount = 99)
        assertEquals(0.0, ScoringFunctions.epithetContribution(ep, w), 1e-9)
    }

    @Test
    fun trainValueIsAntiRaceBias() {
        // Train carries a +1.0 anti-race bias so that races whose gross reward exactly equals
        // their cost (G2/G3 under defaults) lose ties to Train.
        assertEquals(1.0, ScoringFunctions.trainValue(w), 1e-9)
    }

    @Test
    fun restValueIsZero() {
        assertEquals(0.0, ScoringFunctions.restValue(w), 1e-9)
    }

    @Test
    fun lowGradeRaceValueLosesToTrain() {
        // OP/Pre-OP cost baselines equal their own gross reward, so net is exactly zero under
        // default weights and `fanWeight = 0.0`. Train (+1.0) wins the tie.
        val preOp = race("PreOp", 20, grade = RaceGrade.PRE_OP, fans = 500)
        val op = race("Op", 20, grade = RaceGrade.OP, fans = 1000)
        val trainValue = ScoringFunctions.trainValue(w)
        assertTrue(ScoringFunctions.raceValue(preOp, w) < trainValue)
        assertTrue(ScoringFunctions.raceValue(op, w) < trainValue)
    }

    @Test
    fun g1RaceValueIsPositive() {
        val g1 = race("G1", 20, grade = RaceGrade.G1, fans = 8000)
        assertTrue(ScoringFunctions.raceValue(g1, w) > 0.0)
    }

    @Test
    fun consecutivePenaltyAppliesAtThirdRace() {
        // Use a non-Late-Dec turn (turn 30) so the exemption doesn't kick in.
        assertEquals(0.0, ScoringFunctions.consecutiveRacePenalty(2, 30, w), 1e-9)
        assertEquals(w.consecutiveRacePenalty, ScoringFunctions.consecutiveRacePenalty(3, 30, w), 1e-9)
        assertEquals(w.consecutiveRacePenalty, ScoringFunctions.consecutiveRacePenalty(5, 30, w), 1e-9)
    }

    @Test
    fun consecutivePenaltyIsWaivedOnLateDecTurns() {
        // Late-Dec turns (23, 47, 71) end the year and don't carry conditioning penalty.
        assertEquals(0.0, ScoringFunctions.consecutiveRacePenalty(3, 23, w), 1e-9)
        assertEquals(0.0, ScoringFunctions.consecutiveRacePenalty(5, 47, w), 1e-9)
        assertEquals(0.0, ScoringFunctions.consecutiveRacePenalty(4, 71, w), 1e-9)
    }

    @Test
    fun summerBlockPenaltyAppliesOnlyInSummerTurns() {
        val st = state()
        // Default summer blocks include 12, 13, 14 (Junior summer).
        assertEquals(w.summerPenalty, ScoringFunctions.summerBlockPenalty(13, st), 1e-9)
        assertEquals(0.0, ScoringFunctions.summerBlockPenalty(20, st), 1e-9)
    }

    @Test
    fun aboveThresholdAptitudeIsEligible() {
        val r = race("X", 20)
        val st = state()
        assertTrue(ScoringFunctions.isEligible(r, st))
    }

    @Test
    fun belowThresholdAptitudeIsIneligible() {
        val r = race("X", 20)
        val st = state(aptitudes = ALL_G_APTITUDES)
        assertFalse(ScoringFunctions.isEligible(r, st))
    }
}
