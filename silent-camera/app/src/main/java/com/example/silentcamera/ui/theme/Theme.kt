package com.example.silentcamera.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val CameraColorScheme = darkColorScheme(
    primary = Color(0xFFFFFFFF),
    onPrimary = Color(0xFF000000),
    secondary = Color(0xFFFFD54F),
    background = Color(0xFF000000),
    onBackground = Color(0xFFFFFFFF),
    surface = Color(0xFF121212),
    onSurface = Color(0xFFFFFFFF),
)

/** 카메라 앱은 시스템 다크 모드와 무관하게 항상 어두운 테마를 쓴다. */
@Composable
fun SilentCameraTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = CameraColorScheme, content = content)
}
