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
    @State private var showFavorites = false

    var body: some View {
        @Bindable var settings = settings

        NavigationStack {
            ZStack {
                KTBackground()

                VStack(spacing: 0) {
                    KTScreenTitle(title: L.s("settings_title"),
                                  subtitle: L.s("settings_subtitle"))

                    Form {
                        languageSection(settings: settings)
                        favoritesSection
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
                title: L.s("add_feed"),
                hint: L.s("add_feed_hint"),
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
                title: L.s("add_playlist"),
                hint: L.s("add_playlist_hint"),
                name: $newPlaylistName,
                urlString: $newPlaylistURL
            ) {
                settings.addPlaylist(name: newPlaylistName, urlString: newPlaylistURL)
                newPlaylistName = ""
                newPlaylistURL = ""
                Task { await channelsStore.reload() }
            }
        }
        .sheet(isPresented: $showFavorites) {
            OnboardingView(settings: settings) {
                showFavorites = false
                // التفضيلات الجديدة تعني ترتيباً وأخباراً مختلفة
                matchesStore.invalidate()
                newsStore.invalidate()
                Task { await newsStore.reload() }
            }
        }
    }

    // MARK: - اللغة

    /// العربية أولاً في القائمة لأنها لغة التطبيق الافتراضية. تغيير اللغة
    /// يعيد بناء الشجرة كاملة عبر `id` في الجذر، فلا تبقى شاشة بلغة قديمة.
    private func languageSection(settings: AppSettings) -> some View {
        Section {
            HStack(spacing: 8) {
                ForEach(Lang.allCases) { option in
                    Button {
                        settings.language = option
                    } label: {
                        Text(option.label)
                            .font(.system(size: 13, weight: settings.language == option ? .bold : .medium))
                            .foregroundStyle(settings.language == option ? KT.accent : KT.textSecondary)
                            .padding(.horizontal, 20)
                            .padding(.vertical, 8)
                            .background(
                                Capsule().fill(settings.language == option
                                               ? KT.accent.opacity(0.16)
                                               : KT.card)
                            )
                    }
                    .buttonStyle(.plain)
                }
                Spacer()
            }
        } header: {
            Text(L.s("group_language"))
        } footer: {
            Text(L.s("language_hint"))
        }
    }

    // MARK: - تفضيلاتي

    private var favoritesSection: some View {
        Section {
            Button(L.s("edit_prefs")) { showFavorites = true }
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(KT.accent)
        } header: {
            Text(L.s("my_prefs"))
        } footer: {
            Text(L.s("my_prefs_hint"))
        }
    }

    // MARK: - المباريات

    private func matchesSection(settings: AppSettings) -> some View {
        @Bindable var settings = settings

        return Section {
            // العنوان في سطره والحقل بعرض الصفّ: صفّ LabeledContent يبتر
            // العنوان الطويل، وهذا أهمّ حقل هنا فلا يصحّ أن يظهر ناقصاً.
            VStack(alignment: .leading, spacing: 7) {
                Text(L.s("apifootball_key"))
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(KT.text)
                TextField(L.s("apifootball_placeholder"), text: $settings.apiFootballKey)
                    .multilineTextAlignment(.leading)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .font(.system(size: 14, design: .monospaced))
                    .onSubmit { matchesStore.invalidate() }
                Text(L.s("apifootball_hint"))
                    .font(.system(size: 11))
                    .foregroundStyle(KT.textFaint)
            }
            .padding(.vertical, 2)

            Picker(L.s("matches_source"), selection: $settings.matchesSource) {
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
                LabeledContent(L.s("sportsdb_key")) {
                    TextField("123", text: $settings.sportsDBKey)
                        .multilineTextAlignment(.leading)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .onSubmit { matchesStore.invalidate() }
                }
            case .footballData:
                LabeledContent(L.s("footballdata_key")) {
                    TextField("X-Auth-Token", text: $settings.footballDataToken)
                        .multilineTextAlignment(.leading)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .onSubmit { matchesStore.invalidate() }
                }
            }

            if let url = settings.matchesSource.signupURL {
                Button(L.s("signup_key")) { openURL(url) }
                    .font(.system(size: 13))
            }

            Toggle(L.s("auto_refresh_live"), isOn: $settings.autoRefreshLive)
        } header: {
            Text(L.s("matches_title"))
        } footer: {
            Text(L.s("sportsdb_hint"))
        }
    }

    // MARK: - القنوات

    private func channelsSection(settings: AppSettings) -> some View {
        @Bindable var settings = settings

        return Section {
            Picker(L.s("rail_placement"), selection: $settings.railPlacement) {
                ForEach(RailPlacement.allCases) { placement in
                    Text(placement.title).tag(placement)
                }
            }
            Toggle(L.s("autoplay"), isOn: $settings.autoPlayOnOpen)
            Toggle(L.s("show_demo"), isOn: $settings.showDemoChannels)
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
                Label(L.s("add_playlist"), systemImage: "plus.circle.fill")
            }

            if !channelsStore.loadErrors.isEmpty {
                ForEach(channelsStore.loadErrors, id: \.self) { error in
                    Text(error)
                        .font(.system(size: 11))
                        .foregroundStyle(KT.gold)
                }
            }
        } header: {
            Text(L.s("channels_title"))
        } footer: {
            Text(L.s("channels_footer"))
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
                Label(L.s("add_feed"), systemImage: "plus.circle.fill")
            }

            Button(L.s("restore_feeds")) {
                settings.resetFeeds()
                newsStore.invalidate()
                Task { await newsStore.reload() }
            }
            .foregroundStyle(KT.gold)
        } header: {
            Text(L.s("news_title"))
        } footer: {
            Text(L.s("feeds_footer"))
        }
    }

    // MARK: - المظهر

    private func appearanceSection(settings: AppSettings) -> some View {
        @Bindable var settings = settings

        return Section(L.s("settings_display")) {
            Toggle(L.s("arabic_names"), isOn: $settings.arabicNames)
        }
    }

    // MARK: - عن التطبيق

    private var aboutSection: some View {
        Section(L.s("about")) {
            LabeledContent(L.s("settings_version"), value: Bundle.appVersion)
            LabeledContent(L.s("matches_title"), value: matchesStore.attribution)
            LabeledContent(L.s("news_title"), value: L.s("settings_news_rss"))
            Text(L.s("about_desc"))
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
                    TextField(L.s("field_name"), text: $name)
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
                    Button(L.s("action_cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L.s("action_save")) {
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
