package com.cardloop.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.text.Html
import android.util.TypedValue
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

    override fun onAppWidgetOptionsChanged(
        context: Context,
        manager: AppWidgetManager,
        appWidgetId: Int,
        newOptions: android.os.Bundle
    ) {
        updateWidget(context, manager, appWidgetId)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        when (intent.action) {
            ACTION_NEXT_CARD -> {
                advanceSavedCard(context)
                updateAllWidgets(context)
            }
            ACTION_PIN_COMPLETED -> updateAllWidgets(context)
        }
    }

    private fun advanceSavedCard(context: Context) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val raw = prefs.getString(STATE_KEY, null) ?: return
        try {
            val state = JSONObject(raw)
            val mode = state.optString("widgetMode", "none")
            val decks = state.optJSONArray("decks") ?: JSONArray()
            when (mode) {
                "deck" -> {
                    val deck = findDeck(decks, state.optString("widgetDeckId", "")) ?: return
                    val cards = deck.optJSONArray("cards") ?: return
                    if (cards.length() == 0) return
                    val current = deck.optInt("currentIndex", 0).coerceAtLeast(0) % cards.length()
                    deck.put("currentIndex", (current + 1) % cards.length())
                }
                "all" -> {
                    val flattened = ArrayList<Pair<JSONObject, Int>>()
                    for (deckIndex in 0 until decks.length()) {
                        val deck = decks.optJSONObject(deckIndex) ?: continue
                        val cards = deck.optJSONArray("cards") ?: continue
                        for (cardIndex in 0 until cards.length()) flattened.add(deck to cardIndex)
                    }
                    if (flattened.isEmpty()) return
                    val current = state.optInt("allPosition", 0).coerceAtLeast(0) % flattened.size
                    val active = flattened[current]
                    val activeCards = active.first.optJSONArray("cards") ?: return
                    active.first.put("currentIndex", (active.second + 1) % activeCards.length())
                    state.put("allPosition", (current + 1) % flattened.size)
                }
                else -> {
                    val launch = Intent(context, MainActivity::class.java).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                    }
                    context.startActivity(launch)
                    return
                }
            }
            prefs.edit().putString(STATE_KEY, state.toString()).commit()
        } catch (_: Exception) {
            // A corrupt saved state keeps the widget in its title-only state.
        }
    }

    private fun updateWidget(context: Context, manager: AppWidgetManager, appWidgetId: Int) {
        val options = manager.getAppWidgetOptions(appWidgetId)
        val widthDp = max(
            options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, DEFAULT_WIDTH_DP),
            options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, DEFAULT_WIDTH_DP)
        )
        val heightDp = max(
            options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, DEFAULT_HEIGHT_DP),
            options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, DEFAULT_HEIGHT_DP)
        )
        val state = readState(context)
        val mode = state?.optString("widgetMode", "none") ?: "none"
        val active = currentCard(state, mode)

        if (active == null) {
            val views = RemoteViews(context.packageName, R.layout.widget_card)
            configureClick(context, views, appWidgetId)
            views.setTextViewText(R.id.widget_brand, "CARDLOOP")
            views.setTextViewTextSize(R.id.widget_brand, TypedValue.COMPLEX_UNIT_SP, 17f)
            views.setViewVisibility(R.id.widget_deck, android.view.View.GONE)
            views.setViewVisibility(R.id.widget_count, android.view.View.GONE)
            views.setViewVisibility(R.id.widget_front_container, android.view.View.GONE)
            views.setViewVisibility(R.id.widget_divider, android.view.View.GONE)
            views.setViewVisibility(R.id.widget_back_container, android.view.View.GONE)
            manager.updateAppWidget(appWidgetId, views)
            return
        }

        val frontPlain = toPlainText(active.front)
        val backPlain = toPlainText(active.back)
        val frontLines = estimateLines(frontPlain, widthDp)
        val backLines = estimateLines(backPlain, widthDp)
        val layout = when {
            frontLines > backLines + 1 -> R.layout.widget_card_front_long
            backLines > frontLines + 1 -> R.layout.widget_card
            else -> R.layout.widget_card_balanced
        }
        val views = RemoteViews(context.packageName, layout)
        configureClick(context, views, appWidgetId)
        views.setTextViewText(R.id.widget_brand, "CARDLOOP")
        views.setTextViewText(R.id.widget_deck, active.deckName)
        views.setTextViewText(R.id.widget_count, active.positionLabel)
        views.setTextViewText(R.id.widget_front, htmlToSpanned(active.front))
        views.setTextViewText(R.id.widget_back, htmlToSpanned(active.back))
        views.setTextViewTextSize(
            R.id.widget_brand, TypedValue.COMPLEX_UNIT_SP,
            (widthDp * 0.075f).coerceIn(10f, 14f)
        )
        views.setTextViewTextSize(
            R.id.widget_deck, TypedValue.COMPLEX_UNIT_SP,
            (widthDp * 0.085f).coerceIn(10f, 15f)
        )
        views.setTextViewTextSize(
            R.id.widget_front, TypedValue.COMPLEX_UNIT_SP,
            calculateFontSize(frontPlain, widthDp, heightDp, frontLines, 0.43f)
        )
        views.setTextViewTextSize(
            R.id.widget_back, TypedValue.COMPLEX_UNIT_SP,
            calculateFontSize(backPlain, widthDp, heightDp, backLines, 0.57f)
        )
        manager.updateAppWidget(appWidgetId, views)
    }

    private fun configureClick(context: Context, views: RemoteViews, appWidgetId: Int) {
        val intent = Intent(context, CardLoopWidgetProvider::class.java).apply {
            action = ACTION_NEXT_CARD
            data = android.net.Uri.parse("cardloop://widget/$appWidgetId")
        }
        val pending = PendingIntent.getBroadcast(
            context, appWidgetId, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        views.setOnClickPendingIntent(R.id.widget_root, pending)
    }

    private data class WidgetCard(
        val front: String,
        val back: String,
        val deckName: String,
        val positionLabel: String
    )

    private fun currentCard(state: JSONObject?, mode: String): WidgetCard? {
        if (state == null) return null
        val decks = state.optJSONArray("decks") ?: return null
        if (mode == "deck") {
            val deck = findDeck(decks, state.optString("widgetDeckId", "")) ?: return null
            val cards = deck.optJSONArray("cards") ?: return null
            if (cards.length() == 0) return null
            val index = deck.optInt("currentIndex", 0).coerceAtLeast(0) % cards.length()
            val card = cards.optJSONObject(index) ?: return null
            return WidgetCard(
                card.optString("front"), card.optString("back"),
                deck.optString("name", "Deck"), (index + 1).toString() + " / " + cards.length()
            )
        }
        if (mode == "all") {
            val flattened = ArrayList<Triple<JSONObject, JSONObject, Int>>()
            for (deckIndex in 0 until decks.length()) {
                val deck = decks.optJSONObject(deckIndex) ?: continue
                val cards = deck.optJSONArray("cards") ?: continue
                for (cardIndex in 0 until cards.length()) {
                    val card = cards.optJSONObject(cardIndex) ?: continue
                    flattened.add(Triple(deck, card, cardIndex))
                }
            }
            if (flattened.isEmpty()) return null
            val index = state.optInt("allPosition", 0).coerceAtLeast(0) % flattened.size
            val item = flattened[index]
            return WidgetCard(
                item.second.optString("front"), item.second.optString("back"),
                item.first.optString("name", "All Decks"), (index + 1).toString() + " / " + flattened.size
            )
        }
        return null
    }

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
        for (index in 0 until decks.length()) {
            val deck = decks.optJSONObject(index) ?: continue
            if (deck.optString("id") == id) return deck
        }
        return null
    }

    private fun toPlainText(html: String): String {
        return html.replace(Regex("(?is)<(script|style)[^>]*>.*?</\\1>"), "")
            .replace(Regex("(?i)<br\\s*/?>"), "\n")
            .replace(Regex("(?i)</(p|div|li|tr|h[1-6])\\s*>"), "\n")
            .replace(Regex("<[^>]+>"), "")
            .replace("&nbsp;", " ")
            .replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .trim()
    }

    private fun htmlToSpanned(html: String): CharSequence {
        val safe = html.replace(Regex("(?is)<(script|style|iframe|object)[^>]*>.*?</\\1>"), "")
            .replace(Regex("(?i)<(img|video|audio|svg|form)[^>]*>"), "")
            .replace(Regex("(?i)\\s(on\\w+|style|src|href)\\s*=\\s*(['\"]).*?\\2"), "")
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            Html.fromHtml(safe, Html.FROM_HTML_MODE_COMPACT)
        } else {
            @Suppress("DEPRECATION")
            Html.fromHtml(safe)
        }
    }

    private fun estimateLines(text: String, widthDp: Int): Int {
        val baseSize = (widthDp * 0.085f).coerceIn(10f, 18f)
        val charsPerLine = max(8, (widthDp / (baseSize * 0.56f)).toInt())
        return text.split('\n').sumOf { line ->
            max(1, ceil(line.length.toDouble() / charsPerLine).toInt())
        }.coerceIn(1, 16)
    }

    private fun calculateFontSize(
        text: String,
        widthDp: Int,
        heightDp: Int,
        lines: Int,
        heightShare: Float
    ): Float {
        val availableWidth = max(80, widthDp - 24)
        val availableHeight = max(45f, heightDp * heightShare - 24f)
        val ideal = (availableWidth * 0.095f).coerceIn(11f, 25f)
        val widthLimit = if (text.isEmpty()) ideal else {
            (availableWidth / (text.length.coerceAtMost(90) * 0.47f / max(1, lines))).coerceIn(10f, ideal)
        }
        val heightLimit = availableHeight / (max(1, lines) * 1.32f)
        return min(ideal, min(widthLimit, heightLimit)).coerceIn(9f, 23f)
    }

    companion object {
        const val PREFS_NAME = "cardloop_data"
        const val STATE_KEY = "state_json"
        const val PROMPT_SHOWN_KEY = "widget_prompt_shown"
        const val ACTION_NEXT_CARD = "com.cardloop.app.ACTION_NEXT_CARD"
        const val ACTION_PIN_COMPLETED = "com.cardloop.app.ACTION_PIN_COMPLETED"
        private const val DEFAULT_WIDTH_DP = 180
        private const val DEFAULT_HEIGHT_DP = 240

        fun updateAllWidgets(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, CardLoopWidgetProvider::class.java))
            val provider = CardLoopWidgetProvider()
            ids.forEach { provider.updateWidget(context, manager, it) }
        }
    }
}
