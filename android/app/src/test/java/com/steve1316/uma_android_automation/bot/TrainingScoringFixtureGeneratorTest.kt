package com.steve1316.uma_android_automation.bot

import com.steve1316.uma_android_automation.bot.Training.Companion.calculateMiscScore
import com.steve1316.uma_android_automation.bot.Training.Companion.calculateRawTrainingScore
import com.steve1316.uma_android_automation.bot.Training.Companion.calculateRelationshipScore
import com.steve1316.uma_android_automation.bot.Training.Companion.calculateStatEfficiencyScore
import com.steve1316.uma_android_automation.bot.Training.TrainingConfig
import com.steve1316.uma_android_automation.bot.Training.TrainingOption
import com.steve1316.uma_android_automation.types.DateMonth
import com.steve1316.uma_android_automation.types.DatePhase
import com.steve1316.uma_android_automation.types.DateYear
import com.steve1316.uma_android_automation.types.GameDate
import com.steve1316.uma_android_automation.types.StatName
import com.steve1316.uma_android_automation.utils.CustomImageUtils.BarFillResult
import com.steve1316.uma_android_automation.utils.CustomImageUtils.StatBlock
import com.steve1316.uma_scoring.TrainingScoringConstants
import org.json.JSONArray
import org.json.JSONObject
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.opencv.core.Point
import java.io.File

/**
 * Generates `parity-fixtures.json` from `parity-inputs.json` for the TypeScript parity test in `src/lib/training/scoring/__tests__/parity.test.ts`.
 *
 * Run with `./gradlew :app:testReleaseUnitTest --tests "*TrainingScoringFixtureGeneratorTest*"`.
 */
@DisplayName("TrainingScoring fixture generator")
class TrainingScoringFixtureGeneratorTest {
    @Test
    fun `generates parity fixtures from inputs`() {
        // Gradle runs unit tests with the `android/app` directory as the working directory, so the fixture paths are resolved relative to that.
        val cwd = System.getProperty("user.dir") ?: "."
        println("[fixture-gen] user.dir=$cwd")

        val inputsFile = resolveFixtureFile("../../src/lib/training/scoring/__fixtures__/parity-inputs.json")
        val outputsFile = resolveFixtureFile("../../src/lib/training/scoring/__fixtures__/parity-fixtures.json", mustExist = false)

        val inputsArray = JSONArray(inputsFile.readText())
        val resultsArray = JSONArray()

        for (i in 0 until inputsArray.length()) {
            val scenario = inputsArray.getJSONObject(i)
            val id = scenario.getString("id")
            val configJson = scenario.getJSONObject("config")
            val trainingJson = scenario.getJSONObject("training")

            val training = hydrateTraining(trainingJson)
            val config = hydrateConfig(configJson, training)

            val statEfficiency = calculateStatEfficiencyScore(config, training)
            val relationship = calculateRelationshipScore(config, training)
            val misc = calculateMiscScore(config, training)
            val raw = calculateRawTrainingScore(config, training)

            val entry = JSONObject()
            entry.put("id", id)
            entry.put("statEfficiency", statEfficiency)
            entry.put("relationship", relationship)
            entry.put("misc", misc)
            entry.put("raw", raw)
            resultsArray.put(entry)

            println("[fixture-gen] $id -> raw=$raw, statEff=$statEfficiency, rel=$relationship, misc=$misc")
        }

        outputsFile.writeText(resultsArray.toString(2))
        println("[fixture-gen] Wrote ${resultsArray.length()} entries to ${outputsFile.absolutePath}")
    }

    /**
     * Resolve a fixture path against the unit test working directory, falling back to the repo root when Gradle runs from a different cwd.
     */
    private fun resolveFixtureFile(relativePath: String, mustExist: Boolean = true): File {
        val direct = File(relativePath)
        if (direct.exists()) return direct

        // Fall back to a few common alternative cwds so the test still works if Gradle configuration changes the working directory.
        val tail = relativePath.removePrefix("../").removePrefix("../")
        for (candidate in listOf(File("../$tail"), File(tail), File("../../$tail"))) {
            if (candidate.exists()) return candidate
        }

        if (!mustExist) return direct

        throw IllegalStateException("Could not locate fixture file: $relativePath (cwd=${System.getProperty("user.dir")})")
    }

    /**
     * Build a Kotlin [TrainingOption] from a JSON scenario's "training" object.
     */
    private fun hydrateTraining(json: JSONObject): TrainingOption {
        val name = StatName.fromName(json.getString("name")) ?: error("Unknown training name: ${json.getString("name")}")
        val statGains = parseStatMap(json.getJSONObject("statGains"))
        val failureChance = json.getInt("failureChance")
        val numRainbow = json.getInt("numRainbow")
        val numSkillHints = json.optInt("numSkillHints", 0)
        val trainingLevel = if (json.has("trainingLevel") && !json.isNull("trainingLevel")) json.getInt("trainingLevel") else null

        val barsJson = json.getJSONArray("relationshipBars")
        val bars = ArrayList<BarFillResult>()
        for (j in 0 until barsJson.length()) {
            val barJson = barsJson.getJSONObject(j)
            val dominantColor = barJson.getString("dominantColor")
            val fillPercent = barJson.getDouble("fillPercent")
            val isTrainerSupport = barJson.optBoolean("isTrainerSupport", false)
            // `BarFillResult.isTrainerSupport` reads `statBlock?.name == "trainer_support"`, so we synthesize a matching `StatBlock` when the JSON flag is set.
            val statBlock = if (isTrainerSupport) StatBlock(name = "trainer_support", point = Point(0.0, 0.0)) else null
            bars.add(
                BarFillResult(
                    statName = StatName.SPEED,
                    fillPercent = fillPercent,
                    filledSegments = (fillPercent / 20.0).toInt(),
                    dominantColor = dominantColor,
                    statBlock = statBlock,
                ),
            )
        }

        return TrainingOption(
            name = name,
            statGains = statGains,
            failureChance = failureChance,
            relationshipBars = bars,
            numRainbow = numRainbow,
            numSkillHints = numSkillHints,
            trainingLevel = trainingLevel,
        )
    }

    /**
     * Build a Kotlin [TrainingConfig] from a JSON scenario's "config" object plus the already-hydrated [training].
     */
    private fun hydrateConfig(json: JSONObject, training: TrainingOption): TrainingConfig {
        val currentStats = parseStatMap(json.getJSONObject("currentStats"))
        val statPrioritization = parseStatList(json.getJSONArray("statPrioritization"))
        val summerTrainingStatPriority = parseStatList(json.getJSONArray("summerTrainingStatPriority"))
        val statTargets = parseStatMap(json.getJSONObject("statTargets"))

        val dateJson = json.getJSONObject("currentDate")
        val currentDate = buildGameDate(dateJson)

        val scenario = json.getString("scenario")
        val enableRainbowTrainingBonus = json.optBoolean("enableRainbowTrainingBonus", true)
        val disableTrainingOnMaxedStat = json.optBoolean("disableTrainingOnMaxedStat", false)
        val enablePrioritizeSkillHints = json.optBoolean("enablePrioritizeSkillHints", false)
        val enableTrainingLevelWeighting = json.optBoolean("enableTrainingLevelWeighting", false)
        val disableStatTargets = json.optBoolean("disableStatTargets", false)
        val enablePrioritizeNearMaxFriendship = json.optBoolean("enablePrioritizeNearMaxFriendship", true)

        val blacklist: List<StatName?> =
            if (json.has("blacklist")) {
                val arr = json.getJSONArray("blacklist")
                val result = ArrayList<StatName?>(arr.length())
                for (k in 0 until arr.length()) {
                    result.add(StatName.fromName(arr.getString(k)))
                }
                result
            } else {
                emptyList()
            }

        val statsTrainedOverBuffer: Set<StatName> =
            if (json.has("statsTrainedOverBuffer")) {
                val arr = json.getJSONArray("statsTrainedOverBuffer")
                val result = LinkedHashSet<StatName>()
                for (k in 0 until arr.length()) {
                    StatName.fromName(arr.getString(k))?.let { result.add(it) }
                }
                result
            } else {
                emptySet()
            }

        val skillHintsPerLocation: Map<StatName, Int> =
            if (json.has("skillHintsPerLocation")) {
                val obj = json.getJSONObject("skillHintsPerLocation")
                val baseline = StatName.entries.associateWith { 0 }.toMutableMap()
                for (key in obj.keys()) {
                    val stat = StatName.fromName(key) ?: continue
                    baseline[stat] = obj.getInt(key)
                }
                baseline
            } else {
                StatName.entries.associateWith { 0 }
            }

        // `scoring` is absent from every JSON case; fall back to the default constants when missing.
        val scoring = if (json.has("scoring")) hydrateScoringConstants(json.getJSONObject("scoring")) else TrainingScoringConstants()

        return TrainingConfig(
            currentStats = currentStats,
            statPrioritization = statPrioritization,
            // The JSON omits `eventChoiceStatPriority`. The scoring math we exercise here only consults `statPrioritization` / `summerTrainingStatPriority`,
            // so falling back to `statPrioritization` keeps the field non-empty without affecting any computed value.
            eventChoiceStatPriority = statPrioritization,
            summerTrainingStatPriority = summerTrainingStatPriority,
            statTargets = statTargets,
            currentDate = currentDate,
            scenario = scenario,
            enableRainbowTrainingBonus = enableRainbowTrainingBonus,
            blacklist = blacklist,
            disableTrainingOnMaxedStat = disableTrainingOnMaxedStat,
            trainingOptions = listOf(training),
            skillHintsPerLocation = skillHintsPerLocation,
            enablePrioritizeSkillHints = enablePrioritizeSkillHints,
            enableTrainingLevelWeighting = enableTrainingLevelWeighting,
            disableStatTargets = disableStatTargets,
            enablePrioritizeNearMaxFriendship = enablePrioritizeNearMaxFriendship,
            statsTrainedOverBuffer = statsTrainedOverBuffer,
            scoring = scoring,
        )
    }

    /**
     * Build a [GameDate] whose `year`, `bIsPreDebut`, and `isSummer()` outputs match the JSON's flags. We synthesize a representative day-of-year for each
     * combination since the JSON's own `day` field uses the TypeScript port's day system rather than Kotlin's 1-72 turn numbering.
     */
    private fun buildGameDate(dateJson: JSONObject): GameDate {
        val yearName = dateJson.getString("year")
        val year = DateYear.fromName(yearName) ?: error("Unknown year: $yearName")
        val isSummer = dateJson.optBoolean("isSummer", false)
        val isPreDebut = dateJson.optBoolean("bIsPreDebut", false)

        if (isPreDebut) {
            // Pre-debut is Junior Year Early January through Late June (days 1-11). Use day 1.
            return GameDate(year = DateYear.JUNIOR, month = DateMonth.JANUARY, phase = DatePhase.EARLY)
        }

        if (isSummer) {
            // Summer covers July Early through August Late in Classic and Senior years. Use July Early in the requested year.
            val summerYear = if (year == DateYear.JUNIOR) DateYear.CLASSIC else year
            return GameDate(year = summerYear, month = DateMonth.JULY, phase = DatePhase.EARLY)
        }

        // Non-summer, non-preDebut: pick a representative non-summer turn for the requested year.
        return when (year) {
            DateYear.JUNIOR -> GameDate(year = DateYear.JUNIOR, month = DateMonth.JULY, phase = DatePhase.EARLY)
            DateYear.CLASSIC -> GameDate(year = DateYear.CLASSIC, month = DateMonth.JANUARY, phase = DatePhase.EARLY)
            DateYear.SENIOR -> GameDate(year = DateYear.SENIOR, month = DateMonth.JANUARY, phase = DatePhase.EARLY)
        }
    }

    /**
     * Parse a JSON object of `{ "STAT_NAME": Int }` pairs into a `Map<StatName, Int>`.
     */
    private fun parseStatMap(obj: JSONObject): Map<StatName, Int> {
        val result = LinkedHashMap<StatName, Int>()
        for (key in obj.keys()) {
            val stat = StatName.fromName(key) ?: continue
            result[stat] = obj.getInt(key)
        }
        return result
    }

    /**
     * Parse a JSON array of stat name strings into an ordered `List<StatName>`.
     */
    private fun parseStatList(arr: JSONArray): List<StatName> {
        val result = ArrayList<StatName>(arr.length())
        for (i in 0 until arr.length()) {
            StatName.fromName(arr.getString(i))?.let { result.add(it) }
        }
        return result
    }

    /**
     * Hydrate a [TrainingScoringConstants] from a JSON object. Any missing field falls back to its default value.
     */
    private fun hydrateScoringConstants(json: JSONObject): TrainingScoringConstants {
        val defaults = TrainingScoringConstants()

        fun doubleList(key: String, fallback: List<Double>): List<Double> {
            if (!json.has(key)) return fallback
            val arr = json.getJSONArray(key)
            return List(arr.length()) { arr.getDouble(it) }
        }

        fun statIntMap(key: String, fallback: Map<StatName, Int>): Map<StatName, Int> {
            if (!json.has(key)) return fallback
            val obj = json.getJSONObject(key)
            val result = LinkedHashMap<StatName, Int>()
            for (mapKey in obj.keys()) {
                val stat = StatName.fromName(mapKey) ?: continue
                result[stat] = obj.getInt(mapKey)
            }
            return result
        }

        return TrainingScoringConstants(
            ratioBreakpoints = doubleList("ratioBreakpoints", defaults.ratioBreakpoints),
            ratioMultipliers = doubleList("ratioMultipliers", defaults.ratioMultipliers),
            priorityCoefficient = json.optDouble("priorityCoefficient", defaults.priorityCoefficient),
            levelBoostRank1Factor = json.optDouble("levelBoostRank1Factor", defaults.levelBoostRank1Factor),
            levelBoostRank2Factor = json.optDouble("levelBoostRank2Factor", defaults.levelBoostRank2Factor),
            levelBoostRank3Factor = json.optDouble("levelBoostRank3Factor", defaults.levelBoostRank3Factor),
            mainStatThresholds = statIntMap("mainStatThresholds", defaults.mainStatThresholds),
            mainStatBonusMagnitude = json.optDouble("mainStatBonusMagnitude", defaults.mainStatBonusMagnitude),
            relationshipOrangeValue = json.optDouble("relationshipOrangeValue", defaults.relationshipOrangeValue),
            relationshipGreenValue = json.optDouble("relationshipGreenValue", defaults.relationshipGreenValue),
            relationshipBlueValue = json.optDouble("relationshipBlueValue", defaults.relationshipBlueValue),
            relationshipDiminishingFactor = json.optDouble("relationshipDiminishingFactor", defaults.relationshipDiminishingFactor),
            relationshipEarlyGameBonus = json.optDouble("relationshipEarlyGameBonus", defaults.relationshipEarlyGameBonus),
            relationshipTrainerSupportBonus = json.optDouble("relationshipTrainerSupportBonus", defaults.relationshipTrainerSupportBonus),
            skillHintPerHintScore = json.optDouble("skillHintPerHintScore", defaults.skillHintPerHintScore),
            skillHintOverrideScore = json.optDouble("skillHintOverrideScore", defaults.skillHintOverrideScore),
            statWeightWithBars = json.optDouble("statWeightWithBars", defaults.statWeightWithBars),
            statWeightWithoutBars = json.optDouble("statWeightWithoutBars", defaults.statWeightWithoutBars),
            relationshipWeightWithBars = json.optDouble("relationshipWeightWithBars", defaults.relationshipWeightWithBars),
            miscWeight = json.optDouble("miscWeight", defaults.miscWeight),
            juniorEarlyGameFlatBonus = json.optDouble("juniorEarlyGameFlatBonus", defaults.juniorEarlyGameFlatBonus),
            relationshipScale = json.optDouble("relationshipScale", defaults.relationshipScale),
            rainbowMultiplierEnabled = json.optDouble("rainbowMultiplierEnabled", defaults.rainbowMultiplierEnabled),
            rainbowMultiplierDisabled = json.optDouble("rainbowMultiplierDisabled", defaults.rainbowMultiplierDisabled),
            rainbowPerInstanceBase = json.optDouble("rainbowPerInstanceBase", defaults.rainbowPerInstanceBase),
            rainbowPerInstanceDecay = json.optDouble("rainbowPerInstanceDecay", defaults.rainbowPerInstanceDecay),
            anticipatoryMinFillPercent = json.optDouble("anticipatoryMinFillPercent", defaults.anticipatoryMinFillPercent),
            anticipatoryCoefficient = json.optDouble("anticipatoryCoefficient", defaults.anticipatoryCoefficient),
            anticipatoryCap = json.optDouble("anticipatoryCap", defaults.anticipatoryCap),
        )
    }
}
