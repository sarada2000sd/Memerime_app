package com.cardloop.app

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.OpenableColumns
import android.view.View
import android.view.WindowInsets
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject
import java.io.ByteArrayOutputStream

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private val openTextDocumentRequest = 4107
    private val maxImportBytes = 5 * 1024 * 1024

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.BLACK
        window.navigationBarColor = Color.BLACK
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.isStatusBarContrastEnforced = false
            window.isNavigationBarContrastEnforced = false
        }

        webView = WebView(this).apply {
            setBackgroundColor(Color.BLACK)
            isVerticalScrollBarEnabled = false
            isHorizontalScrollBarEnabled = false
            overScrollMode = View.OVER_SCROLL_NEVER
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = false
                allowFileAccess = true
                allowContentAccess = true
                allowFileAccessFromFileURLs = false
                allowUniversalAccessFromFileURLs = false
                javaScriptCanOpenWindowsAutomatically = false
                setSupportMultipleWindows(false)
                setSupportZoom(false)
                builtInZoomControls = false
                displayZoomControls = false
                cacheMode = WebSettings.LOAD_NO_CACHE
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) safeBrowsingEnabled = true
            }
            addJavascriptInterface(AndroidBridge(), "AndroidBridge")
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                    val uri = request?.url ?: return true
                    return !(uri.scheme == "file" && uri.path?.startsWith("/android_asset/") == true)
                }
            }
            webChromeClient = WebChromeClient()
        }

        webView.setOnApplyWindowInsetsListener { view, insets ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val bars = insets.getInsets(
                    WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars() or WindowInsets.Type.displayCutout()
                )
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            } else {
                @Suppress("DEPRECATION")
                view.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop,
                    insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
            }
            insets
        }
        setContentView(webView)
        webView.requestApplyInsets()
        webView.loadUrl("file:///android_asset/index.html")
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != openTextDocumentRequest) return
        val uri = if (resultCode == RESULT_OK) data?.data else null
        if (uri == null) {
            sendPickerResult("", "", "File selection cancelled.")
            return
        }
        Thread {
            try {
                val name = getDisplayName(uri)
                val content = String(readLimited(uri), Charsets.UTF_8)
                runOnUiThread { sendPickerResult(content, name, "") }
            } catch (error: Exception) {
                runOnUiThread { sendPickerResult("", "", error.message ?: "Unable to read this file.") }
            }
        }.start()
    }

    private fun getDisplayName(uri: Uri): String {
        contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (cursor.moveToFirst() && index >= 0) return cursor.getString(index) ?: "Imported.txt"
        }
        return "Imported.txt"
    }

    private fun readLimited(uri: Uri): ByteArray {
        val stream = contentResolver.openInputStream(uri)
            ?: throw IllegalStateException("Could not open the selected file.")
        stream.use { input ->
            val output = ByteArrayOutputStream()
            val buffer = ByteArray(8192)
            var total = 0
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                total += count
                if (total > maxImportBytes) throw IllegalArgumentException("TXT files must be 5 MB or smaller.")
                output.write(buffer, 0, count)
            }
            if (total == 0) throw IllegalArgumentException("The selected file is empty.")
            return output.toByteArray()
        }
    }

    private fun sendPickerResult(content: String, name: String, error: String) {
        val script = "window.onAndroidTextFile(" + JSONObject.quote(content) + "," +
            JSONObject.quote(name) + "," + JSONObject.quote(error) + ");"
        if (::webView.isInitialized) webView.evaluateJavascript(script, null)
    }

    inner class AndroidBridge {
        @JavascriptInterface
        fun pickTextFile(deckId: String) {
            runOnUiThread {
                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "text/plain"
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                try {
                    startActivityForResult(intent, openTextDocumentRequest)
                } catch (_: ActivityNotFoundException) {
                    sendPickerResult("", "", "No file picker is available on this device.")
                }
            }
        }

        @JavascriptInterface
        fun appVersion(): String = "1.0.0"
    }

    @Deprecated("Deprecated by Android; retained for broad device compatibility.")
    override fun onBackPressed() {
        if (!::webView.isInitialized) {
            super.onBackPressed()
            return
        }
        webView.evaluateJavascript("window.CardLoopApp ? window.CardLoopApp.handleBack() : false") { result ->
            if (result != "true") {
                @Suppress("DEPRECATION")
                super.onBackPressed()
            }
        }
    }

    override fun onDestroy() {
        if (::webView.isInitialized) {
            webView.removeJavascriptInterface("AndroidBridge")
            webView.stopLoading()
            webView.destroy()
        }
        super.onDestroy()
    }
}
