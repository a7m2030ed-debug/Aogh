package com.koratime.matches

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.koratime.core.ArabicNames
import com.koratime.R
import com.koratime.core.AppText
import com.koratime.core.Catalog
import com.koratime.core.Http
import com.koratime.core.KTDate
import com.koratime.core.Settings
import com.koratime.core.ktJson
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import java.util.Date
import java.util.Locale

enum class MatchStatus { SCHEDULED, LIVE, FINISHED, POSTPONED, CANCELED;

    val label: String
        get() = when (this) {
            SCHEDULED -> AppText.get(R.string.status_scheduled)
            LIVE -> AppText.get(R.string.status_live)
            FINISHED -> AppText.get(R.string.status_finished)
            POSTPONED -> AppText.get(R.string.status_postponed)
            CANCELED -> AppText.get(R.string.status_canceled)
        }
}

data class Match(
    val id: String,
    val kickoff: Date?,
    val homeName: String,
    val awayName: String,
    val homeBadge: String?,
    val awayBadge: String?,
    val homeScore: Int?,
    val awayScore: Int?,
    val status: MatchStatus,
    val progress: String?,
    val competition: String,
    val competitionBadge: String?,
    val venue: String?,
    val round: String?
) {
    val isLive: Boolean get() = status == MatchStatus.LIVE
    val hasScore: Boolean get() = homeScore != null && awayScore != null

    fun homeTitle(arabic: Boolean) = ArabicNames.team(homeName, arabic)
    fun awayTitle(arabic: Boolean) = ArabicNames.team(awayName, arabic)
    fun competitionTitle(arabic: Boolean) = ArabicNames.league(competition, arabic)

    val centerCaption: String
        get() = when (status) {
            MatchStatus.LIVE -> progress?.takeIf { it.isNotBlank() }
                ?: AppText.get(R.string.status_live)
            MatchStatus.SCHEDULED -> kickoff?.let { KTDate.dayLabel(it) }
                ?: AppText.get(R.string.status_scheduled)
            else -> status.label
        }

    fun matches(query: String, arabic: Boolean): Boolean {
        val trimmed = query.trim()
        if (trimmed.isEmpty()) return true
        val haystack = listOf(
            homeName, awayName, competition,
            homeTitle(arabic), awayTitle(arabic), competitionTitle(arabic)
        ).joinToString(" ")
        return haystack.contains(trimmed, ignoreCase = true)
    }
}

data class MatchSection(
    val id: String,
    val title: String,
    val badge: String?,
    val matches: List<Match>
) {
    val liveCount: Int get() = matches.count { it.isLive }
}

/**
 * ترتيب البطولات: العربية والكبرى أولاً.
 *
 * كل بطولة باسمين لأن عنوان الدوري يصل عربياً أو إنجليزياً بحسب لغة
 * التطبيق وإعداد التعريب — ومطابقة العربية وحدها كانت تُسقط الترتيب
 * كلّه عند التبديل إلى الإنجليزية.
 */
object CompetitionPriority {
    private val ranked = listOf(
        "دوري روشن السعودي" to "Saudi Pro League",
        "دوري أبطال آسيا للنخبة" to "AFC Champions League Elite",
        "دوري أبطال آسيا" to "AFC Champions League",
        "كأس خادم الحرمين" to "King Cup",
        "دوري يلو السعودي" to "Saudi First Division",
        "دوري أبطال أوروبا" to "UEFA Champions League",
        "الدوري الإنجليزي الممتاز" to "English Premier League",
        "الدوري الإسباني" to "Spanish La Liga",
        "الدوري الإيطالي" to "Italian Serie A",
        "الدوري الألماني" to "German Bundesliga",
        "الدوري الفرنسي" to "French Ligue 1",
        "الدوري الأوروبي" to "UEFA Europa League",
        "الدوري المصري الممتاز" to "Egyptian Premier League",
        "دوري نجوم قطر" to "Qatar Stars League",
        "دوري أدنوك للمحترفين" to "UAE Pro League",
        "دوري أبطال أفريقيا" to "CAF Champions League",
        "كأس العالم" to "World Cup",
        "كأس آسيا" to "AFC Asian Cup",
        "كأس أمم أفريقيا" to "Africa Cup of Nations"
    )

    fun rank(title: String): Int {
        val needle = title.lowercase(Locale.US)
        ranked.forEachIndexed { position, (ar, en) ->
            if (title == ar || needle == en.lowercase(Locale.US)) return position
        }
        ranked.forEachIndexed { position, (ar, en) ->
            if (title.contains(ar) || needle.contains(en.lowercase(Locale.US))) return position
        }
        return ranked.size + 10
    }
}

/**
 * TheSportsDB — يعمل بلا تسجيل بمفتاح تجريبي مشترك.
 * نقرأ الحقول يدوياً لأن المصدر يرسل الأرقام تارة نصاً وتارة رقماً.
 */
class SportsDbProvider(private val apiKey: String) {

    val attribution: String get() = AppText.get(R.string.attribution_sportsdb)

    suspend fun matches(day: Date): List<Match> {
        val key = apiKey.trim().ifEmpty { "123" }
        val stamp = KTDate.apiDay.format(day)
        val url = "https://www.thesportsdb.com/api/v1/json/$key/eventsday.php?d=$stamp&s=Soccer"
        val isToday = KTDate.isSameDay(day, Date())

        val body = Http.text(url, maxAgeSeconds = if (isToday) 45 else 1800)
        val root = ktJson.parseToJsonElement(body).jsonObject
        val events = root["events"] ?: return emptyList()
        if (events is JsonPrimitive) return emptyList()

        return events.jsonArray.mapNotNull { convert(it.jsonObject) }
    }

    private fun JsonObject.str(key: String): String? {
        val element = this[key] ?: return null
        if (element !is JsonPrimitive) return null
        if (element.content.equals("null", ignoreCase = true)) return null
        return element.content.trim().ifEmpty { null }
    }

    private fun convert(event: JsonObject): Match? {
        val home = event.str("strHomeTeam") ?: return null
        val away = event.str("strAwayTeam") ?: return null
        if (event.str("strSport")?.equals("Soccer", ignoreCase = true) == false) return null

        val kickoff = KTDate.parseUtc(event.str("strTimestamp"))
            ?: KTDate.combine(event.str("dateEvent"), event.str("strTime"))
        val raw = event.str("strStatus")
        val status = resolveStatus(raw, event.str("strPostponed"), kickoff)

        return Match(
            id = event.str("idEvent") ?: "$home-$away-${event.str("dateEvent")}",
            kickoff = kickoff,
            homeName = home,
            awayName = away,
            homeBadge = event.str("strHomeTeamBadge"),
            awayBadge = event.str("strAwayTeamBadge"),
            homeScore = event.str("intHomeScore")?.toIntOrNull(),
            awayScore = event.str("intAwayScore")?.toIntOrNull(),
            status = status,
            progress = progressText(raw, status),
            competition = event.str("strLeague") ?: AppText.get(R.string.other_competitions),
            competitionBadge = event.str("strLeagueBadge"),
            venue = event.str("strVenue"),
            round = event.str("intRound")
        )
    }

    private fun resolveStatus(raw: String?, postponed: String?, kickoff: Date?): MatchStatus {
        if (postponed?.lowercase(Locale.US) == "yes") return MatchStatus.POSTPONED
        val code = raw.orEmpty().trim().uppercase(Locale.US)

        if (code in setOf("FT", "AET", "PEN", "MATCH FINISHED", "FINISHED", "ENDED")) {
            return MatchStatus.FINISHED
        }
        if (code.contains("POSTPON")) return MatchStatus.POSTPONED
        if (code.contains("CANCEL") || code.contains("ABANDON")) return MatchStatus.CANCELED
        if (code in setOf("1H", "2H", "HT", "ET", "BT", "P", "LIVE", "IN PLAY", "INPLAY")) {
            return MatchStatus.LIVE
        }
        code.takeWhile { it.isDigit() }.toIntOrNull()?.let { minute ->
            if (minute in 1..130) return MatchStatus.LIVE
        }

        val start = kickoff ?: return MatchStatus.SCHEDULED
        val elapsed = (System.currentTimeMillis() - start.time) / 1000.0
        return when {
            elapsed < 0 -> MatchStatus.SCHEDULED
            elapsed > 2.6 * 3600 -> MatchStatus.FINISHED
            else -> MatchStatus.LIVE
        }
    }

    private fun progressText(raw: String?, status: MatchStatus): String? {
        if (status != MatchStatus.LIVE) return null
        return when (val code = raw.orEmpty().trim().uppercase(Locale.US)) {
            "1H" -> AppText.get(R.string.half_first)
            "2H" -> AppText.get(R.string.half_second)
            "HT" -> AppText.get(R.string.half_time)
            "ET" -> AppText.get(R.string.extra_time)
            "PEN", "P" -> AppText.get(R.string.penalties)
            "" -> null
            else -> if (code.takeWhile { it.isDigit() }.toIntOrNull() != null) "$code′" else null
        }
    }
}

class MatchesViewModel(private val settings: Settings) : ViewModel() {

    var selectedDay by mutableStateOf(KTDate.startOfDay(Date()))
        private set
    var query by mutableStateOf("")
    var liveOnly by mutableStateOf(false)
    var isLoading by mutableStateOf(false)
        private set
    var errorMessage by mutableStateOf<String?>(null)
        private set
    var lastUpdated by mutableStateOf<Date?>(null)
        private set

    private val cache = HashMap<String, List<Match>>()
    private var loadJob: Job? = null
    private var refreshJob: Job? = null

    val days: List<Date>
        get() {
            val today = KTDate.startOfDay(Date())
            return (-4..10).map { KTDate.adding(it, today) }
        }

    val attribution: String
        get() = if (settings.apiFootballKey.isNotBlank()) {
            ApiFootballProvider(settings.apiFootballKey).attribution
        } else {
            SportsDbProvider(settings.sportsDbKey).attribution
        }

    private val dayMatches: List<Match>
        get() = cache[KTDate.apiDay.format(selectedDay)].orEmpty()

    val liveCount: Int get() = dayMatches.count { it.isLive }

    /**
     * رتبة الدوري ضمن ما اختاره المستخدم — الأصغر أولاً، ومن لم يُختر
     * يأخذ رتبة بعد الجميع. المطابقة بالاحتواء لأن المصدر يكتب الاسم
     * بصيغ متقاربة ("Saudi Pro League" و"Saudi Professional League").
     */
    private fun favoriteRank(title: String): Int {
        val chosen = settings.favoriteLeagues
        if (chosen.isEmpty()) return 0
        val needle = title.lowercase(Locale.US)
        chosen.forEachIndexed { position, id ->
            val league = Catalog.league(id) ?: return@forEachIndexed
            if (needle.contains(league.ar.lowercase(Locale.US)) ||
                needle.contains(league.en.lowercase(Locale.US)) ||
                league.ar == title
            ) {
                return position
            }
        }
        return chosen.size + 1
    }

    val sections: List<MatchSection>
        get() {
            val arabic = settings.arabicNames
            val visible = dayMatches.filter {
                (!liveOnly || it.isLive) && it.matches(query, arabic)
            }
            return visible
                .groupBy { it.competitionTitle(arabic) }
                .map { (title, items) ->
                    MatchSection(
                        id = title,
                        title = title,
                        badge = items.firstOrNull()?.competitionBadge,
                        matches = items.sortedWith(
                            compareByDescending<Match> { it.isLive }
                                .thenBy { it.kickoff?.time ?: Long.MAX_VALUE }
                        )
                    )
                }
                // الأهمية قبل «فيها مباراة مباشرة»: كان دوري صغير فيه مباراة
                // جارية يقفز فوق روشن والدوريات الكبرى، وهذا عكس المطلوب.
                // ودوريات المستخدم المختارة تسبق الجميع.
                .sortedWith(
                    compareBy<MatchSection> { favoriteRank(it.title) }
                        .thenBy { CompetitionPriority.rank(it.title) }
                        .thenByDescending { it.liveCount > 0 }
                        .thenBy { it.title }
                )
        }

    fun select(day: Date) {
        if (KTDate.isSameDay(day, selectedDay)) return
        selectedDay = KTDate.startOfDay(day)
        errorMessage = null
        load()
    }

    fun loadIfNeeded() {
        if (!cache.containsKey(KTDate.apiDay.format(selectedDay))) load()
    }

    fun load(force: Boolean = false) {
        val day = selectedDay
        val key = KTDate.apiDay.format(day)
        if (!force && cache.containsKey(key)) return

        loadJob?.cancel()
        isLoading = true
        errorMessage = null

        loadJob = viewModelScope.launch {
            try {
                // مفتاح API-Football يعني تغطية روشن والدوريات الكبرى؛
                // بلا مفتاح نبقى على المصدر القديم بحدوده المعروفة.
                val apiKey = settings.apiFootballKey
                val result = if (apiKey.isNotBlank()) {
                    ApiFootballProvider(apiKey).matches(day)
                        .ifEmpty { SportsDbProvider(settings.sportsDbKey).matches(day) }
                } else {
                    SportsDbProvider(settings.sportsDbKey).matches(day)
                }
                cache[key] = result
                lastUpdated = Date()
                errorMessage = null
            } catch (error: Exception) {
                if (!cache.containsKey(key)) {
                    errorMessage = error.message ?: AppText.get(R.string.matches_fetch_failed)
                }
            } finally {
                isLoading = false
            }
        }
    }

    fun refresh() {
        load(force = true)
    }

    /** تحديث صامت كل دقيقة ما دامت الشاشة ظاهرة. */
    fun startLiveUpdates() {
        if (refreshJob?.isActive == true) return
        refreshJob = viewModelScope.launch {
            while (true) {
                delay(60_000)
                if (liveCount > 0 || KTDate.isSameDay(selectedDay, Date())) {
                    load(force = true)
                }
            }
        }
    }

    fun stopLiveUpdates() {
        refreshJob?.cancel()
        refreshJob = null
    }

    fun invalidate() {
        cache.clear()
        load(force = true)
    }
}
