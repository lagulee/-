package com.example.wifiscanner.wifiparser

/** "WIFI:T:WPA;S:my_net;P:secret;H:false;;" 형식의 와이파이 QR 내용. */
class WifiQr(
    val ssid: String,
    val password: String?,
    val security: SecurityType?,
    val hidden: Boolean,
) {
    override fun toString(): String =
        "WifiQr(ssid=$ssid, password=${if (password == null) "null" else "<숨김>"}, security=$security, hidden=$hidden)"
}

object WifiQrParser {

    /** 와이파이 QR 형식이 아니면 null. 필드 순서는 자유이고 \; \, \: \\ \" 이스케이프를 처리한다. */
    fun parse(raw: String): WifiQr? {
        val text = raw.trim()
        if (!text.startsWith("WIFI:", ignoreCase = true)) return null
        val fields = splitFields(text.substring(5))
        var ssid: String? = null
        var password: String? = null
        var type: String? = null
        var hidden = false
        for (field in fields) {
            val colon = field.indexOf(':')
            if (colon <= 0) continue
            val key = field.substring(0, colon).trim().uppercase()
            val value = unquote(field.substring(colon + 1))
            when (key) {
                "S" -> ssid = value
                "P" -> password = value
                "T" -> type = value
                "H" -> hidden = value.equals("true", ignoreCase = true)
            }
        }
        if (ssid.isNullOrEmpty()) return null
        var security = SecurityType.fromQrType(type)
        if (password.isNullOrEmpty()) {
            password = null
            if (security == null) security = SecurityType.OPEN
        } else if (security == null || security == SecurityType.OPEN) {
            security = SecurityType.WPA2
        }
        if (security == SecurityType.OPEN) password = null
        return WifiQr(ssid, password, security, hidden)
    }

    /** 이스케이프되지 않은 ';' 기준으로 나누고 이스케이프를 푼다. 키 부분의 ':'는 그대로 둔다. */
    private fun splitFields(body: String): List<String> {
        val result = mutableListOf<String>()
        val sb = StringBuilder()
        var i = 0
        while (i < body.length) {
            val c = body[i]
            when {
                c == '\\' && i + 1 < body.length -> {
                    val next = body[i + 1]
                    // 값 안의 ':'는 키 구분자와 헷갈리지 않도록 표식을 남긴 뒤 나중에 복원한다.
                    sb.append(if (next == ':') ESCAPED_COLON else next)
                    i += 2
                    continue
                }
                c == ';' -> {
                    if (sb.isNotEmpty()) result += sb.toString()
                    sb.clear()
                }
                else -> sb.append(c)
            }
            i++
        }
        if (sb.isNotEmpty()) result += sb.toString()
        return result.map { field ->
            val colon = field.indexOf(':')
            if (colon < 0) field.replace(ESCAPED_COLON, ':')
            else field.substring(0, colon + 1) + field.substring(colon + 1).replace(ESCAPED_COLON, ':')
        }
    }

    private fun unquote(value: String): String =
        if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value.substring(1, value.length - 1) else value

    private const val ESCAPED_COLON = ''
}
