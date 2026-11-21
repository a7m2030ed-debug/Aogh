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
import androidx.compose.ui.res.stringResource
import com.koratime.core.Lang
import com.koratime.core.LangManager
import com.koratime.core.Settings
import com.koratime.R
import com.koratime.ui.KT
import com.koratime.ui.KTCard
import com.koratime.ui.SectionTitle

@Composable
fun SettingsScreen(
    settings: Settings,
    onEditFavorites: () -> Unit,
    onChannelsChanged: () -> Unit,
    onNewsChanged: () -> Unit,
    onMatchesChanged: () -> Unit
) {
    val lang = LangManager.current(settings)
    var apiKey by remember { mutableStateOf(settings.apiFootballKey) }
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
            SectionTitle(title = stringResource(R.string.settings_title),
                subtitle = stringResource(R.string.settings_subtitle))
        }

        item {
            Group(stringResource(R.string.group_language)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Lang.entries.forEach { option ->
                        val on = option == lang
                        Text(
                            option.label,
                            fontSize = 13.sp,
                            fontWeight = if (on) FontWeight.Bold else FontWeight.Medium,
                            color = if (on) KT.accent else KT.textSecondary,
                            modifier = Modifier
                                .clip(CircleShape)
                                .background(
                                    if (on) KT.accent.copy(alpha = 0.16f) else KT.cardHigh
                                )
                                .clickable { LangManager.set(settings, option) }
                                .padding(horizontal = 20.dp, vertical = 8.dp)
                        )
                    }
                }
                Text(stringResource(R.string.language_hint), fontSize = 11.sp, color = KT.textFaint)
            }
        }

        item {
            Group(stringResource(R.string.my_prefs)) {
                Text(
                    stringResource(R.string.my_prefs_hint),
                    fontSize = 11.sp,
                    color = KT.textFaint
                )
                Text(
                    stringResource(R.string.edit_prefs),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    color = KT.accent,
                    modifier = Modifier.clickable { onEditFavorites() }
                )
            }
        }

        item {
            Group(stringResource(R.string.matches_title)) {
                OutlinedTextField(
                    value = apiKey,
                    onValueChange = {
                        apiKey = it
                        settings.apiFootballKey = it
                        onMatchesChanged()
                    },
                    label = { Text(stringResource(R.string.apifootball_key)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Text(stringResource(R.string.apifootball_hint), fontSize = 11.sp, color = KT.textFaint)

                OutlinedTextField(
                    value = sportsKey,
                    onValueChange = {
                        sportsKey = it
                        settings.sportsDbKey = it
                        onMatchesChanged()
                    },
                    label = { Text(stringResource(R.string.sportsdb_key)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Text(
                    stringResource(R.string.sportsdb_hint),
                    fontSize = 11.sp,
                    color = KT.textFaint
                )
                SwitchRow(stringResource(R.string.arabic_names), arabicNames) {
                    arabicNames = it
                    settings.arabicNames = it
                    onMatchesChanged()
                }
            }
        }

        item {
            Group(stringResource(R.string.channels_title)) {
                SwitchRow(stringResource(R.string.autoplay), autoPlay) {
                    autoPlay = it
                    settings.autoPlayOnOpen = it
                }
                SwitchRow(stringResource(R.string.show_demo), showDemo) {
                    showDemo = it
                    settings.showDemoChannels = it
                    onChannelsChanged()
                }
                Text(
                    stringResource(R.string.channels_hint),
                    fontSize = 11.sp,
                    color = KT.textFaint
                )
                AddRow(
                    value = newPlaylist,
                    label = stringResource(R.string.playlist_url),
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
            Group(stringResource(R.string.news_title)) {
                AddRow(
                    value = newFeed,
                    label = stringResource(R.string.feed_url),
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
                    stringResource(R.string.restore_feeds),
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
            Group(stringResource(R.string.about)) {
                Text(stringResource(R.string.about_version), fontSize = 13.sp, color = KT.text)
                Text(
                    stringResource(R.string.about_desc),
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
            stringResource(R.string.action_add),
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
            stringResource(R.string.action_delete),
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            color = KT.live,
            modifier = Modifier.clickable { onRemove() }.padding(start = 10.dp)
        )
    }
}
