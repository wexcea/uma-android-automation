import React from "react"
import { Pressable, Text, View, ViewStyle } from "react-native"
import { useTheme } from "../../context/ThemeContext"
import { useThemeClasses } from "../../hooks/useThemeClasses"
import { copyToClipboard } from "../../lib/utils"

interface NavigationLinkProps {
    /** The title text for the navigation link. */
    title: string
    /** The description text displayed below the title. */
    description: string
    /** Callback fired when the link is pressed. */
    onPress: () => void
    /** Whether the link is disabled. */
    disabled?: boolean
    /** Optional warning text shown when the link is disabled. */
    disabledDescription?: string
    /** Optional NativeWind class name. */
    className?: string
    /** Optional custom style for the container. */
    style?: ViewStyle
}

/**
 * A themed card-style navigation link with title, description, and disabled state support.
 * Used on settings pages to navigate to sub-pages.
 * @param title The title text for the navigation link.
 * @param description The description text displayed below the title.
 * @param onPress Callback fired when the link is pressed.
 * @param disabled Whether the link is disabled.
 * @param disabledDescription Optional warning text shown when the link is disabled.
 * @param className Optional NativeWind class name.
 * @param style Optional custom style for the container.
 */
const NavigationLink: React.FC<NavigationLinkProps> = ({ title, description, onPress, disabled = false, disabledDescription, className = "", style }) => {
    const themeClasses = useThemeClasses()
    const { colors } = useTheme()

    return (
        <View className={`mt-5 rounded-lg border overflow-hidden ${themeClasses.bgCard} ${themeClasses.border} ${disabled ? "opacity-50" : ""} ${className}`} style={style}>
            <Pressable
                className="p-4"
                onPress={disabled ? undefined : onPress}
                onLongPress={() => copyToClipboard(title)}
                disabled={disabled}
                android_ripple={{ color: colors.ripple, foreground: true }}
            >
                <Text className={`text-lg font-semibold ${disabled ? themeClasses.textSecondary : themeClasses.text}`}>{title}</Text>
                <Text className={`mt-2 ${themeClasses.textSecondary}`}>{description}</Text>
                {disabled && disabledDescription && <Text className={`mt-2 text-sm text-orange-500`}>⚠️ {disabledDescription}</Text>}
            </Pressable>
        </View>
    )
}

export default React.memo(NavigationLink)
