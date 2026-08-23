package com.koratime.core

import android.content.Context
import android.content.SharedPreferences
import com.koratime.R
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * البيانات التي تتغيّر أسرع من دورة النشر.
 *
 * قائمة القنوات تموت روابطها وتُضاف غيرها كل أسبوع، وانتظار إصدار جديد لكل
 * تغيير يعني تطبيقاً بقنوات ميتة. فتُنشر القائمة كأصل إصدار ثابت ويقرؤها
 * التطبيق عند التشغيل — والنسخة المرفقة تبقى شبكة الأمان.
 *
 * الوسم ثابت عمداً: الرابط لا يتأثّر بأسماء الفروع ولا بإعادة تسميتها.
 */
object LiveData {
    private const val BASE =
        "https://github.com/a7m2030ed-debug/Aogh/releases/download/data"

    const val CHANNELS = "$BASE/channels.json"
    const val AR_NAMES = "$BASE/ar-names.json"
    const val APP_VERSION = "$BASE/app-version.json"

    /** ست ساعات: أطول من جلسة استخدام، وأقصر من أن تبقى قناة ميتة يوماً. */
    const val MAX_AGE_SECONDS = 6L * 60 * 60
}

/** بيان الإصدار المنشور مع البيانات الحيّة. */
@Serializable
data class AppVersionInfo(
    val latest: String = "0",
    val minimum: String = "0",
    /**
     * وسيط المباريات: خادم صغير يملك المفتاح ويخزّن النتائج، فيرى كل مستخدم
     * الجدول كاملاً بلا تسجيل. فارغ يعني «لا وسيط».
     */
    val matchesProxy: String? = null,
    val ios: String? = null,
    val android: String? = null,
    @SerialName("titleAr") val titleAr: String? = null,
    @SerialName("titleEn") val titleEn: String? = null,
    @SerialName("notesAr") val notesAr: String? = null,
    @SerialName("notesEn") val notesEn: String? = null
) {
    fun title(arabic: Boolean): String {
        val value = if (arabic) titleAr else titleEn
        return value?.takeIf { it.isNotBlank() } ?: AppText.get(R.string.update_available)
    }

    fun notes(arabic: Boolean): String? =
        (if (arabic) notesAr else notesEn)?.takeIf { it.isNotBlank() }

    val proxyBase: String?
        get() {
            val value = matchesProxy?.trim().orEmpty()
            if (!value.startsWith("https://")) return null
            return value.trimEnd('/')
        }
}

/**
 * الإعدادات المنشورة، تُجلب مرّة واحدة في كل تشغيل ويُحتفظ بآخر ما وصل.
 *
 * المباريات تحتاج رابط الوسيط قبل أوّل طلب، وبوّابة التحديث تحتاج البيان
 * نفسه — فيُجلب مرّة ويستفيد منه الاثنان. وآخر رابط وصل يُحفظ على الجهاز،
 * فأوّل طلب في التشغيل التالي لا ينتظر الشبكة.
 */
object AppConfig {

    @Volatile private var info: AppVersionInfo? = null
    private val mutex = Mutex()
    private var prefs: SharedPreferences? = null

    fun init(context: Context) {
        if (prefs == null) {
            prefs = context.applicationContext.getSharedPreferences("koratime", Context.MODE_PRIVATE)
        }
    }

    /** آخر وسيط معروف، متاح فوراً بلا انتظار شبكة. */
    val cachedProxyBase: String?
        get() = info?.proxyBase ?: prefs?.getString(PROXY_KEY, null)?.takeIf { it.isNotBlank() }

    suspend fun load(): AppVersionInfo? {
        info?.let { return it }
        return mutex.withLock {
            info?.let { return@withLock it }
            val payload = try {
                ktJson.decodeFromString<AppVersionInfo>(
                    Http.text(LiveData.APP_VERSION, maxAgeSeconds = 1800)
                )
            } catch (error: Exception) {
                null
            }
            if (payload != null) {
                info = payload
                // نحفظ الفارغ أيضاً: إطفاء الوسيط يجب أن يصل كما يصل تشغيله.
                prefs?.edit()?.putString(PROXY_KEY, payload.proxyBase.orEmpty())?.apply()
            }
            payload
        }
    }

    private const val PROXY_KEY = "config.matchesProxy"
}

/**
 * مقارنة أرقام الإصدارات جزءاً جزءاً: "1.10" أحدث من "1.9"، والمقارنة
 * النصّية تقول العكس.
 */
object Version {
    fun isNewer(candidate: String, than: String): Boolean = compare(candidate, than) > 0

    fun compare(lhs: String, rhs: String): Int {
        val left = parts(lhs)
        val right = parts(rhs)
        for (index in 0 until maxOf(left.size, right.size)) {
            val a = left.getOrElse(index) { 0 }
            val b = right.getOrElse(index) { 0 }
            if (a != b) return if (a < b) -1 else 1
        }
        return 0
    }

    private fun parts(value: String): List<Int> =
        value.split(Regex("[^0-9]+")).filter { it.isNotEmpty() }.mapNotNull { it.toIntOrNull() }
}
