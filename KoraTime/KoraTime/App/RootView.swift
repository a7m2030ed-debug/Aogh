import SwiftUI

/// شريط التبويبات: المباريات ثم القنوات ثم الأخبار ثم الإعدادات.
/// في الاتجاه من اليمين لليسار يظهر أول عنصر في أقصى اليمين.
struct RootView: View {

    @Environment(AppRouter.self) private var router

    var body: some View {
        @Bindable var router = router

        TabView(selection: $router.tab) {
            MatchesView()
                .tabItem { Label(AppRouter.Tab.matches.title, systemImage: AppRouter.Tab.matches.icon) }
                .tag(AppRouter.Tab.matches)

            ChannelsView()
                .tabItem { Label(AppRouter.Tab.channels.title, systemImage: AppRouter.Tab.channels.icon) }
                .tag(AppRouter.Tab.channels)

            NewsView()
                .tabItem { Label(AppRouter.Tab.news.title, systemImage: AppRouter.Tab.news.icon) }
                .tag(AppRouter.Tab.news)

            SettingsView()
                .tabItem { Label(AppRouter.Tab.settings.title, systemImage: AppRouter.Tab.settings.icon) }
                .tag(AppRouter.Tab.settings)
        }
        .tint(KT.accent)
        .background(KT.bg)
    }
}
