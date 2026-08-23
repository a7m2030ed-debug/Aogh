import Foundation

/// أخطاء التطبيق بلغة الواجهة، تُعرض للمستخدم مباشرة.
enum KTError: LocalizedError {
    case badURL(String)
    case http(Int)
    case empty
    case decoding(String)
    case missingKey(String)

    var errorDescription: String? {
        switch self {
        case .badURL(let value):
            return L.s("http_bad_url", value)
        case .http(let code):
            switch code {
            case 401, 403:
                return L.s("http_rejected", code)
            case 404:
                return L.s("http_not_found")
            case 429:
                return L.s("http_rate_limited")
            case 500...599:
                return L.s("http_server_down", code)
            default:
                return L.s("http_failed", code)
            }
        case .empty:
            return L.s("http_empty")
        case .decoding(let detail):
            return L.s("http_decoding", detail)
        case .missingKey(let name):
            return L.s("http_missing_key", name)
        }
    }
}

/// عميل شبكة بسيط بذاكرة تخزين مؤقت على القرص، يُستخدم لكل طلبات التطبيق.
struct HTTPClient {
    static let shared = HTTPClient()

    private let session: URLSession

    init() {
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 20
        configuration.timeoutIntervalForResource = 40
        configuration.waitsForConnectivity = false
        configuration.requestCachePolicy = .useProtocolCachePolicy
        configuration.urlCache = URLCache(
            memoryCapacity: 24 * 1024 * 1024,
            diskCapacity: 160 * 1024 * 1024,
            diskPath: "KoraTimeURLCache"
        )
        configuration.httpAdditionalHeaders = [
            "User-Agent": "KoraTime/1.0 (iPhone; iOS)",
            "Accept-Language": "ar,en;q=0.8"
        ]
        session = URLSession(configuration: configuration)
    }

    func data(from url: URL,
              headers: [String: String] = [:],
              maxAge: TimeInterval? = nil,
              revalidate: Bool = false) async throws -> Data {
        var request = URLRequest(url: url)
        request.cachePolicy = revalidate ? .reloadRevalidatingCacheData : .useProtocolCachePolicy
        for (field, value) in headers {
            request.setValue(value, forHTTPHeaderField: field)
        }

        // نُرجع نسخة مخزّنة حديثة بدل إزعاج الشبكة عند التنقل السريع بين الشاشات.
        if let maxAge = maxAge, !revalidate,
           let cached = session.configuration.urlCache?.cachedResponse(for: request),
           let response = cached.response as? HTTPURLResponse,
           let dateHeader = response.value(forHTTPHeaderField: "Date"),
           let stamp = HTTPClient.httpDateFormatter.date(from: dateHeader),
           Date().timeIntervalSince(stamp) < maxAge,
           !cached.data.isEmpty {
            return cached.data
        }

        let (data, response) = try await performWithRetry(request)
        if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            throw KTError.http(http.statusCode)
        }
        guard !data.isEmpty else { throw KTError.empty }
        return data
    }

    func decode<T: Decodable>(_ type: T.Type,
                              from url: URL,
                              headers: [String: String] = [:],
                              maxAge: TimeInterval? = nil,
                              revalidate: Bool = false) async throws -> T {
        let data = try await data(from: url, headers: headers, maxAge: maxAge, revalidate: revalidate)
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw KTError.decoding(error.localizedDescription)
        }
    }

    /// محاولتان إضافيتان للأخطاء العابرة فقط (انقطاع مؤقت، مهلة).
    private func performWithRetry(_ request: URLRequest) async throws -> (Data, URLResponse) {
        var lastError: Error = KTError.empty
        for attempt in 0..<3 {
            do {
                return try await session.data(for: request)
            } catch {
                lastError = error
                let code = (error as? URLError)?.code
                let transient: Set<URLError.Code> = [.timedOut, .networkConnectionLost,
                                                     .cannotConnectToHost, .dnsLookupFailed]
                guard let code = code, transient.contains(code), attempt < 2 else { throw error }
                try? await Task.sleep(nanoseconds: UInt64((attempt + 1) * 700) * 1_000_000)
            }
        }
        throw lastError
    }

    private static let httpDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "GMT")
        formatter.dateFormat = "EEE, dd MMM yyyy HH:mm:ss zzz"
        return formatter
    }()
}

/// بعض المصادر تُرجع الأرقام كنصوص وأحياناً كأرقام. هذا النوع يبتلع الحالتين.
struct LooseString: Decodable {
    let value: String?

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            value = nil
        } else if let text = try? container.decode(String.self) {
            let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
            value = trimmed.isEmpty ? nil : trimmed
        } else if let number = try? container.decode(Int.self) {
            value = String(number)
        } else if let number = try? container.decode(Double.self) {
            value = String(number)
        } else if let flag = try? container.decode(Bool.self) {
            value = flag ? "yes" : "no"
        } else {
            value = nil
        }
    }

    var intValue: Int? {
        guard let value = value else { return nil }
        return Int(value)
    }

    var urlValue: URL? {
        guard let value = value, value.hasPrefix("http") else { return nil }
        return URL(string: value)
    }
}
