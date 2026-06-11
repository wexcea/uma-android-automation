import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ActivityIndicator, AppState, AppStateStatus, NativeModules, Pressable, StyleSheet, Text, View } from "react-native"
import Ionicons from "@react-native-vector-icons/ionicons"
import { useTheme } from "../../context/ThemeContext"
import { TYPE } from "../../lib/type"
import { SPACING } from "../../lib/spacing"
import { RADII } from "../../lib/radii"
import CustomButton from "../CustomButton"

/** Snapshot of the three system permission states reported up to consumers. */
export interface SystemCheckResults {
    /** Whether the Accessibility Service is currently granted (system-enabled AND running). */
    accessibility: boolean
    /** Whether the Overlay (Display over other apps) permission is currently granted. */
    overlay: boolean
    /** Whether the app is currently exempt from battery optimization. */
    battery: boolean
}

/** Props for `SystemChecksWizard`. */
interface Props {
    /** Fires every time any of the three permission grants changes. Skips the initial poll window
     * where any status is still null. Used by the first-run wizard to gate its Finish button. */
    onPermissionsChange?: (results: SystemCheckResults) => void
    /** When true, drops the outer card chrome and tightens padding so the component nests cleanly
     * inside a parent wizard. */
    embeddedInWizard?: boolean
}

/** Native module reply describing the Accessibility Service. */
interface AccessibilityStatus {
    /** Whether the service is toggled on in system settings. */
    enabled: boolean
    /** Whether the service is currently running and not killed in the background. */
    active: boolean
}

/** Native module reply describing the Overlay (Display over other apps) permission. */
interface OverlayStatus {
    /** Whether the overlay permission has been granted. */
    enabled: boolean
}

/** Native module reply describing the battery optimization exemption. */
interface BatteryStatus {
    /** Whether the app is currently exempt from battery optimization. */
    enabled: boolean
}

type RowState = "checking" | "granted" | "missing"

/** Per-row configuration consumed by the list renderer. */
interface RowConfig {
    /** Stable identifier used as the list key. */
    key: string
    /** Heading text shown on the row. */
    title: string
    /** Explanation shown when the row is in the missing state. */
    description: string
    /** Current grant state driving the icon, chip, and expanded body. */
    state: RowState
    /** Optional warning shown inline above the action buttons when set. */
    inlineWarning: string | null
    /** Re-polls the native module for this permission. */
    refresh: () => void
    /** Whether a refresh poll is in flight. */
    refreshing: boolean
    /** Opens the corresponding system settings screen. */
    openSettings: () => void
}

/**
 * Unified vertical permissions list. Always renders three rows -- Accessibility, Overlay, Battery
 * Optimization. Granted rows collapse to one line. Missing rows expand inline with description +
 * Refresh + Open Settings buttons. A Re-check link at the bottom sweeps all three pollers with a
 * staggered animation.
 *
 * @param onPermissionsChange Fires whenever any grant flips, skipping the initial poll window.
 * @param embeddedInWizard Drops the outer card chrome when true.
 * @returns The system checks view.
 */
const SystemChecksWizard = ({ onPermissionsChange, embeddedInWizard = false }: Props) => {
    const { colors } = useTheme()

    const [accessibilityStatus, setAccessibilityStatus] = useState<AccessibilityStatus | null>(null)
    const [overlayStatus, setOverlayStatus] = useState<OverlayStatus | null>(null)
    const [batteryStatus, setBatteryStatus] = useState<BatteryStatus | null>(null)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [isRefreshingOverlay, setIsRefreshingOverlay] = useState(false)
    const [isRefreshingBattery, setIsRefreshingBattery] = useState(false)
    const [recheckingIndex, setRecheckingIndex] = useState<number | null>(null)
    const recheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const onPermissionsChangeRef = useRef(onPermissionsChange)

    useEffect(() => {
        onPermissionsChangeRef.current = onPermissionsChange
    }, [onPermissionsChange])

    // Fire onPermissionsChange whenever any grant flips. Skips the initial polling-pending window
    // where any of the three statuses is still null so parents don't see a spurious all-false.
    useEffect(() => {
        if (accessibilityStatus === null || overlayStatus === null || batteryStatus === null) return
        onPermissionsChangeRef.current?.({
            accessibility: !!(accessibilityStatus.enabled && accessibilityStatus.active),
            overlay: !!overlayStatus.enabled,
            battery: !!batteryStatus.enabled,
        })
    }, [accessibilityStatus, overlayStatus, batteryStatus])

    /** Checks with the native module if the Accessibility Service is currently running. */
    const checkAccessibilityStatus = useCallback(() => {
        setIsRefreshing(true)
        const startTime = Date.now()
        NativeModules.StartModule.getAccessibilityStatus()
            .then((status: AccessibilityStatus) => {
                const remainingTime = Math.max(0, 200 - (Date.now() - startTime))
                setTimeout(() => {
                    setAccessibilityStatus(status)
                    setIsRefreshing(false)
                }, remainingTime)
            })
            .catch(() => {
                const remainingTime = Math.max(0, 200 - (Date.now() - startTime))
                setTimeout(() => {
                    setAccessibilityStatus({ enabled: false, active: false })
                    setIsRefreshing(false)
                }, remainingTime)
            })
    }, [])

    /** Checks with the native module if the Overlay (Display over other apps) permission is granted. */
    const checkOverlayStatus = useCallback(() => {
        setIsRefreshingOverlay(true)
        const startTime = Date.now()
        NativeModules.StartModule.getOverlayStatus()
            .then((status: OverlayStatus) => {
                const remainingTime = Math.max(0, 200 - (Date.now() - startTime))
                setTimeout(() => {
                    setOverlayStatus(status)
                    setIsRefreshingOverlay(false)
                }, remainingTime)
            })
            .catch(() => {
                const remainingTime = Math.max(0, 200 - (Date.now() - startTime))
                setTimeout(() => {
                    setOverlayStatus({ enabled: false })
                    setIsRefreshingOverlay(false)
                }, remainingTime)
            })
    }, [])

    /** Checks with the native module if the app is currently ignoring battery optimizations. */
    const checkBatteryStatus = useCallback(() => {
        setIsRefreshingBattery(true)
        const startTime = Date.now()
        NativeModules.StartModule.getBatteryOptimizationStatus()
            .then((status: BatteryStatus) => {
                const remainingTime = Math.max(0, 200 - (Date.now() - startTime))
                setTimeout(() => {
                    setBatteryStatus(status)
                    setIsRefreshingBattery(false)
                }, remainingTime)
            })
            .catch(() => {
                const remainingTime = Math.max(0, 200 - (Date.now() - startTime))
                setTimeout(() => {
                    setBatteryStatus({ enabled: false })
                    setIsRefreshingBattery(false)
                }, remainingTime)
            })
    }, [])

    useEffect(() => {
        checkAccessibilityStatus()
        checkOverlayStatus()
        checkBatteryStatus()

        // Refresh all permission statuses whenever the app comes back into the foreground.
        const subscription = AppState.addEventListener("change", (nextAppState: AppStateStatus) => {
            if (nextAppState === "active") {
                checkAccessibilityStatus()
                checkOverlayStatus()
                checkBatteryStatus()
            }
        })

        return () => {
            subscription.remove()
        }
    }, [checkAccessibilityStatus, checkOverlayStatus, checkBatteryStatus])

    // Clear any pending re-check sweep timer when the component unmounts so we don't update state on a stale instance.
    useEffect(() => {
        return () => {
            if (recheckTimerRef.current) clearTimeout(recheckTimerRef.current)
        }
    }, [])

    const styles = useMemo(
        () =>
            StyleSheet.create({
                wrapper: {
                    backgroundColor: colors.surface,
                    borderRadius: RADII.lg,
                    borderWidth: 1,
                    borderColor: colors.borderHair,
                    overflow: "hidden",
                },
                wrapperEmbedded: {
                    backgroundColor: "transparent",
                    borderRadius: 0,
                    borderWidth: 0,
                    overflow: "visible",
                },
                row: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.md, borderBottomWidth: 1, borderBottomColor: colors.borderHair },
                rowMissing: { backgroundColor: "rgba(224, 123, 123, 0.04)" },
                rowHead: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
                iconCircle: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
                iconCircleGranted: { backgroundColor: colors.successSubtle, borderWidth: 1, borderColor: colors.success },
                iconCircleMissing: { backgroundColor: "rgba(224, 123, 123, 0.15)", borderWidth: 1, borderColor: colors.error },
                missingBang: { color: colors.error, fontWeight: "700", fontSize: 13 },
                title: { ...TYPE.body, color: colors.text, flex: 1 },
                titleMuted: { ...TYPE.body, color: colors.textMuted, flex: 1 },
                chip: { ...TYPE.monoLabel, fontSize: 10, letterSpacing: 0.6 },
                expandedBody: { paddingTop: SPACING.sm, paddingLeft: 22 + SPACING.sm },
                description: { ...TYPE.caption, color: colors.textMuted, lineHeight: 18, marginBottom: SPACING.sm },
                inlineWarning: { ...TYPE.caption, color: colors.warningText, lineHeight: 18, marginBottom: SPACING.sm },
                actionRow: { flexDirection: "row", gap: 10 },
                actionButton: { flex: 1 },
                footer: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, flexDirection: "row", justifyContent: "flex-end" },
                recheckLink: { ...TYPE.caption, color: colors.brand, fontWeight: "600" },
                recheckDisabled: { opacity: 0.5 },
            }),
        [colors]
    )

    const rowConfigs: RowConfig[] = useMemo(() => {
        const derive = (status: AccessibilityStatus | OverlayStatus | BatteryStatus | null, granted: boolean): RowState => {
            if (status === null) return "checking"
            return granted ? "granted" : "missing"
        }
        return [
            {
                key: "accessibility",
                title: "Accessibility Service",
                description: "The Accessibility Service allows the bot to perform clicks and gestures on your behalf.",
                state: derive(accessibilityStatus, !!(accessibilityStatus?.enabled && accessibilityStatus?.active)),
                inlineWarning:
                    accessibilityStatus?.enabled && !accessibilityStatus?.active
                        ? "The service is enabled but it seems Android killed it in the background. Toggling it off and back on in settings will restart it."
                        : null,
                refresh: checkAccessibilityStatus,
                refreshing: isRefreshing,
                openSettings: () => NativeModules.StartModule.openAccessibilitySettings(),
            },
            {
                key: "overlay",
                title: "Overlay Permission",
                description: "The Overlay (Display over other apps) permission allows the bot to render its on-screen control overlay.",
                state: derive(overlayStatus, !!overlayStatus?.enabled),
                inlineWarning: null,
                refresh: checkOverlayStatus,
                refreshing: isRefreshingOverlay,
                openSettings: () => NativeModules.StartModule.openOverlaySettings(),
            },
            {
                key: "battery",
                title: "Battery Optimization",
                description: "Disabling battery optimization for this app prevents Android from killing the bot during long-running automation runs.",
                state: derive(batteryStatus, !!batteryStatus?.enabled),
                inlineWarning: null,
                refresh: checkBatteryStatus,
                refreshing: isRefreshingBattery,
                openSettings: () => NativeModules.StartModule.openBatteryOptimizationSettings(),
            },
        ]
    }, [accessibilityStatus, overlayStatus, batteryStatus, isRefreshing, isRefreshingOverlay, isRefreshingBattery, checkAccessibilityStatus, checkOverlayStatus, checkBatteryStatus])

    /**
     * Sequentially re-run each system check with a small visual delay so the user sees the progress sweep through the rows.
     */
    const handleRecheckAll = useCallback(() => {
        if (recheckTimerRef.current) clearTimeout(recheckTimerRef.current)
        const pollers = [checkAccessibilityStatus, checkOverlayStatus, checkBatteryStatus]
        setRecheckingIndex(0)
        pollers[0]()
        let i = 1
        const advance = () => {
            if (i < pollers.length) {
                setRecheckingIndex(i)
                pollers[i]()
                i++
                recheckTimerRef.current = setTimeout(advance, 350)
            } else {
                recheckTimerRef.current = setTimeout(() => {
                    setRecheckingIndex(null)
                    recheckTimerRef.current = null
                }, 350)
            }
        }
        recheckTimerRef.current = setTimeout(advance, 350)
    }, [checkAccessibilityStatus, checkOverlayStatus, checkBatteryStatus])

    /**
     * @param state The current row state.
     * @returns The icon element for the row.
     */
    const renderIcon = (state: RowState) => {
        if (state === "checking") {
            return <ActivityIndicator size="small" color={colors.brand} style={{ width: 22, height: 22 }} />
        }
        if (state === "granted") {
            return (
                <View style={[styles.iconCircle, styles.iconCircleGranted]}>
                    <Ionicons name="checkmark" size={14} color={colors.success} />
                </View>
            )
        }
        return (
            <View style={[styles.iconCircle, styles.iconCircleMissing]}>
                <Text style={styles.missingBang}>!</Text>
            </View>
        )
    }

    /**
     * @param state The current row state.
     * @returns The chip element for the row.
     */
    const renderChip = (state: RowState) => {
        if (state === "checking") return <Text style={[styles.chip, { color: colors.textMuted }]}>CHECKING...</Text>
        if (state === "granted") return <Text style={[styles.chip, { color: colors.success }]}>GRANTED</Text>
        return <Text style={[styles.chip, { color: colors.error }]}>MISSING</Text>
    }

    return (
        <View style={embeddedInWizard ? styles.wrapperEmbedded : styles.wrapper}>
            {rowConfigs.map((row) => (
                <View key={row.key} style={[styles.row, row.state === "missing" && styles.rowMissing]}>
                    <View style={styles.rowHead}>
                        {renderIcon(row.state)}
                        <Text style={row.state === "checking" ? styles.titleMuted : styles.title}>{row.title}</Text>
                        {renderChip(row.state)}
                    </View>
                    {row.state === "missing" && (
                        <View style={styles.expandedBody}>
                            <Text style={styles.description}>{row.description}</Text>
                            {row.inlineWarning && <Text style={styles.inlineWarning}>{row.inlineWarning}</Text>}
                            <View style={styles.actionRow}>
                                <View style={styles.actionButton}>
                                    <CustomButton variant="outline" onPress={row.refresh} isLoading={row.refreshing} disabled={row.refreshing}>
                                        Refresh
                                    </CustomButton>
                                </View>
                                <View style={styles.actionButton}>
                                    <CustomButton variant="primary" onPress={row.openSettings}>
                                        Open Settings
                                    </CustomButton>
                                </View>
                            </View>
                        </View>
                    )}
                </View>
            ))}
            <View style={styles.footer}>
                <Pressable
                    onPress={handleRecheckAll}
                    disabled={recheckingIndex !== null}
                    android_ripple={{ color: colors.ripple, foreground: false }}
                    hitSlop={8}
                    style={recheckingIndex !== null ? styles.recheckDisabled : undefined}
                >
                    <Text style={styles.recheckLink}>{recheckingIndex !== null ? "Re-checking..." : "Re-check"}</Text>
                </Pressable>
            </View>
        </View>
    )
}

export default SystemChecksWizard
