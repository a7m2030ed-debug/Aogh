package com.koratime.cast

import android.content.Context
import android.net.wifi.WifiManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.SocketTimeoutException
import java.net.URL

/**
 * البثّ إلى التلفزيونات عبر DLNA (UPnP AVTransport).
 *
 * زرّ Cast لا يرى إلا ما فيه Chromecast مدمج، بينما يوتيوب يجد التلفزيون
 * بطريقة أخرى — فيظهر التلفزيون هناك ويغيب عندنا. أغلب التلفزيونات الذكية
 * (TCL وسامسونج وإل جي وهايسنس…) فيها مستقبل DLNA يقبل رابط بثّ ويشغّله
 * بنفسه. نجده ببحث SSDP على الشبكة المحلية، ثم نرسل له الرابط بأوامر SOAP
 * المعيارية — بلا مكتبات وبلا شيء يُثبَّت على التلفزيون.
 */
object Dlna {

    data class Renderer(val name: String, val controlUrl: String)

    private const val SSDP_HOST = "239.255.255.250"
    private const val SSDP_PORT = 1900
    private const val AV_TRANSPORT = "urn:schemas-upnp-org:service:AVTransport:1"

    private val searchTargets = listOf(
        AV_TRANSPORT,
        "urn:schemas-upnp-org:device:MediaRenderer:1"
    )

    /** يبحث بضع ثوانٍ ويُرجع التلفزيونات التي تقبل التشغيل. */
    suspend fun discover(context: Context, timeoutMs: Long = 4_000): List<Renderer> =
        withContext(Dispatchers.IO) {
            val locations = searchLocations(context, timeoutMs)
            coroutineScope {
                locations.map { location -> async { describe(location) } }.awaitAll()
            }.filterNotNull().distinctBy { it.controlUrl }
        }

    private fun searchLocations(context: Context, timeoutMs: Long): Set<String> {
        // أندرويد يُسقط ردود البثّ المتعدّد لتوفير البطارية ما لم نطلب قفلاً
        val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
        val lock = wifi?.createMulticastLock("koratime-dlna")?.apply {
            setReferenceCounted(false)
            runCatching { acquire() }
        }
        val found = linkedSetOf<String>()
        val socket = DatagramSocket()
        try {
            socket.soTimeout = 500
            val group = InetAddress.getByName(SSDP_HOST)
            // الحزم قد تضيع في الواي فاي؛ نرسل كل طلب مرتين
            repeat(2) {
                for (target in searchTargets) {
                    val message = "M-SEARCH * HTTP/1.1\r\n" +
                        "HOST: $SSDP_HOST:$SSDP_PORT\r\n" +
                        "MAN: \"ssdp:discover\"\r\n" +
                        "MX: 2\r\n" +
                        "ST: $target\r\n\r\n"
                    val bytes = message.toByteArray()
                    socket.send(DatagramPacket(bytes, bytes.size, group, SSDP_PORT))
                }
            }

            val deadline = System.currentTimeMillis() + timeoutMs
            val buffer = ByteArray(2048)
            while (System.currentTimeMillis() < deadline) {
                val packet = DatagramPacket(buffer, buffer.size)
                try {
                    socket.receive(packet)
                } catch (_: SocketTimeoutException) {
                    continue
                }
                val reply = String(packet.data, 0, packet.length)
                reply.lineSequence()
                    .firstOrNull { it.startsWith("LOCATION:", ignoreCase = true) }
                    ?.substringAfter(':')?.trim()
                    ?.takeIf { it.startsWith("http") }
                    ?.let { found += it }
            }
        } catch (_: Exception) {
            // بلا واي فاي أو منع من النظام: نُرجع ما وجدناه
        } finally {
            socket.close()
            runCatching { lock?.release() }
        }
        return found
    }

    /** يقرأ وصف الجهاز ويستخرج اسمه وعنوان أوامر التشغيل فيه. */
    private fun describe(location: String): Renderer? = runCatching {
        val xml = httpGet(location)
        val service = Regex("<service>(.*?)</service>", RegexOption.DOT_MATCHES_ALL)
            .findAll(xml)
            .map { it.groupValues[1] }
            .firstOrNull { it.contains("AVTransport") }
            ?: return null
        val control = tag(service, "controlURL") ?: return null
        val base = tag(xml, "URLBase")?.takeIf { it.startsWith("http") } ?: location
        Renderer(
            name = tag(xml, "friendlyName")?.let(::unescape) ?: URL(location).host,
            controlUrl = URL(URL(base), control).toString()
        )
    }.getOrNull()

    /** يرسل الرابط للتلفزيون ويبدأ التشغيل. */
    suspend fun play(renderer: Renderer, url: String, title: String): Boolean =
        withContext(Dispatchers.IO) {
            // تلفزيونات كثيرة ترفض رابطاً جديداً وهي تعرض القديم
            runCatching { soap(renderer, "Stop", "<InstanceID>0</InstanceID>") }

            val metadata = "<DIDL-Lite xmlns=\"urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/\" " +
                "xmlns:dc=\"http://purl.org/dc/elements/1.1/\" " +
                "xmlns:upnp=\"urn:schemas-upnp-org:metadata-1-0/upnp/\">" +
                "<item id=\"0\" parentID=\"-1\" restricted=\"1\">" +
                "<dc:title>${escape(title)}</dc:title>" +
                "<upnp:class>object.item.videoItem.videoBroadcast</upnp:class>" +
                "<res protocolInfo=\"http-get:*:application/vnd.apple.mpegurl:*\">${escape(url)}</res>" +
                "</item></DIDL-Lite>"

            runCatching {
                soap(
                    renderer, "SetAVTransportURI",
                    "<InstanceID>0</InstanceID>" +
                        "<CurrentURI>${escape(url)}</CurrentURI>" +
                        "<CurrentURIMetaData>${escape(metadata)}</CurrentURIMetaData>"
                )
                soap(renderer, "Play", "<InstanceID>0</InstanceID><Speed>1</Speed>")
            }.isSuccess
        }

    private fun soap(renderer: Renderer, action: String, arguments: String) {
        val body = "<?xml version=\"1.0\" encoding=\"utf-8\"?>" +
            "<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" " +
            "s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\"><s:Body>" +
            "<u:$action xmlns:u=\"$AV_TRANSPORT\">$arguments</u:$action>" +
            "</s:Body></s:Envelope>"
        val connection = URL(renderer.controlUrl).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = 4_000
            connection.readTimeout = 6_000
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "text/xml; charset=\"utf-8\"")
            connection.setRequestProperty("SOAPACTION", "\"$AV_TRANSPORT#$action\"")
            connection.outputStream.use { it.write(body.toByteArray()) }
            val code = connection.responseCode
            if (code !in 200..299) error("$action HTTP $code")
        } finally {
            connection.disconnect()
        }
    }

    private fun httpGet(url: String): String {
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 3_000
            connection.readTimeout = 3_000
            return connection.inputStream.bufferedReader().use { it.readText() }
        } finally {
            connection.disconnect()
        }
    }

    private fun tag(xml: String, name: String): String? =
        Regex("<(?:\\w+:)?$name>\\s*(.*?)\\s*</(?:\\w+:)?$name>", RegexOption.DOT_MATCHES_ALL)
            .find(xml)?.groupValues?.get(1)

    private fun escape(text: String): String = text
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")

    private fun unescape(text: String): String = text
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&amp;", "&")
}
