// src/lib/training/scoring/__tests__/calculateRawTrainingScore.test.ts
import { calculateRawTrainingScore } from "../scoring"
import { calculateMiscScore } from "../scoring"
import { calculateRelationshipScore } from "../scoring"
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

describe("calculateRawTrainingScore", () => {
    test("returns 0 when training is blacklisted", () => {
        const config = makeConfig({ blacklist: [StatName.WIT] })
        expect(calculateRawTrainingScore(config, makeTraining())).toBe(0)
    })

    test("returns 0 when current stat is already at or above the absolute cap", () => {
        // statCap=1200; currentStat=1200 -> returns 0 before any scoring.
        const config = makeConfig({ currentStats: { [StatName.WIT]: 1200 } })
        expect(calculateRawTrainingScore(config, makeTraining({ statGains: { [StatName.WIT]: 10 } }))).toBe(0)
    })

    test("returns 0 when potentialStat would exceed effectiveStatCap and no rainbow allowance", () => {
        // statCap=1200, finaleBonus(day=1)=45, effectiveStatCap = 1200 - 100 - 45 = 1055.
        // currentStat=1050 (< 1055 so passes first buffer check when disableTrainingOnMaxedStat=false),
        // potentialStat = 1050 + 10 = 1060 >= 1055 -> blocked (no rainbow).
        const config = makeConfig({ currentStats: { [StatName.WIT]: 1050 } })
        expect(calculateRawTrainingScore(config, makeTraining({ statGains: { [StatName.WIT]: 10 } }))).toBe(0)
    })

    test("happy path: no bars, no rainbows -- weighted stat + misc only", () => {
        // currentStat=100; potentialStat=110; statCap=1200; finaleBonus=45; effectiveStatCap=1055.
        // Passes buffer checks; no relationship bars.
        const config = makeConfig()
        const training = makeTraining()

        const statScore = calculateStatEfficiencyScore(config, training)
        const relationshipScore = calculateRelationshipScore(config, training)
        const miscScore = calculateMiscScore(config, training)
        // statWeight (no bars) = 0.7, relationshipWeight = 0, miscWeight = 0.3.
        // total = statScore * 0.7 + 0 + miscScore * 0.3
        // statScore = 175 (see efficiency test), miscScore = 50 -> total = 175 * 0.7 + 50 * 0.3 = 122.5 + 15 = 137.5
        const expected = statScore * 0.7 + relationshipScore * 0 + miscScore * 0.3
        expect(calculateRawTrainingScore(config, training)).toBeCloseTo(expected, 6)
        expect(expected).toBeCloseTo(137.5, 6)
    })

    test("applies 2.0x rainbow multiplier in Classic year when enableRainbowTrainingBonus is true", () => {
        const config = makeConfig({
            enableRainbowTrainingBonus: true,
            currentDate: { year: DateYear.CLASSIC, day: 1, bIsPreDebut: false, isSummer: false },
        })
        const trainingNoRainbow = makeTraining({
            relationshipBars: [{ dominantColor: "orange", fillPercent: 100, isTrainerSupport: false }],
            numRainbow: 0,
        })
        const trainingWithRainbow = makeTraining({
            relationshipBars: [{ dominantColor: "orange", fillPercent: 100, isTrainerSupport: false }],
            numRainbow: 1,
        })

        const baseline = calculateRawTrainingScore(config, trainingNoRainbow)
        const rainbow = calculateRawTrainingScore(config, trainingWithRainbow)

        // With a rainbow, the inputs to the stat/relationship/misc scoring functions are identical (numRainbow is not consumed).
        // The only delta is the 2.0x rainbow multiplier in Year 2+.
        expect(rainbow).toBeCloseTo(baseline * 2.0, 6)
    })

    test("anticipatory multiplier fires only when no real rainbow and Year > Junior", () => {
        const bars = [
            { dominantColor: "green", fillPercent: 80, isTrainerSupport: false },
            { dominantColor: "blue", fillPercent: 90, isTrainerSupport: false },
        ]
        // Classic year, no rainbows, two qualifying bars => multiplier fires.
        const classicConfig = makeConfig({
            currentDate: { year: DateYear.CLASSIC, day: 1, bIsPreDebut: false, isSummer: false },
            enablePrioritizeNearMaxFriendship: true,
        })
        const training = makeTraining({ relationshipBars: bars, numRainbow: 0 })

        // Without the anticipatory feature, recompute the baseline by toggling off the flag.
        const baselineConfig = makeConfig({
            currentDate: { year: DateYear.CLASSIC, day: 1, bIsPreDebut: false, isSummer: false },
            enablePrioritizeNearMaxFriendship: false,
        })
        const baseline = calculateRawTrainingScore(baselineConfig, training)
        // contributions = 0.8 + 0.9 = 1.7; coeff=0.2 -> 0.34; cap=0.6 -> multiplier = 1 + min(0.6, 0.34) = 1.34.
        const expected = baseline * 1.34
        expect(calculateRawTrainingScore(classicConfig, training)).toBeCloseTo(expected, 6)

        // Junior year: must NOT fire (year not > JUNIOR).
        const juniorConfig = makeConfig({
            currentDate: { year: DateYear.JUNIOR, day: 1, bIsPreDebut: false, isSummer: false },
            enablePrioritizeNearMaxFriendship: true,
        })
        const juniorBaselineConfig = makeConfig({
            currentDate: { year: DateYear.JUNIOR, day: 1, bIsPreDebut: false, isSummer: false },
            enablePrioritizeNearMaxFriendship: false,
        })
        expect(calculateRawTrainingScore(juniorConfig, training)).toBeCloseTo(calculateRawTrainingScore(juniorBaselineConfig, training), 6)

        // Classic year but with a real rainbow: anticipatory multiplier must NOT fire (numRainbow > 0).
        const trainingWithRainbow = makeTraining({ relationshipBars: bars, numRainbow: 1 })
        const classicNoAnticConfig = makeConfig({
            currentDate: { year: DateYear.CLASSIC, day: 1, bIsPreDebut: false, isSummer: false },
            enablePrioritizeNearMaxFriendship: false,
        })
        // Both configs should produce the same value because the rainbow short-circuits the anticipatory block.
        expect(calculateRawTrainingScore(classicConfig, trainingWithRainbow)).toBeCloseTo(calculateRawTrainingScore(classicNoAnticConfig, trainingWithRainbow), 6)
    })
})
