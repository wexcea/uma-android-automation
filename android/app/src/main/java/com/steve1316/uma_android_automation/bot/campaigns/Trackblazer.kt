package com.steve1316.uma_android_automation.bot.campaigns

import android.graphics.Bitmap
import android.util.Log
import com.steve1316.automation_library.utils.MessageLog
import com.steve1316.automation_library.utils.SettingsHelper
import com.steve1316.uma_android_automation.bot.Campaign
import com.steve1316.uma_android_automation.bot.DecisionTracer
import com.steve1316.uma_android_automation.bot.DialogHandlerResult
import com.steve1316.uma_android_automation.bot.Game
import com.steve1316.uma_android_automation.bot.MainScreenAction
import com.steve1316.uma_android_automation.bot.Racing
import com.steve1316.uma_android_automation.bot.SelectionSource
import com.steve1316.uma_android_automation.bot.Training
import com.steve1316.uma_android_automation.bot.solver.SmartRaceSolverIntegration
import com.steve1316.uma_android_automation.components.ButtonBack
import com.steve1316.uma_android_automation.components.ButtonCancel
import com.steve1316.uma_android_automation.components.ButtonClose
import com.steve1316.uma_android_automation.components.ButtonConfirmUse
import com.steve1316.uma_android_automation.components.ButtonOk
import com.steve1316.uma_android_automation.components.ButtonRaceDayRace
import com.steve1316.uma_android_automation.components.ButtonRaceListFullStats
import com.steve1316.uma_android_automation.components.ButtonRaces
import com.steve1316.uma_android_automation.components.ButtonShopTrackblazer
import com.steve1316.uma_android_automation.components.ButtonSkillUp
import com.steve1316.uma_android_automation.components.ButtonTraining
import com.steve1316.uma_android_automation.components.ButtonTrainingItems
import com.steve1316.uma_android_automation.components.ButtonUseTrainingItems
import com.steve1316.uma_android_automation.components.DialogConfirmUse
import com.steve1316.uma_android_automation.components.DialogExchangeComplete
import com.steve1316.uma_android_automation.components.DialogInterface
import com.steve1316.uma_android_automation.components.DialogUtils
import com.steve1316.uma_android_automation.components.IconGoalRibbon
import com.steve1316.uma_android_automation.components.IconRaceDayRibbon
import com.steve1316.uma_android_automation.components.IconRaceListPredictionDoubleStar
import com.steve1316.uma_android_automation.components.IconTrainingEventHorseshoe
import com.steve1316.uma_android_automation.components.IconUnityCupTutorialHeader
import com.steve1316.uma_android_automation.components.LabelRivalRacer
import com.steve1316.uma_android_automation.components.LabelScheduledRace
import com.steve1316.uma_android_automation.types.DateMonth
import com.steve1316.uma_android_automation.types.DatePhase
import com.steve1316.uma_android_automation.types.DateYear
import com.steve1316.uma_android_automation.types.Mood
import com.steve1316.uma_android_automation.types.NegativeStatus
import com.steve1316.uma_android_automation.types.PositiveStatus
import com.steve1316.uma_android_automation.types.RaceGrade
import com.steve1316.uma_android_automation.types.ScannedItem
import com.steve1316.uma_android_automation.types.StatName
import com.steve1316.uma_android_automation.types.TrackDistance
import com.steve1316.uma_android_automation.types.TrackSurface
import com.steve1316.uma_android_automation.types.TrackblazerShopList
import com.steve1316.uma_android_automation.types.Trainee
import com.steve1316.uma_android_automation.utils.ScrollList
import com.steve1316.uma_android_automation.utils.ScrollListEntry
import org.json.JSONArray
import org.opencv.core.Point

/**
 * Handles the Trackblazer scenario with scenario-specific logic and handling.
 *
 * @property game The [Game] instance for interacting with the game state.
 */
class Trackblazer(game: Game) : Campaign(game) {
    /** Flag indicating if the tutorial has been disabled. */
    private var tutorialDisabled = false

    /** Representation of the item shop list along with the mapping of items to their price and effect. */
    private val shopList: TrackblazerShopList = TrackblazerShopList(game)

    init {
        shopList.getInventorySummaryCallback = { getInventorySummary() }
    }

    /** Current number of coins available to spend in the shop. */
    var shopCoins: Int = 0

    /** Map representing the current inventory of items. */
    var currentInventory: Map<String, Int> = mapOf()

    /** Map representing the mapping of bad condition items to their enums. */
    val badConditionMap =
        mapOf(
            "Fluffy Pillow" to NegativeStatus.NIGHT_OWL.statusName,
            "Pocket Planner" to NegativeStatus.SLACKER.statusName,
            "Rich Hand Cream" to NegativeStatus.SKIN_OUTBREAK.statusName,
            "Smart Scale" to NegativeStatus.SLOW_METABOLISM.statusName,
            "Aroma Diffuser" to NegativeStatus.MIGRAINE.statusName,
            "Practice Drills DVD" to NegativeStatus.PRACTICE_POOR.statusName,
        )

    /** Map representing the mapping of good condition items to their enums. */
    val goodConditionMap =
        mapOf(
            "Pretty Mirror" to PositiveStatus.CHARMING.statusName,
            "Reporter's Binoculars" to PositiveStatus.HOT_TOPIC.statusName,
            "Master Practice Guide" to PositiveStatus.PRACTICE_PERFECT.statusName,
            "Scholar's Hat" to PositiveStatus.FAST_LEARNER.statusName,
        )

    /** The limit for consecutive races before the bot should stop and recover. */
    private val consecutiveRacesLimit: Int = SettingsHelper.getIntSetting("scenarioOverrides", "trackblazerConsecutiveRacesLimit", 5)

    /** List of race grades that trigger a shop check afterward. */
    private val shopCheckGrades: List<RaceGrade> =
        try {
            val gradesString = SettingsHelper.getStringSetting("scenarioOverrides", "trackblazerShopCheckGrades", "[\"G1\",\"G2\",\"G3\"]")
            val jsonArray = JSONArray(gradesString)
            val grades = mutableListOf<RaceGrade>()
            for (i in 0 until jsonArray.length()) {
                val gradeName = jsonArray.getString(i)
                val grade = RaceGrade.fromName(gradeName)
                if (grade != null) {
                    grades.add(grade)
                }
            }
            grades
        } catch (e: Exception) {
            Log.e(TAG, "[ERROR] shopCheckGrades:: Failed to parse shopCheckGrades setting: ${e.message}")
            listOf(RaceGrade.G1, RaceGrade.G2, RaceGrade.G3)
        }

    /** List of preferred track distances for race selection prioritization. */
    private val preferredDistances: List<TrackDistance> =
        try {
            val distancesString = SettingsHelper.getStringSetting("scenarioOverrides", "trackblazerPreferredDistances", "[]")
            val jsonArray = JSONArray(distancesString)
            val distances = mutableListOf<TrackDistance>()
            for (i in 0 until jsonArray.length()) {
                val distanceName = jsonArray.getString(i)
                val distance = TrackDistance.fromName(distanceName)
                if (distance != null) {
                    distances.add(distance)
                }
            }
            distances
        } catch (e: Exception) {
            Log.e(TAG, "[ERROR] preferredDistances:: Failed to parse setting: ${e.message}")
            emptyList()
        }

    /** List of preferred track surfaces for race selection prioritization. */
    private val preferredSurfaces: List<TrackSurface> =
        try {
            val surfacesString = SettingsHelper.getStringSetting("scenarioOverrides", "trackblazerPreferredSurfaces", "[]")
            val jsonArray = JSONArray(surfacesString)
            val surfaces = mutableListOf<TrackSurface>()
            for (i in 0 until jsonArray.length()) {
                val surfaceName = jsonArray.getString(i)
                val surface = TrackSurface.fromName(surfaceName)
                if (surface != null) {
                    surfaces.add(surface)
                }
            }
            surfaces
        } catch (e: Exception) {
            Log.e(TAG, "[ERROR] preferredSurfaces:: Failed to parse setting: ${e.message}")
            emptyList()
        }

    /** Tracks the number of consecutive races performed. */
    private var consecutiveRaceCount: Int = 0

    /** Flag to prevent double incrementing the counter when OCR already updated it. */
    private var counterUpdatedByOCR: Boolean = false

    /** Whether the Reset Whistle has been used this turn. */
    private var bUsedWhistleToday: Boolean = false

    /** Whether the Good-Luck Charm has been used this turn. */
    private var bUsedCharmToday: Boolean = false

    /** Whether a race hammer has been used this turn. */
    private var bUsedHammerToday: Boolean = false

    /** Flag indicating that the bot decided to train instead of running extra races due to high stat gains. */
    private var bIsIrregularTraining: Boolean = false

    /** Tracks whether the inventory has been synced at least once during this session. */
    private var bInventorySynced: Boolean = false

    /** Flag to track when a shop check should be performed after a race. */
    private var bShouldCheckShop: Boolean = false

    /** Flag to track if the first-time Shop check for the session has been performed. */
    private var bInitialShopCheckPerformed: Boolean = false

    /** Flag indicating if the bot has checked for Irregular Training during the current turn. */
    private var bHasCheckedIrregularTrainingThisTurn: Boolean = false

    /**
     * Snapshot of the most recent analyzer pass results, captured eagerly because `confirmAndCloseItemDialog` clears `Training.cachedAnalysisResults`
     * before `recordTrainingSelection` runs. Used by `buildTrainingRunnerUps` so the Decision Report always carries the analyzer's runner-up data.
     */
    private var analysisSnapshotForReport: List<Training.TrainingAnalysisResult> = emptyList()

    /** Companion snapshot of `Training.skippedTrainingMap` taken alongside `analysisSnapshotForReport`. */
    private var skippedSnapshotForReport: Map<StatName, Training.TrainingOption> = emptyMap()

    /** Mapping of energy-restoring items to their gain values. */
    private val energyGains =
        mapOf(
            "Royal Kale Juice" to 100,
            "Vita 65" to 65,
            "Vita 40" to 40,
            "Vita 20" to 20,
            "Energy Drink MAX" to 5,
        )

    /** Threshold for energy level to use energy items. */
    private var energyThresholdToUseEnergyItems: Int = SettingsHelper.getIntSetting("scenarioOverrides", "trackblazerEnergyThreshold", 40)

    /** Whether the Reset Whistle forces training. */
    private val whistleForcesTraining: Boolean = SettingsHelper.getBooleanSetting("scenarioOverrides", "trackblazerWhistleForcesTraining", true)

    /** Whether to enable Irregular Training in between races during Trackblazer. */
    private val enableIrregularTraining: Boolean = SettingsHelper.getBooleanSetting("scenarioOverrides", "trackblazerEnableIrregularTraining", false)

    /** The minimum stat gain required for using a Good-Luck Charm to bypass failure chance. */
    private val minCharmGain: Int = SettingsHelper.getIntSetting("scenarioOverrides", "trackblazerSkipRiskyCharmTrainingBelowGain", 30)

    /** The minimum stat gain threshold for irregular training evaluation. */
    private val minIrregularGain: Int = SettingsHelper.getIntSetting("scenarioOverrides", "trackblazerIrregularTrainingMinStatGain", 30)

    /** Ordered list of energy items from lowest to highest gain, used for conservation priority. */
    private val energyItemConservationOrder = listOf("Energy Drink MAX", "Vita 20", "Vita 40", "Vita 65")

    /** Flag to bypass conservation and force-use the reserved energy item. */
    private var bForceUseReservedItem: Boolean = false

    /**
     * When mood is below NORMAL (BAD or AWFUL), training resources (Reset Whistle reshuffle, Good-Luck Charm, and Megaphones) refuse to fire if main-stat gain is below this floor.
     * Prevents wasting items on structurally low-return turns where the mood multiplier caps the gain.
     */
    private val lowMainStatGainItemFloor: Int = SettingsHelper.getIntSetting("scenarioOverrides", "trackblazerSkipBadMoodItemsBelowGain", 15)

    /** The frequency to check the shop after a race. */
    private val shopCheckFrequency: Int = SettingsHelper.getIntSetting("scenarioOverrides", "trackblazerShopCheckFrequency", 3)

    /**
     * Turn (a.k.a. `date.day`) at which Hammer/Glow Stick conservation rules start applying. Turn 65 is the turn right after Senior Year Summer training. Before this turn the bot uses Hammers freely
     * on every race it takes and uses Glow Sticks on any race awarding at least 20,000 fans (the only race-item floor that still applies pre-conservation). From this turn onward the existing finale
     * reserves and Artisan Hammer stock floors are enforced.
     */
    private val raceItemConservationStartDay: Int = 65

    /** Tracks the number of days since the last race for shop check frequency. */
    private var shopCheckCounter: Int = 0

    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // Debug Tests

    /**
     * Starts debug tests for the Trackblazer campaign.
     *
     * @return True if any tests were run, false otherwise.
     */
    override fun startTests(): Boolean {
        var bDidAnyTestsRun = super.startTests()

        val fnMap: Map<String, () -> Unit> =
            mapOf(
                "debugMode_startTrackblazerRaceSelectionTest" to ::startTrackblazerRaceSelectionTest,
                "debugMode_startTrackblazerInventorySyncTest" to ::startTrackblazerInventorySyncTest,
                "debugMode_startTrackblazerBuyItemsTest" to ::startTrackblazerBuyItemsTest,
            )

        for ((settingName, fn) in fnMap) {
            if (SettingsHelper.getBooleanSetting("debug", settingName)) {
                fn()
                bDidAnyTestsRun = true
            }
        }

        return bDidAnyTestsRun
    }

    /**
     * Debug test for Trackblazer's race selection logic.
     */
    fun startTrackblazerRaceSelectionTest() {
        MessageLog.i(TAG, "\n[TEST] Now beginning Trackblazer race selection test.")

        val sourceBitmap = game.imageUtils.getSourceBitmap()

        // If on Main Screen, navigate to the Race List screen first.
        if (checkMainScreen()) {
            MessageLog.i(TAG, "[TEST] Currently on Main Screen. Navigating to Race List...")
            if (!ButtonRaces.click(game.imageUtils, sourceBitmap = sourceBitmap) && !ButtonRaceDayRace.click(game.imageUtils, sourceBitmap = sourceBitmap)) {
                MessageLog.e(TAG, "[ERROR] startTrackblazerRaceSelectionTest:: Failed to click Races button.")
                return
            }
            game.wait(1.0)

            // Handle any consecutive race warning dialogs that might pop up.
            handleDialogs(args = mapOf("overrideIgnoreConsecutiveRaceWarning" to true))
        }

        // Now check if we are on the Race List screen.
        if (ButtonRaceListFullStats.check(game.imageUtils)) {
            // Update the date first for racing logic.
            updateDate(isOnMainScreen = false)

            MessageLog.i(TAG, "[TEST] Currently on Race List screen. Calling findSuitableRace($consecutiveRaceCount)...")
            val result = findSuitableRace(consecutiveRaceCount, preferredDistances, preferredSurfaces)

            if (result != null) {
                val (point, raceData) = result
                MessageLog.i(TAG, "[TEST] Selection Finalized: ${raceData.name} (${raceData.grade}) at (${point.x}, ${point.y}).")
            } else {
                MessageLog.i(TAG, "[TEST] findSuitableRace returned null. No suitable races found.")
            }
        } else {
            MessageLog.e(TAG, "[ERROR] startTrackblazerRaceSelectionTest:: Not on Main Screen or Race List screen. Ending test.")
        }
    }

    /**
     * Debug test for Trackblazer's inventory sync logic.
     */
    fun startTrackblazerInventorySyncTest() {
        MessageLog.i(TAG, "\n[TEST] Now beginning Trackblazer inventory sync test.")

        // If on Main Screen, open Training Items.
        if (checkMainScreen()) {
            MessageLog.i(TAG, "[TEST] Currently on Main Screen. Opening Training Items...")
            if (shopList.openTrainingItemsDialog()) {
                MessageLog.i(TAG, "[TEST] Training Items dialog opened. Calling manageInventoryItems with bDryRun = true and bQuickUseOnly = true...")
                manageInventoryItems(bQuickUseOnly = true, bDryRun = true)
            } else {
                MessageLog.e(TAG, "[ERROR] startTrackblazerInventorySyncTest:: Failed to open Training Items dialog.")
            }
        } else if (ButtonClose.check(game.imageUtils)) {
            // Assume we are already in some dialog, possibly training items.
            MessageLog.i(TAG, "[TEST] Close button detected. Assuming Training Items dialog is open. Calling manageInventoryItems...")
            manageInventoryItems(bQuickUseOnly = true, bDryRun = true)
        } else {
            MessageLog.e(TAG, "[ERROR] startTrackblazerInventorySyncTest:: Not on Main Screen or in a dialog. Ending test.")
        }
    }

    /**
     * Debug test for Trackblazer's buying process logic.
     */
    fun startTrackblazerBuyItemsTest() {
        MessageLog.i(TAG, "\n[TEST] Now beginning Trackblazer buy items test.")

        // If on Main Screen, open the Shop.
        if (checkMainScreen()) {
            MessageLog.i(TAG, "[TEST] Currently on Main Screen. Opening Shop...")
            openShop()
            game.wait(1.0)
        }

        // Check if we are in the Shop.
        if (ButtonTrainingItems.check(game.imageUtils)) {
            MessageLog.i(TAG, "[TEST] Shop detected. Calling buyItems with bDryRun = true...")
            buyItems(bDryRun = true)
        } else {
            MessageLog.e(TAG, "[ERROR] startTrackblazerBuyItemsTest:: Shop not detected. Ending test.")
        }
    }

    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////

    override fun handleDialogs(dialog: DialogInterface?, args: Map<String, Any>): DialogHandlerResult {
        val result: DialogHandlerResult = super.handleDialogs(dialog, args)
        if (result !is DialogHandlerResult.Unhandled) {
            return result
        }

        when (result.dialog.name) {
            "exchange_complete" -> {
                val boughtItems = args["itemsBought"] as? List<String> ?: emptyList()
                val quickUseItemsOnly = boughtItems.filter { shopList.shopItems[it]?.isQuickUsage == true }

                if (quickUseItemsOnly.isNotEmpty()) {
                    MessageLog.i(TAG, "[TRACKBLAZER] Quick-use items were purchased. Navigating and queuing for usage...")
                    val usedItems = shopList.useSpecificItems(quickUseItemsOnly, bUseAll = true, reason = "Quick-use after purchase.")
                    usedItems.forEach { useInventoryItem(it.first) }

                    // This clicks the "Confirm Use" button on the "Exchange Complete" dialog.
                    if (result.dialog.ok(game.imageUtils)) {
                        game.wait(0.5)
                        // This clicks the "Use Training Items" button on the "Confirm Use" dialog.
                        handleDialogs(DialogConfirmUse)
                        // This clicks the "Close" button on the "Exchange Complete" dialog after handling quick-use.
                        result.dialog.close(game.imageUtils)
                    } else {
                        // Fallback to closing the dialog if "Confirm Use" button was not found.
                        MessageLog.i(TAG, "[TRACKBLAZER] Quick-use items were identified but the \"Confirm Use\" button was not found. Closing dialog...")
                        result.dialog.close(game.imageUtils)
                    }
                } else {
                    MessageLog.i(TAG, "[TRACKBLAZER] No quick-use items were purchased. Closing dialog...")
                    result.dialog.close(game.imageUtils)
                }
            }

            "confirm_use" -> {
                result.dialog.ok(game.imageUtils)
            }

            "shop" -> {
                // Once it gets to Junior Year Early July, the shop will be unlocked for use.
                // But the date update has not happened yet, so we need to check for the previous date instead.
                if (date.year == DateYear.JUNIOR && date.month == DateMonth.JUNE && date.phase == DatePhase.LATE) {
                    MessageLog.i(TAG, "[TRACKBLAZER] Shop unlocked! Initiating the first time buying process.")
                } else {
                    MessageLog.i(TAG, "[TRACKBLAZER] Shop discount detected! Initiating buying process.")
                }

                if (result.dialog.ok(game.imageUtils)) {
                    game.wait(game.dialogWaitDelay)

                    // Clear the shop check flag and counter as the shop is already being handled.
                    bShouldCheckShop = false
                    shopCheckCounter = 0
                    bInitialShopCheckPerformed = true

                    game.wait(0.5)
                    buyItems()
                    return DialogHandlerResult.Handled(result.dialog)
                } else {
                    MessageLog.e(TAG, "[ERROR] handleDialogs:: Failed to click the OK button on the Shop dialog.")
                    return DialogHandlerResult.Unhandled(result.dialog)
                }
            }

            "training_items" -> {
                MessageLog.i(TAG, "[TRACKBLAZER] Training Items dialog detected. Closing it as it is not currently being handled by a specific process.")
                result.dialog.close(game.imageUtils)
            }

            else -> {
                Log.w(TAG, "[WARN] handleDialogs:: Unknown dialog \"${result.dialog.name}\" detected so it will not be handled.")
                return DialogHandlerResult.Unhandled(result.dialog)
            }
        }

        game.wait(0.5)
        return DialogHandlerResult.Handled(result.dialog)
    }

    override fun handleTrainingEvent() {
        if (!tutorialDisabled) {
            tutorialDisabled =
                if (IconUnityCupTutorialHeader.check(game.imageUtils)) {
                    // If the tutorial is detected, select the second option to close it.
                    MessageLog.i(TAG, "[TRACKBLAZER] Detected tutorial for Trackblazer. Closing it now.")
                    val trainingOptionLocations: ArrayList<Point> = IconTrainingEventHorseshoe.findAll(game.imageUtils)
                    if (trainingOptionLocations.size >= 2) {
                        game.tap(trainingOptionLocations[1].x, trainingOptionLocations[1].y, IconTrainingEventHorseshoe.template.path)
                        true
                    } else {
                        MessageLog.w(TAG, "[WARN] handleTrainingEvent:: Could not find training options to dismiss tutorial.")
                        false
                    }
                } else {
                    MessageLog.i(TAG, "[TRACKBLAZER] Tutorial must have already been dismissed.")
                    super.handleTrainingEvent()
                    true
                }
        } else {
            super.handleTrainingEvent()
        }
    }

    override fun recoverEnergy(sourceBitmap: Bitmap?): Boolean {
        MessageLog.i(TAG, "[TRACKBLAZER] Resetting $consecutiveRaceCount consecutive race counts due to energy recovery.")
        consecutiveRaceCount = 0
        return super.recoverEnergy(sourceBitmap)
    }

    override fun recoverMood(sourceBitmap: Bitmap?, targetMood: Mood): Boolean {
        MessageLog.i(TAG, "[TRACKBLAZER] Resetting $consecutiveRaceCount consecutive race counts due to mood recovery.")
        consecutiveRaceCount = 0
        return super.recoverMood(sourceBitmap, targetMood)
    }

    override fun hasPostRacePopups(): Boolean = true

    override fun shouldBypassSmartRacing(): Boolean = true

    override fun getMaxRetriesPerRace(): Int = SettingsHelper.getIntSetting("scenarioOverrides", "trackblazerMaxRetriesPerRace", 1)

    override fun getMaxRaceRetries(): Int = 5

    override fun getRetryEligibleGrades(): List<RaceGrade> =
        try {
            val gradesString = SettingsHelper.getStringSetting("scenarioOverrides", "trackblazerRetryRacesBeforeFinalGrades", "[\"G1\",\"G2\",\"G3\"]")
            val jsonArray = JSONArray(gradesString)
            (0 until jsonArray.length()).mapNotNull { RaceGrade.fromName(jsonArray.getString(it)) }
        } catch (e: Exception) {
            listOf(RaceGrade.G1, RaceGrade.G2, RaceGrade.G3)
        }

    /**
     * Searches the race list for a suitable Trackblazer race based on double-star predictions and grade criteria.
     *
     * Junior Year: G1/G2/G3 with double predictions. Classic/Senior: Priority racing, but if consecutive race count >= 3, only G1/G2/G3.
     *
     * @param consecutiveRaceCount Current number of consecutive races performed.
     * @param preferredDistances Optional list of preferred track distances for prioritization.
     * @param preferredSurfaces Optional list of preferred track surfaces for prioritization.
     * @return Pair of the best suitable race's location and [Racing.RaceData], or null if none found.
     */
    private fun findSuitableRace(
        consecutiveRaceCount: Int,
        preferredDistances: List<TrackDistance> = emptyList(),
        preferredSurfaces: List<TrackSurface> = emptyList(),
    ): Pair<Point, Racing.RaceData>? {
        val sb = StringBuilder()
        sb.appendLine("\n========== Trackblazer Race Selection Analysis ==========")
        sb.appendLine("Current Date: $date")
        sb.appendLine("Consecutive Race Count: $consecutiveRaceCount")

        data class Candidate(val point: Point, val race: Racing.RaceData, val detectedName: String, val isRival: Boolean)

        val allSuitableRaces = mutableListOf<Candidate>()

        // Peek the Solver's planned race so the scrollList scan can short-circuit as soon as it surfaces.
        val solverPlannedKey =
            if (racing.enableSmartRaceSolver && !racing.enableForceRacing) {
                SmartRaceSolverIntegration.peekRaceKeyForTurn(currentTurn = date.day, scenario = game.scenario)
            } else {
                null
            }
        var solverMatchedCandidate: Candidate? = null

        val scrollList = ScrollList.create(game)
        if (scrollList != null) {
            MessageLog.i(TAG, "[RACE] Scanning the whole race list for suitable races...")
            val entryRaceNamesMap = mutableMapOf<Int, List<String>>()
            scrollList.process(
                keyExtractor = { entry ->
                    val doubleStarPredictions = IconRaceListPredictionDoubleStar.findAll(game.imageUtils, sourceBitmap = entry.bitmap, region = intArrayOf(0, 0, 0, 0))
                    val names =
                        doubleStarPredictions.map { predictionLocation ->
                            val screenPoint = Point(entry.bbox.x + predictionLocation.x, entry.bbox.y + predictionLocation.y)
                            game.imageUtils.extractRaceName(screenPoint)
                        }
                    if (names.isNotEmpty()) entryRaceNamesMap[entry.index] = names
                    if (names.isEmpty()) null else names.joinToString("|")
                },
            ) { _, entry ->
                val doubleStarPredictions = IconRaceListPredictionDoubleStar.findAll(game.imageUtils, sourceBitmap = entry.bitmap, region = intArrayOf(0, 0, 0, 0))
                val cachedNames = entryRaceNamesMap[entry.index] ?: emptyList()
                for ((idx, predictionLocation) in doubleStarPredictions.withIndex()) {
                    val rivalBitmap =
                        game.imageUtils.createSafeBitmap(
                            entry.bitmap,
                            game.imageUtils.relX(predictionLocation.x, -165),
                            game.imageUtils.relY(predictionLocation.y, -165),
                            game.imageUtils.relWidth(340),
                            game.imageUtils.relHeight(80),
                            "findSuitableRace rival scan",
                        )
                    val rivalFound =
                        rivalBitmap != null &&
                            LabelRivalRacer.check(game.imageUtils, region = intArrayOf(0, 0, 0, 0), sourceBitmap = rivalBitmap)

                    if (game.debugMode) {
                        game.imageUtils.saveBitmap(rivalBitmap, "rival_scan_${predictionLocation.x}_${predictionLocation.y}")
                    }

                    val screenPoint = Point(entry.bbox.x + predictionLocation.x, entry.bbox.y + predictionLocation.y)
                    val detectedName = if (idx < cachedNames.size) cachedNames[idx] else game.imageUtils.extractRaceName(screenPoint)
                    val matches = racing.lookupRaceInDatabase(date.day, detectedName)

                    for (race in matches) {
                        var isSuitable = false
                        val reasons = mutableListOf<String>()
                        race.isRival = rivalFound

                        // Solver-scheduled races bypass the grade and consecutive-race filters: the solver already weighed those factors when picking this race.
                        val solverMatched = solverPlannedKey != null && SmartRaceSolverIntegration.isRaceKeyMatch(race, solverPlannedKey)
                        if (solverMatched) {
                            isSuitable = true
                        } else if (date.year == DateYear.JUNIOR) {
                            if (listOf(RaceGrade.G1, RaceGrade.G2, RaceGrade.G3).contains(race.grade)) {
                                isSuitable = true
                            } else {
                                reasons.add("Junior Year: Grade ${race.grade} is not G1, G2, or G3")
                            }
                        } else {
                            if (consecutiveRaceCount >= 3) {
                                if (listOf(RaceGrade.G1, RaceGrade.G2, RaceGrade.G3).contains(race.grade)) {
                                    isSuitable = true
                                } else {
                                    reasons.add("Consecutive races >= 3: Grade ${race.grade} is not G1, G2, or G3")
                                }
                            } else {
                                isSuitable = true
                            }
                        }

                        if (isSuitable) {
                            val candidate = Candidate(screenPoint, race, detectedName, rivalFound)
                            allSuitableRaces.add(candidate)
                            val suffix = if (solverMatched) " [Smart Race Solver override]" else ""
                            sb.appendLine("\n- Found Suitable Race: \"${race.name}\" (${race.grade}) Rival: $rivalFound$suffix")
                            if (solverMatched) {
                                solverMatchedCandidate = candidate
                            }
                        } else {
                            sb.appendLine("\n- Ignored Race: \"${race.name}\" (${race.grade}). Reason: ${reasons.joinToString(", ")}")
                        }
                    }
                }
                solverMatchedCandidate != null
            }
        } else {
            MessageLog.w(TAG, "[WARN] findSuitableRace:: Failed to create ScrollList. Falling back to single-page detection.")
            val doubleStarPredictions = IconRaceListPredictionDoubleStar.findAll(game.imageUtils)
            val sourceBitmap = game.imageUtils.getSourceBitmap()
            for (location in doubleStarPredictions) {
                val rivalBitmap =
                    game.imageUtils.createSafeBitmap(
                        sourceBitmap,
                        game.imageUtils.relX(location.x, -165),
                        game.imageUtils.relY(location.y, -165),
                        game.imageUtils.relWidth(320),
                        game.imageUtils.relHeight(80),
                        "findSuitableRace rival fallback",
                    )
                val rivalFound =
                    rivalBitmap != null &&
                        LabelRivalRacer.check(game.imageUtils, region = intArrayOf(0, 0, 0, 0), sourceBitmap = rivalBitmap)

                if (game.debugMode) {
                    game.imageUtils.saveBitmap(rivalBitmap, "rival_fallback_${location.x}_${location.y}")
                }

                val detectedName = game.imageUtils.extractRaceName(location)
                val matches = racing.lookupRaceInDatabase(date.day, detectedName)

                for (race in matches) {
                    var isSuitable = false
                    val reasons = mutableListOf<String>()
                    race.isRival = rivalFound

                    // Solver-scheduled races bypass the grade and consecutive-race filters: the solver already weighed those factors when picking this race.
                    val solverMatched = solverPlannedKey != null && SmartRaceSolverIntegration.isRaceKeyMatch(race, solverPlannedKey)
                    if (solverMatched) {
                        isSuitable = true
                    } else if (date.year == DateYear.JUNIOR) {
                        if (listOf(RaceGrade.G1, RaceGrade.G2, RaceGrade.G3).contains(race.grade)) {
                            isSuitable = true
                        } else {
                            reasons.add("Junior Year: Grade ${race.grade} is not G1, G2, or G3")
                        }
                    } else {
                        if (consecutiveRaceCount >= 3) {
                            if (listOf(RaceGrade.G1, RaceGrade.G2, RaceGrade.G3).contains(race.grade)) {
                                isSuitable = true
                            } else {
                                reasons.add("Consecutive races >= 3: Grade ${race.grade} is not G1, G2, or G3")
                            }
                        } else {
                            isSuitable = true
                        }
                    }

                    if (isSuitable) {
                        val candidate = Candidate(location, race, detectedName, rivalFound)
                        allSuitableRaces.add(candidate)
                        if (solverMatched) {
                            solverMatchedCandidate = candidate
                        }
                    }
                }
            }
        }

        if (allSuitableRaces.isEmpty()) {
            sb.appendLine("\nSummary: No suitable races found after analysis.")
            sb.appendLine("================================================")
            MessageLog.v(TAG, sb.toString())
            return null
        }

        // If the Solver's planned race surfaced during the scan, short-circuit straight to it — its on-screen point is still current because the scrollList stopped on that entry.
        if (solverMatchedCandidate != null) {
            val match = solverMatchedCandidate!!
            sb.appendLine("\nSelected Race: ${match.race.name} (${match.race.grade}) Rival: ${match.isRival} [Smart Race Solver pick]")
            sb.appendLine("================================================")
            MessageLog.v(TAG, sb.toString())
            MessageLog.i(TAG, "[RACE] Smart Race Solver match \"${match.race.name}\" found during scan. Skipping the rest of the scan.")
            SmartRaceSolverIntegration.markPendingRace(
                raceKey = match.race.name,
                raceName = match.race.name,
                classYear = date.year.name,
                turnNumber = date.day,
            )
            return match.point to match.race
        }

        val gradePriority =
            mapOf(
                RaceGrade.G1 to 1,
                RaceGrade.G2 to 2,
                RaceGrade.G3 to 3,
                RaceGrade.OP to 4,
                RaceGrade.PRE_OP to 5,
            )

        val sortedRaces =
            allSuitableRaces.sortedWith(
                compareByDescending<Candidate> { it.isRival }
                    .thenByDescending {
                        val distanceMatch = preferredDistances.isEmpty() || it.race.trackDistance in preferredDistances
                        val surfaceMatch = preferredSurfaces.isEmpty() || it.race.trackSurface in preferredSurfaces
                        distanceMatch && surfaceMatch
                    }
                    .thenBy { gradePriority[it.race.grade] ?: 99 },
            )
        val winner = sortedRaces.first()

        val winnerDistanceMatch = preferredDistances.isEmpty() || winner.race.trackDistance in preferredDistances
        val winnerSurfaceMatch = preferredSurfaces.isEmpty() || winner.race.trackSurface in preferredSurfaces
        sb.appendLine("\nSelected Race: ${winner.race.name} (${winner.race.grade}) Rival: ${winner.isRival}")
        sb.appendLine("Distance: ${winner.race.trackDistance}, Surface: ${winner.race.trackSurface}, Preference Match: ${winnerDistanceMatch && winnerSurfaceMatch}")
        sb.appendLine("================================================")
        MessageLog.v(TAG, sb.toString())

        return if (scrollList != null) {
            MessageLog.i(TAG, "[RACE] Scrolling to selected race: \"${winner.race.name}\"...")
            var finalWinnerPoint: Point? = null
            scrollList.process { _, entry ->
                val stars = IconRaceListPredictionDoubleStar.findAll(game.imageUtils, sourceBitmap = entry.bitmap, region = intArrayOf(0, 0, 0, 0))
                for (starLoc in stars) {
                    val screenPoint = Point(entry.bbox.x + starLoc.x, entry.bbox.y + starLoc.y)
                    val name = game.imageUtils.extractRaceName(screenPoint)
                    val matches = racing.lookupRaceInDatabase(date.day, name)

                    if (matches.any { it.name == winner.race.name }) {
                        if (game.debugMode) {
                            MessageLog.d(TAG, "[DEBUG] Found winner \"${winner.race.name}\" (Detected: \"$name\", Target: \"${winner.detectedName}\")")
                        }
                        finalWinnerPoint = screenPoint
                        return@process true
                    }
                }
                false
            }
            if (finalWinnerPoint != null) finalWinnerPoint to winner.race else null
        } else {
            winner.point to winner.race
        }
    }

    override fun onConsecutiveRaceWarningDetected(dialog: DialogInterface, args: Map<String, Any>) {
        val okButtonLocation: Point? = ButtonOk.find(game.imageUtils).first

        if (okButtonLocation != null) {
            val ocrText =
                game.imageUtils.performOCRFromReference(
                    okButtonLocation,
                    offsetX = -560,
                    offsetY = -525,
                    width = game.imageUtils.relWidth(690),
                    height = game.imageUtils.relHeight(50),
                    useThreshold = true,
                    useGrayscale = true,
                    scale = 2.0,
                    ocrEngine = "mlkit",
                    debugName = "TrackblazerConsecutiveRaceOCR",
                )

            Log.d(TAG, "[DEBUG] onConsecutiveRaceWarningDetected:: OCR text from consecutive warning: \"$ocrText\"")

            // Regex: This will put you at ([0-9]+) consecutive races.
            val match = Regex("""([0-9]+)""").find(ocrText)
            val ocrCount = match?.groups?.get(1)?.value?.toInt() ?: -1

            if (ocrCount != -1) {
                Log.d(TAG, "[DEBUG] onConsecutiveRaceWarningDetected:: OCR detected a count of $ocrCount consecutive races.")

                // Trust OCR as the primary source of truth if it successfully parses a number.
                consecutiveRaceCount = ocrCount
                counterUpdatedByOCR = true
            } else {
                MessageLog.w(TAG, "[WARN] onConsecutiveRaceWarningDetected:: Failed to parse consecutive race count from OCR. Counter will be incremented after race.")
            }
        } else {
            MessageLog.e(TAG, "[ERROR] onConsecutiveRaceWarningDetected:: Failed to find ButtonOk on consecutive race warning screen. Counter will be incremented after race.")
        }

        MessageLog.i(TAG, "[TRACKBLAZER] Current consecutive race count: $consecutiveRaceCount.")
    }

    override fun shouldAllowConsecutiveRace(args: Map<String, Any>): Boolean {
        // Block racing at 0-1 energy with 3+ consecutive races to avoid -30 stat penalty.
        if (trainee.energy <= 1 && consecutiveRaceCount >= 3) {
            if (racing.ignoreLowEnergyRacingBlock) {
                MessageLog.w(
                    TAG,
                    "[WARN] shouldAllowConsecutiveRace:: Energy critically low (${trainee.energy}%) with $consecutiveRaceCount consecutive races, but ignoreLowEnergyRacingBlock is enabled. Allowing race.",
                )
                decisionTracer.recordNote(
                    "shouldAllowConsecutiveRace: critical energy ${trainee.energy}% with $consecutiveRaceCount consec races; ignoreLowEnergyRacingBlock setting allowed it through (-30 stat risk)",
                )
            } else {
                val conserveItem = energyItemConservationOrder.firstOrNull { (currentInventory[it] ?: 0) > 0 }
                if (conserveItem != null) {
                    MessageLog.w(
                        TAG,
                        "[WARN] shouldAllowConsecutiveRace:: Energy critically low but $conserveItem exists in inventory. This should have been used in decideNextAction(). Blocking race as safety net.",
                    )
                    decisionTracer.recordRaceEligibility(
                        eligible = false,
                        reason = "Consecutive-race safety net: critical energy with $conserveItem still in inventory (should have been used); blocked",
                    )
                } else {
                    MessageLog.w(
                        TAG,
                        "[WARN] shouldAllowConsecutiveRace:: Energy is critically low (${trainee.energy}%) with $consecutiveRaceCount consecutive races. Blocking to avoid possible -30 stat penalty.",
                    )
                    decisionTracer.recordRaceEligibility(
                        eligible = false,
                        reason = "Consecutive-race safety net: energy ${trainee.energy}% with $consecutiveRaceCount races, no energy item available; blocked to avoid -30 stat penalty",
                    )
                }
                racing.encounteredRacingPopup = false
                return false
            }
        }

        // A -30 stat penalty can apply starting from 3 consecutive races.
        if (consecutiveRaceCount >= 3) {
            MessageLog.w(TAG, "[WARN] shouldAllowConsecutiveRace:: Current consecutive race count is $consecutiveRaceCount. Note that a -30 stat penalty can apply starting from 3 consecutive races!")
        }

        // Edge case: if there is only 1 turn left before a mandatory race, we can safely race
        // even if it would exceed the limit.
        val turnsRemaining = game.imageUtils.determineTurnsRemainingBeforeNextGoal()
        val onlyOneTurnLeft = turnsRemaining == 1

        // Late December is the last racing opportunity before a mandatory goal race, so ignore the limit.
        val isLateDecember = date.month == DateMonth.DECEMBER && date.phase == DatePhase.LATE

        if (consecutiveRaceCount < (consecutiveRacesLimit + 1) || onlyOneTurnLeft || isLateDecember) {
            val allowReason: String
            if (isLateDecember && consecutiveRaceCount >= (consecutiveRacesLimit + 1)) {
                MessageLog.i(
                    TAG,
                    "[TRACKBLAZER] Consecutive race count $consecutiveRaceCount >= ${consecutiveRacesLimit + 1}, but it is Late December. Ignoring limit to maximize races before mandatory goal race.",
                )
                allowReason = "Late December override: ignoring limit to max races before goal ($consecutiveRaceCount >= ${consecutiveRacesLimit + 1})"
            } else if (onlyOneTurnLeft && consecutiveRaceCount >= (consecutiveRacesLimit + 1)) {
                MessageLog.i(
                    TAG,
                    "[TRACKBLAZER] Consecutive race count $consecutiveRaceCount >= ${consecutiveRacesLimit + 1}, but only 1 turn remains before mandatory race. Racing is safe. Continuing.",
                )
                allowReason = "Only 1 turn left before mandatory race - racing past limit is safe ($consecutiveRaceCount >= ${consecutiveRacesLimit + 1})"
            } else {
                MessageLog.i(TAG, "[TRACKBLAZER] Consecutive race count $consecutiveRaceCount < ${consecutiveRacesLimit + 1}. Continuing.")
                allowReason = "Under consecutive-race limit ($consecutiveRaceCount < ${consecutiveRacesLimit + 1})"
            }
            decisionTracer.recordRaceEligibility(eligible = true, reason = "Consecutive-race check: $allowReason")
            return true
        } else {
            MessageLog.w(TAG, "[WARN] shouldAllowConsecutiveRace:: Consecutive race count $consecutiveRaceCount >= ${consecutiveRacesLimit + 1}. Aborting racing.")
            decisionTracer.recordRaceEligibility(
                eligible = false,
                reason = "Consecutive-race limit hit: $consecutiveRaceCount >= ${consecutiveRacesLimit + 1}, not Late December, more than 1 turn before mandatory",
            )
            racing.encounteredRacingPopup = false
            return false
        }
    }

    override fun shouldRetryRace(dialog: DialogInterface, args: Map<String, Any>): Boolean {
        if (racing.lastRaceGrade != null && racing.retryEligibleGrades.contains(racing.lastRaceGrade) && racing.raceRetries >= 0) {
            if (racing.lastRaceIsRival && !racing.bRetriedCurrentRace) {
                MessageLog.i(TAG, "[TRACKBLAZER] ${racing.lastRaceGrade} Rival Race retry button is available. Retrying once.")
                racing.bRetriedCurrentRace = true
            } else {
                MessageLog.i(TAG, "[TRACKBLAZER] ${racing.lastRaceGrade} race retry button is available. Retrying.")
            }

            racing.raceRetries--
            if (dialog.ok(game.imageUtils)) {
                game.wait(1.0)
            }
            return true
        }

        MessageLog.w(TAG, "[WARN] shouldRetryRace:: No retries remaining or G1/G2/G3/Rival race conditions not met.")
        return false
    }

    override fun shouldRecoverMoodFromItems(sourceBitmap: Bitmap): Boolean? {
        val hasMoodItems =
            currentInventory.any { (name, count) ->
                count > 0 && (name == "Berry Sweet Cupcake" || name == "Plain Cupcake")
            }

        if (trainee.energy >= 70) {
            // If energy is high, we prefer to rest/recover mood naturally to save items.
            MessageLog.i(TAG, "[TRACKBLAZER] Mood is ${trainee.mood} and energy is ${trainee.energy}% (>= 70%). Attempting to recover mood via rest/recreation (saving items).")
            return true
        } else if (!hasMoodItems) {
            // If energy is low, we prefer to use items. If no items are available, we must rest/recover mood manually as a fallback.
            MessageLog.i(TAG, "[TRACKBLAZER] Mood is ${trainee.mood} and energy is ${trainee.energy}% (< 70%). No mood items are available. Attempting to recover mood via rest/recreation...")
            return true
        }

        // Has mood items and energy is low — skip recovery, items will handle mood in useItems().
        return false
    }

    override fun handleRaceEventFallback(): Boolean {
        if (racing.detectedMandatoryRaceCheck) {
            return super.handleRaceEventFallback()
        }
        ButtonBack.click(game.imageUtils)
        ButtonCancel.click(game.imageUtils)
        ButtonClose.click(game.imageUtils)
        game.wait(1.0)
        handleTrackblazerTraining()
        return false
    }

    override fun handleRaceEvents(isScheduledRace: Boolean): Boolean {
        counterUpdatedByOCR = false

        // If it's not a scheduled race, we need to apply Trackblazer-specific filtering.
        if (!isScheduledRace) {
            val sourceBitmap = game.imageUtils.getSourceBitmap()

            // Check if we're at a mandatory race screen first (IconRaceDayRibbon or IconGoalRibbon).
            // If we are, we should treat it as a mandatory race and NOT an extra race.
            if (IconRaceDayRibbon.check(game.imageUtils, sourceBitmap = sourceBitmap) || IconGoalRibbon.check(game.imageUtils, sourceBitmap = sourceBitmap)) {
                MessageLog.i(TAG, "[TRACKBLAZER] Mandatory race ribbon detected. Processing as mandatory race.")
                val result = super.handleRaceEvents(true)
                // Mandatory races bypass executeAction(), so decrement the megaphone counter here to match the per-turn decrement applied to other actions.
                if (result && trainee.megaphoneTurnCounter > 0) {
                    trainee.megaphoneTurnCounter--
                    MessageLog.i(TAG, "[TRACKBLAZER] Megaphone duration reduced. Turns remaining: ${trainee.megaphoneTurnCounter}.")
                }
                return result
            }

            MessageLog.i(TAG, "[TRACKBLAZER] Checking for suitable races.")
            // We need to enter the race list to check for predictions and grades.
            // Try both standard Races button and the Race Day variant.
            if (!ButtonRaces.click(game.imageUtils, sourceBitmap = sourceBitmap) && !ButtonRaceDayRace.click(game.imageUtils, sourceBitmap = sourceBitmap)) {
                MessageLog.e(TAG, "[ERROR] handleRaceEvents:: Failed to click Races button.")
                return false
            }
            game.wait(1.0)

            // Handle any consecutive race warning dialogs that might pop up after clicking "Races".
            val dialogResult = handleDialogs()
            if (dialogResult is DialogHandlerResult.Handled && consecutiveRaceCount > consecutiveRacesLimit && game.imageUtils.determineTurnsRemainingBeforeNextGoal() != 1) {
                MessageLog.i(TAG, "[TRACKBLAZER] Consecutive race warning obeyed. Aborting racing.")
                return false
            }

            val suitableRaceResult = findSuitableRace(consecutiveRaceCount, preferredDistances, preferredSurfaces)
            if (suitableRaceResult != null) {
                val suitableRaceLocation = suitableRaceResult.first
                val raceData = suitableRaceResult.second
                MessageLog.i(TAG, "[TRACKBLAZER] Found suitable race: ${raceData.name} (${raceData.grade}). Processing items.")

                // Use race-related items (Hammers, Glow Sticks).
                // Skip OP, Pre-debut, and Maiden races as hammers provide no benefit for those grades.
                if (raceData.grade == RaceGrade.G1 || raceData.grade == RaceGrade.G2 || raceData.grade == RaceGrade.G3) {
                    useRaceItems(raceData.grade, raceData.fans)
                } else {
                    MessageLog.i(TAG, "[TRACKBLAZER] Non-G1/G2/G3 race detected (${raceData.grade}). Skipping race item usage.")
                }

                racing.lastRaceGrade = raceData.grade
                racing.lastRaceDistance = raceData.trackDistance
                racing.lastRaceIsRival = raceData.isRival
                game.tap(suitableRaceLocation.x, suitableRaceLocation.y, "race_list_prediction_double_star", ignoreWaiting = true)
                game.wait(0.5)
            } else {
                MessageLog.i(TAG, "[TRACKBLAZER] No suitable races found. Backing out and training.")
                ButtonBack.click(game.imageUtils)
                game.wait(0.5)
                return false
            }
        }

        val result = super.handleRaceEvents(isScheduledRace)
        if (result) {
            if (!counterUpdatedByOCR) {
                consecutiveRaceCount++
                MessageLog.i(TAG, "[TRACKBLAZER] Incremented consecutive race count to $consecutiveRaceCount.")
            } else {
                MessageLog.i(TAG, "[TRACKBLAZER] Consecutive race count was already updated by OCR: $consecutiveRaceCount.")
            }

            // Check if we should perform a shop check after this race.
            // Any graded race defined in the settings or any scheduled race should trigger a shop check.
            if (isScheduledRace || shopCheckGrades.contains(racing.lastRaceGrade)) {
                if (shopCheckFrequency <= 1) {
                    if (isScheduledRace) {
                        MessageLog.i(TAG, "[TRACKBLAZER] Scheduled race completed. Shop check will be performed on main screen.")
                    } else {
                        MessageLog.i(TAG, "[TRACKBLAZER] Graded race detected (${racing.lastRaceGrade}). Shop check will be performed on main screen.")
                    }
                    bShouldCheckShop = true
                } else if (shopCheckCounter == 0) {
                    MessageLog.i(TAG, "[TRACKBLAZER] Race completed. Starting shop check counter at 1. Frequency: $shopCheckFrequency.")
                    shopCheckCounter = 1
                }
            }
        }
        return result
    }

    override fun resetDailyFlags() {
        bUsedWhistleToday = false
        bUsedCharmToday = false
        bUsedHammerToday = false
        bIsIrregularTraining = false
        bHasCheckedIrregularTrainingThisTurn = false
        training.clearAnalysisCache()
    }

    override fun onBeforeMainScreenUpdate() {
        // Buy items if a shop check is pending after a race.
        if (bShouldCheckShop) {
            MessageLog.i(TAG, "[TRACKBLAZER] Pending shop check detected! Checking Shop for new items...")
            game.wait(0.5)
            if (openShop()) {
                bShouldCheckShop = false
                buyItems(bAfterRacePurchase = true)
            } else {
                MessageLog.w(TAG, "[WARN] onBeforeMainScreenUpdate:: Failed to open the shop despite pending shop check.")
            }
        }
    }

    override fun gatherDecisionInventory(): Map<String, Int> {
        // Only the items that drive Trackblazer's decision tree this turn. Energy items are aggregated under their displayable name.
        val keys = listOf("Good-Luck Charm", "Empowering Megaphone", "Motivating Megaphone", "Coaching Megaphone", "Reset Whistle", "Royal Kale Juice", "Berry Sweet Cupcake", "Plain Cupcake")
        val snapshot = mutableMapOf<String, Int>()
        keys.forEach { name -> snapshot[name] = currentInventory[name] ?: 0 }
        return snapshot
    }

    override fun gatherDecisionSettings(): DecisionTracer.SettingsSnapshot =
        DecisionTracer
            .SettingsSnapshot()
            .add("Trackblazer Energy Threshold", energyThresholdToUseEnergyItems)
            .add("Skip Risky Charm Training Below Gain", minCharmGain)
            .add("Consecutive Races Limit", consecutiveRacesLimit)
            .add("Skip Bad-Mood Items Below Gain", lowMainStatGainItemFloor)
            .add("Whistle Forces Training", whistleForcesTraining)
            .add("Irregular Training", if (enableIrregularTraining) "on (min main $minIrregularGain)" else "off")
            .add("Enable In-Game Race Agenda", racing.enableUserInGameRaceAgenda)
            .add("Max Failure Chance", "${SettingsHelper.getIntSetting("training", "maximumFailureChance")}%")
            .add(
                "Riskier Training",
                if (SettingsHelper.getBooleanSetting("training", "enableRiskyTraining")) {
                    "on (max fail ${SettingsHelper.getIntSetting("training", "riskyTrainingMaxFailureChance")}%, min main ${SettingsHelper.getIntSetting("training", "riskyTrainingMinStatGain")})"
                } else {
                    "off"
                },
            )
            .add("Race Item Conservation Start Turn", raceItemConservationStartDay)

    override fun gatherDecisionExtraState(): Map<String, String> =
        mapOf(
            "Megaphone Turns" to trainee.megaphoneTurnCounter.toString(),
            "Consecutive Races" to consecutiveRaceCount.toString(),
            "Used Charm Today" to bUsedCharmToday.toString(),
            "Used Whistle Today" to bUsedWhistleToday.toString(),
        )

    /**
     * Build the runner-up list for the Decision Report from the analyzer's cached scoring data. Trainings that the analyzer scored but did
     * not select are surfaced with their failure chance and main-stat gain. Trainings that were filtered out (`skippedTrainingMap`) come
     * through with their skip reason. The caller passes in the picked stat so the runner-up list excludes it.
     *
     * @param picked The stat that was selected this turn (omitted from the runner-up list); null when no training was selected.
     * @return Up to 5 runner-up entries representing the non-picked options analyzed this turn.
     */

    /**
     * Snapshot the analyzer's current results into `analysisSnapshotForReport` / `skippedSnapshotForReport` so the Decision Report's runner-ups
     * survive the cache clear performed by `confirmAndCloseItemDialog` later in the turn. Call this right after every `recommendTraining()` pass.
     */
    private fun captureRunnerUpsSnapshot() {
        analysisSnapshotForReport = training.cachedAnalysisResults?.toList() ?: emptyList()
        skippedSnapshotForReport = training.skippedTrainingMap.toMap()
    }

    /**
     * Pulls the picked stat's failure-chance and stat-gain map out of the snapshot so the Decision Report's `Pick:` line can show them. Returns
     * (null, null) when the pick is null or absent from both snapshots. `failureChance < 0` is treated as "OCR did not measure" and surfaced as null.
     */
    private fun pickedStatDetails(picked: StatName?): Pair<Int?, Map<StatName, Int>?> {
        if (picked == null) return null to null
        analysisSnapshotForReport.firstOrNull { it.name == picked }?.let { return it.failureChance.takeIf { fc -> fc >= 0 } to it.statGains }
        skippedSnapshotForReport[picked]?.let { return it.failureChance.takeIf { fc -> fc >= 0 } to it.statGains }
        return null to null
    }

    private fun buildTrainingRunnerUps(picked: StatName?): List<DecisionTracer.TrainingRunnerUp> {
        val analyzed = analysisSnapshotForReport
        val skipped = skippedSnapshotForReport
        val runnerUps = mutableListOf<DecisionTracer.TrainingRunnerUp>()

        StatName.entries.forEach { stat ->
            if (stat == picked) return@forEach
            // Blacklisted trainings are intentional user configuration, not a decision the bot made this turn - skip them entirely
            // so the Runner-ups list focuses on trainings that were actually evaluated.
            if (stat in training.blacklist) return@forEach
            val skipEntry = skipped[stat]
            val analyzedEntry = analyzed.firstOrNull { it.name == stat }
            when {
                skipEntry != null -> {
                    runnerUps.add(
                        DecisionTracer.TrainingRunnerUp(
                            stat = stat,
                            rejected = true,
                            reason = skipEntry.skipReason ?: "skipped (no reason recorded)",
                            failureChance = skipEntry.failureChance,
                            statGains = skipEntry.statGains,
                        ),
                    )
                }
                analyzedEntry != null -> {
                    // failureChance = -1 means OCR did not measure it; surface as null in the runner-up so the report doesn't show "fail=-1%".
                    val failureChance = analyzedEntry.failureChance.takeIf { it >= 0 }
                    runnerUps.add(
                        DecisionTracer.TrainingRunnerUp(
                            stat = stat,
                            rejected = false,
                            reason = "considered by analyzer but lost to selection",
                            failureChance = failureChance,
                            statGains = analyzedEntry.statGains,
                        ),
                    )
                }
            }
        }
        return runnerUps
    }

    override fun onMainScreenEntry() {
        // Before taking any action, check for items to use.
        // This handles Stats, Energy, Mood, and Bad Conditions.
        // Training items are only available starting Turn 13 (Junior Year Early July).
        if (date.day >= 13) {
            if (!bInitialShopCheckPerformed) {
                MessageLog.i(TAG, "[TRACKBLAZER] Performing first-time Shop check for the session...")
                if (openShop()) {
                    buyItems()
                    bInitialShopCheckPerformed = true
                }
            }

            useItems(trainee)
        }
    }

    override fun performMoodRecovery(sourceBitmap: Bitmap, targetMood: Mood): Boolean {
        // If we don't have Cupcakes, we fall back to the standard recovery method.
        return recoverMood(sourceBitmap, targetMood = targetMood)
    }

    override fun decideNextAction(): MainScreenAction {
        // Summer Training: Train during July and August in Classic/Senior.
        if (date.isSummer() && !(racing.skipSummerTrainingForAgenda && racing.enableUserInGameRaceAgenda)) {
            MessageLog.i(TAG, "[TRACKBLAZER] It is Summer. Prioritizing training.")
            decisionTracer.recordActionChoice(MainScreenAction.TRAIN, "Trackblazer: Summer prioritizes training")
            return MainScreenAction.TRAIN
        }

        // Finale: Train during the final 3 turns (Qualifier, Semifinal, Finals).
        if (date.bIsFinaleSeason && date.day >= 73) {
            MessageLog.i(TAG, "[TRACKBLAZER] It is the Finale. Prioritizing training.")
            decisionTracer.recordActionChoice(MainScreenAction.TRAIN, "Trackblazer: Finale (day >= 73) prioritizes training")
            return MainScreenAction.TRAIN
        }

        // Avoid racing and training analysis at low energy with 3+ consecutive races to prevent
        // -30 stat penalty. Energy items were already attempted in onMainScreenEntry().
        // A Good-Luck Charm in inventory is not a justification to enter training here: the
        // charm only fires after analyzeTrainings produces a selected training with measured
        // failureChance >= 20, so it cannot protect a turn whose analysis is the thing at risk.
        if (trainee.energy <= 10 && consecutiveRaceCount >= 3) {
            // Before resting, attempt to use a conserved energy item for emergency race recovery.
            val conserveItem = energyItemConservationOrder.firstOrNull { (currentInventory[it] ?: 0) > 0 }
            if (conserveItem != null) {
                MessageLog.i(
                    TAG,
                    "[TRACKBLAZER] Energy is low (${trainee.energy}%) with $consecutiveRaceCount consecutive races. Using conserved $conserveItem for emergency recovery.",
                )
                if (shopList.openTrainingItemsDialog()) {
                    bForceUseReservedItem = true
                    val itemsUsed = shopList.useSpecificItems(listOf(conserveItem), reason = "Emergency race recovery to avoid -30 stat penalty.")
                    bForceUseReservedItem = false
                    itemsUsed.forEach { (name, _) ->
                        val gain = energyGains[name] ?: 0
                        val oldEnergy = trainee.energy
                        trainee.energy = (trainee.energy + gain).coerceAtMost(100)
                        useInventoryItem(name)
                        MessageLog.i(TAG, "[TRACKBLAZER] Emergency recovery: $oldEnergy% -> ${trainee.energy}%.")
                    }
                    if (itemsUsed.isNotEmpty()) {
                        confirmAndCloseItemDialog(itemsUsed.size)
                    } else {
                        ButtonClose.click(game.imageUtils)
                        game.wait(game.dialogWaitDelay)
                    }
                }

                if (trainee.energy > 10) {
                    MessageLog.i(TAG, "[TRACKBLAZER] Energy recovered to ${trainee.energy}%. Resuming normal decision flow.")
                    // Fall through to normal racing/training logic below.
                } else {
                    MessageLog.w(TAG, "[WARN] decideNextAction:: Energy still low (${trainee.energy}%) after emergency recovery. Resting.")
                    decisionTracer.recordActionChoice(
                        MainScreenAction.REST,
                        "Trackblazer low-energy guard: energy ${trainee.energy}% still <= 10 after emergency conserved-item use ($consecutiveRaceCount consecutive races)",
                    )
                    return MainScreenAction.REST
                }
            } else {
                MessageLog.w(
                    TAG,
                    "[WARN] decideNextAction:: Energy is low (${trainee.energy}%) with $consecutiveRaceCount consecutive races and no energy items available. Resting to avoid -30 stat penalty.",
                )
                decisionTracer.recordActionChoice(
                    MainScreenAction.REST,
                    "Trackblazer low-energy guard: energy ${trainee.energy}% <= 10 with $consecutiveRaceCount consecutive races and no energy items in inventory",
                )
                return MainScreenAction.REST
            }
        }

        // Smart Race Solver pre-check: the solver's role is binary - either "race race-X today" or "no race today". When the solver picks
        // a race we defer to the racing flow. Otherwise we fall through to the legacy main-screen loop for training / rest decisions only;
        // the extra-race fallback is suppressed downstream in checkEligibilityToStartExtraRacingProcess() so unscheduled turns never race.
        if (racing.enableSmartRaceSolver && !racing.enableForceRacing) {
            val solverRaceKey = SmartRaceSolverIntegration.peekRaceKeyForTurn(currentTurn = date.day, scenario = game.scenario)
            if (solverRaceKey != null) {
                MessageLog.i(TAG, "[TRACKBLAZER] Smart Race Solver has \"$solverRaceKey\" planned for turn ${date.day}; deferring to racing flow.")
                decisionTracer.recordActionChoice(MainScreenAction.RACE, "Smart Race Solver planned race \"$solverRaceKey\" for this turn")
                return MainScreenAction.RACE
            }
        }

        if (enableIrregularTraining && date.year > DateYear.JUNIOR && !bHasCheckedIrregularTrainingThisTurn) {
            val isScheduledRace = LabelScheduledRace.check(game.imageUtils)
            val isMandatoryRace = IconRaceDayRibbon.check(game.imageUtils) || IconGoalRibbon.check(game.imageUtils)

            if (!isScheduledRace && !isMandatoryRace) {
                // Skip irregular training evaluation when energy is depleted. The charm cannot
                // fire preemptively (it requires a selected training with measured failureChance
                // >= 20), so charm presence in inventory is not a reason to enter the screen.
                if (trainee.energy <= 0) {
                    MessageLog.i(TAG, "[TRACKBLAZER] Skipping Irregular Training evaluation as energy is ${trainee.energy}%.")
                    bHasCheckedIrregularTrainingThisTurn = true
                } else if (ButtonTraining.click(game.imageUtils)) {
                    game.wait(game.dialogWaitDelay)

                    val isIrregularEvaluation = true
                    val hasCharm = !bUsedCharmToday && (currentInventory["Good-Luck Charm"] ?: 0) > 0
                    training.analyzeTrainings(
                        mapOf(
                            "ignoreFailureChance" to hasCharm,
                            "isIrregularEvaluation" to isIrregularEvaluation,
                            "minStatGainForCharm" to minCharmGain,
                            "irregularTrainingMinStatGain" to minIrregularGain,
                        ),
                    )

                    val bestTraining = training.recommendTraining(args = mapOf("isIrregularEvaluation" to true, "irregularTrainingMinStatGain" to minIrregularGain))
                    if (bestTraining != null && training.lastSelectionSource != SelectionSource.ANALYSIS) {
                        MessageLog.i(TAG, "[TRACKBLAZER] Pre-screen evaluation used fallback (${training.lastSelectionSource}): $bestTraining.")
                    }

                    if (bestTraining != null) {
                        // Stay on the training screen in order to perform the training.
                        MessageLog.i(TAG, "[TRACKBLAZER] Valid Irregular Training found ($bestTraining). Hijacking turn.")

                        bIsIrregularTraining = true
                        decisionTracer.recordActionChoice(MainScreenAction.TRAIN, "Irregular Training pre-screen found viable pick: $bestTraining")
                        return MainScreenAction.TRAIN
                    } else {
                        MessageLog.i(TAG, "[TRACKBLAZER] No valid Irregular Training found. Backing out to resume racing logic.")
                        ButtonBack.click(game.imageUtils)
                        game.wait(game.dialogWaitDelay)

                        // Mark that we've checked for Irregular Training this turn to avoid looping.
                        bHasCheckedIrregularTrainingThisTurn = true
                    }
                }
            }
        }

        // Otherwise, use base class decision logic.
        return super.decideNextAction()
    }

    override fun executeAction(action: MainScreenAction, bIsScheduledRaceDay: Boolean): Boolean {
        val result =
            when (action) {
                MainScreenAction.TRAIN -> {
                    if (bForcedWitTraining) {
                        super.executeAction(action, bIsScheduledRaceDay)
                    } else {
                        MessageLog.i(TAG, "[TRACKBLAZER] Decision made to train.")
                        handleTrackblazerTraining()
                        bHasCheckedDateThisTurn = false
                        true
                    }
                }

                else -> {
                    super.executeAction(action, bIsScheduledRaceDay)
                }
            }

        if (result && action != MainScreenAction.NONE) {
            // Turn is over, decrement megaphone counter.
            if (trainee.megaphoneTurnCounter > 0) {
                trainee.megaphoneTurnCounter--
                MessageLog.i(TAG, "[TRACKBLAZER] Megaphone duration reduced. Turns remaining: ${trainee.megaphoneTurnCounter}.")
            }

            // Increment the shop check counter if it is active.
            if (shopCheckCounter > 0) {
                shopCheckCounter++
                if (shopCheckCounter >= shopCheckFrequency) {
                    MessageLog.i(TAG, "[TRACKBLAZER] Shop check frequency reached ($shopCheckCounter / $shopCheckFrequency). Shop check will be performed on main screen.")
                    bShouldCheckShop = true
                    shopCheckCounter = 0
                } else {
                    MessageLog.i(TAG, "[TRACKBLAZER] Shop check counter: $shopCheckCounter / $shopCheckFrequency. Next check in ${shopCheckFrequency - shopCheckCounter} day(s).")
                }
            }
        }

        // Emit the Decision Report after the override's TRAIN path completes. The non-TRAIN paths delegate to super.executeAction which
        // emits there - the hasEmitted guard on DecisionTracer makes the second call here a no-op for those branches.
        if (result && action != MainScreenAction.NONE) {
            decisionTracer.emit()
        }

        return result
    }

    override fun onRaceWin() {
        MessageLog.i(TAG, "[TRACKBLAZER] Rival Race win detected via post-race popup.")
        if (shopCheckFrequency <= 1) {
            bShouldCheckShop = true
        } else if (shopCheckCounter == 0) {
            MessageLog.i(TAG, "[TRACKBLAZER] Rival Race win detected. Starting shop check counter at 1. Frequency: $shopCheckFrequency.")
            shopCheckCounter = 1
        }
    }

    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////

    /**
     * Opens the Shop UI.
     *
     * @param tries The number of scan attempts to perform to find the shop button.
     * @return True if the shop was opened successfully, false otherwise.
     */
    fun openShop(tries: Int = 5): Boolean {
        if (ButtonShopTrackblazer.click(game.imageUtils, tries = tries)) {
            game.wait(game.dialogWaitDelay)
            return true
        }

        val detectedDialog = DialogUtils.getDialog(game.imageUtils)
        if (detectedDialog != null && detectedDialog.name == "shop") {
            MessageLog.i(TAG, "[TRACKBLAZER] Shop dialog detected while trying to open the shop. Entering via dialog...")
            if (detectedDialog.ok(game.imageUtils)) {
                game.wait(game.dialogWaitDelay)
                return ButtonTrainingItems.check(game.imageUtils)
            }
        }

        MessageLog.e(TAG, "[ERROR] openShop:: Unable to open the Shop due to failing to find its button.")
        return false
    }

    /**
     * Reads the Shop Coins amount via OCR and updates our internal count.
     *
     * @return True if the Shop Coins amount was updated successfully, false otherwise.
     */
    fun updateShopCoins(): Boolean {
        MessageLog.i(TAG, "[TRACKBLAZER] Updating current amount of Shop Coins...")
        game.wait(3.0)
        val (trainingItemsButtonLocation, sourceBitmap) = ButtonTrainingItems.find(game.imageUtils, tries = 30)
        if (trainingItemsButtonLocation == null) {
            MessageLog.e(TAG, "[ERROR] updateShopCoins:: Failed to find Training Items button.")
            return false
        }
        val coinText =
            game.imageUtils.performOCROnRegion(
                sourceBitmap,
                game.imageUtils.relX(trainingItemsButtonLocation.x, -35),
                game.imageUtils.relY(trainingItemsButtonLocation.y, 80),
                game.imageUtils.relWidth(180),
                game.imageUtils.relHeight(65),
                useThreshold = false,
                useGrayscale = true,
                scale = 2.0,
                ocrEngine = "mlkit",
                debugName = "ShopCoins",
            )

        try {
            // ML Kit sometimes misreads a lone digit "1" as the letter "L". Treat that whole-string case as 1 so we don't drop a valid count of one.
            val normalizedText = if (coinText.trim().equals("L", ignoreCase = true)) "1" else coinText
            val cleanedText = normalizedText.replace(Regex("[^0-9]"), "")
            if (cleanedText.isEmpty()) {
                MessageLog.w(TAG, "[WARN] updateShopCoins:: Parsed empty string for Shop Coins from raw text: \"$coinText\".")
            } else {
                shopCoins = cleanedText.toInt()
                MessageLog.i(TAG, "[INFO] Current Shop Coins: $shopCoins (Raw OCR text: \"$coinText\")")
            }
        } catch (_: NumberFormatException) {
            MessageLog.e(TAG, "[ERROR] updateShopCoins:: Failed to parse Shop Coins from OCR text: \"$coinText\".")
        }

        return true
    }

    /**
     * Starts the process to buy items from the Shop.
     *
     * @param priorityList An ordered list of item names to buy. Defaults to an empty list.
     * @param bDryRun If true, only logs intentions without performing any clicks.
     * @param bAfterRacePurchase If true, indicates this process was triggered by a post-race shop check.
     */
    fun buyItems(priorityList: List<String> = listOf(), bDryRun: Boolean = false, bAfterRacePurchase: Boolean = false) {
        val finalPriorityList = priorityList.ifEmpty { getPriorityList() }

        if (bAfterRacePurchase) {
            MessageLog.i(TAG, "[TRACKBLAZER] Buying extra items after participating in a race...")
        }
        MessageLog.i(TAG, "[TRACKBLAZER] Initiating buying process.")

        // Update current coins via OCR before buying.
        if (!updateShopCoins()) {
            MessageLog.w(TAG, "[TRACKBLAZER] Aborting buying process due to failed Shop Coins update.")
            return
        }
        MessageLog.i(TAG, "[TRACKBLAZER] Initial Shop Coins: $shopCoins")

        // If the shop coins are 0, it is possible that the OCR failed to read them correctly.
        // In this case, we will initiate a "Force Purchase" process to attempt to buy items until we can't anymore.
        val bForcePurchase = shopCoins == 0
        if (bForcePurchase) {
            MessageLog.i(TAG, "[TRACKBLAZER] Shop coins read as 0. This may be an OCR failure. Initiating Force Purchase mode.")
        }

        val inventoryLimits =
            finalPriorityList.associateWith { itemName ->
                val itemCount = currentInventory[itemName] ?: 0
                val isBadConditionItem = badConditionMap.containsKey(itemName) || itemName == "Miracle Cure"
                val isGoodConditionItem = goodConditionMap.containsKey(itemName)

                val maxLimit =
                    if (isBadConditionItem || isGoodConditionItem) {
                        // Check if we already have the item in inventory.
                        if (itemCount >= 1) {
                            0
                        } else {
                            // Check if the condition is active/inactive.
                            if (isBadConditionItem) {
                                val condition = badConditionMap[itemName]
                                if (itemName == "Miracle Cure" || itemName == "Rich Hand Cream") {
                                    // We want to buy as many of these when possible as we will be racing above the consecutive race limit often.
                                    5
                                } else if (condition != null && trainee.currentNegativeStatuses.contains(condition)) {
                                    1
                                } else {
                                    0
                                }
                            } else {
                                val condition = goodConditionMap[itemName]
                                if (condition != null && !trainee.currentPositiveStatuses.contains(condition)) {
                                    1
                                } else {
                                    0
                                }
                            }
                        }
                    } else {
                        5
                    }

                (maxLimit - itemCount).coerceAtLeast(0)
            }

        val filteredPriorityList = finalPriorityList.filter { (inventoryLimits[it] ?: 0) > 0 }

        if (filteredPriorityList.isEmpty()) {
            MessageLog.v(TAG, getInventorySummary(withDividers = true))
        } else if (bDryRun) {
            shopList.buyItems(filteredPriorityList, shopCoins, inventoryLimits, bDryRun = true, bForcePurchase = bForcePurchase)
            return
        }

        val itemsBought = shopList.buyItems(filteredPriorityList, shopCoins, inventoryLimits, bForcePurchase = bForcePurchase)
        if (itemsBought.isNotEmpty()) {
            // Update internal inventory.
            val nextInventory = currentInventory.toMutableMap()
            itemsBought.forEach { itemName ->
                nextInventory[itemName] = (nextInventory[itemName] ?: 0) + 1
            }
            currentInventory = nextInventory.toMap()

            // Handle "Exchange Complete" dialog.
            if (handleDialogs(DialogExchangeComplete, args = mapOf("itemsBought" to itemsBought)) is DialogHandlerResult.Handled) {
                MessageLog.i(TAG, "[TRACKBLAZER] Successfully handled \"Exchange Complete\" dialog.")

                // Update internal coins count via OCR after purchase.
                updateShopCoins()
                MessageLog.i(TAG, "[TRACKBLAZER] Remaining Shop Coins: $shopCoins")

                ButtonBack.click(game.imageUtils)
                game.wait(2.0)
            }
        }

        // Exit the Shop to return to the Main screen.
        MessageLog.i(TAG, "[TRACKBLAZER] Shop process complete. Returning up to the previous screen.")
        ButtonBack.click(game.imageUtils)
        game.wait(1.0)
    }

    /**
     * Generates a priority list of items to buy based on current state and rules.
     *
     * @return An ordered list of item names.
     */
    private fun getPriorityList(): List<String> {
        val topStats = training.statPrioritization.take(3)
        val priorityList = mutableListOf<String>()

        // 1. Top Tier Priorities (Good-Luck Charms, Hammers, Glow Sticks, Priority heals, Priority Energy/Bond).
        priorityList.add("Good-Luck Charm")
        priorityList.add("Master Cleat Hammer")
        priorityList.add("Artisan Cleat Hammer")
        priorityList.add("Glow Sticks")
        priorityList.add("Royal Kale Juice")
        priorityList.add("Grilled Carrots")
        priorityList.add("Rich Hand Cream")
        priorityList.add("Miracle Cure")

        // 2. Stats (Excluding Notepads).
        val statsOrdered = listOf("Scroll", "Manual")
        val statNamesOrdered = listOf("Speed", "Stamina", "Power", "Guts", "Wit")
        statsOrdered.forEach { type ->
            statNamesOrdered.forEach { name ->
                priorityList.add("$name $type")
            }
        }

        // 3. Energy + Mood.
        priorityList.add("Vita 65")
        priorityList.add("Vita 40")
        priorityList.add("Vita 20")
        priorityList.add("Berry Sweet Cupcake")
        priorityList.add("Plain Cupcake")

        // 4. Training Effects (Megaphones and specific Ankle Weights).
        priorityList.add("Empowering Megaphone")
        priorityList.add("Motivating Megaphone")
        topStats.forEach { stat ->
            val ankleWeight =
                when (stat) {
                    StatName.SPEED -> "Speed Ankle Weights"
                    StatName.STAMINA -> "Stamina Ankle Weights"
                    StatName.POWER -> "Power Ankle Weights"
                    StatName.GUTS -> "Guts Ankle Weights"
                    else -> null
                }
            if (ankleWeight != null) priorityList.add(ankleWeight)
        }
        priorityList.add("Coaching Megaphone")
        priorityList.add("Reset Whistle")

        // 5. Heal Bad Conditions (Non-priority ones, limit 1 logic is handled in buyItems()).
        priorityList.add("Fluffy Pillow")
        priorityList.add("Pocket Planner")
        priorityList.add("Smart Scale")
        priorityList.add("Aroma Diffuser")
        priorityList.add("Practice Drills DVD")

        // 6. Training Facilities (Top 3 stats only).
        topStats.forEach { stat ->
            val trainingApp =
                when (stat) {
                    StatName.SPEED -> "Speed Training Application"
                    StatName.STAMINA -> "Stamina Training Application"
                    StatName.POWER -> "Power Training Application"
                    StatName.GUTS -> "Guts Training Application"
                    StatName.WIT -> "Wit Training Application"
                }
            priorityList.add(trainingApp)
        }

        // 7. Other Energy Items.
        priorityList.add("Energy Drink MAX")
        priorityList.add("Energy Drink MAX EX")

        // 8. Good Condition Items
        priorityList.add("Pretty Mirror")
        priorityList.add("Reporter's Binoculars")
        priorityList.add("Master Practice Guide")
        priorityList.add("Scholar's Hat")

        return priorityList
    }

    /**
     * Decrements an item's count in the internal inventory.
     *
     * @param itemName The name of the item used.
     */
    private fun useInventoryItem(itemName: String) {
        val nextInventory = currentInventory.toMutableMap()
        val count = nextInventory[itemName] ?: 0
        if (count > 0) {
            nextInventory[itemName] = count - 1
            MessageLog.i(TAG, "[TRACKBLAZER] Decremented $itemName. Remaining: ${nextInventory[itemName]}.")
        }
        currentInventory = nextInventory.toMap()
    }

    /**
     * Confirms the usage of items and closes the Training Items dialog.
     *
     * @param itemsUsedCount The number of items used during this pass to determine the animation delay.
     */
    private fun confirmAndCloseItemDialog(itemsUsedCount: Int = 1) {
        MessageLog.i(TAG, "[TRACKBLAZER] Confirming usage of $itemsUsedCount items.")
        ButtonConfirmUse.click(game.imageUtils)
        game.wait(game.dialogWaitDelay)
        ButtonUseTrainingItems.click(game.imageUtils)

        // Lengthy delay here for the animation to finish.
        // We increase the delay by a second for each additional item to be used after 3 items.
        val animationDelay = if (itemsUsedCount > 3) 4.0 + (itemsUsedCount - 3) else 4.0
        MessageLog.i(TAG, "[TRACKBLAZER] Waiting for animation to finish (Delay: $animationDelay seconds).")
        game.wait(animationDelay)

        // Finalize by closing the dialog.
        MessageLog.i(TAG, "[TRACKBLAZER] Closing training items dialog.")
        if (ButtonClose.check(game.imageUtils, tries = 50)) {
            game.wait(1.0)
            ButtonClose.click(game.imageUtils)
            game.wait(1.0)
        }

        // Clear the training analysis cache so that the bot re-evaluates the training options if it re-enters the training screen.
        training.clearAnalysisCache()
    }

    /**
     * Clicks the plus button for an item in the item list and updates inventory.
     *
     * @param itemName The name of the item.
     * @param entry The ScrollListEntry of the item.
     * @param logMessage The message to log when clicking.
     * @param nextInventory The current inventory map being updated during this pass.
     * @param recheck If true, captures a fresh crop of the entry to re-verify the button state.
     * @param reason Optional reason for using the item.
     * @return True if the button was clicked, false otherwise.
     */
    private fun clickItemPlusButton(itemName: String, entry: ScrollListEntry, logMessage: String, nextInventory: MutableMap<String, Int>, recheck: Boolean = false, reason: String? = null): Boolean {
        val bitmapToUse: Bitmap =
            if (recheck) {
                val source = game.imageUtils.getSourceBitmap()
                game.imageUtils.createSafeBitmap(source, entry.bbox.x, entry.bbox.y, entry.bbox.w, entry.bbox.h, "recheck item")
            } else {
                entry.bitmap
            } ?: return false

        if (ButtonSkillUp.checkDisabled(game.imageUtils, bitmapToUse) == true) return false

        val plusPoint = ButtonSkillUp.findImageWithBitmap(game.imageUtils, bitmapToUse)
        if (plusPoint != null) {
            MessageLog.i(TAG, logMessage)
            game.tap(entry.bbox.x + plusPoint.x, entry.bbox.y + plusPoint.y)

            // Update the provided inventory map.
            val count = nextInventory[itemName] ?: 0
            if (count > 0) {
                nextInventory[itemName] = count - 1
                MessageLog.i(TAG, "[TRACKBLAZER] Decremented $itemName. Remaining: ${nextInventory[itemName]}.")
            }

            return true
        }
        return false
    }

    /**
     * Handles the specialized training process for Trackblazer, including item usage.
     */
    private fun handleTrackblazerTraining() {
        MessageLog.i(TAG, "[TRACKBLAZER] Starting specialized Training process.")

        // Fast path: Already on the training screen from irregular training evaluation.
        if (bIsIrregularTraining) {
            MessageLog.i(TAG, "[TRACKBLAZER] Using existing irregular training analysis (already on Training screen).")
            val trainingSelected: StatName? = training.recommendTraining(args = mapOf("isIrregularEvaluation" to true, "irregularTrainingMinStatGain" to minIrregularGain))
            captureRunnerUpsSnapshot()
            if (trainingSelected != null && training.lastSelectionSource != SelectionSource.ANALYSIS) {
                MessageLog.i(TAG, "[TRACKBLAZER] On-screen evaluation used fallback (${training.lastSelectionSource}): $trainingSelected.")
            }

            // Still use training items (megaphones, ankle weights, charms, energy, stat items, etc.)
            if (date.day >= 13) {
                useItems(trainee, trainingSelected)
            }

            if (trainingSelected != null) {
                val (pickFail, pickGains) = pickedStatDetails(trainingSelected)
                decisionTracer.recordTrainingSelection(
                    selected = trainingSelected,
                    source = training.lastSelectionSource,
                    reason = "Irregular Training fast-path (already on Training screen from pre-screen evaluation)",
                    runnerUps = buildTrainingRunnerUps(trainingSelected),
                    pickedFailureChance = pickFail,
                    pickedStatGains = pickGains,
                )
                training.executeTraining(trainingSelected)
            } else {
                MessageLog.w(TAG, "[WARN] handleTrackblazerTraining:: Irregular training unexpectedly became null. Backing out.")
                decisionTracer.recordTrainingSelection(
                    selected = null,
                    source = training.lastSelectionSource,
                    reason = "Irregular Training fast-path lost its selection (recommendTraining returned null after pre-screen pick); backing out",
                    runnerUps = buildTrainingRunnerUps(null),
                )
                ButtonBack.click(game.imageUtils)
                game.wait(game.dialogWaitDelay)
            }

            bIsIrregularTraining = false
            training.firstTrainingCheck = false
            return
        }

        // Enter the Training screen.
        if (!ButtonTraining.click(game.imageUtils)) {
            MessageLog.e(TAG, "[ERROR] handleTrackblazerTraining:: Failed to enter Training screen.")
            return
        }
        game.wait(0.5)

        // Initial Training Analysis.
        val hasCharm = date.day >= 13 && !bUsedCharmToday && (currentInventory["Good-Luck Charm"] ?: 0) > 0
        training.analyzeTrainings(mapOf("ignoreFailureChance" to hasCharm, "minStatGainForCharm" to minCharmGain))
        var trainingSelected: StatName? = training.recommendTraining()
        captureRunnerUpsSnapshot()
        if (trainingSelected != null && training.lastSelectionSource != SelectionSource.ANALYSIS) {
            MessageLog.i(TAG, "[TRACKBLAZER] Initial training selection used fallback (${training.lastSelectionSource}): $trainingSelected.")
        }

        // Finally, perform a consolidated item usage pass after the training is finalized.
        if (date.day >= 13) {
            useItems(trainee, trainingSelected)
        }

        // Reset Whistle Check: Use if recommendations are poor.
        // We define "poor" as no training being selected or certain other conditions.
        // Block whistling during irregular training evaluations.

        // Limit automated whistle usage to during summer or near end of senior (Turns 37-40, >60)
        if ((date.day in 37..40 || date.day > 60) && !bUsedWhistleToday && trainingSelected == null && !bIsIrregularTraining && !training.needsEnergyRecovery) {
            val hasWhistle = (currentInventory["Reset Whistle"] ?: 0) > 0

            // Whistle viability gate: when mood is below NORMAL, the mood multiplier structurally caps gains.
            // Reshuffling trainings won't recover from that — so refuse to consume the Whistle if enough
            // non-blacklisted trainings already show low main-stat gain. The required count scales with the
            // blacklist size: 0 blacklisted -> 3-of-5, 1 blacklisted -> 2-of-4, 2+ blacklisted -> 1 (clamped).
            val whistleGateBlocks =
                if (trainee.mood < Mood.NORMAL) {
                    val blacklistSize = training.blacklist.filterNotNull().size
                    val requiredLowGainCount = (3 - blacklistSize).coerceAtLeast(1)
                    val results = training.cachedAnalysisResults ?: emptyList()
                    val nonBlacklisted = results.filter { it.name !in training.blacklist }
                    val lowGainCount = nonBlacklisted.count { (it.statGains[it.name] ?: 0) < lowMainStatGainItemFloor }
                    val blocks = lowGainCount >= requiredLowGainCount
                    if (blocks) {
                        MessageLog.i(
                            TAG,
                            "[TRACKBLAZER] Refusing Reset Whistle reshuffle: mood=${trainee.mood}, $lowGainCount of ${nonBlacklisted.size} non-blacklisted trainings have main gain below floor ($lowMainStatGainItemFloor). Reshuffling won't recover from the mood penalty.",
                        )
                    }
                    blocks
                } else {
                    false
                }

            if (whistleGateBlocks) {
                // Whistle usage was skipped such that trainingSelected stays null and the existing recovery branch below fires.
                decisionTracer.recordWhistleOutcome(
                    DecisionTracer.WhistleVerdict.BLOCKED,
                    "Mood ${trainee.mood} would cap gains after reshuffle; refusing to spend Whistle on a near-no-op turn",
                )
            } else if (hasWhistle) {
                MessageLog.i(TAG, "[TRACKBLAZER] No suitable training found. Using Reset Whistle.")
                if (shopList.openTrainingItemsDialog()) {
                    if (shopList.useSpecificItems(listOf("Reset Whistle"), reason = "No suitable training found.").isNotEmpty()) {
                        confirmAndCloseItemDialog(1)

                        useInventoryItem("Reset Whistle")
                        bUsedWhistleToday = true

                        // Re-analyze after shuffle.
                        MessageLog.i(TAG, "[TRACKBLAZER] Re-analyzing trainings after Reset Whistle.")
                        training.analyzeTrainings(mapOf("ignoreFailureChance" to hasCharm, "minStatGainForCharm" to minCharmGain))
                        trainingSelected = training.recommendTraining(forceSelection = whistleForcesTraining)
                        captureRunnerUpsSnapshot()

                        when {
                            trainingSelected == null -> {
                                MessageLog.i(TAG, "[TRACKBLAZER] Reset Whistle re-analysis returned no training; nothing to execute.")
                                decisionTracer.recordWhistleOutcome(
                                    DecisionTracer.WhistleVerdict.USED,
                                    "Re-analysis after Whistle still produced no acceptable training",
                                    postRollSelection = null,
                                )
                            }
                            training.lastSelectionSource == SelectionSource.FORCED_FROM_SKIPPED -> {
                                // The forced pick comes from the rejected pool, so by definition either its main gain is below minCharmGain or its failure is too high to clear without a charm.
                                // If the analyzer's charm gates would suppress the charm anyway, executing this pick is a near-certain failure with no defensive item.
                                // Abandon this and let the recovery branch below take Rest/Recreation.
                                val forcedCandidate = training.cachedAnalysisResults?.firstOrNull { it.name == trainingSelected }
                                val forcedFail = forcedCandidate?.failureChance ?: 0
                                val forcedMainGain = forcedCandidate?.statGains?.get(trainingSelected) ?: 0
                                val charmAvailable = (currentInventory["Good-Luck Charm"] ?: 0) > 0
                                val charmWouldFire =
                                    charmAvailable && !bUsedCharmToday && forcedFail >= 20 && !shouldConserveTrainingEffectItems(trainingSelected, trainee) && forcedMainGain >= minCharmGain
                                if (!charmWouldFire && forcedFail >= 50) {
                                    MessageLog.i(
                                        TAG,
                                        "[TRACKBLAZER] Skipping Whistle force-pick: $trainingSelected at $forcedFail% fail with no Good-Luck Charm. Falling back to recovery.",
                                    )
                                    decisionTracer.recordWhistleOutcome(
                                        DecisionTracer.WhistleVerdict.USED,
                                        "Re-analysis force-picked $trainingSelected at $forcedFail% fail but charm cannot fire; abandoned to recovery",
                                        postRollSelection = null,
                                    )
                                    trainingSelected = null
                                } else {
                                    MessageLog.i(
                                        TAG,
                                        "[TRACKBLAZER] Reset Whistle re-analysis still rejected all trainings; Whistle Forces Training is enabled, " +
                                            "so executing forced pick: $trainingSelected. Megaphone (if available) will be applied to this forced selection.",
                                    )
                                    decisionTracer.recordWhistleOutcome(
                                        DecisionTracer.WhistleVerdict.USED,
                                        "Re-analysis rejected all trainings; Whistle Forces Training enabled, force-pick $trainingSelected (fail=$forcedFail%, gain=$forcedMainGain)",
                                        postRollSelection = trainingSelected,
                                    )
                                }
                            }
                            training.lastSelectionSource != SelectionSource.ANALYSIS -> {
                                MessageLog.i(TAG, "[TRACKBLAZER] Reset Whistle re-analysis used fallback (${training.lastSelectionSource}): $trainingSelected.")
                                decisionTracer.recordWhistleOutcome(
                                    DecisionTracer.WhistleVerdict.USED,
                                    "Re-analysis used ${training.lastSelectionSource} fallback to pick $trainingSelected",
                                    postRollSelection = trainingSelected,
                                )
                            }
                            else -> {
                                MessageLog.i(TAG, "[TRACKBLAZER] Reset Whistle re-analysis selected: $trainingSelected.")
                                decisionTracer.recordWhistleOutcome(
                                    DecisionTracer.WhistleVerdict.USED,
                                    "Re-analysis selected $trainingSelected from new shuffle",
                                    postRollSelection = trainingSelected,
                                )
                            }
                        }

                        // Perform another consolidated item usage pass if needed after shuffle.
                        useItems(trainee, trainingSelected)
                    } else {
                        MessageLog.i(TAG, "[TRACKBLAZER] No Reset Whistles found in inventory.")
                        decisionTracer.recordWhistleOutcome(
                            DecisionTracer.WhistleVerdict.NOT_IN_INVENTORY,
                            "Cached inventory had Whistle but in-dialog scan returned no usable Whistles",
                        )
                        ButtonClose.click(game.imageUtils)
                        game.wait(game.dialogWaitDelay, skipWaitingForLoading = true)
                    }
                }
            } else {
                MessageLog.i(TAG, "[TRACKBLAZER] No suitable training found and no Reset Whistles in cached inventory or all are disabled.")
                decisionTracer.recordWhistleOutcome(
                    DecisionTracer.WhistleVerdict.NOT_IN_INVENTORY,
                    "No Reset Whistles in cached inventory (or all disabled in dialog)",
                )
            }
        } else if (training.needsEnergyRecovery && trainingSelected == null) {
            MessageLog.i(TAG, "[TRACKBLAZER] Skipping Reset Whistle as energy recovery is needed, not a training re-roll.")
            decisionTracer.recordWhistleOutcome(
                DecisionTracer.WhistleVerdict.NOT_ELIGIBLE,
                "Recovery is needed (training.needsEnergyRecovery=true) - reshuffling won't help",
            )
        } else if (trainingSelected == null && (date.day !in 37..40 && date.day <= 60)) {
            // Selection failed but the Whistle window is closed - explain in the report why no reshuffle was attempted.
            decisionTracer.recordWhistleOutcome(
                DecisionTracer.WhistleVerdict.NOT_ELIGIBLE,
                "Outside Whistle window (day=${date.day}, allowed: 37..40 or > 60)",
            )
        }

        // Final Training Execution.
        if (trainingSelected != null) {
            val (pickFail, pickGains) = pickedStatDetails(trainingSelected)
            decisionTracer.recordTrainingSelection(
                selected = trainingSelected,
                source = training.lastSelectionSource,
                reason =
                    if (bUsedWhistleToday) {
                        "Final pick selected by analyzer after Reset Whistle re-roll"
                    } else {
                        "Final pick selected by initial analyzer pass (no Reset Whistle used)"
                    },
                runnerUps = buildTrainingRunnerUps(trainingSelected),
                pickedFailureChance = pickFail,
                pickedStatGains = pickGains,
            )
            training.executeTraining(trainingSelected)
            training.firstTrainingCheck = false
        } else {
            // Most optimal action must be taken if no suitable training is found to avoid a dead/wasted turn.
            // Resting has 62.5% chance of being +50 energy, Shrine (remove status conditions) has 30% chance in recreation.
            if (trainee.mood <= Mood.NORMAL || trainee.energy <= 50) {
                MessageLog.i(TAG, "[TRACKBLAZER] Still no suitable training found. Backing out for recovery.")
                decisionTracer.recordTrainingSelection(
                    selected = null,
                    source = training.lastSelectionSource,
                    reason = "No training selected; mood ${trainee.mood} <= NORMAL or energy ${trainee.energy}% <= 50 - backing out for recovery",
                    runnerUps = buildTrainingRunnerUps(null),
                )

                // firstTrainingCheck is false since there is no suitable training (breaks looping on recovery/energy)
                training.firstTrainingCheck = false
                ButtonBack.click(game.imageUtils)
                game.wait(1.0)

                if (checkMainScreen()) {
                    if (trainee.mood == Mood.AWFUL || (trainee.mood <= Mood.NORMAL && trainee.energy >= 20)) {
                        MessageLog.i(TAG, "[TRACKBLAZER] Mood is ${trainee.mood}. Attempting to recover mood.")
                        decisionTracer.recordRecoveryExecuted(
                            action = "RECOVER_MOOD",
                            reason = "Mood ${trainee.mood} is AWFUL, or <= NORMAL with energy ${trainee.energy}% >= 20%",
                        )
                        recoverMood()
                    } else {
                        MessageLog.i(TAG, "[TRACKBLAZER] Energy is ${trainee.energy}%. Attempting to recover energy.")
                        decisionTracer.recordRecoveryExecuted(
                            action = "RECOVER_ENERGY",
                            reason = "Mood ${trainee.mood} > NORMAL or energy ${trainee.energy}% < 20%",
                        )
                        recoverEnergy()
                    }
                }
            } else {
                // Force a training (Only Wit if negative conditions to avoid possible stat reductions such as Slow Metabolism)
                // 80 Energy is optimal for Wit, as there may be post events that provide additional energy.
                val forcedStat = if (trainee.energy >= 80 && trainee.currentNegativeStatuses.isEmpty()) StatName.SPEED else StatName.WIT

                // Refuse to force-train if the forced stat was already rejected by analysis (high failure chance, low gain with charm, etc.) or is blacklisted. Recover instead.
                val skippedForced = training.skippedTrainingMap[forcedStat]
                val forcedIsBlacklisted = forcedStat in training.blacklist
                if (skippedForced != null || forcedIsBlacklisted) {
                    val reason = skippedForced?.skipReason ?: "blacklisted"
                    MessageLog.w(TAG, "[WARN] handleTrackblazerTraining:: Cannot force $forcedStat training ($reason). Backing out for recovery instead.")
                    decisionTracer.recordTrainingSelection(
                        selected = null,
                        source = training.lastSelectionSource,
                        reason = "Wanted to force $forcedStat but it was rejected ($reason); backing out for recovery",
                        runnerUps = buildTrainingRunnerUps(null),
                    )

                    training.firstTrainingCheck = false
                    ButtonBack.click(game.imageUtils)
                    game.wait(1.0)

                    if (checkMainScreen()) {
                        if (trainee.mood == Mood.AWFUL || (trainee.mood <= Mood.NORMAL && trainee.energy >= 20)) {
                            MessageLog.i(TAG, "[TRACKBLAZER] Mood is ${trainee.mood}. Attempting to recover mood.")
                            decisionTracer.recordRecoveryExecuted(
                                action = "RECOVER_MOOD",
                                reason = "Mood ${trainee.mood} is AWFUL, or <= NORMAL with energy ${trainee.energy}% >= 20% (forced-stat backout)",
                            )
                            recoverMood()
                        } else {
                            MessageLog.i(TAG, "[TRACKBLAZER] Energy is ${trainee.energy}%. Attempting to recover energy.")
                            decisionTracer.recordRecoveryExecuted(
                                action = "RECOVER_ENERGY",
                                reason = "Mood ${trainee.mood} > NORMAL or energy ${trainee.energy}% < 20% (forced-stat backout)",
                            )
                            recoverEnergy()
                        }
                    }
                } else {
                    MessageLog.i(TAG, "[TRACKBLAZER] Still no suitable training found. Energy (${trainee.energy}%) and Mood (${trainee.mood}) are sufficient. Forcing $forcedStat training.")
                    val (forcedPickFail, forcedPickGains) = pickedStatDetails(forcedStat)
                    decisionTracer.recordTrainingSelection(
                        selected = forcedStat,
                        source = SelectionSource.FORCED_DEFAULT,
                        reason = "No analyzer pick but energy ${trainee.energy}% > 50 and mood ${trainee.mood} > NORMAL - forcing $forcedStat",
                        runnerUps = buildTrainingRunnerUps(forcedStat),
                        pickedFailureChance = forcedPickFail,
                        pickedStatGains = forcedPickGains,
                    )
                    training.executeTraining(forcedStat)
                    training.firstTrainingCheck = false
                }
            }
        }

        bIsIrregularTraining = false
    }

    /**
     * Executes the logic meant for the Race Prep screen of scheduled races,
     * specifically to use race items if appropriate.
     */
    override fun onScheduledRacePrepScreen() {
        var grade = racing.lastRaceGrade
        var fans = racing.lastRaceFans

        // For Finale races (turns 73, 74, 75), manually set the grade to G1 and appropriate fans.
        // This ensures the racing item logic is triggered for these mandatory races.
        if (date.bIsFinaleSeason && (date.day == 73 || date.day == 74 || date.day == 75)) {
            grade = RaceGrade.G1
            racing.lastRaceGrade = RaceGrade.FINALE
            fans = if (date.day == 75) 30000 else 20000
        }

        if (grade != null && (grade == RaceGrade.G1 || grade == RaceGrade.G2 || grade == RaceGrade.G3)) {
            MessageLog.i(TAG, "[TRACKBLAZER] Executing scheduled race item logic on Race Prep screen.")
            useRaceItems(grade, fans)
        }
    }

    /**
     * Uses race-related items (Hammers, Glow Sticks) based on the race grade and fan count.
     *
     * @param grade The grade of the detected race.
     * @param fans The number of fans awarded by the race.
     */
    private fun useRaceItems(grade: RaceGrade, fans: Int) {
        if (date.day < 13 || bUsedHammerToday) {
            if (bUsedHammerToday) {
                MessageLog.i(TAG, "[TRACKBLAZER] Already used a race item today.")
            }
            return
        }

        val masterHammerCount = currentInventory["Master Cleat Hammer"] ?: 0
        val artisanHammerCount = currentInventory["Artisan Cleat Hammer"] ?: 0
        val glowSticksCount = currentInventory["Glow Sticks"] ?: 0

        // Conservation thresholds activate at `raceItemConservationStartDay` (Turn 65, right after Senior Year Summer training). Before that, the bot uses race items freely.
        val conservationActive = date.day >= raceItemConservationStartDay

        // Always reserve 2 master hammers for the finale (days 73-75)
        val spareMasterHammers = (masterHammerCount - 2).coerceAtLeast(0)

        // Master Hammer Logic
        val canUseMasterHammer =
            when {
                !conservationActive -> {
                    // Pre-conservation: spend on any G1/G2 race without honoring the finale reserve.
                    masterHammerCount > 0 && (grade == RaceGrade.G1 || grade == RaceGrade.G2)
                }
                date.day < 73 -> {
                    // Mid-game conservation: only use spare masters beyond the 2 reserved for the finale.
                    spareMasterHammers > 0 && (grade == RaceGrade.G1 || grade == RaceGrade.G2)
                }
                else -> {
                    // Finale: ration the reserve so we still have enough for remaining finale days.
                    val remainingFinaleDays = listOf(73, 74, 75).count { it >= date.day }
                    val hasEnough = masterHammerCount > remainingFinaleDays.coerceAtMost(masterHammerCount - 1).coerceAtLeast(0)
                    hasEnough && grade == RaceGrade.G1
                }
            }

        // Artisan Hammer Logic
        // Stock floors only apply from Turn `raceItemConservationStartDay` onward; before that, any G1/G2/G3 race burns a hammer when stock > 0.
        // Mid-game grade priority: G1 > G2 > G3, with G3 only allowed if 3+ artisan hammers.
        val canUseArtisanHammer =
            if (!conservationActive) {
                artisanHammerCount > 0 && (grade == RaceGrade.G1 || grade == RaceGrade.G2 || grade == RaceGrade.G3)
            } else if (artisanHammerCount >= 3) {
                true
            } else if (artisanHammerCount >= 2) {
                grade == RaceGrade.G1 || grade == RaceGrade.G2
            } else if (artisanHammerCount == 1) {
                grade == RaceGrade.G1
            } else {
                false
            }

        // Master takes priority at the finale since it provides a higher bonus (35% vs 20%).
        val hammerToUse =
            if (date.day < 73) {
                when {
                    canUseArtisanHammer -> "Artisan Cleat Hammer"
                    canUseMasterHammer -> "Master Cleat Hammer"
                    else -> null
                }
            } else {
                when {
                    canUseMasterHammer -> "Master Cleat Hammer"
                    canUseArtisanHammer -> "Artisan Cleat Hammer"
                    else -> null
                }
            }

        // Glow Sticks Logic
        // The 20,000 fan floor applies at all times. The "reserve 1 stick" rule only applies from Turn `raceItemConservationStartDay` onward.
        val useGlowSticks =
            if (!conservationActive) {
                // Pre-conservation: spend on any race meeting the 20,000 fan floor, no reserve.
                fans >= 20000 && glowSticksCount > 0
            } else if (date.day >= 73) {
                // Reserve 1 stick for Day 75 (the Final).
                val reserveForFinals = if (date.day < 75) 1 else 0
                fans >= 20000 && glowSticksCount > reserveForFinals
            } else if (fans >= 30000) {
                // Use the last stick. Shops refresh when the Finales start so there is a chance for another Glow Stick to buy.
                glowSticksCount > 0
            } else {
                fans >= 20000 && glowSticksCount > 1
            }

        if (hammerToUse != null || useGlowSticks) {
            MessageLog.i(TAG, "[TRACKBLAZER] Suitable race items found in inventory (Hammer: $hammerToUse, Glow Sticks: $useGlowSticks). Opening Training Items dialog.")
            if (shopList.openTrainingItemsDialog()) {
                val itemsToUseList = mutableListOf<String>()
                if (hammerToUse != null) itemsToUseList.add(hammerToUse)
                if (useGlowSticks) itemsToUseList.add("Glow Sticks")

                // Pass the reasoning and trigger a single consolidated usage summary.
                val itemsUsed = shopList.useSpecificItems(itemsToUseList, bUseAll = false, reason = "Race bonus for $grade.")
                itemsUsed.forEach { (name, _) ->
                    useInventoryItem(name)
                }

                if (itemsUsed.isNotEmpty()) {
                    MessageLog.i(TAG, "[TRACKBLAZER] Queued ${itemsUsed.size} race items for $grade ($fans fans). Confirming usage.")
                    confirmAndCloseItemDialog(itemsUsed.size)
                    bUsedHammerToday = true
                } else {
                    if (ButtonClose.click(game.imageUtils)) {
                        game.wait(game.dialogWaitDelay)
                    }
                }
            }
        } else {
            if (date.day == 73 && (masterHammerCount > 0 || glowSticksCount > 0)) {
                MessageLog.i(
                    TAG,
                    "[TRACKBLAZER] Conserving race items for Semi-Final/Final (turns 74-75). " +
                        "Hammer: ${masterHammerCount + artisanHammerCount}, Glow Sticks: $glowSticksCount.",
                )
            } else {
                MessageLog.i(TAG, "[TRACKBLAZER] No relevant race items in cached inventory for $grade.")
            }
        }
    }

    /**
     * Orchestrates the usage of items based on dynamic conditions and updates internal inventory.
     * Consolidates synchronization and item usage into a single pass for efficiency.
     *
     * @param trainee Reference to the trainee's state. If provided, conditional items will be used.
     * @param trainingSelected The stat name of the selected training to help with item usage (e.g. Ankle Weights).
     * @param bQuickUseOnly If true, only items marked for quick use will be used.
     * @param bDryRun If true, only logs intentions without performing any clicks.
     */
    fun manageInventoryItems(trainee: Trainee? = null, trainingSelected: StatName? = null, bQuickUseOnly: Boolean = false, bDryRun: Boolean = false) {
        if (date.day < 13 && !bDryRun) return

        MessageLog.i(TAG, "[TRACKBLAZER] Starting inventory management pass.")
        val initialEnergy = trainee?.energy ?: 0
        val initialMood = trainee?.mood ?: Mood.NORMAL
        val initialMegaphoneTurnCounter = trainee?.megaphoneTurnCounter ?: 0
        val nextInventory = currentInventory.toMutableMap()
        val scannedItemsList = mutableListOf<ScannedItem>()
        var itemsUsedCount = 0
        var wasEarlyExit = false

        // To improve efficiency, we identify which items we are actually interested in based on our cached inventory.
        // If we have a cached inventory and have seen all items of interest, we can exit the scroll loop early.
        val remainingItemsOfInterest =
            if (currentInventory.isNotEmpty()) {
                val failureChance = training.trainingMap[trainingSelected]?.failureChance ?: 0
                val neededWeight =
                    when (trainingSelected) {
                        StatName.SPEED -> "Speed Ankle Weights"
                        StatName.STAMINA -> "Stamina Ankle Weights"
                        StatName.POWER -> "Power Ankle Weights"
                        StatName.GUTS -> "Guts Ankle Weights"
                        else -> ""
                    }

                currentInventory
                    .filter { (name, count) ->
                        if (count <= 0) return@filter false

                        val info = shopList.shopItems[name]
                        val isStat = info?.category == "Stats"
                        val isBad = info?.category == "Heal Bad Conditions"
                        val isQuick = info?.isQuickUsage == true
                        val isEnergy = shopList.energyItemNames.contains(name) || name == "Royal Kale Juice"
                        val isMood = name == "Berry Sweet Cupcake" || name == "Plain Cupcake"
                        val isMegaphone = name == "Empowering Megaphone" || name == "Motivating Megaphone" || name == "Coaching Megaphone"
                        val isAnkleWeight = name == neededWeight
                        val isCharm = name == "Good-Luck Charm" && failureChance >= 20

                        // Determine if this item is actually useful right now.
                        // isBad items are also isQuick, but they must clear the condition-match gate; let the isBad clause own them.
                        val isUseful =
                            isStat ||
                                (isBad && trainee != null && canHealActiveNegativeStatus(name, trainee)) ||
                                (isQuick && !isBad) ||
                                (isEnergy && trainee != null && trainee.energy <= 100) ||
                                // We might want any energy item if not full.
                                (isMood && trainee != null && trainee.mood < Mood.GREAT) ||
                                (isMegaphone && trainee != null && trainingSelected != null && trainee.megaphoneTurnCounter == 0 && !shouldConserveTrainingEffectItems(trainingSelected, trainee)) ||
                                (isAnkleWeight && trainee != null && trainingSelected != null) ||
                                (isCharm && trainee != null && trainingSelected != null && !shouldConserveTrainingEffectItems(trainingSelected, trainee))

                        isUseful
                    }.keys
                    .toMutableSet()
            } else {
                mutableSetOf()
            }

        if (remainingItemsOfInterest.isEmpty() && bInventorySynced) {
            MessageLog.i(TAG, "[TRACKBLAZER] No items of interest found in cached inventory and already synced. Skipping scan.")
        } else if (remainingItemsOfInterest.isNotEmpty()) {
            MessageLog.i(TAG, "[TRACKBLAZER] Items of interest for this pass: ${remainingItemsOfInterest.joinToString(", ")}.")
        }

        val itemsUsedWithReasons = mutableListOf<Pair<String, String>>()
        val itemNameMapInManage = mutableMapOf<Int, String>()
        // Snapshot energy at the start of the pass so the energy-item threshold gate stays
        // open after earlier items in the same pass raise `trainee.energy`. The greedy
        // selection in `isBestEnergyItemToUse` still drives which specific items are queued.
        val passStartEnergy = trainee?.energy ?: 0
        shopList.processItemsWithFallback(
            keyExtractor = { entry ->
                val name = shopList.getShopItemName(entry, ButtonSkillUp.checkDisabled(game.imageUtils, entry.bitmap) == true)
                if (name != null) itemNameMapInManage[entry.index] = name
                name
            },
        ) { entry ->
            val isDisabled = ButtonSkillUp.checkDisabled(game.imageUtils, entry.bitmap) == true
            val itemName = itemNameMapInManage[entry.index] ?: shopList.getShopItemName(entry, isDisabled)

            if (itemName != null) {
                Log.d(TAG, "[DEBUG] buyItems:: Detected item \"$itemName\" (Disabled: $isDisabled) at index ${entry.index}.")
                scannedItemsList.add(ScannedItem(entry, itemName, isDisabled))

                // Sync Inventory.
                val amount = shopList.getItemAmount(entry, isDisabled)
                nextInventory[itemName] = amount

                // Inline usage logic.
                if (!bDryRun) {
                    val isStat = shopList.statItemNames.contains(itemName)
                    val isBad = shopList.badConditionHealItemNames.contains(itemName)
                    val itemInfo = shopList.shopItems[itemName]
                    val isQuick = itemInfo != null && itemInfo.isQuickUsage

                    if (bQuickUseOnly) {
                        if (isQuick && !isDisabled) {
                            if (clickItemPlusButton(itemName, entry, "[TRACKBLAZER] Using quick-use item: \"$itemName\".", nextInventory)) {
                                itemsUsedCount++
                                val reason =
                                    when {
                                        isStat -> "Marked as quick-use."
                                        itemInfo?.category == "Bond" -> "Marked as quick-use."
                                        itemInfo?.category == "Get Good Conditions" -> "Acquired good condition: ${getStatusEffectName(itemName)}."
                                        else -> "Marked as quick-use."
                                    }
                                itemsUsedWithReasons.add(itemName to reason)
                            }
                        }
                    } else {
                        if (isStat && !isDisabled) {
                            var clicks = 0
                            while (true) {
                                val reason = "Marked as quick-use."
                                if (clickItemPlusButton(itemName, entry, "[TRACKBLAZER] Queuing stat item: \"$itemName\".", nextInventory, recheck = clicks > 0, reason = reason)) {
                                    itemsUsedCount++
                                    clicks++
                                    itemsUsedWithReasons.add(itemName to reason)
                                    if (clicks >= 5) break
                                    game.wait(0.2)
                                } else {
                                    break
                                }
                            }
                        } else if (isBad && !isDisabled && trainee?.currentNegativeStatuses?.isNotEmpty() == true) {
                            val reason = "Healed status effect: ${trainee.currentNegativeStatuses.joinToString(", ")}."
                            if (clickItemPlusButton(itemName, entry, "[TRACKBLAZER] Queuing bad condition item: \"$itemName\".", nextInventory, reason = reason)) {
                                itemsUsedCount++
                                itemsUsedWithReasons.add(itemName to reason)
                            }
                        } else if (isQuick && !isDisabled) {
                            val reason =
                                when {
                                    itemInfo?.category == "Bond" -> "Marked as quick-use."
                                    itemInfo?.category == "Get Good Conditions" -> "Acquired status effect: ${getStatusEffectName(itemName)}."
                                    else -> "Marked as quick-use."
                                }
                            if (clickItemPlusButton(itemName, entry, "[TRACKBLAZER] Queuing quick-use item: \"$itemName\".", nextInventory, reason = reason)) {
                                itemsUsedCount++
                                itemsUsedWithReasons.add(itemName to reason)
                                if (itemName == "Energy Drink MAX") {
                                    trainee?.energy = (trainee?.energy ?: 100) + 5
                                }
                            }
                        } else if (trainee != null) {
                            // Handle Energy, Mood, Ankle Weights, Charm, Megaphones, etc.
                            val reason = handleInlineUsage(trainee, itemName, entry, isDisabled, trainingSelected, nextInventory, remainingItemsOfInterest, passStartEnergy)
                            if (reason != null) {
                                itemsUsedCount++
                                itemsUsedWithReasons.add(itemName to reason)
                            }
                        }
                    }
                }

                if (remainingItemsOfInterest.contains(itemName)) {
                    remainingItemsOfInterest.remove(itemName)
                }
            } else {
                MessageLog.w(TAG, "[WARN] manageInventoryItems:: Failed to detect item name at index ${entry.index}.")
            }

            // Early exit if we've seen all items of interest.
            // We only allow early exit if the inventory has already been fully synced.
            if (remainingItemsOfInterest.isEmpty() && bInventorySynced) {
                MessageLog.i(TAG, "[TRACKBLAZER] All items of interest processed. Exiting scan early.")
                wasEarlyExit = true
                true
            } else {
                false
            }
        }

        // Finalize Sync.
        if (!wasEarlyExit) {
            val scannedItemNames = scannedItemsList.map { it.itemName }.toSet()
            nextInventory.keys.forEach { name ->
                if (!scannedItemNames.contains(name) && (nextInventory[name] ?: 0) > 0) {
                    nextInventory[name] = 0
                }
            }
        }
        currentInventory = nextInventory.toMap()
        bInventorySynced = true

        // Log reasoning for item usage decisions made during this pass, incorporating the inventory summary.
        if (trainee != null || bDryRun) {
            val stateContext =
                if (trainee != null) {
                    val failureChance = training.trainingMap[trainingSelected]?.failureChance ?: 0
                    buildString {
                        val stateList = listOf("Energy=$initialEnergy%", "Mood=$initialMood", "Megaphone Turn=$initialMegaphoneTurnCounter", "Coins=$shopCoins")
                        appendLine("Current State: ${stateList.joinToString(", ")}")
                        if (trainingSelected != null) {
                            val failureInfo = if (failureChance > 0) " (Fail: $failureChance%)" else ""
                            append("Selected Training: $trainingSelected$failureInfo")
                        }
                    }.trimEnd()
                } else {
                    null
                }
            shopList.printItemUsageSummary(itemsUsedWithReasons, stateContext)
        }

        if (itemsUsedCount > 0 && !bDryRun) {
            confirmAndCloseItemDialog(itemsUsedCount)
        } else if (!bDryRun) {
            if (ButtonClose.click(game.imageUtils, tries = 30)) {
                game.wait(game.dialogWaitDelay)
            }
        }
    }

    /**
     * Map item names to their specific good status effect names.
     *
     * @param itemName The name of the item.
     * @return The status effect name.
     */
    private fun getStatusEffectName(itemName: String): String {
        return when (itemName) {
            "Pretty Mirror" -> "Charming ○"
            "Reporter's Binoculars" -> "Hot Topic"
            "Master Practice Guide" -> "Practice Perfect ○"
            "Scholar's Hat" -> "Fast Learner"
            else -> "null"
        }
    }

    /**
     * Handles usage of a specific item discovered during the scan loop.
     *
     * @param trainee Reference to the trainee's state.
     * @param itemName The name of the item detected.
     * @param entry The ScrollListEntry of the item.
     * @param isDisabled Whether the item is disabled in the UI.
     * @param trainingSelected The stat name of the selected training.
     * @param nextInventory The updated inventory map reflecting changes in this pass.
     * @param remainingItemsOfInterest The set of items we are still looking for.
     * @param passStartEnergy Trainee energy snapshotted at the start of the pass; used by the
     *   energy-item threshold gate so it does not close mid-pass after earlier items raise energy.
     * @return The specific reason why the item was used, or null if not used.
     */
    private fun handleInlineUsage(
        trainee: Trainee,
        itemName: String,
        entry: ScrollListEntry,
        isDisabled: Boolean,
        trainingSelected: StatName?,
        nextInventory: MutableMap<String, Int>,
        remainingItemsOfInterest: Set<String>,
        passStartEnergy: Int,
    ): String? {
        if (isDisabled) {
            MessageLog.v(TAG, "[TRACKBLAZER] Item \"$itemName\" read as disabled in dialog, so skipping its usage.")
            return null
        }

        // Ankle Weights Check.
        if (date.day >= 13 && trainingSelected != null) {
            val neededWeight =
                when (trainingSelected) {
                    StatName.SPEED -> "Speed Ankle Weights"
                    StatName.STAMINA -> "Stamina Ankle Weights"
                    StatName.POWER -> "Power Ankle Weights"
                    StatName.GUTS -> "Guts Ankle Weights"
                    else -> ""
                }
            if (itemName == neededWeight) {
                val reason = "Boosting $trainingSelected training gains."
                if (clickItemPlusButton(itemName, entry, "[TRACKBLAZER] Queuing $itemName via inline pass.", nextInventory, reason = reason)) {
                    return reason
                }
            }
        }

        // Good-Luck Charm Check.
        val failureChance = training.trainingMap[trainingSelected]?.failureChance ?: 0
        if (itemName == "Good-Luck Charm") {
            when {
                date.day < 13 ->
                    decisionTracer.recordCharmGate(queued = false, blockingGate = "Day ${date.day} < 13 (training items not yet available)")
                bUsedCharmToday ->
                    decisionTracer.recordCharmGate(queued = false, blockingGate = "Already used a Good-Luck Charm this turn")
                trainingSelected == null ->
                    decisionTracer.recordCharmGate(queued = false, blockingGate = "No training selected by analyzeTrainings (failureChance unknown)")
                failureChance < 20 ->
                    decisionTracer.recordCharmGate(queued = false, blockingGate = "Selected $trainingSelected has failureChance=$failureChance%, below 20% threshold")
                shouldConserveTrainingEffectItems(trainingSelected, trainee) -> {
                    val selectedMainGain = training.cachedAnalysisResults?.firstOrNull { it.name == trainingSelected }?.statGains?.get(trainingSelected) ?: 0
                    decisionTracer.recordCharmGate(
                        queued = false,
                        blockingGate = "Conservation: mood=${trainee.mood}, $trainingSelected main gain ($selectedMainGain) below floor ($lowMainStatGainItemFloor)",
                    )
                    MessageLog.i(
                        TAG,
                        "[TRACKBLAZER] Skipping Good-Luck Charm: mood=${trainee.mood}, selected $trainingSelected main gain ($selectedMainGain) below floor ($lowMainStatGainItemFloor). Conserving Charm for a higher-gain turn.",
                    )
                    return null
                }
                else -> {
                    val reason = "Setting training failure chance to 0%."
                    if (clickItemPlusButton(itemName, entry, "[TRACKBLAZER] Queuing Good-Luck Charm via inline pass.", nextInventory, reason = reason)) {
                        bUsedCharmToday = true
                        decisionTracer.recordCharmGate(queued = true)
                        return reason
                    }
                }
            }
        }

        // Determine if a Good-Luck Charm is being used this turn (either already queued or will be queued).
        // If so, skip energy items because the Charm sets failure to 0% regardless of energy, and the energy cost
        // is subtracted after training — so using energy items would waste them.
        val charmBeingUsedThisTurn =
            bUsedCharmToday ||
                (date.day >= 13 && failureChance >= 20 && (nextInventory["Good-Luck Charm"] ?: 0) > 0)

        // Energy Items Check.
        if (!charmBeingUsedThisTurn && passStartEnergy <= energyThresholdToUseEnergyItems && shopList.energyItemNames.contains(itemName)) {
            // Conservation: always keep the last unit of the lowest-level energy item for emergency race recovery.
            if (!bForceUseReservedItem) {
                val conserveItem = energyItemConservationOrder.firstOrNull { (nextInventory[it] ?: 0) > 0 }
                if (conserveItem == itemName && (nextInventory[itemName] ?: 0) <= 1) {
                    MessageLog.i(TAG, "[TRACKBLAZER] Conserving last $itemName for emergency race recovery.")
                    decisionTracer.recordItemDecision(itemName, DecisionTracer.ItemVerdict.CONSERVED, "Last unit reserved for emergency race recovery")
                    return null
                }
            }

            if (isBestEnergyItemToUse(trainee, itemName, nextInventory, remainingItemsOfInterest)) {
                val gain = energyGains[itemName] ?: 0
                val reason = "Restored energy (current: ${trainee.energy}%, pass start: $passStartEnergy%) because it fell below the $energyThresholdToUseEnergyItems% threshold."
                if (clickItemPlusButton(itemName, entry, "[TRACKBLAZER] Queuing $itemName for use (Energy: ${trainee.energy}%, Gain: +$gain).", nextInventory, reason = reason)) {
                    val oldEnergy = trainee.energy
                    trainee.energy = (trainee.energy + gain).coerceAtMost(100)
                    MessageLog.i(TAG, "[TRACKBLAZER] Trainee energy updated: $oldEnergy% -> ${trainee.energy}%.")
                    decisionTracer.recordItemDecision(itemName, DecisionTracer.ItemVerdict.USED, "Energy $oldEnergy% -> ${trainee.energy}% (gain +$gain)")
                    return reason
                }
            }
        }

        // Royal Kale Juice Check (also skipped when Charm is being used).
        if (!charmBeingUsedThisTurn && itemName == "Royal Kale Juice") {
            val hasMoodItems = nextInventory.any { (name, count) -> count > 0 && (name == "Berry Sweet Cupcake" || name == "Plain Cupcake") }
            val moodConditionMet = trainee.energy <= 20 || hasMoodItems || trainee.mood == Mood.AWFUL
            val shouldUse = isBestEnergyItemToUse(trainee, itemName, nextInventory, remainingItemsOfInterest) && moodConditionMet

            if (shouldUse) {
                val oldEnergy = trainee.energy
                val reason =
                    if (oldEnergy <= 20) {
                        "Restored energy (current: $oldEnergy%) as a last resort (below 20%)."
                    } else {
                        "Restored energy (current: $oldEnergy%) while having mood recovery items available to offset the Mood decrease."
                    }
                if (clickItemPlusButton(itemName, entry, "[TRACKBLAZER] Queuing $itemName for use (Energy: ${trainee.energy}%, Mood: ${trainee.mood}).", nextInventory, reason = reason)) {
                    val oldMood = trainee.mood
                    trainee.energy = (trainee.energy + 100).coerceAtMost(100)
                    trainee.mood = trainee.mood.decrement()
                    MessageLog.i(TAG, "[TRACKBLAZER] Trainee energy and mood updated: $oldEnergy% -> ${trainee.energy}%, $oldMood -> ${trainee.mood}.")
                    return reason
                }
            }
        }

        // Mood Items Check.
        val shouldUseMoodItem = trainee.mood <= Mood.NORMAL && trainee.energy < 70
        if (shouldUseMoodItem && (itemName == "Berry Sweet Cupcake" || itemName == "Plain Cupcake")) {
            // Conservation: always keep at least 1 cupcake in case Royal Kale Juice is purchased later.
            // Prefer conserving Plain Cupcake (+1 mood) since Kale Juice is -1 mood and we can avoid waste from Berry Sweet (+2).
            val plainCount = nextInventory["Plain Cupcake"] ?: 0
            val berryCount = nextInventory["Berry Sweet Cupcake"] ?: 0
            val shouldConserve =
                (itemName == "Plain Cupcake" && plainCount <= 1) ||
                    (itemName == "Berry Sweet Cupcake" && berryCount <= 1 && plainCount == 0)
            if (shouldConserve) {
                MessageLog.i(TAG, "[TRACKBLAZER] Conserving last $itemName for potential Royal Kale Juice usage.")
                decisionTracer.recordItemDecision(itemName, DecisionTracer.ItemVerdict.CONSERVED, "Last unit reserved for potential Royal Kale Juice synergy")
                return null
            }

            // Very simple inline mood: use the first one seen if energy is low.
            val reason = "Recovering mood (current: ${trainee.mood}, energy: ${trainee.energy}% < 70%)."
            if (clickItemPlusButton(itemName, entry, "[TRACKBLAZER] Queuing $itemName for mood recovery.", nextInventory, reason = reason)) {
                val oldMood = trainee.mood
                trainee.mood = if (itemName == "Berry Sweet Cupcake") Mood.GOOD else Mood.NORMAL
                MessageLog.i(TAG, "[TRACKBLAZER] Trainee mood updated: $oldMood -> ${trainee.mood}.")
                decisionTracer.recordItemDecision(itemName, DecisionTracer.ItemVerdict.USED, "Mood $oldMood -> ${trainee.mood} (energy ${trainee.energy}% < 70%)")
                return reason
            }
        }

        // Megaphone Check.
        val megaphoneNames = listOf("Empowering Megaphone", "Motivating Megaphone", "Coaching Megaphone")
        if (trainee.megaphoneTurnCounter == 0 && trainingSelected != null && megaphoneNames.contains(itemName)) {
            // When mood is below NORMAL, the mood multiplier caps gain. Megaphones multiply gain across multiple
            // turns, so squandering one on a low-gain selected training is worse than conserving for a better turn.
            if (shouldConserveTrainingEffectItems(trainingSelected, trainee)) {
                val selectedMainGain = training.cachedAnalysisResults?.firstOrNull { it.name == trainingSelected }?.statGains?.get(trainingSelected) ?: 0
                MessageLog.i(
                    TAG,
                    "[TRACKBLAZER] Skipping $itemName: mood=${trainee.mood}, selected $trainingSelected main gain ($selectedMainGain) below floor ($lowMainStatGainItemFloor). Conserving Megaphone for a higher-gain turn.",
                )
                decisionTracer.recordItemDecision(
                    itemName,
                    DecisionTracer.ItemVerdict.CONSERVED,
                    "Conservation: mood=${trainee.mood}, $trainingSelected main gain ($selectedMainGain) below floor ($lowMainStatGainItemFloor)",
                )
                return null
            }

            // Check if there is a better megaphone in inventory that we haven't seen yet OR that we know is disabled.
            val betterMegaphones =
                when (itemName) {
                    "Motivating Megaphone" -> listOf("Empowering Megaphone")
                    "Coaching Megaphone" -> listOf("Empowering Megaphone", "Motivating Megaphone")
                    else -> emptyList()
                }

            val hasBetterAvailable =
                betterMegaphones.any { better ->
                    (nextInventory[better] ?: 0) > 0
                }

            if (!hasBetterAvailable) {
                val reason = "Increasing training gains for the next few turns."
                if (clickItemPlusButton(itemName, entry, "[TRACKBLAZER] Queuing best available megaphone: \"$itemName\".", nextInventory, reason = reason)) {
                    trainee.megaphoneTurnCounter =
                        when (itemName) {
                            "Empowering Megaphone" -> 2
                            "Motivating Megaphone" -> 3
                            "Coaching Megaphone" -> 4
                            else -> 0
                        }
                    decisionTracer.recordItemDecision(
                        itemName,
                        DecisionTracer.ItemVerdict.USED,
                        "Best megaphone in inventory; setting megaphone turn duration to ${trainee.megaphoneTurnCounter}",
                    )
                    return reason
                }
            }
        }

        return null
    }

    /**
     * Returns the energy item name currently being conserved as the last-resort emergency-race-recovery stash.
     *
     * Mirrors the conservation logic inside `isBestEnergyItemToUse` so the dialog-open gate predicts the same outcome the dialog scan would reach.
     *
     * @param inventory The inventory snapshot to evaluate.
     * @return The conserved item name, or `null` if conservation is bypassed or no conservable item is in inventory.
     */
    private fun getConservedEnergyItem(inventory: Map<String, Int>): String? {
        if (bForceUseReservedItem) return null
        return energyItemConservationOrder.firstOrNull { (inventory[it] ?: 0) > 0 }
    }

    /**
     * Returns true when training-effect items (Megaphones, Good-Luck Charm) should be conserved this turn
     * because the trainee mood is below NORMAL AND the selected training's main stat gain is below the
     * user-configured floor. Mirrors the inline conservation checks in `handleInlineUsage()` so the
     * Training Items dialog can be short-circuited upfront when these items would be skipped anyway.
     *
     * @param trainingSelected The training the bot is about to execute (null = no selection).
     * @param trainee The current trainee snapshot (mood is read).
     * @return True if Megaphone/Charm should be skipped this turn.
     */
    private fun shouldConserveTrainingEffectItems(trainingSelected: StatName?, trainee: Trainee?): Boolean {
        if (trainingSelected == null || trainee == null) return false
        if (trainee.mood >= Mood.NORMAL) return false
        val selectedMainGain = training.cachedAnalysisResults?.firstOrNull { it.name == trainingSelected }?.statGains?.get(trainingSelected) ?: 0
        return selectedMainGain < lowMainStatGainItemFloor
    }

    /**
     * Returns true when the given heal item targets at least one of the trainee's currently active negative statuses.
     * Miracle Cure heals every status; every other entry in `badConditionMap` heals exactly one specific status.
     * Used to short-circuit the Training Items dialog when no inventory item can actually clear an active condition.
     *
     * @param itemName The name of the item to check.
     * @param trainee The current trainee snapshot (currentNegativeStatuses is read).
     * @return True if the item can heal an active negative status; false otherwise.
     */
    private fun canHealActiveNegativeStatus(itemName: String, trainee: Trainee): Boolean {
        if (itemName == "Miracle Cure") return true
        val target = badConditionMap[itemName] ?: return false
        return trainee.currentNegativeStatuses.contains(target)
    }

    /**
     * Orchestrates the usage of items based on dynamic conditions and updates internal inventory.
     *
     * @param trainee Reference to the trainee's state.
     * @param trainingSelected The stat name of the selected training to help with item usage (e.g. ankle weights).
     */
    private fun useItems(trainee: Trainee, trainingSelected: StatName? = null) {
        if (date.day < 13) return

        val needSync = !bInventorySynced
        val conservedEnergyItem = getConservedEnergyItem(currentInventory)
        val hasEnergyItems =
            currentInventory.any { (name, count) ->
                val effectiveCount = if (name == conservedEnergyItem) count - 1 else count
                effectiveCount > 0 && shopList.energyItemNames.contains(name)
            } ||
                ((currentInventory["Royal Kale Juice"] ?: 0) > 0)
        val hasMoodItems = currentInventory.any { (name, count) -> count > 0 && (name == "Berry Sweet Cupcake" || name == "Plain Cupcake") }
        val hasBadConditionItems = currentInventory.any { (name, count) -> count > 0 && shopList.badConditionHealItemNames.contains(name) && canHealActiveNegativeStatus(name, trainee) }
        val hasStatItems = currentInventory.any { (name, count) -> count > 0 && shopList.statItemNames.contains(name) }

        val skipTrainingEffectItems = shouldConserveTrainingEffectItems(trainingSelected, trainee)
        val hasMegaphones =
            !skipTrainingEffectItems &&
                trainingSelected != null &&
                trainee.megaphoneTurnCounter == 0 &&
                currentInventory.any { (name, count) ->
                    count > 0 && (name == "Empowering Megaphone" || name == "Motivating Megaphone" || name == "Coaching Megaphone")
                }
        val hasAnkleWeights =
            trainingSelected != null &&
                currentInventory.any { (name, count) ->
                    count > 0 &&
                        name ==
                        when (trainingSelected) {
                            StatName.SPEED -> "Speed Ankle Weights"
                            StatName.STAMINA -> "Stamina Ankle Weights"
                            StatName.POWER -> "Power Ankle Weights"
                            StatName.GUTS -> "Guts Ankle Weights"
                            else -> ""
                        }
                }
        val failureChance = if (trainingSelected != null) training.trainingMap[trainingSelected]?.failureChance ?: 0 else 0
        val hasCharm = !skipTrainingEffectItems && trainingSelected != null && !bUsedCharmToday && failureChance >= 20 && (currentInventory["Good-Luck Charm"] ?: 0) > 0

        val potentialUse =
            (trainee.energy <= energyThresholdToUseEnergyItems && hasEnergyItems) ||
                (trainee.mood <= Mood.NORMAL && trainee.energy < 70 && hasMoodItems) ||
                (trainee.currentNegativeStatuses.isNotEmpty() && hasBadConditionItems) ||
                hasStatItems ||
                hasMegaphones ||
                hasAnkleWeights ||
                hasCharm

        if (needSync || potentialUse) {
            val reasons = mutableListOf<String>()
            if (needSync) reasons.add("Sync needed")
            if (trainee.energy <= energyThresholdToUseEnergyItems && hasEnergyItems) reasons.add("Low energy")
            if (trainee.mood <= Mood.NORMAL && trainee.energy < 70 && hasMoodItems) reasons.add("Low mood")
            if (trainee.currentNegativeStatuses.isNotEmpty() && hasBadConditionItems) reasons.add("Bad conditions")
            if (hasStatItems) reasons.add("Stat items available")
            if (hasMegaphones) reasons.add("Megaphone available")
            if (hasAnkleWeights) reasons.add("Ankle weights available")
            if (hasCharm) reasons.add("Good-luck charm available")

            MessageLog.i(TAG, "[TRACKBLAZER] Opening Training Items dialog (${reasons.joinToString(", ")})...")
            if (shopList.openTrainingItemsDialog()) {
                manageInventoryItems(trainee, trainingSelected)
            }
        } else {
            MessageLog.i(TAG, "[TRACKBLAZER] Skipping Training Items dialog as no relevant items are in the cached inventory.")
            // When the dialog is skipped with a training already locked in, `shouldDecideToUseItem` never runs - surface the per-item
            // Charm reason so the Decision Report can answer "why didn't it use my Charm?" without cross-referencing the gating logic.
            // When trainingSelected is null we deliberately skip this: the Whistle re-roll path in handleTrackblazerTraining will run
            // next and record the real Charm/Whistle outcomes, so pre-recording here would just produce stale entries that contradict
            // the actual decision (e.g. Whistle: NOT_ELIGIBLE followed by Whistle: USED in the same report).
            if (trainingSelected != null && (currentInventory["Good-Luck Charm"] ?: 0) > 0) {
                val gate =
                    when {
                        date.day < 13 -> "Day ${date.day} < 13 (training items not yet available)"
                        bUsedCharmToday -> "Already used a Good-Luck Charm this turn"
                        else -> "Selected $trainingSelected has failureChance below 20% threshold (charm reserved for risky trainings)"
                    }
                decisionTracer.recordCharmGate(queued = false, blockingGate = "Item dialog skipped: $gate")
            }
        }
    }

    /**
     * Returns a formatted summary of the current inventory categorized with item amounts.
     *
     * @param withDividers If true, includes the standard "Current Inventory" dividers and footer.
     * @return Formatted inventory summary string.
     */
    fun getInventorySummary(withDividers: Boolean = false): String {
        // Group items by category from the central shopItems mapping.
        val inventoryByCategory =
            currentInventory.filter { it.value > 0 }.keys.groupBy { itemName ->
                shopList.shopItems[itemName]?.category ?: "Other"
            }

        val summary =
            if (withDividers) {
                StringBuilder("\n============== Current Inventory ==============\n")
            } else {
                StringBuilder("\n[Current Inventory]\n")
            }

        var hasItems = false

        // Sort categories to maintain consistent order (Stats first, then others).
        val categoryOrder = listOf("Stats", "Energy and Motivation", "Bond", "Get Good Conditions", "Heal Bad Conditions", "Training Facilities", "Training Effects", "Races")
        val sortedCategories =
            inventoryByCategory.keys.sortedWith(
                compareBy { category ->
                    val index = categoryOrder.indexOf(category)
                    if (index == -1) categoryOrder.size else index
                },
            )

        sortedCategories.forEach { category ->
            val items = inventoryByCategory[category] ?: emptyList()
            if (items.isNotEmpty()) {
                summary.append("\n$category\n")
                items.sorted().forEach { name ->
                    summary.append("- $name: ${currentInventory[name]}\n")
                }
                hasItems = true
            }
        }

        if (!hasItems) {
            if (bInventorySynced) {
                summary.append("\nInventory is empty.\n")
            } else {
                summary.append("\nInventory has not been scanned yet.\n")
            }
        }

        if (withDividers) {
            summary.append("\n===============================================")
        }

        return summary.toString()
    }

    /**
     * Determines if using the current energy item is part of the best possible combination of available energy items.
     * This follows a greedy approach to maximize energy gain, allowing a small overshoot above 100% so that a larger
     * combined gain (e.g. Vita 65 + Vita 40 = 105) is preferred over a strictly-under-100 combination (e.g. 65 + 20 = 85).
     *
     * @param trainee The trainee's current state.
     * @param itemName The name of the item being considered.
     * @param nextInventory The current inventory counts reflecting changes in this pass.
     * @param remainingItemsOfInterest The set of items we still expect to encounter in the current pass.
     * @return True if this item should be used, false otherwise.
     */
    private fun isBestEnergyItemToUse(trainee: Trainee, itemName: String, nextInventory: Map<String, Int>, remainingItemsOfInterest: Set<String>): Boolean {
        val currentGain = energyGains[itemName] ?: return false
        val currentEnergy = trainee.energy

        val hasMoodItems = nextInventory.any { (name, count) -> count > 0 && (name == "Berry Sweet Cupcake" || name == "Plain Cupcake") }
        val isKaleJuiceUsable = currentEnergy <= 20 || hasMoodItems || trainee.mood == Mood.AWFUL

        // Royal Kale Juice "Last Resort" logic: If energy is very low, we prioritize Kale Juice over everything.
        // It gives 100, so any other energy item used first would be wasted.
        if (currentEnergy <= 20 && isKaleJuiceUsable) {
            val hasKaleJuice =
                (itemName == "Royal Kale Juice") ||
                    (nextInventory["Royal Kale Juice"] ?: 0) > 0 ||
                    remainingItemsOfInterest.contains("Royal Kale Juice")
            if (hasKaleJuice) {
                return itemName == "Royal Kale Juice"
            }
        }

        // Collect all available energy items from this scan pass.
        // Always reserve one unit of the lowest-tier item for emergency race recovery, unless force-override is active.
        val availableEnergyItems = mutableListOf<Int>()
        val conserveItem = if (!bForceUseReservedItem) energyItemConservationOrder.firstOrNull { (nextInventory[it] ?: 0) > 0 } else null
        remainingItemsOfInterest.forEach { name ->
            val gain = energyGains[name]
            if (gain != null) {
                // If this is Kale Juice, only include it if it's usable.
                if (name == "Royal Kale Juice" && !isKaleJuiceUsable) return@forEach

                var count = (nextInventory[name] ?: 0)

                // Exclude one unit of the conserved item from the greedy pool.
                if (name == conserveItem && count > 0) {
                    count--
                }

                repeat(count) { availableEnergyItems.add(gain) }
            }
        }

        // Safety net: if the current item was not counted via remainingItemsOfInterest (already-removed edge case),
        // make sure the greedy sees it as an available option.
        if (!remainingItemsOfInterest.contains(itemName)) {
            availableEnergyItems.add(currentGain)
        }

        // Sort gains descending for greedy selection.
        availableEnergyItems.sortDescending()

        // Greedy with soft overshoot: prefer combinations that approach 100% even if they exceed it by up to 10.
        // This prefers Vita 65 + Vita 40 (= 105) over Vita 65 + Vita 20 (= 85) so we don't leave ~15% on the table.
        val overshootCap = 110
        var simulatedEnergy = currentEnergy
        val pickedEnergyItems = mutableListOf<Int>()
        for (gain in availableEnergyItems) {
            if (simulatedEnergy + gain <= overshootCap) {
                simulatedEnergy += gain
                pickedEnergyItems.add(gain)
            }
        }

        // If currentGain was one of the picked items, use it.
        return pickedEnergyItems.contains(currentGain)
    }
}
