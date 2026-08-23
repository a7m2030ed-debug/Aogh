package com.koratime.core

import com.koratime.R
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
