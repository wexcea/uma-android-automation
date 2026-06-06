// src/components/TrainingScoringAdvanced/MiscTab.tsx
import React, { useContext } from "react"
import { ScrollView, View, StyleSheet } from "react-native"
import { GeneralMiscContext } from "../../context/BotStateContext"
import { SCORING_CONSTANTS_CATALOG, ScoringConstantEntry } from "../../lib/training/scoringConstantsCatalog"
import { Section } from "../ui/section"
import { FormulaEcho } from "./FormulaEcho"
import { MultiplierSlider } from "./MultiplierSlider"
import { TabHeader } from "./TabHeader"

type MiscSubgroup = "rel" | "misc" | "rainbow" | "anticipatory" | "unityCup"

const ENTRIES = SCORING_CONSTANTS_CATALOG.filter((e) => e.group === "misc")

/** Fixed render order of the 5 sub-sections. */
const SUBGROUP_ORDER: MiscSubgroup[] = ["rel", "misc", "rainbow", "anticipatory", "unityCup"]

const SUBGROUP_LABELS: Record<MiscSubgroup, string> = {
    rel: "REL - bar scoring",
    misc: "MISC - skill-hint scoring",
    rainbow: "RAINBOW - multiplier",
    anticipatory: "ANTICIPATORY - multiplier",
    unityCup: "UNITY CUP ONLY",
}

const SUBGROUP_SUBTITLES: Record<MiscSubgroup, string> = {
    rel: "barValue, Diminish, EarlyGame, Trainer",
    misc: "50 + Hints x HintScore",
    rainbow: "Year 2+, with rainbow bars",
    anticipatory: "1 + min(cap, coef x Sum near-rainbow fills)",
    unityCup: "Used only when running the Unity Cup scenario.",
}

const styles = StyleSheet.create({
    sectionDisabled: {
        opacity: 0.55,
    },
})

/**
 * Group every entry in `entries` by its `subgroup` field. Entries without a subgroup are dropped. Returns an array in `SUBGROUP_ORDER`, each containing the entries that
 * declared that subgroup (preserving the catalog's source order within each group).
 *
 * @param entries Filtered list of catalog entries belonging to the Misc tab.
 * @returns Ordered list of `{ subgroup, entries }` ready to render.
 */
export function groupBySubgroup(entries: ReadonlyArray<ScoringConstantEntry>): Array<{ subgroup: MiscSubgroup; entries: ScoringConstantEntry[] }> {
    const buckets = new Map<MiscSubgroup, ScoringConstantEntry[]>()
    for (const sg of SUBGROUP_ORDER) buckets.set(sg, [])
    for (const entry of entries) {
        if (!entry.subgroup) continue
        buckets.get(entry.subgroup as MiscSubgroup)?.push(entry)
    }
    return SUBGROUP_ORDER.map((subgroup) => ({ subgroup, entries: buckets.get(subgroup) ?? [] }))
}

/** Props for `MiscTab`. */
export interface MiscTabProps {
    /** Current value per catalog key. */
    values: Record<string, number>
    /** Update the value for one catalog key. */
    onChange: (key: string, value: number) => void
    /** Reset every catalog key in this tab to its default. */
    onResetTab: () => void
}

/**
 * Misc tab body: renders one `bare` `Section` per `MiscSubgroup` in `SUBGROUP_ORDER`. The section header carries the sub-group label (and the Unity Cup status suffix
 * when applicable). Inside each section sits a `FormulaEcho` strip with the formula-part one-liner followed by the sub-group's sliders. The Unity Cup section is rendered
 * fully non-interactive (55% opacity + sliders disabled) whenever the current scenario is not `"Unity Cup"`. Reads the active scenario from `GeneralMiscContext`.
 *
 * @param props See `MiscTabProps`.
 * @returns The Misc tab content.
 */
export function MiscTab({ values, onChange, onResetTab }: MiscTabProps): React.ReactElement {
    const { general } = useContext(GeneralMiscContext)
    const isUnityCup = general.scenario === "Unity Cup"

    const groups = groupBySubgroup(ENTRIES)

    return (
        <ScrollView>
            <TabHeader description="Everything that feeds REL, MISC, Rainbow, and Anticipatory. Grouped by formula part below." onReset={onResetTab} />
            {groups.map(({ subgroup, entries }) => {
                if (entries.length === 0) return null
                const disabled = subgroup === "unityCup" && !isUnityCup
                const labelSuffix = subgroup === "unityCup" ? (disabled ? ` - INACTIVE (${general.scenario || "NO SCENARIO"})` : " - ACTIVE") : ""
                return (
                    <View key={subgroup} style={disabled ? styles.sectionDisabled : undefined}>
                        <Section label={SUBGROUP_LABELS[subgroup] + labelSuffix} bare noDividers>
                            <FormulaEcho text={SUBGROUP_SUBTITLES[subgroup]} />
                            {entries.map((entry) => (
                                <MultiplierSlider key={entry.key} entry={entry} value={values[entry.key] ?? entry.defaultValue} onChange={onChange} disabled={disabled} />
                            ))}
                        </Section>
                    </View>
                )
            })}
        </ScrollView>
    )
}
