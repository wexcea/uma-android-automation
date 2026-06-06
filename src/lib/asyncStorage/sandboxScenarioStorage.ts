// src/lib/asyncStorage/sandboxScenarioStorage.ts
import AsyncStorage from "@react-native-async-storage/async-storage"
import { initialScenario, SandboxScenario } from "../../components/TrainingScoringSandbox/scenarioState"

const KEY = "training-scoring-sandbox-scenario:v1"

/**
 * Persist a `SandboxScenario` to AsyncStorage under the sandbox scenario key. Best-effort; failures are swallowed so the sandbox UX never crashes on storage errors.
 *
 * @param scenario The scenario to persist.
 */
export async function saveSandboxScenario(scenario: SandboxScenario): Promise<void> {
    try {
        await AsyncStorage.setItem(KEY, JSON.stringify(scenario))
    } catch {
        // best-effort persistence
    }
}

/**
 * Load a previously-persisted `SandboxScenario`. If none exists or parsing fails, returns `initialScenario`. The merge with `initialScenario` defends against shape evolution
 * so new fields added in a later version are filled from defaults.
 *
 * @returns The persisted scenario merged with the current baseline defaults, or `initialScenario` if nothing was saved.
 */
export async function loadSandboxScenario(): Promise<SandboxScenario> {
    try {
        const raw = await AsyncStorage.getItem(KEY)
        if (raw === null) return initialScenario
        const parsed = JSON.parse(raw) as Partial<SandboxScenario>
        return {
            ...initialScenario,
            ...parsed,
            trainings: { ...initialScenario.trainings, ...(parsed.trainings ?? {}) },
            traineeTotals: { ...initialScenario.traineeTotals, ...(parsed.traineeTotals ?? {}) },
        }
    } catch {
        return initialScenario
    }
}
