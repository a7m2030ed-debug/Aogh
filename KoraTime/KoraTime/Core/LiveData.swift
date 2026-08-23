import Foundation

/// البيانات التي تتغيّر أسرع من دورة النشر.
///
/// قائمة القنوات تموت روابطها وتُضاف غيرها كل أسبوع، وانتظار مراجعة آبل لكل
/// تغيير يعني تطبيقاً بقنوات ميتة أسبوعين. فتُنشر القائمة كأصل إصدار ثابت
/// ويقرؤها التطبيق عند التشغيل — والنسخة المرفقة تبقى شبكة الأمان، فمن لا
/// شبكة عنده أو عطب المصدر يرى ما بُني معه لا شاشة فارغة.
///
/// الوسم ثابت عمداً: الرابط لا يتأثّر بأسماء الفروع ولا بإعادة تسميتها.
enum LiveData {

    private static let base =
        "https://github.com/a7m2030ed-debug/Aogh/releases/download/data"

    static var channels: URL? { URL(string: "\(base)/channels.json") }
    static var arabicNames: URL? { URL(string: "\(base)/ar-names.json") }
    static var appVersion: URL? { URL(string: "\(base)/app-version.json") }

    /// ست ساعات: أطول من جلسة استخدام، وأقصر من أن تبقى قناة ميتة يوماً.
    static let maxAge: TimeInterval = 6 * 60 * 60
}

/// بيان الإصدار المنشور مع البيانات الحيّة.
struct AppVersionInfo: Decodable {
    let latest: String
    let minimum: String
    let ios: String?
    let android: String?
    let titleAr: String?
    let titleEn: String?
    let notesAr: String?
    let notesEn: String?

    var title: String {
        let value = L.current == .ar ? titleAr : titleEn
        return (value?.isEmpty == false ? value : nil) ?? L.s("update_available")
    }

    var notes: String? {
        let value = L.current == .ar ? notesAr : notesEn
        return value?.isEmpty == false ? value : nil
    }

    var storeURL: URL? { ios.flatMap(URL.init(string:)) }
}

/// مقارنة أرقام الإصدارات جزءاً جزءاً: "1.10" أحدث من "1.9"، والمقارنة
/// النصّية تقول العكس.
enum Version {
    static func isNewer(_ candidate: String, than current: String) -> Bool {
        compare(candidate, current) > 0
    }

    static func compare(_ lhs: String, _ rhs: String) -> Int {
        let left = parts(lhs), right = parts(rhs)
        for index in 0..<max(left.count, right.count) {
            let a = index < left.count ? left[index] : 0
            let b = index < right.count ? right[index] : 0
            if a != b { return a < b ? -1 : 1 }
        }
        return 0
    }

    private static func parts(_ value: String) -> [Int] {
        value.split(whereSeparator: { !$0.isNumber })
            .compactMap { Int($0) }
    }
}
