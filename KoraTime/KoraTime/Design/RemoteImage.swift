import SwiftUI
import UIKit

/// ذاكرة صور في الرام فوق ذاكرة الشبكة، حتى لا تُعاد فك الصور عند كل تمرير.
final class ImageCache {
    static let shared = ImageCache()

    private let cache: NSCache<NSURL, UIImage> = {
        let cache = NSCache<NSURL, UIImage>()
        cache.countLimit = 300
        cache.totalCostLimit = 48 * 1024 * 1024
        return cache
    }()

    private var failures = Set<URL>()
    private let lock = NSLock()

    func image(for url: URL) -> UIImage? {
        cache.object(forKey: url as NSURL)
    }

    func insert(_ image: UIImage, for url: URL) {
        let cost = Int(image.size.width * image.size.height * image.scale * 4)
        cache.setObject(image, forKey: url as NSURL, cost: cost)
    }

    func markFailed(_ url: URL) {
        lock.lock(); defer { lock.unlock() }
        failures.insert(url)
    }

    func hasFailed(_ url: URL) -> Bool {
        lock.lock(); defer { lock.unlock() }
        return failures.contains(url)
    }
}

enum ImageLoader {
    static func load(_ url: URL) async -> UIImage? {
        if let cached = ImageCache.shared.image(for: url) { return cached }
        if ImageCache.shared.hasFailed(url) { return nil }
        do {
            let data = try await HTTPClient.shared.data(from: url, maxAge: 60 * 60 * 24 * 7)
            guard let image = UIImage(data: data) else {
                ImageCache.shared.markFailed(url)
                return nil
            }
            ImageCache.shared.insert(image, for: url)
            return image
        } catch {
            ImageCache.shared.markFailed(url)
            return nil
        }
    }
}

/// صورة من الشبكة مع بديل يظهر أثناء التحميل وعند الفشل.
struct RemoteImage<Placeholder: View>: View {
    let url: URL?
    var contentMode: ContentMode = .fit
    @ViewBuilder var placeholder: () -> Placeholder

    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image = image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: contentMode)
                    .transition(.opacity)
            } else {
                placeholder()
            }
        }
        .task(id: url) {
            image = nil
            guard let url = url else { return }
            let loaded = await ImageLoader.load(url)
            if !Task.isCancelled {
                withAnimation(.easeOut(duration: 0.18)) { image = loaded }
            }
        }
    }
}

/// شعار فريق: الصورة إن وُجدت، وإلا حرفان داخل دائرة.
struct TeamBadge: View {
    let name: String
    let url: URL?
    var size: CGFloat = 40

    var body: some View {
        RemoteImage(url: url, contentMode: .fit) {
            ZStack {
                Circle().fill(KT.cardHigh)
                Text(ArabicNames.monogram(name))
                    .font(.system(size: size * 0.36, weight: .bold))
                    .foregroundStyle(KT.textSecondary)
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
                    .padding(2)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }
}

/// شعار قناة: مستطيل بزوايا دائرية مع بديل نصي.
struct ChannelLogo: View {
    let name: String
    let url: URL?
    var size: CGFloat = 44

    var body: some View {
        RemoteImage(url: url, contentMode: .fit) {
            ZStack {
                RoundedRectangle(cornerRadius: size * 0.24, style: .continuous)
                    .fill(KT.cardHigh)
                Text(ArabicNames.monogram(name))
                    .font(.system(size: size * 0.34, weight: .heavy))
                    .foregroundStyle(KT.accent.opacity(0.9))
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                    .padding(3)
            }
        }
        .frame(width: size, height: size)
        .background(
            RoundedRectangle(cornerRadius: size * 0.24, style: .continuous)
                .fill(Color.black.opacity(0.25))
        )
        .clipShape(RoundedRectangle(cornerRadius: size * 0.24, style: .continuous))
    }
}
