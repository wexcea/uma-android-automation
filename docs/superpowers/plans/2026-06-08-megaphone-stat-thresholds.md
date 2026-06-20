# Per-tier Megaphone Stat Thresholds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user set a per-tier minimum main-stat-gain threshold for each Trackblazer megaphone so a high-effect megaphone is not wasted on a low-gain training, with logging that explains why each tier is or is not used.

**Architecture:** A pure, Android-free helper (`MegaphoneSelection`) picks the best tier whose threshold is met; the Trackblazer inline item-usage pass calls it so the existing best-available logic now respects per-tier thresholds and falls through to lower tiers. Three new `scenarioOverrides` settings (default 0 = current behavior) are wired through the standard slider boilerplate.

**Tech Stack:** Kotlin (Android bot), JUnit 5 (Jupiter) unit tests, React Native / TypeScript frontend.

---

## File Structure

- Create: `android/app/src/main/java/com/steve1316/uma_android_automation/bot/campaigns/MegaphoneSelection.kt` - pure tier-selection helper (no Android deps, unit-testable).
- Create: `android/app/src/test/java/com/steve1316/uma_android_automation/bot/campaigns/TrackblazerMegaphoneTest.kt` - unit tests for the helper.
- Modify: `android/app/src/main/java/com/steve1316/uma_android_automation/bot/campaigns/Trackblazer.kt` - read the 3 settings, use the helper in the megaphone block and the dialog-skip check, add Decision Report settings.
- Modify: `src/context/BotStateContext.tsx` - 3 type entries + 3 defaults.
- Modify: `src/pages/ScenarioOverridesSettings/index.tsx` - 3 sliders + 3 reset-callback lines.
- Modify: `src/context/searchConfig.ts` - 3 search entries.
- Modify: `src/lib/messageLog/buildSettingsBanner.ts` - 3 banner lines.
- Modify: `HOW_IT_WORKS.md` - document per-tier thresholds and fall-through.

Setting keys (new, no migration needed):
- `trackblazerSkipEmpoweringMegaphoneBelowGain` (default 0)
- `trackblazerSkipMotivatingMegaphoneBelowGain` (default 0)
- `trackblazerSkipCoachingMegaphoneBelowGain` (default 0)

---

## Task 1: Pure megaphone-selection helper (TDD)

**Files:**
- Create: `android/app/src/main/java/com/steve1316/uma_android_automation/bot/campaigns/MegaphoneSelection.kt`
- Test: `android/app/src/test/java/com/steve1316/uma_android_automation/bot/campaigns/TrackblazerMegaphoneTest.kt`

- [ ] **Step 1: Write the failing test**

Create `android/app/src/test/java/com/steve1316/uma_android_automation/bot/campaigns/TrackblazerMegaphoneTest.kt`:

```kotlin
package com.steve1316.uma_android_automation.bot.campaigns

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test

@DisplayName("MegaphoneSelection per-tier thresholds")
class TrackblazerMegaphoneTest {
    private val allInInventory = mapOf("Empowering Megaphone" to 1, "Motivating Megaphone" to 1, "Coaching Megaphone" to 1)
    private val zeroThresholds = mapOf("Empowering Megaphone" to 0, "Motivating Megaphone" to 0, "Coaching Megaphone" to 0)

    @Test
    fun `zero thresholds pick the best available tier`() {
        assertEquals("Empowering Megaphone", MegaphoneSelection.bestEligibleMegaphone(15, allInInventory, zeroThresholds))
    }

    @Test
    fun `gain below empowering threshold falls through to motivating`() {
        val thresholds = mapOf("Empowering Megaphone" to 30, "Motivating Megaphone" to 10, "Coaching Megaphone" to 0)
        assertEquals("Motivating Megaphone", MegaphoneSelection.bestEligibleMegaphone(15, allInInventory, thresholds))
    }

    @Test
    fun `gain below all thresholds yields no megaphone`() {
        val thresholds = mapOf("Empowering Megaphone" to 30, "Motivating Megaphone" to 25, "Coaching Megaphone" to 20)
        assertNull(MegaphoneSelection.bestEligibleMegaphone(15, allInInventory, thresholds))
    }

    @Test
    fun `only lower tier in inventory is used when eligible`() {
        assertEquals("Coaching Megaphone", MegaphoneSelection.bestEligibleMegaphone(15, mapOf("Coaching Megaphone" to 2), zeroThresholds))
    }

    @Test
    fun `gain at exactly the threshold is eligible`() {
        val thresholds = mapOf("Empowering Megaphone" to 15, "Motivating Megaphone" to 0, "Coaching Megaphone" to 0)
        assertEquals("Empowering Megaphone", MegaphoneSelection.bestEligibleMegaphone(15, allInInventory, thresholds))
    }

    @Test
    fun `durationFor returns per-tier turn counts`() {
        assertEquals(2, MegaphoneSelection.durationFor("Empowering Megaphone"))
        assertEquals(3, MegaphoneSelection.durationFor("Motivating Megaphone"))
        assertEquals(4, MegaphoneSelection.durationFor("Coaching Megaphone"))
        assertEquals(0, MegaphoneSelection.durationFor("Not A Megaphone"))
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test:kt --tests "*TrackblazerMegaphoneTest"`
(equivalently `cd android && ./gradlew test --tests "*TrackblazerMegaphoneTest"`)
Expected: FAIL - compilation error, `MegaphoneSelection` is unresolved.

- [ ] **Step 3: Write the helper**

Create `android/app/src/main/java/com/steve1316/uma_android_automation/bot/campaigns/MegaphoneSelection.kt`:

```kotlin
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
     * @return The best eligible megaphone item name, or null when no tier qualifies.
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
     * @return The turn duration for that tier, or 0 when the name is not a known megaphone.
     */
    fun durationFor(name: String): Int = TIERS.firstOrNull { it.first == name }?.second ?: 0
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test:kt --tests "*TrackblazerMegaphoneTest"`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/steve1316/uma_android_automation/bot/campaigns/MegaphoneSelection.kt android/app/src/test/java/com/steve1316/uma_android_automation/bot/campaigns/TrackblazerMegaphoneTest.kt
git commit -m "Add pure megaphone tier selection helper with tests"
```

---

## Task 2: Wire thresholds into Trackblazer backend

**Files:**
- Modify: `android/app/src/main/java/com/steve1316/uma_android_automation/bot/campaigns/Trackblazer.kt`

- [ ] **Step 1: Add the three setting fields + threshold map**

Find the existing field at line ~264:

```kotlin
    private val lowMainStatGainItemFloor: Int = SettingsHelper.getIntSetting("scenarioOverrides", "trackblazerSkipBadMoodItemsBelowGain", 15)
```

Insert directly AFTER it:

```kotlin

    /** Per-tier minimum selected-training main stat gain required to spend each megaphone. 0 = always allowed. */
    private val empoweringMegaphoneMinGain: Int = SettingsHelper.getIntSetting("scenarioOverrides", "trackblazerSkipEmpoweringMegaphoneBelowGain", 0)
    private val motivatingMegaphoneMinGain: Int = SettingsHelper.getIntSetting("scenarioOverrides", "trackblazerSkipMotivatingMegaphoneBelowGain", 0)
    private val coachingMegaphoneMinGain: Int = SettingsHelper.getIntSetting("scenarioOverrides", "trackblazerSkipCoachingMegaphoneBelowGain", 0)

    /** Megaphone item name -> its minimum-gain threshold, consumed by `MegaphoneSelection.bestEligibleMegaphone`. */
    private val megaphoneThresholds: Map<String, Int> =
        mapOf(
            "Empowering Megaphone" to empoweringMegaphoneMinGain,
            "Motivating Megaphone" to motivatingMegaphoneMinGain,
            "Coaching Megaphone" to coachingMegaphoneMinGain,
        )
```

- [ ] **Step 2: Rewrite the megaphone block in `handleInlineUsage()`**

Find this block (lines ~2695-2725):

```kotlin
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
```

Replace it entirely with:

```kotlin
            // Per-tier stat threshold: a high-effect megaphone should not be spent on a low-gain turn.
            val selectedMainGain = training.cachedAnalysisResults?.firstOrNull { it.name == trainingSelected }?.statGains?.get(trainingSelected) ?: 0
            val threshold = megaphoneThresholds[itemName] ?: 0
            if (selectedMainGain < threshold) {
                MessageLog.i(
                    TAG,
                    "[TRACKBLAZER] Skipping $itemName: selected $trainingSelected main gain ($selectedMainGain) below threshold ($threshold). Trying a lower tier.",
                )
                decisionTracer.recordItemDecision(
                    itemName,
                    DecisionTracer.ItemVerdict.CONSERVED,
                    "Main gain ($selectedMainGain) below per-tier threshold ($threshold)",
                )
                return null
            }

            // Only the best eligible megaphone in inventory should fire this turn; defer otherwise.
            val bestEligible = MegaphoneSelection.bestEligibleMegaphone(selectedMainGain, nextInventory, megaphoneThresholds)
            if (bestEligible != itemName) {
                MessageLog.i(
                    TAG,
                    "[TRACKBLAZER] Holding $itemName: a better eligible megaphone (${bestEligible ?: "none"}) is available this turn.",
                )
                decisionTracer.recordItemDecision(
                    itemName,
                    DecisionTracer.ItemVerdict.CONSERVED,
                    "Better eligible megaphone available this turn: ${bestEligible ?: "none"}",
                )
                return null
            }

            val reason = "Increasing training gains for the next few turns."
            if (clickItemPlusButton(itemName, entry, "[TRACKBLAZER] Queuing best eligible megaphone: \"$itemName\" (main gain $selectedMainGain >= threshold $threshold).", nextInventory, reason = reason)) {
                trainee.megaphoneTurnCounter = MegaphoneSelection.durationFor(itemName)
                decisionTracer.recordItemDecision(
                    itemName,
                    DecisionTracer.ItemVerdict.USED,
                    "Best eligible megaphone (main gain $selectedMainGain >= threshold $threshold); setting megaphone turn duration to ${trainee.megaphoneTurnCounter}",
                )
                return reason
            }
```

Note: the mood-based conservation `if (shouldConserveTrainingEffectItems(...))` block directly above this (lines ~2679-2693) is unchanged and still runs first.

- [ ] **Step 3: Update the dialog-skip eligibility filter**

Find this block (lines ~2819-2825):

```kotlin
        val hasMegaphones =
            !skipTrainingEffectItems &&
                trainingSelected != null &&
                trainee.megaphoneTurnCounter == 0 &&
                currentInventory.any { (name, count) ->
                    count > 0 && (name == "Empowering Megaphone" || name == "Motivating Megaphone" || name == "Coaching Megaphone")
                }
```

Replace it with:

```kotlin
        val selectedMainGainForMegaphone =
            if (trainingSelected != null) training.cachedAnalysisResults?.firstOrNull { it.name == trainingSelected }?.statGains?.get(trainingSelected) ?: 0 else 0
        val hasMegaphones =
            !skipTrainingEffectItems &&
                trainingSelected != null &&
                trainee.megaphoneTurnCounter == 0 &&
                MegaphoneSelection.bestEligibleMegaphone(selectedMainGainForMegaphone, currentInventory, megaphoneThresholds) != null
```

- [ ] **Step 4: Add the thresholds to the Decision Report settings snapshot**

Find this line (line ~1096):

```kotlin
            .add("Skip Bad-Mood Items Below Gain", lowMainStatGainItemFloor)
```

Insert directly AFTER it:

```kotlin
            .add("Skip Empowering Megaphone Below Gain", empoweringMegaphoneMinGain)
            .add("Skip Motivating Megaphone Below Gain", motivatingMegaphoneMinGain)
            .add("Skip Coaching Megaphone Below Gain", coachingMegaphoneMinGain)
```

- [ ] **Step 5: Verify the backend compiles and tests still pass**

Run: `yarn build`
Expected: BUILD SUCCESSFUL (release APK assembled).

Run: `yarn test:kt --tests "*TrackblazerMegaphoneTest"`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add android/app/src/main/java/com/steve1316/uma_android_automation/bot/campaigns/Trackblazer.kt
git commit -m "Apply per-tier megaphone stat thresholds in Trackblazer item usage"
```

---

## Task 3: Frontend settings wiring

**Files:**
- Modify: `src/context/BotStateContext.tsx`
- Modify: `src/pages/ScenarioOverridesSettings/index.tsx`
- Modify: `src/context/searchConfig.ts`
- Modify: `src/lib/messageLog/buildSettingsBanner.ts`

- [ ] **Step 1: Add types in `BotStateContext.tsx`**

Find (line ~212):

```typescript
        trackblazerSkipBadMoodItemsBelowGain: number
```

Insert directly AFTER it:

```typescript
        trackblazerSkipEmpoweringMegaphoneBelowGain: number
        trackblazerSkipMotivatingMegaphoneBelowGain: number
        trackblazerSkipCoachingMegaphoneBelowGain: number
```

- [ ] **Step 2: Add defaults in `BotStateContext.tsx`**

Find (line ~463):

```typescript
        trackblazerSkipBadMoodItemsBelowGain: 15,
```

Insert directly AFTER it:

```typescript
        trackblazerSkipEmpoweringMegaphoneBelowGain: 0,
        trackblazerSkipMotivatingMegaphoneBelowGain: 0,
        trackblazerSkipCoachingMegaphoneBelowGain: 0,
```

- [ ] **Step 3: Add the three sliders in `ScenarioOverridesSettings/index.tsx`**

Find the closing of the bad-mood slider's `View` and the section close (lines ~422-424):

```tsx
                                        />
                                    </View>
                                </Section>
```

This exact 3-line sequence appears more than once. Locate the one immediately following the slider whose `searchId="trackblazer-skip-bad-mood-items-below-gain"` (the `description` ends with "the mood multiplier caps the stat gains."). Replace ONLY that occurrence with:

```tsx
                                        />
                                    </View>

                                    <View style={{ padding: SPACING.md }}>
                                        <CustomSlider
                                            searchId="trackblazer-skip-empowering-megaphone-below-gain"
                                            value={scenarioOverrides.trackblazerSkipEmpoweringMegaphoneBelowGain}
                                            placeholder={defaultSettings.scenarioOverrides.trackblazerSkipEmpoweringMegaphoneBelowGain}
                                            onValueChange={(value) => updateOverrideSetting("trackblazerSkipEmpoweringMegaphoneBelowGain", value)}
                                            onSlidingComplete={(value) => updateOverrideSetting("trackblazerSkipEmpoweringMegaphoneBelowGain", value)}
                                            min={0}
                                            max={100}
                                            step={1}
                                            label="Skip Empowering Megaphone Below Stat Gain"
                                            labelUnit=""
                                            showValue={true}
                                            showLabels={true}
                                            description="Skip the Empowering Megaphone (+60% for 2 turns) when the selected training's main stat gain is below this value, falling through to a lower tier whose threshold is met. 0 = always allowed."
                                        />
                                    </View>

                                    <View style={{ padding: SPACING.md }}>
                                        <CustomSlider
                                            searchId="trackblazer-skip-motivating-megaphone-below-gain"
                                            value={scenarioOverrides.trackblazerSkipMotivatingMegaphoneBelowGain}
                                            placeholder={defaultSettings.scenarioOverrides.trackblazerSkipMotivatingMegaphoneBelowGain}
                                            onValueChange={(value) => updateOverrideSetting("trackblazerSkipMotivatingMegaphoneBelowGain", value)}
                                            onSlidingComplete={(value) => updateOverrideSetting("trackblazerSkipMotivatingMegaphoneBelowGain", value)}
                                            min={0}
                                            max={100}
                                            step={1}
                                            label="Skip Motivating Megaphone Below Stat Gain"
                                            labelUnit=""
                                            showValue={true}
                                            showLabels={true}
                                            description="Skip the Motivating Megaphone (+40% for 3 turns) when the selected training's main stat gain is below this value, falling through to a lower tier whose threshold is met. 0 = always allowed."
                                        />
                                    </View>

                                    <View style={{ padding: SPACING.md }}>
                                        <CustomSlider
                                            searchId="trackblazer-skip-coaching-megaphone-below-gain"
                                            value={scenarioOverrides.trackblazerSkipCoachingMegaphoneBelowGain}
                                            placeholder={defaultSettings.scenarioOverrides.trackblazerSkipCoachingMegaphoneBelowGain}
                                            onValueChange={(value) => updateOverrideSetting("trackblazerSkipCoachingMegaphoneBelowGain", value)}
                                            onSlidingComplete={(value) => updateOverrideSetting("trackblazerSkipCoachingMegaphoneBelowGain", value)}
                                            min={0}
                                            max={100}
                                            step={1}
                                            label="Skip Coaching Megaphone Below Stat Gain"
                                            labelUnit=""
                                            showValue={true}
                                            showLabels={true}
                                            description="Skip the Coaching Megaphone (+20% for 4 turns) when the selected training's main stat gain is below this value. 0 = always allowed."
                                        />
                                    </View>
                                </Section>
```

- [ ] **Step 4: Add the three keys to the reset callback in `ScenarioOverridesSettings/index.tsx`**

Find (line ~120):

```tsx
        updateOverrideSetting("trackblazerSkipBadMoodItemsBelowGain", defaultSettings.scenarioOverrides.trackblazerSkipBadMoodItemsBelowGain)
```

Insert directly AFTER it:

```tsx
        updateOverrideSetting("trackblazerSkipEmpoweringMegaphoneBelowGain", defaultSettings.scenarioOverrides.trackblazerSkipEmpoweringMegaphoneBelowGain)
        updateOverrideSetting("trackblazerSkipMotivatingMegaphoneBelowGain", defaultSettings.scenarioOverrides.trackblazerSkipMotivatingMegaphoneBelowGain)
        updateOverrideSetting("trackblazerSkipCoachingMegaphoneBelowGain", defaultSettings.scenarioOverrides.trackblazerSkipCoachingMegaphoneBelowGain)
```

Note: confirm this reset callback covers the megaphone sliders' section (the same `resetEnergyDefaults` block at line ~117-121 that already resets `trackblazerSkipBadMoodItemsBelowGain`). If the megaphone sliders render under a different `Section`, add these three lines to whichever reset callback matches that Section instead.

- [ ] **Step 5: Add three search-config entries in `searchConfig.ts`**

Find (lines ~755-761):

```typescript
    {
        id: "trackblazer-skip-bad-mood-items-below-gain",
        title: "Trackblazer Skip Items During Bad Mood Below Stat Gain",
        description:
            "When mood is BAD or AWFUL, refuse to use Reset Whistle / Good-Luck Charm / Megaphone if the selected training's main stat gain is below this floor. Prevents wasting items on structurally low-return turns where the mood multiplier caps the stat gains.",
        page: "ScenarioOverridesSettings",
    },
```

Insert directly AFTER that object (after its closing `},`):

```typescript
    {
        id: "trackblazer-skip-empowering-megaphone-below-gain",
        title: "Trackblazer Skip Empowering Megaphone Below Stat Gain",
        description:
            "Skip the Empowering Megaphone (+60% for 2 turns) when the selected training's main stat gain is below this value, falling through to a lower tier whose threshold is met. 0 = always allowed.",
        page: "ScenarioOverridesSettings",
    },
    {
        id: "trackblazer-skip-motivating-megaphone-below-gain",
        title: "Trackblazer Skip Motivating Megaphone Below Stat Gain",
        description:
            "Skip the Motivating Megaphone (+40% for 3 turns) when the selected training's main stat gain is below this value, falling through to a lower tier whose threshold is met. 0 = always allowed.",
        page: "ScenarioOverridesSettings",
    },
    {
        id: "trackblazer-skip-coaching-megaphone-below-gain",
        title: "Trackblazer Skip Coaching Megaphone Below Stat Gain",
        description:
            "Skip the Coaching Megaphone (+20% for 4 turns) when the selected training's main stat gain is below this value. 0 = always allowed.",
        page: "ScenarioOverridesSettings",
    },
```

- [ ] **Step 6: Add three banner lines in `buildSettingsBanner.ts`**

Find (line ~216):

```typescript
✨ Trackblazer Skip Items During Bad Mood Below Stat Gain: ${settings.scenarioOverrides?.trackblazerSkipBadMoodItemsBelowGain}
```

Insert directly AFTER it (keep them on the same template literal, one per line):

```typescript
✨ Trackblazer Skip Empowering Megaphone Below Stat Gain: ${settings.scenarioOverrides?.trackblazerSkipEmpoweringMegaphoneBelowGain}
✨ Trackblazer Skip Motivating Megaphone Below Stat Gain: ${settings.scenarioOverrides?.trackblazerSkipMotivatingMegaphoneBelowGain}
✨ Trackblazer Skip Coaching Megaphone Below Stat Gain: ${settings.scenarioOverrides?.trackblazerSkipCoachingMegaphoneBelowGain}
```

- [ ] **Step 7: Type-check the frontend**

Run: `yarn tsc --noEmit` (or the project's type-check script if different)
Expected: no new type errors referencing the three new keys.

- [ ] **Step 8: Commit**

```bash
git add src/context/BotStateContext.tsx src/pages/ScenarioOverridesSettings/index.tsx src/context/searchConfig.ts src/lib/messageLog/buildSettingsBanner.ts
git commit -m "Add per-tier megaphone stat threshold sliders to Trackblazer settings"
```

---

## Task 4: Documentation

**Files:**
- Modify: `HOW_IT_WORKS.md`

- [ ] **Step 1: Document the per-tier thresholds**

Find the "When NOT used" list in the Megaphone section (lines ~935-938):

```markdown
**When NOT used:**
- A megaphone effect is already active (turns remaining > 0). The bot decrements the counter each turn after an action is taken.
- No training is selected this turn (e.g., the bot is racing or resting).
- A better megaphone is available in inventory.
```

Replace it with:

```markdown
**When NOT used:**
- A megaphone effect is already active (turns remaining > 0). The bot decrements the counter each turn after an action is taken.
- No training is selected this turn (e.g., the bot is racing or resting).
- A better eligible megaphone is available in inventory.
- The selected training's main stat gain is below the tier's per-tier stat threshold (`trackblazerSkipEmpoweringMegaphoneBelowGain` / `trackblazerSkipMotivatingMegaphoneBelowGain` / `trackblazerSkipCoachingMegaphoneBelowGain`, all default 0). When a tier is blocked by its threshold, the bot falls through to the next lower tier whose threshold is met. If no tier qualifies, no megaphone is used this turn.
```

- [ ] **Step 2: Commit**

```bash
git add HOW_IT_WORKS.md
git commit -m "Document per-tier megaphone stat thresholds"
```

---

## Task 5: Final format and full build

**Files:** none (verification only)

- [ ] **Step 1: Format both stacks**

Run: `yarn format`
Run: `yarn format:kt`
Expected: files reformatted with no errors.

- [ ] **Step 2: Full clean build (frontend + backend changed)**

Run: `yarn build:clean`
Expected: BUILD SUCCESSFUL, release APK assembled.

- [ ] **Step 3: Run the Kotlin test suite once more**

Run: `yarn test:kt --tests "*TrackblazerMegaphoneTest"`
Expected: PASS (6 tests).

- [ ] **Step 4: Commit any formatting changes**

```bash
git add -A
git commit -m "Run formatters for megaphone stat thresholds"
```

(Skip this commit if `git status` shows no changes after formatting.)

---

## Notes for the implementer

- Commit style (project rule): no prefix, imperative, single line, no co-author trailer.
- The gain compared against thresholds is the **base** main stat gain from `training.cachedAnalysisResults` (before any megaphone bonus), matching the existing `trackblazerSkipBadMoodItemsBelowGain` floor.
- Defaults are all 0, so an untouched config behaves exactly as before this change.
- Do NOT add a settings migration - these are brand-new keys.
