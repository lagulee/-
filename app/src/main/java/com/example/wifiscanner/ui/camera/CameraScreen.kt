package com.example.wifiscanner.ui.camera

import android.graphics.Bitmap
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.view.CameraController
import androidx.camera.view.LifecycleCameraController
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material3.Button
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner

/**
 * 카메라 미리보기 + 촬영 버튼 + 갤러리에서 불러오기.
 * 카메라 권한이 없으면 미리보기 대신 안내와 권한 요청 버튼을 보여 준다(갤러리는 그대로 사용 가능).
 */
@Composable
fun CameraScreen(
    hasCameraPermission: Boolean,
    nearbyEnabled: Boolean,
    message: String?,
    onRequestCameraPermission: () -> Unit,
    onRequestWifiPermission: () -> Unit,
    onCaptured: (Bitmap, Int) -> Unit,
    onCaptureError: () -> Unit,
    onPickFromGallery: () -> Unit,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var capturing by remember { mutableStateOf(false) }

    val cameraController = remember(hasCameraPermission) {
        if (!hasCameraPermission) null
        else LifecycleCameraController(context).apply {
            setEnabledUseCases(CameraController.IMAGE_CAPTURE)
            imageCaptureMode = ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY
        }
    }
    DisposableEffect(cameraController, lifecycleOwner) {
        cameraController?.bindToLifecycle(lifecycleOwner)
        onDispose { cameraController?.unbind() }
    }

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        if (cameraController != null) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { ctx ->
                    PreviewView(ctx).apply {
                        scaleType = PreviewView.ScaleType.FILL_CENTER
                        controller = cameraController
                    }
                },
            )
            // 안내문을 맞출 가이드 틀
            Box(
                Modifier
                    .align(Alignment.Center)
                    .fillMaxWidth(0.85f)
                    .height(260.dp)
                    .background(Color.White.copy(alpha = 0.08f), RoundedCornerShape(16.dp)),
            )
        } else {
            Column(
                Modifier.align(Alignment.Center).padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    "카메라 권한이 없어 미리보기를 표시할 수 없습니다.\n갤러리에서 안내문 사진을 불러오거나 권한을 허용해 주세요.",
                    color = Color.White,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(16.dp))
                Button(onClick = onRequestCameraPermission) { Text("카메라 권한 허용") }
            }
        }

        Column(
            Modifier.align(Alignment.TopCenter).statusBarsPadding().padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                "와이파이 안내문이나 QR 코드를 화면 가운데에 맞춰 찍어 주세요",
                color = Color.White,
                style = MaterialTheme.typography.titleMedium,
                textAlign = TextAlign.Center,
                modifier = Modifier.background(Color.Black.copy(alpha = 0.5f), RoundedCornerShape(8.dp)).padding(12.dp),
            )
            if (!nearbyEnabled) {
                Spacer(Modifier.height(8.dp))
                OutlinedButton(onClick = onRequestWifiPermission) {
                    Text("와이파이 이름 자동 교정 꺼짐 · 켜기", color = Color.White)
                }
            }
            if (message != null) {
                Spacer(Modifier.height(8.dp))
                Text(
                    message,
                    color = Color.White,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.background(MaterialTheme.colorScheme.error.copy(alpha = 0.85f), RoundedCornerShape(8.dp)).padding(12.dp),
                )
            }
        }

        Row(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().padding(bottom = 32.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            FilledIconButton(
                onClick = onPickFromGallery,
                modifier = Modifier.size(56.dp),
            ) { Icon(Icons.Filled.PhotoLibrary, contentDescription = "갤러리에서 불러오기") }

            FilledIconButton(
                onClick = {
                    val c = cameraController
                    if (c == null) {
                        onRequestCameraPermission()
                    } else if (!capturing) {
                        capturing = true
                        c.takePicture(
                            ContextCompat.getMainExecutor(context),
                            object : ImageCapture.OnImageCapturedCallback() {
                                override fun onCaptureSuccess(image: ImageProxy) {
                                    val rotation = image.imageInfo.rotationDegrees
                                    val bitmap = image.toBitmap()
                                    image.close()
                                    capturing = false
                                    onCaptured(bitmap, rotation)
                                }

                                override fun onError(exception: ImageCaptureException) {
                                    capturing = false
                                    onCaptureError()
                                }
                            },
                        )
                    }
                },
                enabled = !capturing,
                shape = CircleShape,
                colors = IconButtonDefaults.filledIconButtonColors(containerColor = Color.White, contentColor = Color.Black),
                modifier = Modifier.size(80.dp),
            ) { Icon(Icons.Filled.CameraAlt, contentDescription = "촬영", modifier = Modifier.size(36.dp)) }

            Spacer(Modifier.size(56.dp))
        }
    }
}
