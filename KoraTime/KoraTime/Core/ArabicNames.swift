import Foundation

/// تعريب أسماء الفرق والبطولات القادمة من واجهات البيانات الإنجليزية.
/// ما لا يوجد له مقابل يُعرض كما هو بدل أن يختفي.
enum ArabicNames {

    private struct Payload: Decodable {
        let leagues: [String: String]
        let teams: [String: String]
    }

    private static let payload: Payload = {
        guard let url = Bundle.main.url(forResource: "ar-names", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let decoded = try? JSONDecoder().decode(Payload.self, from: data) else {
            return Payload(leagues: [:], teams: [:])
        }
        return decoded
    }()

    private static let leagueIndex: [String: String] = normalizedIndex(payload.leagues)
    private static let teamIndex: [String: String] = normalizedIndex(payload.teams)

    private static func normalizedIndex(_ source: [String: String]) -> [String: String] {
        var index: [String: String] = [:]
        index.reserveCapacity(source.count * 2)
        for (key, value) in source {
            index[normalize(key)] = value
        }
        return index
    }

    /// يوحّد الشكل قبل المطابقة: حروف صغيرة، بلا "FC" و"SC" و"CF"، وبلا شرطات.
    private static func normalize(_ name: String) -> String {
        var text = name.lowercased()
        for noise in [" fc", "fc ", " f.c.", " sc", " cf ", " cf", " afc", " sfc", " club"] {
            text = text.replacingOccurrences(of: noise, with: " ")
        }
        text = text.replacingOccurrences(of: "-", with: " ")
        text = text.replacingOccurrences(of: ".", with: " ")
        text = text.components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
        return text
    }

    static func team(_ name: String, enabled: Bool = true) -> String {
        guard enabled, !name.isEmpty else { return name }
        return teamIndex[normalize(name)] ?? name
    }

    static func league(_ name: String, enabled: Bool = true) -> String {
        guard enabled, !name.isEmpty else { return name }
        let key = normalize(name)
        if let exact = leagueIndex[key] { return exact }
        // بعض المصادر تلحق الموسم أو البلد باسم البطولة.
        for (candidate, value) in leagueIndex where candidate.count > 6 && key.contains(candidate) {
            return value
        }
        return name
    }

    /// أول حرفين لعرضهما داخل دائرة عندما لا يتوفر شعار الفريق.
    static func monogram(_ name: String) -> String {
        let parts = name.components(separatedBy: .whitespaces).filter { !$0.isEmpty }
        guard let first = parts.first else { return "?" }
        if parts.count >= 2, let a = first.first, let b = parts[1].first {
            return String([a, b])
        }
        return String(first.prefix(2))
    }
}
