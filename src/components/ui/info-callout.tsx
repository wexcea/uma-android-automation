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
    /** Optional short title shown in the header row. When omitted and `collapsible` is false, the header is skipped entirely and only the body renders. */
    title?: string
    /** Body content rendered when expanded. */
    children: React.ReactNode
    /** Whether the callout starts expanded. Defaults to false. Ignored when `collapsible` is false. */
    defaultExpanded?: boolean
    /** Whether the callout can be collapsed by tapping the header. When false, the body is always rendered and the header has no chevron or press interaction. Defaults to true. */
    collapsible?: boolean
    /** Optional leading icon node. Defaults to a brand-colored info-circle. Pass `null` to hide. */
    icon?: React.ReactNode | null
    /** Optional container style. */
    style?: StyleProp<ViewStyle>
}

/**
 * A single-line "i Title v" row that expands its children on tap. When `collapsible` is false the header becomes static and the body always renders. When `title` is omitted on a non-collapsible callout, the header is skipped entirely and only the body renders.
 * @param title Optional header label.
 * @param children Body content rendered when expanded.
 * @param defaultExpanded Whether to start expanded. Defaults to false. Ignored when `collapsible` is false.
 * @param collapsible Whether tapping the header toggles the body. Defaults to true.
 * @param icon Optional leading icon node. Defaults to a brand-colored info-circle. Pass `null` to hide.
 * @param style Optional container style.
 * @returns A View that renders an info-callout header (optional) and body content.
 */
const InfoCallout: React.FC<InfoCalloutProps> = ({ title, children, defaultExpanded = false, collapsible = true, icon, style }) => {
    const { colors } = useTheme()
    const [expanded, setExpanded] = useState(defaultExpanded)
    const onPress = useCallback(() => {
        LayoutAnimation.configureNext(LayoutAnimation.create(MOTION.duration.base, "easeInEaseOut", "opacity"))
        setExpanded((prev) => !prev)
    }, [])
    const bodyVisible = !collapsible || expanded
    const showHeader = collapsible || title != null
    const styles = useMemo(
        () =>
            StyleSheet.create({
                container: { backgroundColor: colors.surface, borderLeftWidth: 2, borderLeftColor: colors.brand, borderRadius: RADII.sm, overflow: "hidden" },
                header: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md },
                title: { ...TYPE.body, color: colors.text, flex: 1 },
                body: { paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, paddingBottom: SPACING.md },
            }),
        [colors]
    )
    return (
        <View style={[styles.container, style]}>
            {showHeader &&
                (collapsible ? (
                    <Pressable onPress={onPress} style={styles.header} accessibilityRole="button" accessibilityState={{ expanded }} android_ripple={{ color: colors.ripple, foreground: true }}>
                        {icon === undefined ? <Ionicons name="information-circle-outline" size={16} color={colors.brand} /> : icon}
                        {title != null && <Text style={styles.title}>{title}</Text>}
                        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.textMuted} />
                    </Pressable>
                ) : (
                    <View style={styles.header}>
                        {icon === undefined ? <Ionicons name="information-circle-outline" size={16} color={colors.brand} /> : icon}
                        {title != null && <Text style={styles.title}>{title}</Text>}
                    </View>
                ))}
            {bodyVisible && <View style={styles.body}>{children}</View>}
        </View>
    )
}

export default React.memo(InfoCallout)
