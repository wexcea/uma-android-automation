// src/components/TrainingScoringAdvanced/FormulaEcho.tsx
import React from "react"
import { View, Text, StyleSheet } from "react-native"
import { useTheme } from "../../context/ThemeContext"
import { SPACING } from "../../lib/spacing"
import { RADII } from "../../lib/radii"

const MONO_FAMILY = "GeistMono_500Medium"

const styles = StyleSheet.create({
    strip: {
        marginHorizontal: SPACING.xs,
        marginBottom: SPACING.md,
        paddingVertical: SPACING.sm,
        paddingHorizontal: SPACING.md,
        borderLeftWidth: 2,
        borderRadius: RADII.sm,
    },
    text: {
        fontFamily: MONO_FAMILY,
        fontSize: 11,
        lineHeight: 16,
        includeFontPadding: false,
    },
})

/** Props for `FormulaEcho`. */
export interface FormulaEchoProps {
    /** The one-line formula slice this tab tunes (e.g. `Ratio = step( completion% , [m1..m7] )`). */
    text: string
}

/**
 * Slim accent-bordered strip that echoes a slice of the scoring formula. Used as a per-tab strip directly under `TabHeader` and inside Misc tab sub-sections as the
 * formula-part one-liner. Zero logic.
 *
 * @param props See `FormulaEchoProps`.
 * @returns The echo strip with its accent left border.
 */
export function FormulaEcho({ text }: FormulaEchoProps): React.ReactElement {
    const { colors } = useTheme()
    return (
        <View style={[styles.strip, { backgroundColor: colors.muted, borderLeftColor: colors.brand, borderColor: colors.border }]}>
            <Text style={[styles.text, { color: colors.foreground, opacity: 0.85 }]}>{text}</Text>
        </View>
    )
}
