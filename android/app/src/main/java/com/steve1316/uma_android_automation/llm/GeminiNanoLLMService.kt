package com.steve1316.uma_android_automation.llm

import android.os.Build
import android.util.Log
import androidx.annotation.RequiresApi
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.prompt.GenerateContentRequest
import com.google.mlkit.genai.prompt.GenerativeModel
import com.google.mlkit.genai.prompt.Generation
import com.google.mlkit.genai.prompt.TextPart
import com.steve1316.automation_library.data.SharedData

/**
 * Gemini Nano LLM service via the ML Kit GenAI Prompt API.
 *
 * Runs on system AICore on supported flagships (Pixel 8/9, Galaxy S24/S25, Fold/Flip 6/7, Xiaomi 15). Model weights
 * are system-provided — zero APK impact. The ML Kit library itself only lives on SDK 26+ (guarded by the manifest
 * `tools:overrideLibrary` merge + this service's runtime version check), and within that pool the service still
 * gates by [FeatureStatus]: even an SDK 26+ device may return UNAVAILABLE if AICore isn't provisioned.
 */
class GeminiNanoLLMService : LLMService {
    @Volatile private var client: GenerativeModel? = null
    private val clientLock = Any()

    companion object {
        private const val TAG = "${SharedData.loggerTag}GeminiNano"
    }

    override suspend fun isAvailable(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
        return try {
            checkStatusInternal() == FeatureStatus.AVAILABLE
        } catch (e: Throwable) {
            Log.w(TAG, "isAvailable:: status check failed: ${e.message}")
            false
        }
    }

    /**
     * Return the current ML Kit [FeatureStatus] code for Nano on this device — exposed so the LLM Settings UI can
     * distinguish between UNAVAILABLE (device not supported), DOWNLOADABLE (needs user to trigger system download),
     * DOWNLOADING, and AVAILABLE (ready).
     *
     * @return One of the [FeatureStatus] constants, or [FeatureStatus.UNAVAILABLE] on pre-Oreo devices.
     */
    suspend fun checkStatus(): Int {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return FeatureStatus.UNAVAILABLE
        return try {
            checkStatusInternal()
        } catch (e: Throwable) {
            Log.w(TAG, "checkStatus:: failed: ${e.message}")
            FeatureStatus.UNAVAILABLE
        }
    }

    override suspend fun generate(prompt: String, maxTokens: Int, temperature: Float): String? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return null
        return generateInternal(prompt, maxTokens, temperature)
    }

    override fun close() {
        synchronized(clientLock) {
            client?.close()
            client = null
        }
    }

    @RequiresApi(Build.VERSION_CODES.O)
    private suspend fun checkStatusInternal(): Int = ensureClient().checkStatus()

    @RequiresApi(Build.VERSION_CODES.O)
    private suspend fun generateInternal(prompt: String, maxTokens: Int, temperature: Float): String? {
        return try {
            val model = ensureClient()
            val request = GenerateContentRequest.Builder(TextPart(prompt)).apply {
                this.temperature = temperature
                maxOutputTokens = maxTokens
                topK = 40
            }.build()
            val response = model.generateContent(request)
            val text = response.candidates.firstOrNull()?.text
            if (text.isNullOrEmpty()) null else text
        } catch (e: Throwable) {
            Log.e(TAG, "generateInternal:: failed: ${e.message}", e)
            null
        }
    }

    @RequiresApi(Build.VERSION_CODES.O)
    private fun ensureClient(): GenerativeModel {
        client?.let { return it }
        synchronized(clientLock) {
            client?.let { return it }
            return Generation.getClient().also { client = it }
        }
    }
}
