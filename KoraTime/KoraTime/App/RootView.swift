import SwiftUI

/// شريط التبويبات: المباريات ثم القنوات ثم الأخبار ثم الإعدادات.
/// في الاتجاه من اليمين لليسار يظهر أول عنصر في أقصى اليمين.
struct RootView: View {

    @Environment(AppRouter.self) private var router
    @Environment(UpdateChecker.self) private var updates
    @Environment(\.openURL) private var openURL

    var body: some View {
        @Bindable var router = router

        VStack(spacing: 0) {
            // شريط يُعلم ولا يحجب، ويُطوى بضغطة «لاحقاً» فلا يعود لهذا الإصدار.
            if updates.showsBanner, let info = updates.info {
                UpdateBanner(
                    info: info,
                    onUpdate: {
                        if let url = updates.storeURL { openURL(url) }
                    },
                    onLater: {
                        withAnimation(.snappy) { updates.dismiss() }
                    }
                )
            }

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
        }
        .animation(.snappy(duration: 0.25), value: updates.showsBanner)
        .tint(KT.accent)
        .background(KT.bg)
    }
}
