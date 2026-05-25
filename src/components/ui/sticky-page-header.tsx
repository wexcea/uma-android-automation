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
 * Top-bar wrapper for the app's primary page header. Renders a solid `bg` background. Consumers should mount this as a sibling
 * above their main scroll container - not inside a `ScrollView` - so the inner `Pressable`s do not lose touches to the parent
 * scroll view's pan-responder on Android.
 *
 * @param props See `StickyPageHeaderProps`.
 * @returns Solid top bar.
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
