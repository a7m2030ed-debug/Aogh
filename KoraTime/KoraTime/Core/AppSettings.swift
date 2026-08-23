import Foundation
import Observation

/// خلاصة أخبار يتابعها المستخدم.
struct FeedSource: Identifiable, Codable, Hashable {
    var id: UUID = UUID()
    var name: String
    var urlString: String
    var isEnabled: Bool = true
    var isBuiltIn: Bool = false

    var url: URL? { URL(string: urlString) }
}

/// قائمة قنوات يضيفها المستخدم (M3U أو JSON).
struct PlaylistSource: Identifiable, Codable, Hashable {
    var id: UUID = UUID()
    var name: String
    var urlString: String
    var isEnabled: Bool = true

    var url: URL? { URL(string: urlString) }
}

enum MatchesSource: String, CaseIterable, Identifiable, Codable {
    case sportsDB
    case footballData

    var id: String { rawValue }

    var title: String {
        switch self {
        case .sportsDB: return "TheSportsDB"
        case .footballData: return "football-data.org"
        }
    }

    var subtitle: String {
        switch self {
        case .sportsDB: return L.s("sportsdb_hint")
        case .footballData: return L.s("footballdata_hint")
        }
    }

    var signupURL: URL? {
        switch self {
        case .sportsDB: return URL(string: "https://www.thesportsdb.com/free_sports_api")
        case .footballData: return URL(string: "https://www.football-data.org/client/register")
        }
    }
}

enum RailPlacement: String, CaseIterable, Identifiable, Codable {
    case side      // القائمة على اليمين بجانب المشغّل (طريقة STC TV)
    case below     // المشغّل بعرض الشاشة والقائمة تحته

    var id: String { rawValue }

    var title: String {
        switch self {
        case .side: return L.s("rail_side")
        case .below: return L.s("rail_below")
        }
    }
}

@MainActor
@Observable
final class AppSettings {

    // MARK: المباريات
    var matchesSource: MatchesSource {
        didSet { store.set(matchesSource.rawValue, forKey: Keys.matchesSource) }
    }
    var sportsDBKey: String {
        didSet { store.set(sportsDBKey, forKey: Keys.sportsDBKey) }
    }
    var footballDataToken: String {
        didSet { store.set(footballDataToken, forKey: Keys.footballDataToken) }
    }
    /// تحديث نتائج المباريات الجارية كل دقيقة.
    var autoRefreshLive: Bool {
        didSet { store.set(autoRefreshLive, forKey: Keys.autoRefreshLive) }
    }
    /// إظهار الأسماء العربية للفرق والبطولات بدل الإنجليزية.
    var arabicNames: Bool {
        didSet { store.set(arabicNames, forKey: Keys.arabicNames) }
    }

    // MARK: القنوات
    var playlists: [PlaylistSource] {
        didSet { save(playlists, forKey: Keys.playlists) }
    }
    var autoPlayOnOpen: Bool {
        didSet { store.set(autoPlayOnOpen, forKey: Keys.autoPlayOnOpen) }
    }
    var railPlacement: RailPlacement {
        didSet { store.set(railPlacement.rawValue, forKey: Keys.railPlacement) }
    }
    var lastChannelID: String? {
        didSet { store.set(lastChannelID, forKey: Keys.lastChannelID) }
    }
    var showDemoChannels: Bool {
        didSet { store.set(showDemoChannels, forKey: Keys.showDemoChannels) }
    }

    // MARK: الأخبار
    var feeds: [FeedSource] {
        didSet { save(feeds, forKey: Keys.feeds) }
    }

    // MARK: التفضيلات واللغة

    /// اللغة المختارة. العربية افتراضياً مهما كانت لغة الجهاز.
    var language: Lang {
        didSet { store.set(language.rawValue, forKey: Keys.language) }
    }
    /// هل عُرضت شاشة التفضيلات؟ تظهر مرة واحدة عند أول تشغيل.
    var onboarded: Bool {
        didSet { store.set(onboarded, forKey: Keys.onboarded) }
    }
    /// الترتيب مقصود: أول دوري اختاره المستخدم يتصدّر قائمته.
    var favoriteLeagues: [String] {
        didSet { store.set(favoriteLeagues, forKey: Keys.favoriteLeagues) }
    }
    var favoriteTeams: [String] {
        didSet { store.set(favoriteTeams, forKey: Keys.favoriteTeams) }
    }
    /// مفتاح API-Football: المصدر الوحيد المجاني الذي يغطّي روشن والكبرى.
    var apiFootballKey: String {
        didSet { store.set(apiFootballKey, forKey: Keys.apiFootballKey) }
    }

    // MARK: - التخزين

    private let store: UserDefaults

    private enum Keys {
        static let matchesSource = "matches.source"
        static let sportsDBKey = "matches.sportsdb.key"
        static let footballDataToken = "matches.footballdata.token"
        static let autoRefreshLive = "matches.autoRefreshLive"
        static let arabicNames = "general.arabicNames"
        static let playlists = "channels.playlists"
        static let autoPlayOnOpen = "channels.autoPlay"
        static let railPlacement = "channels.railPlacement"
        static let lastChannelID = "channels.lastChannel"
        static let showDemoChannels = "channels.showDemo"
        static let feeds = "news.feeds"
        static let language = "general.language"
        static let onboarded = "general.onboarded"
        static let favoriteLeagues = "general.favoriteLeagues"
        static let favoriteTeams = "general.favoriteTeams"
        static let apiFootballKey = "matches.apifootball.key"
    }

    init(store: UserDefaults = .standard) {
        self.store = store

        matchesSource = MatchesSource(rawValue: store.string(forKey: Keys.matchesSource) ?? "") ?? .sportsDB
        sportsDBKey = store.string(forKey: Keys.sportsDBKey) ?? AppSettings.defaultSportsDBKey
        footballDataToken = store.string(forKey: Keys.footballDataToken) ?? ""
        autoRefreshLive = store.object(forKey: Keys.autoRefreshLive) as? Bool ?? true
        arabicNames = store.object(forKey: Keys.arabicNames) as? Bool ?? true

        playlists = AppSettings.load([PlaylistSource].self, forKey: Keys.playlists, from: store) ?? []
        autoPlayOnOpen = store.object(forKey: Keys.autoPlayOnOpen) as? Bool ?? true
        railPlacement = RailPlacement(rawValue: store.string(forKey: Keys.railPlacement) ?? "") ?? .side
        lastChannelID = store.string(forKey: Keys.lastChannelID)
        showDemoChannels = store.object(forKey: Keys.showDemoChannels) as? Bool ?? true

        feeds = AppSettings.load([FeedSource].self, forKey: Keys.feeds, from: store)
            ?? AppSettings.defaultFeeds

        language = Lang(rawValue: store.string(forKey: Keys.language) ?? "") ?? .ar
        onboarded = store.bool(forKey: Keys.onboarded)
        favoriteLeagues = store.stringArray(forKey: Keys.favoriteLeagues) ?? []
        favoriteTeams = store.stringArray(forKey: Keys.favoriteTeams) ?? []
        apiFootballKey = store.string(forKey: Keys.apiFootballKey) ?? ""
    }

    /// خلاصات مبنية على فرق المستخدم ودورياته؛ من لم يختر يبقى على العامة.
    var personalFeeds: [FeedSource] {
        let lang = language
        let leagues = favoriteLeagues.compactMap { Catalog.league($0)?.name(lang) }
        guard !favoriteTeams.isEmpty || !leagues.isEmpty else { return AppSettings.defaultFeeds }

        // الفرق أخصّ من الدوريات فتتقدّم، والعدد محدود لأن كل خلاصة طلب مستقلّ
        var names = Array(favoriteTeams.prefix(4))
        names.append(contentsOf: leagues.prefix(3))
        var built: [FeedSource] = names.map { name in
            FeedSource(name: name,
                       urlString: GoogleNews.url(for: name)?.absoluteString ?? "",
                       isEnabled: true, isBuiltIn: true)
        }
        built.append(FeedSource(name: L.s("feed_bbc"),
                                urlString: "https://feeds.bbci.co.uk/arabic/sports/rss.xml",
                                isEnabled: true, isBuiltIn: true))
        return built.filter { !$0.urlString.isEmpty }
    }

    /// يُستدعى بعد تغيير التفضيلات: يعيد بناء الخلاصات المبنيّة تلقائياً.
    func rebuildFeedsFromFavorites() {
        feeds = personalFeeds
    }

    /// المفتاح التجريبي المجاني المعلن من TheSportsDB — يكفي للتصفّح، ومحدود الطلبات.
    static let defaultSportsDBKey = "123"

    /// تُحسب عند كل طلب لا مرة واحدة، فهي تتبع اللغة: أسماء الدوريات
    /// تُطلب بلغة المستخدم، والبحث في أخبار Google يجري بها.
    static var defaultFeeds: [FeedSource] {
        let lang = L.current
        let roshn = Catalog.league("roshn")?.name(lang) ?? ""
        let ucl = Catalog.league("ucl")?.name(lang) ?? ""
        return [
            FeedSource(name: L.s("feed_football_agg"),
                       urlString: GoogleNews.url(for: L.s("topic_football"))?.absoluteString ?? "",
                       isEnabled: true, isBuiltIn: true),
            FeedSource(name: roshn,
                       urlString: GoogleNews.url(for: roshn)?.absoluteString ?? "",
                       isEnabled: true, isBuiltIn: true),
            FeedSource(name: ucl,
                       urlString: GoogleNews.url(for: ucl)?.absoluteString ?? "",
                       isEnabled: true, isBuiltIn: true),
            FeedSource(name: L.s("feed_transfers"),
                       urlString: GoogleNews.url(for: L.s("topic_transfers"))?.absoluteString ?? "",
                       isEnabled: false, isBuiltIn: true),
            FeedSource(name: L.s("feed_bbc"),
                       urlString: "https://feeds.bbci.co.uk/arabic/sports/rss.xml",
                       isEnabled: true, isBuiltIn: true),
            FeedSource(name: L.s("feed_sky"),
                       urlString: "https://www.skynewsarabia.com/web/rss/95.xml",
                       isEnabled: false, isBuiltIn: true)
        ].filter { !$0.urlString.isEmpty && !$0.name.isEmpty }
    }

    func resetFeeds() {
        feeds = AppSettings.defaultFeeds
    }

    func addFeed(name: String, urlString: String) {
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanURL = urlString.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanURL.isEmpty else { return }
        feeds.append(FeedSource(name: cleanName.isEmpty ? L.s("my_feed") : cleanName,
                                urlString: cleanURL))
    }

    func addPlaylist(name: String, urlString: String) {
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanURL = urlString.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanURL.isEmpty else { return }
        playlists.append(PlaylistSource(name: cleanName.isEmpty ? L.s("my_list") : cleanName,
                                        urlString: cleanURL))
    }

    // MARK: مساعدات التخزين

    private func save<T: Encodable>(_ value: T, forKey key: String) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        store.set(data, forKey: key)
    }

    private static func load<T: Decodable>(_ type: T.Type,
                                           forKey key: String,
                                           from store: UserDefaults) -> T? {
        guard let data = store.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }
}

/// خلاصات أخبار Google بالعربية — مصدر تجميعي ثابت يغطّي المواقع الرياضية المعروفة.
enum GoogleNews {
    static func url(for query: String) -> URL? {
        var components = URLComponents(string: "https://news.google.com/rss/search")
        components?.queryItems = [
            URLQueryItem(name: "q", value: query),
            URLQueryItem(name: "hl", value: "ar"),
            URLQueryItem(name: "gl", value: "SA"),
            URLQueryItem(name: "ceid", value: "SA:ar")
        ]
        return components?.url
    }
}
