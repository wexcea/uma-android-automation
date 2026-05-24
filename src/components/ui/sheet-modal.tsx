import React, { useMemo } from "react"
import { Dimensions, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native"
import { useTheme } from "../../context/ThemeContext"
import { SPACING } from "../../lib/spacing"
import { RADII } from "../../lib/radii"

/** Props for `SheetModal`. */
export interface SheetModalProps {
    /** Whether the sheet is visible. */
    visible: boolean
    /** Called on backdrop tap or Android back. */
    onRequestClose: () => void
    /** Header slot. Usually a title row + close chip. Rendered above a hairline divider. */
    header: React.ReactNode
    /** Body slot. Rendered inside a flex-1 ScrollView so nested scroll regions resolve. */
    children: React.ReactNode
    /** Footer slot. Rendered below a hairline divider. */
    footer: React.ReactNode
    /** Override the default 0.82 screen-height fraction. Clamped between 0.4 and 0.95. */
    heightFraction?: number
    /** Set false to disable tap-outside-to-dismiss. Default true. */
    dismissOnBackdropPress?: boolean
}

/**
 * A modal shell with locked header and footer slots and a scrollable body. Built on `Modal` with a definite-height card so nested
 * `ScrollView` regions have a bounded parent and flex children grow as expected. Use this for any form-style or list-style modal
 * where the body content may exceed available space. For auto-sized alerts and short confirmations, prefer `GlassModal`.
 *
 * @param visible Whether the sheet is visible.
 * @param onRequestClose Called on backdrop tap or Android back.
 * @param header Header slot rendered above a hairline divider.
 * @param children Body slot rendered inside a flex-1 ScrollView.
 * @param footer Footer slot rendered below a hairline divider.
 * @param heightFraction Override the default 0.82 screen-height fraction. Clamped between 0.4 and 0.95.
 * @param dismissOnBackdropPress Set false to disable tap-outside-to-dismiss. Default true.
 * @returns A full-screen `Modal` with a centered card whose layout is header / scrollable body / footer.
 */
const SheetModalImpl = ({ visible, onRequestClose, header, children, footer, heightFraction = 0.82, dismissOnBackdropPress = true }: SheetModalProps) => {
    const { colors } = useTheme()
    const clamped = Math.max(0.4, Math.min(0.95, heightFraction))
    const cardHeight = Math.round(Dimensions.get("window").height * clamped)
    const styles = useMemo(
        () =>
            StyleSheet.create({
                backdrop: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.glassBackdrop },
                card: {
                    width: "92%",
                    maxWidth: 560,
                    maxHeight: cardHeight,
                    borderRadius: RADII.xl,
                    borderWidth: 1,
                    borderColor: colors.brandBorder,
                    backgroundColor: colors.surface,
                    overflow: "hidden",
                },
                header: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.md },
                body: { flexShrink: 1 },
                bodyContent: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.md },
                footer: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.md },
            }),
        [colors, cardHeight]
    )
    return (
        <Modal transparent visible={visible} animationType="fade" onRequestClose={onRequestClose} statusBarTranslucent>
            <Pressable style={styles.backdrop} onPress={dismissOnBackdropPress ? onRequestClose : undefined}>
                <Pressable onPress={(e) => e.stopPropagation()} style={styles.card}>
                    <View style={styles.header}>{header}</View>
                    <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                        {children}
                    </ScrollView>
                    {footer != null ? <View style={styles.footer}>{footer}</View> : null}
                </Pressable>
            </Pressable>
        </Modal>
    )
}

export const SheetModal = React.memo(SheetModalImpl)
export default SheetModal
