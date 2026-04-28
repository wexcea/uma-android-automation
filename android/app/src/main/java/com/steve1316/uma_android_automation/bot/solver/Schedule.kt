package com.steve1316.uma_android_automation.bot.solver

/** A turn number in the 72-turn career schedule. The race-eligible window starts at turn 14. */
typealias TurnNumber = Int

/**
 * A decision the solver commits to for a single turn.
 *
 * [Train] and [Rest] are catch-all categories that the existing Racing.kt training logic
 * resolves into specific stat trains or recovery actions. The solver only commits to
 * "race race X" vs. "do something not-racing" at the turn granularity — the rest of the
 * bot retains control over which stat to train, when to recover, etc.
 */
sealed class Decision {
    data class RaceDecision(val raceKey: String) : Decision()

    object Train : Decision() {
        override fun toString(): String = "Train"
    }

    object Rest : Decision() {
        override fun toString(): String = "Rest"
    }
}

/**
 * The solver's output: a per-turn decision plus bookkeeping on which epithets the schedule
 * is projected to complete and the total objective score.
 *
 * @property decisions The decision committed for each turn the solver planned over.
 * @property projectedEpithets Epithet names the schedule is expected to complete.
 * @property totalScore The objective value of this schedule under the active [Weights].
 */
data class Schedule(
    val decisions: Map<TurnNumber, Decision>,
    val projectedEpithets: Set<String>,
    val totalScore: Double,
) {
    /** Returns the decision for [turn], or [Decision.Train] if the solver did not plan it. */
    fun decisionAt(turn: TurnNumber): Decision = decisions[turn] ?: Decision.Train

    /** Race decisions in turn order, as `(turn, raceKey)` pairs. */
    fun raceTurns(): List<Pair<TurnNumber, String>> =
        decisions.entries
            .mapNotNull { (turn, d) -> (d as? Decision.RaceDecision)?.let { turn to it.raceKey } }
            .sortedBy { it.first }
}
