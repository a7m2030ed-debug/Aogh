import SwiftUI

struct MatchesView: View {

    @Environment(AppSettings.self) private var settings
    @Environment(MatchesStore.self) private var store
    @Environment(AppRouter.self) private var router

    @State private var isSearching = false
    @FocusState private var searchFocused: Bool

    var body: some View {
        @Bindable var store = store

        NavigationStack {
            ZStack {
                KTBackground()

                VStack(spacing: 0) {
                    header
                    DateStrip(days: store.days,
                              selected: store.selectedDay,
                              onSelect: { store.select(day: $0) })

                    if isSearching {
                        searchField(text: $store.query)
                    }

                    filterRow

                    list
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: Match.self) { match in
                MatchDetailView(match: match)
            }
        }
        .task {
            store.loadIfNeeded()
            store.startLiveUpdates()
        }
        .onDisappear { store.stopLiveUpdates() }
    }

    // MARK: - الأجزاء

    private var header: some View {
        KTScreenTitle(
            title: "المباريات",
            subtitle: subtitleText,
            trailing: AnyView(
                HStack(spacing: 14) {
                    Button {
                        withAnimation(.snappy) {
                            isSearching.toggle()
                            if !isSearching { store.query = "" }
                        }
                        searchFocused = isSearching
                    } label: {
                        Image(systemName: isSearching ? "xmark" : "magnifyingglass")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(isSearching ? KT.live : KT.textSecondary)
                    }

                    Button {
                        Task { await store.refresh() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(KT.textSecondary)
                    }
                }
            )
        )
    }

    private var subtitleText: String {
        if store.liveCount > 0 {
            return "\(store.liveCount) مباراة جارية الآن"
        }
        if let updated = store.lastUpdated {
            return "آخر تحديث \(KTDate.time(updated))"
        }
        return KTDate.dayLabel(store.selectedDay)
    }

    private func searchField(text: Binding<String>) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(KT.textFaint)
            TextField("ابحث عن فريق أو بطولة", text: text)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .foregroundStyle(KT.text)
                .focused($searchFocused)
            if !text.wrappedValue.isEmpty {
                Button {
                    text.wrappedValue = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(KT.textFaint)
                }
            }
        }
        .font(.system(size: 14))
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(KT.card))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(KT.hairline, lineWidth: 1))
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    private var filterRow: some View {
        HStack(spacing: 8) {
            ChipButton(title: "الكل", isSelected: !store.liveOnly) {
                store.liveOnly = false
            }
            ChipButton(title: "المباشرة", isSelected: store.liveOnly, systemImage: "dot.radiowaves.left.and.right") {
                store.liveOnly = true
            }
            Spacer()
            Text(KTDate.dayLabel(store.selectedDay))
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(KT.textFaint)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    @ViewBuilder
    private var list: some View {
        ScrollView {
            LazyVStack(spacing: 14, pinnedViews: []) {
                if store.isLoading && store.allMatchesForDay.isEmpty {
                    KTLoading(title: "جارٍ جلب مباريات \(KTDate.dayLabel(store.selectedDay))…")
                } else if let error = store.errorMessage, store.allMatchesForDay.isEmpty {
                    KTErrorView(message: error) {
                        store.load(force: true)
                    }
                    if settings.matchesSource == .footballData && settings.footballDataToken.isEmpty {
                        Button("فتح الإعدادات لإضافة المفتاح") {
                            router.openSettings(focus: .matchesSource)
                        }
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(KT.accent)
                    }
                } else if store.sections.isEmpty {
                    if store.liveOnly {
                        KTEmptyState(
                            icon: "dot.radiowaves.left.and.right",
                            title: "لا توجد مباريات جارية الآن",
                            message: "جرّب \"الكل\" لعرض مباريات اليوم كاملة.",
                            actionTitle: "عرض الكل",
                            action: { store.liveOnly = false }
                        )
                    } else {
                        KTEmptyState(
                            icon: "calendar",
                            title: "لا مباريات في هذا اليوم",
                            message: "اختر يوماً آخر من الشريط أعلاه."
                        )
                    }
                } else {
                    ForEach(store.sections) { section in
                        VStack(spacing: 8) {
                            KTSectionHeader(
                                title: section.title,
                                subtitle: nil,
                                badgeURL: section.badge,
                                trailing: section.liveCount > 0 ? "\(section.liveCount) مباشر" : nil
                            )
                            ForEach(section.matches) { match in
                                NavigationLink(value: match) {
                                    MatchRow(match: match, arabicNames: settings.arabicNames)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 16)
                    }

                    Text(store.attribution)
                        .font(.system(size: 10))
                        .foregroundStyle(KT.textFaint)
                        .padding(.top, 6)
                }
            }
            .padding(.bottom, 24)
        }
        .refreshable {
            await store.refresh()
        }
        .ktDismissKeyboardOnScroll()
    }
}

/// شريط الأيام الأفقي أعلى الشاشة.
struct DateStrip: View {
    let days: [Date]
    let selected: Date
    let onSelect: (Date) -> Void

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(days, id: \.timeIntervalSince1970) { day in
                        dayCell(day)
                            .id(day.timeIntervalSince1970)
                    }
                }
                .padding(.horizontal, 16)
            }
            // بعد اكتمال التخطيط، لا قبله — وإلا بقي الشريط عند طرفه الأول.
            .task {
                try? await Task.sleep(for: .milliseconds(300))
                proxy.scrollTo(KTDate.startOfDay(Date()).timeIntervalSince1970, anchor: .center)
            }
        }
        .frame(height: 62)
    }

    private func dayCell(_ day: Date) -> some View {
        let isSelected = KTDate.isSameDay(day, selected)
        let isToday = KTDate.isSameDay(day, Date())

        return Button {
            onSelect(day)
        } label: {
            VStack(spacing: 2) {
                Text(KTDate.shortDayLabel(day))
                    .font(.system(size: 11, weight: .semibold))
                    .lineLimit(1)
                Text(KTDate.dayNumber.string(from: day))
                    .font(.system(size: 17, weight: .heavy))
                    .monospacedDigit()
                Text(KTDate.shortMonth.string(from: day))
                    .font(.system(size: 9, weight: .medium))
                    .lineLimit(1)
            }
            .frame(width: 56, height: 52)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(isSelected ? KT.accent.opacity(0.20) : KT.card)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(isSelected ? KT.accent : (isToday ? KT.accent.opacity(0.35) : KT.hairline),
                            lineWidth: isSelected ? 1.5 : 1)
            )
            .foregroundStyle(isSelected ? KT.accent : KT.textSecondary)
        }
        .buttonStyle(.plain)
    }
}
