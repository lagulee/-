package com.example.wifiscanner.ocr

import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.korean.KoreanTextRecognizerOptions
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.tasks.await

/** OCR 줄 목록과 QR 코드 원문. */
class OcrOutput(val lines: List<String>, val qrPayloads: List<String>)

/**
 * ML Kit 한국어 텍스트 인식(온디바이스)과 QR 스캔을 한 이미지에 동시에 실행한다.
 * 인식 결과는 반환만 하고 어디에도 기록하지 않는다.
 */
class WifiTextRecognizer : AutoCloseable {

    private val textRecognizer = TextRecognition.getClient(KoreanTextRecognizerOptions.Builder().build())
    private val barcodeScanner = BarcodeScanning.getClient(
        BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build(),
    )

    suspend fun recognize(image: InputImage): OcrOutput = coroutineScope {
        val text = async { textRecognizer.process(image).await() }
        val barcodes = async { runCatching { barcodeScanner.process(image).await() }.getOrDefault(emptyList()) }

        // 블록을 위→아래, 왼쪽→오른쪽 순으로 정렬해 안내문 읽는 순서와 맞춘다.
        val lines = text.await().textBlocks
            .sortedWith(compareBy({ it.boundingBox?.top ?: 0 }, { it.boundingBox?.left ?: 0 }))
            .flatMap { block -> block.lines.map { it.text } }
            .filter { it.isNotBlank() }
        val qr = barcodes.await().mapNotNull { it.rawValue }

        OcrOutput(lines, qr)
    }

    override fun close() {
        textRecognizer.close()
        barcodeScanner.close()
    }
}
