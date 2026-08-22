package com.koratime

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Newspaper
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.SportsSoccer
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
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
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
import com.koratime.matches.MatchesScreen
import com.koratime.matches.MatchesViewModel
import com.koratime.news.NewsScreen
import com.koratime.news.NewsViewModel
import com.koratime.settings.SettingsScreen
import com.koratime.ui.KT
import com.koratime.ui.KTBackground
import com.koratime.ui.KoraTimeTheme

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val settings = Settings(applicationContext)
        ArabicNames.load(applicationContext)

        setContent {
            KoraTimeTheme {
                // التطبيق عربي بالكامل، فنثبّت الاتجاه من اليمين لليسار
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    RootScreen(settings)
                }
            }
        }
    }
}

private enum class Tab(val title: String, val icon: ImageVector) {
    MATCHES("المباريات", Icons.Filled.SportsSoccer),
    CHANNELS("القنوات", Icons.Filled.PlayCircle),
    NEWS("الأخبار", Icons.Filled.Newspaper),
    SETTINGS("الإعدادات", Icons.Filled.Settings)
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
        else -> throw IllegalArgumentException("نموذج غير معروف: ${modelClass.name}")
    }
}

@Composable
private fun RootScreen(settings: Settings) {
    val context = LocalContext.current.applicationContext
    val factory = remember { KTViewModelFactory(settings, context) }

    val matches: MatchesViewModel = viewModel(factory = factory)
    val channels: ChannelsViewModel = viewModel(factory = factory)
    val news: NewsViewModel = viewModel(factory = factory)

    var tab by remember { mutableStateOf(Tab.MATCHES) }

    Scaffold(
        containerColor = KT.bg,
        bottomBar = {
            NavigationBar(containerColor = KT.bgSoft) {
                // في الاتجاه من اليمين لليسار يظهر أول عنصر في أقصى اليمين
                Tab.entries.forEach { entry ->
                    NavigationBarItem(
                        selected = tab == entry,
                        onClick = { tab = entry },
                        icon = { Icon(entry.icon, contentDescription = entry.title) },
                        label = { Text(entry.title, fontSize = 11.sp) },
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
                when (tab) {
                    Tab.MATCHES -> MatchesScreen(
                        model = matches,
                        arabicNames = settings.arabicNames,
                        onOpenMatch = { }
                    )

                    Tab.CHANNELS -> ChannelsScreen(
                        model = channels,
                        matches = matches,
                        autoPlay = settings.autoPlayOnOpen,
                        arabicNames = settings.arabicNames,
                        onOpenSettings = { tab = Tab.SETTINGS }
                    )

                    Tab.NEWS -> NewsScreen(model = news)

                    Tab.SETTINGS -> SettingsScreen(
                        settings = settings,
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
