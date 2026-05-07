import { memo, useEffect, useRef } from "react"
import { View, Text, TouchableOpacity, ActivityIndicator, Animated, ViewStyle } from "react-native"
import { RefreshCw } from "lucide-react-native"
import { APTITUDE_RANKS, AptitudeMap } from "../../../lib/solver/constants"

interface AptitudeRowProps {
    /** The aptitude slot this row controls (e.g. "Sprint", "Mile"). */
    slot: keyof AptitudeMap
    /** Display label (typically same as `slot`). */
    label: string
    /** Currently selected rank for this slot. */
    currentRank: string
    /** Called when the user picks a rank. */
    onChange: (slot: keyof AptitudeMap, rank: string) => void
    /** Style sheet from the parent (stable across renders). */
    styles: any
}

/**
 * Memoized row of rank buttons (S..G) for one aptitude slot.
 *
 * @param props The {@link AptitudeRowProps} for this row.
 * @returns The rendered aptitude row.
 */
export const AptitudeRow = memo(({ slot, label, currentRank, onChange, styles }: AptitudeRowProps) => (
    <View style={styles.aptRow}>
        <Text style={styles.aptLabel}>{label}</Text>
        <View style={styles.aptButtons}>
            {APTITUDE_RANKS.map((rank) => {
                const active = currentRank === rank
                return (
                    <TouchableOpacity key={rank} style={[styles.aptBtn, active && styles.aptBtnActive]} onPress={() => onChange(slot, rank)}>
                        <Text style={active ? styles.aptBtnTextActive : styles.aptBtnText}>{rank}</Text>
                    </TouchableOpacity>
                )
            })}
        </View>
    </View>
))
AptitudeRow.displayName = "AptitudeRow"

interface EpithetChipProps {
    /** The epithet entry to render (data file row). */
    epithet: { name: string; bullet_points?: string[]; [k: string]: any }
    /** Whether this chip is currently in the parent's selected list. */
    selected: boolean
    /** Stable parent callback that flips the chip's selection state by name. */
    onToggle: (name: string) => void
    /** Style sheet from the parent (stable across renders). */
    styles: any
}

/**
 * Memoized chip for a single epithet in the target / forced pickers.
 *
 * @param props The {@link EpithetChipProps} for this chip.
 * @returns The rendered epithet chip.
 */
export const EpithetChip = memo(({ epithet, selected, onToggle, styles }: EpithetChipProps) => {
    const bullets = epithet.bullet_points ?? []
    // Last bullet is the reward; earlier bullets are conditions.
    const conditionBullets = bullets.length > 1 ? bullets.slice(0, -1) : []
    const rewardBullet = bullets.length > 0 ? bullets[bullets.length - 1] : null
    // Red dot in the corner flags epithets the solver can't track or advance (see "Epithets without matchers" info block).
    const hasMatchers = (epithet.matchers ?? []).length > 0
    return (
        <TouchableOpacity style={[styles.chip, selected && styles.chipActive]} onPress={() => onToggle(epithet.name)}>
            {hasMatchers ? null : <View style={styles.chipNoMatcherDot} />}
            <Text style={selected ? styles.chipTextActive : styles.chipText}>{epithet.name}</Text>
            {conditionBullets.map((b, idx) => (
                <Text key={idx} style={selected ? styles.chipConditionActive : styles.chipCondition} numberOfLines={2}>
                    {b}
                </Text>
            ))}
            {rewardBullet ? (
                <Text style={selected ? styles.chipRewardActive : styles.chipReward} numberOfLines={2}>
                    {rewardBullet}
                </Text>
            ) : null}
        </TouchableOpacity>
    )
})
EpithetChip.displayName = "EpithetChip"

/** Props for `RecalcFab`. */
interface RecalcFabProps {
    /** Triggered when the user taps the FAB - typically `runPreview`. */
    onPress: () => void
    /** When true the icon is swapped for a spinner and the button is disabled. */
    loading: boolean
    /** Style sheet from the parent so the FAB inherits the page's themed colors / sizes. */
    styles: { recalcFab: ViewStyle; recalcFabButton: ViewStyle; recalcFabLabel: ViewStyle; recalcFabLabelText: object }
    /** Theme palette - the icon and spinner pull their tint from `colors.background` to contrast the primary fill. */
    colors: { background: string }
}

/**
 * Floating action button shown in the bottom-right corner when the schedule preview is stale. Plays a one-shot
 * spring scale-in on mount to draw the user's eye, then sits still until tapped or unmounted.
 *
 * @param props See `RecalcFabProps`.
 * @returns Animated FAB containing the recalculate icon (or a spinner while loading).
 */
export const RecalcFab = memo(({ onPress, loading, styles, colors }: RecalcFabProps) => {
    const scale = useRef(new Animated.Value(0)).current
    useEffect(() => {
        Animated.spring(scale, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }).start()
    }, [scale])
    return (
        <Animated.View style={[styles.recalcFab, { transform: [{ scale }] }]} pointerEvents="box-none">
            <View style={styles.recalcFabLabel}>
                <Text style={styles.recalcFabLabelText}>Apply Changes?</Text>
            </View>
            <TouchableOpacity style={styles.recalcFabButton} onPress={onPress} disabled={loading} activeOpacity={0.85}>
                {loading ? <ActivityIndicator size="small" color={colors.background} /> : <RefreshCw size={22} color={colors.background} />}
            </TouchableOpacity>
        </Animated.View>
    )
})
RecalcFab.displayName = "RecalcFab"
