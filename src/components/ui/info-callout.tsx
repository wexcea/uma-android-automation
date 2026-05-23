import React, { useMemo, useState, useCallback } from "react"
import { View, Pressable, Text, StyleSheet, LayoutAnimation, StyleProp, ViewStyle } from "react-native"
import Ionicons from "@react-native-vector-icons/ionicons"
import { useTheme } from "../../context/ThemeContext"
import { TYPE } from "../../lib/type"
import { SPACING } from "../../lib/spacing"
import { RADII } from "../../lib/radii"
import { MOTION } from "../../lib/motion"

/** Props for `InfoCallout`. */
export interface InfoCalloutProps {
    /** Short title shown in the header row. */
    title: string
    /** Body content rendered when expanded. */
    children: React.ReactNode
    /** Whether the callout starts expanded. Defaults to false. */
    defaultExpanded?: boolean
    /** Optional container style. */
    style?: StyleProp<ViewStyle>
}

/**
 * A single-line "i Title v" row that expands its children on tap.
 * @param title Header label.
 * @param children Body content rendered when expanded.
 * @param defaultExpanded Whether to start expanded. Defaults to false.
 * @param style Optional container style.
 * @returns A collapsible row that shows the title in a header and toggles its body content visibility on tap.
 */
const InfoCallout: React.FC<InfoCalloutProps> = ({ title, children, defaultExpanded = false, style }) => {
    const { colors } = useTheme()
    const [expanded, setExpanded] = useState(defaultExpanded)
    const onPress = useCallback(() => {
        LayoutAnimation.configureNext(LayoutAnimation.create(MOTION.duration.base, "easeInEaseOut", "opacity"))
        setExpanded((prev) => !prev)
    }, [])
    const styles = useMemo(
        () =>
            StyleSheet.create({
                container: { backgroundColor: colors.surface, borderLeftWidth: 2, borderLeftColor: colors.brand, borderRadius: RADII.sm, overflow: "hidden" },
                header: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md },
                title: { ...TYPE.body, color: colors.text, flex: 1 },
                body: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.md },
            }),
        [colors]
    )
    return (
        <View style={[styles.container, style]}>
            <Pressable onPress={onPress} style={styles.header} accessibilityRole="button" accessibilityState={{ expanded }} android_ripple={{ color: colors.ripple, foreground: true }}>
                <Ionicons name="information-circle-outline" size={16} color={colors.brand} />
                <Text style={styles.title}>{title}</Text>
                <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.textMuted} />
            </Pressable>
            {expanded && <View style={styles.body}>{children}</View>}
        </View>
    )
}

export default React.memo(InfoCallout)
