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
    fun raceValueScalesWithFans() {
        val small = race("Small", 20, fans = 1000)
        val big = race("Big", 20, fans = 50000)
        assertTrue(ScoringFunctions.raceValue(big, w) > ScoringFunctions.raceValue(small, w))
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
    fun trainValueIsZero() {
        assertEquals(0.0, ScoringFunctions.trainValue(w), 1e-9)
    }

    @Test
    fun restValueIsZero() {
        assertEquals(0.0, ScoringFunctions.restValue(w), 1e-9)
    }

    @Test
    fun lowGradeRaceValueIsNegative() {
        // Pre-OP / OP races should score below zero so Train (value 0) is preferred.
        val preOp = race("PreOp", 20, grade = RaceGrade.PRE_OP, fans = 500)
        val op = race("Op", 20, grade = RaceGrade.OP, fans = 1000)
        assertTrue(ScoringFunctions.raceValue(preOp, w) < 0.0)
        assertTrue(ScoringFunctions.raceValue(op, w) < 0.0)
    }

    @Test
    fun g1RaceValueIsPositive() {
        val g1 = race("G1", 20, grade = RaceGrade.G1, fans = 8000)
        assertTrue(ScoringFunctions.raceValue(g1, w) > 0.0)
    }

    @Test
    fun consecutivePenaltyAppliesAtThirdRace() {
        assertEquals(0.0, ScoringFunctions.consecutiveRacePenalty(2, w), 1e-9)
        assertEquals(w.consecutiveRacePenalty, ScoringFunctions.consecutiveRacePenalty(3, w), 1e-9)
        assertEquals(w.consecutiveRacePenalty, ScoringFunctions.consecutiveRacePenalty(5, w), 1e-9)
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
