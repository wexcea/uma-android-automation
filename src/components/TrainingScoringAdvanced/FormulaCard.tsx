// src/components/TrainingScoringAdvanced/FormulaCard.tsx
import React from "react"
import { View, Text, StyleSheet } from "react-native"
import { useTheme } from "../../context/ThemeContext"
import { SPACING } from "../../lib/spacing"
import { TYPE } from "../../lib/type"
import { RADII } from "../../lib/radii"

const MONO_FAMILY = "GeistMono_500Medium"

const styles = StyleSheet.create({
    card: {
        marginHorizontal: SPACING.md,
        marginTop: SPACING.sm,
        marginBottom: SPACING.md,
        paddingVertical: SPACING.md,
        paddingHorizontal: SPACING.md,
        borderRadius: RADII.md,
        borderWidth: StyleSheet.hairlineWidth,
    },
    label: {
        ...TYPE.caption,
        fontSize: 10,
        letterSpacing: 1,
        marginBottom: SPACING.xs,
        textTransform: "uppercase",
    },
    row: {
        flexDirection: "row",
        alignItems: "baseline",
    },
    subRow: {
        flexDirection: "row",
        alignItems: "baseline",
        paddingLeft: SPACING.md,
    },
    cell: {
        fontFamily: MONO_FAMILY,
        fontSize: 12,
        lineHeight: 18,
        includeFontPadding: false,
    },
    body: {
        flexShrink: 1,
    },
})

/**
 * Static two-level reference card showing the structure of the training scoring formula. Each line is a flex row of two `<Text>` cells (accent label + equation body) with
 * `alignItems: "baseline"` so the accent and body share a baseline regardless of Android's nested-`<Text>` font-metric quirks. Zero props; reads only theme colors.
 *
 * @returns A monospaced summary of the scoring formula with the leading `score` token and sub-term labels accented in `colors.brand`.
 */
export function FormulaCard(): React.ReactElement {
    const { colors } = useTheme()
    const accentColor = { color: colors.brand }
    const bodyColor = { color: colors.foreground }
    const subBodyColor = { color: colors.foreground, opacity: 0.85 }
    return (
        <View style={[styles.card, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.foreground, opacity: 0.55 }]}>Scoring formula</Text>
            <View style={styles.row}>
                <Text style={[styles.cell, accentColor]}>score</Text>
                <Text style={[styles.cell, styles.body, bodyColor]}> = ( STAT x wS + REL x wR + MISC x wM ) x Rainbow x Anticipatory</Text>
            </View>
            <View style={styles.subRow}>
                <Text style={[styles.cell, accentColor]}>STAT</Text>
                <Text style={[styles.cell, styles.body, subBodyColor]}> = Sum statGain x Ratio x Priority x Level x MainStatBonus</Text>
            </View>
            <View style={styles.subRow}>
                <Text style={[styles.cell, accentColor]}>REL</Text>
                <Text style={[styles.cell, styles.body, subBodyColor]}> = Sum barValue x Diminish x EarlyGame x Trainer (normalized)</Text>
            </View>
            <View style={styles.subRow}>
                <Text style={[styles.cell, accentColor]}>MISC</Text>
                <Text style={[styles.cell, styles.body, subBodyColor]}> = 50 + Hints x HintScore</Text>
            </View>
            <View style={styles.subRow}>
                <Text style={[styles.cell, accentColor]}>Rainbow</Text>
                <Text style={[styles.cell, styles.body, subBodyColor]}> = 2.0x on Year 2+ rainbow / 1.5x if toggled off / 1x else</Text>
            </View>
            <View style={styles.subRow}>
                <Text style={[styles.cell, accentColor]}>Anticip.</Text>
                <Text style={[styles.cell, styles.body, subBodyColor]}> = 1 + min(cap, coef x Sum near-rainbow fills)</Text>
            </View>
        </View>
    )
}
