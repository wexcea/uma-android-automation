import { useMemo, useContext, useState, useEffect, useRef, useCallback, ReactNode } from "react"
import { InteractionManager, View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator } from "react-native"
import { Divider } from "react-native-paper"
import { previewSchedule, SchedulePreview, ScheduleEntry, SolverConfigSnapshot } from "../../lib/solver/preview"
import {
    APTITUDE_RANKS,
    AptitudeMap,
    CharacterPresetEntry,
    DEFAULT_APTITUDES,
    DEFAULT_WEIGHTS,
    EpithetEntry,
    GRADE_COLORS,
    OPTIMIZE_MODE_LABELS,
    OPTIMIZE_MODE_PRESETS,
    OptimizeModeKey,
    RaceEntry,
    shortenRaceName,
    TRAIN_LOCK_SENTINEL,
    turnDateLabel,
    WeightsMap,
    YEAR_LABELS,
} from "../../lib/solver/constants"
import {
    charactersForEpithet,
    computePreviewStats,
    conditionLabelsForRaceAndEpithet,
    epithetProgress,
    epithetsForRace,
    isRaceEligible,
    pendingPrerequisitesForEpithet,
    scenariosForEpithet,
    turnsContributingToEpithet,
} from "../../lib/solver/scoring"
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover"
import { useTheme } from "../../context/ThemeContext"
import { RacingContext, GeneralMiscContext, defaultSettings } from "../../context/BotStateContext"
import { SearchPageProvider } from "../../context/SearchPageContext"
import CustomButton from "../../components/CustomButton"
import InfoContainer from "../../components/InfoContainer"
import WarningContainer from "../../components/WarningContainer"
import { Input } from "../../components/ui/input"
import racesData from "../../data/races.json"
import epithetsData from "../../data/epithets.json"
import characterPresetsData from "../../data/characterPresets.json"
import PageHeader from "../../components/PageHeader"
import { usePerformanceLogging } from "../../hooks/usePerformanceLogging"
import SearchableItem from "../../components/SearchableItem"
import { useNavigation, useFocusEffect } from "@react-navigation/native"
import { AptitudeRow, EpithetChip } from "./components/Helpers"
import { GlassFab } from "../../components/ui/glass-fab"
import { RefreshCw } from "lucide-react-native"
import { Section } from "../../components/ui/section"
import { Row } from "../../components/ui/row"
import { Switch } from "../../components/ui/switch"
import InfoCallout from "../../components/ui/info-callout"
import { TYPE } from "../../lib/type"
import { SPACING } from "../../lib/spacing"

// Stringify the bundled JSON once at module load so we don't pay the serialisation cost on every debounced preview call.
const RACES_DATA_JSON = JSON.stringify(racesData)
const EPITHETS_DATA_JSON = JSON.stringify(epithetsData)

// Remembers the last preview so re-opening this page shows the previous calendar instantly instead of a blank screen while the solver re-runs.
// Keyed on a JSON snapshot of the solver-relevant settings. Cleared only on app reload.
let lastPreviewCache: { key: string; preview: SchedulePreview } | null = null

// Tracks whether the bundled races/epithets JSON has been shipped to Kotlin.
// After the first bridge call Kotlin caches its own copy, so subsequent calls omit the payload and save ~150KB of marshalling.
let bridgeDataPrimed = false

/** Props for SubTopic. */
interface SubTopicProps {
    /** Section heading shown in `TYPE.h2`. */
    title: string
    /** Body content shown in `TYPE.body` with `textMuted` color. */
    children: ReactNode
}

/**
 * A titled paragraph used inside an InfoCallout body.
 * @param title Section heading shown in `TYPE.h2`.
 * @param children Body content shown in `TYPE.body` with `textMuted` color.
 * @returns A View with a heading and body text.
 */
const SubTopic = ({ title, children }: SubTopicProps) => {
    const { colors } = useTheme()
    return (
        <View style={{ marginBottom: SPACING.sm }}>
            <Text style={[TYPE.h2, { color: colors.text, marginBottom: SPACING.xs }]}>{title}</Text>
            <Text style={[TYPE.body, { color: colors.textMuted }]}>{children}</Text>
        </View>
    )
}

/**
 * Smart Race Solver settings page. Lets the user configure aptitudes, target/forced epithets,
 * scoring weights, and a calendar preview with manual locks for the beam-search race scheduler.
 * @returns The rendered Smart Race Solver settings page.
 */
const SmartRaceSolverSettings = () => {
    usePerformanceLogging("SmartRaceSolverSettings")
    const { colors } = useTheme()
    // Subscribe to context slices to avoid re-rendering on unrelated settings changes.
    const { racing, updateRacing } = useContext(RacingContext)
    const { general } = useContext(GeneralMiscContext)
    const scrollViewRef = useRef<ScrollView>(null)
    const navigation = useNavigation<any>()

    // Refs backing the auto-scroll-to-active-preset behaviour on page focus. The character preset list can be long, so we remember each row's
    // measured y-offset via onLayout and snap the nested ScrollView to the active preset on first focus. didInitialPresetScrollRef prevents
    // the snap from re-firing while the user is browsing the page. presetForFocusRef holds the latest active preset name in a ref so the
    // snap helper can read it without taking a React-state dep, which keeps useFocusEffect from re-running on every preset selection.
    const presetScrollRef = useRef<ScrollView>(null)
    const presetLayoutsRef = useRef<Map<string, number>>(new Map())
    const didInitialPresetScrollRef = useRef(false)
    const presetForFocusRef = useRef<string>("")

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

    const allEpithetsRaw = useMemo<EpithetEntry[]>(() => Object.values(epithetsData) as unknown as EpithetEntry[], [])

    /** Name -> entry lookup over every bundled epithet. Reused by `pendingPrerequisitesForEpithet` so dependency lookups stay O(1). */
    const epithetsByName = useMemo<Map<string, EpithetEntry>>(() => new Map(allEpithetsRaw.map((e) => [e.name, e])), [allEpithetsRaw])

    /** Epithets visible in the target / forced pickers after applying the active scenario and character-preset gates. */
    const allEpithets = useMemo<EpithetEntry[]>(() => {
        const activeScenario = (general?.scenario || "Trackblazer").toLowerCase()
        const activePreset = (smartRaceSolverCharacterPreset || "").toLowerCase()
        return allEpithetsRaw.filter((e) => {
            const scenarioRestrictions = scenariosForEpithet(e).map((s) => s.toLowerCase())
            if (scenarioRestrictions.length > 0 && !scenarioRestrictions.includes(activeScenario)) return false
            const characterRestrictions = charactersForEpithet(e).map((c) => c.toLowerCase())
            if (characterRestrictions.length > 0 && activePreset && !characterRestrictions.includes(activePreset)) return false
            return true
        })
    }, [allEpithetsRaw, general?.scenario, smartRaceSolverCharacterPreset])

    /** Names from `allEpithets`, used to gate per-race contribution displays so we don't credit epithets locked to other characters. */
    const allowedEpithetNames = useMemo<Set<string>>(() => new Set(allEpithets.map((e) => e.name)), [allEpithets])

    /** User-facing notice describing which scenario / character filters are active, or null when none are. */
    const restrictionNotice = useMemo<string | null>(() => {
        const activeScenario = general?.scenario || "Trackblazer"
        const activePreset = smartRaceSolverCharacterPreset || ""
        const parts: string[] = [`${activeScenario}-scenario restriction in-effect`]
        if (activePreset) parts.push(`${activePreset} character restriction in-effect`)
        if (allEpithetsRaw.length === allEpithets.length) return null
        return `${parts.join(" + ")} — showing ${allEpithets.length} of ${allEpithetsRaw.length} epithets.`
    }, [allEpithets.length, allEpithetsRaw.length, general?.scenario, smartRaceSolverCharacterPreset])

    const allPresets = useMemo<CharacterPresetEntry[]>(() => Object.values(characterPresetsData) as CharacterPresetEntry[], [])
    const allRaces = useMemo<RaceEntry[]>(() => Object.values(racesData) as RaceEntry[], [])

    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // Local input state for decimals

    const [raceValueInput, setRaceValueInput] = useState(weights.raceValue.toString())
    const [epithetValueInput, setEpithetValueInput] = useState(weights.epithetValue.toString())
    const [hintWeightInput, setHintWeightInput] = useState(weights.hintWeight.toString())
    const [consecPenaltyInput, setConsecPenaltyInput] = useState(weights.consecutiveRacePenalty.toString())
    const [summerPenaltyInput, setSummerPenaltyInput] = useState(weights.summerPenalty.toString())
    const [raceBonusPctInput, setRaceBonusPctInput] = useState(weights.raceBonusPct.toString())
    const [raceCostPctInput, setRaceCostPctInput] = useState(weights.raceCostPct.toString())
    const [fanWeightInput, setFanWeightInput] = useState(weights.fanWeight.toString())

    useEffect(() => setRaceValueInput(weights.raceValue.toString()), [weights.raceValue])
    useEffect(() => setEpithetValueInput(weights.epithetValue.toString()), [weights.epithetValue])
    useEffect(() => setHintWeightInput(weights.hintWeight.toString()), [weights.hintWeight])
    useEffect(() => setConsecPenaltyInput(weights.consecutiveRacePenalty.toString()), [weights.consecutiveRacePenalty])
    useEffect(() => setSummerPenaltyInput(weights.summerPenalty.toString()), [weights.summerPenalty])
    useEffect(() => setRaceBonusPctInput(weights.raceBonusPct.toString()), [weights.raceBonusPct])
    useEffect(() => setRaceCostPctInput(weights.raceCostPct.toString()), [weights.raceCostPct])
    useEffect(() => setFanWeightInput(weights.fanWeight.toString()), [weights.fanWeight])

    /** Derived optimization mode. Mode is not persisted - it falls out of the weights so the radio toggle and the slider can never disagree. */
    const currentOptimizeMode: OptimizeModeKey = weights.fanWeight > 0.0 ? "FANS_EPITAPH" : "STAT_EPITAPH"

    const [presetSearch, setPresetSearch] = useState("")
    const [distanceFilter, setDistanceFilter] = useState<"all" | "Sprint" | "Mile" | "Medium" | "Long" | "Dirt">("all")
    const [epithetSearch, setEpithetSearch] = useState("")
    const [forcedEpithetSearch, setForcedEpithetSearch] = useState("")
    /** Name of the epithet whose contributing races should be highlighted on the calendar. */
    const [highlightedEpithet, setHighlightedEpithet] = useState<string | null>(null)

    // Schedule preview - computed by the Kotlin solver via the React Native bridge.
    const [preview, setPreview] = useState<SchedulePreview | null>(lastPreviewCache?.preview ?? null)
    const [previewLoading, setPreviewLoading] = useState(false)
    const [previewError, setPreviewError] = useState<string | null>(null)

    // Two-phase mount: render the master toggle first, then the heavy sections one tick later.
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

    const filteredPresets = useMemo(() => {
        let list = allPresets
        if (distanceFilter !== "all") {
            list = list.filter((p) => {
                const rank = distanceFilter === "Dirt" ? p.surfaceAptitudes.Dirt : p.distanceAptitudes[distanceFilter]
                return APTITUDE_RANKS.indexOf(rank) <= APTITUDE_RANKS.indexOf("A")
            })
        }
        if (presetSearch) {
            const q = presetSearch.toLowerCase()
            list = list.filter((p) => p.name.toLowerCase().includes(q))
        }
        return list
    }, [allPresets, presetSearch, distanceFilter])

    const filteredEpithets = useMemo(() => {
        if (!epithetSearch) return allEpithets
        const q = epithetSearch.toLowerCase()
        return allEpithets.filter((e) => e.name.toLowerCase().includes(q) || (e.bullet_points ?? []).join(" ").toLowerCase().includes(q))
    }, [allEpithets, epithetSearch])

    const filteredForcedEpithets = useMemo(() => {
        if (!forcedEpithetSearch) return allEpithets
        const q = forcedEpithetSearch.toLowerCase()
        return allEpithets.filter((e) => e.name.toLowerCase().includes(q) || (e.bullet_points ?? []).join(" ").toLowerCase().includes(q))
    }, [allEpithets, forcedEpithetSearch])

    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // Setters

    /**
     * Update a single racing setting, preserving the rest of the racing block.
     *
     * @param key The settings.racing key to update.
     * @param value The new value.
     */
    const updateRacingSetting = (key: string, value: any) => {
        updateRacing({ [key]: value } as any)
    }

    /**
     * Set the rank for a single aptitude slot. Identity-stable so memoized children skip reconciliation on unrelated changes.
     *
     * @param slot The aptitude slot being changed.
     * @param rank The new rank (S..G).
     */
    const setAptitude = useCallback(
        (slot: keyof AptitudeMap, rank: string) => {
            updateRacing((prev) => {
                const prevAptitudes = JSON.parse(prev.smartRaceSolverAptitudes || "{}") as AptitudeMap
                return { ...prev, smartRaceSolverAptitudes: JSON.stringify({ ...prevAptitudes, [slot]: rank }) }
            })
        },
        [updateRacing]
    )

    /**
     * Apply a character preset by saving the preset's name and seeding the six aptitude slots
     * (four distance + two surface) from the preset's defaults. The user can still override individual aptitudes afterwards.
     *
     * @param preset The character preset whose name and aptitudes will be written into the racing settings.
     */
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

    /**
     * Toggle membership of `name` in the target epithets list. Identity-stable for memoized children.
     *
     * @param name The epithet name to toggle.
     */
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

    /**
     * Toggle membership of `name` in the forced epithets list. Identity-stable for memoized children.
     *
     * @param name The epithet name to toggle.
     */
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

    /**
     * Lock a turn to a specific race name (or `TRAIN_LOCK_SENTINEL` for Train).
     *
     * @param turn The turn number being locked.
     * @param raceName The race name (or sentinel) to lock to.
     */
    const addManualLock = (turn: number, raceName: string) => {
        const next = { ...manualLocks, [String(turn)]: raceName }
        updateRacingSetting("smartRaceSolverManualLocks", JSON.stringify(next))
    }

    /**
     * Remove the lock for a turn.
     *
     * @param turn The turn number (as string key) to unlock.
     */
    const removeManualLock = (turn: string) => {
        const next = { ...manualLocks }
        delete next[turn]
        updateRacingSetting("smartRaceSolverManualLocks", JSON.stringify(next))
    }

    /**
     * Toggles whether the given turn is locked.
     * If currently unlocked, locks to whatever is currently scheduled there (race name, or `TRAIN_LOCK_SENTINEL` for Train turns).
     *
     * @param turn The turn number to toggle the lock on.
     * @param currentlyLocked Whether the turn is currently locked.
     * @param raceNameToLock The race name to lock to, or null to lock to Train.
     */
    const toggleLockForTurn = (turn: number, currentlyLocked: boolean, raceNameToLock: string | null) => {
        if (currentlyLocked) {
            removeManualLock(String(turn))
            return
        }
        const value = raceNameToLock ?? TRAIN_LOCK_SENTINEL
        addManualLock(turn, value)
    }

    /**
     * "Delete pick" on a race cell - replaces the race lock with a Train lock so the solver can't put a race there next time.
     * Equivalent to "lock to Train".
     *
     * @param turn The turn number to lock to Train.
     */
    const lockTurnToTrain = (turn: number) => {
        addManualLock(turn, TRAIN_LOCK_SENTINEL)
    }

    /**
     * Switches the locked race for a given turn. Used by the in-popover alternatives list.
     *
     * @param turn The turn number whose lock is being switched.
     * @param newRaceName The new race name to lock to.
     */
    const switchTurnRace = (turn: number, newRaceName: string) => {
        addManualLock(turn, newRaceName)
    }

    /**
     * Update a single scoring weight, preserving the rest.
     *
     * @param key The weight key to update.
     * @param value The new value.
     */
    const updateWeight = (key: keyof WeightsMap, value: number | string | boolean) => {
        updateRacingSetting("smartRaceSolverWeights", JSON.stringify({ ...weights, [key]: value }))
    }

    /**
     * Snap the editable weight sliders to the named optimization-mode preset. The user can still override individual sliders afterward
     * (the radio is derived from `weights.fanWeight > 0`, so manually tuning fanWeight back to 0 flips the radio without an extra click).
     *
     * @param mode Optimization mode key whose preset bundle should be applied.
     */
    const setOptimizeMode = (mode: OptimizeModeKey) => {
        const preset = OPTIMIZE_MODE_PRESETS[mode]
        updateRacingSetting("smartRaceSolverWeights", JSON.stringify({ ...weights, ...preset }))
    }

    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // Preview

    /**
     * Build the snapshot payload sent to the Kotlin solver via the bridge.
     *
     * @returns The current settings packaged as a {@link SolverConfigSnapshot}.
     */
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

    /** Snapshot key of the settings that produced `preview`. Used to detect whether the current preview is stale relative to the live settings. */
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
     * True when the current settings no longer match the ones that produced the visible preview.
     * The Recalculate button is the only way to refresh - auto-recalculate was removed because it lagged the bridge on every keystroke.
     */
    const dirty = previewSnapshotKey != null && currentSnapshotKey !== previewSnapshotKey

    /**
     * Pulls the user's eye to the in-page Calendar Preview by reusing the global Search highlight contract. Clearing targetId first and
     * setting it on the next frame is required because React Navigation no-ops setParams when the value is identical, which would prevent
     * SearchableItem's effect from re-firing on a repeat Apply Changes press.
     */
    const triggerCalendarHighlight = useCallback(() => {
        navigation.setParams({ targetId: undefined, fallbackTargetId: undefined })
        requestAnimationFrame(() => {
            navigation.setParams({ targetId: "smart-solver-calendar-preview" })
        })
    }, [navigation])

    /**
     * Snaps the nested Character Presets ScrollView to the currently-selected preset on first focus. Reads the target preset name from
     * `presetForFocusRef` so this callback's identity is stable and useFocusEffect does not re-run when the user picks a different preset.
     * Bails until the active row's onLayout has measured a y-offset; once the snap fires it locks itself off so the user's own scrolling
     * on the page is not yanked back.
     */
    const maybeScrollToActivePreset = useCallback(() => {
        if (didInitialPresetScrollRef.current) return
        const target = presetForFocusRef.current
        if (!target) return
        const y = presetLayoutsRef.current.get(target)
        if (y == null) return
        presetScrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: false })
        didInitialPresetScrollRef.current = true
    }, [])

    // Mirror the active preset into a ref so `maybeScrollToActivePreset` can read it without taking a state dep. Without this, picking a
    // preset would re-create the snap callback, re-create useFocusEffect's effect, and re-snap the list - which is exactly what the user
    // does not want.
    useEffect(() => {
        presetForFocusRef.current = smartRaceSolverCharacterPreset || ""
    }, [smartRaceSolverCharacterPreset])

    // Re-arm the auto-scroll each time the page gains focus so navigating away and back re-snaps to the active preset.
    useFocusEffect(
        useCallback(() => {
            didInitialPresetScrollRef.current = false
            // Try once immediately in case layouts have already settled (e.g. returning to the page with the list cached).
            maybeScrollToActivePreset()
            return () => {}
        }, [maybeScrollToActivePreset])
    )

    /**
     * Force a fresh solve. Surfaced as the Recalculate button.
     *
     * @returns A promise that resolves once the preview has been refreshed.
     */
    const runPreview = async () => {
        if (!enableSmartRaceSolver) return
        const snapshot = buildSnapshot()
        const key = currentSnapshotKey
        // Cache hit - instant, no bridge call.
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

    // Auto-run on first mount or when the feature is toggled on; clear state when toggled off.
    useEffect(() => {
        if (!enableSmartRaceSolver) {
            setPreview(null)
            setPreviewError(null)
            // Reset the snapshot key so `dirty` doesn't stay stuck true on re-enable.
            setPreviewSnapshotKey(null)
            return
        }
        if (preview == null) runPreview()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enableSmartRaceSolver])

    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // Styles

    const styles = useMemo(
        () =>
            StyleSheet.create({
                root: { flex: 1, flexDirection: "column", margin: 10, backgroundColor: colors.bg },
                section: { marginVertical: 8, padding: 12, backgroundColor: colors.surface, borderRadius: 8 },
                sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: 6 },
                description: { fontSize: 13, color: colors.textMuted, marginBottom: 8 },
                infoBlock: { marginTop: 12 },
                infoLabel: { fontWeight: "bold", color: colors.text, fontSize: 14, lineHeight: 22, includeFontPadding: false },
                infoDescription: { fontSize: 14, color: colors.text, opacity: 0.7, lineHeight: 22, includeFontPadding: false, marginTop: 2 },
                restrictionNotice: {
                    fontSize: 12,
                    color: colors.text,
                    backgroundColor: colors.surfaceRaised,
                    borderLeftColor: colors.brand,
                    borderLeftWidth: 3,
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderRadius: 4,
                    marginBottom: 8,
                },
                inputLabel: { fontSize: 14, color: colors.text, marginBottom: 4, marginTop: 6 },
                input: { backgroundColor: colors.bg, color: colors.text, marginBottom: 4 },
                inputDescription: { fontSize: 12, color: colors.textMuted, marginBottom: 4 },
                row: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginVertical: 4 },
                chip: {
                    width: "31.5%",
                    minHeight: 92,
                    paddingHorizontal: 8,
                    paddingVertical: 6,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: colors.borderHair,
                    backgroundColor: colors.bg,
                    overflow: "hidden",
                },
                chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
                chipText: { color: colors.text, fontSize: 12, fontWeight: "600" },
                chipTextActive: { color: colors.onBrand, fontSize: 12, fontWeight: "700" },
                chipReward: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
                chipRewardActive: { color: colors.onBrand, fontSize: 10, marginTop: 2, opacity: 0.9 },
                chipCondition: { color: colors.textMuted, fontSize: 10, fontStyle: "italic", marginTop: 2 },
                chipConditionActive: { color: colors.onBrand, fontSize: 10, fontStyle: "italic", marginTop: 2, opacity: 0.8 },
                chipNoMatcherDot: { position: "absolute", top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.destructive },
                distanceChip: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: "hidden" },
                distanceChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
                distanceChipText: { color: colors.text, fontSize: 12, fontWeight: "600" },
                distanceChipTextActive: { color: colors.onBrand, fontSize: 12, fontWeight: "700" },
                aptRow: { flexDirection: "row", alignItems: "center", marginVertical: 4 },
                aptLabel: { width: 70, color: colors.text, fontSize: 13 },
                aptButtons: { flexDirection: "row", gap: 4, flex: 1 },
                aptBtn: {
                    flex: 1,
                    paddingVertical: 6,
                    borderRadius: 4,
                    borderWidth: 1,
                    borderColor: colors.borderHair,
                    alignItems: "center",
                    backgroundColor: colors.bg,
                },
                aptBtnActive: { backgroundColor: colors.brand, borderColor: colors.brand },
                aptBtnText: { color: colors.text, fontSize: 12 },
                aptBtnTextActive: { color: colors.onBrand, fontSize: 12, fontWeight: "700" },
                lockRow: {
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 6,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderColor: colors.borderHair,
                },
                lockTurn: { width: 60, color: colors.text, fontSize: 13 },
                lockRace: { flex: 1, color: colors.text, fontSize: 13 },
                presetList: {
                    maxHeight: 600,
                    marginBottom: 8,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: colors.borderHair,
                    borderRadius: 6,
                },
                epithetList: {
                    maxHeight: 600,
                    marginVertical: 4,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: colors.borderHair,
                    borderRadius: 6,
                    padding: 6,
                },
                presetItem: {
                    paddingVertical: 8,
                    paddingHorizontal: 6,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderColor: colors.borderHair,
                },
                presetItemActive: { backgroundColor: colors.brand },
                presetName: { color: colors.text, fontSize: 14 },
                presetNameActive: { color: colors.onBrand, fontSize: 14, fontWeight: "700" },
                presetAptitudes: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
                summary: {
                    color: colors.textMuted,
                    fontSize: 12,
                    fontFamily: "monospace",
                    paddingVertical: 4,
                },
                yearCard: {
                    marginVertical: 8,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: colors.borderHair,
                    borderRadius: 8,
                    backgroundColor: colors.bg,
                },
                yearCardTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: 6 },
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
                    borderColor: colors.borderHair,
                    backgroundColor: colors.surface,
                    minHeight: 56,
                },
                calendarCellRace: {
                    backgroundColor: colors.surface,
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
                calendarRaceName: { fontSize: 10, color: colors.text, fontWeight: "600", textAlign: "center" },
                calendarCellEmpty: { fontSize: 11, color: colors.textMuted, textAlign: "center" },
                calendarCellPreDebut: {
                    backgroundColor: colors.surfaceRaised,
                    borderColor: colors.borderHair,
                    borderStyle: "dashed",
                    opacity: 0.6,
                },
                calendarCellPreDebutText: {
                    fontSize: 10,
                    color: colors.textMuted,
                    fontStyle: "italic",
                    fontWeight: "600",
                    textAlign: "center",
                },
                calendarDateLabel: { fontSize: 10, color: colors.textMuted, textAlign: "center", marginTop: 3 },
                calendarCellLocked: {
                    borderWidth: 2,
                    borderColor: colors.brand,
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
                    borderColor: colors.borderHair,
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
                popoverAltName: { fontSize: 12, fontWeight: "600", color: colors.text },
                popoverAltMeta: { fontSize: 10, color: colors.textMuted },
                popoverHint: { fontSize: 10, color: colors.textMuted, fontStyle: "italic", marginTop: 8, textAlign: "center" },
                recalcFab: { position: "absolute", bottom: 16, right: 16, zIndex: 10, alignItems: "flex-end" },
                recalcFabLabel: {
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.borderHair,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 6,
                    marginBottom: 6,
                    elevation: 4,
                },
                recalcFabLabelText: { color: colors.text, fontSize: 12, fontWeight: "600" },
                epithetCard: {
                    paddingVertical: 6,
                    paddingHorizontal: 8,
                    marginVertical: 3,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: colors.borderHair,
                    backgroundColor: colors.surface,
                },
                epithetCardHighlighted: {
                    borderColor: colors.brand,
                    borderWidth: 2,
                    backgroundColor: colors.surfaceRaised,
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
                epithetCardName: { fontSize: 13, fontWeight: "700", color: colors.text, marginBottom: 2 },
                epithetCardReward: { fontSize: 11, color: colors.text, marginBottom: 1 },
                epithetCardCondition: { fontSize: 11, color: colors.textMuted, fontStyle: "italic" },
                epithetCardConditionItem: { fontSize: 11, color: colors.textMuted, fontStyle: "italic", marginLeft: 8 },
                statsRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", marginVertical: 6, paddingHorizontal: 2, columnGap: 12, rowGap: 8 },
                statsCell: { flexDirection: "column", alignItems: "flex-start", minWidth: 70, flexShrink: 1 },
                statsLabel: { fontSize: 11, color: colors.textMuted, marginBottom: 2 },
                statsValue: { fontSize: 16, color: colors.text, fontWeight: "700" },
                popoverTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
                popoverMeta: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
                popoverSection: { fontSize: 13, fontWeight: "700", color: colors.text, marginTop: 8 },
                popoverEpithet: { fontSize: 12, color: colors.text, marginTop: 2 },
                popoverEpithetPending: { fontSize: 12, color: colors.textMuted, marginTop: 1, fontStyle: "italic" },
                popoverEmpty: { fontSize: 12, color: colors.textMuted, marginTop: 2, fontStyle: "italic" },
                previewStatus: { fontSize: 12, color: colors.textMuted, paddingVertical: 4 },
                previewError: { fontSize: 12, color: "#dc2626", paddingVertical: 4 },
            }),
        [colors]
    )

    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // Helpers

    const renderAptitudeRow = (slot: keyof AptitudeMap, label: string) => <AptitudeRow key={slot} slot={slot} label={label} currentRank={aptitudes[slot]} onChange={setAptitude} styles={styles} />

    /**
     * Popover content shown when a calendar cell is tapped: current pick, lock controls, and
     * a list of alternative races for that turn.
     *
     * @param turn The 1-indexed turn number this popover is for.
     * @param entry The schedule decision currently assigned to that turn.
     * @returns The popover body element.
     */
    const renderPopoverBody = (turn: number, entry: ScheduleEntry | undefined) => {
        const turnYearOffset = (turn - 1) % 24
        const yearName = turn <= 24 ? "Junior" : turn <= 48 ? "Classic" : "Senior"
        const fullDateLabel = `${yearName} ${turnDateLabel(turnYearOffset)}`
        const isRace = entry?.type === "Race"
        const race = isRace && entry?.raceKey ? racesByKey[entry.raceKey] : undefined
        // Only list epithets this race actually contributes to: drop ones whose required count is already satisfied earlier in the schedule.
        const matched = race && preview ? epithetsForRace(race).filter((ep) => allowedEpithetNames.has(ep.name) && turnsContributingToEpithet(ep, preview, racesByKey).has(turn)) : []
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
                                const before = preview ? epithetProgress(turn - 1, ep, preview, racesByKey) : null
                                const after = preview ? epithetProgress(turn, ep, preview, racesByKey) : null
                                const progLabel = before && after ? `(${before.current}/${before.required} -> ${after.current}/${after.required}) ` : ""
                                const conditions = race ? conditionLabelsForRaceAndEpithet(race, ep) : []
                                const tail = conditions.join("; ")
                                const pending = preview ? pendingPrerequisitesForEpithet(ep, turn, epithetsByName, preview, racesByKey) : []
                                return (
                                    <View key={ep.name}>
                                        <Text style={styles.popoverEpithet}>
                                            • {progLabel}
                                            {ep.name}
                                            {tail ? ` — ${tail}` : ""}
                                        </Text>
                                        {pending.map((line) => (
                                            <Text key={line} style={styles.popoverEpithetPending}>
                                                {"      "}* Still pending: {line}
                                            </Text>
                                        ))}
                                    </View>
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
                            const altColor = GRADE_COLORS[alt.grade] ?? colors.brand
                            return (
                                <Pressable
                                    key={`${alt.name}-${alt.date}`}
                                    style={styles.popoverAltRow}
                                    onPress={() => switchTurnRace(turn, alt.name)}
                                    android_ripple={{ color: colors.ripple, foreground: true }}
                                >
                                    <View style={[styles.popoverAltBadge, { backgroundColor: altColor }]}>
                                        <Text style={styles.calendarBadgeText}>{alt.grade.replace("PRE_OP", "Pre").replace("PRE-OP", "Pre")}</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.popoverAltName}>{alt.name}</Text>
                                        <Text style={styles.popoverAltMeta}>
                                            {alt.raceTrack} · {alt.terrain} · {alt.distanceType} ({alt.distanceMeters}m) · {alt.fans.toLocaleString()} fans
                                        </Text>
                                    </View>
                                </Pressable>
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
     * Render one calendar cell. Pre-Debut and summer-blocked turns render as non-tappable placeholders. All others open the popover on tap.
     *
     * @param turn The absolute 1-indexed turn number (1..72).
     * @param turnInYear The 0-indexed turn offset within the year card (0..23).
     * @returns The rendered calendar cell element.
     */
    const renderCalendarCell = (turn: number, turnInYear: number) => {
        const entry = preview?.decisions[String(turn)]
        const isRace = entry?.type === "Race"
        const color = isRace ? (GRADE_COLORS[entry.grade ?? ""] ?? colors.brand) : null
        const shortRaceName = isRace ? shortenRaceName(entry.name ?? entry.raceKey ?? "") : ""
        const dateLabel = turnDateLabel(turnInYear)
        const isPreDebut = turn <= 13
        const isSummerBlocked = !weights.allowSummerRacing && ((turn >= 37 && turn <= 40) || (turn >= 61 && turn <= 64))
        const isLocked = manualLocks[String(turn)] != null
        const highlightHit = isRace && contributingTurnsForHighlight.has(turn)

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
                        <Pressable
                            style={[styles.calendarCell, isRace && styles.calendarCellRace, isLocked && styles.calendarCellLocked, highlightHit && styles.calendarCellHighlighted]}
                            android_ripple={{ color: colors.ripple, foreground: true }}
                        >
                            {cellInner}
                        </Pressable>
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

    /** Turns whose scheduled race actually counts toward completing the highlighted epithet, capped at each matcher's required count. */
    const contributingTurnsForHighlight = useMemo<Set<number>>(() => {
        if (!highlightedEpithet || !preview) return new Set<number>()
        const ep = (epithetsData as unknown as Record<string, EpithetEntry>)[highlightedEpithet]
        if (!ep) return new Set<number>()
        return turnsContributingToEpithet(ep, preview, racesByKey)
    }, [highlightedEpithet, preview, racesByKey])

    /**
     * Render one year's 4x6 calendar card.
     *
     * @param year The year descriptor (heading name and the absolute turn number of the
     *   top-left cell).
     * @returns The rendered year card.
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

    // Memoized 72-cell grid: rebuild only when the preview, locks, summer-blackout weight, or highlight change.
    // Other settings refresh inside popovers when next opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const calendarYearCards = useMemo(() => YEAR_LABELS.map(renderYearCard), [preview, manualLocks, weights.allowSummerRacing, highlightedEpithet, contributingTurnsForHighlight])

    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // Render

    const sectionsDisabledStyle = enableSmartRaceSolver ? undefined : ({ opacity: 0.4 } as const)

    return (
        <View style={styles.root}>
            <SearchPageProvider page="SmartRaceSolverSettings" scrollViewRef={scrollViewRef}>
                <PageHeader title="Smart Race Solver" />
                <ScrollView
                    ref={scrollViewRef}
                    nestedScrollEnabled={true}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ flexGrow: 1, paddingBottom: dirty ? 80 : 24 }}
                >
                    <View className="m-1">
                        {/* Master toggle */}
                        <SearchableItem
                            id="enable-smart-race-solver"
                            title="Enable Smart Race Solver"
                            description="Plans every turn of the career to maximize score by targeting epithet rewards. The bot only races when the solver picks a race; other turns become training or rest."
                            style={styles.section}
                        >
                            <Row
                                title="Smart Race Solver"
                                description="Let the solver pick races automatically"
                                right={<Switch checked={enableSmartRaceSolver} onCheckedChange={(checked) => updateRacingSetting("enableSmartRaceSolver", checked)} />}
                            />
                        </SearchableItem>

                        {showHeavySections && (
                            <>
                                {/* How it works info box. */}
                                <SearchableItem
                                    id="smart-solver-how-it-works"
                                    condition={enableSmartRaceSolver}
                                    parentId="enable-smart-race-solver"
                                    title="How it works"
                                    description="Smart Race Solver overview, loss handling, race-history scrape, and notes on epithets without matchers."
                                    style={styles.section}
                                >
                                    <InfoCallout title="How the solver works">
                                        <SubTopic title="How it works">
                                            The solver searches the entire 72-turn career and picks, for every turn, the best decision (Race / Train / Rest) that maximizes your projected score against
                                            the target epithet rewards. The bot only races on the turns the solver has chosen in the calculated schedule - every other turn becomes training or rest,
                                            even when Farming Fans would otherwise add an extra race. Hard goal requirements (fan / trophy / goal-points) and the Force Racing setting are the only
                                            things that can override the schedule.
                                        </SubTopic>
                                        <SubTopic title="What happens when you lose a race">
                                            A loss is recorded against that turn and the solver immediately re-plans the remaining turns. Epithets that depended on the lost race may shift to
                                            alternative paths or drop out entirely, so later races / trainings can change to keep the rest of the run on the highest-scoring track still available.
                                        </SubTopic>
                                        <SubTopic title="Race History scrape">
                                            On bot start (and only when the career is past the pre-debut turns), the bot opens the in-game Career → Race History dialog and scrapes every past race
                                            entry. Each row is matched to the race calendar so wins seed your epithet progress and losses are remembered when re-planning. This lets you stop and resume
                                            a career mid-run without the solver forgetting what already happened.
                                        </SubTopic>
                                        <SubTopic title="Epithets without matchers">
                                            Some epithets in the data set have no structured matchers in the code - usually because the in-game condition (like "Win your first G1 in Senior class") is
                                            difficult to be modeled as a per-race rule. These are marked with a small red dot in the top-right corner of their chip. The solver treats them as untouched
                                            and never picks races to advance them, so they won't be auto-completed. Adding one to Forced makes every candidate schedule infeasible since the condition
                                            can never be satisfied, so leave them out of Forced even if you plan to earn them yourself in-game.
                                        </SubTopic>
                                    </InfoCallout>
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
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.xs, marginBottom: SPACING.sm }}>
                                            {(
                                                [
                                                    { key: "all", label: "All" },
                                                    { key: "Sprint", label: "Sprint" },
                                                    { key: "Mile", label: "Mile" },
                                                    { key: "Medium", label: "Medium" },
                                                    { key: "Long", label: "Long" },
                                                    { key: "Dirt", label: "Dirt" },
                                                ] as { key: typeof distanceFilter; label: string }[]
                                            ).map((c) => (
                                                <Pressable
                                                    key={c.key}
                                                    onPress={() => setDistanceFilter(c.key)}
                                                    style={[styles.distanceChip, distanceFilter === c.key && styles.distanceChipActive]}
                                                    android_ripple={{ color: colors.ripple, foreground: true }}
                                                >
                                                    <Text style={[styles.distanceChipText, distanceFilter === c.key && styles.distanceChipTextActive]}>{c.label}</Text>
                                                </Pressable>
                                            ))}
                                        </ScrollView>
                                        <Input style={styles.input} value={presetSearch} onChangeText={setPresetSearch} placeholder="Search characters..." />
                                        <ScrollView ref={presetScrollRef} style={styles.presetList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                                            {filteredPresets.map((p) => {
                                                const active = smartRaceSolverCharacterPreset === p.name
                                                return (
                                                    <Pressable
                                                        key={p.name}
                                                        style={[styles.presetItem, active && styles.presetItemActive]}
                                                        android_ripple={{ color: colors.ripple, foreground: true }}
                                                        onPress={() => applyPreset(p)}
                                                        onLayout={(e) => {
                                                            presetLayoutsRef.current.set(p.name, e.nativeEvent.layout.y)
                                                            if (active) maybeScrollToActivePreset()
                                                        }}
                                                    >
                                                        <Text style={active ? styles.presetNameActive : styles.presetName}>{p.name}</Text>
                                                        <Text style={styles.presetAptitudes}>
                                                            Sprint {p.distanceAptitudes.Sprint} · Mile {p.distanceAptitudes.Mile} · Med {p.distanceAptitudes.Medium} · Long {p.distanceAptitudes.Long} ·
                                                            Turf {p.surfaceAptitudes.Turf} · Dirt {p.surfaceAptitudes.Dirt}
                                                        </Text>
                                                    </Pressable>
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
                                                    <Pressable
                                                        key={rank}
                                                        style={[styles.aptBtn, active && styles.aptBtnActive]}
                                                        onPress={() => updateWeight("aptitudeThreshold", rank)}
                                                        android_ripple={{ color: active ? colors.rippleInverse : colors.ripple, foreground: true }}
                                                    >
                                                        <Text style={active ? styles.aptBtnTextActive : styles.aptBtnText}>{rank}</Text>
                                                    </Pressable>
                                                )
                                            })}
                                        </View>

                                        <Divider style={{ marginVertical: 16 }} />

                                        <View style={{ flexDirection: "row", alignItems: "center", marginTop: SPACING.sm, gap: SPACING.md }}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[TYPE.body, { color: colors.text, fontWeight: "600" as const }]}>Include OP / Pre-OP races</Text>
                                                <Text style={[TYPE.caption, { color: colors.textMuted, marginTop: 2 }]}>
                                                    By default the solver picks only G1/G2/G3 races. Enable this to also consider OP and Pre-OP races. Useful for weaker characters (e.g. Haru Urara) who can't qualify for many graded races; OP races contribute much less to stats but at least give the solver something to schedule.
                                                </Text>
                                            </View>
                                            <Switch checked={weights.includeOpAndPreOp} onCheckedChange={(checked) => updateWeight("includeOpAndPreOp", checked)} />
                                        </View>
                                        <View style={{ flexDirection: "row", alignItems: "center", marginTop: SPACING.sm, gap: SPACING.md }}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[TYPE.body, { color: colors.text, fontWeight: "600" as const }]}>Allow racing during Summer (Classic / Senior)</Text>
                                                <Text style={[TYPE.caption, { color: colors.textMuted, marginTop: 2 }]}>
                                                    By default the Summer training camp turns (Early Jul → Late Aug) in Classic and Senior years are blocked from racing. Enable this to let the solver schedule races in those 4 turns each year - useful when a key epithet race lands in summer.
                                                </Text>
                                            </View>
                                            <Switch checked={weights.allowSummerRacing} onCheckedChange={(checked) => updateWeight("allowSummerRacing", checked)} />
                                        </View>
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
                                        <Text style={styles.sectionTitle}>
                                            Target Epithets (<Text style={[TYPE.monoValue, { color: colors.text }]}>{targetEpithets.length}</Text> selected)
                                        </Text>
                                        <Text style={styles.description}>
                                            Epithets the solver will pursue if doing so improves the schedule. The solver may pick smaller races (G2/G3/OP) just to complete a targeted epithet, even
                                            when those races wouldn't otherwise be worth racing. The schedule is still allowed to skip a target if it would hurt overall score — for guaranteed
                                            completion use Forced Epithets instead.
                                        </Text>
                                        {restrictionNotice && (
                                            <InfoCallout title={restrictionNotice} style={{ backgroundColor: colors.surfaceRaised, marginTop: SPACING.sm, marginBottom: SPACING.sm }}>
                                                <Text style={[TYPE.body, { color: colors.text }]}>
                                                    The epithet list below is filtered to only those compatible with the current scenario and character preset. Change either to widen the list.
                                                </Text>
                                            </InfoCallout>
                                        )}
                                        <InfoCallout
                                            title="Epithets with no structured matcher in the code"
                                            icon={<View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.destructive }} />}
                                            style={{ backgroundColor: colors.surfaceRaised, marginTop: SPACING.sm, marginBottom: SPACING.sm }}
                                        >
                                            <Text style={[TYPE.body, { color: colors.text }]}>
                                                Their in-game conditions is too difficult or impossible to model as a per-race rule. The solver won't pick races to advance them. Adding one to Forced makes the schedule infeasible, so leave it out of Forced even if you plan to earn it manually in-game.
                                            </Text>
                                        </InfoCallout>
                                        <Input style={styles.input} value={epithetSearch} onChangeText={setEpithetSearch} placeholder={`Search ${allEpithets.length} epithets…`} />
                                        <ScrollView style={styles.epithetList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                                            <View style={styles.row}>
                                                {filteredEpithets.map((ep) => (
                                                    <EpithetChip key={ep.name} epithet={ep} selected={targetEpithets.includes(ep.name)} onToggle={toggleTargetEpithet} styles={styles} />
                                                ))}
                                            </View>
                                        </ScrollView>
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
                                        <Text style={styles.sectionTitle}>
                                            Forced Epithets (<Text style={[TYPE.monoValue, { color: colors.text }]}>{forcedEpithets.length}</Text> selected)
                                        </Text>
                                        <Text style={styles.description}>
                                            Epithets the solver MUST complete. If a forced epithet becomes impossible (e.g. a required race is already lost), the solver fails and falls back. Use
                                            sparingly — every forced epithet shrinks the search space and may push the solver to skip otherwise-valuable races just to satisfy the constraint.
                                        </Text>
                                        {restrictionNotice && (
                                            <InfoCallout title={restrictionNotice} style={{ backgroundColor: colors.surfaceRaised, marginTop: SPACING.sm, marginBottom: SPACING.sm }}>
                                                <Text style={[TYPE.body, { color: colors.text }]}>
                                                    The epithet list below is filtered to only those compatible with the current scenario and character preset. Change either to widen the list.
                                                </Text>
                                            </InfoCallout>
                                        )}
                                        <InfoCallout
                                            title="Epithets with no structured matcher in the code"
                                            icon={<View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.destructive }} />}
                                            style={{ backgroundColor: colors.surfaceRaised, marginTop: SPACING.sm, marginBottom: SPACING.sm }}
                                        >
                                            <Text style={[TYPE.body, { color: colors.text }]}>
                                                The in-game condition (like "Win your first G1 in Senior class") can't be modeled as a per-race rule yet. The solver won't pick races to advance them. Adding one to Forced makes the schedule infeasible, so leave it out of Forced even if you plan to earn it manually in-game.
                                            </Text>
                                        </InfoCallout>
                                        <Input style={styles.input} value={forcedEpithetSearch} onChangeText={setForcedEpithetSearch} placeholder={`Search ${allEpithets.length} epithets…`} />
                                        <ScrollView style={styles.epithetList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                                            <View style={styles.row}>
                                                {filteredForcedEpithets.map((ep) => (
                                                    <EpithetChip key={ep.name} epithet={ep} selected={forcedEpithets.includes(ep.name)} onToggle={toggleForcedEpithet} styles={styles} />
                                                ))}
                                            </View>
                                        </ScrollView>
                                    </View>
                                </SearchableItem>

                                {/* Optimization mode */}
                                <SearchableItem
                                    id="smart-solver-optimize-mode"
                                    condition={enableSmartRaceSolver}
                                    parentId="enable-smart-race-solver"
                                    title="Optimization Mode"
                                    description="Pick whether the solver chases stat epitaphs or also emphasizes fan-heavy races."
                                    style={styles.section}
                                >
                                    <View style={sectionsDisabledStyle}>
                                        <Text style={styles.sectionTitle}>Optimize for</Text>
                                        <View style={styles.aptButtons}>
                                            {(Object.keys(OPTIMIZE_MODE_PRESETS) as OptimizeModeKey[]).map((mode) => {
                                                const active = currentOptimizeMode === mode
                                                return (
                                                    <Pressable
                                                        key={mode}
                                                        style={[styles.aptBtn, active && styles.aptBtnActive]}
                                                        onPress={() => setOptimizeMode(mode)}
                                                        android_ripple={{ color: active ? colors.rippleInverse : colors.ripple, foreground: true }}
                                                    >
                                                        <Text style={active ? styles.aptBtnTextActive : styles.aptBtnText}>{OPTIMIZE_MODE_LABELS[mode]}</Text>
                                                    </Pressable>
                                                )
                                            })}
                                        </View>
                                        <Text style={[styles.inputDescription, { marginBottom: 0, marginTop: 8 }]}>
                                            Stat Epitaphs (default) optimizes purely for stat-bearing epithets and ignores reward fans. Fans + Epitaphs adds a per-fan score so fan-rich races (G1s, big
                                            G3s) become more attractive alongside epithets. Switching modes snaps the editable Race Value, Epithet Value, and Fan Weight sliders to a fresh preset; you
                                            can still tune each slider afterward, and tapping the active mode again resets back to the preset.
                                        </Text>
                                    </View>
                                </SearchableItem>

                                {/* Weights */}
                                <SearchableItem
                                    id="smart-solver-weights"
                                    condition={enableSmartRaceSolver}
                                    parentId="enable-smart-race-solver"
                                    title="Scoring Weights"
                                    description="Tune how the solver balances race value, epithet completion, fan rewards, and penalties."
                                    style={styles.section}
                                >
                                    <View style={sectionsDisabledStyle}>
                                        <Text style={styles.sectionTitle}>Scoring Weights</Text>
                                        <Text style={styles.description}>
                                            Advanced settings that fine-tune how the solver values races vs. epithets and what it penalizes. Defaults work for most runs — only change these if you know
                                            how they interact.
                                        </Text>
                                        <Section label="Show advanced weights" collapsible defaultOpen={false}>
                                            <View style={{ padding: SPACING.md }}>
                                                <Pressable android_ripple={{ color: colors.ripple, foreground: true }}>
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
                                                </Pressable>

                                                <Pressable android_ripple={{ color: colors.ripple, foreground: true }}>
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
                                                </Pressable>

                                                <Pressable android_ripple={{ color: colors.ripple, foreground: true }}>
                                                    <Text style={styles.inputLabel}>Fan Weight</Text>
                                                    <Input
                                                        style={styles.input}
                                                        value={fanWeightInput}
                                                        onChangeText={(t) => /^-?\d*\.?\d*$/.test(t) && setFanWeightInput(t)}
                                                        onBlur={() => updateWeight("fanWeight", parseFloat(fanWeightInput) || 0)}
                                                        keyboardType="decimal-pad"
                                                        placeholder="0.0"
                                                    />
                                                    <Text style={styles.inputDescription}>
                                                        Score per fan earned from a race. Default 0.0 ignores fans entirely (Stat Epitaphs preset). 0.001 (Fans + Epitaphs preset) makes a 25k-fan G1
                                                        worth ~25 score points - meaningful but not dominant. Above 0.005 the solver will race almost every eligible turn.
                                                    </Text>
                                                </Pressable>

                                                <Pressable android_ripple={{ color: colors.ripple, foreground: true }}>
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
                                                </Pressable>

                                                <Pressable android_ripple={{ color: colors.ripple, foreground: true }}>
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
                                                </Pressable>

                                                <Pressable android_ripple={{ color: colors.ripple, foreground: true }}>
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
                                                </Pressable>

                                                <Pressable android_ripple={{ color: colors.ripple, foreground: true }}>
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
                                                </Pressable>

                                                <Pressable android_ripple={{ color: colors.ripple, foreground: true }}>
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
                                                </Pressable>
                                            </View>
                                        </Section>
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
                                        {!previewLoading && !previewError && preview && previewStats && (
                                            <Text style={[styles.inputDescription, { fontStyle: "italic", marginTop: 2 }]}>
                                                Note: Projected Fan Gain is the raw sum of each scheduled race's base fan reward and does not factor in in-game fan bonuses and other fan sources.
                                                Actual fans earned during a run will be higher.
                                            </Text>
                                        )}
                                        {dirty && (
                                            <WarningContainer>Settings have changed - the calendar needs to be regenerated. Tap Recalculate to refresh the preview and apply changes.</WarningContainer>
                                        )}
                                        {previewLoading && (
                                            <View style={{ flexDirection: "row", alignItems: "center" }}>
                                                <ActivityIndicator size="small" color={colors.brand} />
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
                                                    <Text style={styles.statsLabel}>Projected Fan Gain</Text>
                                                    <Text style={styles.statsValue}>{previewStats.fans.toLocaleString()}</Text>
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
                                                const ep = (epithetsData as unknown as Record<string, EpithetEntry>)[name]
                                                const isForced = forcedEpithets.includes(name)
                                                const epBullets = ep?.bullet_points ?? []
                                                const rawReward = epBullets.length > 0 ? epBullets[epBullets.length - 1] : "(reward unknown)"
                                                const reward = rawReward.replace(/^\s*reward\s*:\s*/i, "")
                                                const conditionLines = epBullets.length > 1 ? epBullets.slice(0, -1) : []
                                                const isHighlighted = highlightedEpithet === name
                                                return (
                                                    <Pressable
                                                        key={`sel-${name}`}
                                                        style={[styles.epithetCard, isHighlighted && styles.epithetCardHighlighted]}
                                                        onPress={() => setHighlightedEpithet(isHighlighted ? null : name)}
                                                        android_ripple={{ color: colors.ripple, foreground: true }}
                                                    >
                                                        <Text style={styles.epithetCardName}>
                                                            {name}
                                                            {isForced ? "  ★" : ""}
                                                        </Text>
                                                        <Text style={styles.epithetCardReward}>Reward: {reward}</Text>
                                                        {conditionLines.length > 0 ? (
                                                            <>
                                                                <Text style={styles.epithetCardCondition}>Condition:</Text>
                                                                {conditionLines.map((line, idx) => (
                                                                    <Text key={`sel-${name}-cond-${idx}`} style={styles.epithetCardConditionItem}>
                                                                        • {line}
                                                                    </Text>
                                                                ))}
                                                            </>
                                                        ) : (
                                                            <Text style={styles.epithetCardCondition}>Condition: (condition unknown)</Text>
                                                        )}
                                                    </Pressable>
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
                                            const ep = (epithetsData as unknown as Record<string, EpithetEntry>)[name]
                                            const epBullets = ep?.bullet_points ?? []
                                            const rawReward = epBullets.length > 0 ? epBullets[epBullets.length - 1] : "(reward unknown)"
                                            const reward = rawReward.replace(/^\s*reward\s*:\s*/i, "")
                                            const conditionLines = epBullets.length > 1 ? epBullets.slice(0, -1) : []
                                            const isSelected = targetEpithets.includes(name) || forcedEpithets.includes(name)
                                            const isHighlighted = highlightedEpithet === name
                                            return (
                                                <Pressable
                                                    key={`proj-${name}`}
                                                    style={[styles.epithetCard, isHighlighted && styles.epithetCardHighlighted]}
                                                    onPress={() => setHighlightedEpithet(isHighlighted ? null : name)}
                                                    android_ripple={{ color: colors.ripple, foreground: true }}
                                                >
                                                    <Text style={[styles.epithetCardName, { color: isSelected ? colors.brand : colors.text }]}>
                                                        {name}
                                                        {isSelected ? "  ✓" : ""}
                                                    </Text>
                                                    <Text style={styles.epithetCardReward}>Reward: {reward}</Text>
                                                    {conditionLines.length > 0 ? (
                                                        <>
                                                            <Text style={styles.epithetCardCondition}>Condition:</Text>
                                                            {conditionLines.map((line, idx) => (
                                                                <Text key={`proj-${name}-cond-${idx}`} style={styles.epithetCardConditionItem}>
                                                                    • {line}
                                                                </Text>
                                                            ))}
                                                        </>
                                                    ) : (
                                                        <Text style={styles.epithetCardCondition}>Condition: (condition unknown)</Text>
                                                    )}
                                                </Pressable>
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
                                        <Text style={styles.summary}>Mode: {OPTIMIZE_MODE_LABELS[currentOptimizeMode]}</Text>
                                        <Text style={styles.summary}>
                                            Weights: race {weights.raceValue}, epithet {weights.epithetValue}, fans {weights.fanWeight}, hint {weights.hintWeight}, consec -
                                            {weights.consecutiveRacePenalty}, summer -{weights.summerPenalty}, raceBonus {weights.raceBonusPct}%, raceCost {weights.raceCostPct}%
                                        </Text>
                                    </View>
                                </SearchableItem>
                            </>
                        )}
                    </View>
                </ScrollView>
            </SearchPageProvider>
            {dirty && (
                <View style={styles.recalcFab}>
                    <View style={styles.recalcFabLabel}>
                        <Text style={styles.recalcFabLabelText}>Apply Changes?</Text>
                    </View>
                    <GlassFab
                        onPress={() => {
                            triggerCalendarHighlight()
                            runPreview()
                        }}
                        disabled={previewLoading}
                        accessibilityLabel="Apply changes and recompute schedule"
                        icon={<RefreshCw size={22} color={colors.brand} />}
                    />
                </View>
            )}
        </View>
    )
}

export default SmartRaceSolverSettings
