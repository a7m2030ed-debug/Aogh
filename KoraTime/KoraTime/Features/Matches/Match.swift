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
            case .scheduled: return "لم تبدأ"
            case .live: return "مباشر"
            case .finished: return "انتهت"
            case .postponed: return "مؤجلة"
            case .canceled: return "ملغاة"
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
            return "مباشر"
        case .finished:
            return "انتهت"
        case .postponed:
            return "مؤجلة"
        case .canceled:
            return "ملغاة"
        case .scheduled:
            guard let kickoff = kickoff else { return "لم تبدأ" }
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
enum CompetitionPriority {

    private static let ranked: [String] = [
        "دوري روشن السعودي",
        "دوري أبطال آسيا للنخبة",
        "دوري أبطال آسيا",
        "كأس خادم الحرمين",
        "دوري يلو السعودي",
        "دوري أبطال أوروبا",
        "الدوري الإنجليزي الممتاز",
        "الدوري الإسباني",
        "الدوري الإيطالي",
        "الدوري الألماني",
        "الدوري الفرنسي",
        "الدوري الأوروبي",
        "الدوري المصري الممتاز",
        "دوري نجوم قطر",
        "دوري أدنوك للمحترفين",
        "دوري أبطال أفريقيا",
        "كأس العالم",
        "كأس آسيا",
        "كأس أمم أفريقيا"
    ]

    static func rank(_ arabicTitle: String) -> Int {
        if let index = ranked.firstIndex(of: arabicTitle) { return index }
        for (index, name) in ranked.enumerated() where arabicTitle.contains(name) {
            return index
        }
        return ranked.count + 10
    }
}
