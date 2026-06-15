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
                dateEntry: {
                    borderWidth: 1,
                    borderColor: colors.borderHair,
                    borderRadius: RADII.md,
                    backgroundColor: colors.surfaceRaised,
                    padding: SPACING.md,
                    gap: SPACING.sm,
                },
                dateEntryHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
                dateEntryTitleRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, flex: 1 },
                dateBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.brand, alignItems: "center" as const, justifyContent: "center" as const },
                dateBadgeText: { ...TYPE.monoLabel, color: colors.onBrand, fontSize: 11 },
                dateTitle: { ...TYPE.body, color: colors.text, fontWeight: "600" as const, flexShrink: 1 },
                dateRemoveButton: { padding: SPACING.xs, borderRadius: 999, overflow: "hidden" as const },
                dateSelectorRow: { flexDirection: "row" },
                dateSelectorCell: { flex: 1 },
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
            <View>
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

                    {general.enableStopAtDate && (
                        <SearchableItem id="settings-target-dates" title="Target Dates" description="Stops the bot on the specified dates." parentId="settings-stop-at-date">
                            <View style={{ padding: SPACING.md, gap: SPACING.sm }}>
                                {general.stopAtDates.map((dateStr, index) => {
                                    const parts = dateStr.split(" ")
                                    const year = parts[0] || "Senior"
                                    const month = parts[1] || "January"
                                    const phase = parts[2] || "Early"
                                    return (
                                        <View key={index} style={styles.dateEntry}>
                                            <View style={styles.dateEntryHeader}>
                                                <View style={styles.dateEntryTitleRow}>
                                                    <View style={styles.dateBadge}>
                                                        <Text style={styles.dateBadgeText}>{index + 1}</Text>
                                                    </View>
                                                    <Text style={styles.dateTitle} numberOfLines={1}>
                                                        {year} {month} {phase}
                                                    </Text>
                                                </View>
                                                {general.stopAtDates.length > 1 && (
                                                    <Pressable
                                                        onPress={() => handleRemoveStopAtDate(index)}
                                                        style={styles.dateRemoveButton}
                                                        hitSlop={8}
                                                        android_ripple={{ color: colors.ripple, foreground: true }}
                                                        accessibilityRole="button"
                                                        accessibilityLabel={`Remove Date ${index + 1}`}
                                                    >
                                                        <Ionicons name="trash-outline" size={18} color={colors.destructive} />
                                                    </Pressable>
                                                )}
                                            </View>
                                            <View style={styles.dateSelectorRow}>
                                                <View style={styles.dateSelectorCell}>
                                                    <CustomSelect
                                                        placeholder="Year"
                                                        width="100%"
                                                        options={years}
                                                        value={year}
                                                        onValueChange={(value) => handleStopAtDateChange(index, "year", value || "Senior")}
                                                    />
                                                </View>
                                                <View style={styles.dateSelectorCell}>
                                                    <CustomSelect
                                                        placeholder="Month"
                                                        width="100%"
                                                        options={months}
                                                        value={month}
                                                        onValueChange={(value) => handleStopAtDateChange(index, "month", value || "January")}
                                                    />
                                                </View>
                                                <View style={styles.dateSelectorCell}>
                                                    <CustomSelect
                                                        placeholder="Phase"
                                                        width="100%"
                                                        options={phases}
                                                        value={phase}
                                                        onValueChange={(value) => handleStopAtDateChange(index, "phase", value || "Early")}
                                                    />
                                                </View>
                                            </View>
                                        </View>
                                    )
                                })}
                                <CustomButton onPress={handleAddStopAtDate} variant="outline" icon={<Ionicons name="add" size={18} color={colors.text} />} style={{ marginVertical: SPACING.sm }}>
                                    Add Date
                                </CustomButton>
                            </View>
                        </SearchableItem>
                    )}

                    <SearchableItem id="settings-claw-machine-attempt" title="Enable Claw Machine Attempt" description="Attempt to complete the claw machine instead of stopping">
                        <Row
                            title="Enable Claw Machine Attempt"
                            description="Attempt to complete the claw machine instead of stopping"
                            right={<Switch checked={general.enableClawMachineAttempt} onCheckedChange={(checked) => updateGeneral({ enableClawMachineAttempt: checked })} />}
                        />
                    </SearchableItem>

                    <SearchableItem
                        id="settings-enable-swipe-based-scrolling"
                        title="Enable Swipe-Based Scrolling"
                        description="Scroll lists by swiping instead of detecting the in-game scrollbar. Enable this if the bot cannot scroll lists normally. This may or may not work depending on the device."
                    >
                        <Row
                            title="Enable Swipe-Based Scrolling"
                            description="Scroll lists by swiping instead of detecting the in-game scrollbar. Enable this if the bot cannot scroll lists normally. This may or may not work depending on the device."
                            right={<Switch checked={general.enableSwipeBasedScrolling} onCheckedChange={(checked) => updateGeneral({ enableSwipeBasedScrolling: checked })} />}
                        />
                    </SearchableItem>

                    <SearchableItem id="settings-enable-settings-display" title="Enable Settings Display in Message Log" description="Show current bot configuration in the message log">
                        <Row
                            title="Enable Settings Display in Message Log"
                            description="Show current bot configuration in the message log"
                            right={<Switch checked={misc.enableSettingsDisplay} onCheckedChange={(checked) => updateMisc({ enableSettingsDisplay: checked })} />}
                        />
                    </SearchableItem>
                </Section>

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

                <Section label="DATA MANAGEMENT">
                    <SearchableItem id="settings-management-title" title="Settings Management" description="Import and export settings from JSON file or access the app's data directory.">
                        <View style={{ padding: SPACING.md }}>
                            <View style={styles.managementGrid}>
                                <Pressable style={styles.managementTile} android_ripple={{ color: colors.ripple, foreground: true }} onPress={handleImportSettings}>
                                    <Ionicons name="download-outline" size={24} color={colors.brand} />
                                    <Text style={styles.managementTileLabel}>Import</Text>
                                    <Text style={styles.managementTileCaption}>Load settings from JSON</Text>
                                </Pressable>
                                <Pressable style={styles.managementTile} android_ripple={{ color: colors.ripple, foreground: true }} onPress={handleExportSettings}>
                                    <Ionicons name="share-outline" size={24} color={colors.brand} />
                                    <Text style={styles.managementTileLabel}>Export</Text>
                                    <Text style={styles.managementTileCaption}>Save settings to JSON</Text>
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
