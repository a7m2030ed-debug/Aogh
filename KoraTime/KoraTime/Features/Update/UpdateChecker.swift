import Foundation
import Observation
import SwiftUI

/// بوّابة التحديث.
///
/// آبل لا تملك وسيلة لإجبار أحد على التحديث، ومن أطفأ التحديث التلقائي قد
/// يبقى على إصدار قديم إلى الأبد. فيسأل التطبيق عند فتحه: ما أحدث إصدار؟
/// وما أدنى إصدار لا يزال يعمل؟
///
/// الوضع الافتراضي لطيف: شريط يُعلم ولا يمنع، ويُطوى بضغطة «لاحقاً» فلا
/// يعود لهذا الإصدار. والحجب لا يقع إلا إن رُفع `minimum` عمداً في بيان
/// الإصدار — وهو لعطل حقيقي لا لتحديث عادي.
@MainActor
@Observable
final class UpdateChecker {

    private(set) var info: AppVersionInfo?
    /// التحديث متاح ولم يُطوَ بعد.
    private(set) var showsBanner = false
    /// الإصدار الحالي لم يعد مقبولاً: شاشة حاجبة لا تُطوى.
    private(set) var isBlocking = false

    private let store: UserDefaults
    private static let dismissedKey = "update.dismissedVersion"

    init(store: UserDefaults = .standard) {
        self.store = store
    }

    /// إصدار التطبيق المثبَّت كما هو معلن في الحزمة.
    private var installed: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0"
    }

    func check() async {
        // الجلب المشترك مع إعدادات المباريات: طلب واحد يخدم الاثنين.
        // وفشله لا يُعرض للمستخدم — بوّابة التحديث لا يجوز أن تُقلقه بخطأ
        // شبكة، وغياب البيان يعني ببساطة ألّا شيء يُقال.
        guard let payload = await AppConfig.shared.load() else { return }

        info = payload
        let current = installed

        if Version.isNewer(payload.minimum, than: current) {
            isBlocking = true
            showsBanner = false
            return
        }

        let dismissed = store.string(forKey: UpdateChecker.dismissedKey)
        showsBanner = Version.isNewer(payload.latest, than: current)
            && dismissed != payload.latest
    }

    /// «لاحقاً»: يُطوى الشريط لهذا الإصدار فقط، فالتالي يُعلن عن نفسه.
    func dismiss() {
        if let latest = info?.latest {
            store.set(latest, forKey: UpdateChecker.dismissedKey)
        }
        showsBanner = false
    }

    var storeURL: URL? {
        info?.storeURL ?? URL(string: "https://apps.apple.com/app/id0000000000")
    }
}

// MARK: - الشريط اللطيف

/// شريط يعلو الشاشة ولا يحجبها.
struct UpdateBanner: View {

    let info: AppVersionInfo
    var onUpdate: () -> Void
    var onLater: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "arrow.down.circle.fill")
                .font(.system(size: 20))
                .foregroundStyle(KT.accent)

            VStack(alignment: .leading, spacing: 2) {
                Text(info.title)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(KT.text)
                Text(info.notes ?? L.s("update_version", info.latest))
                    .font(.system(size: 11))
                    .foregroundStyle(KT.textFaint)
                    .lineLimit(2)
            }

            Spacer(minLength: 4)

            Button(L.s("update_later"), action: onLater)
                .font(.system(size: 12))
                .foregroundStyle(KT.textFaint)
                .buttonStyle(.plain)

            Button(action: onUpdate) {
                Text(L.s("update_now"))
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(KT.bg)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 7)
                    .background(Capsule().fill(KT.accent))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(KT.card)
        .overlay(alignment: .bottom) {
            Rectangle().fill(KT.hairline).frame(height: 1)
        }
        .transition(.move(edge: .top).combined(with: .opacity))
    }
}

// MARK: - الشاشة الحاجبة

/// لا تظهر إلا إن رُفع أدنى إصدار مقبول عمداً.
struct UpdateRequiredView: View {

    let info: AppVersionInfo
    var onUpdate: () -> Void

    var body: some View {
        ZStack {
            KT.bg.ignoresSafeArea()

            VStack(spacing: 16) {
                Image(systemName: "exclamationmark.arrow.triangle.2.circlepath")
                    .font(.system(size: 46, weight: .light))
                    .foregroundStyle(KT.accent)

                Text(L.s("update_required_title"))
                    .font(.system(size: 20, weight: .heavy))
                    .foregroundStyle(KT.text)

                Text(info.notes ?? L.s("update_required_body"))
                    .font(.system(size: 14))
                    .foregroundStyle(KT.textSecondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 320)

                Button(action: onUpdate) {
                    Text(L.s("update_now"))
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(KT.bg)
                        .padding(.horizontal, 40)
                        .padding(.vertical, 13)
                        .background(Capsule().fill(KT.accent))
                }
                .buttonStyle(.plain)
                .padding(.top, 6)

                Text(L.s("update_version", info.latest))
                    .font(.system(size: 11))
                    .foregroundStyle(KT.textFaint)
            }
            .padding(24)
        }
    }
}
