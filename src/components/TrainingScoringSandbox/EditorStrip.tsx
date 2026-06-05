import React, { useContext, useMemo } from "react"
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native"
import { useTheme } from "../../context/ThemeContext"
import { GeneralMiscContext } from "../../context/BotStateContext"
import { DateYear, StatName } from "../../lib/training/scoring"
import { SPACING } from "../../lib/spacing"
import { RADII } from "../../lib/radii"
import { TYPE } from "../../lib/type"
import { Text } from "../ui/text"
import { Stepper } from "../ui/stepper"
import { Switch } from "../ui/switch"
import { NARROW_BREAKPOINT_DP } from "./layout"
import { NumberField } from "./NumberField"
import { Mood, SandboxScenario, ScenarioAction } from "./scenarioState"

const STAT_LABELS: Record<StatName, string> = {
    [StatName.SPEED]: "Speed",
    [StatName.STAMINA]: "Stamina",
    [StatName.POWER]: "Power",
    [StatName.GUTS]: "Guts",
    [StatName.WIT]: "Wit",
}

const LEVELS = [1, 2, 3, 4, 5] as const

const MOOD_OPTIONS: { value: Mood; label: string }[] = [
    { value: "AWFUL", label: "Aw" },
    { value: "BAD", label: "Bd" },
    { value: "NORMAL", label: "Nm" },
    { value: "GOOD", label: "Gd" },
    { value: "GREAT", label: "Gt" },
]

const YEAR_OPTIONS: { value: DateYear; label: string }[] = [
    { value: DateYear.JUNIOR, label: "Y1" },
    { value: DateYear.CLASSIC, label: "Y2" },
    { value: DateYear.SENIOR, label: "Y3" },
]

interface SegmentedRowOption<T> {
    value: T
    label: string
}

interface SegmentedRowProps<T> {
    options: SegmentedRowOption<T>[]
    selected: T
    onSelect: (value: T) => void
    /** When set, split options into rows of at most this many pills. Used to force Mood into a 3+2 layout regardless of column width. */
    wrapAfter?: number
    /** Visual style. `"segmented"` (default) renders pills inside a shared bordered container (iOS-style segmented control). `"chips"` renders each pill as a standalone bordered chip with its own background and a larger gap between siblings. */
    variant?: "segmented" | "chips"
}

/**
 * Compact inline segmented selector used by the Run column for Mood and Year. Stateless wrapper around a row of `Pressable` pills with an active style. Kept local to the
 * sandbox because the existing `TabStrip` primitive is geared toward full-width navigation rather than short 2-letter chips.
 *
 * @param props See `SegmentedRowProps`.
 * @returns A row of pill-shaped buttons.
 */
function SegmentedRow<T extends string>({ options, selected, onSelect, wrapAfter, variant = "segmented" }: SegmentedRowProps<T>): React.ReactElement {
    const { colors } = useTheme()
    const isChips = variant === "chips"
    const styles = useMemo(
        () =>
            StyleSheet.create({
                segmentedRoot: {
                    flexDirection: "column",
                    backgroundColor: colors.surfaceRaised,
                    borderRadius: RADII.lg,
                    borderWidth: 1,
                    borderColor: colors.borderStrong,
                    padding: 2,
                    gap: 2,
                },
                chipsRoot: {
                    flexDirection: "column",
                    gap: 6,
                },
                pillRow: {
                    flexDirection: "row",
                    gap: 2,
                },
                chipRow: {
                    flexDirection: "row",
                    gap: 6,
                },
                segmentedPill: {
                    paddingHorizontal: SPACING.sm,
                    paddingVertical: 4,
                    borderRadius: RADII.md,
                },
                segmentedPillActive: {
                    backgroundColor: colors.brand,
                },
                chip: {
                    paddingHorizontal: SPACING.md,
                    paddingVertical: 5,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: colors.borderStrong,
                    backgroundColor: colors.surfaceRaised,
                },
                chipActive: {
                    backgroundColor: colors.brand,
                    borderColor: colors.brand,
                },
                label: {
                    ...TYPE.caption,
                    color: colors.text,
                    fontWeight: "600",
                },
                labelActive: {
                    color: colors.onBrand,
                },
            }),
        [colors]
    )
    const chunks: SegmentedRowOption<T>[][] = []
    if (wrapAfter && wrapAfter > 0) {
        for (let i = 0; i < options.length; i += wrapAfter) chunks.push(options.slice(i, i + wrapAfter))
    } else {
        chunks.push(options)
    }
    const rootStyle = isChips ? styles.chipsRoot : styles.segmentedRoot
    const rowStyle = isChips ? styles.chipRow : styles.pillRow
    return (
        <View style={rootStyle}>
            {chunks.map((chunk, idx) => (
                <View key={idx} style={rowStyle}>
                    {chunk.map((opt) => {
                        const active = opt.value === selected
                        const pillStyle = isChips ? [styles.chip, active && styles.chipActive] : [styles.segmentedPill, active && styles.segmentedPillActive]
                        return (
                            <Pressable key={String(opt.value)} onPress={() => onSelect(opt.value)} style={pillStyle}>
                                <Text style={[styles.label, active && styles.labelActive]}>{opt.label}</Text>
                            </Pressable>
                        )
                    })}
                </View>
            ))}
        </View>
    )
}

/** Props for `EditorStrip`. */
export interface EditorStripProps {
    /** Current sandbox scenario state. */
    scenario: SandboxScenario
    /** Reducer dispatch used to mutate the scenario. */
    dispatch: React.Dispatch<ScenarioAction>
}

/**
 * Three-column grid of controls rendered below the training circle row. The Run column carries scenario-wide state (energy, mood, year, charm). The Training column carries
 * per-training state for the currently selected training (level, rainbow). The Friend bars column carries the three colored friendship-bar tier counters with a cumulative
 * cap of 5 across all three colors.
 *
 * @param props See `EditorStripProps`.
 * @returns A three-column grid (Run / Training / Friend bars).
 */
export function EditorStrip({ scenario, dispatch }: EditorStripProps): React.ReactElement {
    const { colors } = useTheme()
    const { width } = useWindowDimensions()
    const isNarrow = width < NARROW_BREAKPOINT_DP
    const { general } = useContext(GeneralMiscContext)
    const isTrackblazer = general.scenario === "Trackblazer"
    const selected = scenario.selectedTraining
    const t = scenario.trainings[selected]
    // Friend bars can total at most 5 across blue + green + orange. Each color's max is what's left after the other two.
    const maxBlue = 5 - t.friendBars.green - t.friendBars.orange
    const maxGreen = 5 - t.friendBars.blue - t.friendBars.orange
    const maxOrange = 5 - t.friendBars.blue - t.friendBars.green

    const styles = useMemo(
        () =>
            StyleSheet.create({
                grid: {
                    flexDirection: isNarrow ? "column" : "row",
                    gap: SPACING.lg,
                    paddingVertical: SPACING.xs,
                },
                column: {
                    flex: isNarrow ? undefined : 1,
                    gap: SPACING.sm,
                },
                columnHeader: {
                    ...TYPE.caption,
                    color: colors.textMuted,
                    fontWeight: "700",
                    textTransform: "uppercase",
                    letterSpacing: 0.6,
                    fontSize: 10,
                    marginBottom: SPACING.xs,
                },
                gridRow: {
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: SPACING.sm,
                },
                label: {
                    ...TYPE.caption,
                    color: colors.textMuted,
                    fontWeight: "600",
                },
                disabledRow: {
                    opacity: 0.45,
                },
                levelStrip: {
                    flexDirection: "row",
                    backgroundColor: colors.surfaceRaised,
                    borderRadius: RADII.lg,
                    borderWidth: 1,
                    borderColor: colors.borderStrong,
                    padding: 2,
                    gap: 2,
                },
                levelPill: {
                    paddingHorizontal: SPACING.sm,
                    paddingVertical: 4,
                    borderRadius: RADII.md,
                    minWidth: 22,
                    alignItems: "center",
                },
                levelPillActive: {
                    backgroundColor: colors.brand,
                },
                levelText: {
                    ...TYPE.caption,
                    color: colors.text,
                    fontWeight: "600",
                },
                levelTextActive: {
                    color: colors.onBrand,
                },
            }),
        [colors, isNarrow]
    )

    return (
        <View>
            <View style={styles.grid}>
                <View style={styles.column}>
                    <Text style={styles.columnHeader}>Run</Text>
                    <View style={styles.gridRow}>
                        <Text style={styles.label}>Energy</Text>
                        <NumberField value={scenario.energy} onChange={(v) => dispatch({ type: "set-energy", energy: v })} min={0} max={100} />
                    </View>
                    <View style={styles.gridRow}>
                        <Text style={styles.label}>Mood</Text>
                        <SegmentedRow options={MOOD_OPTIONS} selected={scenario.mood} onSelect={(v) => dispatch({ type: "set-mood", mood: v })} wrapAfter={3} variant="chips" />
                    </View>
                    <View style={styles.gridRow}>
                        <Text style={styles.label}>Year</Text>
                        <SegmentedRow options={YEAR_OPTIONS} selected={scenario.year} onSelect={(v) => dispatch({ type: "set-year", year: v })} />
                    </View>
                    <View style={[styles.gridRow, !isTrackblazer && styles.disabledRow]} pointerEvents={isTrackblazer ? "auto" : "none"}>
                        <Text style={styles.label}>Charm{isTrackblazer ? "" : " (Trackblazer)"}</Text>
                        <Switch checked={scenario.charm} onCheckedChange={(v) => dispatch({ type: "set-charm", charm: v })} />
                    </View>
                </View>
                <View style={styles.column}>
                    <Text style={styles.columnHeader}>Training ({STAT_LABELS[selected]})</Text>
                    <View style={styles.gridRow}>
                        <Text style={styles.label}>Level</Text>
                        <View style={styles.levelStrip}>
                            {LEVELS.map((lv) => {
                                const active = lv === t.trainingLevel
                                return (
                                    <Pressable
                                        key={lv}
                                        onPress={() => dispatch({ type: "set-training-level", training: selected, value: lv })}
                                        style={[styles.levelPill, active && styles.levelPillActive]}
                                    >
                                        <Text style={[styles.levelText, active && styles.levelTextActive]}>{lv}</Text>
                                    </Pressable>
                                )
                            })}
                        </View>
                    </View>
                    <View style={styles.gridRow}>
                        <Text style={styles.label}>Rainbow</Text>
                        <Switch checked={t.rainbow} onCheckedChange={(v) => dispatch({ type: "set-rainbow", training: selected, rainbow: v })} />
                    </View>
                </View>
                <View style={styles.column}>
                    <Text style={styles.columnHeader}>Friendship</Text>
                    <View style={styles.gridRow}>
                        <Text style={styles.label}>Blue</Text>
                        <Stepper
                            value={t.friendBars.blue}
                            onChange={(v) => dispatch({ type: "set-friend-bar", training: selected, tier: "blue", count: v })}
                            min={0}
                            max={maxBlue}
                            step={1}
                            accent="blue"
                        />
                    </View>
                    <View style={styles.gridRow}>
                        <Text style={styles.label}>Green</Text>
                        <Stepper
                            value={t.friendBars.green}
                            onChange={(v) => dispatch({ type: "set-friend-bar", training: selected, tier: "green", count: v })}
                            min={0}
                            max={maxGreen}
                            step={1}
                            accent="green"
                        />
                    </View>
                    <View style={styles.gridRow}>
                        <Text style={styles.label}>Orange</Text>
                        <Stepper
                            value={t.friendBars.orange}
                            onChange={(v) => dispatch({ type: "set-friend-bar", training: selected, tier: "orange", count: v })}
                            min={0}
                            max={maxOrange}
                            step={1}
                            accent="orange"
                        />
                    </View>
                </View>
            </View>
        </View>
    )
}

export default EditorStrip
