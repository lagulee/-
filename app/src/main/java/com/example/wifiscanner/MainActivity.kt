package com.example.wifiscanner

import android.Manifest
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.wifiscanner.permission.PermissionRationaleDialog
import com.example.wifiscanner.permission.PermissionTexts
import com.example.wifiscanner.ui.camera.CameraScreen
import com.example.wifiscanner.ui.confirm.ConfirmScreen
import com.example.wifiscanner.ui.raw.RawTextScreen
import com.example.wifiscanner.ui.theme.WifiScannerTheme
import com.example.wifiscanner.wifi.NearbyWifiScanner

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            WifiScannerTheme {
                Surface(Modifier.fillMaxSize()) {
                    WifiScannerApp()
                }
            }
        }
    }
}

private enum class PendingRationale { CAMERA, WIFI }

@Composable
fun WifiScannerApp(vm: ScanViewModel = viewModel()) {
    val context = LocalContext.current
    val state by vm.state.collectAsStateWithLifecycle()

    var cameraGranted by remember { mutableStateOf(context.isGranted(Manifest.permission.CAMERA)) }
    // 같은 실행 중에 설명 대화상자를 반복해서 띄우지 않도록 기록한다 (권한 여부만 저장, 민감 정보 없음).
    var askedCamera by rememberSaveable { mutableStateOf(false) }
    var askedWifi by rememberSaveable { mutableStateOf(false) }
    var rationale by remember { mutableStateOf<PendingRationale?>(null) }

    val cameraLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        cameraGranted = granted
        if (!askedWifi && !NearbyWifiScanner(context).hasPermission()) rationale = PendingRationale.WIFI
    }
    val wifiLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        vm.onScanPermissionChanged()
    }
    val galleryLauncher = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        uri?.let(vm::processUri)
    }
    val addNetworkLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        vm.onAddNetworksResult(result.resultCode, result.data)
    }

    // 첫 실행: 카메라 → 주변 와이파이 순서로, 요청 직전에 이유를 설명한다.
    LaunchedEffect(Unit) {
        vm.onScanPermissionChanged()
        rationale = when {
            !cameraGranted && !askedCamera -> PendingRationale.CAMERA
            !askedWifi && !NearbyWifiScanner(context).hasPermission() -> PendingRationale.WIFI
            else -> null
        }
    }
    // 설정 앱에서 권한을 바꾸고 돌아온 경우 반영
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        cameraGranted = context.isGranted(Manifest.permission.CAMERA)
        vm.onScanPermissionChanged()
    }

    fun requestCamera() {
        val activity = context.findActivity()
        val permanentlyDenied = askedCamera && activity != null &&
            !ActivityCompat.shouldShowRequestPermissionRationale(activity, Manifest.permission.CAMERA)
        if (permanentlyDenied) context.openAppSettings() else rationale = PendingRationale.CAMERA
    }

    fun requestWifi() {
        val activity = context.findActivity()
        val permanentlyDenied = askedWifi && activity != null &&
            NearbyWifiScanner.scanPermissions().none { ActivityCompat.shouldShowRequestPermissionRationale(activity, it) }
        if (permanentlyDenied) context.openAppSettings() else rationale = PendingRationale.WIFI
    }

    when (rationale) {
        PendingRationale.CAMERA -> PermissionRationaleDialog(
            title = PermissionTexts.CAMERA_TITLE,
            message = PermissionTexts.CAMERA_MESSAGE,
            onContinue = {
                rationale = null
                askedCamera = true
                cameraLauncher.launch(Manifest.permission.CAMERA)
            },
            onDismiss = {
                rationale = null
                askedCamera = true
                if (!askedWifi && !NearbyWifiScanner(context).hasPermission()) rationale = PendingRationale.WIFI
            },
        )
        PendingRationale.WIFI -> PermissionRationaleDialog(
            title = PermissionTexts.WIFI_TITLE,
            message = PermissionTexts.WIFI_MESSAGE,
            onContinue = {
                rationale = null
                askedWifi = true
                wifiLauncher.launch(NearbyWifiScanner.scanPermissionsToRequest())
            },
            onDismiss = {
                rationale = null
                askedWifi = true
            },
        )
        null -> Unit
    }

    BackHandler(enabled = state.screen == Screen.CONFIRM || state.screen == Screen.RAW_TEXT) {
        if (state.screen == Screen.RAW_TEXT && state.parse?.isEmpty == false) vm.openConfirm() else vm.retake()
    }

    when (state.screen) {
        Screen.CAMERA -> CameraScreen(
            hasCameraPermission = cameraGranted,
            nearbyEnabled = state.nearbyEnabled,
            message = state.message,
            onRequestCameraPermission = ::requestCamera,
            onRequestWifiPermission = ::requestWifi,
            onCaptured = vm::processBitmap,
            onCaptureError = vm::onCaptureError,
            onPickFromGallery = {
                vm.clearMessage()
                galleryLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
            },
        )

        Screen.PROCESSING -> ProcessingScreen()

        Screen.CONFIRM -> ConfirmScreen(
            state = state,
            rankedNearby = vm.rankedNearby(),
            onSsidChange = vm::onSsidChanged,
            onPasswordChange = vm::onPasswordChanged,
            onSecurityChange = vm::onSecurityChanged,
            onConnect = {
                vm.prepareConnectIntent()?.let { intent ->
                    try {
                        addNetworkLauncher.launch(intent)
                    } catch (e: ActivityNotFoundException) {
                        // 일부 제조사 기기에 시스템 저장 화면이 없으면 연결 제안으로 대신한다.
                        vm.connectWithSuggestion()
                    }
                }
            },
            onTrySuggestion = vm::connectWithSuggestion,
            onOpenWifiSettings = {
                runCatching { context.startActivity(Intent(Settings.Panel.ACTION_WIFI)) }
            },
            onOpenRawText = vm::openRawText,
            onRetake = vm::retake,
        )

        Screen.RAW_TEXT -> RawTextScreen(
            state = state,
            onAssign = vm::assign,
            onDone = vm::openConfirm,
            onRetake = vm::retake,
        )
    }
}

@Composable
private fun ProcessingScreen() {
    Column(
        Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CircularProgressIndicator()
        Spacer(Modifier.height(16.dp))
        Text("안내문의 글자를 읽고 있어요…", style = MaterialTheme.typography.titleMedium)
    }
}

private fun Context.isGranted(permission: String): Boolean =
    ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

private fun Context.findActivity(): Activity? {
    var ctx: Context? = this
    while (ctx is ContextWrapper) {
        if (ctx is Activity) return ctx
        ctx = ctx.baseContext
    }
    return null
}

private fun Context.openAppSettings() {
    startActivity(
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
    )
}
