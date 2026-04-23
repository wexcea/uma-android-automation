package com.steve1316.uma_android_automation.llm

/**
 * Abstraction over the two on-device LLM inference paths: MediaPipe GenAI (universal fallback) and Gemini Nano via
 * ML Kit Prompt API (flagship accelerator). [ChatOrchestrator] picks the first service whose [isAvailable] returns
 * true, falling back to MediaPipe when Nano is unavailable.
 */
interface LLMService : AutoCloseable {
    /**
     * Whether this service can currently serve requests — the underlying runtime is loaded, the model is present
     * on-device, and (for Nano) the AICore system component reports READY.
     *
     * @return true if [generate] will succeed without needing download or setup.
     */
    suspend fun isAvailable(): Boolean

    /**
     * Run a single prompt through the model.
     *
     * @param prompt The full prompt (system + context + user question) to feed the model.
     * @param maxTokens Maximum new tokens to produce.
     * @param temperature Sampling temperature; low values (≤0.3) are strongly preferred for grounded Q&A.
     * @return The decoded response text, or null on any failure (check logs for the underlying error).
     */
    suspend fun generate(prompt: String, maxTokens: Int = 256, temperature: Float = 0.2f): String?
}
