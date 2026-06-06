import React, { useMemo } from "react"
import { StyleSheet, useWindowDimensions, View } from "react-native"
import { useTheme } from "../../context/ThemeContext"
import { ALL_STAT_NAMES, StatName } from "../../lib/training/scoring"
import { SPACING } from "../../lib/spacing"
import { TYPE } from "../../lib/type"
import { Text } from "../ui/text"
import { NARROW_BREAKPOINT_DP } from "./layout"
import { NumberField } from "./NumberField"
import { SandboxScenario, ScenarioAction } from "./scenarioState"

const STAT_LABELS: Record<StatName, string> = {
    [StatName.SPEED]: "Speed",
    [StatName.STAMINA]: "Stamina",
    [StatName.POWER]: "Power",
    [StatName.GUTS]: "Guts",
    [StatName.WIT]: "Wit",
}

const STAT_LABELS_SHORT: Record<StatName, string> = {
    [StatName.SPEED]: "Spd",
    [StatName.STAMINA]: "Sta",
    [StatName.POWER]: "Pwr",
    [StatName.GUTS]: "Gut",
    [StatName.WIT]: "Wit",
}

const LABEL_COL_WIDTH_WIDE = 140
const LABEL_COL_WIDTH_NARROW = 70

/** Props for `StatTable`. */
export interface StatTableProps {
    /** Current sandbox scenario state. */
    scenario: SandboxScenario
    /** Reducer dispatch used to mutate the scenario. */
    dispatch: React.Dispatch<ScenarioAction>
}

/**
 * Two-row labeled grid showing stat data for all 5 stats side by side. The first row is the per-training stat gain for the currently selected training (a +N stepper). The
 * second row is the trainee's cumulative stat total (0-1200). A header row above carries the stat name column titles, and the leftmost column carries the row labels
 * ("Stat Gains", "Total Current Stats"). The grid uses a fixed-width label column and equal flex-1 stat columns so the steppers line up vertically across rows.
 *
 * @param props See `StatTableProps`.
 * @returns A 3-row grid (header + 2 data rows) with the leftmost column reserved for row labels.
 */
export function StatTable({ scenario, dispatch }: StatTableProps): React.ReactElement {
    const { colors } = useTheme()
    const { width } = useWindowDimensions()
    const isNarrow = width < NARROW_BREAKPOINT_DP
    const selected = scenario.selectedTraining
    const current = scenario.trainings[selected]
    const statLabels = isNarrow ? STAT_LABELS_SHORT : STAT_LABELS
    const labelColWidth = isNarrow ? LABEL_COL_WIDTH_NARROW : LABEL_COL_WIDTH_WIDE
    const numberFieldWidth = isNarrow ? 40 : 64
    const rowGap = isNarrow ? SPACING.xs : SPACING.sm

    const styles = useMemo(
        () =>
            StyleSheet.create({
                root: {
                    paddingVertical: SPACING.sm,
                    gap: SPACING.sm,
                },
                row: {
                    flexDirection: "row",
                    alignItems: "center",
                    gap: rowGap,
                },
                labelCell: {
                    width: labelColWidth,
                },
                labelText: {
                    ...TYPE.caption,
                    color: colors.textMuted,
                    fontWeight: "600",
                    fontSize: isNarrow ? 11 : 12,
                },
                statCell: {
                    flex: 1,
                    alignItems: "center",
                },
                statName: {
                    ...TYPE.caption,
                    color: colors.textMuted,
                    fontWeight: "600",
                    fontSize: isNarrow ? 11 : 12,
                },
            }),
        [colors, labelColWidth, rowGap, isNarrow]
    )

    return (
        <View style={styles.root}>
            <View style={styles.row}>
                <View style={styles.labelCell} />
                {ALL_STAT_NAMES.map((stat) => (
                    <View key={stat} style={styles.statCell}>
                        <Text style={styles.statName}>{statLabels[stat]}</Text>
                    </View>
                ))}
            </View>
            <View style={styles.row}>
                <View style={styles.labelCell}>
                    <Text style={styles.labelText}>Total Stat Gains</Text>
                </View>
                {ALL_STAT_NAMES.map((stat) => (
                    <View key={stat} style={styles.statCell}>
                        <NumberField value={current.statGains[stat] ?? 0} onChange={(v) => dispatch({ type: "set-stat-gain", training: selected, stat, value: v })} min={0} width={numberFieldWidth} />
                    </View>
                ))}
            </View>
            <View style={styles.row}>
                <View style={styles.labelCell}>
                    <Text style={styles.labelText}>Total Current Stats</Text>
                </View>
                {ALL_STAT_NAMES.map((stat) => (
                    <View key={stat} style={styles.statCell}>
                        <NumberField value={scenario.traineeTotals[stat] ?? 0} onChange={(v) => dispatch({ type: "set-trainee-total", stat, value: v })} min={0} max={1200} width={numberFieldWidth} />
                    </View>
                ))}
            </View>
        </View>
    )
}

export default StatTable
