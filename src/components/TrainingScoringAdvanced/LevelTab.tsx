// src/components/TrainingScoringAdvanced/LevelTab.tsx
import React from "react"
import { ScrollView } from "react-native"
import { SCORING_CONSTANTS_CATALOG } from "../../lib/training/scoringConstantsCatalog"
import { FormulaEcho } from "./FormulaEcho"
import { MultiplierSlider } from "./MultiplierSlider"
import { TabHeader } from "./TabHeader"

const ENTRIES = SCORING_CONSTANTS_CATALOG.filter((e) => e.group === "level")

/** Props for `LevelTab`. */
export interface LevelTabProps {
    /** Current value per catalog key. */
    values: Record<string, number>
    /** Update the value for one catalog key. */
    onChange: (key: string, value: number) => void
    /** Reset every catalog key in this tab to its default. */
    onResetTab: () => void
}

/**
 * Level tab body: renders a top header plus one `MultiplierSlider` per Level-group catalog entry.
 *
 * @param props See `LevelTabProps`.
 * @returns The Level tab content.
 */
export function LevelTab({ values, onChange, onResetTab }: LevelTabProps): React.ReactElement {
    return (
        <ScrollView>
            <TabHeader description="Tune how much the training facility's level (1-5) amplifies its primary-stat contribution." onReset={onResetTab} />
            <FormulaEcho text="Level = levelBoost(rank, trainingLevel) when training-level weighting is on" />
            {ENTRIES.map((entry) => (
                <MultiplierSlider key={entry.key} entry={entry} value={values[entry.key] ?? entry.defaultValue} onChange={onChange} />
            ))}
        </ScrollView>
    )
}
