import { useEffect, useState } from "react"
import { storageBridge, LegacyCounts } from "../lib/storageBridge"

/** Shape returned by `useLegacyFileScan`. */
interface LegacyScan {
    /** True while the initial scan call is in flight. */
    scanning: boolean
    /** Resolved counts when scan succeeded, null while scanning or on failure. */
    counts: LegacyCounts | null
    /** True when scan succeeded and at least one file was found. */
    hasLegacyFiles: boolean
}

/** Call `storageBridge.scanLegacyFiles` once on mount and expose the result for the wizard's migration-step gating.
 *
 * @returns A `LegacyScan` snapshot.
 */
export const useLegacyFileScan = (): LegacyScan => {
    const [scanning, setScanning] = useState(true)
    const [counts, setCounts] = useState<LegacyCounts | null>(null)

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const result = await storageBridge.scanLegacyFiles()
                if (!cancelled) setCounts(result)
            } catch {
                if (!cancelled) setCounts(null)
            } finally {
                if (!cancelled) setScanning(false)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [])

    const hasLegacyFiles = counts !== null && (counts.logs > 0 || counts.recordings > 0)
    return { scanning, counts, hasLegacyFiles }
}
