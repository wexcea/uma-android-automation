import { levelBoostMultiplier } from "../scoring"
import { DEFAULT_TRAINING_SCORING_CONSTANTS } from "../types"

describe("levelBoostMultiplier", () => {
    const c = DEFAULT_TRAINING_SCORING_CONSTANTS

    test("level 1 returns 1.0 regardless of rank", () => {
        expect(levelBoostMultiplier(1, 1, c)).toBe(1.0)
        expect(levelBoostMultiplier(2, 1, c)).toBe(1.0)
        expect(levelBoostMultiplier(3, 1, c)).toBe(1.0)
    })

    test("null level treated as 1", () => {
        expect(levelBoostMultiplier(1, null, c)).toBe(1.0)
    })

    test("rank 1, level 5 yields 1 + 0.75 * 1.0", () => {
        // (5 - 1) / 4 = 1.0
        expect(levelBoostMultiplier(1, 5, c)).toBeCloseTo(1.75, 10)
    })

    test("rank 2, level 3 yields 1 + 0.25 * 0.5", () => {
        // (3 - 1) / 4 = 0.5
        expect(levelBoostMultiplier(2, 3, c)).toBeCloseTo(1.125, 10)
    })

    test("rank 3, level 5 yields 1 + 0.1 * 1.0", () => {
        expect(levelBoostMultiplier(3, 5, c)).toBeCloseTo(1.1, 10)
    })

    test("rank > 3 returns 1.0", () => {
        expect(levelBoostMultiplier(4, 5, c)).toBe(1.0)
        expect(levelBoostMultiplier(99, 5, c)).toBe(1.0)
    })
})
