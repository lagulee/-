package com.example.wifiscanner.wifiparser

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class WifiParserTest {

    private fun parse(vararg lines: String, nearby: List<NearbyNetwork> = emptyList()) =
        WifiParser.parse(lines.toList(), nearby)

    // ------------------------------------------------------------ 키워드 + 구분자

    @Test
    fun `콜론과 슬래시로 한 줄에 함께 적힌 경우`() {
        val r = parse("WiFi: cafe_2F / PW: 12345678")
        assertEquals("cafe_2F", r.ssid?.value)
        assertEquals("12345678", r.password?.value)
        assertEquals(Source.KEYWORD, r.ssid?.source)
        assertEquals(Source.KEYWORD, r.password?.source)
    }

    @Test
    fun `와이파이가 제목이고 비번 키워드 뒤에 값이 있는 경우`() {
        val r = parse("와이파이 비번 abcd1234")
        assertNull(r.ssid)
        assertEquals("abcd1234", r.password?.value)
    }

    @Test
    fun `ID와 비밀번호가 공백으로만 구분된 경우`() {
        val r = parse("ID KT_GiGA_5G_1A2B 비밀번호 0000aaaa")
        assertEquals("KT_GiGA_5G_1A2B", r.ssid?.value)
        assertEquals("0000aaaa", r.password?.value)
    }

    @Test
    fun `키워드와 값이 줄바꿈으로 나뉜 경우`() {
        val r = parse("WIFI", "cafe_2F", "PASSWORD", "coffee1234")
        assertEquals("cafe_2F", r.ssid?.value)
        assertEquals("coffee1234", r.password?.value)
        assertEquals(Source.KEYWORD_NEXT_LINE, r.ssid?.source)
        assertEquals(Source.KEYWORD_NEXT_LINE, r.password?.source)
    }

    @Test
    fun `OCR 블록 안에 줄바꿈 문자가 들어 있어도 줄 단위로 처리`() {
        val r = parse("SSID\nhappy_cafe\nP/W\nsmile2024")
        assertEquals("happy_cafe", r.ssid?.value)
        assertEquals("smile2024", r.password?.value)
    }

    @Test
    fun `등호 하이픈 전각콜론 등 제각각인 구분자`() {
        val r1 = parse("Wi-Fi = BeanBrothers", "Password - bean0101")
        assertEquals("BeanBrothers", r1.ssid?.value)
        assertEquals("bean0101", r1.password?.value)

        val r2 = parse("SSID：MOMS_TOUCH", "PW：mt12345678")
        assertEquals("MOMS_TOUCH", r2.ssid?.value)
        assertEquals("mt12345678", r2.password?.value)
    }

    @Test
    fun `키워드 대소문자와 표기 변형`() {
        val r = parse("wifi : paris_baguette", "pass : pb778899")
        assertEquals("paris_baguette", r.ssid?.value)
        assertEquals("pb778899", r.password?.value)
    }

    @Test
    fun `한글 SSID`() {
        val r = parse("와이파이 이름: 우리동네카페 2층", "비밀번호는 coffee2024 입니다")
        assertEquals("우리동네카페 2층", r.ssid?.value)
        assertEquals("coffee2024", r.password?.value)
    }

    @Test
    fun `아이디 패스워드 한글 키워드와 문장 끝 어미`() {
        val r = parse("아이디 : 김밥천국_5G", "패스워드 : kimbap8282입니다")
        assertEquals("김밥천국_5G", r.ssid?.value)
        assertEquals("kimbap8282", r.password?.value)
    }

    @Test
    fun `띄어쓰기 없이 붙은 와이파이비밀번호`() {
        val r = parse("와이파이비밀번호:qwer1234!")
        assertEquals("qwer1234!", r.password?.value)
    }

    @Test
    fun `표 형태로 키워드 줄 아래에 값 줄이 있는 경우`() {
        val r = parse("ID          PW", "cafe_2F     12345678")
        assertEquals("cafe_2F", r.ssid?.value)
        assertEquals("12345678", r.password?.value)
    }

    @Test
    fun `비밀번호 칸에 한글 안내 문구가 있으면 비밀번호로 쓰지 않는다`() {
        val r = parse("WiFi: cafe_free", "비밀번호: 카운터에 문의하세요")
        assertEquals("cafe_free", r.ssid?.value)
        assertNull(r.password)
    }

    @Test
    fun `SSID 안의 PW나 ID 글자는 키워드로 오인하지 않는다`() {
        val r = parse("SSID: PW_LOUNGE_ID", "PW: lounge9999")
        assertEquals("PW_LOUNGE_ID", r.ssid?.value)
        assertEquals("lounge9999", r.password?.value)
    }

    // ------------------------------------------------------------ 키워드가 없는 경우

    @Test
    fun `키워드 없이 문자열만 있으면 영문 숫자 8자 이상을 비밀번호 후보로`() {
        val r = parse("STARBUCKS COFFEE", "sb2024wifi", "02-123-4567")
        assertEquals("sb2024wifi", r.password?.value)
        assertEquals(Source.HEURISTIC, r.password?.source)
        assertTrue(r.password!!.confidence < 0.7, "키워드 없는 추정은 신뢰도가 낮아야 한다")
    }

    @Test
    fun `키워드 없이 전화번호 날짜 URL은 비밀번호 후보에서 제외`() {
        val r = parse("010-1234-5678", "2024.05.01", "www.cafe-good.com", "01012345678")
        assertNull(r.password)
    }

    @Test
    fun `키워드 없이 주변 SSID 목록으로 SSID를 찾는다`() {
        val nearby = listOf(NearbyNetwork("Cafe_Moon", -55, "[WPA2-PSK-CCMP][ESS]"))
        val r = parse("Cafe_M00n", "moon20240", nearby = nearby)
        assertEquals("Cafe_Moon", r.ssid?.value)
        assertEquals(Source.NEARBY_MATCH, r.ssid?.source)
        assertEquals("moon20240", r.password?.value)
    }

    @Test
    fun `빈 입력이면 아무것도 추출하지 않는다`() {
        val r = parse()
        assertTrue(r.isEmpty)
        assertFalse(r.isComplete)
    }

    // ------------------------------------------------------------ 주변 SSID 교정

    @Test
    fun `OCR 오타를 주변 SSID로 교정`() {
        val nearby = listOf(
            NearbyNetwork("KT_GiGA_2G_1A2B", -48, "[WPA2-PSK-CCMP][ESS]"),
            NearbyNetwork("U+Net3F21", -60, "[WPA2-PSK-CCMP][ESS]"),
        )
        val r = parse("ID KT_GlGA_2G_lA2B 비밀번호 0000aaaa", nearby = nearby)
        assertEquals("KT_GlGA_2G_lA2B", r.rawSsid)
        assertEquals("KT_GiGA_2G_1A2B", r.ssid?.value)
        assertEquals(nearby[0], r.matchedNetwork)
    }

    @Test
    fun `2_4G와 5G처럼 비슷한 SSID가 여럿이면 신호가 센 쪽`() {
        val nearby = listOf(
            NearbyNetwork("cafe_2F_5G", -72, "[RSN-PSK-CCMP][ESS]"),
            NearbyNetwork("cafe_2F_2G", -45, "[RSN-PSK-CCMP][ESS]"),
        )
        val r = parse("WiFi: cafe_2F", "PW: 12345678", nearby = nearby)
        assertEquals("cafe_2F_2G", r.ssid?.value)
    }

    @Test
    fun `OCR이 정확히 적은 SSID가 있으면 신호가 약해도 그것을 고른다`() {
        val nearby = listOf(
            NearbyNetwork("KT_GiGA_5G_1A2B", -75, "[RSN-PSK-CCMP][ESS]"),
            NearbyNetwork("KT_GiGA_2G_1A2B", -40, "[RSN-PSK-CCMP][ESS]"),
        )
        val r = parse("ID KT_GiGA_5G_1A2B 비밀번호 0000aaaa", nearby = nearby)
        assertEquals("KT_GiGA_5G_1A2B", r.ssid?.value)
    }

    @Test
    fun `주변에 비슷한 SSID가 없으면 원래 값을 유지하고 신뢰도를 낮춘다`() {
        val withoutNearby = parse("WiFi: cafe_2F / PW: 12345678")
        val withUnrelated = parse(
            "WiFi: cafe_2F / PW: 12345678",
            nearby = listOf(NearbyNetwork("SK_WiFiGIGA9D3C", -50, "[WPA2-PSK-CCMP]")),
        )
        assertEquals("cafe_2F", withUnrelated.ssid?.value)
        assertNull(withUnrelated.matchedNetwork)
        assertTrue(withUnrelated.ssid!!.confidence < withoutNearby.ssid!!.confidence)
    }

    @Test
    fun `정확히 일치하면 신뢰도가 올라간다`() {
        val plain = parse("WiFi: cafe_2F / PW: 12345678")
        val matched = parse("WiFi: cafe_2F / PW: 12345678", nearby = listOf(NearbyNetwork("cafe_2F", -50, "[WPA2-PSK]")))
        assertTrue(matched.ssid!!.confidence > plain.ssid!!.confidence)
    }

    @Test
    fun `같은 SSID가 여러 AP로 잡히면 하나로 합치고 가장 센 신호를 쓴다`() {
        val nearby = listOf(
            NearbyNetwork("cafe_2F", -80, "[WPA2-PSK]"),
            NearbyNetwork("cafe_2F", -40, "[WPA2-PSK]"),
            NearbyNetwork("other", -60, "[ESS]"),
        )
        val r = parse("WiFi: cafe_2F", nearby = nearby)
        assertEquals(2, r.rankedNearby.size)
        assertEquals(-40, r.matchedNetwork?.rssi)
        assertEquals("cafe_2F", r.rankedNearby.first().ssid)
    }

    // ------------------------------------------------------------ 보안 방식

    @Test
    fun `매칭된 네트워크의 capabilities로 보안 방식을 정한다`() {
        val wpa3 = parse("WiFi: secure_cafe", "PW: abcdefgh1", nearby = listOf(NearbyNetwork("secure_cafe", -50, "[RSN-SAE-CCMP][ESS]")))
        assertEquals(SecurityType.WPA3, wpa3.security)

        val open = parse("WiFi: free_cafe", nearby = listOf(NearbyNetwork("free_cafe", -50, "[ESS]")))
        assertEquals(SecurityType.OPEN, open.security)
        assertTrue(open.isComplete)
    }

    @Test
    fun `주변 정보가 없으면 비밀번호가 있을 때 WPA2로 가정`() {
        val r = parse("WiFi: cafe_2F / PW: 12345678")
        assertEquals(SecurityType.WPA2, r.security)
        assertTrue(r.isComplete)
    }

    // ------------------------------------------------------------ QR

    @Test
    fun `와이파이 QR이 있으면 OCR보다 우선한다`() {
        val r = WifiParser.parse(
            ocrLines = listOf("WiFi: wrong_name", "PW: wrongpass1"),
            qrPayloads = listOf("WIFI:T:WPA;S:qr_cafe;P:qr_pass_123;;"),
        )
        assertEquals("qr_cafe", r.ssid?.value)
        assertEquals("qr_pass_123", r.password?.value)
        assertEquals(1.0, r.ssid?.confidence)
        assertEquals(Source.QR, r.password?.source)
        assertEquals(SecurityType.WPA2, r.security)
    }

    // ------------------------------------------------------------ 신뢰도

    @Test
    fun `신뢰도는 0과 1 사이이고 같은 줄 키워드가 다음 줄보다 높다`() {
        val sameLine = parse("PW: coffee1234").password!!
        val nextLine = parse("PW", "coffee1234").password!!
        val heuristic = parse("coffee1234").password!!
        listOf(sameLine, nextLine, heuristic).forEach { assertTrue(it.confidence in 0.0..1.0) }
        assertTrue(sameLine.confidence > nextLine.confidence)
        assertTrue(nextLine.confidence > heuristic.confidence)
    }

    @Test
    fun `8자 미만 비밀번호는 신뢰도가 낮다`() {
        val short = parse("PW: 1234").password
        assertNotNull(short)
        assertEquals("1234", short.value)
        assertTrue(short.confidence < parse("PW: 12345678").password!!.confidence)
    }

    @Test
    fun `비밀번호는 toString에 노출되지 않는다`() {
        val r = parse("WiFi: cafe_2F / PW: secret_9876")
        assertFalse(r.toString().contains("secret_9876"))
        assertFalse(r.password.toString().contains("secret_9876"))
    }
}
