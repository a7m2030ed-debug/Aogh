import Foundation

/// كل التواريخ في التطبيق تمرّ من هنا: تقويم ميلادي، لغة الواجهة، أرقام
/// لاتينية، وتوقيت جهاز المستخدم.
enum KTDate {

    /// اللغة تتبدّل من الإعدادات، والمحوّلات مكلفة الإنشاء — فنبنيها مرة
    /// لكل لغة ونحتفظ بها حتى يتبدّل الاختيار.
    private static var cachedLang: Lang?
    private static var cache: [String: DateFormatter] = [:]

    static var locale: Locale {
        L.current == .ar
            ? Locale(identifier: "ar_SA@calendar=gregorian;numbers=latn")
            : Locale(identifier: "en_US@calendar=gregorian")
    }

    static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.locale = locale
        calendar.timeZone = .current
        return calendar
    }

    // MARK: - محوّلات العرض

    private static func make(_ format: String, utc: Bool = false) -> DateFormatter {
        let lang = L.current
        if cachedLang != lang {
            cachedLang = lang
            cache.removeAll()
        }
        let key = utc ? "utc:\(format)" : format
        if let existing = cache[key] { return existing }

        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = utc ? TimeZone(identifier: "UTC") : .current
        formatter.dateFormat = format
        cache[key] = formatter
        return formatter
    }

    /// صيغة المفاتيح المرسلة لواجهات البيانات (يوم واحد).
    static let apiDay: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    static var clock: DateFormatter { make("HH:mm") }
    static var weekday: DateFormatter { make("EEEE") }
    static var shortWeekday: DateFormatter { make("EEE") }
    static var dayNumber: DateFormatter { make("d") }
    static var shortMonth: DateFormatter { make("MMM") }
    static var fullDay: DateFormatter { make("EEEE d MMMM yyyy") }
    static var dayAndMonth: DateFormatter { make("d MMMM") }

    /// يُبنى مرة لكل لغة: شاشة الأخبار تناديه لكل خبر، وإنشاؤه في كل نداء
    /// كلفة بلا مقابل.
    private static var relativeCache: (lang: Lang, formatter: RelativeDateTimeFormatter)?

    private static var relative: RelativeDateTimeFormatter {
        let lang = L.current
        if let cached = relativeCache, cached.lang == lang { return cached.formatter }

        let formatter = RelativeDateTimeFormatter()
        formatter.locale = locale
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.unitsStyle = .full
        relativeCache = (lang, formatter)
        return formatter
    }

    // MARK: - عرض

    /// "اليوم" / "أمس" / "غداً" وإلا اسم اليوم مع تاريخه.
    static func dayLabel(_ date: Date) -> String {
        let cal = calendar
        if cal.isDateInToday(date) { return L.s("today") }
        if cal.isDateInYesterday(date) { return L.s("yesterday") }
        if cal.isDateInTomorrow(date) { return L.s("tomorrow") }
        return "\(weekday.string(from: date)) \(dayAndMonth.string(from: date))"
    }

    static func shortDayLabel(_ date: Date) -> String {
        let cal = calendar
        if cal.isDateInToday(date) { return L.s("today") }
        if cal.isDateInYesterday(date) { return L.s("yesterday") }
        if cal.isDateInTomorrow(date) { return L.s("tomorrow") }
        return shortWeekday.string(from: date)
    }

    static func time(_ date: Date) -> String {
        clock.string(from: date)
    }

    /// "قبل ٣ ساعات" للأخبار.
    static func ago(_ date: Date) -> String {
        let seconds = Date().timeIntervalSince(date)
        if seconds < 60 { return L.s("just_now") }
        return relative.localizedString(for: date, relativeTo: Date())
    }

    /// عدّاد تنازلي مختصر لمباراة لم تبدأ: "بعد ٢ س ١٥ د".
    static func countdown(to date: Date) -> String? {
        let seconds = Int(date.timeIntervalSinceNow)
        guard seconds > 0 else { return nil }
        let days = seconds / 86_400
        let hours = (seconds % 86_400) / 3_600
        let minutes = (seconds % 3_600) / 60
        if days > 0 { return L.s("in_days_hours", days, hours) }
        if hours > 0 { return L.s("in_hours_minutes", hours, minutes) }
        return L.s("in_minutes", minutes)
    }

    // MARK: - تحليل

    private static let parsers: [DateFormatter] = {
        let patterns = [
            "yyyy-MM-dd'T'HH:mm:ssZ",
            "yyyy-MM-dd'T'HH:mm:ss.SSSZ",
            "yyyy-MM-dd'T'HH:mm:ss",
            "yyyy-MM-dd HH:mm:ss",
            "yyyy-MM-dd HH:mm",
            "yyyy-MM-dd"
        ]
        return patterns.map { pattern in
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.calendar = Calendar(identifier: .gregorian)
            formatter.timeZone = TimeZone(identifier: "UTC")
            formatter.dateFormat = pattern
            return formatter
        }
    }()

    private static let rfc822Parsers: [DateFormatter] = {
        let patterns = [
            "EEE, dd MMM yyyy HH:mm:ss Z",
            "EEE, dd MMM yyyy HH:mm:ss zzz",
            "EEE, dd MMM yyyy HH:mm Z",
            "dd MMM yyyy HH:mm:ss Z",
            "EEE, dd MMM yyyy"
        ]
        return patterns.map { pattern in
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.calendar = Calendar(identifier: .gregorian)
            formatter.timeZone = TimeZone(identifier: "GMT")
            formatter.dateFormat = pattern
            return formatter
        }
    }()

    /// تواريخ واجهات البيانات: ISO أو "yyyy-MM-dd HH:mm:ss" بتوقيت UTC.
    static func parseUTC(_ text: String?) -> Date? {
        guard let text = text, !text.isEmpty else { return nil }
        let cleaned = text.trimmingCharacters(in: .whitespacesAndNewlines)
        for parser in parsers {
            if let date = parser.date(from: cleaned) { return date }
        }
        return nil
    }

    /// تواريخ خلاصات RSS (RFC 822) مع سقوط إلى ISO.
    static func parseFeedDate(_ text: String?) -> Date? {
        guard let text = text, !text.isEmpty else { return nil }
        let cleaned = text.trimmingCharacters(in: .whitespacesAndNewlines)
        for parser in rfc822Parsers {
            if let date = parser.date(from: cleaned) { return date }
        }
        return parseUTC(cleaned)
    }

    /// يدمج "2026-08-22" مع "19:00:00" أو "19:00:00+00:00" في تاريخ UTC.
    static func combine(day: String?, time: String?) -> Date? {
        guard let day = day, !day.isEmpty else { return nil }
        guard let time = time, !time.isEmpty else { return parseUTC(day) }
        var clock = time
        if let plus = clock.firstIndex(where: { $0 == "+" }) {
            clock = String(clock[clock.startIndex..<plus])
        }
        if clock.count == 5 { clock += ":00" }
        return parseUTC("\(day) \(clock)")
    }

    static func startOfDay(_ date: Date) -> Date {
        calendar.startOfDay(for: date)
    }

    static func adding(days: Int, to date: Date) -> Date {
        calendar.date(byAdding: .day, value: days, to: date) ?? date
    }

    static func isSameDay(_ lhs: Date, _ rhs: Date) -> Bool {
        calendar.isDate(lhs, inSameDayAs: rhs)
    }
}
