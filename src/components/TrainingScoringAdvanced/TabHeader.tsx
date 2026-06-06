// src/components/TrainingScoringAdvanced/TabHeader.tsx
import React from "react"
import { View, Text, Pressable, StyleSheet } from "react-native"
import { useTheme } from "../../context/ThemeContext"
import { TYPE } from "../../lib/type"
import { SPACING } from "../../lib/spacing"

const styles = StyleSheet.create({
    row: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        paddingHorizontal: SPACING.xs,
        paddingVertical: SPACING.md,
    },
    description: {
        ...TYPE.caption,
        flex: 1,
        fontSize: 13,
        lineHeight: 18,
    },
    actions: {
        flexDirection: "row",
        marginBottom: SPACING.sm,
        gap: SPACING.md,
    },
    link: {
        ...TYPE.caption,
        fontWeight: "600",
    },
})

/** Props for `TabHeader`. */
export interface TabHeaderProps {
    /** One-line description of what this tab tunes. Rendered as the left column. */
    description: string
    /** Press handler for the per-tab Reset link. */
    onReset: () => void
}

/**
 * Per-tab header with a description on the left and a Reset link on the right.
 *
 * @param props See `TabHeaderProps`.
 * @returns A row containing the description and the Reset link.
 */
export function TabHeader({ description, onReset }: TabHeaderProps): React.ReactElement {
    const { colors } = useTheme()
    return (
        <View style={styles.row}>
            <Text style={[styles.description, { color: colors.text, opacity: 0.7 }]}>{description}</Text>
            <View style={styles.actions}>
                <Pressable onPress={onReset} android_ripple={{ color: colors.ripple, foreground: true }} hitSlop={8}>
                    <Text style={[styles.link, { color: colors.brand }]}>Reset</Text>
                </Pressable>
            </View>
        </View>
    )
}
