import { useMemo, useContext, useRef, useState, useCallback } from "react"
import { View, Text, ScrollView, StyleSheet, Image, TouchableOpacity } from "react-native"
import { Divider } from "react-native-paper"
import { useTheme } from "../../context/ThemeContext"
import { ScenarioOverridesContext, BotMetaContext, Settings } from "../../context/BotStateContext"
import { SearchPageProvider } from "../../context/SearchPageContext"
import CustomSlider from "../../components/CustomSlider"
import CustomCheckbox from "../../components/CustomCheckbox"
import CustomTitle from "../../components/CustomTitle"
import CustomButton from "../../components/CustomButton"
import PageHeader from "../../components/PageHeader"
import { Input } from "../../components/ui/input"
import { CircleCheckBig, Trash2 } from "lucide-react-native"
import { usePerformanceLogging } from "../../hooks/usePerformanceLogging"
import trackblazerIcons from "./icons"

/**
 * The Scenario Overrides Settings page.
 * Provides configuration for scenario-specific behavior overrides.
 */
const ScenarioOverridesSettings = () => {
    usePerformanceLogging("ScenarioOverridesSettings")
    const { colors } = useTheme()
    const { scenarioOverrides, updateScenarioOverrides } = useContext(ScenarioOverridesContext)
    const { defaultSettings } = useContext(BotMetaContext)
    const scrollViewRef = useRef<ScrollView>(null)

    const [searchQuery, setSearchQuery] = useState("")

    const filteredItems = useMemo(() => {
        return Object.keys(trackblazerIcons).filter((itemName) => {
            const item = trackblazerIcons[itemName]
            const query = searchQuery.toLowerCase()
            return itemName.toLowerCase().includes(query) || item.description.toLowerCase().includes(query)
        })
    }, [searchQuery])

    /**
     * Update a scenario override setting.
     * @param key The key of the setting to update.
     * @param value The value to set the setting to.
     */
    const updateOverrideSetting = useCallback(
        (key: keyof Settings["scenarioOverrides"], value: any) => {
            updateScenarioOverrides({ [key]: value } as Partial<Settings["scenarioOverrides"]>)
        },
        [updateScenarioOverrides]
    )

    /**
     * Toggle the exclusion status of an item.
     * @param itemName The name of the item to toggle.
     */
    const handleItemPress = useCallback(
        (itemName: string) => {
            const currentExcluded = scenarioOverrides.trackblazerExcludedItems
            if (currentExcluded.includes(itemName)) {
                updateOverrideSetting(
                    "trackblazerExcludedItems",
                    currentExcluded.filter((id) => id !== itemName)
                )
            } else {
                updateOverrideSetting("trackblazerExcludedItems", [...currentExcluded, itemName])
            }
        },
        [scenarioOverrides.trackblazerExcludedItems, updateOverrideSetting]
    )

    const styles = useMemo(
        () =>
            StyleSheet.create({
                root: {
                    flex: 1,
                    flexDirection: "column",
                    justifyContent: "center",
                    margin: 10,
                    backgroundColor: colors.background,
                },
                section: {
                    marginBottom: 8,
                },
                itemContainer: {
                    backgroundColor: colors.card,
                    padding: 12,
                    borderRadius: 8,
                    marginBottom: 8,
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                },
            }),
        [colors]
    )

    return (
        <View style={styles.root}>
            <PageHeader title="Scenario Overrides Settings" />

            <SearchPageProvider page="ScenarioOverridesSettings" scrollViewRef={scrollViewRef}>
                <ScrollView ref={scrollViewRef} nestedScrollEnabled={true} showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
                    <View className="m-1">
                        <CustomTitle title="Trackblazer Overrides" description="Specific overrides for the Trackblazer scenario." />

                        <View style={styles.section}>
                            <CustomSlider
                                searchId="trackblazer-consecutive-races-limit"
                                value={scenarioOverrides.trackblazerConsecutiveRacesLimit}
                                placeholder={defaultSettings.scenarioOverrides.trackblazerConsecutiveRacesLimit}
                                onValueChange={(value) => updateOverrideSetting("trackblazerConsecutiveRacesLimit", value)}
                                onSlidingComplete={(value) => updateOverrideSetting("trackblazerConsecutiveRacesLimit", value)}
                                min={3}
                                max={30}
                                step={1}
                                label="Consecutive Races Limit"
                                labelUnit=""
                                showValue={true}
                                showLabels={true}
                                description="Sets the maximum number of consecutive races the bot is allowed to run in the Trackblazer scenario before stopping. Note that a -30 stat penalty can apply starting from 3 consecutive races."
                            />
                        </View>

                        <View style={styles.section}>
                            <CustomSlider
                                searchId="trackblazer-energy-threshold"
                                value={scenarioOverrides.trackblazerEnergyThreshold}
                                placeholder={defaultSettings.scenarioOverrides.trackblazerEnergyThreshold}
                                onValueChange={(value) => updateOverrideSetting("trackblazerEnergyThreshold", value)}
                                onSlidingComplete={(value) => updateOverrideSetting("trackblazerEnergyThreshold", value)}
                                min={0}
                                max={100}
                                step={5}
                                label="Energy Threshold to use Energy Items"
                                labelUnit=""
                                showValue={true}
                                showLabels={true}
                                description="The energy level below which the bot will attempt to use energy-restoring items in the Trackblazer scenario."
                            />
                        </View>

                        <View style={styles.section}>
                            <CustomSlider
                                searchId="trackblazer-max-retries-per-race"
                                value={scenarioOverrides.trackblazerMaxRetriesPerRace}
                                placeholder={defaultSettings.scenarioOverrides.trackblazerMaxRetriesPerRace}
                                onValueChange={(value) => updateOverrideSetting("trackblazerMaxRetriesPerRace", value)}
                                onSlidingComplete={(value) => updateOverrideSetting("trackblazerMaxRetriesPerRace", value)}
                                min={0}
                                max={5}
                                step={1}
                                label="Max Retries per Race"
                                labelUnit=""
                                showValue={true}
                                showLabels={true}
                                description="The maximum number of times the bot will attempt to retry a failed race in the Trackblazer scenario."
                            />
                        </View>

                        <View style={styles.section}>
                            <CustomSlider
                                searchId="trackblazer-min-stat-gain-for-charm"
                                value={scenarioOverrides.trackblazerMinStatGainForCharm}
                                placeholder={defaultSettings.scenarioOverrides.trackblazerMinStatGainForCharm}
                                onValueChange={(value) => updateOverrideSetting("trackblazerMinStatGainForCharm", value)}
                                onSlidingComplete={(value) => updateOverrideSetting("trackblazerMinStatGainForCharm", value)}
                                min={20}
                                max={100}
                                step={5}
                                label="Minimum Main Stat Gain for Good-Luck Charm"
                                labelUnit=""
                                showValue={true}
                                showLabels={true}
                                description="The minimum expected gain for the main training stat required to use a Good-Luck Charm instead of skipping training."
                            />
                        </View>

                        <View style={styles.section}>
                            <CustomSlider
                                searchId="trackblazer-low-main-stat-gain-item-floor"
                                value={scenarioOverrides.trackblazerLowMainStatGainItemFloor}
                                placeholder={defaultSettings.scenarioOverrides.trackblazerLowMainStatGainItemFloor}
                                onValueChange={(value) => updateOverrideSetting("trackblazerLowMainStatGainItemFloor", value)}
                                onSlidingComplete={(value) => updateOverrideSetting("trackblazerLowMainStatGainItemFloor", value)}
                                min={0}
                                max={50}
                                step={1}
                                label="Low Main Stat Gain Item Floor"
                                labelUnit=""
                                showValue={true}
                                showLabels={true}
                                description="When mood is BAD or AWFUL, refuse to use Reset Whistle / Good-Luck Charm / Megaphone if main-stat gain is below this floor. Prevents wasting items on structurally low-return turns where the mood multiplier caps the stat gains."
                            />
                        </View>

                        <View style={styles.section}>
                            <CustomCheckbox
                                searchId="trackblazer-enable-irregular-training"
                                checked={scenarioOverrides.trackblazerEnableIrregularTraining}
                                onCheckedChange={(checked) => updateOverrideSetting("trackblazerEnableIrregularTraining", checked)}
                                label="Enable Irregular Training"
                                description="When enabled, the bot will occasionally check for highly profitable training sessions before opting for extra races."
                            />
                        </View>

                        {scenarioOverrides.trackblazerEnableIrregularTraining && (
                            <View style={styles.section}>
                                <CustomSlider
                                    searchId="trackblazer-irregular-training-min-stat-gain"
                                    value={scenarioOverrides.trackblazerIrregularTrainingMinStatGain}
                                    placeholder={defaultSettings.scenarioOverrides.trackblazerIrregularTrainingMinStatGain}
                                    onValueChange={(value) => updateOverrideSetting("trackblazerIrregularTrainingMinStatGain", value)}
                                    onSlidingComplete={(value) => updateOverrideSetting("trackblazerIrregularTrainingMinStatGain", value)}
                                    min={20}
                                    max={100}
                                    step={5}
                                    label="Minimum Main Stat Gain for Irregular Training"
                                    labelUnit=""
                                    showValue={true}
                                    showLabels={true}
                                    description="Sets the minimum main stat gain required to skip racing and perform Irregular Training instead."
                                />
                            </View>
                        )}

                        <View style={styles.section}>
                            <CustomCheckbox
                                searchId="trackblazer-whistle-forces-training"
                                checked={scenarioOverrides.trackblazerWhistleForcesTraining}
                                onCheckedChange={(checked) => updateOverrideSetting("trackblazerWhistleForcesTraining", checked)}
                                label="Reset Whistle Forces Training"
                                description="Whether or not using a Reset Whistle means it can ignore the failure chance thresholds in the Training Settings page. If enabled, the bot will pick the best available training after usage even if it's risky."
                            />
                        </View>

                        <View style={styles.section}>
                            <CustomSlider
                                searchId="trackblazer-shop-check-frequency"
                                value={scenarioOverrides.trackblazerShopCheckFrequency}
                                placeholder={defaultSettings.scenarioOverrides.trackblazerShopCheckFrequency}
                                onValueChange={(value) => updateOverrideSetting("trackblazerShopCheckFrequency", value)}
                                onSlidingComplete={(value) => updateOverrideSetting("trackblazerShopCheckFrequency", value)}
                                min={1}
                                max={4}
                                step={1}
                                label="Shop Check Frequency"
                                labelUnit=""
                                showValue={true}
                                showLabels={true}
                                description="Sets the frequency of shop checks after races in the Trackblazer scenario. 1 = every race, 2 = 1 day after, 3 = 2 days after, etc."
                            />
                        </View>

                        <View style={styles.section}>
                            <Text style={{ fontSize: 16, color: colors.foreground, marginBottom: 8 }}>Race Grades to check Shop Afterwards</Text>
                            <Text style={{ fontSize: 14, color: colors.foreground, opacity: 0.7, marginBottom: 12 }}>
                                Select which race grades should trigger a shop check after the race in the Trackblazer scenario.
                            </Text>
                            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                                {["G1", "G2", "G3"].map((grade) => (
                                    <View
                                        key={grade}
                                        style={{
                                            padding: 10,
                                            borderRadius: 8,
                                            marginRight: 8,
                                            marginBottom: 8,
                                            backgroundColor: scenarioOverrides.trackblazerShopCheckGrades.includes(grade) ? colors.primary : colors.card,
                                        }}
                                        onTouchEnd={() => {
                                            const currentGrades = scenarioOverrides.trackblazerShopCheckGrades
                                            if (currentGrades.includes(grade)) {
                                                updateOverrideSetting(
                                                    "trackblazerShopCheckGrades",
                                                    currentGrades.filter((g) => g !== grade)
                                                )
                                            } else {
                                                updateOverrideSetting("trackblazerShopCheckGrades", [...currentGrades, grade])
                                            }
                                        }}
                                    >
                                        <Text
                                            style={{
                                                fontSize: 14,
                                                fontWeight: "600",
                                                color: scenarioOverrides.trackblazerShopCheckGrades.includes(grade) ? colors.background : colors.foreground,
                                            }}
                                        >
                                            {grade}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        </View>

                        <View style={styles.section}>
                            <Text style={{ fontSize: 16, color: colors.foreground, marginBottom: 8 }}>Race Grades to use Race Retries on</Text>
                            <Text style={{ fontSize: 14, color: colors.foreground, opacity: 0.7, marginBottom: 12 }}>
                                Select which race grades should allow using a Race Retry in the Trackblazer scenario.
                            </Text>
                            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                                {["G1", "G2", "G3"].map((grade) => (
                                    <View
                                        key={grade}
                                        style={{
                                            padding: 10,
                                            borderRadius: 8,
                                            marginRight: 8,
                                            marginBottom: 8,
                                            backgroundColor: scenarioOverrides.trackblazerRetryRacesBeforeFinalGrades.includes(grade) ? colors.primary : colors.card,
                                        }}
                                        onTouchEnd={() => {
                                            const currentGrades = scenarioOverrides.trackblazerRetryRacesBeforeFinalGrades
                                            if (currentGrades.includes(grade)) {
                                                updateOverrideSetting(
                                                    "trackblazerRetryRacesBeforeFinalGrades",
                                                    currentGrades.filter((g) => g !== grade)
                                                )
                                            } else {
                                                updateOverrideSetting("trackblazerRetryRacesBeforeFinalGrades", [...currentGrades, grade])
                                            }
                                        }}
                                    >
                                        <Text
                                            style={{
                                                fontSize: 14,
                                                fontWeight: "600",
                                                color: scenarioOverrides.trackblazerRetryRacesBeforeFinalGrades.includes(grade) ? colors.background : colors.foreground,
                                            }}
                                        >
                                            {grade}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        </View>

                        <View style={styles.section}>
                            <Text style={{ fontSize: 16, color: colors.foreground, marginBottom: 8 }}>Preferred Track Distances</Text>
                            <Text style={{ fontSize: 14, color: colors.foreground, opacity: 0.7, marginBottom: 12 }}>
                                Select preferred track distances for extra race selection. Matching races will be prioritized. Leave empty for no preference.
                            </Text>
                            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                                {["Sprint", "Mile", "Medium", "Long"].map((distance) => (
                                    <View
                                        key={distance}
                                        style={{
                                            padding: 10,
                                            borderRadius: 8,
                                            marginRight: 8,
                                            marginBottom: 8,
                                            backgroundColor: scenarioOverrides.trackblazerPreferredDistances.includes(distance) ? colors.primary : colors.card,
                                        }}
                                        onTouchEnd={() => {
                                            const current = scenarioOverrides.trackblazerPreferredDistances
                                            if (current.includes(distance)) {
                                                updateOverrideSetting(
                                                    "trackblazerPreferredDistances",
                                                    current.filter((d) => d !== distance)
                                                )
                                            } else {
                                                updateOverrideSetting("trackblazerPreferredDistances", [...current, distance])
                                            }
                                        }}
                                    >
                                        <Text
                                            style={{
                                                fontSize: 14,
                                                fontWeight: "600",
                                                color: scenarioOverrides.trackblazerPreferredDistances.includes(distance) ? colors.background : colors.foreground,
                                            }}
                                        >
                                            {distance}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        </View>

                        <View style={styles.section}>
                            <Text style={{ fontSize: 16, color: colors.foreground, marginBottom: 8 }}>Preferred Track Surfaces</Text>
                            <Text style={{ fontSize: 14, color: colors.foreground, opacity: 0.7, marginBottom: 12 }}>
                                Select preferred track surfaces for extra race selection. Matching races will be prioritized. Leave empty for no preference.
                            </Text>
                            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                                {["Turf", "Dirt"].map((surface) => (
                                    <View
                                        key={surface}
                                        style={{
                                            padding: 10,
                                            borderRadius: 8,
                                            marginRight: 8,
                                            marginBottom: 8,
                                            backgroundColor: scenarioOverrides.trackblazerPreferredSurfaces.includes(surface) ? colors.primary : colors.card,
                                        }}
                                        onTouchEnd={() => {
                                            const current = scenarioOverrides.trackblazerPreferredSurfaces
                                            if (current.includes(surface)) {
                                                updateOverrideSetting(
                                                    "trackblazerPreferredSurfaces",
                                                    current.filter((s) => s !== surface)
                                                )
                                            } else {
                                                updateOverrideSetting("trackblazerPreferredSurfaces", [...current, surface])
                                            }
                                        }}
                                    >
                                        <Text
                                            style={{
                                                fontSize: 14,
                                                fontWeight: "600",
                                                color: scenarioOverrides.trackblazerPreferredSurfaces.includes(surface) ? colors.background : colors.foreground,
                                            }}
                                        >
                                            {surface}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        </View>

                        <Divider style={{ marginVertical: 16 }} />

                        <View style={styles.section}>
                            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 12 }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 16, color: colors.foreground }}>Items to Exclude from Shop</Text>
                                    <Text style={{ fontSize: 14, color: colors.foreground, opacity: 0.7, marginTop: 4 }}>
                                        Selected {scenarioOverrides.trackblazerExcludedItems.length} / {Object.keys(trackblazerIcons).length} items
                                    </Text>
                                </View>
                                <View style={{ flexDirection: "row", gap: 8 }}>
                                    <CustomButton icon={<Trash2 size={16} />} onPress={() => updateOverrideSetting("trackblazerExcludedItems", [])}>
                                        Clear
                                    </CustomButton>
                                </View>
                            </View>

                            <Text style={{ fontSize: 14, color: colors.foreground, opacity: 0.7, marginBottom: 12 }}>
                                Select items that the bot will never purchase from the shop in the Trackblazer scenario.
                            </Text>

                            <View style={{ marginBottom: 16 }}>
                                <Input
                                    style={{
                                        borderWidth: 1,
                                        borderColor: colors.border,
                                        borderRadius: 8,
                                        padding: 12,
                                        fontSize: 16,
                                        color: colors.foreground,
                                        backgroundColor: colors.background,
                                        marginBottom: 12,
                                    }}
                                    value={searchQuery}
                                    onChangeText={setSearchQuery}
                                    placeholder="Search items by name..."
                                />
                                <View style={{ height: 400 }}>
                                    <ScrollView nestedScrollEnabled={true} showsVerticalScrollIndicator={true}>
                                        {filteredItems.map((itemName) => (
                                            <TouchableOpacity key={itemName} onPress={() => handleItemPress(itemName)} style={styles.itemContainer}>
                                                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                                                    <Image source={trackblazerIcons[itemName].icon} style={{ width: 48, height: 48, marginRight: 8 }} />
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground }}>{itemName}</Text>
                                                        <Text style={{ fontSize: 12, color: colors.foreground, opacity: 0.6, marginTop: 2 }}>{trackblazerIcons[itemName].description}</Text>
                                                    </View>
                                                    {scenarioOverrides.trackblazerExcludedItems.includes(itemName) && <CircleCheckBig size={18} color={"green"} />}
                                                </View>
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>
                                </View>
                            </View>
                        </View>
                    </View>
                </ScrollView>
            </SearchPageProvider>
        </View>
    )
}

export default ScenarioOverridesSettings
