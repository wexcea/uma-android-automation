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

/** Stable identifier for one of the three checked permissions. */
type PermissionKey = "accessibility" | "overlay" | "battery"

/** Native module reply for any of the three permission polls. `active` is set only by the
 * Accessibility Service poll where it distinguishes "toggled on in settings" from "currently running". */
interface PermissionStatus {
    /** Whether the permission is currently granted at the OS level. */
    enabled: boolean
    /** Accessibility only: whether the service is currently running (not killed by Android). */
    active?: boolean
}

/** Static description of one of the three permissions checked by the component. */
interface PermissionDef {
    /** Stable identifier used for state lookups and as the list key. */
    key: PermissionKey
    /** Heading text shown on the row. */
    title: string
    /** Explanation shown when the row is in the missing state. */
    description: string
    /** Invokes the native module method that polls this permission's status. */
    getStatus: () => Promise<PermissionStatus>
    /** Opens the corresponding system settings screen. */
    openSettings: () => void
    /** Status used when the native module call rejects so the row can settle into a missing state. */
    defaultOnError: PermissionStatus
    /** Whether a resolved status counts as fully granted for this permission. */
    isGranted: (status: PermissionStatus) => boolean
    /** Optional inline warning shown above the action buttons when set. */
    inlineWarning?: (status: PermissionStatus) => string | null
}

const PERMISSIONS: readonly PermissionDef[] = [
    {
        key: "accessibility",
        title: "Accessibility Service",
        description: "The Accessibility Service allows the bot to perform clicks and gestures on your behalf.",
        getStatus: () => NativeModules.StartModule.getAccessibilityStatus(),
        openSettings: () => NativeModules.StartModule.openAccessibilitySettings(),
        defaultOnError: { enabled: false, active: false },
        isGranted: (s) => !!(s.enabled && s.active),
        inlineWarning: (s) =>
            s.enabled && !s.active
                ? "The service is enabled but it seems Android killed it in the background. Toggling it off and back on in settings will restart it."
                : null,
    },
    {
        key: "overlay",
        title: "Overlay Permission",
        description: "The Overlay (Display over other apps) permission allows the bot to render its on-screen control overlay.",
        getStatus: () => NativeModules.StartModule.getOverlayStatus(),
        openSettings: () => NativeModules.StartModule.openOverlaySettings(),
        defaultOnError: { enabled: false },
        isGranted: (s) => !!s.enabled,
    },
    {
        key: "battery",
        title: "Battery Optimization",
        description: "Disabling battery optimization for this app prevents Android from killing the bot during long-running automation runs.",
        getStatus: () => NativeModules.StartModule.getBatteryOptimizationStatus(),
        openSettings: () => NativeModules.StartModule.openBatteryOptimizationSettings(),
        defaultOnError: { enabled: false },
        isGranted: (s) => !!s.enabled,
    },
]

type StatusMap = Record<PermissionKey, PermissionStatus | null>
type RefreshingMap = Record<PermissionKey, boolean>

const INITIAL_STATUSES: StatusMap = { accessibility: null, overlay: null, battery: null }
const INITIAL_REFRESHING: RefreshingMap = { accessibility: false, overlay: false, battery: false }

type RowState = "checking" | "granted" | "missing"

/** Per-row configuration consumed by the list renderer. */
interface RowConfig {
    /** Stable identifier used as the list key. */
    key: PermissionKey
    /** Heading text shown on the row. */
    title: string
    /** Explanation shown when the row is in the missing state. */
    description: string
    /** Current grant state driving the icon, chip, and expanded body. */
    state: RowState
    /** Inline warning shown above the action buttons when set. */
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

    const [statuses, setStatuses] = useState<StatusMap>(INITIAL_STATUSES)
    const [refreshing, setRefreshing] = useState<RefreshingMap>(INITIAL_REFRESHING)
    const [recheckingIndex, setRecheckingIndex] = useState<number | null>(null)
    const recheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const onPermissionsChangeRef = useRef(onPermissionsChange)

    useEffect(() => {
        onPermissionsChangeRef.current = onPermissionsChange
    }, [onPermissionsChange])

    // Fire onPermissionsChange whenever any grant flips. Skips the initial polling-pending window
    // where any of the three statuses is still null so parents don't see a spurious all-false.
    useEffect(() => {
        const a = statuses.accessibility
        const o = statuses.overlay
        const b = statuses.battery
        if (a === null || o === null || b === null) return
        onPermissionsChangeRef.current?.({
            accessibility: !!(a.enabled && a.active),
            overlay: !!o.enabled,
            battery: !!b.enabled,
        })
    }, [statuses])

    /**
     * Polls the native module for one permission and writes the result back into the keyed state
     * maps. Honours a 200ms minimum loading window so the spinner reads as intentional.
     *
     * @param key Which permission to poll.
     */
    const pollPermission = useCallback((key: PermissionKey) => {
        const def = PERMISSIONS.find((p) => p.key === key)!
        setRefreshing((prev) => ({ ...prev, [key]: true }))
        const startTime = Date.now()
        const settle = (status: PermissionStatus) => {
            const remainingTime = Math.max(0, 200 - (Date.now() - startTime))
            setTimeout(() => {
                setStatuses((prev) => ({ ...prev, [key]: status }))
                setRefreshing((prev) => ({ ...prev, [key]: false }))
            }, remainingTime)
        }
        def.getStatus()
            .then(settle)
            .catch(() => settle(def.defaultOnError))
    }, [])

    useEffect(() => {
        PERMISSIONS.forEach((p) => pollPermission(p.key))

        // Refresh all permission statuses whenever the app comes back into the foreground.
        const subscription = AppState.addEventListener("change", (nextAppState: AppStateStatus) => {
            if (nextAppState === "active") {
                PERMISSIONS.forEach((p) => pollPermission(p.key))
            }
        })

        return () => {
            subscription.remove()
        }
    }, [pollPermission])

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

    const rowConfigs: RowConfig[] = useMemo(
        () =>
            PERMISSIONS.map((def) => {
                const status = statuses[def.key]
                const state: RowState = status === null ? "checking" : def.isGranted(status) ? "granted" : "missing"
                return {
                    key: def.key,
                    title: def.title,
                    description: def.description,
                    state,
                    inlineWarning: status !== null && def.inlineWarning ? def.inlineWarning(status) : null,
                    refresh: () => pollPermission(def.key),
                    refreshing: refreshing[def.key],
                    openSettings: def.openSettings,
                }
            }),
        [statuses, refreshing, pollPermission]
    )

    /**
     * Sequentially re-run each system check with a small visual delay so the user sees the progress sweep through the rows.
     */
    const handleRecheckAll = useCallback(() => {
        if (recheckTimerRef.current) clearTimeout(recheckTimerRef.current)
        setRecheckingIndex(0)
        pollPermission(PERMISSIONS[0].key)
        let i = 1
        const advance = () => {
            if (i < PERMISSIONS.length) {
                setRecheckingIndex(i)
                pollPermission(PERMISSIONS[i].key)
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
    }, [pollPermission])

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
