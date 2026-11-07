import Foundation

/// دوريات وفرق يختار منها المستخدم عند أول تشغيل.
///
/// مولَّد من كتالوج أندرويد نفسه، فلا تفترق القائمتان. الاسم الإنجليزي
/// مطلوب لمطابقة ما يرسله مصدر المباريات، لا للعرض فقط.
struct Team: Identifiable, Hashable {
    let ar: String
    let en: String
    var id: String { ar }
    func name(_ lang: Lang) -> String { lang == .ar ? ar : en }
}

struct League: Identifiable, Hashable {
    let id: String
    let ar: String
    let en: String
    let teams: [Team]
    func name(_ lang: Lang) -> String { lang == .ar ? ar : en }
}

enum Catalog {

    static let leagues: [League] = [
        League(id: "roshn", ar: "دوري روشن السعودي", en: "Saudi Pro League", teams: [
            Team(ar: "الهلال", en: "Al Hilal"),
            Team(ar: "النصر", en: "Al Nassr"),
            Team(ar: "الاتحاد", en: "Al Ittihad"),
            Team(ar: "الأهلي", en: "Al Ahli"),
            Team(ar: "الشباب", en: "Al Shabab"),
            Team(ar: "القادسية", en: "Al Qadsiah"),
            Team(ar: "الاتفاق", en: "Al Ettifaq"),
            Team(ar: "التعاون", en: "Al Taawoun"),
            Team(ar: "الفتح", en: "Al Fateh"),
            Team(ar: "الخليج", en: "Al Khaleej"),
            Team(ar: "النجمة", en: "Al Najma"),
            Team(ar: "الرياض", en: "Al Riyadh"),
            Team(ar: "ضمك", en: "Damac"),
            Team(ar: "الفيحاء", en: "Al Feiha"),
            Team(ar: "الحزم", en: "Al Hazem"),
            Team(ar: "الأخدود", en: "Al Okhdood"),
            Team(ar: "الوحدة", en: "Al Wehda"),
            Team(ar: "الخلود", en: "Al Kholood"),
        ]),
        League(id: "epl", ar: "الدوري الإنجليزي الممتاز", en: "English Premier League", teams: [
            Team(ar: "مانشستر سيتي", en: "Manchester City"),
            Team(ar: "ليفربول", en: "Liverpool"),
            Team(ar: "أرسنال", en: "Arsenal"),
            Team(ar: "مانشستر يونايتد", en: "Manchester United"),
            Team(ar: "تشيلسي", en: "Chelsea"),
            Team(ar: "توتنهام", en: "Tottenham"),
            Team(ar: "نيوكاسل", en: "Newcastle"),
            Team(ar: "أستون فيلا", en: "Aston Villa"),
            Team(ar: "وست هام", en: "West Ham"),
            Team(ar: "إيفرتون", en: "Everton"),
        ]),
        League(id: "laliga", ar: "الدوري الإسباني", en: "Spanish La Liga", teams: [
            Team(ar: "ريال مدريد", en: "Real Madrid"),
            Team(ar: "برشلونة", en: "Barcelona"),
            Team(ar: "أتلتيكو مدريد", en: "Atletico Madrid"),
            Team(ar: "إشبيلية", en: "Sevilla"),
            Team(ar: "فالنسيا", en: "Valencia"),
            Team(ar: "ريال سوسييداد", en: "Real Sociedad"),
            Team(ar: "بيتيس", en: "Real Betis"),
            Team(ar: "فياريال", en: "Villarreal"),
            Team(ar: "أتلتيك بلباو", en: "Athletic Bilbao"),
        ]),
        League(id: "seriea", ar: "الدوري الإيطالي", en: "Italian Serie A", teams: [
            Team(ar: "إنتر ميلان", en: "Inter"),
            Team(ar: "ميلان", en: "AC Milan"),
            Team(ar: "يوفنتوس", en: "Juventus"),
            Team(ar: "نابولي", en: "Napoli"),
            Team(ar: "روما", en: "AS Roma"),
            Team(ar: "لاتسيو", en: "Lazio"),
            Team(ar: "أتالانتا", en: "Atalanta"),
            Team(ar: "فيورنتينا", en: "Fiorentina"),
        ]),
        League(id: "bundesliga", ar: "الدوري الألماني", en: "German Bundesliga", teams: [
            Team(ar: "بايرن ميونخ", en: "Bayern Munich"),
            Team(ar: "بوروسيا دورتموند", en: "Borussia Dortmund"),
            Team(ar: "لايبزيغ", en: "RB Leipzig"),
            Team(ar: "باير ليفركوزن", en: "Bayer Leverkusen"),
            Team(ar: "شتوتغارت", en: "Stuttgart"),
            Team(ar: "آينتراخت فرانكفورت", en: "Eintracht Frankfurt"),
        ]),
        League(id: "ligue1", ar: "الدوري الفرنسي", en: "French Ligue 1", teams: [
            Team(ar: "باريس سان جيرمان", en: "Paris Saint-Germain"),
            Team(ar: "مارسيليا", en: "Marseille"),
            Team(ar: "موناكو", en: "Monaco"),
            Team(ar: "ليون", en: "Lyon"),
            Team(ar: "ليل", en: "Lille"),
            Team(ar: "نيس", en: "Nice"),
        ]),
        League(id: "ucl", ar: "دوري أبطال أوروبا", en: "UEFA Champions League", teams: []),
        League(id: "acl", ar: "دوري أبطال آسيا للنخبة", en: "AFC Champions League Elite", teams: []),
        League(id: "egypt", ar: "الدوري المصري الممتاز", en: "Egyptian Premier League", teams: [
            Team(ar: "الأهلي المصري", en: "Al Ahly"),
            Team(ar: "الزمالك", en: "Zamalek"),
            Team(ar: "بيراميدز", en: "Pyramids"),
            Team(ar: "الإسماعيلي", en: "Ismaily"),
        ]),
        League(id: "adnoc", ar: "دوري أدنوك للمحترفين", en: "UAE Pro League", teams: [
            Team(ar: "العين", en: "Al Ain"),
            Team(ar: "الوصل", en: "Al Wasl"),
            Team(ar: "شباب الأهلي", en: "Shabab Al Ahli"),
            Team(ar: "الجزيرة", en: "Al Jazira"),
        ]),
        League(id: "qsl", ar: "دوري نجوم قطر", en: "Qatar Stars League", teams: [
            Team(ar: "السد", en: "Al Sadd"),
            Team(ar: "الدحيل", en: "Al Duhail"),
            Team(ar: "الريان", en: "Al Rayyan"),
            Team(ar: "الغرافة", en: "Al Gharafa"),
        ]),
    ]

    static func league(_ id: String) -> League? {
        leagues.first { $0.id == id }
    }

    /// الفرق المتاحة بعد اختيار الدوريات.
    static func teams(in ids: [String]) -> [Team] {
        leagues.filter { ids.contains($0.id) }.flatMap(\.teams)
    }
}
