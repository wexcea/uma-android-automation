// src/components/TrainingScoringAdvanced/RatioTab.tsx
import React, { useCallback, useEffect, useRef } from "react"
import { ScrollView } from "react-native"
import { SCORING_CONSTANTS_CATALOG } from "../../lib/training/scoringConstantsCatalog"
import { FormulaEcho } from "./FormulaEcho"
import { MultiplierSlider } from "./MultiplierSlider"
import { TabHeader } from "./TabHeader"
import { propagateMonotonic } from "./monotonicGroup"

const ENTRIES = SCORING_CONSTANTS_CATALOG.filter((e) => e.group === "ratio")

/** Props for `RatioTab`. */
export interface RatioTabProps {
    /** Current value per catalog key. */
    values: Record<string, number>
    /** Update the value for one catalog key. */
    onChange: (key: string, value: number) => void
    /** Reset every catalog key in this tab to its default. */
    onResetTab: () => void
}

/**
 * Ratio tab body: renders one `MultiplierSlider` per Ratio-group entry. Entries inside a monotonic group propagate their value to siblings via `propagateMonotonic`.
 *
 * @param props See `RatioTabProps`.
 * @returns The Ratio tab content.
 */
export function RatioTab({ values, onChange, onResetTab }: RatioTabProps): React.ReactElement {
    // Track the latest values map via a ref so `handleChange` can stay a stable callback. If `values` were in the dep array, the callback ref would change on every settings update, which would cascade re-renders into every memoized `MultiplierSlider` in the tab.
    const valuesRef = useRef(values)
    useEffect(() => {
        valuesRef.current = values
    }, [values])
    const handleChange = useCallback(
        (key: string, value: number) => {
            const updates = propagateMonotonic(ENTRIES, key, value, valuesRef.current)
            for (const [k, v] of updates) onChange(k, v)
        },
        [onChange]
    )

    return (
        <ScrollView>
            <TabHeader
                description="Multipliers applied to each stat based on how close it is to its target (current / target stat). Bucket boundaries are fixed at 15%, 30%, 45%, 60%, 75%, and 90% - only the per-bucket multipliers are tunable. Higher multiplier = bot trains stats in that bucket more aggressively. Values stay monotonic when you drag."
                onReset={onResetTab}
            />
            <FormulaEcho text="Ratio = step( completion% , buckets [15,30,45,60,75,90]  -> [m1..m7] )" />
            {ENTRIES.map((entry) => (
                <MultiplierSlider key={entry.key} entry={entry} value={values[entry.key] ?? entry.defaultValue} onChange={handleChange} />
            ))}
        </ScrollView>
    )
}
