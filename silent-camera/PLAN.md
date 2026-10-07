# SilentCamera 개발 계획

> 이 문서는 **계획만** 담고 있습니다. 코드는 계획 승인 후 단계별로 작성합니다.

## 0. 개요

| 항목 | 내용 |
|---|---|
| 대상 기기 | 갤럭시 S22 (폰, 세로 위주) / 갤럭시 탭 S10+ (태블릿, 가로 위주) |
| 언어/UI | Kotlin, Jetpack Compose (Material 3) |
| 카메라 | CameraX 최신 안정 버전 (착수 시점에 Maven에서 최신 stable 확인 후 고정) — `camera-core`, `camera-camera2`, `camera-lifecycle`, `camera-view` |
| SDK | minSdk 26, targetSdk/compileSdk = 착수 시점 최신 안정 API |
| 구조 | 단일 Activity + MVVM (`ViewModel` + `StateFlow`), 수동 DI(규모가 작아 Hilt는 쓰지 않음) |
| 위치 | 이 저장소의 `silent-camera/` 폴더 (독립 Gradle 프로젝트) |

### 무음 촬영 원칙 (모든 단계에서 지킴)

- `ImageCapture`, `MediaActionSound`, `VideoCapture`는 **의존성·코드 어디에도 사용하지 않음**.
  단계마다 `grep -rE "ImageCapture|MediaActionSound"` 로 0건인지 확인.
- 사용하는 UseCase는 **`Preview` + `ImageAnalysis` 두 개뿐**.
- 타이머 카운트다운에도 비프음 등 어떤 소리도 내지 않음 (진동도 기본 OFF).

---

## 1. 패키지 구조 (예정)

```
silent-camera/
├─ settings.gradle.kts, build.gradle.kts, gradle/libs.versions.toml, gradlew
└─ app/src/main/
   ├─ AndroidManifest.xml
   └─ java/.../silentcamera/
      ├─ MainActivity.kt              // 단일 Activity, edge-to-edge, setContent
      ├─ ui/
      │  ├─ CameraScreen.kt           // 최상위 화면 (권한 상태에 따라 분기)
      │  ├─ PermissionScreen.kt       // 권한 요청/거부 안내
      │  ├─ CameraPreview.kt          // PreviewView(AndroidView) + 제스처
      │  ├─ controls/                 // 셔터, 전환, 토치, 타이머, 썸네일 버튼
      │  ├─ layout/                   // 폰/태블릿·세로/가로 배치
      │  └─ theme/
      ├─ camera/
      │  ├─ CameraController.kt       // CameraX 바인딩, 줌/초점/토치/전환
      │  ├─ FrameGrabber.kt           // ImageAnalysis.Analyzer, 촬영 요청 시 프레임 1장 확보
      │  └─ DeviceOrientation.kt      // OrientationEventListener → Surface.ROTATION_*
      ├─ image/
      │  ├─ FrameConverter.kt         // ImageProxy → Bitmap (회전 + 전면 미러)
      │  └─ TransformMath.kt          // 회전/미러 행렬 계산 (순수 함수, 단위 테스트 대상)
      ├─ storage/
      │  └─ PhotoRepository.kt        // MediaStore 저장, 최근 사진 조회
      └─ viewmodel/
         └─ CameraViewModel.kt        // UI 상태(StateFlow), 타이머, 촬영 흐름
```

UI 상태 (예정):

```
CameraUiState(
  lensFacing, hasFlashUnit, torchOn,
  zoomRatio, minZoom, maxZoom,
  timer: Off | 3s | 10s, countdown: Int?,
  isCapturing, flashEffectTrigger,
  lastPhotoUri, lastThumbnail,
  deviceRotation (아이콘 회전용)
)
```

---

## 2. 핵심 기술 설계

### 2.1 ImageAnalysis 설정

- `ResolutionSelector`
  - `ResolutionStrategy.HIGHEST_AVAILABLE_STRATEGY`
  - `setAllowedResolutionMode(PREFER_HIGHER_RESOLUTION_OVER_CAPTURE_RATE)` → 프레임레이트가 떨어지더라도 기기가 허용하는 최대 해상도
  - `AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY` (센서 원본 비율, 화각 손실 최소)
- `setBackpressureStrategy(STRATEGY_KEEP_ONLY_LATEST)`
- `setOutputImageFormat(OUTPUT_IMAGE_FORMAT_RGBA_8888)` → 별도 YUV 변환 코드 없이 Bitmap으로 바로 복사 (색 변환은 CameraX가 처리)
- Preview도 같은 4:3 `AspectRatioStrategy` 사용 → 두 스트림 화각 일치
- 실제 선택된 해상도는 `imageAnalysis.resolutionInfo`로 로그 출력 (디버그 빌드에서는 화면 구석에 표시) → 실기기에서 확인

> 참고: S22는 50MP 등 최대 모드를 서드파티 YUV 스트림에 열어주지 않을 수 있습니다. "기기가 ImageAnalysis에 허용하는 최고 해상도"가 목표이며, 실제 값은 실기기 로그로 확인합니다.

### 2.2 "최신 프레임" 확보 방식

매 프레임을 Bitmap으로 복사해 두면 고해상도에서 CPU·메모리 낭비가 큽니다. 그래서:

1. Analyzer는 평소에 `imageProxy.close()`만 호출 (가벼움, KEEP_ONLY_LATEST로 항상 최신 프레임만 들어옴).
2. 셔터(또는 타이머 종료) 시 `AtomicReference<CompletableDeferred<Bitmap>>`에 요청을 걸어 둠.
3. **바로 다음에 도착한 프레임**(30fps 기준 ≤ 약 33ms, 고해상도 저fps 모드에서도 수십 ms)을 Bitmap으로 복사 → 요청 완료 → `close()`.
4. 이후 회전/미러/JPEG 인코딩/저장은 `Dispatchers.Default`/`IO`에서 처리 → Analyzer 스레드 블로킹 없음.

연속 촬영 시 동시 요청은 1개로 제한 (`isCapturing` 동안 셔터 비활성화).

### 2.3 회전 처리 (항상 똑바로 저장)

- `ImageProxy.imageInfo.rotationDegrees`는 센서 방향 + `targetRotation`을 반영한 값.
- `targetRotation`은 **화면 회전이 아니라 기기 물리 방향**으로 갱신:
  `OrientationEventListener` → 0/90/180/270 구간화(히스테리시스 적용) → `imageAnalysis.targetRotation = Surface.ROTATION_*`
  → 폰을 세로 UI 고정 상태로 가로로 들고 찍어도 가로 사진이 똑바로 저장됨.
- 저장 시 픽셀 자체를 회전 (`Matrix.postRotate`) → EXIF Orientation은 `NORMAL`로 기록.
  (EXIF 회전 태그를 무시하는 앱에서도 항상 바로 보이도록)

### 2.4 전면 카메라 좌우 반전 보정

- `PreviewView`는 전면 미리보기를 거울처럼 반전해 보여 주지만, `ImageAnalysis` 버퍼는 반전되지 않은 원본.
- 저장 정책 (상수/설정 하나로 전환 가능하게 구현):
  - **기본값: 미리보기에서 본 그대로(거울 모드) 저장** — 삼성 기본 카메라의 "미리보기대로 사진 저장"과 동일
  - 옵션: 반전하지 않은 실제 모습으로 저장
- 행렬 순서: **회전 먼저 → 최종 이미지의 가로축 기준 `postScale(-1, 1)`** (순서가 바뀌면 가로로 찍은 셀피가 상하 반전되는 버그가 생김 → 단위 테스트로 4방향 × 전/후면 8케이스 검증).

### 2.5 전체 화면 미리보기와 저장 범위

- 폰(19.5:9)·태블릿(16:10) 화면은 센서(4:3)와 비율이 다름 → `PreviewView.ScaleType.FILL_CENTER`로 화면 가득 채우면 위/아래(또는 좌우)가 잘려 보임.
- **확정: 4:3 원본 전체 저장** — ImageAnalysis 프레임을 자르지 않고 그대로 저장해 해상도를 최대로 쓴다.
  화면에 안 보이던 위/아래(가로 시 좌우) 영역도 사진에 포함된다. (ViewPort/cropRect 크롭은 사용하지 않음)

---|---|---|
| 29+ (S22, Tab S10+) | `MediaStore.Images.Media.EXTERNAL_CONTENT_URI`, `RELATIVE_PATH = "Pictures/SilentCamera"`, `IS_PENDING=1` → 쓰기 → `IS_PENDING=0` | **불필요** |
| 26–28 | `Pictures/SilentCamera` 디렉터리에 직접 파일 쓰기 → MediaStore에 `DATA` 경로로 insert (또는 MediaScanner) | `WRITE_EXTERNAL_STORAGE` (`android:maxSdkVersion="28"`) — 첫 촬영 시에만 요청 |

- 파일명: `SilentCamera_yyyyMMdd_HHmmss_SSS.jpg`
- JPEG 품질 95, `androidx.exifinterface`로 촬영 일시·Orientation=NORMAL 기록.
- 저장 실패(용량 부족 등) 시 `IS_PENDING` 항목 삭제 + 스낵바 안내.

### 2.8 썸네일 / 갤러리 열기

- 촬영 성공 시 ViewModel이 `lastPhotoUri`와 축소 Bitmap(메모리에서 바로 축소 생성)을 보관.
- 앱 시작 시: 우리 앱이 만든 최신 사진을 MediaStore에서 조회 (API 29+는 자기 앱이 만든 파일은 권한 없이 조회 가능).
- 탭 → `Intent.ACTION_VIEW`(uri, `image/jpeg`, `FLAG_GRANT_READ_URI_PERMISSION`) → 삼성 갤러리에서 해당 사진이 열림. 처리 앱이 없으면 스낵바.

### 2.9 기타 기능

- **핀치 줌**: `ScaleGestureDetector` → `cameraControl.setZoomRatio(현재 × scaleFactor)`를 `zoomState` 범위로 클램프. 줌 배율 표시(1.0x).
- **탭 초점**: `previewView.meteringPointFactory.createPoint(x, y)` → `FocusMeteringAction`(AF+AE, 3초 후 자동 해제) + 탭 위치에 초점 링 애니메이션.
- **토치**: `cameraControl.enableTorch()`; `cameraInfo.hasFlashUnit()`이 false(전면)면 버튼 비활성화. 렌즈 전환 시 토치 OFF로 초기화.
- **전후면 전환**: `unbindAll` 후 새 `CameraSelector`로 재바인딩, 전환 중 미리보기 블러/페이드. 줌은 1.0으로 초기화.
- **타이머**: Off → 3초 → 10초 순환 토글. 카운트다운은 ViewModel 코루틴, 화면 중앙에 큰 숫자. 카운트다운 중 셔터를 다시 누르면 취소. 소리 없음.
- **깜빡임 효과**: 프레임 확보 순간 흰색(또는 검은색) 오버레이 alpha 0→0.8→0, 약 150ms.

### 2.10 폰/태블릿 레이아웃

`WindowSizeClass`(또는 `smallestScreenWidthDp ≥ 600`)로 판별.

- **폰 (S22)**: Activity를 세로로 고정(`requestedOrientation`을 코드에서 폰일 때만 PORTRAIT). 하단 바에 [썸네일] [셔터] [전환], 상단에 [토치] [타이머]. 기기를 가로로 돌리면 **아이콘만 회전**(기본 카메라 방식) → 미리보기가 끊기거나 레이아웃이 튀지 않음.
- **태블릿 (Tab S10+)**: 회전 자유.
  - 가로: 화면 오른쪽에 세로 컨트롤 레일(셔터를 엄지 위치인 오른쪽 중앙), 왼쪽 위에 토치/타이머.
  - 세로: 하단 바 배치 (폰과 유사하나 버튼·여백을 크게).
  - 셔터 버튼 크기, 터치 영역(최소 48dp 이상) 확대.
- 공통: edge-to-edge + `WindowInsets.safeDrawing`으로 펀치홀·내비게이션바 회피, 상태바 숨김(몰입 모드).

---

## 3. 단계별 작업 계획

각 단계 공통 완료 조건:
1. `./gradlew assembleDebug` 성공 (+ 해당 시 `./gradlew testDebugUnitTest`, `lintDebug`)
2. `ImageCapture|MediaActionSound` 검색 0건
3. git 커밋 (단계별 1커밋 이상) → 푸시
4. **실기기 확인 항목** 전달

> 빌드 환경: 작업 컨테이너에서 Android SDK를 받을 수 없어 빌드 확인은 GitHub Actions 결과로 한다. (`./gradlew assembleDebug testDebugUnitTest lintDebug` + 셔터음 API 사용 금지 검사)

### 1단계 — 프로젝트 골격
- Gradle Kotlin DSL, version catalog, Compose BOM, CameraX 의존성, minSdk 26, 단일 `MainActivity`, 테마, configChanges 설정, `.gitignore`.
- **실기기 확인**: 앱 설치·실행, 검은 화면/앱 이름 표시, 회전 시 크래시 없음.

### 2단계 — 카메라 권한 흐름
- `rememberLauncherForActivityResult(RequestPermission)`, 최초 요청 → 거부 시 이유 설명 + 다시 요청 → "다시 묻지 않음" 상태면 [설정 열기] 버튼(`ACTION_APPLICATION_DETAILS_SETTINGS`). 설정에서 돌아오면(`ON_RESUME`) 자동 재확인.
- **실기기 확인**: 최초 실행 팝업 / 거부 시 안내 화면 / 두 번 거부 후 설정 이동 → 허용하고 돌아오면 바로 카메라 화면으로 전환.

### 3단계 — 전체 화면 미리보기 + 회전 안정성
- `PreviewView`(AndroidView), FILL_CENTER, 후면 카메라 바인딩, 몰입 모드, 폰 세로 고정/태블릿 회전 허용.
- **실기기 확인**: 화면 가득 미리보기·왜곡 없음 / 탭에서 가로↔세로↔반대 가로 회전 시 미리보기가 검게 깜빡이거나 재시작되지 않음 / 홈 갔다 오기·화면 끄고 켜기 후 정상 복귀 / 분할 화면 진입.

### 4단계 — 무음 촬영 핵심 (ImageAnalysis → JPEG → MediaStore)
- `ImageAnalysis`(최고 해상도, KEEP_ONLY_LATEST, RGBA_8888), `FrameGrabber`, `FrameConverter`(회전·미러), `PhotoRepository`(API 29+ / 26–28 분기), 셔터 버튼 + 깜빡임 효과.
- 단위 테스트: 회전 행렬·파일명.
- **실기기 확인**:
  - **소리 모드에서 셔터음이 전혀 나지 않음** (가장 중요)
  - 갤러리 `Pictures/SilentCamera` 앨범에 저장됨, 저장소 권한 팝업 없음
  - 폰을 세로/가로/반대 가로/거꾸로 들고 각각 촬영 → 모두 똑바로 저장
  - 사진 정보에서 해상도 확인 (디버그 표시값과 일치)
  - 연타 시 크래시·중복 저장 없음, 촬영 중 미리보기 멈춤 체감 여부

### 5단계 — 썸네일 + 갤러리 열기
- **실기기 확인**: 촬영 직후 썸네일 갱신 / 탭 시 해당 사진이 갤러리에서 열림 / 앱 재시작 후에도 마지막 사진 썸네일 표시.

### 6단계 — 전후면 전환 + 전면 미러 보정
- **실기기 확인**: 전환 지연·크래시 없음 / 전면으로 글씨(책 표지 등) 촬영 → 저장 결과가 정책(기본: 미리보기와 동일)과 일치 / 전면으로 가로 촬영해도 상하가 뒤집히지 않음.

### 7단계 — 핀치 줌 + 탭 초점
- **실기기 확인**: 줌 범위(S22 후면 디지털 줌 한계 포함)·배율 표시 / 줌 상태로 촬영 시 저장 사진도 확대됨 / 가까운 물체 탭 초점 동작, 초점 링 표시 / 전면에서도 줌 동작.

### 8단계 — 토치
- **실기기 확인**: 후면에서 ON/OFF / 전면 전환 시 버튼 비활성·토치 꺼짐 / 앱을 백그라운드로 보내면 토치 꺼짐.

### 9단계 — 3초/10초 타이머
- **실기기 확인**: Off→3→10 순환 / 카운트다운 숫자 표시, 소리 없음 / 카운트다운 중 셔터 재탭으로 취소 / 카운트다운 중 렌즈 전환·백그라운드 이동 시 안전하게 취소.

### 10단계 — 폰/태블릿 적응형 레이아웃
- **실기기 확인**: S22에서 기기를 돌리면 아이콘만 회전 / 탭 가로에서 오른쪽 레일·세로에서 하단 바 배치 / 회전 중에도 미리보기 끊김 없음 / 펀치홀·내비게이션 바에 버튼이 가리지 않음.

### 11단계 — 마무리·안정화
- 고해상도 Bitmap 메모리 관리(재사용·즉시 recycle, OOM 방지), 저장 실패/용량 부족 처리, 카메라 사용 중(다른 앱 점유) 오류 화면, R8 릴리스 빌드 확인, `README.md` 작성.
- **실기기 확인**: 연속 30장 촬영 후 메모리·발열 / 다른 카메라 앱 사용 중 실행 / 릴리스 APK 동작.

---

## 4. 확정된 결정 사항

1. **저장 범위**: 4:3 원본 전체 저장 (해상도 최대)
2. **전면 사진**: 미리보기처럼 거울 모드로 저장
3. **폰 회전 정책**: 세로 고정 + 아이콘만 회전
4. **패키지명/앱 이름**: `com.example.silentcamera` / "무음 카메라"
5. **빌드**: 작업 컨테이너에서 Android SDK 다운로드(dl.google.com)가 차단되어 GitHub Actions(`.github/workflows/silent-camera-debug.yml`)로 빌드.
   푸시마다 디버그 APK를 아티팩트로 업로드.

## 5. 알려진 위험 요소

| 위험 | 대응 |
|---|---|
| ImageAnalysis 최고 해상도가 기본 카메라보다 낮을 수 있음 | 실제 해상도 로그 확인, 한계로 문서화 |
| 고해상도 RGBA 프레임 → 미리보기 프레임레이트 저하 | 평소에는 프레임 복사 안 함, 문제 시 해상도 한 단계 낮추는 옵션 |
| 고해상도 Bitmap 메모리 (12MP RGBA ≈ 48MB, 회전 사본 포함 ~2배) | 촬영 1건씩 직렬 처리, 사용 즉시 recycle |
| ImageAnalysis 사진은 기본 카메라의 멀티프레임 처리(노이즈 제거, HDR)가 없음 | 무음 방식의 본질적 한계로 안내 |
| 삼성 기기별 Preview+Analysis 스트림 조합 제약 | 바인딩 실패 시 해상도 자동 하향 fallback |
