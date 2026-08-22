package com.koratime

import android.app.Activity
import android.content.pm.ActivityInfo
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import com.koratime.channels.ChannelsScreen
import com.koratime.channels.ChannelsViewModel
import com.koratime.core.ArabicNames
import com.koratime.core.Settings
import com.koratime.core.AppText
import com.koratime.core.Lang
import com.koratime.core.LangManager
import com.koratime.matches.MatchesScreen
import com.koratime.matches.MatchesViewModel
import com.koratime.news.NewsScreen
import com.koratime.news.NewsViewModel
import com.koratime.onboarding.OnboardingScreen
import com.koratime.settings.SettingsScreen
import com.koratime.ui.KT
import com.koratime.ui.KTBackground
import com.koratime.ui.KTIcons
import com.koratime.ui.KoraTimeTheme

// AppCompatActivity لا ComponentActivity: زرّ البثّ إلى الشاشات يعرض
// قائمة الأجهزة عبر FragmentManager، وسمة AppCompat شرط لتنسيقه.
class MainActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val settings = Settings(applicationContext)
        AppText.init(applicationContext)
        LangManager.apply(settings)
        ArabicNames.load(applicationContext)

        setContent {
            KoraTimeTheme {
                // الاتجاه يتبع اللغة: يمين‑يسار للعربية ويسار‑يمين للإنجليزية،
                // بدل فرض RTL على الاثنتين.
                val direction =
                    if (LangManager.current(settings) == Lang.AR) LayoutDirection.Rtl
                    else LayoutDirection.Ltr
                CompositionLocalProvider(LocalLayoutDirection provides direction) {
                    // أول تشغيل: تفضيلات الدوريات والفرق قبل دخول التطبيق
                    var onboarded by remember { mutableStateOf(settings.onboarded) }
                    // النماذج تعيش مع النشاط لا مع الشجرة، فتغيير التفضيلات
                    // لا يُلاحظ إلا إذا أبلغناها. العدّاد هو الإشارة.
                    var favoritesVersion by remember { mutableStateOf(0) }
                    if (onboarded) {
                        RootScreen(
                            settings = settings,
                            favoritesVersion = favoritesVersion,
                            onEditFavorites = { onboarded = false }
                        )
                    } else {
                        OnboardingScreen(settings) {
                            favoritesVersion += 1
                            onboarded = true
                        }
                    }
                }
            }
        }
    }
}

private enum class Tab(val title: Int, val icon: ImageVector) {
    MATCHES(R.string.tab_matches, KTIcons.Ball),
    CHANNELS(R.string.tab_channels, KTIcons.PlayCircle),
    NEWS(R.string.tab_news, KTIcons.Newspaper),
    SETTINGS(R.string.tab_settings, Icons.Filled.Settings)
}

/** مصنع بسيط يمرّر الإعدادات والسياق إلى النماذج. */
private class KTViewModelFactory(
    private val settings: Settings,
    private val context: android.content.Context
) : ViewModelProvider.Factory {

    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = when {
        modelClass.isAssignableFrom(MatchesViewModel::class.java) ->
            MatchesViewModel(settings) as T
        modelClass.isAssignableFrom(ChannelsViewModel::class.java) ->
            ChannelsViewModel(settings, context) as T
        modelClass.isAssignableFrom(NewsViewModel::class.java) ->
            NewsViewModel(settings) as T
        else -> throw IllegalArgumentException(AppText.get(R.string.unknown_model, modelClass.name))
    }
}

@Composable
private fun RootScreen(
    settings: Settings,
    favoritesVersion: Int,
    onEditFavorites: () -> Unit
) {
    val context = LocalContext.current.applicationContext
    val factory = remember { KTViewModelFactory(settings, context) }

    val matches: MatchesViewModel = viewModel(factory = factory)
    val channels: ChannelsViewModel = viewModel(factory = factory)
    val news: NewsViewModel = viewModel(factory = factory)

    // قائمة القنوات تُحمَّل مع بدء التطبيق لا عند فتح تبويبها: النموذج
    // يهيّئ قناة البداية بلا صوت، فيصير فتح التبويب فورياً بدل انتظار
    // سلسلة الطلبات كاملة عند الضغط.
    LaunchedEffect(Unit) { channels.loadIfNeeded() }

    // تفضيلات جديدة تعني ترتيب مباريات مختلفاً وخلاصات أخبار مختلفة
    LaunchedEffect(favoritesVersion) {
        if (favoritesVersion > 0) {
            matches.invalidate()
            news.invalidate()
            news.reload()
        }
    }

    var tab by remember { mutableStateOf(Tab.MATCHES) }
    var fullscreen by remember { mutableStateOf(false) }
    val stateHolder = rememberSaveableStateHolder()

    // ملء الشاشة يقلب الجهاز عرضياً ويخفي أشرطة النظام، ويرجع كل شيء
    // كما كان عند الخروج — حتى لو خرج المستخدم من التبويب وهو ممتلئ.
    val activity = LocalContext.current as? Activity
    DisposableEffect(fullscreen) {
        val window = activity?.window
        if (window != null) {
            val bars = WindowInsetsControllerCompat(window, window.decorView)
            if (fullscreen) {
                activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                bars.hide(WindowInsetsCompat.Type.systemBars())
                bars.systemBarsBehavior =
                    WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            } else {
                activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                bars.show(WindowInsetsCompat.Type.systemBars())
            }
        }
        onDispose { }
    }

    BackHandler(enabled = fullscreen) { fullscreen = false }

    Scaffold(
        containerColor = KT.bg,
        bottomBar = {
            // في ملء الشاشة لا شريط تبويبات أصلاً
            if (!fullscreen) NavigationBar(containerColor = KT.bgSoft) {
                // في الاتجاه من اليمين لليسار يظهر أول عنصر في أقصى اليمين
                Tab.entries.forEach { entry ->
                    NavigationBarItem(
                        selected = tab == entry,
                        onClick = { tab = entry },
                        icon = {
                            Icon(entry.icon, contentDescription = stringResource(entry.title))
                        },
                        label = { Text(stringResource(entry.title), fontSize = 11.sp) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = KT.accent,
                            selectedTextColor = KT.accent,
                            unselectedIconColor = KT.textSecondary,
                            unselectedTextColor = KT.textSecondary,
                            indicatorColor = KT.accent.copy(alpha = 0.16f)
                        )
                    )
                }
            }
        }
    ) { padding ->
        KTBackground(modifier = Modifier.fillMaxSize()) {
            Box(modifier = Modifier.fillMaxSize().padding(padding)) {
                // كل تبويب يحتفظ بموضع تمريره عند العودة إليه بدل أن يبدأ من أوّله
                stateHolder.SaveableStateProvider(tab.name) {
                    when (tab) {
                        Tab.MATCHES -> MatchesScreen(
                            model = matches,
                            arabicNames = settings.arabicNames,
                            onOpenMatch = { }
                        )

                        Tab.CHANNELS -> ChannelsScreen(
                            model = channels,
                            autoPlay = settings.autoPlayOnOpen,
                            isFullscreen = fullscreen,
                            onToggleFullscreen = { fullscreen = !fullscreen },
                            onOpenSettings = { tab = Tab.SETTINGS }
                        )

                        Tab.NEWS -> NewsScreen(model = news, settings = settings)

                        Tab.SETTINGS -> SettingsScreen(
                            settings = settings,
                            onEditFavorites = onEditFavorites,
                            onChannelsChanged = {
                                channels.invalidate()
                                channels.reload()
                            },
                            onNewsChanged = {
                                news.invalidate()
                                news.reload()
                            },
                            onMatchesChanged = { matches.invalidate() }
                        )
                    }
                }
            }
        }
    }
}
