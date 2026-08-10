<!-- Builders Gate가 `bgate init` / `bgate adopt` 때 여기에 찍어 넣는 파일입니다.
Codex 세션이 이 게임 프로젝트에서 어떻게 일해야 하는지 알려 줍니다. 아래 도구 이름은
`builders-gate` MCP 서버에 실제로 있는 도구입니다. 도구 목록에 없다면 서버가 연결되지
않은 상태이므로, 임의로 처리하지 말고 연결 문제를 보고하세요. -->

# __PROJECT_NAME__ — Codex 작업 규칙

이 저장소는 Builders Gate가 연결된 게임 프로젝트입니다. Codex는 파일을 직접 고치기 전에
프로젝트 상태, 결정 기록, 작업 큐, 좌석 권한, 자산 잠금을 확인해야 합니다.

## 기본 순서

1. `project_status`, `bible_read`, `queue_list`로 시작합니다.
2. 큐에 있는 작업을 기준으로 움직입니다. 새 작업이 필요하면 `queue_add`로 만들고, 끝나면
   증거를 적어 `queue_complete`로 닫습니다.
3. 맡은 역할은 `seat_brief(role)`로 확인합니다. 경계가 애매한 파일은 쓰기 전에
   `seat_can_write(role, path)`로 확인합니다.
4. 이미지, 음원, 장면 같은 병합이 어려운 자산은 수정 전에 `asset_lock(path, seat)`로 잠그고
   끝난 뒤 `asset_release(path, seat)`로 풉니다.
5. 결정과 세계관은 임의로 바꾸지 않습니다. 필요한 경우 `bible_add`, `lore_add`,
   `canon_check`, `scope_check`로 근거를 남깁니다.
6. 변경 뒤에는 `godot_check_project`와 필요한 헤드리스 실행, 스크린샷, 로그를 남깁니다.
7. API 키, 토큰, 개인 인증 정보는 파일에 쓰거나 Git에 올리지 않습니다.

## 좌석 규칙

- `director`: 기둥, 범위, 컷 라인, 충돌 판정.
- `narrative`: 세계관, 문서, 대사, 선택지.
- `gameplay`: 조작감, 규칙, 상호작용.
- `tech`: 엔진, 빌드, 성능, 프로젝트 배선.
- `art`: 스프라이트, 질감, 화면 분위기. Codex 네이티브 이미지 생성을 사용할 수 있습니다.
- `audio`: 효과음, 음악, 오디오 연결.
- `qa`: 재현, 테스트, 검증, 회귀 확인.

## 증거 규칙

완료 보고에는 무엇을 바꿨는지와 무엇으로 확인했는지를 함께 적습니다. 파일을 만들지 않았거나
검증을 남기지 못했다면 완료로 닫지 말고 실패 또는 보류로 닫습니다.
