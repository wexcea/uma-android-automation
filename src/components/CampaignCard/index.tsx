import React, { useMemo } from "react"
import { View, Text, Pressable, StyleSheet } from "react-native"
import Ionicons from "@react-native-vector-icons/ionicons"
import { useTheme } from "../../context/ThemeContext"
import { TYPE } from "../../lib/type"
import { SPACING } from "../../lib/spacing"
import { RADII } from "../../lib/radii"
import { GlassSurface } from "../ui/glass-surface"

/** Props for `CampaignCard`. */
interface CampaignCardProps {
    /** Active campaign name displayed prominently. */
    campaign: string
    /** Tap handler that opens the campaign picker. When omitted, the Switch button is hidden (use this when only one scenario is selectable). */
    onSwitch?: () => void
}

/**
 * "Currently editing: X" hero card used at the top of Scenario Overrides.
 * @param campaign Active campaign name.
 * @param onSwitch Opens the campaign picker. If omitted, the Switch button is hidden.
 * @returns Glass-backed card with the active campaign label and (optionally) a Switch button.
 */
const CampaignCard: React.FC<CampaignCardProps> = ({ campaign, onSwitch }) => {
    const { colors } = useTheme()
    const styles = useMemo(
        () =>
            StyleSheet.create({
                row: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md },
                icon: { width: 38, height: 38, borderRadius: 999, backgroundColor: colors.brandSubtle, alignItems: "center", justifyContent: "center" },
                body: { flex: 1 },
                lbl: { ...TYPE.monoLabel, color: colors.textMuted },
                name: { ...TYPE.h2, color: colors.text },
                btn: {
                    paddingHorizontal: SPACING.md,
                    paddingVertical: SPACING.sm,
                    backgroundColor: colors.surfaceRaised,
                    borderRadius: RADII.lg,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: SPACING.xs,
                },
                btnLabel: { ...TYPE.body, color: colors.text, fontWeight: "600" },
            }),
        [colors]
    )
    return (
        <GlassSurface>
            <View style={styles.row}>
                <View style={styles.icon}>
                    <Ionicons name="trophy-outline" size={18} color={colors.brand} />
                </View>
                <View style={styles.body}>
                    <Text style={styles.lbl}>CURRENTLY EDITING</Text>
                    <Text style={styles.name}>{campaign}</Text>
                </View>
                {onSwitch ? (
                    <Pressable onPress={onSwitch} style={styles.btn} accessibilityRole="button" android_ripple={{ color: colors.ripple, foreground: true }}>
                        <Text style={styles.btnLabel}>Switch</Text>
                        <Ionicons name="chevron-down" size={14} color={colors.text} />
                    </Pressable>
                ) : null}
            </View>
        </GlassSurface>
    )
}

export default React.memo(CampaignCard)
