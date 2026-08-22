package com.koratime.news

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.koratime.core.KTDate
import com.koratime.matches.Chip
import com.koratime.ui.KT
import com.koratime.ui.KTCard
import com.koratime.ui.KTMessage
import com.koratime.ui.SectionTitle

private val topics = listOf(
    "كرة القدم", "دوري روشن السعودي", "دوري أبطال أوروبا",
    "الهلال", "النصر", "الاتحاد", "الأهلي", "المنتخب السعودي", "انتقالات"
)

@Composable
fun NewsScreen(model: NewsViewModel) {
    val context = LocalContext.current

    LaunchedEffect(Unit) { model.loadIfNeeded() }

    Column(modifier = Modifier.fillMaxWidth()) {
        SectionTitle(
            title = "الأخبار",
            subtitle = when {
                model.isSearching -> "نتائج البحث عن «${model.searchQuery}»"
                model.lastUpdated != null -> "آخر تحديث ${KTDate.time(model.lastUpdated!!)}"
                else -> "من الخلاصات التي تتابعها"
            },
            trailing = {
                IconButton(onClick = { model.reload() }) {
                    Icon(Icons.Filled.Refresh, contentDescription = "تحديث", tint = KT.textSecondary)
                }
            }
        )

        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.height(44.dp)
        ) {
            item {
                Chip("متابعاتي", !model.isSearching) { model.clearSearch() }
            }
            items(topics) { topic ->
                Chip(topic, model.searchQuery == topic) { model.search(topic) }
            }
        }

        when {
            model.isLoading && model.items.isEmpty() -> Box(
                modifier = Modifier.fillMaxWidth().padding(vertical = 48.dp),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(color = KT.accent)
            }

            model.items.isEmpty() -> KTMessage(
                title = "لا توجد أخبار",
                message = model.errors.firstOrNull() ?: "جرّب موضوعاً آخر.",
                actionLabel = "إعادة المحاولة",
                onAction = { model.reload() }
            )

            else -> LazyColumn(
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                items(model.items, key = { it.id }) { item ->
                    NewsCard(item) {
                        item.link?.let { link ->
                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(link)))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun NewsCard(item: NewsItem, onClick: () -> Unit) {
    KTCard(modifier = Modifier.fillMaxWidth().clickable { onClick() }) {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    item.title,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = KT.text,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis
                )
                Row(
                    modifier = Modifier.padding(top = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Text(
                        item.source,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = KT.accent,
                        maxLines = 1
                    )
                    if (item.date != null) {
                        Box(
                            modifier = Modifier.size(3.dp).clip(CircleShape).background(KT.textFaint)
                        )
                        Text(item.relativeDate, fontSize = 10.sp, color = KT.textFaint, maxLines = 1)
                    }
                }
            }

            if (item.imageUrl != null) {
                AsyncImage(
                    model = item.imageUrl,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .size(width = 84.dp, height = 64.dp)
                        .clip(RoundedCornerShape(12.dp))
                )
            }
        }
    }
}
