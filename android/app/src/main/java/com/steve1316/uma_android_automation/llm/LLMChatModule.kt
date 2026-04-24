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
 * React Native bridge exposing the on-device documentation chatbot to the JS frontend.
 *
 * @property reactContext Injected by React Native's module loader.
 */
class LLMChatModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private val orchestrator = ChatOrchestrator(reactContext.applicationContext)
    private val scope = CoroutineScope(Dispatchers.Default)

    @Volatile private var downloadJob: Job? = null
    @Volatile private var authToken: String? = null

    companion object {
        private const val TAG = "${SharedData.loggerTag}LLMChatModule"
        private const val MODULE_NAME = "LLMChatModule"

        /** Event emitted per DownloadManager progress snapshot. Payload: `{ status, bytesDownloaded, bytesTotal }`. */
        const val EVENT_DOWNLOAD_STATE = "LLMChatModule.DownloadState"
    }

    override fun getName(): String = MODULE_NAME

    /**
     * Retrieve-only search. See [ChatOrchestrator.searchDocs].
     *
     * @param query User question.
     * @param k Maximum chunks to return.
     * @param promise Resolved with `[{ id, source, heading, text, score }]`.
     */
    @ReactMethod
    fun searchDocs(query: String, k: Int, promise: Promise) {
        scope.launch {
            try {
                val results = orchestrator.searchDocs(query, k)
                promise.resolve(resultsToArray(results))
            } catch (e: Exception) {
                Log.e(TAG, "searchDocs:: failed: ${e.message}", e)
                promise.reject("E_SEARCH_FAILED", e.message, e)
            }
        }
    }

    /**
     * Full RAG chat. Resolves with `{ answer, mode, service, overlap, citations, rejectedAnswer? }`.
     * `mode` is one of `"generated"`, `"retrieveOnly"`, `"verifierFallback"`.
     *
     * @param query User question.
     * @param k Maximum chunks to use as context.
     * @param promise Resolved with the chat result.
     */
    @ReactMethod
    fun chat(query: String, k: Int, promise: Promise) {
        scope.launch {
            try {
                val result = orchestrator.chat(query, k)
                val map = Arguments.createMap()
                map.putString("answer", result.answer)
                map.putArray("citations", resultsToArray(result.citations))
                when (val mode = result.mode) {
                    is ChatOrchestrator.ChatMode.RetrieveOnly -> {
                        map.putString("mode", "retrieveOnly")
                    }
                    is ChatOrchestrator.ChatMode.Generated -> {
                        map.putString("mode", "generated")
                        map.putString("service", mode.service)
                        map.putDouble("overlap", mode.overlap.toDouble())
                    }
                    is ChatOrchestrator.ChatMode.VerifierFallback -> {
                        map.putString("mode", "verifierFallback")
                        map.putString("service", mode.service)
                        map.putDouble("overlap", mode.overlap.toDouble())
                        map.putString("rejectedAnswer", mode.rejectedAnswer)
                    }
                }
                promise.resolve(map)
            } catch (e: Exception) {
                Log.e(TAG, "chat:: failed: ${e.message}", e)
                promise.reject("E_CHAT_FAILED", e.message, e)
            }
        }
    }

    /** Resolves with `{ mediaPipeDownloaded, mediaPipeSizeBytes, activeService }`. */
    @ReactMethod
    fun getServiceStatus(promise: Promise) {
        scope.launch {
            try {
                val s = orchestrator.getServiceStatus()
                val map = Arguments.createMap()
                map.putBoolean("mediaPipeDownloaded", s.mediaPipeDownloaded)
                map.putDouble("mediaPipeSizeBytes", s.mediaPipeSizeBytes.toDouble())
                map.putString("activeService", s.activeService)
                promise.resolve(map)
            } catch (e: Exception) {
                Log.e(TAG, "getServiceStatus:: failed: ${e.message}", e)
                promise.reject("E_STATUS_FAILED", e.message, e)
            }
        }
    }

    /**
     * Start downloading the generative model from [url]. Progress is emitted via [EVENT_DOWNLOAD_STATE].
     * Resolves immediately once the download has been enqueued.
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
        downloadJob = scope.launch {
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

    /** Store an optional Bearer token applied to the next [downloadModel] call. Pass empty to clear. */
    @ReactMethod
    fun setAuthToken(token: String) {
        authToken = token.trim().ifEmpty { null }
    }

    /** Cancel the in-progress download, if any. */
    @ReactMethod
    fun cancelDownload(promise: Promise) {
        downloadJob?.cancel()
        downloadJob = null
        promise.resolve(null)
    }

    /** Delete every downloaded model from disk. Legacy "bulk clear" entry point. */
    @ReactMethod
    fun deleteModel(promise: Promise) {
        val deleted = orchestrator.modelDownloader().delete()
        promise.resolve(deleted)
    }

    /** Delete a specific downloaded model by filename. */
    @ReactMethod
    fun deleteModelFile(filename: String, promise: Promise) {
        val deleted = orchestrator.modelDownloader().deleteByName(filename)
        promise.resolve(deleted)
    }

    /** Resolves with an array of `{ filename, sizeBytes, lastModifiedMillis }` for every downloaded model. */
    @ReactMethod
    fun listModels(promise: Promise) {
        try {
            val models = orchestrator.modelDownloader().listModels()
            val array = Arguments.createArray()
            for (f in models) {
                val map = Arguments.createMap()
                map.putString("filename", f.name)
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
     * Select which downloaded model the orchestrator uses. Empty string clears the selection, reverting to
     * "most recently modified".
     */
    @ReactMethod
    fun setActiveModel(filename: String) {
        orchestrator.activeModelFilename = filename.trim().ifEmpty { null }
    }

    // --------------------------------------------------------------------------------------------------

    /** Derive a local filename from the model URL's last path segment, stripping query strings and falling back
     *  to a generic name when the URL is unparseable. */
    private fun filenameFromUrl(url: String): String {
        val noQuery = url.substringBefore('?').substringBefore('#')
        val last = noQuery.substringAfterLast('/', missingDelimiterValue = "").trim()
        return if (last.isNotEmpty() && last.endsWith(".task")) last else "chat-model.task"
    }

    private fun resultsToArray(results: List<DocIndex.Result>) = Arguments.createArray().also { array ->
        for (r in results) {
            val map = Arguments.createMap()
            map.putString("id", r.chunk.id)
            map.putString("source", r.chunk.source)
            map.putString("heading", r.chunk.heading)
            map.putString("text", r.chunk.text)
            map.putDouble("score", r.score.toDouble())
            array.pushMap(map)
        }
    }

    private fun emitDownloadState(state: ModelDownloader.State) {
        when (state) {
            is ModelDownloader.State.Pending -> emitDownloadStateRaw("pending", 0, 0, null)
            is ModelDownloader.State.Running -> emitDownloadStateRaw("running", state.bytesDownloaded, state.bytesTotal, null)
            is ModelDownloader.State.Paused -> emitDownloadStateRaw("paused", state.bytesDownloaded, state.bytesTotal, null)
            is ModelDownloader.State.Complete -> emitDownloadStateRaw("complete", 0, 0, null)
            is ModelDownloader.State.Failed -> emitDownloadStateRaw("failed", 0, 0, "reason=${state.failureReason}")
        }
    }

    private fun emitDownloadStateRaw(status: String, soFar: Long, total: Long, error: String?) {
        val map: WritableMap = Arguments.createMap()
        map.putString("status", status)
        map.putDouble("bytesDownloaded", soFar.toDouble())
        map.putDouble("bytesTotal", total.toDouble())
        if (error != null) map.putString("error", error)
        reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(EVENT_DOWNLOAD_STATE, map)
    }
}
