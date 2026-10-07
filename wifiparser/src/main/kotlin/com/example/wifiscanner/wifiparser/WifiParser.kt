package com.example.wifiscanner.wifiparser

import kotlin.math.round

/**
 * 와이파이 안내문 OCR 결과에서 SSID와 비밀번호를 추출한다.
 *
 * 1. 와이파이 QR 내용이 있으면 그것을 그대로 쓴다.
 * 2. 키워드(와이파이/ID/SSID…, 비번/PW/Password…) 뒤의 값을 같은 줄 또는 다음 줄에서 찾는다.
 * 3. 비밀번호 키워드가 없으면 영문·숫자 8자 이상 문자열을 비밀번호 후보로 본다.
 * 4. 주변 SSID 목록이 있으면 편집 거리로 가장 가까운 실제 SSID로 교정한다.
 *    (2.4G/5G처럼 비슷한 후보가 여럿이면 신호가 센 쪽)
 * 5. 매칭된 네트워크의 capabilities로 보안 방식을 판별한다.
 *
 * 비밀번호를 다루므로 이 클래스는 아무것도 로그에 남기거나 저장하지 않는다.
 */
object WifiParser {

    /** 이 유사도 이상이면 OCR SSID를 주변 SSID로 교정한다. */
    const val CORRECTION_THRESHOLD = 0.6

    /** 최고 유사도와 이 차이 이내인 주변 SSID는 "비슷한 후보"로 보고 신호 세기로 고른다. */
    const val TIE_MARGIN = 0.1

    /** 키워드 없이 원문 줄을 주변 SSID와 비교할 때 요구하는 유사도. */
    private const val NEARBY_LINE_THRESHOLD = 0.75

    fun parse(
        ocrLines: List<String>,
        nearby: List<NearbyNetwork> = emptyList(),
        qrPayloads: List<String> = emptyList(),
    ): ParseResult {
        val networks = dedupeNearby(nearby)

        qrPayloads.firstNotNullOfOrNull { WifiQrParser.parse(it) }?.let { return fromQr(it, networks) }

        val lines = ocrLines.flatMap { it.split('\n') }.map(::normalizeLine).filter { it.isNotEmpty() }

        val keywordCandidates = extractKeywordCandidates(lines)
        var ssid = keywordCandidates.filter { it.type == FieldType.SSID }.maxByOrNull { it.extracted.confidence }?.extracted
        var password = keywordCandidates.filter { it.type == FieldType.PASSWORD }.maxByOrNull { it.extracted.confidence }?.extracted

        if (password == null) {
            password = heuristicPassword(lines, exclude = setOfNotNull(ssid?.value), networks = networks)
        }

        val rawSsid = ssid?.value
        var matched: NearbyNetwork? = null
        if (networks.isNotEmpty()) {
            if (ssid != null) {
                val correction = correctSsid(ssid, networks)
                ssid = correction.first
                matched = correction.second
            } else {
                findSsidInLines(lines, networks, exclude = password?.value)?.let { (extracted, network) ->
                    ssid = extracted
                    matched = network
                }
            }
        } else if (ssid == null) {
            ssid = heuristicSsid(lines, exclude = password?.value)
        }

        val security = matched?.security ?: if (password != null) SecurityType.WPA2 else null

        return ParseResult(
            ssid = ssid,
            rawSsid = rawSsid ?: ssid?.value,
            password = password,
            security = security,
            matchedNetwork = matched,
            rankedNearby = rankNearby(ssid?.value, networks),
        )
    }

    /** 사용자가 드롭다운에서 SSID를 바꿨을 때 등, 주어진 SSID 기준으로 주변 목록을 정렬한다. */
    fun rankNearby(ssid: String?, nearby: List<NearbyNetwork>): List<NearbyNetwork> {
        val networks = dedupeNearby(nearby)
        if (ssid.isNullOrEmpty()) return networks.sortedByDescending { it.rssi }
        return networks.sortedWith(
            compareByDescending<NearbyNetwork> { Levenshtein.similarity(ssid, it.ssid) }.thenByDescending { it.rssi },
        )
    }

    /** 사용자가 직접 지정한 SSID를 주변 목록 기준으로 교정한다. 비슷한 네트워크가 없으면 null. */
    fun findClosestNetwork(ssid: String, nearby: List<NearbyNetwork>): NearbyNetwork? {
        val networks = dedupeNearby(nearby)
        if (networks.isEmpty() || ssid.isBlank()) return null
        return correctSsid(Extracted(ssid.trim(), 1.0, Source.USER), networks).second
    }

    // ---------------------------------------------------------------- QR

    private fun fromQr(qr: WifiQr, networks: List<NearbyNetwork>): ParseResult {
        val matched = networks.firstOrNull { it.ssid == qr.ssid }
        return ParseResult(
            ssid = Extracted(qr.ssid, 1.0, Source.QR),
            rawSsid = qr.ssid,
            password = qr.password?.let { Extracted(it, 1.0, Source.QR) },
            security = qr.security ?: matched?.security,
            matchedNetwork = matched,
            rankedNearby = rankNearby(qr.ssid, networks),
            hidden = qr.hidden,
        )
    }

    // ---------------------------------------------------------------- 키워드 추출

    internal enum class FieldType { SSID, PASSWORD }

    internal class Candidate(val type: FieldType, val extracted: Extracted)

    private class KeywordHit(val type: FieldType, val start: Int, val end: Int)

    private const val HANGUL = "가-힣ㄱ-ㅎㅏ-ㅣ"

    // 한국어 키워드 뒤에 붙는 "이름/명"과 조사(은/는/이/가)
    private const val KO_SUFFIX = "(?:\\s*(?:이름|명))?(?:은|는|이|가)?"
    private const val EN_SUFFIX = "(?:\\s*(?:이름|명|name))?(?:은|는|이|가)?"

    // 긴 키워드부터 나열해야 "Pass"가 "Password" 일부로 잡히지 않는다.
    private val ssidRegex = Regex(
        listOf(
            "(?<![A-Za-z0-9_$HANGUL])(?:와이파이|아이디|네트워크)$KO_SUFFIX",
            "(?<![A-Za-z0-9_$HANGUL])(?:SSID|Wi[\\s-]?Fi|ID)(?![A-Za-z0-9_])$EN_SUFFIX",
        ).joinToString("|"),
        RegexOption.IGNORE_CASE,
    )

    private val passwordRegex = Regex(
        listOf(
            // 한국어 비밀번호 키워드는 "와이파이비밀번호"처럼 붙어 나오는 경우가 많아 왼쪽 경계를 요구하지 않는다.
            "(?:비밀번호|패스워드|비번|암호)$KO_SUFFIX",
            "(?<![A-Za-z0-9_])(?:Password|Passwd|Pass|PWD|P/W|P\\.W|PW)(?![A-Za-z_])$EN_SUFFIX",
        ).joinToString("|"),
        RegexOption.IGNORE_CASE,
    )

    private val leadingSeparators = Regex("^[\\s:=\\-–—~>)\\]}.·•|/]+")
    private val trailingSeparators = Regex("[\\s/|,·•(\\[{:=\\-–—]+$")
    private val koreanEnding = Regex("(?:입니다|이에요|예요|에요|이고|이며|임)[.!]?$")
    private val hangulChar = Regex("[$HANGUL]")
    private val whitespace = Regex("\\s+")

    private fun normalizeLine(line: String): String =
        line.replace('：', ':').replace('＝', '=').replace(' ', ' ').replace(whitespace, " ").trim()

    private fun findKeywords(line: String): List<KeywordHit> {
        val hits = mutableListOf<KeywordHit>()
        ssidRegex.findAll(line).forEach { hits += KeywordHit(FieldType.SSID, it.range.first, it.range.last + 1) }
        passwordRegex.findAll(line).forEach { hits += KeywordHit(FieldType.PASSWORD, it.range.first, it.range.last + 1) }
        // 겹치는 경우 먼저 시작하고 더 긴 것을 남긴다.
        val sorted = hits.sortedWith(compareBy<KeywordHit> { it.start }.thenByDescending { it.end - it.start })
        val result = mutableListOf<KeywordHit>()
        for (hit in sorted) {
            if (result.isEmpty() || hit.start >= result.last().end) result += hit
        }
        return result
    }

    private fun cleanRegion(region: String): String =
        region.replace(leadingSeparators, "").replace(trailingSeparators, "").trim()

    internal fun extractKeywordCandidates(lines: List<String>): List<Candidate> {
        val candidates = mutableListOf<Candidate>()
        val hitsPerLine = lines.map(::findKeywords)

        for ((index, line) in lines.withIndex()) {
            val hits = hitsPerLine[index]
            if (hits.isEmpty()) continue
            val regions = hits.mapIndexed { i, hit ->
                val regionEnd = if (i + 1 < hits.size) hits[i + 1].start else line.length
                cleanRegion(line.substring(hit.end, regionEnd))
            }
            val nextLine = lines.getOrNull(index + 1)?.takeIf { hitsPerLine[index + 1].isEmpty() }

            // 표 형태: "ID   PW" 다음 줄 "cafe_2F   12345678"
            if (hits.size >= 2 && regions.all { it.isEmpty() } && hits.map { it.type }.toSet().size == 2 && nextLine != null) {
                val tokens = nextLine.split(" ").filter { it.isNotBlank() }
                if (tokens.size == hits.size) {
                    hits.zip(tokens).forEach { (hit, token) ->
                        makeCandidate(hit.type, token, Source.KEYWORD_NEXT_LINE, base = 0.55)?.let { candidates += it }
                    }
                    continue
                }
            }

            for ((i, hit) in hits.withIndex()) {
                val region = regions[i]
                if (region.isNotEmpty()) {
                    makeCandidate(hit.type, region, Source.KEYWORD, base = 0.7)?.let { candidates += it }
                } else if (i == hits.lastIndex && nextLine != null) {
                    // 키워드만 있고 값이 다음 줄에 있는 경우.
                    // ("와이파이 비번 abcd1234"처럼 값이 비어 있는 앞쪽 키워드는 제목으로 보고 무시)
                    makeCandidate(hit.type, nextLine, Source.KEYWORD_NEXT_LINE, base = 0.6)?.let { candidates += it }
                }
            }
        }
        return candidates
    }

    private fun makeCandidate(type: FieldType, rawValue: String, source: Source, base: Double): Candidate? {
        return when (type) {
            FieldType.SSID -> cleanSsid(rawValue)?.let { Candidate(type, Extracted(it, round2(ssidConfidence(it, base)), source)) }
            FieldType.PASSWORD -> cleanPassword(rawValue)?.let { Candidate(type, Extracted(it, round2(passwordConfidence(it, base)), source)) }
        }
    }

    private fun stripQuotes(value: String): String =
        value.trim().trimStart('"', '\'', '「', '『', '“', '‘', '(', '[').trimEnd('"', '\'', '」', '』', '”', '’', ')', ']').trim()

    private fun cleanSsid(raw: String): String? {
        val value = stripQuotes(raw).replace(koreanEnding, "").trim()
        if (value.isEmpty()) return null
        return value
    }

    private fun cleanPassword(raw: String): String? {
        var token = stripQuotes(raw).split(" ").firstOrNull { it.isNotEmpty() } ?: return null
        token = stripQuotes(token.replace(koreanEnding, ""))
        // 한글이 섞여 있으면 "카운터에 문의" 같은 안내 문구로 본다.
        if (token.isEmpty() || hangulChar.containsMatchIn(token)) return null
        if (token.any { it.code < 0x21 || it.code > 0x7E }) return null
        if (token.length > 63) return null
        return token
    }

    private fun ssidConfidence(value: String, base: Double): Double {
        var score = base
        if (value.toByteArray(Charsets.UTF_8).size > 32) score -= 0.3
        if (value.length < 2) score -= 0.2
        return score.coerceIn(0.05, 1.0)
    }

    private fun passwordConfidence(value: String, base: Double): Double {
        var score = base
        // WPA 비밀번호는 8~63자. 짧으면 OCR이 글자를 놓쳤을 가능성이 크다.
        if (value.length >= 8) score += 0.1 else score -= 0.2
        if (value.any { it.isLetter() } && value.any { it.isDigit() }) score += 0.05
        return score.coerceIn(0.05, 1.0)
    }

    // ---------------------------------------------------------------- 키워드 없는 경우

    private val passwordToken = Regex("^[A-Za-z0-9!@#$%^&*_+.\\-]{8,63}$")
    private val phoneLike = Regex("^(?:0\\d{1,2}-?\\d{3,4}-?\\d{4}|1[5-9]\\d{2}-?\\d{4})$")
    private val dateLike = Regex("^(?:19|20)\\d{2}[.\\-/]\\d{1,2}[.\\-/]\\d{1,2}\\.?$")
    private val urlLike = Regex("(?i)^(?:https?|www\\.)|\\.(?:com|net|kr|org|co)(?:/|$)|@")

    private fun heuristicPassword(lines: List<String>, exclude: Set<String>, networks: List<NearbyNetwork>): Extracted? {
        val nearbySsids = networks.map { it.ssid }
        return lines.asSequence()
            .flatMap { it.split(" ").asSequence() }
            .map { stripQuotes(it) }
            .filter { passwordToken.matches(it) }
            .filter { it !in exclude }
            .filter { !phoneLike.matches(it) && !dateLike.matches(it) && !urlLike.containsMatchIn(it) }
            // 주변 SSID와 거의 같은 문자열은 비밀번호가 아니라 SSID다.
            .filter { token -> nearbySsids.none { Levenshtein.similarity(token, it) >= 0.8 } }
            .map { token ->
                val hasLetter = token.any { it.isLetter() }
                val hasDigit = token.any { it.isDigit() }
                var score = when {
                    hasLetter && hasDigit -> 0.45
                    hasDigit -> 0.35
                    else -> 0.25
                }
                if (token.length <= 16) score += 0.05
                if (token.contains('_')) score -= 0.1 // 밑줄은 SSID에 더 흔하다
                Extracted(token, round2(score), Source.HEURISTIC)
            }
            .maxByOrNull { it.confidence }
    }

    private val knownSsidPrefixes = listOf("KT_", "SK_", "U+", "iptime", "olleh", "Galaxy", "AndroidHotspot")

    /** 주변 목록도 키워드도 없을 때, SSID다운 토큰(밑줄 포함 또는 통신사 기본 이름)을 낮은 신뢰도로 고른다. */
    private fun heuristicSsid(lines: List<String>, exclude: String?): Extracted? =
        lines.asSequence()
            .flatMap { it.split(" ").asSequence() }
            .map { stripQuotes(it) }
            .filter { it.isNotEmpty() && it != exclude && it.length in 3..32 }
            .filter { token -> token.contains('_') || knownSsidPrefixes.any { token.startsWith(it, ignoreCase = true) } }
            .firstOrNull()
            ?.let { Extracted(it, 0.3, Source.HEURISTIC) }

    // ---------------------------------------------------------------- 주변 SSID로 교정

    private fun dedupeNearby(nearby: List<NearbyNetwork>): List<NearbyNetwork> =
        nearby.filter { it.ssid.isNotBlank() }
            .groupBy { it.ssid }
            .map { (_, same) -> same.maxBy { it.rssi } }

    /**
     * OCR SSID 후보를 주변 SSID 중 가장 가까운 것으로 교정한다.
     * - 대소문자 무시 완전 일치가 있으면 그것을 고른다.
     * - 아니면 유사도가 최고값과 [TIE_MARGIN] 이내인 후보 중 신호가 가장 센 것을 고른다.
     */
    private fun correctSsid(ocr: Extracted, networks: List<NearbyNetwork>): Pair<Extracted, NearbyNetwork?> {
        val exact = networks.firstOrNull { it.ssid == ocr.value }
            ?: networks.filter { it.ssid.equals(ocr.value, ignoreCase = true) }.maxByOrNull { it.rssi }
        if (exact != null) {
            return Extracted(exact.ssid, round2((ocr.confidence + 0.25).coerceAtMost(1.0)), ocr.source) to exact
        }

        val scored = networks.map { it to ssidSimilarity(ocr.value, it.ssid) }
        val best = scored.maxOf { it.second }
        if (best < CORRECTION_THRESHOLD) {
            // 근처에 없는 네트워크일 수 있다. 원래 값을 유지하되 신뢰도를 낮춘다.
            return Extracted(ocr.value, round2((ocr.confidence - 0.15).coerceAtLeast(0.05)), ocr.source) to null
        }
        val (network, similarity) = scored
            .filter { it.second >= best - TIE_MARGIN }
            .maxWith(compareBy<Pair<NearbyNetwork, Double>> { it.first.rssi }.thenBy { it.second })
        val confidence = (ocr.confidence * 0.5 + similarity * 0.45).coerceIn(0.05, 0.95)
        return Extracted(network.ssid, round2(confidence), ocr.source) to network
    }

    /** OCR 값에 SSID 외 글자가 더 붙은 경우("cafe_2F (2층)")도 고려한 유사도. */
    private fun ssidSimilarity(ocr: String, ssid: String): Double {
        val similarity = Levenshtein.similarity(ocr, ssid)
        val containment = if (ssid.length >= 4 && ocr.contains(ssid, ignoreCase = true)) 0.85 else 0.0
        return maxOf(similarity, containment)
    }

    /** SSID 키워드가 없을 때 원문 각 줄/토큰을 주변 SSID와 비교한다. */
    private fun findSsidInLines(lines: List<String>, networks: List<NearbyNetwork>, exclude: String?): Pair<Extracted, NearbyNetwork>? {
        val pieces = lines.flatMap { line -> listOf(line) + line.split(" ") }
            .map { stripQuotes(it) }
            .filter { it.isNotEmpty() && it != exclude }
            .distinct()
        if (pieces.isEmpty()) return null
        val scored = networks.map { network -> network to pieces.maxOf { Levenshtein.similarity(it, network.ssid) } }
        val best = scored.maxOf { it.second }
        if (best < NEARBY_LINE_THRESHOLD) return null
        // 원문에 정확히 적힌 SSID가 있으면 그것을, 아니면 비슷한 후보 중 신호가 센 것을 고른다.
        val floor = if (best >= 1.0) 1.0 else best - TIE_MARGIN
        val chosen = scored.filter { it.second >= floor }.maxBy { it.first.rssi }.first
        return Extracted(chosen.ssid, round2(0.4 + 0.4 * best), Source.NEARBY_MATCH) to chosen
    }

    private fun round2(v: Double): Double = round(v * 100) / 100
}
