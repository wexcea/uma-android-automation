import { useCallback, useEffect, useState } from "react"
import { databaseManager } from "../lib/database"

/** Shape returned by `useFirstRunGate`. */
interface FirstRunGate {
    /** True after the initial SQLite load has resolved (success or failure). */
    ready: boolean
    /** True when the user has not yet completed the first-run wizard. */
    isFirstRun: boolean
    /** Persists `firstRun.completed = true` and flips `isFirstRun` to false. Re-throws on DB failure. */
    markComplete: () => Promise<void>
}

/** Read `firstRun.completed` from SQLite on mount and expose helpers to gate the app's root nav.
 *
 * @returns A `FirstRunGate` object describing whether the wizard should appear.
 */
export const useFirstRunGate = (): FirstRunGate => {
    const [ready, setReady] = useState(false)
    const [isFirstRun, setIsFirstRun] = useState(false)

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                // `useBootstrap` defers DB init behind `runAfterInteractions`, but the gate fires
                // synchronously after first paint. Without this await, `loadSetting` throws
                // "Database not initialized" and the catch silently treats every launch as a first run.
                await databaseManager.initialize()
                const value = await databaseManager.loadSetting("firstRun", "completed")
                if (cancelled) return
                setIsFirstRun(value !== true && value !== "true")
            } catch {
                if (cancelled) return
                setIsFirstRun(true)
            } finally {
                if (!cancelled) setReady(true)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [])

    const markComplete = useCallback(async () => {
        await databaseManager.initialize()
        await databaseManager.saveSetting("firstRun", "completed", true)
        setIsFirstRun(false)
    }, [])

    return { ready, isFirstRun, markComplete }
}
