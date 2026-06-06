import { initialScenario, scenarioReducer } from "../scenarioState"
import { StatName } from "../../../lib/training/scoring"

describe("scenarioReducer", () => {
    test("initial scenario has 5 training entries keyed by StatName", () => {
        for (const s of [StatName.SPEED, StatName.STAMINA, StatName.POWER, StatName.GUTS, StatName.WIT]) {
            expect(initialScenario.trainings[s]).toBeDefined()
        }
    })

    test("set-energy updates only energy", () => {
        const next = scenarioReducer(initialScenario, { type: "set-energy", energy: 80 })
        expect(next.energy).toBe(80)
        expect(next.mood).toBe(initialScenario.mood)
    })

    test("select-training switches selection", () => {
        const next = scenarioReducer(initialScenario, { type: "select-training", training: StatName.WIT })
        expect(next.selectedTraining).toBe(StatName.WIT)
    })

    test("set-stat-gain only mutates the named training and stat", () => {
        const next = scenarioReducer(initialScenario, { type: "set-stat-gain", training: StatName.SPEED, stat: StatName.SPEED, value: 12 })
        expect(next.trainings[StatName.SPEED].statGains[StatName.SPEED]).toBe(12)
        expect(next.trainings[StatName.STAMINA].statGains[StatName.STAMINA]).toBe(initialScenario.trainings[StatName.STAMINA].statGains[StatName.STAMINA])
    })

    test("set-friend-bar only mutates the named training and tier", () => {
        const next = scenarioReducer(initialScenario, { type: "set-friend-bar", training: StatName.WIT, tier: "blue", count: 2 })
        expect(next.trainings[StatName.WIT].friendBars.blue).toBe(2)
        expect(next.trainings[StatName.WIT].friendBars.green).toBe(initialScenario.trainings[StatName.WIT].friendBars.green)
    })

    test("reset returns initial scenario", () => {
        const altered = scenarioReducer(initialScenario, { type: "set-energy", energy: 1 })
        const reset = scenarioReducer(altered, { type: "reset" })
        expect(reset).toEqual(initialScenario)
    })
})
