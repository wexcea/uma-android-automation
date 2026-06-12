import { useCallback, useState } from "react"
import { logcatBridge } from "../lib/logcatBridge"

/** State and actions returned by `useLogcatDump`. */
export interface LogcatDumpState {
    /** True while a dump is in progress. Used to disable the trigger and show a busy label. */
    dumping: boolean
    /** The latest result or error message to surface in a Snackbar, or null when nothing to show. */
    message: string | null
    /** Trigger a logcat dump. No-op while a previous dump is still running. */
    dump: () => Promise<void>
    /** Clear the current message (e.g. on Snackbar dismiss). */
    clearMessage: () => void
}

/**
 * Owns the logcat-dump action: tracks the busy flag and builds the user-facing result message from the native bridge call.
 * Keeping this out of the page makes it unit-testable without rendering the whole Debug Settings screen.
 *
 * @returns The dump state and actions.
 */
export function useLogcatDump(): LogcatDumpState {
    const [dumping, setDumping] = useState(false)
    const [message, setMessage] = useState<string | null>(null)

    const dump = useCallback(async () => {
        if (dumping) return
        setDumping(true)
        try {
            const result = await logcatBridge.dumpLogcat()
            setMessage(`Saved ${result.filename} to ${result.location}`)
        } catch (error) {
            setMessage(`Logcat dump failed: ${error instanceof Error ? error.message : String(error)}`)
        } finally {
            setDumping(false)
        }
    }, [dumping])

    const clearMessage = useCallback(() => setMessage(null), [])

    return { dumping, message, dump, clearMessage }
}
