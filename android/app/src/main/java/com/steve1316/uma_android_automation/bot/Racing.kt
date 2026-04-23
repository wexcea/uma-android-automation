package com.steve1316.uma_android_automation.bot

import android.graphics.Bitmap
import android.util.Log
import com.steve1316.automation_library.utils.MessageLog
import com.steve1316.automation_library.utils.SQLiteSettingsManager
import com.steve1316.automation_library.utils.SettingsHelper
import com.steve1316.uma_android_automation.MainActivity
import com.steve1316.uma_android_automation.bot.Campaign
import com.steve1316.uma_android_automation.bot.DialogHandlerResult
import com.steve1316.uma_android_automation.components.ButtonAgenda
import com.steve1316.uma_android_automation.components.ButtonBack
import com.steve1316.uma_android_automation.components.ButtonChangeRunningStyle
import com.steve1316.uma_android_automation.components.ButtonClose
import com.steve1316.uma_android_automation.components.ButtonMyAgendas
import com.steve1316.uma_android_automation.components.ButtonNext
import com.steve1316.uma_android_automation.components.ButtonNextRaceEnd
import com.steve1316.uma_android_automation.components.ButtonOk
import com.steve1316.uma_android_automation.components.ButtonRace
import com.steve1316.uma_android_automation.components.ButtonRaceAgendaLoadList
import com.steve1316.uma_android_automation.components.ButtonRaceExclamation
import com.steve1316.uma_android_automation.components.ButtonRaceListFullStats
import com.steve1316.uma_android_automation.components.ButtonRaceManual
import com.steve1316.uma_android_automation.components.ButtonRaces
import com.steve1316.uma_android_automation.components.ButtonSkip
import com.steve1316.uma_android_automation.components.ButtonTryAgainAlt
import com.steve1316.uma_android_automation.components.ButtonViewResults
import com.steve1316.uma_android_automation.components.IconRaceAgendaEmpty
import com.steve1316.uma_android_automation.components.IconRaceDayRibbon
import com.steve1316.uma_android_automation.components.IconRaceListMaidenPill
import com.steve1316.uma_android_automation.components.IconRaceListPredictionDoubleStar
import com.steve1316.uma_android_automation.components.IconRaceListSelectionBracketBottomRight
import com.steve1316.uma_android_automation.components.IconScrollListBottomRight
import com.steve1316.uma_android_automation.components.IconScrollListTopLeft
import com.steve1316.uma_android_automation.components.LabelRaceCriteriaFans
import com.steve1316.uma_android_automation.components.LabelRaceCriteriaG3OrAbove
import com.steve1316.uma_android_automation.components.LabelRaceCriteriaMaiden
import com.steve1316.uma_android_automation.components.LabelRaceCriteriaPreOpOrAbove
import com.steve1316.uma_android_automation.components.LabelRaceCriteriaTrophies
import com.steve1316.uma_android_automation.components.LabelRaceSelectionFans
import com.steve1316.uma_android_automation.components.LabelThereAreNoRacesToCompeteIn
import com.steve1316.uma_android_automation.types.Aptitude
import com.steve1316.uma_android_automation.types.BoundingBox
import com.steve1316.uma_android_automation.types.DateYear
import com.steve1316.uma_android_automation.types.RaceGrade
import com.steve1316.uma_android_automation.types.RunningStyle
import com.steve1316.uma_android_automation.types.TrackDistance
import com.steve1316.uma_android_automation.types.TrackSurface
import com.steve1316.uma_android_automation.utils.CustomImageUtils.RaceDetails
import net.ricecode.similarity.JaroWinklerStrategy
import net.ricecode.similarity.StringSimilarityServiceImpl
import org.json.JSONArray
import org.json.JSONObject
import org.opencv.core.Point

/**
 * Manage and orchestrate the racing process, including mandatory, maiden, and extra races.
 *
 * @property game A reference to the bot's [Game] instance.
 * @property campaign A reference to the current [Campaign] instance.
 */
class Racing(private val game: Game, private val campaign: Campaign) {
    /** Whether to enable farming fans through extra races. */
    private val enableFarmingFans = SettingsHelper.getBooleanSetting("racing", "enableFarmingFans")

    /** Whether to ignore the warning that appears when racing three times in a row. */
    val ignoreConsecutiveRaceWarning = SettingsHelper.getBooleanSetting("racing", "ignoreConsecutiveRaceWarning")

    /** Whether to bypass the low-energy racing block in Trackblazer. */
    val ignoreLowEnergyRacingBlock = SettingsHelper.getBooleanSetting("racing", "ignoreLowEnergyRacingBlock")

    /** The number of days to wait between running extra races. */
    private val daysToRunExtraRaces: Int = SettingsHelper.getIntSetting("racing", "daysToRunExtraRaces")

    /** Whether to disable race retries. */
    internal val disableRaceRetries: Boolean = SettingsHelper.getBooleanSetting("racing", "disableRaceRetries")

    /** Whether to enable a free race retry if available. */
    internal val enableFreeRaceRetry: Boolean = SettingsHelper.getBooleanSetting("racing", "enableFreeRaceRetry")

    /** Whether to automatically complete the career on a failure. */
    internal val enableCompleteCareerOnFailure: Boolean = SettingsHelper.getBooleanSetting("racing", "enableCompleteCareerOnFailure")

    /** Whether to force the bot to race extra races regardless of other conditions. */
    val enableForceRacing = SettingsHelper.getBooleanSetting("racing", "enableForceRacing")

    /** Whether to enable the custom racing plan. */
    private val enableRacingPlan = SettingsHelper.getBooleanSetting("racing", "enableRacingPlan")

    /** The number of days to look ahead for better racing opportunities. */
    private val lookAheadDays = SettingsHelper.getIntSetting("racing", "lookAheadDays")

    /** The frequency (in turns) to perform a smart racing evaluation. */
    private val smartRacingCheckInterval = SettingsHelper.getIntSetting("racing", "smartRacingCheckInterval")

    /** The minimum fan count required for a race to be considered. */
    private val minFansThreshold = SettingsHelper.getIntSetting("racing", "minFansThreshold")

    /** The user-preferred track surface for races. */
    private val preferredTrackSurfaceString = SettingsHelper.getStringSetting("racing", "preferredTerrain")

    /** The user-preferred race grades. */
    private val preferredGradesString = SettingsHelper.getStringSetting("racing", "preferredGrades")

    /** The user-preferred track distances. */
    private val preferredTrackDistanceString = SettingsHelper.getStringSetting("racing", "preferredDistances")

    /** The JSON string representing the user's custom racing plan. */
    private val racingPlanJson = SettingsHelper.getStringSetting("racing", "racingPlan")

    /** The minimum quality threshold for a race to be included in the plan. */
    private val minimumQualityThreshold = SettingsHelper.getDoubleSetting("racing", "minimumQualityThreshold")

    /** The factor used to decay race scores over time. */
    private val timeDecayFactor = SettingsHelper.getDoubleSetting("racing", "timeDecayFactor")

    /** The minimum improvement required to prioritize a later race. */
    private val improvementThreshold = SettingsHelper.getDoubleSetting("racing", "improvementThreshold")

    /** Whether to strictly follow the racing plan and ignore non-planned races. */
    private val enableMandatoryRacingPlan = SettingsHelper.getBooleanSetting("racing", "enableMandatoryRacingPlan")

    /** Whether to use the in-game race agenda feature. */
    val enableUserInGameRaceAgenda = SettingsHelper.getBooleanSetting("racing", "enableUserInGameRaceAgenda")

    /** Whether to limit extra races to only those in the in-game agenda. */
    private val limitRacesToInGameAgenda = SettingsHelper.getBooleanSetting("racing", "limitRacesToInGameAgenda", true)

    /** The specific in-game race agenda selected by the user. */
    private val selectedUserAgenda = SettingsHelper.getStringSetting("racing", "selectedUserAgenda")

    /** Optional custom agenda title that overrides the selected agenda name for OCR matching. */
    private val customAgendaTitle = SettingsHelper.getStringSetting("racing", "customAgendaTitle")

    /** The effective agenda name used for OCR matching — custom title if provided, otherwise the selected agenda. */
    private val effectiveAgendaName = if (customAgendaTitle.isNotBlank()) customAgendaTitle else selectedUserAgenda

    /** Whether to skip Summer training to do races from the in-game agenda. */
    val skipSummerTrainingForAgenda = SettingsHelper.getBooleanSetting("racing", "skipSummerTrainingForAgenda")

    /** The current number of retries available for the run. */
    internal var raceRetries = campaign.getMaxRaceRetries()

    /** Whether to check for the consecutive race warning. */
    internal var raceRepeatWarningCheck = false

    /** Whether a racing-related popup has been encountered. */
    var encounteredRacingPopup = false

    /** Whether this is the first time the bot is racing in the current career. */
    var firstTimeRacing = true

    /** Indicates that a fan requirement has been detected on the main screen. */
    var hasFanRequirement = false

    /** Indicates that a trophy requirement has been detected on the main screen. */
    var hasTrophyRequirement = false

    /** Indicates that a Pre-OP or above requirement has been detected. */
    var hasPreOpOrAboveRequirement = false

    /** Indicates that a G3 or above requirement has been detected. */
    var hasG3OrAboveRequirement = false

    /** Indicates that an insufficient goal race result pts requirement has been detected. */
    var hasInsufficientGoalRacePtsRequirement = false

    /** Tracks the specific day to race based on opportunity cost analysis. */
    private var nextSmartRaceDay: Int? = null

    /** Tracks if the user's race agenda has been loaded during this career. */
    private var hasLoadedUserRaceAgenda = false

    /** Tracks the grade of the last race that was selected. */
    var lastRaceGrade: RaceGrade? = null
    var lastRaceFans: Int = 0

    /** Tracks the distance of the last race that was selected. */
    var lastRaceDistance: TrackDistance? = null

    /** Tracks if the last race selected was a Rival Race. */
    var lastRaceIsRival: Boolean = false

    /** Tracks if the current race has already been retried. */
    var bRetriedCurrentRace: Boolean = false

    /** Whether to stop the bot when a mandatory race is detected. */
    internal val enableStopOnMandatoryRace: Boolean = SettingsHelper.getBooleanSetting("racing", "enableStopOnMandatoryRaces")

    /** Whether a mandatory race has been detected during the check. */
    internal var detectedMandatoryRaceCheck = false

    /** The race strategy override for the Junior Year. */
    internal val juniorYearRaceStrategy = SettingsHelper.getStringSetting("racing", "juniorYearRaceStrategy")

    /** The user's originally selected race strategy. */
    internal val userSelectedOriginalStrategy = SettingsHelper.getStringSetting("racing", "originalRaceStrategy")

    /** Whether per-distance strategy mode is enabled. */
    private val enablePerDistanceStrategy = SettingsHelper.getBooleanSetting("racing", "enablePerDistanceStrategy")

    /** Per-distance Junior Year strategies, keyed by distance name (Short, Mile, Medium, Long). */
    private val juniorYearPerDistanceStrategies: Map<String, String> = loadPerDistanceStrategies("juniorYearPerDistanceStrategies")

    /** Per-distance Original strategies, keyed by distance name (Short, Mile, Medium, Long). */
    private val originalPerDistanceStrategies: Map<String, String> = loadPerDistanceStrategies("originalPerDistanceStrategies")

    /** Whether the Junior Year strategy override has been applied. */
    private var bHasSetStrategyJunior: Boolean = false

    /** Whether the original strategy has been restored after Junior Year. */
    private var bHasSetStrategyOriginal: Boolean = false

    /** A control flag used between the dialog handler and [selectRaceStrategy]. Only set when a strategy is selected in the dialog handler and unset at the beginning of [selectRaceStrategy]. */
    var bHasSetTemporaryRunningStyle: Boolean = false

    /** The complete race database loaded at initialization. */
    private val raceData: Map<String, RaceData> = loadRaceData()

    /** The user's defined planned races loaded at initialization. */
    private val userPlannedRaces: List<PlannedRace> = loadUserPlannedRaces()

    /** The maximum number of retries allowed per race, provided by the campaign. */
    private val maxRetriesPerRace: Int = campaign.getMaxRetriesPerRace()

    /** The list of race grades that are eligible for retries, provided by the campaign. */
    internal val retryEligibleGrades: List<RaceGrade> = campaign.getRetryEligibleGrades()

    /**
     * Stores comprehensive information about a specific race.
     *
     * @property name The internal name of the race.
     * @property grade The grade of the race (e.g., G1, G2, G3).
     * @property fans The number of fans gained by winning the race.
     * @property nameFormatted The user-friendly formatted name of the race.
     * @property trackSurface The track surface (e.g., Turf, Dirt).
     * @property trackDistance The distance category of the race (e.g., Sprint, Mile).
     * @property turnNumber The specific turn number the race occurs on.
     * @property isRival Indicates if the race is a Rival Race.
     */
    data class RaceData(
        val name: String,
        val grade: RaceGrade,
        val fans: Int,
        val nameFormatted: String,
        val trackSurface: TrackSurface,
        val trackDistance: TrackDistance,
        val turnNumber: Int,
        var isRival: Boolean = false,
    ) {
        /**
         * Secondary constructor for initializing [RaceData] from raw database strings.
         *
         * @param name The internal name of the race.
         * @param grade The string representation of the race grade.
         * @param fans The number of fans gained.
         * @param nameFormatted The user-friendly formatted name.
         * @param trackSurface The string representation of the track surface.
         * @param trackDistance The string representation of the track distance.
         * @param turnNumber The specific turn number.
         */
        constructor(
            name: String,
            grade: String,
            fans: Int,
            nameFormatted: String,
            trackSurface: String,
            trackDistance: String,
            turnNumber: Int,
        ) : this(
            name,
            // Scraper source uses "Pre-Op" but we need "PRE_OP" for our enum.
            RaceGrade.fromName(grade.lowercase().replace("pre-op", "pre_op"))!!,
            fans,
            nameFormatted,
            TrackSurface.fromName(trackSurface)!!,
            // Scraper source uses "Short" instead of "Sprint" which is expected by our enum.
            TrackDistance.fromName(trackDistance.lowercase().replace("short", "sprint"))!!,
            turnNumber,
        )
    }

    /**
     * Represents a race that has been evaluated and assigned a score for smart racing.
     *
     * @property raceData The data for evaluated race.
     * @property score The final calculated score for the race.
     * @property fansScore The score component based on fan gains.
     * @property gradeScore The score component based on race grade.
     * @property aptitudeBonus The bonus applied based on the trainee's aptitudes.
     */
    data class ScoredRace(val raceData: RaceData, val score: Double, val fansScore: Double, val gradeScore: Double, val aptitudeBonus: Double)

    /**
     * Stores information about a race that the user has planned.
     *
     * @property raceName The name of the planned race.
     * @property date The date string assigned to the planned race.
     * @property priority The priority level of the planned race.
     * @property turnNumber The turn number the planned race occurs on.
     */
    data class PlannedRace(val raceName: String, val date: String, val priority: Int, val turnNumber: Int)

    companion object {
        private val TAG: String = "[${MainActivity.loggerTag}]Racing"

        /** The name of the races table in the database. */
        private const val TABLE_RACES = "races"

        /** The name of the race name column. */
        private const val RACES_COLUMN_NAME = "name"

        /** The name of the race grade column. */
        private const val RACES_COLUMN_GRADE = "grade"

        /** The name of the fan count column. */
        private const val RACES_COLUMN_FANS = "fans"

        /** The name of the turn number column. */
        private const val RACES_COLUMN_TURN_NUMBER = "turnNumber"

        /** The name of the formatted race name column. */
        private const val RACES_COLUMN_NAME_FORMATTED = "nameFormatted"

        /** The name of the track surface column. */
        private const val RACES_COLUMN_TRACK_SURFACE = "terrain"

        /** The name of the track distance column. */
        private const val RACES_COLUMN_TRACK_DISTANCE = "distanceType"

        /** The threshold for fuzzy string matching (0.0 to 1.0). */
        private const val SIMILARITY_THRESHOLD = 0.7
    }

    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // Debug Tests

    /** Handles the test to detect the currently displayed races on the Race List screen. */
    fun startRaceListDetectionTest() {
        MessageLog.i(TAG, "\n[TEST] Now beginning detection test on the Race List screen for the currently displayed races.")
        if (!ButtonRaceListFullStats.check(game.imageUtils)) {
            MessageLog.i(TAG, "[TEST] Bot is not on the Race List screen. Ending the test.")
            return
        }

        // Detect the current date first.
        campaign.updateDate(isOnMainScreen = false)

        // Check for all double star predictions.
        val doublePredictionLocations = IconRaceListPredictionDoubleStar.findAll(game.imageUtils)
        MessageLog.i(TAG, "[TEST] Found ${doublePredictionLocations.size} races with double predictions.")

        doublePredictionLocations.forEachIndexed { index, location ->
            val raceName = game.imageUtils.extractRaceName(location)
            MessageLog.i(TAG, "[TEST] Race #${index + 1} - Detected name: \"$raceName\".")

            // Query database for race details (may return multiple matches with different fan counts).
            val raceDataList = lookupRaceInDatabase(campaign.date.day, raceName)

            if (raceDataList.isNotEmpty()) {
                MessageLog.i(TAG, "[TEST] Race #${index + 1} - Found ${raceDataList.size} match(es):")
                raceDataList.forEach { raceData ->
                    MessageLog.i(TAG, "[TEST]     Name: ${raceData.name}")
                    MessageLog.i(TAG, "[TEST]     Grade: ${raceData.grade}")
                    MessageLog.i(TAG, "[TEST]     Fans: ${raceData.fans}")
                    MessageLog.i(TAG, "[TEST]     Formatted: ${raceData.nameFormatted}")
                }
            } else {
                MessageLog.i(TAG, "[TEST] Race #${index + 1} - No match found for turn ${campaign.date.day}")
            }
        }
    }

    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////

    /** Resets all racing requirement flags to their default state. */
    fun clearRacingRequirementFlags() {
        hasFanRequirement = false
        hasTrophyRequirement = false
        hasPreOpOrAboveRequirement = false
        hasG3OrAboveRequirement = false
        hasInsufficientGoalRacePtsRequirement = false
    }

    /**
     * Retrieves the user's planned races from saved settings.
     *
     * @return A list of [PlannedRace] entries defined by the user, or an empty list if none exist.
     */
    private fun loadUserPlannedRaces(): List<PlannedRace> {
        if (!enableRacingPlan) {
            MessageLog.i(TAG, "[RACE] Racing plan is disabled, returning empty planned races list.")
            return emptyList()
        }

        return try {
            if (racingPlanJson.isEmpty() || racingPlanJson == "[]") {
                MessageLog.i(TAG, "[RACE] User-selected racing plan is empty, returning empty list.")
                return emptyList()
            }

            val jsonArray = JSONArray(racingPlanJson)
            val plannedRaces = mutableListOf<PlannedRace>()

            for (i in 0 until jsonArray.length()) {
                val raceObj = jsonArray.getJSONObject(i)
                val plannedRace =
                    PlannedRace(
                        raceName = raceObj.getString("raceName"),
                        date = raceObj.getString("date"),
                        priority = raceObj.optInt("priority", 0),
                        turnNumber = raceObj.getInt("turnNumber"),
                    )
                plannedRaces.add(plannedRace)
            }

            MessageLog.i(TAG, "[RACE] Successfully loaded ${plannedRaces.size} user-selected planned races from settings.")
            plannedRaces
        } catch (e: Exception) {
            MessageLog.e(TAG, "[ERROR] loadUserPlannedRaces:: Failed to parse user-selected racing plan JSON: ${e.message}. Returning empty list.")
            emptyList()
        }
    }

    /**
     * Loads the complete race database from saved settings, including all race metadata such as names, grades, distances, and turn numbers.
     *
     * @return A map of race names to their [RaceData] or an empty map if racing plan data is missing or invalid.
     */
    private fun loadRaceData(): Map<String, RaceData> {
        return try {
            val racingPlanDataJson = SettingsHelper.getStringSetting("racing", "racingPlanData")
            if (racingPlanDataJson.isEmpty()) {
                MessageLog.i(TAG, "[RACE] Racing plan data is empty, returning empty map.")
                return emptyMap()
            }

            val jsonObject = JSONObject(racingPlanDataJson)
            val raceDataMap = mutableMapOf<String, RaceData>()

            val keys = jsonObject.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                val raceObj = jsonObject.getJSONObject(key)

                val raceData =
                    RaceData(
                        name = raceObj.getString(RACES_COLUMN_NAME),
                        grade = raceObj.getString(RACES_COLUMN_GRADE),
                        trackSurface = raceObj.getString(RACES_COLUMN_TRACK_SURFACE),
                        trackDistance = raceObj.getString(RACES_COLUMN_TRACK_DISTANCE),
                        fans = raceObj.getInt(RACES_COLUMN_FANS),
                        turnNumber = raceObj.getInt(RACES_COLUMN_TURN_NUMBER),
                        nameFormatted = raceObj.getString(RACES_COLUMN_NAME_FORMATTED),
                    )

                raceDataMap[raceData.name] = raceData
            }

            MessageLog.i(TAG, "[RACE] Successfully loaded ${raceDataMap.size} race entries from racing plan data.")
            raceDataMap
        } catch (e: Exception) {
            MessageLog.e(TAG, "[ERROR] loadRaceData:: Failed to parse racing plan data JSON: ${e.message}. Returning empty map.")
            emptyMap()
        }
    }

    /**
     * Loads the user's selected in-game race agenda.
     *
     * This function navigates through the agenda UI, finds the matching agenda, and loads it. If the agenda is not immediately visible, it will scroll the list to find it.
     */
    fun loadUserRaceAgenda() {
        // Only load the agenda once per career.
        if (!enableUserInGameRaceAgenda || hasLoadedUserRaceAgenda || campaign.date.bIsFinaleSeason) {
            return
        } else if (LabelRaceCriteriaMaiden.check(game.imageUtils)) {
            MessageLog.i(TAG, "[RACE] A maiden race needs to be won first before applying the user's race agenda.")
            return
        }

        // Navigate to the race selection screen.
        // We only proceed if the button is enabled AND we successfully click it.
        // Everything else returns from this function.
        when (ButtonRaces.checkDisabled(game.imageUtils)) {
            true -> {
                MessageLog.i(TAG, "[RACE] Races button is disabled. Skipping loading the race agenda.")
                return
            }

            false -> {
                if (ButtonRaces.click(game.imageUtils)) {
                    MessageLog.i(TAG, "[RACE] Clicked the Races button. Proceeding to load the race agenda...")
                } else {
                    MessageLog.w(TAG, "[WARN] loadUserRaceAgenda:: Detected the Races button but failed to click it. Skipping loading the race agenda.")
                    return
                }
            }

            null -> {
                MessageLog.w(TAG, "[WARN] loadUserRaceAgenda:: Failed to detect the Races button. Skipping loading the race agenda.")
                return
            }
        }

        game.waitForLoading()

        // Wait for any dialog (e.g. consecutive race warning) to appear before checking.
        game.wait(game.dialogWaitDelay)

        // We are forced to race, so we need to ignore this warning dialog.
        campaign.handleDialogs(args = mapOf("overrideIgnoreConsecutiveRaceWarning" to true))

        game.waitForLoading()

        MessageLog.i(TAG, "[RACE] Loading user's in-game race agenda: $effectiveAgendaName")

        // It is assumed that the user is already at the screen with the list of selectable races.
        game.wait(game.dialogWaitDelay)

        // Taps on the Agenda button.
        if (!ButtonAgenda.click(game.imageUtils)) {
            MessageLog.w(TAG, "[WARN] loadUserRaceAgenda:: Could not find the Agenda button. Backing out and skipping agenda loading.")
            ButtonBack.click(game.imageUtils)
            game.waitForLoading()
            return
        }
        game.wait(game.dialogWaitDelay)

        // Taps on the My Agenda button.
        if (!ButtonMyAgendas.click(game.imageUtils)) {
            MessageLog.w(TAG, "[WARN] loadUserRaceAgenda:: Could not find the My Agenda button. Closing and backing out.")
            ButtonClose.click(game.imageUtils)
            game.wait(0.5)
            ButtonBack.click(game.imageUtils)
            game.waitForLoading()
            return
        }
        game.wait(game.dialogWaitDelay)

        // Check if an agenda is already loaded.
        // If so, then the user must have loaded this earlier in the career so no need to select it again.
        if (!IconRaceAgendaEmpty.check(game.imageUtils)) {
            MessageLog.i(TAG, "[RACE] A race agenda is already loaded. Skipping agenda selection.")

            // Mark as loaded so we don't try again this run and close the popup.
            hasLoadedUserRaceAgenda = true
            ButtonClose.click(game.imageUtils)
            game.wait(0.5)
            ButtonClose.click(game.imageUtils)
            game.wait(0.5)

            // Now back out of the race selection screen.
            ButtonBack.click(game.imageUtils)
            game.wait(0.5)
            return
        }

        var foundAgenda = false
        var swipeCount = 0
        val maxSwipes = 10

        while (!foundAgenda && swipeCount < maxSwipes) {
            val sourceBitmap = game.imageUtils.getSourceBitmap()

            // Find all the Load List buttons on the current screen.
            val loadListButtonLocations: ArrayList<Point> = ButtonRaceAgendaLoadList.findAll(game.imageUtils, sourceBitmap = sourceBitmap)
            if (loadListButtonLocations.isEmpty()) {
                MessageLog.w(TAG, "[WARN] loadUserRaceAgenda:: No Load List buttons found on screen.")
                break
            }

            MessageLog.i(TAG, "[RACE] Found ${loadListButtonLocations.size} Load List button(s) on screen.")

            // Get the mappings of button locations to agenda header texts via OCR.
            val agendaMappings = game.imageUtils.determineAgendaHeaderMappings(sourceBitmap, loadListButtonLocations)
            agendaMappings.forEach { (location, text) ->
                MessageLog.i(TAG, "[RACE] Detected agenda at (${location.x}, ${location.y}): \"$text\"")
            }

            // Search for the target agenda.
            for ((buttonLocation, agendaText) in agendaMappings) {
                if (agendaText == effectiveAgendaName) {
                    MessageLog.i(TAG, "[RACE] ✓ Found $effectiveAgendaName. Tapping the Load List button...")

                    // Clicking this button triggers connection to server.
                    // Or it could result in three other states:
                    // 1. The overwrite dialog appears.
                    // 2. The scheduled_race dialog appears.
                    // 3. The my_agendas dialog closes automatically and the scheduled_races dialog remains on screen.
                    game.gestureUtils.tap(buttonLocation.x, buttonLocation.y, ButtonRaceAgendaLoadList.template.path)

                    // Timeout after 5 seconds. Shouldn't ever take near that long.
                    val timeoutMs = 5000
                    val startTime: Long = System.currentTimeMillis()
                    while (System.currentTimeMillis() - startTime < timeoutMs) {
                        val result: DialogHandlerResult =
                            campaign.handleDialogs(
                                args =
                                    mapOf(
                                        "bShouldDefer" to true,
                                        "bShouldWait" to true,
                                        "bShouldWaitForLoading" to true,
                                    ),
                            )

                        if (result is DialogHandlerResult.NoDialogDetected) {
                            continue
                        }

                        if (result !is DialogHandlerResult.Deferred) {
                            val name =
                                when (result) {
                                    is DialogHandlerResult.Handled -> result.dialog.name
                                    is DialogHandlerResult.Unhandled -> result.dialog.name
                                    else -> "Unknown"
                                }
                            throw IllegalStateException("loadUserRaceAgenda: Received non-deferred dialog result ($name). Expected deferred.")
                        }

                        when (result.dialog.name) {
                            "overwrite" -> {
                                result.dialog.ok(game.imageUtils)
                            }

                            // Pops up when we try to load agenda with races that are in the past.
                            "scheduled_race" -> {
                                result.dialog.close(game.imageUtils)
                            }

                            // We've closed all the extra dialogs after loading agenda so break from the loop.
                            "scheduled_races" -> {
                                break
                            }

                            // We might detect the dialog too quick and find this one as it is in the process of closing. Ignore this and continue the loop.
                            "my_agendas" -> {}

                            // No dialog detected. This can happen if a dialog is closing. Not a problem, just continue with loop and timeout when the time comes.
                            null -> {}

                            // Fall back to the base dialog handler if we get a dialog that we weren't expecting.
                            else -> {
                                MessageLog.e(TAG, "[ERROR] loadUserRaceAgenda:: Unknown dialog detected: ${result.dialog.name}. Falling back to base dialog handler.")
                                campaign.handleDialogs()
                            }
                        }
                    }

                    foundAgenda = true
                    break
                }

                // Check if we've reached "Agenda 8" (end of list).
                if (agendaText == "Agenda 8") {
                    MessageLog.w(TAG, "[WARN] loadUserRaceAgenda:: Reached Agenda 8 but target $effectiveAgendaName not found.")
                    break
                }
            }

            if (!foundAgenda && swipeCount < maxSwipes - 1) {
                // Swipe up to reveal more buttons.
                // Use the Close button location as a reference point for swiping.
                val closeButtonLocation = ButtonClose.find(game.imageUtils).first
                if (closeButtonLocation != null) {
                    val swipeX = closeButtonLocation.x.toFloat()
                    val swipeY = closeButtonLocation.y.toFloat()
                    MessageLog.i(TAG, "[RACE] Swiping up to reveal more agendas (attempt ${swipeCount + 1}/$maxSwipes)...")
                    game.gestureUtils.swipe(swipeX, swipeY - 300f, swipeX, swipeY - 400f)
                    game.wait(0.5)
                } else {
                    // If we can't find the close button for reference, try using the first Load List button.
                    if (loadListButtonLocations.isNotEmpty()) {
                        val swipeX = loadListButtonLocations[0].x.toFloat()
                        val swipeY = loadListButtonLocations[0].y.toFloat()
                        MessageLog.i(TAG, "[RACE] Swiping up using Load List button reference (attempt ${swipeCount + 1}/$maxSwipes)...")
                        game.gestureUtils.swipe(swipeX, swipeY - 300f, swipeX, swipeY - 400f)
                        game.wait(0.5)
                    }
                }
                swipeCount++
            } else if (!foundAgenda) {
                swipeCount++
            }
        }

        if (!foundAgenda) {
            MessageLog.w(TAG, "[WARN] loadUserRaceAgenda:: Could not find $effectiveAgendaName after $swipeCount swipe(s). Closing agenda selection.")
        }

        // Mark as loaded so we don't try again this run and close the popup.
        hasLoadedUserRaceAgenda = true
        ButtonClose.click(game.imageUtils)
        game.waitForLoading()
        ButtonClose.click(game.imageUtils)
        game.waitForLoading()
        game.wait(0.25)

        // Now back out of the race selection screen.
        ButtonBack.click(game.imageUtils)
        game.waitForLoading()
    }

    /**
     * Finds a race location from a list of prediction locations by matching the race name.
     *
     * @param predictionLocations List of double-prediction locations to search through.
     * @param targetRaceName The race name to find.
     * @param logMatch If true, log when a match is found.
     * @return The Point location if found, null otherwise.
     */
    private fun findRaceLocationByName(predictionLocations: ArrayList<Point>, targetRaceName: String, logMatch: Boolean = false): Point? {
        return predictionLocations.find { location ->
            val raceName = game.imageUtils.extractRaceName(location)
            val raceDataList = lookupRaceInDatabase(campaign.date.day, raceName)
            val match = raceDataList.any { it.name == targetRaceName }
            if (match && logMatch) {
                MessageLog.i(TAG, "[RACE] ✓ Found target race at location (${location.x}, ${location.y}).")
            }
            match
        }
    }

    /**
     * Scrolls the list of races up or down and returns the updated list of prediction locations.
     *
     * @param scrollDown If true, scroll down; if false, scroll up.
     * @return The updated list of double-prediction locations after scrolling, or null if scroll failed.
     */
    private fun scrollRaceListAndRedetect(scrollDown: Boolean = true): ArrayList<Point>? {
        val confirmButtonLocation = ButtonRace.find(game.imageUtils).first
        if (confirmButtonLocation == null) {
            MessageLog.i(TAG, "[RACE] Could not find \"Race\" button for scroll reference.")
            return null
        }

        val startX = confirmButtonLocation.x.toFloat()
        val startY = (confirmButtonLocation.y - 300).toFloat()
        val endY = (confirmButtonLocation.y - 400).toFloat()

        if (scrollDown) {
            game.gestureUtils.swipe(startX, startY, startX, endY)
        } else {
            game.gestureUtils.swipe(startX, endY, startX, startY)
        }
        game.wait(2.0)

        return IconRaceListPredictionDoubleStar.findAll(game.imageUtils)
    }

    /**
     * Checks if the racer's aptitudes match the race requirements (both terrain and distance must be B or greater).
     *
     * @param raceData The race data to check aptitudes against.
     * @return True if both track surface and distance aptitudes are B or greater; false otherwise.
     */
    private fun checkRaceAptitudeMatch(raceData: RaceData): Boolean {
        val trackSurfaceAptitude: Aptitude = campaign.trainee.checkTrackSurfaceAptitude(raceData.trackSurface)
        val trackDistanceAptitude: Aptitude = campaign.trainee.checkTrackDistanceAptitude(raceData.trackDistance)

        val trackSurfaceMatch: Boolean = trackSurfaceAptitude >= Aptitude.B
        val trackDistanceMatch: Boolean = trackDistanceAptitude >= Aptitude.B

        return trackSurfaceMatch && trackDistanceMatch
    }

    /**
     * Finds the mandatory planned race for the current turn number if mandatory mode is enabled.
     *
     * @return A Pair containing the PlannedRace and RaceData for the mandatory extra race if found, null otherwise.
     */
    private fun findMandatoryExtraRaceForCurrentTurn(): Pair<PlannedRace?, RaceData?> {
        if (!enableRacingPlan || !enableMandatoryRacingPlan) {
            Log.d(TAG, "[DEBUG] findMandatoryExtraRaceForCurrentTurn:: Mandatory racing plan is not enabled so skipping the search for a mandatory extra race.")
            return Pair(null, null)
        }

        val currentTurnNumber = campaign.date.day

        // Find planned race matching current turn number.
        val matchingPlannedRace = userPlannedRaces.find { it.turnNumber == currentTurnNumber }
        if (matchingPlannedRace == null) {
            Log.d(TAG, "[DEBUG] findMandatoryExtraRaceForCurrentTurn:: No mandatory extra race found for current turn number $currentTurnNumber.")
            return Pair(null, null)
        }

        // Look up race data from raceData map.
        val raceData = this.raceData[matchingPlannedRace.raceName]
        if (raceData == null) {
            MessageLog.e(TAG, "[ERROR] findMandatoryExtraRaceForCurrentTurn:: Planned race \"${matchingPlannedRace.raceName}\" not found in race data.")
            return Pair(null, null)
        }

        return Pair(matchingPlannedRace, raceData)
    }

    /**
     * Checks if there are fan or trophy requirements that need to be satisfied.
     *
     * @param sourceBitmap Optional source bitmap to use for detection.
     */
    fun checkRacingRequirements(sourceBitmap: Bitmap? = null) {
        // Skip racing requirements checks during Summer unless skipSummerTrainingForAgenda is enabled.
        if (campaign.date.isSummer() && !(skipSummerTrainingForAgenda && enableUserInGameRaceAgenda)) {
            if (hasFanRequirement || hasTrophyRequirement) {
                MessageLog.i(TAG, "[RACE] It is currently Summer. Skipping racing requirements checks and clearing flags.")
                clearRacingRequirementFlags()
            }
            return
        }

        // Check for fan requirement on the main screen.
        val sourceBitmapToUse = sourceBitmap ?: game.imageUtils.getSourceBitmap()
        val needsFanRequirement = LabelRaceCriteriaFans.check(game.imageUtils, sourceBitmap = sourceBitmapToUse, confidence = 0.9)
        if (needsFanRequirement) {
            hasFanRequirement = true
            MessageLog.i(TAG, "[RACE] Fan requirement criteria detected on main screen. Forcing racing to fulfill requirement.")
        } else {
            // Clear the flag if requirement is no longer present.
            if (hasFanRequirement) {
                MessageLog.i(TAG, "[RACE] Fan requirement no longer detected on main screen. Clearing flag.")
                hasFanRequirement = false
            }

            // Check for trophy requirement on the main screen.
            val needsTrophyRequirement = LabelRaceCriteriaTrophies.check(game.imageUtils, sourceBitmap = sourceBitmapToUse, confidence = 0.9)
            if (needsTrophyRequirement) {
                hasTrophyRequirement = true

                // Check for Pre-OP or above criteria.
                val needsPreOpOrAbove = LabelRaceCriteriaPreOpOrAbove.check(game.imageUtils, sourceBitmap = sourceBitmapToUse, confidence = 0.9)
                if (needsPreOpOrAbove) {
                    hasPreOpOrAboveRequirement = true
                    MessageLog.i(TAG, "[RACE] Trophy requirement with Pre-OP or above criteria detected. Any race can be run to fulfill the requirement.")
                } else {
                    hasPreOpOrAboveRequirement = false
                }

                // Check for G3 or above criteria.
                val needsG3OrAbove = LabelRaceCriteriaG3OrAbove.check(game.imageUtils, sourceBitmap = sourceBitmapToUse, confidence = 0.9)
                if (needsG3OrAbove) {
                    hasG3OrAboveRequirement = true
                    MessageLog.i(TAG, "[RACE] Trophy requirement with G3 or above criteria detected. Any race can be run to fulfill the requirement.")
                } else {
                    hasG3OrAboveRequirement = false
                }

                if (!hasPreOpOrAboveRequirement && !hasG3OrAboveRequirement) {
                    MessageLog.i(TAG, "[RACE] Trophy requirement criteria detected on main screen. Forcing racing to fulfill requirement (G1 races only).")
                }
            } else {
                // Clear the flags if requirement is no longer present.
                if (hasTrophyRequirement) {
                    MessageLog.i(TAG, "[RACE] Trophy requirement no longer detected on main screen. Clearing flags.")
                    // Clear trophy and criteria flags together since they are related.
                    hasTrophyRequirement = false
                    hasPreOpOrAboveRequirement = false
                    hasG3OrAboveRequirement = false
                }
            }
        }
    }

    /**
     * Determines if the extra racing process should be started now or later.
     *
     * @return True if the current date is okay to start the extra racing process and false otherwise.
     */
    fun checkEligibilityToStartExtraRacingProcess(): Boolean {
        MessageLog.i(TAG, "\n[RACE] Now determining eligibility to start the extra racing process...")
        val turnsRemaining = game.imageUtils.determineTurnsRemainingBeforeNextGoal()
        MessageLog.i(TAG, "[RACE] Current remaining number of days before the next mandatory race: $turnsRemaining.")

        // Don't bother looking for races on Junior Year Early July (Turn 13) since they only start showing up on Turn 14.
        if (campaign.date.day == 13) {
            MessageLog.i(TAG, "[RACE] Junior Year Early July (Turn 13) detected. No races available until Turn 14. Skipping extra race check.")
            return false
        }

        // If the user wants to limit extra races to ONLY those scheduled in their in-game racing agenda.
        if (enableUserInGameRaceAgenda && limitRacesToInGameAgenda) {
            MessageLog.i(TAG, "[RACE] Skipping extra race check due to 'Limit Extra Races to Agenda' setting in favor of those scheduled by the user's in-game racing agenda.")
            return false
        }

        // If the setting to force racing extra races is enabled or we have a specific requirement, always return true.
        if (enableForceRacing || hasFanRequirement || hasTrophyRequirement || hasInsufficientGoalRacePtsRequirement) {
            Log.d(TAG, "[DEBUG] checkEligibilityToStartExtraRacingProcess:: Force racing or requirement is active so eligibility will be true.")
            return true
        }

        // For scenarios that race as often as possible, bypass most checks.
        if (campaign.shouldBypassSmartRacing()) {
            MessageLog.i(TAG, "[RACE] Bypassing smart racing and interval checks.")

            // Still check for finals and summer as they are hard restrictions.
            if (campaign.checkFinals()) {
                MessageLog.i(TAG, "[RACE] It is UMA Finals right now so there will be no extra races. Stopping extra race check.")
                return false
            } else if (campaign.date.isSummer() && !(skipSummerTrainingForAgenda && enableUserInGameRaceAgenda)) {
                MessageLog.i(TAG, "[RACE] It is currently Summer right now. Stopping extra race check.")
                return false
            } else if (ButtonRaces.checkDisabled(game.imageUtils) == true) {
                MessageLog.i(TAG, "[RACE] Extra Races button is currently locked. Stopping extra race check.")
                return false
            }

            return !raceRepeatWarningCheck
        }

        // If fan or trophy requirement is detected, bypass smart racing logic to force racing.
        // Both requirements are independent of racing plan and farming fans settings.
        if (hasFanRequirement) {
            MessageLog.i(TAG, "[RACE] Fan requirement detected. Bypassing smart racing logic to fulfill requirement.")
            return !raceRepeatWarningCheck
        } else if (hasTrophyRequirement) {
            if (hasPreOpOrAboveRequirement || hasG3OrAboveRequirement) {
                if (hasPreOpOrAboveRequirement) {
                    MessageLog.i(TAG, "[RACE] Trophy requirement with Pre-OP or above criteria detected. Proceeding to racing screen.")
                } else {
                    MessageLog.i(TAG, "[RACE] Trophy requirement with G3 or above criteria detected. Proceeding to racing screen.")
                }
                return !raceRepeatWarningCheck
            }

            // Check if G1 races exist at current turn before proceeding.
            // If no G1 races are available, it will still allow regular racing if it's a regular race day or smart racing day.
            if (!hasG1RacesAtTurn(campaign.date.day)) {
                // Skip interval check if Racing Plan is enabled.
                val isRegularRacingDay = enableFarmingFans && !enableRacingPlan && (turnsRemaining % daysToRunExtraRaces == 0)
                val isSmartRacingDay = enableRacingPlan && enableFarmingFans && nextSmartRaceDay == turnsRemaining

                if (isRegularRacingDay || isSmartRacingDay) {
                    MessageLog.i(TAG, "[RACE] Trophy requirement detected but no G1 races at turn ${campaign.date.day}. Allowing regular racing on eligible day.")
                } else {
                    MessageLog.i(TAG, "[RACE] Trophy requirement detected but no G1 races available at turn ${campaign.date.day} and not a regular/smart racing day. Skipping racing.")
                    return false
                }
            } else {
                MessageLog.i(TAG, "[RACE] Trophy requirement detected. G1 races available at turn ${campaign.date.day}. Proceeding to racing screen.")
            }

            return !raceRepeatWarningCheck
        }

        // Check for mandatory racing plan mode (before opportunity cost analysis and while still on the main screen).
        if (enableRacingPlan && enableMandatoryRacingPlan) {
            val currentTurnNumber = campaign.date.day

            // Find planned race matching current turn number.
            val matchingPlannedRace = userPlannedRaces.find { it.turnNumber == currentTurnNumber }

            if (matchingPlannedRace != null) {
                MessageLog.i(TAG, "[RACE] Found planned race \"${matchingPlannedRace.raceName}\" for turn $currentTurnNumber and mandatory mode for extra races is enabled.")
                return !raceRepeatWarningCheck
            } else {
                MessageLog.i(TAG, "[RACE] No planned race matches current turn $currentTurnNumber and mandatory mode for extra races is enabled. Continuing with normal eligibility checks.")
            }
        } else if (enableRacingPlan && enableFarmingFans) {
            // Log eligible planned races if any exist (informational).
            if (campaign.date.year != DateYear.JUNIOR && userPlannedRaces.isNotEmpty()) {
                val currentTurnNumber = campaign.date.day

                // Check each planned race for eligibility within the look-ahead window.
                val eligiblePlannedRaces =
                    userPlannedRaces.filter { plannedRace ->
                        val raceDetails = raceData[plannedRace.raceName]
                        if (raceDetails == null) {
                            MessageLog.e(TAG, "[ERROR] checkEligibilityToStartExtraRacingProcess::: Planned race \"${plannedRace.raceName}\" not found in race data.")
                            false
                        } else {
                            val turnDistance = raceDetails.turnNumber - currentTurnNumber

                            // Check if race is within look-ahead window.
                            if (turnDistance !in 0..lookAheadDays) {
                                if (turnDistance > lookAheadDays) {
                                    if (game.debugMode) {
                                        MessageLog.d(
                                            TAG,
                                            "[DEBUG] checkEligibilityToStartExtraRacingProcess:: Planned race \"${plannedRace.raceName}\" is too far ahead of the look-ahead window (distance $turnDistance > lookAheadDays $lookAheadDays).",
                                        )
                                    } else {
                                        Log.d(
                                            TAG,
                                            "[DEBUG] checkEligibilityToStartExtraRacingProcess:: Planned race \"${plannedRace.raceName}\" is too far ahead of the look-ahead window (distance $turnDistance > lookAheadDays $lookAheadDays).",
                                        )
                                    }
                                }
                                false
                            } else {
                                true
                            }
                        }
                    }

                if (eligiblePlannedRaces.isEmpty()) {
                    MessageLog.i(TAG, "[RACE] No user-selected races are eligible at turn $currentTurnNumber. Continuing with other checks.")
                } else {
                    MessageLog.i(TAG, "[RACE] Found ${eligiblePlannedRaces.size} eligible user-selected races: ${eligiblePlannedRaces.map { it.raceName }}.")
                }
            }
            // Smart racing: Check turn-based eligibility before screen checks.
            // Only run opportunity cost analysis with smartRacingCheckInterval.
            val isCheckInterval = campaign.date.day % smartRacingCheckInterval == 0

            if (isCheckInterval) {
                MessageLog.i(TAG, "[RACE] Running opportunity cost analysis at turn ${campaign.date.day} (smartRacingCheckInterval: every $smartRacingCheckInterval turns)...")

                // Check if there are any races available at the current turn.
                val currentTurnRaces = queryRacesFromDatabase(campaign.date.day, 0)
                if (currentTurnRaces.isEmpty()) {
                    MessageLog.i(TAG, "[RACE] No races available at turn ${campaign.date.day}.")
                    return false
                }

                MessageLog.i(TAG, "[RACE] Found ${currentTurnRaces.size} race(s) at the current turn ${campaign.date.day}.")

                // Query upcoming races in the look-ahead window for opportunity cost analysis.
                val upcomingRaces = queryRacesFromDatabase(campaign.date.day + 1, lookAheadDays)
                MessageLog.i(TAG, "[RACE] Found ${upcomingRaces.size} upcoming races in look-ahead window.")

                // Apply filters to both current and upcoming races.
                val filteredCurrentRaces = filterRacesByCriteria(currentTurnRaces)
                val filteredUpcomingRaces = filterRacesByCriteria(upcomingRaces)

                MessageLog.i(TAG, "[RACE] After filtering: ${filteredCurrentRaces.size} current races, ${filteredUpcomingRaces.size} upcoming races.")

                // If no filtered current races exist, we shouldn't race.
                if (filteredCurrentRaces.isEmpty()) {
                    MessageLog.i(TAG, "[RACE] No current races match the filter criteria. Skipping racing.")
                    return false
                }

                // If there are no upcoming races to compare against, race now if we have acceptable races.
                if (filteredUpcomingRaces.isEmpty()) {
                    MessageLog.i(TAG, "[RACE] No upcoming races to compare against. Racing now with available races.")
                    nextSmartRaceDay = turnsRemaining
                } else {
                    // Use opportunity cost logic to determine if we should race now or wait.
                    val shouldRace = evaluateOpportunityCost(filteredCurrentRaces, lookAheadDays)
                    if (!shouldRace) {
                        MessageLog.i(TAG, "[RACE] No suitable races at turn ${campaign.date.day} based on opportunity cost analysis.")
                        return false
                    }

                    // Opportunity cost analysis determined we should race now, so set the optimal race day to the current day.
                    nextSmartRaceDay = turnsRemaining
                }

                MessageLog.i(TAG, "[RACE] Opportunity cost analysis completed, proceeding with screen checks...")
            } else {
                MessageLog.i(TAG, "[RACE] Skipping opportunity cost analysis (turn ${campaign.date.day} does not match smartRacingCheckInterval). Using cached optimal race day.")
            }

            // Check if current day matches the optimal race day or falls on the interval.
            val isOptimalDay = nextSmartRaceDay == turnsRemaining
            val isIntervalDay = !enableRacingPlan && (turnsRemaining % daysToRunExtraRaces == 0)

            if (isOptimalDay) {
                MessageLog.i(TAG, "[RACE] Current day ($turnsRemaining) matches optimal race day.")
                return !raceRepeatWarningCheck
            } else if (isIntervalDay) {
                MessageLog.i(TAG, "[RACE] Current day ($turnsRemaining) falls on racing interval ($daysToRunExtraRaces).")
                return !raceRepeatWarningCheck
            } else {
                if (enableRacingPlan) {
                    MessageLog.i(TAG, "[RACE] Current day ($turnsRemaining) is not optimal (next: $nextSmartRaceDay).")
                } else {
                    MessageLog.i(TAG, "[RACE] Current day ($turnsRemaining) is not optimal (next: $nextSmartRaceDay, interval: $daysToRunExtraRaces).")
                }
                return false
            }
        }

        // Conditionally start the standard racing process.
        // This fallback only applies when Racing Plan is disabled, so use interval-based logic.
        return enableFarmingFans && !enableRacingPlan && (turnsRemaining % daysToRunExtraRaces == 0) && !raceRepeatWarningCheck
    }

    /**
     * Updates the running style aptitudes from the race screen.
     *
     * @return True if aptitudes were successfully updated; false otherwise.
     */
    internal fun updateRaceScreenRunningStyleAptitudes(): Boolean {
        val bitmap = game.imageUtils.getSourceBitmap()
        val bbox =
            BoundingBox(
                x = game.imageUtils.relX(0.0, 125),
                y = game.imageUtils.relY(0.0, 1140),
                w = game.imageUtils.relWidth(825),
                h = game.imageUtils.relHeight(45),
            )
        var text: String =
            game.imageUtils.performOCROnRegion(
                bitmap,
                bbox.x,
                bbox.y,
                bbox.w,
                bbox.h,
                useThreshold = false,
                useGrayscale = false,
                debugName = "updateRaceScreenRunningStyleAptitudes",
            )
        if (text == "") {
            MessageLog.w(TAG, "[WARN] updateRaceScreenRunningStyleAptitudes:: performOCROnRegion did not detect any text.")
            return false
        }
        text = text.replace("[^A-Za-z]".toRegex(), "").lowercase()
        val substrings = listOf("end", "late", "pace", "front")
        val parts = text.split(*substrings.toTypedArray()).filter { it.isNotBlank() }
        if (parts.size != 4) {
            MessageLog.w(TAG, "[WARN] updateRaceScreenRunningStyleAptitudes:: performOCROnRegion returned a malformed string: $text")
            return false
        }
        val styleMap: Map<String, String> = substrings.zip(parts).toMap()
        for ((styleString, aptitudeString) in styleMap) {
            val style: RunningStyle? = RunningStyle.fromShortName(styleString)
            if (style == null) {
                MessageLog.w(TAG, "[WARN] updateRaceScreenRunningStyleAptitudes:: performOCROnRegion returned invalid running style: $styleString")
                return false
            }
            val aptitude: Aptitude? = Aptitude.fromName(aptitudeString)
            if (aptitude == null) {
                MessageLog.w(TAG, "[WARN] updateRaceScreenRunningStyleAptitudes:: performOCROnRegion returned invalid aptitude for running style: $style -> $aptitudeString")
                return false
            }
            campaign.trainee.setRunningStyleAptitude(style, aptitude)
        }

        MessageLog.i(TAG, "[RACE] Updated running style aptitudes: ${campaign.trainee.runningStyleAptitudes}")
        return true
    }

    /**
     * Handles race strategy override for Junior Year races.
     *
     * During Junior Year: Applies the user-selected strategy and stores the original. After Junior Year: Restores the original strategy and disables the feature.
     *
     * If the date is unknown and the running style hasn't ever been set, then we set the strategy using the Original strategy. The next time we race and have access to the date, we will attempt to
     * set the running style no matter what in order to avoid weird edge cases.
     *
     * This is as opposed to setting a temporary flag and updating our flags the next time a date is detected. However, if we did this, then there are edge cases such as racing in late december of
     * junior year. This could cause us to incorrectly determine that we set the Original race strategy in the previous turn since we have no idea how many turns have passed since setting the initial
     * strategy.
     *
     * @param timeoutMs The max time (in milliseconds) for this operation to run.
     * @return If no change needed to be made to running style, returns True. Otherwise, returns whether a running style was successfully selected.
     */
    fun selectRaceStrategy(timeoutMs: Int = 30000): Boolean {
        // Unset this flag so that we can validate that the dialog handler completed the operation successfully.
        // If this isn't set by the end of this function, then we know we failed to set the strategy.
        // We can't use `campaign.trainee.bHasSetRunningStyle` since that flag isn't set when day is 1, and
        // we need to be able to handle cases where we don't know the date in this function.
        bHasSetTemporaryRunningStyle = false

        val isJuniorYear = campaign.date.day != 1 && campaign.date.year == DateYear.JUNIOR
        val isPastJuniorYear = campaign.date.year.ordinal > DateYear.JUNIOR.ordinal

        // Determine if a strategy override or reversion is needed.
        val bShouldSetStrategyJunior = isJuniorYear && !bHasSetStrategyJunior && juniorYearRaceStrategy != userSelectedOriginalStrategy
        val bShouldSetStrategyOriginal = isPastJuniorYear && bHasSetStrategyJunior && !bHasSetStrategyOriginal

        when {
            // Per-distance mode requires setting strategy before every race since different distances may have different strategies.
            enablePerDistanceStrategy -> MessageLog.i(TAG, "[RACE] Per-distance strategy enabled. Setting strategy for current race.")
            bShouldSetStrategyJunior -> MessageLog.i(TAG, "[RACE] Junior Year detected. Applying Junior race strategy override: $juniorYearRaceStrategy")
            bShouldSetStrategyOriginal -> MessageLog.i(TAG, "[RACE] Past Junior Year detected. Reverting to original race strategy: $userSelectedOriginalStrategy")
            !campaign.trainee.bHasSetRunningStyle -> MessageLog.i(TAG, "[RACE] Setting initial race strategy for unknown date.")
            else -> return true
        }

        var numTries = 0
        val startTime: Long = System.currentTimeMillis()
        while (System.currentTimeMillis() - startTime < timeoutMs) {
            MessageLog.d(TAG, "[DEBUG] selectRaceStrategy:: Changing race strategy. Attempt #${numTries + 1}")
            if (ButtonChangeRunningStyle.click(game.imageUtils)) {
                game.wait(game.dialogWaitDelay, skipWaitingForLoading = true)
            }

            campaign.handleDialogs()

            if (bHasSetTemporaryRunningStyle) {
                break
            }

            numTries++
        }

        when {
            !bHasSetTemporaryRunningStyle -> {
                MessageLog.w(TAG, "[WARN] selectRaceStrategy:: Timed out setting the race strategy after $numTries tries.")
            }

            bShouldSetStrategyJunior -> {
                MessageLog.i(TAG, "[RACE] Successfully set Junior Year race strategy.")
                bHasSetStrategyJunior = true
            }

            bShouldSetStrategyOriginal -> {
                MessageLog.i(TAG, "[RACE] Successfully set Original race strategy.")
                bHasSetStrategyOriginal = true
            }

            else -> {
                MessageLog.i(TAG, "[RACE] Successfully set race strategy for unknown date.")
            }
        }

        return bHasSetTemporaryRunningStyle
    }

    /**
     * Loads per-distance strategy settings from a JSON object stored in SharedPreferences.
     *
     * @param settingKey The key for the per-distance strategies setting.
     * @return A map of distance name to strategy string.
     */
    private fun loadPerDistanceStrategies(settingKey: String): Map<String, String> {
        return try {
            val jsonStr = SettingsHelper.getStringSetting("racing", settingKey)
            if (jsonStr.isBlank()) return mapOf("Short" to "Default", "Mile" to "Default", "Medium" to "Default", "Long" to "Default")
            val jsonObj = JSONObject(jsonStr)
            val map = mutableMapOf<String, String>()
            jsonObj.keys().forEach { key -> map[key] = jsonObj.getString(key) }
            map
        } catch (e: Exception) {
            mapOf("Short" to "Default", "Mile" to "Default", "Medium" to "Default", "Long" to "Default")
        }
    }

    /**
     * Maps a [TrackDistance] enum to the per-distance settings key used in the frontend.
     */
    private fun TrackDistance.toSettingsKey(): String =
        when (this) {
            TrackDistance.SPRINT -> "Short"
            TrackDistance.MILE -> "Mile"
            TrackDistance.MEDIUM -> "Medium"
            TrackDistance.LONG -> "Long"
        }

    /**
     * Resolves the strategy string to use based on current mode (blanket vs per-distance) and race context.
     *
     * @param isJuniorYear Whether the current year is Junior Year.
     * @return The strategy string (e.g. "Default", "Auto", "Front", "Pace", "Late", "End").
     */
    internal fun resolveStrategyForCurrentRace(isJuniorYear: Boolean): String {
        if (!enablePerDistanceStrategy) {
            return if (isJuniorYear) juniorYearRaceStrategy else userSelectedOriginalStrategy
        }

        val distanceKey = lastRaceDistance?.toSettingsKey()
        val strategyMap = if (isJuniorYear) juniorYearPerDistanceStrategies else originalPerDistanceStrategies

        return if (distanceKey != null) {
            val strategy = strategyMap[distanceKey] ?: "Default"
            MessageLog.i(TAG, "[RACE] Per-distance strategy for $distanceKey: $strategy")
            strategy
        } else {
            MessageLog.w(TAG, "[RACE] Per-distance strategy enabled but race distance unknown. Falling back to blanket strategy.")
            if (isJuniorYear) juniorYearRaceStrategy else userSelectedOriginalStrategy
        }
    }

    /**
     * Executes the race with retry logic.
     *
     * @return True if the bot completed the race; otherwise false.
     */
    fun runRaceWithRetries(): Boolean {
        MessageLog.i(TAG, "[RACE] Proceeding to handle the race...")

        // Flag used to prevent us from attempting to select a running style after we've already successfully selected a running style once.
        var bDidSelectRaceStrategy = false
        var retriesThisRace = 0

        // Safety counter to prevent infinite loop.
        var loopCount = 0
        val maxLoopCount = 100

        do {
            loopCount++
            if (loopCount > maxLoopCount) {
                MessageLog.w(TAG, "[WARN] runRaceWithRetries:: Safety loop limit reached. Exiting race retry loop...")
                return false
            }

            if (campaign.tryHandleAllDialogs()) {
                continue
            }

            val bitmap: Bitmap = game.imageUtils.getSourceBitmap()

            when {
                // Handle the race prep screen.
                // Check for both of these buttons in case one of them fails detection.
                // This helps prevent us from accidentally clicking the Race button.
                ButtonChangeRunningStyle.check(game.imageUtils, sourceBitmap = bitmap) ||
                    ButtonViewResults.check(game.imageUtils, sourceBitmap = bitmap) -> {
                    MessageLog.i(TAG, "[RACE] Detected ButtonChangeRunningStyle. Handling race prep screen...")

                    // Always handle race strategy at this screen in case it hasn't been handled yet.
                    // Latch the result so we don't continuously try to handle strategy.
                    if (!bDidSelectRaceStrategy) {
                        bDidSelectRaceStrategy = selectRaceStrategy()
                    }

                    when (ButtonViewResults.checkDisabled(game.imageUtils, bitmap)) {
                        true -> {
                            if (ButtonRaceManual.click(game.imageUtils, sourceBitmap = bitmap)) {
                                MessageLog.i(TAG, "[RACE] Skip is locked. Running race manually.")
                                // Clicking this button triggers connection to server.
                                game.waitForLoading()
                            } else {
                                MessageLog.w(TAG, "[WARN] runRaceWithRetries:: Skip is locked. Failed to click manual race button.")
                            }
                        }

                        false -> {
                            if (ButtonViewResults.click(game.imageUtils, sourceBitmap = bitmap)) {
                                MessageLog.i(TAG, "[RACE] Clicked ViewResults button to skip race.")
                                // Clicking this button triggers connection to server.
                                game.waitForLoading()
                            } else {
                                MessageLog.w(TAG, "[WARN] runRaceWithRetries:: Failed to click ViewResults button to skip race.")
                            }
                        }

                        null -> {
                            MessageLog.w(TAG, "[WARN] runRaceWithRetries:: At Race prep screen but failed to detect ViewResults button.")
                        }
                    }
                }

                ButtonRace.click(game.imageUtils, sourceBitmap = bitmap) -> {
                    MessageLog.i(TAG, "[RACE] Dismissed the list of participants.")
                }

                ButtonRaceExclamation.click(game.imageUtils, sourceBitmap = bitmap) -> {
                    MessageLog.i(TAG, "[RACE] Dismissed the list of participants.")
                }

                ButtonSkip.click(game.imageUtils, sourceBitmap = bitmap) -> {
                    MessageLog.i(TAG, "[RACE] Clicked skip button.")
                }

                // Handle post-race popups (e.g. Rival popups in Trackblazer).
                campaign.hasPostRacePopups() && ButtonClose.click(game.imageUtils, sourceBitmap = bitmap) -> {
                    MessageLog.i(TAG, "[RACE] Closed post-race popup.")
                    campaign.onRaceWin()
                    game.wait(1.0)

                    // After closing the popup, check if we can retry a specific race grade.
                    if (lastRaceGrade != null &&
                        retryEligibleGrades.contains(lastRaceGrade) &&
                        raceRetries > 0 &&
                        retriesThisRace < maxRetriesPerRace &&
                        ButtonTryAgainAlt.checkDisabled(game.imageUtils) == false
                    ) {
                        MessageLog.i(TAG, "[RACE] $lastRaceGrade race detected and retry button is available. Retrying...")
                        if (ButtonTryAgainAlt.click(game.imageUtils)) {
                            game.wait(3.0)
                            retriesThisRace++
                            raceRetries--
                        }
                    } else if (lastRaceIsRival &&
                        lastRaceGrade != null &&
                        retryEligibleGrades.contains(lastRaceGrade) &&
                        !bRetriedCurrentRace &&
                        raceRetries > 0 &&
                        retriesThisRace < maxRetriesPerRace &&
                        ButtonTryAgainAlt.checkDisabled(game.imageUtils) == false
                    ) {
                        MessageLog.i(TAG, "[RACE] Rival Race retry button is available. Retrying once...")
                        bRetriedCurrentRace = true
                        if (ButtonTryAgainAlt.click(game.imageUtils)) {
                            game.wait(3.0)
                            retriesThisRace++
                            raceRetries--
                        }
                    } else {
                        MessageLog.i(TAG, "[RACE] No retries remaining or eligible race conditions not met.")
                    }
                }

                lastRaceGrade != null &&
                    retryEligibleGrades.contains(lastRaceGrade) &&
                    raceRetries > 0 &&
                    retriesThisRace < maxRetriesPerRace &&
                    ButtonTryAgainAlt.checkDisabled(
                        game.imageUtils,
                        sourceBitmap = bitmap,
                    ) == false -> {
                    MessageLog.i(TAG, "[RACE] $lastRaceGrade race detected and retry button is available. Retrying...")
                    if (ButtonTryAgainAlt.click(game.imageUtils, sourceBitmap = bitmap)) {
                        game.wait(3.0)
                        retriesThisRace++
                        raceRetries--
                    }
                }

                lastRaceIsRival &&
                    lastRaceGrade != null &&
                    retryEligibleGrades.contains(lastRaceGrade) &&
                    !bRetriedCurrentRace &&
                    raceRetries > 0 &&
                    retriesThisRace < maxRetriesPerRace &&
                    ButtonTryAgainAlt.checkDisabled(
                        game.imageUtils,
                        sourceBitmap = bitmap,
                    ) == false -> {
                    MessageLog.i(TAG, "[RACE] Rival Race retry button is available. Retrying once...")
                    bRetriedCurrentRace = true
                    if (ButtonTryAgainAlt.click(game.imageUtils, sourceBitmap = bitmap)) {
                        game.wait(3.0)
                        retriesThisRace++
                        raceRetries--
                    }
                }

                ButtonNext.check(game.imageUtils, sourceBitmap = bitmap) -> {
                    MessageLog.i(TAG, "[RACE] Reached race results screen. Exiting race retry loop...")
                    return true
                }

                // Otherwise click to progress through screens.
                else -> {
                    Log.d(TAG, "[DEBUG] runRaceWithRetries:: No components detected. Tapping to progress...")
                    game.tap(350.0, 450.0, taps = 3)
                }
            }
        } while (true)
    }

    /**
     * Finishes up and confirms the results of the race and its success.
     *
     * @param isExtra Flag to determine the following actions to finish up this mandatory or extra race.
     * @return True if race results were successfully finalized; false otherwise.
     */
    fun finalizeRaceResults(isExtra: Boolean = false): Boolean {
        MessageLog.i(TAG, "[RACE] Now performing cleanup and finishing the race.")

        // Always reset flags after successful race completion, regardless of UI flow.
        firstTimeRacing = false
        clearRacingRequirementFlags()

        // Bot should be at the screen where it shows the final positions of all participants.
        if (!ButtonNext.check(game.imageUtils, tries = 30)) {
            MessageLog.e(TAG, "[ERROR] finalizeRaceResults:: Cannot start the cleanup process for finishing the race. Moving on...")
            return false
        }

        // Max time limit for the while loop to attempt to finalize race results.
        // It really shouldn't ever take this long.
        val startTime: Long = System.currentTimeMillis()
        val maxTimeMs: Long = 30000
        while (System.currentTimeMillis() - startTime < maxTimeMs) {
            if (campaign.tryHandleAllDialogs()) {
                // Don't want to start next iteration too quick since dialogs may still be in process of closing.
                game.wait(0.5, skipWaitingForLoading = true)
                continue
            }

            val bitmap: Bitmap = game.imageUtils.getSourceBitmap()

            when {
                ButtonNext.click(game.imageUtils, sourceBitmap = bitmap) -> {
                    MessageLog.i(TAG, "[RACE] Clicked on Next (race results) button.")
                }

                // If we see this button, click it a bunch to ensure we get a valid click.
                // This is also the exit point for this function.
                ButtonNextRaceEnd.click(game.imageUtils, sourceBitmap = bitmap, taps = 5) -> {
                    MessageLog.i(TAG, "[RACE] Clicked on Next (race end) button.")
                    // Clicking this button triggers connection to server.
                    game.waitForLoading()
                    return true
                }

                // Tap on the screen to progress through screens.
                else -> {
                    game.tap(350.0, 750.0, taps = 3)
                }
            }
        }
        return false
    }

    /**
     * Race database lookup using exact and/or fuzzy matching. Returns multiple matches when races share the same name and date but have different fan counts.
     *
     * @param turnNumber The current turn number to match against.
     * @param detectedName The race name detected by OCR.
     * @return A list of [RaceData] objects matching the criteria, or an empty list if no matches found.
     */
    internal fun lookupRaceInDatabase(turnNumber: Int, detectedName: String): ArrayList<RaceData> {
        val settingsManager = SQLiteSettingsManager(game.myContext)
        if (!settingsManager.isAvailable()) {
            MessageLog.e(TAG, "[ERROR] lookupRaceInDatabase:: Database not available for race lookup.")
            settingsManager.close()
            return arrayListOf()
        }

        return try {
            MessageLog.i(TAG, "[RACE] Looking up race for turn $turnNumber with detected name: \"$detectedName\".")

            val database = settingsManager.readableDatabase
            if (database == null) {
                MessageLog.e(TAG, "[ERROR] lookupRaceInDatabase:: Database not available for race lookup.")
                return arrayListOf()
            }

            val matches = arrayListOf<RaceData>()

            // Do exact matching based on the info gathered.
            val exactCursor =
                database.query(
                    TABLE_RACES,
                    arrayOf(
                        RACES_COLUMN_NAME,
                        RACES_COLUMN_GRADE,
                        RACES_COLUMN_FANS,
                        RACES_COLUMN_NAME_FORMATTED,
                        RACES_COLUMN_TRACK_SURFACE,
                        RACES_COLUMN_TRACK_DISTANCE,
                        RACES_COLUMN_TURN_NUMBER,
                    ),
                    "$RACES_COLUMN_TURN_NUMBER = ? AND $RACES_COLUMN_NAME_FORMATTED = ?",
                    arrayOf(turnNumber.toString(), detectedName),
                    null,
                    null,
                    null,
                )

            // Collect all exact matches (may have different fan counts).
            if (exactCursor.moveToFirst()) {
                do {
                    val race =
                        RaceData(
                            name = exactCursor.getString(0),
                            grade = exactCursor.getString(1),
                            fans = exactCursor.getInt(2),
                            nameFormatted = exactCursor.getString(3),
                            trackSurface = exactCursor.getString(4),
                            trackDistance = exactCursor.getString(5),
                            turnNumber = exactCursor.getInt(6),
                        )
                    matches.add(race)
                } while (exactCursor.moveToNext())

                exactCursor.close()

                if (matches.size == 1) {
                    MessageLog.i(TAG, "[RACE] Found exact match: \"${matches[0].name}\" AKA \"${matches[0].nameFormatted}\" (Fans: ${matches[0].fans}).")
                } else {
                    MessageLog.i(TAG, "[RACE] Found ${matches.size} exact matches with same name but different fan counts:")
                    matches.forEach { race ->
                        MessageLog.i(TAG, "[RACE]     - \"${race.name}\" (Fans: ${race.fans})")
                    }
                }
                return matches
            }
            exactCursor.close()

            // Otherwise, do fuzzy matching to find matches using Jaro-Winkler.
            val fuzzyCursor =
                database.query(
                    TABLE_RACES,
                    arrayOf(
                        RACES_COLUMN_NAME,
                        RACES_COLUMN_GRADE,
                        RACES_COLUMN_FANS,
                        RACES_COLUMN_NAME_FORMATTED,
                        RACES_COLUMN_TRACK_SURFACE,
                        RACES_COLUMN_TRACK_DISTANCE,
                        RACES_COLUMN_TURN_NUMBER,
                    ),
                    "$RACES_COLUMN_TURN_NUMBER = ?",
                    arrayOf(turnNumber.toString()),
                    null,
                    null,
                    null,
                )

            if (!fuzzyCursor.moveToFirst()) {
                fuzzyCursor.close()
                MessageLog.i(TAG, "[RACE] No match found for turn $turnNumber with name \"$detectedName\".")
                return arrayListOf()
            }

            val similarityService = StringSimilarityServiceImpl(JaroWinklerStrategy())
            var bestScore = 0.0
            val fuzzyMatches = mutableListOf<Pair<RaceData, Double>>()

            do {
                val nameFormatted = fuzzyCursor.getString(3)
                val similarity = similarityService.score(detectedName, nameFormatted)

                if (similarity >= SIMILARITY_THRESHOLD) {
                    val race =
                        RaceData(
                            name = fuzzyCursor.getString(0),
                            grade = fuzzyCursor.getString(1),
                            fans = fuzzyCursor.getInt(2),
                            nameFormatted = nameFormatted,
                            trackSurface = fuzzyCursor.getString(4),
                            trackDistance = fuzzyCursor.getString(5),
                            turnNumber = fuzzyCursor.getInt(6),
                        )
                    fuzzyMatches.add(Pair(race, similarity))
                    if (similarity > bestScore) bestScore = similarity
                    if (game.debugMode) {
                        MessageLog.d(
                            TAG,
                            "[DEBUG] lookupRaceInDatabase:: Fuzzy match candidate: \"${race.name}\" AKA \"$nameFormatted\" with similarity ${
                                game.decimalFormat.format(
                                    similarity,
                                )
                            } (Fans: ${race.fans}).",
                        )
                    } else {
                        Log.d(
                            TAG,
                            "[DEBUG] lookupRaceInDatabase:: Fuzzy match candidate: \"${race.name}\" AKA \"$nameFormatted\" with similarity ${
                                game.decimalFormat.format(
                                    similarity,
                                )
                            } (Fans: ${race.fans}).",
                        )
                    }
                }
            } while (fuzzyCursor.moveToNext())

            fuzzyCursor.close()

            // Return all matches with the best similarity score.
            val bestMatches = ArrayList(fuzzyMatches.filter { it.second == bestScore }.map { it.first })

            if (bestMatches.isNotEmpty()) {
                if (bestMatches.size == 1) {
                    MessageLog.i(
                        TAG,
                        "[RACE] Found fuzzy match: \"${bestMatches[0].name}\" AKA \"${bestMatches[0].nameFormatted}\" with similarity ${
                            game.decimalFormat.format(
                                bestScore,
                            )
                        } (Fans: ${bestMatches[0].fans}).",
                    )
                } else {
                    MessageLog.i(TAG, "[RACE] Found ${bestMatches.size} fuzzy matches with similarity ${game.decimalFormat.format(bestScore)} but different fan counts:")
                    bestMatches.forEach { race ->
                        MessageLog.i(TAG, "[RACE]     - \"${race.name}\" (Fans: ${race.fans})")
                    }
                }
                return bestMatches
            }

            MessageLog.i(TAG, "[RACE] No match found for turn $turnNumber with name \"$detectedName\".")
            arrayListOf()
        } catch (e: Exception) {
            MessageLog.e(TAG, "[ERROR] lookupRaceInDatabase:: Error looking up race: ${e.message}.")
            arrayListOf()
        } finally {
            settingsManager.close()
        }
    }

    /**
     * Calculates a composite race score based on fan count, race grade, and aptitude performance.
     *
     * The score is derived from three weighted factors:
     * - **Fans:** Normalized to a 0–100 scale.
     * - **Grade:** Weighted to a map of values based on grade.
     * - **Aptitude:** Adds a bonus if both track surface and distance aptitudes are A or S.
     *
     * The final score is the average of these three components.
     *
     * @param race The [RaceData] instance to evaluate.
     * @return A [ScoredRace] object containing the final score and individual factor breakdowns.
     */
    private fun scoreRace(race: RaceData): ScoredRace {
        // Normalize fans to 0-100 scale (assuming max fans is 30000).
        val fansScore = (race.fans.toDouble() / 30000.0) * 100.0

        // Grade scoring: G1 = 75, G2 = 50, G3 = 25.
        val gradeScore =
            when (race.grade) {
                RaceGrade.G1 -> 75.0
                RaceGrade.G2 -> 50.0
                RaceGrade.G3 -> 25.0
                else -> 0.0
            }

        // Get the trainee's aptitude for this race's track surface/distance.
        val trackSurfaceAptitude: Aptitude = campaign.trainee.checkTrackSurfaceAptitude(race.trackSurface)
        val trackDistanceAptitude: Aptitude = campaign.trainee.checkTrackDistanceAptitude(race.trackDistance)

        // Aptitude bonus: 100 if both track surface and distance are >= B aptitude, else 0.
        val trackSurfaceMatch: Boolean = trackSurfaceAptitude >= Aptitude.B
        val trackDistanceMatch: Boolean = trackDistanceAptitude >= Aptitude.B

        val aptitudeBonus = if (trackSurfaceMatch && trackDistanceMatch) 100.0 else 0.0

        // Calculate final score with equal weights.
        val finalScore = (fansScore + gradeScore + aptitudeBonus) / 3.0

        // Log detailed scoring breakdown for debugging.
        if (game.debugMode) {
            MessageLog.d(
                TAG,
                """
                [DEBUG] Scoring ${race.name}:
                Fans            = ${race.fans} (${game.decimalFormat.format(fansScore)})
                Grade           = ${race.grade} (${game.decimalFormat.format(gradeScore)})
                Track Surface   = ${race.trackSurface} ($trackSurfaceAptitude)
                Track Distance  = ${race.trackDistance} ($trackDistanceAptitude)
                Aptitude        = ${game.decimalFormat.format(aptitudeBonus)}
                Final           = ${game.decimalFormat.format(finalScore)}
                """.trimIndent(),
            )
        }

        return ScoredRace(
            raceData = race,
            score = finalScore,
            fansScore = fansScore,
            gradeScore = gradeScore,
            aptitudeBonus = aptitudeBonus,
        )
    }

    /**
     * Database queries for races.
     *
     * @param currentTurn The current turn number used as the starting point.
     * @param lookAheadDays The number of days (turns) to look ahead for upcoming races.
     * @return A list of [RaceData] objects representing all races within the look-ahead window.
     */
    private fun queryRacesFromDatabase(currentTurn: Int, lookAheadDays: Int): List<RaceData> {
        val settingsManager = SQLiteSettingsManager(game.myContext)
        if (!settingsManager.isAvailable()) {
            MessageLog.e(TAG, "[ERROR] queryRacesFromDatabase:: Database not available for race lookup.")
            settingsManager.close()
            return emptyList()
        }

        return try {
            val database = settingsManager.readableDatabase
            if (database == null) {
                MessageLog.e(TAG, "[ERROR] queryRacesFromDatabase:: Database is null for race lookup.")
                return emptyList()
            }

            val endTurn = currentTurn + lookAheadDays
            val cursor =
                database.query(
                    TABLE_RACES,
                    arrayOf(
                        RACES_COLUMN_NAME,
                        RACES_COLUMN_GRADE,
                        RACES_COLUMN_FANS,
                        RACES_COLUMN_NAME_FORMATTED,
                        RACES_COLUMN_TRACK_SURFACE,
                        RACES_COLUMN_TRACK_DISTANCE,
                        RACES_COLUMN_TURN_NUMBER,
                    ),
                    "$RACES_COLUMN_TURN_NUMBER >= ? AND $RACES_COLUMN_TURN_NUMBER <= ?",
                    arrayOf(currentTurn.toString(), endTurn.toString()),
                    null,
                    null,
                    "$RACES_COLUMN_TURN_NUMBER ASC",
                )

            val races = mutableListOf<RaceData>()
            if (cursor.moveToFirst()) {
                do {
                    val race =
                        RaceData(
                            name = cursor.getString(0),
                            grade = cursor.getString(1),
                            fans = cursor.getInt(2),
                            nameFormatted = cursor.getString(3),
                            trackSurface = cursor.getString(4),
                            trackDistance = cursor.getString(5),
                            turnNumber = cursor.getInt(6),
                        )
                    races.add(race)
                } while (cursor.moveToNext())
            }
            cursor.close()

            MessageLog.i(TAG, "[RACE] Found ${races.size} races in look-ahead window (turns $currentTurn to $endTurn).")
            races
        } catch (e: Exception) {
            MessageLog.e(TAG, "[ERROR] queryRacesFromDatabase:: Error getting races from database: ${e.message}")
            emptyList()
        } finally {
            settingsManager.close()
        }
    }

    /**
     * Checks if any G1 races exist at the specified turn number in the database.
     *
     * @param turnNumber The turn number to check for G1 races.
     * @return True if at least one G1 race exists at the specified turn, false otherwise.
     */
    private fun hasG1RacesAtTurn(turnNumber: Int): Boolean {
        val settingsManager = SQLiteSettingsManager(game.myContext)
        if (!settingsManager.isAvailable()) {
            MessageLog.e(TAG, "[ERROR] hasG1RacesAtTurn:: Database not available for G1 race check.")
            settingsManager.close()
            return false
        }

        return try {
            val database = settingsManager.readableDatabase
            if (database == null) {
                MessageLog.e(TAG, "[ERROR] hasG1RacesAtTurn:: Database is null for G1 race check.")
                return false
            }

            val cursor =
                database.query(
                    TABLE_RACES,
                    arrayOf(RACES_COLUMN_GRADE),
                    "$RACES_COLUMN_TURN_NUMBER = ? AND $RACES_COLUMN_GRADE = ?",
                    arrayOf(turnNumber.toString(), "G1"),
                    null,
                    null,
                    null,
                )

            val hasG1 = cursor.count > 0
            cursor.close()

            hasG1
        } catch (e: Exception) {
            MessageLog.e(TAG, "[ERROR] hasG1RacesAtTurn:: Error checking for G1 races: ${e.message}")
            false
        } finally {
            settingsManager.close()
        }
    }

    /**
     * Filters the given list of races according to the user's Racing Plan settings.
     *
     * @param races The list of [RaceData] entries to filter.
     * @param bypassMinFans If true, bypasses the minimum fans threshold check (useful for trophy requirement).
     * @return A list of [RaceData] objects that satisfy all Racing Plan filter criteria.
     */
    private fun filterRacesByCriteria(races: List<RaceData>, bypassMinFans: Boolean = false): List<RaceData> {
        // Parse preferred grades.
        val preferredGrades =
            try {
                // Parse as JSON array.
                val jsonArray = JSONArray(preferredGradesString)
                val parsed = (0 until jsonArray.length()).map { jsonArray.getString(it).uppercase() }
                MessageLog.i(TAG, "[RACE] Parsed preferred grades as JSON array: $parsed.")
                parsed
            } catch (e: Exception) {
                MessageLog.w(TAG, "[WARN] filterRacesByCriteria:: Error parsing preferred grades: ${e.message}, using fallback.")
                val parsed = preferredGradesString.split(",").map { it.trim().uppercase() }
                MessageLog.w(TAG, "[WARN] filterRacesByCriteria:: Fallback parsing result: $parsed")
                parsed
            }

        // Parse preferred distances.
        val preferredDistances =
            try {
                // Parse as JSON array.
                val jsonArray = JSONArray(preferredTrackDistanceString)
                val parsed = (0 until jsonArray.length()).map { jsonArray.getString(it).uppercase() }
                MessageLog.i(TAG, "[RACE] Parsed preferred distances as JSON array: $parsed.")
                parsed
            } catch (e: Exception) {
                MessageLog.w(TAG, "[WARN] filterRacesByCriteria:: Error parsing preferred distances: ${e.message}, using fallback.")
                val parsed = preferredTrackDistanceString.split(",").map { it.trim().uppercase() }
                MessageLog.w(TAG, "[WARN] filterRacesByCriteria:: Fallback parsing result: $parsed")
                parsed
            }

        if (game.debugMode) {
            MessageLog.d(
                TAG,
                "[DEBUG] filterRacesByCriteria:: Filter criteria: Min fans: $minFansThreshold, trackSurface: $preferredTrackSurfaceString, grades: $preferredGrades, distances: $preferredDistances",
            )
        } else {
            Log.d(
                TAG,
                "[DEBUG] filterRacesByCriteria:: Filter criteria: Min fans: $minFansThreshold, trackSurface: $preferredTrackSurfaceString, grades: $preferredGrades, distances: $preferredDistances",
            )
        }

        val filteredRaces =
            races.filter { race ->
                val isRequirementActive = hasFanRequirement || hasTrophyRequirement
                val meetsFansThreshold = bypassMinFans || isRequirementActive || race.fans >= minFansThreshold
                val meetsTrackSurfacePreference = isRequirementActive || preferredTrackSurfaceString == "Any" || race.trackSurface == TrackSurface.fromName(preferredTrackSurfaceString)
                val meetsGradePreference = isRequirementActive || preferredGrades.isEmpty() || preferredGrades.contains(race.grade.name)
                val meetsTrackDistancePreference = isRequirementActive || preferredDistances.isEmpty() || preferredDistances.contains(race.trackDistance.name)

                val passes = meetsFansThreshold && meetsTrackSurfacePreference && meetsGradePreference && meetsTrackDistancePreference

                // If the race did not pass any of the filters, print the reason why.
                if (!passes) {
                    val reasons = mutableListOf<String>()
                    if (!meetsFansThreshold) reasons.add("fans ${race.fans} < $minFansThreshold")
                    if (!meetsTrackSurfacePreference) reasons.add("trackSurface ${race.trackSurface} != $preferredTrackSurfaceString")
                    if (!meetsGradePreference) reasons.add("grade ${race.grade} not in $preferredGrades")
                    if (!meetsTrackDistancePreference) reasons.add("distance ${race.trackDistance} not in $preferredDistances")
                    if (game.debugMode) {
                        MessageLog.d(TAG, "[DEBUG] filterRacesByCriteria:: ✗ Filtered out ${race.name}: ${reasons.joinToString(", ")}")
                    } else {
                        Log.d(TAG, "[DEBUG] filterRacesByCriteria:: ✗ Filtered out ${race.name}: ${reasons.joinToString(", ")}")
                    }
                } else {
                    if (game.debugMode) {
                        MessageLog.d(
                            TAG,
                            "[DEBUG] filterRacesByCriteria:: ✓ Passed filter: ${race.name} (fans: ${race.fans}, trackSurface: ${race.trackSurface}, grade: ${race.grade}, distance: ${race.trackDistance})",
                        )
                    } else {
                        Log.d(
                            TAG,
                            "[DEBUG] filterRacesByCriteria:: ✓ Passed filter: ${race.name} (fans: ${race.fans}, trackSurface: ${race.trackSurface}, grade: ${race.grade}, distance: ${race.trackDistance})",
                        )
                    }
                }

                passes
            }

        return filteredRaces
    }

    /**
     * Evaluates opportunity cost to determine whether the bot should race immediately or wait for a better opportunity.
     *
     * @param currentRaces List of currently available [RaceData] races.
     * @param lookAheadDays Number of turns/days to consider for upcoming races.
     * @return True if the bot should race now, false if it is better to wait for a future race.
     */
    private fun evaluateOpportunityCost(currentRaces: List<RaceData>, lookAheadDays: Int): Boolean {
        MessageLog.i(TAG, "[RACE] Evaluating whether to race now using Opportunity Cost logic...")
        if (currentRaces.isEmpty()) {
            MessageLog.i(TAG, "[RACE] No current races available, cannot race now.")
            return false
        }

        // Score current races.
        MessageLog.i(TAG, "[RACE] Scoring ${currentRaces.size} current races (sorted by score descending):")
        val currentScoredRaces = currentRaces.map { scoreRace(it) }
        val sortedScoredRaces = currentScoredRaces.sortedByDescending { it.score }
        sortedScoredRaces.forEach { scoredRace ->
            MessageLog.i(TAG, "[RACE]     Current race: ${scoredRace.raceData.name} (score: ${game.decimalFormat.format(scoredRace.score)})")
        }
        val bestCurrentRace = sortedScoredRaces.maxByOrNull { it.score }

        if (bestCurrentRace == null) {
            MessageLog.i(TAG, "[RACE] Failed to score current races, cannot race now.")
            return false
        }

        MessageLog.i(TAG, "[RACE] Best current race: ${bestCurrentRace.raceData.name} (score: ${game.decimalFormat.format(bestCurrentRace.score)})")

        // Get and score upcoming races.
        MessageLog.i(TAG, "[RACE] Looking ahead $lookAheadDays days for upcoming races...")
        val upcomingRaces = queryRacesFromDatabase(campaign.date.day + 1, lookAheadDays)
        MessageLog.i(TAG, "[RACE] Found ${upcomingRaces.size} upcoming races in database.")

        val filteredUpcomingRaces = filterRacesByCriteria(upcomingRaces)
        MessageLog.i(TAG, "[RACE] After filtering: ${filteredUpcomingRaces.size} upcoming races remain.")

        if (filteredUpcomingRaces.isEmpty()) {
            MessageLog.i(TAG, "[RACE] No suitable upcoming races found, racing now with best current option.")
            return true
        }

        // Score all upcoming races and find the best one.
        val scoredUpcomingRaces = filteredUpcomingRaces.map { scoreRace(it) }
        val sortedUpcomingScoredRaces = scoredUpcomingRaces.sortedByDescending { it.score }
        val bestUpcomingRace = sortedUpcomingScoredRaces.maxByOrNull { it.score }

        if (bestUpcomingRace == null) {
            MessageLog.i(TAG, "[RACE] No suitable upcoming races found, racing now with best current option.")
            return true
        }

        MessageLog.i(TAG, "[RACE] Best upcoming race: ${bestUpcomingRace.raceData.name} (score: ${game.decimalFormat.format(bestUpcomingRace.score)}).")

        // Apply time decay to upcoming race score.
        val discountedUpcomingScore = bestUpcomingRace.score * timeDecayFactor

        // Calculate opportunity cost: How much better is waiting?
        val improvementFromWaiting = discountedUpcomingScore - bestCurrentRace.score

        // Decision criteria.
        val isGoodEnough = bestCurrentRace.score >= minimumQualityThreshold
        val notWorthWaiting = improvementFromWaiting < improvementThreshold
        val shouldRace = isGoodEnough && notWorthWaiting

        MessageLog.i(TAG, "[RACE] Opportunity Cost Analysis:")
        MessageLog.i(TAG, "[RACE]     Current score: ${game.decimalFormat.format(bestCurrentRace.score)}")
        MessageLog.i(TAG, "[RACE]     Upcoming score (raw): ${game.decimalFormat.format(bestUpcomingRace.score)}")
        MessageLog.i(TAG, "[RACE]     Upcoming score (discounted by ${game.decimalFormat.format((1 - timeDecayFactor) * 100)}%): ${game.decimalFormat.format(discountedUpcomingScore)}")
        MessageLog.i(TAG, "[RACE]     Improvement from waiting: ${game.decimalFormat.format(improvementFromWaiting)}")
        MessageLog.i(TAG, "[RACE]     Quality check (≥$minimumQualityThreshold): ${if (isGoodEnough) "PASS" else "FAIL"}")
        MessageLog.i(TAG, "[RACE]     Worth waiting check (<$improvementThreshold): ${if (notWorthWaiting) "PASS" else "FAIL"}")
        MessageLog.i(TAG, "[RACE]     Decision: ${if (shouldRace) "RACE NOW" else "WAIT FOR BETTER OPPORTUNITY"}")

        // Print the reasoning for the decision.
        if (shouldRace) {
            MessageLog.i(
                TAG,
                "[RACE] Reasoning: Current race is good enough (${game.decimalFormat.format(bestCurrentRace.score)} ≥ $minimumQualityThreshold) and waiting only gives ${
                    game.decimalFormat.format(improvementFromWaiting)
                } more points (less than $improvementThreshold).",
            )
            // Race now - clear the next race day tracker.
            nextSmartRaceDay = null
        } else {
            val reason =
                if (!isGoodEnough) {
                    "Current race quality too low (${game.decimalFormat.format(bestCurrentRace.score)} < $minimumQualityThreshold)."
                } else {
                    "Worth waiting for better opportunity (+${game.decimalFormat.format(improvementFromWaiting)} points > $improvementThreshold)."
                }
            MessageLog.i(TAG, "[RACE] Reasoning: $reason")
            // Wait for better opportunity - store the turn number to race on.
            val bestUpcomingRaceData = upcomingRaces.find { it.name == bestUpcomingRace.raceData.name }
            nextSmartRaceDay = bestUpcomingRaceData?.turnNumber
            MessageLog.i(TAG, "[RACE] Setting next smart race day to turn $nextSmartRaceDay.")
        }

        return shouldRace
    }

    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////

    /**
     * Orchestrates the handling of various race events, including mandatory and extra races.
     *
     * @param isScheduledRace True if a race is currently scheduled, false otherwise.
     * @return True if a race event was handled successfully, false otherwise.
     */
    fun handleRaceEvents(isScheduledRace: Boolean = false): Boolean {
        // If the bot is already at the Race List screen and a race has already been selected,
        // we should not reset the flags as they may have been set somewhere else.
        if (!ButtonRace.check(game.imageUtils)) {
            lastRaceGrade = null
            lastRaceFans = 0
            lastRaceDistance = null
            lastRaceIsRival = false
            bRetriedCurrentRace = false
        }
        MessageLog.v(TAG, "\n********************")
        MessageLog.v(TAG, "[RACE] Starting Racing process on ${campaign.date}.")

        // If the races button exists AND is disabled, we can exit early since we know that we're at the home screen and the bot cannot race.
        if (ButtonRaces.checkDisabled(game.imageUtils) == true) {
            MessageLog.v(TAG, "[RACE] Races are locked. Canceling the racing process and doing something else.")
            clearRacingRequirementFlags()
            MessageLog.v(TAG, "********************")
            return false
        }

        // If there are no races available, cancel the racing process.
        if (LabelThereAreNoRacesToCompeteIn.check(game.imageUtils)) {
            MessageLog.v(TAG, "[RACE] There are no races to compete in. Canceling the racing process and doing something else.")
            MessageLog.v(TAG, "********************")
            // Clear requirement flags since we cannot proceed with racing.
            clearRacingRequirementFlags()
            return false
        }

        // First, check if there is a mandatory or an extra race available. If so, head into the Race Selection screen.
        // Note: If there is a mandatory race, the bot would be on the Home screen.
        // Otherwise, it would have found itself at the Race Selection screen already (by way of the insufficient fans popup).
        val loc: Point? = IconRaceDayRibbon.find(game.imageUtils).first
        if (loc != null) {
            // Offset 100px down from the ribbon since the ribbon isn't clickable.
            game.tap(loc.x, loc.y + 100, IconRaceDayRibbon.template.path, ignoreWaiting = true)
            game.wait(0.5, skipWaitingForLoading = true)
            // Check for the consecutive race dialog before proceeding.
            campaign.handleDialogs(args = mapOf("overrideIgnoreConsecutiveRaceWarning" to true))
            return handleMandatoryRace()
        } else if (!campaign.trainee.bHasCompletedMaidenRace && !isScheduledRace && ButtonRaces.click(game.imageUtils)) {
            game.wait(1.0, skipWaitingForLoading = true)
            // Check for the consecutive race dialog before proceeding.
            campaign.handleDialogs(args = mapOf("overrideIgnoreConsecutiveRaceWarning" to true))
            return handleMaidenRace()
        } else if ((!campaign.date.bIsPreDebut && ButtonRaces.click(game.imageUtils)) || isScheduledRace) {
            var overrideIgnore = false
            if (isScheduledRace || hasFanRequirement || hasTrophyRequirement || hasInsufficientGoalRacePtsRequirement) {
                MessageLog.v(TAG, "[RACE] Racing requirement is active. Ignoring consecutive race warning.")
                overrideIgnore = true
            }
            game.wait(0.5, skipWaitingForLoading = true)
            // Check for the consecutive race dialog before proceeding.
            val result: DialogHandlerResult =
                campaign.handleDialogs(
                    args =
                        mapOf(
                            "overrideIgnoreConsecutiveRaceWarning" to overrideIgnore,
                            "isScheduledRace" to isScheduledRace,
                            "isMandatoryRace" to (isScheduledRace || hasFanRequirement || hasTrophyRequirement || hasInsufficientGoalRacePtsRequirement),
                        ),
                )
            if (result is DialogHandlerResult.Handled &&
                result.dialog.name == "consecutive_race_warning" &&
                !(overrideIgnore || enableForceRacing || ignoreConsecutiveRaceWarning)
            ) {
                MessageLog.v(TAG, "[RACE] Consecutive race warning but conditions dictate to not race. Skipping...")
                return false
            }
            return handleExtraRace(isScheduledRace = isScheduledRace)
        } else if (ButtonRace.check(game.imageUtils)) {
            MessageLog.v(TAG, "[RACE] The bot is already at the Race List screen and a race has already been selected.")
            return handleSelectedRace()
        } else if (ButtonChangeRunningStyle.check(game.imageUtils)) {
            MessageLog.i(TAG, "[RACE] The bot is currently sitting on the race screen. Most likely here for a scheduled race.")
            handleStandaloneRace()
            return true
        }

        // Clear requirement flags if no race selection buttons were found.
        clearRacingRequirementFlags()
        MessageLog.v(TAG, "********************")
        return false
    }

    /** The entry point for handling standalone races if the user started the bot on the Racing screen. */
    fun handleStandaloneRace() {
        MessageLog.v(TAG, "\n********************")
        MessageLog.v(TAG, "[RACE] Starting Standalone Racing process...")

        // Skip the race if possible, otherwise run it manually.
        runRaceWithRetries()
        finalizeRaceResults()

        MessageLog.v(TAG, "[RACE] Racing process for Standalone Race is completed. Grade: ${lastRaceGrade ?: "Standalone"}")
        MessageLog.v(TAG, "********************")
    }

    /**
     * Handles a race that has already been selected, usually via custom racing logic.
     *
     * @return True if the race was completed successfully, false otherwise.
     */
    private fun handleSelectedRace(): Boolean {
        MessageLog.v(TAG, "[RACE] Starting process for a race that is already selected.")

        // Confirm the selection and the resultant popup and then wait for the game to load.
        ButtonRace.click(game.imageUtils, tries = 30)
        game.wait(1.0)
        ButtonRace.click(game.imageUtils, tries = 10)
        game.wait(2.0)

        game.waitForLoading()

        // Skip the race if possible, otherwise run it manually.
        runRaceWithRetries()
        finalizeRaceResults(isExtra = true)

        // Clear the next smart race day tracker since we just completed a race.
        nextSmartRaceDay = null

        MessageLog.v(TAG, "[RACE] Racing process for already selected race is completed. Grade: ${lastRaceGrade ?: "OP"}")
        MessageLog.v(TAG, "********************")
        return true
    }

    /**
     * Handles the process for a mandatory race.
     *
     * @return True if the mandatory race process was completed successfully, false otherwise.
     */
    private fun handleMandatoryRace(): Boolean {
        MessageLog.v(TAG, "[RACE] Starting process for handling a mandatory race.")

        if (enableStopOnMandatoryRace) {
            MessageLog.v(TAG, "********************")
            detectedMandatoryRaceCheck = true
            return false
        }

        // For Finale races, manually set the grade and fans.
        if (campaign.date.bIsFinaleSeason && (campaign.date.day == 73 || campaign.date.day == 74 || campaign.date.day == 75)) {
            lastRaceGrade = RaceGrade.FINALE
            lastRaceFans = if (campaign.date.day == 75) 30000 else 10000
            // Distance is unknown for Finale races; per-distance strategy will fall back to blanket.
        }

        // Let the campaign handle any pre-race logic (e.g. using race items in Trackblazer).
        campaign.onScheduledRacePrepScreen()

        // If there is a popup warning about racing too many times, confirm the popup to continue as this is a mandatory race.
        if (ButtonOk.click(game.imageUtils, region = game.imageUtils.regionMiddle)) {
            game.wait(2.0)
        }

        MessageLog.v(TAG, "[RACE] Confirming the mandatory race selection.")
        ButtonRace.click(game.imageUtils, tries = 3)
        game.wait(1.0)
        MessageLog.i(TAG, "[RACE] Confirming any popup from the mandatory race selection.")
        ButtonRace.click(game.imageUtils, tries = 3)
        game.wait(2.0)

        game.waitForLoading()

        // Skip the race if possible, otherwise run it manually.
        runRaceWithRetries()
        finalizeRaceResults()

        MessageLog.v(TAG, "[RACE] Racing process for Mandatory Race is completed. Grade: ${lastRaceGrade ?: "Mandatory"}")
        MessageLog.v(TAG, "********************")
        return true
    }

    /**
     * Searches for and selects a maiden race from the race list.
     *
     * @return True if a maiden race was successfully selected, false otherwise.
     */
    private fun selectMaidenRace(): Boolean {
        // Get the bounding region of the race list.
        val raceListTopLeftBitmap: Bitmap? = IconScrollListTopLeft.template.getBitmap(game.imageUtils)
        if (raceListTopLeftBitmap == null) {
            MessageLog.e(TAG, "[ERROR] selectMaidenRace:: Failed to load IconScrollListTopLeft bitmap.")
            return false
        }

        val raceListBottomRightBitmap: Bitmap? = IconScrollListBottomRight.template.getBitmap(game.imageUtils)
        if (raceListBottomRightBitmap == null) {
            MessageLog.e(TAG, "[ERROR] selectMaidenRace:: Failed to load IconScrollListBottomRight bitmap.")
            return false
        }

        val raceListTopLeft: Point? = IconScrollListTopLeft.find(game.imageUtils).first
        if (raceListTopLeft == null) {
            MessageLog.e(TAG, "[ERROR] selectMaidenRace:: Failed to find top left corner of race list.")
            return false
        }
        val raceListBottomRight: Point? = IconScrollListBottomRight.find(game.imageUtils).first
        if (raceListBottomRight == null) {
            MessageLog.e(TAG, "[ERROR] selectMaidenRace:: Failed to find bottom right corner of race list.")
            return false
        }
        val x0 = (raceListTopLeft.x - (raceListTopLeftBitmap.width / 2)).toInt()
        val y0 = (raceListTopLeft.y - (raceListTopLeftBitmap.height / 2)).toInt()
        val x1 = (raceListBottomRight.x + (raceListBottomRightBitmap.width / 2)).toInt()
        val y1 = (raceListBottomRight.y + (raceListBottomRightBitmap.height / 2)).toInt()
        val bboxRaceList =
            BoundingBox(
                x = x0,
                y = y0,
                w = x1 - x0,
                h = y1 - y0,
            )

        // Smaller region used to detect double star icons in the race list.
        val bboxRaceListDoubleStars =
            BoundingBox(
                x = game.imageUtils.relX(bboxRaceList.x.toDouble(), 845),
                y = bboxRaceList.y,
                w = game.imageUtils.relWidth(45),
                h = bboxRaceList.h,
            )

        val bboxScrollBar =
            BoundingBox(
                x = game.imageUtils.relX(bboxRaceList.x.toDouble(), 1034),
                y = bboxRaceList.y,
                w = 10,
                h = bboxRaceList.h,
            )

        // The selected race in the race list has green brackets that overlap the scroll bar a bit.
        // Thus, we are really only interested in a single column of pixels on the right side of the scroll bar when checking for changes.
        val bboxScrollBarSingleColumn =
            BoundingBox(
                // Give ourselves a few pixels of buffer.
                x = bboxScrollBar.x + bboxScrollBar.w - 3,
                y = bboxScrollBar.y,
                w = 1,
                h = bboxScrollBar.h,
            )

        // Scroll to top of list.
        game.gestureUtils.swipe(
            (bboxRaceList.x + (bboxRaceList.w / 2)).toFloat(),
            (bboxRaceList.y + (bboxRaceList.h / 2)).toFloat(),
            (bboxRaceList.x + (bboxRaceList.w / 2)).toFloat(),
            // High value here ensures we go all the way to top of list.
            (bboxRaceList.y + (bboxRaceList.h * 10)).toFloat(),
        )
        game.wait(0.1, skipWaitingForLoading = true)
        // Tap to prevent overscrolling. This location shouldn't select any races.
        game.tap(
            game.imageUtils.relX(bboxRaceList.x.toDouble(), 15).toDouble(),
            game.imageUtils.relY(bboxRaceList.y.toDouble(), 15).toDouble(),
            ignoreWaiting = true,
        )
        // Small delay for scrolling to stop.
        game.wait(0.1, skipWaitingForLoading = true)

        var bitmap: Bitmap
        var prevScrollBarBitmap: Bitmap? = null

        // Max time limit for the while loop to search for a valid race.
        val startTime: Long = System.currentTimeMillis()
        val maxTimeMs: Long = 10000

        while (System.currentTimeMillis() - startTime < maxTimeMs) {
            bitmap = game.imageUtils.getSourceBitmap()
            val scrollBarBitmap: Bitmap? =
                game.imageUtils.createSafeBitmap(
                    bitmap,
                    bboxScrollBarSingleColumn.x,
                    bboxScrollBarSingleColumn.y,
                    bboxScrollBarSingleColumn.w,
                    bboxScrollBarSingleColumn.h,
                    "race list scrollbar right half bitmap",
                )
            if (scrollBarBitmap == null) {
                MessageLog.e(TAG, "[ERROR] selectMaidenRace:: Failed to createSafeBitmap for scrollbar.")
                return false
            }

            // If after scrolling the scrollbar hasn't changed, that means we've reached the end of the list.
            if (prevScrollBarBitmap != null && scrollBarBitmap.sameAs(prevScrollBarBitmap)) {
                Log.d(TAG, "[DEBUG] selectMaidenRace:: Scrollbar has not changed, reached end of list.")
                return false
            }

            prevScrollBarBitmap = scrollBarBitmap

            val locations: ArrayList<Point> =
                IconRaceListPredictionDoubleStar.findAll(
                    game.imageUtils,
                    region = bboxRaceListDoubleStars.toIntArray(),
                    confidence = 0.0,
                )

            if (!locations.isEmpty()) {
                Log.d(TAG, "[DEBUG] selectMaidenRace:: Found double predictions at (${locations.first().x}, ${locations.first().y}).")
                game.tap(
                    locations.first().x,
                    locations.first().y,
                    IconRaceListPredictionDoubleStar.template.path,
                    ignoreWaiting = true,
                )
                return true
            }

            // Longer swipe duration prevents overscrolling. Swipe up approximately one entry in list.
            // Each entry is roughly 200px tall and there is a 30px gap between entries.
            // For some reason with shorter durations, it overscroll too much.
            // Also with longer durations, the amount scrolled is less than the pixel amount specified so we use 500px to counter this.
            game.gestureUtils.swipe(
                (bboxRaceList.x + (bboxRaceList.w / 2)).toFloat(),
                (bboxRaceList.y + (bboxRaceList.h / 2)).toFloat(),
                (bboxRaceList.x + (bboxRaceList.w / 2)).toFloat(),
                ((bboxRaceList.y + (bboxRaceList.h / 2)) - 500).toFloat(),
                duration = 500,
            )
            game.wait(0.1, skipWaitingForLoading = true)
            // Tap to prevent overscrolling. This location shouldn't select any races.
            game.tap(
                game.imageUtils.relX(bboxRaceList.x.toDouble(), 15).toDouble(),
                game.imageUtils.relY(bboxRaceList.y.toDouble(), 15).toDouble(),
                ignoreWaiting = true,
            )
            game.wait(0.5, skipWaitingForLoading = true)
        }

        return false
    }

    /**
     * Handles the process for a maiden race.
     *
     * @return True if the maiden race process was completed successfully, false otherwise.
     */
    private fun handleMaidenRace(): Boolean {
        MessageLog.v(TAG, "[RACE] Starting process for handling a maiden race.")

        if (!ButtonRaceListFullStats.check(game.imageUtils, tries = 30)) {
            MessageLog.e(TAG, "[ERROR] handleMaidenRace:: Not at race list screen. Aborting racing...")
            // Clear requirement flags since we cannot proceed with racing.
            clearRacingRequirementFlags()
            return false
        }

        campaign.bHasCheckedForMaidenRaceToday = true
        if (IconRaceListMaidenPill.check(game.imageUtils)) {
            MessageLog.i(TAG, "[RACE] Detected maiden races in race list.")
            if (selectMaidenRace()) {
                MessageLog.v(TAG, "[RACE] Found maiden race with good aptitudes. Racing...")
            } else {
                MessageLog.v(TAG, "[RACE] Could not find any maiden races with good aptitudes. Aborting racing...")
                ButtonBack.click(game.imageUtils)
                return false
            }
        } else {
            // No maiden races available on this day. Check for extra races instead.
            MessageLog.v(TAG, "[RACE] No maiden races available on this day. Checking for extra races instead...")
            return handleExtraRace()
        }

        // Confirm the selection and the resultant popup and then wait for the game to load.
        ButtonRace.click(game.imageUtils)
        game.wait(game.dialogWaitDelay)
        val result: DialogHandlerResult = campaign.handleDialogs()
        if (result !is DialogHandlerResult.Handled || result.dialog.name != "race_details") {
            Log.w(TAG, "[WARN] handleMaidenRace:: Failed to handle dialogs. Aborting racing...")
            return false
        }
        game.wait(2.0)

        // Skip the race if possible, otherwise run it manually.
        runRaceWithRetries()
        finalizeRaceResults(isExtra = true)

        // Clear the next smart race day tracker since we just completed a race.
        nextSmartRaceDay = null

        MessageLog.v(TAG, "[RACE] Racing process for Maiden Race is completed. Grade: ${lastRaceGrade ?: "Maiden"}")
        MessageLog.v(TAG, "********************")
        return true
    }

    /**
     * Handles the process for an extra race, including smart and standard racing logic.
     *
     * @param isScheduledRace True if an extra race is currently scheduled, false otherwise.
     * @return True if the extra race process was completed successfully, false otherwise.
     */
    private fun handleExtraRace(isScheduledRace: Boolean = false): Boolean {
        MessageLog.v(TAG, "[RACE] Starting process for handling a extra race${if (isScheduledRace) " (scheduled)" else ""}.")

        // If there is a scheduled race pending, proceed to run it immediately.
        if (!isScheduledRace) {
            // Check for mandatory racing plan mode before any screen detection.
            // Bypass this check if a fan or trophy requirement is active.
            val (_, mandatoryExtraRaceData) =
                if (hasFanRequirement || hasTrophyRequirement || hasInsufficientGoalRacePtsRequirement) {
                    Pair(null, null)
                } else {
                    findMandatoryExtraRaceForCurrentTurn()
                }

            if (mandatoryExtraRaceData != null) {
                // Check if aptitudes match (both track surface and distance must be B or greater) for double predictions.
                val aptitudesMatch = checkRaceAptitudeMatch(mandatoryExtraRaceData)
                if (!aptitudesMatch) {
                    // Get the trainee's aptitude for this race's track surface/distance.
                    val trackSurfaceAptitude: Aptitude = campaign.trainee.checkTrackSurfaceAptitude(mandatoryExtraRaceData.trackSurface)
                    val trackDistanceAptitude: Aptitude = campaign.trainee.checkTrackDistanceAptitude(mandatoryExtraRaceData.trackDistance)
                    MessageLog.v(
                        TAG,
                        "[RACE] Mandatory extra race \"${mandatoryExtraRaceData.name}\" aptitudes don't match requirements (TrackSurface: $trackSurfaceAptitude, TrackDistance: $trackDistanceAptitude). Both must be B or greater.",
                    )
                    return false
                } else {
                    MessageLog.v(TAG, "[RACE] Mandatory extra race \"${mandatoryExtraRaceData.name}\" aptitudes match requirements. Proceeding to navigate to the Extra Races screen.")
                }
            }

            // Check for the consecutive race dialog before proceeding.
            val overrideIgnore: Boolean = isScheduledRace || enableForceRacing || enableMandatoryRacingPlan || hasInsufficientGoalRacePtsRequirement
            val result: DialogHandlerResult = campaign.handleDialogs(args = mapOf("overrideIgnoreConsecutiveRaceWarning" to overrideIgnore))
            if (result is DialogHandlerResult.Handled &&
                result.dialog.name == "consecutive_race_warning" &&
                !overrideIgnore
            ) {
                MessageLog.v(TAG, "[RACE] Consecutive race warning but conditions dictate to not race. Skipping...")
                return false
            }

            // Check for the existence of the extra race list button.
            val statusLocation = ButtonRaceListFullStats.find(game.imageUtils, tries = 30).first
            if (statusLocation == null) {
                MessageLog.e(TAG, "[ERROR] handleExtraRace:: Unable to determine existence of list of extra races. Canceling the racing process and doing something else.")
                // Clear requirement flags since we cannot proceed with racing.
                clearRacingRequirementFlags()
                MessageLog.v(TAG, "********************")
                return false
            }

            val maxCount = LabelRaceSelectionFans.findAll(game.imageUtils).size
            if (maxCount == 0) {
                // If there is a fan/trophy/goal pts requirement but no races available, reset the flags and proceed with training to advance the day.
                if (hasFanRequirement || hasTrophyRequirement || hasInsufficientGoalRacePtsRequirement) {
                    MessageLog.v(TAG, "[RACE] Requirement detected but no extra races available. Clearing requirement flags and proceeding with training to advance the day.")
                } else {
                    MessageLog.e(TAG, "[ERROR] handleExtraRace:: Was unable to find any extra races to select. Canceling the racing process and doing something else.")
                }
                // Always clear requirement flags when no races are available.
                clearRacingRequirementFlags()
                MessageLog.v(TAG, "********************")
                return false
            } else {
                MessageLog.i(TAG, "[RACE] There are $maxCount extra race options currently on screen.")
            }

            if (hasFanRequirement) MessageLog.v(TAG, "[RACE] Fan requirement criteria detected. This race must be completed to meet the requirement.")
            if (hasInsufficientGoalRacePtsRequirement) MessageLog.v(TAG, "[RACE] Goal race result pts requirement criteria detected. This race must be completed to meet the requirement.")
            if (hasTrophyRequirement) {
                when {
                    hasPreOpOrAboveRequirement -> {
                        MessageLog.v(TAG, "[RACE] Trophy requirement with Pre-OP or above criteria detected. Any race can be selected to meet the requirement.")
                    }

                    hasG3OrAboveRequirement -> {
                        MessageLog.v(TAG, "[RACE] Trophy requirement with G3 or above criteria detected. Any race can be selected to meet the requirement.")
                    }

                    else -> {
                        MessageLog.v(TAG, "[RACE] Trophy requirement criteria detected. Only G1 races will be selected to meet the requirement.")
                    }
                }
            }

            // Determine whether to use smart racing with user-selected races or standard racing.
            val useSmartRacing =
                if (hasFanRequirement || hasInsufficientGoalRacePtsRequirement) {
                    // If fan or goal pts requirement is needed, force standard racing to ensure the race proceeds and picks double stars.
                    false
                } else if (hasTrophyRequirement) {
                    // Trophy requirement can use smart racing as it filters to G1 races internally.
                    // Use smart racing for all years except Year 1 (Junior Year).
                    campaign.date.year != DateYear.JUNIOR
                } else if (enableRacingPlan && campaign.date.year != DateYear.JUNIOR) {
                    // Year 2 and 3: Use smart racing if conditions are met.
                    enableFarmingFans && !enableForceRacing
                } else {
                    false
                }

            val success =
                if (useSmartRacing && campaign.date.year != DateYear.JUNIOR) {
                    // Use the smart racing logic.
                    MessageLog.v(TAG, "[RACE] Using smart racing for Year ${campaign.date.year}.")
                    processSmartRacing(mandatoryExtraRaceData)
                } else {
                    // Use the standard racing logic.
                    // If needed, print the reason(s) to why the smart racing logic was not started.
                    if (enableRacingPlan && !hasFanRequirement && !hasTrophyRequirement) {
                        MessageLog.i(TAG, "[RACE] Smart racing conditions not met due to current settings, using traditional racing logic...")
                        MessageLog.i(TAG, "[RACE] Reason: One or more conditions failed:")
                        if (campaign.date.year != DateYear.JUNIOR) {
                            if (!enableFarmingFans) MessageLog.i(TAG, "[RACE]   - enableFarmingFans is false")
                            if (enableForceRacing) MessageLog.i(TAG, "[RACE]   - enableForceRacing is true")
                        } else {
                            MessageLog.i(TAG, "[RACE]   - It is currently the Junior Year.")
                        }
                    }

                    processStandardRacing()
                }

            if (!success) {
                // Clear requirement flags if race selection failed.
                Log.w(TAG, "[WARN] handleExtraRace:: Failed to select a race. Aborting racing...")
                clearRacingRequirementFlags()
                return false
            }
        } else if (isScheduledRace) {
            // Attempt to update the date if the current day is 1. This handles cases where the bot starts at the race
            // prep screen and enters the race list directly via a scheduled race dialog, bypassing the home
            // screen's date detection.
            if (campaign.date.day == 1) {
                campaign.updateDate(isOnMainScreen = false)
            }

            // Detect the grade of the scheduled race from double predictions on the race list.
            val doublePredictionLocations = IconRaceListPredictionDoubleStar.findAll(game.imageUtils)
            if (doublePredictionLocations.isNotEmpty()) {
                val raceName = game.imageUtils.extractRaceName(doublePredictionLocations[0])
                val raceDataList = lookupRaceInDatabase(campaign.date.day, raceName)
                if (raceDataList.isNotEmpty()) {
                    lastRaceGrade = raceDataList[0].grade
                    lastRaceFans = raceDataList[0].fans
                    lastRaceDistance = raceDataList[0].trackDistance
                    MessageLog.i(TAG, "[RACE] Detected scheduled race grade: $lastRaceGrade.")
                }
            }

            // Let the campaign handle any necessary logic on the scheduled race's Race Prep screen (e.g. using race items).
            campaign.onScheduledRacePrepScreen()

            MessageLog.v(TAG, "[RACE] Confirming the scheduled race dialog...")
            ButtonRace.click(game.imageUtils, tries = 30)
            game.wait(game.dialogWaitDelay)
        }

        // Confirm the selection and the resultant popup and then wait for the game to load.
        ButtonRace.click(game.imageUtils, tries = 30)
        game.wait(1.0)
        ButtonRace.click(game.imageUtils, tries = 10)
        game.wait(2.0)

        // Skip the race if possible, otherwise run it manually.
        runRaceWithRetries()
        finalizeRaceResults(isExtra = true)

        // Clear the next smart race day tracker since we just completed a race.
        nextSmartRaceDay = null

        MessageLog.v(TAG, "[RACE] Racing process for Extra Race${if (isScheduledRace) " (scheduled) " else " "}is completed. Grade: ${lastRaceGrade ?: "OP"}")
        MessageLog.v(TAG, "********************")
        return true
    }

    /**
     * Handles extra races using Smart Racing logic.
     *
     * @param mandatoryExtraRaceData Race data for the extra race that is mandatory to run. If provided, this race will be selected immediately if found on the screen.
     * @return True if a race was successfully selected and ready to run, false if the process was canceled.
     */
    private fun processSmartRacing(mandatoryExtraRaceData: RaceData? = null): Boolean {
        MessageLog.v(TAG, "[RACE] Using Smart Racing Plan logic...")

        // Update the current date and aptitudes for accurate scoring.
        campaign.updateDate()

        // Detect all double-star race predictions on screen.
        val doublePredictionLocations = IconRaceListPredictionDoubleStar.findAll(game.imageUtils)
        MessageLog.i(TAG, "[RACE] Found ${doublePredictionLocations.size} double-star prediction locations.")
        if (doublePredictionLocations.isEmpty()) {
            MessageLog.i(TAG, "[RACE] No double-star predictions found. Canceling racing process.")
            return false
        }

        // Extract race names from the screen and match them with the in-game database.
        MessageLog.i(TAG, "[RACE] Extracting race names and matching with database...")
        val currentRaces =
            doublePredictionLocations.flatMap { location ->
                val raceName = game.imageUtils.extractRaceName(location)
                val raceDataList = lookupRaceInDatabase(campaign.date.day, raceName)
                if (raceDataList.isNotEmpty()) {
                    raceDataList.forEach { raceData ->
                        MessageLog.i(TAG, "[RACE] ✓ Matched in database: ${raceData.name} (Grade: ${raceData.grade}, Fans: ${raceData.fans}, Track Surface: ${raceData.trackSurface}).")
                    }
                    raceDataList
                } else {
                    MessageLog.i(TAG, "[RACE] ✗ No match found in database for \"$raceName\".")
                    emptyList()
                }
            }

        // If mandatory extra race data is provided, immediately find and select it on screen.
        if (mandatoryExtraRaceData != null) {
            MessageLog.v(TAG, "[RACE] Mandatory mode for extra races enabled. Looking for planned race \"${mandatoryExtraRaceData.name}\" on screen for turn ${campaign.date.day}.")

            // Check if there are multiple races with the same formatted name but different fan counts.
            val raceVariants = currentRaces.filter { it.nameFormatted == mandatoryExtraRaceData.nameFormatted }
            val hasMultipleFanVariants = raceVariants.size > 1
            if (hasMultipleFanVariants) {
                MessageLog.i(TAG, "[RACE] Found ${raceVariants.size} variants with different fan counts.")
            }

            // Search for the mandatory extra race with scroll retry logic.
            // Some devices show fewer races due to shorter screen heights, so scroll down up to 2 times to check.
            val maxScrollAttempts = 2
            var currentDoublePredictions = doublePredictionLocations

            for (scrollAttempt in 0..maxScrollAttempts) {
                // Find the mandatory extra race on screen.
                val mandatoryExtraRaceLocation = findRaceLocationByName(currentDoublePredictions, mandatoryExtraRaceData.name)

                if (mandatoryExtraRaceLocation != null) {
                    // If multiple fan variants exist in the database, scroll to try to find the higher-fan version.
                    if (hasMultipleFanVariants && scrollAttempt == 0) {
                        MessageLog.i(TAG, "[RACE] Found a match but database shows multiple fan variants. Scrolling to check for higher-fan version...")

                        val newPredictions = scrollRaceListAndRedetect(scrollDown = true)
                        if (newPredictions != null) {
                            currentDoublePredictions = newPredictions
                            val higherFanLocation = findRaceLocationByName(currentDoublePredictions, mandatoryExtraRaceData.name)

                            if (higherFanLocation != null) {
                                MessageLog.i(TAG, "[RACE] ✓ Found higher-fan variant after scrolling. Selecting it.")
                                game.tap(higherFanLocation.x, higherFanLocation.y, IconRaceListPredictionDoubleStar.template.path, ignoreWaiting = true)
                                return true
                            } else {
                                // Not found after scroll, scroll back up and use the first found location.
                                MessageLog.i(TAG, "[RACE] Higher-fan variant not found after scrolling. Scrolling back up...")
                                val restoredPredictions = scrollRaceListAndRedetect(scrollDown = false)
                                if (restoredPredictions != null) {
                                    currentDoublePredictions = restoredPredictions
                                    val relocatedLocation = findRaceLocationByName(currentDoublePredictions, mandatoryExtraRaceData.name)
                                    val finalLocation = relocatedLocation ?: mandatoryExtraRaceLocation
                                    MessageLog.i(TAG, "[RACE] Mandatory extra race \"${mandatoryExtraRaceData.name}\" found. Selecting it.")
                                    game.tap(finalLocation.x, finalLocation.y, IconRaceListPredictionDoubleStar.template.path, ignoreWaiting = true)
                                    return true
                                } else {
                                    MessageLog.i(TAG, "[RACE] Could not scroll back. Using first found position.")
                                    game.tap(mandatoryExtraRaceLocation.x, mandatoryExtraRaceLocation.y, IconRaceListPredictionDoubleStar.template.path, ignoreWaiting = true)
                                    return true
                                }
                            }
                        }
                    }

                    MessageLog.v(
                        TAG,
                        "[RACE] Mandatory extra race \"${mandatoryExtraRaceData.name}\" found on screen with double predictions${if (scrollAttempt > 0) " after $scrollAttempt scroll(s)" else ""}. Selecting it immediately (skipping opportunity cost analysis).",
                    )
                    game.tap(mandatoryExtraRaceLocation.x, mandatoryExtraRaceLocation.y, IconRaceListPredictionDoubleStar.template.path, ignoreWaiting = true)
                    return true
                }

                // If not found, and we have scrolls remaining, scroll down and re-detect.
                if (scrollAttempt < maxScrollAttempts) {
                    MessageLog.i(TAG, "[RACE] Mandatory extra race \"${mandatoryExtraRaceData.name}\" not found on current screen. Scrolling down (attempt ${scrollAttempt + 1}/$maxScrollAttempts)...")

                    val newPredictions = scrollRaceListAndRedetect(scrollDown = true)
                    if (newPredictions == null) {
                        MessageLog.i(TAG, "[RACE] Stopping scroll attempts due to scroll failure.")
                        break
                    }

                    currentDoublePredictions = newPredictions
                    MessageLog.i(TAG, "[RACE] After scrolling, found ${currentDoublePredictions.size} double-star prediction locations.")
                    if (currentDoublePredictions.isEmpty()) {
                        MessageLog.i(TAG, "[RACE] No double-star predictions found after scrolling. Stopping scroll attempts.")
                        break
                    }
                }
            }

            MessageLog.v(TAG, "[RACE] Mandatory extra race \"${mandatoryExtraRaceData.name}\" not found on screen after $maxScrollAttempts scroll(s). Canceling racing process.")
            return false
        }

        if (currentRaces.isEmpty()) {
            MessageLog.i(TAG, "[RACE] No races matched in database. Canceling racing process.")
            return false
        }
        MessageLog.i(TAG, "[RACE] Successfully matched ${currentRaces.size} races in database.")

        // If trophy requirement is active, filter to only G1 races.
        // Trophy requirement is independent of racing plan and farming fans settings.
        // If Pre-OP or G3 criteria is active, any race can fulfill the requirement.
        val racesForSelection =
            if (hasTrophyRequirement && !hasPreOpOrAboveRequirement && !hasG3OrAboveRequirement) {
                val g1Races = currentRaces.filter { it.grade == RaceGrade.G1 }
                if (g1Races.isEmpty()) {
                    // No G1 races available. Cancel since trophy requirement specifically needs G1 races.
                    MessageLog.v(TAG, "[RACE] Trophy requirement active but no G1 races available. Canceling racing process (independent of racing plan/farming fans).")
                    return false
                } else {
                    MessageLog.i(TAG, "[RACE] Trophy requirement active. Filtering to ${g1Races.size} G1 races: ${g1Races.map { it.name }}.")
                    g1Races
                }
            } else if (hasTrophyRequirement && (hasPreOpOrAboveRequirement || hasG3OrAboveRequirement)) {
                if (hasPreOpOrAboveRequirement) {
                    MessageLog.i(TAG, "[RACE] Trophy requirement with Pre-OP or above criteria active. Using all ${currentRaces.size} races.")
                } else {
                    MessageLog.i(TAG, "[RACE] Trophy requirement with G3 or above criteria active. Using all ${currentRaces.size} races.")
                }
                currentRaces
            } else {
                currentRaces
            }

        // Separate matched races into planned vs unplanned.
        val (plannedRaces, regularRaces) =
            racesForSelection.partition { race ->
                userPlannedRaces.any { it.raceName == race.name }
            }

        // Log which races are user-selected vs regular.
        MessageLog.i(TAG, "[RACE] Found ${plannedRaces.size} user-selected races on screen: ${plannedRaces.map { it.name }}.")
        MessageLog.i(TAG, "[RACE] Found ${regularRaces.size} regular races on screen: ${regularRaces.map { it.name }}.")

        // Filter both lists by user Racing Plan settings.
        // If trophy requirement is active, bypass min fan filtering but still apply other filters.
        val filteredPlannedRaces =
            if (hasTrophyRequirement) {
                if (hasPreOpOrAboveRequirement || hasG3OrAboveRequirement) {
                    MessageLog.i(TAG, "[RACE] Trophy requirement active. Bypassing min fan threshold for all valid races.")
                } else {
                    MessageLog.i(TAG, "[RACE] Trophy requirement active. Bypassing min fan threshold for G1 races.")
                }
                filterRacesByCriteria(plannedRaces, bypassMinFans = true)
            } else {
                filterRacesByCriteria(plannedRaces)
            }
        val filteredRegularRaces =
            if (hasTrophyRequirement) {
                filterRacesByCriteria(regularRaces, bypassMinFans = true)
            } else {
                filterRacesByCriteria(regularRaces)
            }
        MessageLog.i(TAG, "[RACE] After filtering: ${filteredPlannedRaces.size} planned races and ${filteredRegularRaces.size} regular races remain.")

        // Combine all filtered races for Opportunity Cost analysis.
        val allFilteredRaces = filteredPlannedRaces + filteredRegularRaces
        if (allFilteredRaces.isEmpty()) {
            MessageLog.i(TAG, "[RACE] No races match current settings after filtering. Canceling racing process.")
            return false
        }

        // Evaluate whether the bot should race now using Opportunity Cost logic.
        // If fan or trophy requirement is active, bypass opportunity cost to prioritize clearing the requirement.
        if (hasFanRequirement || hasTrophyRequirement) {
            MessageLog.i(TAG, "[RACE] Bypassing opportunity cost analysis to prioritize satisfying the current requirement.")
        } else if (!evaluateOpportunityCost(allFilteredRaces, lookAheadDays)) {
            MessageLog.i(TAG, "[RACE] Smart racing suggests waiting for better opportunities. Canceling racing process.")
            return false
        }

        // Decide which races to score based on availability.
        val racesToScore =
            if (filteredPlannedRaces.isNotEmpty()) {
                // Prefer planned races, but include regular races for comparison.
                MessageLog.i(TAG, "[RACE] Prioritizing ${filteredPlannedRaces.size} planned races with ${filteredRegularRaces.size} regular races for comparison.")
                filteredPlannedRaces + filteredRegularRaces
            } else {
                // No planned races available, use regular races only.
                MessageLog.i(TAG, "[RACE] No planned races available, using ${filteredRegularRaces.size} regular races only.")
                filteredRegularRaces
            }

        // Score all eligible races with bonus for planned races.
        val scoredRaces =
            racesToScore.map { race ->
                val baseScore = scoreRace(race)
                if (plannedRaces.contains(race)) {
                    // Add a bonus for planned races.
                    val bonusScore = baseScore.copy(score = baseScore.score + 50.0)
                    MessageLog.i(TAG, "[RACE] Planned race \"${race.name}\" gets a bonus: ${game.decimalFormat.format(baseScore.score)} -> ${game.decimalFormat.format(bonusScore.score)}.")
                    bonusScore
                } else {
                    baseScore
                }
            }

        // Sort by score and find the best race.
        val sortedScoredRaces = scoredRaces.sortedByDescending { it.score }
        val bestRace = sortedScoredRaces.first()

        MessageLog.v(TAG, "[RACE] Best race selected: ${bestRace.raceData.name} (score: ${game.decimalFormat.format(bestRace.score)}).")
        if (plannedRaces.contains(bestRace.raceData)) {
            MessageLog.i(TAG, "[RACE] Selected race is from user's planned races list.")
        } else {
            MessageLog.i(TAG, "[RACE] Selected race is from regular available races.")
        }

        // Check if there are multiple races with the same formatted name but different fan counts.
        // If so, we may need to scroll to find the higher-fan version (game sorts by fan count ascending and ordered by grade).
        // Reuse the already-extracted currentRaces list instead of querying the database again.
        val targetRaceMatches = currentRaces.filter { it.nameFormatted == bestRace.raceData.nameFormatted }
        val hasMultipleFanVariants = targetRaceMatches.size > 1

        // Locates the best race on screen and selects it.
        MessageLog.v(TAG, "[RACE] Looking for target race \"${bestRace.raceData.name}\" on screen...")
        var currentDoublePredictions = doublePredictionLocations
        var targetRaceLocation = findRaceLocationByName(currentDoublePredictions, bestRace.raceData.name, logMatch = true)

        // If multiple fan variants exist, and we found one, try scrolling to find the higher-fan version.
        if (hasMultipleFanVariants && targetRaceLocation != null) {
            MessageLog.i(TAG, "[RACE] Found a match but there may be a higher-fan variant below (game sorts by fan count ascending).")
            val firstFoundLocation = targetRaceLocation

            // Scroll down to look for the higher-fan variant.
            MessageLog.i(TAG, "[RACE] Scrolling down to check for higher-fan variant...")
            val newPredictions = scrollRaceListAndRedetect(scrollDown = true)
            if (newPredictions != null) {
                currentDoublePredictions = newPredictions
                val newTargetLocation = findRaceLocationByName(currentDoublePredictions, bestRace.raceData.name)

                if (newTargetLocation != null) {
                    MessageLog.i(TAG, "[RACE] ✓ Found higher-fan variant at location (${newTargetLocation.x}, ${newTargetLocation.y}) after scrolling.")
                    targetRaceLocation = newTargetLocation
                } else {
                    // Not found after scroll, scroll back up and use the first found location.
                    MessageLog.i(TAG, "[RACE] Higher-fan variant not found after scrolling. Scrolling back up...")
                    val restoredPredictions = scrollRaceListAndRedetect(scrollDown = false)
                    if (restoredPredictions != null) {
                        currentDoublePredictions = restoredPredictions
                        targetRaceLocation = findRaceLocationByName(currentDoublePredictions, bestRace.raceData.name)

                        if (targetRaceLocation == null) {
                            MessageLog.i(TAG, "[RACE] Could not re-locate target race after scrolling back. Using last known position.")
                            targetRaceLocation = firstFoundLocation
                        } else {
                            MessageLog.i(TAG, "[RACE] ✓ Re-located target race at (${targetRaceLocation.x}, ${targetRaceLocation.y}) after scrolling back.")
                        }
                    } else {
                        MessageLog.i(TAG, "[RACE] Could not scroll back. Using first found position.")
                        targetRaceLocation = firstFoundLocation
                    }
                }
            }
        }

        if (targetRaceLocation == null) {
            MessageLog.v(TAG, "[RACE] Could not find target race \"${bestRace.raceData.name}\" on screen. Canceling racing process.")
            return false
        }

        MessageLog.v(TAG, "[RACE] Selecting smart racing choice: ${bestRace.raceData.name} (score: ${game.decimalFormat.format(bestRace.score)}).")
        game.tap(targetRaceLocation.x, targetRaceLocation.y, IconRaceListPredictionDoubleStar.template.path, ignoreWaiting = true)
        lastRaceGrade = bestRace.raceData.grade
        lastRaceFans = bestRace.raceData.fans
        lastRaceDistance = bestRace.raceData.trackDistance
        lastRaceIsRival = bestRace.raceData.isRival

        return true
    }

    /**
     * Handles extra races using the standard or traditional racing logic.
     *
     * @return True if a race was successfully selected, false if the process was canceled.
     */
    private fun processStandardRacing(): Boolean {
        MessageLog.v(TAG, "[RACE] Using traditional racing logic for extra races...")

        // Detect double-star races on screen.
        var doublePredictionLocations = IconRaceListPredictionDoubleStar.findAll(game.imageUtils)

        // If no double predictions found and fans/Pre-OP/G3/GoalPts requirement is active and is after Junior Year, scroll to find them.
        if (doublePredictionLocations.isEmpty() &&
            campaign.date.year != DateYear.JUNIOR &&
            (hasFanRequirement || hasPreOpOrAboveRequirement || hasG3OrAboveRequirement || hasInsufficientGoalRacePtsRequirement)
        ) {
            val maxScrollAttempts = 5
            MessageLog.i(TAG, "[RACE] No double-star predictions found on initial screen. Scrolling to find races to satisfy requirements...")

            for (scrollAttempt in 1..maxScrollAttempts) {
                MessageLog.i(TAG, "[RACE] Scrolling down (attempt $scrollAttempt/$maxScrollAttempts)...")
                val newPredictions = scrollRaceListAndRedetect(scrollDown = true)

                if (newPredictions == null) {
                    MessageLog.i(TAG, "[RACE] Scroll failed. Stopping scroll attempts.")
                    break
                }

                doublePredictionLocations = newPredictions
                if (doublePredictionLocations.isNotEmpty()) {
                    MessageLog.i(TAG, "[RACE] Found ${doublePredictionLocations.size} double-star prediction(s) after $scrollAttempt scroll(s).")
                    break
                }
            }
        }

        val maxCount = doublePredictionLocations.size
        if (maxCount == 0) {
            MessageLog.w(TAG, "[WARN] processStandardRacing:: No extra races with double predictions found on screen. Canceling racing process.")
            return false
        }

        // If only one race has double predictions, check if it's G1 when trophy requirement is active.
        // If Pre-OP or G3 criteria is active, any race is acceptable.
        if (maxCount == 1) {
            if (hasTrophyRequirement && !hasPreOpOrAboveRequirement && !hasG3OrAboveRequirement) {
                campaign.updateDate(isOnMainScreen = false)
                val raceName = game.imageUtils.extractRaceName(doublePredictionLocations[0])
                val raceDataList = lookupRaceInDatabase(campaign.date.day, raceName)
                // Check if any matched race is G1.
                if (raceDataList.any { it.grade == RaceGrade.G1 }) {
                    MessageLog.i(TAG, "[RACE] Only one race with double predictions and it's G1. Selecting it.")
                    game.tap(doublePredictionLocations[0].x, doublePredictionLocations[0].y, IconRaceListPredictionDoubleStar.template.path, ignoreWaiting = true)
                    return true
                } else {
                    // Not G1. Trophy requirement specifically needs G1 races, so cancel.
                    MessageLog.i(TAG, "[RACE] Trophy requirement active but only non-G1 race available. Canceling racing process...")
                    return false
                }
            } else if (hasTrophyRequirement && (hasPreOpOrAboveRequirement || hasG3OrAboveRequirement)) {
                if (hasPreOpOrAboveRequirement) {
                    MessageLog.i(TAG, "[RACE] Only one race with double predictions and Pre-OP or above criteria active. Selecting it.")
                } else {
                    MessageLog.i(TAG, "[RACE] Only one race with double predictions and G3 or above criteria active. Selecting it.")
                }
                game.tap(doublePredictionLocations[0].x, doublePredictionLocations[0].y, IconRaceListPredictionDoubleStar.template.path, ignoreWaiting = true)
                return true
            } else {
                MessageLog.i(TAG, "[RACE] Only one race with double predictions. Selecting it.")
                game.tap(doublePredictionLocations[0].x, doublePredictionLocations[0].y, IconRaceListPredictionDoubleStar.template.path, ignoreWaiting = true)
                return true
            }
        }

        // Otherwise, iterate through each extra race to determine fan gain and double prediction status.
        val sourceBitmap: Bitmap = game.imageUtils.getSourceBitmap()
        val listOfRaces = ArrayList<RaceDetails>()
        val extraRaceLocations = ArrayList<Point>()
        val raceNamesList = ArrayList<String>()

        for (count in 0 until maxCount) {
            val selectedExtraRace = IconRaceListSelectionBracketBottomRight.find(game.imageUtils).first ?: break
            extraRaceLocations.add(selectedExtraRace)

            // Extract race name for G1 filtering if trophy requirement is active.
            if (hasTrophyRequirement && count < doublePredictionLocations.size) {
                val raceName = game.imageUtils.extractRaceName(doublePredictionLocations[count])
                raceNamesList.add(raceName)
            }

            val raceDetails = game.imageUtils.determineExtraRaceFans(selectedExtraRace, sourceBitmap, forceRacing = enableForceRacing)
            listOfRaces.add(raceDetails)

            if (count + 1 < maxCount) {
                val nextX = game.imageUtils.relX(selectedExtraRace.x, -100)
                val nextY = game.imageUtils.relY(selectedExtraRace.y, 150)
                game.tap(nextX.toDouble(), nextY.toDouble(), IconRaceListSelectionBracketBottomRight.template.path, ignoreWaiting = true)
            }

            game.wait(0.5)
        }

        // If trophy requirement is active, filter to only G1 races.
        val (filteredRaces, filteredLocations, _) =
            if (hasTrophyRequirement && !hasPreOpOrAboveRequirement && !hasG3OrAboveRequirement) {
                campaign.updateDate(isOnMainScreen = false)
                val g1Indices =
                    raceNamesList.mapIndexedNotNull { index, raceName ->
                        val raceDataList = lookupRaceInDatabase(campaign.date.day, raceName)
                        // Check if any matched race is G1.
                        if (raceDataList.any { it.grade == RaceGrade.G1 }) index else null
                    }

                if (g1Indices.isEmpty()) {
                    // No G1 races available. Cancel since trophy requirement specifically needs G1 races.
                    // Trophy requirement is independent of racing plan and farming fans settings.
                    MessageLog.i(TAG, "[RACE] Trophy requirement active but no G1 races available. Canceling racing process (independent of racing plan/farming fans).")
                    return false
                } else {
                    MessageLog.i(TAG, "[RACE] Trophy requirement active. Filtering to ${g1Indices.size} G1 races.")
                    val filtered = g1Indices.map { listOfRaces[it] }
                    val filteredLocations = g1Indices.map { extraRaceLocations[it] }
                    val filteredNames = g1Indices.map { raceNamesList[it] }
                    Triple(filtered, filteredLocations, filteredNames)
                }
            } else if (hasTrophyRequirement && (hasPreOpOrAboveRequirement || hasG3OrAboveRequirement)) {
                if (hasPreOpOrAboveRequirement) {
                    MessageLog.i(TAG, "[RACE] Trophy requirement with Pre-OP or above criteria active. Using all ${listOfRaces.size} races.")
                } else {
                    MessageLog.i(TAG, "[RACE] Trophy requirement with G3 or above criteria active. Using all ${listOfRaces.size} races.")
                }
                Triple(listOfRaces, extraRaceLocations, raceNamesList)
            } else {
                Triple(listOfRaces, extraRaceLocations, raceNamesList)
            }

        // Determine max fans and select the appropriate race.
        val maxFans = filteredRaces.maxOfOrNull { it.fans } ?: -1
        if (maxFans == -1) {
            Log.w(TAG, "[RACE] Failed to determine max fans. Aborting racing...")
            return false
        }
        MessageLog.v(TAG, "[RACE] Number of fans detected for each extra race are: ${filteredRaces.joinToString(", ") { it.fans.toString() }}")

        // Evaluate which race to select based on Rival priority, maximum fans and double prediction priority.
        val index =
            if (filteredRaces.any { it.isRival }) {
                MessageLog.v(TAG, "[RACE] Rival Race(s) detected. Prioritizing Rival Races.")
                val rivalRaces = filteredRaces.filter { it.isRival }

                if (enableForceRacing) {
                    val rivalsWithDouble = rivalRaces.filter { it.hasDoublePredictions }
                    if (rivalsWithDouble.isNotEmpty()) {
                        val maxFansDouble = rivalsWithDouble.maxOf { it.fans }
                        filteredRaces.indexOfFirst { it.isRival && it.hasDoublePredictions && it.fans == maxFansDouble }
                    } else {
                        val maxRivalFans = rivalRaces.maxOf { it.fans }
                        filteredRaces.indexOfFirst { it.isRival && it.fans == maxRivalFans }
                    }
                } else {
                    val maxRivalFans = rivalRaces.maxOf { it.fans }
                    filteredRaces.indexOfFirst { it.isRival && it.fans == maxRivalFans }
                }
            } else {
                if (!enableForceRacing && !hasInsufficientGoalRacePtsRequirement) {
                    filteredRaces.indexOfFirst { it.fans == maxFans }
                } else {
                    filteredRaces.indexOfFirst { it.hasDoublePredictions }.takeIf { it != -1 } ?: filteredRaces.indexOfFirst { it.fans == maxFans }
                }
            }

        // Determine the grade of the selected race and store it for retry purposes.
        val selectedRaceName =
            if (hasTrophyRequirement && index < raceNamesList.size) {
                raceNamesList[index]
            } else {
                game.imageUtils.extractRaceName(extraRaceLocations[index])
            }
        val raceDataList = lookupRaceInDatabase(campaign.date.day, selectedRaceName)
        lastRaceGrade = raceDataList.firstOrNull()?.grade
        lastRaceFans = raceDataList.firstOrNull()?.fans ?: 0
        lastRaceDistance = raceDataList.firstOrNull()?.trackDistance
        lastRaceIsRival = filteredRaces[index].isRival

        // Selects the determined race on screen.
        MessageLog.v(TAG, "[RACE] Selecting extra race at option #${index + 1}.")
        val target = filteredLocations[index]
        game.tap(
            target.x - game.imageUtils.relWidth((100 * 1.36).toInt()),
            target.y - game.imageUtils.relHeight(70),
            IconRaceListSelectionBracketBottomRight.template.path,
            ignoreWaiting = true,
        )

        return true
    }
}
