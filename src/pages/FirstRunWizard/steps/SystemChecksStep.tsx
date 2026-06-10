import { useCallback, useEffect, useRef, useState } from "react"
import { StyleSheet, Text, View } from "react-native"
import SystemChecksWizard, { SystemCheckResults } from "../../../components/SystemChecksWizard"
import { useTheme } from "../../../context/ThemeContext"
import { CtaState } from "./FolderStep"

/** Props for `SystemChecksStep`. */
interface Props {
    /** Called with the final snapshot of permission grants when the user has visited all checks. */
    onSnapshot: (results: SystemCheckResults) => void
    /** Called when the user taps the outer Continue button (only enabled once all checks visited). */
    onAdvance: () => void
    /** Footer CTA registration callback. */
    onCtaChange: (cta: CtaState | null) => void
}

const styles = StyleSheet.create({
    root: { flex: 1, padding: 16 },
    headline: { fontSize: 22, fontWeight: "700", marginBottom: 8 },
    hint: { fontSize: 14, lineHeight: 20, marginBottom: 14 },
})

/** Step 3 of the first-run wizard: walks the user through accessibility, overlay, battery via the
 * shared `SystemChecksWizard` component.
 *
 * While the inner wizard is active, hides the outer footer. Once `onAllVisited` fires, shows a
 * summary and registers the outer Continue CTA.
 *
 * @param props See `Props`.
 * @returns A React node.
 */
const SystemChecksStep = ({ onSnapshot, onAdvance, onCtaChange }: Props) => {
    const { colors } = useTheme()
    const [results, setResults] = useState<SystemCheckResults | null>(null)

    // Latest-ref pattern so the effects don't re-run on parent callback identity changes.
    const onSnapshotRef = useRef(onSnapshot)
    const onCtaChangeRef = useRef(onCtaChange)
    useEffect(() => { onSnapshotRef.current = onSnapshot })
    useEffect(() => { onCtaChangeRef.current = onCtaChange })

    const handleAllVisited = useCallback((r: SystemCheckResults) => {
        setResults(r)
        onSnapshotRef.current(r)
    }, [])

    useEffect(() => {
        onCtaChangeRef.current(results ? { label: "Continue", enabled: true, onPress: onAdvance } : null)
    }, [results, onAdvance])

    return (
        <View style={styles.root}>
            <Text style={[styles.headline, { color: colors.text }]}>System checks</Text>
            <Text style={[styles.hint, { color: colors.textMuted }]}>
                {results ? "All set on permissions -- review below." : "Three Android permissions the bot needs. We'll walk you through each."}
            </Text>
            <SystemChecksWizard onAllVisited={handleAllVisited} embeddedInWizard />
        </View>
    )
}

export default SystemChecksStep
