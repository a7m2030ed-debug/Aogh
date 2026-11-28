package com.koratime.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.koratime.R
import com.koratime.core.AppText
import com.koratime.core.AppVersionInfo

/** يفتح المتجر أو صفحة التنزيل، ويتجاهل غياب متصفّح بدل أن ينهار. */
fun openUrl(context: Context, url: String) {
    runCatching {
        context.startActivity(
            Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    }
}

/** شريط يعلو الشاشة ولا يحجبها. */
@Composable
fun UpdateBanner(
    info: AppVersionInfo,
    arabic: Boolean,
    onUpdate: () -> Unit,
    onLater: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(KT.card)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                info.title(arabic),
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                color = KT.text
            )
            Text(
                info.notes(arabic) ?: AppText.get(R.string.update_version, info.latest),
                fontSize = 11.sp,
                color = KT.textFaint,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
        }

        Text(
            AppText.get(R.string.update_later),
            fontSize = 12.sp,
            color = KT.textFaint,
            modifier = Modifier
                .clip(CircleShape)
                .clickable { onLater() }
                .padding(horizontal = 10.dp, vertical = 6.dp)
        )

        Text(
            AppText.get(R.string.update_now),
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            color = KT.bg,
            modifier = Modifier
                .clip(CircleShape)
                .background(KT.accent)
                .clickable { onUpdate() }
                .padding(horizontal = 14.dp, vertical = 7.dp)
        )
    }
}

/** لا تظهر إلا إن رُفع أدنى إصدار مقبول عمداً. */
@Composable
fun UpdateRequiredScreen(
    info: AppVersionInfo,
    arabic: Boolean,
    onUpdate: () -> Unit
) {
    Box(
        modifier = Modifier.fillMaxSize().background(KT.bg),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(14.dp),
            modifier = Modifier.padding(24.dp)
        ) {
            Text(
                AppText.get(R.string.update_required_title),
                fontSize = 20.sp,
                fontWeight = FontWeight.Black,
                color = KT.text,
                textAlign = TextAlign.Center
            )
            Text(
                info.notes(arabic) ?: AppText.get(R.string.update_required_body),
                fontSize = 14.sp,
                color = KT.textSecondary,
                textAlign = TextAlign.Center,
                modifier = Modifier.widthIn(max = 320.dp)
            )
            Text(
                AppText.get(R.string.update_now),
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = KT.bg,
                modifier = Modifier
                    .clip(CircleShape)
                    .background(KT.accent)
                    .clickable { onUpdate() }
                    .padding(horizontal = 40.dp, vertical = 13.dp)
            )
            Text(
                AppText.get(R.string.update_version, info.latest),
                fontSize = 11.sp,
                color = KT.textFaint
            )
        }
    }
}
