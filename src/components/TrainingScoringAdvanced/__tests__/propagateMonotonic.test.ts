import { propagateMonotonic } from "../monotonicGroup"
import { ScoringConstantEntry } from "../../../lib/training/scoringConstantsCatalog"

// Synthetic ascending breakpoints group: defaults 10, 20, 30, 40.
const ASC: ScoringConstantEntry[] = [
    { key: "b1", label: "b1", description: "", group: "ratio", defaultValue: 10, min: 0, max: 100, step: 1, monotonicGroup: "ratio-breakpoints" },
    { key: "b2", label: "b2", description: "", group: "ratio", defaultValue: 20, min: 0, max: 100, step: 1, monotonicGroup: "ratio-breakpoints" },
    { key: "b3", label: "b3", description: "", group: "ratio", defaultValue: 30, min: 0, max: 100, step: 1, monotonicGroup: "ratio-breakpoints" },
    { key: "b4", label: "b4", description: "", group: "ratio", defaultValue: 40, min: 0, max: 100, step: 1, monotonicGroup: "ratio-breakpoints" },
]

// Synthetic descending values group: defaults 4, 3, 2, 1.
const DESC: ScoringConstantEntry[] = [
    { key: "v1", label: "v1", description: "", group: "ratio", defaultValue: 4, min: 0, max: 10, step: 0.1, monotonicGroup: "ratio-values" },
    { key: "v2", label: "v2", description: "", group: "ratio", defaultValue: 3, min: 0, max: 10, step: 0.1, monotonicGroup: "ratio-values" },
    { key: "v3", label: "v3", description: "", group: "ratio", defaultValue: 2, min: 0, max: 10, step: 0.1, monotonicGroup: "ratio-values" },
    { key: "v4", label: "v4", description: "", group: "ratio", defaultValue: 1, min: 0, max: 10, step: 0.1, monotonicGroup: "ratio-values" },
]

function vals(entries: ScoringConstantEntry[]): Record<string, number> {
    const out: Record<string, number> = {}
    for (const e of entries) out[e.key] = e.defaultValue
    return out
}

describe("propagateMonotonic ascending breakpoints", () => {
    test("no propagation when change keeps order", () => {
        const updates = propagateMonotonic(ASC, "b2", 25, vals(ASC))
        expect(updates).toEqual([["b2", 25]])
    })

    test("pushes later entries up when raising past them", () => {
        // Raise b2 from 20 to 35, which is > b3 (30) so b3 must rise. b4 (40) is still >= 35, so stop.
        const updates = propagateMonotonic(ASC, "b2", 35, vals(ASC))
        expect(updates).toEqual([
            ["b2", 35],
            ["b3", 35],
        ])
    })

    test("pushes earlier entries down when lowering past them", () => {
        // Lower b3 from 30 to 15, which is < b2 (20) and < b1 (10 is fine). b2 must drop to 15, b1 (10) is <= 15 so stop.
        const updates = propagateMonotonic(ASC, "b3", 15, vals(ASC))
        expect(updates).toEqual([
            ["b3", 15],
            ["b2", 15],
        ])
    })

    test("propagation chains across the entire group at the edge", () => {
        // Raise b1 from 10 to 50. b2 (20), b3 (30), b4 (40) all become 50.
        const updates = propagateMonotonic(ASC, "b1", 50, vals(ASC))
        expect(updates).toEqual([
            ["b1", 50],
            ["b2", 50],
            ["b3", 50],
            ["b4", 50],
        ])
    })
})

describe("propagateMonotonic descending values", () => {
    test("no propagation when change keeps order", () => {
        const updates = propagateMonotonic(DESC, "v2", 2.5, vals(DESC))
        expect(updates).toEqual([["v2", 2.5]])
    })

    test("pushes later entries down when lowering past them", () => {
        // Lower v2 from 3 to 1.5, which is < v3 (2) so v3 must drop to 1.5. v4 (1) still <= 1.5, stop.
        const updates = propagateMonotonic(DESC, "v2", 1.5, vals(DESC))
        expect(updates).toEqual([
            ["v2", 1.5],
            ["v3", 1.5],
        ])
    })

    test("pushes earlier entries up when raising past them", () => {
        // Raise v3 from 2 to 3.5, which is > v2 (3) so v2 rises to 3.5. v1 (4) >= 3.5 so stop.
        const updates = propagateMonotonic(DESC, "v3", 3.5, vals(DESC))
        expect(updates).toEqual([
            ["v3", 3.5],
            ["v2", 3.5],
        ])
    })

    test("chain across entire group at the edge", () => {
        // Lower v1 from 4 to 0.5. v2, v3, v4 all become 0.5.
        const updates = propagateMonotonic(DESC, "v1", 0.5, vals(DESC))
        expect(updates).toEqual([
            ["v1", 0.5],
            ["v2", 0.5],
            ["v3", 0.5],
            ["v4", 0.5],
        ])
    })
})

describe("propagateMonotonic non-monotonic entry", () => {
    test("entry without monotonicGroup returns just the originating change", () => {
        const plain: ScoringConstantEntry[] = [{ key: "x", label: "x", description: "", group: "priority", defaultValue: 1, min: 0, max: 2, step: 0.1 }]
        expect(propagateMonotonic(plain, "x", 1.5, {})).toEqual([["x", 1.5]])
    })
})
