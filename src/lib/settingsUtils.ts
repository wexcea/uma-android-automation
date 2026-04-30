import { logWithTimestamp } from "./logger"

/**
 * Deep merges two objects, preserving nested structure.
 * @param target - The target object to merge into.
 * @param source - The source object to merge from.
 * @returns A new object with merged values from both target and source.
 */
export const deepMerge = <T extends Record<string, any>>(target: T, source: Partial<T>): T => {
    const output = { ...target }
    for (const key in source) {
        if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key]) && source[key] !== null) {
            output[key] = deepMerge((target[key] || {}) as Record<string, any>, source[key] as any) as T[Extract<keyof T, string>]
        } else if (source[key] !== undefined) {
            output[key] = source[key] as T[Extract<keyof T, string>]
        }
    }
    return output
}

/**
 * Settings whose persisted value is owned by a dedicated writer outside the React-state-mirrored
 * `Settings` object. Including them in the batch would let stale in-memory values overwrite the
 * fresh DB rows the dedicated writer just wrote. `misc.formattedSettingsString` is built and
 * persisted directly by `MessageLog`'s debounced effect; the React-state copy is intentionally
 * never updated, so it must be skipped here.
 */
const DB_BATCH_EXCLUDED: ReadonlyArray<readonly [string, string]> = [["misc", "formattedSettingsString"]]

/**
 * Converts `Settings` object to database batch format.
 * @param settings - The `Settings` object to convert.
 * @returns An array of objects in the format `{ category: string; key: string; value: any }`.
 */
export const convertSettingsToBatch = (settings: Record<string, any>) => {
    const batch: Array<{ category: string; key: string; value: any }> = []

    Object.entries(settings).forEach(([category, categorySettings]) => {
        Object.entries(categorySettings).forEach(([key, value]) => {
            if (DB_BATCH_EXCLUDED.some(([c, k]) => c === category && k === key)) return
            batch.push({ category, key, value })
        })
    })

    return batch
}

/**
 * Applies all registered migrations to the Settings object.
 * @param settings - The Settings object to apply migrations to (already merged with defaults).
 * @param rawSettings - Optional raw settings (pre-merge) used to detect fields that were absent in the persisted store.
 *   Required by migrations that need to distinguish "user never set this" from "user set this to the default value".
 * @returns An object containing the migrated Settings object and a boolean indicating whether any migrations were applied.
 */
export const applyMigrations = (settings: any, rawSettings?: any): { settings: any; anyMigrated: boolean } => {
    let anyMigrated = false
    let migratedSettings = settings

    // Migration: Move Training Event specific OCR settings to trainingEvent category.
    const ocr = (migratedSettings as any).ocr
    const debug = (migratedSettings as any).debug

    if (ocr?.ocrConfidence !== undefined) {
        migratedSettings.trainingEvent.ocrConfidence = ocr.ocrConfidence
        delete ocr.ocrConfidence
        anyMigrated = true
        logWithTimestamp("[SettingsManager] Migrated ocrConfidence to trainingEvent category.")
    }

    if (ocr?.enableAutomaticOCRRetry !== undefined) {
        migratedSettings.trainingEvent.enableAutomaticOCRRetry = ocr.enableAutomaticOCRRetry
        delete ocr.enableAutomaticOCRRetry
        anyMigrated = true
        logWithTimestamp("[SettingsManager] Migrated enableAutomaticOCRRetry to trainingEvent category.")
    }

    if (debug?.enableHideOCRComparisonResults !== undefined) {
        migratedSettings.trainingEvent.enableHideOCRComparisonResults = debug.enableHideOCRComparisonResults
        delete debug.enableHideOCRComparisonResults
        anyMigrated = true
        logWithTimestamp("[SettingsManager] Migrated enableHideOCRComparisonResults to trainingEvent category.")
    }

    if (ocr?.ocrThreshold !== undefined) {
        migratedSettings.debug.ocrThreshold = ocr.ocrThreshold
        delete ocr.ocrThreshold
        anyMigrated = true
        logWithTimestamp("[SettingsManager] Migrated ocrThreshold to debug category.")
    }

    // After moving all OCR settings, delete the empty ocr object.
    if (migratedSettings && (migratedSettings as any).ocr && Object.keys((migratedSettings as any).ocr).length === 0) {
        delete (migratedSettings as any).ocr
    }

    // Migration: Mirror statPrioritization into eventChoiceStatPriority and summerTrainingStatPriority for users
    // upgrading from a version that only had a single stat priority list. The new keys are absent in the persisted
    // settings, so deepMerge fills them with the canonical default — but we want them to match the user's main list.
    const rawTraining = rawSettings?.training as any
    const training = migratedSettings.training as any
    if (training && rawTraining) {
        if (rawTraining.eventChoiceStatPriority === undefined && Array.isArray(training.statPrioritization)) {
            training.eventChoiceStatPriority = [...training.statPrioritization]
            anyMigrated = true
            logWithTimestamp("[SettingsManager] Mirrored statPrioritization into eventChoiceStatPriority for upgrade.")
        }
        if (rawTraining.summerTrainingStatPriority === undefined && Array.isArray(training.statPrioritization)) {
            training.summerTrainingStatPriority = [...training.statPrioritization]
            anyMigrated = true
            logWithTimestamp("[SettingsManager] Mirrored statPrioritization into summerTrainingStatPriority for upgrade.")
        }
    }

    // Migration: Convert single stopAtDate string to stopAtDates array.
    const general = migratedSettings.general as any
    if (general?.stopAtDate !== undefined && typeof general.stopAtDate === "string") {
        migratedSettings.general.stopAtDates = [general.stopAtDate]
        delete general.stopAtDate
        anyMigrated = true
        logWithTimestamp("[SettingsManager] Migrated stopAtDate to stopAtDates array.")
    }

    return { settings: migratedSettings, anyMigrated }
}
