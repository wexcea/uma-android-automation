package com.steve1316.uma_android_automation.bot.campaigns

import android.graphics.Bitmap
import android.util.Log
import com.steve1316.uma_android_automation.bot.Campaign
import com.steve1316.uma_android_automation.bot.Game
import com.steve1316.uma_android_automation.bot.Training
import com.steve1316.uma_android_automation.types.DateYear

/**
 * Unity Cup-specific Training subclass that customizes scoring and analysis behavior.
 *
 * @property game The [Game] instance for interacting with the game state.
 * @property campaign The [Campaign] instance for accessing campaign state.
 */
class UnityCupTraining(game: Game, campaign: Campaign) : Training(game, campaign) {
    override fun runExtraTrainingAnalysis(result: TrainingAnalysisResult, sourceBitmap: Bitmap, singleTraining: Boolean) {
        if (singleTraining) {
            Thread {
                val startTime = System.currentTimeMillis()
                try {
                    val gaugeResult = game.imageUtils.analyzeSpiritExplosionGauges(sourceBitmap)
                    if (gaugeResult != null) {
                        result.extras["spiritGaugesCanFill"] = gaugeResult.numGaugesCanFill
                        result.extras["spiritGaugesReadyToBurst"] = gaugeResult.numGaugesReadyToBurst
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "[ERROR] Error in Spirit Explosion Gauge analysis: ${e.stackTraceToString()}")
                    result.extras["spiritGaugesCanFill"] = 0
                    result.extras["spiritGaugesReadyToBurst"] = 0
                } finally {
                    result.latch.countDown()
                    Log.d(TAG, "[DEBUG] Total time to analyze Spirit Explosion Gauge for ${result.name}: ${System.currentTimeMillis() - startTime}ms")
                }
            }.start()
        } else {
            val startTime = System.currentTimeMillis()
            try {
                val gaugeResult = game.imageUtils.analyzeSpiritExplosionGauges(sourceBitmap)
                if (gaugeResult != null) {
                    result.extras["spiritGaugesCanFill"] = gaugeResult.numGaugesCanFill
                    result.extras["spiritGaugesReadyToBurst"] = gaugeResult.numGaugesReadyToBurst
                } else {
                    result.extras["spiritGaugesCanFill"] = 0
                    result.extras["spiritGaugesReadyToBurst"] = 0
                }
            } finally {
                result.latch.countDown()
                Log.d(TAG, "[DEBUG] Total time to analyze Spirit Explosion Gauge for ${result.name}: ${System.currentTimeMillis() - startTime}ms")
            }
        }
    }

    override fun getTrainingScoringMode(): String {
        return if (campaign.date.year < DateYear.SENIOR) {
            "Unity Cup (Spirit Gauge)"
        } else {
            super.getTrainingScoringMode()
        }
    }

    override fun scoreTraining(config: TrainingConfig, option: TrainingOption): Double {
        return if (campaign.date.year < DateYear.SENIOR) {
            scoreUnityCupTraining(config, option)
        } else {
            super.scoreTraining(config, option)
        }
    }

    override fun getExtraLogFields(training: TrainingOption): List<String> {
        val canFill = training.extras["spiritGaugesCanFill"] as? Int ?: 0
        val readyToBurst = training.extras["spiritGaugesReadyToBurst"] as? Int ?: 0
        return if (canFill > 0 || readyToBurst > 0) {
            listOf("Spirit Gauges: fillable=$canFill, ready to burst=$readyToBurst")
        } else {
            emptyList()
        }
    }

    override fun getExtraKeyFactors(selected: TrainingOption, args: Map<String, Any?>): List<String> {
        val readyToBurst = selected.extras["spiritGaugesReadyToBurst"] as? Int ?: 0
        val canFill = selected.extras["spiritGaugesCanFill"] as? Int ?: 0
        return when {
            readyToBurst > 0 -> listOf("Has $readyToBurst Spirit Gauge(s) ready to burst (highest priority).")
            canFill > 0 -> listOf("Can fill $canFill Spirit Gauge(s).")
            else -> emptyList()
        }
    }
}
