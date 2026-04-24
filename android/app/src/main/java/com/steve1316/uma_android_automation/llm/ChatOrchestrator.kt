package com.steve1316.uma_android_automation.llm

import android.content.Context
import android.util.Log
import com.steve1316.automation_library.data.SharedData

/**
 * Top-level coordinator for the on-device documentation chatbot.
 *
 * Two entry points:
 * - [searchDocs] runs retrieve-only: embed query, cosine-search the bundled doc index, return top-k chunks verbatim.
 *   Always available, zero hallucination risk.
 * - [chat] layers generation on top: retrieves, builds a grounded prompt, picks the best available LLM service
 *   (Gemini Nano > MediaPipe), runs [GroundingVerifier], and falls back to retrieve-only when verification fails or
 *   no model is available.
 *
 * Lazily initializes every subsystem; first call to either entry point pays the load cost.
 *
 * @property context Application context for asset access, DownloadManager, and ML Kit clients.
 */
class ChatOrchestrator(private val context: Context) {
    @Volatile private var embedder: EmbeddingService? = null
    @Volatile private var index: DocIndex? = null

    private val downloader = ModelDownloader(context)
    private val nano = GeminiNanoLLMService()
    @Volatile private var mediapipe: MediaPipeLLMService? = null

    /** Whether the bot should prefer Gemini Nano when available; toggled from the LLM Settings page. */
    @Volatile var preferNano: Boolean = true

    companion object {
        private const val TAG = "${SharedData.loggerTag}ChatOrchestrator"
        private const val INDEX_PATH = "llm/doc_index.bin"
        private const val MAX_CONTEXT_CHUNKS = 4
        private const val MAX_OUTPUT_TOKENS = 384
        private const val TEMPERATURE = 0.35f

        /** Lowered from the verifier's default 0.4 because summary-style answers paraphrase and naturally have less exact token overlap with the source chunks. */
        private const val GROUNDING_THRESHOLD = 0.3f
    }

    /**
     * How a [chat] answer was produced — exposed so the UI can show source-of-truth labels and source chunks.
     */
    sealed class ChatMode {
        /** No model downloaded and Nano unavailable — the top retrieved chunk is shown verbatim. */
        object RetrieveOnly : ChatMode()

        /** An LLM produced the answer and it passed [GroundingVerifier]. */
        data class Generated(val service: String, val overlap: Float) : ChatMode()

        /** An LLM produced an answer but verifier rejected it; the top retrieved chunk is shown instead. */
        data class VerifierFallback(val service: String, val overlap: Float, val rejectedAnswer: String) : ChatMode()
    }

    /**
     * Full chat result.
     *
     * @property answer The text to display: the generated answer on [ChatMode.Generated], otherwise the top chunk.
     * @property citations The retrieved chunks used to ground the answer.
     * @property mode Which path produced [answer].
     */
    data class ChatResult(val answer: String, val citations: List<DocIndex.Result>, val mode: ChatMode)

    /**
     * Retrieve-only path — no generation. Always available as long as the bundled index and embedder load.
     *
     * @param query User-typed natural-language question.
     * @param k Maximum number of chunks to return.
     * @return Top-k results ordered by descending cosine similarity, or an empty list on init failure.
     */
    fun searchDocs(query: String, k: Int = MAX_CONTEXT_CHUNKS): List<DocIndex.Result> {
        val emb = ensureEmbedder() ?: return emptyList()
        val idx = ensureIndex() ?: return emptyList()
        val vector = emb.embed(query) ?: return emptyList()
        return idx.search(vector, k)
    }

    /**
     * Full RAG chat path. Retrieves, prompts an LLM, verifies grounding, and falls back to retrieve-only when no
     * model is available or the verifier rejects the answer.
     *
     * @param query User question.
     * @param k Number of chunks to include as context.
     * @return A [ChatResult] describing the answer, its mode, and its source citations.
     */
    suspend fun chat(query: String, k: Int = MAX_CONTEXT_CHUNKS): ChatResult {
        val citations = searchDocs(query, k)
        if (citations.isEmpty()) {
            return ChatResult("No matching documentation found.", emptyList(), ChatMode.RetrieveOnly)
        }

        val service = pickService()
        if (service == null) {
            return ChatResult(citations.first().chunk.text, citations, ChatMode.RetrieveOnly)
        }

        val prompt = buildPrompt(query, citations)
        val answer = service.second.generate(prompt, MAX_OUTPUT_TOKENS, TEMPERATURE)?.trim()
        if (answer.isNullOrEmpty() || answer.equals("NOT_IN_DOCS", ignoreCase = true)) {
            return ChatResult(citations.first().chunk.text, citations, ChatMode.RetrieveOnly)
        }

        val contextTexts = citations.map { it.chunk.text }
        val overlap = GroundingVerifier.overlap(answer, contextTexts)
        return if (overlap >= GROUNDING_THRESHOLD) {
            ChatResult(answer, citations, ChatMode.Generated(service.first, overlap))
        } else {
            Log.w(TAG, "chat:: verifier rejected answer (overlap=$overlap); falling back to retrieve-only")
            ChatResult(
                citations.first().chunk.text,
                citations,
                ChatMode.VerifierFallback(service.first, overlap, answer),
            )
        }
    }

    /** Current service status snapshot for the LLM Settings page. */
    data class ServiceStatus(
        val nanoStatus: Int,
        val mediaPipeDownloaded: Boolean,
        val mediaPipeSizeBytes: Long,
        val activeService: String,
    )

    /**
     * Poll current status of both LLM services — reported by the LLM Settings page.
     *
     * @return [ServiceStatus] snapshot.
     */
    suspend fun getServiceStatus(): ServiceStatus {
        val nanoCode = nano.checkStatus()
        val downloaded = downloader.isDownloaded()
        val picked = pickService()?.first ?: "none"
        return ServiceStatus(nanoCode, downloaded, downloader.size(), picked)
    }

    /** Downloader instance exposed for bridge methods that manage model files. */
    fun modelDownloader(): ModelDownloader = downloader

    /** Release any held native resources. */
    fun close() {
        embedder?.close()
        embedder = null
        index = null
        mediapipe?.close()
        mediapipe = null
        nano.close()
    }

    // --------------------------------------------------------------------------------------------------

    private fun buildPrompt(query: String, citations: List<DocIndex.Result>): String {
        // Separator-delimited excerpts rather than a "[i] heading: text" layout — small models (Gemma 3 1B) tend to
        // echo structured prompt templates back as output. Plain prose between separators gives them less to imitate.
        val contextBlock = citations.joinToString("\n\n---\n\n") { r -> r.chunk.text }
        return """
            You are a friendly documentation guide for an Android automation app.

            Below are excerpts from the app's documentation, separated by ---:

            $contextBlock

            Using only the excerpts above, write a natural, conversational 2–5 sentence answer to this question:

            $query

            Rules you must follow:
            - Paraphrase in your own words. Do NOT copy sentences verbatim from the excerpts.
            - Do NOT prefix lines with headings, numbers, bullets, "Answer:", or "---".
            - Write a single flowing paragraph.
            - Only use facts that appear in the excerpts. Do not invent features, numbers, button names, or behavior.
            - If the excerpts do not answer the question, reply with exactly: NOT_IN_DOCS
        """.trimIndent()
    }

    private suspend fun pickService(): Pair<String, LLMService>? {
        if (preferNano && nano.isAvailable()) return "nano" to nano
        val mp = ensureMediaPipe()
        if (mp != null && mp.isAvailable()) return "mediapipe" to mp
        return null
    }

    private fun ensureEmbedder(): EmbeddingService? {
        embedder?.let { return it }
        synchronized(this) {
            embedder?.let { return it }
            val created = EmbeddingService(context)
            embedder = created
            return created
        }
    }

    private fun ensureIndex(): DocIndex? {
        index?.let { return it }
        synchronized(this) {
            index?.let { return it }
            try {
                context.assets.open(INDEX_PATH).use { stream ->
                    val loaded = DocIndex.load(stream)
                    Log.i(TAG, "ensureIndex:: loaded ${loaded.chunks.size} chunks, dim=${loaded.dim}")
                    index = loaded
                    return loaded
                }
            } catch (e: Exception) {
                Log.e(TAG, "ensureIndex:: failed to load $INDEX_PATH: ${e.message}", e)
                return null
            }
        }
    }

    private fun ensureMediaPipe(): MediaPipeLLMService? {
        if (!downloader.isDownloaded()) return null
        mediapipe?.let { return it }
        synchronized(this) {
            mediapipe?.let { return it }
            val created = MediaPipeLLMService(context, downloader.modelFile.absolutePath)
            mediapipe = created
            return created
        }
    }
}
