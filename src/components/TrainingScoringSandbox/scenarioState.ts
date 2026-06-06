import { DateYear, StatName } from "../../lib/training/scoring"

/** Mood levels matching the in-game mood gauge. */
export type Mood = "AWFUL" | "BAD" | "NORMAL" | "GOOD" | "GREAT"

/** Per-training friendship-bar tier counts. */
export interface FriendBars {
    /** Number of supports at this training in the BLUE friendship tier. */
    blue: number
    /** Number of supports at this training in the GREEN friendship tier. */
    green: number
    /** Number of supports at this training in the ORANGE friendship tier. */
    orange: number
}

/** Per-training inputs for the sandbox scenario. */
export interface SandboxTrainingScenario {
    /** Stat gains by stat name for this training. */
    statGains: Record<StatName, number>
    /** How much energy this training restores when picked. */
    energyGain: number
    /** Training facility level 1-5. */
    trainingLevel: number
    /** Whether this training is rainbow-tinted. */
    rainbow: boolean
    /** Friendship bar count per color tier. */
    friendBars: FriendBars
}

/** The full sandbox scenario kept in the reducer. */
export interface SandboxScenario {
    /** Current energy 0-100. */
    energy: number
    /** Current mood. */
    mood: Mood
    /** Career year. */
    year: DateYear
    /** Whether the run is currently in the Summer Training block. Drives the swap from `statPrioritization` to `summerTrainingStatPriority` in the scoring pipeline. */
    summer: boolean
    /** Whether Good-Luck Charm is active. */
    charm: boolean
    /** Trainee cumulative stat totals 0-1200 each. */
    traineeTotals: Record<StatName, number>
    /** Per-training scenario inputs, keyed by training's primary stat. */
    trainings: Record<StatName, SandboxTrainingScenario>
    /** Which training is currently focused in the editor strip. */
    selectedTraining: StatName
}

/** All actions the reducer accepts. */
export type ScenarioAction =
    | { type: "set-energy"; energy: number }
    | { type: "set-mood"; mood: Mood }
    | { type: "set-year"; year: DateYear }
    | { type: "set-summer"; summer: boolean }
    | { type: "set-charm"; charm: boolean }
    | { type: "set-trainee-total"; stat: StatName; value: number }
    | { type: "select-training"; training: StatName }
    | { type: "set-stat-gain"; training: StatName; stat: StatName; value: number }
    | { type: "set-energy-gain"; training: StatName; value: number }
    | { type: "set-training-level"; training: StatName; value: number }
    | { type: "set-rainbow"; training: StatName; rainbow: boolean }
    | { type: "set-friend-bar"; training: StatName; tier: "blue" | "green" | "orange"; count: number }
    | { type: "reset" }
    | { type: "replace"; scenario: SandboxScenario }

function emptyStatGains(): Record<StatName, number> {
    return { [StatName.SPEED]: 0, [StatName.STAMINA]: 0, [StatName.POWER]: 0, [StatName.GUTS]: 0, [StatName.WIT]: 0 }
}

function emptyFriendBars(): FriendBars {
    return { blue: 0, green: 0, orange: 0 }
}

function emptyTraining(): SandboxTrainingScenario {
    return { statGains: emptyStatGains(), energyGain: 0, trainingLevel: 5, rainbow: false, friendBars: emptyFriendBars() }
}

/** Sensible baseline: Senior year, full energy, Great mood, no Charm, level-5 trainings with zero stats and zero gains. */
export const initialScenario: SandboxScenario = {
    energy: 100,
    mood: "GREAT",
    year: DateYear.SENIOR,
    summer: false,
    charm: false,
    traineeTotals: { [StatName.SPEED]: 0, [StatName.STAMINA]: 0, [StatName.POWER]: 0, [StatName.GUTS]: 0, [StatName.WIT]: 0 },
    trainings: { [StatName.SPEED]: emptyTraining(), [StatName.STAMINA]: emptyTraining(), [StatName.POWER]: emptyTraining(), [StatName.GUTS]: emptyTraining(), [StatName.WIT]: emptyTraining() },
    selectedTraining: StatName.SPEED,
}

/**
 * Pure reducer producing the next `SandboxScenario` from an action.
 *
 * @param state Current scenario.
 * @param action Action describing the transition.
 * @returns Next scenario.
 */
export function scenarioReducer(state: SandboxScenario, action: ScenarioAction): SandboxScenario {
    switch (action.type) {
        case "set-energy":
            return { ...state, energy: action.energy }
        case "set-mood":
            return { ...state, mood: action.mood }
        case "set-year":
            return { ...state, year: action.year }
        case "set-summer":
            return { ...state, summer: action.summer }
        case "set-charm":
            return { ...state, charm: action.charm }
        case "set-trainee-total":
            return { ...state, traineeTotals: { ...state.traineeTotals, [action.stat]: action.value } }
        case "select-training":
            return { ...state, selectedTraining: action.training }
        case "set-stat-gain": {
            const t = state.trainings[action.training]
            return { ...state, trainings: { ...state.trainings, [action.training]: { ...t, statGains: { ...t.statGains, [action.stat]: action.value } } } }
        }
        case "set-energy-gain": {
            const t = state.trainings[action.training]
            return { ...state, trainings: { ...state.trainings, [action.training]: { ...t, energyGain: action.value } } }
        }
        case "set-training-level": {
            const t = state.trainings[action.training]
            return { ...state, trainings: { ...state.trainings, [action.training]: { ...t, trainingLevel: action.value } } }
        }
        case "set-rainbow": {
            const t = state.trainings[action.training]
            return { ...state, trainings: { ...state.trainings, [action.training]: { ...t, rainbow: action.rainbow } } }
        }
        case "set-friend-bar": {
            const t = state.trainings[action.training]
            return { ...state, trainings: { ...state.trainings, [action.training]: { ...t, friendBars: { ...t.friendBars, [action.tier]: action.count } } } }
        }
        case "reset":
            return initialScenario
        case "replace":
            return action.scenario
    }
}
