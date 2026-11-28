import Foundation

struct Match: Identifiable, Hashable {

    enum Status: Hashable {
        case scheduled
        case live
        case finished
        case postponed
        case canceled

        var isLive: Bool { self == .live }

        var label: String {
            switch self {
            case .scheduled: return L.s("status_scheduled")
            case .live: return L.s("status_live")
            case .finished: return L.s("status_finished")
            case .postponed: return L.s("status_postponed")
            case .canceled: return L.s("status_canceled")
            }
        }
    }

    let id: String
    let kickoff: Date?
    let homeName: String
    let awayName: String
    let homeBadge: URL?
    let awayBadge: URL?
    let homeScore: Int?
    let awayScore: Int?
    let status: Status
    /// الدقيقة الحالية أو وصف الحالة كما جاء من المصدر ("45+2"، "شوط أول"…).
    let progress: String?
    let competition: String
    let competitionID: String?
    let competitionBadge: URL?
    let venue: String?
    let round: String?

    var isLive: Bool { status.isLive }

    var hasScore: Bool { homeScore != nil && awayScore != nil }

    func homeTitle(arabic: Bool) -> String { ArabicNames.team(homeName, enabled: arabic) }
    func awayTitle(arabic: Bool) -> String { ArabicNames.team(awayName, enabled: arabic) }
    func competitionTitle(arabic: Bool) -> String { ArabicNames.league(competition, enabled: arabic) }

    /// النص الذي يظهر تحت النتيجة في منتصف الصف.
    var centerCaption: String {
        switch status {
        case .live:
            if let progress = progress, !progress.isEmpty { return progress }
            return L.s("status_live")
        case .finished, .postponed, .canceled:
            return status.label
        case .scheduled:
            guard let kickoff = kickoff else { return L.s("status_scheduled") }
            return KTDate.dayLabel(kickoff)
        }
    }

    func matches(query: String, arabic: Bool) -> Bool {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return true }
        let haystack = [
            homeName, awayName, competition,
            homeTitle(arabic: arabic), awayTitle(arabic: arabic), competitionTitle(arabic: arabic)
        ].joined(separator: " ")
        return haystack.localizedCaseInsensitiveContains(trimmed)
    }
}

/// مجموعة مباريات تحت بطولة واحدة.
struct MatchSection: Identifiable, Hashable {
    let id: String
    let title: String
    let badge: URL?
    var matches: [Match]

    var liveCount: Int { matches.filter(\.isLive).count }
}

/// ترتيب البطولات في الصفحة: العربية والكبرى أولاً.
///
/// الاسمان معاً — العربي والإنجليزي — لأن عنوان البطولة يأتي بلغة المصدر
/// وتُترجمه `ArabicNames` فقط حين يكون العرض عربياً. بقائمة عربية وحدها
/// ينهار الترتيب كلّه في الواجهة الإنجليزية.
enum CompetitionPriority {

    private static let ranked: [(ar: String, en: String)] = [
        ("دوري روشن السعودي", "Saudi Pro League"),
        ("دوري أبطال آسيا للنخبة", "AFC Champions League Elite"),
        ("دوري أبطال آسيا", "AFC Champions League"),
        ("كأس خادم الحرمين", "King Cup"),
        ("دوري يلو السعودي", "Saudi First Division"),
        ("دوري أبطال أوروبا", "UEFA Champions League"),
        ("الدوري الإنجليزي الممتاز", "English Premier League"),
        ("الدوري الإسباني", "Spanish La Liga"),
        ("الدوري الإيطالي", "Italian Serie A"),
        ("الدوري الألماني", "German Bundesliga"),
        ("الدوري الفرنسي", "French Ligue 1"),
        ("الدوري الأوروبي", "UEFA Europa League"),
        ("الدوري المصري الممتاز", "Egyptian Premier League"),
        ("دوري نجوم قطر", "Qatar Stars League"),
        ("دوري أدنوك للمحترفين", "UAE Pro League"),
        ("دوري أبطال أفريقيا", "CAF Champions League"),
        ("كأس العالم", "World Cup"),
        ("كأس آسيا", "AFC Asian Cup"),
        ("كأس أمم أفريقيا", "Africa Cup of Nations"),
    ]

    static func rank(_ title: String) -> Int {
        let needle = title.lowercased()
        // المطابقة التامة أولاً كي لا يبتلع «دوري أبطال آسيا» نسخةَ النخبة.
        for (index, pair) in ranked.enumerated()
        where title == pair.ar || needle == pair.en.lowercased() {
            return index
        }
        for (index, pair) in ranked.enumerated()
        where title.contains(pair.ar) || needle.contains(pair.en.lowercased()) {
            return index
        }
        return ranked.count + 10
    }
}
