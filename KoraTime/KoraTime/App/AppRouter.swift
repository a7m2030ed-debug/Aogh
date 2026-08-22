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
            case .matches: return "المباريات"
            case .channels: return "القنوات"
            case .news: return "الأخبار"
            case .settings: return "الإعدادات"
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
