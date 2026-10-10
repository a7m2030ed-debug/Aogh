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
    /// وسيط المباريات: خادم صغير يملك المفتاح ويخزّن النتائج، فيرى كل
    /// مستخدم الجدول كاملاً بلا تسجيل. فارغ يعني «لا وسيط».
    let matchesProxy: String?
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

    var proxyBase: String? {
        let value = (matchesProxy ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard value.hasPrefix("https://") else { return nil }
        return value.hasSuffix("/") ? String(value.dropLast()) : value
    }
}

/// الإعدادات المنشورة، تُجلب مرّة واحدة في كل تشغيل ويُحتفظ بآخر ما وصل.
///
/// المباريات تحتاج رابط الوسيط قبل أوّل طلب، وبوّابة التحديث تحتاج البيان
/// نفسه — فيُجلب مرّة ويستفيد منه الاثنان. وآخر رابط وصل يُحفظ على الجهاز،
/// فأوّل طلب في التشغيل التالي لا ينتظر الشبكة.
@MainActor
final class AppConfig {

    static let shared = AppConfig()

    private(set) var info: AppVersionInfo?
    private var task: Task<AppVersionInfo?, Never>?
    private let store = UserDefaults.standard
    private static let proxyKey = "config.matchesProxy"

    /// آخر وسيط معروف، متاح فوراً بلا انتظار شبكة.
    var cachedProxyBase: String? {
        if let live = info?.proxyBase { return live }
        let saved = store.string(forKey: AppConfig.proxyKey) ?? ""
        return saved.isEmpty ? nil : saved
    }

    @discardableResult
    func load() async -> AppVersionInfo? {
        if let info = info { return info }
        if let task = task { return await task.value }

        let task = Task { () -> AppVersionInfo? in
            guard let url = LiveData.appVersion,
                  let payload = try? await HTTPClient.shared.decode(
                    AppVersionInfo.self, from: url, maxAge: 60 * 30
                  ) else { return nil }
            return payload
        }
        self.task = task

        let payload = await task.value
        self.task = nil
        guard let payload = payload else { return nil }

        info = payload
        // نحفظ الفارغ أيضاً: إطفاء الوسيط يجب أن يصل كما يصل تشغيله.
        store.set(payload.proxyBase ?? "", forKey: AppConfig.proxyKey)
        return payload
    }
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
