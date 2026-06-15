package com.steve1316.uma_android_automation.bot.solver

import com.steve1316.automation_library.utils.MessageLog
import com.steve1316.uma_android_automation.MainActivity
import com.steve1316.uma_android_automation.bot.Game
import com.steve1316.uma_android_automation.components.ButtonBurger
import com.steve1316.uma_android_automation.components.ButtonCareer
import com.steve1316.uma_android_automation.components.ButtonClose
import com.steve1316.uma_android_automation.components.IconDialogScrollListBottomRight
import com.steve1316.uma_android_automation.components.IconDialogScrollListTopLeft
import com.steve1316.uma_android_automation.components.IconRaceHistory1st
import com.steve1316.uma_android_automation.components.LabelStrategy
import com.steve1316.uma_android_automation.utils.ScrollList
import com.steve1316.uma_android_automation.utils.ScrollListEntry
import org.opencv.core.Point

/**
 * Reads the in-game Career -> Race History dialog by OCR. Used at bot startup to seed
 * [SmartRaceSolverIntegration] with the trainee's actual past race wins.
 */
object RaceHistory {
    private val TAG: String = "[${MainActivity.loggerTag}]RaceHistory"

    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // Crop Offsets

    // Crop offsets relative to the LabelStrategy anchor's screen-absolute centre.
    private const val FORMATTED_NAME_OFFSET_X = -55
    private const val FORMATTED_NAME_OFFSET_Y = -70
    private const val FORMATTED_NAME_W = 565
    private const val FORMATTED_NAME_H = 45

    private const val DATE_OFFSET_X = 390
    private const val DATE_OFFSET_Y = -20
    private const val DATE_W = 335
    private const val DATE_H = 45

    private const val FIRST_PLACE_OFFSET_X = 720
    private const val FIRST_PLACE_OFFSET_Y = -105
    private const val FIRST_PLACE_W = 160
    private const val FIRST_PLACE_H = 120

    // Running-style chip sits just right of the LabelStrategy anchor on the same row. Offset derived from crop (190, 960) minus anchor centre (130, 980).
    private const val STRATEGY_OFFSET_X = 60
    private const val STRATEGY_OFFSET_Y = -20
    private const val STRATEGY_W = 130
    private const val STRATEGY_H = 40

    /**
     * One race entry parsed from the Career -> Race History dialog. The race name itself
     * is intentionally not captured - OCR on the row's primary label was unreliable, and
     * the tuple of formatted track string + in-game date is sufficient to look the race up in races.json.
     *
     * @property nameFormatted Formatted track string (e.g. "Tokyo Turf 1600m (Mile) Left").
     * @property dateString In-game date as shown on screen (e.g. "Junior Year Early Nov").
     * @property won True if the IconRaceHistory1st laurel was found in the placement region.
     * @property strategy Raw OCR of the running-style chip (e.g. "Front Runner"). Empty when OCR returned nothing.
     */
    data class RaceHistoryEntry(val nameFormatted: String, val dateString: String, val won: Boolean, val strategy: String)

    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // Helpers

    /**
     * Open Career -> Race History from the Main Screen, OCR every entry, then close back
     * to the Main Screen. ScrollList's standard scrollbar-based termination ends the scan
     * at the bottom of the list. The bottom Junior Make Debut row will appear in the
     * results but its formatted-name lookup against races.json will fail and the caller
     * silently drops it. The Remote Log Viewer surfaces a separate synthetic Make Debut
     * entry built directly inside SmartRaceSolverIntegration.buildCalendarSnapshotJson;
     * that entry is display-only and is never recorded into raceHistory.
     *
     * @param game Active Game instance for tap/screenshot/OCR access.
     * @return Newest-first scraped entries, or null if any navigation/OCR step failed.
     */
    fun scrape(game: Game): List<RaceHistoryEntry>? {
        MessageLog.i(TAG, "[INFO] Opening Career → Race History to read past results...")

        if (!ButtonBurger.click(game.imageUtils)) {
            MessageLog.w(TAG, "[WARN] scrape:: Failed to find/click hamburger menu button.")
            return null
        }
        game.wait(game.dialogWaitDelay, skipWaitingForLoading = true)

        if (!ButtonCareer.click(game.imageUtils)) {
            MessageLog.w(TAG, "[WARN] scrape:: Failed to find/click Career button. Closing menu.")
            ButtonClose.click(game.imageUtils)
            game.wait(game.dialogWaitDelay, skipWaitingForLoading = true)
            return null
        }
        game.wait(game.dialogWaitDelay, skipWaitingForLoading = true)

        val results = mutableListOf<RaceHistoryEntry>()
        val seenKeys = mutableSetOf<String>()
        try {
            // Use the Career dialog's own scroll-list corner icons so the bbox bounds
            // the actual race-history list region. Then let ScrollList iterate via
            // LabelStrategy as the per-row anchor and drive its own scrolling.
            val list =
                ScrollList.create(
                    game,
                    listTopLeftComponent = IconDialogScrollListTopLeft,
                    listBottomRightComponent = IconDialogScrollListBottomRight,
                )
            if (list == null) {
                MessageLog.w(TAG, "[WARN] scrape:: Failed to detect race history list bounds; aborting scrape.")
                closeBackToMainScreen(game)
                return null
            }

            list.process(
                entryComponent = LabelStrategy,
                bForceComponentDetection = true,
                keyExtractor = { entry -> "${entry.bbox.x}:${entry.bbox.y}:${entry.bbox.w}:${entry.bbox.h}" },
                onEntry = { _, entry ->
                    val parsed = parseEntry(game, entry)
                    if (parsed != null) {
                        val key = "${parsed.nameFormatted.lowercase()}|${parsed.dateString.lowercase()}"
                        if (seenKeys.add(key)) results.add(parsed)
                    }
                    false
                },
            )
        } catch (e: Exception) {
            MessageLog.e(TAG, "[ERROR] scrape:: Exception while iterating Race History entries: ${e.message}.")
            closeBackToMainScreen(game)
            return null
        }

        closeBackToMainScreen(game)
        return results
    }

    /**
     * Tap Close twice to dismiss the Career dialog and the Menu dialog, returning to the Main Screen.
     *
     * @param game Active Game instance for tap/wait access.
     */
    private fun closeBackToMainScreen(game: Game) {
        ButtonClose.click(game.imageUtils)
        game.wait(game.dialogWaitDelay, skipWaitingForLoading = true)
        ButtonClose.click(game.imageUtils)
        game.wait(game.dialogWaitDelay, skipWaitingForLoading = true)
    }

    /**
     * Parse a single race history row by anchoring on its visible LabelStrategy chip and OCR-ing the crop regions relative to it.
     *
     * @param game Active Game instance for OCR and image search.
     * @param entry The row produced by [ScrollList] component-detection mode.
     * @return The parsed entry, or null if the LabelStrategy anchor could not be located.
     */
    private fun parseEntry(game: Game, entry: ScrollListEntry): RaceHistoryEntry? {
        val anchorInEntry: Point =
            LabelStrategy.findImageWithBitmap(
                imageUtils = game.imageUtils,
                sourceBitmap = entry.bitmap,
            ) ?: return null
        val anchorX: Int = entry.bbox.x + anchorInEntry.x.toInt()
        val anchorY: Int = entry.bbox.y + anchorInEntry.y.toInt()
        val anchor = Point(anchorX.toDouble(), anchorY.toDouble())

        val nameFormatted =
            game.imageUtils
                .performOCRFromReference(
                    referencePoint = anchor,
                    offsetX = FORMATTED_NAME_OFFSET_X,
                    offsetY = FORMATTED_NAME_OFFSET_Y,
                    width = game.imageUtils.relWidth(FORMATTED_NAME_W),
                    height = game.imageUtils.relHeight(FORMATTED_NAME_H),
                    debugName = "race_history_formatted_$anchorY",
                ).trim()

        val dateString =
            game.imageUtils
                .performOCRFromReference(
                    referencePoint = anchor,
                    offsetX = DATE_OFFSET_X,
                    offsetY = DATE_OFFSET_Y,
                    width = game.imageUtils.relWidth(DATE_W),
                    height = game.imageUtils.relHeight(DATE_H),
                    debugName = "race_history_date_$anchorY",
                ).trim()

        val strategy =
            game.imageUtils
                .performOCRFromReference(
                    referencePoint = anchor,
                    offsetX = STRATEGY_OFFSET_X,
                    offsetY = STRATEGY_OFFSET_Y,
                    width = game.imageUtils.relWidth(STRATEGY_W),
                    height = game.imageUtils.relHeight(STRATEGY_H),
                    debugName = "race_history_strategy_$anchorY",
                ).trim()

        val firstPlaceRegion =
            intArrayOf(
                anchorX + game.imageUtils.relWidth(FIRST_PLACE_OFFSET_X),
                anchorY + game.imageUtils.relHeight(FIRST_PLACE_OFFSET_Y),
                game.imageUtils.relWidth(FIRST_PLACE_W),
                game.imageUtils.relHeight(FIRST_PLACE_H),
            )
        val won: Boolean = IconRaceHistory1st.find(game.imageUtils, region = firstPlaceRegion, tries = 1).first != null

        return RaceHistoryEntry(nameFormatted, dateString, won, strategy)
    }
}
