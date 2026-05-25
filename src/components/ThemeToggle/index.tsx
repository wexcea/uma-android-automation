import React, { useMemo } from "react"
import { Pressable, StyleProp, StyleSheet, ViewStyle } from "react-native"
import { Moon, Sun } from "lucide-react-native"
import { useTheme } from "../../context/ThemeContext"

interface ThemeToggleProps {
    /** Optional custom style for the toggle button. */
    style?: StyleProp<ViewStyle>
}

/**
 * A toggle button that switches between light and dark themes.
 * Displays a moon icon in light mode and a sun icon in dark mode. Styled to match the `PageHeader` search chip.
 * @param style Optional custom style for the toggle button.
 */
export const ThemeToggle: React.FC<ThemeToggleProps> = ({ style }) => {
    const { theme, toggleTheme, colors } = useTheme()
    const styles = useMemo(
        () =>
            StyleSheet.create({
                chip: {
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    overflow: "hidden",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colors.surfaceRaised,
                    borderWidth: 1,
                    borderColor: colors.borderHair,
                },
            }),
        [colors]
    )

    return (
        <Pressable onPress={toggleTheme} style={[styles.chip, style]} android_ripple={{ color: colors.ripple, foreground: true }}>
            {theme === "light" ? <Moon size={18} color={colors.text} /> : <Sun size={18} color={colors.text} />}
        </Pressable>
    )
}

export default ThemeToggle
