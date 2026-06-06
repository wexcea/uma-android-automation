// src/components/TrainingScoringAdvanced/WeightTab.tsx
import React, { useCallback, useEffect, useRef } from "react"
import { ScrollView } from "react-native"
import { SCORING_CONSTANTS_CATALOG } from "../../lib/training/scoringConstantsCatalog"
import { FormulaEcho } from "./FormulaEcho"
import { MultiplierSlider } from "./MultiplierSlider"
import { TabHeader } from "./TabHeader"

const ENTRIES = SCORING_CONSTANTS_CATALOG.filter((e) => e.group === "weight")

/** Props for `WeightTab`. */
export interface WeightTabProps {
    /** Current value per catalog key. */
    values: Record<string, number>
    /** Update the value for one catalog key. */
    onChange: (key: string, value: number) => void
    /** Reset every catalog key in this tab to its default. */
    onResetTab: () => void
}

/**
 * Lock the just-released slider at its final value and rescale only the OTHER weights so the total sums to 1.0. If the released value is at or above 1.0 there is no budget
 * left and the others are zeroed. If the other weights all read as zero, the remaining budget is split equally among them so the user has something to drag against next.
 *
 * @param values Current value record for every catalog key.
 * @param settledKey Key of the slider the user just released.
 * @param settledValue Final value from the released slider.
 * @returns Map of weight key to normalized value, ready to feed back into `onChange`.
 */
function normalizeWeights(values: Record<string, number>, settledKey: string, settledValue: number): Map<string, number> {
    const next = new Map<string, number>()
    const settled = Math.max(0, Math.min(1, settledValue))
    next.set(settledKey, settled)

    const others: { key: string; raw: number }[] = []
    let othersSum = 0
    for (const entry of ENTRIES) {
        if (entry.key === settledKey) continue
        const raw = values[entry.key] ?? entry.defaultValue
        others.push({ key: entry.key, raw })
        othersSum += raw
    }

    const remaining = 1 - settled
    if (remaining <= 0) {
        for (const { key } of others) next.set(key, 0)
        return next
    }
    if (othersSum <= 0) {
        const share = others.length > 0 ? remaining / others.length : 0
        for (const { key } of others) next.set(key, share)
        return next
    }
    for (const { key, raw } of others) {
        next.set(key, (raw / othersSum) * remaining)
    }
    return next
}

/**
 * Weight tab body: renders one `MultiplierSlider` per weight entry. Whenever the user lifts their finger from a slider, all weights are automatically rescaled to sum to 1.0
 * via `normalizeWeights`. This removes the need for a manual Normalize button.
 *
 * @param props See `WeightTabProps`.
 * @returns The Weight tab content.
 */
export function WeightTab({ values, onChange, onResetTab }: WeightTabProps): React.ReactElement {
    // Track the latest values map via a ref so `handleSlidingComplete` can stay a stable callback. With `values` in the dep array the callback ref would change on every settings update, cascading re-renders into every memoized `MultiplierSlider`.
    const valuesRef = useRef(values)
    useEffect(() => {
        valuesRef.current = values
    }, [values])
    const handleSlidingComplete = useCallback(
        (key: string, finalValue: number) => {
            const normalized = normalizeWeights(valuesRef.current, key, finalValue)
            for (const [k, v] of normalized) onChange(k, v)
        },
        [onChange]
    )

    return (
        <ScrollView>
            <TabHeader description="How much each scoring component (stat efficiency, relationships, misc) contributes to the final score. The weights are normalized to 1.0." onReset={onResetTab} />
            <FormulaEcho text="wS, wR, wM (composition weights in the top formula)" />
            {ENTRIES.map((entry) => (
                <MultiplierSlider key={entry.key} entry={entry} value={values[entry.key] ?? entry.defaultValue} onChange={onChange} onSlidingComplete={handleSlidingComplete} />
            ))}
        </ScrollView>
    )
}
