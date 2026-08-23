import AVFoundation
import SwiftUI

/// تبويب القنوات: المشغّل يفتح فوراً، وقائمة القنوات على اليمين — كطريقة تطبيقات البث.
struct ChannelsView: View {

    @Environment(AppSettings.self) private var settings
    @Environment(ChannelsStore.self) private var store
    @Environment(PlayerController.self) private var player
    @Environment(AppRouter.self) private var router
    @Environment(\.openURL) private var openURL

    @State private var showRail = true
    @State private var isFullscreen = false
    @State private var showControls = true
    @State private var hideControlsWork: Task<Void, Never>?

    /// مهلة اختفاء الأزرار — قصيرة كما في مشغّلات الفيديو المعروفة.
    private let controlsTimeout: UInt64 = 3

    var body: some View {
        GeometryReader { geometry in
            let isLandscape = geometry.size.width > geometry.size.height
            let sideBySide = isLandscape || settings.railPlacement == .side || isFullscreen

            ZStack {
                KTBackground()

                if sideBySide {
                    HStack(spacing: 0) {
                        if showRail && !isFullscreen {
                            rail(width: isLandscape ? 208 : 104, compact: !isLandscape)
                            Rectangle().fill(KT.hairline).frame(width: 1)
                        }
                        playerPane(isLandscape: isLandscape)
                    }
                } else {
                    VStack(spacing: 0) {
                        playerPane(isLandscape: false)
                        Rectangle().fill(KT.hairline).frame(height: 1)
                        stackedList
                    }
                }
            }
            .animation(.snappy(duration: 0.25), value: showRail)
            .animation(.snappy(duration: 0.25), value: isFullscreen)
        }
        .toolbar(isFullscreen ? .hidden : .automatic, for: .tabBar)
        .statusBarHidden(isFullscreen)
        .persistentSystemOverlays(isFullscreen ? .hidden : .automatic)
        .task {
            await store.loadIfNeeded()
            startPlaybackIfNeeded()
        }
        .onChange(of: router.pendingChannelID) { _, newValue in
            guard let newValue = newValue, let channel = store.channel(withID: newValue) else { return }
            select(channel)
            router.pendingChannelID = nil
        }
        .onChange(of: isFullscreen) { _, full in
            // ملء الشاشة يبدأ بصورة نظيفة بلا أزرار — لمسة واحدة تُعيدها،
            // ويدور الجهاز عرضياً لأن البثّ أعرض من أن يُعرض طولياً.
            if full {
                showControls = false
                ScreenOrientation.request(.landscape)
            } else {
                ScreenOrientation.request(.portrait)
                revealControls()
            }
        }
        .onDisappear {
            hideControlsWork?.cancel()
            if isFullscreen { ScreenOrientation.request(.portrait) }
        }
    }

    // MARK: - المشغّل

    private func playerPane(isLandscape: Bool) -> some View {
        VStack(spacing: 0) {
            videoBox(isLandscape: isLandscape)

            if !isLandscape && !isFullscreen {
                belowPlayer
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    @ViewBuilder
    private func videoBox(isLandscape: Bool) -> some View {
        ZStack {
            Color.black
            VideoSurface(player: player.player, gravity: player.videoGravity)

            if player.channel == nil {
                idlePlaceholder
            }

            if player.isCasting {
                castingOverlay
            }

            if player.isBuffering && player.errorText == nil {
                ProgressView()
                    .progressViewStyle(.circular)
                    .tint(.white)
                    .scaleEffect(1.2)
            }

            if let error = player.errorText {
                errorOverlay(error)
            }

            if showControls {
                controlsOverlay(isLandscape: isLandscape)
                    .transition(.opacity)
            }
        }
        .modifier(VideoBoxShape(fill: isLandscape || isFullscreen))
        .contentShape(Rectangle())
        .onTapGesture {
            if showControls {
                hideControlsWork?.cancel()
                withAnimation(.easeInOut(duration: 0.18)) { showControls = false }
            } else {
                revealControls()
            }
        }
    }

    private var idlePlaceholder: some View {
        VStack(spacing: 10) {
            Image(systemName: "play.tv")
                .font(.system(size: 36, weight: .light))
                .foregroundStyle(.white.opacity(0.5))
            Text(L.s("pick_channel"))
                .font(.system(size: 13))
                .foregroundStyle(.white.opacity(0.65))
        }
    }

    /// البثّ خرج إلى التلفاز: الصورة هناك، وهنا سطر يشرح ما يجري.
    private var castingOverlay: some View {
        VStack(spacing: 8) {
            Image(systemName: "airplayvideo")
                .font(.system(size: 30, weight: .light))
                .foregroundStyle(KT.accent)
            Text(L.s("casting_to"))
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(.white)
            if let channel = player.channel {
                Text(channel.name)
                    .font(.system(size: 11))
                    .foregroundStyle(.white.opacity(0.7))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.black.opacity(0.9))
    }

    private func errorOverlay(_ message: String) -> some View {
        VStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 26))
                .foregroundStyle(KT.gold)
            Text(message)
                .font(.system(size: 12))
                .foregroundStyle(.white.opacity(0.85))
                .multilineTextAlignment(.center)
                .lineLimit(3)
                .padding(.horizontal, 18)
            Button {
                player.retry()
            } label: {
                Label(L.s("retry"), systemImage: "arrow.clockwise")
                    .font(.system(size: 12, weight: .bold))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 7)
                    .background(Capsule().fill(.white.opacity(0.18)))
                    .foregroundStyle(.white)
            }
            .buttonStyle(.plain)
        }
        .padding(14)
        .background(Color.black.opacity(0.55))
    }

    private func controlsOverlay(isLandscape: Bool) -> some View {
        VStack {
            HStack(spacing: 8) {
                if let channel = player.channel {
                    ChannelLogo(name: channel.name, url: channel.logoURL, size: 26)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(channel.name)
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(.white)
                            .lineLimit(1)
                        Text(channel.group)
                            .font(.system(size: 9))
                            .foregroundStyle(.white.opacity(0.6))
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 4)
                if player.isPlaying {
                    LiveBadge(compact: true)
                }
            }
            .padding(.horizontal, 10)
            .padding(.top, 8)

            Spacer()

            HStack(spacing: 14) {
                controlButton(player.isPlaying ? "pause.fill" : "play.fill") {
                    player.togglePlayPause()
                    scheduleControlsHide()
                }
                controlButton(player.isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill") {
                    player.isMuted.toggle()
                    scheduleControlsHide()
                }
                controlButton(player.fillScreen ? "rectangle.arrowtriangle.2.inward" : "rectangle.arrowtriangle.2.outward") {
                    player.fillScreen.toggle()
                    scheduleControlsHide()
                }
                // عكس البثّ على التلفاز: قائمة النظام تعرض الأجهزة المتاحة.
                RoutePickerButton()
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(.black.opacity(0.35)))
                    .accessibilityLabel(L.s("cast_device"))

                Spacer()

                if !isFullscreen {
                    controlButton(showRail ? "sidebar.trailing" : "sidebar.leading") {
                        withAnimation(.snappy) { showRail.toggle() }
                        scheduleControlsHide()
                    }
                }
                controlButton(isFullscreen ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right") {
                    withAnimation(.snappy) { isFullscreen.toggle() }
                }
                .accessibilityLabel(L.s(isFullscreen ? "minimize" : "fullscreen"))
            }
            .padding(.horizontal, 10)
            .padding(.bottom, 8)
        }
        .background(
            LinearGradient(
                colors: [.black.opacity(0.55), .clear, .black.opacity(0.6)],
                startPoint: .top,
                endPoint: .bottom
            )
        )
    }

    private func controlButton(_ systemName: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 32, height: 32)
                .background(Circle().fill(.black.opacity(0.35)))
        }
        .buttonStyle(.plain)
    }

    // MARK: - تحت المشغّل (الوضع العمودي)

    /// لا جدول مباريات هنا: طُلب صراحةً أن يبقى ما تحت البثّ للقناة وحدها.
    private var belowPlayer: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let channel = player.channel {
                    nowPlayingCard(channel)
                }
                officialBroadcastersCard
                if !store.hasUserChannels {
                    addChannelsHint
                }
                if !store.loadErrors.isEmpty {
                    ForEach(store.loadErrors, id: \.self) { error in
                        Text(error)
                            .font(.system(size: 11))
                            .foregroundStyle(KT.gold)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 12)
        }
    }

    private func nowPlayingCard(_ channel: Channel) -> some View {
        HStack(spacing: 10) {
            ChannelLogo(name: channel.name, url: channel.logoURL, size: 42)
            VStack(alignment: .leading, spacing: 3) {
                Text(channel.name)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(KT.text)
                    .lineLimit(1)
                Text(channel.note ?? channel.group)
                    .font(.system(size: 11))
                    .foregroundStyle(KT.textFaint)
                    .lineLimit(2)
            }
            Spacer(minLength: 4)
        }
        .ktCard(padding: 12, radius: 16)
    }

    /// البطولات التي لا يمكن بثّها هنا، مع زر يفتح تطبيق صاحب الحق.
    private var officialBroadcastersCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(L.s("exclusive_competitions"))
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(KT.text)
            ForEach(Broadcasters.all) { broadcaster in
                VStack(alignment: .leading, spacing: 6) {
                    Text(broadcaster.note)
                        .font(.system(size: 12))
                        .foregroundStyle(KT.textSecondary)
                    if let url = broadcaster.openURL {
                        Button {
                            openURL(url)
                        } label: {
                            Label(L.s("open_broadcaster", broadcaster.name),
                                  systemImage: "arrow.up.forward.app.fill")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(KT.accent)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .ktCard(padding: 14, radius: 16)
    }

    private var addChannelsHint: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(L.s("your_channels"))
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(KT.text)
            Text(L.s("your_channels_hint"))
                .font(.system(size: 12))
                .foregroundStyle(KT.textSecondary)
            Button {
                router.openSettings(focus: .playlists)
            } label: {
                Label(L.s("add_playlist"), systemImage: "plus.circle.fill")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(KT.accent)
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .ktCard(padding: 14, radius: 16)
    }

    // MARK: - قائمة القنوات

    private func rail(width: CGFloat, compact: Bool) -> some View {
        VStack(spacing: 0) {
            railHeader(compact: compact)

            if store.isLoading && store.channels.isEmpty {
                KTLoading(title: "")
            } else if store.visibleChannels.isEmpty {
                emptyRail
            } else {
                ScrollView {
                    LazyVStack(spacing: 6) {
                        ForEach(store.visibleChannels) { channel in
                            ChannelRailRow(
                                channel: channel,
                                isPlaying: player.channel?.id == channel.id,
                                compact: compact
                            )
                            .onTapGesture { select(channel) }
                        }
                    }
                    .padding(.horizontal, 6)
                    .padding(.vertical, 8)
                }
            }
        }
        .frame(width: width)
        .background(KT.bgSoft)
    }

    private func railHeader(compact: Bool) -> some View {
        VStack(spacing: 6) {
            HStack(spacing: 4) {
                Text(L.s("channels_title"))
                    .font(.system(size: compact ? 12 : 14, weight: .heavy))
                    .foregroundStyle(KT.text)
                Spacer(minLength: 2)
                Text("\(store.visibleChannels.count)")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(KT.textFaint)
            }

            Menu {
                Button(L.s("filter_all")) { store.selectedGroup = nil }
                ForEach(store.groups, id: \.self) { group in
                    Button(group) { store.selectedGroup = group }
                }
            } label: {
                HStack(spacing: 4) {
                    Text(store.selectedGroup ?? L.s("all_groups"))
                        .font(.system(size: 11, weight: .semibold))
                        .lineLimit(1)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 8, weight: .bold))
                }
                .foregroundStyle(KT.accent)
                .padding(.horizontal, 8)
                .padding(.vertical, 5)
                .frame(maxWidth: .infinity)
                .background(Capsule().fill(KT.accent.opacity(0.12)))
            }
        }
        .padding(.horizontal, 8)
        .padding(.top, 10)
        .padding(.bottom, 8)
        .background(KT.bg.opacity(0.6))
    }

    private var emptyRail: some View {
        VStack(spacing: 8) {
            Image(systemName: "list.and.film")
                .font(.system(size: 22))
                .foregroundStyle(KT.textFaint)
            Text(L.s("no_channels"))
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(KT.textSecondary)
            Button {
                router.openSettings(focus: .playlists)
            } label: {
                Text(L.s("add_list"))
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(KT.accent)
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
    }

    /// القائمة أسفل المشغّل عندما يختار المستخدم هذا الترتيب.
    private var stackedList: some View {
        ScrollView {
            LazyVStack(spacing: 8) {
                HStack {
                    Menu {
                        Button(L.s("filter_all")) { store.selectedGroup = nil }
                        ForEach(store.groups, id: \.self) { group in
                            Button(group) { store.selectedGroup = group }
                        }
                    } label: {
                        HStack(spacing: 5) {
                            Text(store.selectedGroup ?? L.s("all_groups"))
                                .font(.system(size: 12, weight: .bold))
                            Image(systemName: "chevron.down")
                                .font(.system(size: 9, weight: .bold))
                        }
                        .foregroundStyle(KT.accent)
                    }
                    Spacer()
                    Text("\(store.visibleChannels.count)")
                        .font(.system(size: 11))
                        .foregroundStyle(KT.textFaint)
                }
                .padding(.horizontal, 4)

                ForEach(store.visibleChannels) { channel in
                    ChannelRailRow(
                        channel: channel,
                        isPlaying: player.channel?.id == channel.id,
                        compact: false
                    )
                    .onTapGesture { select(channel) }
                }

                if !store.hasUserChannels {
                    addChannelsHint
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
        }
    }

    // MARK: - السلوك

    private func select(_ channel: Channel) {
        player.play(channel)
        settings.lastChannelID = channel.id
        revealControls()
    }

    /// القناة قد تكون محضَّرة مسبقاً عند فتح التطبيق، فيكفي أن نُشغّلها.
    private func startPlaybackIfNeeded() {
        guard settings.autoPlayOnOpen else { return }
        if player.channel != nil {
            player.resume()
            return
        }
        guard let channel = store.startupChannel else { return }
        select(channel)
    }

    private func revealControls() {
        withAnimation(.easeInOut(duration: 0.18)) { showControls = true }
        scheduleControlsHide()
    }

    private func scheduleControlsHide() {
        hideControlsWork?.cancel()
        hideControlsWork = Task {
            try? await Task.sleep(nanoseconds: controlsTimeout * 1_000_000_000)
            guard !Task.isCancelled else { return }
            withAnimation(.easeInOut(duration: 0.25)) { showControls = false }
        }
    }
}

/// شكل صندوق الفيديو: نسبة 16:9 في الوضع العمودي، وملء الشاشة أفقياً.
private struct VideoBoxShape: ViewModifier {
    let fill: Bool

    @ViewBuilder
    func body(content: Content) -> some View {
        if fill {
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .ignoresSafeArea()
        } else {
            content
                .aspectRatio(16.0 / 9.0, contentMode: .fit)
                .frame(maxWidth: .infinity)
        }
    }
}

/// صف قناة داخل القائمة.
struct ChannelRailRow: View {
    let channel: Channel
    let isPlaying: Bool
    let compact: Bool

    var body: some View {
        Group {
            if compact {
                VStack(spacing: 5) {
                    ChannelLogo(name: channel.name, url: channel.logoURL, size: 40)
                        .overlay(alignment: .topTrailing) { geoMark }
                    Text(channel.name)
                        .font(.system(size: 10, weight: isPlaying ? .bold : .medium))
                        .foregroundStyle(isPlaying ? KT.accent : KT.textSecondary)
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                        .minimumScaleFactor(0.8)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .padding(.horizontal, 4)
            } else {
                HStack(spacing: 9) {
                    ChannelLogo(name: channel.name, url: channel.logoURL, size: 38)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(channel.name)
                            .font(.system(size: 13, weight: isPlaying ? .bold : .medium))
                            .foregroundStyle(isPlaying ? KT.accent : KT.text)
                            .lineLimit(1)
                        Text(channel.group)
                            .font(.system(size: 10))
                            .foregroundStyle(KT.textFaint)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 4)
                    geoMark
                    if isPlaying {
                        Image(systemName: "waveform")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(KT.accent)
                    }
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(isPlaying ? KT.accent.opacity(0.14) : KT.card)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(isPlaying ? KT.accent.opacity(0.55) : KT.hairline, lineWidth: 1)
        )
        .contentShape(Rectangle())
    }

    /// تنبيه صامت: هذه القناة قد لا تعمل خارج منطقتها.
    @ViewBuilder
    private var geoMark: some View {
        if channel.geoRestricted {
            Image(systemName: "globe.badge.chevron.backward")
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(KT.gold)
                .padding(2)
                .background(Circle().fill(KT.bg.opacity(0.85)))
        }
    }
}
