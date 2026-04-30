package com.steve1316.uma_android_automation.bot.solver

import com.steve1316.uma_android_automation.types.RaceGrade
import com.steve1316.uma_android_automation.types.TrackDistance
import com.steve1316.uma_android_automation.types.TrackSurface

/**
 * Filter predicate used by [EpithetMatcher.WinCount] to decide whether a race counts toward
 * the matcher's tally. Mirrors the structured shape produced by the GameTora epithet scraper.
 *
 * All non-null / non-empty fields combine with logical AND. Empty / null fields are ignored.
 *
 * @property terrain Required surface (Turf or Dirt); null disables the surface check.
 * @property grade Required race grade (e.g. G1, G2); null disables the grade check.
 * @property gradeAtLeastOpen When true, the race must be at least Open class.
 * @property gradedOnly When true, the race must be a graded race (G1/G2/G3).
 * @property distanceTypes Set of allowed distance types; empty disables the distance check.
 * @property raceTracks Set of allowed race-track names; empty disables the track check.
 * @property nameContains Substring that must appear in the race name; null disables the check.
 * @property nameContainsCountry When true, the race name must contain a country token from
 *   [EpithetFilters.COUNTRY_NAMES].
 */
data class EpithetFilter(
    val terrain: TrackSurface? = null,
    val grade: RaceGrade? = null,
    val gradeAtLeastOpen: Boolean = false,
    val gradedOnly: Boolean = false,
    val distanceTypes: Set<TrackDistance> = emptySet(),
    val raceTracks: Set<String> = emptySet(),
    val nameContains: String? = null,
    val nameContainsCountry: Boolean = false,
)

/**
 * Structured race-condition predicate the solver evaluates against the win history.
 *
 * The flat list of matchers on an [Epithet] is interpreted as a logical AND: an epithet
 * is completed when every matcher is satisfied. `atClass` is the in-game class year prefix
 * — "Junior", "Classic", or "Senior" — for matchers that gate by class (e.g. "Japan Cup (Classic)").
 */
sealed class EpithetMatcher {
    /**
     * Satisfied when the named race has been won.
     * @property name Exact race name to match.
     * @property atClass Optional class-year prefix ("Junior", "Classic", "Senior") gating the win.
     */
    data class WinRace(val name: String, val atClass: String? = null) : EpithetMatcher()

    /**
     * Satisfied when the named race has been won at least [times] separate times.
     * @property name Exact race name to match.
     * @property times Minimum number of distinct wins required.
     */
    data class WinRaceTimes(val name: String, val times: Int) : EpithetMatcher()

    /**
     * Satisfied when at least [count] of the listed races have been won.
     * @property names Candidate race names; any wins among them count toward the tally.
     * @property count Minimum number of distinct races from [names] that must be won.
     * @property atClass Optional class-year prefix gating eligible wins.
     */
    data class WinAnyOf(
        val names: List<String>,
        val count: Int = 1,
        val atClass: String? = null,
    ) : EpithetMatcher()

    /**
     * Satisfied when at least [count] distinct races from [names] have been won (no class gating).
     * @property names Candidate race names.
     * @property count Minimum number of distinct races from [names] that must be won.
     */
    data class WinAtLeast(val names: List<String>, val count: Int) : EpithetMatcher()

    /**
     * Satisfied when at least [count] races matching [filter] have been won.
     * @property count Minimum tally of qualifying wins.
     * @property filter Predicate evaluated against each win to decide if it counts.
     */
    data class WinCount(val count: Int, val filter: EpithetFilter) : EpithetMatcher()

    /**
     * Satisfied when at least one of the listed prerequisite epithets has been completed.
     * @property names Names of candidate prerequisite epithets.
     */
    data class EpithetAnyOf(val names: List<String>) : EpithetMatcher()

    /**
     * Satisfied when every listed prerequisite epithet has been completed.
     * @property names Names of required prerequisite epithets.
     */
    data class EpithetAll(val names: List<String>) : EpithetMatcher()
}

/**
 * Helpers for evaluating [EpithetFilter] fields that need shared state across the MILP solver
 * and the runtime tracker. Currently just [nameContainsCountry], which references a list of
 * country tokens for the "Globe-Trotter" epithet ("Win 3 races whose name contains a country").
 *
 * Keep [COUNTRY_NAMES] in sync with the TS mirror in `src/pages/SmartRaceSolverSettings/index.tsx`.
 */
object EpithetFilters {
    /** Mirrors the reference Trackblazer's `COUNTRY_WORDS` exactly. The trailing space on
     *  `"Japan "` is intentional — without it, every "Japanese …" race (e.g. "Japanese Derby")
     *  would also match, which is wrong. */
    val COUNTRY_NAMES: List<String> =
        listOf(
            "Saudi Arabia",
            "Argentina",
            "American",
            "New Zealand",
            "Japan ",
        )

    /**
     * Returns true if [name] contains any token from [COUNTRY_NAMES].
     * @param name Race name to test.
     * @return True if the name contains a country token, false otherwise.
     */
    fun nameContainsCountry(name: String): Boolean = COUNTRY_NAMES.any { it in name }
}

/**
 * An in-game epithet (nickname) the player can complete for a stat or skill-hint reward.
 *
 * Sourced from `src/data/epithets.json`, which is generated by the EpithetScraper in
 * `src/data/main.py`. The scraper owns the human-facing fields; [dependsOn] and [matchers]
 * are hand-curated locally so re-scrapes never clobber them.
 *
 * @property name Display name of the epithet (also the unique key in epithets.json).
 * @property category Reward category label shown by GameTora (e.g. "+10 to 2 random stats").
 * @property rewardText Free-text reward description from GameTora.
 * @property rewardKind One of "stat", "hint", or "unknown".
 * @property amount Total reward magnitude (per-stat × stat-count, or hint level).
 * @property displayAmount Per-stat amount for stat rewards; same as [amount] for hints.
 * @property conditionText Free-text completion condition shown by GameTora.
 * @property dependsOn Names of prerequisite epithets that must complete first.
 * @property matchers AND-combined predicates evaluated against the win history.
 */
data class Epithet(
    val name: String,
    val category: String,
    val rewardText: String,
    val rewardKind: String,
    val amount: Int,
    val displayAmount: Int,
    val conditionText: String,
    val dependsOn: List<String>,
    val matchers: List<EpithetMatcher>,
)
