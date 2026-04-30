import { useMemo, useContext, useState, useEffect, useRef } from "react"
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native"
import { Divider } from "react-native-paper"
import { previewSchedule, SchedulePreview, ScheduleEntry, SolverConfigSnapshot } from "../../lib/solver/preview"
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover"
import { useTheme } from "../../context/ThemeContext"
import { BotStateContext, defaultSettings } from "../../context/BotStateContext"
import { SearchPageProvider } from "../../context/SearchPageContext"
import CustomCheckbox from "../../components/CustomCheckbox"
import CustomButton from "../../components/CustomButton"
import CustomAccordion from "../../components/CustomAccordion"
import { Input } from "../../components/ui/input"
import racesData from "../../data/races.json"
import epithetsData from "../../data/epithets.json"
import characterPresetsData from "../../data/characterPresets.json"
import PageHeader from "../../components/PageHeader"
import { usePerformanceLogging } from "../../hooks/usePerformanceLogging"
import SearchableItem from "../../components/SearchableItem"

interface RaceEntry {
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

interface EpithetEntry {
    name: string
    category: string
    reward_text: string
    condition_text: string
}

interface CharacterPresetEntry {
    name: string
    distanceAptitudes: { Sprint: string; Mile: string; Medium: string; Long: string }
    surfaceAptitudes: { Turf: string; Dirt: string }
}

interface AptitudeMap {
    Sprint: string
    Mile: string
    Medium: string
    Long: string
    Turf: string
    Dirt: string
}

interface WeightsMap {
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

// Stringify the bundled JSON once at module load so we don't pay the serialisation cost on
// every debounced preview call.
const RACES_DATA_JSON = JSON.stringify(racesData)
const EPITHETS_DATA_JSON = JSON.stringify(epithetsData)

// Module-scoped cache of the last computed preview so navigating away and back to this page shows
// the previous calendar instantly while a fresh re-solve runs in the background. Cleared on app
// reload, not by navigation. Pair: snapshotKey (JSON.stringify of solver-relevant settings) and
// the preview result it produced.
let lastPreviewCache: { key: string; preview: SchedulePreview } | null = null

// Kotlin caches parsed races/epithets across calls; once we've shipped the bundled JSON once we
// can omit it from subsequent bridge payloads, dropping ~150KB of marshalling per call.
let bridgeDataPrimed = false

const APTITUDE_RANKS = ["S", "A", "B", "C", "D", "E", "F", "G"]
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const YEAR_LABELS: Array<{ name: string; startTurn: number }> = [
    { name: "Junior", startTurn: 1 },
    { name: "Classic", startTurn: 25 },
    { name: "Senior", startTurn: 49 },
]

/**
 * In-game date label for a turn (1-72). Year is `startTurn`; turn is the 24-turn
 * (Jan Early → Dec Late) offset within the year. e.g. turn 14 → "Late Jul" within Junior year.
 */
const turnDateLabel = (turnInYear: number): string => {
    const month = MONTH_LABELS[Math.floor(turnInYear / 2)]
    const half = turnInYear % 2 === 0 ? "Early" : "Late"
    return `${half} ${month}`
}

// Reference Trackblazer scoring breakdown (matches `solver-browser.js` BASE_REWARD).
const BASE_STAT_BY_GRADE: Record<string, number> = { G1: 10, G2: 8, G3: 8, OP: 5, PRE_OP: 5 }
const BASE_SP_BY_GRADE: Record<string, number> = { G1: 35, G2: 25, G3: 25, OP: 15, PRE_OP: 10 }
const GRADE_COLORS: Record<string, string> = {
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
const DEFAULT_APTITUDES: AptitudeMap = { Sprint: "A", Mile: "A", Medium: "A", Long: "A", Turf: "A", Dirt: "A" }
const DEFAULT_WEIGHTS: WeightsMap = {
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
const TRAIN_LOCK_SENTINEL = "__TRAIN__"

/** Aptitude rank ordering G…S. Lower index = weaker. Used for the eligibility check on the
 *  TS side so we don't have to round-trip to Kotlin to know which alternative races are valid. */
const APT_ORDER: Record<string, number> = { G: 0, F: 1, E: 2, D: 3, C: 4, B: 5, A: 6, S: 7 }

const OP_GRADES = new Set(["OP", "PRE_OP", "Pre-OP", "PreOP"])

/** Mirror of `EpithetFilters.COUNTRY_NAMES` in `Epithet.kt`. Used by the `nameContainsCountry`
 *  branch of the `winCount` filter (Globe-Trotter epithet). Keep these two lists in sync.
 *  Trailing space on `"Japan "` is intentional — prevents false matches on "Japanese …" races. */
const COUNTRY_NAMES = ["Saudi Arabia", "Argentina", "American", "New Zealand", "Japan "]
const nameContainsCountry = (name: string) => COUNTRY_NAMES.some((c) => name.includes(c))

/**
 * Smart Race Solver settings page. Lets the user configure aptitudes, target/forced epithets,
 * scoring weights, and a calendar preview with manual locks for the beam-search race scheduler.
 * @returns The rendered Smart Race Solver settings page.
 */
const SmartRaceSolverSettings = () => {
    usePerformanceLogging("SmartRaceSolverSettings")
    const { colors } = useTheme()
    const bsc = useContext(BotStateContext)
    const scrollViewRef = useRef<ScrollView>(null)
    const { settings, setSettings } = bsc

    // Merge with defaults so partially-saved profiles keep working when fields are added.
    const racingSettings = { ...defaultSettings.racing, ...settings.racing }
    const {
        enableSmartRaceSolver,
        smartRaceSolverCharacterPreset,
        smartRaceSolverAptitudes,
        smartRaceSolverTargetEpithets,
        smartRaceSolverForcedEpithets,
        smartRaceSolverManualLocks,
        smartRaceSolverWeights,
    } = racingSettings

    // -------- Parsed state --------

    const aptitudes: AptitudeMap = useMemo(() => {
        try {
            return { ...DEFAULT_APTITUDES, ...JSON.parse(smartRaceSolverAptitudes || "{}") }
        } catch {
            return DEFAULT_APTITUDES
        }
    }, [smartRaceSolverAptitudes])

    const targetEpithets: string[] = useMemo(() => {
        try {
            return JSON.parse(smartRaceSolverTargetEpithets || "[]")
        } catch {
            return []
        }
    }, [smartRaceSolverTargetEpithets])

    const forcedEpithets: string[] = useMemo(() => {
        try {
            return JSON.parse(smartRaceSolverForcedEpithets || "[]")
        } catch {
            return []
        }
    }, [smartRaceSolverForcedEpithets])

    const manualLocks: Record<string, string> = useMemo(() => {
        try {
            return JSON.parse(smartRaceSolverManualLocks || "{}")
        } catch {
            return {}
        }
    }, [smartRaceSolverManualLocks])

    const weights: WeightsMap = useMemo(() => {
        try {
            return { ...DEFAULT_WEIGHTS, ...JSON.parse(smartRaceSolverWeights || "{}") }
        } catch {
            return DEFAULT_WEIGHTS
        }
    }, [smartRaceSolverWeights])

    const allEpithets = useMemo<EpithetEntry[]>(() => Object.values(epithetsData) as EpithetEntry[], [])
    const allPresets = useMemo<CharacterPresetEntry[]>(() => Object.values(characterPresetsData) as CharacterPresetEntry[], [])
    const allRaces = useMemo<RaceEntry[]>(() => Object.values(racesData) as RaceEntry[], [])

    // -------- Local input state for decimals --------

    const [raceValueInput, setRaceValueInput] = useState(weights.raceValue.toString())
    const [epithetValueInput, setEpithetValueInput] = useState(weights.epithetValue.toString())
    const [hintWeightInput, setHintWeightInput] = useState(weights.hintWeight.toString())
    const [consecPenaltyInput, setConsecPenaltyInput] = useState(weights.consecutiveRacePenalty.toString())
    const [summerPenaltyInput, setSummerPenaltyInput] = useState(weights.summerPenalty.toString())
    const [raceBonusPctInput, setRaceBonusPctInput] = useState(weights.raceBonusPct.toString())
    const [raceCostPctInput, setRaceCostPctInput] = useState(weights.raceCostPct.toString())

    useEffect(() => setRaceValueInput(weights.raceValue.toString()), [weights.raceValue])
    useEffect(() => setEpithetValueInput(weights.epithetValue.toString()), [weights.epithetValue])
    useEffect(() => setHintWeightInput(weights.hintWeight.toString()), [weights.hintWeight])
    useEffect(() => setConsecPenaltyInput(weights.consecutiveRacePenalty.toString()), [weights.consecutiveRacePenalty])
    useEffect(() => setSummerPenaltyInput(weights.summerPenalty.toString()), [weights.summerPenalty])
    useEffect(() => setRaceBonusPctInput(weights.raceBonusPct.toString()), [weights.raceBonusPct])
    useEffect(() => setRaceCostPctInput(weights.raceCostPct.toString()), [weights.raceCostPct])

    const [presetSearch, setPresetSearch] = useState("")
    const [epithetSearch, setEpithetSearch] = useState("")
    const [forcedEpithetSearch, setForcedEpithetSearch] = useState("")
    /** When the user taps an epithet in the Selected / Projected lists, the calendar highlights
     *  cells whose race contributes to that epithet. null = no highlight. */
    const [highlightedEpithet, setHighlightedEpithet] = useState<string | null>(null)

    // Schedule preview — computed by the Kotlin solver via the React Native bridge.
    const [preview, setPreview] = useState<SchedulePreview | null>(lastPreviewCache?.preview ?? null)
    const [previewLoading, setPreviewLoading] = useState(false)
    const [previewError, setPreviewError] = useState<string | null>(null)

    // -------- Derived filters --------

    const filteredPresets = useMemo(() => {
        if (!presetSearch) return allPresets
        const q = presetSearch.toLowerCase()
        return allPresets.filter((p) => p.name.toLowerCase().includes(q))
    }, [allPresets, presetSearch])

    const filteredEpithets = useMemo(() => {
        if (!epithetSearch) return allEpithets
        const q = epithetSearch.toLowerCase()
        return allEpithets.filter((e) => e.name.toLowerCase().includes(q) || e.reward_text.toLowerCase().includes(q))
    }, [allEpithets, epithetSearch])

    const filteredForcedEpithets = useMemo(() => {
        if (!forcedEpithetSearch) return allEpithets
        const q = forcedEpithetSearch.toLowerCase()
        return allEpithets.filter((e) => e.name.toLowerCase().includes(q) || e.reward_text.toLowerCase().includes(q))
    }, [allEpithets, forcedEpithetSearch])

    // -------- Setters --------

    /**
     * Update a single racing setting, preserving the rest of the racing block.
     *
     * @param key The settings.racing key to update.
     * @param value The new value.
     */
    const updateRacingSetting = (key: string, value: any) => {
        setSettings((prev) => ({
            ...prev,
            racing: { ...prev.racing, [key]: value },
        }))
    }

    const setAptitude = (slot: keyof AptitudeMap, rank: string) => {
        updateRacingSetting("smartRaceSolverAptitudes", JSON.stringify({ ...aptitudes, [slot]: rank }))
    }

    const applyPreset = (preset: CharacterPresetEntry) => {
        const startedAt = Date.now()
        console.log(`[SmartRaceSolver] applyPreset:start name=${preset.name}`)
        updateRacingSetting("smartRaceSolverCharacterPreset", preset.name)
        updateRacingSetting(
            "smartRaceSolverAptitudes",
            JSON.stringify({
                Sprint: preset.distanceAptitudes.Sprint,
                Mile: preset.distanceAptitudes.Mile,
                Medium: preset.distanceAptitudes.Medium,
                Long: preset.distanceAptitudes.Long,
                Turf: preset.surfaceAptitudes.Turf,
                Dirt: preset.surfaceAptitudes.Dirt,
            })
        )
        console.log(`[SmartRaceSolver] applyPreset:end ${Date.now() - startedAt}ms`)
    }

    const toggleTargetEpithet = (name: string) => {
        const next = targetEpithets.includes(name) ? targetEpithets.filter((n) => n !== name) : [...targetEpithets, name]
        updateRacingSetting("smartRaceSolverTargetEpithets", JSON.stringify(next))
    }

    const toggleForcedEpithet = (name: string) => {
        const next = forcedEpithets.includes(name) ? forcedEpithets.filter((n) => n !== name) : [...forcedEpithets, name]
        updateRacingSetting("smartRaceSolverForcedEpithets", JSON.stringify(next))
    }

    const addManualLock = (turn: number, raceName: string) => {
        const next = { ...manualLocks, [String(turn)]: raceName }
        updateRacingSetting("smartRaceSolverManualLocks", JSON.stringify(next))
    }

    const removeManualLock = (turn: string) => {
        const next = { ...manualLocks }
        delete next[turn]
        updateRacingSetting("smartRaceSolverManualLocks", JSON.stringify(next))
    }

    /** Toggles whether the given turn is locked. If currently unlocked, locks to whatever is
     *  currently scheduled there (race name, or [TRAIN_LOCK_SENTINEL] for Train turns). */
    const toggleLockForTurn = (turn: number, currentlyLocked: boolean, raceNameToLock: string | null) => {
        if (currentlyLocked) {
            removeManualLock(String(turn))
            return
        }
        const value = raceNameToLock ?? TRAIN_LOCK_SENTINEL
        addManualLock(turn, value)
    }

    /** "Delete pick" on a race cell — replaces the race lock with a Train lock so the solver
     *  can't put a race there next time. Equivalent to "lock to Train". */
    const lockTurnToTrain = (turn: number) => {
        addManualLock(turn, TRAIN_LOCK_SENTINEL)
    }

    /** Switches the locked race for a given turn. Used by the in-popover alternatives list. */
    const switchTurnRace = (turn: number, newRaceName: string) => {
        addManualLock(turn, newRaceName)
    }

    const updateWeight = (key: keyof WeightsMap, value: number | string | boolean) => {
        updateRacingSetting("smartRaceSolverWeights", JSON.stringify({ ...weights, [key]: value }))
    }

    // -------- Preview --------

    const buildSnapshot = (): SolverConfigSnapshot => ({
        scenario: settings.general?.scenario || "Trackblazer",
        characterPreset: smartRaceSolverCharacterPreset,
        aptitudes: aptitudes,
        targetEpithets,
        forcedEpithets,
        manualLocks,
        weights,
        // Only ship the bundled JSON the first time; Kotlin caches it after that.
        racesDataJson: bridgeDataPrimed ? undefined : RACES_DATA_JSON,
        epithetsDataJson: bridgeDataPrimed ? undefined : EPITHETS_DATA_JSON,
    })

    /**
     * `dirty` becomes true when any solver-relevant setting changes. The Recalculate button is
     * the only path that triggers a fresh `previewSchedule` call; auto-recalculate was removed
     * because picking epithets etc. caused noticeable bridge lag on every keystroke.
     */
    const [dirty, setDirty] = useState(false)

    /** Snapshot key of the settings that produced [preview]. Used to detect whether the
     *  current preview is stale relative to the live settings. */
    const [previewSnapshotKey, setPreviewSnapshotKey] = useState<string | null>(lastPreviewCache?.key ?? null)

    const currentSnapshotKey = useMemo(
        () =>
            JSON.stringify({
                scenario: settings.general?.scenario || "Trackblazer",
                characterPreset: smartRaceSolverCharacterPreset,
                aptitudes,
                targetEpithets,
                forcedEpithets,
                manualLocks,
                weights,
            }),
        [settings.general?.scenario, smartRaceSolverCharacterPreset, aptitudes, targetEpithets, forcedEpithets, manualLocks, weights]
    )

    // Mark the preview stale whenever the settings diverge from what produced the current
    // preview. Tapping Recalculate clears this flag.
    useEffect(() => {
        if (previewSnapshotKey != null && currentSnapshotKey !== previewSnapshotKey) {
            setDirty(true)
        }
    }, [currentSnapshotKey, previewSnapshotKey])

    /** Force a fresh solve. Surfaced as the Recalculate button in the Schedule Preview section. */
    const runPreview = async () => {
        if (!enableSmartRaceSolver) return
        const snapshot = buildSnapshot()
        const key = currentSnapshotKey
        // Cache hit — instant, no bridge call.
        if (lastPreviewCache && lastPreviewCache.key === key) {
            setPreview(lastPreviewCache.preview)
            setPreviewError(lastPreviewCache.preview.error ?? null)
            setPreviewSnapshotKey(key)
            setDirty(false)
            return
        }
        setPreviewLoading(true)
        const startedAt = Date.now()
        console.log("[SmartRaceSolver] previewSchedule:start")
        try {
            const result = await previewSchedule(snapshot)
            if (result.error) {
                bridgeDataPrimed = false
            } else {
                bridgeDataPrimed = true
            }
            setPreview(result)
            setPreviewError(result.error ?? null)
            setPreviewSnapshotKey(key)
            setDirty(false)
            lastPreviewCache = { key, preview: result }
        } catch (e: any) {
            setPreview(null)
            setPreviewError(String(e?.message ?? e))
        } finally {
            setPreviewLoading(false)
            console.log(`[SmartRaceSolver] previewSchedule:end ${Date.now() - startedAt}ms`)
        }
    }

    // Auto-run on first mount (or when the user toggles the feature on) so the calendar isn't
    // blank when the page opens. Subsequent settings changes mark dirty without auto-recalc.
    useEffect(() => {
        if (!enableSmartRaceSolver) {
            setPreview(null)
            setPreviewError(null)
            setDirty(false)
            return
        }
        if (preview == null) runPreview()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enableSmartRaceSolver])

    // -------- Styles --------

    const styles = useMemo(
        () =>
            StyleSheet.create({
                root: { flex: 1, flexDirection: "column", margin: 10, backgroundColor: colors.background },
                section: { marginVertical: 8, padding: 12, backgroundColor: colors.card, borderRadius: 8 },
                sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 6 },
                description: { fontSize: 13, color: colors.mutedForeground, marginBottom: 8 },
                inputLabel: { fontSize: 14, color: colors.foreground, marginBottom: 4, marginTop: 6 },
                input: { backgroundColor: colors.background, color: colors.foreground, marginBottom: 4 },
                inputDescription: { fontSize: 12, color: colors.mutedForeground, marginBottom: 4 },
                row: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginVertical: 4 },
                chip: {
                    width: "31.5%",
                    minHeight: 92,
                    paddingHorizontal: 8,
                    paddingVertical: 6,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                },
                chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
                chipText: { color: colors.foreground, fontSize: 12, fontWeight: "600" },
                chipTextActive: { color: colors.background, fontSize: 12, fontWeight: "700" },
                chipReward: { color: colors.mutedForeground, fontSize: 10, marginTop: 2 },
                chipRewardActive: { color: colors.background, fontSize: 10, marginTop: 2, opacity: 0.9 },
                chipCondition: { color: colors.mutedForeground, fontSize: 10, fontStyle: "italic", marginTop: 2 },
                chipConditionActive: { color: colors.background, fontSize: 10, fontStyle: "italic", marginTop: 2, opacity: 0.8 },
                aptRow: { flexDirection: "row", alignItems: "center", marginVertical: 4 },
                aptLabel: { width: 70, color: colors.foreground, fontSize: 13 },
                aptButtons: { flexDirection: "row", gap: 4, flex: 1 },
                aptBtn: {
                    flex: 1,
                    paddingVertical: 6,
                    borderRadius: 4,
                    borderWidth: 1,
                    borderColor: colors.border,
                    alignItems: "center",
                    backgroundColor: colors.background,
                },
                aptBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
                aptBtnText: { color: colors.foreground, fontSize: 12 },
                aptBtnTextActive: { color: colors.background, fontSize: 12, fontWeight: "700" },
                lockRow: {
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 6,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderColor: colors.border,
                },
                lockTurn: { width: 60, color: colors.foreground, fontSize: 13 },
                lockRace: { flex: 1, color: colors.foreground, fontSize: 13 },
                presetList: {
                    maxHeight: 280,
                    marginBottom: 8,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: colors.border,
                    borderRadius: 6,
                },
                presetItem: {
                    paddingVertical: 8,
                    paddingHorizontal: 6,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderColor: colors.border,
                },
                presetItemActive: { backgroundColor: colors.primary },
                presetName: { color: colors.foreground, fontSize: 14 },
                presetNameActive: { color: colors.background, fontSize: 14, fontWeight: "700" },
                presetAptitudes: { color: colors.mutedForeground, fontSize: 11, marginTop: 2 },
                summary: {
                    color: colors.mutedForeground,
                    fontSize: 12,
                    fontFamily: "monospace",
                    paddingVertical: 4,
                },
                yearCard: {
                    marginVertical: 8,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 8,
                    backgroundColor: colors.background,
                },
                yearCardTitle: { fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 6 },
                calendarRow: { flexDirection: "row", alignItems: "stretch", paddingVertical: 4 },
                calendarCellWrapper: { flex: 1, marginHorizontal: 3, alignItems: "stretch" },
                calendarCell: {
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: 6,
                    paddingHorizontal: 4,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.card,
                    minHeight: 56,
                },
                calendarCellRace: {
                    backgroundColor: colors.card,
                },
                calendarBadge: {
                    minWidth: 30,
                    height: 18,
                    borderRadius: 3,
                    paddingHorizontal: 4,
                    marginBottom: 4,
                    alignItems: "center",
                    justifyContent: "center",
                },
                calendarBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
                calendarRaceName: { fontSize: 10, color: colors.foreground, fontWeight: "600", textAlign: "center" },
                calendarCellEmpty: { fontSize: 11, color: colors.mutedForeground, textAlign: "center" },
                calendarCellPreDebut: {
                    backgroundColor: colors.muted,
                    borderColor: colors.border,
                    borderStyle: "dashed",
                    opacity: 0.6,
                },
                calendarCellPreDebutText: {
                    fontSize: 10,
                    color: colors.mutedForeground,
                    fontStyle: "italic",
                    fontWeight: "600",
                    textAlign: "center",
                },
                calendarDateLabel: { fontSize: 10, color: colors.mutedForeground, textAlign: "center", marginTop: 3 },
                calendarCellLocked: {
                    borderWidth: 2,
                    borderColor: colors.primary,
                },
                popoverAltList: { maxHeight: 220, marginTop: 4 },
                popoverButtonRow: { flexDirection: "row", gap: 8, marginTop: 8 },
                popoverAltRow: {
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 6,
                    paddingHorizontal: 4,
                    borderRadius: 4,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderColor: colors.border,
                },
                popoverAltBadge: {
                    minWidth: 30,
                    height: 18,
                    borderRadius: 3,
                    paddingHorizontal: 4,
                    marginRight: 8,
                    alignItems: "center",
                    justifyContent: "center",
                },
                popoverAltName: { fontSize: 12, fontWeight: "600", color: colors.foreground },
                popoverAltMeta: { fontSize: 10, color: colors.mutedForeground },
                popoverHint: { fontSize: 10, color: colors.mutedForeground, fontStyle: "italic", marginTop: 8, textAlign: "center" },
                staleBanner: {
                    backgroundColor: colors.muted,
                    borderRadius: 6,
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    marginVertical: 8,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    borderLeftWidth: 3,
                    borderLeftColor: colors.primary,
                },
                staleBannerText: { color: colors.foreground, fontSize: 12, flexShrink: 1, marginRight: 8 },
                epithetCard: {
                    paddingVertical: 6,
                    paddingHorizontal: 8,
                    marginVertical: 3,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.card,
                },
                epithetCardHighlighted: {
                    borderColor: colors.primary,
                    borderWidth: 2,
                    backgroundColor: colors.muted,
                },
                calendarCellHighlighted: {
                    borderColor: "#ca8a04",
                    borderWidth: 3,
                    shadowColor: "#facc15",
                    shadowOpacity: 0.9,
                    shadowRadius: 6,
                    shadowOffset: { width: 0, height: 0 },
                    elevation: 4,
                },
                epithetCardName: { fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 2 },
                epithetCardReward: { fontSize: 11, color: colors.foreground, marginBottom: 1 },
                epithetCardCondition: { fontSize: 11, color: colors.mutedForeground, fontStyle: "italic" },
                statsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "nowrap", marginVertical: 6, paddingHorizontal: 2 },
                statsCell: { flexDirection: "row", alignItems: "baseline", flexShrink: 1, paddingHorizontal: 2 },
                statsLabel: { fontSize: 13, color: colors.mutedForeground, marginRight: 4 },
                statsValue: { fontSize: 16, color: colors.foreground, fontWeight: "700" },
                popoverTitle: { fontSize: 15, fontWeight: "700", color: colors.foreground },
                popoverMeta: { fontSize: 12, color: colors.mutedForeground, marginTop: 4 },
                popoverSection: { fontSize: 13, fontWeight: "700", color: colors.foreground, marginTop: 8 },
                popoverEpithet: { fontSize: 12, color: colors.foreground, marginTop: 2 },
                popoverEmpty: { fontSize: 12, color: colors.mutedForeground, marginTop: 2, fontStyle: "italic" },
                previewStatus: { fontSize: 12, color: colors.mutedForeground, paddingVertical: 4 },
                previewError: { fontSize: 12, color: "#dc2626", paddingVertical: 4 },
            }),
        [colors]
    )

    // -------- Helpers --------

    const renderAptitudeRow = (slot: keyof AptitudeMap, label: string) => (
        <View style={styles.aptRow} key={slot}>
            <Text style={styles.aptLabel}>{label}</Text>
            <View style={styles.aptButtons}>
                {APTITUDE_RANKS.map((rank) => {
                    const active = aptitudes[slot] === rank
                    return (
                        <TouchableOpacity key={rank} style={[styles.aptBtn, active && styles.aptBtnActive]} onPress={() => setAptitude(slot, rank)}>
                            <Text style={active ? styles.aptBtnTextActive : styles.aptBtnText}>{rank}</Text>
                        </TouchableOpacity>
                    )
                })}
            </View>
        </View>
    )

    const renderEpithetChip = (epithet: EpithetEntry, selected: boolean, onPress: () => void) => (
        <TouchableOpacity key={epithet.name} style={[styles.chip, selected && styles.chipActive]} onPress={onPress}>
            <Text style={selected ? styles.chipTextActive : styles.chipText}>{epithet.name}</Text>
            {epithet.reward_text ? (
                <Text style={selected ? styles.chipRewardActive : styles.chipReward} numberOfLines={2}>
                    {epithet.reward_text}
                </Text>
            ) : null}
            {epithet.condition_text ? (
                <Text style={selected ? styles.chipConditionActive : styles.chipCondition} numberOfLines={3}>
                    {epithet.condition_text}
                </Text>
            ) : null}
        </TouchableOpacity>
    )

    const shortenRaceName = (name: string): string => {
        // Strip the trailing parenthetical "(Junior Class December, Second Half)" if present so we
        // only show the race name itself; the date already comes from the cell's row.
        const stripped = name.replace(/\s*\(.*\)\s*$/, "").trim()
        // A few common races whose canonical name is too long for the cell.
        const ABBR: Record<string, string> = {
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
        return ABBR[stripped] ?? stripped
    }

    /**
     * Popover content shown on every clickable calendar cell. Top section describes the
     * currently-scheduled decision (race meta + matched epithets, or "No race / Rest").
     * Action section: Lock checkbox, Delete-pick (race) / Lock-to-Train (no race).
     * Alternatives section: scrollable list of every eligible race for this turn that the
     * user can switch to with one tap.
     */
    const renderPopoverBody = (turn: number, entry: ScheduleEntry | undefined) => {
        const turnYearOffset = (turn - 1) % 24
        const yearName = turn <= 24 ? "Junior" : turn <= 48 ? "Classic" : "Senior"
        const fullDateLabel = `${yearName} ${turnDateLabel(turnYearOffset)}`
        const isRace = entry?.type === "Race"
        const race = isRace && entry?.raceKey ? racesByKey[entry.raceKey] : undefined
        const matched = race ? epithetsForRace(race) : []
        const lockedValue: string | undefined = manualLocks[String(turn)]
        const isLocked = lockedValue != null
        const alternatives = (eligibleRacesForTurn.get(turn) ?? []).filter((r) => !race || r.name !== race.name)

        return (
            <View>
                <Text style={styles.popoverTitle}>
                    {isLocked ? "🔒 " : ""}T{turn} · {fullDateLabel}
                </Text>
                {isRace && race ? (
                    <>
                        <Text style={styles.popoverMeta}>{entry.name ?? race.name}</Text>
                        <Text style={styles.popoverMeta}>
                            {(entry.grade ?? race.grade ?? "").replace("PRE_OP", "Pre-OP")} · {race.raceTrack} · {race.terrain} · {race.distanceType} ({race.distanceMeters}m) ·{" "}
                            {race.fans.toLocaleString()} fans
                        </Text>
                        <Text style={styles.popoverSection}>Progresses these epithets</Text>
                        {matched.length === 0 ? (
                            <Text style={styles.popoverEmpty}>None — this race does not match any tracked epithet matcher.</Text>
                        ) : (
                            matched.map((ep) => {
                                const prog = epithetProgress(turn, ep as EpithetEntry & { matchers?: Array<Record<string, unknown>> })
                                const progLabel = prog ? `(${prog.current}/${prog.required}) ` : ""
                                return (
                                    <Text key={ep.name} style={styles.popoverEpithet}>
                                        • {progLabel}
                                        {ep.name} — {ep.reward_text}
                                    </Text>
                                )
                            })
                        )}
                    </>
                ) : (
                    <Text style={styles.popoverMeta}>{entry?.type === "Rest" ? "Rest" : "No race scheduled — solver chose Train."}</Text>
                )}

                <Divider style={{ marginTop: 16 }} />

                <Text style={styles.popoverSection}>Switch to an eligible race</Text>
                {alternatives.length === 0 ? (
                    <Text style={styles.popoverEmpty}>No other eligible races on this turn.</Text>
                ) : (
                    <ScrollView style={styles.popoverAltList} nestedScrollEnabled>
                        {alternatives.map((alt) => {
                            const altColor = GRADE_COLORS[alt.grade] ?? colors.primary
                            return (
                                <TouchableOpacity key={`${alt.name}-${alt.date}`} style={styles.popoverAltRow} onPress={() => switchTurnRace(turn, alt.name)}>
                                    <View style={[styles.popoverAltBadge, { backgroundColor: altColor }]}>
                                        <Text style={styles.calendarBadgeText}>{alt.grade.replace("PRE_OP", "Pre").replace("PRE-OP", "Pre")}</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.popoverAltName}>{alt.name}</Text>
                                        <Text style={styles.popoverAltMeta}>
                                            {alt.raceTrack} · {alt.terrain} · {alt.distanceType} ({alt.distanceMeters}m) · {alt.fans.toLocaleString()} fans
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            )
                        })}
                    </ScrollView>
                )}

                <View style={styles.popoverButtonRow}>
                    {isRace && (
                        <CustomButton variant="destructive" size="sm" onPress={() => lockTurnToTrain(turn)}>
                            Delete
                        </CustomButton>
                    )}
                    <CustomButton variant={isLocked ? "secondary" : "default"} size="sm" onPress={() => toggleLockForTurn(turn, isLocked, isRace ? (race?.name ?? entry?.name ?? null) : null)}>
                        {isLocked ? "Unlock" : "Lock"}
                    </CustomButton>
                </View>
                <Text style={styles.popoverHint}>Changes take effect after tapping Recalculate.</Text>
            </View>
        )
    }

    /**
     * 4×6-grid cell: race-day cells render the grade chip + race name and remain tappable for
     * the popover; train/rest cells are static (no popover, no TouchableOpacity wrapper). The
     * date label ("Early Jul" etc.) renders below the cell, mirroring the in-game calendar.
     *
     * Junior Year turns 1..13 (Early Jan through Early Jul) are the in-game pre-debut period
     * with no available races, so they render with a "Pre-Debut" locked style.
     */
    /**
     * 4×6-grid cell. All non-Pre-Debut cells (race or Train/Rest) are tappable so the user can
     * lock, delete, or switch the pick from inside the popover. Locked cells render with a
     * thicker border to visually indicate they're frozen against the solver.
     *
     * Junior turns 1..13 (Early Jan → Early Jul) are the in-game pre-debut period with no
     * available races; they render with a "Pre-Debut" locked style and are not tappable.
     */
    const renderCalendarCell = (turn: number, turnInYear: number) => {
        const entry = preview?.decisions[String(turn)]
        const isRace = entry?.type === "Race"
        const color = isRace ? (GRADE_COLORS[entry.grade ?? ""] ?? colors.primary) : null
        const shortRaceName = isRace ? shortenRaceName(entry.name ?? entry.raceKey ?? "") : ""
        const dateLabel = turnDateLabel(turnInYear)
        const isPreDebut = turn <= 13
        const isSummerBlocked = !weights.allowSummerRacing && ((turn >= 37 && turn <= 40) || (turn >= 61 && turn <= 64))
        const isLocked = manualLocks[String(turn)] != null
        const cellRace = isRace && entry?.raceKey ? racesByKey[entry.raceKey] : undefined
        const highlightHit = !!(cellRace && highlightedEpithet && epithetsForRace(cellRace).some((e) => e.name === highlightedEpithet))

        if (isPreDebut || isSummerBlocked) {
            return (
                <View key={turn} style={styles.calendarCellWrapper}>
                    <View style={[styles.calendarCell, styles.calendarCellPreDebut]}>
                        <Text style={styles.calendarCellPreDebutText}>{isPreDebut ? "Pre-Debut" : "Summer"}</Text>
                    </View>
                    <Text style={styles.calendarDateLabel}>{dateLabel}</Text>
                </View>
            )
        }

        const cellInner = isRace ? (
            <>
                <View style={[styles.calendarBadge, { backgroundColor: color! }]}>
                    <Text style={styles.calendarBadgeText}>{(entry.grade ?? "").replace("PRE_OP", "Pre").replace("FINALE", "Fin").replace("MAIDEN", "Mdn").replace("DEBUT", "Dbt")}</Text>
                </View>
                <Text style={styles.calendarRaceName} numberOfLines={2} ellipsizeMode="tail">
                    {shortRaceName}
                </Text>
            </>
        ) : (
            <Text style={styles.calendarCellEmpty}>{entry?.type === "Rest" ? "Rest" : "—"}</Text>
        )

        return (
            <View key={turn} style={styles.calendarCellWrapper}>
                <Popover>
                    <PopoverTrigger asChild>
                        <TouchableOpacity style={[styles.calendarCell, isRace && styles.calendarCellRace, isLocked && styles.calendarCellLocked, highlightHit && styles.calendarCellHighlighted]}>
                            {cellInner}
                        </TouchableOpacity>
                    </PopoverTrigger>
                    <PopoverContent side="top" align="center" className="w-80 p-3">
                        {renderPopoverBody(turn, entry)}
                    </PopoverContent>
                </Popover>
                <Text style={styles.calendarDateLabel}>
                    {isLocked ? "🔒 " : ""}
                    {dateLabel}
                </Text>
            </View>
        )
    }

    const racesByKey = racesData as unknown as Record<string, RaceEntry>

    /**
     * TS mirror of `ScoringFunctions.isEligible`. A race is eligible iff:
     *   - distance and surface aptitudes both meet the threshold
     *   - the race is not OP/Pre-OP, OR the user opted into OP races
     * Used by the in-popover "switch to alternative" list so we can build it without a bridge round-trip.
     */
    const isRaceEligible = (race: RaceEntry): boolean => {
        if (OP_GRADES.has(race.grade) && !weights.includeOpAndPreOp) return false
        const threshold = APT_ORDER[weights.aptitudeThreshold] ?? 4
        const distKey = race.distanceType === "Sprint" ? "Sprint" : race.distanceType === "Mile" ? "Mile" : race.distanceType === "Medium" ? "Medium" : race.distanceType === "Long" ? "Long" : null
        const surfKey = race.terrain === "Turf" ? "Turf" : race.terrain === "Dirt" ? "Dirt" : null
        if (!distKey || !surfKey) return false
        const distApt = APT_ORDER[(aptitudes as any)[distKey]] ?? 0
        const surfApt = APT_ORDER[(aptitudes as any)[surfKey]] ?? 0
        return distApt >= threshold && surfApt >= threshold
    }

    /** Returns all races available on a given turn that pass the eligibility filter. */
    const eligibleRacesForTurn = useMemo(() => {
        const byTurn = new Map<number, RaceEntry[]>()
        for (const race of allRaces) {
            if (!isRaceEligible(race)) continue
            const list = byTurn.get(race.turnNumber) ?? []
            list.push(race)
            byTurn.set(race.turnNumber, list)
        }
        // Sort each turn's options by descending grade so the strongest race is first.
        const gradeRank: Record<string, number> = { G1: 0, G2: 1, G3: 2, OP: 3, PRE_OP: 4, "Pre-OP": 4 }
        for (const list of byTurn.values()) {
            list.sort((a, b) => (gradeRank[a.grade] ?? 99) - (gradeRank[b.grade] ?? 99) || b.fans - a.fans)
        }
        return byTurn
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allRaces, aptitudes, weights.aptitudeThreshold, weights.includeOpAndPreOp])

    /**
     * Aggregate stats for the reference Trackblazer-style summary panel: race count, epithet
     * count, total race stats (BASE_STAT × (1 + raceBonusPct/100)), race SP, epithet stats, and
     * hint count. Returns null while no preview is available.
     */
    const previewStats = useMemo(() => {
        if (!preview) return null
        const epithetsAll = epithetsData as unknown as Record<string, EpithetEntry & { reward_kind?: string; amount?: number }>
        const rb = Math.max(0, weights.raceBonusPct) / 100
        let races = 0
        let raceStats = 0
        let raceSp = 0
        for (const [, entry] of Object.entries(preview.decisions)) {
            if (entry.type !== "Race") continue
            races += 1
            const race = entry.raceKey ? racesByKey[entry.raceKey] : undefined
            const grade = (race?.grade ?? entry.grade ?? "").replace("-", "_")
            raceStats += Math.floor((BASE_STAT_BY_GRADE[grade] ?? 0) * (1 + rb))
            raceSp += Math.floor((BASE_SP_BY_GRADE[grade] ?? 0) * (1 + rb))
        }
        let epithetStats = 0
        let hints = 0
        for (const name of preview.projectedEpithets) {
            const ep = epithetsAll[name]
            if (!ep) continue
            if (ep.reward_kind === "stat") epithetStats += ep.amount ?? 0
            else if (ep.reward_kind === "hint") hints += 1
        }
        return { races, epithets: preview.projectedEpithets.length, raceStats, raceSp, epithetStats, hints }
    }, [preview, weights.raceBonusPct, racesByKey])

    /**
     * Computes how much progress an epithet's matcher has accumulated up to and including
     * `upToTurn`, based on the current preview's race decisions. Returns null when the matcher
     * type isn't progress-trackable. `current` is capped at `required` so the COMPLETE label
     * only ever shows once. Used by the popover's per-epithet progress readout.
     */
    const matcherProgress = (upToTurn: number, matcher: Record<string, unknown>): { current: number; required: number } | null => {
        if (!preview) return null
        const decisions = preview.decisions
        const isGraded = (g: string) => g === "G1" || g === "G2" || g === "G3"
        const isOpenOrAbove = (g: string) => isGraded(g) || g === "OP" || g === "FINALE" || g === "EX"
        const winsUpTo: Array<{ turn: number; race: RaceEntry }> = []
        for (const [turnStr, dec] of Object.entries(decisions)) {
            const t = parseInt(turnStr, 10)
            if (Number.isNaN(t) || t > upToTurn) continue
            if (dec.type !== "Race") continue
            const r = dec.raceKey ? racesByKey[dec.raceKey] : undefined
            if (!r) continue
            winsUpTo.push({ turn: t, race: r })
        }

        const type = matcher["type"] as string
        switch (type) {
            case "winRace": {
                const name = matcher["name"] as string
                const hit = winsUpTo.some((w) => w.race.name === name)
                return { current: hit ? 1 : 0, required: 1 }
            }
            case "winRaceTimes": {
                const name = matcher["name"] as string
                const required = (matcher["times"] as number) ?? 1
                const current = winsUpTo.filter((w) => w.race.name === name).length
                return { current: Math.min(current, required), required }
            }
            case "winAnyOf": {
                const names = (matcher["names"] as string[]) ?? []
                const required = (matcher["count"] as number) ?? names.length
                const current = winsUpTo.filter((w) => names.includes(w.race.name)).length
                return { current: Math.min(current, required), required }
            }
            case "winAtLeast": {
                const names = (matcher["names"] as string[]) ?? []
                const required = (matcher["count"] as number) ?? names.length
                const distinct = new Set(winsUpTo.filter((w) => names.includes(w.race.name)).map((w) => w.race.name))
                return { current: Math.min(distinct.size, required), required }
            }
            case "winCount": {
                const f = (matcher["filter"] as Record<string, unknown>) ?? {}
                const required = (matcher["count"] as number) ?? 1
                let current = 0
                for (const w of winsUpTo) {
                    if (f["terrain"] && f["terrain"] !== w.race.terrain) continue
                    if (f["grade"] && f["grade"] !== w.race.grade) continue
                    if (f["gradedOnly"] && !isGraded(w.race.grade)) continue
                    if (f["gradeAtLeastOpen"] && !isOpenOrAbove(w.race.grade)) continue
                    const dts = f["distanceTypes"] as string[] | undefined
                    if (dts && dts.length > 0 && !dts.includes(w.race.distanceType)) continue
                    const tracks = f["raceTracks"] as string[] | undefined
                    if (tracks && tracks.length > 0 && !tracks.includes(w.race.raceTrack)) continue
                    const nameContains = f["nameContains"] as string | undefined
                    if (nameContains && !w.race.name.toLowerCase().includes(nameContains.toLowerCase())) continue
                    if (f["nameContainsCountry"] && !nameContainsCountry(w.race.name)) continue
                    current++
                }
                return { current: Math.min(current, required), required }
            }
            default:
                // epithetAll / epithetAnyOf intentionally fall through — they don't progress per-race wins.
                return null
        }
    }

    /**
     * Aggregate progress across ALL of an epithet's matchers as of `upToTurn`. The popover label
     * needs this rather than a single-matcher progress because epithets like Turf Tussler use
     * one `winCount` matcher per distance category — winning a single Turf Sprint race satisfies
     * the Sprint matcher (1/1) but not the epithet (which needs all four distances). Summing
     * `(current, required)` across matchers gives an honest "(satisfied conditions)" readout:
     * Globe-Trotter renders as `(1/3) → (3/3)`, Turf Tussler as `(1/4) → (4/4)`. Returns null
     * when no matchers are progress-trackable (e.g. a Legendary-style epithet whose matchers are
     * all `epithetAll` / `epithetAnyOf` dependencies).
     */
    const epithetProgress = (upToTurn: number, ep: EpithetEntry & { matchers?: Array<Record<string, unknown>> }): { current: number; required: number } | null => {
        let totalCurrent = 0
        let totalRequired = 0
        for (const m of ep.matchers ?? []) {
            const p = matcherProgress(upToTurn, m)
            if (!p) continue
            totalCurrent += p.current
            totalRequired += p.required
        }
        if (totalRequired === 0) return null
        return { current: totalCurrent, required: totalRequired }
    }

    const epithetsForRace = (race: RaceEntry): EpithetEntry[] => {
        const all = epithetsData as unknown as Record<string, EpithetEntry & { matchers?: Array<Record<string, unknown>> }>
        const out: EpithetEntry[] = []
        const isGraded = race.grade === "G1" || race.grade === "G2" || race.grade === "G3"
        const isOpenOrAbove = isGraded || race.grade === "OP" || race.grade === "FINALE" || race.grade === "EX"
        for (const ep of Object.values(all)) {
            const matchers = ep.matchers ?? []
            const matched = matchers.some((m) => {
                const type = m["type"] as string
                const name = m["name"] as string | undefined
                const names = (m["names"] as string[] | undefined) ?? []
                switch (type) {
                    case "winRace":
                    case "winRaceTimes":
                        return name != null && name === race.name
                    case "winAnyOf":
                    case "winAtLeast":
                        return names.includes(race.name)
                    case "winCount": {
                        const f = (m["filter"] as Record<string, unknown> | undefined) ?? {}
                        if (f["terrain"] && f["terrain"] !== race.terrain) return false
                        if (f["grade"] && f["grade"] !== race.grade) return false
                        if (f["gradedOnly"] && !isGraded) return false
                        if (f["gradeAtLeastOpen"] && !isOpenOrAbove) return false
                        const dts = f["distanceTypes"] as string[] | undefined
                        if (dts && dts.length > 0 && !dts.includes(race.distanceType)) return false
                        const tracks = f["raceTracks"] as string[] | undefined
                        if (tracks && tracks.length > 0 && !tracks.includes(race.raceTrack)) return false
                        const nameContains = f["nameContains"] as string | undefined
                        if (nameContains && !race.name.toLowerCase().includes(nameContains.toLowerCase())) return false
                        if (f["nameContainsCountry"] && !nameContainsCountry(race.name)) return false
                        return true
                    }
                    // epithetAll / epithetAnyOf intentionally fall through — they don't progress per-race wins.
                    default:
                        return false
                }
            })
            if (matched) out.push(ep)
        }
        return out
    }

    /**
     * 4-column × 6-row layout, row-major: row 0 = Jan Early, Jan Late, Feb Early, Feb Late;
     * row 5 = Nov Early, Nov Late, Dec Early, Dec Late. Mirrors the in-game calendar layout.
     */
    const renderYearCard = (year: { name: string; startTurn: number }) => {
        const rows: number[][] = []
        for (let r = 0; r < 6; r++) rows.push([0, 1, 2, 3].map((c) => r * 4 + c))
        return (
            <View key={year.name} style={styles.yearCard}>
                <Text style={styles.yearCardTitle}>{year.name} Year</Text>
                {rows.map((row, ridx) => (
                    <View key={`row-${ridx}`} style={styles.calendarRow}>
                        {row.map((turnInYear) => renderCalendarCell(year.startTurn + turnInYear, turnInYear))}
                    </View>
                ))}
            </View>
        )
    }

    // -------- Render --------

    const sectionsDisabledStyle = enableSmartRaceSolver ? undefined : ({ opacity: 0.4 } as const)

    return (
        <View style={styles.root}>
            <PageHeader title="Smart Race Solver" />

            <SearchPageProvider page="SmartRaceSolverSettings" scrollViewRef={scrollViewRef}>
                <ScrollView ref={scrollViewRef} nestedScrollEnabled={true} showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
                    <View className="m-1">
                        {/* Master toggle */}
                        <SearchableItem
                            id="enable-smart-race-solver"
                            title="Enable Smart Race Solver"
                            description="Beam-search-based race scheduler that targets epithet completions and re-plans dynamically across the 72-turn career."
                            style={styles.section}
                        >
                            <CustomCheckbox
                                label="Enable Smart Race Solver"
                                description="Plans the entire 72-turn career with an exact optimization solver, picking races and training turns to maximize score. Activates during a run when the scenario year is Classic or Senior, Farming Fans is on, and Force Racing is off."
                                checked={enableSmartRaceSolver}
                                onCheckedChange={(checked) => updateRacingSetting("enableSmartRaceSolver", checked)}
                            />
                        </SearchableItem>

                        {/* Character preset */}
                        <SearchableItem
                            id="smart-solver-character-preset"
                            condition={enableSmartRaceSolver}
                            parentId="enable-smart-race-solver"
                            title="Character Preset"
                            description="Pick a character to seed aptitude defaults. You can still override individual aptitudes below."
                            style={styles.section}
                        >
                            <View style={sectionsDisabledStyle}>
                                <Text style={styles.sectionTitle}>Character Preset</Text>
                                <Text style={styles.description}>Selected: {smartRaceSolverCharacterPreset || "(none)"}</Text>
                                <Input style={styles.input} value={presetSearch} onChangeText={setPresetSearch} placeholder="Search characters..." />
                                <ScrollView style={styles.presetList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                                    {filteredPresets.map((p) => {
                                        const active = smartRaceSolverCharacterPreset === p.name
                                        return (
                                            <TouchableOpacity key={p.name} style={[styles.presetItem, active && styles.presetItemActive]} onPress={() => applyPreset(p)}>
                                                <Text style={active ? styles.presetNameActive : styles.presetName}>{p.name}</Text>
                                                <Text style={styles.presetAptitudes}>
                                                    Sprint {p.distanceAptitudes.Sprint} · Mile {p.distanceAptitudes.Mile} · Med {p.distanceAptitudes.Medium} · Long {p.distanceAptitudes.Long} · Turf{" "}
                                                    {p.surfaceAptitudes.Turf} · Dirt {p.surfaceAptitudes.Dirt}
                                                </Text>
                                            </TouchableOpacity>
                                        )
                                    })}
                                    {presetSearch && filteredPresets.length === 0 && <Text style={styles.inputDescription}>No matches.</Text>}
                                </ScrollView>
                                <Text style={styles.inputDescription}>
                                    Showing {filteredPresets.length} preset{filteredPresets.length === 1 ? "" : "s"}.
                                </Text>
                            </View>
                        </SearchableItem>

                        {/* Aptitudes */}
                        <SearchableItem
                            id="smart-solver-aptitudes"
                            condition={enableSmartRaceSolver}
                            parentId="enable-smart-race-solver"
                            title="Aptitudes"
                            description="Distance and surface aptitude grades. Races below the threshold are excluded from the candidate pool."
                            style={styles.section}
                        >
                            <View style={sectionsDisabledStyle}>
                                <Text style={styles.sectionTitle}>Aptitudes</Text>
                                <Text style={styles.description}>S = best, G = worst. Tap to set.</Text>
                                {renderAptitudeRow("Sprint", "Sprint")}
                                {renderAptitudeRow("Mile", "Mile")}
                                {renderAptitudeRow("Medium", "Medium")}
                                {renderAptitudeRow("Long", "Long")}
                                <Divider style={{ marginVertical: 6 }} />
                                {renderAptitudeRow("Turf", "Turf")}
                                {renderAptitudeRow("Dirt", "Dirt")}
                            </View>
                        </SearchableItem>

                        {/* Aptitude threshold */}
                        <SearchableItem
                            id="smart-solver-aptitude-threshold"
                            condition={enableSmartRaceSolver}
                            parentId="enable-smart-race-solver"
                            title="Aptitude Threshold"
                            description="Minimum aptitude (distance AND surface) required for a race to be eligible."
                            style={styles.section}
                        >
                            <View style={sectionsDisabledStyle}>
                                <Text style={styles.sectionTitle}>Aptitude Threshold</Text>
                                <Text style={styles.description}>
                                    Minimum aptitude rank a race needs in BOTH its distance type and surface for the solver to consider it. Races below this rank are dropped entirely, even if they
                                    would complete an epithet. C is a sensible default for most characters; raise to B/A to be stricter, lower to E/F if you have a weak character with limited
                                    aptitudes.
                                </Text>
                                <View style={styles.aptButtons}>
                                    {APTITUDE_RANKS.map((rank) => {
                                        const active = weights.aptitudeThreshold === rank
                                        return (
                                            <TouchableOpacity key={rank} style={[styles.aptBtn, active && styles.aptBtnActive]} onPress={() => updateWeight("aptitudeThreshold", rank)}>
                                                <Text style={active ? styles.aptBtnTextActive : styles.aptBtnText}>{rank}</Text>
                                            </TouchableOpacity>
                                        )
                                    })}
                                </View>

                                <Divider style={{ marginVertical: 16 }} />

                                <CustomCheckbox
                                    label="Include OP / Pre-OP races"
                                    description="By default the solver picks only G1/G2/G3 races. Enable this to also consider OP and Pre-OP races. Useful for weaker characters (e.g. Haru Urara) who can't qualify for many graded races; OP races contribute much less to stats but at least give the solver something to schedule."
                                    checked={weights.includeOpAndPreOp}
                                    onCheckedChange={(checked) => updateWeight("includeOpAndPreOp", checked)}
                                    style={{ marginTop: 8 }}
                                />
                                <CustomCheckbox
                                    label="Allow racing during Summer (Classic / Senior)"
                                    description="By default the Summer training camp turns (Early Jul → Late Aug) in Classic and Senior years are blocked from racing. Enable this to let the solver schedule races in those 4 turns each year — useful when a key epithet race lands in summer."
                                    checked={weights.allowSummerRacing}
                                    onCheckedChange={(checked) => updateWeight("allowSummerRacing", checked)}
                                    style={{ marginTop: 8 }}
                                />
                            </View>
                        </SearchableItem>

                        {/* Target epithets */}
                        <SearchableItem
                            id="smart-solver-target-epithets"
                            condition={enableSmartRaceSolver}
                            parentId="enable-smart-race-solver"
                            title="Target Epithets"
                            description="Epithets the solver actively pursues. Selecting one biases the schedule toward completing it."
                            style={styles.section}
                        >
                            <View style={sectionsDisabledStyle}>
                                <Text style={styles.sectionTitle}>Target Epithets ({targetEpithets.length} selected)</Text>
                                <Text style={styles.description}>
                                    Epithets the solver will pursue if doing so improves the schedule. The solver may pick smaller races (G2/G3/OP) just to complete a targeted epithet, even when those
                                    races wouldn't otherwise be worth racing. The schedule is still allowed to skip a target if it would hurt overall score — for guaranteed completion use Forced
                                    Epithets instead.
                                </Text>
                                <Input style={styles.input} value={epithetSearch} onChangeText={setEpithetSearch} placeholder="Search 36 epithets…" />
                                <View style={styles.row}>{filteredEpithets.map((ep) => renderEpithetChip(ep, targetEpithets.includes(ep.name), () => toggleTargetEpithet(ep.name)))}</View>
                            </View>
                        </SearchableItem>

                        {/* Forced epithets */}
                        <SearchableItem
                            id="smart-solver-forced-epithets"
                            condition={enableSmartRaceSolver}
                            parentId="enable-smart-race-solver"
                            title="Forced Epithets"
                            description="Epithets the solver MUST complete. Beams that lose feasibility for any forced epithet are pruned."
                            style={styles.section}
                        >
                            <View style={sectionsDisabledStyle}>
                                <Text style={styles.sectionTitle}>Forced Epithets ({forcedEpithets.length} selected)</Text>
                                <Text style={styles.description}>
                                    Epithets the solver MUST complete. If a forced epithet becomes impossible (e.g. a required race is already lost), the solver fails and falls back. Use sparingly —
                                    every forced epithet shrinks the search space and may push the solver to skip otherwise-valuable races just to satisfy the constraint.
                                </Text>
                                <Input style={styles.input} value={forcedEpithetSearch} onChangeText={setForcedEpithetSearch} placeholder="Search 36 epithets…" />
                                <View style={styles.row}>{filteredForcedEpithets.map((ep) => renderEpithetChip(ep, forcedEpithets.includes(ep.name), () => toggleForcedEpithet(ep.name)))}</View>
                            </View>
                        </SearchableItem>

                        {/* Weights */}
                        <SearchableItem
                            id="smart-solver-weights"
                            condition={enableSmartRaceSolver}
                            parentId="enable-smart-race-solver"
                            title="Scoring Weights"
                            description="Tune how the solver balances race value, epithet completion, and penalties."
                            style={styles.section}
                        >
                            <View style={sectionsDisabledStyle}>
                                <Text style={styles.sectionTitle}>Scoring Weights</Text>
                                <Text style={styles.description}>
                                    Power-user knobs for the scoring formula. Defaults match the reference Trackblazer site and are calibrated for typical career runs — only tweak if you understand
                                    what you're changing.
                                </Text>
                                <CustomAccordion
                                    sections={[
                                        {
                                            value: "weights",
                                            title: "Show advanced weights",
                                            children: (
                                                <View>
                                                    <Text style={styles.inputLabel}>Race Value Weight</Text>
                                                    <Input
                                                        style={styles.input}
                                                        value={raceValueInput}
                                                        onChangeText={(t) => /^-?\d*\.?\d*$/.test(t) && setRaceValueInput(t)}
                                                        onBlur={() => updateWeight("raceValue", parseFloat(raceValueInput) || 0)}
                                                        keyboardType="decimal-pad"
                                                        placeholder="1.0"
                                                    />
                                                    <Text style={styles.inputDescription}>
                                                        Multiplier on every race's stat + SP reward. Default 1.0. Raise to 2.0 to make the schedule more race-heavy; lower to 0.5 to favor training.
                                                    </Text>

                                                    <Text style={styles.inputLabel}>Epithet Value Weight</Text>
                                                    <Input
                                                        style={styles.input}
                                                        value={epithetValueInput}
                                                        onChangeText={(t) => /^-?\d*\.?\d*$/.test(t) && setEpithetValueInput(t)}
                                                        onBlur={() => updateWeight("epithetValue", parseFloat(epithetValueInput) || 0)}
                                                        keyboardType="decimal-pad"
                                                        placeholder="1.0"
                                                    />
                                                    <Text style={styles.inputDescription}>
                                                        Multiplier on epithet stat rewards. Default 1.0 weights an epithet's stats equally with race stats. Raise to 5.0 if you want the solver to chase
                                                        epithets even at the cost of fewer total races.
                                                    </Text>

                                                    <Text style={styles.inputLabel}>Hint Reward Weight</Text>
                                                    <Input
                                                        style={styles.input}
                                                        value={hintWeightInput}
                                                        onChangeText={(t) => /^-?\d*\.?\d*$/.test(t) && setHintWeightInput(t)}
                                                        onBlur={() => updateWeight("hintWeight", parseFloat(hintWeightInput) || 0)}
                                                        keyboardType="decimal-pad"
                                                        placeholder="8.0"
                                                    />
                                                    <Text style={styles.inputDescription}>
                                                        Score given for completing a skill-hint epithet (one that grants a skill instead of stats). Default 8.0 ≈ value of one G1 race. Drop to 0 to
                                                        skip hint-only epithets entirely.
                                                    </Text>

                                                    <Text style={styles.inputLabel}>Consecutive Race Penalty</Text>
                                                    <Input
                                                        style={styles.input}
                                                        value={consecPenaltyInput}
                                                        onChangeText={(t) => /^-?\d*\.?\d*$/.test(t) && setConsecPenaltyInput(t)}
                                                        onBlur={() => updateWeight("consecutiveRacePenalty", parseFloat(consecPenaltyInput) || 0)}
                                                        keyboardType="decimal-pad"
                                                        placeholder="3.0"
                                                    />
                                                    <Text style={styles.inputDescription}>
                                                        Penalty per race when racing 3+ turns in a row. Models in-game motivation/condition loss. Late-Dec turns (23, 47, 71) are exempt because the
                                                        year ends there. Set to 0 to disable.
                                                    </Text>

                                                    <Text style={styles.inputLabel}>Summer Block Penalty</Text>
                                                    <Input
                                                        style={styles.input}
                                                        value={summerPenaltyInput}
                                                        onChangeText={(t) => /^-?\d*\.?\d*$/.test(t) && setSummerPenaltyInput(t)}
                                                        onBlur={() => updateWeight("summerPenalty", parseFloat(summerPenaltyInput) || 0)}
                                                        keyboardType="decimal-pad"
                                                        placeholder="5.0"
                                                    />
                                                    <Text style={styles.inputDescription}>
                                                        Penalty for racing during summer training camps (turns 12-14, 36-39, 60-63). High enough to discourage racing through summer, low enough that an
                                                        epithet-completing race can still be picked.
                                                    </Text>

                                                    <Text style={styles.inputLabel}>Race Bonus %</Text>
                                                    <Input
                                                        style={styles.input}
                                                        value={raceBonusPctInput}
                                                        onChangeText={(t) => /^-?\d*\.?\d*$/.test(t) && setRaceBonusPctInput(t)}
                                                        onBlur={() => updateWeight("raceBonusPct", parseFloat(raceBonusPctInput) || 0)}
                                                        keyboardType="decimal-pad"
                                                        placeholder="50.0"
                                                    />
                                                    <Text style={styles.inputDescription}>
                                                        Percentage uplift applied to base stat/SP reward of every race before scoring. Default 50%. Higher = the solver picks more races overall.
                                                    </Text>

                                                    <Text style={styles.inputLabel}>Race Cost %</Text>
                                                    <Input
                                                        style={styles.input}
                                                        value={raceCostPctInput}
                                                        onChangeText={(t) => /^-?\d*\.?\d*$/.test(t) && setRaceCostPctInput(t)}
                                                        onBlur={() => updateWeight("raceCostPct", parseFloat(raceCostPctInput) || 0)}
                                                        keyboardType="decimal-pad"
                                                        placeholder="100.0"
                                                    />
                                                    <Text style={styles.inputDescription}>
                                                        Cost subtracted from each race's reward, expressed as a percentage of a G2 race's baseline value. At 100 (default), G2 and G3 races score zero
                                                        net and only get raced when they progress an epithet. Lower this to schedule more races.
                                                    </Text>
                                                </View>
                                            ),
                                        },
                                    ]}
                                    type="single"
                                    defaultValue={[]}
                                />
                            </View>
                        </SearchableItem>

                        {/* Schedule preview calendar */}
                        <SearchableItem
                            id="smart-solver-calendar-preview"
                            condition={enableSmartRaceSolver}
                            parentId="enable-smart-race-solver"
                            title="Schedule Preview"
                            description="Solver's initial schedule across the 72-turn career, computed from the current configuration. Does not account for in-run wins or losses."
                            style={styles.section}
                        >
                            <View style={sectionsDisabledStyle}>
                                <Text style={styles.sectionTitle}>Schedule Preview</Text>
                                <Text style={styles.description}>
                                    Preview of the schedule the solver would start with. Tap a cell to lock it, delete its pick, or switch to an alternative race. Does not reflect mid-run dynamic
                                    re-planning.
                                </Text>
                                {dirty && (
                                    <View style={styles.staleBanner}>
                                        <Text style={styles.staleBannerText}>Settings changed — tap Recalculate to update the preview.</Text>
                                        <CustomButton size="sm" onPress={runPreview} disabled={previewLoading}>
                                            Recalculate
                                        </CustomButton>
                                    </View>
                                )}
                                {!dirty && (
                                    <View style={{ flexDirection: "row", justifyContent: "flex-end", marginVertical: 4 }}>
                                        <CustomButton size="sm" variant="secondary" onPress={runPreview} disabled={previewLoading}>
                                            Recalculate
                                        </CustomButton>
                                    </View>
                                )}
                                {previewLoading && (
                                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                                        <ActivityIndicator size="small" color={colors.primary} />
                                        <Text style={[styles.previewStatus, { marginLeft: 6 }]}>Computing preview…</Text>
                                    </View>
                                )}
                                {previewError && <Text style={styles.previewError}>Preview error: {previewError}</Text>}
                                {!previewLoading && !previewError && preview && previewStats && (
                                    <View style={styles.statsRow}>
                                        <View style={styles.statsCell}>
                                            <Text style={styles.statsLabel}>Races</Text>
                                            <Text style={styles.statsValue}>{previewStats.races}</Text>
                                        </View>
                                        <View style={styles.statsCell}>
                                            <Text style={styles.statsLabel}>Epithets</Text>
                                            <Text style={styles.statsValue}>{previewStats.epithets}</Text>
                                        </View>
                                        <View style={styles.statsCell}>
                                            <Text style={styles.statsLabel}>Race Stats</Text>
                                            <Text style={styles.statsValue}>{previewStats.raceStats}</Text>
                                        </View>
                                        <View style={styles.statsCell}>
                                            <Text style={styles.statsLabel}>Race SP</Text>
                                            <Text style={styles.statsValue}>{previewStats.raceSp}</Text>
                                        </View>
                                        <View style={styles.statsCell}>
                                            <Text style={styles.statsLabel}>Epithet Stats</Text>
                                            <Text style={styles.statsValue}>{previewStats.epithetStats}</Text>
                                        </View>
                                        <View style={styles.statsCell}>
                                            <Text style={styles.statsLabel}>Hints</Text>
                                            <Text style={styles.statsValue}>{previewStats.hints}</Text>
                                        </View>
                                        <View style={styles.statsCell}>
                                            <Text style={styles.statsLabel}>Score</Text>
                                            <Text style={styles.statsValue}>{Math.round(preview.totalScore)}</Text>
                                        </View>
                                    </View>
                                )}
                                {YEAR_LABELS.map(renderYearCard)}
                            </View>
                        </SearchableItem>

                        {/* Epithet rewards */}
                        <SearchableItem
                            id="smart-solver-epithet-rewards"
                            condition={enableSmartRaceSolver}
                            parentId="enable-smart-race-solver"
                            title="Epithet Rewards"
                            description="Rewards for each selected and projected epithet."
                            style={styles.section}
                        >
                            <View style={sectionsDisabledStyle}>
                                <Text style={styles.sectionTitle}>Selected Epithets</Text>
                                {(() => {
                                    const selectedNames = Array.from(new Set([...targetEpithets, ...forcedEpithets]))
                                    if (selectedNames.length === 0) {
                                        return <Text style={styles.inputDescription}>No epithets selected — pick targets above to see their rewards here.</Text>
                                    }
                                    return selectedNames.map((name) => {
                                        const ep = (epithetsData as Record<string, EpithetEntry>)[name]
                                        const isForced = forcedEpithets.includes(name)
                                        const reward = ep?.reward_text ?? "(reward unknown)"
                                        const condition = ep?.condition_text ?? "(condition unknown)"
                                        const isHighlighted = highlightedEpithet === name
                                        return (
                                            <TouchableOpacity
                                                key={`sel-${name}`}
                                                style={[styles.epithetCard, isHighlighted && styles.epithetCardHighlighted]}
                                                onPress={() => setHighlightedEpithet(isHighlighted ? null : name)}
                                            >
                                                <Text style={styles.epithetCardName}>
                                                    {name}
                                                    {isForced ? "  ★" : ""}
                                                </Text>
                                                <Text style={styles.epithetCardReward}>Reward: {reward}</Text>
                                                <Text style={styles.epithetCardCondition}>Condition: {condition}</Text>
                                            </TouchableOpacity>
                                        )
                                    })
                                })()}

                                <Divider style={{ marginVertical: 8 }} />

                                <Text style={styles.sectionTitle}>Projected Completions</Text>
                                {previewLoading && <Text style={styles.previewStatus}>Computing preview…</Text>}
                                {!previewLoading && (preview?.projectedEpithets?.length ?? 0) === 0 && (
                                    <Text style={styles.inputDescription}>The preview schedule does not project completing any epithets with the current configuration.</Text>
                                )}
                                {(preview?.projectedEpithets ?? []).map((name) => {
                                    const ep = (epithetsData as Record<string, EpithetEntry>)[name]
                                    const reward = ep?.reward_text ?? "(reward unknown)"
                                    const condition = ep?.condition_text ?? "(condition unknown)"
                                    const isSelected = targetEpithets.includes(name) || forcedEpithets.includes(name)
                                    const isHighlighted = highlightedEpithet === name
                                    return (
                                        <TouchableOpacity
                                            key={`proj-${name}`}
                                            style={[styles.epithetCard, isHighlighted && styles.epithetCardHighlighted]}
                                            onPress={() => setHighlightedEpithet(isHighlighted ? null : name)}
                                        >
                                            <Text style={[styles.epithetCardName, { color: isSelected ? colors.primary : colors.foreground }]}>
                                                {name}
                                                {isSelected ? "  ✓" : ""}
                                            </Text>
                                            <Text style={styles.epithetCardReward}>Reward: {reward}</Text>
                                            <Text style={styles.epithetCardCondition}>Condition: {condition}</Text>
                                        </TouchableOpacity>
                                    )
                                })}
                            </View>
                        </SearchableItem>

                        {/* Diagnostic */}
                        <SearchableItem
                            id="smart-solver-diagnostic"
                            condition={enableSmartRaceSolver}
                            parentId="enable-smart-race-solver"
                            title="Configuration Summary"
                            description="Read-only summary of the current solver configuration."
                            style={styles.section}
                        >
                            <View style={sectionsDisabledStyle}>
                                <Text style={styles.sectionTitle}>Configuration Summary</Text>
                                <Text style={styles.summary}>Preset: {smartRaceSolverCharacterPreset || "(none)"}</Text>
                                <Text style={styles.summary}>
                                    Aptitudes: Spr {aptitudes.Sprint} · Mil {aptitudes.Mile} · Med {aptitudes.Medium} · Lng {aptitudes.Long} · Trf {aptitudes.Turf} · Drt {aptitudes.Dirt}
                                </Text>
                                <Text style={styles.summary}>Threshold: {weights.aptitudeThreshold}</Text>
                                <Text style={styles.summary}>
                                    Targets ({targetEpithets.length}): {targetEpithets.join(", ") || "(none)"}
                                </Text>
                                <Text style={styles.summary}>
                                    Forced ({forcedEpithets.length}): {forcedEpithets.join(", ") || "(none)"}
                                </Text>
                                <Text style={styles.summary}>
                                    Locks ({Object.keys(manualLocks).length}):{" "}
                                    {Object.keys(manualLocks).length === 0
                                        ? "(none)"
                                        : Object.entries(manualLocks)
                                              .map(([t, r]) => `T${t}→${r}`)
                                              .join(" · ")}
                                </Text>
                                <Text style={styles.summary}>
                                    Weights: race {weights.raceValue}, epithet {weights.epithetValue}, hint {weights.hintWeight}, consec −{weights.consecutiveRacePenalty}, summer −
                                    {weights.summerPenalty}, raceBonus {weights.raceBonusPct}%, raceCost {weights.raceCostPct}%
                                </Text>
                            </View>
                        </SearchableItem>
                    </View>
                </ScrollView>
            </SearchPageProvider>
        </View>
    )
}

export default SmartRaceSolverSettings
