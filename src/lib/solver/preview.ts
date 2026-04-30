import { NativeModules } from "react-native"

export interface SolverConfigSnapshot {
    scenario: string
    characterPreset: string
    aptitudes: { Sprint: string; Mile: string; Medium: string; Long: string; Turf: string; Dirt: string }
    targetEpithets: string[]
    forcedEpithets: string[]
    manualLocks: Record<string, string>
    weights: {
        raceValue: number
        epithetValue: number
        statWeight: number
        spWeight: number
        hintWeight: number
        consecutiveRacePenalty: number
        summerPenalty: number
        raceBonusPct: number
        raceCostPct: number
        aptitudeThreshold: string
        includeOpAndPreOp: boolean
        allowSummerRacing: boolean
    }
    /** Bundled races.json passed inline so the bridge does not depend on SettingsHelper persistence having reached SQLite by the time the preview fires. */
    racesDataJson?: string
    /** Bundled epithets.json passed inline for the same reason as `racesDataJson`. */
    epithetsDataJson?: string
}

export type ScheduleEntryType = "Race" | "Train" | "Rest"

export interface ScheduleEntry {
    type: ScheduleEntryType
    raceKey?: string
    name?: string
    grade?: string
}

export interface SchedulePreview {
    decisions: Record<string, ScheduleEntry>
    projectedEpithets: string[]
    totalScore: number
    error?: string
}

/**
 * Calls the Kotlin Smart Race Solver to compute a fresh-start schedule preview for the given config.
 * Defaults are returned on bridge failure so the UI can degrade gracefully.
 */
export async function previewSchedule(config: SolverConfigSnapshot): Promise<SchedulePreview> {
    const json: string = await NativeModules.SmartRaceSolverModule.previewSchedule(JSON.stringify(config))
    return JSON.parse(json) as SchedulePreview
}
