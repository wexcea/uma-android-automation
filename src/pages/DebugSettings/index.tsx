import { useMemo, useCallback, useContext, useRef, useState, useEffect } from "react"
import { View, Text, ScrollView, StyleSheet, NativeModules, Pressable, AppState, AppStateStatus } from "react-native"
import Ionicons from "@react-native-vector-icons/ionicons"
import * as Clipboard from "expo-clipboard"
import { useTheme } from "../../context/ThemeContext"
import { DebugContext, BotMetaContext } from "../../context/BotStateContext"
import CustomSlider from "../../components/CustomSlider"
import CustomCheckbox from "../../components/CustomCheckbox"
import { Separator } from "../../components/ui/separator"
import PageHeader from "../../components/PageHeader"
import WarningContainer from "../../components/WarningContainer"
import CustomButton from "../../components/CustomButton"
import SearchableItem from "../../components/SearchableItem"
import { SearchPageProvider } from "../../context/SearchPageContext"
import { usePerformanceLogging } from "../../hooks/usePerformanceLogging"
import { Section } from "../../components/ui/section"
import { GlassSurface } from "../../components/ui/glass-surface"
import { Row } from "../../components/ui/row"
import { Switch } from "../../components/ui/switch"
import { SectionLabel } from "../../components/ui/section-label"
import { SheetModal } from "../../components/ui/sheet-modal"
import { ModalRadioRow } from "../../components/ui/modal-list"
import { useModalShellStyles } from "../../components/ui/modal-shell-styles"
import { TYPE } from "../../lib/type"
import { SPACING } from "../../lib/spacing"
import { RADII } from "../../lib/radii"

/** Descriptor for a single diagnostic test surfaced in the Debug Tests section. Drives the mutually-exclusive Switch rows. */
interface DebugTestDescriptor {
    /** Settings key on `debug`. */
    key:
        | "debugMode_startTemplateMatchingTest"
        | "debugMode_startSingleTrainingOCRTest"
        | "debugMode_startComprehensiveTrainingOCRTest"
        | "debugMode_startRaceListDetectionTest"
        | "debugMode_startMainScreenUpdateTest"
        | "debugMode_startSkillListBuyTest"
        | "debugMode_startScrollBarDetectionTest"
        | "debugMode_startTrackblazerRaceSelectionTest"
        | "debugMode_startTrackblazerInventorySyncTest"
        | "debugMode_startTrackblazerBuyItemsTest"
    /** Stable id used for search registration. */
    searchId: string
    /** Visible Row title. */
    title: string
    /** Row description. */
    description: string
}

/** Order matches the previous CustomCheckbox list so behavior is identical after the visual swap to Switch rows. */
const DEBUG_TESTS: DebugTestDescriptor[] = [
    {
        key: "debugMode_startTemplateMatchingTest",
        searchId: "debug-template-matching-test",
        title: "Start Basic Template Matching Test",
        description:
            "Disables normal bot operations and starts the template match test. Only on the Home screen and will check if it can find certain essential buttons on the screen. It will also output what scale it had the most success with.",
    },
    {
        key: "debugMode_startSingleTrainingOCRTest",
        searchId: "debug-single-training-ocr-test",
        title: "Start Single Training OCR Test",
        description: "Disables normal bot operations and starts the single training OCR test. Only on the Training screen and tests the current training on display for stat gains and failure chances.",
    },
    {
        key: "debugMode_startComprehensiveTrainingOCRTest",
        searchId: "debug-comprehensive-training-ocr-test",
        title: "Start Comprehensive Training OCR Test",
        description: "Disables normal bot operations and starts the comprehensive training OCR test. Only on the Training screen and tests all 5 trainings for their stat gains and failure chances.",
    },
    {
        key: "debugMode_startRaceListDetectionTest",
        searchId: "debug-race-list-detection-test",
        title: "Start Race List Detection Test",
        description: "Disables normal bot operations and starts the Race List detection test. Only on the Race List screen and tests detecting the races with double star predictions currently on display.",
    },
    {
        key: "debugMode_startMainScreenUpdateTest",
        searchId: "debug-main-screen-update-test",
        title: "Start Main Screen Update Test",
        description: "Disables normal bot operations and starts the Main Screen update test. This test will go through all Main Screen updates and then print the Trainee information.",
    },
    {
        key: "debugMode_startSkillListBuyTest",
        searchId: "debug-skill-list-buy-test",
        title: "Start Skill List Buy Test",
        description:
            "Processes the list of skills in the Skills screen, reads all skills in the list, logs a summary and then logs another summary of which skills it will buy to bring down the current Skill Points as close to zero as possible and then it will stop there without actually doing the buying.",
    },
    {
        key: "debugMode_startScrollBarDetectionTest",
        searchId: "debug-scrollbar-detection-test",
        title: "Start Scrollbar Detection Test",
        description: "Disables normal bot operations and starts the Scrollbar detection test. Detects the scrollbar on the current screen and attempts to scroll it up and down to verify functionality.",
    },
    {
        key: "debugMode_startTrackblazerRaceSelectionTest",
        searchId: "debug-trackblazer-race-selection-test",
        title: "Start Trackblazer Race Selection Test",
        description: "Disables normal bot operations and starts the Trackblazer race selection test. Navigates to the Race List if on the Main Screen and identifies the best race to run, including Rivals.",
    },
    {
        key: "debugMode_startTrackblazerInventorySyncTest",
        searchId: "debug-trackblazer-inventory-sync-test",
        title: "Start Trackblazer Inventory Sync Test",
        description: "Disables normal bot operations and starts the Trackblazer inventory sync test. Opens the Training Items dialog if on the Main Screen and logs inventory contents and quick-use intentions.",
    },
    {
        key: "debugMode_startTrackblazerBuyItemsTest",
        searchId: "debug-trackblazer-buy-items-test",
        title: "Start Trackblazer Buy Items Test",
        description: "Disables normal bot operations and starts the Trackblazer buy items test. Opens the Shop if on the Main Screen and logs shop contents and purchase intentions without actually buying anything.",
    },
]

/** Available recording frame rate options surfaced in the Row+chip selector. */
const FRAME_RATE_OPTIONS = [
    { value: 30, label: "30 FPS" },
    { value: 60, label: "60 FPS" },
] as const

/**
 * The Debug Settings page.
 * Provides controls for debug mode, template matching confidence/scale, screen recording settings (bit rate, frame rate, resolution), and diagnostic tests (template matching, OCR, date, race list,
 * aptitudes).
 */
const DebugSettings = () => {
    usePerformanceLogging("DebugSettings")
    const { colors } = useTheme()
    const { debug, updateDebug } = useContext(DebugContext)
    const { defaultSettings } = useContext(BotMetaContext)
    const scrollViewRef = useRef<ScrollView>(null)
    const modalShellStyles = useModalShellStyles()

    /**
     * Handles mutual exclusivity for diagnostic debug tests. When one test is enabled, all others are automatically disabled.
     * @param key The settings key of the test being toggled.
     * @param checked The new checked state.
     */
    const handleDebugTestToggle = (key: DebugTestDescriptor["key"], checked: boolean) => {
        if (checked) {
            const updates = DEBUG_TESTS.reduce((acc, t) => {
                acc[t.key] = t.key === key
                return acc
            }, {} as any)
            updateDebug(updates)
        } else {
            updateDebug({ [key]: false } as any)
        }
    }

    const [deviceIp, setDeviceIp] = useState<string>("<phone-ip>")
    const [accessibilityStatus, setAccessibilityStatus] = useState<{ enabled: boolean; active: boolean } | null>(null)
    const [overlayStatus, setOverlayStatus] = useState<{ enabled: boolean } | null>(null)
    const [batteryStatus, setBatteryStatus] = useState<{ enabled: boolean } | null>(null)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [isRefreshingOverlay, setIsRefreshingOverlay] = useState(false)
    const [isRefreshingBattery, setIsRefreshingBattery] = useState(false)
    const [currentWizardStep, setCurrentWizardStep] = useState<number>(0)
    const [frameRatePickerOpen, setFrameRatePickerOpen] = useState(false)

    /** Checks with the native module if the Accessibility Service is currently running. */
    const checkAccessibilityStatus = () => {
        setIsRefreshing(true)
        const startTime = Date.now()
        NativeModules.StartModule.getAccessibilityStatus()
            .then((status: { enabled: boolean; active: boolean }) => {
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
    }

    /** Checks with the native module if the Overlay (Display over other apps) permission is granted. */
    const checkOverlayStatus = () => {
        setIsRefreshingOverlay(true)
        const startTime = Date.now()
        NativeModules.StartModule.getOverlayStatus()
            .then((status: { enabled: boolean }) => {
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
    }

    /** Checks with the native module if the app is currently ignoring battery optimizations. */
    const checkBatteryStatus = () => {
        setIsRefreshingBattery(true)
        const startTime = Date.now()
        NativeModules.StartModule.getBatteryOptimizationStatus()
            .then((status: { enabled: boolean }) => {
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
    }

    useEffect(() => {
        if (debug.enableRemoteLogViewer) {
            NativeModules.StartModule.getDeviceIpAddress()
                .then((ip: string) => setDeviceIp(ip))
                .catch(() => setDeviceIp("<phone-ip>"))
        }
    }, [debug.enableRemoteLogViewer])

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
    }, [])

    const styles = useMemo(
        () =>
            StyleSheet.create({
                root: { flex: 1, flexDirection: "column", justifyContent: "center", margin: 10, backgroundColor: colors.bg },
                hostPad: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
                sectionDescription: { ...TYPE.caption, color: colors.textMuted, lineHeight: 18, paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },
                chip: {
                    ...TYPE.monoLabel,
                    color: colors.brand,
                    paddingHorizontal: SPACING.sm,
                    paddingVertical: 2,
                    backgroundColor: colors.brandSubtle,
                    borderRadius: RADII.pill,
                    overflow: "hidden",
                },
                wizardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: SPACING.md, paddingTop: SPACING.md },
                stepperLabel: { ...TYPE.monoLabel, color: colors.textMuted },
                dotsRow: { flexDirection: "row", gap: 6, alignItems: "center" },
                dot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: colors.borderHair },
                dotFuture: { backgroundColor: "transparent" },
                dotCurrent: { backgroundColor: colors.brand, borderColor: colors.brand },
                dotPast: { backgroundColor: colors.brand, borderColor: colors.brand, opacity: 0.5 },
                wizardBody: { paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, paddingBottom: SPACING.md, gap: SPACING.sm },
                wizardTitle: { ...TYPE.h2, color: colors.text },
                wizardDescription: { ...TYPE.caption, color: colors.textMuted, lineHeight: 18 },
                statusChipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
                statusChip: {
                    paddingHorizontal: SPACING.sm,
                    paddingVertical: 3,
                    borderRadius: RADII.pill,
                    borderWidth: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                },
                statusChipGranted: { backgroundColor: colors.successSubtle, borderColor: colors.success },
                statusChipMissing: { backgroundColor: "rgba(255, 90, 110, 0.10)", borderColor: colors.error },
                statusChipPending: { backgroundColor: colors.surfaceRaised, borderColor: colors.borderHair },
                statusChipText: { ...TYPE.monoLabel, fontSize: 10 },
                inlineWarning: { ...TYPE.caption, color: colors.warningText, lineHeight: 18 },
                actionRow: { flexDirection: "row", gap: 10, marginTop: SPACING.sm },
                navRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: SPACING.md, paddingBottom: SPACING.md },
                doneCard: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, gap: SPACING.sm },
                doneHeader: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
                doneTitle: { ...TYPE.h2, color: colors.brand },
                doneCheckRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, paddingVertical: 2 },
                doneCheckLabel: { ...TYPE.body, color: colors.text, flex: 1 },
                recheckLink: { ...TYPE.caption, color: colors.brand, fontWeight: "600", marginTop: SPACING.sm },
            }),
        [colors]
    )

    const rlvUrl = `http://${deviceIp === "10.0.2.15" ? "localhost" : deviceIp}:${debug.remoteLogViewerPort}`

    const handleCopyRlvUrl = useCallback(async () => {
        try {
            await Clipboard.setStringAsync(rlvUrl)
        } catch {
            // swallow - clipboard may fail silently on web/sim
        }
    }, [rlvUrl])

    // System checks wizard data. Each step describes one permission and the status, refresh, and open-settings handlers tied to it.
    const wizardSteps = useMemo(
        () => [
            {
                title: "Accessibility Service",
                description: "The Accessibility Service allows the bot to perform clicks and gestures on your behalf.",
                flags: [
                    { label: "System Enabled", granted: accessibilityStatus?.enabled, ready: accessibilityStatus !== null },
                    { label: "Internal State", granted: accessibilityStatus?.active, ready: accessibilityStatus !== null },
                ],
                granted: !!(accessibilityStatus?.enabled && accessibilityStatus?.active),
                refresh: checkAccessibilityStatus,
                refreshing: isRefreshing,
                openSettings: () => NativeModules.StartModule.openAccessibilitySettings(),
                inlineWarning: accessibilityStatus?.enabled && !accessibilityStatus?.active ? "The service is enabled but it seems Android killed it in the background. Toggling it off and back on in settings will restart it." : null,
            },
            {
                title: "Overlay Permission",
                description: "The Overlay (Display over other apps) permission allows the bot to render its on-screen control overlay.",
                flags: [{ label: "Display over other apps", granted: overlayStatus?.enabled, ready: overlayStatus !== null }],
                granted: !!overlayStatus?.enabled,
                refresh: checkOverlayStatus,
                refreshing: isRefreshingOverlay,
                openSettings: () => NativeModules.StartModule.openOverlaySettings(),
                inlineWarning: null,
            },
            {
                title: "Battery Optimization",
                description: "Disabling battery optimization for this app prevents Android from killing the bot during long-running automation runs.",
                flags: [{ label: "Ignoring battery optimization", granted: batteryStatus?.enabled, ready: batteryStatus !== null }],
                granted: !!batteryStatus?.enabled,
                refresh: checkBatteryStatus,
                refreshing: isRefreshingBattery,
                openSettings: () => NativeModules.StartModule.openBatteryOptimizationSettings(),
                inlineWarning: null,
            },
        ],
        [accessibilityStatus, overlayStatus, batteryStatus, isRefreshing, isRefreshingOverlay, isRefreshingBattery]
    )

    const allChecksPassed = wizardSteps.every((s) => s.granted)
    const activeStep = wizardSteps[currentWizardStep]
    const currentFrameRateLabel = FRAME_RATE_OPTIONS.find((o) => o.value === debug.recordingFrameRate)?.label ?? "30 FPS"

    return (
        <View style={styles.root}>
            <SearchPageProvider page="DebugSettings" scrollViewRef={scrollViewRef}>
                <PageHeader title="Debug Settings" />
                <ScrollView ref={scrollViewRef} nestedScrollEnabled={true} showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
                    <View className="m-1">
                        {/* //////////////////////////////////////////////////////////////////////////////////////////////////
                            //////////////////////////////////////////////////////////////////////////////////////////////////
                            Debug Mode */}
                        <Section label="Debug Mode">
                            <SearchableItem id="enable-debug-mode" title="Enable Debug Mode" description="Allows debugging messages in the log and test images to be created in the /temp/ folder.">
                                <Row
                                    title="Enable Debug Mode"
                                    description="Verbose logging and test image capture"
                                    right={<Switch checked={debug.enableDebugMode} onCheckedChange={(checked) => updateDebug({ enableDebugMode: checked })} />}
                                />
                            </SearchableItem>
                        </Section>
                        {debug.enableDebugMode && <WarningContainer style={{ marginTop: 0, marginBottom: SPACING.md }}>⚠️ Significantly extends the average runtime of the bot due to increased IO operations.</WarningContainer>}

                        {/* //////////////////////////////////////////////////////////////////////////////////////////////////
                            //////////////////////////////////////////////////////////////////////////////////////////////////
                            Image/OCR Recognition */}
                        <Section label="Image/OCR Recognition">
                            <View style={styles.hostPad}>
                                <CustomSlider
                                    searchId="template-match-confidence"
                                    value={debug.templateMatchConfidence}
                                    placeholder={defaultSettings.debug.templateMatchConfidence}
                                    onValueChange={(value) => updateDebug({ templateMatchConfidence: value })}
                                    onSlidingComplete={(value) => updateDebug({ templateMatchConfidence: value })}
                                    min={0.5}
                                    max={1.0}
                                    step={0.01}
                                    label="Template Match Confidence"
                                    labelUnit=""
                                    showValue={true}
                                    showLabels={true}
                                    description="Sets the minimum confidence level for template matching with 1080p as the baseline. Consider lowering this to something like 0.7 or 70% at lower resolutions. Making it too low will cause the bot to match on too many things as false positives."
                                />
                            </View>
                            <View style={styles.hostPad}>
                                <CustomSlider
                                    searchId="template-match-custom-scale"
                                    value={debug.templateMatchCustomScale}
                                    placeholder={defaultSettings.debug.templateMatchCustomScale}
                                    onValueChange={(value) => updateDebug({ templateMatchCustomScale: value })}
                                    onSlidingComplete={(value) => updateDebug({ templateMatchCustomScale: value })}
                                    min={0.5}
                                    max={3.0}
                                    step={0.01}
                                    label="Template Match Custom Scale"
                                    labelUnit=""
                                    showValue={true}
                                    showLabels={true}
                                    description="Manually set the scale to do template matching. The Basic Template Matching Test can help find your recommended scale. Making it too low or too high will cause the bot to match on too little or too many things as false positives."
                                />
                            </View>
                            <View style={styles.hostPad}>
                                <CustomSlider
                                    searchId="ocr-threshold"
                                    value={debug.ocrThreshold}
                                    placeholder={defaultSettings.debug.ocrThreshold}
                                    onValueChange={(value: number) => updateDebug({ ocrThreshold: value })}
                                    onSlidingComplete={(value: number) => updateDebug({ ocrThreshold: value })}
                                    min={100}
                                    max={255}
                                    step={5}
                                    label="OCR Threshold"
                                    labelUnit=""
                                    showValue={true}
                                    showLabels={true}
                                    description="The brightness threshold used to distinguish text from the background during OCR. Note: This setting does not affect high-precision features like Stat Detection or Training Failure Chance detection, as they use specialized processing."
                                />
                            </View>
                        </Section>

                        {/* //////////////////////////////////////////////////////////////////////////////////////////////////
                            //////////////////////////////////////////////////////////////////////////////////////////////////
                            Remote Log Viewer */}
                        <View style={{ marginTop: SPACING.lg }}>
                            <SectionLabel label="Remote Log Viewer" />
                            <GlassSurface>
                                <View style={{ padding: SPACING.md, gap: SPACING.sm }}>
                                    <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm }}>
                                        <View style={{ width: 28, height: 28, borderRadius: 999, backgroundColor: colors.brandSubtle, alignItems: "center", justifyContent: "center" }}>
                                            <Ionicons name="cellular-outline" size={14} color={colors.brand} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ ...TYPE.body, color: colors.text, fontWeight: "600" as const }}>Remote Log Viewer</Text>
                                            <Text style={{ ...TYPE.caption, color: colors.textMuted }}>Same WiFi required</Text>
                                        </View>
                                        <SearchableItem
                                            id="settings-enable-remote-log-viewer"
                                            title="Enable Remote Log Viewer"
                                            description="Starts an HTTP server on this device when the bot runs. Open the URL shown below in a browser on your computer to view logs in real-time."
                                        >
                                            <Switch checked={debug.enableRemoteLogViewer} onCheckedChange={(checked) => updateDebug({ enableRemoteLogViewer: checked })} />
                                        </SearchableItem>
                                    </View>
                                    {debug.enableRemoteLogViewer && (
                                        <>
                                            <Pressable
                                                onPress={handleCopyRlvUrl}
                                                android_ripple={{ color: colors.ripple, foreground: true }}
                                                style={{ padding: SPACING.sm, backgroundColor: colors.surfaceRaised, borderRadius: RADII.md, flexDirection: "row", alignItems: "center", gap: SPACING.sm }}
                                            >
                                                <Text style={{ ...TYPE.monoLabel, color: colors.brand, flex: 1 }}>{rlvUrl}</Text>
                                                <Ionicons name="copy-outline" size={14} color={colors.textMuted} />
                                            </Pressable>
                                            <Text style={{ ...TYPE.caption, color: colors.textMuted }}>Port {debug.remoteLogViewerPort} · Active</Text>
                                            <CustomSlider
                                                searchId="settings-remote-log-viewer-port"
                                                searchCondition={debug.enableRemoteLogViewer}
                                                parentId="settings-enable-remote-log-viewer"
                                                value={debug.remoteLogViewerPort}
                                                placeholder={defaultSettings.debug.remoteLogViewerPort}
                                                onValueChange={(value) => updateDebug({ remoteLogViewerPort: value })}
                                                onSlidingComplete={(value) => updateDebug({ remoteLogViewerPort: value })}
                                                min={1024}
                                                max={65535}
                                                step={1}
                                                showValue
                                                showLabels
                                                label="Server Port"
                                                description="Port number for the log stream server. Change only if the default conflicts with another service."
                                            />
                                            {deviceIp === "10.0.2.15" && <Text style={{ ...TYPE.caption, color: colors.warningText }}>Emulator detected - direct connection to {deviceIp} will fail. Use ADB port forwarding instead.</Text>}
                                        </>
                                    )}
                                </View>
                            </GlassSurface>
                        </View>

                        <Separator style={{ marginVertical: 16 }} />

                        {/* //////////////////////////////////////////////////////////////////////////////////////////////////
                            //////////////////////////////////////////////////////////////////////////////////////////////////
                            Screen Recording Settings */}
                        <Section label="Screen Recording Settings">
                            <View style={styles.hostPad}>
                                <Text style={[TYPE.caption, { color: colors.textMuted, marginBottom: SPACING.md }]}>Configure the quality settings for screen recording.</Text>
                                <CustomCheckbox
                                    searchId="enable-screen-recording"
                                    checked={debug.enableScreenRecording}
                                    onCheckedChange={(checked) => updateDebug({ enableScreenRecording: checked })}
                                    label="Enable Screen Recording"
                                    description="Records the screen while the bot is running. The mp4 file will be saved to the /recordings folder of the app's data directory. Note that performance and battery life may be impacted while recording."
                                />
                                <CustomSlider
                                    searchId="recording-bit-rate"
                                    searchCondition={debug.enableScreenRecording}
                                    parentId="enable-screen-recording"
                                    value={debug.recordingBitRate}
                                    placeholder={defaultSettings.debug.recordingBitRate}
                                    onValueChange={(value) => updateDebug({ recordingBitRate: value })}
                                    onSlidingComplete={(value) => updateDebug({ recordingBitRate: value })}
                                    min={1}
                                    max={20}
                                    step={1}
                                    label="Recording Quality (Bit Rate)"
                                    labelUnit=" Mbps"
                                    showValue={true}
                                    showLabels={true}
                                    description="Sets the video bit rate for screen recording. Higher values produce better quality but larger file sizes."
                                />
                            </View>
                            {debug.enableScreenRecording && (
                                <SearchableItem
                                    id="recording-frame-rate"
                                    title="Recording Frame Rate"
                                    description="Sets the frame rate for screen recording."
                                    parentId="enable-screen-recording"
                                    condition={debug.enableScreenRecording}
                                >
                                    <Row
                                        title="Recording Frame Rate"
                                        description="Sets the frame rate for screen recording."
                                        onPress={() => setFrameRatePickerOpen(true)}
                                        right={<Text style={styles.chip}>{currentFrameRateLabel}</Text>}
                                    />
                                </SearchableItem>
                            )}
                            <View style={styles.hostPad}>
                                <CustomSlider
                                    searchId="recording-resolution-scale"
                                    searchCondition={debug.enableScreenRecording}
                                    parentId="enable-screen-recording"
                                    value={debug.recordingResolutionScale}
                                    placeholder={defaultSettings.debug.recordingResolutionScale}
                                    onValueChange={(value) => updateDebug({ recordingResolutionScale: value })}
                                    onSlidingComplete={(value) => updateDebug({ recordingResolutionScale: value })}
                                    min={0.25}
                                    max={1.0}
                                    step={0.05}
                                    label="Recording Resolution Scale"
                                    labelUnit=""
                                    showValue={true}
                                    showLabels={true}
                                    description="Scales the recording resolution. Lower values produce smaller file sizes but lower quality. 1.0 = full resolution, 0.5 = half resolution."
                                />
                            </View>
                        </Section>

                        {/* //////////////////////////////////////////////////////////////////////////////////////////////////
                            //////////////////////////////////////////////////////////////////////////////////////////////////
                            System Checks (wizard) */}
                        <Section label="System Checks">
                            {allChecksPassed ? (
                                <View style={styles.doneCard}>
                                    <View style={styles.doneHeader}>
                                        <Ionicons name="checkmark-circle" size={20} color={colors.brand} />
                                        <Text style={styles.doneTitle}>All system checks passed</Text>
                                    </View>
                                    {wizardSteps.map((step) => (
                                        <View key={step.title} style={styles.doneCheckRow}>
                                            <Ionicons name="checkmark" size={16} color={colors.brand} />
                                            <Text style={styles.doneCheckLabel}>{step.title}</Text>
                                        </View>
                                    ))}
                                    <Pressable onPress={() => setCurrentWizardStep(0)} android_ripple={{ color: colors.ripple, foreground: false }} hitSlop={8}>
                                        <Text style={styles.recheckLink}>Re-check</Text>
                                    </Pressable>
                                </View>
                            ) : (
                                <>
                                    <View style={styles.wizardHeader}>
                                        <Text style={styles.stepperLabel}>STEP {currentWizardStep + 1} OF {wizardSteps.length}</Text>
                                        <View style={styles.dotsRow}>
                                            {wizardSteps.map((_, idx) => (
                                                <View
                                                    key={idx}
                                                    style={[styles.dot, idx === currentWizardStep ? styles.dotCurrent : idx < currentWizardStep ? styles.dotPast : styles.dotFuture]}
                                                />
                                            ))}
                                        </View>
                                    </View>
                                    <View style={styles.wizardBody}>
                                        <Text style={styles.wizardTitle}>{activeStep.title}</Text>
                                        <View style={styles.statusChipsRow}>
                                            {activeStep.flags.map((flag) => {
                                                const chipStyle = !flag.ready ? styles.statusChipPending : flag.granted ? styles.statusChipGranted : styles.statusChipMissing
                                                const chipColor = !flag.ready ? colors.textMuted : flag.granted ? colors.success : colors.error
                                                const chipText = !flag.ready ? "Checking..." : flag.granted ? "✅ Granted" : "❌ Missing"
                                                return (
                                                    <View key={flag.label} style={[styles.statusChip, chipStyle]}>
                                                        <Text style={[styles.statusChipText, { color: chipColor }]}>{flag.label}</Text>
                                                        <Text style={[styles.statusChipText, { color: chipColor }]}>·</Text>
                                                        <Text style={[styles.statusChipText, { color: chipColor }]}>{chipText}</Text>
                                                    </View>
                                                )
                                            })}
                                        </View>
                                        <Text style={styles.wizardDescription}>{activeStep.description}</Text>
                                        {activeStep.inlineWarning != null && <Text style={styles.inlineWarning}>{activeStep.inlineWarning}</Text>}
                                        <View style={styles.actionRow}>
                                            <CustomButton variant="outline" onPress={activeStep.refresh} isLoading={activeStep.refreshing} disabled={activeStep.refreshing}>
                                                Refresh
                                            </CustomButton>
                                            <CustomButton variant="primary" onPress={activeStep.openSettings}>
                                                Open Settings
                                            </CustomButton>
                                        </View>
                                    </View>
                                    <View style={styles.navRow}>
                                        <CustomButton variant="ghost" disabled={currentWizardStep === 0} onPress={() => setCurrentWizardStep((s) => Math.max(0, s - 1))}>
                                            ← Back
                                        </CustomButton>
                                        <CustomButton variant="ghost" disabled={currentWizardStep === wizardSteps.length - 1} onPress={() => setCurrentWizardStep((s) => Math.min(wizardSteps.length - 1, s + 1))}>
                                            Next →
                                        </CustomButton>
                                    </View>
                                </>
                            )}
                        </Section>

                        {/* //////////////////////////////////////////////////////////////////////////////////////////////////
                            //////////////////////////////////////////////////////////////////////////////////////////////////
                            Debug Tests */}
                        <View style={{ marginTop: SPACING.sm, marginBottom: SPACING.lg }}>
                            <SectionLabel label="Debug Tests" />
                            <View style={{ backgroundColor: colors.surface, borderRadius: RADII.lg, borderWidth: 1, borderColor: colors.borderHair, overflow: "hidden" }}>
                                <View style={{ paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.sm }}>
                                    <Text style={[TYPE.caption, { color: colors.textMuted, lineHeight: 18, marginBottom: SPACING.sm }]}>
                                        Run diagnostic tests to verify template matching and OCR functionality. Only one test can be enabled at a time.
                                    </Text>
                                    <WarningContainer style={{ marginTop: 0 }}>
                                        {"⚠️ Only one debug test can be enabled at a time. Enabling a test will automatically disable the others.\n\nHaving Debug Mode enabled will output more helpful logs."}
                                    </WarningContainer>
                                </View>
                                {DEBUG_TESTS.map((test, idx) => (
                                    <View key={test.key}>
                                        <SearchableItem id={test.searchId} title={test.title} description={test.description}>
                                            <Row
                                                title={test.title}
                                                description={test.description}
                                                right={<Switch checked={!!debug[test.key]} onCheckedChange={(checked) => handleDebugTestToggle(test.key, checked)} />}
                                            />
                                        </SearchableItem>
                                        {idx < DEBUG_TESTS.length - 1 && <View style={{ height: 1, backgroundColor: colors.borderHair, marginLeft: SPACING.lg }} />}
                                    </View>
                                ))}
                            </View>
                        </View>
                    </View>
                </ScrollView>
            </SearchPageProvider>

            <SheetModal
                visible={frameRatePickerOpen}
                onRequestClose={() => setFrameRatePickerOpen(false)}
                header={
                    <View style={modalShellStyles.modalHeaderRow}>
                        <Text style={modalShellStyles.modalTitleMono}>RECORDING FRAME RATE</Text>
                        <Pressable style={modalShellStyles.modalCloseChip} onPress={() => setFrameRatePickerOpen(false)} android_ripple={{ color: colors.ripple, foreground: true }} accessibilityLabel="Close">
                            <Ionicons name="close" size={18} color={colors.text} />
                        </Pressable>
                    </View>
                }
                footer={null}
            >
                <View style={modalShellStyles.modalBodyList}>
                    {FRAME_RATE_OPTIONS.map((o) => (
                        <ModalRadioRow
                            key={o.value}
                            label={o.label}
                            selected={o.value === debug.recordingFrameRate}
                            onPress={() => {
                                updateDebug({ recordingFrameRate: o.value })
                                setFrameRatePickerOpen(false)
                            }}
                        />
                    ))}
                </View>
            </SheetModal>
        </View>
    )
}

export default DebugSettings
