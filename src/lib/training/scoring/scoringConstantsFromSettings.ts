// src/lib/training/scoring/scoringConstantsFromSettings.ts
import { DEFAULT_TRAINING_SCORING_CONSTANTS, StatName, TrainingScoringConstants } from "./types"

type Settings = Record<string, unknown>

/**
 * Read a numeric setting by key, falling back to `fallback` when the value is missing or not a finite number.
 *
 * @param settings Settings record (typically loaded from AsyncStorage).
 * @param key Exact key string to look up.
 * @param fallback Default value to return when the key is missing or non-numeric.
 * @returns The numeric setting value, or `fallback`.
 */
function num(settings: Settings, key: string, fallback: number): number {
    const v = settings[key]
    return typeof v === "number" && Number.isFinite(v) ? v : fallback
}

/**
 * Build a `TrainingScoringConstants` from a settings record. Any missing key falls back to the matching field in `DEFAULT_TRAINING_SCORING_CONSTANTS`. Mirrors the Kotlin
 * `scoringConstantsFromSettings()` companion in `Training.kt`, using the same `"training"` namespace keys that `SettingsHelper` reads on the Android side.
 *
 * @param settings Settings record (typically loaded from AsyncStorage).
 * @returns A fully populated `TrainingScoringConstants` mirroring the user's saved overrides.
 */
export function scoringConstantsFromSettings(settings: Settings): TrainingScoringConstants {
    const d = DEFAULT_TRAINING_SCORING_CONSTANTS
    return {
        ratioBreakpoints: [
            num(settings, "ratioBreakpoint1", d.ratioBreakpoints[0]),
            num(settings, "ratioBreakpoint2", d.ratioBreakpoints[1]),
            num(settings, "ratioBreakpoint3", d.ratioBreakpoints[2]),
            num(settings, "ratioBreakpoint4", d.ratioBreakpoints[3]),
            num(settings, "ratioBreakpoint5", d.ratioBreakpoints[4]),
            num(settings, "ratioBreakpoint6", d.ratioBreakpoints[5]),
        ],
        ratioValues: [
            num(settings, "ratioValue1", d.ratioValues[0]),
            num(settings, "ratioValue2", d.ratioValues[1]),
            num(settings, "ratioValue3", d.ratioValues[2]),
            num(settings, "ratioValue4", d.ratioValues[3]),
            num(settings, "ratioValue5", d.ratioValues[4]),
            num(settings, "ratioValue6", d.ratioValues[5]),
            num(settings, "ratioValue7", d.ratioValues[6]),
        ],
        priorityCoefficient: num(settings, "priorityCoefficient", d.priorityCoefficient),
        levelBoostRank1Factor: num(settings, "levelBoostRank1Factor", d.levelBoostRank1Factor),
        levelBoostRank2Factor: num(settings, "levelBoostRank2Factor", d.levelBoostRank2Factor),
        levelBoostRank3Factor: num(settings, "levelBoostRank3Factor", d.levelBoostRank3Factor),
        mainStatThresholds: {
            [StatName.SPEED]: num(settings, "mainStatThresholdSpeed", d.mainStatThresholds[StatName.SPEED]),
            [StatName.STAMINA]: num(settings, "mainStatThresholdStamina", d.mainStatThresholds[StatName.STAMINA]),
            [StatName.POWER]: num(settings, "mainStatThresholdPower", d.mainStatThresholds[StatName.POWER]),
            [StatName.GUTS]: num(settings, "mainStatThresholdGuts", d.mainStatThresholds[StatName.GUTS]),
            [StatName.WIT]: num(settings, "mainStatThresholdWit", d.mainStatThresholds[StatName.WIT]),
        },
        mainStatBonusMagnitude: num(settings, "mainStatBonusMagnitude", d.mainStatBonusMagnitude),
        relationshipOrangeValue: num(settings, "relationshipOrangeValue", d.relationshipOrangeValue),
        relationshipGreenValue: num(settings, "relationshipGreenValue", d.relationshipGreenValue),
        relationshipBlueValue: num(settings, "relationshipBlueValue", d.relationshipBlueValue),
        relationshipDiminishingFactor: num(settings, "relationshipDiminishingFactor", d.relationshipDiminishingFactor),
        relationshipEarlyGameBonus: num(settings, "relationshipEarlyGameBonus", d.relationshipEarlyGameBonus),
        relationshipTrainerSupportBonus: num(settings, "relationshipTrainerSupportBonus", d.relationshipTrainerSupportBonus),
        skillHintPerHintScore: num(settings, "skillHintPerHintScore", d.skillHintPerHintScore),
        skillHintOverrideScore: num(settings, "skillHintOverrideScore", d.skillHintOverrideScore),
        statWeightWithBars: num(settings, "statWeightWithBars", d.statWeightWithBars),
        statWeightWithoutBars: num(settings, "statWeightWithoutBars", d.statWeightWithoutBars),
        relationshipWeightWithBars: num(settings, "relationshipWeightWithBars", d.relationshipWeightWithBars),
        miscWeight: num(settings, "miscWeight", d.miscWeight),
        juniorEarlyGameFlatBonus: num(settings, "juniorEarlyGameFlatBonus", d.juniorEarlyGameFlatBonus),
        relationshipScale: num(settings, "relationshipScale", d.relationshipScale),
        rainbowMultiplierEnabled: num(settings, "rainbowMultiplierEnabled", d.rainbowMultiplierEnabled),
        rainbowMultiplierDisabled: num(settings, "rainbowMultiplierDisabled", d.rainbowMultiplierDisabled),
        rainbowPerInstanceBase: num(settings, "rainbowPerInstanceBase", d.rainbowPerInstanceBase),
        rainbowPerInstanceDecay: num(settings, "rainbowPerInstanceDecay", d.rainbowPerInstanceDecay),
        anticipatoryMinFillPercent: num(settings, "anticipatoryMinFillPercent", d.anticipatoryMinFillPercent),
        anticipatoryCoefficient: num(settings, "anticipatoryCoefficient", d.anticipatoryCoefficient),
        anticipatoryCap: num(settings, "anticipatoryCap", d.anticipatoryCap),
    }
}
