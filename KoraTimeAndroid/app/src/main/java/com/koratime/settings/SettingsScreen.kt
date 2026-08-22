package com.koratime.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.koratime.core.Settings
import com.koratime.ui.KT
import com.koratime.ui.KTCard
import com.koratime.ui.SectionTitle

@Composable
fun SettingsScreen(
    settings: Settings,
    onChannelsChanged: () -> Unit,
    onNewsChanged: () -> Unit,
    onMatchesChanged: () -> Unit
) {
    var sportsKey by remember { mutableStateOf(settings.sportsDbKey) }
    var arabicNames by remember { mutableStateOf(settings.arabicNames) }
    var autoPlay by remember { mutableStateOf(settings.autoPlayOnOpen) }
    var showDemo by remember { mutableStateOf(settings.showDemoChannels) }
    var playlists by remember { mutableStateOf(settings.playlists) }
    var feeds by remember { mutableStateOf(settings.feeds) }
    var newPlaylist by remember { mutableStateOf("") }
    var newFeed by remember { mutableStateOf("") }

    LazyColumn(
        contentPadding = PaddingValues(bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        item {
            SectionTitle(title = "الإعدادات", subtitle = "مصادر البيانات، قنواتك، وخلاصات الأخبار")
        }

        item {
            Group("المباريات") {
                OutlinedTextField(
                    value = sportsKey,
                    onValueChange = {
                        sportsKey = it
                        settings.sportsDbKey = it
                        onMatchesChanged()
                    },
                    label = { Text("مفتاح TheSportsDB") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Text(
                    "المفتاح التجريبي المشترك «123» يعمل بلا تسجيل لكنه محدود الطلبات. " +
                        "سجّل مفتاحاً باسمك من thesportsdb.com لتحديث أسرع.",
                    fontSize = 11.sp,
                    color = KT.textFaint
                )
                SwitchRow("تعريب أسماء الفرق والبطولات", arabicNames) {
                    arabicNames = it
                    settings.arabicNames = it
                    onMatchesChanged()
                }
            }
        }

        item {
            Group("القنوات") {
                SwitchRow("تشغيل آخر قناة عند الفتح", autoPlay) {
                    autoPlay = it
                    settings.autoPlayOnOpen = it
                }
                SwitchRow("إظهار القنوات التجريبية", showDemo) {
                    showDemo = it
                    settings.showDemoChannels = it
                    onChannelsChanged()
                }
                Text(
                    "التطبيق لا يوفّر قنوات مشفّرة. أضف رابط قائمتك (M3U أو JSON) " +
                        "وستظهر في تبويب القنوات مباشرة. القوائم تبقى على جهازك.",
                    fontSize = 11.sp,
                    color = KT.textFaint
                )
                AddRow(
                    value = newPlaylist,
                    label = "رابط قائمة قنوات",
                    onValueChange = { newPlaylist = it },
                    onAdd = {
                        val url = newPlaylist.trim()
                        if (url.startsWith("http")) {
                            playlists = playlists + url
                            settings.playlists = playlists
                            newPlaylist = ""
                            onChannelsChanged()
                        }
                    }
                )
                playlists.forEach { url ->
                    RemovableRow(url) {
                        playlists = playlists - url
                        settings.playlists = playlists
                        onChannelsChanged()
                    }
                }
            }
        }

        item {
            Group("الأخبار") {
                AddRow(
                    value = newFeed,
                    label = "رابط خلاصة RSS",
                    onValueChange = { newFeed = it },
                    onAdd = {
                        val url = newFeed.trim()
                        if (url.startsWith("http")) {
                            feeds = feeds + url
                            settings.feeds = feeds
                            newFeed = ""
                            onNewsChanged()
                        }
                    }
                )
                feeds.forEach { url ->
                    RemovableRow(url) {
                        feeds = feeds - url
                        settings.feeds = feeds
                        onNewsChanged()
                    }
                }
                Text(
                    "استعادة الخلاصات الافتراضية",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    color = KT.gold,
                    modifier = Modifier.clickable {
                        feeds = Settings.defaultFeeds
                        settings.feeds = feeds
                        onNewsChanged()
                    }
                )
            }
        }

        item {
            Group("عن التطبيق") {
                Text("كورة تايم — الإصدار 1.0", fontSize = 13.sp, color = KT.text)
                Text(
                    "مواعيد المباريات ونتائجها، وقنواتك المفتوحة، وأخبار الكرة العربية في مكان واحد.",
                    fontSize = 11.sp,
                    color = KT.textFaint
                )
            }
        }
    }
}

@Composable
private fun Group(title: String, content: @Composable () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        Text(
            title,
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
            color = KT.accent,
            modifier = Modifier.padding(bottom = 6.dp)
        )
        KTCard(modifier = Modifier.fillMaxWidth()) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) { content() }
        }
    }
}

@Composable
private fun SwitchRow(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(label, fontSize = 14.sp, color = KT.text, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onChange)
    }
}

@Composable
private fun AddRow(
    value: String,
    label: String,
    onValueChange: (String) -> Unit,
    onAdd: () -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            label = { Text(label) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        Text(
            "إضافة",
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
            color = KT.accent,
            modifier = Modifier
                .clip(CircleShape)
                .background(KT.accent.copy(alpha = 0.16f))
                .clickable { onAdd() }
                .padding(horizontal = 18.dp, vertical = 7.dp)
        )
    }
}

@Composable
private fun RemovableRow(url: String, onRemove: () -> Unit) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(
            url,
            fontSize = 11.sp,
            color = KT.textSecondary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f)
        )
        Text(
            "حذف",
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            color = KT.live,
            modifier = Modifier.clickable { onRemove() }.padding(start = 10.dp)
        )
    }
}
