import Combine
import SwiftUI

struct MatchDetailView: View {

    let match: Match

    @Environment(AppSettings.self) private var settings
    @Environment(AppRouter.self) private var router

    @State private var tick = Date()

    private let ticker = Timer.publish(every: 30, on: .main, in: .common).autoconnect()

    var body: some View {
        ZStack {
            KTBackground()

            ScrollView {
                VStack(spacing: 16) {
                    scoreboard
                    if let countdown = countdownText {
                        Text(countdown)
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(KT.accent)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .background(Capsule().fill(KT.accent.opacity(0.14)))
                    }
                    actions
                    details
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            }
        }
        .navigationTitle(match.competitionTitle(arabic: settings.arabicNames))
        .navigationBarTitleDisplayMode(.inline)
        .onReceive(ticker) { tick = $0 }
    }

    // MARK: - لوحة النتيجة

    private var scoreboard: some View {
        VStack(spacing: 14) {
            HStack(spacing: 8) {
                if let badge = match.competitionBadge {
                    RemoteImage(url: badge, contentMode: .fit) { EmptyView() }
                        .frame(width: 20, height: 20)
                }
                Text(match.competitionTitle(arabic: settings.arabicNames))
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(KT.textSecondary)
                if let round = match.round, !round.isEmpty {
                    Text("• الجولة \(round)")
                        .font(.system(size: 12))
                        .foregroundStyle(KT.textFaint)
                }
            }

            HStack(alignment: .top, spacing: 10) {
                teamColumn(name: match.homeTitle(arabic: settings.arabicNames),
                           rawName: match.homeName,
                           badge: match.homeBadge)

                VStack(spacing: 6) {
                    if match.hasScore, match.status != .scheduled {
                        HStack(spacing: 8) {
                            Text("\(match.homeScore ?? 0)")
                            Text("−").foregroundStyle(KT.textFaint)
                            Text("\(match.awayScore ?? 0)")
                        }
                        .font(.system(size: 34, weight: .heavy))
                        .foregroundStyle(match.isLive ? KT.accent : KT.text)
                        .monospacedDigit()
                    } else if let kickoff = match.kickoff {
                        Text(KTDate.time(kickoff))
                            .font(.system(size: 30, weight: .heavy))
                            .foregroundStyle(KT.text)
                            .monospacedDigit()
                    } else {
                        Text("—")
                            .font(.system(size: 30, weight: .heavy))
                            .foregroundStyle(KT.textFaint)
                    }

                    if match.isLive {
                        LiveBadge(text: match.progress ?? "مباشر")
                    } else {
                        Text(match.status.label)
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(KT.textSecondary)
                    }
                }
                .frame(width: 118)

                teamColumn(name: match.awayTitle(arabic: settings.arabicNames),
                           rawName: match.awayName,
                           badge: match.awayBadge)
            }
        }
        .frame(maxWidth: .infinity)
        .ktCard(padding: 18, radius: 22)
    }

    private func teamColumn(name: String, rawName: String, badge: URL?) -> some View {
        VStack(spacing: 8) {
            TeamBadge(name: rawName, url: badge, size: 58)
            Text(name)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(KT.text)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - الأزرار

    private var actions: some View {
        HStack(spacing: 10) {
            actionButton(title: "شاهد على القنوات", icon: "play.tv.fill", prominent: true) {
                router.openChannels()
            }
            actionButton(title: "أخبار المباراة", icon: "newspaper.fill", prominent: false) {
                router.openNews(query: "\(match.homeName) \(match.awayName)")
            }
        }
    }

    private func actionButton(title: String,
                              icon: String,
                              prominent: Bool,
                              action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 7) {
                Image(systemName: icon)
                    .font(.system(size: 13, weight: .semibold))
                Text(title)
                    .font(.system(size: 13, weight: .bold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(prominent ? KT.accent.opacity(0.18) : KT.card)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(prominent ? KT.accent.opacity(0.6) : KT.hairline, lineWidth: 1)
            )
            .foregroundStyle(prominent ? KT.accent : KT.textSecondary)
        }
        .buttonStyle(.plain)
    }

    // MARK: - التفاصيل

    private var details: some View {
        VStack(spacing: 0) {
            if let kickoff = match.kickoff {
                detailRow(icon: "calendar", title: "الموعد",
                          value: "\(KTDate.fullDay.string(from: kickoff)) — \(KTDate.time(kickoff))")
                divider
            }
            if let venue = match.venue, !venue.isEmpty {
                detailRow(icon: "mappin.and.ellipse", title: "الملعب", value: venue)
                divider
            }
            detailRow(icon: "flag.2.crossed", title: "البطولة",
                      value: match.competitionTitle(arabic: settings.arabicNames))
            divider
            detailRow(icon: "clock.arrow.circlepath", title: "الحالة", value: match.status.label)
        }
        .ktCard(padding: 4, radius: 18)
    }

    private var divider: some View {
        Rectangle()
            .fill(KT.hairline)
            .frame(height: 1)
            .padding(.horizontal, 12)
    }

    private func detailRow(icon: String, title: String, value: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 13))
                .foregroundStyle(KT.accent.opacity(0.85))
                .frame(width: 22)
            Text(title)
                .font(.system(size: 13))
                .foregroundStyle(KT.textSecondary)
            Spacer(minLength: 8)
            Text(value)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(KT.text)
                .multilineTextAlignment(.trailing)
                .lineLimit(2)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
    }

    private var countdownText: String? {
        guard match.status == .scheduled, let kickoff = match.kickoff else { return nil }
        _ = tick // يعيد الحساب مع كل نبضة مؤقّت
        return KTDate.countdown(to: kickoff).map { "تبدأ \($0)" }
    }
}
