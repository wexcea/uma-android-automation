import React, { useEffect, useState, useMemo } from "react"
import { View, Text, Pressable, StyleSheet, ViewStyle } from "react-native"
import DragList, { DragListRenderItemInfo } from "react-native-draglist"
import Ionicons from "@react-native-vector-icons/ionicons"
import { useTheme } from "../../context/ThemeContext"
import { ModalCheckRow } from "../ui/modal-list"
import { TYPE } from "../../lib/type"
import { SPACING } from "../../lib/spacing"
import { RADII } from "../../lib/radii"

/** A single priority list item. */
interface PriorityItem {
    /** Stable identifier used by the drag list. */
    id: string
    /** Visible label. */
    label: string
    /** Optional secondary line. */
    description?: string
}

/** Props for `DraggablePriorityList`. */
interface DraggablePriorityListProps {
    /** All available items. */
    items: PriorityItem[]
    /** Subset of `items.id` representing selected items in priority order (index 0 = highest). */
    selectedItems: string[]
    /** Called when the user toggles a row's selection. */
    onSelectionChange: (next: string[]) => void
    /** Called when the user reorders selected items via drag. */
    onOrderChange: (next: string[]) => void
    /** Optional outer style. */
    style?: ViewStyle
}

/**
 * A drag-to-reorder list paired with checkbox toggles. Selected items render on top with a numeric badge and grip handle. Unselected items render below
 * a dashed separator with a plain checkbox. Consumed inside `SheetModal` - the parent owns scroll so this component does not wrap its rows in a ScrollView.
 * @param items All items.
 * @param selectedItems Selected items in priority order.
 * @param onSelectionChange Selection toggle callback.
 * @param onOrderChange Reorder callback.
 * @param style Optional outer style override.
 * @returns A view containing the priority list, separator, unselected rows, and empty-state caption.
 */
const DraggablePriorityList = ({ items, selectedItems, onSelectionChange, onOrderChange, style }: DraggablePriorityListProps) => {
    const { colors } = useTheme()
    const [orderedSelected, setOrderedSelected] = useState<string[]>(selectedItems)

    useEffect(() => {
        setOrderedSelected(selectedItems)
    }, [selectedItems])

    const styles = useMemo(
        () =>
            StyleSheet.create({
                tip: { ...TYPE.monoLabel, color: colors.textMuted, fontSize: 10, letterSpacing: 1.2, paddingHorizontal: 4, paddingBottom: SPACING.sm },
                empty: { ...TYPE.monoLabel, color: colors.textMuted, fontSize: 10, letterSpacing: 1.2, textAlign: "center", paddingTop: SPACING.md },
                selectedRow: {
                    flexDirection: "row",
                    alignItems: "center",
                    gap: SPACING.sm,
                    paddingHorizontal: SPACING.sm,
                    paddingVertical: SPACING.sm,
                    borderRadius: RADII.md,
                    borderWidth: 1,
                    borderColor: colors.brandBorder,
                    backgroundColor: colors.brandSubtle,
                    overflow: "hidden",
                    marginBottom: SPACING.xs + 2,
                },
                badge: {
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    backgroundColor: colors.brand,
                    alignItems: "center",
                    justifyContent: "center",
                },
                badgeText: { ...TYPE.monoValue, color: colors.onBrand, fontSize: 11, fontWeight: "700" as const },
                selectedLabel: { ...TYPE.body, color: colors.text, flex: 1 },
                grip: { opacity: 0.7 },
                separator: { borderTopWidth: 1, borderStyle: "dashed", borderColor: colors.borderHair, marginVertical: SPACING.sm },
                unselectedList: { gap: SPACING.xs + 2 },
            }),
        [colors]
    )

    const renderSelectedItem = (info: DragListRenderItemInfo<PriorityItem>) => {
        const { item, onDragStart, onDragEnd } = info
        const priorityNumber = orderedSelected.indexOf(item.id) + 1
        return (
            <Pressable
                style={styles.selectedRow}
                onPress={() => onSelectionChange(selectedItems.filter((id) => id !== item.id))}
                android_ripple={{ color: colors.ripple, foreground: true }}
                accessibilityRole="button"
                accessibilityLabel={`${item.label} priority ${priorityNumber}`}
            >
                <View style={styles.badge}>
                    <Text style={styles.badgeText}>{priorityNumber}</Text>
                </View>
                <Text style={styles.selectedLabel}>{item.label}</Text>
                <Pressable onPress={() => {}} onPressIn={onDragStart} onPressOut={onDragEnd} style={styles.grip} accessibilityLabel="Drag to reorder">
                    <Ionicons name="reorder-three" size={20} color={colors.brand} />
                </Pressable>
            </Pressable>
        )
    }

    const handleReordered = (fromIndex: number, toIndex: number) => {
        const copy = [...orderedSelected]
        const [removed] = copy.splice(fromIndex, 1)
        copy.splice(toIndex, 0, removed)
        setOrderedSelected(copy)
        onOrderChange(copy)
    }

    const selectedData = orderedSelected.map((id) => items.find((it) => it.id === id)).filter((x): x is PriorityItem => !!x)
    const unselected = items.filter((it) => !selectedItems.includes(it.id))

    return (
        <View style={style}>
            <Text style={styles.tip}>DRAG TO REORDER - TOP = HIGHEST</Text>

            {selectedData.length > 0 ? <DragList data={selectedData} keyExtractor={(item) => item.id} onReordered={handleReordered} renderItem={renderSelectedItem} scrollEnabled={false} /> : null}

            {selectedData.length > 0 && unselected.length > 0 ? <View style={styles.separator} /> : null}

            {unselected.length > 0 ? (
                <View style={styles.unselectedList}>
                    {unselected.map((item) => (
                        <ModalCheckRow key={item.id} label={item.label} checked={false} dim onPress={() => onSelectionChange([...selectedItems, item.id])} />
                    ))}
                </View>
            ) : null}

            {selectedItems.length === 0 ? <Text style={styles.empty}>NO ITEMS SELECTED - SELECT TO SET ORDER</Text> : null}
        </View>
    )
}

export default React.memo(DraggablePriorityList)
