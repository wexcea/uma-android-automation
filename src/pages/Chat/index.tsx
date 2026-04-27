import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { View, ScrollView, StyleSheet, TextInput, Text, NativeModules, Pressable } from "react-native"
import { useMarkdown, type MarkedStyles } from "react-native-marked"
import type { UserTheme } from "react-native-marked/dist/typescript/theme/types"
import { KotlinCode, DARK_PALETTE, LIGHT_PALETTE } from "../../lib/llm/kotlinHighlight"
import { useTheme } from "../../context/ThemeContext"
import CustomButton from "../../components/CustomButton"
import PageHeader from "../../components/PageHeader"
import { databaseManager } from "../../lib/database"
import * as llamaRunner from "../../lib/chat/llamaRunner"
import * as verifier from "../../lib/chat/groundingVerifier"
import { loadChatTuning, trimToCap, type ChatTuning } from "../../lib/chat/chatSettings"

const HISTORY_CATEGORY = "chat"
const HISTORY_KEY = "questionHistory"
const HISTORY_MAX = 20
const ACTIVE_MODEL_KEY = { category: "chat", key: "activeModelFilename" } as const
const TOP_K = 4

type CitationKind = "doc" | "code"
interface DocResult {
    id: string
    source: string
    heading: string
    text: string
    score: number
    expandedText: string
    kind: CitationKind
}

interface DownloadedModel {
    filename: string
    path: string
    sizeBytes: number
    lastModifiedMillis: number
}

type ChatMode = "generated" | "retrieveOnly" | "verifierFallback"

interface ChatResult {
    answer: string
    mode: ChatMode
    overlap?: number
    rejectedAnswer?: string
    citations: DocResult[]
    stats?: llamaRunner.ChatStats | null
}

const SYSTEM_INSTRUCTIONS =
    "You are a friendly documentation guide for an Android automation app. The excerpts may include user-facing documentation (markdown) or Kotlin source code from the implementation; explain functionality drawn from the code in plain language rather than echoing the code back. Using only the excerpts provided in this conversation, write a detailed, well-structured explanation that answers the user's question.\n\n" +
    "Rules:\n" +
    "- Paraphrase in your own words. Do NOT copy sentences verbatim from the excerpts.\n" +
    "- Aim for 4–10 sentences depending on how much the excerpts cover. Use multiple short paragraphs and bullet lists where they aid clarity.\n" +
    "- Do NOT prefix output with \"Answer:\" or repeat the question.\n" +
    "- Only use facts that appear in the excerpts. Do not invent features, numbers, button names, or behavior.\n" +
    '- If the excerpts do not answer the question, reply with exactly: NOT_IN_DOCS'

const Chat = () => {
    const { colors, isDark } = useTheme()
    const [query, setQuery] = useState("")
    const [result, setResult] = useState<ChatResult | null>(null)
    const [partialAnswer, setPartialAnswer] = useState("")
    const [streamingTokens, setStreamingTokens] = useState(0)
    const [streamingTokensPerSec, setStreamingTokensPerSec] = useState(0)
    const [isSearching, setIsSearching] = useState(false)
    const [searched, setSearched] = useState(false)
    const [history, setHistory] = useState<string[]>([])
    const [tuning, setTuning] = useState<ChatTuning | null>(null)

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const stored = await databaseManager.loadSetting(HISTORY_CATEGORY, HISTORY_KEY)
                if (!cancelled && Array.isArray(stored)) setHistory(stored.filter((x): x is string => typeof x === "string"))
            } catch {}
            try {
                const t = await loadChatTuning()
                if (!cancelled) setTuning(t)
            } catch {}
        })()
        return () => {
            cancelled = true
        }
    }, [])

    const handleSearch = useCallback(async () => {
        const q = query.trim()
        if (!q || !tuning) return
        setIsSearching(true)
        setSearched(true)
        setPartialAnswer("")
        setStreamingTokens(0)
        setStreamingTokensPerSec(0)
        setResult(null)
        // Prepend to history, dedupe, cap.
        setHistory((prev) => {
            const next = [q, ...prev.filter((x) => x !== q)].slice(0, HISTORY_MAX)
            databaseManager.saveSetting(HISTORY_CATEGORY, HISTORY_KEY, next, true).catch(() => undefined)
            return next
        })

        try {
            const citations = (await NativeModules.LLMChatModule.searchDocs(q, TOP_K)) as DocResult[]
            console.log("[Chat] retrieval:", citations.length, "chunks", citations.map((c) => `${c.source}#${c.id} (${(c.score * 100).toFixed(0)}%)`))

            if (citations.length === 0) {
                setResult({ answer: "No matching documentation found.", mode: "retrieveOnly", citations: [] })
                return
            }

            // Pick a downloaded GGUF model. If none, retrieve-only fallback.
            const modelPath = await pickModelPath()
            if (!modelPath) {
                setResult({ answer: citations[0].expandedText, mode: "retrieveOnly", citations })
                return
            }

            await llamaRunner.ensureContext(modelPath, { nCtx: tuning.modelContextWindow })

            // Build prompt: system instructions + per-citation excerpts in the system message; question in the user message.
            const trimmed = citations.map((c) => trimToCap(c.expandedText, tuning.llmCitationCharCap))
            const contextBlock = trimmed.join("\n\n---\n\n")
            const messages = [
                { role: "system" as const, content: `${SYSTEM_INSTRUCTIONS}\n\nExcerpts (separated by ---):\n\n${contextBlock}` },
                { role: "user" as const, content: q },
            ]

            let tokenCount = 0
            let firstTokenMs = 0
            const completion = await llamaRunner.chat(
                {
                    messages,
                    maxTokens: tuning.maxOutputTokens,
                    temperature: 0.35,
                },
                (tok) => {
                    setPartialAnswer((prev) => prev + tok)
                    tokenCount += 1
                    if (firstTokenMs === 0) firstTokenMs = Date.now()
                    const elapsedSec = (Date.now() - firstTokenMs) / 1000
                    setStreamingTokens(tokenCount)
                    if (elapsedSec > 0.25) setStreamingTokensPerSec(tokenCount / elapsedSec)
                }
            )
            const generated = completion.text.trim()
            const stats = completion.stats
            if (stats) {
                console.log(
                    `[Chat] generation: ${stats.tokensPredicted} tok in ${(stats.predictedMs / 1000).toFixed(2)}s ` +
                        `= ${stats.predictedPerSecond.toFixed(2)} tok/s (prefill ${stats.tokensEvaluated} tok @ ${stats.promptPerSecond.toFixed(2)} tok/s)`
                )
            }

            if (!generated || generated.toUpperCase() === "NOT_IN_DOCS") {
                setResult({ answer: citations[0].expandedText, mode: "retrieveOnly", citations })
                return
            }

            const overlap = verifier.overlap(generated, trimmed)
            console.log("[Chat] verifier overlap:", overlap.toFixed(3))
            if (overlap >= verifier.SUMMARY_THRESHOLD) {
                setResult({ answer: generated, mode: "generated", overlap, citations, stats })
            } else {
                setResult({
                    answer: citations[0].expandedText,
                    mode: "verifierFallback",
                    overlap,
                    rejectedAnswer: generated,
                    citations,
                    stats,
                })
            }
        } catch (err) {
            console.log("[Chat] error:", err)
            setResult(null)
        } finally {
            setIsSearching(false)
            setPartialAnswer("")
        }
    }, [query, tuning])

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
                return `Generated · grounding ${Math.round((result.overlap ?? 0) * 100)}%`
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
                sectionLabel: { fontSize: 15, fontWeight: "600", color: colors.foreground, marginTop: 10, marginBottom: 6 },
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
                codeBlock: {
                    fontFamily: "monospace",
                    fontSize: 12,
                    color: colors.foreground,
                    backgroundColor: colors.muted,
                    borderRadius: 6,
                    padding: 8,
                },
                emptyText: { color: colors.mutedForeground, textAlign: "center", marginTop: 20, paddingHorizontal: 20 },
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
                streamingNotice: { fontSize: 11, color: colors.mutedForeground, marginBottom: 4, fontStyle: "italic" },
            }),
        [colors]
    )

    const markedTheme = useMemo<UserTheme>(
        () => ({
            colors: {
                text: colors.foreground,
                code: colors.foreground,
                link: colors.primary,
                border: colors.border,
            },
        }),
        [colors]
    )

    const markedStyles = useMemo<MarkedStyles>(
        () => ({
            text: { color: colors.foreground, fontSize: 15, lineHeight: 22 },
            paragraph: { marginTop: 0, marginBottom: 8, paddingHorizontal: 0 },
            strong: { color: colors.foreground, fontWeight: "700" },
            em: { color: colors.foreground, fontStyle: "italic" },
            link: { color: colors.primary, textDecorationLine: "underline" },
            h1: { color: colors.foreground, fontWeight: "700", fontSize: 20, marginTop: 10, marginBottom: 6 },
            h2: { color: colors.foreground, fontWeight: "700", fontSize: 17, marginTop: 10, marginBottom: 6 },
            h3: { color: colors.foreground, fontWeight: "600", fontSize: 15, marginTop: 8, marginBottom: 4 },
            h4: { color: colors.foreground, fontWeight: "600", fontSize: 14, marginTop: 6, marginBottom: 4 },
            h5: { color: colors.foreground, fontWeight: "600", fontSize: 13, marginTop: 4, marginBottom: 2 },
            h6: { color: colors.foreground, fontWeight: "600", fontSize: 13, marginTop: 4, marginBottom: 2 },
            codespan: { color: colors.foreground, backgroundColor: colors.muted, borderRadius: 4, paddingHorizontal: 4, fontFamily: "monospace" },
            code: { backgroundColor: colors.muted, borderRadius: 6, padding: 8, marginVertical: 4 },
            blockquote: {
                backgroundColor: colors.muted,
                borderLeftColor: colors.border,
                borderLeftWidth: 3,
                paddingLeft: 8,
                paddingVertical: 4,
                marginVertical: 4,
            },
            list: { marginBottom: 8 },
            li: { color: colors.foreground, fontSize: 15, lineHeight: 22 },
            hr: { backgroundColor: colors.border, height: 1, marginVertical: 8 },
            table: { borderColor: colors.border, borderWidth: 1, borderRadius: 4, marginVertical: 6 },
            tableRow: { borderColor: colors.border },
            tableCell: { padding: 6 },
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
                <CustomButton variant="primary" onPress={handleSearch} isLoading={isSearching} disabled={isSearching || query.trim().length === 0 || !tuning}>
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

                {isSearching && partialAnswer.length > 0 && (
                    <View style={styles.answerCard}>
                        <Text style={styles.streamingNotice}>
                            Generating… {streamingTokens} tok{streamingTokensPerSec > 0 ? ` · ${streamingTokensPerSec.toFixed(1)} tok/s` : ""}
                        </Text>
                        <MarkdownView theme={markedTheme} mdStyles={markedStyles}>
                            {partialAnswer}
                        </MarkdownView>
                    </View>
                )}

                {result && (
                    <>
                        <View style={styles.answerCard}>
                            <MarkdownView theme={markedTheme} mdStyles={markedStyles}>
                                {result.answer}
                            </MarkdownView>
                            {modeLabel && <Text style={styles.modeLabel}>{modeLabel}</Text>}
                            {result.stats && (
                                <Text style={styles.modeLabel}>
                                    {`${result.stats.tokensPredicted} tok in ${(result.stats.predictedMs / 1000).toFixed(2)}s · ${result.stats.predictedPerSecond.toFixed(2)} tok/s · prefill ${result.stats.tokensEvaluated} tok @ ${result.stats.promptPerSecond.toFixed(2)} tok/s`}
                                </Text>
                            )}
                        </View>
                        {result.citations.length > 0 && <Text style={styles.sectionLabel}>Sources</Text>}
                        {result.citations.map((r) => (
                            <View key={r.id} style={styles.resultCard}>
                                <Text style={styles.resultHeading}>{citationHeading(r)}</Text>
                                <Text style={styles.resultMeta}>
                                    {`${r.source} · similarity ${(r.score * 100).toFixed(0)}%`}
                                </Text>
                                {r.kind === "code" ? (
                                    <View style={styles.codeBlock}>
                                        <KotlinCode text={r.text} palette={isDark ? DARK_PALETTE : LIGHT_PALETTE} style={{ fontSize: 10, lineHeight: 18 }} />
                                    </View>
                                ) : (
                                    <MarkdownView theme={markedTheme} mdStyles={markedStyles}>
                                        {r.text}
                                    </MarkdownView>
                                )}
                            </View>
                        ))}
                    </>
                )}
                {searched && !isSearching && !result && <Text style={styles.emptyText}>No matching documentation found.</Text>}
            </ScrollView>
        </View>
    )
}

/**
 * Resolve which downloaded GGUF model to feed to llama.rn. Honors the user's "Active" selection from LLM Settings;
 * falls back to the most recently modified model if no explicit selection is set.
 */
/** Code citations show as `Racing.kt::findSuitableRace`; doc citations keep their hierarchical heading. */
/** Replace markdown list lines with plain prose lines using a unicode bullet ("• ") for unordered items and an
 *  escaped digit ("1\. ") for ordered ones, so marked won't reparse them as lists. Each line gets a trailing
 *  hard-break (two spaces) so consecutive items become separate visual lines inside one paragraph instead of
 *  being collapsed by markdown's whitespace folding. Avoids the entire RN flex-marker layout class of bugs at
 *  the cost of nested-block-content inside list items, which the chatbot rarely produces. */
function flattenLists(md: string): string {
    return md
        .split("\n")
        .map((line) => {
            const u = line.match(/^(\s*)[-*+]\s+(.*)$/)
            if (u) return `${u[1]}• ${u[2]}  `
            const o = line.match(/^(\s*)(\d+)\.\s+(.*)$/)
            if (o) return `${o[1]}${o[2]}\\. ${o[3]}  `
            return line
        })
        .join("\n")
}

function MarkdownView({ children, theme, mdStyles }: { children: string; theme: UserTheme; mdStyles: MarkedStyles }) {
    const flattened = useMemo(() => flattenLists(children), [children])
    const elements = useMarkdown(flattened, { theme, styles: mdStyles })
    return (
        <View>
            {elements.map((el, i) => (
                <Fragment key={i}>{el}</Fragment>
            ))}
        </View>
    )
}

function citationHeading(r: DocResult): string {
    if (r.kind !== "code") return r.heading
    const lastSep = r.heading.lastIndexOf(" › ")
    const member = lastSep >= 0 ? r.heading.slice(lastSep + 3) : r.heading
    return `${r.source}::${member}`
}

async function pickModelPath(): Promise<string | null> {
    try {
        const models: DownloadedModel[] = await NativeModules.LLMChatModule.listModels()
        if (!models || models.length === 0) return null
        const active = await databaseManager.loadSetting(ACTIVE_MODEL_KEY.category, ACTIVE_MODEL_KEY.key)
        if (typeof active === "string" && active.length > 0) {
            const matched = models.find((m) => m.filename === active)
            if (matched) return matched.path
        }
        return models[0].path
    } catch {
        return null
    }
}

export default Chat
