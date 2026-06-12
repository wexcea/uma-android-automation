import { NativeModules } from "react-native"

/** Result of a successful logcat dump, surfaced to JS by `dumpLogcat`. */
export interface LogcatDumpResult {
    /** Name of the written file, e.g. `adb_dump_2026-06-12_00_30_15.txt`. */
    filename: string
    /** Number of bytes written to the file. */
    bytes: number
    /** Short label of where the file landed: the SAF folder name, or the legacy external-files path. */
    location: string
}

/** Typed surface of the native `LogcatModule`. */
interface LogcatBridgeApi {
    /** Dump this app's logcat from the last 6 hours to a timestamped file at the storage root. */
    dumpLogcat(): Promise<LogcatDumpResult>
}

const { LogcatModule } = NativeModules as { LogcatModule: LogcatBridgeApi }

/** Singleton wrapper around the native logcat bridge. */
export const logcatBridge = LogcatModule
