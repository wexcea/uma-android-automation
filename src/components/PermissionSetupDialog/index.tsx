import { useCallback, useEffect, useRef, useState } from "react"
import { AppState, AppStateStatus, NativeModules, StyleSheet, View } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useTheme } from "../../context/ThemeContext"
import { logErrorWithTimestamp, logWithTimestamp } from "../../lib/logger"
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../ui/alert-dialog"
import { Text } from "../ui/text"
import CustomButton from "../CustomButton"

const { StartModule } = NativeModules

interface AccessibilityStatus {
    enabled: boolean
    active: boolean
}

interface ToggleStatus {
    enabled: boolean
}

interface PermissionSetupDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Fired exactly once after the user grants the third (final) missing permission and the dialog auto-closes. */
    onAllGranted?: () => void
}

/**
 * A unified first-time setup dialog that walks the user through granting the three permissions required by the bot:
 * Accessibility Service, Display over other apps, and Disable battery optimization. Auto-refreshes on app foreground
 * and chains the `onAllGranted` callback once everything is green.
 *
 * @param open Whether the dialog is currently visible.
 * @param onOpenChange Called when the dialog requests to open or close.
 * @param onAllGranted Optional callback fired once after the dialog auto-closes because all 3 permissions were granted.
 */
const PermissionSetupDialog = ({ open, onOpenChange, onAllGranted }: PermissionSetupDialogProps) => {
    const { colors } = useTheme()
    const [accessibility, setAccessibility] = useState<AccessibilityStatus | null>(null)
    const [overlay, setOverlay] = useState<ToggleStatus | null>(null)
    const [battery, setBattery] = useState<ToggleStatus | null>(null)
    const allGrantedFiredRef = useRef<boolean>(false)
    const onAllGrantedRef = useRef<typeof onAllGranted>(onAllGranted)

    useEffect(() => {
        onAllGrantedRef.current = onAllGranted
    }, [onAllGranted])

    /** Polls all three permission statuses in parallel and updates local state. */
    const refreshStatuses = useCallback(async () => {
        try {
            const [accessibilityResult, overlayResult, batteryResult] = await Promise.all([
                StartModule.getAccessibilityStatus() as Promise<AccessibilityStatus>,
                StartModule.getOverlayStatus() as Promise<ToggleStatus>,
                StartModule.getBatteryOptimizationStatus() as Promise<ToggleStatus>,
            ])
            setAccessibility(accessibilityResult)
            setOverlay(overlayResult)
            setBattery(batteryResult)
        } catch (error) {
            logErrorWithTimestamp("[PermissionSetupDialog] Failed to refresh permission statuses:", error)
        }
    }, [])

    // Reset the "all granted fired" latch and kick off an initial poll whenever the dialog opens.
    useEffect(() => {
        if (open) {
            allGrantedFiredRef.current = false
            refreshStatuses()
        }
    }, [open, refreshStatuses])

    // Re-poll every time the app foregrounds while the dialog is open (user returning from Android settings).
    useEffect(() => {
        if (!open) return
        const subscription = AppState.addEventListener("change", (state: AppStateStatus) => {
            if (state === "active") {
                refreshStatuses()
            }
        })
        return () => subscription.remove()
    }, [open, refreshStatuses])

    // Auto-close + chain onAllGranted the moment everything turns green.
    useEffect(() => {
        if (!open || allGrantedFiredRef.current) return
        if (accessibility?.enabled && accessibility.active && overlay?.enabled && battery?.enabled) {
            allGrantedFiredRef.current = true
            logWithTimestamp("[PermissionSetupDialog] All 3 permissions granted, closing dialog and proceeding.")
            onOpenChange(false)
            onAllGrantedRef.current?.()
        }
    }, [open, accessibility, overlay, battery, onOpenChange])

    const accessibilityGranted = !!(accessibility?.enabled && accessibility?.active)
    const overlayGranted = !!overlay?.enabled
    const batteryGranted = !!battery?.enabled

    const renderRow = (index: number, granted: boolean, title: string, description: string, onOpenPress: () => void) => (
        <View style={styles.row}>
            <View style={[styles.numberBadge, { backgroundColor: granted ? colors.success : colors.muted, borderColor: granted ? colors.success : colors.border }]}>
                <Text style={[styles.numberText, { color: granted ? "#ffffff" : colors.foreground }]}>{index}</Text>
            </View>
            <View style={styles.rowBody}>
                <View style={styles.rowHeader}>
                    <Text style={[styles.rowTitle, { color: colors.foreground }]}>{title}</Text>
                    <Ionicons name={granted ? "checkmark-circle" : "close-circle"} size={20} color={granted ? colors.success : colors.error} style={styles.statusIcon} />
                </View>
                <Text style={[styles.rowDescription, { color: colors.mutedForeground }]}>{description}</Text>
                <CustomButton variant={granted ? "outline" : "default"} onPress={onOpenPress} style={styles.rowButton} disabled={granted}>
                    {granted ? "Granted" : "Open Settings"}
                </CustomButton>
            </View>
        </View>
    )

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent onDismiss={() => onOpenChange(false)}>
                <AlertDialogHeader>
                    <AlertDialogTitle>Set Up Permissions</AlertDialogTitle>
                    <AlertDialogDescription>
                        The bot needs these 3 Android permissions to read the screen, draw its overlay, and stay alive in the background. Tap each Open Settings, grant the permission, then return
                        here.
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <View style={styles.rowsContainer}>
                    {renderRow(1, accessibilityGranted, "Accessibility Service", "Lets the bot perform clicks and gestures on your behalf.", () => StartModule.openAccessibilitySettings())}
                    {!accessibilityGranted && (
                        <View style={styles.restrictedHint}>
                            <Text style={[styles.restrictedHintText, { color: colors.mutedForeground }]}>
                                On newer Android versions, you must first open App Info → 3-dot menu → "Allow restricted settings" in order to enable the service.
                            </Text>
                            <CustomButton variant="ghost" onPress={() => StartModule.openAppInfoSettings()} style={styles.restrictedHintButton}>
                                Open App Info
                            </CustomButton>
                        </View>
                    )}
                    {renderRow(2, overlayGranted, "Display over other apps", "Lets the bot draw its on-screen control overlay.", () => StartModule.openOverlaySettings())}
                    {renderRow(3, batteryGranted, "Disable battery optimization", "Stops Android from killing the bot during long automation runs.", () =>
                        StartModule.openBatteryOptimizationSettings()
                    )}
                </View>

                <AlertDialogFooter style={styles.footer}>
                    <AlertDialogCancel onPress={() => onOpenChange(false)}>
                        <Text>Cancel</Text>
                    </AlertDialogCancel>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}

const styles = StyleSheet.create({
    rowsContainer: {
        marginVertical: 12,
        gap: 16,
    },
    row: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 12,
    },
    numberBadge: {
        width: 28,
        height: 28,
        borderRadius: 14,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
        marginTop: 2,
    },
    numberText: {
        fontSize: 14,
        fontWeight: "600",
    },
    rowBody: {
        flex: 1,
        gap: 4,
    },
    rowHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    rowTitle: {
        fontSize: 16,
        fontWeight: "600",
    },
    statusIcon: {
        marginLeft: "auto",
    },
    rowDescription: {
        fontSize: 13,
        lineHeight: 18,
    },
    rowButton: {
        marginTop: 6,
        alignSelf: "flex-start",
    },
    footer: {
        justifyContent: "flex-start",
    },
    restrictedHint: {
        marginLeft: 40,
        marginTop: -8,
        gap: 4,
    },
    restrictedHintText: {
        fontSize: 12,
        lineHeight: 16,
        fontStyle: "italic",
    },
    restrictedHintButton: {
        alignSelf: "flex-start",
    },
})

export default PermissionSetupDialog
