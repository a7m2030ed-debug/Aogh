package com.koratime.ui

import com.koratime.R

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.res.stringResource

/** لوحة ألوان كورة تايم — مطابقة لنسخة الآيفون حرفياً. */
object KT {
    val bg = Color(0xFF04120E)
    val bgSoft = Color(0xFF081B15)
    val card = Color(0xFF0C231C)
    val cardHigh = Color(0xFF112E25)
    val accent = Color(0xFF00D68F)
    val accentDim = Color(0xFF008B5D)
    val live = Color(0xFFFF4A55)
    val gold = Color(0xFFFFC74B)
    val text = Color(0xFFF7F7F7)
    val textSecondary = Color(0xFFADADAD)
    val textFaint = Color(0xFF7A7A7A)
    val hairline = Color(0x12FFFFFF)
}

private val colorScheme = darkColorScheme(
    primary = KT.accent,
    onPrimary = KT.bg,
    background = KT.bg,
    onBackground = KT.text,
    surface = KT.card,
    onSurface = KT.text,
    surfaceVariant = KT.cardHigh,
    onSurfaceVariant = KT.textSecondary,
    error = KT.live,
)

@Composable
fun KoraTimeTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = colorScheme, content = content)
}

/** خلفية موحّدة: تدرّج أخضر داكن مع وهج علوي خفيف. */
@Composable
fun KTBackground(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Box(
        modifier = modifier.background(
            Brush.verticalGradient(listOf(Color(0xFF0A2A1F), KT.bg, KT.bg))
        )
    ) {
        content()
    }
}

@Composable
fun SectionTitle(title: String, subtitle: String? = null, trailing: @Composable (() -> Unit)? = null) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(title, fontSize = 24.sp, fontWeight = FontWeight.ExtraBold, color = KT.text)
            if (subtitle != null) {
                Text(subtitle, fontSize = 12.sp, color = KT.textFaint)
            }
        }
        trailing?.invoke()
    }
}

@Composable
fun KTCard(
    modifier: Modifier = Modifier,
    padding: PaddingValues = PaddingValues(14.dp),
    highlighted: Boolean = false,
    content: @Composable () -> Unit
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .background(if (highlighted) KT.cardHigh else KT.card)
            .padding(padding)
    ) {
        content()
    }
}

/** شارة «مباشر» الحمراء. */
@Composable
fun LiveBadge(text: String = stringResource(R.string.status_live), compact: Boolean = false) {
    Row(
        modifier = Modifier
            .clip(CircleShape)
            .background(KT.live.copy(alpha = 0.15f))
            .padding(horizontal = if (compact) 6.dp else 8.dp, vertical = if (compact) 2.dp else 3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Box(
            modifier = Modifier
                .size(if (compact) 5.dp else 6.dp)
                .clip(CircleShape)
                .background(KT.live)
        )
        Text(
            text,
            fontSize = if (compact) 10.sp else 11.sp,
            fontWeight = FontWeight.Bold,
            color = KT.live,
            maxLines = 1
        )
    }
}

/** حالة فارغة أو رسالة خطأ بتنسيق موحّد. */
@Composable
fun KTMessage(
    title: String,
    message: String? = null,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp, vertical = 40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text(
            title,
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold,
            color = KT.text,
            textAlign = TextAlign.Center
        )
        if (message != null) {
            Text(
                message,
                fontSize = 13.sp,
                color = KT.textSecondary,
                textAlign = TextAlign.Center,
                overflow = TextOverflow.Ellipsis
            )
        }
        if (actionLabel != null && onAction != null) {
            Text(
                actionLabel,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                color = KT.accent,
                modifier = Modifier
                    .clip(CircleShape)
                    .background(KT.accent.copy(alpha = 0.16f))
                    .padding(horizontal = 18.dp, vertical = 8.dp)
            )
        }
    }
}
