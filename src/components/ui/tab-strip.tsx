import React, { useMemo } from "react"
import { View, Pressable, Text, StyleSheet, StyleProp, ViewStyle } from "react-native"
import { useTheme } from "../../context/ThemeContext"
import { TYPE } from "../../lib/type"
import { SPACING } from "../../lib/spacing"
import { RADII } from "../../lib/radii"
import { resolveActiveIndex } from "./tab-strip.helpers"

export { resolveActiveIndex }

/** A single tab descriptor. */
export interface TabStripItem {
    /** Unique key for this tab. */
    key: string
    /** Display label rendered inside the pill. */
    label: string
}

/** Props for `TabStrip`. */
export interface TabStripProps {
    /** Ordered list of tab descriptors. */
    items: TabStripItem[]
    /** Currently active tab key. */
    activeKey: string
    /** Callback fired with the new key when a tab is pressed. */
    onChange: (key: string) => void
    /** Optional container style. */
    style?: StyleProp<ViewStyle>
}

/**
 * Pill-style tab strip used to switch between sibling content sections in one page.
 * @param items Tab descriptors in display order.
 * @param activeKey Key of the currently active tab.
 * @param onChange Callback invoked when the user taps a tab.
 * @param style Optional container style.
 * @returns A horizontally laid out row of pill-shaped tab buttons with controlled active state.
 */
const TabStrip: React.FC<TabStripProps> = ({ items, activeKey, onChange, style }) => {
    const { colors } = useTheme()
    const styles = useMemo(
        () =>
            StyleSheet.create({
                strip: {
                    flexDirection: "row",
                    gap: SPACING.xs,
                    padding: SPACING.xs,
                    backgroundColor: colors.surfaceRaised,
                    borderRadius: RADII.xl,
                },
                tab: {
                    flex: 1,
                    paddingVertical: SPACING.sm,
                    paddingHorizontal: SPACING.xs,
                    borderRadius: RADII.lg,
                    alignItems: "center",
                },
                tabActive: { backgroundColor: colors.brand },
                label: { ...TYPE.body, fontSize: 13, lineHeight: 18, color: colors.text, fontWeight: "600" },
                labelActive: { color: colors.onBrand },
            }),
        [colors]
    )
    return (
        <View style={[styles.strip, style]}>
            {items.map((item) => {
                const active = item.key === activeKey
                return (
                    <Pressable key={item.key} onPress={() => onChange(item.key)} style={[styles.tab, active && styles.tabActive]} accessibilityRole="tab" accessibilityState={{ selected: active }}>
                        <Text style={[styles.label, active && styles.labelActive]}>{item.label}</Text>
                    </Pressable>
                )
            })}
        </View>
    )
}

export default React.memo(TabStrip)
