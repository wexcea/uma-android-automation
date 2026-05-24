import React, { useMemo, useContext, useEffect, useState, useRef, useCallback } from "react"
import { View, Text, ScrollView, StyleSheet, Pressable, InteractionManager } from "react-native"
import { SheetModal } from "../../components/ui/sheet-modal"
import { ModalCheckRow, ModalFooterChip } from "../../components/ui/modal-list"
import Ionicons from "@react-native-vector-icons/ionicons"
import { Snackbar } from "react-native-paper"
import { useTheme } from "../../context/ThemeContext"
import { TrainingContext, GeneralMiscContext, BotMetaContext, defaultSettings, Settings } from "../../context/BotStateContext"
import CustomSlider from "../../components/CustomSlider"
import CustomCheckbox from "../../components/CustomCheckbox"
import DraggablePriorityList from "../../components/DraggablePriorityList"
import CustomSelect from "../../components/CustomSelect"
import ProfileSelector from "../../components/ProfileSelector"
import { useSettings } from "../../context/SettingsContext"
import { useProfileManager } from "../../hooks/useProfileManager"
import { applyMigrations } from "../../hooks/useSettingsManager"
import { databaseManager } from "../../lib/database"
import PageHeader from "../../components/PageHeader"
import { SearchPageProvider } from "../../context/SearchPageContext"
import SearchableItem from "../../components/SearchableItem"
import { usePerformanceLogging } from "../../hooks/usePerformanceLogging"
import { shallowArrayEqual } from "../../lib/utils"
import WarningContainer from "../../components/WarningContainer"
import { Row } from "../../components/ui/row"
import { Section } from "../../components/ui/section"
import { Switch } from "../../components/ui/switch"
import { useModalShellStyles } from "../../components/ui/modal-shell-styles"
import { TYPE } from "../../lib/type"
import { SPACING } from "../../lib/spacing"
import { RADII } from "../../lib/radii"

/**
 * The Training Settings page.
 * Provides configuration for stat prioritization, blacklists, failure chance thresholds, spark targets, risky training, distance overrides,
 * stat target sliders per distance, and profile management (creation, switching, and overwriting).
 */
const TrainingSettings = () => {
    usePerformanceLogging("TrainingSettings")
    const { colors } = useTheme()
    const modalShellStyles = useModalShellStyles()
    const { training, trainingStatTarget, updateTraining, updateTrainingStatTarget: updateStatTargetSlice } = useContext(TrainingContext)
    const { misc, updateMisc } = useContext(GeneralMiscContext)
    const { setSettings } = useContext(BotMetaContext)
    const scrollViewRef = useRef<ScrollView>(null)
    const { saveSettingsImmediate } = useSettings()
    const { currentProfileName } = useProfileManager()
    const [blacklistModalVisible, setBlacklistModalVisible] = useState(false)
    const [prioritizationModalVisible, setPrioritizationModalVisible] = useState(false)
    const [eventChoicePrioritizationModalVisible, setEventChoicePrioritizationModalVisible] = useState(false)
    const [summerTrainingPrioritizationModalVisible, setSummerTrainingPrioritizationModalVisible] = useState(false)
    const [sparkStatTargetModalVisible, setSparkStatTargetModalVisible] = useState(false)
    const [snackbarVisible, setSnackbarVisible] = useState(false)
    const [snackbarMessage, setSnackbarMessage] = useState("")

    // Initialize local state from settings, with fallback to defaults.
    const [statPrioritizationItems, setStatPrioritizationItems] = useState<string[]>(() =>
        training?.statPrioritization !== undefined ? training.statPrioritization : defaultSettings.training.statPrioritization
    )
    const [eventChoiceStatPriorityItems, setEventChoiceStatPriorityItems] = useState<string[]>(() =>
        training?.eventChoiceStatPriority !== undefined ? training.eventChoiceStatPriority : defaultSettings.training.eventChoiceStatPriority
    )
    const [summerTrainingStatPriorityItems, setSummerTrainingStatPriorityItems] = useState<string[]>(() =>
        training?.summerTrainingStatPriority !== undefined ? training.summerTrainingStatPriority : defaultSettings.training.summerTrainingStatPriority
    )
    const [blacklistItems, setBlacklistItems] = useState<string[]>(() => (training?.trainingBlacklist !== undefined ? training.trainingBlacklist : defaultSettings.training.trainingBlacklist))
    const [sparkStatTargetItems, setSparkStatTargetItems] = useState<string[]>(() => {
        const value = training?.focusOnSparkStatTarget
        // Ensure we always have an array (migration should handle this, but be safe).
        if (Array.isArray(value)) {
            return value
        }
        return defaultSettings.training.focusOnSparkStatTarget
    })

    // Use a ref to track if the initial mount sync has been done to avoid redundant updates.
    const isMounted = useRef(false)

    // Two-phase mount. First paint renders the page header + profile selector (~100 ms baseline)
    // so the user sees the page immediately; the heavy body — stat selectors, ~20 stat target
    // sliders, and the rest of the checkbox grid — commits one tick later, after the navigator
    // animation has painted. Mirrors the deferral pattern that cut the Settings hub first_commit
    // by 27 % and is needed here because TrainingSettings's first_commit was ~485 ms (over the
    // 350 ms budget) on the harness.
    const [showHeavySections, setShowHeavySections] = useState(false)
    useEffect(() => {
        const handle = InteractionManager.runAfterInteractions(() => {
            setShowHeavySections(true)
        })
        return () => handle.cancel()
    }, [])

    // Merge current training settings with defaults to handle missing properties.
    // Include local state values to ensure blacklist and prioritization are current.
    const trainingSettings = useMemo(
        () => ({
            ...defaultSettings.training,
            ...training,
            trainingBlacklist: blacklistItems,
            statPrioritization: statPrioritizationItems,
            eventChoiceStatPriority: eventChoiceStatPriorityItems,
            summerTrainingStatPriority: summerTrainingStatPriorityItems,
            focusOnSparkStatTarget: sparkStatTargetItems,
        }),
        [training, blacklistItems, statPrioritizationItems, eventChoiceStatPriorityItems, summerTrainingStatPriorityItems, sparkStatTargetItems]
    )

    const trainingStatTargetSettings = useMemo(() => ({ ...defaultSettings.trainingStatTarget, ...trainingStatTarget }), [trainingStatTarget])

    const {
        maximumFailureChance,
        disableTrainingOnMaxedStat,
        enableRainbowTrainingBonus,
        enablePrioritizeNearMaxFriendship,
        preferredDistanceOverride,
        mustRestBeforeSummer,
        enableRiskyTraining,
        riskyTrainingMinStatGain,
        riskyTrainingMaxFailureChance,
        trainWitDuringFinale,
        enablePrioritizeSkillHints,
        enableTrainingLevelWeighting,
        disableStatTargets,
        enableTrainingAnalysisValidation,
        enableYoloStatDetection,
    } = trainingSettings

    // Update global settings when local state changes, but skip the initial mount check.
    // We also verify that the values are actually different before triggering an update.
    useEffect(() => {
        if (isMounted.current) {
            if (!shallowArrayEqual(training?.statPrioritization, statPrioritizationItems)) {
                updateTrainingSetting("statPrioritization", statPrioritizationItems)
            }
        }
    }, [statPrioritizationItems])

    useEffect(() => {
        if (isMounted.current) {
            if (!shallowArrayEqual(training?.eventChoiceStatPriority, eventChoiceStatPriorityItems)) {
                updateTrainingSetting("eventChoiceStatPriority", eventChoiceStatPriorityItems)
            }
        }
    }, [eventChoiceStatPriorityItems])

    useEffect(() => {
        if (isMounted.current) {
            if (!shallowArrayEqual(training?.summerTrainingStatPriority, summerTrainingStatPriorityItems)) {
                updateTrainingSetting("summerTrainingStatPriority", summerTrainingStatPriorityItems)
            }
        }
    }, [summerTrainingStatPriorityItems])

    useEffect(() => {
        if (isMounted.current) {
            if (!shallowArrayEqual(training?.trainingBlacklist, blacklistItems)) {
                updateTrainingSetting("trainingBlacklist", blacklistItems)
            }
        }
    }, [blacklistItems])

    useEffect(() => {
        if (isMounted.current) {
            if (!shallowArrayEqual(training?.focusOnSparkStatTarget, sparkStatTargetItems)) {
                updateTrainingSetting("focusOnSparkStatTarget", sparkStatTargetItems)
            }
        }
    }, [sparkStatTargetItems])

    // Mark as mounted after the first render.
    useEffect(() => {
        isMounted.current = true
    }, [])

    // Sync local state when settings change (e.g., when switching profiles).
    useEffect(() => {
        const newVal = training?.trainingBlacklist
        if (newVal !== undefined && !shallowArrayEqual(newVal, blacklistItems)) {
            setBlacklistItems(newVal)
        }
    }, [training?.trainingBlacklist])

    useEffect(() => {
        const newVal = training?.statPrioritization
        if (newVal !== undefined && !shallowArrayEqual(newVal, statPrioritizationItems)) {
            setStatPrioritizationItems(newVal)
        }
    }, [training?.statPrioritization])

    useEffect(() => {
        const newVal = training?.eventChoiceStatPriority
        if (newVal !== undefined && !shallowArrayEqual(newVal, eventChoiceStatPriorityItems)) {
            setEventChoiceStatPriorityItems(newVal)
        }
    }, [training?.eventChoiceStatPriority])

    useEffect(() => {
        const newVal = training?.summerTrainingStatPriority
        if (newVal !== undefined && !shallowArrayEqual(newVal, summerTrainingStatPriorityItems)) {
            setSummerTrainingStatPriorityItems(newVal)
        }
    }, [training?.summerTrainingStatPriority])

    useEffect(() => {
        const newVal = training?.focusOnSparkStatTarget
        if (newVal !== undefined && Array.isArray(newVal) && !shallowArrayEqual(newVal, sparkStatTargetItems)) {
            setSparkStatTargetItems(newVal)
        }
    }, [training?.focusOnSparkStatTarget])

    // Sync currentProfileName from profile manager to settings context.
    // This is now purely for the BotStateContext as the ProfileContext is the source of truth for the UI.
    useEffect(() => {
        const syncProfileName = async () => {
            const profileName = currentProfileName || ""
            if (misc.currentProfileName !== profileName) {
                updateMisc({ currentProfileName: profileName })
            }
        }
        syncProfileName()
    }, [currentProfileName])

    /**
     * Update a training setting in the global bot state.
     * @param key The key of the training setting to update.
     * @param value The value to set the setting to.
     */
    const updateTrainingSetting = useCallback(
        (key: keyof Settings["training"], value: any) => {
            updateTraining({ [key]: value } as Partial<Settings["training"]>)
        },
        [updateTraining]
    )

    /**
     * Overwrite the current settings with settings from a selected profile.
     * Applies migrations to the profile settings and merges them into the global state.
     * @param profileSettings The partial settings object from the profile.
     */
    const handleOverwriteSettings = async (profileSettings: Partial<Settings>) => {
        // Get the current profile name directly from the database to ensure we have the latest value.
        const dbProfileName = await databaseManager.getCurrentProfileName()

        // Apply settings using a functional update to avoid stale closure issues.
        let finalUpdatedSettings: Settings | null = null
        setSettings((prev) => {
            // Merge profile settings with current settings to create a complete Settings object for migration.
            const mergedSettings = {
                ...prev,
                ...profileSettings,
            } as Settings

            // Apply migrations to the merged settings.
            const { settings: migratedSettings } = applyMigrations(mergedSettings, profileSettings)

            // Create the updated settings object with the migrated profile settings.
            const updatedSettings = {
                ...migratedSettings,
                misc: {
                    ...prev.misc,
                    ...migratedSettings.misc,
                    currentProfileName: dbProfileName || "",
                },
            }
            finalUpdatedSettings = updatedSettings
            return updatedSettings
        })

        // Save settings immediately with the updated settings.
        if (finalUpdatedSettings) {
            await saveSettingsImmediate(finalUpdatedSettings)
        }
    }

    /**
     * Update a training stat target setting in the global bot state.
     * Wraps the slice updater so call sites can pass `(key, value)` rather than a partial object.
     * @param key The key of the stat target setting to update.
     * @param value The value to set the target to.
     */
    const updateTrainingStatTarget = useCallback(
        (key: keyof Settings["trainingStatTarget"], value: any) => {
            updateStatTargetSlice({ [key]: value } as Partial<Settings["trainingStatTarget"]>)
        },
        [updateStatTargetSlice]
    )

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
                section: {
                    marginBottom: 24,
                },
                row: {
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 16,
                },
                label: {
                    fontSize: 16,
                    color: colors.text,
                    flex: 1,
                },
                pressableText: {
                    fontSize: 16,
                    color: colors.brand,
                    textDecorationLine: "underline",
                },
                modalFooterRow: { flexDirection: "row", gap: SPACING.sm },
                selectorRow: {
                    flexDirection: "row",
                    alignItems: "center",
                    gap: SPACING.sm,
                    paddingHorizontal: SPACING.md,
                    paddingVertical: SPACING.md,
                },
                selectorMain: { flex: 1, gap: SPACING.sm },
                selectorTitle: { ...TYPE.body, color: colors.text, fontWeight: "600" as const },
                selectorDescription: { ...TYPE.caption, color: colors.textMuted, marginTop: 2 },
                selectorEmpty: { ...TYPE.caption, color: colors.textMuted, fontStyle: "italic" as const },
                selectorChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
                selectorChip: {
                    backgroundColor: colors.brandSubtle,
                    borderWidth: 1,
                    borderColor: colors.brandBorder,
                    borderRadius: RADII.pill,
                    paddingHorizontal: SPACING.sm,
                    paddingVertical: 2,
                },
                selectorChipText: { ...TYPE.caption, color: colors.brand, fontWeight: "600" as const },
            }),
        [colors]
    )

    /**
     * Toggle the selection of a stat within a specific list.
     * @param stat The stat to toggle.
     * @param list The current list of selected stats.
     * @param setList The state setter function to update the list.
     */
    const toggleStat = (stat: string, list: string[], setList: (value: string[]) => void) => {
        if (list.includes(stat)) {
            setList(list.filter((s) => s !== stat))
        } else {
            setList([...list, stat])
        }
    }

    /**
     * Clear all selected stats from a list.
     * @param setList The state setter function to update the list.
     */
    const clearAll = (setList: (value: string[]) => void) => {
        setList([])
    }

    /**
     * Select all available stats for a list.
     * Appends any missing items from the default stat list to the current selection.
     * @param setList The state setter function to update the list.
     * @param currentList The current list of selected stats.
     */
    const selectAll = (setList: (value: string[]) => void, currentList: string[]) => {
        // Add any missing items from default settings to the current list, preserving order.
        const missingItems = defaultSettings.training.statPrioritization.filter((stat) => !currentList.includes(stat))
        setList([...currentList, ...missingItems])
    }

    /**
     * Render a stat selector component with an interactive modal.
     * Supports both checkbox-based selection and priority-based ordering.
     * @param title The display title for the selector.
     * @param selectedStats The currently selected stats.
     * @param setSelectedStats The state setter for the selected stats.
     * @param modalVisible Whether the selection modal is currently visible.
     * @param setModalVisible The safe setter for the modal visibility state.
     * @param description An optional description for the selector.
     * @param mode The selection mode (checkbox or priority).
     * @param id The search ID for consistent search navigation.
     * @returns A React element containing the selector and its modal.
     */
    const renderStatSelector = (
        title: string,
        selectedStats: string[],
        setSelectedStats: (value: string[]) => void,
        modalVisible: boolean,
        setModalVisible: React.Dispatch<React.SetStateAction<boolean>>,
        description?: string,
        mode: "checkbox" | "priority" = "checkbox",
        id?: string
    ) => {
        const content = (
            <View>
                <Pressable style={styles.selectorRow} onPress={() => setModalVisible(true)} android_ripple={{ color: colors.ripple, foreground: true }}>
                    <View style={styles.selectorMain}>
                        <Text style={styles.selectorTitle}>{title}</Text>
                        {description ? <Text style={styles.selectorDescription}>{description}</Text> : null}
                        {selectedStats.length === 0 ? (
                            <Text style={styles.selectorEmpty}>None</Text>
                        ) : (
                            <View style={styles.selectorChips}>
                                {selectedStats.map((stat) => (
                                    <View key={stat} style={styles.selectorChip}>
                                        <Text style={styles.selectorChipText}>{stat}</Text>
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </Pressable>

                <SheetModal
                    visible={modalVisible}
                    onRequestClose={() => setModalVisible(false)}
                    header={
                        <View style={modalShellStyles.modalHeaderRow}>
                            <Text style={modalShellStyles.modalTitleMono}>{title.toUpperCase()}</Text>
                            <Pressable
                                style={modalShellStyles.modalCloseChip}
                                onPress={() => setModalVisible(false)}
                                android_ripple={{ color: colors.ripple, foreground: true }}
                                accessibilityLabel="Close"
                            >
                                <Ionicons name="close" size={18} color={colors.text} />
                            </Pressable>
                        </View>
                    }
                    footer={
                        <View style={styles.modalFooterRow}>
                            <ModalFooterChip
                                label={mode === "priority" ? "Reset" : "Clear All"}
                                tone="danger"
                                onPress={() => {
                                    if (mode === "priority") {
                                        setSelectedStats(defaultSettings.training.statPrioritization)
                                        setModalVisible(false)
                                    } else {
                                        clearAll(setSelectedStats)
                                    }
                                }}
                            />
                            <ModalFooterChip
                                label="Select All"
                                onPress={() => {
                                    if (mode === "priority") {
                                        setSelectedStats(defaultSettings.training.statPrioritization)
                                        setModalVisible(false)
                                    } else {
                                        selectAll(setSelectedStats, selectedStats)
                                    }
                                }}
                            />
                        </View>
                    }
                >
                    {mode === "priority" ? (
                        <DraggablePriorityList
                            items={defaultSettings.training.statPrioritization.map((stat) => ({ id: stat, label: stat }))}
                            selectedItems={selectedStats}
                            onSelectionChange={setSelectedStats}
                            onOrderChange={(orderedItems) => setSelectedStats(orderedItems)}
                        />
                    ) : (
                        <View style={modalShellStyles.modalBodyList}>
                            {defaultSettings.training.statPrioritization.map((stat) => (
                                <ModalCheckRow
                                    key={stat}
                                    label={stat}
                                    checked={selectedStats.includes(stat)}
                                    onPress={() => toggleStat(stat, selectedStats, setSelectedStats)}
                                />
                            ))}
                        </View>
                    )}
                </SheetModal>
            </View>
        )

        if (id) {
            return (
                <SearchableItem id={id} title={title} description={description}>
                    {content}
                </SearchableItem>
            )
        }

        return content
    }

    return (
        <View style={styles.root}>
            <SearchPageProvider page="TrainingSettings" scrollViewRef={scrollViewRef}>
                <ScrollView
                    ref={scrollViewRef}
                    stickyHeaderIndices={[0]}
                    nestedScrollEnabled={true}
                    showsVerticalScrollIndicator={false}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ flexGrow: 1 }}
                >
                    <PageHeader title="Training Settings" />
                    <View className="m-1">
                        <SearchableItem
                            id="training-settings-profile-selector"
                            title="Profile Selector"
                            description="Profiles constitute only the Training settings and stat targets."
                            style={{ marginBottom: 16 }}
                        >
                            <ProfileSelector
                                currentTrainingSettings={trainingSettings}
                                currentTrainingStatTargetSettings={trainingStatTargetSettings}
                                onOverwriteSettings={handleOverwriteSettings}
                                onNoChangesDetected={() => {
                                    setSnackbarMessage("Current Training settings are already the same.")
                                    setSnackbarVisible(true)
                                }}
                                onError={(message) => {
                                    setSnackbarMessage(message)
                                    setSnackbarVisible(true)
                                }}
                            />
                        </SearchableItem>

                        {showHeavySections && (
                            <>
                                <Section label="Priorities">
                                    {renderStatSelector(
                                        "Blacklist",
                                        blacklistItems,
                                        (value) => setBlacklistItems(value),
                                        blacklistModalVisible,
                                        setBlacklistModalVisible,
                                        "Select which stats to exclude from training. These stats will be skipped during training sessions.",
                                        "checkbox",
                                        "training-blacklist"
                                    )}

                                    {renderStatSelector(
                                        "Prioritization",
                                        statPrioritizationItems,
                                        (value) => setStatPrioritizationItems(value),
                                        prioritizationModalVisible,
                                        setPrioritizationModalVisible,
                                        "Select the priority order of the stats. The stats will be trained in the order they are selected. If none are selected, then the default order will be used.",
                                        "priority",
                                        "training-prioritization"
                                    )}

                                    {renderStatSelector(
                                        "Event Choice Prioritization",
                                        eventChoiceStatPriorityItems,
                                        (value) => setEventChoiceStatPriorityItems(value),
                                        eventChoicePrioritizationModalVisible,
                                        setEventChoicePrioritizationModalVisible,
                                        "Select the priority order of stats used when scoring in-game event choices. Events typically grant flat stat gains, so a different ordering than regular training may be optimal.",
                                        "priority",
                                        "event-choice-stat-priority"
                                    )}

                                    {renderStatSelector(
                                        "Summer Training Prioritization",
                                        summerTrainingStatPriorityItems,
                                        (value) => setSummerTrainingStatPriorityItems(value),
                                        summerTrainingPrioritizationModalVisible,
                                        setSummerTrainingPrioritizationModalVisible,
                                        "Select the priority order of stats used during Summer Training. Facility levels are maxed during summer with no facility progression, so a different ordering than regular training may be optimal.",
                                        "priority",
                                        "summer-training-stat-priority"
                                    )}
                                </Section>

                                <Section label="Behavior">
                                    <SearchableItem
                                        id="disable-training-on-maxed-stats"
                                        title="Disable Training on Maxed Stats"
                                        description="When enabled, training will be skipped for stats that have reached their maximum value."
                                    >
                                        <Row
                                            title="Disable Training on Maxed Stats"
                                            description="When enabled, training will be skipped for stats that have reached their maximum value."
                                            right={<Switch checked={disableTrainingOnMaxedStat} onCheckedChange={(checked) => updateTrainingSetting("disableTrainingOnMaxedStat", checked)} />}
                                        />
                                    </SearchableItem>

                                    <SearchableItem
                                        id="enable-riskier-training"
                                        title="Enable Riskier Training"
                                        description="When enabled, trainings with high main stat gains will use a separate, higher maximum failure chance threshold."
                                    >
                                        <Row
                                            title="Enable Riskier Training"
                                            description="When enabled, trainings with high main stat gains will use a separate, higher maximum failure chance threshold."
                                            right={<Switch checked={enableRiskyTraining} onCheckedChange={(checked) => updateTrainingSetting("enableRiskyTraining", checked)} />}
                                        />
                                    </SearchableItem>
                                </Section>

                                <Section label="Limits">
                                    <View style={{ padding: SPACING.md }}>
                                        <CustomSlider
                                            value={maximumFailureChance}
                                            placeholder={defaultSettings.training.maximumFailureChance}
                                            onValueChange={(value) => updateTrainingSetting("maximumFailureChance", value)}
                                            min={5}
                                            max={95}
                                            step={5}
                                            label="Set Maximum Failure Chance"
                                            labelUnit="%"
                                            showValue={true}
                                            showLabels={true}
                                            description="Set the maximum acceptable failure chance for training sessions. Training with higher failure rates will be avoided."
                                            searchId="maximum-failure-chance"
                                        />
                                    </View>
                                    <View style={{ padding: SPACING.md }}>
                                        <CustomSlider
                                            value={riskyTrainingMinStatGain || defaultSettings.training.riskyTrainingMinStatGain}
                                            placeholder={defaultSettings.training.riskyTrainingMinStatGain}
                                            onValueChange={(value) => updateTrainingSetting("riskyTrainingMinStatGain", value)}
                                            min={20}
                                            max={100}
                                            step={5}
                                            label="Minimum Main Stat Gain Threshold"
                                            labelUnit=""
                                            showValue={true}
                                            showLabels={true}
                                            description="When a training's main stat gain meets or exceeds this value, it will be considered for risky training."
                                            searchId="risky-training-min-stat-gain"
                                            searchCondition={enableRiskyTraining}
                                            parentId="enable-riskier-training"
                                        />
                                    </View>
                                </Section>

                                <View style={styles.section}>
                                    <CustomSlider
                                        value={riskyTrainingMaxFailureChance || defaultSettings.training.riskyTrainingMaxFailureChance}
                                        placeholder={defaultSettings.training.riskyTrainingMaxFailureChance}
                                        onValueChange={(value) => updateTrainingSetting("riskyTrainingMaxFailureChance", value)}
                                        min={5}
                                        max={95}
                                        step={5}
                                        label="Risky Training Maximum Failure Chance"
                                        labelUnit="%"
                                        showValue={true}
                                        showLabels={true}
                                        description="Set the maximum acceptable failure chance for risky training sessions with high main stat gains."
                                        searchId="risky-training-max-failure-chance"
                                        searchCondition={enableRiskyTraining}
                                        parentId="enable-riskier-training"
                                    />
                                </View>

                                {renderStatSelector(
                                    "Focus on Sparks",
                                    sparkStatTargetItems,
                                    (value) => setSparkStatTargetItems(value),
                                    sparkStatTargetModalVisible,
                                    setSparkStatTargetModalVisible,
                                    "Select which stats should receive priority to get to at least 600 to get the best chance to receive 3* sparks.",
                                    "checkbox",
                                    "focus-on-sparks"
                                )}

                                <View style={styles.section}>
                                    <CustomCheckbox
                                        checked={enablePrioritizeSkillHints}
                                        onCheckedChange={(checked) => updateTrainingSetting("enablePrioritizeSkillHints", checked)}
                                        label="Prioritize Skill Hints"
                                        description="When enabled, the bot will prioritize acquiring skill hints, bypassing stat prioritization and blacklist, while still being constrained by the failure chance thresholds."
                                        className="my-2"
                                        searchId="enable-prioritize-skill-hints"
                                    />
                                </View>

                                <View style={styles.section}>
                                    <CustomCheckbox
                                        checked={enableTrainingLevelWeighting}
                                        onCheckedChange={(checked) => updateTrainingSetting("enableTrainingLevelWeighting", checked)}
                                        label="Weight Score by Training Level"
                                        description="When enabled (Year 2+), the bot reads each training's level (1-5) via OCR and boosts the score for trainings whose stat sits in the top 3 of your Stat Prioritization list. Helps the bot stick with stats you've invested in. OCR is skipped during Pre-Debut, Junior, and Summer."
                                        className="my-2"
                                        searchId="enable-training-level-weighting"
                                    />
                                </View>

                                <View style={styles.section}>
                                    <CustomCheckbox
                                        checked={mustRestBeforeSummer}
                                        onCheckedChange={(checked) => updateTrainingSetting("mustRestBeforeSummer", checked)}
                                        label="Must Rest before Summer"
                                        description="Optimizes June Late Phase in Classic and Senior Years for Summer Training. If Energy < 70%, it will Rest. If Energy >= 70% and Mood < Great, it will recover Mood. If Energy >= 70% and Mood is Great, it will train Wit."
                                        className="my-2"
                                        searchId="must-rest-before-summer"
                                    />
                                </View>

                                <View style={styles.section}>
                                    <CustomCheckbox
                                        checked={trainWitDuringFinale}
                                        onCheckedChange={(checked) => updateTrainingSetting("trainWitDuringFinale", checked)}
                                        label="Train Wit During Finale"
                                        description="When enabled, the bot will train Wit during URA finale turns (73, 74, 75) instead of recovering energy or mood, even if the failure chance is high."
                                        className="my-2"
                                        searchId="train-wit-during-finale"
                                    />
                                </View>

                                <View style={styles.section}>
                                    <CustomCheckbox
                                        checked={enableRainbowTrainingBonus}
                                        onCheckedChange={(checked) => updateTrainingSetting("enableRainbowTrainingBonus", checked)}
                                        label="Enable Rainbow Training Bonus"
                                        description="When enabled (Year 2+), rainbow trainings receive a significant bonus to their score, making them more likely to be selected. This is highly dependent on device configuration and may result in false positives."
                                        className="my-2"
                                        searchId="enable-rainbow-training-bonus"
                                    />
                                </View>

                                <View style={styles.section}>
                                    <CustomCheckbox
                                        checked={enablePrioritizeNearMaxFriendship}
                                        onCheckedChange={(checked) => updateTrainingSetting("enablePrioritizeNearMaxFriendship", checked)}
                                        label="Prioritize Near-Max Friendship Bars"
                                        description="When enabled (Year 2+), trainings with multiple green/blue friendship bars close to maxing receive an anticipatory rainbow multiplier (up to 1.6x), helping the bot favor them so the bars cross into orange and unlock rainbow training on later turns. Does not stack with the actual rainbow bonus."
                                        className="my-2"
                                        searchId="enable-prioritize-near-max-friendship"
                                    />
                                </View>

                                <View style={styles.section}>
                                    <CustomCheckbox
                                        checked={enableTrainingAnalysisValidation}
                                        onCheckedChange={(checked) => updateTrainingSetting("enableTrainingAnalysisValidation", checked)}
                                        label="Enable Training Analysis Validation"
                                        description="When enabled, the bot will validate the current selected stat during training analysis. This helps prevent the bot from accidentally training a stat during analysis at the cost of a significant increase in scenario completion time."
                                        className="my-2"
                                        searchId="enable-training-analysis-validation"
                                    />
                                    {enableTrainingAnalysisValidation && (
                                        <WarningContainer style={{ marginTop: 0 }}>
                                            ⚠️ Warning: Enabling this option will prevent accidental trainings at the cost of a significant increase in the time it takes to complete a scenario.
                                        </WarningContainer>
                                    )}
                                </View>
                                <View style={styles.section}>
                                    <CustomCheckbox
                                        checked={enableYoloStatDetection}
                                        onCheckedChange={(checked) => updateTrainingSetting("enableYoloStatDetection", checked)}
                                        label="Enable YOLO Stat Detection"
                                        description="When enabled, the bot will use a custom YOLOv8 model for high-precision stat gain detection. This replaces the standard OCR/Template matching for stat gains."
                                        className="my-2"
                                        searchId="enable-yolo-stat-detection"
                                    />
                                </View>

                                <View style={styles.section}>
                                    <View style={styles.row}>
                                        <Text style={styles.label}>Preferred Distance Override</Text>
                                        <CustomSelect
                                            value={preferredDistanceOverride}
                                            onValueChange={(value) => updateTrainingSetting("preferredDistanceOverride", value)}
                                            options={[
                                                { label: "Auto", value: "Auto" },
                                                { label: "Sprint", value: "Sprint" },
                                                { label: "Mile", value: "Mile" },
                                                { label: "Medium", value: "Medium" },
                                                { label: "Long", value: "Long" },
                                            ]}
                                            placeholder="Select distance"
                                            width={200}
                                            searchId="preferred-distance-override"
                                            searchTitle="Preferred Distance Override"
                                            searchDescription="Set the preferred race distance for training targets."
                                        />
                                    </View>
                                    <Text style={[styles.label, { fontSize: 14, color: colors.text, opacity: 0.7, marginTop: 4 }]}>
                                        Set the preferred race distance for training targets. "Auto" will automatically determine based on character aptitudes reading from left to right (S {">"} A
                                        priority).
                                        {"\n\n"}
                                        For example, if Gold Ship has an aptitude of A for both Medium and Long, Auto will use Medium as the preferred distance. Whereas if Medium is A and Long is S,
                                        then Auto will instead use Long as the preferred distance.
                                    </Text>
                                </View>

                                <View style={styles.section}>
                                    <CustomCheckbox
                                        checked={disableStatTargets}
                                        onCheckedChange={(checked) => updateTrainingSetting("disableStatTargets", checked)}
                                        label="Disable Stat Targets"
                                        description="When enabled, all per-distance stat targets below are ignored. Every stat is treated as having a target equal to the in-game stat cap (1200), so the bot will keep pushing your top priority stats even after they would normally be considered 'done.' Useful when you want strict adherence to your Stat Prioritization list."
                                        className="my-2"
                                        searchId="disable-stat-targets"
                                    />
                                </View>

                                {/* Stat Target Settings */}
                                <View style={[styles.section, disableStatTargets && { opacity: 0.5, pointerEvents: "none" }]}>
                                    <SearchableItem
                                        id="stat-targets-by-distance"
                                        title="Stat Targets by Distance"
                                        description="Set target values for each stat based on race distance. These stat targets are derived from past Champion Meetings. The bot will prioritize training stats that are below these targets."
                                    >
                                        <Text style={[TYPE.body, { color: colors.text, marginBottom: SPACING.xs }]}>Stat Targets by Distance</Text>
                                        <Text style={[TYPE.caption, { color: colors.textMuted, marginBottom: SPACING.md }]}>
                                            Set target values for each stat based on race distance. These stat targets are derived from past Champion Meetings. The bot will prioritize training stats
                                            that are below these targets.
                                        </Text>
                                    </SearchableItem>

                                    {/* Distance Stat Targets - one collapsible Section per distance. */}
                                    <Section label="Sprint Distance" collapsible defaultOpen={false}>
                                        <View style={{ padding: SPACING.md }}>
                                            <CustomSlider
                                                value={trainingStatTargetSettings.trainingSprintStatTarget_speedStatTarget}
                                                placeholder={defaultSettings.trainingStatTarget.trainingSprintStatTarget_speedStatTarget}
                                                onValueChange={(value) => updateTrainingStatTarget("trainingSprintStatTarget_speedStatTarget", value)}
                                                min={100}
                                                max={1200}
                                                step={10}
                                                label="Sprint Speed Target"
                                                labelUnit=""
                                                showValue={true}
                                                showLabels={true}
                                            />
                                            <CustomSlider
                                                placeholder={defaultSettings.trainingStatTarget.trainingSprintStatTarget_staminaStatTarget}
                                                value={trainingStatTargetSettings.trainingSprintStatTarget_staminaStatTarget}
                                                onValueChange={(value) => updateTrainingStatTarget("trainingSprintStatTarget_staminaStatTarget", value)}
                                                min={100}
                                                max={1200}
                                                step={10}
                                                label="Sprint Stamina Target"
                                                labelUnit=""
                                                showValue={true}
                                                showLabels={true}
                                            />
                                            <CustomSlider
                                                placeholder={defaultSettings.trainingStatTarget.trainingSprintStatTarget_powerStatTarget}
                                                value={trainingStatTargetSettings.trainingSprintStatTarget_powerStatTarget}
                                                onValueChange={(value) => updateTrainingStatTarget("trainingSprintStatTarget_powerStatTarget", value)}
                                                min={100}
                                                max={1200}
                                                step={10}
                                                label="Sprint Power Target"
                                                labelUnit=""
                                                showValue={true}
                                                showLabels={true}
                                            />
                                            <CustomSlider
                                                placeholder={defaultSettings.trainingStatTarget.trainingSprintStatTarget_gutsStatTarget}
                                                value={trainingStatTargetSettings.trainingSprintStatTarget_gutsStatTarget}
                                                onValueChange={(value) => updateTrainingStatTarget("trainingSprintStatTarget_gutsStatTarget", value)}
                                                min={100}
                                                max={1200}
                                                step={10}
                                                label="Sprint Guts Target"
                                                labelUnit=""
                                                showValue={true}
                                                showLabels={true}
                                            />
                                            <CustomSlider
                                                placeholder={defaultSettings.trainingStatTarget.trainingSprintStatTarget_witStatTarget}
                                                value={trainingStatTargetSettings.trainingSprintStatTarget_witStatTarget}
                                                onValueChange={(value) => updateTrainingStatTarget("trainingSprintStatTarget_witStatTarget", value)}
                                                min={100}
                                                max={1200}
                                                step={10}
                                                label="Sprint Wit Target"
                                                labelUnit=""
                                                showValue={true}
                                                showLabels={true}
                                            />
                                        </View>
                                    </Section>

                                    <Section label="Mile Distance" collapsible defaultOpen={false}>
                                        <View style={{ padding: SPACING.md }}>
                                            <CustomSlider
                                                placeholder={defaultSettings.trainingStatTarget.trainingMileStatTarget_speedStatTarget}
                                                value={trainingStatTargetSettings.trainingMileStatTarget_speedStatTarget}
                                                onValueChange={(value) => updateTrainingStatTarget("trainingMileStatTarget_speedStatTarget", value)}
                                                min={100}
                                                max={1200}
                                                step={10}
                                                label="Mile Speed Target"
                                                labelUnit=""
                                                showValue={true}
                                                showLabels={true}
                                            />
                                            <CustomSlider
                                                placeholder={defaultSettings.trainingStatTarget.trainingMileStatTarget_staminaStatTarget}
                                                value={trainingStatTargetSettings.trainingMileStatTarget_staminaStatTarget}
                                                onValueChange={(value) => updateTrainingStatTarget("trainingMileStatTarget_staminaStatTarget", value)}
                                                min={100}
                                                max={1200}
                                                step={10}
                                                label="Mile Stamina Target"
                                                labelUnit=""
                                                showValue={true}
                                                showLabels={true}
                                            />
                                            <CustomSlider
                                                placeholder={defaultSettings.trainingStatTarget.trainingMileStatTarget_powerStatTarget}
                                                value={trainingStatTargetSettings.trainingMileStatTarget_powerStatTarget}
                                                onValueChange={(value) => updateTrainingStatTarget("trainingMileStatTarget_powerStatTarget", value)}
                                                min={100}
                                                max={1200}
                                                step={10}
                                                label="Mile Power Target"
                                                labelUnit=""
                                                showValue={true}
                                                showLabels={true}
                                            />
                                            <CustomSlider
                                                placeholder={defaultSettings.trainingStatTarget.trainingMileStatTarget_gutsStatTarget}
                                                value={trainingStatTargetSettings.trainingMileStatTarget_gutsStatTarget}
                                                onValueChange={(value) => updateTrainingStatTarget("trainingMileStatTarget_gutsStatTarget", value)}
                                                min={100}
                                                max={1200}
                                                step={10}
                                                label="Mile Guts Target"
                                                labelUnit=""
                                                showValue={true}
                                                showLabels={true}
                                            />
                                            <CustomSlider
                                                placeholder={defaultSettings.trainingStatTarget.trainingMileStatTarget_witStatTarget}
                                                value={trainingStatTargetSettings.trainingMileStatTarget_witStatTarget}
                                                onValueChange={(value) => updateTrainingStatTarget("trainingMileStatTarget_witStatTarget", value)}
                                                min={100}
                                                max={1200}
                                                step={10}
                                                label="Mile Wit Target"
                                                labelUnit=""
                                                showValue={true}
                                                showLabels={true}
                                            />
                                        </View>
                                    </Section>

                                    <Section label="Medium Distance" collapsible defaultOpen={false}>
                                        <View style={{ padding: SPACING.md }}>
                                            <CustomSlider
                                                placeholder={defaultSettings.trainingStatTarget.trainingMediumStatTarget_speedStatTarget}
                                                value={trainingStatTargetSettings.trainingMediumStatTarget_speedStatTarget}
                                                onValueChange={(value) => updateTrainingStatTarget("trainingMediumStatTarget_speedStatTarget", value)}
                                                min={100}
                                                max={1200}
                                                step={10}
                                                label="Medium Speed Target"
                                                labelUnit=""
                                                showValue={true}
                                                showLabels={true}
                                            />
                                            <CustomSlider
                                                placeholder={defaultSettings.trainingStatTarget.trainingMediumStatTarget_staminaStatTarget}
                                                value={trainingStatTargetSettings.trainingMediumStatTarget_staminaStatTarget}
                                                onValueChange={(value) => updateTrainingStatTarget("trainingMediumStatTarget_staminaStatTarget", value)}
                                                min={100}
                                                max={1200}
                                                step={10}
                                                label="Medium Stamina Target"
                                                labelUnit=""
                                                showValue={true}
                                                showLabels={true}
                                            />
                                            <CustomSlider
                                                placeholder={defaultSettings.trainingStatTarget.trainingMediumStatTarget_powerStatTarget}
                                                value={trainingStatTargetSettings.trainingMediumStatTarget_powerStatTarget}
                                                onValueChange={(value) => updateTrainingStatTarget("trainingMediumStatTarget_powerStatTarget", value)}
                                                min={100}
                                                max={1200}
                                                step={10}
                                                label="Medium Power Target"
                                                labelUnit=""
                                                showValue={true}
                                                showLabels={true}
                                            />
                                            <CustomSlider
                                                placeholder={defaultSettings.trainingStatTarget.trainingMediumStatTarget_gutsStatTarget}
                                                value={trainingStatTargetSettings.trainingMediumStatTarget_gutsStatTarget}
                                                onValueChange={(value) => updateTrainingStatTarget("trainingMediumStatTarget_gutsStatTarget", value)}
                                                min={100}
                                                max={1200}
                                                step={10}
                                                label="Medium Guts Target"
                                                labelUnit=""
                                                showValue={true}
                                                showLabels={true}
                                            />
                                            <CustomSlider
                                                placeholder={defaultSettings.trainingStatTarget.trainingMediumStatTarget_witStatTarget}
                                                value={trainingStatTargetSettings.trainingMediumStatTarget_witStatTarget}
                                                onValueChange={(value) => updateTrainingStatTarget("trainingMediumStatTarget_witStatTarget", value)}
                                                min={100}
                                                max={1200}
                                                step={10}
                                                label="Medium Wit Target"
                                                labelUnit=""
                                                showValue={true}
                                                showLabels={true}
                                            />
                                        </View>
                                    </Section>

                                    <Section label="Long Distance" collapsible defaultOpen={false}>
                                        <View style={{ padding: SPACING.md }}>
                                            <CustomSlider
                                                placeholder={defaultSettings.trainingStatTarget.trainingLongStatTarget_speedStatTarget}
                                                value={trainingStatTargetSettings.trainingLongStatTarget_speedStatTarget}
                                                onValueChange={(value) => updateTrainingStatTarget("trainingLongStatTarget_speedStatTarget", value)}
                                                min={100}
                                                max={1200}
                                                step={10}
                                                label="Long Speed Target"
                                                labelUnit=""
                                                showValue={true}
                                                showLabels={true}
                                            />
                                            <CustomSlider
                                                placeholder={defaultSettings.trainingStatTarget.trainingLongStatTarget_staminaStatTarget}
                                                value={trainingStatTargetSettings.trainingLongStatTarget_staminaStatTarget}
                                                onValueChange={(value) => updateTrainingStatTarget("trainingLongStatTarget_staminaStatTarget", value)}
                                                min={100}
                                                max={1200}
                                                step={10}
                                                label="Long Stamina Target"
                                                labelUnit=""
                                                showValue={true}
                                                showLabels={true}
                                            />
                                            <CustomSlider
                                                placeholder={defaultSettings.trainingStatTarget.trainingLongStatTarget_powerStatTarget}
                                                value={trainingStatTargetSettings.trainingLongStatTarget_powerStatTarget}
                                                onValueChange={(value) => updateTrainingStatTarget("trainingLongStatTarget_powerStatTarget", value)}
                                                min={100}
                                                max={1200}
                                                step={10}
                                                label="Long Power Target"
                                                labelUnit=""
                                                showValue={true}
                                                showLabels={true}
                                            />
                                            <CustomSlider
                                                placeholder={defaultSettings.trainingStatTarget.trainingLongStatTarget_gutsStatTarget}
                                                value={trainingStatTargetSettings.trainingLongStatTarget_gutsStatTarget}
                                                onValueChange={(value) => updateTrainingStatTarget("trainingLongStatTarget_gutsStatTarget", value)}
                                                min={100}
                                                max={1200}
                                                step={10}
                                                label="Long Guts Target"
                                                labelUnit=""
                                                showValue={true}
                                                showLabels={true}
                                            />
                                            <CustomSlider
                                                placeholder={defaultSettings.trainingStatTarget.trainingLongStatTarget_witStatTarget}
                                                value={trainingStatTargetSettings.trainingLongStatTarget_witStatTarget}
                                                onValueChange={(value) => updateTrainingStatTarget("trainingLongStatTarget_witStatTarget", value)}
                                                min={100}
                                                max={1200}
                                                step={10}
                                                label="Long Wit Target"
                                                labelUnit=""
                                                showValue={true}
                                                showLabels={true}
                                            />
                                        </View>
                                    </Section>
                                </View>

                                {/* Training Year Milestone Targets */}
                                <View style={styles.section}>
                                    <SearchableItem
                                        id="training-year-milestone-targets"
                                        title="Training Year Milestone Targets"
                                        description="Controls how aggressively the bot paces stat training during the Pre-Debut, Junior and Classic Years."
                                    >
                                        <Text style={[TYPE.body, { color: colors.text, marginBottom: SPACING.xs }]}>Training Year Milestone Targets</Text>
                                        <Text style={[TYPE.caption, { color: colors.textMuted, marginBottom: SPACING.md }]}>
                                            Controls how aggressively the bot paces stat training during the Pre-Debut, Junior and Classic Years.{"\n\n"}
                                            The bot will target a scaled percentage of your stat targets prior to the Senior Year, ramping up to the full stat targets by the Finale. For example, with
                                            milestone targets of 33% / 66%, a Speed target of 1200 becomes ~396 in Junior Year and ~792 in Classic Year. This optimizes early-career statlines for
                                            better starting race results.{"\n\n"}
                                            Set both sliders to 100% to disable milestone pacing and always target the full statline.
                                        </Text>
                                    </SearchableItem>
                                    <SearchableItem
                                        id="classic-milestone-percent"
                                        title="End of Junior Year Milestone"
                                        description="Percentage of the primary stat targets to aim for by the end of Junior Year."
                                    >
                                        <CustomSlider
                                            value={trainingSettings.classicMilestonePercent}
                                            placeholder={defaultSettings.training.classicMilestonePercent}
                                            onValueChange={(value) => updateTrainingSetting("classicMilestonePercent", value)}
                                            min={0}
                                            max={100}
                                            step={1}
                                            label="End of Junior Year Milestone"
                                            labelUnit="%"
                                            showValue={true}
                                            showLabels={true}
                                        />
                                    </SearchableItem>
                                    <Text style={[styles.label, { fontSize: 14, color: colors.text, opacity: 0.7, marginTop: 4 }]}>
                                        The bot will aim for this % of your stat targets during Junior Year. Default: 33%.
                                    </Text>
                                </View>

                                <View style={styles.section}>
                                    <SearchableItem
                                        id="senior-milestone-percent"
                                        title="End of Classic Year Milestone"
                                        description="Percentage of the primary stat targets to aim for by the end of Classic Year."
                                    >
                                        <CustomSlider
                                            value={trainingSettings.seniorMilestonePercent}
                                            placeholder={defaultSettings.training.seniorMilestonePercent}
                                            onValueChange={(value) => updateTrainingSetting("seniorMilestonePercent", value)}
                                            min={0}
                                            max={100}
                                            step={1}
                                            label="End of Classic Year Milestone"
                                            labelUnit="%"
                                            showValue={true}
                                            showLabels={true}
                                        />
                                    </SearchableItem>
                                    <Text style={[styles.label, { fontSize: 14, color: colors.text, opacity: 0.7, marginTop: 4 }]}>
                                        The bot will aim for this % of your stat targets during Classic Year. Default: 66%.
                                    </Text>
                                </View>
                            </>
                        )}
                    </View>
                </ScrollView>
            </SearchPageProvider>
            <Snackbar
                visible={snackbarVisible}
                onDismiss={() => setSnackbarVisible(false)}
                action={{
                    label: "Close",
                    onPress: () => {
                        setSnackbarVisible(false)
                    },
                }}
                style={{ backgroundColor: "red", borderRadius: 10 }}
                duration={4000}
            >
                {snackbarMessage}
            </Snackbar>
        </View>
    )
}

export default React.memo(TrainingSettings)
