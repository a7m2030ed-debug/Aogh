import AVFoundation
import Foundation
import Observation

/// مشغّل البث المباشر: قناة واحدة في كل وقت، مع حالات التحميل والخطأ.
///
/// زمن بدء التشغيل هو الشكوى الأولى، ولذلك ثلاثة إجراءات هنا:
/// تحضير مسبق للقناة عند فتح التطبيق، وحاجز تشغيل قصير بدل انتظار AVPlayer
/// حتى يملأ مخزنه، وسقف مؤقّت لمعدّل البِتّ يجعل المشغّل يبدأ من أخفّ نسخة
/// ثم يرتقي بعد ثوانٍ. الثلاثة معاً تُقصّر الطريق من الضغط إلى الصورة.
@MainActor
@Observable
final class PlayerController {

    let player = AVPlayer()

    private(set) var channel: Channel?
    private(set) var isPlaying = false
    private(set) var isBuffering = false
    private(set) var errorText: String?
    /// البثّ معروض الآن على شاشة خارجية عبر AirPlay.
    private(set) var isCasting = false

    var isMuted = false {
        didSet { player.isMuted = isMuted }
    }

    /// تبديل بين احتواء الصورة وملء الشاشة (زر "نسبة العرض").
    var fillScreen = false

    var videoGravity: AVLayerVideoGravity {
        fillScreen ? .resizeAspectFill : .resizeAspect
    }

    /// سقف أوّلي لمعدّل البِتّ: يدفع HLS إلى اختيار نسخة خفيفة فيصل أول
    /// مقطع أسرع. يُرفع بعد أن تستقرّ الصورة فترتفع الجودة تلقائياً.
    private let openingBitrateCap: Double = 1_200_000
    private let bitrateCapSeconds: UInt64 = 6

    @ObservationIgnored private var statusObserver: NSKeyValueObservation?
    @ObservationIgnored private var timeControlObserver: NSKeyValueObservation?
    @ObservationIgnored private var externalObserver: NSKeyValueObservation?
    @ObservationIgnored private var failureObserver: NSObjectProtocol?
    @ObservationIgnored private var stallObserver: NSObjectProtocol?
    @ObservationIgnored private var capLiftTask: Task<Void, Never>?
    @ObservationIgnored private var audioSessionReady = false
    /// القناة المحضَّرة مسبقاً بلا تشغيل — أول ضغطة عليها تبدأ فوراً.
    @ObservationIgnored private var preloadedID: String?

    init() {
        // الانتظار لتقليل التقطّع يعني تأخير البداية بضع مئات من الأجزاء؛
        // في بثّ مباشر البداية أهمّ، والمخزن القصير يعوّض.
        player.automaticallyWaitsToMinimizeStalling = false
        player.allowsExternalPlayback = true
        player.usesExternalPlaybackWhileExternalScreenIsActive = true
        observePlayer()
    }

    deinit {
        statusObserver?.invalidate()
        timeControlObserver?.invalidate()
        externalObserver?.invalidate()
        capLiftTask?.cancel()
        if let failureObserver = failureObserver { NotificationCenter.default.removeObserver(failureObserver) }
        if let stallObserver = stallObserver { NotificationCenter.default.removeObserver(stallObserver) }
    }

    // MARK: - التشغيل

    func play(_ channel: Channel) {
        guard channel.isPlayable, let url = channel.streamURL else {
            self.channel = channel
            errorText = L.s("channel_error")
            isBuffering = false
            isPlaying = false
            return
        }

        // القناة نفسها موقوفة أو محضَّرة مسبقاً: لا نُعيد بناء العنصر.
        if self.channel?.id == channel.id, player.currentItem != nil, errorText == nil {
            resume()
            return
        }

        activateAudioSession()

        self.channel = channel
        errorText = nil
        isBuffering = true

        player.replaceCurrentItem(with: item(for: url, headers: channel.headers))
        player.isMuted = isMuted
        preloadedID = nil
        player.play()
        isPlaying = true
        liftBitrateCapSoon()
    }

    /// يبني عنصر البث ويربط مراقبته دون أن يبدأ التشغيل.
    private func item(for url: URL, headers: [String: String]) -> AVPlayerItem {
        var options: [String: Any] = [AVURLAssetPreferPreciseDurationAndTimingKey: false]
        if !headers.isEmpty { options["AVURLAssetHTTPHeaderFieldsKey"] = headers }

        let item = AVPlayerItem(asset: AVURLAsset(url: url, options: options))
        // ثانيتان تكفيان لبدء بثّ مباشر؛ الأربع القديمة كانت انتظاراً زائداً.
        item.preferredForwardBufferDuration = 2
        item.preferredPeakBitRate = openingBitrateCap
        observe(item: item)
        return item
    }

    /// تحضير القناة الأولى عند فتح التطبيق: يُنزَّل البيان وأول مقطع بينما
    /// المستخدم لا يزال في تبويب آخر، فتبدأ الصورة عند دخوله بلا انتظار.
    func preload(_ channel: Channel) {
        guard self.channel == nil, player.currentItem == nil else { return }
        guard channel.isPlayable, let url = channel.streamURL else { return }

        self.channel = channel
        preloadedID = channel.id
        errorText = nil
        player.replaceCurrentItem(with: item(for: url, headers: channel.headers))
        // بلا `play()`: العنصر يملأ مخزنه وحده وتبقى الصورة ساكنة.
    }

    /// عودة المستخدم إلى تبويب القنوات: يكمل ما كان يُعرض أو يُشغّل المحضَّر.
    func resume() {
        guard player.currentItem != nil, errorText == nil else { return }
        activateAudioSession()
        player.isMuted = isMuted
        player.play()
        isPlaying = true
        if preloadedID != nil {
            preloadedID = nil
            liftBitrateCapSoon()
        }
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
            resume()
        }
    }

    func retry() {
        guard let channel = channel else { return }
        player.replaceCurrentItem(with: nil)
        self.channel = nil
        play(channel)
    }

    func stop() {
        capLiftTask?.cancel()
        player.pause()
        player.replaceCurrentItem(with: nil)
        isPlaying = false
        isBuffering = false
        preloadedID = nil
    }

    /// يرفع سقف معدّل البِتّ بعد أن تستقرّ الصورة، فتعود الجودة الكاملة.
    private func liftBitrateCapSoon() {
        capLiftTask?.cancel()
        capLiftTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: (self?.bitrateCapSeconds ?? 6) * 1_000_000_000)
            guard !Task.isCancelled else { return }
            self?.player.currentItem?.preferredPeakBitRate = 0
        }
    }

    // MARK: - المراقبة

    private func observePlayer() {
        timeControlObserver = player.observe(\.timeControlStatus, options: [.new]) { [weak self] player, _ in
            let status = player.timeControlStatus
            Task { @MainActor [weak self] in
                guard let self = self else { return }
                // القناة المحضَّرة موقوفة عمداً، فلا نُظهر دوّارة انتظار لها.
                self.isBuffering = (status == .waitingToPlayAtSpecifiedRate) && self.preloadedID == nil
                self.isPlaying = (status == .playing)
            }
        }

        externalObserver = player.observe(\.isExternalPlaybackActive, options: [.new]) { [weak self] player, _ in
            let active = player.isExternalPlaybackActive
            Task { @MainActor [weak self] in
                self?.isCasting = active
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
                    self.errorText = failure ?? L.s("channel_error")
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
                self.errorText = reason ?? L.s("channel_error")
            }
        }

        if let stallObserver = stallObserver { NotificationCenter.default.removeObserver(stallObserver) }
        stallObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemPlaybackStalled,
            object: item,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self = self, self.preloadedID == nil else { return }
                self.isBuffering = true
                self.recoverFromStall()
            }
        }
    }

    /// مع إيقاف الانتظار التلقائي قد يبقى المشغّل ساكناً بعد تقطّع، فندفعه
    /// دفعة واحدة حين تعود البيانات بدل أن تبقى الصورة مجمّدة.
    private func recoverFromStall() {
        Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            guard let self = self, self.isPlaying == false, self.errorText == nil else { return }
            guard self.player.currentItem != nil, self.preloadedID == nil else { return }
            self.player.play()
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
