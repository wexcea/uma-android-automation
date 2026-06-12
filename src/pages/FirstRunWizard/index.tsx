import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { BackHandler, StyleSheet, Text, View } from "react-native"
import CustomButton from "../../components/CustomButton"
import { useTheme } from "../../context/ThemeContext"
import { useLegacyFileScan } from "../../hooks/useLegacyFileScan"
import { storageBridge, PickedFolder } from "../../lib/storageBridge"
import FolderStep, { CtaState } from "./steps/FolderStep"
import MigrationStep from "./steps/MigrationStep"
import SystemChecksStep from "./steps/SystemChecksStep"

/** Props for `FirstRunWizard`. */
interface Props {
    /** Called when the user taps Finish on the System Checks step. Should mark the SQLite flag and unmount. */
    onComplete: () => Promise<void>
}

type StepKey = "folder" | "migration" | "systemChecks"

const styles = StyleSheet.create({
    root: { flex: 1 },
    counter: { fontSize: 11, letterSpacing: 0.6, textAlign: "center", marginTop: 16 },
    progressTrack: { height: 3, marginHorizontal: 16, marginTop: 8, marginBottom: 8, borderRadius: 2, overflow: "hidden" },
    progressFill: { height: "100%", borderRadius: 2 },
    body: { flex: 1 },
    footer: { padding: 16 },
    footerRow: { flexDirection: "row", gap: 12 },
    footerButton: { flex: 1 },
    saveError: { fontSize: 12, marginBottom: 8, textAlign: "center" },
    accessBanner: { marginHorizontal: 16, marginBottom: 8, padding: 12, borderWidth: 1, borderRadius: 8 },
    accessBannerText: { fontSize: 13, lineHeight: 18 },
})

/** Top-level first-run wizard. Mounted by `AppWithBootstrap` when `firstRun.completed` is unset.
 *
 * Renders the step counter + progress bar, the active step body, and the fixed footer CTAs.
 * Supports going back via the footer Back button and the Android hardware Back key.
 *
 * @param props See `Props`.
 * @returns A React node.
 */
const FirstRunWizard = ({ onComplete }: Props) => {
    const { colors } = useTheme()
    const { scanning, counts, hasLegacyFiles } = useLegacyFileScan()
    const [outerStep, setOuterStep] = useState(0)
    const [outerCta, setOuterCta] = useState<CtaState | null>(null)
    const [pendingAdvance, setPendingAdvance] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)
    const [accessError, setAccessError] = useState<string | null>(null)

    const steps = useMemo((): StepKey[] => {
        const list: StepKey[] = ["folder"]
        if (hasLegacyFiles) list.push("migration")
        list.push("systemChecks")
        return list
    }, [hasLegacyFiles])

    const total = steps.length
    const current = steps[Math.min(outerStep, total - 1)]

    const advance = useCallback(async () => {
        // Verify the picked folder is still accessible before advancing past step 1.
        if (outerStep >= 1) {
            const ok = await storageBridge.validateAccess()
            if (!ok) {
                setOuterStep(0)
                setOuterCta(null)
                setAccessError("That folder is no longer accessible. Pick another one.")
                return
            }
        }
        setOuterStep(prev => Math.min(prev + 1, steps.length - 1))
    }, [steps.length, outerStep])

    const goBack = useCallback(() => {
        setOuterStep(prev => Math.max(prev - 1, 0))
    }, [])

    // Cancel on step 0 sends the app to the background. The wizard is mandatory before reaching the
    // main app, so this is the only escape hatch a user has during initial setup.
    const handleCancel = useCallback(() => {
        BackHandler.exitApp()
    }, [])

    // Intercept the hardware Back button so it walks the wizard backwards instead of dismissing the app.
    // The wizard is mandatory, so on step 0 we still swallow the press to suppress the default exit.
    const goBackRef = useRef(goBack)
    useEffect(() => { goBackRef.current = goBack })
    useEffect(() => {
        const sub = BackHandler.addEventListener("hardwareBackPress", () => {
            if (outerStep > 0) goBackRef.current()
            return true
        })
        return () => sub.remove()
    }, [outerStep])

    const handlePicked = useCallback((folder: PickedFolder | null) => {
        if (folder != null) setAccessError(null)
    }, [])

    // If the user tapped Next on step 1 while the scan was in flight, advance once the list settles.
    useEffect(() => {
        if (pendingAdvance && !scanning) {
            setPendingAdvance(false)
            advance()
        }
    }, [pendingAdvance, scanning, advance])

    const handleFolderAdvance = useCallback(() => {
        if (scanning) {
            setPendingAdvance(true)
            return
        }
        advance()
    }, [scanning, advance])

    const handleFinish = useCallback(async () => {
        setSaveError(null)
        try {
            await onComplete()
        } catch {
            setSaveError("Couldn't save your setup. Tap Finish to retry.")
        }
    }, [onComplete])

    const stepBody = (() => {
        switch (current) {
            case "folder":
                return <FolderStep onPick={handlePicked} onAdvance={handleFolderAdvance} onCtaChange={setOuterCta} />
            case "migration":
                if (!counts) return null
                return <MigrationStep legacyCounts={counts} onAdvance={advance} />
            case "systemChecks":
                return <SystemChecksStep onAdvance={handleFinish} onCtaChange={setOuterCta} />
        }
    })()

    return (
        <View style={[styles.root, { backgroundColor: colors.background }]}>
            <Text style={[styles.counter, { color: colors.textMuted }]}>STEP {outerStep + 1} OF {total}</Text>
            <View style={[styles.progressTrack, { backgroundColor: colors.borderHair }]}>
                <View style={[styles.progressFill, { width: `${((outerStep + 1) / total) * 100}%`, backgroundColor: colors.primary }]} />
            </View>
            {accessError && outerStep === 0 && (
                <View style={[styles.accessBanner, { backgroundColor: colors.warningSubtle ?? colors.surface, borderColor: colors.warning }]}>
                    <Text style={[styles.accessBannerText, { color: colors.warning }]}>{accessError}</Text>
                </View>
            )}
            <View style={styles.body}>{stepBody}</View>
            <View style={styles.footer}>
                {saveError && <Text style={[styles.saveError, { color: colors.error }]}>{saveError}</Text>}
                <View style={styles.footerRow}>
                    <View style={styles.footerButton}>
                        <CustomButton variant="ghost" onPress={outerStep === 0 ? handleCancel : goBack} disabled={pendingAdvance}>
                            {outerStep === 0 ? "Cancel" : "Back"}
                        </CustomButton>
                    </View>
                    {outerCta && (
                        <View style={styles.footerButton}>
                            <CustomButton onPress={outerCta.onPress} disabled={!outerCta.enabled || pendingAdvance}>
                                {pendingAdvance ? "Loading..." : outerCta.label}
                            </CustomButton>
                        </View>
                    )}
                </View>
            </View>
        </View>
    )
}

export default FirstRunWizard
