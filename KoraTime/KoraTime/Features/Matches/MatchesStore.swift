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
            .sorted { lhs, rhs in
                if (lhs.liveCount > 0) != (rhs.liveCount > 0) { return lhs.liveCount > 0 }
                let lhsRank = CompetitionPriority.rank(lhs.title)
                let rhsRank = CompetitionPriority.rank(rhs.title)
                if lhsRank != rhsRank { return lhsRank < rhsRank }
                return lhs.title < rhs.title
            }
    }

    var attribution: String { provider.attribution }

    private var provider: MatchesProviding {
        switch settings.matchesSource {
        case .sportsDB:
            return SportsDBProvider(apiKey: settings.sportsDBKey)
        case .footballData:
            return FootballDataProvider(token: settings.footballDataToken)
        }
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

        let currentProvider = provider
        loadTask = Task { [weak self] in
            do {
                let result = try await currentProvider.matches(on: day)
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
        let currentProvider = provider
        do {
            let result = try await currentProvider.matches(on: day)
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
