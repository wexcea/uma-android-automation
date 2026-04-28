package com.steve1316.uma_android_automation.bot.solver

import com.steve1316.automation_library.utils.MessageLog
import com.steve1316.automation_library.utils.SettingsHelper
import com.steve1316.uma_android_automation.bot.Racing.RaceData
import com.steve1316.uma_android_automation.types.Aptitude
import com.steve1316.uma_android_automation.types.RaceGrade
import com.steve1316.uma_android_automation.types.TrackDistance
import com.steve1316.uma_android_automation.types.TrackSurface
import org.json.JSONArray
import org.json.JSONObject

/**
 * Integration layer between Racing.kt and the pure [SmartRaceSolver].
 *
 * Owns:
 *  - Lazy parsing of epithets / character-preset JSON pushed in by the React Native side via
 *    [SettingsHelper] string settings.
 *  - In-memory race-win history accumulated during a single bot run.
 *  - Translating the solver's [Decision] into a concrete on-screen [RaceData] pick.
 *
 * Stateless from the bot's perspective except for [raceHistory] and the cached parsed data;
 * [reset] clears that state on a new run.
 */
object SmartRaceSolverIntegration {

    private const val TAG: String = "[SMART_RACE_SOLVER]"

    private val raceHistory: MutableList<RaceWin> = mutableListOf()

    @Volatile private var cachedEpithets: List<Epithet>? = null

    @Volatile private var cachedPresets: Map<String, Aptitudes>? = null

    @Volatile private var cachedRaces: Map<TurnNumber, List<RaceCandidate>>? = null

    /** Clears in-memory race history. Call at the start of a fresh bot run. */
    fun reset() {
        synchronized(raceHistory) { raceHistory.clear() }
    }

    /** Records a winning race. Idempotent for the same `(raceKey, turn)` pair. */
    fun recordRaceWon(raceKey: String, raceName: String, classYear: String, turnNumber: TurnNumber) {
        synchronized(raceHistory) {
            if (raceHistory.none { it.raceKey == raceKey && it.turnNumber == turnNumber }) {
                raceHistory.add(RaceWin(raceKey, raceName, classYear, turnNumber))
            }
        }
    }

    /**
     * Picks the on-screen race the solver's schedule prefers for [currentTurn], or returns
     * null when the solver cannot or should not influence the decision (feature disabled,
     * data missing, no schedule match).
     *
     * @param currentTurn The bot's current turn number.
     * @param scenario Active scenario name from `settings.general.scenario`.
     * @param candidates The on-screen [RaceData] list already matched by [Racing.lookupRaceInDatabase].
     */
    fun pickRace(currentTurn: TurnNumber, scenario: String, candidates: List<RaceData>): RaceData? {
        if (!SettingsHelper.getBooleanSetting("racing", "enableSmartRaceSolver")) return null
        if (candidates.isEmpty()) return null

        val epithets = loadEpithets() ?: return null.also {
            MessageLog.w(TAG, "Solver enabled but epithets.json data is empty; skipping.")
        }
        val state = buildSolverState(currentTurn, scenario, epithets, candidates) ?: return null

        val schedule = SmartRaceSolver.solve(state)
        val decision = schedule.decisionAt(currentTurn)
        if (decision !is Decision.RaceDecision) {
            MessageLog.i(TAG, "Solver recommends a non-race decision for turn $currentTurn ($decision); skipping.")
            return null
        }
        // Map the solver's chosen race key back to one of the on-screen candidates.
        val pick = candidates.firstOrNull { rd -> rd.name == decision.raceKey || rd.name == raceNameFromKey(decision.raceKey) }
        if (pick == null) {
            MessageLog.i(TAG, "Solver chose ${decision.raceKey} but it is not on screen; falling through.")
        } else {
            MessageLog.i(TAG, "Solver picked ${pick.name} for turn $currentTurn (projected epithets: ${schedule.projectedEpithets}).")
        }
        return pick
    }

    /**
     * Computes a preview schedule from the user-supplied [configJson], without consulting any
     * runtime race history. Used by the settings UI to render a calendar preview of what the
     * solver would do if a fresh run started today with the current configuration.
     *
     * @param configJson Snapshot of the user's solver config: scenario, characterPreset, aptitudes,
     *   targetEpithets, forcedEpithets, manualLocks, weights.
     * @return JSON string of `{decisions, projectedEpithets, totalScore}`. Each decision entry is
     *   either `{type:"Train"}`, `{type:"Rest"}`, or `{type:"Race", raceKey, name, grade}`.
     */
    fun previewSchedule(configJson: String): String {
        val epithets = loadEpithets() ?: emptyList()
        val racesByTurn = loadAllRaces()
        if (racesByTurn == null) {
            return JSONObject()
                .put("decisions", JSONObject())
                .put("projectedEpithets", JSONArray())
                .put("totalScore", 0.0)
                .put("error", "races data unavailable")
                .toString()
        }

        val config = runCatching { JSONObject(configJson) }.getOrElse { JSONObject() }
        val state = SolverState(
            currentTurn = 1,
            scenario = config.optString("scenario", "Trackblazer"),
            characterPreset = config.optStringOrNull("characterPreset"),
            aptitudes = parseAptitudesObj(config.optJSONObject("aptitudes")),
            racesByTurn = racesByTurn,
            epithets = epithets,
            forcedEpithets = jsonStringList(config.optJSONArray("forcedEpithets")).toSet(),
            targetEpithets = jsonStringList(config.optJSONArray("targetEpithets")).toSet(),
            lockedDecisions = parseManualLocks(config.optJSONObject("manualLocks"), racesByTurn),
            weights = parseWeightsObj(config.optJSONObject("weights")),
        )

        val schedule = SmartRaceSolver.solve(state)
        return serializeSchedule(schedule, racesByTurn)
    }

    /**
     * Builds the solver state for [currentTurn]. Only the on-screen [candidates] populate the
     * candidate pool — the solver still receives the full epithet list so it can score
     * schedule-completing picks correctly relative to alternatives.
     */
    private fun buildSolverState(
        currentTurn: TurnNumber,
        scenario: String,
        epithets: List<Epithet>,
        candidates: List<RaceData>,
    ): SolverState? {
        val racesForTurn = candidates.map { it.toRaceCandidate(currentTurn) }
        return SolverState(
            currentTurn = currentTurn,
            scenario = scenario,
            characterPreset = SettingsHelper.getStringSetting("racing", "smartRaceSolverCharacterPreset").ifEmpty { null },
            aptitudes = readUserAptitudes(),
            racesByTurn = mapOf(currentTurn to racesForTurn),
            epithets = epithets,
            raceHistory = synchronized(raceHistory) { raceHistory.toList() },
            forcedEpithets = readStringSet("smartRaceSolverForcedEpithets"),
            targetEpithets = readStringSet("smartRaceSolverTargetEpithets"),
            weights = readWeights(),
        )
    }

    private fun readUserAptitudes(): Aptitudes {
        val json = SettingsHelper.getStringSetting("racing", "smartRaceSolverAptitudes")
        if (json.isEmpty()) return Aptitudes.DEFAULT_A
        return runCatching { parseAptitudesObj(JSONObject(json)) }.getOrElse { Aptitudes.DEFAULT_A }
    }

    private fun parseAptitudesObj(obj: JSONObject?): Aptitudes {
        if (obj == null) return Aptitudes.DEFAULT_A
        return Aptitudes(
            sprint = parseAptitude(obj.optString("Sprint", "A")),
            mile = parseAptitude(obj.optString("Mile", "A")),
            medium = parseAptitude(obj.optString("Medium", "A")),
            long = parseAptitude(obj.optString("Long", "A")),
            turf = parseAptitude(obj.optString("Turf", "A")),
            dirt = parseAptitude(obj.optString("Dirt", "A")),
        )
    }

    private fun readStringSet(key: String): Set<String> {
        val json = SettingsHelper.getStringSetting("racing", key)
        if (json.isEmpty()) return emptySet()
        return runCatching {
            val arr = JSONArray(json)
            (0 until arr.length()).mapTo(mutableSetOf()) { arr.getString(it) }
        }.getOrElse { emptySet() }
    }

    private fun readWeights(): Weights {
        val json = SettingsHelper.getStringSetting("racing", "smartRaceSolverWeights")
        if (json.isEmpty()) return Weights()
        return runCatching { parseWeightsObj(JSONObject(json)) }.getOrElse { Weights() }
    }

    private fun parseWeightsObj(obj: JSONObject?): Weights {
        if (obj == null) return Weights()
        return Weights(
            raceValue = obj.optDouble("raceValue", 1.0),
            epithetValue = obj.optDouble("epithetValue", 1.0),
            statWeight = obj.optDouble("statWeight", 1.0),
            spWeight = obj.optDouble("spWeight", 1.0),
            hintWeight = obj.optDouble("hintWeight", 8.0),
            consecutiveRacePenalty = obj.optDouble("consecutiveRacePenalty", 3.0),
            summerPenalty = obj.optDouble("summerPenalty", 5.0),
            aptitudeThreshold = parseAptitude(obj.optString("aptitudeThreshold", "C")),
        )
    }

    private fun parseAptitude(s: String): Aptitude =
        Aptitude.fromName(s) ?: Aptitude.A

    /** Lazy, cached parse of `epithetsData`. Returns null when unavailable. */
    private fun loadEpithets(): List<Epithet>? {
        cachedEpithets?.let { return it }
        val json = SettingsHelper.getStringSetting("racing", "epithetsData")
        if (json.isEmpty()) return null
        return runCatching { parseEpithets(json) }
            .onFailure { MessageLog.e(TAG, "Failed to parse epithetsData: ${it.message}") }
            .getOrNull()
            ?.also { cachedEpithets = it }
    }

    /** Lazy, cached parse of `racesData` into a turn-keyed candidate pool. Returns null on failure. */
    private fun loadAllRaces(): Map<TurnNumber, List<RaceCandidate>>? {
        cachedRaces?.let { return it }
        val json = SettingsHelper.getStringSetting("racing", "racesData")
        if (json.isEmpty()) return null
        return runCatching { parseRacesData(json) }
            .onFailure { MessageLog.e(TAG, "Failed to parse racesData: ${it.message}") }
            .getOrNull()
            ?.also { cachedRaces = it }
    }

    @Suppress("unused") // exposed for the settings UI; loader is here so tests can hit it.
    fun loadCharacterPresets(): Map<String, Aptitudes>? {
        cachedPresets?.let { return it }
        val json = SettingsHelper.getStringSetting("racing", "characterPresetsData")
        if (json.isEmpty()) return null
        return runCatching { parsePresets(json) }
            .onFailure { MessageLog.e(TAG, "Failed to parse characterPresetsData: ${it.message}") }
            .getOrNull()
            ?.also { cachedPresets = it }
    }

    // -------- JSON parsers --------

    private fun parseEpithets(json: String): List<Epithet> {
        val obj = JSONObject(json)
        val out = ArrayList<Epithet>(obj.length())
        val keys = obj.keys()
        while (keys.hasNext()) {
            val name = keys.next()
            val e = obj.getJSONObject(name)
            out.add(
                Epithet(
                    name = e.optString("name", name),
                    category = e.optString("category", ""),
                    rewardText = e.optString("reward_text", ""),
                    rewardKind = e.optString("reward_kind", "unknown"),
                    amount = e.optInt("amount", 0),
                    displayAmount = e.optInt("display_amount", e.optInt("amount", 0)),
                    conditionText = e.optString("condition_text", ""),
                    dependsOn = jsonStringList(e.optJSONArray("dependsOn")),
                    matchers = parseMatchers(e.optJSONArray("matchers")),
                ),
            )
        }
        return out
    }

    private fun parseMatchers(arr: JSONArray?): List<EpithetMatcher> {
        if (arr == null) return emptyList()
        val out = ArrayList<EpithetMatcher>(arr.length())
        for (i in 0 until arr.length()) {
            val m = arr.getJSONObject(i)
            val matcher = parseMatcher(m) ?: continue
            out.add(matcher)
        }
        return out
    }

    private fun parseMatcher(m: JSONObject): EpithetMatcher? = when (m.optString("type")) {
        "winRace" -> EpithetMatcher.WinRace(
            name = m.getString("name"),
            atClass = m.optStringOrNull("atClass"),
        )
        "winRaceTimes" -> EpithetMatcher.WinRaceTimes(
            name = m.getString("name"),
            times = m.getInt("times"),
        )
        "winAnyOf" -> EpithetMatcher.WinAnyOf(
            names = jsonStringList(m.getJSONArray("names")),
            count = m.optInt("count", 1),
            atClass = m.optStringOrNull("atClass"),
        )
        "winAtLeast" -> EpithetMatcher.WinAtLeast(
            names = jsonStringList(m.getJSONArray("names")),
            count = m.getInt("count"),
        )
        "winCount" -> EpithetMatcher.WinCount(
            count = m.getInt("count"),
            filter = parseFilter(m.getJSONObject("filter")),
        )
        "epithetAnyOf" -> EpithetMatcher.EpithetAnyOf(
            names = jsonStringList(m.getJSONArray("names")),
        )
        "epithetAll" -> EpithetMatcher.EpithetAll(
            names = jsonStringList(m.getJSONArray("names")),
        )
        else -> null
    }

    private fun parseFilter(o: JSONObject): EpithetFilter = EpithetFilter(
        terrain = o.optStringOrNull("terrain")?.let { TrackSurface.fromName(it) },
        grade = o.optStringOrNull("grade")?.let { RaceGrade.fromName(it) },
        gradeAtLeastOpen = o.optBoolean("gradeAtLeastOpen", false),
        gradedOnly = o.optBoolean("gradedOnly", false),
        distanceTypes = jsonStringList(o.optJSONArray("distanceTypes"))
            .mapNotNull { TrackDistance.fromName(it) }.toSet(),
        raceTracks = jsonStringList(o.optJSONArray("raceTracks")).toSet(),
        nameContains = o.optStringOrNull("nameContains"),
        nameContainsCountry = o.optBoolean("nameContainsCountry", false),
    )

    private fun parsePresets(json: String): Map<String, Aptitudes> {
        val obj = JSONObject(json)
        val out = HashMap<String, Aptitudes>(obj.length())
        val keys = obj.keys()
        while (keys.hasNext()) {
            val name = keys.next()
            val p = obj.getJSONObject(name)
            val dist = p.optJSONObject("distanceAptitudes")
            val surf = p.optJSONObject("surfaceAptitudes")
            if (dist == null || surf == null) continue
            out[name] = Aptitudes(
                sprint = parseAptitude(dist.optString("Sprint", "A")),
                mile = parseAptitude(dist.optString("Mile", "A")),
                medium = parseAptitude(dist.optString("Medium", "A")),
                long = parseAptitude(dist.optString("Long", "A")),
                turf = parseAptitude(surf.optString("Turf", "A")),
                dirt = parseAptitude(surf.optString("Dirt", "A")),
            )
        }
        return out
    }

    private fun parseRacesData(json: String): Map<TurnNumber, List<RaceCandidate>> {
        val obj = JSONObject(json)
        val out = HashMap<TurnNumber, MutableList<RaceCandidate>>()
        val keys = obj.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            val r = obj.getJSONObject(key)
            val turn = r.optInt("turnNumber", -1)
            if (turn <= 0) continue
            val date = r.optString("date", "")
            val classYear = if (date.contains(" Class")) date.substringBefore(" Class").trim() else ""
            // races.json uses "Pre-OP" but the RaceGrade enum is PRE_OP, so normalise dashes to underscores.
            val gradeStr = r.optString("grade", "OP").replace("-", "_")
            val candidate = RaceCandidate(
                key = key,
                name = r.optString("name", ""),
                date = date,
                classYear = classYear,
                raceTrack = r.optString("raceTrack", ""),
                grade = RaceGrade.fromName(gradeStr) ?: RaceGrade.OP,
                terrain = TrackSurface.fromName(r.optString("terrain", "TURF")) ?: TrackSurface.TURF,
                distanceType = TrackDistance.fromName(r.optString("distanceType", "MEDIUM")) ?: TrackDistance.MEDIUM,
                distanceMeters = r.optInt("distanceMeters", 0),
                fans = r.optInt("fans", 0),
                turnNumber = turn,
            )
            out.getOrPut(turn) { mutableListOf() }.add(candidate)
        }
        return out.mapValues { it.value.toList() }
    }

    /** Resolves user-supplied turn → race-name pairs into [Decision.RaceDecision]s by name match. */
    private fun parseManualLocks(
        obj: JSONObject?,
        racesByTurn: Map<TurnNumber, List<RaceCandidate>>,
    ): Map<TurnNumber, Decision> {
        if (obj == null) return emptyMap()
        val out = HashMap<TurnNumber, Decision>()
        val keys = obj.keys()
        while (keys.hasNext()) {
            val turnStr = keys.next()
            val turn = turnStr.toIntOrNull() ?: continue
            val raceName = obj.optString(turnStr, "")
            if (raceName.isEmpty()) continue
            val candidate = racesByTurn[turn]?.firstOrNull { it.name == raceName }
            if (candidate != null) {
                out[turn] = Decision.RaceDecision(candidate.key)
            } else {
                MessageLog.w(TAG, "Manual lock for turn $turn references unknown race \"$raceName\"; ignoring.")
            }
        }
        return out
    }

    /** Serialises a [Schedule] into the JSON shape the React Native preview UI expects. */
    private fun serializeSchedule(
        schedule: Schedule,
        racesByTurn: Map<TurnNumber, List<RaceCandidate>>,
    ): String {
        val decisions = JSONObject()
        for ((turn, decision) in schedule.decisions) {
            val entry = JSONObject()
            when (decision) {
                is Decision.RaceDecision -> {
                    val race = racesByTurn[turn]?.firstOrNull { it.key == decision.raceKey }
                    entry.put("type", "Race")
                    entry.put("raceKey", decision.raceKey)
                    entry.put("name", race?.name ?: decision.raceKey)
                    entry.put("grade", race?.grade?.name ?: "")
                }
                Decision.Train -> entry.put("type", "Train")
                Decision.Rest -> entry.put("type", "Rest")
            }
            decisions.put(turn.toString(), entry)
        }
        return JSONObject()
            .put("decisions", decisions)
            .put("projectedEpithets", JSONArray(schedule.projectedEpithets.toList()))
            .put("totalScore", schedule.totalScore)
            .toString()
    }

    // -------- Helpers --------

    private fun jsonStringList(arr: JSONArray?): List<String> {
        if (arr == null) return emptyList()
        return (0 until arr.length()).map { arr.getString(it) }
    }

    private fun JSONObject.optStringOrNull(key: String): String? =
        if (has(key) && !isNull(key)) optString(key, "").takeIf { it.isNotEmpty() } else null

    /** Best-effort recovery of the human-readable race name from a races.json key. */
    private fun raceNameFromKey(key: String): String =
        key.substringBefore(" (").trim()

    /**
     * Adapts an in-game [RaceData] (sparse schema produced by Racing.kt's existing OCR + DB lookup)
     * into a [RaceCandidate] suitable for the solver. Several fields are best-effort: `key` falls
     * back to `name` when the bot lacks date context, and `classYear`/`raceTrack`/`distanceMeters`
     * are inferred or defaulted because the in-game [RaceData] does not carry them.
     */
    private fun RaceData.toRaceCandidate(turn: TurnNumber): RaceCandidate = RaceCandidate(
        key = name,
        name = name,
        date = "",
        classYear = "",
        raceTrack = "",
        grade = grade,
        terrain = trackSurface,
        distanceType = trackDistance,
        distanceMeters = 0,
        fans = fans,
        turnNumber = turn,
    )
}
