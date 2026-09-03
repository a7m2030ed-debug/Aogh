import SwiftUI
import UIKit

@main
struct KoraTimeApp: App {

    @State private var settings: AppSettings
    @State private var router: AppRouter
    @State private var matchesStore: MatchesStore
    @State private var channelsStore: ChannelsStore
    @State private var newsStore: NewsStore
    @State private var player: PlayerController
    @State private var updates: UpdateChecker

    init() {
        let settings = AppSettings()
        _settings = State(initialValue: settings)
        _router = State(initialValue: AppRouter())
        _matchesStore = State(initialValue: MatchesStore(settings: settings))
        _channelsStore = State(initialValue: ChannelsStore(settings: settings))
        _newsStore = State(initialValue: NewsStore(settings: settings))
        _player = State(initialValue: PlayerController())
        _updates = State(initialValue: UpdateChecker())
        KoraTimeApp.applyBarAppearance()
    }

    var body: some Scene {
        WindowGroup {
            AppGate()
                .environment(settings)
                .environment(router)
                .environment(matchesStore)
                .environment(channelsStore)
                .environment(newsStore)
                .environment(player)
                .environment(updates)
                // الاتجاه يتبع اللغة: يمين‑يسار للعربية ويسار‑يمين للإنجليزية
                .environment(\.layoutDirection, settings.language.isRTL ? .rightToLeft : .leftToRight)
                .environment(\.locale, KTDate.locale)
                // تبديل اللغة يعيد بناء الشجرة كاملة، كما يفعل أندرويد
                // بإعادة إنشاء النشاط — وإلا بقيت شاشات بنصّ اللغة السابقة.
                .id(settings.language)
                .preferredColorScheme(.dark)
                .tint(KT.accent)
        }
    }

    /// شريطا التبويب والتنقّل بلون التطبيق بدل الرمادي الافتراضي.
    private static func applyBarAppearance() {
        let background = UIColor(red: 0.024, green: 0.086, blue: 0.067, alpha: 1)

        let tabBar = UITabBarAppearance()
        tabBar.configureWithOpaqueBackground()
        tabBar.backgroundColor = background
        tabBar.shadowColor = UIColor.white.withAlphaComponent(0.08)
        UITabBar.appearance().standardAppearance = tabBar
        UITabBar.appearance().scrollEdgeAppearance = tabBar

        let navigationBar = UINavigationBarAppearance()
        navigationBar.configureWithOpaqueBackground()
        navigationBar.backgroundColor = background
        navigationBar.shadowColor = UIColor.white.withAlphaComponent(0.08)
        navigationBar.titleTextAttributes = [.foregroundColor: UIColor.white]
        navigationBar.largeTitleTextAttributes = [.foregroundColor: UIColor.white]
        UINavigationBar.appearance().standardAppearance = navigationBar
        UINavigationBar.appearance().scrollEdgeAppearance = navigationBar
        UINavigationBar.appearance().compactAppearance = navigationBar
    }
}


/// يفصل أول تشغيل عن بقية التطبيق: شاشة التفضيلات مرّة واحدة ثم التبويبات.
private struct AppGate: View {

    @Environment(AppSettings.self) private var settings
    @Environment(MatchesStore.self) private var matches
    @Environment(NewsStore.self) private var news
    @Environment(ChannelsStore.self) private var channels
    @Environment(PlayerController.self) private var player
    @Environment(UpdateChecker.self) private var updates
    @Environment(\.openURL) private var openURL
    @State private var onboarded: Bool?

    var body: some View {
        @Bindable var settings = settings
        Group {
            // الحجب لا يقع إلا إن رُفع أدنى إصدار مقبول عمداً لعطل حقيقي.
            if updates.isBlocking, let info = updates.info {
                UpdateRequiredView(info: info) { openStore() }
            } else if onboarded ?? settings.onboarded {
                RootView()
            } else {
                OnboardingView(settings: settings) {
                    onboarded = true
                    // التفضيلات الجديدة تعني ترتيباً وأخباراً مختلفة
                    matches.invalidate()
                    news.invalidate()
                    Task { await news.reload() }
                }
            }
        }
        // تحضير قناة البداية مع إقلاع التطبيق: البيان وأول مقطع يصلان
        // بينما المستخدم في تبويب المباريات، فيفتح البثّ عنده بلا انتظار.
        .task {
            // بوّابة التحديث أولاً وبلا انتظار: طلب صغير لا يؤخّر شيئاً،
            // وفشله صامت فلا يُقلق المستخدم بخطأ شبكة.
            Task { await updates.check() }

            guard settings.autoPlayOnOpen else { return }
            await channels.loadIfNeeded()
            if let channel = channels.startupChannel {
                player.preload(channel)
            }
        }
    }

    private func openStore() {
        if let url = updates.storeURL { openURL(url) }
    }
}
