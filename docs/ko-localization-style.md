# Builders Gate 한국어 UI 교열 기준

## 교열 포인트

- 제품명 `Builders Gate`, 엔진명 `Godot`, 도구명 `Codex`, `MCP`는 원문 표기를 유지한다.
- `seat`는 `좌석`, `queue`는 `작업 큐`, `dispatch/deploy`는 `투입`, `review`는 `검토`, `evidence`는 `증거`, `playtest`는 `플레이테스트`로 통일한다.
- 버튼과 탭은 짧은 명사형 또는 동사형으로 쓴다. 예: `저장`, `검증`, `모두 투입`, `다시 스캔`.
- 설명문은 `합니다/습니다` 문체로 맞춘다. 로그, 파일 경로, 코드, CLI 명령은 번역하지 않는다.
- 부정형은 구어체 회피 표현 대신 `없음`, `필요`, `불가`, `지원되지 않음`, `읽을 수 없습니다`처럼 화면 상태를 바로 알 수 있는 표현으로 쓴다.

## 최종 용어표

| 원문 | 한국어 |
| --- | --- |
| dashboard | 대시보드 |
| seat | 좌석 |
| agent | 에이전트 |
| director | 디렉터 |
| queue | 작업 큐 |
| dispatch/deploy | 투입 |
| auto-deploy | 자동 투입 |
| work item | 작업 항목 |
| approval gate | 승인 게이트 |
| Builder's gate | 빌더 승인 |
| playtest | 플레이테스트 |
| evidence | 증거 |
| artifact | 아티팩트 |
| asset | 에셋 |
| revision | 리비전 |
| world bible | 월드 바이블 |
| sprite editor | 스프라이트 편집기 |
| audio lab | 오디오 랩 |
| local generators | 로컬 생성기 |
| Agent CLIs | 에이전트 CLI |

## 자체점검

- 주요 정적 화면, 동적 패널, 버튼, 플레이스홀더, 툴팁에 같은 용어를 적용한다.
- CodeMirror, 코드 블록, 로그, 경로, 환경 변수, 명령어는 원문을 보존한다.
- 한국어 문구에는 `안 ` 부정형을 쓰지 않는다.
- macOS 로컬 패치이므로 원본 프로젝트 구조를 크게 바꾸지 않고, 런타임 현지화 레이어로 적용한다.
