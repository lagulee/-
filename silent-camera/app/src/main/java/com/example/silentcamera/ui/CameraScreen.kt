package com.example.silentcamera.ui

import android.content.res.Configuration
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import com.example.silentcamera.R

/** 1단계 골격: 카메라 화면 자리. 이후 단계에서 권한 흐름과 미리보기로 교체된다. */
@Composable
fun CameraScreen() {
    val configuration = LocalConfiguration.current
    val orientation =
        if (configuration.orientation == Configuration.ORIENTATION_LANDSCAPE) "가로" else "세로"
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = stringResource(R.string.app_name),
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.onBackground,
        )
        Text(
            text = "$orientation · ${configuration.screenWidthDp}×${configuration.screenHeightDp}dp" +
                " · sw${configuration.smallestScreenWidthDp}dp",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onBackground,
        )
    }
}
