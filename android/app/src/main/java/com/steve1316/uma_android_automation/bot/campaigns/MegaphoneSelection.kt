package com.steve1316.uma_android_automation.bot.campaigns

/**
 * Pure megaphone-tier selection helpers, kept free of Android dependencies so they can be unit-tested directly.
 * Trackblazer delegates to these so the inline item-usage pass respects per-tier stat thresholds.
 */
object MegaphoneSelection {
    /** Megaphone tiers in best-to-worst order, paired with the turn duration each grants when used. */
    val TIERS =
        listOf(
            "Empowering Megaphone" to 2,
            "Motivating Megaphone" to 3,
            "Coaching Megaphone" to 4,
        )

    /**
     * Picks the best (highest-tier) megaphone present in inventory whose per-tier minimum-gain threshold is met by
     * the selected training's main stat gain. Tiers are tried best-first, so a tier blocked by its threshold falls
     * through to the next cheaper tier.
     *
     * @param mainGain The selected training's main stat gain (base value, before any megaphone bonus).
     * @param inventory Known item counts; a tier is only considered when its count is greater than 0.
     * @param thresholds Per-tier minimum main stat gain keyed by megaphone item name. Missing keys default to 0.
     * @returns The best eligible megaphone item name, or null when no tier qualifies.
     */
    fun bestEligibleMegaphone(
        mainGain: Int,
        inventory: Map<String, Int>,
        thresholds: Map<String, Int>,
    ): String? =
        TIERS.firstOrNull { (name, _) -> (inventory[name] ?: 0) > 0 && mainGain >= (thresholds[name] ?: 0) }?.first

    /**
     * Returns the megaphone-effect turn duration granted by a tier.
     *
     * @param name The megaphone item name.
     * @returns The turn duration for that tier, or 0 when the name is not a known megaphone.
     */
    fun durationFor(name: String): Int = TIERS.firstOrNull { it.first == name }?.second ?: 0
}
