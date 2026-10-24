import Foundation

struct NewsItem: Identifiable, Hashable {
    let id: String
    let title: String
    let summary: String
    let link: URL?
    let imageURL: URL?
    let source: String
    let date: Date?

    var relativeDate: String {
        guard let date = date else { return "" }
        return KTDate.ago(date)
    }

    /// كثير من الخلاصات تعيد العنوان نفسه في الوصف — لا فائدة من عرضه مرتين.
    var meaningfulSummary: String? {
        let trimmed = summary.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count > 30 else { return nil }
        let head = title.prefix(40).lowercased()
        guard !head.isEmpty, !trimmed.lowercased().hasPrefix(String(head)) else { return nil }
        return trimmed
    }
}

/// قارئ خلاصات RSS 2.0 و Atom بمحلّل XML المدمج — بلا مكتبات خارجية.
final class FeedParser: NSObject {

    private struct Draft {
        var title = ""
        var link = ""
        var summary = ""
        var content = ""
        var date = ""
        var image = ""
        var source = ""
        var guid = ""
    }

    private var items: [NewsItem] = []
    private var draft = Draft()
    private var buffer = ""
    private var insideItem = false
    private var channelTitle = ""
    private var fallbackSource = ""

    func parse(data: Data, fallbackSource: String) -> [NewsItem] {
        self.fallbackSource = fallbackSource
        items = []
        channelTitle = ""
        insideItem = false

        let parser = XMLParser(data: data)
        parser.delegate = self
        parser.shouldProcessNamespaces = false
        parser.parse()
        return items
    }
}

extension FeedParser: XMLParserDelegate {

    func parser(_ parser: XMLParser,
                didStartElement elementName: String,
                namespaceURI: String?,
                qualifiedName qName: String?,
                attributes attributeDict: [String: String] = [:]) {
        let name = elementName.lowercased()
        buffer = ""

        if name == "item" || name == "entry" {
            insideItem = true
            draft = Draft()
            return
        }

        guard insideItem else { return }

        switch name {
        case "link":
            // Atom يضع الرابط في السمة href
            if let href = attributeDict["href"], !href.isEmpty {
                let relation = attributeDict["rel"] ?? "alternate"
                if relation == "alternate" || draft.link.isEmpty {
                    draft.link = href
                }
            }
        case "enclosure", "media:content", "media:thumbnail", "itunes:image":
            if let url = attributeDict["url"] ?? attributeDict["href"], draft.image.isEmpty {
                let type = attributeDict["type"] ?? ""
                if type.isEmpty || type.hasPrefix("image") {
                    draft.image = url
                }
            }
        default:
            break
        }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        buffer += string
    }

    func parser(_ parser: XMLParser, foundCDATA CDATABlock: Data) {
        if let text = String(data: CDATABlock, encoding: .utf8) {
            buffer += text
        }
    }

    func parser(_ parser: XMLParser,
                didEndElement elementName: String,
                namespaceURI: String?,
                qualifiedName qName: String?) {
        let name = elementName.lowercased()
        let text = buffer.trimmingCharacters(in: .whitespacesAndNewlines)
        buffer = ""

        if name == "item" || name == "entry" {
            insideItem = false
            if let item = makeItem(from: draft) { items.append(item) }
            draft = Draft()
            return
        }

        guard insideItem else {
            if name == "title", channelTitle.isEmpty { channelTitle = text }
            return
        }

        switch name {
        case "title":
            if draft.title.isEmpty { draft.title = text }
        case "link":
            if draft.link.isEmpty, !text.isEmpty { draft.link = text }
        case "guid", "id":
            if draft.guid.isEmpty { draft.guid = text }
        case "description", "summary":
            if draft.summary.isEmpty { draft.summary = text }
        case "content:encoded", "content":
            if draft.content.isEmpty { draft.content = text }
        case "pubdate", "published", "updated", "dc:date":
            if draft.date.isEmpty { draft.date = text }
        case "source", "dc:creator":
            if draft.source.isEmpty { draft.source = text }
        default:
            break
        }
    }

    private func makeItem(from draft: Draft) -> NewsItem? {
        let title = HTMLText.plain(draft.title)
        guard !title.isEmpty else { return nil }

        let body = draft.summary.isEmpty ? draft.content : draft.summary
        let summary = HTMLText.plain(body)
        let image = draft.image.isEmpty
            ? HTMLText.firstImage(in: draft.content.isEmpty ? draft.summary : draft.content)
            : draft.image

        let source = draft.source.isEmpty
            ? (channelTitle.isEmpty ? fallbackSource : channelTitle)
            : draft.source

        let identifier = draft.guid.isEmpty
            ? (draft.link.isEmpty ? title : draft.link)
            : draft.guid

        return NewsItem(
            id: identifier,
            title: title,
            summary: summary,
            link: URL(string: draft.link.trimmingCharacters(in: .whitespacesAndNewlines)),
            imageURL: image.hasPrefix("http") ? URL(string: image) : nil,
            source: source,
            date: KTDate.parseFeedDate(draft.date)
        )
    }
}

/// أدوات تنظيف نصوص HTML القادمة داخل الخلاصات.
enum HTMLText {

    private static let tagRegex = try? NSRegularExpression(pattern: "<[^>]+>", options: [])
    private static let imageRegex = try? NSRegularExpression(
        pattern: "<img[^>]+src=[\"']([^\"']+)[\"']",
        options: [.caseInsensitive]
    )

    static func plain(_ html: String) -> String {
        guard !html.isEmpty else { return "" }
        var text = html
        if let regex = tagRegex {
            let range = NSRange(text.startIndex..<text.endIndex, in: text)
            text = regex.stringByReplacingMatches(in: text, options: [], range: range, withTemplate: " ")
        }
        let entities = [
            "&nbsp;": " ", "&amp;": "&", "&quot;": "\"", "&#39;": "'",
            "&lt;": "<", "&gt;": ">", "&laquo;": "«", "&raquo;": "»", "&hellip;": "…"
        ]
        for (entity, replacement) in entities {
            text = text.replacingOccurrences(of: entity, with: replacement)
        }
        return text
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    static func firstImage(in html: String) -> String {
        guard !html.isEmpty, let regex = imageRegex else { return "" }
        let range = NSRange(html.startIndex..<html.endIndex, in: html)
        guard let match = regex.firstMatch(in: html, options: [], range: range),
              match.numberOfRanges >= 2,
              let captured = Range(match.range(at: 1), in: html) else { return "" }
        return String(html[captured])
    }

    /// عناوين أخبار Google تأتي بصيغة "العنوان - اسم الموقع".
    static func splitSourceSuffix(_ title: String) -> (title: String, source: String?) {
        guard let separator = title.range(of: " - ", options: .backwards) else { return (title, nil) }
        let head = String(title[title.startIndex..<separator.lowerBound])
            .trimmingCharacters(in: .whitespaces)
        let tail = String(title[separator.upperBound...]).trimmingCharacters(in: .whitespaces)
        guard !head.isEmpty, !tail.isEmpty, tail.count <= 40 else { return (title, nil) }
        return (head, tail)
    }
}
