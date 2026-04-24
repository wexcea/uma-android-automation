package com.steve1316.uma_android_automation.llm

import android.content.Context
import android.util.Log
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import com.google.mediapipe.tasks.genai.llminference.LlmInferenceSession
import com.google.mediapipe.tasks.genai.llminference.PromptTemplates
import com.steve1316.automation_library.data.SharedData
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/**
 * MediaPipe GenAI-backed LLM service — the universal on-device inference path.
 *
 * Loads a `.task` model file from [modelPath] (produced by Google AI Edge / LiteRT conversion) and runs prompts
 * through [LlmInference]. Used whenever the Gemini Nano service is unavailable; runs on SDK 24+ on any ARMv8 phone
 * with enough RAM (Google targets Pixel 8 / S23+ class; smaller phones work but throughput drops).
 *
 * Engine and per-prompt session are held for reuse — recreating the engine per query wastes seconds of model load.
 *
 * @property context Application context used for native asset resolution within MediaPipe.
 * @property modelPath Absolute filesystem path to the `.task` model, populated by [ModelDownloader].
 * @property maxTokens Context window hint passed to MediaPipe; bounds the combined prompt+response length.
 */
class MediaPipeLLMService(
    private val context: Context,
    private val modelPath: String,
    private val maxTokens: Int = 2048,
) : LLMService {
    @Volatile private var engine: LlmInference? = null
    private val engineLock = Any()

    companion object {
        private const val TAG = "${SharedData.loggerTag}MediaPipeLLM"
    }

    override suspend fun isAvailable(): Boolean = withContext(Dispatchers.IO) {
        if (!File(modelPath).isFile) return@withContext false
        try {
            ensureEngine() != null
        } catch (e: Throwable) {
            Log.w(TAG, "isAvailable:: engine init failed: ${e.message}")
            false
        }
    }

    override suspend fun generate(prompt: String, maxTokens: Int, temperature: Float): String? = withContext(Dispatchers.Default) {
        val engine = ensureEngine() ?: return@withContext null
        try {
            val sessionOptions = LlmInferenceSession.LlmInferenceSessionOptions.builder()
                .setTopK(40)
                .setTopP(0.95f)
                .setTemperature(temperature)
                .setPromptTemplates(GEMMA_TEMPLATES)
                .build()
            LlmInferenceSession.createFromOptions(engine, sessionOptions).use { session ->
                session.addQueryChunk(prompt)
                session.generateResponse()
            }
        } catch (e: Throwable) {
            Log.e(TAG, "generate:: inference failed: ${e.message}", e)
            null
        }
    }

    /**
     * Prompt template for the Gemma 3 instruction-tuned family. Without these delimiters MediaPipe feeds raw text to
     * the model, which then does free-form continuation rather than instruction-following — the symptom was Gemma
     * echoing the CONTEXT block verbatim instead of summarizing it. Gemma 3 has no native system role, so system
     * instructions get folded into the user turn by the orchestrator's prompt builder.
     */
    private val GEMMA_TEMPLATES: PromptTemplates = PromptTemplates.builder()
        .setUserPrefix("<start_of_turn>user\n")
        .setUserSuffix("<end_of_turn>\n")
        .setModelPrefix("<start_of_turn>model\n")
        .setModelSuffix("<end_of_turn>\n")
        .setSystemPrefix("")
        .setSystemSuffix("")
        .build()

    private fun ensureEngine(): LlmInference? {
        engine?.let { return it }
        synchronized(engineLock) {
            engine?.let { return it }
            return try {
                val options = LlmInference.LlmInferenceOptions.builder()
                    .setModelPath(modelPath)
                    .setMaxTokens(maxTokens)
                    .build()
                LlmInference.createFromOptions(context, options).also { engine = it }
            } catch (e: Throwable) {
                Log.e(TAG, "ensureEngine:: failed to create LlmInference: ${e.message}", e)
                null
            }
        }
    }

    override fun close() {
        synchronized(engineLock) {
            engine?.close()
            engine = null
        }
    }
}
