import { useEffect, useRef, useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import CustomButton from "../../../components/CustomButton"
import { useTheme } from "../../../context/ThemeContext"
import { storageBridge, PickedFolder } from "../../../lib/storageBridge"

/** Footer CTA descriptor registered by step components. `null` hides the footer. */
export interface CtaState {
    /** Button label. */
    label: string
    /** Whether the button is enabled. */
    enabled: boolean
    /** Press handler. */
    onPress: () => void
}

/** Props for `FolderStep`. */
interface Props {
    /** Called when a folder pick succeeds (whether fresh or pre-existing). */
    onPick: (folder: PickedFolder) => void
    /** Called when the user advances past this step. */
    onAdvance: () => void
    /** Tells the wizard parent what the footer CTA should be. Pass `null` to hide it. */
    onCtaChange: (cta: CtaState | null) => void
}

const styles = StyleSheet.create({
    root: { flex: 1, padding: 16 },
    headline: { fontSize: 22, fontWeight: "700", marginBottom: 8 },
    hint: { fontSize: 14, lineHeight: 20, marginBottom: 20 },
    selected: { borderWidth: 1, borderRadius: 8, padding: 14, marginTop: 8 },
    selectedLabel: { fontSize: 11, fontWeight: "600", letterSpacing: 0.6, marginBottom: 4 },
    selectedName: { fontSize: 16, fontWeight: "600", marginBottom: 8 },
    selectedSub: { fontSize: 12, lineHeight: 18 },
    changeLinkPressable: { alignSelf: "center", paddingVertical: 10, paddingHorizontal: 12 },
    changeLink: { fontSize: 12, textAlign: "center", textDecorationLine: "underline" },
    errorBlock: { marginTop: 12, gap: 8 },
    error: { fontSize: 13 },
})

/** Step 1 of the first-run wizard: storage folder selection.
 *
 * On mount, calls `getCurrentFolder` to pre-populate the Selected card if a URI was persisted in a prior wizard session.
 * Otherwise shows the "Pick a folder" CTA which launches the SAF picker.
 *
 * @param props See `Props`.
 * @returns A React node.
 */
const FolderStep = ({ onPick, onAdvance, onCtaChange }: Props) => {
    const { colors } = useTheme()
    const [picked, setPicked] = useState<PickedFolder | null>(null)
    const [error, setError] = useState<string | null>(null)
    // Mirror `onPick` into a ref so the empty-deps mount effect always calls the latest version.
    const onPickRef = useRef(onPick)
    useEffect(() => {
        onPickRef.current = onPick
    })

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const existing = await storageBridge.getCurrentFolder()
                if (!cancelled && existing) {
                    setPicked(existing)
                    onPickRef.current(existing)
                }
            } catch (e) {
                console.warn("[FolderStep] getCurrentFolder failed", e)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        onCtaChange(picked ? { label: "Next", enabled: true, onPress: onAdvance } : null)
    }, [picked, onAdvance, onCtaChange])

    // Clear the registered CTA on unmount so the outer wizard footer doesn't render a stale "Next"
    // while the next step (migration or system checks) is mounting.
    useEffect(() => {
        return () => onCtaChange(null)
    }, [onCtaChange])

    const handlePick = async () => {
        setError(null)
        try {
            const uri = await storageBridge.pickFolder()
            if (uri == null) return
            const folder = await storageBridge.getCurrentFolder()
            if (folder) {
                setPicked(folder)
                onPickRef.current(folder)
            }
        } catch (e) {
            setError("Couldn't open the folder picker. Retry?")
        }
    }

    return (
        <View style={styles.root}>
            <Text style={[styles.headline, { color: colors.text }]}>Where should the bot save your files?</Text>
            <Text style={[styles.hint, { color: colors.textMuted }]}>
                Choose a folder somewhere you can open in your file manager. Recent Android versions hide app-private storage from file managers, so the bot needs a spot you control. It will put its logs/ and recordings/ subfolders inside whatever you pick.
            </Text>
            {picked == null ? (
                <CustomButton onPress={handlePick}>Pick a folder</CustomButton>
            ) : (
                <View style={[styles.selected, { borderColor: colors.success }]}>
                    <Text style={[styles.selectedLabel, { color: colors.success }]}>SELECTED</Text>
                    <Text style={[styles.selectedName, { color: colors.text }]}>{picked.name}</Text>
                    <Text style={[styles.selectedSub, { color: colors.textMuted }]}>logs/{"\n"}recordings/</Text>
                    <Pressable onPress={handlePick} style={styles.changeLinkPressable} hitSlop={8}>
                        <Text style={[styles.changeLink, { color: colors.primary }]}>Change folder</Text>
                    </Pressable>
                </View>
            )}
            {error && (
                <View style={styles.errorBlock}>
                    <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
                    <CustomButton onPress={handlePick}>Retry</CustomButton>
                </View>
            )}
        </View>
    )
}

export default FolderStep
