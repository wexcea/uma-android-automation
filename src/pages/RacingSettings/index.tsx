import { useMemo, useContext, useRef, useCallback, useState } from "react"
import { View, Text, TextInput, ScrollView, StyleSheet, Pressable } from "react-native"
import { useNavigation } from "@react-navigation/native"
import Ionicons from "@react-native-vector-icons/ionicons"
import { Cpu, ChevronRight } from "lucide-react-native"
import { useTheme } from "../../context/ThemeContext"
import { RacingContext, defaultSettings, Settings } from "../../context/BotStateContext"
import { SearchPageProvider } from "../../context/SearchPageContext"
import CustomSelect from "../../components/CustomSelect"
import CustomSlider from "../../components/CustomSlider"
import PageHeader from "../../components/PageHeader"
import WarningContainer from "../../components/WarningContainer"
import SearchableItem from "../../components/SearchableItem"
import { usePerformanceLogging } from "../../hooks/usePerformanceLogging"
import { Row } from "../../components/ui/row"
import { Section } from "../../components/ui/section"
import { SectionLabel } from "../../components/ui/section-label"
import { Switch } from "../../components/ui/switch"
import { GlassSurface } from "../../components/ui/glass-surface"
import { SheetModal } from "../../components/ui/sheet-modal"
import { ModalRadioRow } from "../../components/ui/modal-list"
import { useModalShellStyles } from "../../components/ui/modal-shell-styles"
import { TYPE } from "../../lib/type"
import { SPACING } from "../../lib/spacing"
import { RADII } from "../../lib/radii"

/** Available race strategy values for both Junior Year and Original strategy pickers. */
const RACE_STRATEGY_OPTIONS = ["Default", "Auto", "Front", "Pace", "Late", "End"] as const

type RaceStrategy = (typeof RACE_STRATEGY_OPTIONS)[number]

/**
 * The Racing Settings page.
 * Provides configuration for fan farming, race behavior, race strategies, force racing, in-game race agenda, and navigation to the Smart Race Solver Settings sub-page.
 */
const RacingSettings = () => {
    usePerformanceLogging("RacingSettings")
    const { colors } = useTheme()
    const modalShellStyles = useModalShellStyles()
    const navigation = useNavigation()
    const { racing, updateRacing } = useContext(RacingContext)
    const scrollViewRef = useRef<ScrollView>(null)

    // Modal state for the Junior / Original strategy pickers (nav-row + chip pattern).
    const [juniorPickerOpen, setJuniorPickerOpen] = useState(false)
    const [originalPickerOpen, setOriginalPickerOpen] = useState(false)

    // Merge current racing settings with defaults to handle missing properties.
    const racingSettings = { ...defaultSettings.racing, ...racing }
    const {
        enableFarmingFans,
        ignoreConsecutiveRaceWarning,
        ignoreLowEnergyRacingBlock,
        daysToRunExtraRaces,
        disableRaceRetries,
        enableFreeRaceRetry,
        enableCompleteCareerOnFailure,
        enableStopOnMandatoryRaces,
        enableForceRacing,
        juniorYearRaceStrategy,
        originalRaceStrategy,
        enablePerDistanceStrategy,
        juniorYearPerDistanceStrategies,
        originalPerDistanceStrategies,
        enableUserInGameRaceAgenda,
        limitRacesToInGameAgenda,
        skipSummerTrainingForAgenda,
        customAgendaTitle,
    } = racingSettings

    /**
     * Update a racing setting with special handling for the in-game race agenda.
     * When the in-game race agenda is enabled, it automatically disables the Farming Fans and Smart Race Solver settings to prevent conflicts.
     * @param key The key of the setting to update.
     * @param value The value to set the setting to.
     */
    const updateRacingSetting = useCallback(
        (key: keyof Settings["racing"], value: any) => {
            if (key === "enableUserInGameRaceAgenda" && value) {
                updateRacing((prev) => ({
                    // Disable Farming Fans and the Smart Race Solver when User In Game Race Agenda is enabled.
                    ...prev,
                    enableFarmingFans: false,
                    enableUserInGameRaceAgenda: true,
                    enableSmartRaceSolver: false,
                }))
            } else {
                updateRacing({ [key]: value } as Partial<Settings["racing"]>)
            }
        },
        [updateRacing]
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
                inputContainer: {
                    marginBottom: 16,
                },
                inputLabel: {
                    fontSize: 16,
                    color: colors.text,
                    marginBottom: 8,
                },
                input: {
                    borderWidth: 1,
                    borderColor: colors.borderHair,
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 16,
                    color: colors.text,
                    backgroundColor: colors.bg,
                },
                inputDescription: {
                    fontSize: 14,
                    color: colors.text,
                    opacity: 0.7,
                    marginTop: 4,
                },
                perDistanceGroupLabel: { ...TYPE.monoLabel, color: colors.textMuted, paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.xs },
                perDistanceBody: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md, gap: SPACING.sm },
                perDistanceItem: { flexDirection: "row" as const, alignItems: "center" as const, gap: SPACING.md },
            }),
        [colors]
    )

    /**
     * Render a small cyan pill displaying the current strategy value (for nav rows).
     * @param label The strategy value to render inside the pill.
     * @returns A styled `Text` node sized to fit the value.
     */
    const renderStrategyPill = (label: string) => (
        <Text
            style={{
                ...TYPE.monoLabel,
                color: colors.brand,
                paddingHorizontal: SPACING.sm,
                paddingVertical: 2,
                backgroundColor: colors.brandSubtle,
                borderRadius: RADII.pill,
                overflow: "hidden",
            }}
        >
            {label}
        </Text>
    )

    /**
     * Render the modal contents for a strategy picker.
     * @param current The currently selected strategy.
     * @param onSelect Called when the user picks a new value (the modal close is handled by the caller).
     * @returns A list of pressable option rows.
     */
    // `current` is typed `string` to match the context shape; if the stored value is outside RACE_STRATEGY_OPTIONS, no row renders as selected.
    const renderStrategyOptions = (current: string, onSelect: (value: RaceStrategy) => void) => (
        <View style={modalShellStyles.modalBodyList}>
            {RACE_STRATEGY_OPTIONS.map((option) => (
                <ModalRadioRow key={option} label={option} selected={option === current} onPress={() => onSelect(option)} />
            ))}
        </View>
    )

    return (
        <View style={styles.root}>
            <SearchPageProvider page="RacingSettings" scrollViewRef={scrollViewRef}>
                <PageHeader title="Racing Settings" />
                <ScrollView ref={scrollViewRef} nestedScrollEnabled={true} showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
                    <View className="m-1">
                        {/* //////////////////////////////////////////////////////////////////////////////////////////////////
                            //////////////////////////////////////////////////////////////////////////////////////////////////
                            Race Behavior */}
                        <Section label="Race Behavior">
                            <SearchableItem id="enable-farming-fans" title="Enable Farming Fans" description="When enabled, the bot will start running extra races to gain fans.">
                                <Row
                                    title="Enable Farming Fans"
                                    description="When enabled, the bot will start running extra races to gain fans."
                                    right={<Switch checked={enableFarmingFans} onCheckedChange={(checked) => updateRacingSetting("enableFarmingFans", checked)} />}
                                />
                            </SearchableItem>
                            <View style={{ padding: SPACING.md }}>
                                <CustomSlider
                                    searchId="days-to-run-extra-races"
                                    value={daysToRunExtraRaces}
                                    placeholder={defaultSettings.racing.daysToRunExtraRaces}
                                    onValueChange={(value) => updateRacingSetting("daysToRunExtraRaces", value)}
                                    min={1}
                                    max={15}
                                    step={1}
                                    label="Days to Run Extra Races"
                                    showValue={true}
                                    showLabels={true}
                                    description="Extra races are eligible only on days where current day % value == 0. For example, 5 means days 5, 10, 15, etc. Has no effect when Smart Race Solver is enabled."
                                />
                            </View>
                            <SearchableItem
                                id="ignore-consecutive-race-warning"
                                title="Ignore Consecutive Race Warning"
                                description="When enabled, the bot will ignore the warning popup about consecutive races and continue racing."
                            >
                                <Row
                                    title="Ignore Consecutive Race Warning"
                                    description="When enabled, the bot will ignore the warning popup about consecutive races and continue racing."
                                    right={<Switch checked={ignoreConsecutiveRaceWarning} onCheckedChange={(checked) => updateRacingSetting("ignoreConsecutiveRaceWarning", checked)} />}
                                />
                            </SearchableItem>
                            <SearchableItem
                                id="ignore-low-energy-racing-block"
                                title="Ignore Low Energy Racing Block"
                                description="When enabled, the Trackblazer bot will not block racing when energy is critically low (<=1%) with 3+ consecutive races."
                            >
                                <Row
                                    title="Ignore Low Energy Racing Block"
                                    description="When enabled, the Trackblazer bot will not block racing when energy is critically low (<=1%) with 3+ consecutive races."
                                    right={<Switch checked={ignoreLowEnergyRacingBlock} onCheckedChange={(checked) => updateRacingSetting("ignoreLowEnergyRacingBlock", checked)} />}
                                />
                            </SearchableItem>
                            <SearchableItem id="disable-race-retries" title="Disable Race Retries" description="When enabled, the bot will not retry mandatory races if they fail and will stop.">
                                <Row
                                    title="Disable Race Retries"
                                    description="When enabled, the bot will not retry mandatory races if they fail and will stop."
                                    right={<Switch checked={disableRaceRetries} onCheckedChange={(checked) => updateRacingSetting("disableRaceRetries", checked)} />}
                                />
                            </SearchableItem>
                            <SearchableItem
                                id="enable-free-race-retry"
                                title="Allow Daily Free Race Retry"
                                description="When enabled, the bot will attempt to retry a failed mandatory race only if the daily free race retry is available."
                                condition={disableRaceRetries}
                                parentId="disable-race-retries"
                            >
                                <Row
                                    title="Allow Daily Free Race Retry"
                                    description="When enabled, the bot will attempt to retry a failed mandatory race only if the daily free race retry is available."
                                    right={<Switch checked={enableFreeRaceRetry} onCheckedChange={(checked) => updateRacingSetting("enableFreeRaceRetry", checked)} />}
                                />
                            </SearchableItem>
                            <SearchableItem
                                id="enable-complete-career-on-failure"
                                title="Complete Career on Failure"
                                description="When enabled, the bot will proceed to the career completion screen when a mandatory race fails and retries are exhausted."
                            >
                                <Row
                                    title="Complete Career on Failure"
                                    description="When enabled, the bot will proceed to the career completion screen when a mandatory race fails and retries are exhausted."
                                    right={<Switch checked={enableCompleteCareerOnFailure} onCheckedChange={(checked) => updateRacingSetting("enableCompleteCareerOnFailure", checked)} />}
                                />
                            </SearchableItem>
                            <SearchableItem
                                id="enable-stop-on-mandatory-races"
                                title="Stop on Mandatory Races"
                                description="When enabled, the bot will automatically stop when it encounters a mandatory race, allowing you to manually handle them."
                            >
                                <Row
                                    title="Stop on Mandatory Races"
                                    description="When enabled, the bot will automatically stop when it encounters a mandatory race, allowing you to manually handle them."
                                    right={<Switch checked={enableStopOnMandatoryRaces} onCheckedChange={(checked) => updateRacingSetting("enableStopOnMandatoryRaces", checked)} />}
                                />
                            </SearchableItem>
                            <SearchableItem
                                id="enable-force-racing"
                                title="Force Racing"
                                description="When enabled, the bot will skip all training, rest, and mood recovery activities and focus exclusively on racing every day."
                            >
                                <Row
                                    title="Force Racing"
                                    description="When enabled, the bot will skip all training, rest, and mood recovery activities and focus exclusively on racing every day."
                                    right={<Switch checked={enableForceRacing} onCheckedChange={(checked) => updateRacingSetting("enableForceRacing", checked)} />}
                                />
                            </SearchableItem>
                            {enableForceRacing && <WarningContainer>Warning: Enabling this will override all other racing settings and they will be ignored.</WarningContainer>}
                        </Section>

                        {/* //////////////////////////////////////////////////////////////////////////////////////////////////
                            //////////////////////////////////////////////////////////////////////////////////////////////////
                            Strategy */}
                        <Section label="Strategy">
                            <SearchableItem
                                id="enable-per-distance-strategy"
                                title="Per-Distance Strategy"
                                description="When enabled, allows setting different race strategies for each track distance."
                            >
                                <Row
                                    title="Per-Distance Strategy"
                                    description="When enabled, allows setting different race strategies for each track distance."
                                    right={<Switch checked={enablePerDistanceStrategy} onCheckedChange={(checked) => updateRacingSetting("enablePerDistanceStrategy", checked)} />}
                                />
                            </SearchableItem>

                            {!enablePerDistanceStrategy ? (
                                <>
                                    <SearchableItem id="junior-year-race-strategy" title="Junior Year Race Strategy" description="The race strategy to use for all races during Junior Year.">
                                        <Row
                                            title="Junior Year Strategy"
                                            description="The race strategy to use for all races during Junior Year."
                                            onPress={() => setJuniorPickerOpen(true)}
                                            right={renderStrategyPill(juniorYearRaceStrategy)}
                                        />
                                    </SearchableItem>
                                    <SearchableItem
                                        id="original-race-strategy"
                                        title="Original Race Strategy"
                                        description="The race strategy to reset to after Junior Year. The bot will use this strategy for races in Year 2 and beyond."
                                    >
                                        <Row
                                            title="Original Strategy"
                                            description="The race strategy to reset to after Junior Year. The bot will use this strategy for races in Year 2 and beyond."
                                            onPress={() => setOriginalPickerOpen(true)}
                                            right={renderStrategyPill(originalRaceStrategy)}
                                        />
                                    </SearchableItem>
                                </>
                            ) : (
                                <>
                                    <View style={{ padding: SPACING.md, paddingBottom: 0 }}>
                                        <Text style={[TYPE.caption, { color: colors.textMuted }]}>
                                            Set a different race strategy for each track distance. Auto picks the best strategy. Default leaves the in-game strategy alone.
                                        </Text>
                                    </View>
                                    <View>
                                        <Text style={styles.perDistanceGroupLabel}>JUNIOR YEAR</Text>
                                        <View style={styles.perDistanceBody}>
                                            {(["Short", "Mile", "Medium", "Long"] as const).map((distance) => (
                                                <View key={`junior-${distance}`} style={styles.perDistanceItem}>
                                                    <Text style={[TYPE.body, { color: colors.text, flex: 1 }]}>{distance}</Text>
                                                    <CustomSelect
                                                        searchId={`junior-strategy-${distance.toLowerCase()}`}
                                                        searchTitle={`Junior Year ${distance} Distance Strategy`}
                                                        searchDescription={`The race strategy to use for ${distance.toLowerCase()} distance races during Junior Year.`}
                                                        width={140}
                                                        options={RACE_STRATEGY_OPTIONS.map((value) => ({ value, label: value }))}
                                                        value={juniorYearPerDistanceStrategies?.[distance] ?? "Default"}
                                                        onValueChange={(value) => {
                                                            const updated = { ...juniorYearPerDistanceStrategies, [distance]: value }
                                                            updateRacingSetting("juniorYearPerDistanceStrategies", updated)
                                                        }}
                                                        placeholder="Default"
                                                    />
                                                </View>
                                            ))}
                                        </View>
                                    </View>
                                    <View>
                                        <Text style={[styles.perDistanceGroupLabel, { paddingTop: 0 }]}>CLASSIC AND SENIOR YEAR</Text>
                                        <View style={styles.perDistanceBody}>
                                            {(["Short", "Mile", "Medium", "Long"] as const).map((distance) => (
                                                <View key={`original-${distance}`} style={styles.perDistanceItem}>
                                                    <Text style={[TYPE.body, { color: colors.text, flex: 1 }]}>{distance}</Text>
                                                    <CustomSelect
                                                        searchId={`original-strategy-${distance.toLowerCase()}`}
                                                        searchTitle={`Original ${distance} Distance Strategy`}
                                                        searchDescription={`The race strategy to use for ${distance.toLowerCase()} distance races in Year 2 and beyond.`}
                                                        width={140}
                                                        options={RACE_STRATEGY_OPTIONS.map((value) => ({ value, label: value }))}
                                                        value={originalPerDistanceStrategies?.[distance] ?? "Default"}
                                                        onValueChange={(value) => {
                                                            const updated = { ...originalPerDistanceStrategies, [distance]: value }
                                                            updateRacingSetting("originalPerDistanceStrategies", updated)
                                                        }}
                                                        placeholder="Default"
                                                    />
                                                </View>
                                            ))}
                                        </View>
                                    </View>
                                </>
                            )}
                        </Section>

                        {/* //////////////////////////////////////////////////////////////////////////////////////////////////
                            //////////////////////////////////////////////////////////////////////////////////////////////////
                            In-Game Race Agenda */}
                        <Section label="In-Game Race Agenda">
                            <SearchableItem
                                id="enable-user-in-game-race-agenda"
                                title="Enable User In-Game Race Agenda"
                                description="When enabled, the bot will load your selected in-game race agenda instead of using the racing plan settings. Note that this will disable the farming fans and racing plan settings."
                            >
                                <Row
                                    title="Enable User In-Game Race Agenda"
                                    description="When enabled, the bot will load your selected in-game race agenda instead of using the racing plan settings. Note that this will disable the farming fans and racing plan settings."
                                    right={<Switch checked={enableUserInGameRaceAgenda} onCheckedChange={(checked) => updateRacingSetting("enableUserInGameRaceAgenda", checked)} />}
                                />
                            </SearchableItem>
                            {enableUserInGameRaceAgenda && (
                                <>
                                    <SearchableItem
                                        id="user-in-game-race-agenda"
                                        title="Select Agenda"
                                        description="The in-game race agenda the bot loads when the toggle above is enabled."
                                        parentId="enable-user-in-game-race-agenda"
                                    >
                                        <Row
                                            title="Select Agenda"
                                            description="The in-game race agenda the bot loads when the toggle above is enabled."
                                            right={
                                                <CustomSelect
                                                    placeholder="Agenda 1"
                                                    width={140}
                                                    options={[
                                                        { value: "Agenda 1", label: "Agenda 1" },
                                                        { value: "Agenda 2", label: "Agenda 2" },
                                                        { value: "Agenda 3", label: "Agenda 3" },
                                                        { value: "Agenda 4", label: "Agenda 4" },
                                                        { value: "Agenda 5", label: "Agenda 5" },
                                                        { value: "Agenda 6", label: "Agenda 6" },
                                                        { value: "Agenda 7", label: "Agenda 7" },
                                                        { value: "Agenda 8", label: "Agenda 8" },
                                                    ]}
                                                    value={racingSettings.selectedUserAgenda}
                                                    onValueChange={(value) => updateRacingSetting("selectedUserAgenda", value)}
                                                />
                                            }
                                        />
                                    </SearchableItem>
                                    <SearchableItem
                                        id="custom-agenda-title"
                                        title="Custom Agenda Title"
                                        description="If you renamed your agenda in-game, enter the custom title here. Leave blank to use the selected agenda name above."
                                        parentId="enable-user-in-game-race-agenda"
                                    >
                                        <View style={{ padding: SPACING.md, gap: SPACING.xs }}>
                                            <Text style={[TYPE.body, { color: colors.text, fontWeight: "500" as const }]}>Custom Agenda Title (Optional)</Text>
                                            <Text style={[TYPE.caption, { color: colors.textMuted }]}>
                                                If you renamed your agenda in-game, enter the custom title here. Leave blank to use the selected agenda name above.
                                            </Text>
                                            <TextInput
                                                style={[styles.input, { marginTop: SPACING.sm }]}
                                                value={customAgendaTitle}
                                                onChangeText={(text) => updateRacingSetting("customAgendaTitle", text)}
                                                placeholder="Leave blank to use selected agenda name"
                                                placeholderTextColor={colors.textMuted}
                                                autoCapitalize="none"
                                                autoCorrect={false}
                                            />
                                        </View>
                                    </SearchableItem>
                                    <SearchableItem
                                        id="limit-races-to-in-game-agenda"
                                        title="Limit Extra Races to Agenda"
                                        description="When enabled, the bot will override the racing behavior of any scenario such that it will not run any extra races except for the ones scheduled by the selected user's in-game racing agenda."
                                        parentId="enable-user-in-game-race-agenda"
                                    >
                                        <Row
                                            title="Limit Extra Races to Agenda"
                                            description="When enabled, the bot will override the racing behavior of any scenario such that it will not run any extra races except for the ones scheduled by the selected user's in-game racing agenda."
                                            right={<Switch checked={limitRacesToInGameAgenda} onCheckedChange={(checked) => updateRacingSetting("limitRacesToInGameAgenda", checked)} />}
                                        />
                                    </SearchableItem>
                                    <SearchableItem
                                        id="skip-summer-training-for-agenda"
                                        title="Skip Summer Training for Agenda"
                                        description="When enabled, the bot will perform scheduled races from the in-game racing agenda during Summer instead of prioritizing Summer training. Note that this requires 'Enable User In-Game Race Agenda' to be enabled."
                                        parentId="enable-user-in-game-race-agenda"
                                    >
                                        <Row
                                            title="Skip Summer Training for Agenda"
                                            description="When enabled, the bot will perform scheduled races from the in-game racing agenda during Summer instead of prioritizing Summer training. Note that this requires 'Enable User In-Game Race Agenda' to be enabled."
                                            right={<Switch checked={skipSummerTrainingForAgenda} onCheckedChange={(checked) => updateRacingSetting("skipSummerTrainingForAgenda", checked)} />}
                                        />
                                    </SearchableItem>
                                </>
                            )}
                        </Section>

                        {/* //////////////////////////////////////////////////////////////////////////////////////////////////
                            //////////////////////////////////////////////////////////////////////////////////////////////////
                            Advanced */}
                        <SectionLabel label="Advanced" />
                        <Pressable
                            onPress={() => navigation.navigate("SmartRaceSolverSettings" as never)}
                            android_ripple={{ color: colors.ripple, foreground: true }}
                            accessibilityRole="button"
                            disabled={enableForceRacing || enableUserInGameRaceAgenda}
                            style={{ opacity: enableForceRacing || enableUserInGameRaceAgenda ? 0.5 : 1, marginBottom: SPACING.md }}
                        >
                            <GlassSurface style={{ borderRadius: RADII.lg }}>
                                <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md }}>
                                    <View
                                        style={{
                                            width: 36,
                                            height: 36,
                                            borderRadius: 999,
                                            backgroundColor: colors.brandSubtle,
                                            alignItems: "center",
                                            justifyContent: "center",
                                        }}
                                    >
                                        <Cpu size={18} color={colors.brand} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ ...TYPE.body, color: colors.brand, fontWeight: "600" }}>Smart Race Solver</Text>
                                        <Text style={{ ...TYPE.caption, color: colors.textMuted }}>Let the solver pick races automatically</Text>
                                    </View>
                                    <ChevronRight size={16} color={colors.brand} />
                                </View>
                            </GlassSurface>
                        </Pressable>
                        {(enableForceRacing || enableUserInGameRaceAgenda) && (
                            <WarningContainer>Force Racing and User In-Game Race Agenda settings must be disabled in order to use the Smart Race Solver.</WarningContainer>
                        )}
                    </View>
                </ScrollView>

                {/* //////////////////////////////////////////////////////////////////////////////////////////////////
                    //////////////////////////////////////////////////////////////////////////////////////////////////
                    Strategy picker modals */}
                <SheetModal
                    visible={juniorPickerOpen}
                    onRequestClose={() => setJuniorPickerOpen(false)}
                    header={
                        <View style={modalShellStyles.modalHeaderRow}>
                            <Text style={modalShellStyles.modalTitleMono}>JUNIOR YEAR STRATEGY</Text>
                            <Pressable
                                style={modalShellStyles.modalCloseChip}
                                onPress={() => setJuniorPickerOpen(false)}
                                android_ripple={{ color: colors.ripple, foreground: true }}
                                accessibilityLabel="Close"
                            >
                                <Ionicons name="close" size={18} color={colors.text} />
                            </Pressable>
                        </View>
                    }
                    footer={null}
                >
                    {renderStrategyOptions(juniorYearRaceStrategy, (value) => {
                        updateRacingSetting("juniorYearRaceStrategy", value)
                        setJuniorPickerOpen(false)
                    })}
                </SheetModal>

                <SheetModal
                    visible={originalPickerOpen}
                    onRequestClose={() => setOriginalPickerOpen(false)}
                    header={
                        <View style={modalShellStyles.modalHeaderRow}>
                            <Text style={modalShellStyles.modalTitleMono}>ORIGINAL STRATEGY</Text>
                            <Pressable
                                style={modalShellStyles.modalCloseChip}
                                onPress={() => setOriginalPickerOpen(false)}
                                android_ripple={{ color: colors.ripple, foreground: true }}
                                accessibilityLabel="Close"
                            >
                                <Ionicons name="close" size={18} color={colors.text} />
                            </Pressable>
                        </View>
                    }
                    footer={null}
                >
                    {renderStrategyOptions(originalRaceStrategy, (value) => {
                        updateRacingSetting("originalRaceStrategy", value)
                        setOriginalPickerOpen(false)
                    })}
                </SheetModal>
            </SearchPageProvider>
        </View>
    )
}

export default RacingSettings
