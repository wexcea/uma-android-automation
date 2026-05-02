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

    /** Race wins accumulated during the current bot run. Cleared by [reset]. Guarded by its own
     *  monitor since [recordRaceWon] and [buildSolverState] can race on the bot/UI threads. */
    private val raceHistory: MutableList<RaceWin> = mutableListOf()

    /** Memoised result of [parseEpithets] applied to the persisted `epithetsData` setting.
     *  Populated lazily on the first solver call and reused thereafter. */
    @Volatile private var cachedEpithets: List<Epithet>? = null

    /** Memoised result of [parsePresets] applied to the persisted `characterPresetsData`
     *  setting. Populated lazily by [loadCharacterPresets]. */
    @Volatile private var cachedPresets: Map<String, Aptitudes>? = null

    /** Memoised result of [parseRacesData] applied to the persisted `racesData` setting.
     *  Used as a fallback when the JS bridge does not ship inline races JSON. */
    @Volatile private var cachedRaces: Map<TurnNumber, List<RaceCandidate>>? = null

    /**
     * Content-keyed cache for races passed inline through [previewSchedule]'s configJson. The
     * JS layer stringifies the bundled JSON once at module load and ships it on every preview
     * call (~150KB), so without this cache we'd re-parse on every debounced re-solve. Keyed by
     * `String.hashCode()` of the JSON payload since the bundled JSON is identical across calls;
     * a hash mismatch invalidates the cache and re-parses. The pair is `(hash, parsedValue)`.
     */
    @Volatile private var cachedInlineRaces: Pair<Int, Map<TurnNumber, List<RaceCandidate>>>? = null

    /**
     * Content-keyed cache for epithets passed inline through [previewSchedule]'s configJson.
     * Same omit-after-prime contract and hash-keying scheme as [cachedInlineRaces]; see that
     * field's docstring for details. The pair is `(hash, parsedValue)`.
     */
    @Volatile private var cachedInlineEpithets: Pair<Int, List<Epithet>>? = null

    /** Race staged by [markPendingRace] awaiting an outcome confirmation via [commitPendingRace]. */
    @Volatile private var pendingRace: RaceWin? = null

    /** True after [seedHistoryFromPreview] has populated [raceHistory] for the current run. */
    @Volatile private var historySeeded: Boolean = false

    /** Clears in-memory race history and pending state. Call at the start of a fresh bot run. */
    fun reset() {
        synchronized(raceHistory) { raceHistory.clear() }
        pendingRace = null
        historySeeded = false
    }

    /**
     * Records a winning race in the in-memory history. Idempotent for the same
     * `(raceKey, turnNumber)` pair so duplicate calls from retries don't double-count.
     *
     * @param raceKey Race key (matches [RaceCandidate.key]).
     * @param raceName Race name (matches [RaceCandidate.name]).
     * @param classYear Class-year prefix at the time of the win.
     * @param turnNumber Turn the win occurred on.
     */
    fun recordRaceWon(raceKey: String, raceName: String, classYear: String, turnNumber: TurnNumber) {
        synchronized(raceHistory) {
            if (raceHistory.none { it.raceKey == raceKey && it.turnNumber == turnNumber }) {
                raceHistory.add(RaceWin(raceKey, raceName, classYear, turnNumber))
            }
        }
    }

    /**
     * Stages an in-progress race so the runtime can decide later whether to commit it to
     * [raceHistory] based on the post-race results screen. Overwrites any prior pending entry
     * (a stale pending entry is treated as "lost" by the next [commitPendingRace] call).
     *
     * @param raceKey Race key (matches [RaceCandidate.key]).
     * @param raceName Race name (matches [RaceCandidate.name]).
     * @param classYear Class-year prefix at the time of the attempt.
     * @param turnNumber Turn the race is being attempted on.
     */
    fun markPendingRace(raceKey: String, raceName: String, classYear: String, turnNumber: TurnNumber) {
        pendingRace = RaceWin(raceKey, raceName, classYear, turnNumber)
    }

    /**
     * Idempotent per-run hook that logs the Preview-equivalent schedule and (on a mid-run
     * restart) seeds [raceHistory] with assumed wins for turns before [currentTurn]. Safe
     * to call repeatedly: only the first call after [reset] does any work. Designed to be
     * invoked from the campaign loop right after the date is detected so the schedule log
     * appears before shop/item dialogs rather than later when [peekRaceKeyForTurn] eventually
     * runs.
     *
     * @param currentTurn The turn the bot is on.
     * @param scenario Active scenario name from `settings.general.scenario`.
     */
    fun runStartupHooks(currentTurn: TurnNumber, scenario: String) {
        if (historySeeded) return
        if (!SettingsHelper.getBooleanSetting("racing", "enableSmartRaceSolver")) return
        val epithets = loadEpithets() ?: return
        val racesByTurn = loadAllRaces() ?: return
        seedHistoryFromPreview(currentTurn, scenario, epithets, racesByTurn)
        historySeeded = true
    }

    /**
     * Commits the most recent [markPendingRace] entry to [raceHistory] when [won] is true,
     * or discards it when false (e.g. retries disabled or exhausted). No-op when no race
     * is pending. Idempotent on `(raceKey, turnNumber)` via [recordRaceWon].
     *
     * @param won True when the race ended in 1st place (LabelCongratulations detected).
     */
    fun commitPendingRace(won: Boolean) {
        val pending = pendingRace ?: return
        pendingRace = null
        if (!won) {
            MessageLog.i(TAG, "Race \"${pending.name}\" on turn ${pending.turnNumber} did not finish 1st; not adding to history.")
            return
        }
        recordRaceWon(pending.raceKey, pending.name, pending.classYear, pending.turnNumber)
        MessageLog.i(TAG, "Race \"${pending.name}\" on turn ${pending.turnNumber} confirmed 1st; added to history.")
        logEpithetProgressAfterWin(pending.name)
    }

    /**
     * Logs the epithets whose matchers reference [raceName] alongside their post-win status
     * and per-matcher progress. Called only on confirmed wins so losses generate no noise.
     * Filter-based matchers (e.g. [EpithetMatcher.WinCount]) are skipped to keep the affected
     * list narrow to epithets that explicitly name this race.
     *
     * @param raceName The just-confirmed race name (matches [RaceCandidate.name]).
     */
    private fun logEpithetProgressAfterWin(raceName: String) {
        val epithets = cachedEpithets ?: loadEpithets() ?: return
        val racesByTurn = cachedRaces ?: loadAllRaces() ?: return
        val affected = epithets.filter { epi -> epi.matchers.any { matcherReferencesRace(it, raceName) } }
        if (affected.isEmpty()) return
        val state =
            SolverState(
                currentTurn = 1,
                scenario = "",
                characterPreset = null,
                aptitudes = readUserAptitudes(),
                racesByTurn = racesByTurn,
                epithets = epithets,
                raceHistory = synchronized(raceHistory) { raceHistory.toList() },
                forcedEpithets = readStringSet("smartRaceSolverForcedEpithets"),
                targetEpithets = readStringSet("smartRaceSolverTargetEpithets"),
                weights = readWeights(),
            )
        val sb = StringBuilder()
        sb.append("Race \"$raceName\" updated ${affected.size} epithet(s):")
        for (epi in affected) {
            val status = EpithetTracker.classify(epi, state)
            val percents = epi.matchers.joinToString(", ") { "${(EpithetTracker.progress(it, state) * 100).toInt()}%" }
            sb.append("\n  - \"${epi.name}\" → $status (matchers: $percents)")
        }
        MessageLog.i(TAG, sb.toString())
    }

    /**
     * True when [matcher] explicitly references [raceName] by name. Filter-based
     * ([EpithetMatcher.WinCount]) and epithet-dependency matchers
     * ([EpithetMatcher.EpithetAnyOf], [EpithetMatcher.EpithetAll]) are excluded so
     * post-win logging only flags epithets that name the race directly.
     *
     * @param matcher Matcher to inspect.
     * @param raceName Race name (matches [RaceCandidate.name]).
     * @return True when the matcher names the race.
     */
    private fun matcherReferencesRace(matcher: EpithetMatcher, raceName: String): Boolean =
        when (matcher) {
            is EpithetMatcher.WinRace -> matcher.name == raceName
            is EpithetMatcher.WinRaceTimes -> matcher.name == raceName
            is EpithetMatcher.WinAnyOf -> raceName in matcher.names
            is EpithetMatcher.WinAtLeast -> raceName in matcher.names
            is EpithetMatcher.WinCount -> false
            is EpithetMatcher.EpithetAnyOf -> false
            is EpithetMatcher.EpithetAll -> false
        }

    /**
     * Picks the on-screen race the solver's schedule prefers for [currentTurn], or returns
     * null when the solver cannot or should not influence the decision (feature disabled,
     * data missing, no schedule match).
     *
     * @param currentTurn The bot's current turn number.
     * @param scenario Active scenario name from `settings.general.scenario`.
     * @param candidates The on-screen [RaceData] list already matched by [Racing.lookupRaceInDatabase].
     * @return The chosen [RaceData] from [candidates], or null when the solver cannot or should
     *   not influence this turn (feature disabled, no on-screen candidates, missing data, the
     *   solver picked Train/Rest, or its chosen race is not on screen).
     */
    fun pickRace(currentTurn: TurnNumber, scenario: String, candidates: List<RaceData>): RaceData? {
        if (!SettingsHelper.getBooleanSetting("racing", "enableSmartRaceSolver")) return null
        if (candidates.isEmpty()) return null

        val epithets =
            loadEpithets() ?: return null.also {
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
     * Peeks at the solver's planned race key for [currentTurn] without requiring on-screen
     * candidates. Used by callers that need to know whether the solver will race this turn
     * before opening the race-list UI (e.g. Trackblazer's pre-check, Racing's early-exit OCR
     * scan).
     *
     * @param currentTurn The bot's current turn number.
     * @param scenario Active scenario name from `settings.general.scenario`.
     * @return The planned race key (matches [RaceCandidate.key]), or null when the solver
     *   cannot or should not influence this turn (feature disabled, missing data, or solver
     *   picked Train/Rest).
     */
    fun peekRaceKeyForTurn(currentTurn: TurnNumber, scenario: String): String? =
        (peekDecisionForTurn(currentTurn, scenario) as? Decision.RaceDecision)?.raceKey

    /**
     * Peeks at the solver's planned [Decision] for [currentTurn] without requiring on-screen
     * candidates. Returns the full decision shape — `Train`, `Rest`, or `RaceDecision` —
     * so callers can route the bot's per-turn action to match the solver's plan instead of
     * falling through to legacy heuristics on non-Race turns.
     *
     * @param currentTurn The bot's current turn number.
     * @param scenario Active scenario name from `settings.general.scenario`.
     * @return The planned [Decision], or null when the solver cannot influence this turn
     *   (feature disabled or required data missing).
     */
    fun peekDecisionForTurn(currentTurn: TurnNumber, scenario: String): Decision? {
        if (!SettingsHelper.getBooleanSetting("racing", "enableSmartRaceSolver")) return null
        val epithets = loadEpithets() ?: return null
        val racesByTurn = loadAllRaces() ?: return null

        runStartupHooks(currentTurn, scenario)

        val state =
            SolverState(
                currentTurn = currentTurn,
                scenario = scenario,
                characterPreset = SettingsHelper.getStringSetting("racing", "smartRaceSolverCharacterPreset").ifEmpty { null },
                aptitudes = readUserAptitudes(),
                racesByTurn = racesByTurn,
                epithets = epithets,
                raceHistory = synchronized(raceHistory) { raceHistory.toList() },
                forcedEpithets = readStringSet("smartRaceSolverForcedEpithets"),
                targetEpithets = readStringSet("smartRaceSolverTargetEpithets"),
                weights = readWeights(),
            )
        val schedule = SmartRaceSolver.solve(state)
        return schedule.decisionAt(currentTurn)
    }

    /**
     * True when [raceData] resolves to the same race as the supplied solver [raceKey]. Mirrors
     * the matching logic used inside [pickRace] so callers can match candidates against a key
     * returned by [peekRaceKeyForTurn] without re-implementing the comparison.
     *
     * @param raceData On-screen race resolved by [Racing.lookupRaceInDatabase].
     * @param raceKey Solver race key returned by [peekRaceKeyForTurn].
     * @return True when the on-screen race matches the solver's key.
     */
    fun isRaceKeyMatch(raceData: RaceData, raceKey: String): Boolean = raceData.name == raceKey || raceData.name == raceNameFromKey(raceKey)

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
        val tStart = System.nanoTime()
        val config = runCatching { JSONObject(configJson) }.getOrElse { JSONObject() }
        val tConfigParsed = System.nanoTime()
        // Prefer the JS-provided races/epithets payload (always present from the bundled JSON
        // imports) and fall back to SettingsHelper. This avoids depending on persistence timing
        // for users whose profiles predate these settings.
        val racesByTurn =
            parseRacesJsonField(config.optStringOrNull("racesDataJson"))
                ?: loadAllRaces()
        if (racesByTurn == null) {
            return JSONObject()
                .put("decisions", JSONObject())
                .put("projectedEpithets", JSONArray())
                .put("totalScore", 0.0)
                .put("error", "races data unavailable")
                .toString()
        }
        val epithets =
            parseEpithetsJsonField(config.optStringOrNull("epithetsDataJson"))
                ?: loadEpithets()
                ?: emptyList()
        val tDataParsed = System.nanoTime()

        val state =
            SolverState(
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

        val tStateBuilt = System.nanoTime()
        val schedule = SmartRaceSolver.solve(state)
        val tSolved = System.nanoTime()
        val out = serializeSchedule(schedule, racesByTurn)
        val tSerialized = System.nanoTime()
        MessageLog.i(
            TAG,
            "previewSchedule timings (ms): " +
                "configParse=${(tConfigParsed - tStart) / 1_000_000}, " +
                "dataParse=${(tDataParsed - tConfigParsed) / 1_000_000}, " +
                "stateBuild=${(tStateBuilt - tDataParsed) / 1_000_000}, " +
                "solve=${(tSolved - tStateBuilt) / 1_000_000}, " +
                "serialize=${(tSerialized - tSolved) / 1_000_000}, " +
                "total=${(tSerialized - tStart) / 1_000_000}",
        )
        return out
    }

    /**
     * Builds the solver state for [currentTurn]. Only the on-screen [candidates] populate the
     * candidate pool — the solver still receives the full epithet list so it can score
     * schedule-completing picks correctly relative to alternatives.
     *
     * @param currentTurn Turn the state is being built for.
     * @param scenario Active scenario name.
     * @param epithets Full list of epithets parsed from settings.
     * @param candidates On-screen race candidates available on [currentTurn].
     * @return Populated [SolverState], or null when state cannot be assembled.
     */
    private fun buildSolverState(
        currentTurn: TurnNumber,
        scenario: String,
        epithets: List<Epithet>,
        candidates: List<RaceData>,
    ): SolverState? {
        val racesForTurn = candidates.map { it.toRaceCandidate(currentTurn) }
        // TODO: completedEpithets defaults to emptySet() — never populated from runtime
        //  EpithetTracker. Causes "projected epithets: []" in pickRace() logs because the
        //  beam search starts blind to prior wins. Fix tracked separately.
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

    /**
     * Computes the Preview-equivalent schedule for the current configuration, logs it, and
     * (when [currentTurn] > 1) replays its Race-decisions for turns before [currentTurn]
     * into [raceHistory] as assumed wins for mid-run restart recovery. The schedule is
     * computed with the same inputs [previewSchedule] uses (currentTurn=1, empty raceHistory,
     * `manualLocks` from settings) so what the runtime expects matches what the user has been
     * watching in the UI.
     *
     * @param currentTurn The turn the bot is currently on; only turns strictly before this
     *   are seeded into history.
     * @param scenario Active scenario name from `settings.general.scenario`.
     * @param epithets Full list of epithets parsed from settings.
     * @param racesByTurn Full race calendar from settings.
     */
    private fun seedHistoryFromPreview(
        currentTurn: TurnNumber,
        scenario: String,
        epithets: List<Epithet>,
        racesByTurn: Map<TurnNumber, List<RaceCandidate>>,
    ) {
        val manualLocksJson = SettingsHelper.getStringSetting("racing", "smartRaceSolverManualLocks")
        val manualLocksObj = runCatching { if (manualLocksJson.isEmpty()) null else JSONObject(manualLocksJson) }.getOrNull()
        val state =
            SolverState(
                currentTurn = 1,
                scenario = scenario,
                characterPreset = SettingsHelper.getStringSetting("racing", "smartRaceSolverCharacterPreset").ifEmpty { null },
                aptitudes = readUserAptitudes(),
                racesByTurn = racesByTurn,
                epithets = epithets,
                forcedEpithets = readStringSet("smartRaceSolverForcedEpithets"),
                targetEpithets = readStringSet("smartRaceSolverTargetEpithets"),
                lockedDecisions = parseManualLocks(manualLocksObj, racesByTurn),
                weights = readWeights(),
            )
        val schedule = SmartRaceSolver.solve(state)
        logPreviewSchedule(schedule, racesByTurn)
        if (currentTurn <= 1) return
        var seeded = 0
        for ((turn, decision) in schedule.decisions) {
            if (turn >= currentTurn) continue
            if (decision !is Decision.RaceDecision) continue
            val candidate = racesByTurn[turn]?.firstOrNull { it.key == decision.raceKey }
            val raceName = candidate?.name ?: raceNameFromKey(decision.raceKey)
            val classYear = candidate?.classYear ?: ""
            recordRaceWon(decision.raceKey, raceName, classYear, turn)
            seeded += 1
        }
        if (seeded > 0) {
            MessageLog.i(TAG, "Seeded raceHistory with $seeded assumed wins from Preview for turns 1..${currentTurn - 1} (mid-run restart recovery).")
        }
    }

    /**
     * Logs a one-line-per-race summary of the Preview's schedule plus the projected epithets
     * the solver expects to complete. Intended to fire once per bot run so the operator can
     * compare actual play to the planned schedule.
     *
     * @param schedule The solved schedule to summarize.
     * @param racesByTurn Race calendar used to resolve race keys back to names.
     */
    private fun logPreviewSchedule(schedule: Schedule, racesByTurn: Map<TurnNumber, List<RaceCandidate>>) {
        val raceTurns = schedule.decisions.entries.filter { it.value is Decision.RaceDecision }.sortedBy { it.key }
        val sb = StringBuilder()
        sb.append("Smart Race Solver Preview Schedule (${raceTurns.size} races, score=${"%.2f".format(schedule.totalScore)}, projected epithets: ${schedule.projectedEpithets}):")
        if (raceTurns.isEmpty()) {
            sb.append("\n  (no races planned)")
        } else {
            for ((turn, decision) in raceTurns) {
                val raceKey = (decision as Decision.RaceDecision).raceKey
                val candidate = racesByTurn[turn]?.firstOrNull { it.key == raceKey }
                val name = candidate?.name ?: raceNameFromKey(raceKey)
                val grade = candidate?.grade?.name ?: "?"
                val date = candidate?.date?.takeIf { it.isNotBlank() }
                val datePrefix = if (date != null) "$date — " else ""
                sb.append("\n  Turn $turn (${datePrefix}$name, $grade)")
            }
        }
        MessageLog.i(TAG, sb.toString())
    }

    /**
     * Reads the user's saved aptitude configuration from settings.
     *
     * @return Parsed [Aptitudes], or [Aptitudes.DEFAULT_A] when the setting is empty or invalid.
     */
    private fun readUserAptitudes(): Aptitudes {
        val json = SettingsHelper.getStringSetting("racing", "smartRaceSolverAptitudes")
        if (json.isEmpty()) return Aptitudes.DEFAULT_A
        return runCatching { parseAptitudesObj(JSONObject(json)) }.getOrElse { Aptitudes.DEFAULT_A }
    }

    /**
     * Parses an aptitudes JSON object with the keys `Sprint`, `Mile`, `Medium`, `Long`, `Turf`,
     * `Dirt`. Missing keys default to "A".
     *
     * @param obj JSON object to parse, or null.
     * @return Parsed [Aptitudes]; [Aptitudes.DEFAULT_A] when [obj] is null.
     */
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

    /**
     * Reads a JSON-array-of-strings setting and returns it as a [Set].
     *
     * @param key Settings key under the `racing` namespace.
     * @return Parsed string set, or an empty set when missing or unparseable.
     */
    private fun readStringSet(key: String): Set<String> {
        val json = SettingsHelper.getStringSetting("racing", key)
        if (json.isEmpty()) return emptySet()
        return runCatching {
            val arr = JSONArray(json)
            (0 until arr.length()).mapTo(mutableSetOf()) { arr.getString(it) }
        }.getOrElse { emptySet() }
    }

    /**
     * Reads the user's saved scoring weights from settings.
     *
     * @return Parsed [Weights], or default [Weights] when empty or unparseable.
     */
    private fun readWeights(): Weights {
        val json = SettingsHelper.getStringSetting("racing", "smartRaceSolverWeights")
        if (json.isEmpty()) return Weights()
        return runCatching { parseWeightsObj(JSONObject(json)) }.getOrElse { Weights() }
    }

    /**
     * Parses a weights JSON object. Each field falls back to the corresponding [Weights]
     * default when missing.
     *
     * @param obj JSON object to parse, or null.
     * @return Parsed [Weights]; default [Weights] when [obj] is null.
     */
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
            raceBonusPct = obj.optDouble("raceBonusPct", 50.0),
            raceCostPct = obj.optDouble("raceCostPct", 100.0),
            aptitudeThreshold = parseAptitude(obj.optString("aptitudeThreshold", "C")),
            includeOpAndPreOp = obj.optBoolean("includeOpAndPreOp", false),
            allowSummerRacing = obj.optBoolean("allowSummerRacing", false),
        )
    }

    /**
     * Parses a single aptitude letter (e.g. "S", "A", "C") into an [Aptitude] enum.
     *
     * @param s Aptitude letter.
     * @return Parsed [Aptitude]; [Aptitude.A] on unrecognised input.
     */
    private fun parseAptitude(s: String): Aptitude =
        Aptitude.fromName(s) ?: Aptitude.A

    /**
     * Lazy, cached parse of the `epithetsData` setting. Cached on first success so repeated
     * solver runs don't re-parse the same JSON.
     *
     * @return Parsed epithet list, or null when the setting is empty or unparseable.
     */
    private fun loadEpithets(): List<Epithet>? {
        cachedEpithets?.let { return it }
        val json = SettingsHelper.getStringSetting("racing", "epithetsData")
        if (json.isEmpty()) return null
        return runCatching { parseEpithets(json) }
            .onFailure { MessageLog.e(TAG, "Failed to parse epithetsData: ${it.message}") }
            .getOrNull()
            ?.also { cachedEpithets = it }
    }

    /**
     * Lazy, cached parse of the `racesData` setting into a turn-keyed candidate pool.
     *
     * @return Map of turn → eligible races, or null when the setting is empty or unparseable.
     */
    private fun loadAllRaces(): Map<TurnNumber, List<RaceCandidate>>? {
        cachedRaces?.let { return it }
        val json = SettingsHelper.getStringSetting("racing", "racesData")
        if (json.isEmpty()) return null
        return runCatching { parseRacesData(json) }
            .onFailure { MessageLog.e(TAG, "Failed to parse racesData: ${it.message}") }
            .getOrNull()
            ?.also { cachedRaces = it }
    }

    /**
     * Lazy, cached parse of the `characterPresetsData` setting. Invoked from JS via the React
     * Native bridge, so static analysis cannot see the callers.
     *
     * @return Map of preset name → aptitudes, or null when the setting is empty or unparseable.
     */
    fun loadCharacterPresets(): Map<String, Aptitudes>? {
        cachedPresets?.let { return it }
        val json = SettingsHelper.getStringSetting("racing", "characterPresetsData")
        if (json.isEmpty()) return null
        return runCatching { parsePresets(json) }
            .onFailure { MessageLog.e(TAG, "Failed to parse characterPresetsData: ${it.message}") }
            .getOrNull()
            ?.also { cachedPresets = it }
    }

    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // JSON parsers

    /**
     * Parses an epithets JSON document into a list of [Epithet]. The JSON is expected to be a
     * top-level object whose values are per-epithet entries with the schema produced by the
     * gametora scraper.
     *
     * @param json Raw JSON string.
     * @return Parsed epithet list. Throws if the JSON is structurally invalid; callers wrap
     *   in `runCatching` to convert errors into a null fallback.
     */
    internal fun parseEpithets(json: String): List<Epithet> {
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

    /**
     * Parses an epithet's matcher array. Unrecognised matcher types are dropped silently.
     *
     * @param arr JSON array of matcher objects, or null.
     * @return Parsed list of matchers; empty when [arr] is null.
     */
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

    /**
     * Parses a single matcher JSON object into the matching [EpithetMatcher] subtype.
     *
     * @param m JSON object with at least a `type` field.
     * @return Parsed matcher, or null when the type is unrecognised.
     */
    private fun parseMatcher(m: JSONObject): EpithetMatcher? =
        when (m.optString("type")) {
            "winRace" ->
                EpithetMatcher.WinRace(
                    name = m.getString("name"),
                    atClass = m.optStringOrNull("atClass"),
                )
            "winRaceTimes" ->
                EpithetMatcher.WinRaceTimes(
                    name = m.getString("name"),
                    times = m.getInt("times"),
                )
            "winAnyOf" ->
                EpithetMatcher.WinAnyOf(
                    names = jsonStringList(m.getJSONArray("names")),
                    count = m.optInt("count", 1),
                    atClass = m.optStringOrNull("atClass"),
                )
            "winAtLeast" ->
                EpithetMatcher.WinAtLeast(
                    names = jsonStringList(m.getJSONArray("names")),
                    count = m.getInt("count"),
                )
            "winCount" ->
                EpithetMatcher.WinCount(
                    count = m.getInt("count"),
                    filter = parseFilter(m.getJSONObject("filter")),
                )
            "epithetAnyOf" ->
                EpithetMatcher.EpithetAnyOf(
                    names = jsonStringList(m.getJSONArray("names")),
                )
            "epithetAll" ->
                EpithetMatcher.EpithetAll(
                    names = jsonStringList(m.getJSONArray("names")),
                )
            else -> null
        }

    /**
     * Parses a `winCount` matcher's filter object. Each field defaults to the matching
     * [EpithetFilter] default when missing.
     *
     * @param o Filter JSON object.
     * @return Parsed [EpithetFilter].
     */
    private fun parseFilter(o: JSONObject): EpithetFilter =
        EpithetFilter(
            terrain = o.optStringOrNull("terrain")?.let { TrackSurface.fromName(it) },
            grade = o.optStringOrNull("grade")?.let { RaceGrade.fromName(it) },
            gradeAtLeastOpen = o.optBoolean("gradeAtLeastOpen", false),
            gradedOnly = o.optBoolean("gradedOnly", false),
            distanceTypes =
                jsonStringList(o.optJSONArray("distanceTypes"))
                    .mapNotNull { TrackDistance.fromName(it) }.toSet(),
            raceTracks = jsonStringList(o.optJSONArray("raceTracks")).toSet(),
            nameContains = o.optStringOrNull("nameContains"),
            nameContainsCountry = o.optBoolean("nameContainsCountry", false),
        )

    /**
     * Parses a character-presets JSON document into a name → aptitudes map.
     *
     * @param json Raw JSON string.
     * @return Map of preset name to [Aptitudes]. Entries missing aptitude fields are skipped.
     */
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
            out[name] =
                Aptitudes(
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

    /**
     * Parses inline races JSON if shipped, otherwise returns the most recent cached inline result.
     * The JS layer omits `racesDataJson` after the first successful preview to save ~150KB of
     * marshalling per debounced re-solve, so once we've parsed any inline payload we keep using it
     * even when subsequent calls drop the field. Returns null only when nothing has ever been
     * shipped — callers fall back to [loadAllRaces] (SettingsHelper) in that case.
     *
     * @param json Inline races JSON, or null/empty to use the cached payload.
     * @return Parsed turn-keyed candidate pool; null when no payload has ever been parsed.
     */
    private fun parseRacesJsonField(json: String?): Map<TurnNumber, List<RaceCandidate>>? {
        if (json.isNullOrEmpty()) return cachedInlineRaces?.second
        val hash = json.hashCode()
        cachedInlineRaces?.let { (cachedHash, value) -> if (cachedHash == hash) return value }
        return runCatching { parseRacesData(json) }
            .onFailure { MessageLog.e(TAG, "Failed to parse inline racesDataJson: ${it.message}") }
            .getOrNull()
            ?.also { cachedInlineRaces = hash to it }
    }

    /**
     * See [parseRacesJsonField] — same omit-after-prime contract for epithets data.
     *
     * @param json Inline epithets JSON, or null/empty to use the cached payload.
     * @return Parsed epithet list; null when no payload has ever been parsed.
     */
    private fun parseEpithetsJsonField(json: String?): List<Epithet>? {
        if (json.isNullOrEmpty()) return cachedInlineEpithets?.second
        val hash = json.hashCode()
        cachedInlineEpithets?.let { (cachedHash, value) -> if (cachedHash == hash) return value }
        return runCatching { parseEpithets(json) }
            .onFailure { MessageLog.e(TAG, "Failed to parse inline epithetsDataJson: ${it.message}") }
            .getOrNull()
            ?.also { cachedInlineEpithets = hash to it }
    }

    /**
     * Parses a races JSON document into a turn-keyed candidate pool. Each entry must include
     * a `turnNumber` field — entries with `turnNumber <= 0` are silently dropped.
     *
     * @param json Raw races JSON string.
     * @return Map of turn → list of [RaceCandidate] for that turn.
     */
    internal fun parseRacesData(json: String): Map<TurnNumber, List<RaceCandidate>> {
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
            val candidate =
                RaceCandidate(
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

    /**
     * Parses the manual-lock map from the snapshot. Each entry maps a turn number → either a
     * race name (forces that race) or the sentinel `"__TRAIN__"` (forces a Train turn). The
     * latter is used by the inline calendar UI to "delete" a scheduled race or lock a turn that
     * had no race so the solver leaves it alone.
     *
     * @param obj JSON object of `{turnNumber: raceName | "__TRAIN__"}` pairs, or null.
     * @param racesByTurn Candidate pool used to resolve race-name locks back to keys.
     * @return Map of turn → [Decision]. Entries referencing unknown race names are logged and dropped.
     */
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
            val value = obj.optString(turnStr, "")
            if (value.isEmpty()) continue
            if (value == TRAIN_LOCK_SENTINEL) {
                out[turn] = Decision.Train
                continue
            }
            val candidate = racesByTurn[turn]?.firstOrNull { it.name == value }
            if (candidate != null) {
                out[turn] = Decision.RaceDecision(candidate.key)
            } else {
                MessageLog.w(TAG, "Manual lock for turn $turn references unknown race \"$value\"; ignoring.")
            }
        }
        return out
    }

    /** Sentinel value the JS side writes to `manualLocks[turn]` when locking a turn to Train. */
    private const val TRAIN_LOCK_SENTINEL: String = "__TRAIN__"

    /**
     * Serialises a [Schedule] into the JSON shape the React Native preview UI expects.
     *
     * @param schedule Schedule to serialise.
     * @param racesByTurn Candidate pool used to enrich race decisions with name and grade fields.
     * @return JSON string of `{decisions, projectedEpithets, totalScore}`.
     */
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

    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // Helpers

    /**
     * Converts a JSON array of strings into a Kotlin list.
     *
     * @param arr JSON array, or null.
     * @return List of strings; empty when [arr] is null.
     */
    private fun jsonStringList(arr: JSONArray?): List<String> {
        if (arr == null) return emptyList()
        return (0 until arr.length()).map { arr.getString(it) }
    }

    /**
     * Like [JSONObject.optString] but returns null instead of an empty string when the key is
     * missing, JSON null, or the empty string. Avoids the empty-string-as-sentinel ambiguity.
     *
     * @param key Field name to read.
     * @return Non-empty string value, or null.
     */
    private fun JSONObject.optStringOrNull(key: String): String? =
        if (has(key) && !isNull(key)) optString(key, "").takeIf { it.isNotEmpty() } else null

    /**
     * Best-effort recovery of the human-readable race name from a races.json key. Race keys
     * follow the pattern `"<name> (<date>)"`, so we trim everything starting at the first ` (`.
     *
     * @param key Race key.
     * @return Recovered race name.
     */
    private fun raceNameFromKey(key: String): String =
        key.substringBefore(" (").trim()

    /**
     * Adapts an in-game [RaceData] (sparse schema produced by Racing.kt's existing OCR + DB lookup)
     * into a [RaceCandidate] suitable for the solver. Several fields are best-effort: `key` falls
     * back to `name` when the bot lacks date context, and `classYear`/`raceTrack`/`distanceMeters`
     * are inferred or defaulted because the in-game [RaceData] does not carry them.
     *
     * @param turn Turn the on-screen race is being mapped to.
     * @return A [RaceCandidate] suitable for the solver.
     */
    private fun RaceData.toRaceCandidate(turn: TurnNumber): RaceCandidate =
        RaceCandidate(
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
