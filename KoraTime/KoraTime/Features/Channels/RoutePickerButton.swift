import AVKit
import SwiftUI
import UIKit

/// زر عكس البثّ على الشاشات الذكية.
///
/// على iOS الطريق هو AirPlay لا Chromecast: النظام يكتشف Apple TV وأجهزة
/// التلفاز التي تدعم AirPlay 2 (سامسونج، إل جي، سوني الحديثة) بنفسه، ويعرضها
/// في قائمته. إدخال مكتبة Google Cast هنا يعني إطاراً ثنائياً كاملاً وأذونات
/// شبكة محلية إضافية مقابل ما يفعله النظام أصلاً.
///
/// اللون يتغيّر وحده حين يتصل جهاز، فيعرف المستخدم أن البثّ خرج إلى التلفاز.
struct RoutePickerButton: UIViewRepresentable {

    var tint: UIColor = .white
    var activeTint: UIColor = UIColor(red: 0.15, green: 0.85, blue: 0.60, alpha: 1)

    func makeUIView(context: Context) -> AVRoutePickerView {
        let view = AVRoutePickerView()
        view.tintColor = tint
        view.activeTintColor = activeTint
        view.prioritizesVideoDevices = true
        view.backgroundColor = .clear
        view.setContentHuggingPriority(.required, for: .horizontal)
        view.setContentHuggingPriority(.required, for: .vertical)
        return view
    }

    func updateUIView(_ uiView: AVRoutePickerView, context: Context) {
        uiView.tintColor = tint
        uiView.activeTintColor = activeTint
    }
}
