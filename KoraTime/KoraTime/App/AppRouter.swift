import Foundation
import Observation

/// يمسك التبويب الحالي ويسمح للشاشات بأن تفتح بعضها (مباراة ← قناة/أخبار).
@MainActor
@Observable
final class AppRouter {

    enum Tab: String, Hashable, CaseIterable {
        case matches
        case channels
        case news
        case settings

        var title: String {
            switch self {
            case .matches: return L.s("tab_matches")
            case .channels: return L.s("tab_channels")
            case .news: return L.s("tab_news")
            case .settings: return L.s("tab_settings")
            }
        }

        var icon: String {
            switch self {
            case .matches: return "sportscourt.fill"
            case .channels: return "play.tv.fill"
            case .news: return "newspaper.fill"
            case .settings: return "gearshape.fill"
            }
        }
    }

    var tab: Tab = .matches

    init() {
        // يسمح بفتح التطبيق على تبويب محدّد عبر وسيط تشغيل:
        //   xcrun simctl launch <device> com.koratime.app -KTStartTab channels
        // يُستخدم في التقاط صور الشاشة آلياً، ولا أثر له في الاستخدام العادي.
        if let raw = UserDefaults.standard.string(forKey: "KTStartTab"),
           let requested = Tab(rawValue: raw) {
            tab = requested
        }
    }

    /// بحث أخبار مطلوب من شاشة أخرى (اسم فريق مثلاً).
    var pendingNewsQuery: String?
    /// طلب فتح قناة بعينها عند الانتقال لتبويب القنوات.
    var pendingChannelID: String?
    /// طلب فتح شاشة الإعدادات على قسم معيّن.
    var settingsFocus: SettingsFocus?

    enum SettingsFocus: String, Hashable {
        case matchesSource
        case playlists
        case feeds
    }

    func openChannels(channelID: String? = nil) {
        pendingChannelID = channelID
        tab = .channels
    }

    func openNews(query: String) {
        pendingNewsQuery = query
        tab = .news
    }

    func openSettings(focus: SettingsFocus? = nil) {
        settingsFocus = focus
        tab = .settings
    }
}
