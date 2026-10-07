package com.example.silentcamera

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.example.silentcamera.ui.CameraScreen
import com.example.silentcamera.ui.theme.SilentCameraTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            SilentCameraTheme {
                CameraScreen()
            }
        }
    }
}
