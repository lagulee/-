package com.example.wifiscanner.wifiparser

import kotlin.math.max
import kotlin.math.min

object Levenshtein {

    /** 표준 Levenshtein 편집 거리 (삽입·삭제·치환 비용 모두 1). */
    fun distance(a: String, b: String): Int {
        if (a == b) return 0
        if (a.isEmpty()) return b.length
        if (b.isEmpty()) return a.length
        var prev = IntArray(b.length + 1) { it }
        var curr = IntArray(b.length + 1)
        for (i in 1..a.length) {
            curr[0] = i
            for (j in 1..b.length) {
                val cost = if (a[i - 1] == b[j - 1]) 0 else 1
                curr[j] = min(min(curr[j - 1] + 1, prev[j] + 1), prev[j - 1] + cost)
            }
            val t = prev; prev = curr; curr = t
        }
        return prev[b.length]
    }

    /**
     * OCR 오류를 고려한 가중 편집 거리.
     * - 대소문자만 다르면 0.2
     * - OCR이 자주 헷갈리는 글자(0/O, 1/l/I 등)끼리는 0.4
     * - 공백·밑줄·하이픈·점의 삽입/삭제는 0.5
     */
    fun weightedDistance(a: String, b: String): Double {
        if (a == b) return 0.0
        var prev = DoubleArray(b.length + 1)
        var curr = DoubleArray(b.length + 1)
        for (j in 1..b.length) prev[j] = prev[j - 1] + indelCost(b[j - 1])
        for (i in 1..a.length) {
            curr[0] = prev[0] + indelCost(a[i - 1])
            for (j in 1..b.length) {
                curr[j] = minOf(
                    curr[j - 1] + indelCost(b[j - 1]),
                    prev[j] + indelCost(a[i - 1]),
                    prev[j - 1] + substitutionCost(a[i - 1], b[j - 1]),
                )
            }
            val t = prev; prev = curr; curr = t
        }
        return prev[b.length]
    }

    /** 0.0(완전히 다름) ~ 1.0(같음) 유사도. */
    fun similarity(a: String, b: String): Double {
        val longest = max(a.length, b.length)
        if (longest == 0) return 1.0
        return (1.0 - weightedDistance(a, b) / longest).coerceIn(0.0, 1.0)
    }

    private val confusableGroups = listOf("0OoDQ", "1lI|i!", "5Ss", "8B", "2Zz", "6G", "9gq")

    private fun substitutionCost(x: Char, y: Char): Double = when {
        x == y -> 0.0
        x.lowercaseChar() == y.lowercaseChar() -> 0.2
        confusableGroups.any { x in it && y in it } -> 0.4
        else -> 1.0
    }

    private fun indelCost(c: Char): Double = if (c == ' ' || c == '_' || c == '-' || c == '.') 0.5 else 1.0
}
