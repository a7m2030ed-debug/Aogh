import AVFoundation
import Foundation
import Observation

/// مشغّل البث المباشر: قناة واحدة في كل وقت، مع حالات التحميل والخطأ.
@MainActor
@Observable
final class PlayerController {

    let player = AVPlayer()

    private(set) var channel: Channel?
    private(set) var isPlaying = false
    private(set) var isBuffering = false
    private(set) var errorText: String?

    var isMuted = false {
        didSet { player.isMuted = isMuted }
    }

    /// تبديل بين احتواء الصورة وملء الشاشة (زر "نسبة العرض").
    var fillScreen = false

    var videoGravity: AVLayerVideoGravity {
        fillScreen ? .resizeAspectFill : .resizeAspect
    }

    @ObservationIgnored private var statusObserver: NSKeyValueObservation?
    @ObservationIgnored private var timeControlObserver: NSKeyValueObservation?
    @ObservationIgnored private var failureObserver: NSObjectProtocol?
    @ObservationIgnored private var stallObserver: NSObjectProtocol?
    @ObservationIgnored private var audioSessionReady = false

    init() {
        player.automaticallyWaitsToMinimizeStalling = true
        observePlayer()
    }

    deinit {
        statusObserver?.invalidate()
        timeControlObserver?.invalidate()
        if let failureObserver = failureObserver { NotificationCenter.default.removeObserver(failureObserver) }
        if let stallObserver = stallObserver { NotificationCenter.default.removeObserver(stallObserver) }
    }

    // MARK: - التشغيل

    func play(_ channel: Channel) {
        guard channel.isPlayable, let url = channel.streamURL else {
            self.channel = channel
            errorText = "رابط هذه القناة غير صالح."
            isBuffering = false
            isPlaying = false
            return
        }

        if self.channel?.id == channel.id, player.currentItem != nil, errorText == nil {
            player.play()
            return
        }

        activateAudioSession()

        self.channel = channel
        errorText = nil
        isBuffering = true

        let asset: AVURLAsset
        let headers = channel.headers
        if headers.isEmpty {
            asset = AVURLAsset(url: url)
        } else {
            asset = AVURLAsset(url: url, options: ["AVURLAssetHTTPHeaderFieldsKey": headers])
        }

        let item = AVPlayerItem(asset: asset)
        item.preferredForwardBufferDuration = 4
        observe(item: item)

        player.replaceCurrentItem(with: item)
        player.isMuted = isMuted
        player.play()
        isPlaying = true
    }

    func togglePlayPause() {
        guard player.currentItem != nil else {
            if let channel = channel { play(channel) }
            return
        }
        if isPlaying {
            player.pause()
            isPlaying = false
        } else {
            player.play()
            isPlaying = true
        }
    }

    func retry() {
        guard let channel = channel else { return }
        player.replaceCurrentItem(with: nil)
        self.channel = nil
        play(channel)
    }

    func stop() {
        player.pause()
        player.replaceCurrentItem(with: nil)
        isPlaying = false
        isBuffering = false
    }

    // MARK: - المراقبة

    private func observePlayer() {
        timeControlObserver = player.observe(\.timeControlStatus, options: [.new]) { [weak self] player, _ in
            let status = player.timeControlStatus
            Task { @MainActor [weak self] in
                guard let self = self else { return }
                self.isBuffering = (status == .waitingToPlayAtSpecifiedRate)
                self.isPlaying = (status == .playing)
            }
        }
    }

    private func observe(item: AVPlayerItem) {
        statusObserver?.invalidate()
        statusObserver = item.observe(\.status, options: [.new]) { [weak self] item, _ in
            let status = item.status
            let failure = item.error?.localizedDescription
            Task { @MainActor [weak self] in
                guard let self = self else { return }
                switch status {
                case .failed:
                    self.isBuffering = false
                    self.isPlaying = false
                    self.errorText = failure ?? "تعذّر تشغيل هذه القناة. جرّب قناة أخرى أو تحقّق من الرابط."
                case .readyToPlay:
                    self.errorText = nil
                default:
                    break
                }
            }
        }

        if let failureObserver = failureObserver { NotificationCenter.default.removeObserver(failureObserver) }
        failureObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemFailedToPlayToEndTime,
            object: item,
            queue: .main
        ) { [weak self] notification in
            let reason = (notification.userInfo?[AVPlayerItemFailedToPlayToEndTimeErrorKey] as? Error)?
                .localizedDescription
            Task { @MainActor [weak self] in
                guard let self = self else { return }
                self.isBuffering = false
                self.isPlaying = false
                self.errorText = reason ?? "انقطع البث."
            }
        }

        if let stallObserver = stallObserver { NotificationCenter.default.removeObserver(stallObserver) }
        stallObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemPlaybackStalled,
            object: item,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.isBuffering = true
            }
        }
    }

    private func activateAudioSession() {
        guard !audioSessionReady else { return }
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
            try AVAudioSession.sharedInstance().setActive(true)
            audioSessionReady = true
        } catch {
            // الصوت قد لا يعمل، لكن الصورة تكمل — لا داعي لإيقاف كل شيء.
            audioSessionReady = false
        }
    }
}
