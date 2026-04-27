import { NativeModules } from "react-native"
import { databaseManager } from "../database"

/** SQLite location of the user's selected active model filename (set from LLM Settings). */
export const ACTIVE_MODEL_SETTING = { category: "chat", key: "activeModelFilename" } as const

export interface DownloadedModel {
    filename: string
    path: string
    sizeBytes: number
    lastModifiedMillis: number
}

export interface ResolvedModel {
    filename: string
    path: string
}

/**
 * Resolve which downloaded GGUF model the chat pipeline should use. Honors the user's selection from LLM
 * Settings; falls back to the most recently modified model when no explicit selection is set. Returns null when
 * no models are present or the bridge call fails.
 */
export async function resolveActiveModel(): Promise<ResolvedModel | null> {
    try {
        const models: DownloadedModel[] = await NativeModules.LLMChatModule.listModels()
        if (!models || models.length === 0) return null
        const active = await databaseManager.loadSetting(ACTIVE_MODEL_SETTING.category, ACTIVE_MODEL_SETTING.key)
        if (typeof active === "string" && active.length > 0) {
            const matched = models.find((m) => m.filename === active)
            if (matched) return { filename: matched.filename, path: matched.path }
        }
        const fallback = models[0]
        return { filename: fallback.filename, path: fallback.path }
    } catch {
        return null
    }
}
