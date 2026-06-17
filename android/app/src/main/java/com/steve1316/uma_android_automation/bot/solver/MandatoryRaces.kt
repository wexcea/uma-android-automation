package com.steve1316.uma_android_automation.bot.solver

import com.steve1316.uma_android_automation.types.RaceGrade
import com.steve1316.uma_android_automation.types.TrackDistance
import com.steve1316.uma_android_automation.types.TrackSurface
import org.json.JSONObject

/**
 * One race the player can run to satisfy a mandatory objective on a given turn.
 *
 * @property raceName Human-readable race name, matched against the race pool by name.
 * @property grade Race grade (G1, G2, G3, OP).
 * @property surface Track surface: Turf or Dirt.
 * @property distanceType Distance category: Sprint, Mile, Medium, or Long.
 * @property fans Reward fans for this race.
 */
data class MandatoryRaceOption(
    val raceName: String,
    val grade: RaceGrade,
    val surface: TrackSurface,
    val distanceType: TrackDistance,
    val fans: Int,
)

/**
 * A turn the game forces a mandatory career race on. Most turns have a single option; "choice"
 * turns (e.g. Oaks vs Derby) carry several and the solver picks the best-aptitude one.
 *
 * @property turn 1-indexed turn the mandatory race occurs on.
 * @property isChoice True when the player picks one race among several options.
 * @property options The candidate races for this turn (length 1 for a fixed race).
 */
data class CharacterMandatoryRace(
    val turn: TurnNumber,
    val isChoice: Boolean,
    val options: List<MandatoryRaceOption>,
)

/**
 * Result of applying a character's mandatory races onto the solver inputs.
 *
 * @property racesByTurn The race pool with mandatory candidates injected/flagged.
 * @property lockedDecisions Locked decisions with mandatory turns forced to their race.
 */
data class MandatoryApplication(
    val racesByTurn: Map<TurnNumber, List<RaceCandidate>>,
    val lockedDecisions: Map<TurnNumber, Decision>,
)

/**
 * Pure logic for turning scraped character objectives into locked mandatory race decisions.
 * Mandatory races are modelled as fixed races: locking them as `RaceDecision`s lets the existing
 * MILP / heuristic handle no-double-booking, consecutive-race spacing, and fans/epithet crediting.
 */
object MandatoryRaces {
    /** Scenario that does NOT use the URA objective races (it has its own race structure). */
    const val EXCLUDED_SCENARIO = "Trackblazer"

    /**
     * Parses `character_objectives.json` into a per-character list of mandatory races.
     *
     * @param json The raw JSON string (character name -> { name, mandatoryRaces }).
     * @return Map of character name to its mandatory races. Unknown grade/surface/distance strings
     *   fall back to OP / Turf / Medium respectively.
     */
    fun parse(json: String): Map<String, List<CharacterMandatoryRace>> {
        val root = JSONObject(json)
        val out = HashMap<String, List<CharacterMandatoryRace>>()
        val names = root.keys()
        while (names.hasNext()) {
            val name = names.next()
            val charObj = root.getJSONObject(name)
            val arr = charObj.optJSONArray("mandatoryRaces") ?: continue
            val races = ArrayList<CharacterMandatoryRace>()
            for (i in 0 until arr.length()) {
                val m = arr.getJSONObject(i)
                val turn = m.optInt("turn", -1)
                if (turn <= 0) continue
                val optsArr = m.optJSONArray("options") ?: continue
                val options = ArrayList<MandatoryRaceOption>()
                for (j in 0 until optsArr.length()) {
                    val o = optsArr.getJSONObject(j)
                    options.add(
                        MandatoryRaceOption(
                            raceName = o.optString("raceName", ""),
                            grade = RaceGrade.fromName(o.optString("grade", "OP").replace("-", "_")) ?: RaceGrade.OP,
                            surface = TrackSurface.fromName(o.optString("surface", "TURF")) ?: TrackSurface.TURF,
                            distanceType = TrackDistance.fromName(o.optString("distanceType", "MEDIUM")) ?: TrackDistance.MEDIUM,
                            fans = o.optInt("fans", 0),
                        ),
                    )
                }
                if (options.isNotEmpty()) {
                    races.add(CharacterMandatoryRace(turn = turn, isChoice = m.optBoolean("isChoice", options.size > 1), options = options))
                }
            }
            if (races.isNotEmpty()) out[name] = races
        }
        return out
    }

    /**
     * Picks the option that best fits the run's aptitudes: best worst-of-(surface, distance) first,
     * then best combined, then most fans. The `Aptitude` enum is declared worst-first, so a higher ordinal means a better aptitude; the ordinals are negated so `minWithOrNull` selects the best option.
     *
     * @param options Candidate races for the turn (must be non-empty).
     * @param aptitudes The run's aptitudes.
     * @return The best-fitting option.
     */
    fun selectBestOption(options: List<MandatoryRaceOption>, aptitudes: Aptitudes): MandatoryRaceOption =
        options.minWithOrNull(
            compareBy<MandatoryRaceOption>(
                { -minOf(aptitudes.forSurface(it.surface).ordinal, aptitudes.forDistance(it.distanceType).ordinal) },
                { -(aptitudes.forSurface(it.surface).ordinal + aptitudes.forDistance(it.distanceType).ordinal) },
                { -it.fans },
            ),
        ) ?: options.first()

    /**
     * Applies a character's mandatory races onto the race pool and locked decisions.
     *
     * @param scenario Active scenario. Returns inputs unchanged when it is [EXCLUDED_SCENARIO].
     * @param characterPreset Selected character name, or null. Null returns inputs unchanged.
     * @param aptitudes The run's aptitudes, used to pick choice-turn options.
     * @param racesByTurn The base race pool.
     * @param baseLocks Existing locked decisions (e.g. user manual locks).
     * @param objectives Parsed objectives keyed by character name.
     * @return The augmented pool and locks. Mandatory locks override any base lock on the same turn.
     */
    fun apply(
        scenario: String,
        characterPreset: String?,
        aptitudes: Aptitudes,
        racesByTurn: Map<TurnNumber, List<RaceCandidate>>,
        baseLocks: Map<TurnNumber, Decision>,
        objectives: Map<String, List<CharacterMandatoryRace>>,
    ): MandatoryApplication {
        if (scenario == EXCLUDED_SCENARIO || characterPreset == null) {
            return MandatoryApplication(racesByTurn, baseLocks)
        }
        val charObjectives = objectives[characterPreset] ?: return MandatoryApplication(racesByTurn, baseLocks)
        val races = racesByTurn.toMutableMap()
        val locks = baseLocks.toMutableMap()
        // The objectives data groups by turn, so each character has at most one mandatory race per turn.
        for (m in charObjectives) {
            if (m.options.isEmpty()) continue
            val opt = selectBestOption(m.options, aptitudes)
            val turnRaces = races[m.turn].orEmpty()
            val existing = turnRaces.firstOrNull { it.name == opt.raceName }
            val candidate = existing?.copy(isMandatory = true) ?: syntheticCandidate(m.turn, opt)
            races[m.turn] = turnRaces.filter { it.name != opt.raceName } + candidate
            locks[m.turn] = Decision.RaceDecision(candidate.key)
        }
        return MandatoryApplication(races, locks)
    }

    /**
     * Builds a synthetic [RaceCandidate] for a mandatory race that is not in the race pool
     * (e.g. a race not present in races.json for that turn).
     *
     * @param turn The turn the race occurs on.
     * @param opt The chosen mandatory race option.
     * @return A mandatory-flagged candidate with a unique key.
     */
    private fun syntheticCandidate(turn: TurnNumber, opt: MandatoryRaceOption): RaceCandidate {
        val classYear =
            when {
                turn <= 24 -> "Junior"
                turn <= 48 -> "Classic"
                else -> "Senior"
            }
        return RaceCandidate(
            key = "mandatory-$turn-${opt.raceName}",
            name = opt.raceName,
            nameFormatted = opt.raceName,
            date = "",
            classYear = classYear,
            raceTrack = "",
            grade = opt.grade,
            terrain = opt.surface,
            distanceType = opt.distanceType,
            distanceMeters = 0, // not scraped for objective races
            fans = opt.fans,
            turnNumber = turn,
            isMandatory = true,
        )
    }
}
