import React, { useMemo } from "react"
import { StyleSheet, TextInput } from "react-native"
import { useTheme } from "../../context/ThemeContext"
import { TYPE } from "../../lib/type"

/** Props for `NumberField`. */
export interface NumberFieldProps {
    /** Current numeric value. */
    value: number
    /** Called with the next value after a valid edit. Out-of-range entries are clamped. */
    onChange: (next: number) => void
    /** Optional minimum value used to clamp user entries. */
    min?: number
    /** Optional maximum value used to clamp user entries. */
    max?: number
    /** Optional fixed width override. Defaults to 64. */
    width?: number
    /** Test identifier passed through to the input. */
    testID?: string
}

/**
 * Compact numeric input used in the scoring sandbox instead of full `Stepper` rows. Trades the +/- buttons for a single tap-to-edit text box so the stat-table grid fits
 * 5 stat columns without overflowing on a tablet. Out-of-range values are clamped against `min` / `max` on commit.
 *
 * @param props See `NumberFieldProps`.
 * @returns A small bordered TextInput with a numeric keyboard.
 */
export function NumberField({ value, onChange, min, max, width = 64, testID }: NumberFieldProps): React.ReactElement {
    const { colors } = useTheme()
    const styles = useMemo(
        () =>
            StyleSheet.create({
                input: {
                    width,
                    height: 30,
                    paddingHorizontal: 8,
                    borderRadius: 6,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: colors.borderStrong,
                    backgroundColor: colors.surfaceRaised,
                    color: colors.text,
                    textAlign: "center",
                    ...TYPE.monoValue,
                    fontSize: 13,
                    includeFontPadding: false,
                    paddingVertical: 0,
                },
            }),
        [colors, width]
    )
    function handleChange(text: string) {
        if (text === "" || text === "-") {
            onChange(min !== undefined ? min : 0)
            return
        }
        const n = parseInt(text, 10)
        if (!Number.isFinite(n)) return
        let next = n
        if (min !== undefined) next = Math.max(min, next)
        if (max !== undefined) next = Math.min(max, next)
        onChange(next)
    }
    return <TextInput value={String(value)} onChangeText={handleChange} keyboardType="numeric" selectTextOnFocus testID={testID} style={styles.input} />
}

export default NumberField
