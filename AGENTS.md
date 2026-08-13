# Builders Gate — Codex 작업 규칙

이 체크아웃은 macOS에서 로컬 Codex CLI로 Builders Gate를 실행하는 구성을 기준으로
관리한다. Windows 전용 경로나 다른 실행기 인증을 기본값으로 되살리지 않는다.

## 현재 기준

- 대시보드는 macOS에서 `bgate serve --port 7788`로 실행한다. `bgate app`은 기본 경로로
  쓰지 않는다.
- 게임 프로젝트는 `/Users/tajokim/builders-gate-codex-lab`이다.
- Godot 실행 파일은 `/Applications/Godot.app/Contents/MacOS/Godot`이다.
- MCP 등록은 `codex mcp add builders-gate -- /Users/tajokim/BuildersGate/.venv/bin/python -m bgate_mcp.server`
  형식을 사용한다.
- 에이전트 실행기는 Codex 전용이다. API 키나 다른 실행기 OAuth에 기대지 않는다.
- Tailscale Serve는 tailnet 내부 공개만 사용한다. Funnel은 켜지 않는다.

## 수정 규칙

1. macOS 경로와 Homebrew 경로를 우선한다.
2. 사용자 화면에 보이는 문구는 꼭 필요한 제품명, 명령어, 파일명 외에는 한국어로 쓴다.
3. 다른 실행기 관련 문구를 새 실행 경로 설명으로 추가하지 않는다. 과거 호환 코드나 역사 기록을
   건드릴 때는 실제 동작을 확인하고 최소 범위로 수정한다.
4. Codex 실행 검증은 `codex mcp list`, 대시보드 `/api/local/agents`, 실제 큐 작업 완료,
   Godot headless 실행으로 확인한다.
5. API 키, 토큰, 인증 정보는 출력하거나 Git에 넣지 않는다.
