package com.steve1316.uma_android_automation.bot.solver

import com.steve1316.uma_android_automation.types.Aptitude
import com.steve1316.uma_android_automation.types.RaceGrade

/**
 * Pure scoring helpers consumed by the heuristic. Each function takes the minimum required
 * inputs and returns an additive contribution to the beam's objective; the heuristic sums them.
 *
 * Race value is grade-and-fans-driven; epithet contribution is reward-magnitude-driven; penalties
 * (summer block, 3-consecutive-race conditioning) subtract. Aptitude eligibility is a hard filter
 * applied upstream — see [isEligible].
 */
object ScoringFunctions {

    /**
     * Approximate stat value gained from winning a race of the given [grade]. Used as a stand-in
     * for the reference solver's per-race `statValue` field, which is not present in races.json.
     */
    private fun gradeStatValue(grade: RaceGrade): Double = when (grade) {
        RaceGrade.G1 -> 15.0
        RaceGrade.G2 -> 12.0
        RaceGrade.G3 -> 10.0
        RaceGrade.OP -> 7.0
        RaceGrade.PRE_OP -> 5.0
        RaceGrade.MAIDEN -> 3.0
        RaceGrade.DEBUT -> 2.0
        RaceGrade.FINALE -> 20.0
        RaceGrade.EX -> 12.0
    }

    /** Approximate skill points gained from a race of the given [grade]. */
    private fun gradeSkillPoints(grade: RaceGrade): Double = when (grade) {
        RaceGrade.G1 -> 45.0
        RaceGrade.G2 -> 35.0
        RaceGrade.G3 -> 30.0
        RaceGrade.OP -> 20.0
        RaceGrade.PRE_OP -> 15.0
        RaceGrade.MAIDEN -> 8.0
        RaceGrade.DEBUT -> 5.0
        RaceGrade.FINALE -> 60.0
        RaceGrade.EX -> 35.0
    }

    /**
     * Returns the value of running a single race, ignoring epithet contributions.
     *
     * Mirrors the reference Trackblazer solver: gross reward (stats * statWeight + sp * spWeight)
     * minus a flat [RACE_COST] that pushes low-grade races negative, with fans included only as a
     * small tiebreaker so two equally-graded options pick the bigger event. Training is
     * implicitly 0, so any race must clear [RACE_COST] to be chosen over a Train turn.
     */
    fun raceValue(race: RaceCandidate, weights: Weights): Double {
        val stat = gradeStatValue(race.grade) * weights.statWeight
        val sp = gradeSkillPoints(race.grade) * weights.spWeight
        val fansTiebreaker = race.fans / 1000.0
        return (stat + sp + fansTiebreaker - RACE_COST) * weights.raceValue
    }

    /**
     * Training is the default action — value 0. The decision between Race and Train is driven by
     * [raceValue] going positive (race) or negative (train), matching the reference solver's
     * `NO_RACE = 0` baseline.
     */
    fun trainValue(@Suppress("UNUSED_PARAMETER") weights: Weights): Double = 0.0

    /** Resting yields no scoring contribution; energy is not modelled in the static preview. */
    fun restValue(@Suppress("UNUSED_PARAMETER") weights: Weights): Double = 0.0

    /**
     * Flat per-race penalty subtracted from gross race reward. Calibrated so Pre-OP / OP / Maiden
     * / Debut races score negative under default weights (and thus Train wins), while G2 / G1 /
     * Finale clear the bar. G3 lands close to zero — raced when fans or epithets push it past
     * [RACE_COST].
     */
    private const val RACE_COST: Double = 40.0

    /**
     * Reward magnitude of completing [epithet]. Stat rewards return [Epithet.amount]; hint
     * rewards return [Weights.hintWeight]; unknown rewards return zero.
     */
    fun epithetContribution(epithet: Epithet, weights: Weights): Double {
        val base = when (epithet.rewardKind) {
            "stat" -> epithet.amount.toDouble()
            "hint" -> weights.hintWeight
            else -> 0.0
        }
        return base * weights.epithetValue
    }

    /**
     * Penalty applied when scheduling a third (or later) consecutive race. The reference
     * solver penalises the *start* of a 3-race chain; we apply it on every additional race
     * past the second to keep beams deterministic and incremental.
     */
    fun consecutiveRacePenalty(
        consecutiveRaceCount: Int,
        weights: Weights,
    ): Double = if (consecutiveRaceCount >= 3) weights.consecutiveRacePenalty else 0.0

    /** Penalty for racing on a turn flagged as a summer training block. */
    fun summerBlockPenalty(turn: TurnNumber, state: SolverState): Double =
        if (turn in state.summerBlockTurns) state.weights.summerPenalty else 0.0

    /**
     * Hard eligibility check: a race is eligible only if both the matching distance aptitude
     * and surface aptitude meet [Weights.aptitudeThreshold]. Below threshold, the race is
     * dropped from the candidate set entirely.
     */
    fun isEligible(race: RaceCandidate, state: SolverState): Boolean {
        val distApt = state.aptitudes.forDistance(race.distanceType)
        val surfApt = state.aptitudes.forSurface(race.terrain)
        val threshold = state.weights.aptitudeThreshold
        return distApt.atLeast(threshold) && surfApt.atLeast(threshold)
    }

    /** True if [this] aptitude is at least as good as [other]. Higher ordinal = better grade. */
    private fun Aptitude.atLeast(other: Aptitude): Boolean = this.ordinal >= other.ordinal
}
