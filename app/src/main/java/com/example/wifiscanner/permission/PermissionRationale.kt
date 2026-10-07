package com.example.wifiscanner.permission

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable

/** 권한을 요청하기 직전에 왜 필요한지 설명하는 대화상자. */
@Composable
fun PermissionRationaleDialog(
    title: String,
    message: String,
    onContinue: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(message) },
        confirmButton = { TextButton(onClick = onContinue) { Text("계속") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("나중에") } },
    )
}

object PermissionTexts {
    const val CAMERA_TITLE = "카메라 권한이 필요해요"
    const val CAMERA_MESSAGE =
        "와이파이 안내문을 찍어서 이름과 비밀번호를 읽기 위해 카메라를 사용합니다.\n\n" +
            "사진은 기기 안에서만 분석되고 저장하거나 전송하지 않습니다.\n" +
            "허용하지 않아도 갤러리에서 사진을 불러와 사용할 수 있습니다."

    const val WIFI_TITLE = "주변 와이파이 목록을 볼 수 있게 해 주세요"
    const val WIFI_MESSAGE =
        "사진에서 읽은 와이파이 이름에 오타가 있을 때, 실제 주변 와이파이 이름과 비교해 자동으로 고쳐 드립니다. " +
            "또 와이파이의 보안 방식(WPA2/WPA3/개방형)도 알아냅니다.\n\n" +
            "Android에서는 주변 와이파이 목록을 읽으려면 '위치' 권한(Android 13 이상은 '근처 기기' 권한도)이 필요합니다. " +
            "위치 정보 자체는 사용하거나 저장하지 않습니다.\n\n" +
            "허용하지 않아도 앱은 동작하지만, 와이파이 이름 자동 교정은 꺼집니다."
}
