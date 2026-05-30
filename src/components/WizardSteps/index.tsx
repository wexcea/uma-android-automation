import React, { useMemo } from "react"
import { View, Text, StyleSheet } from "react-native"
import Ionicons from "@react-native-vector-icons/ionicons"
import { useTheme } from "../../context/ThemeContext"
import { TYPE } from "../../lib/type"
import { SPACING } from "../../lib/spacing"
import { RADII } from "../../lib/radii"

/** A single wizard step. */
export interface WizardStep {
    /** Step number, 1-indexed. */
    n: number
    /** Step title rendered next to the number. */
    title: string
    /** Step body (descriptive caption + optional inline controls). */
    body: React.ReactNode
}

/** Props for `WizardSteps`. */
interface WizardStepsProps {
    /** Ordered steps. */
    steps: WizardStep[]
    /** Index (0-based) of the currently active step. */
    activeIndex: number
}

/**
 * Numbered step list with active / done / pending states.
 * @param steps Ordered step definitions.
 * @param activeIndex 0-based index of the active step.
 * @returns Vertical list of numbered steps with per-step visual state.
 */
const WizardSteps: React.FC<WizardStepsProps> = ({ steps, activeIndex }) => {
    const { colors } = useTheme()
    const styles = useMemo(
        () =>
            StyleSheet.create({
                step: { flexDirection: "row", gap: SPACING.md, padding: SPACING.md, backgroundColor: colors.surface, borderRadius: RADII.lg, marginBottom: SPACING.xs },
                stepActive: { backgroundColor: colors.brandSubtle, borderWidth: 1, borderColor: colors.brandBorder },
                stepDone: { opacity: 0.6 },
                num: { width: 24, height: 24, borderRadius: 999, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" },
                numActive: { backgroundColor: colors.brand },
                numDone: { backgroundColor: colors.successSubtle },
                numText: { ...TYPE.monoLabel, color: colors.text, fontWeight: "600" as const },
                numTextActive: { color: colors.onBrand },
                title: { ...TYPE.body, color: colors.text, fontWeight: "600" as const },
            }),
        [colors]
    )
    return (
        <View>
            {steps.map((s, i) => {
                const isActive = i === activeIndex
                const isDone = i < activeIndex
                return (
                    <View key={s.n} style={[styles.step, isActive && styles.stepActive, isDone && styles.stepDone]}>
                        <View style={[styles.num, isActive && styles.numActive, isDone && styles.numDone]}>
                            {isDone ? <Ionicons name="checkmark" size={14} color={colors.success} /> : <Text style={[styles.numText, isActive && styles.numTextActive]}>{s.n}</Text>}
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.title}>{s.title}</Text>
                            {s.body}
                        </View>
                    </View>
                )
            })}
        </View>
    )
}

export default React.memo(WizardSteps)
