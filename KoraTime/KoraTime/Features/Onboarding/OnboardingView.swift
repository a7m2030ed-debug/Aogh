import SwiftUI

/// أول تشغيل: يختار المستخدم دورياته ثم فرقه، فتُرتَّب المباريات وتُبنى
/// الأخبار عليها. الخطوتان تخطّيهما ممكن — من رفض الاختيار يحصل على
/// الترتيب الافتراضي لا على شاشة فارغة.
struct OnboardingView: View {

    @Bindable var settings: AppSettings
    var onDone: () -> Void

    @State private var step = 0
    @State private var leagues: [String] = []
    @State private var teams: [String] = []

    private var lang: Lang { settings.language }

    private let columns = [GridItem(.adaptive(minimum: 138), spacing: 8)]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 6) {
                Text(L.s(step == 0 ? "onb_leagues_title" : "onb_teams_title"))
                    .font(.system(size: 24, weight: .heavy))
                    .foregroundStyle(KT.text)
                Text(L.s(step == 0 ? "onb_leagues_sub" : "onb_teams_sub"))
                    .font(.system(size: 13))
                    .foregroundStyle(KT.textSecondary)
            }
            .padding(.top, 28)
            .padding(.bottom, 16)

            ScrollView {
                if step == 0 {
                    LazyVGrid(columns: columns, spacing: 8) {
                        ForEach(Catalog.leagues) { league in
                            chip(label: league.name(lang),
                                 isOn: leagues.contains(league.id)) {
                                toggleLeague(league)
                            }
                        }
                    }
                } else {
                    let available = Catalog.teams(in: leagues)
                    if available.isEmpty {
                        Text(L.s("onb_no_teams"))
                            .font(.system(size: 13))
                            .foregroundStyle(KT.textFaint)
                            .padding(.top, 20)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    } else {
                        LazyVGrid(columns: columns, spacing: 8) {
                            ForEach(available) { team in
                                chip(label: team.name(lang),
                                     isOn: teams.contains(team.ar)) {
                                    toggle(&teams, team.ar)
                                }
                            }
                        }
                    }
                }
            }

            HStack {
                Button(L.s("skip")) { finish() }
                    .font(.system(size: 14))
                    .foregroundStyle(KT.textFaint)
                Spacer()
                Button(L.s(step == 0 ? "next" : "start")) {
                    if step == 0 { step = 1 } else { finish() }
                }
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(KT.bg)
                .padding(.horizontal, 30)
                .padding(.vertical, 11)
                .background(KT.accent, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .padding(.vertical, 16)
        }
        .padding(.horizontal, 18)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(KT.bg)
        .onAppear {
            leagues = settings.favoriteLeagues
            teams = settings.favoriteTeams
        }
    }

    private func chip(label: String, isOn: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 13, weight: isOn ? .bold : .medium))
                .foregroundStyle(isOn ? KT.accent : KT.textSecondary)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 13)
                .padding(.horizontal, 8)
                .background(isOn ? KT.accent.opacity(0.14) : KT.card,
                            in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(isOn ? KT.accent.opacity(0.6) : KT.hairline, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
    }

    private func toggleLeague(_ league: League) {
        if leagues.contains(league.id) {
            leagues.removeAll { $0 == league.id }
            // إسقاط فرق دوري لم يعد مختاراً حتى لا تبقى معلّقة
            let dropped = Set(league.teams.map(\.ar))
            teams.removeAll { dropped.contains($0) }
        } else {
            leagues.append(league.id)
        }
    }

    private func toggle(_ list: inout [String], _ value: String) {
        if list.contains(value) {
            list.removeAll { $0 == value }
        } else {
            list.append(value)
        }
    }

    private func finish() {
        settings.favoriteLeagues = leagues
        settings.favoriteTeams = teams
        settings.rebuildFeedsFromFavorites()
        settings.onboarded = true
        onDone()
    }
}
