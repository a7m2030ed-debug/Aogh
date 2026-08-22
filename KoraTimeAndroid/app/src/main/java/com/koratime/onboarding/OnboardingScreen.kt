package com.koratime.onboarding

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.toMutableStateList
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.koratime.core.Catalog
import com.koratime.core.Settings
import com.koratime.ui.KT

/**
 * أول تشغيل: يختار المستخدم دورياته ثم فرقه، فتُرتَّب المباريات وتُبنى
 * الأخبار عليها. الخطوتان تخطّيهما ممكن — من رفض الاختيار يحصل على
 * الترتيب الافتراضي لا على شاشة فارغة.
 */
@Composable
fun OnboardingScreen(settings: Settings, onDone: () -> Unit) {
    var step by remember { mutableStateOf(0) }
    val leagues = remember { settings.favoriteLeagues.toMutableStateList() }
    val teams = remember { settings.favoriteTeams.toMutableStateList() }

    fun finish() {
        settings.favoriteLeagues = leagues.toList()
        settings.favoriteTeams = teams.toList()
        settings.onboarded = true
        onDone()
    }

    Column(modifier = Modifier.fillMaxSize().background(KT.bg).padding(horizontal = 18.dp)) {
        Column(modifier = Modifier.padding(top = 34.dp, bottom = 14.dp)) {
            Text(
                if (step == 0) "أي الدوريات تتابع؟" else "أي الفرق تشجّع؟",
                fontSize = 22.sp,
                fontWeight = FontWeight.ExtraBold,
                color = KT.text
            )
            Text(
                if (step == 0) "نرتّب لك جدول المباريات ونجمع أخبارها."
                else "تظهر أخبار فرقك أولاً، ومبارياتها في صدر الجدول.",
                fontSize = 13.sp,
                color = KT.textSecondary,
                modifier = Modifier.padding(top = 6.dp)
            )
        }

        Box(modifier = Modifier.weight(1f)) {
            if (step == 0) {
                ChipGrid(
                    labels = Catalog.leagues.map { it.id to it.ar },
                    selected = leagues,
                    onToggle = { id ->
                        if (leagues.contains(id)) {
                            leagues.remove(id)
                            // إسقاط فرق دوري لم يعد مختاراً حتى لا تبقى معلّقة
                            Catalog.league(id)?.teams?.forEach { teams.remove(it.ar) }
                        } else {
                            leagues.add(id)
                        }
                    }
                )
            } else {
                val available = Catalog.teamsFor(leagues)
                if (available.isEmpty()) {
                    Text(
                        "الدوريات التي اخترتها بلا قائمة فرق هنا. تقدر تكمل.",
                        fontSize = 13.sp,
                        color = KT.textFaint,
                        modifier = Modifier.padding(top = 20.dp)
                    )
                } else {
                    ChipGrid(
                        labels = available.map { (_, team) -> team.ar to team.ar },
                        selected = teams,
                        onToggle = { name ->
                            if (teams.contains(name)) teams.remove(name) else teams.add(name)
                        }
                    )
                }
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                "تخطّي",
                fontSize = 14.sp,
                color = KT.textFaint,
                modifier = Modifier.clickable { finish() }.padding(10.dp)
            )
            Box(modifier = Modifier.weight(1f))
            Text(
                if (step == 0) "التالي" else "ابدأ",
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                color = KT.bg,
                modifier = Modifier
                    .clip(RoundedCornerShape(14.dp))
                    .background(KT.accent)
                    .clickable { if (step == 0) step = 1 else finish() }
                    .padding(horizontal = 30.dp, vertical = 11.dp)
            )
        }
    }
}

@Composable
private fun ChipGrid(
    labels: List<Pair<String, String>>,
    selected: List<String>,
    onToggle: (String) -> Unit
) {
    LazyVerticalGrid(
        columns = GridCells.Adaptive(minSize = 132.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        contentPadding = PaddingValues(bottom = 12.dp)
    ) {
        items(labels, key = { it.first }) { (key, label) ->
            val on = selected.contains(key)
            Text(
                label,
                fontSize = 13.sp,
                fontWeight = if (on) FontWeight.Bold else FontWeight.Medium,
                color = if (on) KT.accent else KT.textSecondary,
                textAlign = TextAlign.Center,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(if (on) KT.accent.copy(alpha = 0.14f) else KT.card)
                    .border(
                        1.dp,
                        if (on) KT.accent.copy(alpha = 0.6f) else KT.hairline,
                        RoundedCornerShape(14.dp)
                    )
                    .clickable { onToggle(key) }
                    .padding(vertical = 13.dp, horizontal = 8.dp)
            )
        }
    }
}
