/**
 * Wrapper for `yarn android`. Prompts whether to enable `PerformanceLogger` for this run, then
 * spawns `npx expo run:android --device` with `EXPO_PUBLIC_PERF_LOGGER` set to `'1'` or `'0'`.
 * Metro inlines `EXPO_PUBLIC_*` env vars at bundle time, so the chosen value is baked into the
 * JS bundle and read by `src/lib/performanceLogger.ts` at runtime.
 *
 * Skip-prompt rules:
 *   1. If `EXPO_PUBLIC_PERF_LOGGER` is already `'0'` or `'1'`, use it verbatim.
 *   2. If stdin is not a TTY (CI, piped input), default to `'0'`.
 *   3. Otherwise show an arrow-key picker.
 */

import { spawn } from "child_process"
import prompts from "prompts"

/**
 * Resolve the `EXPO_PUBLIC_PERF_LOGGER` value to use for this run, asking the user when needed.
 * @returns `'1'` to enable `PerformanceLogger`, `'0'` to disable, or `null` if the user cancelled the prompt.
 */
const resolvePerfFlag = async (): Promise<string | null> => {
    const preset = process.env.EXPO_PUBLIC_PERF_LOGGER
    if (preset === "0" || preset === "1") {
        console.log(`EXPO_PUBLIC_PERF_LOGGER=${preset} preset in env — skipping prompt.`)
        return preset
    }

    if (!process.stdin.isTTY) {
        console.log("Non-interactive shell detected — defaulting EXPO_PUBLIC_PERF_LOGGER=0.")
        return "0"
    }

    const response = await prompts({
        type: "select",
        name: "perf",
        message: "Enable PerformanceLogger for this run?",
        choices: [
            { title: "No - skip perf logging", value: "0" },
            { title: "Yes - log perf metrics to logcat", value: "1" },
        ],
        initial: 0,
    })

    if (typeof response.perf !== "string") return null
    return response.perf
}

/**
 * Spawn `npx expo run:android --device` with the chosen perf flag injected, inheriting stdio
 * so the Expo device picker and build output stream straight to the user's terminal.
 *
 * @param perfFlag The `EXPO_PUBLIC_PERF_LOGGER` value to inject (`'0'` or `'1'`).
 * @returns A promise that resolves with the child's exit code, or `1` if the child was killed by a signal.
 */
const runExpo = (perfFlag: string): Promise<number> =>
    new Promise((resolve) => {
        const child = spawn("npx", ["expo", "run:android", "--device"], {
            stdio: "inherit",
            shell: true,
            env: { ...process.env, EXPO_PUBLIC_PERF_LOGGER: perfFlag },
        })

        const forwardSignal = (sig: NodeJS.Signals) => child.kill(sig)
        process.on("SIGINT", forwardSignal)
        process.on("SIGTERM", forwardSignal)

        child.on("close", (code, signal) => {
            process.off("SIGINT", forwardSignal)
            process.off("SIGTERM", forwardSignal)
            if (signal) return resolve(1)
            resolve(code ?? 0)
        })
    })

const main = async () => {
    const perfFlag = await resolvePerfFlag()
    if (perfFlag === null) {
        console.log("Cancelled.")
        process.exit(130)
    }
    const code = await runExpo(perfFlag)
    process.exit(code)
}

void main().catch((e) => {
    console.error(e)
    process.exit(1)
})
