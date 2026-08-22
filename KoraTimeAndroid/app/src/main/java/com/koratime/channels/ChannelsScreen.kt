package com.koratime.channels

import android.content.Intent
import android.net.Uri
import androidx.annotation.OptIn
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.PlayerView
import coil.compose.AsyncImage
import com.koratime.Broadcasters
import com.koratime.core.ArabicNames
import com.koratime.matches.MatchesViewModel
import com.koratime.ui.KT
import com.koratime.ui.KTCard

/**
 * تبويب القنوات: المشغّل يبدأ فوراً، وقائمة القنوات على اليمين — كطريقة
 * تطبيقات البثّ. الضغط على قناة يبدّل البثّ في مكانه.
 */
@OptIn(UnstableApi::class)
@Composable
fun ChannelsScreen(
    model: ChannelsViewModel,
    matches: MatchesViewModel,
    autoPlay: Boolean,
    arabicNames: Boolean,
    onOpenSettings: () -> Unit
) {
    val context = LocalContext.current
    var errorText by remember { mutableStateOf<String?>(null) }
    var isBuffering by remember { mutableStateOf(false) }

    val player = remember {
        ExoPlayer.Builder(context).build().apply {
            playWhenReady = true
        }
    }

    DisposableEffect(Unit) {
        val listener = object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                isBuffering = state == Player.STATE_BUFFERING
            }

            override fun onPlayerError(error: PlaybackException) {
                isBuffering = false
                errorText = "تعذّر تشغيل هذه القناة. قد تكون محجوبة أو متوقّفة."
            }
        }
        player.addListener(listener)
        onDispose {
            player.removeListener(listener)
            player.release()
        }
    }

    LaunchedEffect(Unit) {
        model.loadIfNeeded()
        matches.loadIfNeeded()
    }

    // أول قناة تُشغَّل تلقائياً بعد وصول القائمة
    LaunchedEffect(model.channels.size) {
        if (autoPlay && model.currentId == null) {
            model.startupChannel()?.let { model.select(it) }
        }
    }

    val current = model.current
    LaunchedEffect(current?.id) {
        val channel = current ?: return@LaunchedEffect
        errorText = null
        isBuffering = true

        val factory = DefaultHttpDataSource.Factory()
            .setUserAgent(channel.userAgent ?: "KoraTime/1.0 (Android)")
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(15_000)
            .setReadTimeoutMs(20_000)
        if (channel.headers.isNotEmpty()) {
            factory.setDefaultRequestProperties(channel.headers)
        }

        player.setMediaSourceFactory(DefaultMediaSourceFactory(factory))
        player.setMediaItem(MediaItem.fromUri(channel.url))
        player.prepare()
        player.play()
    }

    Row(modifier = Modifier.fillMaxSize()) {
        ChannelRail(
            model = model,
            modifier = Modifier.width(112.dp).fillMaxHeight(),
            onOpenSettings = onOpenSettings
        )

        Box(modifier = Modifier.width(1.dp).fillMaxHeight().background(KT.hairline))

        Column(modifier = Modifier.weight(1f).fillMaxHeight()) {
            Box(
                modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f).background(Color.Black),
                contentAlignment = Alignment.Center
            ) {
                AndroidView(
                    factory = { viewContext ->
                        PlayerView(viewContext).apply {
                            useController = true
                            setShowBuffering(PlayerView.SHOW_BUFFERING_NEVER)
                            this.player = player
                        }
                    },
                    modifier = Modifier.fillMaxSize()
                )

                if (current == null) {
                    Text("اختر قناة من القائمة", fontSize = 13.sp, color = Color.White.copy(alpha = 0.7f))
                } else if (errorText != null) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.background(Color.Black.copy(alpha = 0.6f)).padding(14.dp)
                    ) {
                        Text(
                            errorText!!,
                            fontSize = 12.sp,
                            color = Color.White,
                            textAlign = TextAlign.Center
                        )
                        Text(
                            "إعادة المحاولة",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = KT.accent,
                            modifier = Modifier.clickable {
                                errorText = null
                                player.prepare()
                                player.play()
                            }
                        )
                    }
                } else if (isBuffering) {
                    CircularProgressIndicator(color = KT.accent)
                }
            }

            LazyColumn(
                contentPadding = PaddingValues(12.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                if (current != null) {
                    item {
                        KTCard(modifier = Modifier.fillMaxWidth()) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                ChannelLogo(current.name, current.logo, 42)
                                Column(modifier = Modifier.padding(start = 10.dp).weight(1f)) {
                                    Text(
                                        current.name,
                                        fontSize = 14.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = KT.text,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    Text(
                                        current.note ?: current.group,
                                        fontSize = 11.sp,
                                        color = KT.textFaint,
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }
                        }
                    }
                }

                val today = matches.sections.flatMap { it.matches }
                    .filter { it.isLive || it.status.name == "SCHEDULED" }
                    .take(12)
                if (today.isNotEmpty()) {
                    item {
                        Text("مباريات اليوم", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = KT.text)
                    }
                    items(today, key = { it.id }) { match ->
                        KTCard(modifier = Modifier.fillMaxWidth(), padding = PaddingValues(10.dp)) {
                            Text(
                                "${match.homeTitle(arabicNames)}  ×  ${match.awayTitle(arabicNames)}",
                                fontSize = 12.sp,
                                color = KT.textSecondary,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                }

                item {
                    KTCard(modifier = Modifier.fillMaxWidth()) {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("البطولات الحصرية", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = KT.text)
                            Broadcasters.all.forEach { broadcaster ->
                                Text(broadcaster.note, fontSize = 12.sp, color = KT.textSecondary)
                                Text(
                                    "فتح ${broadcaster.name}",
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = KT.accent,
                                    modifier = Modifier.clickable {
                                        context.startActivity(
                                            Intent(Intent.ACTION_VIEW, Uri.parse(broadcaster.openUrl))
                                        )
                                    }
                                )
                            }
                        }
                    }
                }

                if (!model.hasUserChannels) {
                    item {
                        KTCard(modifier = Modifier.fillMaxWidth()) {
                            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text("قنواتك الخاصة", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = KT.text)
                                Text(
                                    "أضف رابط قائمتك (M3U أو JSON) من الإعدادات وستظهر هنا.",
                                    fontSize = 12.sp,
                                    color = KT.textSecondary
                                )
                                Text(
                                    "إضافة قائمة قنوات",
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = KT.accent,
                                    modifier = Modifier.clickable { onOpenSettings() }
                                )
                            }
                        }
                    }
                }

                items(model.loadErrors) { error ->
                    Text(error, fontSize = 11.sp, color = KT.gold)
                }
            }
        }
    }
}

@Composable
private fun ChannelRail(
    model: ChannelsViewModel,
    modifier: Modifier = Modifier,
    onOpenSettings: () -> Unit
) {
    var menuOpen by remember { mutableStateOf(false) }

    Column(modifier = modifier.background(KT.bgSoft)) {
        Column(modifier = Modifier.padding(horizontal = 8.dp, vertical = 10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("القنوات", fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, color = KT.text)
                Box(modifier = Modifier.weight(1f))
                Text("${model.visibleChannels.size}", fontSize = 10.sp, color = KT.textFaint)
            }

            Box {
                Text(
                    model.selectedGroup ?: "كل الفئات",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = KT.accent,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 6.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(KT.accent.copy(alpha = 0.12f))
                        .clickable { menuOpen = true }
                        .padding(vertical = 5.dp)
                )
                DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                    DropdownMenuItem(
                        text = { Text("الكل") },
                        onClick = { model.selectedGroup = null; menuOpen = false }
                    )
                    model.groups.forEach { group ->
                        DropdownMenuItem(
                            text = { Text(group) },
                            onClick = { model.selectedGroup = group; menuOpen = false }
                        )
                    }
                }
            }
        }

        if (model.isLoading && model.channels.isEmpty()) {
            Box(modifier = Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = KT.accent)
            }
        } else if (model.visibleChannels.isEmpty()) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(12.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Text("لا قنوات", fontSize = 11.sp, color = KT.textSecondary)
                Text(
                    "أضف قائمة",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = KT.accent,
                    modifier = Modifier.clickable { onOpenSettings() }
                )
            }
        } else {
            LazyColumn(
                contentPadding = PaddingValues(horizontal = 6.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                items(model.visibleChannels, key = { it.id }) { channel ->
                    val playing = model.currentId == channel.id
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(if (playing) KT.accent.copy(alpha = 0.14f) else KT.card)
                            .border(
                                1.dp,
                                if (playing) KT.accent.copy(alpha = 0.55f) else KT.hairline,
                                RoundedCornerShape(12.dp)
                            )
                            .clickable { model.select(channel) }
                            .padding(vertical = 8.dp, horizontal = 4.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(5.dp)
                    ) {
                        ChannelLogo(channel.name, channel.logo, 40)
                        Text(
                            channel.name,
                            fontSize = 10.sp,
                            fontWeight = if (playing) FontWeight.Bold else FontWeight.Medium,
                            color = if (playing) KT.accent else KT.textSecondary,
                            textAlign = TextAlign.Center,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis
                        )
                        if (channel.geoRestricted) {
                            Text("قد تُحجب", fontSize = 8.sp, color = KT.gold, maxLines = 1)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ChannelLogo(name: String, url: String?, size: Int) {
    Box(
        modifier = Modifier
            .size(size.dp)
            .clip(RoundedCornerShape((size * 0.24).dp))
            .background(KT.cardHigh),
        contentAlignment = Alignment.Center
    ) {
        if (url != null) {
            AsyncImage(model = url, contentDescription = null, modifier = Modifier.size(size.dp))
        } else {
            Text(
                ArabicNames.monogram(name),
                fontSize = (size * 0.32).sp,
                fontWeight = FontWeight.Bold,
                color = KT.accent.copy(alpha = 0.9f),
                maxLines = 1
            )
        }
    }
}
