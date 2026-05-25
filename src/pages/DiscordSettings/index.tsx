import { useMemo, useContext, useRef, useState, useCallback } from "react"
import { View, ScrollView, StyleSheet, TextInput, Text, Pressable } from "react-native"
import { useTheme } from "../../context/ThemeContext"
import { DiscordContext, defaultSettings, Settings } from "../../context/BotStateContext"
import { SearchPageProvider } from "../../context/SearchPageContext"
import CustomButton from "../../components/CustomButton"
import PageHeader from "../../components/PageHeader"
import WarningContainer from "../../components/WarningContainer"
import SearchableItem from "../../components/SearchableItem"
import WizardSteps, { WizardStep } from "../../components/WizardSteps"
import { Row } from "../../components/ui/row"
import { Switch } from "../../components/ui/switch"
import { SectionLabel } from "../../components/ui/section-label"
import { usePerformanceLogging } from "../../hooks/usePerformanceLogging"
import { NativeModules } from "react-native"
import { TYPE } from "../../lib/type"
import { SPACING } from "../../lib/spacing"
import { RADII } from "../../lib/radii"

/**
 * Discord Settings page for configuring Discord bot notifications.
 *
 * Allows the user to enable Discord notifications, enter their bot token
 * and user ID, and test the connection by sending a test DM.
 */
const DiscordSettings = () => {
    usePerformanceLogging("DiscordSettings")
    const { colors, isDark } = useTheme()
    const { discord, updateDiscord } = useContext(DiscordContext)
    const scrollViewRef = useRef<ScrollView>(null)

    // Test connection state.
    const [isTesting, setIsTesting] = useState(false)
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

    // Merge current Discord settings with defaults to handle missing properties.
    const discordSettings = { ...defaultSettings.discord, ...discord }
    const { enableDiscordNotifications, discordToken } = discordSettings
    // Coerce to string since SQLite may store numeric IDs as numbers.
    const discordUserID = String(discordSettings.discordUserID || "")

    /**
     * Updates a single Discord setting value.
     * @param key The setting key to update.
     * @param value The new value for the setting.
     */
    const updateDiscordSetting = useCallback(
        (key: keyof Settings["discord"], value: any) => {
            updateDiscord({ [key]: value } as Partial<Settings["discord"]>)
        },
        [updateDiscord]
    )

    /**
     * Tests the Discord connection by sending a test DM via the native module.
     * Displays success or failure feedback to the user.
     */
    const handleTestConnection = useCallback(async () => {
        if (!discordToken || !discordUserID) {
            setTestResult({ success: false, message: "Please enter both a bot token and user ID." })
            return
        }

        setIsTesting(true)
        setTestResult(null)

        try {
            const result = await NativeModules.StartModule.testDiscordConnection(discordToken, discordUserID)
            setTestResult({ success: true, message: result || "Test message sent successfully!" })
        } catch (error: any) {
            setTestResult({ success: false, message: error?.message || "Failed to connect to Discord." })
        } finally {
            setIsTesting(false)
        }
    }, [discordToken, discordUserID])

    const canTest = enableDiscordNotifications && !!discordToken && !!discordUserID && !isTesting
    const activeIndex = !discordToken ? 1 : !discordUserID ? 2 : 3

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
                    marginBottom: SPACING.xl,
                },
                textInput: {
                    borderWidth: 1,
                    borderColor: isDark ? "#444" : "#ccc",
                    borderRadius: RADII.md,
                    padding: 12,
                    fontSize: 14,
                    color: colors.text,
                    backgroundColor: isDark ? "#1a1a1a" : "#f9f9f9",
                },
                textInputDisabled: {
                    opacity: 0.5,
                },
                resultContainer: {
                    marginTop: 12,
                    padding: 12,
                    borderRadius: RADII.md,
                    borderWidth: 1,
                },
                resultSuccess: {
                    backgroundColor: isDark ? "#0a3d0a" : "#e6ffe6",
                    borderColor: isDark ? "#1a6b1a" : "#00cc00",
                },
                resultFailure: {
                    backgroundColor: isDark ? "#3d0a0a" : "#ffe6e6",
                    borderColor: isDark ? "#6b1a1a" : "#cc0000",
                },
                resultText: {
                    fontSize: 13,
                    color: colors.text,
                },
            }),
        [colors, isDark]
    )

    const steps: WizardStep[] = useMemo(
        () => [
            {
                n: 1,
                title: "Create a Discord bot",
                body: (
                    <Text style={{ ...TYPE.caption, color: colors.textMuted, marginTop: SPACING.xs }}>
                        Visit developer.discord.com and create a bot application. Make sure it shares a server with you.
                    </Text>
                ),
            },
            {
                n: 2,
                title: "Paste bot token",
                body: (
                    <SearchableItem id="discordBotToken" title="Discord Bot Token" description="The token generated from the Discord Developer Portal. Your Discord bot must share a server with you.">
                        <Pressable android_ripple={{ color: colors.ripple, foreground: true }}>
                            <TextInput
                                style={[styles.textInput, !enableDiscordNotifications && styles.textInputDisabled]}
                                value={discordToken}
                                onChangeText={(text) => updateDiscordSetting("discordToken", text)}
                                placeholder="Enter your Discord bot token..."
                                placeholderTextColor={colors.textSubtle}
                                editable={enableDiscordNotifications}
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                        </Pressable>
                    </SearchableItem>
                ),
            },
            {
                n: 3,
                title: "Set your User ID",
                body: (
                    <SearchableItem
                        id="discordUserID"
                        title="Discord User ID"
                        description="Your Discord user ID. Enable Developer Mode in Discord settings, then click your name and select 'Copy User ID'."
                    >
                        <Pressable android_ripple={{ color: colors.ripple, foreground: true }}>
                            <TextInput
                                style={[styles.textInput, !enableDiscordNotifications && styles.textInputDisabled]}
                                value={discordUserID}
                                onChangeText={(text) => updateDiscordSetting("discordUserID", text)}
                                placeholder="Enter your Discord user ID..."
                                placeholderTextColor={colors.textSubtle}
                                editable={enableDiscordNotifications}
                                keyboardType="numeric"
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                        </Pressable>
                    </SearchableItem>
                ),
            },
            {
                n: 4,
                title: "Test connection",
                body: (
                    <View style={{ marginTop: SPACING.xs }}>
                        <CustomButton variant="primary" disabled={!canTest} onPress={handleTestConnection} isLoading={isTesting}>
                            Test Connection
                        </CustomButton>
                        {!canTest && <Text style={{ ...TYPE.caption, color: colors.textMuted, textAlign: "center", marginTop: SPACING.xs }}>Enabled once token + user ID are filled</Text>}
                        {testResult && (
                            <View style={[styles.resultContainer, testResult.success ? styles.resultSuccess : styles.resultFailure]}>
                                <Text style={styles.resultText}>
                                    {testResult.success ? "Sent: " : "Error: "}
                                    {testResult.message}
                                </Text>
                            </View>
                        )}
                    </View>
                ),
            },
        ],
        [styles, colors, enableDiscordNotifications, discordToken, discordUserID, canTest, isTesting, testResult, handleTestConnection, updateDiscordSetting]
    )

    return (
        <View style={styles.root}>
            <SearchPageProvider page="DiscordSettings" scrollViewRef={scrollViewRef}>
                <PageHeader title="Discord Settings" />
                <ScrollView
                    ref={scrollViewRef}
                    nestedScrollEnabled={true}
                    showsVerticalScrollIndicator={false}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ flexGrow: 1 }}
                >
                    <View className="m-1">
                        {/* Enable Discord Notifications */}
                        <SearchableItem id="enableDiscordNotifications" title="Enable Discord Notifications" description="DM run results when the bot stops">
                            <Row
                                title="Discord Notifications"
                                description="DM run results when the bot stops"
                                right={<Switch checked={enableDiscordNotifications} onCheckedChange={(checked) => updateDiscordSetting("enableDiscordNotifications", checked)} />}
                            />
                        </SearchableItem>

                        {/* Setup wizard */}
                        <View style={styles.section}>
                            <SectionLabel label="Setup" />
                            <WizardSteps steps={steps} activeIndex={activeIndex} />
                        </View>

                        <WarningContainer>
                            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                                <Text style={{ fontWeight: "bold", color: colors.warningText }}>⚠️ Security Note: </Text>
                                <Text style={{ fontSize: 14, color: colors.warningText, lineHeight: 20 }}>
                                    Your token is stored locally on this device and will not be included when exporting settings.
                                </Text>
                            </View>
                        </WarningContainer>
                    </View>
                </ScrollView>
            </SearchPageProvider>
        </View>
    )
}

export default DiscordSettings
