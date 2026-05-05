/**
 * Performance logging utility for tracking operation timing and performance metrics.
 * Provides detailed timing information for debugging performance issues.
 *
 * Log Structure Breakdown:
 * `[PERF] CATEGORY - Operation: Duration | Details`
 *
 * 1. [PERF]: Static prefix for easy filtering in the console.
 * 2. CATEGORY: The system area being monitored (UI, DATABASE, STATE, SETTINGS).
 * 3. Operation: Functional name of the task (e.g., Home_render, save_settings).
 * 4. Duration: Time taken in milliseconds (ms).
 * 5. Details: (Optional) JSON payload for additional context (e.g., render counts, mount status).
 *
 * Interpretation Guide:
 * - renderCount: Number of times a component has updated. High counts for a single action suggest unnecessary re-renders.
 *   Skip counts (action: "skip") in search registration indicate efficient indexing.
 * - status: Tracks "mounted" vs "unmounted" lifecycle states.
 * - duration: Critical for background operations. Slow operations will trigger a `console.warn` to highlight performance bottlenecks.
 *
 * Examples:
 * - UI Render: `[PERF] UI - Home_render: 0.00ms | Details: {"renderCount":5}`
 * - UI Mount: `[PERF] UI - Settings_mount: 0.00ms | Details: {"status":"mounted"}`
 * - Search Registry: `[PERF] UI - search_register_item: 0.01ms | Details: {"id":"...","action":"skip"}`
 * - Database: `[PERF] DATABASE - database_load_all_settings: 12.45ms`
 */

export interface PerformanceMetric {
    /** The name of the operation being timed. */
    operation: string
    /** The duration of the operation in milliseconds. */
    duration: number
    /** The timestamp when the operation started. */
    timestamp: number
    /** Additional details about the operation. */
    details?: Record<string, any>
    /** The category of the operation (e.g., "database", "settings", "state", "ui"). */
    category: "database" | "settings" | "state" | "ui"
}

/**
 * Performance logging utility for tracking operation timing and performance metrics.
 * Provides detailed timing information for debugging performance issues.
 */
export class PerformanceLogger {
    // Gated by `EXPO_PUBLIC_PERF_LOGGER`, which Metro inlines at bundle time. The `yarn android`
    // wrapper (`scripts/run-android.ts`) prompts the user and sets it to `'1'` or `'0'`. Set
    // `EXPO_PUBLIC_PERF_LOGGER=1` in the shell before `yarn android` (or `yarn perf:nav`) to bypass
    // the prompt. When the var is unset (release builds, IDE-launched runs), the logger is off.
    public static ENABLED: boolean = process.env.EXPO_PUBLIC_PERF_LOGGER === "1"
    public static SUPPRESS_LOGGING = false

    private metrics: PerformanceMetric[] = []
    private maxMetricsHistory = 100

    private pendingNavigations: Map<string, number> = new Map()

    /**
     * Start timing an operation.
     * @param operation The name of the operation being timed.
     * @param category The category of the operation (e.g., "database", "settings", "state", "ui").
     * @returns A function to stop timing the operation and record the metric.
     */
    startTiming(operation: string, category: PerformanceMetric["category"] = "settings"): (details?: Record<string, any>) => PerformanceMetric {
        if (!PerformanceLogger.ENABLED) {
            return () => ({
                operation,
                duration: 0,
                timestamp: Date.now(),
                category,
            })
        }

        const startTime = performance.now()
        const timestamp = Date.now()

        return (details?: Record<string, any>) => {
            const endTime = performance.now()
            const duration = endTime - startTime

            const metric: PerformanceMetric = {
                operation,
                duration,
                timestamp,
                details,
                category,
            }

            this.recordMetric(metric)
            return metric
        }
    }

    /**
     * Mark the start of a navigation.
     * @param target The target of the navigation.
     */
    markNavigationStart(target: string) {
        if (!PerformanceLogger.ENABLED) return
        this.pendingNavigations.set(target, performance.now())
    }

    /**
     * Mark an intermediate phase between [markNavigationStart] and [markNavigationEnd]. Records
     * the cumulative time from tap to this phase without consuming the start timestamp, so the
     * standard mount-end timing keeps working. Used to break "tap → page mounted" into actionable
     * buckets (tap → drawer-close, drawer-close → dispatch, dispatch → first-commit, first-commit → first-effect).
     *
     * @param target The navigation target (route name).
     * @param phase Free-form phase label (e.g. "dispatch", "first_commit").
     */
    markNavigationPhase(target: string, phase: string) {
        if (!PerformanceLogger.ENABLED) return
        const startTime = this.pendingNavigations.get(target)
        if (startTime === undefined) return

        const duration = performance.now() - startTime
        const metric: PerformanceMetric = {
            operation: `navigation_to_${target}_${phase}`,
            duration,
            timestamp: Date.now(),
            category: "ui",
        }
        this.recordMetric(metric)
    }

    /**
     * Mark the end of a navigation and record the duration.
     * @param target The target of the navigation.
     * @param category The category of the navigation (e.g., "ui").
     */
    markNavigationEnd(target: string, category: PerformanceMetric["category"] = "ui") {
        if (!PerformanceLogger.ENABLED) return
        const startTime = this.pendingNavigations.get(target)
        if (startTime === undefined) return

        const duration = performance.now() - startTime
        this.pendingNavigations.delete(target)

        const metric: PerformanceMetric = {
            operation: `navigation_to_${target}`,
            duration,
            timestamp: Date.now(),
            category,
        }

        this.recordMetric(metric)
    }

    /**
     * Record a performance metric.
     * @param metric The metric to record.
     */
    recordMetric(metric: PerformanceMetric) {
        if (!PerformanceLogger.ENABLED) return

        this.metrics.push(metric)

        // Keep only the most recent metrics to prevent memory issues.
        if (this.metrics.length > this.maxMetricsHistory) {
            this.metrics = this.metrics.slice(-this.maxMetricsHistory)
        }

        this.logMetric(metric)
    }

    /**
     * Log a performance metric to console.
     * @param metric The metric to log.
     */
    private logMetric(metric: PerformanceMetric) {
        if (!PerformanceLogger.ENABLED) return
        const logMessage = `[PERF] ${metric.category.toUpperCase()} - ${metric.operation}: ${metric.duration.toFixed(2)}ms${metric.details ? ` | Details: ${JSON.stringify(metric.details)}` : ""}`

        if (metric.duration >= 300) {
            console.warn(logMessage) // Warn for slow operations.
        } else {
            console.log(logMessage)
        }
    }
}

// Create singleton instance.
export const performanceLogger = new PerformanceLogger()

// Export convenience functions.
export const startTiming = (operation: string, category?: PerformanceMetric["category"]) => performanceLogger.startTiming(operation, category)
export const markNavigationStart = (target: string) => performanceLogger.markNavigationStart(target)
export const markNavigationPhase = (target: string, phase: string) => performanceLogger.markNavigationPhase(target, phase)
export const markNavigationEnd = (target: string, category?: PerformanceMetric["category"]) => performanceLogger.markNavigationEnd(target, category)

/**
 * Probe that detects long JS-thread blocks. Schedules a ~16 ms timer; whenever the actual gap
 * between fires exceeds [thresholdMs], logs a `[BLOCK]` warning with the duration. Cheap when
 * the thread is idle (one timer per frame) and self-suppressing under sustained load (the
 * timer simply won't fire). Start it once at app bootstrap.
 *
 * @param thresholdMs Minimum gap (ms) to log. Defaults to 100 ms (≈ 6 dropped frames).
 * @returns A cleanup function that stops the probe.
 */
export const startJsThreadBlockDetector = (thresholdMs = 100): (() => void) => {
    if (!PerformanceLogger.ENABLED) return () => {}
    let last = performance.now()
    let stopped = false
    const tick = () => {
        if (stopped) return
        const now = performance.now()
        const gap = now - last
        if (gap >= thresholdMs) {
            // eslint-disable-next-line no-console
            console.warn(`[BLOCK] JS thread blocked for ${gap.toFixed(0)}ms`)
        }
        last = now
        setTimeout(tick, 16)
    }
    setTimeout(tick, 16)
    return () => {
        stopped = true
    }
}
