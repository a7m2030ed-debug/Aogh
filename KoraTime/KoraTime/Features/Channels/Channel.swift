import Foundation

struct Channel: Identifiable, Hashable {
    var id: String
    var name: String
    var group: String
    var logo: String?
    var url: String
    var userAgent: String?
    var referer: String?
    var note: String?
    var isDemo: Bool

    init(id: String? = nil,
         name: String,
         group: String = "قنوات",
         logo: String? = nil,
         url: String,
         userAgent: String? = nil,
         referer: String? = nil,
         note: String? = nil,
         isDemo: Bool = false) {
        self.name = name
        self.group = group
        self.logo = logo
        self.url = url
        self.userAgent = userAgent
        self.referer = referer
        self.note = note
        self.isDemo = isDemo
        self.id = id ?? Channel.makeID(name: name, url: url)
    }

    static func makeID(name: String, url: String) -> String {
        "\(name.lowercased())|\(url.lowercased())"
    }

    var streamURL: URL? {
        URL(string: url.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    var logoURL: URL? {
        guard let logo = logo, logo.hasPrefix("http") else { return nil }
        return URL(string: logo)
    }

    /// ترويسات HTTP التي تطلبها بعض المصادر لتشغيل البث.
    var headers: [String: String] {
        var result: [String: String] = [:]
        if let userAgent = userAgent, !userAgent.isEmpty { result["User-Agent"] = userAgent }
        if let referer = referer, !referer.isEmpty { result["Referer"] = referer }
        return result
    }

    var isPlayable: Bool {
        guard let streamURL = streamURL else { return false }
        return streamURL.scheme?.hasPrefix("http") == true
    }
}

extension Channel: Codable {

    enum CodingKeys: String, CodingKey {
        case id, name, group, logo, url, userAgent, referer, note, isDemo
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let name = try container.decodeIfPresent(String.self, forKey: .name) ?? "قناة"
        let url = try container.decodeIfPresent(String.self, forKey: .url) ?? ""
        self.init(
            id: try container.decodeIfPresent(String.self, forKey: .id),
            name: name,
            group: try container.decodeIfPresent(String.self, forKey: .group) ?? "قنوات",
            logo: try container.decodeIfPresent(String.self, forKey: .logo),
            url: url,
            userAgent: try container.decodeIfPresent(String.self, forKey: .userAgent),
            referer: try container.decodeIfPresent(String.self, forKey: .referer),
            note: try container.decodeIfPresent(String.self, forKey: .note),
            isDemo: try container.decodeIfPresent(Bool.self, forKey: .isDemo) ?? false
        )
    }
}

/// قارئ قوائم M3U/M3U8 — الصيغة التي تستخدمها معظم مشغّلات البث.
enum M3UParser {

    static func parse(_ text: String, defaultGroup: String) -> [Channel] {
        var channels: [Channel] = []

        var pendingName: String?
        var pendingLogo: String?
        var pendingGroup: String?
        var pendingUserAgent: String?
        var pendingReferer: String?

        func reset() {
            pendingName = nil
            pendingLogo = nil
            pendingGroup = nil
            pendingUserAgent = nil
            pendingReferer = nil
        }

        for rawLine in text.components(separatedBy: .newlines) {
            let line = rawLine.trimmingCharacters(in: .whitespaces)
            if line.isEmpty { continue }

            if line.hasPrefix("#EXTINF") {
                let attributes = self.attributes(in: line)
                pendingLogo = attributes["tvg-logo"]
                pendingGroup = attributes["group-title"]
                if let comma = line.range(of: ",", options: .backwards) {
                    let title = String(line[comma.upperBound...]).trimmingCharacters(in: .whitespaces)
                    pendingName = title.isEmpty ? attributes["tvg-name"] : title
                } else {
                    pendingName = attributes["tvg-name"]
                }
            } else if line.hasPrefix("#EXTGRP:") {
                pendingGroup = String(line.dropFirst("#EXTGRP:".count)).trimmingCharacters(in: .whitespaces)
            } else if line.hasPrefix("#EXTVLCOPT:") {
                let option = String(line.dropFirst("#EXTVLCOPT:".count))
                if let separator = option.firstIndex(of: "=") {
                    let key = String(option[option.startIndex..<separator]).lowercased()
                    let value = String(option[option.index(after: separator)...])
                    if key.contains("user-agent") { pendingUserAgent = value }
                    if key.contains("referrer") || key.contains("referer") { pendingReferer = value }
                }
            } else if line.hasPrefix("#") {
                continue
            } else {
                // سطر الرابط: قد يحمل ترويسات بعد "|"
                var address = line
                if let pipe = address.firstIndex(of: "|") {
                    let suffix = String(address[address.index(after: pipe)...])
                    address = String(address[address.startIndex..<pipe])
                    for pair in suffix.components(separatedBy: "&") {
                        guard let equals = pair.firstIndex(of: "=") else { continue }
                        let key = String(pair[pair.startIndex..<equals]).lowercased()
                        let value = String(pair[pair.index(after: equals)...])
                            .removingPercentEncoding ?? String(pair[pair.index(after: equals)...])
                        if key.contains("user-agent") { pendingUserAgent = value }
                        if key.contains("referer") || key.contains("referrer") { pendingReferer = value }
                    }
                }

                guard address.hasPrefix("http") else { reset(); continue }

                channels.append(
                    Channel(
                        name: pendingName ?? "قناة \(channels.count + 1)",
                        group: pendingGroup?.isEmpty == false ? pendingGroup! : defaultGroup,
                        logo: pendingLogo,
                        url: address,
                        userAgent: pendingUserAgent,
                        referer: pendingReferer
                    )
                )
                reset()
            }
        }

        return channels
    }

    private static let attributeRegex = try? NSRegularExpression(
        pattern: "([A-Za-z0-9_-]+)=\"([^\"]*)\"",
        options: []
    )

    private static func attributes(in line: String) -> [String: String] {
        guard let regex = attributeRegex else { return [:] }
        var result: [String: String] = [:]
        let range = NSRange(line.startIndex..<line.endIndex, in: line)
        for match in regex.matches(in: line, options: [], range: range) {
            guard match.numberOfRanges == 3,
                  let keyRange = Range(match.range(at: 1), in: line),
                  let valueRange = Range(match.range(at: 2), in: line) else { continue }
            result[String(line[keyRange]).lowercased()] = String(line[valueRange])
        }
        return result
    }
}
