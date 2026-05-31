import React, { useMemo } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { useTheme } from "../../context/ThemeContext"
import { THEME } from "../../lib/theme"

/**
 * Resolves theme colors, falling back to the dark palette when no `ThemeProvider` is in scope. Lets the primitive be rendered in unit tests
 * and snapshot harnesses that do not bother wiring up the provider.
 *
 * @returns The active theme color tokens, or the dark palette as a safe default.
 */
function useStepperColors(): typeof THEME.light {
    try {
        return useTheme().colors
    } catch {
        return THEME.dark
    }
}

/** Props for `Stepper`. */
export interface StepperProps {
    /** Current numeric value displayed between the buttons. */
    value: number
    /** Called with the next value after `+` or `-` is pressed. */
    onChange: (next: number) => void
    /** Minimum value; `-` disables when `value - step < min`. Defaults to `-Infinity`. */
    min?: number
    /** Maximum value; `+` disables when `value + step > max`. Defaults to `+Infinity`. */
    max?: number
    /** Increment per button press. Defaults to 1. */
    step?: number
    /** Tints the value chip background when not `default`. */
    accent?: "default" | "blue" | "green" | "orange"
    /** Test identifier passed through to the container. */
    testID?: string
}

const ACCENT_TINTS: Record<NonNullable<StepperProps["accent"]>, string | null> = {
    default: null,
    blue: "#1d4ed8",
    green: "#15803d",
    orange: "#c2410c",
}

/**
 * Inline `[- value +]` numeric stepper. Use for compact numeric inputs where a slider would be too tall. Minus is disabled when the next
 * decrement would fall below `min`, plus is disabled when the next increment would exceed `max`, and disabled buttons short-circuit so
 * `onChange` is never invoked past the bounds.
 *
 * @param props See `StepperProps`.
 * @returns A pill-shaped row with minus / value / plus controls.
 */
export function Stepper(props: StepperProps): React.ReactElement {
    const { value, onChange, min = -Infinity, max = Infinity, step = 1, accent = "default", testID } = props
    const colors = useStepperColors()

    const minusDisabled = value - step < min
    const plusDisabled = value + step > max
    const accentTint = ACCENT_TINTS[accent]

    const styles = useMemo(
        () =>
            StyleSheet.create({
                root: {
                    flexDirection: "row",
                    alignItems: "center",
                    alignSelf: "flex-start",
                    backgroundColor: colors.surfaceRaised,
                    borderColor: colors.borderStrong,
                    borderWidth: 1,
                    borderRadius: 999,
                    paddingHorizontal: 4,
                    paddingVertical: 2,
                },
                button: {
                    minWidth: 32,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    alignItems: "center",
                    justifyContent: "center",
                },
                buttonLabel: {
                    color: colors.text,
                    fontSize: 16,
                    fontWeight: "600",
                },
                buttonLabelDisabled: { color: colors.textMuted, opacity: 0.5 },
                chip: {
                    minWidth: 36,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 999,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: accentTint ?? "transparent",
                },
                chipLabel: {
                    color: accentTint ? "#ffffff" : colors.text,
                    fontVariant: ["tabular-nums"],
                    fontSize: 14,
                    fontWeight: "600",
                },
            }),
        [colors, accentTint]
    )

    return (
        <View style={styles.root} testID={testID}>
            <Pressable accessibilityLabel="Decrease" accessibilityRole="button" disabled={minusDisabled} onPress={() => onChange(value - step)} style={styles.button}>
                <Text style={[styles.buttonLabel, minusDisabled && styles.buttonLabelDisabled]}>-</Text>
            </Pressable>
            <View style={styles.chip}>
                <Text style={styles.chipLabel}>{String(value)}</Text>
            </View>
            <Pressable accessibilityLabel="Increase" accessibilityRole="button" disabled={plusDisabled} onPress={() => onChange(value + step)} style={styles.button}>
                <Text style={[styles.buttonLabel, plusDisabled && styles.buttonLabelDisabled]}>+</Text>
            </Pressable>
        </View>
    )
}
