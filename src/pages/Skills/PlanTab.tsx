import React, { useMemo, useContext, useState, useCallback, useEffect } from "react"
import { View, Text, StyleSheet, Pressable, Image } from "react-native"
import { CircleCheckBig, Trash2 } from "lucide-react-native"
import { skillPlanSettingsPages } from "../SkillPlanSettings/config"
import { SkillsContext, defaultSettings } from "../../context/BotStateContext"
import { useTheme } from "../../context/ThemeContext"
import { TYPE } from "../../lib/type"
import { SPACING } from "../../lib/spacing"
import { Row } from "../../components/ui/row"
import { Switch } from "../../components/ui/switch"
import { Input } from "../../components/ui/input"
import SearchableItem from "../../components/SearchableItem"
import CustomSelect from "../../components/CustomSelect"
import CustomSlider from "../../components/CustomSlider"
import CustomButton from "../../components/CustomButton"
import CustomScrollView from "../../components/CustomScrollView"
import WarningContainer from "../../components/WarningContainer"
import skillsData from "../../data/skills.json"
import icons from "./icons"

/** Represents a skill entry from the `skills.json` data file. */
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
    /** The rarity tier of the skill (1=Green, 2=Blue, 3=Purple). */
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

const skillData: Skill[] = Object.values(skillsData)

/** Props for `PlanTab`. */
interface PlanTabProps {
    /** Which plan to render (matches a key in `skillPlanSettingsPages`). */
    planKey: string
}

/**
 * Renders the body for a single skill plan tab. The Skill Point Check tab additionally shows the global enable switch
 * and threshold slider above the per-plan body. The two other tabs only show the enable switch and the body.
 * @param planKey Plan identifier matching `skillPlanSettingsPages`.
 * @returns A View containing the plan title, trigger caption, and configuration body.
 */
const PlanTab: React.FC<PlanTabProps> = ({ planKey }) => {
    const { colors } = useTheme()
    const config = skillPlanSettingsPages[planKey]
    const { skills, updateSkills } = useContext(SkillsContext)

    // Merge current skills settings with defaults to handle missing properties.
    const combinedConfig = { ...defaultSettings.skills.plans, ...skills.plans }
    const planData = combinedConfig[planKey] ?? defaultSettings.skills.plans[planKey]
    const { enabled, strategy, enableBuyNegativeSkills, plan, blacklist, excludeGreenSkills, excludeRedSkills, excludeUniqueSkills } = planData

    const [searchQuery, setSearchQuery] = useState("")
    const [showSelected, setShowSelected] = useState(false)
    const [selectionMode, setSelectionMode] = useState<"plan" | "blacklist">("plan")

    // Parse skill plan from CSV string.
    const planIds: number[] = useMemo(() => {
        return plan && plan !== "" && typeof plan === "string" ? plan.split(",").map((s) => Number(s)) : []
    }, [plan])

    const blacklistIds: number[] = useMemo(() => {
        return blacklist && blacklist !== "" && typeof blacklist === "string" ? blacklist.split(",").map((s) => Number(s)) : []
    }, [blacklist])

    const activeIds: number[] = selectionMode === "plan" ? planIds : blacklistIds

    // Disable "Show Only Selected" when there is nothing selected to show.
    useEffect(() => {
        if (activeIds.length === 0) {
            setShowSelected(false)
        }
    }, [activeIds])

    // Filter skills based on search query and the optional show-selected toggle.
    const filteredSkills = useMemo(() => {
        const base: Skill[] = showSelected ? skillData.filter((s) => activeIds.includes(s.id)) : skillData
        return base.filter((s) => s.name_en.toLowerCase().includes(searchQuery.toLowerCase()))
    }, [searchQuery, activeIds, showSelected])

    /**
     * Update a per-plan skill setting.
     * @param key Setting key.
     * @param value Setting value.
     */
    const updatePlanSetting = useCallback(
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
     * Mirror the legacy effect: enabling the Skill Point Check plan also flips the top-level Skill Point Check flag.
     */
    useEffect(() => {
        if (planKey === "skillPointCheck" && skills.plans.skillPointCheck.enabled && !skills.enableSkillPointCheck) {
            updateSkills({ enableSkillPointCheck: true })
        }
    }, [planKey, skills.plans.skillPointCheck.enabled, skills.enableSkillPointCheck, updateSkills])

    /**
     * Toggle the selection of a single skill in the currently active list (plan or blacklist).
     * @param skill The skill to add or remove.
     */
    const handleSkillPress = useCallback(
        (skill: Skill) => {
            const targetKey: "plan" | "blacklist" = selectionMode
            const currentIds: number[] = selectionMode === "plan" ? planIds : blacklistIds
            const isSelected = currentIds.includes(skill.id)
            const newIds: number[] = isSelected ? currentIds.filter((id) => id !== skill.id) : [...currentIds, skill.id]
            updatePlanSetting(targetKey, newIds.join(","))
        },
        [selectionMode, planIds, blacklistIds, updatePlanSetting]
    )

    /** Clear all entries from the currently active list. */
    const clearActiveList = useCallback(() => {
        updatePlanSetting(selectionMode, "")
    }, [selectionMode, updatePlanSetting])

    const styles = useMemo(
        () =>
            StyleSheet.create({
                head: { paddingHorizontal: SPACING.sm, paddingTop: SPACING.md, gap: 2 },
                title: { ...TYPE.h2, color: colors.text },
                trigger: { ...TYPE.caption, color: colors.textMuted },
                unknown: { ...TYPE.body, color: colors.textMuted, padding: SPACING.md },
                bodyWrap: { paddingHorizontal: SPACING.sm, paddingTop: SPACING.md, gap: SPACING.sm },
                enableCard: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.borderHair, overflow: "hidden" },
                gridRow: { flexDirection: "row", flexWrap: "wrap" },
                gridCell: { width: "50%" },
                filterCard: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.borderHair, overflow: "hidden" },
                sectionTitle: { ...TYPE.body, color: colors.text, fontWeight: "600", marginBottom: SPACING.xs },
                inputDescription: { ...TYPE.caption, color: colors.textMuted, lineHeight: 18 },
                strategyDescription: { ...TYPE.caption, color: colors.textMuted, lineHeight: 18, marginTop: SPACING.xs },
                selectWrap: { paddingHorizontal: SPACING.sm },
                listHeader: { flexDirection: "row", alignItems: "center", marginBottom: SPACING.sm, gap: SPACING.sm },
                modeTab: {
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.borderHair,
                    backgroundColor: colors.bg,
                    alignItems: "center",
                },
                modeTabActive: { backgroundColor: colors.brand, borderColor: colors.brand },
                modeTabLabel: { ...TYPE.body, color: colors.text, fontWeight: "600" },
                modeTabLabelActive: { color: colors.onBrand },
                input: {
                    borderWidth: 1,
                    borderColor: colors.borderHair,
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 16,
                    color: colors.text,
                    backgroundColor: colors.bg,
                    marginBottom: SPACING.sm,
                },
                skillItem: {
                    backgroundColor: colors.surface,
                    padding: 16,
                    borderRadius: 8,
                    marginBottom: 8,
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                },
                skillName: { ...TYPE.body, color: colors.text, fontWeight: "600" },
                skillDescription: { ...TYPE.caption, color: colors.textMuted, marginTop: 2 },
                skillSubtext: { ...TYPE.caption, color: colors.brand, marginTop: 2 },
                summarySection: { marginTop: SPACING.lg },
                summaryLine: { ...TYPE.body, color: colors.text, marginBottom: 4, lineHeight: 20 },
                summaryBullet: { ...TYPE.body, color: colors.text, marginBottom: 2, marginLeft: 16, lineHeight: 20 },
                divider: { height: 1, backgroundColor: colors.borderHair, marginVertical: SPACING.md },
                selectedToggleRow: { flexDirection: "row", alignItems: "center", marginBottom: SPACING.sm },
                helperRow: { flexDirection: "row", marginBottom: SPACING.sm },
            }),
        [colors]
    )

    if (!config) {
        return <Text style={styles.unknown}>Unknown plan: {planKey}</Text>
    }

    const isSkillPointCheck = planKey === "skillPointCheck"
    const planTitle = config.title

    // Strategy summary helpers.
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
                <Text style={styles.summaryLine}>
                    {header} (<Text style={[TYPE.monoValue, { color: colors.text }]}>{ids.length}</Text>):
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

    // The list of selectable skills and the plan / blacklist mode switcher.
    const isPlanMode = selectionMode === "plan"
    const helperText = isPlanMode ? "Select skills that the bot will always attempt to buy." : "Select skills the bot must never purchase, even when a strategy ranks them highly."

    return (
        <View>
            <View style={styles.head}>
                <Text style={styles.title}>{planTitle}</Text>
                <Text style={styles.trigger}>{config.description}</Text>
            </View>
            <View style={styles.bodyWrap}>
                {isSkillPointCheck && (
                    <>
                        <View style={styles.enableCard}>
                            <SearchableItem
                                id="enable-skill-point-check"
                                title="Enable Skill Point Check"
                                description="Stop the bot when the skill point threshold is reached"
                            >
                                <Row
                                    title="Enable Skill Point Check"
                                    description="Enables check for a skill point threshold. When reached, the bot stops (or runs the Skill Plan, see below)."
                                    right={<Switch checked={skills.enableSkillPointCheck} onCheckedChange={(checked) => updateSkills({ enableSkillPointCheck: checked })} />}
                                />
                            </SearchableItem>
                        </View>
                        {skills.enableSkillPointCheck && (
                            <View style={{ paddingHorizontal: SPACING.sm }}>
                                <CustomSlider
                                    searchId="skill-point-check"
                                    searchCondition={skills.enableSkillPointCheck}
                                    parentId="enable-skill-point-check"
                                    value={skills.skillPointCheck}
                                    placeholder={defaultSettings.skills.skillPointCheck}
                                    onValueChange={(value) => updateSkills({ skillPointCheck: value })}
                                    onSlidingComplete={(value) => updateSkills({ skillPointCheck: value })}
                                    min={100}
                                    max={2000}
                                    step={10}
                                    label="Skill Point Threshold"
                                    description="The number of skill points to accumulate before stopping the bot."
                                    labelUnit=""
                                    showValue={true}
                                    showLabels={true}
                                />
                            </View>
                        )}
                    </>
                )}
                <View style={styles.enableCard}>
                    <SearchableItem
                        id={isSkillPointCheck ? "skill-point-check-plan" : `enable-skill-plan-${planKey}`}
                        title={`Enable ${planTitle} Plan`}
                        description="Purchase skills based on this plan's configuration"
                    >
                        <Row
                            title={`Enable ${planTitle} Plan (Beta)`}
                            description={
                                isSkillPointCheck
                                    ? "Instead of stopping when the threshold is met, run this Skill Plan to spend the points."
                                    : "When enabled, the bot purchases skills based on the configuration below."
                            }
                            right={<Switch checked={enabled} onCheckedChange={(checked) => updatePlanSetting("enabled", checked)} />}
                        />
                    </SearchableItem>
                </View>

                {enabled && (
                    <>
                        <View style={styles.filterCard}>
                            <SearchableItem
                                id={`enable-buy-negative-skills-${config.name}`}
                                title="Purchase All Negative Skills"
                                description="Attempt to buy all negative skills (e.g. Firm Conditions x)"
                            >
                                <Row
                                    title="Purchase All Negative Skills"
                                    description="When enabled, the bot will attempt to purchase all negative skills (i.e. Firm Conditions x)."
                                    right={<Switch checked={enableBuyNegativeSkills} onCheckedChange={(checked) => updatePlanSetting("enableBuyNegativeSkills", checked)} />}
                                />
                            </SearchableItem>
                        </View>

                        <View style={{ marginTop: SPACING.sm }}>
                            <Text style={styles.sectionTitle}>Skill Type Filters</Text>
                            <Text style={styles.inputDescription}>
                                Exclude entire skill color categories from purchase. Useful when "Best Skills First" or "Optimize Rank" is picking unwanted skills like debuffs or stat boosts.
                            </Text>
                            <View style={[styles.filterCard, styles.gridRow, { marginTop: SPACING.sm }]}>
                                <View style={styles.gridCell}>
                                    <SearchableItem
                                        id={`exclude-green-skills-${config.name}`}
                                        title="Skip All Green Skills"
                                        description="Exclude green stat-trigger skills"
                                    >
                                        <Row
                                            title="Skip Green Skills"
                                            description="No green (stat-trigger) skills."
                                            right={<Switch checked={excludeGreenSkills} onCheckedChange={(checked) => updatePlanSetting("excludeGreenSkills", checked)} />}
                                        />
                                    </SearchableItem>
                                </View>
                                <View style={styles.gridCell}>
                                    <SearchableItem
                                        id={`exclude-red-skills-${config.name}`}
                                        title="Skip All Red Skills (Debuffs)"
                                        description="Exclude red debuff skills"
                                    >
                                        <Row
                                            title="Skip Red Skills"
                                            description="No red debuff skills."
                                            right={<Switch checked={excludeRedSkills} onCheckedChange={(checked) => updatePlanSetting("excludeRedSkills", checked)} />}
                                        />
                                    </SearchableItem>
                                </View>
                                <View style={styles.gridCell}>
                                    <SearchableItem
                                        id={`exclude-unique-skills-${config.name}`}
                                        title="Skip All Unique Skills"
                                        description="Exclude inherited unique (legacy) skills"
                                    >
                                        <Row
                                            title="Skip Unique Skills"
                                            description="No inherited unique skills."
                                            right={<Switch checked={excludeUniqueSkills} onCheckedChange={(checked) => updatePlanSetting("excludeUniqueSkills", checked)} />}
                                        />
                                    </SearchableItem>
                                </View>
                            </View>
                        </View>

                        <View style={{ marginTop: SPACING.md }}>
                            <Text style={styles.sectionTitle}>Automated Skill Point Spending Strategy</Text>
                            <View style={styles.selectWrap}>
                                <CustomSelect
                                    options={[
                                        { value: "default", label: "Do Not Spend Remaining Points" },
                                        { value: "optimize_skills", label: "Best Skills First" },
                                        { value: "optimize_rank", label: "Optimize Rank" },
                                    ]}
                                    value={strategy}
                                    defaultValue={defaultSettings.skills.plans[planKey].strategy}
                                    onValueChange={(value) => updatePlanSetting("strategy", value)}
                                    placeholder="Select Strategy"
                                />
                            </View>
                            {strategy == "optimize_rank" && <WarningContainer>Warning: Optimize Rank ignores any of the Skill Style Overrides set in the Skills page.</WarningContainer>}
                            <Text style={styles.strategyDescription}>
                                This option determines what the bot does with any remaining skill points after it has purchased all of the skills from the Planned Skills section and the other options
                                on this page.
                            </Text>
                            <Text style={styles.strategyDescription}>
                                Best Skills First will use a community skill tier list to purchase better skills first and then within each tier it will attempt to optimize rank since the skills
                                within each tier are not ordered.
                            </Text>
                            <Text style={styles.strategyDescription}>
                                Optimize Rank will purchase skills in a way which will result in the highest trainee rank. Avoid this option if you wish to train an uma up for TT or CM.
                            </Text>
                        </View>

                        <View style={styles.divider} />

                        <View>
                            <View style={styles.listHeader}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.sectionTitle}>{isPlanMode ? "Planned Skills" : "Blacklisted Skills"}</Text>
                                    <Text style={styles.inputDescription}>
                                        Selected <Text style={[TYPE.monoValue, { color: colors.text }]}>{activeIds.length}</Text> /{" "}
                                        <Text style={[TYPE.monoValue, { color: colors.text }]}>{filteredSkills.length}</Text> skills
                                    </Text>
                                </View>
                                <CustomButton icon={<Trash2 size={16} color={colors.text} />} onPress={() => clearActiveList()}>
                                    Clear
                                </CustomButton>
                            </View>

                            <View style={{ flexDirection: "row", marginBottom: SPACING.sm, gap: 8 }}>
                                <Pressable
                                    onPress={() => setSelectionMode("plan")}
                                    style={[styles.modeTab, isPlanMode && styles.modeTabActive]}
                                    android_ripple={{ color: colors.ripple, foreground: true }}
                                >
                                    <Text style={[styles.modeTabLabel, isPlanMode && styles.modeTabLabelActive]}>
                                        Plan (<Text style={TYPE.monoValue}>{planIds.length}</Text>)
                                    </Text>
                                </Pressable>
                                <Pressable
                                    onPress={() => setSelectionMode("blacklist")}
                                    style={[styles.modeTab, !isPlanMode && styles.modeTabActive]}
                                    android_ripple={{ color: colors.ripple, foreground: true }}
                                >
                                    <Text style={[styles.modeTabLabel, !isPlanMode && styles.modeTabLabelActive]}>
                                        Blacklist (<Text style={TYPE.monoValue}>{blacklistIds.length}</Text>)
                                    </Text>
                                </Pressable>
                            </View>

                            <View style={styles.selectedToggleRow}>
                                <SearchableItem
                                    id={`show-selected-skills-${config.name}`}
                                    title="Show Only Selected Skills"
                                    description="Filter the list to only currently-selected skills"
                                >
                                    <Row
                                        title="Show Only Selected Skills"
                                        right={
                                            <Switch
                                                checked={activeIds.length === 0 ? false : showSelected}
                                                disabled={activeIds.length === 0}
                                                onCheckedChange={(checked) => setShowSelected(checked && activeIds.length !== 0)}
                                            />
                                        }
                                    />
                                </SearchableItem>
                            </View>

                            <View style={styles.helperRow}>
                                <Text style={styles.inputDescription}>{helperText}</Text>
                            </View>

                            <Input style={styles.input} value={searchQuery} onChangeText={setSearchQuery} placeholder="Search skills by name..." />
                            <View style={{ height: 700 }}>
                                <CustomScrollView
                                    targetProps={{
                                        data: filteredSkills,
                                        renderItem: ({ item: skill }: { item: Skill }) => (
                                            <Pressable onPress={() => handleSkillPress(skill)} style={styles.skillItem} android_ripple={{ color: colors.ripple, foreground: true }}>
                                                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                                    <Image source={icons[skill.icon_id]} style={{ width: 64, height: 64, marginRight: 8 }} />
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={styles.skillName}>{skill.name_en}</Text>
                                                        <Text style={styles.skillDescription}>{skill.desc_en}</Text>
                                                        <Text style={styles.skillSubtext}>
                                                            ID: <Text style={TYPE.monoValue}>{skill.id}</Text>
                                                        </Text>
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
                                    indicatorStyle={{ width: 10, backgroundColor: colors.text }}
                                    containerStyle={{ flex: 1 }}
                                    minIndicatorSize={50}
                                />
                            </View>
                        </View>

                        <View style={styles.divider} />

                        <View style={styles.summarySection}>
                            <Text style={styles.sectionTitle}>Configuration Summary</Text>
                            <Text style={styles.summaryLine}>Strategy: {strategyLabel}</Text>
                            <Text style={styles.summaryLine}>Buy Negative Skills: {enableBuyNegativeSkills ? "Yes" : "No"}</Text>
                            <Text style={styles.summaryLine}>Excluded Categories: {categoryText}</Text>
                            {renderSkillBulletList("Planned Skills", planIds)}
                            {renderSkillBulletList("Blacklisted Skills", blacklistIds)}
                        </View>
                    </>
                )}
            </View>
        </View>
    )
}

export default React.memo(PlanTab)
