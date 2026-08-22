package com.koratime.channels

import android.content.Context
import androidx.annotation.OptIn
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import com.koratime.core.Http
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
                        name = name ?: "قناة ${channels.size + 1}",
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

    // البثّ الحيّ لا يحتمل مخزوناً كبيراً قبل البدء: نصف ثانية تكفي لتظهر
    // الصورة، و prioritizeTimeOverSizeThresholds يجعل المشغّل يقرّر بالزمن
    // المتوفّر لا بحجم البايتات — وهو الفارق المحسوس في لحظة فتح القناة.
    // لا نلمس هدف التأخّر عن حافة البثّ: تقريبه يسرّع البدء لكنه يزيد
    // التقطّع، وهما شكوى واحدة لا يصلح أن نداوي إحداهما بالأخرى.
    private val loadControl = DefaultLoadControl.Builder()
        .setBufferDurationsMs(10_000, 30_000, 500, 1_500)
        .setPrioritizeTimeOverSizeThresholds(true)
        .build()

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
            .setMediaSourceFactory(DefaultMediaSourceFactory(httpFactory))
            .setLoadControl(loadControl)
            .build()
            .apply {
                playWhenReady = true
                addListener(playerListener)
            }
    }

    val player: ExoPlayer by lazyPlayer

    private var retryJob: Job? = null
    private var retries = 0

    /** البثّ الحيّ يتعثّر كثيراً، فنحاول بصمت قبل إزعاج المستخدم برسالة. */
    private fun recover(error: PlaybackException) {
        if (error.errorCode == PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW) {
            player.seekToDefaultPosition()
            player.prepare()
            return
        }
        if (retries >= MAX_RETRIES) {
            isBuffering = false
            errorText = "تعذّر تشغيل هذه القناة. قد تكون محجوبة أو متوقّفة."
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
        isBuffering = true
        httpFactory.setUserAgent(channel.userAgent ?: DEFAULT_USER_AGENT)
        httpFactory.setDefaultRequestProperties(channel.headers)
        player.setMediaItem(MediaItem.fromUri(channel.url))
        player.prepare()
        player.play()
    }

    fun retryCurrent() {
        current?.let { play(it) }
    }

    override fun onCleared() {
        retryJob?.cancel()
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
                errors += "تعذّرت قراءة القنوات المرفقة: ${error.message}"
            }

            for (source in settings.playlists) {
                try {
                    val body = Http.text(source, maxAgeSeconds = 1800)
                    val parsed = parsePlaylist(body, source)
                    if (parsed.isEmpty()) {
                        errors += "«$source»: لم يُعثر على قنوات."
                    } else {
                        collected += parsed
                    }
                } catch (error: Exception) {
                    errors += "«$source»: ${error.message}"
                }
            }

            channels = collected.distinctBy { it.id }.filter { it.isPlayable }
            loadErrors = errors
            isLoading = false

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
                        name = field("name") ?: "قناة",
                        group = field("group") ?: "قنواتي",
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
        val label = source.substringAfterLast('/').substringBefore('?').ifBlank { "قائمتي" }
        return M3UParser.parse(body, label).filter { it.isPlayable }
    }

    fun invalidate() {
        loaded = false
    }
}
