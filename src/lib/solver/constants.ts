/**
 * Shared types and constants for the Smart Race Solver helpers in `src/lib/solver`. Mirrors
 * the shape of the bundled `races.json` / `epithets.json` / `characterPresets.json` data files.
 */

// //////////////////////////////////////////////////////////////////////////////////////////////////
// //////////////////////////////////////////////////////////////////////////////////////////////////
// Types
// //////////////////////////////////////////////////////////////////////////////////////////////////
// //////////////////////////////////////////////////////////////////////////////////////////////////

export interface RaceEntry {
    name: string
    date: string
    turnNumber: number
    grade: string
    terrain: string
    distanceType: string
    distanceMeters: number
    fans: number
    raceTrack: string
}

export interface EpithetEntry {
    name: string
    category: string
    reward_text: string
    condition_text: string
}

/** Epithet shape with its matcher list inflated. Used by `epithetsForRace` / `epithetProgress`. */
export type EpithetWithMatchers = EpithetEntry & { matchers?: Array<Record<string, unknown>> }

export interface CharacterPresetEntry {
    name: string
    distanceAptitudes: { Sprint: string; Mile: string; Medium: string; Long: string }
    surfaceAptitudes: { Turf: string; Dirt: string }
}

export interface AptitudeMap {
    Sprint: string
    Mile: string
    Medium: string
    Long: string
    Turf: string
    Dirt: string
}

export interface WeightsMap {
    raceValue: number
    epithetValue: number
    statWeight: number
    spWeight: number
    hintWeight: number
    consecutiveRacePenalty: number
    summerPenalty: number
    raceBonusPct: number
    raceCostPct: number
    aptitudeThreshold: string
    includeOpAndPreOp: boolean
    allowSummerRacing: boolean
}

/** Progress against a single matcher or a whole epithet. `current` is capped at `required`. */
export interface MatcherProgress {
    current: number
    required: number
}

/** Aggregate stats shown in the preview summary panel. */
export interface PreviewStats {
    races: number
    epithets: number
    raceStats: number
    raceSp: number
    epithetStats: number
    hints: number
}

// //////////////////////////////////////////////////////////////////////////////////////////////////
// //////////////////////////////////////////////////////////////////////////////////////////////////
// Constants
// //////////////////////////////////////////////////////////////////////////////////////////////////
// //////////////////////////////////////////////////////////////////////////////////////////////////

export const APTITUDE_RANKS = ["S", "A", "B", "C", "D", "E", "F", "G"]

export const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export const YEAR_LABELS: Array<{ name: string; startTurn: number }> = [
    { name: "Junior", startTurn: 1 },
    { name: "Classic", startTurn: 25 },
    { name: "Senior", startTurn: 49 },
]

/** Reference Trackblazer scoring breakdown (matches `solver-browser.js` BASE_REWARD). */
export const BASE_STAT_BY_GRADE: Record<string, number> = { G1: 10, G2: 8, G3: 8, OP: 5, PRE_OP: 5 }
export const BASE_SP_BY_GRADE: Record<string, number> = { G1: 35, G2: 25, G3: 25, OP: 15, PRE_OP: 10 }

export const GRADE_COLORS: Record<string, string> = {
    G1: "#2563eb",
    G2: "#ec4899",
    G3: "#16a34a",
    OP: "#ca8a04",
    PRE_OP: "#a16207",
    MAIDEN: "#6b7280",
    DEBUT: "#6b7280",
    FINALE: "#7c3aed",
    EX: "#7c3aed",
}

export const DEFAULT_APTITUDES: AptitudeMap = { Sprint: "A", Mile: "A", Medium: "A", Long: "A", Turf: "A", Dirt: "A" }

export const DEFAULT_WEIGHTS: WeightsMap = {
    raceValue: 1.0,
    epithetValue: 1.0,
    statWeight: 1.0,
    spWeight: 1.0,
    hintWeight: 8.0,
    consecutiveRacePenalty: 3.0,
    summerPenalty: 5.0,
    raceBonusPct: 50.0,
    raceCostPct: 100.0,
    aptitudeThreshold: "C",
    includeOpAndPreOp: false,
    allowSummerRacing: false,
}

/** The sentinel a manual-lock entry takes to lock a turn to Train / no race. The Kotlin
 *  parser understands this as `Decision.Train`. Keep in sync with `TRAIN_LOCK_SENTINEL`
 *  in `SmartRaceSolverIntegration.kt`. */
export const TRAIN_LOCK_SENTINEL = "__TRAIN__"

/** Aptitude rank ordering G…S. Lower index = weaker. Used for the eligibility check on the
 *  TS side so we don't have to round-trip to Kotlin to know which alternative races are valid. */
export const APT_ORDER: Record<string, number> = { G: 0, F: 1, E: 2, D: 3, C: 4, B: 5, A: 6, S: 7 }

export const OP_GRADES = new Set(["OP", "PRE_OP", "Pre-OP", "PreOP"])

/** Mirror of `EpithetFilters.COUNTRY_NAMES` in `Epithet.kt`. Used by the `nameContainsCountry`
 *  branch of the `winCount` filter (Globe-Trotter epithet). Keep these two lists in sync.
 *  Trailing space on `"Japan "` is intentional — prevents false matches on "Japanese …" races. */
export const COUNTRY_NAMES = ["Saudi Arabia", "Argentina", "American", "New Zealand", "Japan "]

// //////////////////////////////////////////////////////////////////////////////////////////////////
// //////////////////////////////////////////////////////////////////////////////////////////////////
// Calendar helpers
// //////////////////////////////////////////////////////////////////////////////////////////////////
// //////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * In-game date label for a turn-in-year offset (0..23). Floor-divides by 2 to pick the month
 * and uses parity to choose Early / Late. e.g. offset 13 → "Late Jul".
 */
export const turnDateLabel = (turnInYear: number): string => {
    const month = MONTH_LABELS[Math.floor(turnInYear / 2)]
    const half = turnInYear % 2 === 0 ? "Early" : "Late"
    return `${half} ${month}`
}

const RACE_NAME_ABBREVIATIONS: Record<string, string> = {
    "Hanshin Juvenile Fillies": "Hanshin Juv. F.",
    "Mile Championship": "Mile Champ.",
    "Takarazuka Kinen": "Takarazuka K.",
    "Saudi Arabia Royal Cup": "Saudi Arabia P.",
    "Tokyo Sports Hai Niko Sai Sho": "Tokyo Sports",
    "Niigata Junior Stakes": "Niigata Jr. S.",
    "Kokura Junior Stakes": "Kokura Jr. S.",
    "Sprinters Stakes": "Sprinters S.",
    "Asahi Hai Futurity Stakes": "Asahi Hai F. S.",
}

/**
 * Trims a race name for narrow calendar cells: strips the trailing parenthetical date suffix
 * (e.g. "(Junior Class December, Second Half)") and applies the abbreviation table for known
 * over-long names.
 */
export const shortenRaceName = (name: string): string => {
    const stripped = name.replace(/\s*\(.*\)\s*$/, "").trim()
    return RACE_NAME_ABBREVIATIONS[stripped] ?? stripped
}
