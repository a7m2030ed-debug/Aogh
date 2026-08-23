import Foundation

/// API-Football — المصدر الوحيد المجاني الذي يغطّي دوري روشن والدوريات
/// الكبرى معاً.
///
/// جرّبنا البدائل بلا مفتاح فسقطت كلها: TheSportsDB بمفتاحه المشترك يُرجع
/// ثلاث مباريات يومياً من دوريات هامشية، و football-data و Sofascore تردّ
/// ٤٠٣. لذلك يحتاج هذا المصدر مفتاحاً مجانياً يضعه المستخدم في الإعدادات،
/// ومن لم يضعه يبقى على المصدر القديم بحدوده.
///
/// طلب واحد لكل يوم معروض، فحصّة الخطة المجانية تكفي.
struct ApiFootballProvider: MatchesProviding {

    let apiKey: String

    var attribution: String { L.s("attribution_apifootball") }

    // MARK: صيغة الاستجابة

    private struct Response: Decodable {
        let response: [Fixture]?
    }

    private struct Fixture: Decodable {
        let fixture: FixtureInfo?
        let league: LeagueInfo?
        let teams: Teams?
        let goals: Goals?
    }

    private struct FixtureInfo: Decodable {
        let id: Int?
        let date: String?
        let venue: Venue?
        let status: StatusInfo?
    }

    private struct Venue: Decodable { let name: String? }

    private struct StatusInfo: Decodable {
        let short: String?
        let elapsed: Int?
    }

    private struct LeagueInfo: Decodable {
        let name: String?
        let id: Int?
        let country: String?
        let logo: String?
        let round: String?
    }

    private struct Teams: Decodable {
        let home: Side?
        let away: Side?
    }

    private struct Side: Decodable {
        let name: String?
        let logo: String?
    }

    private struct Goals: Decodable {
        let home: Int?
        let away: Int?
    }

    // MARK: الجلب

    func matches(on day: Date) async throws -> [Match] {
        let key = apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !key.isEmpty else { return [] }

        var components = URLComponents(string: "https://v3.football.api-sports.io/fixtures")
        components?.queryItems = [
            URLQueryItem(name: "date", value: KTDate.apiDay.string(from: day))
        ]
        guard let url = components?.url else { return [] }

        let isToday = Calendar.current.isDateInToday(day)
        let payload = try await HTTPClient.shared.decode(
            Response.self,
            from: url,
            headers: ["x-apisports-key": key],
            maxAge: isToday ? 45 : 1800
        )
        return (payload.response ?? []).compactMap(convert)
    }

    private func convert(_ item: Fixture) -> Match? {
        guard let home = item.teams?.home?.name,
              let away = item.teams?.away?.name else { return nil }

        let short = (item.fixture?.status?.short ?? "").uppercased()
        let elapsed = item.fixture?.status?.elapsed
        let status: Match.Status
        switch short {
        case "FT", "AET", "PEN": status = .finished
        case "PST": status = .postponed
        case "CANC", "ABD", "AWD", "WO": status = .canceled
        case "1H", "2H", "HT", "ET", "BT", "P", "LIVE", "INT": status = .live
        default: status = .scheduled
        }

        let kickoff = item.fixture?.date.flatMap(KTDate.parseUTC)

        return Match(
            id: item.fixture?.id.map(String.init) ?? "\(home)-\(away)-\(item.fixture?.date ?? "")",
            kickoff: kickoff,
            homeName: home,
            awayName: away,
            homeBadge: item.teams?.home?.logo.flatMap(URL.init(string:)),
            awayBadge: item.teams?.away?.logo.flatMap(URL.init(string:)),
            homeScore: item.goals?.home,
            awayScore: item.goals?.away,
            status: status,
            progress: progressText(short: short, elapsed: elapsed, status: status),
            competition: competitionName(item.league),
            competitionID: item.league?.id.map(String.init),
            competitionBadge: item.league?.logo.flatMap(URL.init(string:)),
            venue: item.fixture?.venue?.name,
            round: item.league?.round
        )
    }

    /// أسماء البطولات في هذا المصدر تأتي بلا بلدها أحياناً: دوري روشن اسمه
    /// «Pro League» وكأس الملك «King Cup»، والاسمان مشتركان بين دول عدّة —
    /// وبلجيكا نفسها لها «Pro League». فما لم يكن الاسم معروفاً بذاته
    /// نُلحق به اسم البلد المختصر، فيصير مفتاحاً صالحاً للتعريب وللترتيب
    /// معاً بدل أن يظهر روشن باسم عامّ في ذيل القائمة.
    private static let countryPrefix: [String: String] = [
        "saudi-arabia": "Saudi", "saudi arabia": "Saudi",
        "united-arab-emirates": "UAE", "united arab emirates": "UAE",
        "qatar": "Qatar", "egypt": "Egyptian", "kuwait": "Kuwait",
        "bahrain": "Bahrain", "oman": "Oman", "jordan": "Jordan",
        "morocco": "Moroccan", "algeria": "Algerian", "tunisia": "Tunisian",
    ]

    private func competitionName(_ league: LeagueInfo?) -> String {
        let raw = (league?.name ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty else { return L.s("other_competitions") }

        // الاسم معروف كما هو («Premier League» مثلاً) فلا يُمَسّ.
        if ArabicNames.league(raw, enabled: true) != raw { return raw }

        let country = (league?.country ?? "").lowercased()
        guard let prefix = ApiFootballProvider.countryPrefix[country],
              !raw.localizedCaseInsensitiveContains(prefix) else { return raw }
        return "\(prefix) \(raw)"
    }

    private func progressText(short: String, elapsed: Int?, status: Match.Status) -> String? {
        guard status == .live else { return nil }
        switch short {
        case "HT": return L.s("half_time")
        case "ET": return L.s("extra_time")
        case "P": return L.s("penalties")
        case "1H": return elapsed.map { "\($0)′" } ?? L.s("half_first")
        case "2H": return elapsed.map { "\($0)′" } ?? L.s("half_second")
        default: return elapsed.map { "\($0)′" }
        }
    }
}
