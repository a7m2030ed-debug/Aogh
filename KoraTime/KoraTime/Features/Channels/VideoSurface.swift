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
