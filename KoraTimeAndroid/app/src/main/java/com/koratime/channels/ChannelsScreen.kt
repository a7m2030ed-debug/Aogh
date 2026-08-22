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
import androidx.compose.material3.Icon
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.PlayerView
import androidx.mediarouter.app.MediaRouteButton
import com.google.android.gms.cast.framework.CastButtonFactory
import coil.compose.AsyncImage
import com.koratime.Broadcasters
import com.koratime.R
import com.koratime.core.ArabicNames
import com.koratime.ui.KT
import com.koratime.ui.KTIcons
import com.koratime.ui.KTCard

/**
 * تبويب القنوات: المشغّل يبدأ فوراً، وقائمة القنوات على اليمين — كطريقة
 * تطبيقات البثّ. الضغط على قناة يبدّل البثّ في مكانه.
 *
 * المشغّل نفسه يملكه ChannelsViewModel لا هذه الشاشة، فيبقى البثّ حيّاً
 * عند التنقّل بين التبويبات بدل أن يُحرَّر ويُعاد بناؤه.
 */
@OptIn(UnstableApi::class)
@Composable
fun ChannelsScreen(
    model: ChannelsViewModel,
    autoPlay: Boolean,
    isFullscreen: Boolean,
    onToggleFullscreen: () -> Unit,
    onOpenSettings: () -> Unit
) {
    val context = LocalContext.current
    val errorText = model.errorText
    val isBuffering = model.isBuffering

    // القائمة تُحمَّل عند بدء التطبيق لا هنا، والنموذج يهيّئ قناة البداية
    // بلا صوت. هنا نكتفي ببدء الصوت لأن الشاشة صارت ظاهرة.
    DisposableEffect(Unit) {
        model.initCast()
        model.loadIfNeeded()
        if (autoPlay) model.resumePlayback()
        onDispose { }
    }

    // إن وصلت القائمة بعد فتح التبويب، نبدأ الصوت حين تجهز
    LaunchedEffect(model.currentId) {
        if (autoPlay && model.currentId != null) model.resumePlayback()
    }

    val current = model.current

    // ملء الشاشة: المشغّل وحده يملأ الجهاز، بلا قائمة ولا تبويبات
    if (isFullscreen) {
        Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
            PlayerSurface(
                model = model,
                current = current,
                errorText = errorText,
                isBuffering = isBuffering,
                isFullscreen = true,
                onToggleFullscreen = onToggleFullscreen,
                modifier = Modifier.fillMaxSize()
            )
        }
        return
    }

    Row(modifier = Modifier.fillMaxSize()) {
        ChannelRail(
            model = model,
            modifier = Modifier.width(112.dp).fillMaxHeight(),
            onOpenSettings = onOpenSettings
        )

        Box(modifier = Modifier.width(1.dp).fillMaxHeight().background(KT.hairline))

        Column(modifier = Modifier.weight(1f).fillMaxHeight()) {
            PlayerSurface(
                model = model,
                current = current,
                errorText = errorText,
                isBuffering = isBuffering,
                isFullscreen = false,
                onToggleFullscreen = onToggleFullscreen,
                modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f)
            )

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

                item {
                    KTCard(modifier = Modifier.fillMaxWidth()) {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(stringResource(R.string.exclusive_competitions), fontSize = 13.sp, fontWeight = FontWeight.Bold, color = KT.text)
                            Broadcasters.all.forEach { broadcaster ->
                                Text(broadcaster.note, fontSize = 12.sp, color = KT.textSecondary)
                                Text(
                                    stringResource(R.string.open_broadcaster, broadcaster.name),
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
                                Text(stringResource(R.string.your_channels), fontSize = 13.sp, fontWeight = FontWeight.Bold, color = KT.text)
                                Text(
                                    stringResource(R.string.your_channels_hint),
                                    fontSize = 12.sp,
                                    color = KT.textSecondary
                                )
                                Text(
                                    stringResource(R.string.add_playlist),
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

/**
 * سطح المشغّل — واحد للحالتين. الشاشة تُعاد تركيبها عند التبديل بين
 * الوضعين، لكن المشغّل نفسه يعيش في النموذج فلا ينقطع البثّ.
 */
@OptIn(UnstableApi::class)
@Composable
private fun PlayerSurface(
    model: ChannelsViewModel,
    current: Channel?,
    errorText: String?,
    isBuffering: Boolean,
    isFullscreen: Boolean,
    onToggleFullscreen: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    // أزرارنا تتبع ظهور أزرار المشغّل نفسه: لمسة تُظهر الكل ولمسة تُخفيه،
    // بدل أن تبقى أزرارنا معلّقة فوق الصورة دائماً.
    var controlsVisible by remember { mutableStateOf(true) }

    Box(modifier = modifier.background(Color.Black), contentAlignment = Alignment.Center) {
        AndroidView(
            factory = { viewContext ->
                PlayerView(viewContext).apply {
                    useController = true
                    setShowBuffering(PlayerView.SHOW_BUFFERING_NEVER)
                    controllerShowTimeoutMs = 2_500
                    setControllerVisibilityListener(
                        PlayerView.ControllerVisibilityListener { visibility ->
                            controlsVisible = visibility == android.view.View.VISIBLE
                        }
                    )
                    // viewPlayer لا player: نسخة بلا أمر تغيير السرعة
                    this.player = model.viewPlayer
                }
            },
            // فكّ الارتباط عند هدم الشاشة حتى لا يتمسّك المشغّل بسطح ميّت
            onRelease = { it.player = null },
            modifier = Modifier.fillMaxSize()
        )

        if (model.isCasting) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Text(stringResource(R.string.casting_to), fontSize = 14.sp, fontWeight = FontWeight.Bold, color = KT.accent)
                Text(
                    model.castDeviceName ?: stringResource(R.string.cast_device),
                    fontSize = 12.sp,
                    color = Color.White.copy(alpha = 0.8f)
                )
            }
        } else if (current == null) {
            Text(stringResource(R.string.pick_channel), fontSize = 13.sp, color = Color.White.copy(alpha = 0.7f))
        } else if (errorText != null) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.background(Color.Black.copy(alpha = 0.6f)).padding(14.dp)
            ) {
                Text(errorText, fontSize = 12.sp, color = Color.White, textAlign = TextAlign.Center)
                Text(
                    stringResource(R.string.retry),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = KT.accent,
                    modifier = Modifier.clickable { model.retryCurrent() }
                )
            }
        } else if (isBuffering) {
            CircularProgressIndicator(color = KT.accent)
        }

        // زرّا ملء الشاشة والعكس على الشاشات الذكية، في الزاوية كما في
        // تطبيقات الفيديو. BottomEnd في RTL هو الركن الأيسر السفلي.
        if (controlsVisible) Row(
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.align(Alignment.BottomEnd).padding(8.dp)
        ) {
            // مخرج لتلفزيونات لا تتحدّث Cast: نسلّم الرابط لتطبيق يعرفها
            PlayerCornerButton(
                icon = KTIcons.SendToScreen,
                label = stringResource(R.string.send_to_app),
                onClick = {
                    model.shareIntent()?.let { intent ->
                        runCatching { context.startActivity(intent) }
                    }
                }
            )
            if (model.canCast) {
                // زرّ النظام القياسي: يفتح قائمة الأجهزة التي يعرفها أندرويد
                AndroidView(
                    factory = { viewContext ->
                        MediaRouteButton(viewContext).also { button ->
                            CastButtonFactory.setUpMediaRouteButton(viewContext, button)
                        }
                    },
                    modifier = Modifier.size(38.dp)
                )
            }
            PlayerCornerButton(
                icon = if (isFullscreen) KTIcons.CollapseScreen else KTIcons.ExpandScreen,
                label = stringResource(if (isFullscreen) R.string.minimize else R.string.fullscreen),
                onClick = onToggleFullscreen
            )
        }
    }
}

@Composable
private fun PlayerCornerButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    onClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(10.dp))
            .background(Color.Black.copy(alpha = 0.55f))
            .clickable { onClick() }
            .padding(7.dp),
        contentAlignment = Alignment.Center
    ) {
        Icon(icon, contentDescription = label, tint = Color.White, modifier = Modifier.size(20.dp))
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
                Text(stringResource(R.string.channels_title), fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, color = KT.text)
                Box(modifier = Modifier.weight(1f))
                Text("${model.visibleChannels.size}", fontSize = 10.sp, color = KT.textFaint)
            }

            Box {
                Text(
                    model.selectedGroup ?: stringResource(R.string.all_groups),
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
                        text = { Text(stringResource(R.string.filter_all)) },
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
                Text(stringResource(R.string.no_channels), fontSize = 11.sp, color = KT.textSecondary)
                Text(
                    stringResource(R.string.add_list),
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
                            Text(stringResource(R.string.may_be_blocked), fontSize = 8.sp, color = KT.gold, maxLines = 1)
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
