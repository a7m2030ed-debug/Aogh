import Foundation

protocol MatchesProviding {
    /// مباريات يوم واحد بتوقيت جهاز المستخدم.
    func matches(on day: Date) async throws -> [Match]
    var attribution: String { get }
}

// MARK: - TheSportsDB (يعمل بدون تسجيل)

struct SportsDBProvider: MatchesProviding {

    let apiKey: String

    var attribution: String { L.s("attribution_sportsdb") }

    private struct Response: Decodable {
        let events: [Event]?
    }

    private struct Event: Decodable {
        let idEvent: LooseString?
        let strLeague: LooseString?
        let idLeague: LooseString?
        let strLeagueBadge: LooseString?
        let strHomeTeam: LooseString?
        let strAwayTeam: LooseString?
        let strHomeTeamBadge: LooseString?
        let strAwayTeamBadge: LooseString?
        let intHomeScore: LooseString?
        let intAwayScore: LooseString?
        let dateEvent: LooseString?
        let strTime: LooseString?
        let strTimestamp: LooseString?
        let strStatus: LooseString?
        let strPostponed: LooseString?
        let strVenue: LooseString?
        let intRound: LooseString?
        let strSport: LooseString?
    }

    func matches(on day: Date) async throws -> [Match] {
        let key = apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !key.isEmpty else { throw KTError.missingKey(L.s("sportsdb_key")) }

        var components = URLComponents(string: "https://www.thesportsdb.com/api/v1/json/\(key)/eventsday.php")
        components?.queryItems = [
            URLQueryItem(name: "d", value: KTDate.apiDay.string(from: day)),
            URLQueryItem(name: "s", value: "Soccer")
        ]
        guard let url = components?.url else { throw KTError.badURL("TheSportsDB") }

        let isToday = KTDate.isSameDay(day, Date())
        let response = try await HTTPClient.shared.decode(
            Response.self,
            from: url,
            maxAge: isToday ? 45 : 60 * 30,
            revalidate: isToday
        )

        let events = response.events ?? []
        return events.compactMap { convert($0) }
    }

    private func convert(_ event: Event) -> Match? {
        guard let home = event.strHomeTeam?.value,
              let away = event.strAwayTeam?.value else { return nil }
        if let sport = event.strSport?.value, sport.caseInsensitiveCompare("Soccer") != .orderedSame {
            return nil
        }

        let kickoff = KTDate.parseUTC(event.strTimestamp?.value)
            ?? KTDate.combine(day: event.dateEvent?.value, time: event.strTime?.value)

        let rawStatus = event.strStatus?.value
        let homeScore = event.intHomeScore?.intValue
        let awayScore = event.intAwayScore?.intValue

        let status = MatchStatusResolver.resolve(
            raw: rawStatus,
            postponed: event.strPostponed?.value,
            kickoff: kickoff
        )

        let identifier = event.idEvent?.value ?? "\(home)-\(away)-\(event.dateEvent?.value ?? "")"

        return Match(
            id: identifier,
            kickoff: kickoff,
            homeName: home,
            awayName: away,
            homeBadge: event.strHomeTeamBadge?.urlValue,
            awayBadge: event.strAwayTeamBadge?.urlValue,
            homeScore: homeScore,
            awayScore: awayScore,
            status: status,
            progress: MatchStatusResolver.progressText(raw: rawStatus, status: status),
            competition: event.strLeague?.value ?? L.s("other_competitions"),
            competitionID: event.idLeague?.value,
            competitionBadge: event.strLeagueBadge?.urlValue,
            venue: event.strVenue?.value,
            round: event.intRound?.value
        )
    }
}

// MARK: - football-data.org (يحتاج مفتاحاً مجانياً)

struct FootballDataProvider: MatchesProviding {

    let token: String

    var attribution: String { L.s("attribution_footballdata") }

    private struct Response: Decodable {
        let matches: [Fixture]?
    }

    private struct Fixture: Decodable {
        struct Competition: Decodable {
            let id: Int?
            let name: String?
            let emblem: String?
        }
        struct Team: Decodable {
            let name: String?
            let shortName: String?
            let crest: String?
        }
        struct Score: Decodable {
            struct Pair: Decodable {
                let home: Int?
                let away: Int?
            }
            let fullTime: Pair?
            let halfTime: Pair?
        }

        let id: Int?
        let utcDate: String?
        let status: String?
        let matchday: Int?
        let competition: Competition?
        let homeTeam: Team?
        let awayTeam: Team?
        let score: Score?
    }

    func matches(on day: Date) async throws -> [Match] {
        let key = token.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !key.isEmpty else { throw KTError.missingKey(L.s("footballdata_key")) }

        let stamp = KTDate.apiDay.string(from: day)
        var components = URLComponents(string: "https://api.football-data.org/v4/matches")
        components?.queryItems = [
            URLQueryItem(name: "dateFrom", value: stamp),
            URLQueryItem(name: "dateTo", value: stamp)
        ]
        guard let url = components?.url else { throw KTError.badURL("football-data.org") }

        let isToday = KTDate.isSameDay(day, Date())
        let response = try await HTTPClient.shared.decode(
            Response.self,
            from: url,
            headers: ["X-Auth-Token": key],
            maxAge: isToday ? 45 : 60 * 30,
            revalidate: isToday
        )

        return (response.matches ?? []).compactMap { convert($0) }
    }

    private func convert(_ fixture: Fixture) -> Match? {
        guard let home = fixture.homeTeam?.shortName ?? fixture.homeTeam?.name,
              let away = fixture.awayTeam?.shortName ?? fixture.awayTeam?.name else { return nil }

        let status: Match.Status
        switch (fixture.status ?? "").uppercased() {
        case "IN_PLAY", "PAUSED", "LIVE":
            status = .live
        case "FINISHED", "AWARDED":
            status = .finished
        case "POSTPONED", "SUSPENDED":
            status = .postponed
        case "CANCELLED", "CANCELED":
            status = .canceled
        default:
            status = .scheduled
        }

        let progress: String?
        switch (fixture.status ?? "").uppercased() {
        case "PAUSED": progress = L.s("half_time")
        case "IN_PLAY": progress = L.s("status_in_play")
        default: progress = nil
        }

        return Match(
            id: fixture.id.map(String.init) ?? "\(home)-\(away)-\(fixture.utcDate ?? "")",
            kickoff: KTDate.parseUTC(fixture.utcDate),
            homeName: home,
            awayName: away,
            homeBadge: fixture.homeTeam?.crest.flatMap(URL.init(string:)),
            awayBadge: fixture.awayTeam?.crest.flatMap(URL.init(string:)),
            homeScore: fixture.score?.fullTime?.home,
            awayScore: fixture.score?.fullTime?.away,
            status: status,
            progress: progress,
            competition: fixture.competition?.name ?? L.s("other_competitions"),
            competitionID: fixture.competition?.id.map(String.init),
            competitionBadge: fixture.competition?.emblem.flatMap(URL.init(string:)),
            venue: nil,
            round: fixture.matchday.map(String.init)
        )
    }
}

// MARK: - قراءة الحالة

enum MatchStatusResolver {

    static func resolve(raw: String?, postponed: String?, kickoff: Date?) -> Match.Status {
        if let postponed = postponed, postponed.lowercased() == "yes" { return .postponed }

        let code = (raw ?? "").trimmingCharacters(in: .whitespaces).uppercased()

        if ["FT", "AET", "PEN", "MATCH FINISHED", "FINISHED", "ENDED", "AWARDED"].contains(code) {
            return .finished
        }
        if code.contains("POSTPON") { return .postponed }
        if code.contains("CANCEL") || code.contains("ABANDON") { return .canceled }
        if ["1H", "2H", "HT", "ET", "BT", "P", "LIVE", "IN PLAY", "INPLAY", "PAUSED"].contains(code) {
            return .live
        }
        if let minute = Int(code.prefix(while: { $0.isNumber })), minute > 0, minute <= 130 {
            return .live
        }

        // لا حالة صريحة من المصدر: نعتمد على وقت البداية.
        guard let kickoff = kickoff else { return .scheduled }
        let elapsed = Date().timeIntervalSince(kickoff)
        if elapsed < 0 { return .scheduled }
        if elapsed > 2.6 * 3600 { return .finished }
        return .live
    }

    static func progressText(raw: String?, status: Match.Status) -> String? {
        guard status == .live else { return nil }
        let code = (raw ?? "").trimmingCharacters(in: .whitespaces).uppercased()
        switch code {
        case "1H": return L.s("half_first")
        case "2H": return L.s("half_second")
        case "HT": return L.s("half_time")
        case "ET": return L.s("extra_time")
        case "PEN", "P": return L.s("penalties")
        case "": return nil
        default:
            if Int(code.prefix(while: { $0.isNumber })) != nil {
                return "\(code)′"
            }
            return nil
        }
    }
}
