package com.steve1316.uma_android_automation.bot.solver

import com.steve1316.uma_android_automation.types.Aptitude
import com.steve1316.uma_android_automation.types.RaceGrade
import com.steve1316.uma_android_automation.types.TrackDistance
import com.steve1316.uma_android_automation.types.TrackSurface

/**
 * Six aptitude rankings (S..G) covering the four distance categories and two surfaces.
 *
 * Higher [Aptitude] ordinal = better in-game grade; the existing enum is ordered G,F,E,D,C,B,A,S
 * so `aptitude.ordinal >= other.ordinal` reads as "at least as good as [other]".
 */
data class Aptitudes(
    val sprint: Aptitude,
    val mile: Aptitude,
    val medium: Aptitude,
    val long: Aptitude,
    val turf: Aptitude,
    val dirt: Aptitude,
) {
    fun forDistance(d: TrackDistance): Aptitude = when (d) {
        TrackDistance.SPRINT -> sprint
        TrackDistance.MILE -> mile
        TrackDistance.MEDIUM -> medium
        TrackDistance.LONG -> long
    }

    fun forSurface(s: TrackSurface): Aptitude = when (s) {
        TrackSurface.TURF -> turf
        TrackSurface.DIRT -> dirt
    }

    companion object {
        /** All-A baseline used by tests and as a safe default when no preset is selected. */
        val DEFAULT_A: Aptitudes = Aptitudes(
            Aptitude.A, Aptitude.A, Aptitude.A, Aptitude.A, Aptitude.A, Aptitude.A,
        )
    }
}

/** Tunable scoring weights consumed by the heuristic. Defaults mirror the reference solver. */
data class Weights(
    val raceValue: Double = 1.0,
    val epithetValue: Double = 1.0,
    val statWeight: Double = 1.0,
    val spWeight: Double = 1.0,
    val hintWeight: Double = 8.0,
    val consecutiveRacePenalty: Double = 3.0,
    val summerPenalty: Double = 5.0,
    val aptitudeThreshold: Aptitude = Aptitude.C,
)

/**
 * A race in the candidate pool the solver chooses among. Sourced from races.json.
 *
 * @property key Unique key matching the top-level key in races.json (`"<name> (<date>)"`).
 * @property classYear Class-year prefix extracted from [date] — "Junior", "Classic", or "Senior".
 *   Used by matchers that gate on class (e.g. "Japan Cup (Classic)").
 */
data class RaceCandidate(
    val key: String,
    val name: String,
    val date: String,
    val classYear: String,
    val raceTrack: String,
    val grade: RaceGrade,
    val terrain: TrackSurface,
    val distanceType: TrackDistance,
    val distanceMeters: Int,
    val fans: Int,
    val turnNumber: TurnNumber,
)

/** A historical race win used by [EpithetTracker] to evaluate matcher progress. */
data class RaceWin(
    val raceKey: String,
    val name: String,
    val classYear: String,
    val turnNumber: TurnNumber,
)

/**
 * Immutable snapshot of everything the solver needs to compute a [Schedule].
 *
 * Re-solves are triggered by constructing a new [SolverState] (e.g. with a freshly-dead
 * epithet added to [deadEpithets] after a race loss). The solver itself is pure — given the
 * same state, it produces the same schedule.
 *
 * @property currentTurn Turn the bot is currently on; the solver plans from this turn forward.
 * @property scenario "URA Finale", "Unity Cup", or "Trackblazer" — read from settings.general.scenario.
 * @property racesByTurn Pre-grouped candidate pool: turn → races available on that turn.
 * @property summerBlockTurns No-race turns; defaults to [DEFAULT_SUMMER_BLOCKS].
 */
data class SolverState(
    val currentTurn: TurnNumber,
    val scenario: String,
    val characterPreset: String?,
    val aptitudes: Aptitudes,
    val racesByTurn: Map<TurnNumber, List<RaceCandidate>>,
    val epithets: List<Epithet>,
    val raceHistory: List<RaceWin> = emptyList(),
    val completedEpithets: Set<String> = emptySet(),
    val deadEpithets: Set<String> = emptySet(),
    val forcedEpithets: Set<String> = emptySet(),
    val targetEpithets: Set<String> = emptySet(),
    val lockedDecisions: Map<TurnNumber, Decision> = emptyMap(),
    val summerBlockTurns: Set<TurnNumber> = DEFAULT_SUMMER_BLOCKS,
    val weights: Weights = Weights(),
) {
    val epithetsByName: Map<String, Epithet> by lazy { epithets.associateBy { it.name } }

    companion object {
        /**
         * Default summer training blocks (no-race turns). Junior: Early Jul → Early Aug;
         * Classic & Senior: Early Jul → Late Aug. Mirrors the reference solver's constant.
         */
        val DEFAULT_SUMMER_BLOCKS: Set<TurnNumber> = setOf(
            12, 13, 14,
            36, 37, 38, 39,
            60, 61, 62, 63,
        )
    }
}
