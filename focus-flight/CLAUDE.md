# Focus Flight — Claude Code 작업 지침

Windows용 집중 타이머. 비행 콘셉트(목적지 → 탑승 → 비행 → 착륙/추락)와 허용 목록 기반 방해 차단을 결합한다.
강제 차단 도구가 아니라 **자기 약속을 돕는 동기부여 도구**다. 다른 앱을 강제 종료하지 않는다.

## 스택
- Electron + TypeScript + React (electron-vite로 빌드)
- 활성 창 감지: `get-windows` (ESM 전용 → main에서 동적 `import()`)
- 지도: `d3-geo` + `world-atlas` (태평양 중심 Natural Earth 도법)
- 테스트: Vitest (`npm test`)
- 저장: userData 폴더의 JSON 파일 하나 (`src/main/storage.ts`). 외부 전송 없음.

## 구조
- `src/shared/` — 순수 로직. Electron/DOM에 의존하지 않으며 모두 테스트한다.
  - `flightMachine.ts` 상태 기계 (reducer, 시간은 이벤트의 `now`로만 받는다)
  - `geo.ts` haversine, slerp, 집중 시간 환산 / `cities.ts` 공항 좌표
  - `allowlist.ts` 허용 판정 (`allowed | blocked | neutral`)
  - `rewards.ts` 마일리지 m = c·t^α, 기종 해금 / `records.ts` 통계·도장·연속 일수
  - `controller.ts` 위 모듈을 묶는 `FlightController` (Main과 브라우저 mock이 공유)
  - `ipc.ts` IPC 채널 이름과 preload API 타입
- `src/main/` — Electron Main: 1초 폴링, 트레이, 난기류 오버레이, 확장 WebSocket(127.0.0.1:47321)
- `src/preload/` — `window.focusFlight` API 노출 (contextIsolation)
- `src/renderer/` — React UI. `window.focusFlight`가 없으면 mock(`api.ts`)으로 동작
- `extension/` — Chromium(Chrome/Edge/Whale) MV3 확장. 현재 탭 URL을 앱에 전달

## 상태 기계
```
idle → boarding → flying ⇄ turbulence → landed | crashed
                    ⇅
                  paused
```
| 상태 | 들어오는 조건 | 나가는 조건 |
|---|---|---|
| boarding | idle에서 BOARD | boardingMs 경과 → flying, CANCEL/ABORT → idle |
| flying | 이륙, 난기류 탈출, 일시정지 해제 | 남은 시간 0 → landed, 비허용 창 toleranceMs 연속 → turbulence |
| turbulence | 위 | 허용 창 복귀 → flying, graceMs 경과 → crashed(turbulence) |
| paused | flying/turbulence에서 PAUSE (maxPauses회까지) | RESUME 또는 maxPauseMs 경과 → flying |
| landed/crashed | 위, 또는 ABORT → crashed(aborted) | RESET → idle |

- 집중 시간(`elapsedMs`)은 flying에서만 쌓인다 (tolerance 구간 포함, turbulence·paused 제외).
- `neutral` 판정(시스템 창, 감지 실패)은 포커스 상태를 바꾸지 않는다.
- 비행 중에는 허용 목록을 **줄이는 것만** 가능하고 규칙(config)은 바꿀 수 없다 (`controller.updateSettings`).

## 규칙
- 새 로직은 `src/shared/`에 순수 함수로 넣고 테스트부터 작성한다.
- 임의로 정한 값(k=0.5, 유예 10초 등)은 하드코딩하지 말고 `config.ts`의 `FlightConfig`에 둔다.
- 창 제목·URL은 민감 정보일 수 있다. 로컬 밖으로 보내거나 로그로 남기지 않는다.
- 커밋 전: `npm run typecheck && npm test && npm run build`
