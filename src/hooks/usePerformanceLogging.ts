import { useEffect, useLayoutEffect, useRef } from "react"
import { startTiming, markNavigationEnd, markNavigationPhase, PerformanceLogger } from "../lib/performanceLogger"

/**
 * A custom hook that logs component lifecycle events (mount, unmount, re-render). The hook itself
 * always runs (so hook ordering stays stable across builds) but every effect early-returns when
 * `PerformanceLogger.ENABLED` is false, so disabling the logger reduces the per-render cost to
 * a few `useRef`/`useEffect` no-ops.
 *
 * @param componentName - The name of the component to track.
 */
// Commit-phase render measurement threshold (ms). Renders that take longer than this print a
// `[SLOW-COMMIT]` warning so a single noisy interaction is easy to spot in logcat without
// drowning normal commits in noise. Tune via env if it ever gets chatty.
const SLOW_COMMIT_WARN_MS = 100

export const usePerformanceLogging = (componentName: string) => {
    const renderCount = useRef(1)
    const firstCommitMarked = useRef(false)
    // Captures the wall clock at the *start* of each render body. Compared against `useLayoutEffect`
    // (which fires after React commits the tree but before the browser paints) to get the real
    // commit-phase reconciliation cost. The previous `useEffect`-anchored timer measured scheduler
    // latency only, which is why every render reported "0.00 ms" and we couldn't attribute the
    // 1029 ms toggle block to a specific subtree.
    const renderStart = useRef(0)
    renderStart.current = PerformanceLogger.ENABLED ? performance.now() : 0

    // Synchronous first-commit marker fires before the browser/native paint, breaking
    // navigation timing into "tap → first commit" vs "first commit → first effect".
    useLayoutEffect(() => {
        if (!PerformanceLogger.ENABLED) return
        if (firstCommitMarked.current) return
        firstCommitMarked.current = true
        markNavigationPhase(componentName, "first_commit")
    }, [componentName])

    // Real per-commit duration. `useLayoutEffect` runs synchronously after React applies the
    // commit, so `performance.now() - renderStart` covers JSX evaluation through reconciliation.
    useLayoutEffect(() => {
        if (!PerformanceLogger.ENABLED) return
        const duration = performance.now() - renderStart.current
        const endTiming = startTiming(`${componentName}_commit`, "ui")
        endTiming({ renderCount: renderCount.current, duration_ms: Number(duration.toFixed(2)) })
        if (duration >= SLOW_COMMIT_WARN_MS) {
            // eslint-disable-next-line no-console
            console.warn(`[SLOW-COMMIT] ${componentName} commit took ${duration.toFixed(0)}ms (renderCount=${renderCount.current})`)
        }
    })

    useEffect(() => {
        if (!PerformanceLogger.ENABLED) return
        // Log mount event.
        const endTiming = startTiming(`${componentName}_mount`, "ui")
        endTiming({ status: "mounted" })

        // Mark the end of a navigation if one was pending for this component.
        markNavigationEnd(componentName)

        return () => {
            // Log unmount event.
            const endTiming = startTiming(`${componentName}_unmount`, "ui")
            endTiming({ status: "unmounted", totalRenders: renderCount.current })
        }
    }, [])

    useEffect(() => {
        if (!PerformanceLogger.ENABLED) return
        renderCount.current++
    })
}
