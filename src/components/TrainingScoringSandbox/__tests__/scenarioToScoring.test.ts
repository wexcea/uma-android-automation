import { scenarioToScoring } from "../scenarioToScoring"
import { initialScenario } from "../scenarioState"
import { DEFAULT_TRAINING_SCORING_CONSTANTS, StatName, DateYear } from "../../../lib/training/scoring"

describe("scenarioToScoring", () => {
    test("default scenario maps every training and uses SENIOR year", () => {
        const { config, trainings } = scenarioToScoring(initialScenario)
        expect(trainings.length).toBe(5)
        expect(config.currentDate.year).toBe(DateYear.SENIOR)
        expect(config.statTargets[StatName.SPEED]).toBe(1200)
    })

    test("each tier count produces the right number of BarFillResult entries with the matching color", () => {
        const scenario = {
            ...initialScenario,
            trainings: {
                ...initialScenario.trainings,
                [StatName.WIT]: { ...initialScenario.trainings[StatName.WIT], friendBars: { blue: 1, green: 2, orange: 1 } },
            },
        }
        const { trainings } = scenarioToScoring(scenario)
        const wit = trainings.find((t) => t.name === StatName.WIT)!
        expect(wit.relationshipBars.length).toBe(4)
        expect(wit.relationshipBars.filter((b) => b.dominantColor === "blue").length).toBe(1)
        expect(wit.relationshipBars.filter((b) => b.dominantColor === "green").length).toBe(2)
        expect(wit.relationshipBars.filter((b) => b.dominantColor === "orange").length).toBe(1)
    })

    test("rainbow flag sets numRainbow to 1", () => {
        const scenario = {
            ...initialScenario,
            trainings: { ...initialScenario.trainings, [StatName.WIT]: { ...initialScenario.trainings[StatName.WIT], rainbow: true } },
        }
        const { trainings } = scenarioToScoring(scenario)
        const wit = trainings.find((t) => t.name === StatName.WIT)!
        expect(wit.numRainbow).toBe(1)
    })

    test("isSummer is false by default and year mapping is preserved", () => {
        const { config } = scenarioToScoring({ ...initialScenario, year: DateYear.SENIOR })
        expect(config.currentDate.year).toBe(DateYear.SENIOR)
        expect(config.currentDate.isSummer).toBe(false)
    })

    test("custom constants are used in the returned config.scoring", () => {
        const constants = { ...DEFAULT_TRAINING_SCORING_CONSTANTS, priorityCoefficient: 1.7 }
        const { config } = scenarioToScoring(initialScenario, constants)
        expect(config.scoring.priorityCoefficient).toBe(1.7)
    })
})
