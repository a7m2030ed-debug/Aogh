import Foundation
import Observation

@MainActor
@Observable
final class NewsStore {

    private let settings: AppSettings

    private(set) var items: [NewsItem] = []
    private(set) var isLoading = false
    private(set) var feedErrors: [String] = []
    private(set) var lastUpdated: Date?

    /// عند البحث نتجاهل الخلاصات المتابَعة ونستخدم بحث أخبار Google.
    var searchQuery: String = ""

    private var hasLoaded = false

    init(settings: AppSettings) {
        self.settings = settings
    }

    var isSearching: Bool {
        !searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    func loadIfNeeded() async {
        guard !hasLoaded else { return }
        await reload()
    }

    func reload() async {
        isLoading = true
        feedErrors = []

        let sources = currentSources()
        guard !sources.isEmpty else {
            items = []
            isLoading = false
            hasLoaded = true
            feedErrors = [L.s("news_no_feeds_add")]
            return
        }

        var collected: [NewsItem] = []
        var errors: [String] = []

        await withTaskGroup(of: FeedResult.self) { group in
            for source in sources {
                group.addTask { await NewsStore.fetch(source) }
            }
            for await result in group {
                collected.append(contentsOf: result.items)
                if let error = result.error { errors.append(error) }
            }
        }

        items = NewsStore.merge(collected)
        feedErrors = items.isEmpty ? errors : []
        lastUpdated = Date()
        hasLoaded = true
        isLoading = false
    }

    func search(_ query: String) async {
        searchQuery = query
        hasLoaded = false
        await reload()
    }

    func clearSearch() async {
        searchQuery = ""
        hasLoaded = false
        await reload()
    }

    func invalidate() {
        hasLoaded = false
    }

    // MARK: - المصادر

    private func currentSources() -> [FeedSource] {
        let trimmed = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty {
            guard let url = GoogleNews.url(for: trimmed) else { return [] }
            return [FeedSource(name: L.s("news_search_feed", trimmed), urlString: url.absoluteString)]
        }
        return settings.feeds.filter { $0.isEnabled && $0.url != nil }
    }

    private struct FeedResult {
        let items: [NewsItem]
        let error: String?
    }

    nonisolated private static func fetch(_ source: FeedSource) async -> FeedResult {
        guard let url = source.url else {
            return FeedResult(items: [], error: L.s("feed_invalid_url", source.name))
        }
        do {
            let data = try await HTTPClient.shared.data(from: url, maxAge: 5 * 60)
            let parsed = FeedParser().parse(data: data, fallbackSource: source.name)
            if parsed.isEmpty {
                return FeedResult(items: [], error: L.s("feed_no_items", source.name))
            }
            return FeedResult(items: parsed, error: nil)
        } catch {
            let reason = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            return FeedResult(items: [], error: L.s("news_feed_error", source.name, reason))
        }
    }

    /// إزالة المكرّر، فصل اسم الموقع عن العنوان، ثم الترتيب بالأحدث.
    nonisolated private static func merge(_ input: [NewsItem]) -> [NewsItem] {
        var seen = Set<String>()
        var result: [NewsItem] = []

        for item in input {
            let split = HTMLText.splitSourceSuffix(item.title)
            let cleaned = NewsItem(
                id: item.id,
                title: split.title,
                summary: item.summary,
                link: item.link,
                imageURL: item.imageURL,
                source: split.source ?? item.source,
                date: item.date
            )

            let fingerprint = signature(of: cleaned.title)
            guard seen.insert(fingerprint).inserted else { continue }
            result.append(cleaned)
        }

        result.sort { lhs, rhs in
            switch (lhs.date, rhs.date) {
            case let (left?, right?): return left > right
            case (nil, _): return false
            case (_, nil): return true
            }
        }
        return Array(result.prefix(150))
    }

    nonisolated private static func signature(of title: String) -> String {
        var stripped = ""
        for scalar in title.lowercased().unicodeScalars
        where CharacterSet.alphanumerics.contains(scalar) || scalar == " " {
            stripped.unicodeScalars.append(scalar)
        }
        return String(stripped.prefix(70))
    }
}
