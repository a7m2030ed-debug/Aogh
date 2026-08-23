package com.koratime.matches

import com.koratime.R
import com.koratime.core.AppText
import com.koratime.core.ArabicNames
import com.koratime.core.Http
import com.koratime.core.KTDate
import com.koratime.core.ktJson
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import java.util.Date
import java.util.Locale

/**
 * API-Football — المصدر الوحيد المجاني الذي يغطّي دوري روشن والدوريات
 * الكبرى معاً.
 *
 * جرّبنا البدائل بلا مفتاح فسقطت كلها: TheSportsDB بمفتاحه المشترك يُرجع
 * ثلاث مباريات يومياً من دوريات هامشية، و football-data و Sofascore يردّان
 * ٤٠٣، و OpenLigaDB ألماني فقط. لذلك يحتاج هذا المصدر مفتاحاً مجانياً
 * يضعه المستخدم في الإعدادات — ومن لم يضعه يبقى على المصدر القديم.
 *
 * طلب واحد لكل يوم معروض، والنتيجة تُخزَّن، فحصّة الخطة المجانية تكفي.
 */
class ApiFootballProvider(private val apiKey: String) {

    private companion object {
        val COUNTRY_PREFIX = mapOf(
            "saudi-arabia" to "Saudi", "saudi arabia" to "Saudi",
            "united-arab-emirates" to "UAE", "united arab emirates" to "UAE",
            "qatar" to "Qatar", "egypt" to "Egyptian", "kuwait" to "Kuwait",
            "bahrain" to "Bahrain", "oman" to "Oman", "jordan" to "Jordan",
            "morocco" to "Moroccan", "algeria" to "Algerian", "tunisia" to "Tunisian"
        )
    }

    val attribution: String get() = AppText.get(R.string.attribution_apifootball)

    suspend fun matches(day: Date): List<Match> {
        val key = apiKey.trim()
        if (key.isEmpty()) return emptyList()

        val stamp = KTDate.apiDay.format(day)
        val isToday = KTDate.isSameDay(day, Date())
        val body = Http.text(
            "https://v3.football.api-sports.io/fixtures?date=$stamp",
            headers = mapOf("x-apisports-key" to key),
            maxAgeSeconds = if (isToday) 45 else 1800
        )

        val root = ktJson.parseToJsonElement(body).jsonObject
        val response = root["response"] ?: return emptyList()
        if (response is JsonPrimitive) return emptyList()
        return response.jsonArray.mapNotNull { convert(it.jsonObject) }
    }

    private fun JsonObject.obj(key: String): JsonObject? =
        (this[key] as? JsonObject)

    private fun JsonObject.str(key: String): String? {
        val element = this[key] as? JsonPrimitive ?: return null
        if (element.content.equals("null", ignoreCase = true)) return null
        return element.content.trim().ifEmpty { null }
    }

    private fun JsonObject.int(key: String): Int? = str(key)?.toIntOrNull()

    private fun convert(item: JsonObject): Match? {
        val fixture = item.obj("fixture") ?: return null
        val teams = item.obj("teams") ?: return null
        val home = teams.obj("home") ?: return null
        val away = teams.obj("away") ?: return null
        val homeName = home.str("name") ?: return null
        val awayName = away.str("name") ?: return null

        val league = item.obj("league")
        val goals = item.obj("goals")
        val statusBlock = fixture.obj("status")
        val short = statusBlock?.str("short").orEmpty().uppercase(Locale.US)
        val elapsed = statusBlock?.int("elapsed")

        val kickoff = KTDate.parseUtc(fixture.str("date"))
        val status = when {
            short in setOf("FT", "AET", "PEN") -> MatchStatus.FINISHED
            short in setOf("PST") -> MatchStatus.POSTPONED
            short in setOf("CANC", "ABD", "AWD", "WO") -> MatchStatus.CANCELED
            short in setOf("1H", "2H", "HT", "ET", "BT", "P", "LIVE", "INT") -> MatchStatus.LIVE
            short in setOf("TBD", "NS") -> MatchStatus.SCHEDULED
            else -> MatchStatus.SCHEDULED
        }

        return Match(
            id = fixture.str("id") ?: "$homeName-$awayName-${fixture.str("date")}",
            kickoff = kickoff,
            homeName = homeName,
            awayName = awayName,
            homeBadge = home.str("logo"),
            awayBadge = away.str("logo"),
            homeScore = goals?.int("home"),
            awayScore = goals?.int("away"),
            status = status,
            progress = progressText(short, elapsed, status),
            competition = competitionName(league),
            competitionBadge = league?.str("logo"),
            venue = fixture.obj("venue")?.str("name"),
            round = league?.str("round")
        )
    }

    /**
     * أسماء البطولات في هذا المصدر تأتي بلا بلدها أحياناً: دوري روشن اسمه
     * «Pro League» وكأس الملك «King Cup»، والاسمان مشتركان بين دول عدّة —
     * وبلجيكا نفسها لها «Pro League». فما لم يكن الاسم معروفاً بذاته نُلحق
     * به اسم البلد المختصر، فيصير مفتاحاً صالحاً للتعريب وللترتيب معاً بدل
     * أن يظهر روشن باسم عامّ في ذيل القائمة.
     */
    private fun competitionName(league: JsonObject?): String {
        val raw = league?.str("name").orEmpty()
        if (raw.isEmpty()) return AppText.get(R.string.other_competitions)

        // الاسم معروف كما هو («Premier League» مثلاً) فلا يُمَسّ.
        if (ArabicNames.league(raw) != raw) return raw

        val country = league?.str("country").orEmpty().lowercase(Locale.US)
        val prefix = COUNTRY_PREFIX[country] ?: return raw
        if (raw.contains(prefix, ignoreCase = true)) return raw
        return "$prefix $raw"
    }

    private fun progressText(short: String, elapsed: Int?, status: MatchStatus): String? {
        if (status != MatchStatus.LIVE) return null
        return when (short) {
            "HT" -> AppText.get(R.string.half_time)
            "ET" -> AppText.get(R.string.extra_time)
            "P" -> AppText.get(R.string.penalties)
            "1H" -> elapsed?.let { "$it′" } ?: AppText.get(R.string.half_first)
            "2H" -> elapsed?.let { "$it′" } ?: AppText.get(R.string.half_second)
            else -> elapsed?.let { "$it′" }
        }
    }
}
