import Foundation

/// الناقل الرسمي لبطولة معيّنة.
///
/// البثّ الحصري لا يعمل في أي مشغّل خارجي — حقوقه محمية بتشفير DRM ومفاتيحه
/// داخل تطبيق صاحب الحق وحده. فبدل أن نَعِد بما لا يعمل، يعرض التطبيق اسم
/// الناقل ويفتح تطبيقه على المباراة مباشرة.
struct Broadcaster: Identifiable, Hashable {
    let id: String
    let name: String
    let note: String
    /// رابط يفتح التطبيق نفسه إن كان مثبّتاً على الجهاز.
    let appURL: URL?
    /// متجر التطبيقات، للحالة التي لا يكون فيها مثبّتاً.
    let storeURL: URL?
    /// كلمات تُطابق اسم البطولة كما يصل من مصدر البيانات، عربياً أو إنجليزياً.
    let competitionKeywords: [String]

    var openURL: URL? { appURL ?? storeURL }
}

enum Broadcasters {

    static let all: [Broadcaster] = [
        Broadcaster(
            id: "thmanyah",
            name: "ثمانية",
            note: "الناقل الحصري لدوري روشن وكأس الملك والسوبر ودوري يلو حتى ٢٠٣١. المشاهدة مجانية بحساب مجاني.",
            appURL: URL(string: "https://app.thmanyah.com"),
            storeURL: URL(string: "https://apps.apple.com/sa/app/id6746764325"),
            competitionKeywords: [
                "روشن", "يلو", "خادم الحرمين", "السوبر السعودي", "الدوري السعودي",
                "saudi pro league", "saudi professional league", "saudi arabian pro league",
                "saudi first division", "kings cup", "saudi super cup"
            ]
        )
    ]

    /// يبحث عن ناقل يغطّي هذه البطولة، بالاسم المعرَّب أو الأصلي.
    static func broadcaster(forCompetition names: String...) -> Broadcaster? {
        let haystack = names.joined(separator: " ").lowercased()
        guard !haystack.isEmpty else { return nil }
        return all.first { broadcaster in
            broadcaster.competitionKeywords.contains { haystack.contains($0.lowercased()) }
        }
    }
}
