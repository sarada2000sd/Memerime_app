package com.cardloop.app

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.SystemClock
import android.text.Html
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

class CardLoopWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, appWidgetIds: IntArray) {
        appWidgetIds.forEach { updateWidget(context, manager, it) }
    }
    override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, appWidgetId: Int, newOptions: android.os.Bundle) {
        updateWidget(context, manager, appWidgetId)
    }
    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        val id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
        when (intent.action) {
            ACTION_WIDGET_TAP -> {
                val mode = readState(context)?.optString("widgetMode", "none") ?: "none"
                if (mode == "none") {
                    context.startActivity(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP))
                } else if (id != AppWidgetManager.INVALID_APPWIDGET_ID) revealControls(context, id) else updateAllWidgets(context)
            }
            ACTION_NEXT_CARD -> { advanceSavedCard(context, +1); if (id != -1) revealControls(context, id) else updateAllWidgets(context) }
            ACTION_PREVIOUS_CARD -> { advanceSavedCard(context, -1); if (id != -1) revealControls(context, id) else updateAllWidgets(context) }
            ACTION_HIDE_CONTROLS, ACTION_PIN_COMPLETED -> updateAllWidgets(context)
        }
    }

    private fun revealControls(context: Context, id: Int) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
            .putLong(controlsUntilKey(id), System.currentTimeMillis() + CONTROLS_VISIBLE_MS).apply()
        scheduleHide(context, id)
        updateAllWidgets(context)
    }
    private fun scheduleHide(context: Context, id: Int) {
        val alarm = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(context, CardLoopWidgetProvider::class.java).apply {
            action = ACTION_HIDE_CONTROLS
            data = android.net.Uri.parse("cardloop://hide/" + id)
            putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
        }
        val pending = PendingIntent.getBroadcast(context, HIDE_REQUEST_BASE + id, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        alarm.cancel(pending)
        alarm.set(AlarmManager.ELAPSED_REALTIME, SystemClock.elapsedRealtime() + CONTROLS_VISIBLE_MS, pending)
    }

    private fun advanceSavedCard(context: Context, direction: Int) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val raw = prefs.getString(STATE_KEY, null) ?: return
        try {
            val state = JSONObject(raw)
            when (state.optString("widgetMode", "none")) {
                "deck" -> {
                    val deck = findDeck(state.optJSONArray("decks") ?: JSONArray(), state.optString("widgetDeckId", "")) ?: return
                    val indexes = selectedIndices(deck)
                    if (indexes.isEmpty()) return
                    val current = deck.optInt("currentIndex", indexes.first())
                    val position = indexes.indexOf(current).let { if (it < 0) 0 else it }
                    deck.put("currentIndex", indexes[wrap(position + direction, indexes.size)])
                }
                "all" -> {
                    val sequence = buildAllSequence(state)
                    if (sequence.isEmpty()) return
                    val next = wrap(wrap(state.optInt("allPosition", 0), sequence.size) + direction, sequence.size)
                    state.put("allPosition", next)
                    sequence[next].deck.put("currentIndex", sequence[next].cardIndex)
                }
                else -> return
            }
            prefs.edit().putString(STATE_KEY, state.toString()).commit()
        } catch (_: Exception) { }
    }

    private fun updateWidget(context: Context, manager: AppWidgetManager, id: Int) {
        val o = manager.getAppWidgetOptions(id)
        val width = max(o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 180), o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, 180))
        val height = max(o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 240), o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 240))
        val state = readState(context)
        val active = currentCard(state, state?.optString("widgetMode", "none") ?: "none")
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val visible = System.currentTimeMillis() < prefs.getLong(controlsUntilKey(id), 0L)

        if (active == null) {
            val v = RemoteViews(context.packageName, R.layout.widget_card)
            configureClicks(context, v, id)
            v.setTextViewText(R.id.widget_brand, "CARDLOOP")
            v.setTextViewTextSize(R.id.widget_brand, TypedValue.COMPLEX_UNIT_SP, 17f)
            listOf(R.id.widget_deck, R.id.widget_count, R.id.widget_front_container, R.id.widget_divider, R.id.widget_back_container, R.id.widget_footer)
                .forEach { v.setViewVisibility(it, View.GONE) }
            manager.updateAppWidget(id, v)
            return
        }

        val frontText = plain(active.front)
        val backText = plain(active.back)
        val frontLines = lineCount(frontText, width)
        val backLines = lineCount(backText, width)
        val layout = when {
            frontLines > backLines + 1 -> R.layout.widget_card_front_long
            backLines > frontLines + 1 -> R.layout.widget_card
            else -> R.layout.widget_card_balanced
        }
        val v = RemoteViews(context.packageName, layout)
        configureClicks(context, v, id)
        v.setTextViewText(R.id.widget_brand, "CARDLOOP")
        v.setTextViewText(R.id.widget_deck, active.deckName)
        v.setTextViewText(R.id.widget_count, active.positionLabel)
        v.setTextViewText(R.id.widget_front, toSpanned(active.front))
        v.setTextViewText(R.id.widget_back, toSpanned(active.back))
        v.setTextViewTextSize(R.id.widget_brand, TypedValue.COMPLEX_UNIT_SP, (width * .075f).coerceIn(10f, 14f))
        v.setTextViewTextSize(R.id.widget_deck, TypedValue.COMPLEX_UNIT_SP, (width * .085f).coerceIn(10f, 15f))
        v.setTextViewTextSize(R.id.widget_front, TypedValue.COMPLEX_UNIT_SP, fontSize(frontText, width, height, frontLines, .39f))
        v.setTextViewTextSize(R.id.widget_back, TypedValue.COMPLEX_UNIT_SP, fontSize(backText, width, height, backLines, .50f))
        val buttonSize = if (width < 160) 19f else 23f
        v.setTextViewTextSize(R.id.widget_prev_button, TypedValue.COMPLEX_UNIT_SP, buttonSize)
        v.setTextViewTextSize(R.id.widget_next_button, TypedValue.COMPLEX_UNIT_SP, buttonSize)
        v.setViewVisibility(R.id.widget_footer, if (visible) View.VISIBLE else View.GONE)
        v.setViewVisibility(R.id.widget_prev_button, if (visible) View.VISIBLE else View.GONE)
        v.setViewVisibility(R.id.widget_next_button, if (visible) View.VISIBLE else View.GONE)
        manager.updateAppWidget(id, v)
        if (state != null) prefs.edit().putString(STATE_KEY, state.toString()).apply()
    }

    private fun configureClicks(context: Context, views: RemoteViews, id: Int) {
        views.setOnClickPendingIntent(R.id.widget_root, pending(context, id, ACTION_WIDGET_TAP, 1, "tap"))
        views.setOnClickPendingIntent(R.id.widget_prev_button, pending(context, id, ACTION_PREVIOUS_CARD, 2, "prev"))
        views.setOnClickPendingIntent(R.id.widget_next_button, pending(context, id, ACTION_NEXT_CARD, 3, "next"))
    }
    private fun pending(context: Context, id: Int, action: String, offset: Int, token: String): PendingIntent {
        val intent = Intent(context, CardLoopWidgetProvider::class.java).apply {
            this.action = action
            data = android.net.Uri.parse("cardloop://" + token + "/" + id)
            putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
        }
        return PendingIntent.getBroadcast(context, REQUEST_BASE + id * 10 + offset, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private data class Entry(val deck: JSONObject, val cardIndex: Int, val card: JSONObject)
    private data class WidgetCard(val front: String, val back: String, val deckName: String, val positionLabel: String)

    private fun currentCard(state: JSONObject?, mode: String): WidgetCard? {
        if (state == null) return null
        if (mode == "deck") {
            val deck = findDeck(state.optJSONArray("decks") ?: JSONArray(), state.optString("widgetDeckId", "")) ?: return null
            val cards = deck.optJSONArray("cards") ?: return null
            val indexes = selectedIndices(deck)
            if (indexes.isEmpty()) return null
            val current = deck.optInt("currentIndex", indexes.first())
            val pos = indexes.indexOf(current).let { if (it < 0) 0 else it }
            val actual = indexes[pos]
            deck.put("currentIndex", actual)
            val card = cards.optJSONObject(actual) ?: return null
            return WidgetCard(card.optString("front"), card.optString("back"), deck.optString("name", "Deck"), (pos + 1).toString() + " / " + indexes.size)
        }
        if (mode == "all") {
            val sequence = buildAllSequence(state)
            if (sequence.isEmpty()) return null
            val pos = wrap(state.optInt("allPosition", 0), sequence.size)
            state.put("allPosition", pos)
            val entry = sequence[pos]
            entry.deck.put("currentIndex", entry.cardIndex)
            return WidgetCard(entry.card.optString("front"), entry.card.optString("back"), entry.deck.optString("name", "Deck"), (pos + 1).toString() + " / " + sequence.size)
        }
        return null
    }

    private fun buildAllSequence(state: JSONObject): List<Entry> {
        val result = ArrayList<Entry>()
        val decks = state.optJSONArray("decks") ?: return result
        for (i in 0 until decks.length()) {
            val deck = decks.optJSONObject(i) ?: continue
            val cards = deck.optJSONArray("cards") ?: continue
            selectedIndices(deck).forEach { index -> cards.optJSONObject(index)?.let { result.add(Entry(deck, index, it)) } }
        }
        return result
    }
    private fun selectedIndices(deck: JSONObject): List<Int> {
        val count = deck.optJSONArray("cards")?.length() ?: return emptyList()
        if (count == 0) return emptyList()
        val cfg = deck.optJSONObject("customCards")
        if (cfg == null || !cfg.optBoolean("enabled", false)) return (0 until count).toList()
        return when (cfg.optString("mode", "all")) {
            "range" -> {
                val from = cfg.optInt("from", 1).coerceIn(1, count)
                val to = cfg.optInt("to", count).coerceIn(1, count)
                if (from > to) emptyList() else (from - 1 until to).toList()
            }
            "selected" -> {
                val values = sortedSetOf<Int>()
                val selection = cfg.optJSONArray("selected") ?: JSONArray()
                for (i in 0 until selection.length()) {
                    val number = selection.optInt(i, 0)
                    if (number in 1..count) values.add(number - 1)
                }
                values.toList()
            }
            else -> (0 until count).toList()
        }
    }
    private fun wrap(value: Int, size: Int) = if (size <= 0) 0 else ((value % size) + size) % size
    private fun readState(context: Context): JSONObject? {
        return try {
            val raw = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getString(STATE_KEY, null) ?: return null
            JSONObject(raw)
        } catch (_: Exception) {
            null
        }
    }
    private fun findDeck(decks: JSONArray, id: String): JSONObject? {
        for (i in 0 until decks.length()) {
            val deck = decks.optJSONObject(i) ?: continue
            if (deck.optString("id") == id) return deck
        }
        return null
    }
    private fun plain(html: String): String = html
        .replace(Regex("(?is)<(script|style)[^>]*>.*?</\\\\1>"), "")
        .replace(Regex("(?i)<br\\\\s*/?>"), "\\n")
        .replace(Regex("(?i)</(p|div|li|tr|h[1-6])\\\\s*>"), "\\n")
        .replace(Regex("<[^>]+>"), "")
        .replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<")
        .replace("&gt;", ">").replace("&quot;", "\\"").trim()
    private fun toSpanned(html: String): CharSequence {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            return Html.fromHtml(html, Html.FROM_HTML_MODE_COMPACT)
        }
        @Suppress("DEPRECATION")
        return Html.fromHtml(html)
    }

    private fun lineCount(text: String, width: Int): Int {
        val chars = max(8, (width / ((width * .085f).coerceIn(10f,18f) * .56f)).toInt())
        return text.split('\n').sumOf { max(1, ceil(it.length.toDouble() / chars).toInt()) }.coerceIn(1,16)
    }
    private fun fontSize(text: String, width: Int, height: Int, lines: Int, share: Float): Float {
        val w = max(80, width - 24)
        val h = max(40f, height * share - 20f)
        val ideal = (w * .095f).coerceIn(11f,25f)
        val widthLimit = if (text.isEmpty()) ideal else (w / (text.length.coerceAtMost(90) * .47f / max(1,lines))).coerceIn(10f,ideal)
        return min(ideal, min(widthLimit, h / (max(1,lines) * 1.32f))).coerceIn(9f,23f)
    }
    private fun controlsUntilKey(id: Int) = "widget_controls_until_" + id

    companion object {
        const val PREFS_NAME = "cardloop_data"
        const val STATE_KEY = "state_json"
        const val PROMPT_SHOWN_KEY = "widget_prompt_shown"
        const val ACTION_WIDGET_TAP = "com.cardloop.app.ACTION_WIDGET_TAP"
        const val ACTION_NEXT_CARD = "com.cardloop.app.ACTION_NEXT_CARD"
        const val ACTION_PREVIOUS_CARD = "com.cardloop.app.ACTION_PREVIOUS_CARD"
        const val ACTION_HIDE_CONTROLS = "com.cardloop.app.ACTION_HIDE_CONTROLS"
        const val ACTION_PIN_COMPLETED = "com.cardloop.app.ACTION_PIN_COMPLETED"
        private const val CONTROLS_VISIBLE_MS = 5_000L
        private const val REQUEST_BASE = 20_000
        private const val HIDE_REQUEST_BASE = 50_000
        fun updateAllWidgets(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, CardLoopWidgetProvider::class.java))
            val provider = CardLoopWidgetProvider()
            ids.forEach { provider.updateWidget(context, manager, it) }
        }
    }
}
