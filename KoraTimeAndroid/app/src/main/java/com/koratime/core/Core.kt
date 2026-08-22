package com.koratime.core

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

/** خطأ بصياغة عربية تُعرض للمستخدم مباشرة. */
class KTError(message: String) : Exception(message)

val ktJson = Json {
    ignoreUnknownKeys = true
    isLenient = true
    coerceInputValues = true
}

/** طلبات الشبكة: مهلة قصيرة، ذاكرة مؤقّتة في الرام، وأخطاء مفهومة. */
object Http {

    private const val USER_AGENT = "KoraTime/1.0 (Android)"

    // الأخبار تجلب عدّة خلاصات في وقت واحد، فالذاكرة المؤقّتة تُكتب من أكثر
    // من خيط — HashMap عادية قد تفسد أو تعلّق تحت هذا الضغط.
    private val cache = ConcurrentHashMap<String, Pair<Long, String>>()

    suspend fun text(
        url: String,
        headers: Map<String, String> = emptyMap(),
        maxAgeSeconds: Long = 0
    ): String = withContext(Dispatchers.IO) {
        val now = System.currentTimeMillis()
        if (maxAgeSeconds > 0) {
            cache[url]?.let { (stamp, body) ->
                if (now - stamp < TimeUnit.SECONDS.toMillis(maxAgeSeconds)) return@withContext body
            }
        }

        var lastError: Exception? = null
        repeat(3) { attempt ->
            try {
                val body = fetch(url, headers)
                cache[url] = now to body
                if (cache.size > 60) {
                    cache.entries.sortedBy { it.value.first }.take(20).forEach { cache.remove(it.key) }
                }
                return@withContext body
            } catch (error: Exception) {
                lastError = error
                if (attempt < 2) Thread.sleep(600L * (attempt + 1))
            }
        }
        throw lastError ?: KTError("تعذّر الاتصال بالمصدر.")
    }

    private fun fetch(url: String, headers: Map<String, String>): String {
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 15_000
            connection.readTimeout = 20_000
            connection.instanceFollowRedirects = true
            connection.setRequestProperty("User-Agent", USER_AGENT)
            connection.setRequestProperty("Accept-Language", "ar,en;q=0.8")
            headers.forEach { (key, value) -> connection.setRequestProperty(key, value) }

            val code = connection.responseCode
            if (code !in 200..299) {
                throw KTError(
                    when (code) {
                        401, 403 -> "المصدر رفض الطلب ($code). تأكّد من المفتاح في الإعدادات."
                        429 -> "تجاوزت حدّ الطلبات المسموح به. انتظر قليلاً."
                        in 500..599 -> "خادم المصدر لا يستجيب حالياً ($code)."
                        else -> "تعذّر جلب البيانات (رمز $code)."
                    }
                )
            }
            return connection.inputStream.bufferedReader().use(BufferedReader::readText)
        } finally {
            connection.disconnect()
        }
    }
}

/**
 * التواريخ: تقويم ميلادي، لغة عربية، أرقام لاتينية، وتوقيت الجهاز.
 * الأرقام اللاتينية مقصودة — هي الشائعة في تطبيقات الخليج.
 */
object KTDate {

    private val arabic: Locale = Locale.forLanguageTag("ar-SA-u-ca-gregory-nu-latn")

    private fun formatter(pattern: String, utc: Boolean = false) =
        SimpleDateFormat(pattern, arabic).apply {
            if (utc) timeZone = TimeZone.getTimeZone("UTC")
        }

    val apiDay: SimpleDateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.US)

    fun time(date: Date): String = formatter("HH:mm").format(date)
    fun weekday(date: Date): String = formatter("EEEE").format(date)
    fun shortWeekday(date: Date): String = formatter("EEE").format(date)
    fun dayNumber(date: Date): String = formatter("d").format(date)
    fun shortMonth(date: Date): String = formatter("MMM").format(date)
    fun fullDay(date: Date): String = formatter("EEEE d MMMM yyyy").format(date)

    fun startOfDay(date: Date): Date = Calendar.getInstance().apply {
        time = date
        set(Calendar.HOUR_OF_DAY, 0)
        set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
    }.time

    fun adding(days: Int, to: Date): Date = Calendar.getInstance().apply {
        time = to
        add(Calendar.DAY_OF_YEAR, days)
    }.time

    fun isSameDay(a: Date, b: Date): Boolean {
        val first = Calendar.getInstance().apply { time = a }
        val second = Calendar.getInstance().apply { time = b }
        return first.get(Calendar.YEAR) == second.get(Calendar.YEAR) &&
            first.get(Calendar.DAY_OF_YEAR) == second.get(Calendar.DAY_OF_YEAR)
    }

    fun dayLabel(date: Date): String {
        val today = startOfDay(Date())
        return when {
            isSameDay(date, today) -> "اليوم"
            isSameDay(date, adding(-1, today)) -> "أمس"
            isSameDay(date, adding(1, today)) -> "غداً"
            else -> weekday(date)
        }
    }

    fun ago(date: Date): String {
        val seconds = (System.currentTimeMillis() - date.time) / 1000
        return when {
            seconds < 60 -> "الآن"
            seconds < 3600 -> "قبل ${seconds / 60} دقيقة"
            seconds < 86_400 -> "قبل ${seconds / 3600} ساعة"
            seconds < 604_800 -> "قبل ${seconds / 86_400} يوم"
            else -> fullDay(date)
        }
    }

    fun countdown(to: Date): String? {
        val seconds = (to.time - System.currentTimeMillis()) / 1000
        if (seconds <= 0) return null
        val days = seconds / 86_400
        val hours = (seconds % 86_400) / 3600
        val minutes = (seconds % 3600) / 60
        return when {
            days > 0 -> "بعد $days ي $hours س"
            hours > 0 -> "بعد $hours س $minutes د"
            else -> "بعد $minutes د"
        }
    }

    private val utcPatterns = listOf(
        "yyyy-MM-dd'T'HH:mm:ssXXX",
        "yyyy-MM-dd'T'HH:mm:ss'Z'",
        "yyyy-MM-dd'T'HH:mm:ss",
        "yyyy-MM-dd HH:mm:ss",
        "yyyy-MM-dd HH:mm",
        "yyyy-MM-dd"
    )

    private val feedPatterns = listOf(
        "EEE, dd MMM yyyy HH:mm:ss Z",
        "EEE, dd MMM yyyy HH:mm:ss zzz",
        "EEE, dd MMM yyyy HH:mm Z",
        "dd MMM yyyy HH:mm:ss Z"
    )

    fun parseUtc(text: String?): Date? {
        val value = text?.trim().orEmpty()
        if (value.isEmpty()) return null
        for (pattern in utcPatterns) {
            try {
                val parser = SimpleDateFormat(pattern, Locale.US)
                parser.timeZone = TimeZone.getTimeZone("UTC")
                parser.isLenient = false
                return parser.parse(value) ?: continue
            } catch (_: Exception) {
                continue
            }
        }
        return null
    }

    fun parseFeedDate(text: String?): Date? {
        val value = text?.trim().orEmpty()
        if (value.isEmpty()) return null
        for (pattern in feedPatterns) {
            try {
                val parser = SimpleDateFormat(pattern, Locale.US)
                parser.isLenient = false
                return parser.parse(value) ?: continue
            } catch (_: Exception) {
                continue
            }
        }
        return parseUtc(value)
    }

    /** يدمج "2026-08-22" مع "19:00:00" بتوقيت UTC. */
    fun combine(day: String?, clock: String?): Date? {
        if (day.isNullOrBlank()) return null
        if (clock.isNullOrBlank()) return parseUtc(day)
        var time = clock.substringBefore("+")
        if (time.length == 5) time += ":00"
        return parseUtc("$day $time")
    }
}

/** تعريب أسماء الفرق والبطولات القادمة إنجليزية من مصادر البيانات. */
object ArabicNames {

    private var leagues: Map<String, String> = emptyMap()
    private var teams: Map<String, String> = emptyMap()
    private var loaded = false

    fun load(context: Context) {
        if (loaded) return
        loaded = true
        try {
            val raw = context.assets.open("ar-names.json").bufferedReader().use { it.readText() }
            val payload = ktJson.decodeFromString<Map<String, Map<String, String>>>(raw)
            leagues = payload["leagues"].orEmpty().mapKeys { normalize(it.key) }
            teams = payload["teams"].orEmpty().mapKeys { normalize(it.key) }
        } catch (_: Exception) {
            // بلا قاموس تظهر الأسماء الإنجليزية — أفضل من الانهيار
        }
    }

    private fun normalize(name: String): String {
        var text = name.lowercase(Locale.US)
        listOf(" fc", "fc ", " f.c.", " sc", " cf ", " cf", " afc", " sfc", " club").forEach {
            text = text.replace(it, " ")
        }
        return text.replace("-", " ").replace(".", " ")
            .split(" ").filter { it.isNotBlank() }.joinToString(" ")
    }

    fun team(name: String, enabled: Boolean = true): String =
        if (!enabled || name.isBlank()) name else teams[normalize(name)] ?: name

    fun league(name: String, enabled: Boolean = true): String {
        if (!enabled || name.isBlank()) return name
        val key = normalize(name)
        leagues[key]?.let { return it }
        leagues.entries.firstOrNull { it.key.length > 6 && key.contains(it.key) }?.let { return it.value }
        return name
    }

    fun monogram(name: String): String {
        val parts = name.split(" ").filter { it.isNotBlank() }
        if (parts.isEmpty()) return "؟"
        if (parts.size >= 2) return "${parts[0].first()}${parts[1].first()}"
        return parts[0].take(2)
    }
}

/** إعدادات المستخدم — محفوظة محلياً على الجهاز فقط. */
class Settings(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences("koratime", Context.MODE_PRIVATE)

    var sportsDbKey: String
        get() = prefs.getString("sportsdb.key", "123") ?: "123"
        set(value) = prefs.edit().putString("sportsdb.key", value).apply()

    var arabicNames: Boolean
        get() = prefs.getBoolean("arabicNames", true)
        set(value) = prefs.edit().putBoolean("arabicNames", value).apply()

    var autoPlayOnOpen: Boolean
        get() = prefs.getBoolean("autoPlay", true)
        set(value) = prefs.edit().putBoolean("autoPlay", value).apply()

    var showDemoChannels: Boolean
        get() = prefs.getBoolean("showDemo", true)
        set(value) = prefs.edit().putBoolean("showDemo", value).apply()

    var lastChannelId: String?
        get() = prefs.getString("lastChannel", null)
        set(value) = prefs.edit().putString("lastChannel", value).apply()

    /** روابط قوائم M3U/JSON التي يضيفها المستخدم. */
    var playlists: List<String>
        get() = prefs.getStringSet("playlists", emptySet())?.sorted().orEmpty()
        set(value) = prefs.edit().putStringSet("playlists", value.toSet()).apply()

    var feeds: List<String>
        get() = prefs.getStringSet("feeds", null)?.sorted() ?: defaultFeeds
        set(value) = prefs.edit().putStringSet("feeds", value.toSet()).apply()

    companion object {
        val defaultFeeds: List<String> = listOf(
            googleNews("كرة القدم"),
            googleNews("دوري روشن السعودي"),
            googleNews("دوري أبطال أوروبا"),
            "https://feeds.bbci.co.uk/arabic/sports/rss.xml"
        )

        fun googleNews(query: String): String {
            val encoded = java.net.URLEncoder.encode(query, "UTF-8")
            return "https://news.google.com/rss/search?q=$encoded&hl=ar&gl=SA&ceid=SA:ar"
        }
    }
}
