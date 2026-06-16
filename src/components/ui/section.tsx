import { useState, useMemo, Children } from "react"
import { LayoutAnimation, Pressable, View, type StyleProp, type ViewStyle } from "react-native"
import { Ionicons } from "@react-native-vector-icons/ionicons"
import { useTheme } from "../../context/ThemeContext"
import { SPACING } from "../../lib/spacing"
import { RADII } from "../../lib/radii"
import { SectionLabel } from "./section-label"

/** Props for `Section`. */
export interface SectionProps {
    /** Uppercase label rendered via `SectionLabel`. */
    label: string
    /** Child rows. Hairline dividers are drawn between adjacent children. */
    children: React.ReactNode
    /** Allow the user to collapse this section. Default: false (always open). */
    collapsible?: boolean
    /** Initial open state when `collapsible`. Default: true (open). */
    defaultOpen?: boolean
    /** When true, skip the outer card (background, border, radius) and the default bottom margin. Used when nesting inside another `Section`. */
    bare?: boolean
    /** Controls the first inter-child hairline (between child[0] and child[1]). Set to false to suppress it (e.g. when child[0] is a section description block that should visually fuse with the first row). Default: true. */
    firstDivider?: boolean
    /** Controls the last inter-child hairline (between child[N-2] and child[N-1]). Set to false to suppress it. Default: true. */
    lastDivider?: boolean
    /** When true, suppress every inter-child hairline. Use for sub-sections whose children are not a settings-row list (e.g. an informational strip followed by sliders that don't need visual separators). Default: false. */
    noDividers?: boolean
    /** Optional right slot rendered inline with the section label (e.g. a Reset chip). When `collapsible`, this sits before the chevron. */
    labelRight?: React.ReactNode
    /** Outer container style override. */
    style?: StyleProp<ViewStyle>
}

/**
 * Linear-style labeled section. Uppercase mono label above a card with hairline dividers between children.
 * Optional collapse via a chevron on the label.
 *
 * @param props See `SectionProps`.
 * @returns Label + card with children stacked vertically.
 */
export const Section = ({ label, children, collapsible = false, defaultOpen = true, bare = false, firstDivider = true, lastDivider = true, noDividers = false, labelRight, style }: SectionProps) => {
    const { colors } = useTheme()
    const [open, setOpen] = useState(defaultOpen)
    const items = useMemo(() => Children.toArray(children).filter(Boolean), [children])

    const toggle = () => {
        LayoutAnimation.configureNext(LayoutAnimation.create(200, "easeInEaseOut", "opacity"))
        setOpen((v) => !v)
    }

    const chevronIcon = collapsible ? <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.textMuted} /> : null
    const headerRight =
        labelRight != null && chevronIcon != null ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm }}>
                {labelRight}
                {chevronIcon}
            </View>
        ) : (
            (labelRight ?? chevronIcon)
        )

    const cardStyle = bare ? undefined : { backgroundColor: colors.surface, borderRadius: RADII.lg, borderWidth: 1, borderColor: colors.borderHair, overflow: "hidden" as const }

    return (
        <View style={[{ marginTop: SPACING.sm, marginBottom: bare ? 0 : collapsible && !open ? SPACING.xs : SPACING.lg }, style]}>
            {collapsible ? (
                <Pressable onPress={toggle} android_ripple={{ color: colors.ripple, foreground: false }} hitSlop={6}>
                    <SectionLabel label={label} right={headerRight} />
                </Pressable>
            ) : (
                <SectionLabel label={label} right={headerRight} />
            )}
            {open ? (
                <View style={cardStyle}>
                    {items.map((child, idx) => {
                        const isLastChild = idx === items.length - 1
                        let showDivider = !isLastChild && !noDividers
                        if (idx === 0 && !firstDivider) showDivider = false
                        if (idx === items.length - 2 && !lastDivider) showDivider = false
                        return (
                            <View key={idx}>
                                {child}
                                {showDivider ? <View style={{ height: 1, backgroundColor: colors.borderHair, marginHorizontal: SPACING.lg }} /> : null}
                            </View>
                        )
                    })}
                </View>
            ) : null}
        </View>
    )
}
