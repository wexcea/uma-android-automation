# Per-tier Megaphone Stat Thresholds (Trackblazer)

## Problem

In the Trackblazer scenario the bot uses the best available megaphone whenever none is active and a
training is selected. The only gain-based gate today is `trackblazerSkipBadMoodItemsBelowGain`, which
only applies when mood is below NORMAL. As a result a high-effect megaphone (Empowering, +60% for 2
turns) gets spent on a low-value training. Using a +60% boost on a 15-stat training wastes the item;
that boost should be reserved for higher-gain turns.

## Goal

Let the user set a minimum selected-training main-stat-gain threshold per megaphone tier. If the
selected training's main stat gain is below a tier's threshold, that tier is skipped and the bot falls
through to the next lower tier whose threshold is met. Logging is updated so it is clear why a given
megaphone is or is not used.

## Megaphone tiers (existing)

| Item | Effect | Duration |
|------|--------|----------|
| Empowering Megaphone | +60% | 2 turns |
| Motivating Megaphone | +40% | 3 turns |
| Coaching Megaphone | +20% | 4 turns |

## Decisions

- Below-threshold behavior: fall through to the next lower tier whose threshold is met. If no tier
  qualifies, no megaphone is used this turn.
- Gain metric: the selected training's main stat gain (the primary stat of the selected facility),
  matching the existing `trackblazerSkipBadMoodItemsBelowGain` floor. This is the base gain from the
  cached analysis, before any megaphone bonus is applied.
- Defaults: all three thresholds default to 0, preserving today's exact behavior. Users opt in by
  raising a slider.
- Integration approach: extend the existing inline "best-available" megaphone logic so a tier is only
  chosen when it is eligible (main gain >= its threshold). No upfront precompute pass, no single shared
  threshold.
- The existing mood-based conservation gate (`shouldConserveTrainingEffectItems`) is unchanged and
  stacks on top of the new per-tier thresholds.

## Settings (new keys under `scenarioOverrides`)

Behavior-first naming, matching `trackblazerSkipRiskyCharmTrainingBelowGain` /
`trackblazerSkipBadMoodItemsBelowGain`:

- `trackblazerSkipEmpoweringMegaphoneBelowGain` (default 0)
- `trackblazerSkipMotivatingMegaphoneBelowGain` (default 0)
- `trackblazerSkipCoachingMegaphoneBelowGain` (default 0)

Each: range 0-100, step 1. Brand-new keys, so no settings migration is required.

## Backend (`Trackblazer.kt`)

- Read the three thresholds via `SettingsHelper.getIntSetting`, mapped into a tier -> threshold lookup
  keyed by megaphone item name.
- Add a helper, `isMegaphoneEligible(itemName, mainGain)`, returning `mainGain >= thresholdFor(itemName)`.
- In the megaphone block of `handleInlineUsage()`, redefine the "best available" check so a tier is
  chosen only if eligible. The current `hasBetterAvailable` becomes "a better tier exists in inventory
  AND is eligible." When the current tier is ineligible it is skipped, and the scan falls through to the
  next lower tier (which, if its threshold is lower, may qualify). If no tier qualifies, no megaphone is
  used this turn.
- The dialog-skip short-circuit (`hasMegaphones` in the should-open-training-items-dialog logic) gets
  the same eligibility filter so the dialog is not opened when zero tiers qualify.

## Logging

- MessageLog: when a tier is skipped for threshold, emit a clear line, e.g.
  `Skipping Empowering Megaphone: selected SPEED main gain (15) below threshold (30). Trying lower tier.`
  When one is used: `Queuing Empowering Megaphone: main gain (35) >= threshold (30).`
- DecisionTracer: record `ItemVerdict.CONSERVED` with the threshold reason for each skipped tier, and
  `USED` with the gain-vs-threshold reason for the chosen one, so each tier's fate shows in the Decision
  Report.
- Settings snapshot: add the three thresholds to `gatherDecisionSettings()` so the per-turn Decision
  Report shows the live values.

## Frontend

- Three `CustomSlider`s in the Trackblazer section of `src/pages/ScenarioOverridesSettings/index.tsx`,
  near the existing skip-gain sliders. min 0 / max 100 / step 1, each wired through
  `updateOverrideSetting`, and added to that section's reset-defaults callback.
- Type defs + default values in `src/context/BotStateContext.tsx`.
- Per project frontend convention, add each new option to the static search config (`src/context/searchConfig.ts`)
  and the `MessageLog.tsx` settings string, plus a line each in `src/lib/messageLog/buildSettingsBanner.ts`.

## Docs & tests

- Update the Megaphone section of `HOW_IT_WORKS.md` to document the per-tier thresholds and fall-through.
- Add/extend a Kotlin unit test covering: gain below Empowering's threshold falls through to Motivating;
  all-zero thresholds preserve current behavior; no tier eligible = no megaphone.

## Out of scope

- Changing megaphone effect percentages or durations.
- Applying thresholds to non-Trackblazer scenarios.
- Any change to the mood-based conservation gate.
