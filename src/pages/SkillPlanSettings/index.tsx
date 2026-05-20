import React, { useMemo, useContext, useState, useRef, FC, useCallback } from "react"
import { View, Text, ScrollView, StyleSheet, Pressable, Image } from "react-native"
import { Divider } from "react-native-paper"
import { useTheme } from "../../context/ThemeContext"
import { SkillsContext, defaultSettings } from "../../context/BotStateContext"
import { SkillPlanSettingsProps } from "./config"
import CustomSelect from "../../components/CustomSelect"
import CustomCheckbox from "../../components/CustomCheckbox"
import CustomButton from "../../components/CustomButton"
import CustomScrollView from "../../components/CustomScrollView"
import PageHeader from "../../components/PageHeader"
import WarningContainer from "../../components/WarningContainer"
import { SearchPageProvider } from "../../context/SearchPageContext"
import { Input } from "../../components/ui/input"
import { CircleCheckBig, Trash2 } from "lucide-react-native"
import { usePerformanceLogging } from "../../hooks/usePerformanceLogging"
import skillsData from "../../data/skills.json"
import icons from "../SkillSettings/icons"

/**
 * Represents a skill entry from the `skills.json` data file.
 */
interface Skill {
    /** The unique skill ID. */
    id: number
    /** The skill ID for the inherited version of the skill. Same as ID if skill can't be inherited. */
    gene_id: number
    /** The English display name of the skill. */
    name_en: string
    /** The English description of the skill. */
    desc_en: string
    /** The icon ID used for rendering the skill icon. */
    icon_id: number
    /** The skill point cost to purchase this skill. */
    cost: number
    /** The evaluated point value of the skill. */
    eval_pt: number
    /** The point-to-cost ratio for ranking efficiency. */
    pt_ratio: number
    /** The rarity tier of the skill. */
    rarity: number
    /** The activation condition string for the skill. */
    condition: string
    /** The precondition string that must be met before activation. */
    precondition: string
    /** Whether this is an inherited unique skill. */
    inherited: boolean
    /** The community tier list rating, or null if unrated. */
    community_tier: number | null
    /** The game version numbers where this skill is available. */
    versions: number[]
    /** The ID of the upgraded version of this skill, or null. */
    upgrade: number | null
    /** The ID of the downgraded version of this skill, or null. */
    downgrade: number | null
}

// Convert skills.json to array.
const skillData: Skill[] = Object.values(skillsData)

/**
 * The Skill Plan Settings page.
 * Configures a specific skill plan's purchasing strategy, inherited/negative skill options,
 * and a searchable list of skills to add to the plan.
 * @param planKey - The key identifying this plan in the settings object.
 * @param name - The navigation name for this plan's screen.
 * @param title - The display title for this plan.
 * @param description - The description shown at the top of the plan page.
 */
const SkillPlanSettings: FC<SkillPlanSettingsProps> = ({ planKey, name, title, description }) => {
    usePerformanceLogging(name)
    const { colors } = useTheme()
    const { skills, updateSkills } = useContext(SkillsContext)

    // Merge current skills settings with defaults to handle missing properties.
    const combinedConfig = { ...defaultSettings.skills.plans, ...skills.plans }

    const { enabled, strategy, enableBuyNegativeSkills, plan, blacklist, excludeGreenSkills, excludeRedSkills, excludeUniqueSkills } = combinedConfig[planKey]

    const [searchQuery, setSearchQuery] = useState("")
    const [showSelected, setShowSelected] = useState(false)
    const [selectionMode, setSelectionMode] = useState<"plan" | "blacklist">("plan")
    const scrollViewRef = useRef<ScrollView>(null)

    // Parse skill plan from CSV string.
    const planIds: number[] = useMemo(() => {
        return plan && plan !== "" && typeof plan === "string" ? plan.split(",").map((s) => Number(s)) : []
    }, [plan])

    const blacklistIds: number[] = useMemo(() => {
        return blacklist && blacklist !== "" && typeof blacklist === "string" ? blacklist.split(",").map((s) => Number(s)) : []
    }, [blacklist])

    // The currently active selection list, depending on whether the user is editing the plan or the blacklist.
    const activeIds: number[] = selectionMode === "plan" ? planIds : blacklistIds

    // Set showSelected to False whenever the active list has no entries.
    React.useEffect(() => {
        if (activeIds.length === 0) {
            setShowSelected(false)
        }
    }, [activeIds, setShowSelected])

    // Filter skills based on search and preferences.
    const filteredSkills = useMemo(() => {
        const skills: Skill[] = showSelected ? skillData.filter((skill: Skill) => activeIds.includes(skill.id)) : skillData
        return skills.filter((skill: Skill) => skill.name_en.toLowerCase().includes(searchQuery.toLowerCase()))
    }, [searchQuery, activeIds, showSelected])

    /**
     * Update a skill plan setting.
     * @param key The key of the setting to update.
     * @param value The value to set the setting to.
     */
    const updateSkillsSetting = useCallback(
        (key: string, value: any) => {
            updateSkills((prev) => ({
                ...prev,
                plans: {
                    ...prev.plans,
                    [planKey]: { ...prev.plans[planKey], [key]: value },
                },
            }))
        },
        [planKey, updateSkills]
    )

    /**
     * Toggle the selection of a skill within the skill plan.
     * If the skill is already present in the plan, it will be removed. Otherwise, it is added to the plan.
     * @param skill The specific skill instance to add or remove.
     */
    const handleSkillPress = useCallback(
        (skill: Skill) => {
            const targetKey: "plan" | "blacklist" = selectionMode
            const currentIds: number[] = selectionMode === "plan" ? planIds : blacklistIds
            const isSelected = currentIds.includes(skill.id)

            const newIds: number[] = isSelected ? currentIds.filter((id) => id !== skill.id) : [...currentIds, skill.id]

            updateSkillsSetting(targetKey, newIds.join(","))
        },
        [selectionMode, planIds, blacklistIds, updateSkillsSetting]
    )

    /**
     * Remove all skills from the currently active list (plan or blacklist).
     */
    const clearActiveList = useCallback(() => {
        updateSkillsSetting(selectionMode, "")
    }, [selectionMode, updateSkillsSetting])

    const styles = useMemo(
        () =>
            StyleSheet.create({
                root: {
                    flex: 1,
                    flexDirection: "column",
                    margin: 10,
                    backgroundColor: colors.background,
                },
                description: {
                    fontSize: 14,
                    color: colors.foreground,
                    opacity: 0.7,
                    marginBottom: 16,
                    lineHeight: 20,
                },
                section: {
                    marginBottom: 24,
                },
                sectionTitle: {
                    fontSize: 18,
                    fontWeight: "600",
                    color: colors.foreground,
                    marginBottom: 12,
                },
                skillItem: {
                    backgroundColor: colors.card,
                    padding: 16,
                    borderRadius: 8,
                    marginBottom: 8,
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                },
                skillName: {
                    fontSize: 16,
                    fontWeight: "600",
                    color: colors.foreground,
                },
                skillDescription: {
                    fontSize: 14,
                    color: colors.foreground,
                    opacity: 0.7,
                    marginTop: 4,
                },
                skillSubtext: {
                    fontSize: 14,
                    color: colors.primary,
                    marginTop: 4,
                },
                input: {
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 16,
                    color: colors.foreground,
                    backgroundColor: colors.background,
                    marginBottom: 12,
                },
                inputLabel: {
                    fontSize: 16,
                    color: colors.foreground,
                    marginBottom: 8,
                },
                inputDescription: {
                    fontSize: 14,
                    color: colors.foreground,
                    opacity: 0.7,
                    marginTop: 8,
                },
                inputContainer: {
                    marginBottom: 16,
                },
                modeTab: {
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                    alignItems: "center",
                },
                modeTabActive: {
                    backgroundColor: colors.primary,
                    borderColor: colors.primary,
                },
                modeTabLabel: {
                    fontSize: 14,
                    fontWeight: "600",
                    color: colors.foreground,
                },
                modeTabLabelActive: {
                    color: colors.background,
                },
                summary: {
                    fontSize: 14,
                    color: colors.foreground,
                    marginBottom: 4,
                    lineHeight: 20,
                },
                summaryBullet: {
                    fontSize: 14,
                    color: colors.foreground,
                    marginBottom: 2,
                    marginLeft: 16,
                    lineHeight: 20,
                },
            }),
        [colors]
    )

    const renderOptions = () => {
        return (
            <>
                <View style={styles.inputContainer}>
                    <CustomCheckbox
                        searchId={`enable-buy-negative-skills-${name}`}
                        checked={enableBuyNegativeSkills}
                        onCheckedChange={(checked) => updateSkillsSetting("enableBuyNegativeSkills", checked)}
                        label="Purchase All Negative Skills"
                        description={"When enabled, the bot will attempt to purchase all negative skills (i.e. Firm Conditions ×)."}
                        style={{ marginTop: 16 }}
                    />
                </View>
                <View style={styles.inputContainer}>
                    <Text style={styles.inputLabel}>Skill Type Filters</Text>
                    <Text style={[styles.inputDescription, { marginTop: 0, marginBottom: 8 }]}>
                        Exclude entire skill color categories from purchase. Useful when "Best Skills First" or "Optimize Rank" is picking unwanted skills like debuffs or stat boosts.
                    </Text>
                    <CustomCheckbox
                        searchId={`exclude-green-skills-${name}`}
                        checked={excludeGreenSkills}
                        onCheckedChange={(checked) => updateSkillsSetting("excludeGreenSkills", checked)}
                        label="Skip All Green Skills"
                        description={"When enabled, no green (stat-trigger) skills will be purchased by this plan."}
                        style={{ marginTop: 8 }}
                    />
                    <CustomCheckbox
                        searchId={`exclude-red-skills-${name}`}
                        checked={excludeRedSkills}
                        onCheckedChange={(checked) => updateSkillsSetting("excludeRedSkills", checked)}
                        label="Skip All Red Skills (Debuffs)"
                        description={"When enabled, no red skills (debuffs like Intimidate, Speed Eater, Tether, Intense Gaze) will be purchased by this plan."}
                        style={{ marginTop: 8 }}
                    />
                    <CustomCheckbox
                        searchId={`exclude-unique-skills-${name}`}
                        checked={excludeUniqueSkills}
                        onCheckedChange={(checked) => updateSkillsSetting("excludeUniqueSkills", checked)}
                        label="Skip All Unique Skills"
                        description={"When enabled, no inherited unique (legacy) skills will be purchased by this plan, even if they appear in the planned skills list."}
                        style={{ marginTop: 8 }}
                    />
                </View>
                <View style={styles.inputContainer}>
                    <Text style={styles.inputLabel}>Automated Skill Point Spending Strategy</Text>
                    <CustomSelect
                        options={[
                            { value: "default", label: "Do Not Spend Remaining Points" },
                            { value: "optimize_skills", label: "Best Skills First" },
                            { value: "optimize_rank", label: "Optimize Rank" },
                        ]}
                        value={strategy}
                        defaultValue={defaultSettings.skills.plans[planKey].strategy}
                        onValueChange={(value) => updateSkillsSetting("strategy", value)}
                        placeholder="Select Strategy"
                    />
                    {strategy == "optimize_rank" && <WarningContainer>⚠️ Warning: Optimize Rank ignores any of the Skill Style Overrides set in the Skill Settings page.</WarningContainer>}
                    <Text style={styles.inputDescription}>
                        This option determines what the bot does with any remaining skill points after it has purchased all of the skills from the Planned Skills section and the other options on this
                        page.
                    </Text>
                    <Text style={styles.inputDescription}>
                        Best Skills First will use a community skill tier list to purchase better skills first and then within each tier it will attempt to optimize rank since the skills within each
                        tier are not ordered.
                    </Text>
                    <Text style={styles.inputDescription}>
                        Optimize Rank will purchase skills in a way which will result in the highest trainee rank. Avoid this option if you wish to train an uma up for TT or CM.
                    </Text>
                </View>
            </>
        )
    }

    const renderConfigurationSummary = () => {
        const strategyLabel: string =
            strategy === "default" ? "Do Not Spend Remaining Points" : strategy === "optimize_skills" ? "Best Skills First" : strategy === "optimize_rank" ? "Optimize Rank" : strategy
        const excludedCategories: string[] = []
        if (excludeGreenSkills) excludedCategories.push("Green")
        if (excludeRedSkills) excludedCategories.push("Red")
        if (excludeUniqueSkills) excludedCategories.push("Unique")
        const categoryText: string = excludedCategories.length === 0 ? "None" : excludedCategories.join(", ")
        const idsToNames = (ids: number[]): string[] => ids.map((id) => skillData.find((s) => s.id === id)?.name_en ?? `Unknown (ID ${id})`)
        const renderSkillBulletList = (header: string, ids: number[]) => {
            const names = idsToNames(ids)
            return (
                <>
                    <Text style={styles.summary}>
                        {header} ({ids.length}):
                    </Text>
                    {names.length === 0 ? (
                        <Text style={styles.summaryBullet}>- None</Text>
                    ) : (
                        names.map((skillName, i) => (
                            <Text key={`${header}-${ids[i]}`} style={styles.summaryBullet}>
                                - {skillName}
                            </Text>
                        ))
                    )}
                </>
            )
        }
        return (
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Configuration Summary</Text>
                <Text style={styles.summary}>Strategy: {strategyLabel}</Text>
                <Text style={styles.summary}>Buy Negative Skills: {enableBuyNegativeSkills ? "Yes" : "No"}</Text>
                <Text style={styles.summary}>Excluded Categories: {categoryText}</Text>
                {renderSkillBulletList("Planned Skills", planIds)}
                {renderSkillBulletList("Blacklisted Skills", blacklistIds)}
            </View>
        )
    }

    const renderSkillList = () => {
        const isPlanMode = selectionMode === "plan"
        const sectionTitle = isPlanMode ? "Planned Skills" : "Blacklisted Skills"
        const helperText = isPlanMode ? "Select skills that the bot will always attempt to buy." : "Select skills the bot must never purchase, even when a strategy ranks them highly."
        return (
            <View style={styles.section}>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 12 }}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.sectionTitle}>{sectionTitle}</Text>
                        <Text style={[styles.inputDescription, { marginTop: 0 }]}>
                            Selected {activeIds.length} / {filteredSkills.length} skills
                        </Text>
                    </View>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                        <CustomButton icon={<Trash2 size={16} color={colors.foreground} />} onPress={() => clearActiveList()}>
                            Clear
                        </CustomButton>
                    </View>
                </View>

                <View style={{ flexDirection: "row", marginBottom: 12, gap: 8 }}>
                    <Pressable onPress={() => setSelectionMode("plan")} style={[styles.modeTab, isPlanMode && styles.modeTabActive]} android_ripple={{ color: colors.ripple, foreground: true }}>
                        <Text style={[styles.modeTabLabel, isPlanMode && styles.modeTabLabelActive]}>Plan ({planIds.length})</Text>
                    </Pressable>
                    <Pressable onPress={() => setSelectionMode("blacklist")} style={[styles.modeTab, !isPlanMode && styles.modeTabActive]} android_ripple={{ color: colors.ripple, foreground: true }}>
                        <Text style={[styles.modeTabLabel, !isPlanMode && styles.modeTabLabelActive]}>Blacklist ({blacklistIds.length})</Text>
                    </Pressable>
                </View>

                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
                    <CustomCheckbox
                        searchId={`show-selected-skills-${name}`}
                        checked={activeIds.length === 0 ? false : showSelected}
                        disabled={activeIds.length === 0}
                        onCheckedChange={(checked) => setShowSelected(checked && activeIds.length !== 0)}
                        label="Show Only Selected Skills"
                    />
                </View>

                <View style={{ flexDirection: "row", marginBottom: 12 }}>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.inputDescription, { marginTop: 0 }]}>{helperText}</Text>
                    </View>
                </View>

                <View style={{ marginBottom: 16 }}>
                    <Input style={styles.input} value={searchQuery} onChangeText={setSearchQuery} placeholder="Search skills by name..." />
                    <View style={{ height: 700 }}>
                        <CustomScrollView
                            targetProps={{
                                data: filteredSkills,
                                renderItem: ({ item: skill }) => (
                                    <Pressable onPress={() => handleSkillPress(skill)} style={styles.skillItem} android_ripple={{ color: colors.ripple, foreground: true }}>
                                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                            <Image source={icons[skill.icon_id]} style={{ width: 64, height: 64, marginRight: 8 }} />
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.skillName}>{skill.name_en}</Text>
                                                <Text style={styles.skillDescription}>{skill.desc_en}</Text>
                                                <Text style={styles.skillSubtext}>ID: {skill.id}</Text>
                                            </View>
                                            {activeIds.includes(skill.id) && <CircleCheckBig size={18} color={selectionMode === "plan" ? "green" : "red"} />}
                                        </View>
                                    </Pressable>
                                ),
                                nestedScrollEnabled: true,
                            }}
                            position="right"
                            horizontal={false}
                            persistentScrollbar={true}
                            indicatorStyle={{
                                width: 10,
                                backgroundColor: colors.foreground,
                            }}
                            containerStyle={{
                                flex: 1,
                            }}
                            minIndicatorSize={50}
                        />
                    </View>
                </View>
            </View>
        )
    }

    return (
        <View style={styles.root}>
            <PageHeader title={`${title} Plan`} />
            <SearchPageProvider page={name} scrollViewRef={scrollViewRef}>
                <ScrollView ref={scrollViewRef} nestedScrollEnabled={true} showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
                    <View className="m-1">
                        <Text style={styles.description}>{description}</Text>
                        <Divider style={{ marginBottom: 16 }} />
                        <CustomCheckbox
                            searchId={`enable-skill-plan-${planKey}`}
                            checked={enabled}
                            onCheckedChange={(checked) => updateSkillsSetting("enabled", checked)}
                            label={`Enable ${title} Plan (Beta)`}
                            description={"When enabled, the bot will attempt to purchase skills based on the following configuration."}
                        />
                        {enabled && (
                            <>
                                {renderOptions()}
                                <Divider style={{ marginBottom: 16 }} />
                                {renderSkillList()}
                                <Divider style={{ marginBottom: 16 }} />
                                {renderConfigurationSummary()}
                            </>
                        )}
                    </View>
                </ScrollView>
            </SearchPageProvider>
        </View>
    )
}

export default React.memo(SkillPlanSettings)
