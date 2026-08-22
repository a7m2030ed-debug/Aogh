import SwiftUI

/// صف مباراة واحدة: الفريق المضيف يمين، الضيف يسار، والنتيجة/الوقت في المنتصف.
struct MatchRow: View {
    let match: Match
    var arabicNames: Bool = true

    var body: some View {
        HStack(spacing: 8) {
            teamCell(
                name: match.homeTitle(arabic: arabicNames),
                rawName: match.homeName,
                badge: match.homeBadge,
                isHome: true
            )

            centerBox
                .frame(width: 62)

            teamCell(
                name: match.awayTitle(arabic: arabicNames),
                rawName: match.awayName,
                badge: match.awayBadge,
                isHome: false
            )
        }
        .padding(.vertical, 11)
        .padding(.horizontal, 12)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(match.isLive ? KT.cardHigh : KT.card)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(match.isLive ? KT.live.opacity(0.35) : KT.hairline, lineWidth: 1)
        )
        .contentShape(Rectangle())
    }

    private func teamCell(name: String, rawName: String, badge: URL?, isHome: Bool) -> some View {
        HStack(spacing: 8) {
            if isHome {
                Text(name)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(KT.text)
                    .lineLimit(2)
                    .minimumScaleFactor(0.75)
                    .multilineTextAlignment(.leading)
                TeamBadge(name: rawName, url: badge, size: 34)
            } else {
                TeamBadge(name: rawName, url: badge, size: 34)
                Text(name)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(KT.text)
                    .lineLimit(2)
                    .minimumScaleFactor(0.75)
                    .multilineTextAlignment(.trailing)
            }
        }
        .frame(maxWidth: .infinity, alignment: isHome ? .leading : .trailing)
    }

    @ViewBuilder
    private var centerBox: some View {
        VStack(spacing: 3) {
            if match.hasScore, match.status != .scheduled {
                HStack(spacing: 5) {
                    Text("\(match.homeScore ?? 0)")
                    Text("−")
                        .foregroundStyle(KT.textFaint)
                    Text("\(match.awayScore ?? 0)")
                }
                .font(.system(size: 19, weight: .heavy))
                .foregroundStyle(match.isLive ? KT.accent : KT.text)
                .monospacedDigit()
            } else if let kickoff = match.kickoff {
                Text(KTDate.time(kickoff))
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(KT.text)
                    .monospacedDigit()
            } else {
                Text("—")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(KT.textFaint)
            }

            if match.isLive {
                LiveBadge(text: match.progress ?? "مباشر", compact: true)
            } else {
                Text(match.centerCaption)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(statusColor)
                    .lineLimit(1)
            }
        }
    }

    private var statusColor: Color {
        switch match.status {
        case .finished: return KT.textFaint
        case .postponed, .canceled: return KT.gold
        default: return KT.textSecondary
        }
    }
}

/// شريط مصغّر يعرض مباراة داخل تبويب القنوات.
struct CompactMatchCard: View {
    let match: Match
    var arabicNames: Bool = true

    var body: some View {
        VStack(spacing: 6) {
            HStack(spacing: 6) {
                TeamBadge(name: match.homeName, url: match.homeBadge, size: 22)
                Text(scoreOrTime)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(match.isLive ? KT.accent : KT.text)
                    .monospacedDigit()
                TeamBadge(name: match.awayName, url: match.awayBadge, size: 22)
            }
            Text("\(match.homeTitle(arabic: arabicNames)) × \(match.awayTitle(arabic: arabicNames))")
                .font(.system(size: 10))
                .foregroundStyle(KT.textSecondary)
                .lineLimit(1)
                .truncationMode(.middle)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .frame(width: 150)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous).fill(KT.card)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(match.isLive ? KT.live.opacity(0.4) : KT.hairline, lineWidth: 1)
        )
    }

    private var scoreOrTime: String {
        if match.hasScore, match.status != .scheduled {
            return "\(match.homeScore ?? 0) − \(match.awayScore ?? 0)"
        }
        if let kickoff = match.kickoff { return KTDate.time(kickoff) }
        return "—"
    }
}
