import { ALL_STAT_NAMES, BarFillResult, DEFAULT_TRAINING_SCORING_CONSTANTS, StatName, TrainingConfig, TrainingOption } from "../../lib/training/scoring"
import { SandboxScenario } from "./scenarioState"

const TIER_FILL_PERCENT: Record<"blue" | "green" | "orange", number> = { blue: 0, green: 50, orange: 100 }

function buildBars(friendBars: SandboxScenario["trainings"][StatName]["friendBars"]): BarFillResult[] {
    const out: BarFillResult[] = []
    for (const tier of ["blue", "green", "orange"] as const) {
        for (let i = 0; i < friendBars[tier]; i += 1) {
            out.push({ dominantColor: tier, fillPercent: TIER_FILL_PERCENT[tier], isTrainerSupport: false })
        }
    }
    return out
}

/** Hydrated scoring inputs for one scenario. */
export interface ScenarioScoringInputs {
    /** The shared `TrainingConfig` consumed by every per-training score call. */
    config: TrainingConfig
    /** The 5 trainings, ready to be passed into `calculateRawTrainingScore`. */
    trainings: TrainingOption[]
}

/**
 * Hydrate a `SandboxScenario` into a scoring `TrainingConfig` plus 5 `TrainingOption`s ready to feed into the scoring functions exported from `src/lib/training/scoring`.
 *
 * @param scenario The user's sandbox scenario.
 * @returns Scoring inputs for the 5 trainings.
 */
export function scenarioToScoring(scenario: SandboxScenario): ScenarioScoringInputs {
    const config: TrainingConfig = {
        currentStats: { ...scenario.traineeTotals },
        statPrioritization: [StatName.SPEED, StatName.STAMINA, StatName.POWER, StatName.GUTS, StatName.WIT],
        summerTrainingStatPriority: [StatName.WIT, StatName.SPEED, StatName.STAMINA, StatName.POWER, StatName.GUTS],
        statTargets: { [StatName.SPEED]: 1200, [StatName.STAMINA]: 1200, [StatName.POWER]: 1200, [StatName.GUTS]: 1200, [StatName.WIT]: 1200 },
        currentDate: { year: scenario.year, day: 1, bIsPreDebut: false, isSummer: false },
        scenario: "URA",
        enableRainbowTrainingBonus: true,
        blacklist: [],
        disableTrainingOnMaxedStat: false,
        trainingOptions: [],
        skillHintsPerLocation: {},
        enablePrioritizeSkillHints: false,
        enableTrainingLevelWeighting: true,
        disableStatTargets: false,
        enablePrioritizeNearMaxFriendship: true,
        statsTrainedOverBuffer: new Set(),
        scoring: DEFAULT_TRAINING_SCORING_CONSTANTS,
    }

    const trainings: TrainingOption[] = ALL_STAT_NAMES.map((name) => {
        const t = scenario.trainings[name]
        return {
            name,
            statGains: { ...t.statGains },
            failureChance: 0,
            relationshipBars: buildBars(t.friendBars),
            numRainbow: t.rainbow ? 1 : 0,
            numSkillHints: 0,
            trainingLevel: t.trainingLevel,
        }
    })

    return { config, trainings }
}
