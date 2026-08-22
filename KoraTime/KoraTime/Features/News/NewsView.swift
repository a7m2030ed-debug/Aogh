import SafariServices
import SwiftUI
import UIKit

struct NewsView: View {

    @Environment(NewsStore.self) private var store
    @Environment(AppRouter.self) private var router

    @State private var draftQuery = ""
    @State private var reading: NewsItem?

    private let topics = ["كرة القدم", "دوري روشن السعودي", "دوري أبطال أوروبا",
                          "الهلال", "النصر", "الاتحاد", "الأهلي", "المنتخب السعودي", "انتقالات"]

    var body: some View {
        NavigationStack {
            ZStack {
                KTBackground()

                VStack(spacing: 0) {
                    header
                    searchBar
                    topicsRow
                    content
                }
            }
            .toolbar(.hidden, for: .navigationBar)
        }
        .task {
            await store.loadIfNeeded()
        }
        .onChange(of: router.pendingNewsQuery) { _, newValue in
            guard let newValue = newValue, !newValue.isEmpty else { return }
            draftQuery = newValue
            Task { await store.search(newValue) }
            router.pendingNewsQuery = nil
        }
        .sheet(item: $reading) { item in
            if let link = item.link {
                SafariView(url: link)
                    .ignoresSafeArea()
            }
        }
    }

    // MARK: - الأجزاء

    private var header: some View {
        KTScreenTitle(
            title: "الأخبار",
            subtitle: subtitle,
            trailing: AnyView(
                Button {
                    Task { await store.reload() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(KT.textSecondary)
                }
            )
        )
    }

    private var subtitle: String {
        if store.isSearching { return "نتائج البحث عن «\(store.searchQuery)»" }
        if let updated = store.lastUpdated { return "آخر تحديث \(KTDate.time(updated))" }
        return "من الخلاصات التي تتابعها"
    }

    private var searchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(KT.textFaint)
            TextField("ابحث عن فريق أو خبر", text: $draftQuery)
                .submitLabel(.search)
                .autocorrectionDisabled()
                .foregroundStyle(KT.text)
                .onSubmit { runSearch(draftQuery) }
            if !draftQuery.isEmpty || store.isSearching {
                Button {
                    draftQuery = ""
                    Task { await store.clearSearch() }
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(KT.textFaint)
                }
                .buttonStyle(.plain)
            }
        }
        .font(.system(size: 14))
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(KT.card))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(KT.hairline, lineWidth: 1))
        .padding(.horizontal, 16)
    }

    private var topicsRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ChipButton(title: "متابعاتي", isSelected: !store.isSearching) {
                    draftQuery = ""
                    Task { await store.clearSearch() }
                }
                ForEach(topics, id: \.self) { topic in
                    ChipButton(title: topic, isSelected: store.searchQuery == topic) {
                        draftQuery = topic
                        runSearch(topic)
                    }
                }
            }
            .padding(.horizontal, 16)
        }
        .padding(.vertical, 10)
    }

    @ViewBuilder
    private var content: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                if store.isLoading && store.items.isEmpty {
                    KTLoading(title: "جارٍ جلب الأخبار…")
                } else if store.items.isEmpty {
                    KTEmptyState(
                        icon: "newspaper",
                        title: "لا توجد أخبار",
                        message: store.feedErrors.first ?? "جرّب موضوعاً آخر أو أضف خلاصة من الإعدادات.",
                        actionTitle: "إدارة الخلاصات",
                        action: { router.openSettings(focus: .feeds) }
                    )
                } else {
                    ForEach(Array(store.items.enumerated()), id: \.element.id) { index, item in
                        Button {
                            open(item)
                        } label: {
                            if index == 0 {
                                NewsHeroCard(item: item)
                            } else {
                                NewsRow(item: item)
                            }
                        }
                        .buttonStyle(.plain)
                    }

                    if !store.feedErrors.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            ForEach(store.feedErrors, id: \.self) { error in
                                Text(error)
                                    .font(.system(size: 10))
                                    .foregroundStyle(KT.gold.opacity(0.8))
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .refreshable { await store.reload() }
        .ktDismissKeyboardOnScroll()
    }

    // MARK: - السلوك

    private func runSearch(_ query: String) {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        Task { await store.search(trimmed) }
    }

    private func open(_ item: NewsItem) {
        guard item.link != nil else { return }
        reading = item
    }
}

/// أول خبر يظهر ببطاقة كبيرة بصورة.
struct NewsHeroCard: View {
    let item: NewsItem

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let image = item.imageURL {
                RemoteImage(url: image, contentMode: .fill) {
                    Rectangle().fill(KT.cardHigh)
                }
                .frame(height: 180)
                .frame(maxWidth: .infinity)
                .clipped()
            }

            VStack(alignment: .leading, spacing: 7) {
                Text(item.title)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(KT.text)
                    .multilineTextAlignment(.leading)
                    .lineLimit(3)

                if !item.summary.isEmpty {
                    Text(item.summary)
                        .font(.system(size: 12))
                        .foregroundStyle(KT.textSecondary)
                        .multilineTextAlignment(.leading)
                        .lineLimit(2)
                }

                NewsMeta(item: item)
            }
            .padding(13)
        }
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(KT.card))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(KT.hairline, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

struct NewsRow: View {
    let item: NewsItem

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 6) {
                Text(item.title)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(KT.text)
                    .multilineTextAlignment(.leading)
                    .lineLimit(3)
                NewsMeta(item: item)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            if let image = item.imageURL {
                RemoteImage(url: image, contentMode: .fill) {
                    RoundedRectangle(cornerRadius: 12, style: .continuous).fill(KT.cardHigh)
                }
                .frame(width: 84, height: 64)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
        .ktCard(padding: 12, radius: 16)
    }
}

struct NewsMeta: View {
    let item: NewsItem

    var body: some View {
        HStack(spacing: 6) {
            Text(item.source)
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(KT.accent)
                .lineLimit(1)
            if item.date != nil {
                Circle().fill(KT.textFaint).frame(width: 3, height: 3)
                Text(item.relativeDate)
                    .font(.system(size: 10))
                    .foregroundStyle(KT.textFaint)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
    }
}

/// فتح الخبر داخل التطبيق بمتصفّح سفاري المدمج.
struct SafariView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let configuration = SFSafariViewController.Configuration()
        configuration.entersReaderIfAvailable = true
        let controller = SFSafariViewController(url: url, configuration: configuration)
        controller.preferredControlTintColor = UIColor(KT.accent)
        controller.preferredBarTintColor = UIColor(KT.bg)
        controller.dismissButtonStyle = .close
        return controller
    }

    func updateUIViewController(_ uiViewController: SFSafariViewController, context: Context) {}
}
