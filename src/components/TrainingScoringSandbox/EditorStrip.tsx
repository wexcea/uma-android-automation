import React, { useMemo } from "react"
import { Pressable, StyleSheet, View } from "react-native"
import { useTheme } from "../../context/ThemeContext"
import { StatName } from "../../lib/training/scoring"
import { SPACING } from "../../lib/spacing"
import { RADII } from "../../lib/radii"
import { TYPE } from "../../lib/type"
import { Text } from "../ui/text"
import { Stepper } from "../ui/stepper"
import { Switch } from "../ui/switch"
import { SandboxScenario, ScenarioAction } from "./scenarioState"

const STAT_LABELS: Record<StatName, string> = {
    [StatName.SPEED]: "Speed",
    [StatName.STAMINA]: "Stamina",
    [StatName.POWER]: "Power",
    [StatName.GUTS]: "Guts",
    [StatName.WIT]: "Wit",
}

const LEVELS = [1, 2, 3, 4, 5] as const

/** Props for `EditorStrip`. */
export interface EditorStripProps {
    /** Current sandbox scenario state. */
    scenario: SandboxScenario
    /** Reducer dispatch used to mutate the scenario. */
    dispatch: React.Dispatch<ScenarioAction>
}

/**
 * Two-row editor strip for the currently selected training. Row 1 carries the training-level segmented selector, energy-gain stepper, and
 * rainbow switch. Row 2 carries the three colored friendship-bar tier steppers (blue, green, orange). The strip always operates on
 * `scenario.trainings[scenario.selectedTraining]`.
 *
 * @param props See `EditorStripProps`.
 * @returns A two-row editor for the selected training.
 */
export function EditorStrip({ scenario, dispatch }: EditorStripProps): React.ReactElement {
    const { colors } = useTheme()
    const selected = scenario.selectedTraining
    const t = scenario.trainings[selected]

    const styles = useMemo(
        () =>
            StyleSheet.create({
                row: {
                    flexDirection: "row",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: SPACING.md,
                    paddingVertical: SPACING.xs,
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
                editingLabel: {
                    ...TYPE.caption,
                    color: colors.text,
                    fontWeight: "700",
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
        [colors]
    )

    return (
        <View>
            <View style={styles.row}>
                <Text style={styles.editingLabel}>Editing {STAT_LABELS[selected]}:</Text>
                <View style={styles.group}>
                    <Text style={styles.label}>Lv</Text>
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
                <View style={styles.group}>
                    <Text style={styles.label}>Energy +</Text>
                    <Stepper value={t.energyGain} onChange={(v) => dispatch({ type: "set-energy-gain", training: selected, value: v })} min={0} step={1} />
                </View>
                <View style={styles.group}>
                    <Text style={styles.label}>Rainbow</Text>
                    <Switch checked={t.rainbow} onCheckedChange={(v) => dispatch({ type: "set-rainbow", training: selected, rainbow: v })} />
                </View>
            </View>
            <View style={styles.row}>
                <Text style={styles.label}>Friend bars:</Text>
                <View style={styles.group}>
                    <Text style={styles.label}>Blue</Text>
                    <Stepper value={t.friendBars.blue} onChange={(v) => dispatch({ type: "set-friend-bar", training: selected, tier: "blue", count: v })} min={0} step={1} accent="blue" />
                </View>
                <View style={styles.group}>
                    <Text style={styles.label}>Green</Text>
                    <Stepper value={t.friendBars.green} onChange={(v) => dispatch({ type: "set-friend-bar", training: selected, tier: "green", count: v })} min={0} step={1} accent="green" />
                </View>
                <View style={styles.group}>
                    <Text style={styles.label}>Orange</Text>
                    <Stepper value={t.friendBars.orange} onChange={(v) => dispatch({ type: "set-friend-bar", training: selected, tier: "orange", count: v })} min={0} step={1} accent="orange" />
                </View>
            </View>
        </View>
    )
}

export default EditorStrip
