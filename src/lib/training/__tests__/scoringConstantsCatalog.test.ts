import { SCORING_CONSTANTS_CATALOG } from "../scoringConstantsCatalog"
import { DEFAULT_TRAINING_SCORING_CONSTANTS, StatName } from "../scoring"

describe("SCORING_CONSTANTS_CATALOG", () => {
    test("no duplicate keys", () => {
        const seen = new Set<string>()
        for (const entry of SCORING_CONSTANTS_CATALOG) {
            expect(seen.has(entry.key)).toBe(false)
            seen.add(entry.key)
        }
    })

    test("priority coefficient default matches", () => {
        const entry = SCORING_CONSTANTS_CATALOG.find((e) => e.key === "priorityCoefficient")!
        expect(entry.defaultValue).toBe(DEFAULT_TRAINING_SCORING_CONSTANTS.priorityCoefficient)
    })

    test("Wit main-stat threshold defaults to 15", () => {
        const entry = SCORING_CONSTANTS_CATALOG.find((e) => e.key === "mainStatThresholdWit")!
        expect(entry.defaultValue).toBe(15)
        expect(entry.defaultValue).toBe(DEFAULT_TRAINING_SCORING_CONSTANTS.mainStatThresholds[StatName.WIT])
    })

    test("six groups present", () => {
        const groups = new Set(SCORING_CONSTANTS_CATALOG.map((e) => e.group))
        for (const g of ["priority", "ratio", "weight", "bonuses", "level", "misc"]) {
            expect(groups.has(g as any)).toBe(true)
        }
    })

    test("every default value falls within [min, max]", () => {
        for (const entry of SCORING_CONSTANTS_CATALOG) {
            expect(entry.defaultValue).toBeGreaterThanOrEqual(entry.min)
            expect(entry.defaultValue).toBeLessThanOrEqual(entry.max)
        }
    })

    test("ratio multiplier entries belong to the ratio-multipliers monotonic group; breakpoints are not catalog entries", () => {
        const multipliers = SCORING_CONSTANTS_CATALOG.filter((e) => e.monotonicGroup === "ratio-multipliers")
        const breakpoints = SCORING_CONSTANTS_CATALOG.filter((e) => e.monotonicGroup === "ratio-breakpoints")
        expect(multipliers.length).toBe(7)
        expect(breakpoints.length).toBe(0)
    })

    test("every Misc-tab entry has a subgroup assigned", () => {
        const miscEntries = SCORING_CONSTANTS_CATALOG.filter((e) => e.group === "misc")
        expect(miscEntries.length).toBeGreaterThan(0)
        const missing = miscEntries.filter((e) => e.subgroup === undefined).map((e) => e.key)
        expect(missing).toEqual([])
    })

    test("every Misc-tab subgroup value is one of the 5 known sub-section identifiers", () => {
        const allowed = new Set(["rel", "misc", "rainbow", "anticipatory", "unityCup"])
        for (const entry of SCORING_CONSTANTS_CATALOG.filter((e) => e.group === "misc")) {
            expect(allowed.has(entry.subgroup as string)).toBe(true)
        }
    })
})
