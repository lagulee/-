package com.example.wifiscanner.wifiparser

/** 사람이 보기에 헷갈리기 쉬운 글자(0/O/o, 1/l/I/|) 위치를 찾는다. 확인 화면의 색 강조에 쓴다. */
object ConfusableChars {
    const val CHARS = "0Oo1lI|"

    fun isConfusable(c: Char): Boolean = c in CHARS

    fun indicesIn(text: String): List<Int> = text.indices.filter { isConfusable(text[it]) }

    /** 강조 표시 옆에 보여 줄 설명. 예: '0' → "숫자 0" */
    fun describe(c: Char): String? = when (c) {
        '0' -> "숫자 0"
        'O' -> "영문 대문자 O"
        'o' -> "영문 소문자 o"
        '1' -> "숫자 1"
        'l' -> "영문 소문자 l(엘)"
        'I' -> "영문 대문자 I(아이)"
        '|' -> "세로선 |"
        else -> null
    }
}
