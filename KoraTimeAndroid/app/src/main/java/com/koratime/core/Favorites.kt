package com.koratime.core

/**
 * دوريات وفرق يختار منها المستخدم عند أول تشغيل، فتُرتَّب مبارياته
 * وتُبنى أخباره عليها.
 *
 * القائمة مكتوبة هنا لا مجلوبة من الشبكة: هذه أسماء لا تتغيّر كل موسم،
 * وشاشة أول تشغيل يجب أن تظهر فوراً بلا انتظار طلب قد يفشل.
 * الاسم الإنجليزي مطلوب لمطابقة ما يرسله مصدر المباريات.
 */
data class League(
    val id: String,
    val ar: String,
    val en: String,
    val teams: List<Team>
) {
    fun name(lang: Lang): String = if (lang == Lang.AR) ar else en
}

data class Team(val ar: String, val en: String) {
    fun name(lang: Lang): String = if (lang == Lang.AR) ar else en
}

object Catalog {

    private fun t(ar: String, en: String) = Team(ar, en)

    val leagues: List<League> = listOf(
        League(
            "roshn", "دوري روشن السعودي", "Saudi Pro League",
            listOf(
                t("الهلال", "Al Hilal"), t("النصر", "Al Nassr"),
                t("الاتحاد", "Al Ittihad"), t("الأهلي", "Al Ahli"),
                t("الشباب", "Al Shabab"), t("القادسية", "Al Qadsiah"),
                t("الاتفاق", "Al Ettifaq"), t("التعاون", "Al Taawoun"),
                t("الفتح", "Al Fateh"), t("الخليج", "Al Khaleej"),
                t("النجمة", "Al Najma"), t("الرياض", "Al Riyadh"),
                t("ضمك", "Damac"), t("الفيحاء", "Al Feiha"),
                t("الحزم", "Al Hazem"), t("الأخدود", "Al Okhdood"),
                t("الوحدة", "Al Wehda"), t("الخلود", "Al Kholood")
            )
        ),
        League(
            "epl", "الدوري الإنجليزي الممتاز", "English Premier League",
            listOf(
                t("مانشستر سيتي", "Manchester City"), t("ليفربول", "Liverpool"),
                t("أرسنال", "Arsenal"), t("مانشستر يونايتد", "Manchester United"),
                t("تشيلسي", "Chelsea"), t("توتنهام", "Tottenham"),
                t("نيوكاسل", "Newcastle"), t("أستون فيلا", "Aston Villa"),
                t("وست هام", "West Ham"), t("إيفرتون", "Everton")
            )
        ),
        League(
            "laliga", "الدوري الإسباني", "Spanish La Liga",
            listOf(
                t("ريال مدريد", "Real Madrid"), t("برشلونة", "Barcelona"),
                t("أتلتيكو مدريد", "Atletico Madrid"), t("إشبيلية", "Sevilla"),
                t("فالنسيا", "Valencia"), t("ريال سوسييداد", "Real Sociedad"),
                t("بيتيس", "Real Betis"), t("فياريال", "Villarreal"),
                t("أتلتيك بلباو", "Athletic Bilbao")
            )
        ),
        League(
            "seriea", "الدوري الإيطالي", "Italian Serie A",
            listOf(
                t("إنتر ميلان", "Inter"), t("ميلان", "AC Milan"),
                t("يوفنتوس", "Juventus"), t("نابولي", "Napoli"),
                t("روما", "AS Roma"), t("لاتسيو", "Lazio"),
                t("أتالانتا", "Atalanta"), t("فيورنتينا", "Fiorentina")
            )
        ),
        League(
            "bundesliga", "الدوري الألماني", "German Bundesliga",
            listOf(
                t("بايرن ميونخ", "Bayern Munich"), t("بوروسيا دورتموند", "Borussia Dortmund"),
                t("لايبزيغ", "RB Leipzig"), t("باير ليفركوزن", "Bayer Leverkusen"),
                t("شتوتغارت", "Stuttgart"), t("آينتراخت فرانكفورت", "Eintracht Frankfurt")
            )
        ),
        League(
            "ligue1", "الدوري الفرنسي", "French Ligue 1",
            listOf(
                t("باريس سان جيرمان", "Paris Saint-Germain"), t("مارسيليا", "Marseille"),
                t("موناكو", "Monaco"), t("ليون", "Lyon"),
                t("ليل", "Lille"), t("نيس", "Nice")
            )
        ),
        League(
            "ucl", "دوري أبطال أوروبا", "UEFA Champions League", emptyList()
        ),
        League(
            "acl", "دوري أبطال آسيا للنخبة", "AFC Champions League Elite", emptyList()
        ),
        League(
            "egypt", "الدوري المصري الممتاز", "Egyptian Premier League",
            listOf(
                t("الأهلي المصري", "Al Ahly"), t("الزمالك", "Zamalek"),
                t("بيراميدز", "Pyramids"), t("الإسماعيلي", "Ismaily")
            )
        ),
        League(
            "adnoc", "دوري أدنوك للمحترفين", "UAE Pro League",
            listOf(
                t("العين", "Al Ain"), t("الوصل", "Al Wasl"),
                t("شباب الأهلي", "Shabab Al Ahli"), t("الجزيرة", "Al Jazira")
            )
        ),
        League(
            "qsl", "دوري نجوم قطر", "Qatar Stars League",
            listOf(
                t("السد", "Al Sadd"), t("الدحيل", "Al Duhail"),
                t("الريان", "Al Rayyan"), t("الغرافة", "Al Gharafa")
            )
        )
    )

    fun league(id: String): League? = leagues.firstOrNull { it.id == id }

    /** الفرق المتاحة للاختيار بعد اختيار الدوريات. */
    fun teamsFor(leagueIds: Collection<String>): List<Pair<League, Team>> =
        leagues.filter { it.id in leagueIds }
            .flatMap { league -> league.teams.map { league to it } }

    /** أسماء الدوريات المختارة بالعربية والإنجليزية معاً، لمطابقة المصدر. */
    fun titles(leagueIds: Collection<String>): List<String> =
        leagues.filter { it.id in leagueIds }.flatMap { listOf(it.ar, it.en) }
}
