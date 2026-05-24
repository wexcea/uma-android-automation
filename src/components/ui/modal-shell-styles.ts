import { useMemo } from "react"
import { StyleSheet } from "react-native"
import { useTheme } from "../../context/ThemeContext"
import { TYPE } from "../../lib/type"
import { SPACING } from "../../lib/spacing"

/**
 * Style helpers shared by every SheetModal-based settings modal in the app. Returns the four canonical
 * style entries used inside `header` (`modalHeaderRow`, `modalTitleMono`, `modalCloseChip`) and inside
 * the scrollable body (`modalBodyList`).
 * @returns A StyleSheet object keyed by `modalHeaderRow`, `modalTitleMono`, `modalCloseChip`, `modalBodyList`.
 */
export const useModalShellStyles = () => {
    const { colors } = useTheme()
    return useMemo(
        () =>
            StyleSheet.create({
                modalHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
                modalTitleMono: { ...TYPE.monoLabel, color: colors.text, fontSize: 13, letterSpacing: 1.5 },
                modalCloseChip: {
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
                modalBodyList: { gap: SPACING.xs + 2 },
            }),
        [colors]
    )
}
