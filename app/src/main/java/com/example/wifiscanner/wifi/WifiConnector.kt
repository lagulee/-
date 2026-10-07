package com.example.wifiscanner.wifi

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.wifi.WifiManager
import android.net.wifi.WifiNetworkSuggestion
import android.provider.Settings
import com.example.wifiscanner.wifiparser.SecurityType

/** 연결 요청 결과를 화면에 보여 줄 문구로 바꾼 것. */
sealed interface ConnectOutcome {
    val message: String

    data class Success(override val message: String) : ConnectOutcome
    data class Failure(override val message: String, val canTrySuggestion: Boolean) : ConnectOutcome
}

/**
 * 와이파이 연결.
 * 1순위: Settings.ACTION_WIFI_ADD_NETWORKS — 시스템 저장 화면에서 사용자가 확인하면 기기에 저장되고 연결된다.
 * 2순위: WifiManager.addNetworkSuggestions — 시스템 화면을 쓸 수 없을 때 연결 제안으로 등록한다.
 * deprecated된 WifiManager.addNetwork는 사용하지 않는다.
 * 비밀번호는 WifiNetworkSuggestion에 담아 시스템에 넘기기만 하고 앱에는 남기지 않는다.
 */
class WifiConnector(context: Context) {

    private val wifiManager = context.applicationContext.getSystemService(WifiManager::class.java)

    fun isWifiEnabled(): Boolean = wifiManager.isWifiEnabled

    /** 입력값 검증. 문제가 없으면 null, 있으면 사용자에게 보여 줄 문구. */
    fun validate(ssid: String, password: String, security: SecurityType): String? = when {
        ssid.isBlank() -> "와이파이 이름(SSID)을 입력해 주세요."
        ssid.toByteArray(Charsets.UTF_8).size > 32 -> "와이파이 이름이 너무 깁니다. (최대 32바이트)"
        security == SecurityType.WEP -> "WEP 방식은 보안이 취약해 Android에서 앱을 통한 연결을 지원하지 않습니다. 설정 앱에서 직접 연결해 주세요."
        security == SecurityType.ENTERPRISE -> "기업용(EAP) 와이파이는 이 앱에서 연결할 수 없습니다. 설정 앱에서 직접 연결해 주세요."
        security.needsPassword && password.length !in 8..63 -> "비밀번호는 8~63자여야 합니다. 빠지거나 잘못 읽힌 글자가 없는지 확인해 주세요."
        else -> null
    }

    fun buildSuggestion(ssid: String, password: String, security: SecurityType, hidden: Boolean): WifiNetworkSuggestion =
        WifiNetworkSuggestion.Builder()
            .setSsid(ssid)
            .apply {
                when (security) {
                    SecurityType.WPA2 -> setWpa2Passphrase(password)
                    SecurityType.WPA3 -> setWpa3Passphrase(password)
                    SecurityType.OWE -> setIsEnhancedOpen(true)
                    else -> Unit // 개방형
                }
                if (hidden) setIsHiddenSsid(true)
            }
            .build()

    /** 시스템 "네트워크 저장" 화면을 여는 Intent. startActivityForResult로 실행해야 한다. */
    fun buildAddNetworksIntent(suggestion: WifiNetworkSuggestion): Intent =
        Intent(Settings.ACTION_WIFI_ADD_NETWORKS).putParcelableArrayListExtra(
            Settings.EXTRA_WIFI_NETWORK_LIST,
            arrayListOf(suggestion),
        )

    fun interpretAddNetworksResult(resultCode: Int, data: Intent?): ConnectOutcome {
        if (resultCode != Activity.RESULT_OK) {
            return ConnectOutcome.Failure("저장이 취소되었습니다.", canTrySuggestion = true)
        }
        val code = data?.getIntegerArrayListExtra(Settings.EXTRA_WIFI_NETWORK_RESULT_LIST)?.firstOrNull()
        return when (code) {
            Settings.ADD_WIFI_RESULT_SUCCESS, null ->
                ConnectOutcome.Success("와이파이를 저장했습니다. 잠시 후 자동으로 연결됩니다.")
            Settings.ADD_WIFI_RESULT_ALREADY_EXISTS ->
                ConnectOutcome.Success("이미 같은 설정으로 저장된 와이파이입니다. 자동으로 연결됩니다.")
            else ->
                ConnectOutcome.Failure("시스템이 와이파이를 저장하지 못했습니다.", canTrySuggestion = true)
        }
    }

    /** 2순위: 연결 제안으로 등록한다. 사용자가 알림에서 허용하면 시스템이 연결한다. */
    fun addSuggestion(suggestion: WifiNetworkSuggestion): ConnectOutcome {
        return try {
            var status = wifiManager.addNetworkSuggestions(listOf(suggestion))
            if (status == WifiManager.STATUS_NETWORK_SUGGESTIONS_ERROR_ADD_DUPLICATE) {
                wifiManager.removeNetworkSuggestions(listOf(suggestion))
                status = wifiManager.addNetworkSuggestions(listOf(suggestion))
            }
            when (status) {
                WifiManager.STATUS_NETWORK_SUGGESTIONS_SUCCESS -> ConnectOutcome.Success(
                    "연결 제안을 등록했습니다. 알림이 오면 'WiFi 스캐너'의 제안을 허용해 주세요. 근처에 있으면 자동으로 연결됩니다.",
                )
                WifiManager.STATUS_NETWORK_SUGGESTIONS_ERROR_APP_DISALLOWED -> ConnectOutcome.Failure(
                    "이 앱의 와이파이 제안이 차단되어 있습니다. 설정 > 앱 > WiFi 스캐너에서 와이파이 제어를 허용해 주세요.",
                    canTrySuggestion = false,
                )
                else -> ConnectOutcome.Failure("연결 제안을 등록하지 못했습니다. (오류 코드 $status)", canTrySuggestion = false)
            }
        } catch (e: SecurityException) {
            ConnectOutcome.Failure("와이파이 변경 권한이 없어 연결 제안을 등록하지 못했습니다.", canTrySuggestion = false)
        }
    }
}
