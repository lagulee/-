package com.example.wifiscanner.wifiparser

/** 주변에서 스캔된 와이파이 네트워크. Android ScanResult에서 필요한 값만 옮겨 담는다. */
data class NearbyNetwork(
    val ssid: String,
    /** 신호 세기(dBm). 0에 가까울수록 세다. */
    val rssi: Int,
    /** ScanResult.capabilities 원문. 예: "[WPA2-PSK-CCMP][RSN-PSK-CCMP][ESS]" */
    val capabilities: String = "",
) {
    val security: SecurityType get() = SecurityType.fromCapabilities(capabilities)
}

/** 추출값이 어디서 왔는지. */
enum class Source {
    /** 와이파이 QR 코드 */
    QR,

    /** 키워드와 같은 줄 */
    KEYWORD,

    /** 키워드 다음 줄 */
    KEYWORD_NEXT_LINE,

    /** 키워드 없이 문자열 모양으로 추정 */
    HEURISTIC,

    /** 주변 SSID 목록과 원문을 비교해 찾음 */
    NEARBY_MATCH,

    /** 사용자가 직접 지정 */
    USER,
}

/**
 * 추출된 값 하나와 신뢰도(0.0~1.0).
 * 비밀번호가 실수로 로그에 찍히지 않도록 toString()에서 값을 가린다.
 */
class Extracted(
    val value: String,
    val confidence: Double,
    val source: Source,
) {
    override fun equals(other: Any?): Boolean =
        other is Extracted && other.value == value && other.confidence == confidence && other.source == source

    override fun hashCode(): Int = (value.hashCode() * 31 + confidence.hashCode()) * 31 + source.hashCode()

    override fun toString(): String = "Extracted(value=<${value.length}자>, confidence=$confidence, source=$source)"
}

data class ParseResult(
    /** 최종 SSID (주변 목록으로 교정되었으면 교정된 값). */
    val ssid: Extracted?,
    /** 교정 전 OCR이 읽은 SSID. 교정이 없었으면 ssid.value와 같다. */
    val rawSsid: String?,
    val password: Extracted?,
    /** 판별된 보안 방식. 판단할 근거가 없으면 null. */
    val security: SecurityType?,
    /** SSID와 매칭된 주변 네트워크. */
    val matchedNetwork: NearbyNetwork?,
    /** 주변 네트워크를 현재 SSID와 비슷한 순서로 정렬한 목록 (드롭다운용, SSID 중복 제거). */
    val rankedNearby: List<NearbyNetwork>,
    val hidden: Boolean = false,
) {
    /** SSID와 비밀번호(또는 개방형) 모두 얻었는지. */
    val isComplete: Boolean
        get() = ssid != null && (password != null || security == SecurityType.OPEN || security == SecurityType.OWE)

    val isEmpty: Boolean get() = ssid == null && password == null
}
