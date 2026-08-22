package com.koratime.news

import android.util.Xml
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.koratime.core.Http
import com.koratime.core.KTDate
import com.koratime.core.Settings
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.xmlpull.v1.XmlPullParser
import java.io.StringReader
import java.util.Date
import java.util.Locale

data class NewsItem(
    val id: String,
    val title: String,
    val summary: String,
    val link: String?,
    val imageUrl: String?,
    val source: String,
    val date: Date?
) {
    val relativeDate: String get() = date?.let { KTDate.ago(it) }.orEmpty()
}

/** تنظيف نصوص HTML القادمة داخل الخلاصات. */
object HtmlText {

    private val tagRegex = Regex("<[^>]+>")
    private val imageRegex = Regex("<img[^>]+src=[\"']([^\"']+)[\"']", RegexOption.IGNORE_CASE)
    private val entities = mapOf(
        "&nbsp;" to " ", "&amp;" to "&", "&quot;" to "\"", "&#39;" to "'",
        "&lt;" to "<", "&gt;" to ">", "&laquo;" to "«", "&raquo;" to "»", "&hellip;" to "…"
    )

    fun plain(html: String): String {
        if (html.isBlank()) return ""
        var text = tagRegex.replace(html, " ")
        entities.forEach { (entity, replacement) -> text = text.replace(entity, replacement) }
        return text.split(Regex("\\s+")).filter { it.isNotBlank() }.joinToString(" ")
    }

    fun firstImage(html: String): String? =
        imageRegex.find(html)?.groupValues?.getOrNull(1)

    /** عناوين أخبار Google تأتي بصيغة "العنوان - اسم الموقع". */
    fun splitSource(title: String): Pair<String, String?> {
        val index = title.lastIndexOf(" - ")
        if (index <= 0) return title to null
        val head = title.substring(0, index).trim()
        val tail = title.substring(index + 3).trim()
        if (head.isEmpty() || tail.isEmpty() || tail.length > 40) return title to null
        return head to tail
    }
}

/** قارئ RSS 2.0 و Atom بمحلّل XML المدمج في أندرويد. */
object FeedParser {

    fun parse(xml: String, fallbackSource: String): List<NewsItem> {
        val items = mutableListOf<NewsItem>()
        try {
            val parser = Xml.newPullParser()
            parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, false)
            parser.setInput(StringReader(xml))

            var insideItem = false
            var channelTitle = ""
            var title = ""
            var link = ""
            var summary = ""
            var content = ""
            var dateText = ""
            var image = ""
            var source = ""
            var guid = ""
            var buffer = StringBuilder()

            fun resetItem() {
                title = ""; link = ""; summary = ""; content = ""
                dateText = ""; image = ""; source = ""; guid = ""
            }

            var event = parser.eventType
            while (event != XmlPullParser.END_DOCUMENT) {
                when (event) {
                    XmlPullParser.START_TAG -> {
                        val name = parser.name.lowercase(Locale.US)
                        buffer = StringBuilder()

                        if (name == "item" || name == "entry") {
                            insideItem = true
                            resetItem()
                        } else if (insideItem) {
                            when (name) {
                                "link" -> {
                                    val href = parser.getAttributeValue(null, "href")
                                    if (!href.isNullOrBlank() && link.isEmpty()) link = href
                                }
                                "enclosure", "media:content", "media:thumbnail", "itunes:image" -> {
                                    val url = parser.getAttributeValue(null, "url")
                                        ?: parser.getAttributeValue(null, "href")
                                    val type = parser.getAttributeValue(null, "type").orEmpty()
                                    if (!url.isNullOrBlank() && image.isEmpty() &&
                                        (type.isEmpty() || type.startsWith("image"))
                                    ) {
                                        image = url
                                    }
                                }
                            }
                        }
                    }

                    XmlPullParser.TEXT, XmlPullParser.CDSECT -> buffer.append(parser.text.orEmpty())

                    XmlPullParser.END_TAG -> {
                        val name = parser.name.lowercase(Locale.US)
                        val text = buffer.toString().trim()
                        buffer = StringBuilder()

                        if (name == "item" || name == "entry") {
                            insideItem = false
                            build(title, link, summary, content, dateText, image, source, guid,
                                channelTitle, fallbackSource)?.let { items += it }
                            resetItem()
                        } else if (!insideItem) {
                            if (name == "title" && channelTitle.isEmpty()) channelTitle = text
                        } else {
                            when (name) {
                                "title" -> if (title.isEmpty()) title = text
                                "link" -> if (link.isEmpty() && text.isNotEmpty()) link = text
                                "guid", "id" -> if (guid.isEmpty()) guid = text
                                "description", "summary" -> if (summary.isEmpty()) summary = text
                                "content:encoded", "content" -> if (content.isEmpty()) content = text
                                "pubdate", "published", "updated", "dc:date" ->
                                    if (dateText.isEmpty()) dateText = text
                                "source", "dc:creator" -> if (source.isEmpty()) source = text
                            }
                        }
                    }
                }
                event = parser.next()
            }
        } catch (_: Exception) {
            // خلاصة تالفة لا تُسقط بقية المصادر
        }
        return items
    }

    private fun build(
        title: String, link: String, summary: String, content: String,
        dateText: String, image: String, source: String, guid: String,
        channelTitle: String, fallbackSource: String
    ): NewsItem? {
        val cleanTitle = HtmlText.plain(title)
        if (cleanTitle.isBlank()) return null

        val body = summary.ifBlank { content }
        val picture = image.ifBlank {
            HtmlText.firstImage(content.ifBlank { summary }).orEmpty()
        }

        return NewsItem(
            id = guid.ifBlank { link.ifBlank { cleanTitle } },
            title = cleanTitle,
            summary = HtmlText.plain(body),
            link = link.trim().takeIf { it.startsWith("http") },
            imageUrl = picture.takeIf { it.startsWith("http") },
            source = source.ifBlank { channelTitle.ifBlank { fallbackSource } },
            date = KTDate.parseFeedDate(dateText)
        )
    }
}

class NewsViewModel(private val settings: Settings) : ViewModel() {

    var items by mutableStateOf<List<NewsItem>>(emptyList())
        private set
    var isLoading by mutableStateOf(false)
        private set
    var errors by mutableStateOf<List<String>>(emptyList())
        private set
    var searchQuery by mutableStateOf("")
        private set
    var lastUpdated by mutableStateOf<Date?>(null)
        private set

    private var loaded = false

    val isSearching: Boolean get() = searchQuery.isNotBlank()

    fun loadIfNeeded() {
        if (loaded) return
        reload()
    }

    fun search(query: String) {
        searchQuery = query.trim()
        loaded = false
        reload()
    }

    fun clearSearch() {
        searchQuery = ""
        loaded = false
        reload()
    }

    fun invalidate() {
        loaded = false
    }

    fun reload() {
        loaded = true
        isLoading = true
        viewModelScope.launch {
            val sources = if (isSearching) {
                listOf(Settings.googleNews(searchQuery))
            } else {
                settings.feeds
            }

            if (sources.isEmpty()) {
                items = emptyList()
                errors = listOf("لم تُفعّل أي خلاصة أخبار.")
                isLoading = false
                return@launch
            }

            // كل خلاصة تُعيد نتيجتها وخطأها معاً بدل الكتابة في قائمة مشتركة
            val outcomes = coroutineScope {
                sources.map { source ->
                    async(Dispatchers.IO) {
                        val label = source.substringAfter("//").substringBefore('/')
                        try {
                            FeedParser.parse(Http.text(source, maxAgeSeconds = 300), label) to null
                        } catch (error: Exception) {
                            emptyList<NewsItem>() to "«$label»: ${error.message}"
                        }
                    }
                }.awaitAll()
            }

            val collected = outcomes.flatMap { it.first }
            val failures = outcomes.mapNotNull { it.second }

            items = withContext(Dispatchers.Default) { merge(collected) }
            errors = if (items.isEmpty()) failures else emptyList()
            lastUpdated = Date()
            isLoading = false
        }
    }

    private fun merge(input: List<NewsItem>): List<NewsItem> {
        val seen = HashSet<String>()
        val result = mutableListOf<NewsItem>()

        for (item in input) {
            val (title, source) = HtmlText.splitSource(item.title)
            val cleaned = item.copy(title = title, source = source ?: item.source)
            val fingerprint = cleaned.title.lowercase(Locale.US)
                .filter { it.isLetterOrDigit() || it == ' ' }
                .take(70)
            if (!seen.add(fingerprint)) continue
            result += cleaned
        }

        return result.sortedByDescending { it.date?.time ?: 0L }.take(150)
    }
}
