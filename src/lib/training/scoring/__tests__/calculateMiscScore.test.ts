// src/lib/training/scoring/__tests__/calculateMiscScore.test.ts
import { calculateMiscScore } from "../scoring"
import { DEFAULT_TRAINING_SCORING_CONSTANTS, DateYear, StatName, TrainingConfig, TrainingOption } from "../types"

function makeConfig(overrides: Partial<TrainingConfig> = {}): TrainingConfig {
    return {
        currentStats: {},
        statPrioritization: [],
        summerTrainingStatPriority: [],
        statTargets: {},
        currentDate: { year: DateYear.CLASSIC, day: 1, bIsPreDebut: false, isSummer: false },
        scenario: "URA",
        enableRainbowTrainingBonus: true,
        blacklist: [],
        disableTrainingOnMaxedStat: false,
        trainingOptions: [],
        skillHintsPerLocation: {},
        enablePrioritizeSkillHints: false,
        enableTrainingLevelWeighting: false,
        disableStatTargets: false,
        enablePrioritizeNearMaxFriendship: true,
        statsTrainedOverBuffer: new Set(),
        scoring: DEFAULT_TRAINING_SCORING_CONSTANTS,
        ...overrides,
    }
}

const wit: TrainingOption = {
    name: StatName.WIT,
    statGains: {},
    failureChance: 0,
    relationshipBars: [],
    numRainbow: 0,
    numSkillHints: 0,
    trainingLevel: 1,
}

describe("calculateMiscScore", () => {
    test("no skill hints returns base 50", () => {
        expect(calculateMiscScore(makeConfig(), wit)).toBe(50)
    })

    test("two skill hints: 50 + 2*10 = 70", () => {
        const config = makeConfig({ skillHintsPerLocation: { [StatName.WIT]: 2 } })
        expect(calculateMiscScore(config, wit)).toBe(70)
    })

    test("score caps at 100", () => {
        const config = makeConfig({ skillHintsPerLocation: { [StatName.WIT]: 10 } })
        // 50 + 100 = 150, coerced to 100
        expect(calculateMiscScore(config, wit)).toBe(100)
    })

    test("prioritize skill hints with hint returns override score", () => {
        const config = makeConfig({ enablePrioritizeSkillHints: true, skillHintsPerLocation: { [StatName.WIT]: 1 } })
        // overrideScore 10000 + 60 = 10060
        expect(calculateMiscScore(config, wit)).toBe(10060)
    })
})
