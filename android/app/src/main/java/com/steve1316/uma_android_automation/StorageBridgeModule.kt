package com.steve1316.uma_android_automation

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.documentfile.provider.DocumentFile
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.steve1316.automation_library.utils.UserStorageManager

/**
 * Bridge module that exposes the SAF folder picker and the `UserStorageManager` state to the React
 * Native frontend so the first-run wizard and settings screen can let the user choose where the
 * bot writes logs, recordings, and backups.
 *
 * @param reactContext The React Native application context.
 */
class StorageBridgeModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {
    companion object {
        private val TAG = "[${MainActivity.loggerTag}]StorageBridgeModule"
        private const val REQUEST_CODE_PICK_FOLDER = 200
    }

    private val appContext: ReactApplicationContext = reactContext
    private var pendingPickPromise: Promise? = null

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String {
        return "StorageBridgeModule"
    }

    /** Launches the system folder picker so the user can choose a directory for the app's
     * user-visible artefacts. Resolves with the chosen `Uri` string when the user confirms, or
     * `null` when the user cancels. Rejects if the picker cannot be launched or if a previous
     * picker call is still in flight.
     *
     * @param promise Resolved with the chosen `Uri` string, `null` on cancel, or rejected on error.
     */
    @ReactMethod
    fun pickFolder(promise: Promise) {
        if (pendingPickPromise != null) {
            promise.reject("PICKER_BUSY", "A folder picker is already in progress.")
            return
        }
        val activity = currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "There is no foreground activity to host the folder picker.")
            return
        }
        try {
            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
            }
            pendingPickPromise = promise
            activity.startActivityForResult(intent, REQUEST_CODE_PICK_FOLDER)
        } catch (e: Exception) {
            pendingPickPromise = null
            Log.e(TAG, "Failed to launch folder picker", e)
            promise.reject("PICKER_LAUNCH_FAILED", e.message ?: e.toString(), e)
        }
    }

    /** Reads the currently configured tree `Uri` and its display name. The display name is
     * resolved from the SAF document so it matches what the user picked rather than a raw path.
     *
     * @param promise Resolved with a map of `{uri, name}`, or `null` when no folder is configured.
     */
    @ReactMethod
    fun getCurrentFolder(promise: Promise) {
        try {
            val storage = UserStorageManager.getInstance(appContext)
            val uri = storage.getTreeUri()
            if (uri == null) {
                promise.resolve(null)
                return
            }
            val doc = DocumentFile.fromTreeUri(appContext, uri)
            val map: WritableMap = Arguments.createMap()
            map.putString("uri", uri.toString())
            map.putString("name", doc?.name ?: "")
            promise.resolve(map)
        } catch (e: Exception) {
            Log.e(TAG, "getCurrentFolder failed", e)
            promise.reject("READ_FAILED", e.message ?: e.toString(), e)
        }
    }

    /** Clear the persisted tree `Uri` so subsequent reads and writes fall back to the legacy
     * `getExternalFilesDir()` paths. Intended for re-onboarding flows and testing.
     *
     * @param promise Resolved with `true` once the `Uri` has been cleared.
     */
    @ReactMethod
    fun clearFolder(promise: Promise) {
        try {
            UserStorageManager.getInstance(appContext).setTreeUri(null)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "clearFolder failed", e)
            promise.reject("CLEAR_FAILED", e.message ?: e.toString(), e)
        }
    }

    /** Probe the currently configured tree `Uri` to verify write access is still granted. Useful
     * on app start and after the user has touched system permission settings, since SAF grants
     * can be revoked externally.
     *
     * @param promise Resolved with `true` if a probe file could be created and deleted, `false` otherwise.
     */
    @ReactMethod
    fun validateAccess(promise: Promise) {
        try {
            promise.resolve(UserStorageManager.getInstance(appContext).validateAccess())
        } catch (e: Exception) {
            Log.e(TAG, "validateAccess failed", e)
            promise.reject("VALIDATE_FAILED", e.message ?: e.toString(), e)
        }
    }

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != REQUEST_CODE_PICK_FOLDER) return
        val promise = pendingPickPromise
        pendingPickPromise = null
        if (promise == null) return

        if (resultCode != Activity.RESULT_OK) {
            promise.resolve(null)
            return
        }

        val uri: Uri? = data?.data
        if (uri == null) {
            promise.reject("NO_URI", "Folder picker returned no tree Uri.")
            return
        }

        try {
            UserStorageManager.getInstance(appContext).setTreeUri(uri)
            promise.resolve(uri.toString())
        } catch (e: Exception) {
            Log.e(TAG, "Failed to persist tree Uri", e)
            promise.reject("PERSIST_FAILED", e.message ?: e.toString(), e)
        }
    }

    override fun onNewIntent(intent: Intent?) {
        // No-op. The folder picker delivers its result via onActivityResult.
    }
}
