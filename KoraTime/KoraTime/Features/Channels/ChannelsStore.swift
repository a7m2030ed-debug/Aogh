import Foundation
import Observation

@MainActor
@Observable
final class ChannelsStore {

    private let settings: AppSettings

    private(set) var channels: [Channel] = []
    private(set) var isLoading = false
    /// أخطاء تحميل قوائم المستخدم، تُعرض في الإعدادات وفي أسفل القائمة.
    private(set) var loadErrors: [String] = []

    var selectedGroup: String?
    var query: String = ""

    private var hasLoaded = false
    /// طلب التحميل الجاري. صار للقائمة نداءان عند الإقلاع — تحضير قناة
    /// البداية وفتح التبويب — فبلا هذا يُجلب كل شيء مرتين.
    private var loadTask: Task<Void, Never>?

    init(settings: AppSettings) {
        self.settings = settings
    }

    var groups: [String] {
        var seen: [String] = []
        for channel in channels where !seen.contains(channel.group) {
            seen.append(channel.group)
        }
        return seen
    }

    var visibleChannels: [Channel] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return channels.filter { channel in
            let groupMatches = selectedGroup == nil || channel.group == selectedGroup
            let queryMatches = trimmed.isEmpty
                || channel.name.localizedCaseInsensitiveContains(trimmed)
                || channel.group.localizedCaseInsensitiveContains(trimmed)
            return groupMatches && queryMatches
        }
    }

    var hasUserChannels: Bool {
        channels.contains { !$0.isDemo }
    }

    func channel(withID id: String) -> Channel? {
        channels.first { $0.id == id }
    }

    /// القناة التي يجب أن تبدأ تلقائياً عند فتح التبويب.
    var startupChannel: Channel? {
        if let last = settings.lastChannelID, let channel = channel(withID: last) {
            return channel
        }
        // نتجنّب البدء بقناة محجوبة حتى لا يكون أول ما يراه المستخدم رسالة خطأ
        return channels.first { !$0.isDemo && !$0.geoRestricted }
            ?? channels.first { !$0.isDemo }
            ?? channels.first
    }

    /// النداء الثاني ينتظر الأول بدل أن يبدأ جلباً موازياً.
    func loadIfNeeded() async {
        if let existing = loadTask {
            await existing.value
            return
        }
        guard !hasLoaded else { return }
        await reload()
    }

    /// نداء صريح بعد تغيير الإعدادات: ينتظر الجاري ثم يجلب من جديد، وإلا
    /// لم تظهر القائمة التي أضافها المستخدم للتوّ.
    func reload() async {
        if let existing = loadTask { await existing.value }
        let task = Task { await self.performReload() }
        loadTask = task
        await task.value
        loadTask = nil
    }

    private func performReload() async {
        isLoading = true
        loadErrors = []

        var collected: [Channel] = []
        if settings.showDemoChannels {
            collected.append(contentsOf: ChannelsStore.bundledChannels())
        }

        let sources = settings.playlists.filter { $0.isEnabled && $0.url != nil }
        for source in sources {
            guard let url = source.url else { continue }
            do {
                let data = try await HTTPClient.shared.data(from: url, maxAge: 60 * 30)
                let parsed = ChannelsStore.parse(data: data, name: source.name)
                if parsed.isEmpty {
                    loadErrors.append(L.s("playlist_no_channels", source.name))
                } else {
                    collected.append(contentsOf: parsed)
                }
            } catch {
                let reason = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
                loadErrors.append(L.s("playlist_error", source.name, reason))
            }
        }

        channels = ChannelsStore.deduplicated(collected)
        hasLoaded = true
        isLoading = false

        if let selectedGroup = selectedGroup, !groups.contains(selectedGroup) {
            self.selectedGroup = nil
        }
    }

    func invalidate() {
        hasLoaded = false
    }

    // MARK: - القراءة

    private static func bundledChannels() -> [Channel] {
        guard let url = Bundle.main.url(forResource: "channels", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let decoded = try? JSONDecoder().decode([Channel].self, from: data) else {
            return []
        }
        return decoded
    }

    /// تقبل قوائم M3U وقوائم JSON على السواء.
    static func parse(data: Data, name: String) -> [Channel] {
        if let decoded = try? JSONDecoder().decode([Channel].self, from: data), !decoded.isEmpty {
            return decoded.filter { $0.isPlayable }
        }
        guard let text = String(data: data, encoding: .utf8)
                ?? String(data: data, encoding: .isoLatin1) else { return [] }
        return M3UParser.parse(text, defaultGroup: name).filter { $0.isPlayable }
    }

    private static func deduplicated(_ input: [Channel]) -> [Channel] {
        var seen = Set<String>()
        var result: [Channel] = []
        for channel in input where seen.insert(channel.id).inserted {
            result.append(channel)
        }
        return result
    }
}
