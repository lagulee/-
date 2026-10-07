package com.example.wifiscanner

import android.app.Application
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.wifiscanner.ocr.WifiTextRecognizer
import com.example.wifiscanner.wifi.ConnectOutcome
import com.example.wifiscanner.wifi.NearbyWifiScanner
import com.example.wifiscanner.wifi.WifiConnector
import com.example.wifiscanner.wifiparser.Extracted
import com.example.wifiscanner.wifiparser.NearbyNetwork
import com.example.wifiscanner.wifiparser.ParseResult
import com.example.wifiscanner.wifiparser.SecurityType
import com.example.wifiscanner.wifiparser.Source
import com.example.wifiscanner.wifiparser.WifiParser
import com.google.mlkit.vision.common.InputImage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

enum class Screen { CAMERA, PROCESSING, CONFIRM, RAW_TEXT }

enum class TargetField { SSID, PASSWORD }

/**
 * 화면 상태. 비밀번호는 이 객체(메모리)에만 있고 SavedState·파일·설정 어디에도 저장하지 않는다.
 * toString()에서도 비밀번호를 가린다.
 */
data class UiState(
    val screen: Screen = Screen.CAMERA,
    val ocrLines: List<String> = emptyList(),
    val parse: ParseResult? = null,
    val nearby: List<NearbyNetwork> = emptyList(),
    val nearbyEnabled: Boolean = false,
    val ssid: String = "",
    val password: String = "",
    val security: SecurityType = SecurityType.WPA2,
    val hidden: Boolean = false,
    val ssidConfidence: Extracted? = null,
    val passwordConfidence: Extracted? = null,
    val message: String? = null,
    val canTrySuggestion: Boolean = false,
    val connected: Boolean = false,
) {
    override fun toString(): String =
        "UiState(screen=$screen, ssid=$ssid, password=<${password.length}자>, security=$security, nearby=${nearby.size})"
}

class ScanViewModel(application: Application) : AndroidViewModel(application) {

    private val recognizer = WifiTextRecognizer()
    private val scanner = NearbyWifiScanner(application)
    private val connector = WifiConnector(application)

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    // ------------------------------------------------------------ 주변 와이파이

    /** 위치/근처 기기 권한 상태가 바뀌었을 때 호출. 허용되면 미리 스캔해 둔다. */
    fun onScanPermissionChanged() {
        val enabled = scanner.hasPermission()
        _state.update { it.copy(nearbyEnabled = enabled) }
        if (enabled) {
            _state.update { it.copy(nearby = scanner.cachedResults()) }
            viewModelScope.launch {
                val results = scanner.scan()
                _state.update { it.copy(nearby = results) }
            }
        }
    }

    // ------------------------------------------------------------ 이미지 처리

    fun processBitmap(bitmap: Bitmap, rotationDegrees: Int) {
        process { InputImage.fromBitmap(bitmap, rotationDegrees) }
    }

    fun processUri(uri: Uri) {
        process { withContext(Dispatchers.IO) { InputImage.fromFilePath(getApplication(), uri) } }
    }

    fun onCaptureError() {
        _state.update { it.copy(message = "사진을 찍지 못했습니다. 다시 시도해 주세요.") }
    }

    private fun process(loadImage: suspend () -> InputImage) {
        _state.update { it.copy(screen = Screen.PROCESSING, message = null, canTrySuggestion = false, connected = false) }
        viewModelScope.launch {
            try {
                val nearbyJob = async { if (scanner.hasPermission()) scanner.scan(timeoutMs = 3_000) else emptyList() }
                val ocr = recognizer.recognize(loadImage())
                val nearby = nearbyJob.await().ifEmpty { _state.value.nearby }
                val result = WifiParser.parse(ocr.lines, nearby, ocr.qrPayloads)
                applyResult(ocr.lines, nearby, result)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // 예외 내용에는 인식 문자열이 들어 있을 수 있으므로 기록하지 않는다.
                _state.update { it.copy(screen = Screen.CAMERA, message = "글자를 읽지 못했습니다. 안내문이 잘 보이도록 다시 찍어 주세요.") }
            }
        }
    }

    private fun applyResult(lines: List<String>, nearby: List<NearbyNetwork>, result: ParseResult) {
        val screen = when {
            !result.isEmpty -> Screen.CONFIRM
            lines.isNotEmpty() -> Screen.RAW_TEXT
            else -> null
        }
        if (screen == null) {
            _state.update { it.copy(screen = Screen.CAMERA, message = "사진에서 글자를 찾지 못했습니다. 안내문을 가까이에서 다시 찍어 주세요.") }
            return
        }
        _state.update {
            it.copy(
                screen = screen,
                ocrLines = lines,
                parse = result,
                nearby = nearby,
                ssid = result.ssid?.value.orEmpty(),
                password = result.password?.value.orEmpty(),
                security = result.security ?: SecurityType.WPA2,
                hidden = result.hidden,
                ssidConfidence = result.ssid,
                passwordConfidence = result.password,
                message = if (screen == Screen.RAW_TEXT) "와이파이 정보를 자동으로 찾지 못했습니다. 아래 글자를 눌러 직접 지정해 주세요." else null,
            )
        }
    }

    // ------------------------------------------------------------ 확인 화면 입력

    fun onSsidChanged(ssid: String) {
        _state.update { s ->
            val network = s.nearby.filter { it.ssid == ssid }.maxByOrNull { it.rssi }
            s.copy(
                ssid = ssid,
                security = network?.security ?: s.security,
                ssidConfidence = s.ssidConfidence?.takeIf { it.value == ssid },
            )
        }
    }

    fun onPasswordChanged(password: String) {
        _state.update { s -> s.copy(password = password, passwordConfidence = s.passwordConfidence?.takeIf { it.value == password }) }
    }

    fun onSecurityChanged(security: SecurityType) {
        _state.update { it.copy(security = security) }
    }

    /** 원문 화면에서 탭한 글자를 SSID 또는 비밀번호로 지정한다. */
    fun assign(text: String, field: TargetField) {
        val value = text.trim()
        when (field) {
            TargetField.SSID -> {
                // 사용자가 고른 값도 주변 목록과 비교해 오타를 교정한다.
                val corrected = WifiParser.findClosestNetwork(value, _state.value.nearby)
                onSsidChanged(corrected?.ssid ?: value)
                _state.update { it.copy(ssidConfidence = Extracted(it.ssid, 1.0, Source.USER)) }
            }
            TargetField.PASSWORD -> {
                onPasswordChanged(value)
                _state.update { it.copy(passwordConfidence = Extracted(value, 1.0, Source.USER)) }
            }
        }
    }

    fun rankedNearby(): List<NearbyNetwork> = WifiParser.rankNearby(_state.value.ssid, _state.value.nearby)

    fun openRawText() = _state.update { it.copy(screen = Screen.RAW_TEXT, message = null) }

    fun openConfirm() = _state.update { it.copy(screen = Screen.CONFIRM, message = null) }

    /** 다시 촬영. 이전 비밀번호와 원문을 메모리에서 지운다. */
    fun retake() {
        _state.update {
            UiState(nearby = it.nearby, nearbyEnabled = it.nearbyEnabled)
        }
    }

    fun clearMessage() = _state.update { it.copy(message = null) }

    // ------------------------------------------------------------ 연결

    /** 검증 후 시스템 저장 화면 Intent를 돌려준다. 문제가 있으면 메시지를 띄우고 null. */
    fun prepareConnectIntent(): Intent? {
        val s = _state.value
        if (!connector.isWifiEnabled()) {
            _state.update { it.copy(message = "와이파이가 꺼져 있습니다. 와이파이를 켠 뒤 다시 눌러 주세요.") }
            return null
        }
        connector.validate(s.ssid, s.password, s.security)?.let { error ->
            _state.update { it.copy(message = error, canTrySuggestion = false) }
            return null
        }
        return connector.buildAddNetworksIntent(buildSuggestion(s))
    }

    fun onAddNetworksResult(resultCode: Int, data: Intent?) {
        applyOutcome(connector.interpretAddNetworksResult(resultCode, data))
    }

    fun connectWithSuggestion() {
        applyOutcome(connector.addSuggestion(buildSuggestion(_state.value)))
    }

    private fun buildSuggestion(s: UiState) =
        connector.buildSuggestion(s.ssid.trim(), s.password, s.security, s.hidden)

    private fun applyOutcome(outcome: ConnectOutcome) {
        _state.update {
            when (outcome) {
                is ConnectOutcome.Success -> it.copy(message = outcome.message, canTrySuggestion = false, connected = true)
                is ConnectOutcome.Failure -> it.copy(message = outcome.message, canTrySuggestion = outcome.canTrySuggestion, connected = false)
            }
        }
    }

    override fun onCleared() {
        recognizer.close()
        _state.value = UiState()
    }
}
