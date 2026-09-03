package com.koratime.core

import android.content.Context
import android.content.res.Configuration
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import java.util.Locale

/** اللغات المدعومة. العربية أولاً لأنها لغة التطبيق الافتراضية. */
enum class Lang(val code: String, val label: String) {
    AR("ar", "العربية"),
    EN("en", "English");

    companion object {
        fun of(code: String?): Lang = entries.firstOrNull { it.code == code } ?: AR
    }
}

/**
 * تغيير اللغة يمرّ عبر AppCompatDelegate لا عبر ضبط Locale يدوياً:
 * فهو يعيد بناء النشاط، ويثبّت الاختيار بعد إغلاق التطبيق، ويجعل اتجاه
 * الواجهة يتبع اللغة تلقائياً بدل أن نفرض RTL على الإنجليزية أيضاً.
 */
object LangManager {

    /** يُستدعى عند بدء التطبيق قبل بناء الواجهة. */
    fun apply(settings: Settings) {
        val chosen = Lang.of(settings.language)
        val current = AppCompatDelegate.getApplicationLocales()
        if (current.isEmpty || current[0]?.language != chosen.code) {
            AppCompatDelegate.setApplicationLocales(
                LocaleListCompat.forLanguageTags(chosen.code)
            )
        }
    }

    fun set(settings: Settings, lang: Lang) {
        settings.language = lang.code
        AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(lang.code))
    }

    fun current(settings: Settings): Lang = Lang.of(settings.language)
}

/**
 * نصوص للكود الذي لا يملك سياق Compose — النماذج وطبقة الشبكة والتواريخ.
 *
 * لا نحتفظ بسياق نشاط (تسريب)، بل نشتقّ سياقاً باللغة المختارة من سياق
 * التطبيق ونخزّنه حتى تتغيّر اللغة.
 */
object AppText {

    private lateinit var appContext: Context
    private var cached: Context? = null
    private var cachedTag: String? = null

    fun init(context: Context) {
        appContext = context.applicationContext
    }

    private fun context(): Context {
        val locales = AppCompatDelegate.getApplicationLocales()
        val locale = locales[0] ?: Locale.forLanguageTag(Lang.AR.code)
        val tag = locale.toLanguageTag()
        cached?.let { if (tag == cachedTag) return it }

        val config = Configuration(appContext.resources.configuration).apply { setLocale(locale) }
        val made = appContext.createConfigurationContext(config)
        cached = made
        cachedTag = tag
        return made
    }

    fun get(id: Int): String =
        if (::appContext.isInitialized) context().getString(id) else ""

    fun get(id: Int, vararg args: Any): String =
        if (::appContext.isInitialized) context().getString(id, *args) else ""
}
