import { calculateRelationshipScore } from "../scoring"
import { BarFillResult, DEFAULT_TRAINING_SCORING_CONSTANTS, DateYear, StatName, TrainingConfig, TrainingOption } from "../types"

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

function bar(color: string, fillPercent: number, isTrainerSupport = false): BarFillResult {
    return { dominantColor: color, fillPercent, isTrainerSupport }
}

const blankTraining: TrainingOption = {
    name: StatName.SPEED,
    statGains: {},
    failureChance: 0,
    relationshipBars: [],
    numRainbow: 0,
    numSkillHints: 0,
    trainingLevel: 1,
}

describe("calculateRelationshipScore", () => {
    test("empty bars returns 0", () => {
        expect(calculateRelationshipScore(makeConfig(), blankTraining)).toBe(0)
    })

    test("single full orange bar contributes 0 (orange value is 0)", () => {
        const training = { ...blankTraining, relationshipBars: [bar("orange", 100)] }
        expect(calculateRelationshipScore(makeConfig(), training)).toBe(0)
    })

    test("single empty blue bar in classic year scales normally", () => {
        const training = { ...blankTraining, relationshipBars: [bar("blue", 0)] }
        // baseValue 2.5, diminishing 1.0, earlyBonus 1.0, trainerBonus 1.0 -> 2.5
        // maxScore = 2.5 * 1.3 = 3.25 (Kotlin always multiplies by relationshipEarlyGameBonus) -> ratio 0.7692... -> ~76.923
        expect(calculateRelationshipScore(makeConfig(), training)).toBeCloseTo(76.923076923, 6)
    })

    test("junior year applies early game bonus to both score and maxScore proportionally", () => {
        const config = makeConfig({ currentDate: { year: DateYear.JUNIOR, day: 1, bIsPreDebut: false, isSummer: false } })
        const training = { ...blankTraining, relationshipBars: [bar("green", 0)] }
        // baseValue 1.0, diminishing 1.0, earlyBonus 1.3, trainerBonus 1.0 -> 1.3
        // maxScore = 2.5 * 1.3 = 3.25 -> ratio 0.4 -> 40
        expect(calculateRelationshipScore(config, training)).toBeCloseTo(40, 6)
    })
})
