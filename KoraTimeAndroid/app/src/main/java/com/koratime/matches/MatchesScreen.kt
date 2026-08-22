package com.koratime.matches

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.koratime.core.ArabicNames
import com.koratime.core.KTDate
import com.koratime.ui.KT
import com.koratime.ui.KTMessage
import com.koratime.ui.LiveBadge
import com.koratime.ui.SectionTitle
import java.util.Date

@Composable
fun MatchesScreen(
    model: MatchesViewModel,
    arabicNames: Boolean,
    onOpenMatch: (Match) -> Unit
) {
    LaunchedEffect(Unit) {
        model.loadIfNeeded()
        model.startLiveUpdates()
    }

    Column(modifier = Modifier.fillMaxWidth()) {
        SectionTitle(
            title = "المباريات",
            subtitle = when {
                model.liveCount > 0 -> "${model.liveCount} مباراة جارية الآن"
                model.lastUpdated != null -> "آخر تحديث ${KTDate.time(model.lastUpdated!!)}"
                else -> KTDate.dayLabel(model.selectedDay)
            },
            trailing = {
                IconButton(onClick = { model.refresh() }) {
                    Icon(Icons.Filled.Refresh, contentDescription = "تحديث", tint = KT.textSecondary)
                }
            }
        )

        DateStrip(
            days = model.days,
            selected = model.selectedDay,
            onSelect = { model.select(it) }
        )

        FilterRow(
            liveOnly = model.liveOnly,
            dayLabel = KTDate.dayLabel(model.selectedDay),
            onSelect = { model.liveOnly = it }
        )

        val sections = model.sections
        when {
            model.isLoading && sections.isEmpty() -> Box(
                modifier = Modifier.fillMaxWidth().padding(vertical = 48.dp),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(color = KT.accent)
            }

            model.errorMessage != null && sections.isEmpty() -> KTMessage(
                title = "تعذّر جلب المباريات",
                message = model.errorMessage,
                actionLabel = "إعادة المحاولة",
                onAction = { model.refresh() }
            )

            sections.isEmpty() -> KTMessage(
                title = if (model.liveOnly) "لا توجد مباريات جارية" else "لا مباريات في هذا اليوم",
                message = if (model.liveOnly) "جرّب «الكل» لعرض مباريات اليوم كاملة."
                else "اختر يوماً آخر من الشريط أعلاه."
            )

            else -> LazyColumn(
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                sections.forEach { section ->
                    item(key = "header-${section.id}") {
                        CompetitionHeader(section)
                    }
                    items(section.matches, key = { it.id }) { match ->
                        MatchRow(
                            match = match,
                            arabicNames = arabicNames,
                            onClick = { onOpenMatch(match) }
                        )
                    }
                }
                item {
                    Text(
                        model.attribution,
                        fontSize = 10.sp,
                        color = KT.textFaint,
                        modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
                        textAlign = TextAlign.Center
                    )
                }
            }
        }
    }
}

@Composable
private fun CompetitionHeader(section: MatchSection) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        if (section.badge != null) {
            AsyncImage(
                model = section.badge,
                contentDescription = null,
                modifier = Modifier.size(22.dp)
            )
        }
        Text(
            section.title,
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold,
            color = KT.text,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f)
        )
        if (section.liveCount > 0) {
            Text("${section.liveCount} مباشر", fontSize = 11.sp, color = KT.live)
        }
    }
}

@Composable
private fun DateStrip(days: List<Date>, selected: Date, onSelect: (Date) -> Unit) {
    val state = rememberLazyListState()
    val todayIndex = days.indexOfFirst { KTDate.isSameDay(it, Date()) }

    LaunchedEffect(Unit) {
        if (todayIndex > 1) state.scrollToItem(todayIndex - 1)
    }

    LazyRow(
        state = state,
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.height(64.dp)
    ) {
        items(days, key = { it.time }) { day ->
            val isSelected = KTDate.isSameDay(day, selected)
            Column(
                modifier = Modifier
                    .width(58.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(if (isSelected) KT.accent.copy(alpha = 0.20f) else KT.card)
                    .border(
                        width = if (isSelected) 1.5.dp else 1.dp,
                        color = if (isSelected) KT.accent else KT.hairline,
                        shape = RoundedCornerShape(14.dp)
                    )
                    .clickable { onSelect(day) }
                    .padding(vertical = 6.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    KTDate.dayLabel(day).let { if (it.length > 6) KTDate.shortWeekday(day) else it },
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = if (isSelected) KT.accent else KT.textSecondary,
                    maxLines = 1
                )
                Text(
                    KTDate.dayNumber(day),
                    fontSize = 17.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = if (isSelected) KT.accent else KT.textSecondary
                )
                Text(
                    KTDate.shortMonth(day),
                    fontSize = 9.sp,
                    color = if (isSelected) KT.accent else KT.textFaint,
                    maxLines = 1
                )
            }
        }
    }
}

@Composable
private fun FilterRow(liveOnly: Boolean, dayLabel: String, onSelect: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Chip("الكل", !liveOnly) { onSelect(false) }
        Chip("المباشرة", liveOnly) { onSelect(true) }
        Box(modifier = Modifier.weight(1f))
        Text(dayLabel, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = KT.textFaint)
    }
}

@Composable
fun Chip(label: String, selected: Boolean, onClick: () -> Unit) {
    Text(
        label,
        fontSize = 13.sp,
        fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
        color = if (selected) KT.accent else KT.textSecondary,
        maxLines = 1,
        modifier = Modifier
            .clip(CircleShape)
            .background(if (selected) KT.accent.copy(alpha = 0.18f) else KT.card)
            .border(1.dp, if (selected) KT.accent.copy(alpha = 0.65f) else KT.hairline, CircleShape)
            .clickable { onClick() }
            .padding(horizontal = 13.dp, vertical = 7.dp)
    )
}

/** الفريق المضيف يميناً والضيف يساراً — الاتجاه يتكفّل به RTL. */
@Composable
fun MatchRow(match: Match, arabicNames: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(if (match.isLive) KT.cardHigh else KT.card)
            .border(
                1.dp,
                if (match.isLive) KT.live.copy(alpha = 0.35f) else KT.hairline,
                RoundedCornerShape(14.dp)
            )
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        TeamCell(
            name = match.homeTitle(arabicNames),
            rawName = match.homeName,
            badge = match.homeBadge,
            isHome = true,
            modifier = Modifier.weight(1f)
        )

        Column(
            modifier = Modifier.width(64.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(3.dp)
        ) {
            if (match.hasScore && match.status != MatchStatus.SCHEDULED) {
                Text(
                    "${match.homeScore} − ${match.awayScore}",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = if (match.isLive) KT.accent else KT.text
                )
            } else {
                Text(
                    match.kickoff?.let { KTDate.time(it) } ?: "—",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = KT.text
                )
            }

            if (match.isLive) {
                LiveBadge(text = match.progress ?: "مباشر", compact = true)
            } else {
                Text(
                    match.centerCaption,
                    fontSize = 10.sp,
                    color = when (match.status) {
                        MatchStatus.FINISHED -> KT.textFaint
                        MatchStatus.POSTPONED, MatchStatus.CANCELED -> KT.gold
                        else -> KT.textSecondary
                    },
                    maxLines = 1
                )
            }
        }

        TeamCell(
            name = match.awayTitle(arabicNames),
            rawName = match.awayName,
            badge = match.awayBadge,
            isHome = false,
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun TeamCell(
    name: String,
    rawName: String,
    badge: String?,
    isHome: Boolean,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = if (isHome) Arrangement.Start else Arrangement.End
    ) {
        if (isHome) {
            TeamName(name, Modifier.weight(1f, fill = false), TextAlign.Start)
            TeamBadge(rawName, badge)
        } else {
            TeamBadge(rawName, badge)
            TeamName(name, Modifier.weight(1f, fill = false), TextAlign.End)
        }
    }
}

@Composable
private fun TeamName(name: String, modifier: Modifier, align: TextAlign) {
    Text(
        name,
        fontSize = 13.sp,
        fontWeight = FontWeight.SemiBold,
        color = KT.text,
        maxLines = 2,
        overflow = TextOverflow.Ellipsis,
        textAlign = align,
        modifier = modifier.padding(horizontal = 6.dp)
    )
}

@Composable
fun TeamBadge(name: String, url: String?, size: Int = 34) {
    Box(
        modifier = Modifier
            .size(size.dp)
            .clip(CircleShape)
            .background(KT.cardHigh),
        contentAlignment = Alignment.Center
    ) {
        if (url != null) {
            AsyncImage(model = url, contentDescription = null, modifier = Modifier.size(size.dp))
        } else {
            Text(
                ArabicNames.monogram(name),
                fontSize = (size * 0.35).sp,
                fontWeight = FontWeight.Bold,
                color = KT.textSecondary,
                maxLines = 1
            )
        }
    }
}
