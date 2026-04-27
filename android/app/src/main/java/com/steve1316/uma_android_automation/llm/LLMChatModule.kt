package com.steve1316.uma_android_automation.llm

import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.steve1316.automation_library.data.SharedData
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch

/**
 * React Native bridge for the on-device documentation chatbot's retrieval + model-file-management surface.
 *
 * After migrating the LLM to llama.rn (JS-side), this module's responsibility narrows to:
 * - Retrieval: [searchDocs] runs MiniLM embedding + cosine search over the bundled index and returns the top-k
 *   chunks with their full enclosing section text expanded.
 * - Model file management: download/cancel/delete/list/select GGUF model files. The actual inference happens
 *   JS-side in `src/lib/chat/llamaRunner.ts`.
 *
 * @property reactContext Injected by React Native's module loader.
 */
class LLMChatModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    /** Owned retrieval orchestrator; same lifetime as this module. */
    private val orchestrator = ChatOrchestrator(reactContext.applicationContext)

    /** Background scope for bridge methods that fan out into coroutines (search, downloads). */
    private val scope = CoroutineScope(Dispatchers.Default)

    /** In-flight download coroutine, if any. Volatile so [cancelDownload] sees the latest value cross-thread. */
    @Volatile private var downloadJob: Job? = null

    /** Optional Bearer token applied to the next [downloadModel] call. Volatile so updates are visible immediately. */
    @Volatile private var authToken: String? = null

    companion object {
        /** Logger tag for this class. */
        private const val TAG = "${SharedData.loggerTag}LLMChatModule"

        /** Name JS imports this module under via `NativeModules.LLMChatModule`. */
        private const val MODULE_NAME = "LLMChatModule"

        /** Event emitted per DownloadManager progress snapshot. Payload: `{ status, bytesDownloaded, bytesTotal }`. */
        const val EVENT_DOWNLOAD_STATE = "LLMChatModule.DownloadState"
    }

    /** @return The name JS uses to look up this module via `NativeModules.LLMChatModule`. */
    override fun getName(): String = MODULE_NAME

    /**
     * Required no-op for `NativeEventEmitter`; events are dispatched via `RCTDeviceEventEmitter`.
     *
     * @param eventName Ignored; React Native's emitter contract requires this signature.
     */
    @ReactMethod
    fun addListener(eventName: String) {}

    /**
     * Required no-op for `NativeEventEmitter`; events are dispatched via `RCTDeviceEventEmitter`.
     *
     * @param count Ignored; React Native's emitter contract requires this signature.
     */
    @ReactMethod
    fun removeListeners(count: Int) {}

    /**
     * Retrieve top-[k] doc chunks with their full enclosing section text expanded.
     *
     * @param query User-typed natural-language question.
     * @param k Maximum chunks to return.
     * @param promise Resolves with `[{ id, source, heading, text, score, expandedText }]`.
     */
    @ReactMethod
    fun searchDocs(query: String, k: Int, promise: Promise) {
        scope.launch {
            try {
                val results = orchestrator.searchDocs(query, k)
                val array = Arguments.createArray()
                for (r in results) {
                    val map = Arguments.createMap()
                    map.putString("id", r.chunk.id)
                    map.putString("source", r.chunk.source)
                    map.putString("heading", r.chunk.heading)
                    map.putString("text", r.chunk.text)
                    map.putDouble("score", r.score.toDouble())
                    map.putString("expandedText", r.expandedText)
                    map.putString("kind", if (r.chunk.kind == DocIndex.Kind.CODE) "code" else "doc")
                    array.pushMap(map)
                }
                promise.resolve(array)
            } catch (e: Exception) {
                Log.e(TAG, "searchDocs:: failed: ${e.message}", e)
                promise.reject("E_SEARCH_FAILED", e.message, e)
            }
        }
    }

    /**
     * Start downloading the model. Progress emitted via [EVENT_DOWNLOAD_STATE].
     *
     * @param url HTTPS URL of the model file to download.
     * @param promise Resolves with null once the download has been enqueued, or rejects when one is already running.
     */
    @ReactMethod
    fun downloadModel(url: String, promise: Promise) {
        val existing = downloadJob
        if (existing != null && existing.isActive) {
            promise.reject("E_ALREADY_DOWNLOADING", "A model download is already in progress.")
            return
        }
        val token = authToken
        val filename = filenameFromUrl(url)
        downloadJob =
            scope.launch {
                try {
                    orchestrator.modelDownloader().download(url, filename, token).collect { state ->
                        emitDownloadState(state)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "downloadModel:: failed: ${e.message}", e)
                    emitDownloadStateRaw("error", 0, 0, e.message)
                }
            }
        promise.resolve(null)
    }

    /**
     * Store an optional Bearer token applied to the next [downloadModel] call. Pass empty to clear.
     *
     * @param token Bearer token to apply, or an empty/blank string to clear any previously stored token.
     */
    @ReactMethod
    fun setAuthToken(token: String) {
        authToken = token.trim().ifEmpty { null }
    }

    /**
     * Cancel the in-progress download, if any.
     *
     * @param promise Resolves with null once cancellation has been requested.
     */
    @ReactMethod
    fun cancelDownload(promise: Promise) {
        downloadJob?.cancel()
        downloadJob = null
        promise.resolve(null)
    }

    /**
     * Delete every downloaded model from disk.
     *
     * @param promise Resolves with `true` if any file was deleted, `false` otherwise.
     */
    @ReactMethod
    fun deleteModel(promise: Promise) {
        val deleted = orchestrator.modelDownloader().delete()
        promise.resolve(deleted)
    }

    /**
     * Delete a specific downloaded model by filename.
     *
     * @param filename Bare filename of the model to delete.
     * @param promise Resolves with `true` if the file existed and was deleted, `false` otherwise.
     */
    @ReactMethod
    fun deleteModelFile(filename: String, promise: Promise) {
        val deleted = orchestrator.modelDownloader().deleteByName(filename)
        promise.resolve(deleted)
    }

    /**
     * List every model downloaded on-device.
     *
     * @param promise Resolves with `[{ filename, path, sizeBytes, lastModifiedMillis }]` for every downloaded model.
     */
    @ReactMethod
    fun listModels(promise: Promise) {
        try {
            val models = orchestrator.modelDownloader().listModels()
            val array = Arguments.createArray()
            for (f in models) {
                val map = Arguments.createMap()
                map.putString("filename", f.name)
                map.putString("path", f.absolutePath)
                map.putDouble("sizeBytes", f.length().toDouble())
                map.putDouble("lastModifiedMillis", f.lastModified().toDouble())
                array.pushMap(map)
            }
            promise.resolve(array)
        } catch (e: Exception) {
            Log.e(TAG, "listModels:: failed: ${e.message}", e)
            promise.reject("E_LIST_FAILED", e.message, e)
        }
    }

    /**
     * Select which downloaded model the bridge surfaces as "active". Empty string clears the selection.
     *
     * @param filename Bare filename of the desired active model, or an empty/blank string to clear the selection.
     */
    @ReactMethod
    fun setActiveModel(filename: String) {
        orchestrator.activeModelFilename = filename.trim().ifEmpty { null }
    }

    // //////////////////////////////////////////////////////////////////////////////////////////////////
    // //////////////////////////////////////////////////////////////////////////////////////////////////

    /**
     * Derive a local filename from the model URL's last path segment, falling back to a generic name when the URL
     * is unparseable or doesn't end in a recognized model extension.
     *
     * @param url Source URL of the model download.
     * @return The chosen local filename ending in `.gguf` or `.task`.
     */
    private fun filenameFromUrl(url: String): String {
        val noQuery = url.substringBefore('?').substringBefore('#')
        val last = noQuery.substringAfterLast('/', missingDelimiterValue = "").trim()
        val isModel = last.endsWith(".gguf", ignoreCase = true) || last.endsWith(".task", ignoreCase = true)
        return if (last.isNotEmpty() && isModel) last else "chat-model.gguf"
    }

    /**
     * Map a [ModelDownloader.State] into an [EVENT_DOWNLOAD_STATE] payload and forward it to JS.
     *
     * @param state The latest snapshot from the download flow.
     */
    private fun emitDownloadState(state: ModelDownloader.State) {
        when (state) {
            is ModelDownloader.State.Pending -> emitDownloadStateRaw("pending", 0, 0, null)
            is ModelDownloader.State.Running -> emitDownloadStateRaw("running", state.bytesDownloaded, state.bytesTotal, null)
            is ModelDownloader.State.Paused -> emitDownloadStateRaw("paused", state.bytesDownloaded, state.bytesTotal, null)
            is ModelDownloader.State.Complete -> emitDownloadStateRaw("complete", 0, 0, null)
            is ModelDownloader.State.Failed -> emitDownloadStateRaw("failed", 0, 0, "reason=${state.failureReason}")
        }
    }

    /**
     * Emit a single [EVENT_DOWNLOAD_STATE] event with the supplied fields.
     *
     * @param status One of `pending`, `running`, `paused`, `complete`, `failed`, `error`.
     * @param soFar Bytes downloaded so far.
     * @param total Total expected bytes, or 0 when unknown.
     * @param error Optional error description; included in the payload when non-null.
     */
    private fun emitDownloadStateRaw(status: String, soFar: Long, total: Long, error: String?) {
        val map: WritableMap = Arguments.createMap()
        map.putString("status", status)
        map.putDouble("bytesDownloaded", soFar.toDouble())
        map.putDouble("bytesTotal", total.toDouble())
        if (error != null) map.putString("error", error)
        reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(EVENT_DOWNLOAD_STATE, map)
    }
}
