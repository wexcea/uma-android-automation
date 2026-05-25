import { useMemo } from "react"
import { View, Text, ScrollView, StyleSheet } from "react-native"
import { useNavigation, useRoute, CommonActions } from "@react-navigation/native"
import { useTheme } from "../../context/ThemeContext"
import CustomButton from "../../components/CustomButton"
import { SettingsChange } from "../../hooks/useSettingsFileManager"
import { useSettings } from "../../context/SettingsContext"
import PageHeader from "../../components/PageHeader"
import { usePerformanceLogging } from "../../hooks/usePerformanceLogging"
import { Section } from "../../components/ui/section"
import { TYPE } from "../../lib/type"
import { SPACING } from "../../lib/spacing"

/**
 * Route params passed from the settings file manager when navigating to this screen.
 */
interface ImportSettingsPreviewParams {
    /** The list of setting changes that will be applied on import. */
    changes: SettingsChange[]
    /** The file URI of the imported settings JSON file. */
    fileUri: string
}

/**
 * The Import Settings Preview page.
 * Displays a grouped, categorized diff of all settings changes that will result
 * from importing a settings file, and provides confirm/cancel actions.
 */
const ImportSettingsPreview = () => {
    usePerformanceLogging("ImportSettingsPreview")
    const { colors, isDark } = useTheme()
    const navigation = useNavigation()
    const route = useRoute()
    const { importSettings } = useSettings()

    // Get the changes and fileUri from navigation params.
    const params = (route.params as ImportSettingsPreviewParams) || { changes: [], fileUri: "" }
    const changes = params.changes || []
    const fileUri = params.fileUri || ""

    // Group changes by category and return an object with the category as the key and the changes as the value.
    const groupedChanges = useMemo(() => {
        return changes.reduce(
            (acc, change) => {
                if (!acc[change.category]) {
                    acc[change.category] = []
                }
                acc[change.category].push(change)
                return acc
            },
            {} as Record<string, SettingsChange[]>
        )
    }, [changes])

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
                content: {
                    flex: 1,
                    padding: 12,
                },
                description: {
                    fontSize: 13,
                    color: colors.textMuted,
                    marginBottom: 16,
                    fontWeight: "500",
                },
                noChangesContainer: {
                    flex: 1,
                    justifyContent: "center",
                    alignItems: "center",
                    padding: 32,
                },
                noChangesText: {
                    fontSize: 15,
                    color: colors.textMuted,
                    textAlign: "center",
                    lineHeight: 22,
                },
                settingItem: {
                    flexDirection: "row",
                    paddingVertical: SPACING.sm,
                    paddingHorizontal: SPACING.md,
                    backgroundColor: "transparent",
                },
                settingKey: {
                    fontSize: 11,
                    color: colors.text,
                    width: 125,
                    marginRight: 10,
                    lineHeight: 17,
                },
                settingValues: {
                    flex: 1,
                    flexDirection: "row",
                    gap: 10,
                },
                valuePair: {
                    flex: 1,
                },
                valueText: {
                    fontSize: 11,
                    color: colors.text,
                    flexWrap: "wrap",
                    lineHeight: 16,
                },
                footer: {
                    paddingHorizontal: 12,
                    paddingVertical: 12,
                    borderTopWidth: 1,
                    borderTopColor: colors.borderHair,
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    backgroundColor: colors.bg,
                },
            }),
        [colors]
    )

    /**
     * Handle the confirm action.
     * Imports the settings file and resets the stack to `SettingsMain`.
     */
    const handleConfirm = async () => {
        if (fileUri) {
            await importSettings(fileUri)
        }
        // Reset the stack to SettingsMain, removing ImportSettingsPreview from history.
        navigation.dispatch(
            CommonActions.reset({
                index: 0,
                routes: [{ name: "SettingsMain" }],
            })
        )
    }

    /**
     * Handle the cancel action.
     * Resets the stack to `SettingsMain`, removing `ImportSettingsPreview` from history.
     */
    const handleCancel = () => {
        navigation.dispatch(
            CommonActions.reset({
                index: 0,
                routes: [{ name: "SettingsMain" }],
            })
        )
    }

    return (
        <View style={styles.root}>
            <PageHeader title="Import Settings Preview" />
            <ScrollView style={styles.content} showsVerticalScrollIndicator={true}>

                {changes.length === 0 ? (
                    <View style={styles.noChangesContainer}>
                        <Text style={styles.noChangesText}>No settings would be changed. The imported settings are identical to your current settings.</Text>
                    </View>
                ) : (
                    <>
                        <Text style={styles.description}>
                            <Text style={[TYPE.monoValue, { color: colors.textMuted }]}>{changes.length}</Text> setting{changes.length !== 1 ? "s" : ""} will be changed:
                        </Text>
                        {Object.entries(groupedChanges).map(([category, categoryChanges]) => (
                            <Section key={category} label={category}>
                                {categoryChanges.map((item, index) => (
                                    <View key={`${item.category}-${item.key}-${index}`} style={[styles.settingItem, index % 2 === 1 && { backgroundColor: colors.surfaceRaised }]}>
                                        <Text style={[styles.settingKey, TYPE.monoValue]}>{item.key}</Text>
                                        <View style={styles.settingValues}>
                                            <View style={styles.valuePair}>
                                                <Text style={[TYPE.monoLabel, { color: colors.warningText, marginBottom: 3 }]}>Old</Text>
                                                <Text style={styles.valueText} numberOfLines={2}>
                                                    {item.formattedOldValue}
                                                </Text>
                                            </View>
                                            <View style={styles.valuePair}>
                                                <Text style={[TYPE.monoLabel, { color: colors.brand, marginBottom: 3 }]}>New</Text>
                                                <Text style={styles.valueText} numberOfLines={2}>
                                                    {item.formattedNewValue}
                                                </Text>
                                            </View>
                                        </View>
                                    </View>
                                ))}
                            </Section>
                        ))}
                    </>
                )}
            </ScrollView>

            <View style={styles.footer}>
                <CustomButton onPress={handleCancel} variant="outline">
                    Cancel
                </CustomButton>
                {changes.length > 0 && (
                    <CustomButton onPress={handleConfirm} variant={isDark ? "default" : "secondary"}>
                        Confirm Import
                    </CustomButton>
                )}
            </View>
        </View>
    )
}

export default ImportSettingsPreview
