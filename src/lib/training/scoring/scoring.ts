// src/lib/training/scoring/scoring.ts
// Every TS scoring entry point is a thin wrapper around the shared `:scoring-shared` Kotlin/JS math. The wrappers preserve the existing TS API (Record-based maps, string-valued
// enums, plain object literals) while the actual computation runs in the same compiled functions the Android bot uses.
import { fromKtScoringConstants, kmp, toKtScoringConstants, toKtSettingsMap, toKtStatName, toKtTrainingConfig, toKtTrainingOption } from "./kmpBridge"
import { DEFAULT_TRAINING_SCORING_CONSTANTS, StatName, TrainingConfig, TrainingOption, TrainingScoringConstants } from "./types"

type Settings = Record<string, unknown>

/**
 * Retrieve the current stat cap for the given stat under the active scenario.
 *
 * @param statName The stat to query.
 * @param config The current `TrainingConfig` providing the scenario.
 * @returns The maximum value the specified stat can reach in the current scenario.
 */
export function getCurrentStatCap(statName: StatName, config: TrainingConfig): number {
    return kmp.getCurrentStatCap(toKtStatName(statName), toKtTrainingConfig(config))
}

/**
 * Expected total stat bonus from remaining finale race wins.
 *
 * @param currentDay The current turn number (1-75).
 * @returns The expected stat gain per stat from remaining finale races.
 */
export function getFinaleStatBonus(currentDay: number): number {
    return kmp.getFinaleStatBonus(currentDay)
}

/**
 * Level-based amplifier for a stat's priority weight.
 *
 * @param priorityRank The 1-indexed position of the stat in the active priority list (1 = highest priority).
 * @param trainingLevel The detected training level (1-5), or null if OCR was unavailable.
 * @param constants The `TrainingScoringConstants` supplying the per-rank boost factors.
 * @returns Multiplier in [1.0, 1.75].
 */
export function levelBoostMultiplier(priorityRank: number, trainingLevel: number | null, constants: TrainingScoringConstants = DEFAULT_TRAINING_SCORING_CONSTANTS): number {
    return kmp.levelBoostMultiplier(priorityRank, trainingLevel, toKtScoringConstants(constants))
}

/**
 * Stat-efficiency score: how well the training advances the trainee's stats toward their targets, weighted by priority position and (optionally) training-facility level.
 *
 * @param config The current `TrainingConfig`.
 * @param training The `TrainingOption` being scored.
 * @returns Raw stat-efficiency score.
 */
export function calculateStatEfficiencyScore(config: TrainingConfig, training: TrainingOption): number {
    return kmp.calculateStatEfficiencyScore(toKtTrainingConfig(config), toKtTrainingOption(training))
}

/**
 * Relationship-building score with diminishing returns.
 *
 * @param config The current `TrainingConfig`.
 * @param training The `TrainingOption` being scored.
 * @returns Normalized score in [0.0, ~100.0].
 */
export function calculateRelationshipScore(config: TrainingConfig, training: TrainingOption): number {
    return kmp.calculateRelationshipScore(toKtTrainingConfig(config), toKtTrainingOption(training))
}

/**
 * Misc score: skill-hint accounting with an optional override floor when "prioritize skill hints" is enabled and any hints are present.
 *
 * @param config The current `TrainingConfig`.
 * @param training The `TrainingOption` being scored.
 * @returns Score in [0.0, 100.0] normally, or above when the skill-hint override fires.
 */
export function calculateMiscScore(config: TrainingConfig, training: TrainingOption): number {
    return kmp.calculateMiscScore(toKtTrainingConfig(config), toKtTrainingOption(training))
}

/**
 * Raw composite score combining stat-efficiency, relationship, and misc with composition weights, then applying rainbow / anticipatory multipliers. Returns 0 for blacklisted
 * trainings or trainings whose primary stat is past the cap (subject to the single rainbow allowance).
 *
 * @param config The current `TrainingConfig`.
 * @param training The `TrainingOption` being scored.
 * @returns Raw composite score, coerced to >= 0.
 */
export function calculateRawTrainingScore(config: TrainingConfig, training: TrainingOption): number {
    return kmp.calculateRawTrainingScore(toKtTrainingConfig(config), toKtTrainingOption(training))
}

/**
 * Build a `TrainingScoringConstants` from an arbitrary settings record keyed by the same strings used by the Kotlin counterpart. Any missing or non-numeric value falls back
 * to the default supplied by the shared `TrainingScoringConstants` defaults.
 *
 * @param settings Settings record (typically loaded from AsyncStorage).
 * @returns A fully populated `TrainingScoringConstants` mirroring the user's saved overrides.
 */
export function scoringConstantsFromSettings(settings: Settings): TrainingScoringConstants {
    return fromKtScoringConstants(kmp.scoringConstantsFromMap(toKtSettingsMap(settings)))
}
