#!/usr/bin/env tsx
/**
 * Scripted navigation-latency check. Drives the connected emulator over `adb`, taps a sequence
 * of drawer links, then captures the resulting `[PERF]` and `[BLOCK]` logcat lines and asserts
 * each navigation phase finishes under a configured budget.
 *
 * Run via: `yarn perf:nav` (see package.json) or `tsx scripts/perf-nav-test.ts`.
 *
 * The script is intentionally narrow:
 *   1. Force-stop and relaunch the app so we measure cold mounts of each page.
 *   2. For each scenario, open the drawer (swipe-from-left), tap the named row, wait, capture logs.
 *   3. Parse `[PERF] UI - navigation_to_<route>_<phase>: <ms>ms` lines and the cumulative
 *      `navigation_to_<route>: <ms>ms` line. Print a summary and exit non-zero if any number
 *      exceeds the budget below.
 *
 * The script is *not* a substitute for a manual perception check — but it gives a stable number
 * we can put on regressions.
 */

import { execSync } from "child_process"

const DEVICE = process.env.ANDROID_DEVICE ?? "192.168.0.102:5555"
const PACKAGE = "com.steve1316.uma_android_automation"
const ACTIVITY = "com.steve1316.uma_android_automation/.MainActivity"

// Tap coordinates for drawer-row labels. Calibrated via `adb shell uiautomator dump` on the
// user's emulator (1080x1920 portrait, drawer width 280dp). Each (tapX, tapY) is the *centre of
// the row's text label* — RN's TouchableOpacity rows aren't reported as clickable to
// `uiautomator`, so we can't auto-discover them; recapture with the helper at the bottom of
// this file if the layout shifts.
//
// `expandTapX/Y`, when set, performs a pre-tap (the chevron next to the parent row) before the
// main row tap. Used for nested routes (Smart Race Solver lives under Racing Settings — tapping
// the Racing label navigates instead of expanding, so we tap the chevron at its right edge).
interface NavScenario {
    name: string
    route: string
    tapX: number
    tapY: number
    expandTapX?: number
    expandTapY?: number
    /**
     * Coordinate of a known checkbox-style toggle on the destination page. When set, the harness
     * waits for the page to settle, taps the toggle, and measures `[BLOCK]` events for
     * [TOGGLE_CAPTURE_MS] to surface re-render fan-out cost on already-mounted pages.
     */
    toggleTapX?: number
    toggleTapY?: number
}

const SCENARIOS: NavScenario[] = [
    { name: "Settings", route: "Settings", tapX: 213, tapY: 479, toggleTapX: 200, toggleTapY: 1670 },
    { name: "Training Settings", route: "TrainingSettings", tapX: 255, tapY: 565 },
    { name: "Racing Settings", route: "RacingSettings", tapX: 229, tapY: 744 },
    // Smart Race Solver lives on the `smart-race-solver` feature branch only. Add a scenario
    // here once that branch lands on master.
]

// Per-phase budget (ms). Soft thresholds — we report breaches but don't fail the run unless the
// total exceeds [TOTAL_BUDGET_MS]. Tighten as we improve.
const PHASE_BUDGETS_MS: Record<string, number> = {
    drawer_closed: 100,
    dispatch: 250,
    first_commit: 800,
}
const TOTAL_BUDGET_MS = 1500

// How long after a toggle tap to keep listening for `[BLOCK]` / `[SLOW-COMMIT]` events. The
// reported blocked-time is the sum of every `[BLOCK]` line that fires inside this window.
const TOGGLE_CAPTURE_MS = 3500
const TOGGLE_BUDGET_MS = 100

// Cold-start budget: from `am force-stop` + `am start` to the first `Home_mount` log.
const COLD_START_BUDGET_MS = 3000

interface PhaseSample {
    route: string
    phase: string
    ms: number
}

const sh = (cmd: string, opts: { check?: boolean; timeoutMs?: number } = {}): string => {
    try {
        return execSync(cmd, { encoding: "utf8", timeout: opts.timeoutMs ?? 15000, stdio: ["ignore", "pipe", "pipe"] })
    } catch (e) {
        if (opts.check === false) return ""
        throw e
    }
}

const adb = (args: string, timeoutMs = 15000): string => sh(`adb -s ${DEVICE} ${args}`, { timeoutMs })

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Capture `adb logcat` for [windowMs] milliseconds and return the collected lines. Uses
 * `adb logcat -c` then sleeps then `adb logcat -d` (one-shot) — simpler and less prone to
 * hung child processes than streaming `spawn`.
 *
 * @param windowMs Capture duration in milliseconds.
 * @returns The combined stdout of `adb logcat -d` over the window.
 */
const captureLogcat = async (windowMs: number): Promise<string> => {
    adb("logcat -c", 10000)
    await sleep(windowMs)
    return adb('logcat -d -v brief ReactNativeJS:V "*:S"', 15000)
}

const PHASE_RE = /\[PERF\] UI - navigation_to_([A-Za-z]+)_([a-z_]+): ([\d.]+)ms/
const TOTAL_RE = /\[PERF\] UI - navigation_to_([A-Za-z]+): ([\d.]+)ms/
const BLOCK_RE = /\[BLOCK\] JS thread blocked for (\d+)ms/
const SLOW_COMMIT_RE = /\[SLOW-COMMIT\] (\S+) commit took (\d+)ms/

interface Sample {
    phases: PhaseSample[]
    totals: Map<string, number>
    blocks: number[]
    slowCommits: Array<{ component: string; ms: number }>
}

const parseSamples = (logs: string): Sample => {
    const phases: PhaseSample[] = []
    const totals = new Map<string, number>()
    const blocks: number[] = []
    const slowCommits: Array<{ component: string; ms: number }> = []
    for (const line of logs.split("\n")) {
        const p = PHASE_RE.exec(line)
        if (p) {
            phases.push({ route: p[1], phase: p[2], ms: parseFloat(p[3]) })
            continue
        }
        const t = TOTAL_RE.exec(line)
        if (t) {
            totals.set(t[1], parseFloat(t[2]))
            continue
        }
        const b = BLOCK_RE.exec(line)
        if (b) blocks.push(parseInt(b[1], 10))
        const s = SLOW_COMMIT_RE.exec(line)
        if (s) slowCommits.push({ component: s[1], ms: parseInt(s[2], 10) })
    }
    return { phases, totals, blocks, slowCommits }
}

const openDrawer = () => {
    // Edge-swipe right from x=5 to x=600.
    adb("shell input swipe 5 600 600 600 80")
}

const tapAt = (x: number, y: number) => {
    adb(`shell input tap ${x} ${y}`)
}

interface ScenarioResult {
    route: string
    total: number
    phases: PhaseSample[]
    navBlocks: number[]
    toggleBlockedMs: number | null
    toggleBlocks: number[]
    toggleSlowCommits: Array<{ component: string; ms: number }>
}

/**
 * Cold-start phase: force-stop the app, relaunch via `am start -W` (which blocks until the
 * launcher activity is displayed and reports `TotalTime`), then watch for the `Home_mount`
 * log so we measure JS-side readiness instead of just the activity-display point.
 *
 * @returns Cold-start time in ms, or `-1` if the `Home_mount` log never landed in the window.
 */
const measureColdStart = async (): Promise<number> => {
    console.log("\n=== Cold start ===")
    adb(`shell am force-stop ${PACKAGE}`)
    await sleep(500)
    adb("logcat -c", 10000)
    const t0 = Date.now()
    // `am start -W` waits for the activity to be displayed and prints `TotalTime` in ms.
    const startOut = adb(`shell am start -W -n ${ACTIVITY}`, 30000)
    const totalTimeMatch = /TotalTime: (\d+)/.exec(startOut)
    const activityDisplayMs = totalTimeMatch ? parseInt(totalTimeMatch[1], 10) : -1
    // Wait until either Home_mount lands or we hit a 10 s ceiling.
    let homeMountMs = -1
    for (let i = 0; i < 20; i++) {
        await sleep(500)
        const logs = adb('logcat -d -v brief ReactNativeJS:V "*:S"', 10000)
        if (/Home_mount/.test(logs)) {
            homeMountMs = Date.now() - t0
            break
        }
    }
    console.log(`  activity_display: ${activityDisplayMs}ms`)
    console.log(`  ${homeMountMs <= COLD_START_BUDGET_MS ? "✓" : "✗"} home_mount:      ${homeMountMs}ms (budget ${COLD_START_BUDGET_MS}ms)`)
    return homeMountMs
}

const main = async () => {
    console.log(`Targeting ${DEVICE} (${PACKAGE})`)
    const coldStartMs = await measureColdStart()
    // Give the post-mount cascade time to finish before we start probing nav.
    await sleep(3500)

    let anyBreach = coldStartMs < 0 || coldStartMs > COLD_START_BUDGET_MS
    const summary: ScenarioResult[] = []

    for (const sc of SCENARIOS) {
        console.log(`\n=== ${sc.name} ===`)
        // Re-open drawer fresh each time so the prior nav doesn't bleed into the next.
        openDrawer()
        await sleep(700)

        // Some scenarios live behind a chevron expansion. Tap the chevron first and let the
        // disclosure animation settle before the actual nav tap.
        if (sc.expandTapX != null && sc.expandTapY != null) {
            tapAt(sc.expandTapX, sc.expandTapY)
            await sleep(700)
        }

        const logsPromise = captureLogcat(4000)
        tapAt(sc.tapX, sc.tapY)
        const navLogs = await logsPromise

        const { phases, totals, blocks: navBlocks } = parseSamples(navLogs)
        const total = totals.get(sc.route) ?? -1
        const routePhases = phases.filter((p) => p.route === sc.route)

        console.log(`  total: ${total}ms (budget ${TOTAL_BUDGET_MS}ms)`)
        for (const p of routePhases) {
            const budget = PHASE_BUDGETS_MS[p.phase]
            const tag = budget != null && p.ms > budget ? "  ✗" : "  ✓"
            console.log(`${tag} ${p.phase.padEnd(16)} ${p.ms.toFixed(0)}ms${budget != null ? ` (budget ${budget}ms)` : ""}`)
            if (budget != null && p.ms > budget) anyBreach = true
        }
        if (navBlocks.length > 0) {
            console.log(`  nav blocks: ${navBlocks.join("ms, ")}ms`)
        }
        if (total > TOTAL_BUDGET_MS) anyBreach = true

        // Toggle phase. Wait for the deferred-render cascade to settle, then tap the known
        // checkbox and re-capture. Sum every `[BLOCK]` event that lands in the window.
        let toggleBlockedMs: number | null = null
        let toggleBlocks: number[] = []
        let toggleSlowCommits: Array<{ component: string; ms: number }> = []
        if (sc.toggleTapX != null && sc.toggleTapY != null) {
            // Let any deferred-render cascade settle so its blocks don't get attributed to the
            // toggle.
            await sleep(2500)
            const tLogsPromise = captureLogcat(TOGGLE_CAPTURE_MS)
            tapAt(sc.toggleTapX, sc.toggleTapY)
            const tLogs = await tLogsPromise
            const tParsed = parseSamples(tLogs)
            toggleBlocks = tParsed.blocks
            toggleSlowCommits = tParsed.slowCommits
            toggleBlockedMs = toggleBlocks.reduce((a, b) => a + b, 0)
            const tag = toggleBlockedMs <= TOGGLE_BUDGET_MS ? "  ✓" : "  ✗"
            console.log(`${tag} toggle blocked   ${toggleBlockedMs}ms (budget ${TOGGLE_BUDGET_MS}ms)`)
            if (toggleBlocks.length > 0) console.log(`    block events: ${toggleBlocks.join("ms, ")}ms`)
            if (toggleSlowCommits.length > 0) {
                const top = toggleSlowCommits.sort((a, b) => b.ms - a.ms).slice(0, 5)
                console.log(`    slow commits: ${top.map((c) => `${c.component}=${c.ms}ms`).join(", ")}`)
            }
            if (toggleBlockedMs > TOGGLE_BUDGET_MS) anyBreach = true
            // Toggle it back so subsequent runs don't drift the user's settings forever.
            tapAt(sc.toggleTapX, sc.toggleTapY)
            await sleep(800)
        }

        summary.push({ route: sc.route, total, phases: routePhases, navBlocks, toggleBlockedMs, toggleBlocks, toggleSlowCommits })

        // Reset to a known state by re-launching the activity rather than relying on BACK
        // semantics (which differ for drawer-level vs stack-level screens). singleTask + the
        // launcher intent brings the existing task to front at its root (Home).
        adb(`shell am start -W -n ${ACTIVITY} -a android.intent.action.MAIN -c android.intent.category.LAUNCHER`, 15000)
        await sleep(1500)
    }

    console.log("\n=== Summary ===")
    console.log(`  cold_start ${coldStartMs}ms`)
    for (const s of summary) {
        const phasePart = s.phases.map((p) => `${p.phase}=${p.ms.toFixed(0)}`).join(" ")
        const togglePart = s.toggleBlockedMs != null ? ` toggle_blocked=${s.toggleBlockedMs}ms` : ""
        console.log(`  ${s.route.padEnd(28)} total=${s.total}ms ${phasePart}${togglePart}`)
    }

    if (anyBreach) {
        console.log("\nFAIL: at least one phase exceeded its budget.")
        process.exit(1)
    }
    console.log("\nPASS")
}

void main().catch((e) => {
    console.error(e)
    process.exit(1)
})
