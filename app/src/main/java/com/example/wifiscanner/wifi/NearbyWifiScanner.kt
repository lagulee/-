package com.example.wifiscanner.wifi

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.wifi.ScanResult
import android.net.wifi.WifiManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.example.wifiscanner.wifiparser.NearbyNetwork
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume

/** 주변 와이파이 목록을 읽는다. 권한이 없거나 위치가 꺼져 있으면 빈 목록을 돌려준다. */
class NearbyWifiScanner(context: Context) {

    private val appContext = context.applicationContext
    private val wifiManager = appContext.getSystemService(WifiManager::class.java)

    fun hasPermission(): Boolean = scanPermissions().all {
        ContextCompat.checkSelfPermission(appContext, it) == PackageManager.PERMISSION_GRANTED
    }

    /** 마지막으로 캐시된 스캔 결과. */
    fun cachedResults(): List<NearbyNetwork> {
        if (!hasPermission()) return emptyList()
        return try {
            wifiManager.scanResults.mapNotNull { it.toNearbyNetwork() }
        } catch (e: SecurityException) {
            emptyList()
        }
    }

    /**
     * 새 스캔을 요청하고 결과를 기다린다(최대 [timeoutMs]).
     * 시스템이 스캔 횟수를 제한(포그라운드 2분에 4회)하므로 실패하면 캐시된 결과를 쓴다.
     */
    suspend fun scan(timeoutMs: Long = 4_000): List<NearbyNetwork> {
        if (!hasPermission()) return emptyList()
        var receiver: BroadcastReceiver? = null
        try {
            withTimeoutOrNull(timeoutMs) {
                suspendCancellableCoroutine<Unit> { cont ->
                    val r = object : BroadcastReceiver() {
                        override fun onReceive(context: Context, intent: Intent) {
                            if (cont.isActive) cont.resume(Unit)
                        }
                    }
                    receiver = r
                    ContextCompat.registerReceiver(
                        appContext,
                        r,
                        IntentFilter(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION),
                        ContextCompat.RECEIVER_NOT_EXPORTED,
                    )
                    @Suppress("DEPRECATION") // 대체 API가 없다. 실패해도 캐시된 결과로 동작한다.
                    val started = runCatching { wifiManager.startScan() }.getOrDefault(false)
                    if (!started && cont.isActive) cont.resume(Unit)
                }
            }
        } finally {
            receiver?.let { runCatching { appContext.unregisterReceiver(it) } }
        }
        return cachedResults()
    }

    private fun ScanResult.toNearbyNetwork(): NearbyNetwork? {
        val name = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            wifiSsid?.bytes?.toString(Charsets.UTF_8)
        } else {
            @Suppress("DEPRECATION")
            SSID
        }
        if (name.isNullOrBlank() || name == "<unknown ssid>") return null
        return NearbyNetwork(ssid = name, rssi = level, capabilities = capabilities.orEmpty())
    }

    companion object {
        /** SSID 교정을 위해 요청하는 권한 목록. */
        fun scanPermissions(): List<String> = buildList {
            add(Manifest.permission.ACCESS_FINE_LOCATION)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) add(Manifest.permission.NEARBY_WIFI_DEVICES)
        }

        /** 런타임에 실제로 요청할 목록 (Android 12+는 FINE과 COARSE를 함께 요청해야 한다). */
        fun scanPermissionsToRequest(): Array<String> =
            (scanPermissions() + Manifest.permission.ACCESS_COARSE_LOCATION).distinct().toTypedArray()
    }
}
