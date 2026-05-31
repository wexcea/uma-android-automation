// src/components/TrainingScoringAdvanced/StickySandboxButton.tsx
import React from "react"
import { View, StyleSheet, Text } from "react-native"
import { Button } from "../ui/button"
import { TYPE } from "../../lib/type"
import { SPACING } from "../../lib/spacing"

/** Props for `StickySandboxButton`. */
export interface StickySandboxButtonProps {
    /** Press handler, typically opens the scoring sandbox modal. */
    onPress: () => void
}

/**
 * Floating "Open scoring sandbox" button pinned to the bottom of its parent. Mounted as a sibling of the
 * page's main `ScrollView` so absolute positioning can pin it relative to the page container, not the
 * scrollable content.
 *
 * @param props See `StickySandboxButtonProps`.
 * @returns A centered button anchored to the bottom edge of the viewport.
 */
export function StickySandboxButton({ onPress }: StickySandboxButtonProps): React.ReactElement {
    return (
        <View style={styles.container} pointerEvents="box-none">
            <Button onPress={onPress} variant="default" size="default">
                <Text style={[TYPE.body, styles.label]}>Open scoring sandbox</Text>
            </Button>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: SPACING.lg,
        alignItems: "center",
    },
    label: {
        color: "white",
        fontWeight: "600",
    },
})
