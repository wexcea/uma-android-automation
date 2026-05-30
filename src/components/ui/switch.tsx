import React, { useMemo } from "react"
import { Platform, StyleSheet } from "react-native"
import * as SwitchPrimitives from "@rn-primitives/switch"
import { useTheme } from "../../context/ThemeContext"

/**
 * Themed switch with a cyan brand track when on and a clearly outlined neutral track when off. Built on top of `@rn-primitives/switch` so
 * accessibility semantics (role, state) are preserved. Sizes are pegged at 28x50 (track) with a 22px thumb for comfortable tap affordance
 * and high legibility against both light and dark page backgrounds.
 *
 * @param props Forwarded to `SwitchPrimitives.Root`; `checked` drives the visual state, `disabled` dims the whole control. Any consumer-supplied `style` is ignored so the themed appearance stays consistent.
 * @returns A track + thumb composition.
 */
function Switch(props: SwitchPrimitives.RootProps & React.RefAttributes<SwitchPrimitives.RootRef>) {
    const { colors } = useTheme()
    const { checked, disabled, style: _style, ...rest } = props

    const styles = useMemo(
        () =>
            StyleSheet.create({
                root: {
                    width: 50,
                    height: 28,
                    borderRadius: 999,
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 2,
                    borderWidth: 1.5,
                },
                rootOn: {
                    backgroundColor: colors.brand,
                    borderColor: colors.brand,
                },
                rootOff: {
                    backgroundColor: colors.surfaceRaised,
                    borderColor: colors.borderStrong,
                },
                thumb: {
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    shadowColor: "#000",
                    shadowOpacity: 0.18,
                    shadowOffset: { width: 0, height: 1 },
                    shadowRadius: 2,
                    elevation: 2,
                },
                thumbOn: {
                    backgroundColor: "#ffffff",
                    transform: [{ translateX: 22 }],
                },
                thumbOff: {
                    backgroundColor: colors.textMuted,
                    transform: [{ translateX: 0 }],
                },
            }),
        [colors]
    )

    return (
        <SwitchPrimitives.Root checked={checked} disabled={disabled} style={[styles.root, checked ? styles.rootOn : styles.rootOff, disabled && { opacity: 0.5 }]} {...rest}>
            <SwitchPrimitives.Thumb
                style={[styles.thumb, checked ? styles.thumbOn : styles.thumbOff, Platform.OS === "web" ? ({ transitionProperty: "transform", transitionDuration: "150ms" } as object) : undefined]}
            />
        </SwitchPrimitives.Root>
    )
}

export { Switch }
