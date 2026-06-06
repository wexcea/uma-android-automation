// src/components/TrainingScoringAdvanced/BonusesTab.tsx
import React from "react"
import { ScrollView } from "react-native"
import { SCORING_CONSTANTS_CATALOG } from "../../lib/training/scoringConstantsCatalog"
import { FormulaEcho } from "./FormulaEcho"
import { MultiplierSlider } from "./MultiplierSlider"
import { TabHeader } from "./TabHeader"

const ENTRIES = SCORING_CONSTANTS_CATALOG.filter((e) => e.group === "bonuses")

/** Props for `BonusesTab`. */
export interface BonusesTabProps {
    /** Current value per catalog key. */
    values: Record<string, number>
    /** Update the value for one catalog key. */
    onChange: (key: string, value: number) => void
    /** Reset every catalog key in this tab to its default. */
    onResetTab: () => void
}

/**
 * Bonuses tab body: renders a top header plus one `MultiplierSlider` per Bonuses-group catalog entry.
 *
 * @param props See `BonusesTabProps`.
 * @returns The Bonuses tab content.
 */
export function BonusesTab({ values, onChange, onResetTab }: BonusesTabProps): React.ReactElement {
    return (
        <ScrollView>
            <TabHeader description="Per-stat thresholds for the main-stat bonus that fires when a training gives a big chunk of its own stat." onReset={onResetTab} />
            <FormulaEcho text="MainStatBonus = bonusMagnitude when statGain >= per-stat threshold, else 1" />
            {ENTRIES.map((entry) => (
                <MultiplierSlider key={entry.key} entry={entry} value={values[entry.key] ?? entry.defaultValue} onChange={onChange} />
            ))}
        </ScrollView>
    )
}
