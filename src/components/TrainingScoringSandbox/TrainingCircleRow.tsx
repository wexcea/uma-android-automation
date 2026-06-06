import React, { useMemo } from "react"
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { useTheme } from "../../context/ThemeContext"
import { ALL_STAT_NAMES, StatName } from "../../lib/training/scoring"
import { SPACING } from "../../lib/spacing"
import { TYPE } from "../../lib/type"
import { Text } from "../ui/text"
import { NARROW_BREAKPOINT_DP } from "./layout"
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

const TIER_COLORS: Record<"blue" | "green" | "orange", string> = {
    blue: "#1d4ed8",
    green: "#15803d",
    orange: "#c2410c",
}

const AMBER = "#f59e0b"

// Soft 7-stop rainbow used to fill a training circle when it is in rainbow state. Tailwind 400-shade hues so light/dark text still has reasonable contrast over the gradient.
const RAINBOW_COLORS: [string, string, ...string[]] = ["#f87171", "#fb923c", "#fbbf24", "#34d399", "#60a5fa", "#a78bfa", "#f472b6"]

/** Props for `TrainingCircleRow`. */
export interface TrainingCircleRowProps {
    /** Current sandbox scenario state. */
    scenario: SandboxScenario
    /** Map of computed raw scores keyed by training stat. */
    scoresByTraining: Record<StatName, number>
    /** Training currently winning (highest score). Gets the amber border + WIN tag. */
    winnerTraining: StatName
    /** Reducer dispatch used to mutate the scenario. */
    dispatch: React.Dispatch<ScenarioAction>
}

/**
 * Horizontal row of 5 training "circles" mirroring the in-game training picker. Pressing a circle selects that training in the editor
 * strip. The selected circle grows and gains an amber border; the winning training is tagged WIN with amber text. Friendship-bar tier
 * dots and a rainbow indicator surface enough of the underlying scenario to spot why a training is winning at a glance.
 *
 * @param props See `TrainingCircleRowProps`.
 * @returns A flex row of 5 pressable training circles plus their score readouts.
 */
export function TrainingCircleRow({ scenario, scoresByTraining, winnerTraining, dispatch }: TrainingCircleRowProps): React.ReactElement {
    const { colors } = useTheme()
    const { width } = useWindowDimensions()
    const isNarrow = width < NARROW_BREAKPOINT_DP
    const styles = useMemo(
        () =>
            StyleSheet.create({
                root: {
                    flexDirection: "row",
                    justifyContent: "center",
                    alignItems: "flex-start",
                    paddingVertical: SPACING.sm,
                    gap: isNarrow ? SPACING.sm : SPACING.xxl,
                },
                col: {
                    alignItems: "center",
                    gap: 4,
                },
                circle: {
                    width: isNarrow ? 52 : 92,
                    height: isNarrow ? 52 : 92,
                    borderRadius: 999,
                    backgroundColor: colors.surfaceRaised,
                    borderWidth: 1.5,
                    borderColor: colors.borderStrong,
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                },
                circleSelected: {
                    width: isNarrow ? 60 : 104,
                    height: isNarrow ? 60 : 104,
                    borderColor: AMBER,
                    borderWidth: 2,
                },
                circleLabel: {
                    ...TYPE.caption,
                    color: colors.text,
                    fontWeight: "700",
                    fontSize: isNarrow ? 10 : 13,
                },
                circleLv: {
                    ...TYPE.caption,
                    color: colors.textMuted,
                    fontSize: isNarrow ? 8 : 11,
                },
                rainbowFill: {
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    borderRadius: 999,
                    overflow: "hidden",
                },
                rainbowScrim: {
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    borderRadius: 999,
                    backgroundColor: "rgba(0,0,0,0.18)",
                },
                tierRow: {
                    position: "absolute",
                    bottom: 4,
                    flexDirection: "row",
                    gap: 3,
                },
                tierDot: {
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                },
                scoreText: {
                    ...TYPE.caption,
                    color: colors.text,
                    fontWeight: "700",
                },
                scoreWin: {
                    color: AMBER,
                },
                winTag: {
                    ...TYPE.caption,
                    fontSize: 10,
                    fontWeight: "700",
                    color: AMBER,
                },
            }),
        [colors, isNarrow]
    )

    return (
        <View style={styles.root}>
            {ALL_STAT_NAMES.map((stat) => {
                const t = scenario.trainings[stat]
                const isSelected = stat === scenario.selectedTraining
                const isWinner = stat === winnerTraining
                const score = scoresByTraining[stat] ?? 0
                return (
                    <View key={stat} style={styles.col}>
                        <Pressable onPress={() => dispatch({ type: "select-training", training: stat })} style={[styles.circle, isSelected && styles.circleSelected]}>
                            {t.rainbow ? (
                                <>
                                    <LinearGradient colors={RAINBOW_COLORS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.rainbowFill} pointerEvents="none" />
                                    <View style={styles.rainbowScrim} pointerEvents="none" />
                                </>
                            ) : null}
                            <Text style={styles.circleLabel}>{(isNarrow ? STAT_LABELS_SHORT : STAT_LABELS)[stat]}</Text>
                            <Text style={styles.circleLv}>Lv {t.trainingLevel}</Text>
                            <View style={styles.tierRow}>
                                {(["blue", "green", "orange"] as const).map((tier) =>
                                    t.friendBars[tier] > 0 ? <View key={tier} style={[styles.tierDot, { backgroundColor: TIER_COLORS[tier] }]} /> : null
                                )}
                            </View>
                        </Pressable>
                        <Text style={[styles.scoreText, isWinner && styles.scoreWin]}>{score.toFixed(1)}</Text>
                        {isWinner ? <Text style={styles.winTag}>WIN</Text> : null}
                    </View>
                )
            })}
        </View>
    )
}

export default TrainingCircleRow
