package com.ahmed.azkartv

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Auto-starts the display when the TV finishes booting, so the app comes up on
 * power-on without anyone touching the remote. (The idle screensaver path is
 * handled separately by AzkarDreamService.)
 *
 * Note: Android 10+ restricts starting an Activity from the background. Many
 * Android TV / Google TV devices still honour a boot launch, but if a given
 * device blocks it, use the screensaver/Ambient path instead — see README.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        if (action == Intent.ACTION_BOOT_COMPLETED ||
            action == "android.intent.action.QUICKBOOT_POWERON" ||
            action == "com.htc.intent.action.QUICKBOOT_POWERON") {
            val launch = Intent(context, MainActivity::class.java)
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            try { context.startActivity(launch) } catch (e: Exception) { /* device blocked bg start */ }
        }
    }
}
