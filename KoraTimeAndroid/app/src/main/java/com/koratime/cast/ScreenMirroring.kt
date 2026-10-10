package com.koratime.cast

import android.content.Context
import android.content.Intent

/**
 * عكس شاشة الجوال كاملة على التلفزيون.
 *
 * زرّ Cast لا يرى إلا أجهزة غوغل (Chromecast وGoogle TV)، وأغلب التلفزيونات
 * في البيوت سامسونج وإل جي وغيرها فلا تظهر في قائمته أصلاً. عكس الشاشة
 * (Miracast / Smart View) تدعمه هذه التلفزيونات كلها تقريباً، ولا يحتاج
 * التلفزيون أن يصل إلى رابط البثّ: الجوال يشغّل والتلفزيون يعرض ما على شاشته.
 *
 * لا توجد واجهة عامة واحدة لفتحه، فكل شركة تضعه في مكان. نجرّب الأماكن
 * المعروفة بالترتيب ونتوقّف عند أول ما يفتح.
 */
object ScreenMirroring {

    private fun candidates(): List<Intent> = listOf(
        // سامسونج: Smart View
        Intent().setClassName(
            "com.samsung.android.smartmirroring",
            "com.samsung.android.smartmirroring.CaptureActivity"
        ),
        // أندرويد الأصلي وبكسل وأغلب الشركات: إعداد «البثّ»
        Intent("android.settings.CAST_SETTINGS"),
        // أجهزة أقدم: «العرض اللاسلكي»
        Intent("android.settings.WIFI_DISPLAY_SETTINGS")
    )

    /** يُرجع false إن لم يفتح شيء، فتعرض الواجهة الطريقة اليدوية. */
    fun open(context: Context): Boolean {
        for (intent in candidates()) {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            // غير موجود أو غير مسموح به على هذا الجهاز: ننتقل للتالي
            if (runCatching { context.startActivity(intent) }.isSuccess) return true
        }
        return false
    }
}
