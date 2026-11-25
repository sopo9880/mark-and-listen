# Mark & Listen

회차를 만들고, 실전처럼 풀고, 틀린 문제만 다시 보는 **시험 대비 데스크톱 앱**입니다. TOEIC을 시작으로 여러 시험관을 같은 구조로 지원합니다. Windows x64 설치본(Tauri)이 우선이며 macOS DMG와 Android APK는 다음 단계입니다.

- 현재 베타: **v0.2.0.0** · [변경 사항](BETA-0.2.0.0.md) · [설계 및 인수인계](docs/design-handoff.md)
- 공식 시험과 무관한 연습용 창작 문항입니다. 점수는 원점수(정답 수)로만 표시하고 공식 환산 점수는 제공하지 않습니다.

## 시험관

| 시험관 | 구성 | 특징 |
|---|---|---|
| **TOEIC관** | LC Part 1–4 · RC Part 5–7 (전체 200, LC/RC 100, 파트 선택, 세부 조정) | LC 45분 → RC 75분 벽시계 타이머, Gemini/OpenAI Live 낭독 + 전사 자동 대조, 실전 OMR |
| **객관식 시험관** | 과목 1–8개, 과목당 1–60문항, 4·5지선다 | 일반기계기사·정보처리기사 필기 프리셋, 과목별 40점 과락 · 평균 60점 합격 판정 |

## 주요 화면

- **홈** — 진행 중인 시험 이어 풀기, 최근 성적 추이, 제작 중인 회차, 복습할 오답 수
- **시험관** — 시험관별 회차 구성. TOEIC관의 *실험실*에는 고정 대본 낭독 검증 세트가 있습니다.
- **Part 1 사진 보관함** — 사진 ZIP·이미지를 가져와 로컬에만 저장하고, 회차마다 같은 장면이 겹치지 않게 Part 1에 배정합니다. 사진은 저장소·설치본에 포함하지 않습니다.
- **제작 스튜디오** — 문항 생성 → Live 음원 → 검수 → 응시 단계 표시. 제작은 백그라운드로 진행되고 언제든 멈추고 이어갈 수 있습니다. 음원마다 대본과 전사의 단어 단위 차이(누락·추가)를 색으로 보여 주고, 실패한 구간은 마지막 시도의 전사를 남깁니다.
- **응시** — 집중 모드(사이드바 숨김), 영역별 타이머, OMR 답안지. TOEIC은 OMR에만 마킹하고, 객관식은 CBT처럼 보기를 바로 눌러도 됩니다. 앱을 닫거나 다른 화면으로 가도 시간은 계속 흐릅니다.
- **복습** — 정답률 링, 영역·파트(과목)별 막대, 틀림/미응답 필터, 해설과 LC 대본·음원
- **오답 노트** — 모든 회차의 최근 응시에서 틀리거나 비운 문항을 모아 다시 풀고 ‘익혔어요’로 정리
- **설정** — 문항 생성 엔진(Codex · GPT API · Gemini API), Live 낭독 모델과 테스트, Codex 엔진 관리, 서명된 앱 업데이트

## 디자인

화면은 [Lucian UX/UI Prompt](https://lucianlabs.dev/uxui-prompt/)(MIT)의 테마 토큰과 요소를 바탕으로 합니다. `public/lucian.css`에 토큰·베이스와 요소 CSS를 원본 그대로 두고, 강조색만 로고의 그린·라임으로 매핑했습니다. 다크 모드는 시스템 설정을 따르며 사이드바 스위치로 바꿀 수 있습니다.

| 요소 | 쓰인 곳 |
|---|---|
| [#039 미끄러지는 알약 탭](https://lucianlabs.dev/uxui-prompt/#039) | 모든 필터·세그먼트 컨트롤 (`ui/lux-tabs.mjs`) |
| [#070 겹쳐 쌓이는 토스트](https://lucianlabs.dev/uxui-prompt/#070) | 앱 알림 (`ui/lux-toast.mjs`) |
| [#447 낮·밤 하늘 스위치](https://lucianlabs.dev/uxui-prompt/#447) | 사이드바 라이트/다크 전환 (`ui/lux-theme.mjs`) |
| [#095 모양이 바뀌는 막대 차트](https://lucianlabs.dev/uxui-prompt/#095) | 홈 ‘최근 성적’ (`ui/lux-bars.mjs`) |
| [#151 기여가 쌓이는 주간 격자](https://lucianlabs.dev/uxui-prompt/#151) | 홈 ‘학습 기록’ 히트맵 (`ui/lux-heat.mjs`) |

## 개발

Node.js 22 이상이 필요합니다. 런타임 npm 의존성은 없습니다(개발 도구만 설치).

```bash
npm ci
npm start          # http://127.0.0.1:4173/ (포트가 사용 중이면 빈 포트를 자동 선택해 출력)
npm test           # node:test 단위·API 테스트
npx prettier --check "src/**/*.mjs" "public/**/*.mjs" "test/**/*.mjs"
```

Windows에서는 `Start-Mark-and-Listen.cmd`를 실행해도 됩니다. 데이터는 `%LOCALAPPDATA%\mark-and-listen`(또는 `MARK_LISTEN_DATA`)에 저장됩니다.

### 구조

```
src/                 로컬 서버 (Node)
  main.mjs           진입점 · 포트 선택 · MARK_READY:<port> 신호
  server.mjs         HTTP API · 정적 파일 · 제작 파이프라인
  episode-store.mjs  회차 저장(원자적 쓰기) · 응시 · 오답 노트 집계
  episode-content.mjs 시험관별 출제 프롬프트와 엄격한 JSON 검증
  narration.mjs      대본 ↔ 전사 정규화와 단어 정렬 diff
  *-live.mjs, providers.mjs, codex-*.mjs, app-update.mjs  외부 연동
public/              UI (브라우저 ES 모듈, 빌드 단계 없음)
  lib/               서버와 공유: 시험관 레지스트리, 응시 상태 기계, 채점
  ui/                화면 모듈 (home, halls, library, studio, exam, review, notebook, settings)
src-tauri/           Windows 셸 — 번들된 node.exe로 서버를 띄우고 WebView2 창을 엽니다
```

### 새 시험관 추가

`public/lib/exams.mjs`의 `EXAMS`에 영역(`sections`: 제한 시간, 음원 여부)과 파트(문항 수, 출제 단위, 선택지 수)를 정의하고, `src/episode-content.mjs`에 출제 프롬프트를 추가합니다. 응시 타이머·OMR·채점·복습·오답 노트는 영역/파트 정의만으로 동작합니다.

## 배포

- PR마다 `CI` 워크플로가 테스트, 서명 없는 Windows 설치본 빌드, 설치 후 실행 스모크 테스트를 수행합니다.
- `main`에서 `release-beta-win64.yml`이 바뀌면 설치본을 빌드·검증하고 업데이트 매니페스트에 서명해 GitHub 프리릴리스를 게시합니다. 설치본에는 Windows Authenticode 서명이 없습니다.
