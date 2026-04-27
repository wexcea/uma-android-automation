import { DEFAULT_THRESHOLD, SUMMARY_THRESHOLD, isGrounded, overlap } from "../groundingVerifier"

describe("groundingVerifier", () => {
    describe("overlap", () => {
        it("returns 1 for an empty answer", () => {
            expect(overlap("", ["any context here"])).toBe(1)
        })

        it("returns 1 when every content word appears in context", () => {
            const answer = "Energy management balances training and rest."
            const context = ["Energy management balances training and rest periods."]
            expect(overlap(answer, context)).toBe(1)
        })

        it("returns 0 when no content word matches", () => {
            const answer = "Photosynthesis converts sunlight."
            const context = ["Energy management training rest."]
            expect(overlap(answer, context)).toBe(0)
        })

        it("ignores stopwords on both sides", () => {
            // Only "racing", "strategy" survive stopword filtering on both sides.
            const answer = "The racing strategy is for you."
            const context = ["Racing strategy."]
            expect(overlap(answer, context)).toBe(1)
        })

        it("computes a partial ratio across multiple context chunks", () => {
            const answer = "speed stamina power guts"
            const context = ["speed and stamina training", "guts only"]
            expect(overlap(answer, context)).toBeCloseTo(0.75, 5)
        })

        it("is case-insensitive", () => {
            expect(overlap("RACING Strategy", ["racing strategy"])).toBe(1)
        })
    })

    describe("isGrounded", () => {
        it("uses DEFAULT_THRESHOLD when none is given", () => {
            // overlap = 0.5 → above default 0.4
            const answer = "speed stamina power guts"
            const context = ["speed stamina"]
            expect(overlap(answer, context)).toBe(0.5)
            expect(isGrounded(answer, context)).toBe(true)
        })

        it("respects an explicit lower threshold (SUMMARY_THRESHOLD)", () => {
            // overlap = 0.333... → below DEFAULT (0.4) but above SUMMARY (0.3)
            const answer = "speed stamina power"
            const context = ["speed only"]
            expect(isGrounded(answer, context, DEFAULT_THRESHOLD)).toBe(false)
            expect(isGrounded(answer, context, SUMMARY_THRESHOLD)).toBe(true)
        })

        it("rejects when overlap falls below threshold", () => {
            expect(isGrounded("alpha beta gamma delta", ["unrelated content"], DEFAULT_THRESHOLD)).toBe(false)
        })
    })
})
