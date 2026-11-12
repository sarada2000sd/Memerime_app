package com.cardloop.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * A one-shot system callback after a reboot. It only redraws existing widgets;
 * it does not start a service, schedule work or keep the app alive.
 */
class CardLoopBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action == Intent.ACTION_BOOT_COMPLETED) {
            CardLoopWidgetProvider.updateAllWidgets(context)
        }
    }
}
