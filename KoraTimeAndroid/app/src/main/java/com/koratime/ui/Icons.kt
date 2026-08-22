package com.koratime.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

/**
 * أيقونات التبويبات مرسومة هنا بدل جلب مكتبة `material-icons-extended`.
 * تلك المكتبة تحمل أكثر من ثلاثة آلاف أيقونة لأجل ثلاث نحتاجها، فتُضخّم
 * ملف التثبيت وتدفعه إلى عشرة ملفات dex.
 *
 * كلها على شبكة ٢٤×٢٤ — نفس شبكة أيقونات مِتيريال — فتتناسق معها.
 * اللون هنا شكلي فقط؛ `Icon` يصبغ الأيقونة بلون التبويب.
 */
object KTIcons {

    /** كرة قدم: قرص مصمت بفواصل مفرَّغة، تبقى مقروءة في حجم التبويب الصغير. */
    val Ball: ImageVector by lazy {
        ImageVector.Builder(
            name = "KTBall",
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f
        ).apply {
            path(fill = SolidColor(Color.Black), pathFillType = PathFillType.EvenOdd) {
                // الحدّ الخارجي
                moveTo(2.40f, 12.00f)
                arcTo(9.60f, 9.60f, 0.0f, true, true, 21.60f, 12.00f)
                arcTo(9.60f, 9.60f, 0.0f, true, true, 2.40f, 12.00f)
                close()
                // البنتاغون الأوسط مفرَّغ
                moveTo(12.00f, 8.85f)
                lineTo(15.00f, 11.03f)
                lineTo(13.85f, 14.55f)
                lineTo(10.15f, 14.55f)
                lineTo(9.00f, 11.03f)
                close()
                // خمسة فواصل من رؤوس البنتاغون نحو الحافة
                moveTo(12.62f, 9.00f)
                lineTo(12.62f, 3.00f)
                lineTo(11.38f, 3.00f)
                lineTo(11.38f, 9.00f)
                close()
                moveTo(15.04f, 11.66f)
                lineTo(20.75f, 9.81f)
                lineTo(20.37f, 8.63f)
                lineTo(14.66f, 10.48f)
                close()
                moveTo(13.26f, 14.79f)
                lineTo(16.79f, 19.65f)
                lineTo(17.79f, 18.92f)
                lineTo(14.26f, 14.06f)
                close()
                moveTo(9.74f, 14.06f)
                lineTo(6.21f, 18.92f)
                lineTo(7.21f, 19.65f)
                lineTo(10.74f, 14.79f)
                close()
                moveTo(9.34f, 10.48f)
                lineTo(3.63f, 8.63f)
                lineTo(3.25f, 9.81f)
                lineTo(8.96f, 11.66f)
                close()
            }
        }.build()
    }

    /** زر تشغيل داخل قرص. */
    val PlayCircle: ImageVector by lazy {
        ImageVector.Builder(
            name = "KTPlayCircle",
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f
        ).apply {
            path(fill = SolidColor(Color.Black), pathFillType = PathFillType.EvenOdd) {
                moveTo(2.00f, 12.00f)
                arcTo(10.00f, 10.00f, 0.0f, true, true, 22.00f, 12.00f)
                arcTo(10.00f, 10.00f, 0.0f, true, true, 2.00f, 12.00f)
                close()
                moveTo(9.90f, 7.30f)
                lineTo(16.70f, 12.00f)
                lineTo(9.90f, 16.70f)
                close()
            }
        }.build()
    }

    /** صحيفة: إطار وصورة وأربعة أسطر. */
    val Newspaper: ImageVector by lazy {
        ImageVector.Builder(
            name = "KTNewspaper",
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f
        ).apply {
            // الإطار
            path(
                stroke = SolidColor(Color.Black),
                strokeLineWidth = 1.7f,
                strokeLineJoin = StrokeJoin.Round
            ) {
                moveTo(5.40f, 5.40f)
                lineTo(18.60f, 5.40f)
                arcTo(2.00f, 2.00f, 0.0f, false, true, 20.60f, 7.40f)
                lineTo(20.60f, 16.60f)
                arcTo(2.00f, 2.00f, 0.0f, false, true, 18.60f, 18.60f)
                lineTo(5.40f, 18.60f)
                arcTo(2.00f, 2.00f, 0.0f, false, true, 3.40f, 16.60f)
                lineTo(3.40f, 7.40f)
                arcTo(2.00f, 2.00f, 0.0f, false, true, 5.40f, 5.40f)
                close()
            }
            // مربّع الصورة
            path(fill = SolidColor(Color.Black)) {
                moveTo(6.90f, 8.40f)
                lineTo(10.90f, 8.40f)
                arcTo(0.70f, 0.70f, 0.0f, false, true, 11.60f, 9.10f)
                lineTo(11.60f, 11.30f)
                arcTo(0.70f, 0.70f, 0.0f, false, true, 10.90f, 12.00f)
                lineTo(6.90f, 12.00f)
                arcTo(0.70f, 0.70f, 0.0f, false, true, 6.20f, 11.30f)
                lineTo(6.20f, 9.10f)
                arcTo(0.70f, 0.70f, 0.0f, false, true, 6.90f, 8.40f)
                close()
            }
            // أسطر النصّ
            path(
                stroke = SolidColor(Color.Black),
                strokeLineWidth = 1.7f,
                strokeLineCap = StrokeCap.Round
            ) {
                moveTo(14.20f, 8.90f)
                lineTo(17.80f, 8.90f)
                moveTo(14.20f, 11.50f)
                lineTo(17.80f, 11.50f)
                moveTo(6.20f, 14.60f)
                lineTo(17.80f, 14.60f)
                moveTo(6.20f, 16.60f)
                lineTo(14.20f, 16.60f)
            }
        }.build()
    }
}
