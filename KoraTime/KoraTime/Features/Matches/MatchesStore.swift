import Foundation
import Observation

@MainActor
@Observable
final class MatchesStore {

    private let settings: AppSettings

    var selectedDay: Date = KTDate.startOfDay(Date())
    var query: String = ""
    var liveOnly: Bool = false
    var isLoading: Bool = false
    var errorMessage: String?
    var lastUpdated: Date?

    /// مباريات كل يوم محفوظة كي لا نعيد الطلب عند التنقّل بين الأيام.
    private var cache: [String: [Match]] = [:]
    private var loadTask: Task<Void, Never>?
    private var refreshTimer: Task<Void, Never>?

    init(settings: AppSettings) {
        self.settings = settings
    }

    var days: [Date] {
        let today = KTDate.startOfDay(Date())
        return (-4...10).map { KTDate.adding(days: $0, to: today) }
    }

    var allMatchesForDay: [Match] {
        cache[key(for: selectedDay)] ?? []
    }

    var visibleMatches: [Match] {
        allMatchesForDay.filter { match in
            (!liveOnly || match.isLive) && match.matches(query: query, arabic: settings.arabicNames)
        }
    }

    var liveCount: Int {
        allMatchesForDay.filter(\.isLive).count
    }

    /// المباريات مرتّبة تحت بطولاتها: البطولة التي فيها مباراة مباشرة أولاً.
    var sections: [MatchSection] {
        let arabic = settings.arabicNames
        var buckets: [String: MatchSection] = [:]

        for match in visibleMatches {
            let title = match.competitionTitle(arabic: arabic)
            let identifier = match.competitionID ?? title
            if var existing = buckets[identifier] {
                existing.matches.append(match)
                buckets[identifier] = existing
            } else {
                buckets[identifier] = MatchSection(
                    id: identifier,
                    title: title,
                    badge: match.competitionBadge,
                    matches: [match]
                )
            }
        }

        return buckets.values
            .map { section in
                var sorted = section
                sorted.matches.sort { lhs, rhs in
                    if lhs.isLive != rhs.isLive { return lhs.isLive }
                    switch (lhs.kickoff, rhs.kickoff) {
                    case let (left?, right?): return left < right
                    case (nil, _): return false
                    case (_, nil): return true
                    }
                }
                return sorted
            }
            // الأهمية قبل «فيها مباراة مباشرة»: كان دوري صغير فيه مباراة
            // جارية يقفز فوق روشن والدوريات الكبرى، وهذا عكس المطلوب.
            // ودوريات المستخدم المختارة تسبق الجميع.
            .sorted { lhs, rhs in
                let lhsFavorite = favoriteRank(lhs.title)
                let rhsFavorite = favoriteRank(rhs.title)
                if lhsFavorite != rhsFavorite { return lhsFavorite < rhsFavorite }
                let lhsRank = CompetitionPriority.rank(lhs.title)
                let rhsRank = CompetitionPriority.rank(rhs.title)
                if lhsRank != rhsRank { return lhsRank < rhsRank }
                if (lhs.liveCount > 0) != (rhs.liveCount > 0) { return lhs.liveCount > 0 }
                return lhs.title < rhs.title
            }
    }

    /// موضع البطولة في دوريات المستخدم المختارة، ومن لم يختر شيئاً يتساوى
    /// عنده الجميع فيتولّى `CompetitionPriority` الترتيب وحده.
    private func favoriteRank(_ title: String) -> Int {
        let chosen = settings.favoriteLeagues
        guard !chosen.isEmpty else { return 0 }
        let needle = title.lowercased()
        for (position, id) in chosen.enumerated() {
            guard let league = Catalog.league(id) else { continue }
            if league.ar == title
                || needle.contains(league.ar.lowercased())
                || needle.contains(league.en.lowercased()) {
                return position
            }
        }
        return chosen.count + 1
    }

    var attribution: String {
        settings.apiFootballKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? fallbackProvider.attribution
            : L.s("attribution_apifootball")
    }

    /// المصدر القديم بحدوده المعروفة — يعمل بلا مفتاح، ويبقى شبكةَ أمان
    /// حين لا يُرجع API-Football شيئاً لليوم المطلوب.
    private var fallbackProvider: MatchesProviding {
        switch settings.matchesSource {
        case .sportsDB:
            return SportsDBProvider(apiKey: settings.sportsDBKey)
        case .footballData:
            return FootballDataProvider(token: settings.footballDataToken)
        }
    }

    /// مفتاح API-Football يعني تغطية روشن والدوريات الكبرى؛ بلا مفتاح نبقى
    /// على المصدر القديم. تُقرأ الإعدادات هنا قبل بدء المهمّة، فلا تُلمَس من
    /// خارج الخيط الرئيسي.
    private var fetchPlan: (key: String, fallback: MatchesProviding) {
        (settings.apiFootballKey.trimmingCharacters(in: .whitespacesAndNewlines), fallbackProvider)
    }

    private static func fetch(
        day: Date,
        key: String,
        fallback: MatchesProviding
    ) async throws -> [Match] {
        guard !key.isEmpty else { return try await fallback.matches(on: day) }
        let primary = try await ApiFootballProvider(apiKey: key).matches(on: day)
        // يوم بلا مباريات في API-Football قد يكون حدّ الخطة المجانية، لا
        // يوماً فارغاً — فنسأل المصدر القديم قبل أن نُظهر شاشة خالية.
        if primary.isEmpty { return try await fallback.matches(on: day) }
        return primary
    }

    // MARK: - التحميل

    func select(day: Date) {
        guard !KTDate.isSameDay(day, selectedDay) else { return }
        selectedDay = KTDate.startOfDay(day)
        errorMessage = nil
        load()
    }

    /// يُستدعى عند ظهور الشاشة: لا يعيد الطلب إن كانت بيانات اليوم محمّلة.
    func loadIfNeeded() {
        if cache[key(for: selectedDay)] == nil {
            load()
        }
    }

    func load(force: Bool = false) {
        let day = selectedDay
        let cacheKey = key(for: day)
        if !force, cache[cacheKey] != nil { return }

        loadTask?.cancel()
        isLoading = true
        errorMessage = nil

        let plan = fetchPlan
        loadTask = Task { [weak self] in
            do {
                let result = try await Self.fetch(day: day, key: plan.key, fallback: plan.fallback)
                guard let self = self, !Task.isCancelled else { return }
                self.cache[cacheKey] = result
                self.lastUpdated = Date()
                self.errorMessage = nil
                self.isLoading = false
            } catch is CancellationError {
                return
            } catch {
                guard let self = self, !Task.isCancelled else { return }
                self.isLoading = false
                if self.cache[cacheKey] == nil {
                    self.errorMessage = (error as? LocalizedError)?.errorDescription
                        ?? error.localizedDescription
                }
            }
        }
    }

    /// تحديث صامت أثناء وجود المستخدم في الشاشة (للنتائج المباشرة).
    func refresh() async {
        let day = selectedDay
        let cacheKey = key(for: day)
        let plan = fetchPlan
        do {
            let result = try await Self.fetch(day: day, key: plan.key, fallback: plan.fallback)
            guard !Task.isCancelled else { return }
            cache[cacheKey] = result
            lastUpdated = Date()
            errorMessage = nil
        } catch {
            if cache[cacheKey] == nil {
                errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            }
        }
        isLoading = false
    }

    func startLiveUpdates() {
        stopLiveUpdates()
        guard settings.autoRefreshLive else { return }
        refreshTimer = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 60 * 1_000_000_000)
                guard !Task.isCancelled else { return }
                guard let self = self else { return }
                if self.liveCount > 0 || KTDate.isSameDay(self.selectedDay, Date()) {
                    await self.refresh()
                }
            }
        }
    }

    func stopLiveUpdates() {
        refreshTimer?.cancel()
        refreshTimer = nil
    }

    /// عند تغيير مصدر البيانات أو مفتاحه من الإعدادات.
    func invalidate() {
        cache.removeAll()
        errorMessage = nil
        load(force: true)
    }

    private func key(for day: Date) -> String {
        KTDate.apiDay.string(from: day)
    }
}
