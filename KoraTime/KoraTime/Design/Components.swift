import SwiftUI

/// شارة "مباشر" بنبضة خفيفة.
struct LiveBadge: View {
    var text: String = L.s("status_live")
    var compact: Bool = false
    @State private var pulsing = false

    var body: some View {
        HStack(spacing: 4) {
            Circle()
                .fill(KT.live)
                .frame(width: compact ? 5 : 6, height: compact ? 5 : 6)
                .opacity(pulsing ? 0.35 : 1)
            Text(text)
                .font(.system(size: compact ? 10 : 11, weight: .bold))
                .foregroundStyle(KT.live)
        }
        .padding(.horizontal, compact ? 6 : 8)
        .padding(.vertical, compact ? 2 : 3)
        .background(
            Capsule().fill(KT.live.opacity(0.14))
        )
        .onAppear {
            withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) {
                pulsing = true
            }
        }
    }
}

/// زر فئة/تصفية على شكل كبسولة.
struct ChipButton: View {
    let title: String
    let isSelected: Bool
    var systemImage: String?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 5) {
                if let systemImage = systemImage {
                    Image(systemName: systemImage)
                        .font(.system(size: 11, weight: .semibold))
                }
                Text(title)
                    .font(.system(size: 13, weight: isSelected ? .bold : .medium))
                    .lineLimit(1)
            }
            .padding(.horizontal, 13)
            .padding(.vertical, 7)
            .background(
                Capsule()
                    .fill(isSelected ? KT.accent.opacity(0.18) : KT.card)
            )
            .overlay(
                Capsule()
                    .stroke(isSelected ? KT.accent.opacity(0.65) : KT.hairline, lineWidth: 1)
            )
            .foregroundStyle(isSelected ? KT.accent : KT.textSecondary)
        }
        .buttonStyle(.plain)
    }
}

struct KTSectionHeader: View {
    let title: String
    var subtitle: String?
    var badgeURL: URL?
    var trailing: String?

    var body: some View {
        HStack(spacing: 9) {
            if let badgeURL = badgeURL {
                RemoteImage(url: badgeURL, contentMode: .fit) {
                    Image(systemName: "trophy.fill")
                        .font(.system(size: 12))
                        .foregroundStyle(KT.textFaint)
                }
                .frame(width: 22, height: 22)
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(KT.text)
                    .lineLimit(1)
                if let subtitle = subtitle {
                    Text(subtitle)
                        .font(.system(size: 11))
                        .foregroundStyle(KT.textFaint)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 6)
            if let trailing = trailing {
                Text(trailing)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(KT.textFaint)
            }
        }
        .padding(.vertical, 4)
    }
}

struct KTEmptyState: View {
    let icon: String
    let title: String
    var message: String?
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 38, weight: .light))
                .foregroundStyle(KT.accent.opacity(0.65))
            Text(title)
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(KT.text)
                .multilineTextAlignment(.center)
            if let message = message {
                Text(message)
                    .font(.system(size: 13))
                    .foregroundStyle(KT.textSecondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 320)
            }
            if let actionTitle = actionTitle, let action = action {
                Button(action: action) {
                    Text(actionTitle)
                        .font(.system(size: 14, weight: .bold))
                        .padding(.horizontal, 20)
                        .padding(.vertical, 9)
                        .background(Capsule().fill(KT.accent.opacity(0.18)))
                        .overlay(Capsule().stroke(KT.accent.opacity(0.6), lineWidth: 1))
                        .foregroundStyle(KT.accent)
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
        .padding(.horizontal, 24)
    }
}

struct KTLoading: View {
    var title: String = L.s("loading")

    var body: some View {
        VStack(spacing: 10) {
            ProgressView()
                .progressViewStyle(.circular)
                .tint(KT.accent)
            Text(title)
                .font(.system(size: 12))
                .foregroundStyle(KT.textFaint)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }
}

struct KTErrorView: View {
    let message: String
    var retry: (() -> Void)?

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 34, weight: .light))
                .foregroundStyle(KT.gold)
            Text(L.s("fetch_failed"))
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(KT.text)
            Text(message)
                .font(.system(size: 13))
                .foregroundStyle(KT.textSecondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 340)
            if let retry = retry {
                Button(action: retry) {
                    Label(L.s("retry"), systemImage: "arrow.clockwise")
                        .font(.system(size: 14, weight: .bold))
                        .padding(.horizontal, 18)
                        .padding(.vertical, 9)
                        .background(Capsule().fill(KT.accent.opacity(0.18)))
                        .foregroundStyle(KT.accent)
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 34)
        .padding(.horizontal, 24)
    }
}

/// عنوان الشاشة بأسلوب موحّد أعلى كل تبويب.
struct KTScreenTitle: View {
    let title: String
    var subtitle: String?
    var trailing: AnyView?

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 26, weight: .heavy))
                    .foregroundStyle(KT.text)
                if let subtitle = subtitle {
                    Text(subtitle)
                        .font(.system(size: 12))
                        .foregroundStyle(KT.textFaint)
                }
            }
            Spacer(minLength: 8)
            if let trailing = trailing {
                trailing
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 6)
        .padding(.bottom, 8)
    }
}
