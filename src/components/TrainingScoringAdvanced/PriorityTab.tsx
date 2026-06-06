// src/components/TrainingScoringAdvanced/PriorityTab.tsx
import React from "react"
import { ScrollView } from "react-native"
import { SCORING_CONSTANTS_CATALOG } from "../../lib/training/scoringConstantsCatalog"
import { FormulaEcho } from "./FormulaEcho"
import { MultiplierSlider } from "./MultiplierSlider"
import { TabHeader } from "./TabHeader"

const ENTRIES = SCORING_CONSTANTS_CATALOG.filter((e) => e.group === "priority")

/** Props for `PriorityTab`. */
export interface PriorityTabProps {
    /** Current value per catalog key. */
    values: Record<string, number>
    /** Update the value for one catalog key. */
    onChange: (key: string, value: number) => void
    /** Reset every catalog key in this tab to its default. */
    onResetTab: () => void
}

/**
 * Priority tab body: renders a top header plus one `MultiplierSlider` per Priority-group catalog entry.
 *
 * @param props See `PriorityTabProps`.
 * @returns The Priority tab content.
 */
export function PriorityTab({ values, onChange, onResetTab }: PriorityTabProps): React.ReactElement {
    return (
        <ScrollView>
            <TabHeader description="Adjust how much priority order influences which training the bot picks." onReset={onResetTab} />
            <FormulaEcho text="Priority = 1 + priorityCoefficient x (listLength - rank)" />
            {ENTRIES.map((entry) => (
                <MultiplierSlider key={entry.key} entry={entry} value={values[entry.key] ?? entry.defaultValue} onChange={onChange} />
            ))}
        </ScrollView>
    )
}
