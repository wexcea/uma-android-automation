// src/lib/training/scoring/__tests__/scoringConstantsFromSettings.test.ts
import { scoringConstantsFromSettings } from "../scoring"
import { DEFAULT_TRAINING_SCORING_CONSTANTS, StatName } from "../types"

describe("scoringConstantsFromSettings", () => {
    test("empty settings returns defaults", () => {
        expect(scoringConstantsFromSettings({})).toEqual(DEFAULT_TRAINING_SCORING_CONSTANTS)
    })

    test("priorityCoefficient override is applied", () => {
        const result = scoringConstantsFromSettings({ priorityCoefficient: 0.8 })
        expect(result.priorityCoefficient).toBe(0.8)
    })

    test("per-stat threshold override for Wit only leaves other stats at defaults", () => {
        const result = scoringConstantsFromSettings({ mainStatThresholdWit: 10 })
        expect(result.mainStatThresholds[StatName.WIT]).toBe(10)
        expect(result.mainStatThresholds[StatName.SPEED]).toBe(DEFAULT_TRAINING_SCORING_CONSTANTS.mainStatThresholds[StatName.SPEED])
        expect(result.mainStatThresholds[StatName.STAMINA]).toBe(DEFAULT_TRAINING_SCORING_CONSTANTS.mainStatThresholds[StatName.STAMINA])
        expect(result.mainStatThresholds[StatName.POWER]).toBe(DEFAULT_TRAINING_SCORING_CONSTANTS.mainStatThresholds[StatName.POWER])
        expect(result.mainStatThresholds[StatName.GUTS]).toBe(DEFAULT_TRAINING_SCORING_CONSTANTS.mainStatThresholds[StatName.GUTS])
    })

    test("ratio multiplier overrides are applied per-index; breakpoints stay locked to defaults", () => {
        const result = scoringConstantsFromSettings({
            ratioMultiplier1: 6,
            ratioMultiplier7: 0.25,
            // Breakpoints are not user-tunable -- any value here is ignored.
            ratioBreakpoint1: 999,
        })
        expect(result.ratioBreakpoints).toEqual([15, 30, 45, 60, 75, 90])
        expect(result.ratioMultipliers).toEqual([6, 4, 3, 2, 1, 0.5, 0.25])
    })

    test("non-numeric and non-finite values fall back to defaults", () => {
        const result = scoringConstantsFromSettings({
            priorityCoefficient: "0.9",
            miscWeight: Number.NaN,
            relationshipScale: Number.POSITIVE_INFINITY,
        })
        expect(result.priorityCoefficient).toBe(DEFAULT_TRAINING_SCORING_CONSTANTS.priorityCoefficient)
        expect(result.miscWeight).toBe(DEFAULT_TRAINING_SCORING_CONSTANTS.miscWeight)
        expect(result.relationshipScale).toBe(DEFAULT_TRAINING_SCORING_CONSTANTS.relationshipScale)
    })

    test("rainbow and anticipatory overrides are applied", () => {
        const result = scoringConstantsFromSettings({
            rainbowMultiplierEnabled: 2.5,
            rainbowMultiplierDisabled: 1.75,
            rainbowPerInstanceBase: 250,
            rainbowPerInstanceDecay: 0.4,
            anticipatoryMinFillPercent: 15,
            anticipatoryCoefficient: 0.25,
            anticipatoryCap: 0.7,
        })
        expect(result.rainbowMultiplierEnabled).toBe(2.5)
        expect(result.rainbowMultiplierDisabled).toBe(1.75)
        expect(result.rainbowPerInstanceBase).toBe(250)
        expect(result.rainbowPerInstanceDecay).toBe(0.4)
        expect(result.anticipatoryMinFillPercent).toBe(15)
        expect(result.anticipatoryCoefficient).toBe(0.25)
        expect(result.anticipatoryCap).toBe(0.7)
    })
})
