package com.steve1316.uma_android_automation.bot.solver

import com.steve1316.uma_android_automation.types.RaceGrade

/** Classification of an epithet's reachability given the current solver state. */
enum class EpithetStatus { COMPLETED, IN_PROGRESS, DEAD, UNTOUCHED }

/**
 * Pure functions that interpret epithet matchers against a [SolverState].
 *
 * The tracker is the heart of the recovery logic: when a race is lost, the solver re-classifies
 * epithets, marks the newly-unreachable ones as [EpithetStatus.DEAD], and the heuristic re-plans
 * around them. All functions here are deterministic — same state in, same status out.
 */
object EpithetTracker {

    /** Reduces a [SolverState] to a per-epithet status map keyed by epithet name. */
    fun classifyAll(state: SolverState): Map<String, EpithetStatus> =
        state.epithets.associate { it.name to classify(it, state) }

    /** Classifies a single [epithet] against the given [state]. */
    fun classify(epithet: Epithet, state: SolverState): EpithetStatus {
        if (epithet.name in state.deadEpithets) return EpithetStatus.DEAD
        if (epithet.name in state.completedEpithets || isCompleted(epithet, state)) {
            return EpithetStatus.COMPLETED
        }
        return if (hasAnyProgress(epithet, state)) EpithetStatus.IN_PROGRESS else EpithetStatus.UNTOUCHED
    }

    /** True if every matcher on [epithet] is fully satisfied by [state]'s history. */
    fun isCompleted(epithet: Epithet, state: SolverState): Boolean =
        epithet.matchers.isNotEmpty() && epithet.matchers.all { isMatcherSatisfied(it, state) }

    /** True if any matcher has at least partial progress. */
    private fun hasAnyProgress(epithet: Epithet, state: SolverState): Boolean =
        epithet.matchers.any { progress(it, state) > 0.0 }

    /** Whole-matcher satisfaction check. */
    fun isMatcherSatisfied(matcher: EpithetMatcher, state: SolverState): Boolean {
        return when (matcher) {
            is EpithetMatcher.WinRace ->
                state.raceHistory.any { win ->
                    win.name == matcher.name &&
                        (matcher.atClass == null || win.classYear.equals(matcher.atClass, ignoreCase = true))
                }
            is EpithetMatcher.WinRaceTimes ->
                state.raceHistory.count { it.name == matcher.name } >= matcher.times
            is EpithetMatcher.WinAnyOf -> {
                val pool = matcher.names.toSet()
                state.raceHistory.count { win ->
                    win.name in pool &&
                        (matcher.atClass == null || win.classYear.equals(matcher.atClass, ignoreCase = true))
                } >= matcher.count
            }
            is EpithetMatcher.WinAtLeast -> {
                val pool = matcher.names.toSet()
                state.raceHistory.map { it.name }.toSet().intersect(pool).size >= matcher.count
            }
            is EpithetMatcher.WinCount ->
                state.raceHistory.count { matchesFilter(it, matcher.filter, state) } >= matcher.count
            is EpithetMatcher.EpithetAnyOf ->
                matcher.names.any { it in state.completedEpithets }
            is EpithetMatcher.EpithetAll ->
                matcher.names.all { it in state.completedEpithets }
        }
    }

    /** Continuous 0..1 progress for a matcher; used by the heuristic to break ties. */
    fun progress(matcher: EpithetMatcher, state: SolverState): Double {
        return when (matcher) {
            is EpithetMatcher.WinRace -> if (isMatcherSatisfied(matcher, state)) 1.0 else 0.0
            is EpithetMatcher.WinRaceTimes -> {
                val have = state.raceHistory.count { it.name == matcher.name }
                (have.toDouble() / matcher.times).coerceAtMost(1.0)
            }
            is EpithetMatcher.WinAnyOf -> {
                val have = state.raceHistory.count { win ->
                    win.name in matcher.names &&
                        (matcher.atClass == null || win.classYear.equals(matcher.atClass, ignoreCase = true))
                }
                (have.toDouble() / matcher.count).coerceAtMost(1.0)
            }
            is EpithetMatcher.WinAtLeast -> {
                val have = state.raceHistory.map { it.name }.toSet().intersect(matcher.names.toSet()).size
                (have.toDouble() / matcher.count).coerceAtMost(1.0)
            }
            is EpithetMatcher.WinCount -> {
                val have = state.raceHistory.count { matchesFilter(it, matcher.filter, state) }
                (have.toDouble() / matcher.count).coerceAtMost(1.0)
            }
            is EpithetMatcher.EpithetAnyOf ->
                if (matcher.names.any { it in state.completedEpithets }) 1.0 else 0.0
            is EpithetMatcher.EpithetAll ->
                if (matcher.names.isEmpty()) 1.0
                else matcher.names.count { it in state.completedEpithets }.toDouble() / matcher.names.size
        }
    }

    /** Race-against-filter check used by [EpithetMatcher.WinCount]. */
    private fun matchesFilter(win: RaceWin, filter: EpithetFilter, state: SolverState): Boolean {
        // RaceWin only carries identity; filter checks need full RaceCandidate fields. Look up
        // the candidate pool for the win's turn and find the matching key (or fall back to name).
        val candidate = state.racesByTurn[win.turnNumber]
            ?.firstOrNull { it.key == win.raceKey || it.name == win.name }
            ?: return false

        if (filter.terrain != null && candidate.terrain != filter.terrain) return false
        if (filter.grade != null && candidate.grade != filter.grade) return false
        if (filter.gradeAtLeastOpen && candidate.grade.ordinal < RaceGrade.OP.ordinal) return false
        if (filter.gradedOnly && candidate.grade !in GRADED_RACES) return false
        if (filter.distanceTypes.isNotEmpty() && candidate.distanceType !in filter.distanceTypes) return false
        if (filter.raceTracks.isNotEmpty() && candidate.raceTrack !in filter.raceTracks) return false
        if (filter.nameContains != null && !candidate.name.contains(filter.nameContains, ignoreCase = true)) return false
        if (filter.nameContainsCountry && !nameContainsCountry(candidate.name)) return false
        return true
    }

    private val GRADED_RACES = setOf(RaceGrade.G1, RaceGrade.G2, RaceGrade.G3)

    // Country tokens used by the "Globe-Trotter" epithet's `nameContainsCountry` filter.
    // Kept minimal — extend as new races are added that should count.
    private val COUNTRY_NAMES = listOf(
        "America", "American", "Argentina", "Australia", "Brazil", "Canada", "China",
        "Dubai", "England", "English", "France", "French", "Germany", "Hong Kong",
        "India", "Ireland", "Italy", "Japan", "Japanese", "Korea", "Mexico", "Russia",
        "Singapore", "Spain", "USA", "UAE",
    )

    private fun nameContainsCountry(name: String): Boolean =
        COUNTRY_NAMES.any { it in name }
}
