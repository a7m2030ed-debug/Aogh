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
        case .sportsDB:
            return "يعمل فوراً بدون تسجيل. تغطية واسعة للدوريات العربية والعالمية."
        case .footballData:
            return "دقّة أعلى للدوريات الأوروبية الكبرى. يحتاج مفتاحاً مجانياً."
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
        case .side: return "بجانب المشغّل"
        case .below: return "تحت المشغّل"
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
    }

    /// المفتاح التجريبي المجاني المعلن من TheSportsDB — يكفي للتصفّح، ومحدود الطلبات.
    static let defaultSportsDBKey = "123"

    static var defaultFeeds: [FeedSource] {
        [
            FeedSource(name: "أخبار كرة القدم (تجميع)",
                       urlString: GoogleNews.url(for: "كرة القدم")?.absoluteString ?? "",
                       isEnabled: true, isBuiltIn: true),
            FeedSource(name: "دوري روشن السعودي",
                       urlString: GoogleNews.url(for: "دوري روشن السعودي")?.absoluteString ?? "",
                       isEnabled: true, isBuiltIn: true),
            FeedSource(name: "دوري أبطال أوروبا",
                       urlString: GoogleNews.url(for: "دوري أبطال أوروبا")?.absoluteString ?? "",
                       isEnabled: true, isBuiltIn: true),
            FeedSource(name: "سوق الانتقالات",
                       urlString: GoogleNews.url(for: "انتقالات كرة القدم صفقة")?.absoluteString ?? "",
                       isEnabled: false, isBuiltIn: true),
            FeedSource(name: "BBC عربي — رياضة",
                       urlString: "https://feeds.bbci.co.uk/arabic/sports/rss.xml",
                       isEnabled: true, isBuiltIn: true),
            FeedSource(name: "سكاي نيوز عربية — رياضة",
                       urlString: "https://www.skynewsarabia.com/web/rss/95.xml",
                       isEnabled: false, isBuiltIn: true)
        ]
    }

    func resetFeeds() {
        feeds = AppSettings.defaultFeeds
    }

    func addFeed(name: String, urlString: String) {
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanURL = urlString.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanURL.isEmpty else { return }
        feeds.append(FeedSource(name: cleanName.isEmpty ? "خلاصة مخصّصة" : cleanName,
                                urlString: cleanURL))
    }

    func addPlaylist(name: String, urlString: String) {
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanURL = urlString.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanURL.isEmpty else { return }
        playlists.append(PlaylistSource(name: cleanName.isEmpty ? "قائمتي" : cleanName,
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
