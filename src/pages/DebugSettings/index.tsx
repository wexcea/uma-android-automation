import { useMemo, useContext, useRef, useState, useEffect } from "react"
import { View, Text, ScrollView, StyleSheet, NativeModules, Linking, AppState, AppStateStatus } from "react-native"
import { useTheme } from "../../context/ThemeContext"
import { DebugContext, BotMetaContext } from "../../context/BotStateContext"
import CustomSlider from "../../components/CustomSlider"
import CustomCheckbox from "../../components/CustomCheckbox"
import CustomSelect from "../../components/CustomSelect"
import { Separator } from "../../components/ui/separator"
import PageHeader from "../../components/PageHeader"
import WarningContainer from "../../components/WarningContainer"
import InfoContainer from "../../components/InfoContainer"
import CustomButton from "../../components/CustomButton"
import SearchableItem from "../../components/SearchableItem"
import { SearchPageProvider } from "../../context/SearchPageContext"
import { usePerformanceLogging } from "../../hooks/usePerformanceLogging"
import { Section } from "../../components/ui/section"
import { TYPE } from "../../lib/type"
import { SPACING } from "../../lib/spacing"

/**
 * The Debug Settings page.
 * Provides controls for debug mode, template matching confidence/scale, screen recording settings (bit rate, frame rate, resolution), and
 * diagnostic tests (template matching, OCR, date, race list, aptitudes).
 */
const DebugSettings = () => {
    usePerformanceLogging("DebugSettings")
    const { colors } = useTheme()
    const { debug, updateDebug } = useContext(DebugContext)
    const { defaultSettings } = useContext(BotMetaContext)
    const scrollViewRef = useRef<ScrollView>(null)

    /** List of all diagnostic debug test property names in debug. */
    const debugTestKeys = [
        "debugMode_startTemplateMatchingTest",
        "debugMode_startSingleTrainingOCRTest",
        "debugMode_startComprehensiveTrainingOCRTest",
        "debugMode_startRaceListDetectionTest",
        "debugMode_startMainScreenUpdateTest",
        "debugMode_startSkillListBuyTest",
        "debugMode_startScrollBarDetectionTest",
        "debugMode_startTrackblazerRaceSelectionTest",
        "debugMode_startTrackblazerInventorySyncTest",
        "debugMode_startTrackblazerBuyItemsTest",
    ] as const

    /**
     * Handles mutual exclusivity for diagnostic debug tests.
     * When one test is enabled, all others are automatically disabled.
     *
     * @param key The settings key of the test being toggled.
     * @param checked The new checked state.
     */
    const handleDebugTestToggle = (key: (typeof debugTestKeys)[number], checked: boolean) => {
        if (checked) {
            // Create updates for all debug test keys, setting only the target one to true.
            const updates = debugTestKeys.reduce((acc, currentKey) => {
                acc[currentKey] = currentKey === key
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

    /** Checks with the native module if the Accessibility Service is currently running. */
    const checkAccessibilityStatus = () => {
        setIsRefreshing(true)
        const startTime = Date.now()

        NativeModules.StartModule.getAccessibilityStatus()
            .then((status: { enabled: boolean; active: boolean }) => {
                const elapsedTime = Date.now() - startTime
                const remainingTime = Math.max(0, 200 - elapsedTime)

                setTimeout(() => {
                    setAccessibilityStatus(status)
                    setIsRefreshing(false)
                }, remainingTime)
            })
            .catch(() => {
                const elapsedTime = Date.now() - startTime
                const remainingTime = Math.max(0, 200 - elapsedTime)

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
                root: {
                    flex: 1,
                    flexDirection: "column",
                    justifyContent: "center",
                    margin: 10,
                    backgroundColor: colors.bg,
                },
                infoBlock: {
                    marginTop: 12,
                },
                infoLabel: {
                    fontWeight: "bold",
                    color: colors.text,
                    fontSize: 14,
                    lineHeight: 22,
                    includeFontPadding: false,
                },
                infoDescription: {
                    fontSize: 14,
                    color: colors.text,
                    opacity: 0.7,
                    lineHeight: 22,
                    includeFontPadding: false,
                    marginTop: 2,
                },
            }),
        [colors]
    )

    return (
        <View style={styles.root}>
            <SearchPageProvider page="DebugSettings" scrollViewRef={scrollViewRef}>
                <ScrollView
                    ref={scrollViewRef}
                    stickyHeaderIndices={[0]}
                    nestedScrollEnabled={true}
                    showsVerticalScrollIndicator={false}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ flexGrow: 1 }}
                >
                    <PageHeader title="Debug Settings" />
                    <View className="m-1">
                        <View style={{ marginTop: 16 }}>
                            {/* Enable Debug Mode Checkbox */}
                            <CustomCheckbox
                                searchId="enable-debug-mode"
                                checked={debug.enableDebugMode}
                                onCheckedChange={(checked) => {
                                    updateDebug({ enableDebugMode: checked })
                                }}
                                label="Enable Debug Mode"
                                description="Allows debugging messages in the log and test images to be created in the /temp/ folder."
                            />

                            {debug.enableDebugMode && (
                                <WarningContainer style={{ marginTop: 8 }}>⚠️ Significantly extends the average runtime of the bot due to increased IO operations.</WarningContainer>
                            )}

                            {/* Template Match Confidence Slider */}
                            <CustomSlider
                                searchId="template-match-confidence"
                                value={debug.templateMatchConfidence}
                                placeholder={defaultSettings.debug.templateMatchConfidence}
                                onValueChange={(value) => {
                                    updateDebug({ templateMatchConfidence: value })
                                }}
                                onSlidingComplete={(value) => {
                                    updateDebug({ templateMatchConfidence: value })
                                }}
                                min={0.5}
                                max={1.0}
                                step={0.01}
                                label="Adjust Confidence for Template Matching"
                                labelUnit=""
                                showValue={true}
                                showLabels={true}
                                description="Sets the minimum confidence level for template matching with 1080p as the baseline. Consider lowering this to something like 0.7 or 70% at lower resolutions. Making it too low will cause the bot to match on too many things as false positives."
                            />

                            {/* Template Match Custom Scale Slider */}
                            <CustomSlider
                                searchId="template-match-custom-scale"
                                value={debug.templateMatchCustomScale}
                                placeholder={defaultSettings.debug.templateMatchCustomScale}
                                onValueChange={(value) => {
                                    updateDebug({ templateMatchCustomScale: value })
                                }}
                                onSlidingComplete={(value) => {
                                    updateDebug({ templateMatchCustomScale: value })
                                }}
                                min={0.5}
                                max={3.0}
                                step={0.01}
                                label="Set the Custom Image Scale for Template Matching"
                                labelUnit=""
                                showValue={true}
                                showLabels={true}
                                description="Manually set the scale to do template matching. The Basic Template Matching Test can help find your recommended scale. Making it too low or too high will cause the bot to match on too little or too many things as false positives."
                            />

                            {/* OCR Threshold Slider */}
                            <CustomSlider
                                searchId="ocr-threshold"
                                value={debug.ocrThreshold}
                                placeholder={defaultSettings.debug.ocrThreshold}
                                onValueChange={(value: number) => {
                                    updateDebug({ ocrThreshold: value })
                                }}
                                onSlidingComplete={(value: number) => {
                                    updateDebug({ ocrThreshold: value })
                                }}
                                min={100}
                                max={255}
                                step={5}
                                label="OCR Threshold"
                                labelUnit=""
                                showValue={true}
                                showLabels={true}
                                description="The brightness threshold used to distinguish text from the background during OCR. Note: This setting does not affect high-precision features like Stat Detection or Training Failure Chance detection, as they use specialized processing."
                            />

                            <Separator style={{ marginVertical: 16 }} />

                            <Section label="Remote Log Viewer">
                                <View style={{ paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md }}>
                                    <Text style={[TYPE.caption, { color: colors.textMuted, marginBottom: SPACING.md }]}>
                                        Stream logs in real-time to a browser on your local network. Both devices must be on the same WiFi.
                                    </Text>

                                    <CustomCheckbox
                                        searchId="settings-enable-remote-log-viewer"
                                        checked={debug.enableRemoteLogViewer}
                                        onCheckedChange={(checked) => {
                                            updateDebug({ enableRemoteLogViewer: checked })
                                        }}
                                        label="Enable Remote Log Viewer"
                                        description="Starts an HTTP server on this device when the bot runs. Open the URL shown below in a browser on your computer to view logs in real-time."
                                    />

                                    <View style={debug.enableRemoteLogViewer ? {} : { display: "none" }}>
                                        <CustomSlider
                                            searchId="settings-remote-log-viewer-port"
                                            searchCondition={debug.enableRemoteLogViewer}
                                            parentId="settings-enable-remote-log-viewer"
                                            value={debug.remoteLogViewerPort}
                                            placeholder={defaultSettings.debug.remoteLogViewerPort}
                                            onValueChange={(value) => {
                                                updateDebug({ remoteLogViewerPort: value })
                                            }}
                                            onSlidingComplete={(value) => {
                                                updateDebug({ remoteLogViewerPort: value })
                                            }}
                                            min={1024}
                                            max={65535}
                                            step={1}
                                            showValue={true}
                                            showLabels={true}
                                            label="Server Port"
                                            description="Port number for the log stream server. Change only if the default conflicts with another service."
                                        />

                                        <InfoContainer>
                                            <View>
                                                <Text style={styles.infoDescription}>📡 When the bot is running, open this URL in a browser:</Text>
                                                <Text
                                                    style={[styles.infoLabel, { marginTop: 8, textDecorationLine: "underline" }, TYPE.monoValue]}
                                                    onPress={() => Linking.openURL(`http://${deviceIp === "10.0.2.15" ? "localhost" : deviceIp}:${debug.remoteLogViewerPort}`)}
                                                >
                                                    http://{deviceIp === "10.0.2.15" ? "localhost" : deviceIp}:{debug.remoteLogViewerPort}
                                                </Text>
                                                <Text style={[styles.infoDescription, { marginTop: 8 }]}>Both devices must be on the same WiFi network.</Text>
                                                <Text style={[styles.infoDescription, { marginTop: 8 }]}>
                                                    Note that connecting to the remote log viewer may take a minute or two to establish the connection for the first time.
                                                </Text>

                                                <View style={styles.infoBlock}>
                                                    {deviceIp === "10.0.2.15" ? (
                                                        <>
                                                            <Text style={styles.infoLabel}>⚠️ Emulator detected!</Text>
                                                            <Text style={styles.infoDescription}>
                                                                Direct connection to the virtual IP <Text style={[TYPE.monoValue, { color: colors.text }]}>{deviceIp}</Text> will fail.
                                                            </Text>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Text style={styles.infoLabel}>✅ Real device detected or Network Bridge enabled!</Text>
                                                            <Text style={styles.infoDescription}>
                                                                Direct connection to the IP <Text style={[TYPE.monoValue, { color: colors.text }]}>{deviceIp}</Text> should work.
                                                            </Text>
                                                        </>
                                                    )}
                                                </View>

                                                <Separator style={{ marginTop: 16, backgroundColor: "white" }} />

                                                <Text style={[styles.infoLabel, { marginTop: 16 }]}>If using an Emulator, you have two connection options:</Text>

                                                <View style={styles.infoBlock}>
                                                    <Text style={styles.infoLabel}>Option 1:</Text>
                                                    <Text style={styles.infoDescription}>
                                                        In your Emulator settings, enable "Network Bridging" or the equivalent, and restart the emulator to get a real IP.
                                                    </Text>
                                                </View>

                                                <View style={styles.infoBlock}>
                                                    <Text style={styles.infoLabel}>Option 2 (Access on Computer only):</Text>
                                                    <Text style={styles.infoDescription}>Run these commands on your computer (port may vary) to use your emulator's localhost URL:</Text>
                                                    <Text style={[styles.infoLabel, { marginTop: 8 }, TYPE.monoValue]}>
                                                        adb connect localhost:5555{"\n"}
                                                        adb forward tcp:{debug.remoteLogViewerPort} tcp:{debug.remoteLogViewerPort}
                                                    </Text>
                                                </View>
                                            </View>
                                        </InfoContainer>
                                    </View>
                                </View>
                            </Section>

                            <Separator style={{ marginVertical: 16 }} />

                            <Section label="Screen Recording Settings">
                                <View style={{ paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md }}>
                                    <Text style={[TYPE.caption, { color: colors.textMuted, marginBottom: SPACING.md }]}>Configure the quality settings for screen recording.</Text>

                                    {/* Enable Screen Recording Checkbox */}
                                    <CustomCheckbox
                                        searchId="enable-screen-recording"
                                        checked={debug.enableScreenRecording}
                                        onCheckedChange={(checked) => {
                                            updateDebug({ enableScreenRecording: checked })
                                        }}
                                        label="Enable Screen Recording"
                                        description="Records the screen while the bot is running. The mp4 file will be saved to the /recordings folder of the app's data directory. Note that performance and battery life may be impacted while recording."
                                    />

                                    {/* Recording Bit Rate Slider */}
                                    <CustomSlider
                                        searchId="recording-bit-rate"
                                        searchCondition={debug.enableScreenRecording}
                                        parentId="enable-screen-recording"
                                        value={debug.recordingBitRate}
                                        placeholder={defaultSettings.debug.recordingBitRate}
                                        onValueChange={(value) => {
                                            updateDebug({ recordingBitRate: value })
                                        }}
                                        onSlidingComplete={(value) => {
                                            updateDebug({ recordingBitRate: value })
                                        }}
                                        min={1}
                                        max={20}
                                        step={1}
                                        label="Recording Quality (Bit Rate)"
                                        labelUnit=" Mbps"
                                        showValue={true}
                                        showLabels={true}
                                        description="Sets the video bit rate for screen recording. Higher values produce better quality but larger file sizes."
                                    />

                                    {/* Recording Frame Rate Select */}
                                    <CustomSelect
                                        searchId="recording-frame-rate"
                                        searchCondition={debug.enableScreenRecording}
                                        parentId="enable-screen-recording"
                                        value={debug.recordingFrameRate.toString()}
                                        options={[
                                            { value: "30", label: "30 FPS" },
                                            { value: "60", label: "60 FPS" },
                                        ]}
                                        onValueChange={(value) => {
                                            if (value) {
                                                updateDebug({ recordingFrameRate: parseInt(value, 10) })
                                            }
                                        }}
                                        label="Recording Frame Rate"
                                        description="Sets the frame rate for screen recording."
                                        placeholder="Select Frame Rate for Recording"
                                        style={{ marginTop: 8, marginBottom: 16 }}
                                    />

                                    {/* Recording Resolution Scale Slider */}
                                    <CustomSlider
                                        searchId="recording-resolution-scale"
                                        searchCondition={debug.enableScreenRecording}
                                        parentId="enable-screen-recording"
                                        value={debug.recordingResolutionScale}
                                        placeholder={defaultSettings.debug.recordingResolutionScale}
                                        onValueChange={(value) => {
                                            updateDebug({ recordingResolutionScale: value })
                                        }}
                                        onSlidingComplete={(value) => {
                                            updateDebug({ recordingResolutionScale: value })
                                        }}
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

                            <Separator style={{ marginVertical: 16 }} />

                            <SearchableItem
                                id="debug-accessibility-service-check"
                                title="Accessibility Service Check"
                                description="The Accessibility Service allows the bot to perform clicks and gestures on your behalf."
                            >
                                <Section label="Accessibility Service Check">
                                    <View style={{ paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md }}>
                                        <Text style={[TYPE.caption, { color: colors.textMuted, marginBottom: SPACING.md }]}>
                                            The Accessibility Service allows the bot to perform clicks and gestures on your behalf.
                                        </Text>
                                        <InfoContainer style={{ marginTop: 0 }}>
                                            <View>
                                                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                                                    <Text style={styles.infoLabel}>System Enabled: </Text>
                                                    <Text style={[styles.infoLabel, { color: accessibilityStatus?.enabled ? colors.success : colors.error }]}>
                                                        {accessibilityStatus === null ? "Checking..." : accessibilityStatus.enabled ? "✅ Registered" : "❌ Not Enabled"}
                                                    </Text>
                                                </View>
                                                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                                                    <Text style={styles.infoLabel}>Internal State: </Text>
                                                    <Text style={[styles.infoLabel, { color: accessibilityStatus?.active ? colors.success : colors.error }]}>
                                                        {accessibilityStatus === null ? "Checking..." : accessibilityStatus.active ? "✅ Ready" : "❌ Not Initialized"}
                                                    </Text>
                                                </View>

                                                {accessibilityStatus?.enabled && !accessibilityStatus?.active && (
                                                    <Text style={styles.infoDescription}>
                                                        The service is enabled but it seems Android killed it in the background. Toggling it off and back on in settings will restart it.
                                                    </Text>
                                                )}

                                                <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                                                    <CustomButton variant="outline" onPress={() => checkAccessibilityStatus()} isLoading={isRefreshing} disabled={isRefreshing}>
                                                        Refresh Status
                                                    </CustomButton>
                                                    <CustomButton variant="default" onPress={() => NativeModules.StartModule.openAccessibilitySettings()}>
                                                        Open Settings
                                                    </CustomButton>
                                                </View>
                                            </View>
                                        </InfoContainer>
                                    </View>
                                </Section>
                            </SearchableItem>

                            <SearchableItem
                                id="debug-overlay-permission-check"
                                title="Overlay Permission Check"
                                description="The Overlay (Display over other apps) permission allows the bot to render its on-screen control overlay."
                            >
                                <Section label="Overlay Permission Check">
                                    <View style={{ paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md }}>
                                        <Text style={[TYPE.caption, { color: colors.textMuted, marginBottom: SPACING.md }]}>
                                            The Overlay (Display over other apps) permission allows the bot to render its on-screen control overlay.
                                        </Text>
                                        <InfoContainer style={{ marginTop: 0 }}>
                                            <View>
                                                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                                                    <Text style={styles.infoLabel}>Display over other apps: </Text>
                                                    <Text style={[styles.infoLabel, { color: overlayStatus?.enabled ? colors.success : colors.error }]}>
                                                        {overlayStatus === null ? "Checking..." : overlayStatus.enabled ? "✅ Granted" : "❌ Not Granted"}
                                                    </Text>
                                                </View>

                                                <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                                                    <CustomButton variant="outline" onPress={() => checkOverlayStatus()} isLoading={isRefreshingOverlay} disabled={isRefreshingOverlay}>
                                                        Refresh Status
                                                    </CustomButton>
                                                    <CustomButton variant="default" onPress={() => NativeModules.StartModule.openOverlaySettings()}>
                                                        Open Settings
                                                    </CustomButton>
                                                </View>
                                            </View>
                                        </InfoContainer>
                                    </View>
                                </Section>
                            </SearchableItem>

                            <SearchableItem
                                id="debug-battery-optimization-check"
                                title="Battery Optimization Check"
                                description="Disabling battery optimization for this app prevents Android from killing the bot during long-running automation runs."
                            >
                                <Section label="Battery Optimization Check">
                                    <View style={{ paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md }}>
                                        <Text style={[TYPE.caption, { color: colors.textMuted, marginBottom: SPACING.md }]}>
                                            Disabling battery optimization for this app prevents Android from killing the bot during long-running automation runs.
                                        </Text>
                                        <InfoContainer style={{ marginTop: 0 }}>
                                            <View>
                                                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                                                    <Text style={styles.infoLabel}>Ignoring battery optimization: </Text>
                                                    <Text style={[styles.infoLabel, { color: batteryStatus?.enabled ? colors.success : colors.error }]}>
                                                        {batteryStatus === null ? "Checking..." : batteryStatus.enabled ? "✅ Yes" : "❌ No"}
                                                    </Text>
                                                </View>

                                                <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                                                    <CustomButton variant="outline" onPress={() => checkBatteryStatus()} isLoading={isRefreshingBattery} disabled={isRefreshingBattery}>
                                                        Refresh Status
                                                    </CustomButton>
                                                    <CustomButton variant="default" onPress={() => NativeModules.StartModule.openBatteryOptimizationSettings()}>
                                                        Open Settings
                                                    </CustomButton>
                                                </View>
                                            </View>
                                        </InfoContainer>
                                    </View>
                                </Section>
                            </SearchableItem>

                            <Separator style={{ marginVertical: 16 }} />

                            <Section label="Debug Tests">
                                <View style={{ paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md }}>
                                    <Text style={[TYPE.caption, { color: colors.textMuted, marginBottom: SPACING.md }]}>
                                        Run diagnostic tests to verify template matching and OCR functionality. Only one test can be enabled at a time.
                                    </Text>

                                    {/* Warning message for debug tests */}
                                    <WarningContainer style={{ marginBottom: 16 }}>
                                        {
                                            "⚠️ Only one debug test can be enabled at a time. Enabling a test will automatically disable the others.\n\nHaving Debug Mode enabled will output more helpful logs."
                                        }
                                    </WarningContainer>

                                    {/* Checkboxes for enabling Debug Tests */}
                                    <CustomCheckbox
                                        searchId="debug-template-matching-test"
                                        checked={debug.debugMode_startTemplateMatchingTest}
                                        onCheckedChange={(checked) => handleDebugTestToggle("debugMode_startTemplateMatchingTest", checked)}
                                        label="Start Basic Template Matching Test"
                                        description="Disables normal bot operations and starts the template match test. Only on the Home screen and will check if it can find certain essential buttons on the screen. It will also output what scale it had the most success with."
                                        style={{ marginTop: 10 }}
                                    />

                                    <CustomCheckbox
                                        searchId="debug-single-training-ocr-test"
                                        checked={debug.debugMode_startSingleTrainingOCRTest}
                                        onCheckedChange={(checked) => handleDebugTestToggle("debugMode_startSingleTrainingOCRTest", checked)}
                                        label="Start Single Training OCR Test"
                                        description="Disables normal bot operations and starts the single training OCR test. Only on the Training screen and tests the current training on display for stat gains and failure chances."
                                        style={{ marginTop: 10 }}
                                    />

                                    <CustomCheckbox
                                        searchId="debug-comprehensive-training-ocr-test"
                                        checked={debug.debugMode_startComprehensiveTrainingOCRTest}
                                        onCheckedChange={(checked) => handleDebugTestToggle("debugMode_startComprehensiveTrainingOCRTest", checked)}
                                        label="Start Comprehensive Training OCR Test"
                                        description="Disables normal bot operations and starts the comprehensive training OCR test. Only on the Training screen and tests all 5 trainings for their stat gains and failure chances."
                                        style={{ marginTop: 10 }}
                                    />

                                    <CustomCheckbox
                                        searchId="debug-race-list-detection-test"
                                        checked={debug.debugMode_startRaceListDetectionTest}
                                        onCheckedChange={(checked) => handleDebugTestToggle("debugMode_startRaceListDetectionTest", checked)}
                                        label="Start Race List Detection Test"
                                        description="Disables normal bot operations and starts the Race List detection test. Only on the Race List screen and tests detecting the races with double star predictions currently on display."
                                        style={{ marginTop: 10 }}
                                    />

                                    <CustomCheckbox
                                        searchId="debug-main-screen-update-test"
                                        checked={debug.debugMode_startMainScreenUpdateTest}
                                        onCheckedChange={(checked) => handleDebugTestToggle("debugMode_startMainScreenUpdateTest", checked)}
                                        label="Start Main Screen Update Test"
                                        description="Disables normal bot operations and starts the Main Screen update test. This test will go through all Main Screen updates and then print the Trainee information."
                                        style={{ marginTop: 10 }}
                                    />

                                    <CustomCheckbox
                                        searchId="debug-skill-list-buy-test"
                                        checked={debug.debugMode_startSkillListBuyTest}
                                        onCheckedChange={(checked) => handleDebugTestToggle("debugMode_startSkillListBuyTest", checked)}
                                        label="Start Skill List Buy Test"
                                        description="Processes the list of skills in the Skills screen, reads all skills in the list, logs a summary and then logs another summary of which skills it will buy to bring down the current Skill Points as close to zero as possible and then it will stop there without actually doing the buying."
                                        style={{ marginTop: 10 }}
                                    />

                                    <CustomCheckbox
                                        searchId="debug-scrollbar-detection-test"
                                        checked={debug.debugMode_startScrollBarDetectionTest}
                                        onCheckedChange={(checked) => handleDebugTestToggle("debugMode_startScrollBarDetectionTest", checked)}
                                        label="Start Scrollbar Detection Test"
                                        description="Disables normal bot operations and starts the Scrollbar detection test. Detects the scrollbar on the current screen and attempts to scroll it up and down to verify functionality."
                                        style={{ marginTop: 10 }}
                                    />

                                    <CustomCheckbox
                                        searchId="debug-trackblazer-race-selection-test"
                                        checked={debug.debugMode_startTrackblazerRaceSelectionTest}
                                        onCheckedChange={(checked) => handleDebugTestToggle("debugMode_startTrackblazerRaceSelectionTest", checked)}
                                        label="Start Trackblazer Race Selection Test"
                                        description="Disables normal bot operations and starts the Trackblazer race selection test. Navigates to the Race List if on the Main Screen and identifies the best race to run, including Rivals."
                                        style={{ marginTop: 10 }}
                                    />

                                    <CustomCheckbox
                                        searchId="debug-trackblazer-inventory-sync-test"
                                        checked={debug.debugMode_startTrackblazerInventorySyncTest}
                                        onCheckedChange={(checked) => handleDebugTestToggle("debugMode_startTrackblazerInventorySyncTest", checked)}
                                        label="Start Trackblazer Inventory Sync Test"
                                        description="Disables normal bot operations and starts the Trackblazer inventory sync test. Opens the Training Items dialog if on the Main Screen and logs inventory contents and quick-use intentions."
                                        style={{ marginTop: 10 }}
                                    />

                                    <CustomCheckbox
                                        searchId="debug-trackblazer-buy-items-test"
                                        checked={debug.debugMode_startTrackblazerBuyItemsTest}
                                        onCheckedChange={(checked) => handleDebugTestToggle("debugMode_startTrackblazerBuyItemsTest", checked)}
                                        label="Start Trackblazer Buy Items Test"
                                        description="Disables normal bot operations and starts the Trackblazer buy items test. Opens the Shop if on the Main Screen and logs shop contents and purchase intentions without actually buying anything."
                                        style={{ marginTop: 10 }}
                                    />
                                </View>
                            </Section>
                        </View>
                    </View>
                </ScrollView>
            </SearchPageProvider>
        </View>
    )
}

export default DebugSettings
