import { NativeModules } from "react-native"

/** Folder details surfaced to JS by `getCurrentFolder` and the picker callback. */
export interface PickedFolder {
    /** SAF tree URI string. */
    uri: string
    /** Display name from `DocumentFile.fromTreeUri(...).name`. */
    name: string
}

/** Sentinel `PickedFolder` for the internal-storage fallback. Its empty `uri` marks it as not a real SAF folder, and the native side
 * already writes under `getExternalFilesDir()` whenever the tree Uri is null. */
export const INTERNAL_STORAGE_FOLDER: PickedFolder = { uri: "", name: "App default (internal storage)" }

/** File counts under the legacy `getExternalFilesDir` paths. */
export interface LegacyCounts {
    /** Number of files under `getExternalFilesDir/logs`. */
    logs: number
    /** Number of files under `getExternalFilesDir/recordings`. */
    recordings: number
}

/** Outcome of a migration pass. `error` is present when the pass aborted mid-way. */
export interface MigrationResult {
    /** Count of log files successfully moved (or deleted) before completion or error. */
    movedLogs: number
    /** Count of recording files successfully moved (or deleted) before completion or error. */
    movedRecordings: number
    /** Failure tag, undefined when the pass completed cleanly. */
    error?: "OUT_OF_SPACE" | "PERMISSION_DENIED"
    /** Files left untouched when an error aborted the pass. */
    remaining?: number
}

/** Typed surface of the native `StorageBridgeModule`. */
interface StorageBridgeApi {
    pickFolder(): Promise<string | null>
    getCurrentFolder(): Promise<PickedFolder | null>
    clearFolder(): Promise<boolean>
    validateAccess(): Promise<boolean>
    scanLegacyFiles(): Promise<LegacyCounts>
    migrateLegacyFiles(mode: "move" | "delete"): Promise<MigrationResult>
}

const { StorageBridgeModule } = NativeModules as { StorageBridgeModule: StorageBridgeApi }

/** Singleton wrapper around the native SAF bridge. */
export const storageBridge = StorageBridgeModule
