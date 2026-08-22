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

    init() {
        let settings = AppSettings()
        _settings = State(initialValue: settings)
        _router = State(initialValue: AppRouter())
        _matchesStore = State(initialValue: MatchesStore(settings: settings))
        _channelsStore = State(initialValue: ChannelsStore(settings: settings))
        _newsStore = State(initialValue: NewsStore(settings: settings))
        _player = State(initialValue: PlayerController())
        KoraTimeApp.applyBarAppearance()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(settings)
                .environment(router)
                .environment(matchesStore)
                .environment(channelsStore)
                .environment(newsStore)
                .environment(player)
                .environment(\.layoutDirection, .rightToLeft)
                .environment(\.locale, KTDate.locale)
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
