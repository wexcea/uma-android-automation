import React, { useMemo } from "react"
import { Pressable, StyleSheet, View } from "react-native"
import { useTheme } from "../../context/ThemeContext"
import { DateYear } from "../../lib/training/scoring"
import { SPACING } from "../../lib/spacing"
import { RADII } from "../../lib/radii"
import { TYPE } from "../../lib/type"
import { Text } from "../ui/text"
import { Stepper } from "../ui/stepper"
import { Switch } from "../ui/switch"
import { Mood, SandboxScenario, ScenarioAction } from "./scenarioState"

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
}

/**
 * Inline segmented selector used by the globals strip for Mood and Year. Stateless wrapper around a row of `Pressable` pills with an
 * active style. Kept local to this file because no other sandbox component needs it and the existing `TabStrip` primitive is keyed by
 * string and built around horizontal text labels for full-width navigation rather than compact 2-letter chips.
 *
 * @param props See `SegmentedRowProps`.
 * @returns A row of pill-shaped buttons.
 */
function SegmentedRow<T extends string>({ options, selected, onSelect }: SegmentedRowProps<T>): React.ReactElement {
    const { colors } = useTheme()
    const styles = useMemo(
        () =>
            StyleSheet.create({
                root: {
                    flexDirection: "row",
                    backgroundColor: colors.surfaceRaised,
                    borderRadius: RADII.lg,
                    borderWidth: 1,
                    borderColor: colors.borderStrong,
                    padding: 2,
                    gap: 2,
                },
                pill: {
                    paddingHorizontal: SPACING.sm,
                    paddingVertical: 4,
                    borderRadius: RADII.md,
                },
                pillActive: {
                    backgroundColor: colors.brand,
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
    return (
        <View style={styles.root}>
            {options.map((opt) => {
                const active = opt.value === selected
                return (
                    <Pressable key={String(opt.value)} onPress={() => onSelect(opt.value)} style={[styles.pill, active && styles.pillActive]}>
                        <Text style={[styles.label, active && styles.labelActive]}>{opt.label}</Text>
                    </Pressable>
                )
            })}
        </View>
    )
}

/** Props for `GlobalsStrip`. */
export interface GlobalsStripProps {
    /** Current sandbox scenario state. */
    scenario: SandboxScenario
    /** Reducer dispatch used to mutate the scenario. */
    dispatch: React.Dispatch<ScenarioAction>
}

/**
 * Horizontal strip of run-wide controls: Energy stepper, Mood segmented selector, Year segmented selector, and Charm switch. Sits
 * directly under the stat table and feeds into the per-training scoring config consumed by `scenarioToScoring`.
 *
 * @param props See `GlobalsStripProps`.
 * @returns A flex row with the four global controls.
 */
export function GlobalsStrip({ scenario, dispatch }: GlobalsStripProps): React.ReactElement {
    const { colors } = useTheme()
    const styles = useMemo(
        () =>
            StyleSheet.create({
                root: {
                    flexDirection: "row",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: SPACING.md,
                    paddingVertical: SPACING.sm,
                },
                group: {
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                },
                label: {
                    ...TYPE.caption,
                    color: colors.textMuted,
                    fontWeight: "600",
                },
            }),
        [colors]
    )
    return (
        <View style={styles.root}>
            <View style={styles.group}>
                <Text style={styles.label}>Energy</Text>
                <Stepper value={scenario.energy} onChange={(v) => dispatch({ type: "set-energy", energy: v })} min={0} max={100} step={5} />
            </View>
            <View style={styles.group}>
                <Text style={styles.label}>Mood</Text>
                <SegmentedRow options={MOOD_OPTIONS} selected={scenario.mood} onSelect={(v) => dispatch({ type: "set-mood", mood: v })} />
            </View>
            <View style={styles.group}>
                <SegmentedRow options={YEAR_OPTIONS} selected={scenario.year} onSelect={(v) => dispatch({ type: "set-year", year: v })} />
            </View>
            <View style={styles.group}>
                <Text style={styles.label}>Charm</Text>
                <Switch checked={scenario.charm} onCheckedChange={(v) => dispatch({ type: "set-charm", charm: v })} />
            </View>
        </View>
    )
}

export default GlobalsStrip
