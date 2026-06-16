// This test uses a .tsx extension (not .ts) on purpose: syncPriorities imports shallowArrayEqual from
// ../utils, which transitively pulls in expo-clipboard. Only the jest-expo (components) project mocks Expo,
// and that project matches .tsx files. A plain .test.ts would run under the node project and fail to resolve expo-clipboard.
import { computePrioritySync } from "../syncPriorities"

describe("computePrioritySync", () => {
    const source = ["Speed", "Stamina", "Power"]

    it("reports no change when both targets already match the source", () => {
        const result = computePrioritySync(source, ["Speed", "Stamina", "Power"], ["Speed", "Stamina", "Power"])
        expect(result.changed).toBe(false)
        expect(result.eventChoice).toEqual(source)
        expect(result.summer).toEqual(source)
        expect(result.eventChoice).not.toBe(result.summer)
    })

    it("reports a change when the event choice list differs", () => {
        const result = computePrioritySync(source, ["Wit", "Speed"], ["Speed", "Stamina", "Power"])
        expect(result.changed).toBe(true)
    })

    it("reports a change when the summer list differs", () => {
        const result = computePrioritySync(source, ["Speed", "Stamina", "Power"], ["Wit"])
        expect(result.changed).toBe(true)
    })

    it("is order-sensitive", () => {
        const result = computePrioritySync(["Speed", "Power"], ["Power", "Speed"], ["Power", "Speed"])
        expect(result.changed).toBe(true)
    })

    it("returns fresh array copies, not references to the source", () => {
        const result = computePrioritySync(source, [], [])
        expect(result.eventChoice).not.toBe(source)
        expect(result.summer).not.toBe(source)
        expect(result.eventChoice).toEqual(source)
    })

    it("handles an empty source: empty targets are in sync, non-empty targets change", () => {
        expect(computePrioritySync([], [], []).changed).toBe(false)
        const result = computePrioritySync([], ["Speed"], [])
        expect(result.changed).toBe(true)
        expect(result.eventChoice).toEqual([])
        expect(result.summer).toEqual([])
    })
})
