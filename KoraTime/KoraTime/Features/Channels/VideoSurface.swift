import AVFoundation
import SwiftUI
import UIKit

/// طبقة عرض الفيديو. نستخدم AVPlayerLayer مباشرة بدل VideoPlayer
/// حتى نتحكّم بالأزرار وبنسبة العرض بأنفسنا.
final class PlayerLayerView: UIView {
    override class var layerClass: AnyClass { AVPlayerLayer.self }

    var playerLayer: AVPlayerLayer {
        // نوع الطبقة مضمون من layerClass أعلاه.
        guard let layer = layer as? AVPlayerLayer else { return AVPlayerLayer() }
        return layer
    }
}

/// تدوير الشاشة عند ملء الشاشة، كما تفعل مشغّلات الفيديو المعروفة: البثّ
/// عرضه أكبر من طوله، فإبقاؤه طولياً يهدر نصف الشاشة.
///
/// النظام لا يقبل الطلب إلا إذا كان الاتجاه ضمن ما تدعمه الحزمة — وهي تدعم
/// الطولي والعرضيين في Info.plist. وإن رُفض الطلب تبقى الصورة كما هي.
enum ScreenOrientation {

    static func request(_ orientations: UIInterfaceOrientationMask) {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        guard let scene = scenes.first(where: { $0.activationState == .foregroundActive })
                ?? scenes.first else { return }

        scene.keyWindow?.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
        scene.requestGeometryUpdate(.iOS(interfaceOrientations: orientations)) { _ in
            // الرفض ليس خطأً يستحقّ إزعاج المستخدم: تبقى الشاشة كما هي.
        }
    }
}

struct VideoSurface: UIViewRepresentable {
    let player: AVPlayer
    var gravity: AVLayerVideoGravity

    func makeUIView(context: Context) -> PlayerLayerView {
        let view = PlayerLayerView()
        view.backgroundColor = .black
        view.playerLayer.player = player
        view.playerLayer.videoGravity = gravity
        return view
    }

    func updateUIView(_ uiView: PlayerLayerView, context: Context) {
        if uiView.playerLayer.player !== player {
            uiView.playerLayer.player = player
        }
        if uiView.playerLayer.videoGravity != gravity {
            uiView.playerLayer.videoGravity = gravity
        }
    }
}
