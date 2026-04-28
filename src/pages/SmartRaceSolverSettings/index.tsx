import { useMemo, useContext, useState, useEffect, useRef } from "react"
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from "react-native"
import { Divider } from "react-native-paper"
import { previewSchedule, SchedulePreview, SolverConfigSnapshot } from "../../lib/solver/preview"
import { useTheme } from "../../context/ThemeContext"
import { BotStateContext, defaultSettings } from "../../context/BotStateContext"
import { SearchPageProvider } from "../../context/SearchPageContext"
import CustomCheckbox from "../../components/CustomCheckbox"
import CustomButton from "../../components/CustomButton"
import { Input } from "../../components/ui/input"
import { Trash2 } from "lucide-react-native"
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
    aptitudeThreshold: string
}

// Stringify the bundled JSON once at module load so we don't pay the serialisation cost on
// every debounced preview call.
const RACES_DATA_JSON = JSON.stringify(racesData)
const EPITHETS_DATA_JSON = JSON.stringify(epithetsData)

const APTITUDE_RANKS = ["S", "A", "B", "C", "D", "E", "F", "G"]
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const YEAR_LABELS: Array<{ name: string; startTurn: number }> = [
    { name: "Junior", startTurn: 1 },
    { name: "Classic", startTurn: 25 },
    { name: "Senior", startTurn: 49 },
]
const GRADE_COLORS: Record<string, string> = {
    G1: "#dc2626",
    G2: "#ea580c",
    G3: "#ca8a04",
    OP: "#2563eb",
    PRE_OP: "#3b82f6",
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
    aptitudeThreshold: "C",
}

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

    const allEpithets = useMemo<EpithetEntry[]>(
        () => Object.values(epithetsData) as EpithetEntry[],
        []
    )
    const allPresets = useMemo<CharacterPresetEntry[]>(
        () => Object.values(characterPresetsData) as CharacterPresetEntry[],
        []
    )
    const allRaces = useMemo<RaceEntry[]>(() => Object.values(racesData) as RaceEntry[], [])

    // -------- Local input state for decimals --------

    const [raceValueInput, setRaceValueInput] = useState(weights.raceValue.toString())
    const [epithetValueInput, setEpithetValueInput] = useState(weights.epithetValue.toString())
    const [hintWeightInput, setHintWeightInput] = useState(weights.hintWeight.toString())
    const [consecPenaltyInput, setConsecPenaltyInput] = useState(weights.consecutiveRacePenalty.toString())
    const [summerPenaltyInput, setSummerPenaltyInput] = useState(weights.summerPenalty.toString())

    useEffect(() => setRaceValueInput(weights.raceValue.toString()), [weights.raceValue])
    useEffect(() => setEpithetValueInput(weights.epithetValue.toString()), [weights.epithetValue])
    useEffect(() => setHintWeightInput(weights.hintWeight.toString()), [weights.hintWeight])
    useEffect(() => setConsecPenaltyInput(weights.consecutiveRacePenalty.toString()), [weights.consecutiveRacePenalty])
    useEffect(() => setSummerPenaltyInput(weights.summerPenalty.toString()), [weights.summerPenalty])

    const [presetSearch, setPresetSearch] = useState("")
    const [epithetSearch, setEpithetSearch] = useState("")
    const [lockTurnInput, setLockTurnInput] = useState("")
    const [lockRaceSearch, setLockRaceSearch] = useState("")

    // Schedule preview — computed by the Kotlin solver via the React Native bridge.
    const [preview, setPreview] = useState<SchedulePreview | null>(null)
    const [previewLoading, setPreviewLoading] = useState(false)
    const [previewError, setPreviewError] = useState<string | null>(null)

    // -------- Derived filters --------

    const filteredPresets = useMemo(() => {
        if (!presetSearch) return allPresets.slice(0, 30)
        const q = presetSearch.toLowerCase()
        return allPresets.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 30)
    }, [allPresets, presetSearch])

    const filteredEpithets = useMemo(() => {
        if (!epithetSearch) return allEpithets
        const q = epithetSearch.toLowerCase()
        return allEpithets.filter(
            (e) => e.name.toLowerCase().includes(q) || e.reward_text.toLowerCase().includes(q)
        )
    }, [allEpithets, epithetSearch])

    const lockTurnNumber = useMemo(() => {
        const n = parseInt(lockTurnInput, 10)
        return Number.isFinite(n) && n >= 1 && n <= 72 ? n : null
    }, [lockTurnInput])

    const racesForLockTurn = useMemo(() => {
        if (lockTurnNumber == null) return []
        const q = lockRaceSearch.toLowerCase()
        return allRaces
            .filter((r) => r.turnNumber === lockTurnNumber)
            .filter((r) => !q || r.name.toLowerCase().includes(q))
    }, [allRaces, lockTurnNumber, lockRaceSearch])

    // -------- Setters --------

    /**
     * Update a single racing setting, preserving the rest of the racing block.
     *
     * @param key The settings.racing key to update.
     * @param value The new value.
     */
    const updateRacingSetting = (key: string, value: any) => {
        setSettings({
            ...bsc.settings,
            racing: { ...bsc.settings.racing, [key]: value },
        })
    }

    const setAptitude = (slot: keyof AptitudeMap, rank: string) => {
        updateRacingSetting("smartRaceSolverAptitudes", JSON.stringify({ ...aptitudes, [slot]: rank }))
    }

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

    const toggleTargetEpithet = (name: string) => {
        const next = targetEpithets.includes(name)
            ? targetEpithets.filter((n) => n !== name)
            : [...targetEpithets, name]
        updateRacingSetting("smartRaceSolverTargetEpithets", JSON.stringify(next))
    }

    const toggleForcedEpithet = (name: string) => {
        const next = forcedEpithets.includes(name)
            ? forcedEpithets.filter((n) => n !== name)
            : [...forcedEpithets, name]
        updateRacingSetting("smartRaceSolverForcedEpithets", JSON.stringify(next))
    }

    const addManualLock = (turn: number, raceName: string) => {
        const next = { ...manualLocks, [String(turn)]: raceName }
        updateRacingSetting("smartRaceSolverManualLocks", JSON.stringify(next))
        setLockTurnInput("")
        setLockRaceSearch("")
    }

    const removeManualLock = (turn: string) => {
        const next = { ...manualLocks }
        delete next[turn]
        updateRacingSetting("smartRaceSolverManualLocks", JSON.stringify(next))
    }

    const updateWeight = (key: keyof WeightsMap, value: number | string) => {
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
        racesDataJson: RACES_DATA_JSON,
        epithetsDataJson: EPITHETS_DATA_JSON,
    })

    useEffect(() => {
        if (!enableSmartRaceSolver) {
            setPreview(null)
            setPreviewError(null)
            return
        }
        const handle = setTimeout(async () => {
            setPreviewLoading(true)
            try {
                const snapshot = buildSnapshot()
                const result = await previewSchedule(snapshot)
                setPreview(result)
                setPreviewError(result.error ?? null)
            } catch (e: any) {
                setPreview(null)
                setPreviewError(String(e?.message ?? e))
            } finally {
                setPreviewLoading(false)
            }
        }, 500)
        return () => clearTimeout(handle)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        enableSmartRaceSolver,
        smartRaceSolverCharacterPreset,
        smartRaceSolverAptitudes,
        smartRaceSolverTargetEpithets,
        smartRaceSolverForcedEpithets,
        smartRaceSolverManualLocks,
        smartRaceSolverWeights,
    ])

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
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                },
                chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
                chipText: { color: colors.foreground, fontSize: 12 },
                chipTextActive: { color: colors.background, fontSize: 12, fontWeight: "600" },
                chipReward: { color: colors.mutedForeground, fontSize: 10, marginTop: 2, maxWidth: 220 },
                chipRewardActive: { color: colors.background, fontSize: 10, marginTop: 2, opacity: 0.85, maxWidth: 220 },
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
                    marginVertical: 6,
                    padding: 8,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 6,
                    backgroundColor: colors.background,
                },
                yearCardTitle: { fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 4 },
                calendarHeaderRow: { flexDirection: "row", paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
                calendarHeaderLabel: { width: 36, fontSize: 11, color: colors.mutedForeground, textAlign: "center" },
                calendarHeaderPhase: { flex: 1, fontSize: 11, color: colors.mutedForeground, textAlign: "center" },
                calendarRow: { flexDirection: "row", alignItems: "center", paddingVertical: 3 },
                calendarMonthLabel: { width: 36, fontSize: 11, color: colors.foreground, textAlign: "center" },
                calendarCell: {
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: 4,
                    marginHorizontal: 2,
                    borderRadius: 4,
                    backgroundColor: colors.card,
                    minHeight: 24,
                },
                calendarCellRace: {
                    backgroundColor: colors.card,
                },
                calendarDot: { width: 8, height: 8, borderRadius: 4, marginRight: 4 },
                calendarGradeLabel: { fontSize: 10, color: colors.foreground, fontWeight: "600" },
                calendarCellEmpty: { fontSize: 10, color: colors.mutedForeground },
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
                        <TouchableOpacity
                            key={rank}
                            style={[styles.aptBtn, active && styles.aptBtnActive]}
                            onPress={() => setAptitude(slot, rank)}
                        >
                            <Text style={active ? styles.aptBtnTextActive : styles.aptBtnText}>{rank}</Text>
                        </TouchableOpacity>
                    )
                })}
            </View>
        </View>
    )

    const renderEpithetChip = (epithet: EpithetEntry, selected: boolean, onPress: () => void) => (
        <TouchableOpacity
            key={epithet.name}
            style={[styles.chip, selected && styles.chipActive]}
            onPress={onPress}
        >
            <Text style={selected ? styles.chipTextActive : styles.chipText}>{epithet.name}</Text>
            {epithet.reward_text ? (
                <Text style={selected ? styles.chipRewardActive : styles.chipReward} numberOfLines={2}>
                    {epithet.reward_text}
                </Text>
            ) : null}
        </TouchableOpacity>
    )

    const renderCalendarCell = (turn: number) => {
        const entry = preview?.decisions[String(turn)]
        if (!entry || entry.type !== "Race") {
            return (
                <View key={turn} style={styles.calendarCell}>
                    <Text style={styles.calendarCellEmpty}>{entry?.type === "Rest" ? "Rest" : "—"}</Text>
                </View>
            )
        }
        const color = GRADE_COLORS[entry.grade ?? ""] ?? colors.primary
        const onPress = () => {
            Alert.alert(`Turn ${turn}`, `${entry.name ?? entry.raceKey ?? "Race"}\n${entry.grade ?? ""}`)
        }
        return (
            <TouchableOpacity key={turn} style={[styles.calendarCell, styles.calendarCellRace]} onPress={onPress}>
                <View style={[styles.calendarDot, { backgroundColor: color }]} />
                <Text style={styles.calendarGradeLabel}>{(entry.grade ?? "").replace("PRE_OP", "Pre")}</Text>
            </TouchableOpacity>
        )
    }

    const renderYearCard = (year: { name: string; startTurn: number }) => (
        <View key={year.name} style={styles.yearCard}>
            <Text style={styles.yearCardTitle}>{year.name} Year</Text>
            <View style={styles.calendarHeaderRow}>
                <Text style={styles.calendarHeaderLabel}>Mo</Text>
                <Text style={styles.calendarHeaderPhase}>1st Half</Text>
                <Text style={styles.calendarHeaderPhase}>2nd Half</Text>
            </View>
            {MONTH_LABELS.map((label, monthIdx) => {
                const firstTurn = year.startTurn + monthIdx * 2
                const secondTurn = firstTurn + 1
                return (
                    <View key={label} style={styles.calendarRow}>
                        <Text style={styles.calendarMonthLabel}>{label}</Text>
                        {renderCalendarCell(firstTurn)}
                        {renderCalendarCell(secondTurn)}
                    </View>
                )
            })}
        </View>
    )

    // -------- Render --------

    const sectionsDisabledStyle = enableSmartRaceSolver ? undefined : ({ opacity: 0.4 } as const)

    return (
        <View style={styles.root}>
            <PageHeader title="Smart Race Solver" />

            <SearchPageProvider page="SmartRaceSolverSettings" scrollViewRef={scrollViewRef}>
                <ScrollView
                    ref={scrollViewRef}
                    nestedScrollEnabled={true}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ flexGrow: 1 }}
                >
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
                                description="Opt-in. Replaces the default race-pick logic for extra races when active. Conditions to actually run match the legacy Smart Racing Plan: scenario year ≠ Junior, Farming Fans on, Force Racing off."
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
                                <Text style={styles.description}>
                                    Selected: {smartRaceSolverCharacterPreset || "(none)"}
                                </Text>
                                <Input
                                    style={styles.input}
                                    value={presetSearch}
                                    onChangeText={setPresetSearch}
                                    placeholder="Search 125 characters…"
                                />
                                <ScrollView
                                    style={styles.presetList}
                                    nestedScrollEnabled={true}
                                    keyboardShouldPersistTaps="handled"
                                >
                                    {filteredPresets.map((p) => {
                                        const active = smartRaceSolverCharacterPreset === p.name
                                        return (
                                            <TouchableOpacity
                                                key={p.name}
                                                style={[styles.presetItem, active && styles.presetItemActive]}
                                                onPress={() => applyPreset(p)}
                                            >
                                                <Text style={active ? styles.presetNameActive : styles.presetName}>{p.name}</Text>
                                                <Text style={styles.presetAptitudes}>
                                                    Sprint {p.distanceAptitudes.Sprint} · Mile {p.distanceAptitudes.Mile} · Med {p.distanceAptitudes.Medium} · Long {p.distanceAptitudes.Long} · Turf {p.surfaceAptitudes.Turf} · Dirt {p.surfaceAptitudes.Dirt}
                                                </Text>
                                            </TouchableOpacity>
                                        )
                                    })}
                                    {presetSearch && filteredPresets.length === 0 && (
                                        <Text style={styles.inputDescription}>No matches.</Text>
                                    )}
                                </ScrollView>
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
                                <View style={styles.aptButtons}>
                                    {APTITUDE_RANKS.map((rank) => {
                                        const active = weights.aptitudeThreshold === rank
                                        return (
                                            <TouchableOpacity
                                                key={rank}
                                                style={[styles.aptBtn, active && styles.aptBtnActive]}
                                                onPress={() => updateWeight("aptitudeThreshold", rank)}
                                            >
                                                <Text style={active ? styles.aptBtnTextActive : styles.aptBtnText}>{rank}</Text>
                                            </TouchableOpacity>
                                        )
                                    })}
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
                                <Text style={styles.sectionTitle}>Target Epithets ({targetEpithets.length} selected)</Text>
                                <Input
                                    style={styles.input}
                                    value={epithetSearch}
                                    onChangeText={setEpithetSearch}
                                    placeholder="Search 36 epithets…"
                                />
                                <View style={styles.row}>
                                    {filteredEpithets.map((ep) =>
                                        renderEpithetChip(ep, targetEpithets.includes(ep.name), () => toggleTargetEpithet(ep.name))
                                    )}
                                </View>
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
                                    Caution: forcing too many can over-constrain the schedule.
                                </Text>
                                <View style={styles.row}>
                                    {allEpithets.map((ep) =>
                                        renderEpithetChip(ep, forcedEpithets.includes(ep.name), () => toggleForcedEpithet(ep.name))
                                    )}
                                </View>
                            </View>
                        </SearchableItem>

                        {/* Manual locks */}
                        <SearchableItem
                            id="smart-solver-manual-locks"
                            condition={enableSmartRaceSolver}
                            parentId="enable-smart-race-solver"
                            title="Manual Turn Locks"
                            description="Force a specific race choice on a specific turn. Overrides the solver's pick for that turn."
                            style={styles.section}
                        >
                            <View style={sectionsDisabledStyle}>
                                <Text style={styles.sectionTitle}>Manual Turn Locks</Text>
                                <Text style={styles.description}>Add a lock by entering a turn number (1-72) then picking a race.</Text>
                                <Text style={styles.inputLabel}>Turn Number</Text>
                                <Input
                                    style={styles.input}
                                    value={lockTurnInput}
                                    onChangeText={setLockTurnInput}
                                    keyboardType="numeric"
                                    placeholder="e.g. 49"
                                />
                                {lockTurnNumber != null && (
                                    <>
                                        <Text style={styles.inputLabel}>Pick a race available on turn {lockTurnNumber}</Text>
                                        <Input
                                            style={styles.input}
                                            value={lockRaceSearch}
                                            onChangeText={setLockRaceSearch}
                                            placeholder="Search races…"
                                        />
                                        {racesForLockTurn.length === 0 && (
                                            <Text style={styles.inputDescription}>No races on this turn (or no match).</Text>
                                        )}
                                        {racesForLockTurn.slice(0, 12).map((r) => (
                                            <TouchableOpacity
                                                key={`${r.name}-${r.date}`}
                                                style={styles.presetItem}
                                                onPress={() => addManualLock(lockTurnNumber, r.name)}
                                            >
                                                <Text style={styles.presetName}>{r.name}</Text>
                                                <Text style={styles.presetAptitudes}>
                                                    {r.grade} · {r.terrain} · {r.distanceType} {r.distanceMeters}m · {r.fans.toLocaleString()} fans
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </>
                                )}
                                <Divider style={{ marginVertical: 8 }} />
                                <Text style={styles.sectionTitle}>Active Locks ({Object.keys(manualLocks).length})</Text>
                                {Object.keys(manualLocks).length === 0 ? (
                                    <Text style={styles.inputDescription}>None.</Text>
                                ) : (
                                    Object.entries(manualLocks)
                                        .sort(([a], [b]) => parseInt(a) - parseInt(b))
                                        .map(([turn, raceName]) => (
                                            <View key={turn} style={styles.lockRow}>
                                                <Text style={styles.lockTurn}>T{turn}</Text>
                                                <Text style={styles.lockRace}>{raceName}</Text>
                                                <CustomButton
                                                    variant="destructive"
                                                    size="icon"
                                                    icon={<Trash2 size={16} color={colors.background} />}
                                                    onPress={() => removeManualLock(turn)}
                                                >
                                                    {""}
                                                </CustomButton>
                                            </View>
                                        ))
                                )}
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

                                <Text style={styles.inputLabel}>Race Value Weight</Text>
                                <Input
                                    style={styles.input}
                                    value={raceValueInput}
                                    onChangeText={(t) => /^-?\d*\.?\d*$/.test(t) && setRaceValueInput(t)}
                                    onBlur={() => updateWeight("raceValue", parseFloat(raceValueInput) || 0)}
                                    keyboardType="decimal-pad"
                                    placeholder="1.0"
                                />
                                <Text style={styles.inputDescription}>Multiplier applied to per-race base score (fans + grade + SP).</Text>

                                <Text style={styles.inputLabel}>Epithet Value Weight</Text>
                                <Input
                                    style={styles.input}
                                    value={epithetValueInput}
                                    onChangeText={(t) => /^-?\d*\.?\d*$/.test(t) && setEpithetValueInput(t)}
                                    onBlur={() => updateWeight("epithetValue", parseFloat(epithetValueInput) || 0)}
                                    keyboardType="decimal-pad"
                                    placeholder="1.0"
                                />
                                <Text style={styles.inputDescription}>Multiplier applied to epithet completion bonuses. Raise this to make epithets dominate fan-driven race value.</Text>

                                <Text style={styles.inputLabel}>Hint Reward Weight</Text>
                                <Input
                                    style={styles.input}
                                    value={hintWeightInput}
                                    onChangeText={(t) => /^-?\d*\.?\d*$/.test(t) && setHintWeightInput(t)}
                                    onBlur={() => updateWeight("hintWeight", parseFloat(hintWeightInput) || 0)}
                                    keyboardType="decimal-pad"
                                    placeholder="8.0"
                                />
                                <Text style={styles.inputDescription}>Score awarded for skill-hint epithets (e.g. Legendary). Higher = bot pursues hint epithets harder.</Text>

                                <Text style={styles.inputLabel}>Consecutive Race Penalty</Text>
                                <Input
                                    style={styles.input}
                                    value={consecPenaltyInput}
                                    onChangeText={(t) => /^-?\d*\.?\d*$/.test(t) && setConsecPenaltyInput(t)}
                                    onBlur={() => updateWeight("consecutiveRacePenalty", parseFloat(consecPenaltyInput) || 0)}
                                    keyboardType="decimal-pad"
                                    placeholder="3.0"
                                />
                                <Text style={styles.inputDescription}>Penalty applied to the 3rd (and beyond) race in a row to model conditioning loss.</Text>

                                <Text style={styles.inputLabel}>Summer Block Penalty</Text>
                                <Input
                                    style={styles.input}
                                    value={summerPenaltyInput}
                                    onChangeText={(t) => /^-?\d*\.?\d*$/.test(t) && setSummerPenaltyInput(t)}
                                    onBlur={() => updateWeight("summerPenalty", parseFloat(summerPenaltyInput) || 0)}
                                    keyboardType="decimal-pad"
                                    placeholder="5.0"
                                />
                                <Text style={styles.inputDescription}>Penalty for racing during summer training blocks (turns 12-14, 36-39, 60-63).</Text>
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
                                    Compact preview of the schedule the solver would start with. Tap a colored cell for the full race name. Does not reflect mid-run dynamic re-planning.
                                </Text>
                                {previewLoading && (
                                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                                        <ActivityIndicator size="small" color={colors.primary} />
                                        <Text style={[styles.previewStatus, { marginLeft: 6 }]}>Computing preview…</Text>
                                    </View>
                                )}
                                {previewError && <Text style={styles.previewError}>Preview error: {previewError}</Text>}
                                {!previewLoading && !previewError && preview && (
                                    <Text style={styles.previewStatus}>
                                        Projected score {preview.totalScore.toFixed(1)} · {preview.projectedEpithets.length} epithet{preview.projectedEpithets.length === 1 ? "" : "s"} reachable
                                    </Text>
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
                                        return (
                                            <View key={`sel-${name}`} style={styles.lockRow}>
                                                <Text style={[styles.lockRace, { fontWeight: "600" }]}>
                                                    {name}
                                                    {isForced ? "  ★" : ""}
                                                </Text>
                                                <Text style={[styles.lockRace, { color: colors.mutedForeground, flex: 2 }]}>{reward}</Text>
                                            </View>
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
                                    const isSelected = targetEpithets.includes(name) || forcedEpithets.includes(name)
                                    return (
                                        <View key={`proj-${name}`} style={styles.lockRow}>
                                            <Text style={[styles.lockRace, { fontWeight: "600", color: isSelected ? colors.primary : colors.foreground }]}>
                                                {name}
                                                {isSelected ? "  ✓" : ""}
                                            </Text>
                                            <Text style={[styles.lockRace, { color: colors.mutedForeground, flex: 2 }]}>{reward}</Text>
                                        </View>
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
                                <Text style={styles.summary}>Targets ({targetEpithets.length}): {targetEpithets.join(", ") || "(none)"}</Text>
                                <Text style={styles.summary}>Forced ({forcedEpithets.length}): {forcedEpithets.join(", ") || "(none)"}</Text>
                                <Text style={styles.summary}>Locks ({Object.keys(manualLocks).length}): {Object.keys(manualLocks).length === 0 ? "(none)" : Object.entries(manualLocks).map(([t, r]) => `T${t}→${r}`).join(" · ")}</Text>
                                <Text style={styles.summary}>Weights: race {weights.raceValue}, epithet {weights.epithetValue}, hint {weights.hintWeight}, consec −{weights.consecutiveRacePenalty}, summer −{weights.summerPenalty}</Text>
                            </View>
                        </SearchableItem>
                    </View>
                </ScrollView>
            </SearchPageProvider>
        </View>
    )
}

export default SmartRaceSolverSettings
