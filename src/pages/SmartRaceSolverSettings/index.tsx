import { memo, useMemo, useContext, useState, useEffect, useRef, useCallback } from "react"
import { InteractionManager, View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native"
import { Divider } from "react-native-paper"
import { previewSchedule, SchedulePreview, ScheduleEntry, SolverConfigSnapshot } from "../../lib/solver/preview"
import {
    APTITUDE_RANKS,
    APT_ORDER,
    AptitudeMap,
    CharacterPresetEntry,
    DEFAULT_APTITUDES,
    DEFAULT_WEIGHTS,
    EpithetEntry,
    EpithetWithMatchers,
    GRADE_COLORS,
    RaceEntry,
    shortenRaceName,
    TRAIN_LOCK_SENTINEL,
    turnDateLabel,
    WeightsMap,
    YEAR_LABELS,
} from "../../lib/solver/constants"
import { computePreviewStats, epithetProgress, epithetsForRace, isRaceEligible } from "../../lib/solver/scoring"
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover"
import { useTheme } from "../../context/ThemeContext"
import { RacingContext, GeneralMiscContext, defaultSettings } from "../../context/BotStateContext"
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

/**
 * Memoized aptitude row. Six of these mount simultaneously (Sprint, Mile, Medium, Long, Turf,
 * Dirt). Tapping any rank only changes the slice key for one slot, so the other five rows pass
 * identical props and skip reconciliation entirely.
 *
 * `onChange` is the parent's `setAptitude` callback — kept stable via `useCallback` with a
 * functional updater, so the shallow comparison succeeds for unchanged rows.
 */
interface AptitudeRowProps {
    /** The aptitude slot this row controls (e.g. "Sprint", "Mile"). */
    slot: keyof AptitudeMap
    /** Display label (typically same as `slot`). */
    label: string
    /** Currently selected rank for this slot. */
    currentRank: string
    /** Called when the user picks a rank. */
    onChange: (slot: keyof AptitudeMap, rank: string) => void
    /** Style sheet from the parent (stable across renders). */
    styles: any
}
const AptitudeRow = memo(({ slot, label, currentRank, onChange, styles }: AptitudeRowProps) => (
    <View style={styles.aptRow}>
        <Text style={styles.aptLabel}>{label}</Text>
        <View style={styles.aptButtons}>
            {APTITUDE_RANKS.map((rank) => {
                const active = currentRank === rank
                return (
                    <TouchableOpacity key={rank} style={[styles.aptBtn, active && styles.aptBtnActive]} onPress={() => onChange(slot, rank)}>
                        <Text style={active ? styles.aptBtnTextActive : styles.aptBtnText}>{rank}</Text>
                    </TouchableOpacity>
                )
            })}
        </View>
    </View>
))
AptitudeRow.displayName = "AptitudeRow"

/**
 * Memoized epithet chip. The Selected and Projected lists each render up to 36 of these. With
 * a stable `onToggle` callback (the parent uses `useCallback` + functional updater) and a
 * stable `epithet` reference (the data files are loaded once at module scope), only the chips
 * whose `selected` flag flipped reconcile on a target/forced toggle.
 */
interface EpithetChipProps {
    /** The epithet entry to render (data file row). */
    epithet: { name: string; reward_text?: string; condition_text?: string; [k: string]: any }
    /** Whether this chip is currently in the parent's selected list. */
    selected: boolean
    /** Stable parent callback that flips the chip's selection state by name. */
    onToggle: (name: string) => void
    /** Style sheet from the parent (stable across renders). */
    styles: any
}
const EpithetChip = memo(({ epithet, selected, onToggle, styles }: EpithetChipProps) => (
    <TouchableOpacity style={[styles.chip, selected && styles.chipActive]} onPress={() => onToggle(epithet.name)}>
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
))
EpithetChip.displayName = "EpithetChip"

/**
 * Smart Race Solver settings page. Lets the user configure aptitudes, target/forced epithets,
 * scoring weights, and a calendar preview with manual locks for the beam-search race scheduler.
 * @returns The rendered Smart Race Solver settings page.
 */
const SmartRaceSolverSettings = () => {
    usePerformanceLogging("SmartRaceSolverSettings")
    const { colors } = useTheme()
    // Subscribe to slices instead of the legacy aggregate `BotStateContext`. With the aggregate
    // context, every unrelated settings change re-rendered this 1500-line page.
    const { racing, updateRacing } = useContext(RacingContext)
    const { general } = useContext(GeneralMiscContext)
    const scrollViewRef = useRef<ScrollView>(null)

    // Merge with defaults so partially-saved profiles keep working when fields are added.
    const racingSettings = { ...defaultSettings.racing, ...racing }
    const {
        enableSmartRaceSolver,
        smartRaceSolverCharacterPreset,
        smartRaceSolverAptitudes,
        smartRaceSolverTargetEpithets,
        smartRaceSolverForcedEpithets,
        smartRaceSolverManualLocks,
        smartRaceSolverWeights,
    } = racingSettings

    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // Parsed state
    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////

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

    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // Local input state for decimals
    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////

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

    // Two-phase mount: the master toggle commits in the first paint, the eight heavy sections
    // (calendar with 72 popover-wrapped cells, two 36-chip epithet pickers, presets ScrollView,
    // weights accordion, summary) commit one tick later. Same pattern as `Settings/index.tsx`,
    // which dropped that page's `first_commit` by 27 % in the perf harness.
    const [showHeavySections, setShowHeavySections] = useState(false)
    useEffect(() => {
        const handle = InteractionManager.runAfterInteractions(() => {
            setShowHeavySections(true)
        })
        return () => handle.cancel()
    }, [])

    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // Derived filters
    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////

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

    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // Setters
    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////

    /**
     * Update a single racing setting, preserving the rest of the racing block.
     *
     * @param key The settings.racing key to update.
     * @param value The new value.
     */
    const updateRacingSetting = (key: string, value: any) => {
        updateRacing({ [key]: value } as any)
    }

    // Functional updater so this callback's identity stays stable across renders. The
    // memoized `<AptitudeRow>` and `<EpithetChip>` children rely on stable `onChange` props to
    // skip reconciliation when their own data hasn't changed.
    const setAptitude = useCallback(
        (slot: keyof AptitudeMap, rank: string) => {
            updateRacing((prev) => {
                const prevAptitudes = JSON.parse(prev.smartRaceSolverAptitudes || "{}") as AptitudeMap
                return { ...prev, smartRaceSolverAptitudes: JSON.stringify({ ...prevAptitudes, [slot]: rank }) }
            })
        },
        [updateRacing]
    )

    const applyPreset = (preset: CharacterPresetEntry) => {
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
    }

    // Functional-updater form keeps these callbacks identity-stable so the memoized
    // `<EpithetChip>` children below skip re-rendering on unrelated changes (aptitude taps,
    // weight changes, etc.).
    const toggleTargetEpithet = useCallback(
        (name: string) => {
            updateRacing((prev) => {
                const list = JSON.parse(prev.smartRaceSolverTargetEpithets || "[]") as string[]
                const next = list.includes(name) ? list.filter((n) => n !== name) : [...list, name]
                return { ...prev, smartRaceSolverTargetEpithets: JSON.stringify(next) }
            })
        },
        [updateRacing]
    )

    const toggleForcedEpithet = useCallback(
        (name: string) => {
            updateRacing((prev) => {
                const list = JSON.parse(prev.smartRaceSolverForcedEpithets || "[]") as string[]
                const next = list.includes(name) ? list.filter((n) => n !== name) : [...list, name]
                return { ...prev, smartRaceSolverForcedEpithets: JSON.stringify(next) }
            })
        },
        [updateRacing]
    )

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

    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // Preview
    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////

    const buildSnapshot = (): SolverConfigSnapshot => ({
        scenario: general?.scenario || "Trackblazer",
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

    /** Snapshot key of the settings that produced [preview]. Used to detect whether the
     *  current preview is stale relative to the live settings. */
    const [previewSnapshotKey, setPreviewSnapshotKey] = useState<string | null>(lastPreviewCache?.key ?? null)

    const currentSnapshotKey = useMemo(
        () =>
            JSON.stringify({
                scenario: general?.scenario || "Trackblazer",
                characterPreset: smartRaceSolverCharacterPreset,
                aptitudes,
                targetEpithets,
                forcedEpithets,
                manualLocks,
                weights,
            }),
        [general?.scenario, smartRaceSolverCharacterPreset, aptitudes, targetEpithets, forcedEpithets, manualLocks, weights]
    )

    /**
     * True when any solver-relevant setting has changed since the last preview. Recalculate is
     * the only path that triggers a fresh `previewSchedule` call (auto-recalculate was removed
     * because it caused noticeable bridge lag on every keystroke); tapping it sets
     * `previewSnapshotKey = currentSnapshotKey` and clears this flag automatically.
     */
    const dirty = previewSnapshotKey != null && currentSnapshotKey !== previewSnapshotKey

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
            return
        }
        setPreviewLoading(true)
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
            lastPreviewCache = { key, preview: result }
        } catch (e: any) {
            setPreview(null)
            setPreviewError(String(e?.message ?? e))
        } finally {
            setPreviewLoading(false)
        }
    }

    // Auto-run on first mount (or when the user toggles the feature on) so the calendar isn't
    // blank when the page opens. Subsequent settings changes mark dirty without auto-recalc.
    useEffect(() => {
        if (!enableSmartRaceSolver) {
            setPreview(null)
            setPreviewError(null)
            // Reset the snapshot key too so derived `dirty` doesn't stay stuck "true" if the
            // user re-enables the feature later with a different config than what was previously
            // previewed.
            setPreviewSnapshotKey(null)
            return
        }
        if (preview == null) runPreview()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enableSmartRaceSolver])

    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // Styles
    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////

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

    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // Helpers
    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////

    const renderAptitudeRow = (slot: keyof AptitudeMap, label: string) => <AptitudeRow key={slot} slot={slot} label={label} currentRank={aptitudes[slot]} onChange={setAptitude} styles={styles} />

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
                                const prog = preview ? epithetProgress(turn, ep as EpithetWithMatchers, preview, racesByKey) : null
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

    /** Returns all races available on a given turn that pass the eligibility filter. */
    const eligibleRacesForTurn = useMemo(() => {
        const byTurn = new Map<number, RaceEntry[]>()
        for (const race of allRaces) {
            if (!isRaceEligible(race, aptitudes, weights)) continue
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

    const previewStats = useMemo(() => (preview ? computePreviewStats(preview, weights, racesByKey) : null), [preview, weights, racesByKey])

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

    /**
     * Memoized calendar grid (3 year cards × 24 cells = 72 cells). Without this, every aptitude
     * or epithet tap triggered ~411 ms of cell reconciliation even though none of those changes
     * affect the cells' visible content (cells only depend on `preview`, `manualLocks`, the
     * summer-blackout weight, and the epithet highlight). Aptitude / epithet / weight changes
     * still update the popover content the next time a cell is opened, but the static grid no
     * longer rebuilds.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const calendarYearCards = useMemo(() => YEAR_LABELS.map(renderYearCard), [preview, manualLocks, weights.allowSummerRacing, highlightedEpithet])

    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // Render
    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////

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
                            description="Plans every turn of the career to maximize score by targeting epithet rewards. The bot only races when the solver picks a race; other turns become training or rest."
                            style={styles.section}
                        >
                            <CustomCheckbox
                                label="Enable Smart Race Solver"
                                description="Plans every turn of the 72-turn career to maximize score, deciding for each turn whether to race, train, or rest. The bot only runs the races the solver currently plans and never adds extra ones, even when Farming Fans would otherwise pick one up; the plan itself re-solves each turn so wins and losses reshape the remaining schedule. Activates when Farming Fans is on and Force Racing is off."
                                checked={enableSmartRaceSolver}
                                onCheckedChange={(checked) => updateRacingSetting("enableSmartRaceSolver", checked)}
                            />
                        </SearchableItem>

                        {showHeavySections && (
                            <>
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
                                                            Sprint {p.distanceAptitudes.Sprint} · Mile {p.distanceAptitudes.Mile} · Med {p.distanceAptitudes.Medium} · Long {p.distanceAptitudes.Long} ·
                                                            Turf {p.surfaceAptitudes.Turf} · Dirt {p.surfaceAptitudes.Dirt}
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
                                    description="Distance and surface aptitude grades. Races below the threshold are skipped by the solver."
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
                                            Minimum aptitude rank a race needs in BOTH its distance type and surface for the solver to consider it. Races below this rank are dropped entirely, even if
                                            they would complete an epithet. C is a sensible default for most characters; raise to B/A to be stricter, lower to E/F if you have a weak character with
                                            limited aptitudes.
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
                                            Epithets the solver will pursue if doing so improves the schedule. The solver may pick smaller races (G2/G3/OP) just to complete a targeted epithet, even
                                            when those races wouldn't otherwise be worth racing. The schedule is still allowed to skip a target if it would hurt overall score — for guaranteed
                                            completion use Forced Epithets instead.
                                        </Text>
                                        <Input style={styles.input} value={epithetSearch} onChangeText={setEpithetSearch} placeholder="Search 36 epithets…" />
                                        <View style={styles.row}>
                                            {filteredEpithets.map((ep) => (
                                                <EpithetChip key={ep.name} epithet={ep} selected={targetEpithets.includes(ep.name)} onToggle={toggleTargetEpithet} styles={styles} />
                                            ))}
                                        </View>
                                    </View>
                                </SearchableItem>

                                {/* Forced epithets */}
                                <SearchableItem
                                    id="smart-solver-forced-epithets"
                                    condition={enableSmartRaceSolver}
                                    parentId="enable-smart-race-solver"
                                    title="Forced Epithets"
                                    description="Epithets the solver MUST complete. If completion becomes impossible (for example a needed race was already lost), the solver stops planning. Use sparingly — each forced epithet narrows what the solver can pick."
                                    style={styles.section}
                                >
                                    <View style={sectionsDisabledStyle}>
                                        <Text style={styles.sectionTitle}>Forced Epithets ({forcedEpithets.length} selected)</Text>
                                        <Text style={styles.description}>
                                            Epithets the solver MUST complete. If a forced epithet becomes impossible (e.g. a required race is already lost), the solver fails and falls back. Use
                                            sparingly — every forced epithet shrinks the search space and may push the solver to skip otherwise-valuable races just to satisfy the constraint.
                                        </Text>
                                        <Input style={styles.input} value={forcedEpithetSearch} onChangeText={setForcedEpithetSearch} placeholder="Search 36 epithets…" />
                                        <View style={styles.row}>
                                            {filteredForcedEpithets.map((ep) => (
                                                <EpithetChip key={ep.name} epithet={ep} selected={forcedEpithets.includes(ep.name)} onToggle={toggleForcedEpithet} styles={styles} />
                                            ))}
                                        </View>
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
                                            Advanced settings that fine-tune how the solver values races vs. epithets and what it penalizes. Defaults work for most runs — only change these if you know
                                            how they interact.
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
                                                                Multiplier on every race's stat + SP reward. Default 1.0. Raise to 2.0 to make the schedule more race-heavy; lower to 0.5 to favor
                                                                training.
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
                                                                Multiplier on epithet stat rewards. Default 1.0 weights an epithet's stats equally with race stats. Raise to 5.0 if you want the solver
                                                                to chase epithets even at the cost of fewer total races.
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
                                                                Score given for completing a skill-hint epithet (one that grants a skill instead of stats). Default 8.0 ≈ value of one G1 race. Drop to
                                                                0 to skip hint-only epithets entirely.
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
                                                                Penalty per race when racing 3+ turns in a row. Models in-game motivation/condition loss. Late-Dec turns (23, 47, 71) are exempt because
                                                                the year ends there. Set to 0 to disable.
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
                                                                Penalty for racing during summer training camps (turns 12-14, 36-39, 60-63). High enough to discourage racing through summer, low enough
                                                                that an epithet-completing race can still be picked.
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
                                                                Percentage uplift applied to base stat/SP reward of every race before scoring. Default 50%. Higher = the solver picks more races
                                                                overall.
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
                                                                Cost subtracted from each race's reward, expressed as a percentage of a G2 race's baseline value. At 100 (default), G2 and G3 races
                                                                score zero net and only get raced when they progress an epithet. Lower this to schedule more races.
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
                                            Preview of the schedule the solver would start with. Tap a cell to lock it, delete its pick, or switch to an alternative race. Does not reflect mid-run
                                            dynamic re-planning.
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
                                        {calendarYearCards}
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
                            </>
                        )}
                    </View>
                </ScrollView>
            </SearchPageProvider>
        </View>
    )
}

export default SmartRaceSolverSettings
