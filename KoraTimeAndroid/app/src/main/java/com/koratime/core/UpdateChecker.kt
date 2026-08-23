package com.koratime.core

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch

/**
 * بوّابة التحديث.
 *
 * نسخة أندرويد تُوزَّع ملفاً مباشراً، فلا تحديث تلقائي أصلاً: من ثبّتها لن
 * يعرف بجديد إلا إن أخبره التطبيق. ولذلك يسأل عند فتحه: ما أحدث إصدار؟ وما
 * أدنى إصدار لا يزال يعمل؟
 *
 * الوضع الافتراضي لطيف: شريط يُعلم ولا يمنع، ويُطوى بضغطة «لاحقاً» فلا يعود
 * لهذا الإصدار. والحجب لا يقع إلا إن رُفع `minimum` عمداً لعطل حقيقي.
 */
class UpdateViewModel(private val context: Context) : ViewModel() {

    var info by mutableStateOf<AppVersionInfo?>(null)
        private set

    /** التحديث متاح ولم يُطوَ بعد. */
    var showsBanner by mutableStateOf(false)
        private set

    /** الإصدار الحالي لم يعد مقبولاً: شاشة حاجبة لا تُطوى. */
    var isBlocking by mutableStateOf(false)
        private set

    private val prefs = context.getSharedPreferences("koratime", Context.MODE_PRIVATE)

    private var checked = false

    fun checkIfNeeded() {
        if (checked) return
        checked = true
        viewModelScope.launch {
            // فشل الطلب لا يُعرض للمستخدم: بوّابة التحديث لا يجوز أن تُقلقه
            // بخطأ شبكة، وغياب البيان يعني ببساطة ألّا شيء يُقال.
            val payload = try {
                ktJson.decodeFromString<AppVersionInfo>(
                    Http.text(LiveData.APP_VERSION, maxAgeSeconds = 1800)
                )
            } catch (error: Exception) {
                return@launch
            }

            info = payload
            val installed = installedVersion()

            if (Version.isNewer(payload.minimum, installed)) {
                isBlocking = true
                showsBanner = false
                return@launch
            }

            val dismissed = prefs.getString(DISMISSED_KEY, null)
            showsBanner = Version.isNewer(payload.latest, installed) && dismissed != payload.latest
        }
    }

    /** «لاحقاً»: يُطوى الشريط لهذا الإصدار فقط، فالتالي يُعلن عن نفسه. */
    fun dismiss() {
        info?.latest?.let { prefs.edit().putString(DISMISSED_KEY, it).apply() }
        showsBanner = false
    }

    val downloadUrl: String
        get() = info?.android?.takeIf { it.isNotBlank() }
            ?: "https://github.com/a7m2030ed-debug/Aogh/releases/latest"

    /**
     * من مدير الحزم لا من BuildConfig: توليد BuildConfig مُطفأ افتراضياً في
     * إصدارات Gradle الحديثة، وتشغيله لأجل سطر واحد لا يستحقّ.
     */
    private fun installedVersion(): String = runCatching {
        context.packageManager.getPackageInfo(context.packageName, 0).versionName
    }.getOrNull() ?: "0"

    private companion object {
        const val DISMISSED_KEY = "update.dismissedVersion"
    }
}
