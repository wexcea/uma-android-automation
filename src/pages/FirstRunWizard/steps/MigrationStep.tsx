import { useState } from "react"
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native"
import { useTheme } from "../../../context/ThemeContext"
import { storageBridge, LegacyCounts, MigrationResult } from "../../../lib/storageBridge"

/** The user's choice on the migration step. */
export type MigrationChoice = "move" | "leave" | "delete"

/** Props for `MigrationStep`. */
interface Props {
    /** File counts from the legacy scan. */
    legacyCounts: LegacyCounts
    /** Called once a choice resolves successfully. Second arg is the migration result for move/delete, null for leave. */
    onChoice: (choice: MigrationChoice, result: MigrationResult | null) => void
    /** Called after `onChoice` to advance the outer wizard. */
    onAdvance: () => void
}

const styles = StyleSheet.create({
    root: { flex: 1, padding: 16 },
    headline: { fontSize: 22, fontWeight: "700", marginBottom: 8 },
    hint: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
    card: { flexDirection: "row", gap: 12, padding: 12, borderWidth: 1, borderRadius: 8, marginBottom: 8, alignItems: "center" },
    icon: { fontSize: 18, fontWeight: "700", width: 22, textAlign: "center" },
    title: { fontSize: 14, fontWeight: "600" },
    meta: { fontSize: 12, marginTop: 2 },
    errorBox: { borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 12 },
    errorText: { fontSize: 13, marginBottom: 8 },
    errorAction: { fontSize: 13, fontWeight: "600" },
})

/** Step 2 of the first-run wizard (retroactive only): pick what to do with files at the legacy path.
 *
 * Three Pressable cards stacked. Tapping one runs the corresponding bridge call (or no-op for Leave), shows an inline spinner during, then advances. Partial-failure paths render an
 * inline error card with a continue option.
 *
 * @param props See `Props`.
 * @returns A React node.
 */
const MigrationStep = ({ legacyCounts, onChoice, onAdvance }: Props) => {
    const { colors } = useTheme()
    const total = legacyCounts.logs + legacyCounts.recordings
    const [busy, setBusy] = useState<MigrationChoice | null>(null)
    const [error, setError] = useState<string | null>(null)

    const handleChoice = async (choice: MigrationChoice) => {
        setError(null)
        setBusy(choice)
        try {
            let result: MigrationResult | null = null
            if (choice !== "leave") {
                result = await storageBridge.migrateLegacyFiles(choice)
                if (result.error) {
                    const moved = result.movedLogs + result.movedRecordings
                    const reason = result.error === "OUT_OF_SPACE" ? "Out of space on your new folder." : "Permission denied on a source file."
                    setError(`Moved ${moved} of ${total} files. ${reason}`)
                    setBusy(null)
                    return
                }
            }
            onChoice(choice, result)
            onAdvance()
        } catch (e) {
            console.warn("[MigrationStep] migrate failed", e)
            setError("Migration failed unexpectedly. You can retry or continue without moving.")
            setBusy(null)
        }
    }

    const card = (choice: MigrationChoice, icon: string, title: string, meta: string, danger = false, primary = false) => {
        const accent = danger ? colors.error : primary ? colors.primary : colors.text
        const border = danger ? colors.error : primary ? colors.primary : colors.borderHair
        return (
            <Pressable onPress={() => handleChoice(choice)} disabled={!!busy} style={[styles.card, { borderColor: border, backgroundColor: colors.surface }]}>
                <Text style={[styles.icon, { color: accent }]}>{icon}</Text>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.title, { color: accent }]}>{title}</Text>
                    <Text style={[styles.meta, { color: colors.textMuted }]}>{meta}</Text>
                </View>
                {busy === choice && <ActivityIndicator size="small" color={colors.primary} />}
            </Pressable>
        )
    }

    return (
        <View style={styles.root}>
            <Text style={[styles.headline, { color: colors.text }]}>Move your existing files?</Text>
            <Text style={[styles.hint, { color: colors.textMuted }]}>
                Found {legacyCounts.logs} logs and {legacyCounts.recordings} recordings at the old location. Pick what to do with them.
            </Text>
            {error && (
                <View style={[styles.errorBox, { borderColor: colors.error }]}>
                    <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
                    <Pressable onPress={onAdvance}>
                        <Text style={[styles.errorAction, { color: colors.text }]}>Continue with partial move</Text>
                    </Pressable>
                </View>
            )}
            {card("move", "->", "Move them", "Copy to your new folder, remove originals", false, true)}
            {card("leave", "x", "Leave them", "Keep at old path, new files use new folder")}
            {card("delete", "X", "Delete them", "Permanent.", true)}
        </View>
    )
}

export default MigrationStep
