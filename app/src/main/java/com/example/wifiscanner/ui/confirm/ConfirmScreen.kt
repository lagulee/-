package com.example.wifiscanner.ui.confirm

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.ArrowDropUp
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.example.wifiscanner.UiState
import com.example.wifiscanner.ui.theme.HighlightColors
import com.example.wifiscanner.wifiparser.ConfusableChars
import com.example.wifiscanner.wifiparser.Extracted
import com.example.wifiscanner.wifiparser.NearbyNetwork
import com.example.wifiscanner.wifiparser.SecurityType
import com.example.wifiscanner.wifiparser.Source

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConfirmScreen(
    state: UiState,
    rankedNearby: List<NearbyNetwork>,
    onSsidChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onSecurityChange: (SecurityType) -> Unit,
    onConnect: () -> Unit,
    onTrySuggestion: () -> Unit,
    onOpenWifiSettings: () -> Unit,
    onOpenRawText: () -> Unit,
    onRetake: () -> Unit,
) {
    Scaffold(
        topBar = { CenterAlignedTopAppBar(title = { Text("와이파이 정보 확인") }) },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            SsidField(state, rankedNearby, onSsidChange)

            if (state.security.needsPassword || state.password.isNotEmpty()) {
                PasswordField(state, onPasswordChange)
                ConfusableLegend(state.password)
            }

            SecuritySelector(state.security, onSecurityChange)

            state.message?.let { MessageCard(it, success = state.connected) }

            Button(onClick = onConnect, modifier = Modifier.fillMaxWidth().height(56.dp)) {
                Text("연결", style = MaterialTheme.typography.titleMedium)
            }
            if (state.canTrySuggestion) {
                OutlinedButton(onClick = onTrySuggestion, modifier = Modifier.fillMaxWidth()) {
                    Text("다른 방법(연결 제안)으로 다시 시도")
                }
            }
            if (state.connected) {
                OutlinedButton(onClick = onOpenWifiSettings, modifier = Modifier.fillMaxWidth()) {
                    Text("와이파이 연결 상태 보기")
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                TextButton(onClick = onOpenRawText) { Text("인식된 원문에서 직접 고르기") }
                TextButton(onClick = onRetake) { Text("다시 촬영") }
            }
        }
    }
}

@Composable
private fun SsidField(state: UiState, rankedNearby: List<NearbyNetwork>, onSsidChange: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    val highlight = remember { ConfusableHighlightTransformation() }
    Box {
        OutlinedTextField(
            value = state.ssid,
            onValueChange = onSsidChange,
            label = { Text("와이파이 이름 (SSID)") },
            singleLine = true,
            visualTransformation = highlight,
            trailingIcon = {
                IconButton(onClick = { expanded = !expanded }) {
                    Icon(
                        if (expanded) Icons.Filled.ArrowDropUp else Icons.Filled.ArrowDropDown,
                        contentDescription = "주변 와이파이 목록에서 고르기",
                    )
                }
            },
            supportingText = { Text(ssidSupportingText(state)) },
            modifier = Modifier.fillMaxWidth(),
        )
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            if (rankedNearby.isEmpty()) {
                DropdownMenuItem(
                    text = { Text("주변 와이파이 목록이 없습니다.\n(위치 권한 또는 위치 서비스가 꺼져 있을 수 있어요)") },
                    onClick = { expanded = false },
                    enabled = false,
                )
            }
            rankedNearby.forEach { network ->
                DropdownMenuItem(
                    text = {
                        Column {
                            Text(network.ssid, fontWeight = if (network.ssid == state.ssid) FontWeight.Bold else null)
                            Text(
                                "${securityLabel(network.security)} · 신호 ${signalLabel(network.rssi)}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    },
                    onClick = {
                        onSsidChange(network.ssid)
                        expanded = false
                    },
                )
            }
        }
    }
}

private fun ssidSupportingText(state: UiState): String {
    val parse = state.parse
    val matched = state.nearby.any { it.ssid == state.ssid }
    val parts = mutableListOf<String>()
    confidenceLabel(state.ssidConfidence)?.let { parts += it }
    if (parse?.rawSsid != null && parse.rawSsid != state.ssid && state.ssidConfidence != null && state.ssidConfidence.source != Source.USER) {
        parts += "사진의 '${parse.rawSsid}'를 주변 와이파이 이름으로 고쳤어요"
    } else if (matched) {
        parts += "주변에서 찾은 와이파이예요"
    } else if (state.ssid.isNotBlank() && state.nearby.isNotEmpty()) {
        parts += "주변 목록에 없는 이름이에요. 오른쪽 ▼에서 골라 보세요"
    } else if (state.ssid.isBlank()) {
        parts += "이름을 찾지 못했어요. 오른쪽 ▼에서 고르거나 직접 입력해 주세요"
    }
    return parts.joinToString(" · ")
}

@Composable
private fun PasswordField(state: UiState, onPasswordChange: (String) -> Unit) {
    val highlight = remember { ConfusableHighlightTransformation() }
    OutlinedTextField(
        value = state.password,
        onValueChange = onPasswordChange,
        label = { Text("비밀번호") },
        singleLine = true,
        // 비밀번호 키보드: 키보드 앱이 입력 내용을 학습·저장하지 않도록 한다. 내용은 확인을 위해 그대로 보여 준다.
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        visualTransformation = highlight,
        textStyle = MaterialTheme.typography.titleLarge.copy(fontFamily = FontFamily.Monospace),
        supportingText = {
            val parts = listOfNotNull(confidenceLabel(state.passwordConfidence), "${state.password.length}자")
            Text(parts.joinToString(" · "))
        },
        modifier = Modifier.fillMaxWidth(),
    )
}

/** 비밀번호에 헷갈리기 쉬운 글자가 있으면 어떤 글자인지 풀어서 보여 준다. */
@Composable
private fun ConfusableLegend(password: String) {
    val chars = ConfusableChars.indicesIn(password).map { password[it] }.distinct()
    if (chars.isEmpty()) return
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("헷갈리기 쉬운 글자가 있어요. 안내문과 같은지 확인해 주세요.", style = MaterialTheme.typography.bodyMedium)
            chars.forEach { c ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        c.toString(),
                        fontFamily = FontFamily.Monospace,
                        style = MaterialTheme.typography.titleLarge,
                        color = HighlightColors.confusableText,
                        modifier = Modifier
                            .background(HighlightColors.confusableBackground, RoundedCornerShape(4.dp))
                            .padding(horizontal = 8.dp),
                    )
                    Spacer(Modifier.padding(4.dp))
                    Text(ConfusableChars.describe(c).orEmpty(), style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}

@Composable
private fun SecuritySelector(security: SecurityType, onSecurityChange: (SecurityType) -> Unit) {
    Column {
        Text("보안 방식", style = MaterialTheme.typography.labelLarge)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(SecurityType.WPA2, SecurityType.WPA3, SecurityType.OPEN).forEach { type ->
                FilterChip(
                    selected = security == type,
                    onClick = { onSecurityChange(type) },
                    label = { Text(securityLabel(type)) },
                )
            }
        }
        if (security !in listOf(SecurityType.WPA2, SecurityType.WPA3, SecurityType.OPEN)) {
            Text("감지된 방식: ${securityLabel(security)}", style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun MessageCard(message: String, success: Boolean) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = if (success) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.errorContainer,
        ),
    ) {
        Text(message, modifier = Modifier.padding(12.dp))
    }
}

fun securityLabel(type: SecurityType): String = when (type) {
    SecurityType.OPEN -> "개방형"
    SecurityType.OWE -> "개방형(암호화)"
    SecurityType.WEP -> "WEP"
    SecurityType.WPA2 -> "WPA/WPA2"
    SecurityType.WPA3 -> "WPA3"
    SecurityType.ENTERPRISE -> "기업용(EAP)"
}

private fun signalLabel(rssi: Int): String = when {
    rssi >= -55 -> "강함"
    rssi >= -70 -> "보통"
    else -> "약함"
}

private fun confidenceLabel(extracted: Extracted?): String? = when {
    extracted == null -> null
    extracted.source == Source.USER -> "직접 지정"
    extracted.source == Source.QR -> "QR 코드에서 읽음"
    extracted.confidence >= 0.8 -> "인식 신뢰도 높음"
    extracted.confidence >= 0.5 -> "인식 신뢰도 보통"
    else -> "인식 신뢰도 낮음 — 꼭 확인해 주세요"
}

/** 0/O/o, 1/l/I/| 처럼 헷갈리는 글자를 색으로 강조한다. 글자 수는 바꾸지 않으므로 커서 위치는 그대로다. */
class ConfusableHighlightTransformation(
    private val style: SpanStyle = SpanStyle(
        color = HighlightColors.confusableText,
        background = HighlightColors.confusableBackground,
        fontWeight = FontWeight.Bold,
    ),
) : VisualTransformation {
    override fun filter(text: AnnotatedString): TransformedText {
        val highlighted = buildAnnotatedString {
            text.text.forEach { c ->
                if (ConfusableChars.isConfusable(c)) withStyle(style) { append(c) } else append(c)
            }
        }
        return TransformedText(highlighted, OffsetMapping.Identity)
    }

    override fun equals(other: Any?): Boolean = other is ConfusableHighlightTransformation && other.style == style
    override fun hashCode(): Int = style.hashCode()
}
