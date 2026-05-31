// src/components/TrainingScoringAdvanced/MultiplierSlider.tsx
import React from "react"
import { View, Text, StyleSheet } from "react-native"
import { ScoringConstantEntry } from "../../lib/training/scoringConstantsCatalog"
import { useTheme } from "../../context/ThemeContext"
import { SPACING } from "../../lib/spacing"
import { TYPE } from "../../lib/type"
import { RADII } from "../../lib/radii"
import CustomSlider from "../CustomSlider"

/** Props for `MultiplierSlider`. */
export interface MultiplierSliderProps {
    /** Catalog entry describing the multiplier. */
    entry: ScoringConstantEntry
    /** Current value from settings. */
    value: number
    /** Called with the next value as the user drags the slider. */
    onChange: (next: number) => void
}

/**
 * Render one multiplier row: label + value chip + always-on description + slider. The value chip gets an amber tint when the current value differs from the entry's default.
 *
 * @param props See `MultiplierSliderProps`.
 * @returns A single slider row in the Advanced section.
 */
export function MultiplierSlider({ entry, value, onChange }: MultiplierSliderProps): React.ReactElement {
    const { colors } = useTheme()
    const isOverridden = value !== entry.defaultValue

    const chipStyle = {
        backgroundColor: isOverridden ? colors.warningSubtle : colors.muted,
        borderColor: isOverridden ? colors.warningBorder : colors.border,
    }
    const chipTextStyle = {
        color: isOverridden ? colors.warningText : colors.foreground,
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={[TYPE.body, { color: colors.foreground, flexShrink: 1 }]}>{entry.label}</Text>
                <View style={[styles.chip, chipStyle]}>
                    <Text style={[TYPE.monoValue, chipTextStyle]}>{formatValue(value, entry.step)}</Text>
                </View>
            </View>
            <CustomSlider value={value} onValueChange={onChange} min={entry.min} max={entry.max} step={entry.step} description={entry.description} showValue={false} showLabels={false} />
        </View>
    )
}

/**
 * Format a numeric value for the chip based on the entry's step granularity. Integer-ish steps print as integers, fractional steps print with enough precision to show the
 * step's smallest digit.
 *
 * @param value The current value.
 * @param step The entry's slider step.
 * @returns A short display string.
 */
function formatValue(value: number, step: number): string {
    if (step >= 1) return String(Math.round(value))
    const digits = Math.max(0, Math.min(4, -Math.floor(Math.log10(step))))
    return value.toFixed(digits)
}

const styles = StyleSheet.create({
    container: {
        marginBottom: SPACING.md,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: SPACING.sm,
        marginBottom: SPACING.xs,
    },
    chip: {
        paddingHorizontal: SPACING.sm,
        paddingVertical: 2,
        borderRadius: RADII.sm,
        borderWidth: StyleSheet.hairlineWidth,
        minWidth: 48,
        alignItems: "center",
    },
})
