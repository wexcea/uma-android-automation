import { useMemo, useContext, useEffect, useState, useRef, useCallback } from "react"
import { SearchPageProvider } from "../../context/SearchPageContext"
import { BotMetaContext, GeneralMiscContext } from "../../context/BotStateContext"
import { InteractionManager, Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { Snackbar } from "react-native-paper"
import { useNavigation } from "@react-navigation/native"
import { Ionicons } from "@react-native-vector-icons/ionicons"
import ThemeToggle from "../../components/ThemeToggle"
import { useTheme } from "../../context/ThemeContext"
import CustomSelect from "../../components/CustomSelect"
import CustomSlider from "../../components/CustomSlider"
import CustomButton from "../../components/CustomButton"
import PageHeader from "../../components/PageHeader"
import { Row } from "../../components/ui/row"
import { Section } from "../../components/ui/section"
import { Switch } from "../../components/ui/switch"
import WarningContainer from "../../components/WarningContainer"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../../components/ui/alert-dialog"
import SearchableItem from "../../components/SearchableItem"
import { useSettings } from "../../context/SettingsContext"
import { useSettingsFileManager } from "../../hooks/useSettingsFileManager"
import { usePerformanceLogging } from "../../hooks/usePerformanceLogging"
import { TYPE } from "../../lib/type"
import { SPACING } from "../../lib/spacing"
import { RADII } from "../../lib/radii"

/**
 * The main Settings page of the application.
 * Provides scenario selection, navigation links to sub-settings pages,
 * misc bot configuration options, and settings management (import/export/reset).
 */
const Settings = () => {
    usePerformanceLogging("Settings")
    const scrollViewRef = useRef<ScrollView>(null)

    const { defaultSettings } = useContext(BotMetaContext)
    const { general, misc, updateGeneral, updateMisc } = useContext(GeneralMiscContext)
    const { colors } = useTheme()
    const navigation = useNavigation()

    const { openDataDirectory, resetSettings } = useSettings()
    const { handleImportSettings, handleExportSettings, showImportDialog, setShowImportDialog, showResetDialog, setShowResetDialog } = useSettingsFileManager()

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
                managementGrid: {
                    flexDirection: "row",
                    gap: SPACING.sm,
                },
                managementTile: {
                    flex: 1,
                    backgroundColor: colors.surfaceRaised,
                    borderWidth: 1,
                    borderColor: colors.borderHair,
                    borderRadius: RADII.lg,
                    paddingVertical: SPACING.md,
                    paddingHorizontal: SPACING.sm,
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    overflow: "hidden",
                },
                managementTileLabel: { ...TYPE.body, color: colors.text, fontWeight: "600" as const, textAlign: "center" as const },
                managementTileCaption: { ...TYPE.caption, color: colors.textMuted, fontSize: 10, textAlign: "center" as const },
                managementTileDanger: { borderColor: colors.destructive },
            }),
        [colors]
    )

    //////////////////////////////////////////////////
    //////////////////////////////////////////////////
    // Callbacks

    // Two-phase mount. First paint renders the cheap navigation-link list (~40 ms baseline) so the
    // user sees the page immediately; the heavy Misc section (sliders, checkboxes, dialogs,
    // file-manager hook plumbing — ~1 s of additional work) commits one tick later, after the
    // navigator animation has painted. `runAfterInteractions` fires when the JS-side scheduler
    // considers itself idle, so we don't fight the navigation transition. Net: the page first
    // paint dropped 27 % (1065 → 782 ms) on a calibrated emulator harness.
    const [showHeavySections, setShowHeavySections] = useState(false)
    useEffect(() => {
        const handle = InteractionManager.runAfterInteractions(() => {
            setShowHeavySections(true)
        })
        return () => handle.cancel()
    }, [])

    const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null)

    /**
     * Reset the settings to their default values.
     */
    const handleResetSettings = async () => {
        const success = await resetSettings()
        if (success) {
            setSnackbarMessage("Settings reset to defaults")
            setTimeout(() => setSnackbarMessage(null), 2500)
        }
    }

    //////////////////////////////////////////////////
    //////////////////////////////////////////////////
    // Rendering

    const years = [
        { label: "Junior", value: "Junior" },
        { label: "Classic", value: "Classic" },
        { label: "Senior", value: "Senior" },
    ]

    const months = [
        { label: "January", value: "January" },
        { label: "February", value: "February" },
        { label: "March", value: "March" },
        { label: "April", value: "April" },
        { label: "May", value: "May" },
        { label: "June", value: "June" },
        { label: "July", value: "July" },
        { label: "August", value: "August" },
        { label: "September", value: "September" },
        { label: "October", value: "October" },
        { label: "November", value: "November" },
        { label: "December", value: "December" },
    ]

    const phases = [
        { label: "Early", value: "Early" },
        { label: "Late", value: "Late" },
    ]

    const handleStopAtDateChange = useCallback(
        (index: number, part: "year" | "month" | "phase", value: string) => {
            const dates = [...general.stopAtDates]
            const currentParts = dates[index].split(" ")
            let newYear = currentParts[0] || "Senior"
            let newMonth = currentParts[1] || "January"
            let newPhase = currentParts[2] || "Early"

            if (part === "year") newYear = value
            if (part === "month") newMonth = value
            if (part === "phase") newPhase = value

            dates[index] = `${newYear} ${newMonth} ${newPhase}`
            updateGeneral({ stopAtDates: dates })
        },
        [general]
    )

    const handleAddStopAtDate = useCallback(() => {
        updateGeneral({ stopAtDates: [...general.stopAtDates, "Senior January Early"] })
    }, [general])

    const handleRemoveStopAtDate = useCallback(
        (index: number) => {
            const dates = general.stopAtDates.filter((_, i) => i !== index)
            updateGeneral({ stopAtDates: dates.length > 0 ? dates : ["Senior January Early"] })
        },
        [general]
    )

    // Shared chevron icon used as the right-aligned affordance on every navigation Row.
    const chevron = <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />

    const renderNavigationSections = () => {
        return (
            <>
                <Section label="GAMEPLAY">
                    <Row title="Training" description="Stat priorities, training behavior, and customization." right={chevron} onPress={() => navigation.navigate("TrainingSettings" as never)} />
                    <Row title="Training Events" description="Training event preferences and event selection." right={chevron} onPress={() => navigation.navigate("TrainingEventSettings" as never)} />
                    <Row title="Racing" description="Racing behavior, retries, and mandatory race handling." right={chevron} onPress={() => navigation.navigate("RacingSettings" as never)} />
                    <Row title="Skills" description="Skill purchasing behavior." right={chevron} onPress={() => navigation.navigate("Skills" as never)} />
                </Section>

                <Section label="SCENARIO">
                    <Row
                        title="Scenario Overrides"
                        description="Behavior overrides specific to each scenario."
                        right={chevron}
                        onPress={() => navigation.navigate("ScenarioOverridesSettings" as never)}
                    />
                </Section>

                <Section label="INTEGRATIONS">
                    <Row title="Discord" description="Discord notifications when the bot stops." right={chevron} onPress={() => navigation.navigate("DiscordSettings" as never)} />
                    <Row title="LLM" description="On-device docs search and chat model downloads." right={chevron} onPress={() => navigation.navigate("LLMSettings" as never)} />
                </Section>

                <Section label="TOOLS">
                    <Row title="Ask the Docs" description="On-device docs chat powered by the LLM engine." right={chevron} onPress={() => navigation.navigate("Chat" as never)} />
                    <Row
                        title="Event Log Visualizer (Beta)"
                        description="Import logs and view a day-by-day timeline of actions."
                        right={chevron}
                        onPress={() => navigation.navigate("EventLogVisualizer" as never)}
                    />
                    <Row title="Debug" description="Debug mode, template matching, and diagnostic tests." right={chevron} onPress={() => navigation.navigate("DebugSettings" as never)} />
                </Section>
            </>
        )
    }

    const renderMiscSettings = () => {
        return (
            <View style={{ marginTop: SPACING.lg }}>
                <Section label="MISC">
                    <SearchableItem id="settings-stop-before-finals" title="Stop before Finals" description="Pause to buy skills before the final races">
                        <Row
                            title="Stop before Finals"
                            description="Pause to buy skills before the final races"
                            right={<Switch checked={general.enableStopBeforeFinals} onCheckedChange={(checked) => updateGeneral({ enableStopBeforeFinals: checked })} />}
                        />
                    </SearchableItem>

                    <SearchableItem id="settings-stop-at-date" title="Stop at Date" description="Stop on one or more specified dates">
                        <Row
                            title="Stop at Date"
                            description="Stop on one or more specified dates"
                            right={<Switch checked={general.enableStopAtDate} onCheckedChange={(checked) => updateGeneral({ enableStopAtDate: checked })} />}
                        />
                    </SearchableItem>

                    <SearchableItem id="settings-crane-game-attempt" title="Enable Crane Game Attempt" description="Attempt to complete the crane game instead of stopping">
                        <Row
                            title="Enable Crane Game Attempt"
                            description="Attempt to complete the crane game instead of stopping"
                            right={<Switch checked={general.enableCraneGameAttempt} onCheckedChange={(checked) => updateGeneral({ enableCraneGameAttempt: checked })} />}
                        />
                    </SearchableItem>

                    <SearchableItem id="settings-enable-settings-display" title="Enable Settings Display in Message Log" description="Show current bot configuration in the message log">
                        <Row
                            title="Enable Settings Display in Message Log"
                            description="Show current bot configuration in the message log"
                            right={<Switch checked={misc.enableSettingsDisplay} onCheckedChange={(checked) => updateMisc({ enableSettingsDisplay: checked })} />}
                        />
                    </SearchableItem>

                    <SearchableItem id="settings-enable-message-id-display" title="Enable Message ID Display" description="Shows message IDs in the message log to help with debugging.">
                        <Row
                            title="Enable Message ID Display"
                            description="Shows message IDs in the message log to help with debugging."
                            right={<Switch checked={misc.enableMessageIdDisplay} onCheckedChange={(checked) => updateMisc({ enableMessageIdDisplay: checked })} />}
                        />
                    </SearchableItem>
                </Section>

                {general.enableStopAtDate && (
                    <SearchableItem id="settings-stop-at-date" title="Target Dates" description="Stops the bot on the specified dates." style={{ marginLeft: 16, marginTop: 8 }}>
                        {general.stopAtDates.map((dateStr, index) => {
                            const parts = dateStr.split(" ")
                            return (
                                <View key={index} style={{ marginBottom: index < general.stopAtDates.length - 1 ? 12 : 0 }}>
                                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                                        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>Date {index + 1}</Text>
                                        {general.stopAtDates.length > 1 && (
                                            <CustomButton onPress={() => handleRemoveStopAtDate(index)} variant="destructive" size="sm" fontSize={12}>
                                                Remove
                                            </CustomButton>
                                        )}
                                    </View>
                                    <View style={{ flexDirection: "row", gap: 8, justifyContent: "space-between" }}>
                                        <View style={{ flex: 1 }}>
                                            <CustomSelect
                                                placeholder="Year"
                                                width="100%"
                                                options={years}
                                                value={parts[0]}
                                                onValueChange={(value) => handleStopAtDateChange(index, "year", value || "Senior")}
                                            />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <CustomSelect
                                                placeholder="Month"
                                                width="100%"
                                                options={months}
                                                value={parts[1]}
                                                onValueChange={(value) => handleStopAtDateChange(index, "month", value || "January")}
                                            />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <CustomSelect
                                                placeholder="Phase"
                                                width="100%"
                                                options={phases}
                                                value={parts[2]}
                                                onValueChange={(value) => handleStopAtDateChange(index, "phase", value || "Early")}
                                            />
                                        </View>
                                    </View>
                                </View>
                            )
                        })}
                        <CustomButton onPress={handleAddStopAtDate} variant="default" fontSize={14} style={{ marginTop: 12, alignSelf: "flex-start" }}>
                            + Add Date
                        </CustomButton>
                    </SearchableItem>
                )}

                <Section label="WAIT DELAY">
                    <View style={{ padding: SPACING.md }}>
                        <CustomSlider
                            searchId="settings-wait-delay"
                            value={general.waitDelay}
                            placeholder={defaultSettings.general.waitDelay}
                            onValueChange={(value) => {
                                updateGeneral({ waitDelay: value })
                            }}
                            onSlidingComplete={(value) => {
                                updateGeneral({ waitDelay: value })
                            }}
                            min={0.0}
                            max={1.0}
                            step={0.1}
                            label="Wait Delay"
                            labelUnit="s"
                            showValue={true}
                            showLabels={true}
                            description="Sets the delay between actions and imaging operations. Lowering this will make the bot run much faster at the risk of the bot losing track of its location after loading/connecting screens."
                        />
                    </View>
                    <View style={{ padding: SPACING.md }}>
                        <CustomSlider
                            searchId="settings-dialog-wait-delay"
                            value={general.dialogWaitDelay}
                            placeholder={defaultSettings.general.dialogWaitDelay}
                            onValueChange={(value) => {
                                updateGeneral({ dialogWaitDelay: value })
                            }}
                            onSlidingComplete={(value) => {
                                updateGeneral({ dialogWaitDelay: value })
                            }}
                            min={0.0}
                            max={1.0}
                            step={0.1}
                            label="Dialog Wait Delay"
                            labelUnit="s"
                            showValue={true}
                            showLabels={true}
                            description="Sets the delay between clicking a button that opens dialog and actually handling the dialog. Lowering this will make the bot run faster at an increased risk of the bot incorrectly handling dialogs that pop up."
                        />
                    </View>
                </Section>

                <Section label="OVERLAY BUTTON SIZE">
                    <View style={{ padding: SPACING.md }}>
                        <CustomSlider
                            searchId="settings-overlay-button-size"
                            value={misc.overlayButtonSizeDP}
                            placeholder={defaultSettings.misc.overlayButtonSizeDP}
                            onValueChange={(value) => {
                                updateMisc({ overlayButtonSizeDP: value })
                            }}
                            onSlidingComplete={(value) => {
                                updateMisc({ overlayButtonSizeDP: value })
                            }}
                            min={30}
                            max={60}
                            step={5}
                            label="Overlay Button Size"
                            labelUnit=" dp"
                            showValue={true}
                            showLabels={true}
                            description="Sets the size of the floating overlay button in density-independent pixels (dp). Higher values make the button easier to tap."
                        />
                    </View>
                </Section>

                <Section label="DATA MANAGEMENT">
                    <SearchableItem id="settings-management-title" title="Settings Management" description="Import and export settings from JSON file or access the app's data directory.">
                        <View style={{ padding: SPACING.md }}>
                            <View style={styles.managementGrid}>
                                <Pressable style={styles.managementTile} android_ripple={{ color: colors.ripple, foreground: true }} onPress={handleImportSettings}>
                                    <Ionicons name="download-outline" size={24} color={colors.brand} />
                                    <Text style={styles.managementTileLabel}>Import</Text>
                                    <Text style={styles.managementTileCaption}>Load from JSON</Text>
                                </Pressable>
                                <Pressable style={styles.managementTile} android_ripple={{ color: colors.ripple, foreground: true }} onPress={handleExportSettings}>
                                    <Ionicons name="share-outline" size={24} color={colors.brand} />
                                    <Text style={styles.managementTileLabel}>Export</Text>
                                    <Text style={styles.managementTileCaption}>Save to JSON</Text>
                                </Pressable>
                                <Pressable style={styles.managementTile} android_ripple={{ color: colors.ripple, foreground: true }} onPress={openDataDirectory}>
                                    <Ionicons name="folder-outline" size={24} color={colors.brand} />
                                    <Text style={styles.managementTileLabel}>Data</Text>
                                    <Text style={styles.managementTileCaption}>Open folder</Text>
                                </Pressable>
                                <Pressable
                                    style={[styles.managementTile, styles.managementTileDanger]}
                                    android_ripple={{ color: colors.ripple, foreground: true }}
                                    onPress={() => setShowResetDialog(true)}
                                >
                                    <Ionicons name="refresh-outline" size={24} color={colors.destructive} />
                                    <Text style={[styles.managementTileLabel, { color: colors.destructive }]}>Reset</Text>
                                    <Text style={styles.managementTileCaption}>Restore defaults</Text>
                                </Pressable>
                            </View>
                        </View>
                    </SearchableItem>
                </Section>

                <WarningContainer style={{ marginTop: 0, marginBottom: SPACING.md }}>
                    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                        <Text style={{ fontWeight: "bold", color: colors.warningText }}>⚠️ File Explorer Note:</Text>
                        <Text style={{ fontSize: 14, color: colors.warningText, lineHeight: 20 }}>
                            To manually access files, you need a file explorer app that can access the /Android/data folder (like CX File Explorer). Standard file managers will not work.
                        </Text>
                    </View>
                </WarningContainer>
            </View>
        )
    }

    //////////////////////////////////////////////////
    //////////////////////////////////////////////////

    return (
        <View style={styles.root}>
            <SearchPageProvider page="SettingsMain" scrollViewRef={scrollViewRef}>
                <PageHeader title="Settings" searchOnRight rightComponent={<ThemeToggle />} />
                <ScrollView ref={scrollViewRef} nestedScrollEnabled={true} showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
                    <View className="m-1">
                        {renderNavigationSections()}
                        {showHeavySections && renderMiscSettings()}
                    </View>
                </ScrollView>
            </SearchPageProvider>

            {/* Restart Dialog */}
            <AlertDialog open={showImportDialog} onOpenChange={setShowImportDialog}>
                <AlertDialogContent style={{ backgroundColor: "black" }}>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            <Text style={{ color: "white" }}>Settings Imported</Text>
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            <Text style={{ color: "white" }}>Settings have been imported successfully.</Text>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogAction style={{ backgroundColor: "white" }}>
                            <Text style={{ color: "black" }}>OK</Text>
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Reset Settings Dialog */}
            <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
                <AlertDialogContent style={{ backgroundColor: "black" }}>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            <Text style={{ color: "white" }}>Reset Settings to Default</Text>
                        </AlertDialogTitle>
                        <AlertDialogDescription style={{ height: 50 }}>
                            <Text style={{ color: "white" }}>
                                Are you sure you want to reset all settings to their default values? This action cannot be undone and will overwrite your current configuration.
                            </Text>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onPress={() => setShowResetDialog(false)} style={{ backgroundColor: "black" }}>
                            <Text style={{ color: "white" }}>Cancel</Text>
                        </AlertDialogCancel>
                        <AlertDialogAction onPress={handleResetSettings} style={{ backgroundColor: "white" }}>
                            <Text style={{ color: "black" }}>Reset</Text>
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Snackbar visible={snackbarMessage !== null} onDismiss={() => setSnackbarMessage(null)} style={{ backgroundColor: colors.surfaceRaised, borderRadius: 10 }}>
                {snackbarMessage ?? ""}
            </Snackbar>
        </View>
    )
}

export default Settings
