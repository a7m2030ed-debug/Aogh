package com.koratime

import java.util.Locale

/**
 * الناقل الرسمي لبطولة معيّنة.
 *
 * البثّ الحصري محمي بـ DRM ولا يعمل في أي مشغّل خارجي، فبدل الوعد بما لا
 * يعمل يعرض التطبيق اسم الناقل ويفتح تطبيقه.
 */
data class Broadcaster(
    val id: String,
    val name: String,
    val note: String,
    val appUrl: String,
    val storeUrl: String,
    val competitionKeywords: List<String>
) {
    val openUrl: String get() = appUrl.ifBlank { storeUrl }
}

object Broadcasters {

    val all = listOf(
        Broadcaster(
            id = "thmanyah",
            name = "ثمانية",
            note = "الناقل الحصري لدوري روشن وكأس الملك والسوبر ودوري يلو حتى ٢٠٣١. المشاهدة مجانية بحساب مجاني.",
            appUrl = "https://app.thmanyah.com",
            storeUrl = "https://play.google.com/store/search?q=%D8%AB%D9%85%D8%A7%D9%86%D9%8A%D8%A9&c=apps",
            competitionKeywords = listOf(
                "روشن", "يلو", "خادم الحرمين", "السوبر السعودي", "الدوري السعودي",
                "saudi pro league", "saudi professional league", "saudi arabian pro league",
                "saudi first division", "kings cup", "saudi super cup"
            )
        )
    )

    fun forCompetition(vararg names: String): Broadcaster? {
        val haystack = names.joinToString(" ").lowercase(Locale.US)
        if (haystack.isBlank()) return null
        return all.firstOrNull { broadcaster ->
            broadcaster.competitionKeywords.any { haystack.contains(it.lowercase(Locale.US)) }
        }
    }
}
