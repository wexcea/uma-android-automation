import { calculateStatEfficiencyScore } from "../scoring"
import { DEFAULT_TRAINING_SCORING_CONSTANTS, DateYear, StatName, TrainingConfig, TrainingOption } from "../types"

function makeConfig(overrides: Partial<TrainingConfig> = {}): TrainingConfig {
    return {
        currentStats: { [StatName.SPEED]: 100, [StatName.STAMINA]: 100, [StatName.POWER]: 100, [StatName.GUTS]: 100, [StatName.WIT]: 100 },
        statPrioritization: [StatName.WIT, StatName.SPEED, StatName.POWER, StatName.STAMINA, StatName.GUTS],
        summerTrainingStatPriority: [],
        statTargets: { [StatName.SPEED]: 1200, [StatName.STAMINA]: 1200, [StatName.POWER]: 1200, [StatName.GUTS]: 1200, [StatName.WIT]: 1200 },
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

function makeTraining(overrides: Partial<TrainingOption> = {}): TrainingOption {
    return {
        name: StatName.WIT,
        statGains: { [StatName.WIT]: 10 },
        failureChance: 0,
        relationshipBars: [],
        numRainbow: 0,
        numSkillHints: 0,
        trainingLevel: 1,
        ...overrides,
    }
}

describe("calculateStatEfficiencyScore", () => {
    test("returns 0 when no stat gains", () => {
        const score = calculateStatEfficiencyScore(makeConfig(), makeTraining({ statGains: {} }))
        expect(score).toBe(0)
    })

    test("Wit main-stat bonus does NOT fire at 10 gain (threshold 15)", () => {
        const score = calculateStatEfficiencyScore(makeConfig(), makeTraining({ statGains: { [StatName.WIT]: 10 } }))
        // completion=100/1200*100=8.33%, ratioMultiplier=5.0 (bucket <15)
        // priorityMultiplier = 1 + 0.5*(5-0) = 3.5 (Wit is index 0 in priority)
        // mainStatBonus = 1.0 (gain < threshold)
        // score = 10 * 5 * 3.5 * 1 * 1 = 175
        expect(score).toBeCloseTo(175, 6)
    })

    test("Wit main-stat bonus fires at 15 gain (threshold 15)", () => {
        const score = calculateStatEfficiencyScore(makeConfig(), makeTraining({ statGains: { [StatName.WIT]: 15 } }))
        // ratio*priority = 5 * 3.5 = 17.5; mainStatBonus = 2; raw = 15 * 17.5 * 2 = 525
        expect(score).toBeCloseTo(525, 6)
    })

    test("uses summer priority list when summer", () => {
        const summerConfig = makeConfig({
            currentDate: { year: DateYear.CLASSIC, day: 50, bIsPreDebut: false, isSummer: true },
            summerTrainingStatPriority: [StatName.SPEED, StatName.STAMINA, StatName.POWER, StatName.GUTS, StatName.WIT],
        })
        // Wit is now index 4 in summer priority; priorityMultiplier = 1 + 0.5*(5-4) = 1.5
        // gain=10, ratio=5.0, mainStatBonus=1.0 -> 10 * 5 * 1.5 = 75
        const score = calculateStatEfficiencyScore(summerConfig, makeTraining({ statGains: { [StatName.WIT]: 10 } }))
        expect(score).toBeCloseTo(75, 6)
    })
})
