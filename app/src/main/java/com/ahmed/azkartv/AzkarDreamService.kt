package com.ahmed.azkartv

import android.service.dreams.DreamService
import android.webkit.WebView

/**
 * Registers the display as a system screensaver. On Android TV / Google TV this
 * appears under Settings > System > Screensaver (Daydream) and runs when the TV
 * goes idle. It loads the same offline page in calmer "screensaver" mode.
 */
class AzkarDreamService : DreamService() {

    private var webView: WebView? = null

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()

        // Fullscreen, non-interactive: any remote/key press wakes the TV and
        // dismisses the screensaver, which is the expected behaviour.
        isFullscreen = true
        isInteractive = false
        isScreenBright = true

        webView = DisplayWebView.create(this, screensaver = true)
        setContentView(webView)
    }

    override fun onDetachedFromWindow() {
        webView?.let {
            (it.parent as? android.view.ViewGroup)?.removeView(it)
            it.destroy()
        }
        webView = null
        super.onDetachedFromWindow()
    }
}
