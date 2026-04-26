import { initLlama, LlamaContext } from "llama.rn"

/**
 * Singleton wrapper around llama.rn's `initLlama` + `context.completion` for the on-device chatbot.
 *
 * Holds one [LlamaContext] across queries — reloading the GGUF + warming up the KV cache costs seconds, so the
 * second prompt onward should be much faster than the first.
 *
 * Usage:
 * ```
 * await llamaRunner.ensureContext("/path/to/model.gguf", { nCtx: 4096 })
 * const text = await llamaRunner.chat({
 *     messages: [{ role: "system", content: "..." }, { role: "user", content: "..." }],
 *     maxTokens: 768, temperature: 0.35,
 * }, (token) => setPartialAnswer(prev => prev + token))
 * ```
 */

export interface LoadOptions {
    /** KV-cache size (input + output tokens combined). Default 4096. */
    nCtx?: number
    /** GPU layers to offload. Default 0 (CPU-only) for max device compatibility. */
    nGpuLayers?: number
    /** Pin context in RAM. Default true on Android to avoid OOM swap during long generations. */
    useMlock?: boolean
}

export interface ChatMessage {
    role: "system" | "user" | "assistant"
    content: string
}

export interface ChatOptions {
    messages: ChatMessage[]
    maxTokens?: number
    temperature?: number
    topK?: number
    topP?: number
    /** Strings that, when emitted, halt generation. Defaults cover Gemma + Qwen + Llama EOS markers. */
    stop?: string[]
}

let currentContext: LlamaContext | null = null
let currentModelPath: string | null = null
let currentLoadOpts: LoadOptions = {}
let loadInFlight: Promise<LlamaContext | null> | null = null

const DEFAULT_STOP = ["</s>", "<|im_end|>", "<|end|>", "<end_of_turn>", "<|eot_id|>"]

/**
 * Load (or reuse) a llama.rn context for [modelPath]. If a context for a different path is already loaded,
 * release it first. If [opts] differ from the cached load (notably `nCtx`), reload as well.
 *
 * @returns The loaded context, or `null` if the load failed (an error is also re-thrown to the caller via the
 *   underlying llama.rn promise rejection).
 */
export async function ensureContext(modelPath: string, opts: LoadOptions = {}): Promise<LlamaContext | null> {
    const optsMatch = optsEqual(currentLoadOpts, opts)
    if (currentContext && currentModelPath === modelPath && optsMatch) return currentContext
    if (loadInFlight) return loadInFlight

    loadInFlight = (async () => {
        // Tear down any previous context before bringing up the new one — keeping two loaded would double RAM.
        if (currentContext) {
            try {
                await currentContext.release()
            } catch {
                // Best-effort release; old context may already be in a bad state.
            }
            currentContext = null
            currentModelPath = null
        }
        try {
            const ctx = await initLlama({
                model: modelPath,
                n_ctx: opts.nCtx ?? 4096,
                n_gpu_layers: opts.nGpuLayers ?? 0,
                use_mlock: opts.useMlock ?? true,
            })
            currentContext = ctx
            currentModelPath = modelPath
            currentLoadOpts = opts
            return ctx
        } catch (e) {
            currentContext = null
            currentModelPath = null
            throw e
        } finally {
            loadInFlight = null
        }
    })()
    return loadInFlight
}

/**
 * Run [opts.messages] through the loaded context and return the final answer text.
 *
 * Streams individual tokens to [onToken] as they arrive (so the UI can render a live partial answer); the resolved
 * promise carries the full concatenated text after generation finishes.
 *
 * @throws If [ensureContext] hasn't been called or the load failed.
 */
export async function chat(opts: ChatOptions, onToken?: (token: string) => void): Promise<string> {
    const ctx = currentContext
    if (!ctx) throw new Error("llamaRunner.chat called before ensureContext")
    const result = await ctx.completion(
        {
            messages: opts.messages,
            n_predict: opts.maxTokens ?? 768,
            temperature: opts.temperature ?? 0.35,
            top_k: opts.topK ?? 40,
            top_p: opts.topP ?? 0.95,
            stop: opts.stop ?? DEFAULT_STOP,
        },
        (data: { token: string }) => {
            if (onToken && data.token) onToken(data.token)
        }
    )
    // llama.rn returns { text, ... }; fall through to empty string if unexpected shape.
    return typeof result?.text === "string" ? result.text : ""
}

/** Release the currently-loaded context, freeing RAM. Safe to call when nothing is loaded. */
export async function release(): Promise<void> {
    if (currentContext) {
        try {
            await currentContext.release()
        } catch {
            // Best-effort.
        }
    }
    currentContext = null
    currentModelPath = null
    currentLoadOpts = {}
}

/** Reports whether a context is currently loaded. Useful for the UI to disable Chat input until a model is ready. */
export function isLoaded(): boolean {
    return currentContext !== null
}

/** Path of the currently-loaded model, if any. */
export function loadedModelPath(): string | null {
    return currentModelPath
}

function optsEqual(a: LoadOptions, b: LoadOptions): boolean {
    return (a.nCtx ?? 4096) === (b.nCtx ?? 4096) && (a.nGpuLayers ?? 0) === (b.nGpuLayers ?? 0) && (a.useMlock ?? true) === (b.useMlock ?? true)
}
