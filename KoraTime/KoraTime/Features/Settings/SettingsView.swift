import SwiftUI

struct SettingsView: View {

    @Environment(AppSettings.self) private var settings
    @Environment(MatchesStore.self) private var matchesStore
    @Environment(ChannelsStore.self) private var channelsStore
    @Environment(NewsStore.self) private var newsStore
    @Environment(AppRouter.self) private var router
    @Environment(\.openURL) private var openURL

    @State private var newFeedName = ""
    @State private var newFeedURL = ""
    @State private var newPlaylistName = ""
    @State private var newPlaylistURL = ""
    @State private var showAddFeed = false
    @State private var showAddPlaylist = false

    var body: some View {
        @Bindable var settings = settings

        NavigationStack {
            ZStack {
                KTBackground()

                VStack(spacing: 0) {
                    KTScreenTitle(title: "الإعدادات",
                                  subtitle: "مصادر البيانات، قنواتك، وخلاصات الأخبار")

                    Form {
                        matchesSection(settings: settings)
                        channelsSection(settings: settings)
                        feedsSection(settings: settings)
                        appearanceSection(settings: settings)
                        aboutSection
                    }
                    .scrollContentBackground(.hidden)
                }
            }
            .toolbar(.hidden, for: .navigationBar)
        }
        .tint(KT.accent)
        .task { applyFocus() }
        .onChange(of: router.settingsFocus) { _, _ in applyFocus() }
        .sheet(isPresented: $showAddFeed) {
            AddSourceSheet(
                title: "إضافة خلاصة أخبار",
                hint: "الصق رابط RSS لأي موقع رياضي تتابعه.",
                name: $newFeedName,
                urlString: $newFeedURL
            ) {
                settings.addFeed(name: newFeedName, urlString: newFeedURL)
                newFeedName = ""
                newFeedURL = ""
                newsStore.invalidate()
                Task { await newsStore.reload() }
            }
        }
        .sheet(isPresented: $showAddPlaylist) {
            AddSourceSheet(
                title: "إضافة قائمة قنوات",
                hint: "رابط قائمة M3U أو ملف JSON فيه قنواتك. القوائم لا تُرفَع لأي خادم — تبقى على جهازك.",
                name: $newPlaylistName,
                urlString: $newPlaylistURL
            ) {
                settings.addPlaylist(name: newPlaylistName, urlString: newPlaylistURL)
                newPlaylistName = ""
                newPlaylistURL = ""
                Task { await channelsStore.reload() }
            }
        }
    }

    // MARK: - المباريات

    private func matchesSection(settings: AppSettings) -> some View {
        @Bindable var settings = settings

        return Section {
            Picker("مصدر البيانات", selection: $settings.matchesSource) {
                ForEach(MatchesSource.allCases) { source in
                    Text(source.title).tag(source)
                }
            }
            .onChange(of: settings.matchesSource) { _, _ in
                matchesStore.invalidate()
            }

            Text(settings.matchesSource.subtitle)
                .font(.system(size: 11))
                .foregroundStyle(KT.textFaint)

            switch settings.matchesSource {
            case .sportsDB:
                LabeledContent("مفتاح TheSportsDB") {
                    TextField("123", text: $settings.sportsDBKey)
                        .multilineTextAlignment(.leading)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .onSubmit { matchesStore.invalidate() }
                }
            case .footballData:
                LabeledContent("مفتاح football-data") {
                    TextField("X-Auth-Token", text: $settings.footballDataToken)
                        .multilineTextAlignment(.leading)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .onSubmit { matchesStore.invalidate() }
                }
            }

            if let url = settings.matchesSource.signupURL {
                Button("كيف أحصل على مفتاح مجاني؟") { openURL(url) }
                    .font(.system(size: 13))
            }

            Toggle("تحديث تلقائي للنتائج المباشرة", isOn: $settings.autoRefreshLive)
        } header: {
            Text("المباريات")
        } footer: {
            Text("المفتاح التجريبي المشترك محدود الطلبات. سجّل مفتاحاً باسمك لتحديث أسرع وتغطية أوسع.")
        }
    }

    // MARK: - القنوات

    private func channelsSection(settings: AppSettings) -> some View {
        @Bindable var settings = settings

        return Section {
            Picker("مكان قائمة القنوات", selection: $settings.railPlacement) {
                ForEach(RailPlacement.allCases) { placement in
                    Text(placement.title).tag(placement)
                }
            }
            Toggle("تشغيل آخر قناة عند الفتح", isOn: $settings.autoPlayOnOpen)
            Toggle("إظهار القنوات التجريبية", isOn: $settings.showDemoChannels)
                .onChange(of: settings.showDemoChannels) { _, _ in
                    Task { await channelsStore.reload() }
                }

            ForEach(settings.playlists) { playlist in
                PlaylistRow(playlist: playlist) { updated in
                    if let index = settings.playlists.firstIndex(where: { $0.id == updated.id }) {
                        settings.playlists[index] = updated
                        Task { await channelsStore.reload() }
                    }
                }
            }
            .onDelete { offsets in
                settings.playlists.remove(atOffsets: offsets)
                Task { await channelsStore.reload() }
            }

            Button {
                showAddPlaylist = true
            } label: {
                Label("إضافة قائمة قنوات", systemImage: "plus.circle.fill")
            }

            if !channelsStore.loadErrors.isEmpty {
                ForEach(channelsStore.loadErrors, id: \.self) { error in
                    Text(error)
                        .font(.system(size: 11))
                        .foregroundStyle(KT.gold)
                }
            }
        } header: {
            Text("القنوات")
        } footer: {
            Text("التطبيق لا يوفّر قنوات مشفّرة. أضف روابط بثّك الخاصة أو اشتراكك الرسمي، وستظهر في تبويب القنوات مباشرة.")
        }
    }

    // MARK: - الأخبار

    private func feedsSection(settings: AppSettings) -> some View {
        @Bindable var settings = settings

        return Section {
            ForEach($settings.feeds) { $feed in
                Toggle(isOn: $feed.isEnabled) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(feed.name)
                            .font(.system(size: 14))
                        Text(shortURL(feed.urlString))
                            .font(.system(size: 10))
                            .foregroundStyle(KT.textFaint)
                            .lineLimit(1)
                    }
                }
                .onChange(of: feed.isEnabled) { _, _ in
                    reloadNews()
                }
            }
            .onDelete { offsets in
                settings.feeds.remove(atOffsets: offsets)
                reloadNews()
            }

            Button {
                showAddFeed = true
            } label: {
                Label("إضافة خلاصة", systemImage: "plus.circle.fill")
            }

            Button("استعادة الخلاصات الافتراضية") {
                settings.resetFeeds()
                newsStore.invalidate()
                Task { await newsStore.reload() }
            }
            .foregroundStyle(KT.gold)
        } header: {
            Text("الأخبار")
        } footer: {
            Text("الخلاصات الافتراضية تجمع أخبار المواقع الرياضية العربية عبر أخبار Google، مع خلاصات مباشرة من مواقع معروفة.")
        }
    }

    // MARK: - المظهر

    private func appearanceSection(settings: AppSettings) -> some View {
        @Bindable var settings = settings

        return Section("العرض") {
            Toggle("تعريب أسماء الفرق والبطولات", isOn: $settings.arabicNames)
        }
    }

    // MARK: - عن التطبيق

    private var aboutSection: some View {
        Section("عن التطبيق") {
            LabeledContent("الإصدار", value: Bundle.appVersion)
            LabeledContent("المباريات", value: matchesStore.attribution)
            LabeledContent("الأخبار", value: "خلاصات RSS")
            Text("كورة تايم — مواعيد المباريات ونتائجها، وقنواتك، وأخبار الكرة في مكان واحد.")
                .font(.system(size: 11))
                .foregroundStyle(KT.textFaint)
        }
    }

    /// عند القدوم من شاشة أخرى نفتح مباشرةً ما طُلب.
    private func applyFocus() {
        guard let focus = router.settingsFocus else { return }
        switch focus {
        case .playlists: showAddPlaylist = true
        case .feeds: showAddFeed = true
        case .matchesSource: break
        }
        router.settingsFocus = nil
    }

    private func reloadNews() {
        newsStore.invalidate()
        Task { await newsStore.reload() }
    }

    private func shortURL(_ value: String) -> String {
        guard let host = URL(string: value)?.host else { return value }
        return host
    }
}

/// صف قائمة قنوات مع مفتاح تفعيل.
private struct PlaylistRow: View {
    let playlist: PlaylistSource
    let onChange: (PlaylistSource) -> Void

    var body: some View {
        Toggle(isOn: Binding(
            get: { playlist.isEnabled },
            set: { newValue in
                var updated = playlist
                updated.isEnabled = newValue
                onChange(updated)
            }
        )) {
            VStack(alignment: .leading, spacing: 2) {
                Text(playlist.name)
                    .font(.system(size: 14))
                Text(playlist.urlString)
                    .font(.system(size: 10))
                    .foregroundStyle(KT.textFaint)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
        }
    }
}

/// نافذة إضافة مصدر (خلاصة أو قائمة قنوات).
private struct AddSourceSheet: View {
    let title: String
    let hint: String
    @Binding var name: String
    @Binding var urlString: String
    let onSave: () -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("الاسم", text: $name)
                    TextField("https://…", text: $urlString)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                } footer: {
                    Text(hint)
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("إلغاء") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("حفظ") {
                        onSave()
                        dismiss()
                    }
                    .disabled(urlString.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .tint(KT.accent)
    }
}

extension Bundle {
    static var appVersion: String {
        let version = main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        let build = main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        return "\(version) (\(build))"
    }
}
