package com.koratime.cast

import android.content.Context
import com.google.android.gms.cast.framework.CastOptions
import com.google.android.gms.cast.framework.OptionsProvider
import com.google.android.gms.cast.framework.SessionProvider
import com.google.android.gms.cast.framework.media.CastMediaOptions
import com.google.android.gms.cast.framework.media.NotificationOptions

/**
 * إعدادات البثّ إلى الشاشات الذكية.
 *
 * نستعمل «المستقبل الافتراضي» من غوغل لأنه يشغّل HLS مباشرة بلا حاجة إلى
 * تسجيل تطبيق مستقبل خاص ولا رسوم — وهو ما يناسب تطبيقاً يُثبَّت بملف
 * مباشر. المقابل أن الشاشة تعرض واجهة غوغل القياسية لا واجهتنا.
 */
class KTCastOptionsProvider : OptionsProvider {

    override fun getCastOptions(context: Context): CastOptions {
        val media = CastMediaOptions.Builder()
            .setNotificationOptions(
                NotificationOptions.Builder()
                    .setTargetActivityClassName("com.koratime.MainActivity")
                    .build()
            )
            .build()

        return CastOptions.Builder()
            .setReceiverApplicationId(DEFAULT_RECEIVER_ID)
            .setCastMediaOptions(media)
            .setStopReceiverApplicationWhenEndingSession(true)
            .build()
    }

    override fun getAdditionalSessionProviders(context: Context): List<SessionProvider>? = null

    private companion object {
        /** المستقبل الافتراضي المعلن من غوغل — CastMediaControlIntent. */
        const val DEFAULT_RECEIVER_ID = "CC1AD845"
    }
}
