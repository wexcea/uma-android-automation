// src/components/TrainingScoringAdvanced/index.tsx
import React, { useCallback, useContext, useEffect, useMemo, useState } from "react"
import { View } from "react-native"
import { SPACING } from "../../lib/spacing"
import { Section } from "../ui/section"
import TabStrip from "../ui/tab-strip"
import { TrainingContext } from "../../context/BotStateContext"
import type { Settings } from "../../context/BotStateContext"
import { SCORING_CONSTANTS_CATALOG, CatalogGroup } from "../../lib/training/scoringConstantsCatalog"
import { FormulaCard } from "./FormulaCard"
import { PriorityTab } from "./PriorityTab"
import { RatioTab } from "./RatioTab"
import { WeightTab } from "./WeightTab"
import { BonusesTab } from "./BonusesTab"
import { LevelTab } from "./LevelTab"
import { MiscTab } from "./MiscTab"

/** Props for `TrainingScoringAdvanced`. */
export interface TrainingScoringAdvancedProps {
    /** Callback fired whenever the user expands or collapses the Advanced section. The parent uses this to decide whether to mount the sticky sandbox button. */
    onExpandedChange?: (expanded: boolean) => void
}

/** Props for `OpenStateProbe`. */
interface OpenStateProbeProps {
    /** Notifies the parent when the surrounding `Section` body mounts (open) and unmounts (closed). */
    onChange?: (expanded: boolean) => void
}

const TAB_ITEMS: { key: CatalogGroup; label: string }[] = [
    { key: "priority", label: "Priority" },
    { key: "ratio", label: "Ratio" },
    { key: "weight", label: "Weight" },
    { key: "bonuses", label: "Bonus" },
    { key: "level", label: "Level" },
    { key: "misc", label: "Misc" },
]

/**
 * Invisible probe used to detect the open state of the surrounding uncontrolled `Section`. Because `Section`
 * only renders its children while open, the probe's mount and unmount lifecycle perfectly mirrors the section's
 * expand and collapse transitions.
 *
 * @param props See `OpenStateProbeProps`.
 * @returns A zero-size view.
 */
function OpenStateProbe({ onChange }: OpenStateProbeProps): React.ReactElement {
    useEffect(() => {
        onChange?.(true)
        return () => onChange?.(false)
    }, [onChange])
    return <View />
}

/**
 * Collapsible "Advanced" section that exposes all `SCORING_CONSTANTS_CATALOG` tuning sliders grouped into six tabs.
 * Reads and writes the per-key values directly against the `training` settings slice via `TrainingContext`.
 *
 * @param props See `TrainingScoringAdvancedProps`.
 * @returns A `Section` containing a `TabStrip` and the active tab body.
 */
export function TrainingScoringAdvanced({ onExpandedChange }: TrainingScoringAdvancedProps): React.ReactElement {
    const { training, updateTraining } = useContext(TrainingContext)
    const [activeTab, setActiveTab] = useState<CatalogGroup>("priority")

    // The catalog keys are dynamic and not declared in `Settings["training"]`. They are persisted in the same
    // training namespace and read back via `scoringConstantsFromSettings`. Cast through `unknown` for access.
    const trainingRecord = training as unknown as Record<string, unknown>

    const values = useMemo<Record<string, number>>(() => {
        const out: Record<string, number> = {}
        for (const entry of SCORING_CONSTANTS_CATALOG) {
            const v = trainingRecord[entry.key]
            out[entry.key] = typeof v === "number" && Number.isFinite(v) ? v : entry.defaultValue
        }
        return out
    }, [trainingRecord])

    const handleChange = useCallback(
        (key: string, value: number) => {
            updateTraining({ [key]: value } as unknown as Partial<Settings["training"]>)
        },
        [updateTraining]
    )

    const handleResetTab = useCallback(
        (group: CatalogGroup) => {
            const patch: Record<string, number> = {}
            for (const entry of SCORING_CONSTANTS_CATALOG) {
                if (entry.group === group) patch[entry.key] = entry.defaultValue
            }
            updateTraining(patch as unknown as Partial<Settings["training"]>)
        },
        [updateTraining]
    )

    return (
        <Section label="Advanced" collapsible defaultOpen={false} style={{ marginBottom: SPACING.xl }}>
            <View style={{ padding: SPACING.lg, gap: SPACING.md }}>
                <FormulaCard />
                <OpenStateProbe onChange={onExpandedChange} />
                <TabStrip items={TAB_ITEMS} activeKey={activeTab} onChange={(k) => setActiveTab(k as CatalogGroup)} />
                {activeTab === "priority" && <PriorityTab values={values} onChange={handleChange} onResetTab={() => handleResetTab("priority")} />}
                {activeTab === "ratio" && <RatioTab values={values} onChange={handleChange} onResetTab={() => handleResetTab("ratio")} />}
                {activeTab === "weight" && <WeightTab values={values} onChange={handleChange} onResetTab={() => handleResetTab("weight")} />}
                {activeTab === "bonuses" && <BonusesTab values={values} onChange={handleChange} onResetTab={() => handleResetTab("bonuses")} />}
                {activeTab === "level" && <LevelTab values={values} onChange={handleChange} onResetTab={() => handleResetTab("level")} />}
                {activeTab === "misc" && <MiscTab values={values} onChange={handleChange} onResetTab={() => handleResetTab("misc")} />}
            </View>
        </Section>
    )
}
