import SwiftUI

/// لوحة ألوان التطبيق: أخضر ملعب داكن + أخضر مضيء للتمييز.
enum KT {
    static let bg = Color(red: 0.016, green: 0.071, blue: 0.055)
    static let bgSoft = Color(red: 0.031, green: 0.106, blue: 0.082)
    static let card = Color(red: 0.047, green: 0.137, blue: 0.110)
    static let cardHigh = Color(red: 0.067, green: 0.180, blue: 0.145)
    static let accent = Color(red: 0.000, green: 0.839, blue: 0.561)
    static let accentDim = Color(red: 0.000, green: 0.545, blue: 0.365)
    static let live = Color(red: 1.000, green: 0.290, blue: 0.333)
    static let gold = Color(red: 1.000, green: 0.780, blue: 0.294)
    static let text = Color(white: 0.97)
    static let textSecondary = Color(white: 0.68)
    static let textFaint = Color(white: 0.48)
    static let hairline = Color.white.opacity(0.07)

    static let backdrop = LinearGradient(
        colors: [Color(red: 0.031, green: 0.110, blue: 0.086), KT.bg],
        startPoint: .top,
        endPoint: .bottom
    )

    static let accentGradient = LinearGradient(
        colors: [KT.accent, KT.accentDim],
        startPoint: .topTrailing,
        endPoint: .bottomLeading
    )
}

/// خلفية موحّدة لكل التبويبات.
struct KTBackground: View {
    var body: some View {
        ZStack {
            KT.bg
            KT.backdrop
            RadialGradient(
                colors: [KT.accent.opacity(0.16), .clear],
                center: .top,
                startRadius: 0,
                endRadius: 420
            )
        }
        .ignoresSafeArea()
    }
}

struct KTCard: ViewModifier {
    var padding: CGFloat = 14
    var radius: CGFloat = 18

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .fill(KT.card)
            )
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .stroke(KT.hairline, lineWidth: 1)
            )
    }
}

extension View {
    func ktCard(padding: CGFloat = 14, radius: CGFloat = 18) -> some View {
        modifier(KTCard(padding: padding, radius: radius))
    }

    /// يخفي لوحة المفاتيح عند السحب داخل قائمة بحث.
    func ktDismissKeyboardOnScroll() -> some View {
        scrollDismissesKeyboard(.immediately)
    }
}
