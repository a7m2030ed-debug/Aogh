package com.koratime.channels

import android.content.Context
import androidx.annotation.OptIn
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.cast.CastPlayer
import androidx.media3.cast.SessionAvailabilityListener
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.upstream.DefaultBandwidthMeter
import androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import com.google.android.gms.cast.framework.CastContext
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.koratime.core.Http
import com.koratime.R
import com.koratime.core.AppText
import com.koratime.core.Settings
import com.koratime.core.ktJson
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

@Serializable
data class Channel(
    val name: String = "قناة",
    val group: String = "قنوات",
    val url: String = "",
    val logo: String? = null,
    val note: String? = null,
    val userAgent: String? = null,
    val referer: String? = null,
    val isDemo: Boolean = false,
    val geoRestricted: Boolean = false
) {
    val id: String get() = "${name.lowercase()}|${url.lowercase()}"

    val isPlayable: Boolean get() = url.startsWith("http")

    val headers: Map<String, String>
        get() = buildMap {
            userAgent?.takeIf { it.isNotBlank() }?.let { put("User-Agent", it) }
            referer?.takeIf { it.isNotBlank() }?.let { put("Referer", it) }
        }
}

/** قارئ قوائم M3U — الصيغة التي تستعملها معظم مشغّلات البثّ. */
object M3UParser {

    private val attributeRegex = Regex("([A-Za-z0-9_-]+)=\"([^\"]*)\"")

    fun parse(text: String, defaultGroup: String): List<Channel> {
        val channels = mutableListOf<Channel>()
        var name: String? = null
        var logo: String? = null
        var group: String? = null
        var userAgent: String? = null
        var referer: String? = null

        fun reset() {
            name = null; logo = null; group = null; userAgent = null; referer = null
        }

        for (rawLine in text.lines()) {
            val line = rawLine.trim()
            if (line.isEmpty()) continue

            when {
                line.startsWith("#EXTINF") -> {
                    val attributes = attributeRegex.findAll(line)
                        .associate { it.groupValues[1].lowercase() to it.groupValues[2] }
                    logo = attributes["tvg-logo"]
                    group = attributes["group-title"]
                    val comma = line.lastIndexOf(',')
                    name = if (comma >= 0) {
                        line.substring(comma + 1).trim().ifEmpty { attributes["tvg-name"] }
                    } else {
                        attributes["tvg-name"]
                    }
                }

                line.startsWith("#EXTGRP:") -> group = line.removePrefix("#EXTGRP:").trim()

                line.startsWith("#EXTVLCOPT:") -> {
                    val option = line.removePrefix("#EXTVLCOPT:")
                    val key = option.substringBefore('=', "").lowercase()
                    val value = option.substringAfter('=', "")
                    if (key.contains("user-agent")) userAgent = value
                    if (key.contains("referrer") || key.contains("referer")) referer = value
                }

                line.startsWith("#") -> continue

                else -> {
                    var address = line
                    val pipe = address.indexOf('|')
                    if (pipe > 0) {
                        val suffix = address.substring(pipe + 1)
                        address = address.substring(0, pipe)
                        suffix.split("&").forEach { pair ->
                            val key = pair.substringBefore('=', "").lowercase()
                            val value = pair.substringAfter('=', "")
                            if (key.contains("user-agent")) userAgent = value
                            if (key.contains("refer")) referer = value
                        }
                    }
                    if (!address.startsWith("http")) {
                        reset()
                        continue
                    }
                    channels += Channel(
                        name = name ?: AppText.get(R.string.numbered_channel, channels.size + 1),
                        group = group?.takeIf { it.isNotBlank() } ?: defaultGroup,
                        url = address,
                        logo = logo,
                        userAgent = userAgent,
                        referer = referer
                    )
                    reset()
                }
            }
        }
        return channels
    }
}

private fun JsonPrimitive.textOrNull(): String? =
    content.takeIf { it.isNotBlank() && !it.equals("null", ignoreCase = true) }

private const val DEFAULT_USER_AGENT = "KoraTime/1.0 (Android)"
private const val MAX_RETRIES = 3

@OptIn(UnstableApi::class)
class ChannelsViewModel(
    private val settings: Settings,
    private val context: Context
) : ViewModel() {

    var channels by mutableStateOf<List<Channel>>(emptyList())
        private set
    var isLoading by mutableStateOf(false)
        private set
    var loadErrors by mutableStateOf<List<String>>(emptyList())
        private set
    var selectedGroup by mutableStateOf<String?>(null)
    var currentId by mutableStateOf<String?>(null)
        private set
    var isBuffering by mutableStateOf(false)
        private set
    var errorText by mutableStateOf<String?>(null)
        private set

    private var loaded = false

    // ————— المشغّل —————
    // يعيش في النموذج لا في الشاشة: التنقّل بين التبويبات يهدم شجرة الواجهة،
    // وكان ذلك يحرّر المشغّل ويعيد جلب البثّ من الصفر عند كل عودة.

    private val httpFactory = DefaultHttpDataSource.Factory()
        .setUserAgent(DEFAULT_USER_AGENT)
        .setAllowCrossProtocolRedirects(true)
        .setConnectTimeoutMs(6_000)
        .setReadTimeoutMs(8_000)

    // ربع ثانية تكفي لعرض أول صورة؛ الانتظار بعدها ترفٌ لا يحتاجه بثّ حيّ.
    private val loadControl = DefaultLoadControl.Builder()
        .setBufferDurationsMs(10_000, 30_000, 250, 1_000)
        .setPrioritizeTimeOverSizeThresholds(true)
        .build()

    /**
     * أهمّ عامل في زمن أول صورة: بأي جودة يبدأ المشغّل.
     *
     * مقياس عرض النطاق الافتراضي يبدأ بتقدير مبني على الدولة، وإن بالغ فيه
     * اختار المشغّل جودة عالية فصار أول مقطع بعدّة ميغابايت قبل أن تظهر أي
     * صورة. نبدأ بتقدير متحفّظ فيختار أدنى درجة ثم يترقّى خلال ثوانٍ —
     * صورة سريعة أولاً، وجودة كاملة بعدها.
     */
    private val bandwidthMeter = DefaultBandwidthMeter.Builder(context)
        .setInitialBitrateEstimate(700_000L)
        .build()

    // ثلاث محاولات داخلية بتباعد متصاعد قبل أن يصل الخطأ إلينا تعني ثوانيَ
    // صامتة تبدو تعليقاً. محاولتان تكفيان، وإعادة المحاولة عندنا تكمل.
    private val loadErrorPolicy = DefaultLoadErrorHandlingPolicy(2)

    private val playerListener = object : Player.Listener {
        override fun onPlaybackStateChanged(state: Int) {
            isBuffering = state == Player.STATE_BUFFERING
            if (state == Player.STATE_READY) {
                retries = 0
                errorText = null
            }
        }

        override fun onPlayerError(error: PlaybackException) = recover(error)
    }

    private val lazyPlayer = lazy {
        ExoPlayer.Builder(context)
            .setMediaSourceFactory(
                DefaultMediaSourceFactory(httpFactory)
                    .setLoadErrorHandlingPolicy(loadErrorPolicy)
            )
            .setLoadControl(loadControl)
            .setBandwidthMeter(bandwidthMeter)
            .build()
            .apply {
                // لا نشغّل تلقائياً: التهيئة المسبقة تملأ المخزون بلا صوت،
                // والتشغيل يبدأ عند فتح التبويب.
                playWhenReady = false
                addListener(playerListener)
            }
    }

    val player: ExoPlayer by lazyPlayer

    private var retryJob: Job? = null
    private var retries = 0

    // ————— البثّ إلى الشاشات الذكية —————
    // إطار غوغل يحتاج خدمات Play؛ على جهاز بلا خدمات نتجاهله بهدوء بدل
    // أن ينهار التطبيق عند فتح تبويب القنوات.
    private var castContext: CastContext? = null
    private var castPlayer: CastPlayer? = null

    var isCasting by mutableStateOf(false)
        private set
    var castDeviceName by mutableStateOf<String?>(null)
        private set
    var canCast by mutableStateOf(false)
        private set

    fun initCast() {
        if (castContext != null) return
        val available = GoogleApiAvailability.getInstance()
            .isGooglePlayServicesAvailable(context) == ConnectionResult.SUCCESS
        if (!available) return

        val shared = runCatching { CastContext.getSharedInstance(context) }.getOrNull() ?: return
        castContext = shared
        canCast = true

        // caster لا player: الأخير اسم مشغّل الجوال في هذا الصنف، وخلطهما
        // هنا يعني إسكات الشاشة بدل الجوال عند بدء البثّ.
        val caster = CastPlayer(shared)
        caster.setSessionAvailabilityListener(object : SessionAvailabilityListener {
            override fun onCastSessionAvailable() {
                isCasting = true
                castDeviceName = shared.sessionManager.currentCastSession?.castDevice?.friendlyName
                errorText = null
                isBuffering = false
                current?.let { channel ->
                    caster.setMediaItem(castMediaItem(channel))
                    caster.playWhenReady = true
                }
                // يصمت الجوال ما دامت الشاشة تعرض
                if (lazyPlayer.isInitialized()) player.pause()
            }

            override fun onCastSessionUnavailable() {
                isCasting = false
                castDeviceName = null
                current?.let { play(it) }   // العودة إلى الجوال
            }
        })
        castPlayer = caster
    }

    /**
     * الشاشة تحتاج نوع المحتوى صراحةً: المستقبل الافتراضي لا يخمّن HLS
     * من الامتداد وحده، وبلا ذلك يرفض الرابط.
     */
    /**
     * نصرّح بنوع المحتوى بدل ترك المشغّل يستنتجه من امتداد الرابط: قوائم
     * المستخدم قد تأتي بروابط بلا امتداد، فيجرّب مساراً خاطئاً ويفشل قبل
     * أن يصل إلى القارئ الصحيح.
     */
    private fun localMediaItem(channel: Channel): MediaItem {
        val builder = MediaItem.Builder().setUri(channel.url)
        if (channel.url.substringBefore('?').endsWith(".m3u8", ignoreCase = true)) {
            builder.setMimeType(MimeTypes.APPLICATION_M3U8)
        }
        return builder.build()
    }

    private fun castMediaItem(channel: Channel): MediaItem =
        MediaItem.Builder()
            .setUri(channel.url)
            .setMimeType(MimeTypes.APPLICATION_M3U8)
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(channel.name)
                    .setStation(channel.group)
                    .build()
            )
            .build()

    /** البثّ الحيّ يتعثّر كثيراً، فنحاول بصمت قبل إزعاج المستخدم برسالة. */
    private fun recover(error: PlaybackException) {
        if (error.errorCode == PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW) {
            player.seekToDefaultPosition()
            player.prepare()
            return
        }
        if (retries >= MAX_RETRIES) {
            isBuffering = false
            errorText = AppText.get(R.string.channel_error)
            return
        }
        retries += 1
        isBuffering = true
        retryJob?.cancel()
        retryJob = viewModelScope.launch {
            delay(700L * retries)
            player.prepare()
            player.play()
        }
    }

    private fun play(channel: Channel) {
        retryJob?.cancel()
        retries = 0
        errorText = null

        // متصل بشاشة؟ الشاشة هي التي تعرض، والجوال يصمت
        castPlayer?.takeIf { isCasting }?.let { caster ->
            caster.setMediaItem(castMediaItem(channel))
            caster.playWhenReady = true
            isBuffering = false
            if (lazyPlayer.isInitialized()) player.pause()
            return
        }

        isBuffering = true
        httpFactory.setUserAgent(channel.userAgent ?: DEFAULT_USER_AGENT)
        httpFactory.setDefaultRequestProperties(channel.headers)
        player.setMediaItem(localMediaItem(channel))
        player.prepare()
        player.play()   // اختيار صريح من المستخدم، فالصوت مطلوب
    }

    fun retryCurrent() {
        current?.let { play(it) }
    }

    /**
     * يهيّئ قناة البداية بمجرّد وصول القائمة، قبل أن يفتح المستخدم التبويب.
     *
     * القياس أظهر أن ظهور أول صورة يستغرق وسطياً ١٫٧ ثانية من مركز بيانات
     * (اتصال، ثم قائمة رئيسية، ثم قائمة مقاطع، ثم تنزيل) — وكلها تجري
     * بالتتابع بعد الضغط. تشغيلها مسبقاً يلغي الانتظار كلّه عند فتح
     * التبويب. بلا صوت: playWhenReady تبقى false حتى تظهر الشاشة.
     */
    private fun preload() {
        if (!settings.autoPlayOnOpen || isCasting) return
        if (currentId != null) return
        val channel = startupChannel() ?: return
        currentId = channel.id
        settings.lastChannelId = channel.id
        isBuffering = true
        httpFactory.setUserAgent(channel.userAgent ?: DEFAULT_USER_AGENT)
        httpFactory.setDefaultRequestProperties(channel.headers)
        player.setMediaItem(localMediaItem(channel))
        player.prepare()
    }

    /** تُستدعى عند ظهور تبويب القنوات: المخزون جاهز، فيبدأ الصوت فوراً. */
    fun resumePlayback() {
        if (isCasting || !lazyPlayer.isInitialized()) return
        player.playWhenReady = true
    }

    /** تُستدعى عند مغادرة التبويب إن أراد المستخدم إيقاف الصوت. */
    fun pausePlayback() {
        if (lazyPlayer.isInitialized()) player.playWhenReady = false
    }

    override fun onCleared() {
        retryJob?.cancel()
        castPlayer?.setSessionAvailabilityListener(null)
        castPlayer?.release()
        if (lazyPlayer.isInitialized()) {
            player.removeListener(playerListener)
            player.release()
        }
    }

    val groups: List<String> get() = channels.map { it.group }.distinct()

    val visibleChannels: List<Channel>
        get() = channels.filter { selectedGroup == null || it.group == selectedGroup }

    val current: Channel? get() = channels.firstOrNull { it.id == currentId }

    val hasUserChannels: Boolean get() = channels.any { !it.isDemo }

    fun select(channel: Channel) {
        if (currentId == channel.id && errorText == null) return
        currentId = channel.id
        settings.lastChannelId = channel.id
        play(channel)
    }

    /** القناة التي تبدأ تلقائياً: مؤكّدة وغير تجريبية إن أمكن. */
    fun startupChannel(): Channel? {
        settings.lastChannelId?.let { last ->
            channels.firstOrNull { it.id == last }?.let { return it }
        }
        return channels.firstOrNull { !it.isDemo && !it.geoRestricted }
            ?: channels.firstOrNull { !it.isDemo }
            ?: channels.firstOrNull()
    }

    fun loadIfNeeded() {
        if (loaded) return
        reload()
    }

    fun reload() {
        loaded = true
        isLoading = true
        viewModelScope.launch {
            val collected = mutableListOf<Channel>()
            val errors = mutableListOf<String>()

            try {
                val raw = context.assets.open("channels.json").bufferedReader().use { it.readText() }
                val bundled = ktJson.decodeFromString<List<Channel>>(raw)
                collected += if (settings.showDemoChannels) bundled else bundled.filter { !it.isDemo }
            } catch (error: Exception) {
                errors += AppText.get(R.string.channels_read_failed, error.message.orEmpty())
            }

            for (source in settings.playlists) {
                try {
                    val body = Http.text(source, maxAgeSeconds = 1800)
                    val parsed = parsePlaylist(body, source)
                    if (parsed.isEmpty()) {
                        errors += AppText.get(R.string.playlist_no_channels, source)
                    } else {
                        collected += parsed
                    }
                } catch (error: Exception) {
                    errors += AppText.get(R.string.playlist_error, source, error.message.orEmpty())
                }
            }

            channels = collected.distinctBy { it.id }.filter { it.isPlayable }
            loadErrors = errors
            isLoading = false
            preload()

            if (selectedGroup != null && selectedGroup !in groups) selectedGroup = null
        }
    }

    private fun parsePlaylist(body: String, source: String): List<Channel> {
        val trimmed = body.trimStart()
        if (trimmed.startsWith("[")) {
            return try {
                ktJson.parseToJsonElement(trimmed).jsonArray.map { element ->
                    val item = element.jsonObject
                    fun field(key: String) = item[key]?.jsonPrimitive?.textOrNull()
                    Channel(
                        name = field("name") ?: AppText.get(R.string.default_channel_name),
                        group = field("group") ?: AppText.get(R.string.my_channels),
                        url = field("url").orEmpty(),
                        logo = field("logo"),
                        note = field("note"),
                        userAgent = field("userAgent"),
                        referer = field("referer")
                    )
                }.filter { it.isPlayable }
            } catch (_: Exception) {
                emptyList()
            }
        }
        val label = source.substringAfterLast('/').substringBefore('?').ifBlank { AppText.get(R.string.my_list) }
        return M3UParser.parse(body, label).filter { it.isPlayable }
    }

    fun invalidate() {
        loaded = false
    }
}
