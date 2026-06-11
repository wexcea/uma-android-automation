import { useCallback, useEffect, useRef, useState } from "react"
import { StyleSheet, View } from "react-native"
import SystemChecksWizard, { SystemCheckResults } from "../../../components/SystemChecksWizard"
import { CtaState } from "./FolderStep"

/** Props for `SystemChecksStep`. */
interface Props {
    /** Called when the user taps the outer Finish button (only enabled once all permissions are granted). */
    onAdvance: () => void
    /** Footer CTA registration callback. */
    onCtaChange: (cta: CtaState | null) => void
}

const styles = StyleSheet.create({
    root: { flex: 1, padding: 16 },
})

/** Final step of the first-run wizard. Hosts the shared `SystemChecksWizard` component and gates
 * the outer wizard's Finish CTA on all three permissions being granted via the live
 * `onPermissionsChange` callback.
 *
 * @param props See `Props`.
 * @returns A React node.
 */
const SystemChecksStep = ({ onAdvance, onCtaChange }: Props) => {
    const [granted, setGranted] = useState<SystemCheckResults | null>(null)

    // Latest-ref pattern so the effects don't re-run on parent callback identity changes.
    const onCtaChangeRef = useRef(onCtaChange)
    const onAdvanceRef = useRef(onAdvance)
    useEffect(() => { onCtaChangeRef.current = onCtaChange })
    useEffect(() => { onAdvanceRef.current = onAdvance })

    const handlePermissionsChange = useCallback((r: SystemCheckResults) => {
        setGranted(r)
    }, [])

    const allGranted = granted !== null && granted.accessibility && granted.overlay && granted.battery

    useEffect(() => {
        onCtaChangeRef.current({ label: "Finish", enabled: allGranted, onPress: () => onAdvanceRef.current() })
    }, [allGranted])

    // Clear the registered CTA on unmount so the outer footer doesn't render a stale "Finish" if the
    // user navigates back to an earlier step.
    useEffect(() => {
        return () => onCtaChangeRef.current(null)
    }, [])

    return (
        <View style={styles.root}>
            <SystemChecksWizard onPermissionsChange={handlePermissionsChange} />
        </View>
    )
}

export default SystemChecksStep
