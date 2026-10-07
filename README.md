# WiFi 스캐너

카페·음식점의 와이파이 안내문을 카메라로 찍으면 **SSID(와이파이 이름)와 비밀번호를 자동으로 읽어서**
비밀번호를 타이핑하지 않고 와이파이에 연결해 주는 안드로이드 앱입니다.

- 온디바이스 OCR: ML Kit Text Recognition v2 **한국어 모델** (사진은 기기 밖으로 나가지 않습니다)
- 와이파이 QR 코드(`WIFI:S:...;P:...;;`)도 인식
- 주변 와이파이 목록과 비교해 OCR 오타를 자동 교정 (예: `KT_GlGA` → `KT_GiGA`)
- 0/O, 1/l/I처럼 헷갈리는 글자를 색으로 강조
- 연결은 시스템 "네트워크 저장" 화면(`Settings.ACTION_WIFI_ADD_NETWORKS`)과 `WifiNetworkSuggestion` 사용
  (deprecated된 `WifiManager.addNetwork`는 쓰지 않습니다)

## 화면 흐름

1. **카메라 화면**: 미리보기, 촬영 버튼, 갤러리에서 불러오기
2. **확인 화면**: 추출된 SSID(▼ 버튼으로 주변 와이파이 목록에서 변경 가능), 수정 가능한 비밀번호 입력칸,
   보안 방식 선택, **연결** 버튼
3. **원문 화면**(자동 추출 실패 시): OCR 원문을 줄·낱말 단위로 보여 주고, 눌러서 SSID/비밀번호로 지정

## 프로젝트 구조

```
├── settings.gradle.kts         :app + included build(wifiparser)
├── gradle/libs.versions.toml   의존성 버전 모음
├── wifiparser/                 순수 Kotlin(JVM) 모듈. Android SDK 없이 빌드·테스트 가능
│   └── src/main/kotlin/.../wifiparser/
│       ├── WifiParser.kt       키워드 추출, 키워드 없는 경우 추정, 주변 SSID 교정, 신뢰도
│       ├── Levenshtein.kt      편집 거리 (OCR 혼동 글자 가중치 포함)
│       ├── WifiQrParser.kt     WIFI: QR 형식 파싱
│       ├── SecurityType.kt     capabilities → WPA2/WPA3/개방형 등
│       ├── ConfusableChars.kt  0/O/o, 1/l/I/| 위치 찾기
│       └── Models.kt
└── app/                        Android 앱 (Jetpack Compose)
    └── src/main/java/com/example/wifiscanner/
        ├── MainActivity.kt     화면 전환, 권한 요청 흐름
        ├── ScanViewModel.kt    상태 관리 (비밀번호는 메모리에만)
        ├── ocr/                ML Kit 한국어 OCR + QR 스캔
        ├── wifi/               주변 와이파이 스캔, 연결
        ├── permission/         권한 설명 대화상자
        └── ui/                 camera / confirm / raw 화면
```

## WifiParser 동작 방식

1. 와이파이 QR이 있으면 그 값을 신뢰도 1.0으로 바로 사용합니다.
2. OCR 결과를 줄 단위로 나눈 뒤 키워드를 찾습니다.
   - SSID: `와이파이`, `WiFi`, `Wi-Fi`, `WIFI`, `ID`, `아이디`, `SSID`, `네트워크`
   - 비밀번호: `비번`, `비밀번호`, `PW`, `P/W`, `Password`, `Pass`, `패스워드` (+ `PWD`, `암호`)
   - 구분자(`:`, `：`, `-`, `=`, 공백)가 제각각이어도 되고, 값이 다음 줄에 있어도 됩니다.
   - `ID   PW` / `cafe_2F   12345678` 같은 표 형태도 처리합니다.
   - `와이파이 비번 abcd1234`처럼 값 없는 앞 키워드는 제목으로 보고 무시합니다.
   - `비밀번호는 coffee2024 입니다`의 조사·어미를 걸러냅니다.
3. 비밀번호 키워드가 없으면 영문·숫자 8자 이상 문자열을 비밀번호 후보로 봅니다
   (전화번호·날짜·URL은 제외).
4. 주변 와이파이 목록이 있으면 Levenshtein 편집 거리로 가장 가까운 실제 SSID로 교정합니다.
   - OCR이 정확히 적은 SSID가 있으면 그것을 고릅니다.
   - 2.4G/5G처럼 비슷한 SSID가 여럿이면 신호가 센 쪽을 고릅니다.
5. 매칭된 네트워크의 capabilities로 보안 방식(WPA2/WPA3/개방형 등)을 판별합니다.
6. SSID와 비밀번호에 각각 0.0~1.0 신뢰도를 매기고, 확인 화면에 "높음/보통/낮음"으로 표시합니다.

## 권한

| 권한 | 용도 | 거부하면 |
|---|---|---|
| `CAMERA` | 안내문 촬영 | 갤러리에서 사진을 불러와 사용 |
| `ACCESS_FINE_LOCATION` (+ `ACCESS_COARSE_LOCATION`) | 주변 와이파이 목록 읽기 (Android 정책상 필요) | SSID 자동 교정 없이 동작 |
| `NEARBY_WIFI_DEVICES` (Android 13+) | 주변 와이파이 목록 읽기 | SSID 자동 교정 없이 동작 |
| `ACCESS_WIFI_STATE`, `CHANGE_WIFI_STATE` | 스캔 결과 조회, 연결 제안 등록 | 설치 시 자동 허용 |

권한마다 요청하기 직전에 왜 필요한지 한국어로 설명합니다. 한 번 거부한 뒤 다시 허용 버튼을 누르면 앱 설정 화면을 엽니다.

## 개인정보·보안

- 비밀번호는 **로그에 남기지 않고 저장하지도 않습니다.** ViewModel 메모리에만 있고,
  "다시 촬영"을 누르거나 앱이 종료되면 지워집니다.
- `ParseResult`, `Extracted`, `UiState`의 `toString()`은 비밀번호를 가립니다.
- 릴리스 빌드는 R8 규칙으로 모든 `android.util.Log` 호출을 제거합니다.
- 백업과 기기 간 전송을 껐습니다 (`allowBackup=false`, `data_extraction_rules.xml`).
- 비밀번호 입력칸은 비밀번호 키보드 모드라서, 키보드 앱이 입력 내용을 학습하지 않습니다.
- 사진과 OCR 처리는 모두 기기 안에서 이뤄집니다.

## 빌드 방법

### 준비물

- **Android Studio** (최신 안정판) 또는 Android SDK 명령줄 도구
  - SDK Platform **36**, Android SDK Build-Tools
- **JDK 17 이상** (Android Studio에 들어 있는 JBR을 써도 됩니다)

### Android Studio에서

1. `File > Open`으로 이 저장소 폴더를 엽니다.
2. Gradle 동기화가 끝나면 상단 실행 구성에서 `app`을 고르고 ▶(Run)을 누릅니다.

### 명령줄에서

```bash
# SDK 위치 지정 (Android Studio가 만들어 주지 않았다면)
echo "sdk.dir=$HOME/Android/Sdk" > local.properties        # macOS: $HOME/Library/Android/sdk

# 파서 단위 테스트 (Android SDK 없이도 실행 가능)
./gradlew -p wifiparser test

# 디버그 APK
./gradlew :app:assembleDebug
# → app/build/outputs/apk/debug/app-debug.apk

# 릴리스 APK (R8 축소 + 로그 제거, 개인 설치용으로 디버그 키 서명)
./gradlew :app:assembleRelease
# → app/build/outputs/apk/release/app-release.apk
```

Windows에서는 `./gradlew` 대신 `gradlew.bat`을 씁니다.

> 의존성 버전은 `gradle/libs.versions.toml`에 모여 있습니다. Android Studio가 새 버전을 제안하면
> 이 파일에서 올리면 됩니다.

## 실제 기기에 설치하기

앱은 **Android 11(API 30) 이상**에서 동작합니다. 에뮬레이터에는 실제 와이파이 스캔이나 연결 기능이 없으니
실제 기기로 테스트하세요.

### 1. 개발자 옵션과 USB 디버깅 켜기

1. `설정 > 휴대전화 정보 > 소프트웨어 정보`에서 **빌드번호**를 7번 누릅니다.
   (기종에 따라 `설정 > 휴대전화 정보`에 바로 있습니다)
2. `설정 > 개발자 옵션`에서 **USB 디버깅**을 켭니다.
3. USB 케이블로 PC에 연결하고, 휴대전화에 뜨는 "USB 디버깅을 허용하시겠습니까?"에서 **허용**을 누릅니다.

### 2-A. Android Studio로 설치

상단 기기 목록에서 연결한 휴대전화를 고르고 ▶(Run)을 누르면 설치와 실행이 함께 됩니다.

### 2-B. adb로 설치

```bash
adb devices                       # 기기가 "device"로 보이는지 확인
./gradlew :app:installDebug       # 빌드 + 설치를 한 번에
# 또는 이미 만든 APK를 설치
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

`adb`는 Android SDK의 `platform-tools` 폴더에 있습니다.

### 2-C. 케이블 없이 APK 파일로 설치

1. 위에서 만든 APK 파일을 휴대전화로 옮깁니다 (메신저, 클라우드, USB 파일 전송 등).
2. 휴대전화의 파일 앱에서 APK를 누릅니다.
3. "출처를 알 수 없는 앱" 경고가 나오면, 그 파일 앱에 **이 출처 허용**을 켜고 설치합니다.

### 3. 처음 실행할 때

1. 카메라 권한 설명이 나오면 **계속 → 허용**을 누릅니다.
2. 주변 와이파이 권한 설명이 나오면 **계속 → 정확한 위치 + 허용**을 누릅니다.
   (위치 권한은 와이파이 이름 교정에만 쓰입니다. **기기의 위치 서비스도 켜져 있어야** 주변 목록이 보입니다.)
3. 안내문을 찍고 → 확인 화면에서 값을 확인하고 → **연결**을 누릅니다.
4. 시스템의 "네트워크 저장" 화면에서 **저장**을 누르면 연결됩니다.

## 알려진 제한

- **WEP**와 **기업용(EAP)** 와이파이는 Android 앱 API로 연결할 수 없어서, 설정 앱에서 직접 연결하도록 안내합니다.
- Android는 포그라운드 앱의 와이파이 스캔을 2분에 4회로 제한합니다. 그 이상은 직전 스캔 결과를 씁니다.
- 일부 제조사 기기에 시스템 저장 화면이 없으면 "연결 제안" 방식으로 대신합니다.
  이때는 알림에서 WiFi 스캐너의 제안을 허용해야 연결됩니다.

---

## 부록: 벽돌 깨기 (Brick Breaker)

이 저장소에는 예전에 만든 웹 게임 `index.html`도 함께 들어 있습니다.

웹브라우저에서 실행되는 간단한 2D 벽돌 깨기 게임입니다.

### 실행 방법

`index.html` 파일을 브라우저로 열면 바로 플레이할 수 있습니다. (별도 설치 불필요)

### 조작법

- **← / →** 방향키 또는 **마우스/터치**로 패들 이동
- **스페이스바** 또는 **클릭**으로 공 발사 / 재시작 / 다음 레벨

### 점수 규칙

| 벽돌 색 (위→아래) | 기본 점수 |
|---|---|
| 빨강 | 50 |
| 주황 | 40 |
| 노랑 | 30 |
| 초록 | 20 |
| 파랑 | 10 |

- 벽돌 점수 × 현재 레벨 만큼 획득
- 레벨 클리어 시 보너스 `100 × 레벨`
- 생명 3개, 모두 잃으면 게임 오버
- 레벨이 오를수록 공 속도 증가
- 최고 점수는 브라우저에 저장됨
