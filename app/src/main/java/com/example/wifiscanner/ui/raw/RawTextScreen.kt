package com.example.wifiscanner.ui.raw

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import com.example.wifiscanner.TargetField
import com.example.wifiscanner.UiState

private val tokenSeparators = Regex("[\\s/|:=：]+")

/**
 * 자동 추출에 실패했을 때 OCR 원문을 보여 주고, 줄 또는 낱말을 눌러 SSID/비밀번호로 지정하게 한다.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun RawTextScreen(
    state: UiState,
    onAssign: (String, TargetField) -> Unit,
    onDone: () -> Unit,
    onRetake: () -> Unit,
) {
    var selected by remember { mutableStateOf<String?>(null) }

    Scaffold(
        topBar = { CenterAlignedTopAppBar(title = { Text("인식된 글자에서 고르기") }) },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            Card(
                Modifier.fillMaxWidth().padding(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer),
            ) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(state.message ?: "와이파이 이름과 비밀번호에 해당하는 글자를 눌러 지정해 주세요.")
                    Text("와이파이 이름: ${state.ssid.ifBlank { "(미지정)" }}", style = MaterialTheme.typography.titleSmall)
                    Text(
                        "비밀번호: ${state.password.ifBlank { "(미지정)" }}",
                        style = MaterialTheme.typography.titleSmall,
                        fontFamily = FontFamily.Monospace,
                    )
                }
            }

            LazyColumn(
                Modifier.weight(1f).fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                contentPadding = PaddingValues(horizontal = 16.dp),
            ) {
                if (state.ocrLines.isEmpty()) {
                    item { Text("인식된 글자가 없습니다.") }
                }
                items(state.ocrLines) { line ->
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(12.dp)) {
                            Text(
                                line,
                                style = MaterialTheme.typography.bodyLarge,
                                modifier = Modifier.fillMaxWidth().clickable { selected = line }.padding(vertical = 4.dp),
                            )
                            val tokens = line.split(tokenSeparators).map { it.trim() }.filter { it.isNotEmpty() }.distinct()
                            if (tokens.size > 1) {
                                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    tokens.forEach { token ->
                                        SuggestionChip(onClick = { selected = token }, label = { Text(token) })
                                    }
                                }
                            }
                        }
                    }
                }
            }

            Row(
                Modifier.fillMaxWidth().padding(16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                OutlinedButton(onClick = onRetake, modifier = Modifier.weight(1f)) { Text("다시 촬영") }
                Button(onClick = onDone, modifier = Modifier.weight(1f)) { Text("확인 화면으로") }
            }
        }
    }

    selected?.let { text ->
        AlertDialog(
            onDismissRequest = { selected = null },
            title = { Text("무엇으로 지정할까요?") },
            text = { Text(text, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.titleMedium) },
            confirmButton = {
                Row {
                    TextButton(onClick = { onAssign(text, TargetField.SSID); selected = null }) { Text("와이파이 이름") }
                    TextButton(onClick = { onAssign(text, TargetField.PASSWORD); selected = null }) { Text("비밀번호") }
                }
            },
            dismissButton = { TextButton(onClick = { selected = null }) { Text("취소") } },
        )
    }
}
