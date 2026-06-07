package com.ahmed.azkartv

import android.annotation.SuppressLint
import android.content.Context
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * Builds a WebView pre-configured to run the bundled offline display.
 * Shared by MainActivity (launcher app) and AzkarDreamService (screensaver).
 *
 * @param screensaver when true the page loads in calmer "ambient" mode
 *                    (controls hidden, slower rotation, dimmed).
 */
object DisplayWebView {

    @SuppressLint("SetJavaScriptEnabled")
    fun create(context: Context, screensaver: Boolean): WebView {
        val web = WebView(context)
        // White background as specified; avoids any flash before paint.
        web.setBackgroundColor(0xFFFFFFFF.toInt())

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true          // remembers last category / position
            databaseEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            // Bundled, offline-only content: allow the local page to read the
            // packaged JSON and font files from the file:// origin.
            allowFileAccessFromFileURLs = true
            allowUniversalAccessFromFileURLs = true
            loadWithOverviewMode = true
            useWideViewPort = true
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        }

        web.webViewClient = WebViewClient()
        web.isFocusable = true
        web.isFocusableInTouchMode = true

        val mode = if (screensaver) "screensaver" else "app"
        web.loadUrl("file:///android_asset/index.html?mode=$mode")
        return web
    }
}
