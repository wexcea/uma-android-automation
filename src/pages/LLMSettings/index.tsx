import { useCallback, useEffect, useMemo, useState } from "react"
import { View, ScrollView, StyleSheet, Text, TextInput, NativeModules, NativeEventEmitter, Alert, Linking, Pressable } from "react-native"
import { useTheme } from "../../context/ThemeContext"
import CustomButton from "../../components/CustomButton"
import PageHeader from "../../components/PageHeader"
import WarningContainer from "../../components/WarningContainer"
import InfoContainer from "../../components/InfoContainer"
import { databaseManager } from "../../lib/database"

const MODEL_URL_SETTING = { category: "chat", key: "modelUrl" } as const
/**
 * Hugging Face access token persistence key. Lives under the "chat" category, not BotStateContext, so it is
 * NOT included in settings exports — a token is a user-specific secret and must never leak into a shared JSON.
 */
const HF_TOKEN_SETTING = { category: "chat", key: "hfToken" } as const
const ACTIVE_MODEL_SETTING = { category: "chat", key: "activeModelFilename" } as const

/** Known LiteRT community `.task` models sorted by ascending size. All are HF-gated; requires a Read token. */
const MODEL_PRESETS: Array<{ label: string; detail: string; url: string }> = [
    {
        label: "Gemma 3 1B (~530 MB, fast, weak summaries)",
        detail: "Smallest option. Runs on almost any phone, but paraphrasing quality is limited.",
        url: "https://huggingface.co/litert-community/Gemma3-1B-IT/resolve/main/Gemma3-1B-IT_multi-prefill-seq_q4_ekv2048.task",
    },
    {
        label: "Gemma 3n E2B (~1.5 GB, balanced)",
        detail: "Purpose-built for on-device, much better summarization than 1B. Needs ~4 GB free RAM.",
        url: "https://huggingface.co/google/gemma-3n-E2B-it-litert-preview/resolve/main/gemma-3n-E2B-it-int4.task",
    },
    {
        label: "Gemma 3 4B (~2.8 GB, best quality, slow)",
        detail: "Full summary-quality answers. Needs ~6 GB total RAM. Slow on non-flagship phones.",
        url: "https://huggingface.co/litert-community/Gemma3-4B-IT/resolve/main/Gemma3-4B-IT_multi-prefill-seq_q4_ekv2048.task",
    },
]

const DEFAULT_MODEL_URL = MODEL_PRESETS[0].url

interface ServiceStatus {
    mediaPipeDownloaded: boolean
    mediaPipeSizeBytes: number
    activeService: string
}

interface DownloadState {
    status: "pending" | "running" | "paused" | "complete" | "failed" | "error"
    bytesDownloaded: number
    bytesTotal: number
    error?: string
}

interface DownloadedModel {
    filename: string
    sizeBytes: number
    lastModifiedMillis: number
}

/**
 * LLM Settings page.
 *
 * Manages the on-device documentation chatbot's generative model: download/cancel/delete MediaPipe `.task` files
 * and pick which downloaded model is active. Retrieve-only search is always available regardless of what happens here.
 */
const LLMSettings = () => {
    const { colors } = useTheme()
    const [status, setStatus] = useState<ServiceStatus | null>(null)
    const [downloadState, setDownloadState] = useState<DownloadState | null>(null)
    const [hfToken, setHfToken] = useState("")
    const [modelUrl, setModelUrl] = useState(DEFAULT_MODEL_URL)
    const [downloadedModels, setDownloadedModels] = useState<DownloadedModel[]>([])
    const [activeModelFilename, setActiveModelFilename] = useState<string | null>(null)

    const refreshStatus = useCallback(async () => {
        try {
            const s: ServiceStatus = await NativeModules.LLMChatModule.getServiceStatus()
            setStatus(s)
        } catch {
            setStatus(null)
        }
    }, [])

    const refreshModels = useCallback(async () => {
        try {
            const list: DownloadedModel[] = await NativeModules.LLMChatModule.listModels()
            setDownloadedModels(list)
        } catch {
            setDownloadedModels([])
        }
    }, [])

    // Load persisted model URL + HF token + active model selection on mount. Token lives outside BotStateContext so
    // it is never exported.
    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const [url, token, active] = await Promise.all([
                    databaseManager.loadSetting(MODEL_URL_SETTING.category, MODEL_URL_SETTING.key),
                    databaseManager.loadSetting(HF_TOKEN_SETTING.category, HF_TOKEN_SETTING.key),
                    databaseManager.loadSetting(ACTIVE_MODEL_SETTING.category, ACTIVE_MODEL_SETTING.key),
                ])
                if (cancelled) return
                if (typeof url === "string" && url.length > 0) setModelUrl(url)
                if (typeof token === "string" && token.length > 0) setHfToken(token)
                if (typeof active === "string" && active.length > 0) {
                    setActiveModelFilename(active)
                    NativeModules.LLMChatModule.setActiveModel(active)
                }
            } catch {
                // First run or DB not initialized — keep defaults.
            }
            refreshModels()
        })()
        return () => {
            cancelled = true
        }
    }, [refreshModels])

    const handleSelectActiveModel = useCallback(
        (filename: string) => {
            setActiveModelFilename(filename)
            NativeModules.LLMChatModule.setActiveModel(filename)
            databaseManager.saveSetting(ACTIVE_MODEL_SETTING.category, ACTIVE_MODEL_SETTING.key, filename, true).catch(() => undefined)
            refreshStatus()
        },
        [refreshStatus]
    )

    const handleDeleteModelFile = useCallback(
        (filename: string) => {
            Alert.alert("Delete this model?", `Removes ${filename} (~${(downloadedModels.find((m) => m.filename === filename)?.sizeBytes ?? 0) / 1024 / 1024 | 0} MB) from disk.`, [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        await NativeModules.LLMChatModule.deleteModelFile(filename)
                        if (activeModelFilename === filename) {
                            setActiveModelFilename(null)
                            NativeModules.LLMChatModule.setActiveModel("")
                            databaseManager.saveSetting(ACTIVE_MODEL_SETTING.category, ACTIVE_MODEL_SETTING.key, "", true).catch(() => undefined)
                        }
                        await refreshModels()
                        await refreshStatus()
                    },
                },
            ])
        },
        [activeModelFilename, downloadedModels, refreshModels, refreshStatus]
    )

    const persistHfToken = useCallback((value: string) => {
        setHfToken(value)
        databaseManager.saveSetting(HF_TOKEN_SETTING.category, HF_TOKEN_SETTING.key, value, true).catch(() => undefined)
    }, [])

    const persistModelUrl = useCallback((url: string) => {
        setModelUrl(url)
        databaseManager.saveSetting(MODEL_URL_SETTING.category, MODEL_URL_SETTING.key, url, true).catch(() => undefined)
    }, [])


    useEffect(() => {
        refreshStatus()
        const emitter = new NativeEventEmitter(NativeModules.LLMChatModule)
        const sub = emitter.addListener("LLMChatModule.DownloadState", (state: DownloadState) => {
            setDownloadState(state)
            if (state.status === "complete" || state.status === "failed" || state.status === "error") {
                refreshStatus()
                refreshModels()
            }
        })
        return () => sub.remove()
    }, [refreshStatus, refreshModels])

    const handleDownload = useCallback(() => {
        Alert.alert(
            "Download chat model?",
            "This downloads ~530 MB over Wi-Fi. The Gemma 3 1B model is gated on Hugging Face — you must accept Google's Gemma license on the model page and paste a read-access token below before downloading.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Download",
                    onPress: async () => {
                        try {
                            NativeModules.LLMChatModule.setAuthToken(hfToken.trim())
                            await NativeModules.LLMChatModule.downloadModel(modelUrl.trim() || DEFAULT_MODEL_URL)
                        } catch (e: any) {
                            Alert.alert("Download failed to start", e?.message ?? "Unknown error")
                        }
                    },
                },
            ]
        )
    }, [hfToken])

    const handleCancel = useCallback(async () => {
        await NativeModules.LLMChatModule.cancelDownload()
        setDownloadState(null)
    }, [])

    const handleDelete = useCallback(() => {
        Alert.alert("Delete chat model?", "This frees ~530 MB. You can re-download it later.", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete",
                style: "destructive",
                onPress: async () => {
                    await NativeModules.LLMChatModule.deleteModel()
                    await refreshStatus()
                },
            },
        ])
    }, [refreshStatus])

    const isDownloading = downloadState?.status === "running" || downloadState?.status === "pending" || downloadState?.status === "paused"

    const progressText = useMemo(() => {
        if (!downloadState) return null
        if (downloadState.status === "complete") return "Download complete."
        if (downloadState.status === "failed" || downloadState.status === "error") return `Download failed${downloadState.error ? ` (${downloadState.error})` : ""}.`
        const total = downloadState.bytesTotal
        const done = downloadState.bytesDownloaded
        if (total > 0) {
            const pct = Math.round((done / total) * 100)
            return `Downloading: ${pct}% (${(done / 1024 / 1024).toFixed(1)} / ${(total / 1024 / 1024).toFixed(1)} MB)`
        }
        return "Preparing download..."
    }, [downloadState])

    const styles = useMemo(
        () =>
            StyleSheet.create({
                root: { flex: 1, margin: 10, backgroundColor: colors.background },
                section: { marginTop: 14 },
                sectionLabel: { fontSize: 13, fontWeight: "600", color: colors.foreground, marginBottom: 6 },
                statusRow: { color: colors.foreground, marginBottom: 4 },
                hint: { fontSize: 11, color: colors.mutedForeground, marginTop: 4 },
                linkRowContainer: { flexDirection: "row" as const, gap: 16, marginTop: 4 },
                linkRow: { paddingVertical: 10 },
                link: { fontSize: 14, color: colors.primary, textDecorationLine: "underline" as const },
                tokenInput: {
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 6,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    color: colors.foreground,
                    backgroundColor: colors.card,
                    marginTop: 6,
                },
                presetCard: {
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 6,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    marginTop: 6,
                    backgroundColor: colors.card,
                },
                presetCardSelected: { borderColor: colors.primary, borderWidth: 2 },
                presetLabel: { color: colors.foreground, fontSize: 13, fontWeight: "600" },
                presetDetail: { color: colors.mutedForeground, fontSize: 11, marginTop: 2 },
                modelRow: {
                    flexDirection: "row" as const,
                    alignItems: "center" as const,
                    justifyContent: "space-between" as const,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 6,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    marginTop: 6,
                    backgroundColor: colors.card,
                },
                modelRowActive: { borderColor: colors.primary, borderWidth: 2 },
                modelInfo: { flex: 1, marginRight: 8 },
                modelFilename: { color: colors.foreground, fontSize: 13, fontWeight: "600" as const },
                modelMeta: { color: colors.mutedForeground, fontSize: 11, marginTop: 2 },
                modelActions: { flexDirection: "row" as const, gap: 6 },
                modelActionButton: {
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 4,
                    borderWidth: 1,
                    borderColor: colors.border,
                },
                modelActionText: { color: colors.foreground, fontSize: 12 },
                modelActionActiveText: { color: colors.primary, fontSize: 12, fontWeight: "600" as const },
                buttonRow: { flexDirection: "row", gap: 8, marginTop: 8 },
            }),
        [colors]
    )

    return (
        <View style={styles.root}>
            <PageHeader title="LLM Settings" />
            <ScrollView>
                <InfoContainer>Retrieve-only search always works. The options below add optional natural-language answers backed by an on-device model.</InfoContainer>

                <View style={styles.section}>
                    <Text style={styles.sectionLabel}>MediaPipe Chat Model</Text>
                    <Text style={styles.statusRow}>
                        {downloadedModels.length > 0
                            ? `${downloadedModels.length} model${downloadedModels.length === 1 ? "" : "s"} downloaded · active: ${activeModelFilename ?? downloadedModels[0].filename}`
                            : "Not downloaded"}
                    </Text>
                    <>
                        <Text style={styles.hint}>
                            All models are gated on Hugging Face. Accept the license on the model's page, then create a read-access token and paste it below. Bigger models summarize better but
                            need more RAM and download time.
                        </Text>
                            {MODEL_PRESETS.map((p) => {
                                const selected = modelUrl === p.url
                                return (
                                    <Pressable key={p.url} style={[styles.presetCard, selected && styles.presetCardSelected]} onPress={() => persistModelUrl(p.url)}>
                                        <Text style={styles.presetLabel}>{p.label}</Text>
                                        <Text style={styles.presetDetail}>{p.detail}</Text>
                                    </Pressable>
                                )
                            })}
                            <View style={styles.linkRowContainer}>
                                <Pressable style={styles.linkRow} onPress={() => Linking.openURL(modelUrl.replace(/\/resolve\/main\/.*$/, ""))}>
                                    <Text style={styles.link}>Open selected model page</Text>
                                </Pressable>
                                <Pressable style={styles.linkRow} onPress={() => Linking.openURL("https://huggingface.co/settings/tokens")}>
                                    <Text style={styles.link}>Create token</Text>
                                </Pressable>
                            </View>
                            <TextInput
                                style={styles.tokenInput}
                                value={hfToken}
                                onChangeText={persistHfToken}
                                placeholder="hf_... (Hugging Face read token)"
                                placeholderTextColor={colors.mutedForeground}
                                autoCapitalize="none"
                                autoCorrect={false}
                                secureTextEntry
                            />
                            <TextInput
                                style={styles.tokenInput}
                                value={modelUrl}
                                onChangeText={persistModelUrl}
                                placeholder="Model .task URL"
                                placeholderTextColor={colors.mutedForeground}
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                    </>
                    {progressText && <Text style={styles.hint}>{progressText}</Text>}
                    <View style={styles.buttonRow}>
                        {!isDownloading && (
                            <CustomButton variant="primary" onPress={handleDownload}>
                                {downloadedModels.length > 0 ? "Download another model" : "Download"}
                            </CustomButton>
                        )}
                        {isDownloading && (
                            <CustomButton variant="destructive" onPress={handleCancel}>
                                Cancel
                            </CustomButton>
                        )}
                    </View>
                </View>

                {downloadedModels.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>Downloaded Models</Text>
                        <Text style={styles.hint}>Tap Use to switch the active chat model. Keep multiple variants so you can A/B without re-downloading.</Text>
                        {downloadedModels.map((m) => {
                            const isActive = (activeModelFilename ?? downloadedModels[0]?.filename) === m.filename
                            return (
                                <View key={m.filename} style={[styles.modelRow, isActive && styles.modelRowActive]}>
                                    <View style={styles.modelInfo}>
                                        <Text style={styles.modelFilename} numberOfLines={1}>
                                            {m.filename}
                                        </Text>
                                        <Text style={styles.modelMeta}>{(m.sizeBytes / 1024 / 1024).toFixed(0)} MB</Text>
                                    </View>
                                    <View style={styles.modelActions}>
                                        {isActive ? (
                                            <View style={styles.modelActionButton}>
                                                <Text style={styles.modelActionActiveText}>Active</Text>
                                            </View>
                                        ) : (
                                            <Pressable style={styles.modelActionButton} onPress={() => handleSelectActiveModel(m.filename)}>
                                                <Text style={styles.modelActionText}>Use</Text>
                                            </Pressable>
                                        )}
                                        <Pressable style={styles.modelActionButton} onPress={() => handleDeleteModelFile(m.filename)}>
                                            <Text style={styles.modelActionText}>Delete</Text>
                                        </Pressable>
                                    </View>
                                </View>
                            )
                        })}
                    </View>
                )}

                <View style={styles.section}>
                    <Text style={styles.sectionLabel}>Active Path</Text>
                    <Text style={styles.statusRow}>{status?.activeService ?? "loading..."}</Text>
                </View>

                <WarningContainer>Generated answers may occasionally be wrong or phrased imprecisely. A verifier guards against clear hallucinations by falling back to showing the source text verbatim, but always cross-check important answers against the full docs.</WarningContainer>
            </ScrollView>
        </View>
    )
}

export default LLMSettings
