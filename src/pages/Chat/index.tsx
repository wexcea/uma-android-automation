import { useCallback, useEffect, useMemo, useState } from "react"
import { View, ScrollView, StyleSheet, TextInput, Text, NativeModules, Pressable } from "react-native"
import Markdown from "react-native-markdown-display"
import { useTheme } from "../../context/ThemeContext"
import CustomButton from "../../components/CustomButton"
import PageHeader from "../../components/PageHeader"
import { databaseManager } from "../../lib/database"

const HISTORY_CATEGORY = "chat"
const HISTORY_KEY = "questionHistory"
const HISTORY_MAX = 20

interface DocResult {
    id: string
    source: string
    heading: string
    text: string
    score: number
}

interface ChatResult {
    answer: string
    mode: "generated" | "retrieveOnly" | "verifierFallback"
    service?: string
    overlap?: number
    rejectedAnswer?: string
    citations: DocResult[]
}

/**
 * Ask-the-docs chat page.
 *
 * Calls [LLMChatModule.chat] which runs the full RAG pipeline: retrieve → (optionally) generate → verify. The UI
 * badges each answer with its provenance so users can tell at a glance whether the text is verbatim from the docs,
 * paraphrased by an on-device model, or a fallback after the verifier rejected a suspect answer.
 */
const Chat = () => {
    const { colors } = useTheme()
    const [query, setQuery] = useState("")
    const [result, setResult] = useState<ChatResult | null>(null)
    const [isSearching, setIsSearching] = useState(false)
    const [searched, setSearched] = useState(false)
    const [history, setHistory] = useState<string[]>([])

    // Load persisted question history on mount.
    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const stored = await databaseManager.loadSetting(HISTORY_CATEGORY, HISTORY_KEY)
                if (!cancelled && Array.isArray(stored)) setHistory(stored.filter((x): x is string => typeof x === "string"))
            } catch {
                // Fresh install or DB not ready yet — start with an empty history.
            }
        })()
        return () => {
            cancelled = true
        }
    }, [])

    const handleSearch = useCallback(async () => {
        const q = query.trim()
        if (!q) return
        setIsSearching(true)
        setSearched(true)
        // Prepend to history, dedupe, cap.
        setHistory((prev) => {
            const next = [q, ...prev.filter((x) => x !== q)].slice(0, HISTORY_MAX)
            databaseManager.saveSetting(HISTORY_CATEGORY, HISTORY_KEY, next, true).catch(() => undefined)
            return next
        })
        try {
            const raw = (await NativeModules.LLMChatModule.chat(q, 4)) as ChatResult
            console.log("[Chat] native response:", JSON.stringify(raw, null, 2))
            setResult(raw)
        } catch (err) {
            console.log("[Chat] native error:", err)
            setResult(null)
        } finally {
            setIsSearching(false)
        }
    }, [query])

    const handleHistoryTap = useCallback((q: string) => {
        setQuery(q)
    }, [])

    const handleClearHistory = useCallback(() => {
        setHistory([])
        databaseManager.saveSetting(HISTORY_CATEGORY, HISTORY_KEY, [], true).catch(() => undefined)
    }, [])

    const modeLabel = useMemo(() => {
        if (!result) return null
        switch (result.mode) {
            case "generated":
                return `Generated via ${result.service ?? "model"} · grounding ${Math.round((result.overlap ?? 0) * 100)}%`
            case "retrieveOnly":
                return "Verbatim from docs (no model)"
            case "verifierFallback":
                return `Verifier rejected generated answer (${Math.round((result.overlap ?? 0) * 100)}% grounding). Showing source instead.`
        }
    }, [result])

    const styles = useMemo(
        () =>
            StyleSheet.create({
                root: { flex: 1, margin: 10, backgroundColor: colors.background },
                inputColumn: { gap: 8, marginVertical: 10 },
                input: {
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 6,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    color: colors.foreground,
                    backgroundColor: colors.card,
                    minHeight: 96,
                    maxHeight: 200,
                    textAlignVertical: "top",
                },
                answerCard: {
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 6,
                    padding: 12,
                    marginBottom: 12,
                    backgroundColor: colors.card,
                },
                modeLabel: { fontSize: 11, color: colors.mutedForeground, marginTop: 8, fontStyle: "italic" },
                sectionLabel: { fontSize: 13, fontWeight: "600", color: colors.foreground, marginTop: 10, marginBottom: 6 },
                resultCard: {
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 6,
                    padding: 10,
                    marginBottom: 8,
                    backgroundColor: colors.card,
                },
                resultHeading: { fontWeight: "600", color: colors.foreground, marginBottom: 4 },
                resultMeta: { fontSize: 11, color: colors.mutedForeground, marginBottom: 6 },
                emptyText: { color: colors.mutedForeground, textAlign: "center", marginTop: 20, paddingHorizontal: 20 },
                markdownLink: { color: colors.primary, textDecorationLine: "underline" as const },
                disclaimer: { fontSize: 11, color: colors.mutedForeground, marginTop: 4, marginBottom: 8, fontStyle: "italic" },
                historyHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12, marginBottom: 6 },
                historyTitle: { fontSize: 12, fontWeight: "600", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5 },
                historyClear: { fontSize: 11, color: colors.mutedForeground, textDecorationLine: "underline" },
                historyChip: {
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 14,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    marginRight: 6,
                    marginBottom: 6,
                    backgroundColor: colors.card,
                },
                historyChipText: { color: colors.foreground, fontSize: 12 },
                historyChipRow: { flexDirection: "row", flexWrap: "wrap" },
            }),
        [colors]
    )

    // Shared Markdown rule styles. `react-native-markdown-display` colors elements via this `rules`-like map; we
    // map each tag to a themed RN style so light/dark mode stay consistent with the rest of the app.
    const markdownStyles = useMemo(
        () => ({
            body: { color: colors.foreground, fontSize: 15, lineHeight: 22 },
            heading1: { color: colors.foreground, fontWeight: "700" as const, fontSize: 20, marginTop: 10, marginBottom: 6 },
            heading2: { color: colors.foreground, fontWeight: "700" as const, fontSize: 17, marginTop: 10, marginBottom: 6 },
            heading3: { color: colors.foreground, fontWeight: "600" as const, fontSize: 15, marginTop: 8, marginBottom: 4 },
            strong: { color: colors.foreground, fontWeight: "700" as const },
            em: { color: colors.foreground, fontStyle: "italic" as const },
            paragraph: { color: colors.foreground, marginTop: 0, marginBottom: 8 },
            bullet_list: { color: colors.foreground },
            ordered_list: { color: colors.foreground },
            list_item: { color: colors.foreground },
            code_inline: {
                color: colors.foreground,
                backgroundColor: colors.muted,
                borderRadius: 4,
                paddingHorizontal: 4,
                fontFamily: "monospace" as const,
            },
            code_block: {
                color: colors.foreground,
                backgroundColor: colors.muted,
                borderRadius: 6,
                padding: 8,
                fontFamily: "monospace" as const,
            },
            fence: {
                color: colors.foreground,
                backgroundColor: colors.muted,
                borderRadius: 6,
                padding: 8,
                fontFamily: "monospace" as const,
            },
            blockquote: {
                color: colors.mutedForeground,
                backgroundColor: colors.muted,
                borderLeftColor: colors.border,
                borderLeftWidth: 3,
                paddingLeft: 8,
                paddingVertical: 4,
                marginVertical: 4,
            },
            hr: { backgroundColor: colors.border, height: 1, marginVertical: 8 },
            link: { color: colors.primary, textDecorationLine: "underline" as const },
            table: { borderColor: colors.border, borderWidth: 1, borderRadius: 4, marginVertical: 6 },
            thead: { backgroundColor: colors.muted },
            th: { color: colors.foreground, fontWeight: "700" as const, padding: 6 },
            td: { color: colors.foreground, padding: 6 },
        }),
        [colors]
    )

    return (
        <View style={styles.root}>
            <PageHeader title="Ask the Docs" />
            <Text style={styles.disclaimer}>Answers are grounded in README.md, HOW_IT_WORKS.md, and in-app option descriptions. Fully offline.</Text>

            <View style={styles.inputColumn}>
                <TextInput
                    style={styles.input}
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Ask a question about the app..."
                    placeholderTextColor={colors.mutedForeground}
                    multiline
                    textAlignVertical="top"
                    editable={!isSearching}
                />
                <CustomButton variant="primary" onPress={handleSearch} isLoading={isSearching} disabled={isSearching || query.trim().length === 0}>
                    Ask
                </CustomButton>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
                {history.length > 0 && (
                    <>
                        <View style={styles.historyHeaderRow}>
                            <Text style={styles.historyTitle}>Recent questions</Text>
                            <Pressable onPress={handleClearHistory}>
                                <Text style={styles.historyClear}>Clear</Text>
                            </Pressable>
                        </View>
                        <View style={styles.historyChipRow}>
                            {history.map((q) => (
                                <Pressable key={q} style={styles.historyChip} onPress={() => handleHistoryTap(q)}>
                                    <Text style={styles.historyChipText} numberOfLines={1}>
                                        {q}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>
                    </>
                )}

                {result && (
                    <>
                        <View style={styles.answerCard}>
                            <Markdown style={markdownStyles as any}>{result.answer}</Markdown>
                            {modeLabel && <Text style={styles.modeLabel}>{modeLabel}</Text>}
                        </View>
                        {result.citations.length > 0 && <Text style={styles.sectionLabel}>Sources</Text>}
                        {result.citations.map((r) => (
                            <View key={r.id} style={styles.resultCard}>
                                <Text style={styles.resultHeading}>{r.heading}</Text>
                                <Text style={styles.resultMeta}>
                                    {r.source} · similarity {(r.score * 100).toFixed(0)}%
                                </Text>
                                <Markdown style={markdownStyles as any}>{r.text}</Markdown>
                            </View>
                        ))}
                    </>
                )}
                {searched && !isSearching && !result && <Text style={styles.emptyText}>No matching documentation found.</Text>}
            </ScrollView>
        </View>
    )
}

export default Chat
