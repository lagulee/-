package com.example.wifiscanner.wifiparser

enum class SecurityType {
    OPEN,

    /** Enhanced Open(OWE). 비밀번호 없이 암호화되는 개방형 */
    OWE,
    WEP,

    /** WPA/WPA2-Personal (WPA2/WPA3 전환 모드 포함) */
    WPA2,

    /** WPA3-Personal 전용(SAE) */
    WPA3,

    /** WPA2/WPA3-Enterprise(EAP). 이 앱에서는 연결을 지원하지 않는다. */
    ENTERPRISE,
    ;

    val needsPassword: Boolean get() = this == WEP || this == WPA2 || this == WPA3

    companion object {
        /**
         * ScanResult.capabilities 문자열로 보안 방식을 판별한다.
         * 예: "[WPA2-PSK-CCMP][ESS]" → WPA2, "[RSN-SAE-CCMP][ESS]" → WPA3,
         *     "[RSN-PSK+SAE-CCMP]" (전환 모드) → WPA2, "[ESS]" → OPEN
         */
        fun fromCapabilities(capabilities: String): SecurityType {
            val caps = capabilities.uppercase()
            return when {
                "EAP" in caps -> ENTERPRISE
                "SAE" in caps && "PSK" !in caps -> WPA3
                "PSK" in caps -> WPA2
                "SAE" in caps -> WPA3
                "WEP" in caps -> WEP
                "OWE" in caps -> OWE
                else -> OPEN
            }
        }

        /** QR 코드의 T: 값(WPA, WPA2, SAE, WEP, nopass 등)을 변환한다. */
        fun fromQrType(type: String?): SecurityType? = when (type?.trim()?.uppercase()) {
            null, "" -> null
            "NOPASS", "NONE", "OPEN" -> OPEN
            "WEP" -> WEP
            "SAE", "WPA3" -> WPA3
            "WPA", "WPA2", "WPA/WPA2", "PSK" -> WPA2
            else -> if (type.uppercase().contains("EAP")) ENTERPRISE else WPA2
        }
    }
}
