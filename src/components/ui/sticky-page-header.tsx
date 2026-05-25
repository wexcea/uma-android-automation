import { View, type StyleProp, type ViewStyle } from "react-native"
import { useTheme } from "../../context/ThemeContext"
import { SPACING } from "../../lib/spacing"

/** Props for `StickyPageHeader`. */
export interface StickyPageHeaderProps {
    /** Header children (title, left slot, right slot). */
    children: React.ReactNode
    /** Outer container style override. */
    style?: StyleProp<ViewStyle>
}

/**
 * Pin-on-scroll wrapper for the app's primary page header. Renders a solid `bg` background.
 * Consumer should place this as the first child of a `ScrollView` with `stickyHeaderIndices={[0]}` so it pins on scroll.
 *
 * @param props See `StickyPageHeaderProps`.
 * @returns Solid sticky bar.
 */
export const StickyPageHeader = ({ children, style }: StickyPageHeaderProps) => {
    const { colors } = useTheme()
    return (
        <View
            style={[
                {
                    backgroundColor: colors.bg,
                    paddingHorizontal: 0,
                    paddingVertical: SPACING.sm,
                },
                style,
            ]}
        >
            {children}
        </View>
    )
}
