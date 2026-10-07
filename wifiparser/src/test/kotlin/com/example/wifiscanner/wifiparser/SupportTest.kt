package com.example.wifiscanner.wifiparser

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class LevenshteinTest {

    @Test
    fun `표준 편집 거리`() {
        assertEquals(3, Levenshtein.distance("kitten", "sitting"))
        assertEquals(0, Levenshtein.distance("cafe", "cafe"))
        assertEquals(4, Levenshtein.distance("", "cafe"))
        assertEquals(1, Levenshtein.distance("cafe_2G", "cafe_5G"))
    }

    @Test
    fun `OCR 혼동 글자는 일반 치환보다 가깝다`() {
        assertTrue(Levenshtein.weightedDistance("KT_GlGA", "KT_GiGA") < Levenshtein.weightedDistance("KT_GxGA", "KT_GiGA"))
        assertTrue(Levenshtein.weightedDistance("c0ffee", "coffee") < 1.0)
        assertTrue(Levenshtein.similarity("Cafe_M00n", "Cafe_Moon") > 0.85)
    }

    @Test
    fun `유사도 범위`() {
        assertEquals(1.0, Levenshtein.similarity("abc", "abc"))
        assertEquals(1.0, Levenshtein.similarity("", ""))
        assertTrue(Levenshtein.similarity("abc", "xyz") == 0.0)
    }
}

class SecurityTypeTest {

    @Test
    fun `capabilities 판별`() {
        assertEquals(SecurityType.WPA2, SecurityType.fromCapabilities("[WPA2-PSK-CCMP][RSN-PSK-CCMP][ESS]"))
        assertEquals(SecurityType.WPA2, SecurityType.fromCapabilities("[WPA-PSK-TKIP][ESS]"))
        assertEquals(SecurityType.WPA3, SecurityType.fromCapabilities("[RSN-SAE-CCMP][ESS]"))
        assertEquals(SecurityType.WPA2, SecurityType.fromCapabilities("[RSN-PSK+SAE-CCMP][ESS]")) // 전환 모드
        assertEquals(SecurityType.OPEN, SecurityType.fromCapabilities("[ESS]"))
        assertEquals(SecurityType.OWE, SecurityType.fromCapabilities("[RSN-OWE-CCMP][ESS]"))
        assertEquals(SecurityType.WEP, SecurityType.fromCapabilities("[WEP][ESS]"))
        assertEquals(SecurityType.ENTERPRISE, SecurityType.fromCapabilities("[WPA2-EAP-CCMP][ESS]"))
    }
}

class WifiQrParserTest {

    @Test
    fun `기본 형식`() {
        val qr = WifiQrParser.parse("WIFI:S:cafe_2F;T:WPA;P:12345678;;")!!
        assertEquals("cafe_2F", qr.ssid)
        assertEquals("12345678", qr.password)
        assertEquals(SecurityType.WPA2, qr.security)
    }

    @Test
    fun `이스케이프와 숨김 네트워크`() {
        val qr = WifiQrParser.parse("""WIFI:T:SAE;S:my\;net\:1;P:pa\\ss\,word;H:true;;""")!!
        assertEquals("my;net:1", qr.ssid)
        assertEquals("pa\\ss,word", qr.password)
        assertEquals(SecurityType.WPA3, qr.security)
        assertTrue(qr.hidden)
    }

    @Test
    fun `비밀번호 없는 개방형`() {
        val qr = WifiQrParser.parse("WIFI:T:nopass;S:free_wifi;;")!!
        assertEquals(SecurityType.OPEN, qr.security)
        assertNull(qr.password)
    }

    @Test
    fun `와이파이 QR이 아니면 null`() {
        assertNull(WifiQrParser.parse("https://example.com"))
        assertNull(WifiQrParser.parse("WIFI:T:WPA;P:nossid;;"))
    }
}

class ConfusableCharsTest {

    @Test
    fun `혼동 글자 위치`() {
        assertEquals(listOf(0, 1, 4, 5), ConfusableChars.indicesIn("0OabIl"))
        assertEquals(emptyList(), ConfusableChars.indicesIn("abc234"))
    }
}
