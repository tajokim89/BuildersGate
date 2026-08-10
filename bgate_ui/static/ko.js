(function () {
  "use strict";

  const N = s => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  const HAS_KO = /[가-힣]/;

  const entries = [
    ["Builders Gate", "Builders Gate"],
    ["Primary navigation", "주 탐색"],
    ["Keep the navigation expanded", "탐색 메뉴 펼쳐 두기"],
    ["Colour theme", "색상 테마"],
    ["Always dark", "항상 다크 모드"],
    ["Always light", "항상 라이트 모드"],
    ["Follow the OS setting", "운영체제 설정 따르기"],
    ["Orbit - glass on vanta black", "오빗 - 반타 블랙 위 글래스"],
    ["Resize the navigation rail - arrow keys adjust, Home resets", "탐색 레일 크기 조절 - 화살표 키로 조절, 홈 키로 초기화"],
    ["Agents currently executing a task.", "현재 작업을 실행 중인 에이전트입니다."],
    ["Command", "지휘"],
    ["Build", "제작"],
    ["Edit", "편집"],
    ["Library", "라이브러리"],
    ["Overview", "개요"],
    ["Agents", "에이전트"],
    ["Settings", "설정"],
    ["Studio", "스튜디오"],
    ["Seat workspaces", "좌석 작업공간"],
    ["Playtests", "플레이테스트"],
    ["Sprite editor", "스프라이트 편집기"],
    ["Audio lab", "오디오 랩"],
    ["Assets", "에셋"],
    ["Atlas", "아틀라스"],
    ["World bible", "월드 바이블"],
    ["Timeline", "타임라인"],
    ["connecting…", "연결 중..."],
    ["connecting...", "연결 중..."],
    ["running", "실행 중"],
    ["vault", "보관함"],

    ["Command deck", "지휘 데크"],
    ["The studio at a glance - live agents, the queue, the build.", "실행 중인 에이전트, 작업 큐, 빌드를 한눈에 확인합니다."],
    ["Running now", "현재 실행 중"],
    ["nothing dispatched", "투입된 작업 없음"],
    ["Recent activity", "최근 활동"],
    ["quiet", "조용함"],
    ["Orchestration", "오케스트레이션"],
    ["console · talk & watch", "콘솔 · 대화와 관찰"],
    ["board", "보드"],
    ["this session", "현재 세션"],
    ["Earlier conversations - nothing is deleted, the logs are still there", "이전 대화 - 삭제되는 내용은 없으며 로그는 그대로 남습니다"],
    ["history", "기록"],
    ["clear", "비우기"],
    ["File this conversation and start a fresh one", "이 대화를 보관하고 새 대화를 시작합니다"],
    ["waking the console…", "콘솔을 깨우는 중..."],
    ["Talk to the director again", "디렉터와 다시 대화"],
    ["What sending does", "보내기 동작"],
    ["dispatch", "투입"],
    ["brainstorm", "브레인스토밍"],
    ["tell the director what you want - it answers, then delegates…", "원하는 내용을 디렉터에게 알려 주세요. 디렉터가 응답한 뒤 작업을 나눕니다..."],
    ["send", "보내기"],
    ["Previous panel", "이전 패널"],
    ["Next panel", "다음 패널"],
    ["Discard every waiting ticket", "대기 중인 티켓 모두 비우기"],
    ["deploy all", "모두 투입"],
    ["Resize the transcript against the graph - arrow keys adjust, Home resets", "그래프 대비 대화 기록 크기 조절 - 화살표 키로 조절, 홈 키로 초기화"],
    ["Dispatch queued work automatically as slots free up", "빈 슬롯이 생기면 큐의 작업을 자동으로 투입합니다"],
    ["auto-deploy off", "자동 투입 꺼짐"],
    ["auto-deploy on", "자동 투입 켜짐"],
    ["Approval gate", "승인 게이트"],
    ["No gate - an agent's own word closes its item", "게이트 없음 - 에이전트 보고만으로 항목을 닫습니다"],
    ["Agent gate - the QA seat verifies every deliverable", "에이전트 게이트 - QA 좌석이 모든 산출물을 검증합니다"],
    ["Builder's gate - you approve before anything counts as done", "빌더 승인 - 완료 처리 전에 사용자가 승인합니다"],
    ["none", "없음"],
    ["agent", "에이전트"],
    ["builder's", "빌더 승인"],
    ["Stop every agent on this project and turn auto-deploy off", "이 프로젝트의 모든 에이전트를 중지하고 자동 투입을 끕니다"],
    ["Showing work that is running, queued, broken, or just landed", "실행 중, 대기 중, 실패, 방금 도착한 작업 표시"],
    ["stop all", "모두 중지"],
    ["in flight", "진행 중"],
    ["fit", "맞춤"],
    ["re-lay out", "다시 배치"],
    ["Resize the inspector - arrow keys adjust, Home resets", "인스펙터 크기 조절 - 화살표 키로 조절, 홈 키로 초기화"],
    ["Seat", "좌석"],
    ["Task title - a short imperative…", "작업 제목 - 짧은 명령형으로 입력..."],
    ["＋ brief", "+ 지시"],
    ["add to queue", "큐에 추가"],
    ["Brief - scope, constraints, and what 'done' looks like. The agent acts on this with no other context, so be specific: name the exact animations/assets/files, not 'all of them'.", "작업 지시 - 범위, 제약, 완료 기준을 적습니다. 에이전트는 이 내용만 보고 움직이므로 정확한 애니메이션, 에셋, 파일명을 지정해 주세요."],
    ["priority", "우선순위"],
    ["normal", "보통"],
    ["high", "높음"],
    ["A precise brief is what keeps scope from ballooning - item 56 crashed on an empty one.", "정확한 지시문이 범위 확장을 막습니다. 빈 지시문은 작업 실패로 이어질 수 있습니다."],
    ["Active now", "현재 활성"],
    ["Pipeline", "파이프라인"],
    ["Live activity", "실시간 활동"],
    ["no activity yet - the ledger fills as seats work", "아직 활동 없음 - 좌석이 작업하면 장부가 채워집니다"],

    ["loading settings…", "설정을 불러오는 중..."],
    ["Node studio", "노드 스튜디오"],
    ["Visual node editors for asset generation, agent orchestration, and the game.", "에셋 생성, 에이전트 오케스트레이션, 게임 작업을 위한 시각 노드 편집기입니다."],
    ["loading studio…", "스튜디오를 불러오는 중..."],
    ["Purpose-built workspaces", "목적별 작업공간"],
    ["Each seat gets a workspace tuned to its craft.", "각 좌석에는 담당 작업에 맞춘 작업공간이 제공됩니다."],
    ["pick a seat", "좌석 선택"],
    ["Evidence", "증거"],
    ["Play the current build and record a session - then open a recording for video, transcript, telemetry, and the director's triage.", "현재 빌드를 플레이하고 세션을 녹화한 뒤, 영상, 기록, 텔레메트리, 디렉터 분류를 확인합니다."],
    ["checking playtest gear…", "플레이테스트 장비 확인 중..."],
    ["Iteration goal", "반복 목표"],
    ["Playtest target", "플레이테스트 대상"],
    ["web build", "웹 빌드"],
    ["native Godot", "네이티브 Godot"],
    ["● record", "● 녹화"],
    ["■ stop", "■ 중지"],
    ["▶ boot current build", "▶ 현재 빌드 실행"],
    ["Controls come from your game's own input map - F1 opens live tuning over the running build.", "조작은 게임의 입력 맵을 따릅니다. F1을 누르면 실행 중인 빌드 위에 실시간 튜닝이 열립니다."],
    ["Recorded sessions", "녹화된 세션"],
    ["sprite editor", "스프라이트 편집기"],
    ["audio lab", "오디오 랩"],
    ["run integrity audit", "무결성 감사 실행"],
    ["reading the library…", "라이브러리를 읽는 중..."],
    ["Review queue · generated candidates by logical name", "검토 큐 · 논리 이름별 생성 후보"],
    ["Search assets…", "에셋 검색..."],
    ["All", "전체"],
    ["To review", "검토 필요"],
    ["Approved", "승인됨"],
    ["Rejected", "반려됨"],
    ["generated candidates appear here", "생성 후보가 여기에 표시됩니다"],
    ["Tracked binaries · integrity", "추적 중인 바이너리 · 무결성"],
    ["Creative constraints", "창작 제약"],
    ["Write the bible, hold the cut line, and keep the fiction honest. Everything here is authored by you - the pipeline reads it.", "바이블을 쓰고 기준선을 유지하며 픽션의 일관성을 지킵니다. 여기에 작성한 내용은 파이프라인이 읽습니다."],
    ["loading world…", "월드를 불러오는 중..."],
    ["Project map", "프로젝트 맵"],
    ["Build the scene and edit the code behind it, against a live scan of the project's scenes, scripts, and SpriteFrames.", "프로젝트의 씬, 스크립트, SpriteFrames 실시간 스캔을 바탕으로 씬을 만들고 코드를 편집합니다."],
    ["scene · build it", "씬 · 빌드"],
    ["code · edit it", "코드 · 편집"],
    ["Causal history", "인과 기록"],
    ["Iteration timeline", "반복 타임라인"],
    ["Goal, snapshot, assets, evidence, decisions, and outcome per iteration.", "각 반복의 목표, 스냅샷, 에셋, 증거, 결정, 결과를 기록합니다."],
    ["the first recorded playtest creates an iteration", "첫 녹화 플레이테스트가 반복 기록을 만듭니다"],
    ["Close", "닫기"],
    ["Playtest review", "플레이테스트 검토"],
    ["close", "닫기"],
    ["No project here yet.", "아직 프로젝트가 없습니다."],
    ["Pitch", "피치"],
    ["optional", "선택"],
    ["one line - what is this game?", "한 줄로 이 게임을 설명해 주세요"],
    ["Starting template", "시작 템플릿"],
    ["Side-on platformer slice - player, ground, ledge, jump/land telemetry.", "측면 플랫폼 게임 조각 - 플레이어, 지면, 발판, 점프/착지 텔레메트리."],
    ["First-person slice - capsule player, ground, block, jump/land telemetry.", "1인칭 게임 조각 - 캡슐 플레이어, 지면, 블록, 점프/착지 텔레메트리."],
    ["Create project", "프로젝트 생성"],
    ["Same thing from a terminal:", "터미널에서도 같은 작업을 실행할 수 있습니다:"],
    ["builders gate · local floor · 127.0.0.1", "Builders Gate · 로컬 환경 · 127.0.0.1"],
    ["Dismiss", "닫기"],
    ["Notifications", "알림"],
    ["nothing new", "새 알림 없음"],
    ["streamer", "스트리머"],
    ["paths, identity and keys are shown in full. Turn this on in Settings > Privacy, or set BGATE_STREAMER=1", "경로, 식별자, 키가 전체 표시됩니다. 설정 > 개인정보에서 켜거나 BGATE_STREAMER=1을 설정하세요."],
    ["live agents", "실시간 에이전트"],
    ["candidates", "후보"],
    ["playtests", "플레이테스트"],
    ["tracked", "추적 중"],
    ["Work history", "작업 기록"],
    ["Approval gate right now:", "현재 승인 게이트:"],
    ["agent gate - the QA seat verifies every deliverable", "에이전트 게이트 - QA 좌석이 모든 산출물을 검증합니다"],
    ["agent gate — the QA seat verifies every deliverable", "에이전트 게이트 - QA 좌석이 모든 산출물을 검증합니다"],
    [". New work below gets an independent check.", " 아래의 새 작업은 독립 검사를 받습니다."],
    ["search titles and result notes…", "제목과 결과 메모 검색..."],
    ["every seat", "모든 좌석"],
    ["all", "전체"],
    ["cancelled", "취소됨"],
    ["gate runs", "게이트 실행"],
    ["The QA gate's own runs. Off by default: each one is already shown as the verdict of the item it reviewed.", "QA 게이트 자체 실행입니다. 기본값은 꺼짐입니다. 각 실행은 검토한 항목의 판정으로 이미 표시됩니다."],
    ["nothing done matches this filter.", "완료된 항목 중 이 필터와 일치하는 항목이 없습니다."],
    ["nothing 완료됨 결과 this filter.", "완료된 항목 중 이 필터와 일치하는 항목이 없습니다."],
    ["showing 0 of 0", "0개 중 0개 표시"],
    ["load 40 more", "40개 더 불러오기"],
    ["idle - no ledger entries yet", "대기 중 - 아직 장부 항목 없음"],
    ["idle", "대기 중"],
    ["no work on this seat yet", "아직 이 좌석의 작업 없음"],
    ["filter this seat's work…", "이 좌석의 작업 검색..."],
    ["Nothing has been queued to this seat. Work filed here shows up with its full transcript.", "아직 이 좌석에 대기 중인 작업이 없습니다. 여기에 등록된 작업은 전체 기록과 함께 표시됩니다."],
    ["Control tower", "관제탑"],
    ["Live agent board", "실시간 에이전트 보드"],
    ["refresh", "새로고침"],
    ["No agents running. Dispatch a queued item below, or \"review for delegation\" to spin up a director.", "실행 중인 에이전트가 없습니다. 아래의 대기 항목을 투입하거나 \"위임 검토\"로 디렉터를 시작하세요."],
    ["No agents running. Dispatch a queued item below, or \"Review for delegation\" to spin up a director.", "실행 중인 에이전트가 없습니다. 아래의 대기 항목을 투입하거나 \"위임 검토\"로 디렉터를 시작하세요."],
    ["queue board — by seat", "작업 큐 보드 - 좌석별"],
    ["Nothing active. Completed and failed work is in the panel above, grouped by state, with its full transcript.", "활성 작업이 없습니다. 완료 및 실패 작업은 위 패널에 상태별로 묶여 있으며 전체 기록도 함께 표시됩니다."],
    ["record unavailable · 1 check failing", "녹화 사용 불가 · 검사 1개 실패"],
    ["transcriber", "전사기"],
    ["faster-whisper not installed for this interpreter — pip install faster-whisper, or set BGATE_WHISPER_PYTHON", "이 인터프리터에 faster-whisper가 설치되어 있지 않습니다. pip install faster-whisper를 실행하거나 BGATE_WHISPER_PYTHON을 설정하세요."],
    ["→ install the speech extras: pip install -e \".[stt,record]\"", "→ 음성 추가 기능 설치: pip install -e \".[stt,record]\""],
    ["Project name", "프로젝트 이름"],
    ["- it prints the path it created.", "- 생성한 경로를 출력합니다."],
    ["Notepad - press F2. Notes need a running recording to land on.", "메모장 - F2를 누르세요. 메모를 남기려면 녹화가 실행 중이어야 합니다."],
    ["notes", "메모"],
    ["Playtest notepad", "플레이테스트 메모장"],
    ["playtest notepad", "플레이테스트 메모장"],
    ["notepad", "메모장"],
    ["Close notepad", "메모장 닫기"],

    ["director", "디렉터"],
    ["narrative", "내러티브"],
    ["gameplay", "게임플레이"],
    ["tech", "기술"],
    ["art", "아트"],
    ["audio", "오디오"],
    ["qa", "QA"],
    ["System", "시스템"],
    ["tool", "도구"],
    ["item", "항목"],
    ["work", "작업"],
    ["queue", "작업 큐"],
    ["queued", "대기 중"],
    ["done", "완료"],
    ["failed", "실패"],
    ["broken", "문제 있음"],
    ["finished", "완료됨"],
    ["working", "작업 중"],
    ["waiting", "대기 중"],
    ["unknown", "알 수 없음"],
    ["unavailable", "사용할 수 없음"],
    ["unsupported", "지원되지 않음"],
    ["empty", "비어 있음"],
    ["clean", "정상"],
    ["drift", "차이 있음"],
    ["missing", "누락"],
    ["pending", "대기 중"],
    ["new", "신규"],
    ["needs review", "검토 필요"],
    ["approved", "승인됨"],
    ["rejected", "반려됨"],
    ["superseded", "대체됨"],
    ["in build", "빌드에 포함"],
    ["not in build", "빌드에 없음"],
    ["checked", "확인됨"],
    ["pass", "통과"],
    ["fail", "실패"],
    ["not checked", "미확인"],
    ["none approved yet", "아직 승인된 항목 없음"],
    ["unknown producer", "알 수 없는 생성자"],
    ["no generation profile", "생성 프로필 없음"],
    ["refs", "참조"],
    ["lock", "잠금"],
    ["approve", "승인"],
    ["reject", "반려"],
    ["regenerate", "다시 생성"],
    ["supersede", "대체"],
    ["no assets match this filter", "이 필터와 일치하는 에셋 없음"],
    ["asset", "에셋"],
    ["newest", "최신순"],
    ["largest", "큰 파일순"],
    ["name", "이름"],
    ["in use", "사용 중"],
    ["dead", "미사용"],
    ["no rig", "리그 없음"],
    ["rescan", "다시 스캔"],
    ["working files", "작업 파일"],
    ["nothing matches this filter", "이 필터와 일치하는 항목 없음"],
    ["no preview", "미리보기 없음"],
    ["no loop", "반복 없음"],
    ["edit pixels & rig", "픽셀과 리그 편집"],
    ["open in audio lab", "오디오 랩에서 열기"],
    ["wire into a scene…", "씬에 연결..."],
    ["deploy a task", "작업 투입"],
    ["revisions", "리비전"],
    ["the sprite editor did not load", "스프라이트 편집기를 불러오지 못했습니다"],
    ["the audio lab did not load", "오디오 랩을 불러오지 못했습니다"],
    ["the scene builder did not load", "씬 빌더를 불러오지 못했습니다"],
    ["the atlas did not load", "아틀라스를 불러오지 못했습니다"],
    ["no revision history for that file", "이 파일의 리비전 기록이 없습니다"],

    ["Settings sections", "설정 섹션"],
    ["Precedence is", "우선순위:"],
    ["env > project stored > default", "환경 변수 > 프로젝트 저장값 > 기본값"],
    ["filter key or help text", "키 또는 도움말 검색"],
    ["re-read", "다시 읽기"],
    ["All settings", "전체 설정"],
    ["Changed", "변경됨"],
    ["Environment", "환경"],
    ["Groups", "그룹"],
    ["Wired up", "연결 상태"],
    ["Credentials", "인증 정보"],
    ["Local generators", "로컬 생성기"],
    ["Agent CLIs", "에이전트 CLI"],
    ["Saved for this project and not the built-in default", "프로젝트에 저장되어 있으며 내장 기본값과 다릅니다"],
    ["A variable in the environment is supplying or forcing the value", "환경 변수가 값을 제공하거나 강제하고 있습니다"],
    ["Provider keys for hosted generators; kept separate from the settings registry", "호스팅 생성기용 공급자 키입니다. 설정 레지스트리와 분리됩니다"],
    ["Generators running on this machine, with no key and no bill", "이 기기에서 실행되는 생성기입니다. 키와 과금이 필요 없습니다"],
    ["Installations and MCP wiring for coding-agent CLIs", "코딩 에이전트 CLI 설치와 MCP 연결 상태입니다"],
    ["settings could not be read", "설정을 읽을 수 없습니다"],
    ["the settings registry answered with no groups. The backing file or registry could not be read.", "설정 레지스트리가 그룹 없이 응답했습니다. 백업 파일 또는 레지스트리를 읽을 수 없습니다."],
    ["Everything saved for this project that is not the built-in default. Empty is the honest answer on a fresh checkout - the defaults are the floor, not no news about.", "내장 기본값과 다른 프로젝트 저장값을 모두 표시합니다. 새 체크아웃에서 비어 있는 상태는 정상입니다. 기본값이 기준입니다."],
    ["Nothing has been changed from its default. Every value on this board is still the built-in floor.", "기본값에서 변경된 항목이 없습니다. 이 보드의 모든 값은 내장 기준값입니다."],
    ["A variable in the environment is supplying or forcing these values, so the stored setting is not what the board is using. The control is dead because the environment wins.", "환경 변수가 이 값을 제공하거나 강제하고 있어 저장된 설정이 실제 사용값과 다릅니다. 환경 변수가 우선하므로 컨트롤은 비활성화됩니다."],
    ["Nothing in the environment is overriding this project. Every value on this board comes from the project or from the built-in default.", "환경에서 이 프로젝트를 덮어쓰는 항목이 없습니다. 모든 값은 프로젝트 또는 내장 기본값에서 옵니다."],
    ["that group is gone.", "해당 그룹이 사라졌습니다."],
    ["field", "필드"],
    ["fields", "필드"],
    ["match", "결과"],
    ["matches", "결과"],
    ["for", "검색어"],
    ["Matched on key, group, help text and env var name, across the registry groups only. Credentials and local setup have their own search.", "키, 그룹, 도움말, 환경 변수명에서 일치한 결과입니다. 인증 정보와 로컬 설정은 별도 검색을 사용합니다."],
    ["provider keys", "공급자 키"],
    ["no key, no bill", "키 없음, 과금 없음"],
    ["installation & wiring", "설치 및 연결"],
    ["setting", "설정"],
    ["settings", "설정"],
    ["guard", "가드"],
    ["human only", "사용자 전용"],
    ["changed", "변경됨"],
    ["machine", "기기"],
    ["default", "기본값"],
    ["reset", "초기화"],
    ["less", "접기"],
    ["why", "이유"],
    ["link", "링크"],
    ["Copy a link straight to this setting", "이 설정으로 바로 가는 링크 복사"],
    ["saved here:", "여기에 저장됨:"],
    ["nothing is saved for this project underneath it", "이 프로젝트에 저장된 하위 값이 없습니다"],
    ["on", "켜짐"],
    ["off", "꺼짐"],
    ["comma separated", "쉼표로 구분"],
    ["kind", "종류"],
    ["this dashboard has no control for it", "이 대시보드에는 해당 컨트롤이 없습니다"],
    ["link copied", "링크 복사됨"],

    ["the built-in default", "내장 기본값"],
    ["saved for this project", "이 프로젝트에 저장됨"],
    ["forced by the environment", "환경 변수로 강제됨"],
    ["ready", "준비됨"],
    ["not running", "실행 대기"],
    ["problem", "문제"],
    ["not set up", "설정 필요"],
    ["not installed", "설치되지 않음"],
    ["wired", "연결됨"],
    ["check wiring", "연결 확인"],
    ["default runner", "기본 runner"],
    ["steerable mid-run", "실행 중 지시 가능"],
    ["no live steering", "실시간 지시 없음"],
    ["cost tracked", "비용 추적"],
    ["cost NOT tracked", "비용 추적 없음"],
    ["Builders Gate MCP server", "Builders Gate MCP 서버"],
    ["registered command", "등록된 명령"],
    ["args", "인자"],
    ["config file", "설정 파일"],
    ["register", "등록"],
    ["re-register, pinned", "다시 등록, 고정"],
    ["verify", "검증"],
    ["remove", "제거"],
    ["copy the command", "명령 복사"],
    ["reading local setup…", "로컬 설정을 읽는 중..."],
    ["reading the coding-agent CLIs…", "코딩 에이전트 CLI를 읽는 중..."],
    ["could not read the coding-agent CLIs", "코딩 에이전트 CLI를 읽을 수 없습니다"],
    ["could not read the local setup", "로컬 설정을 읽을 수 없습니다"],
    ["No key, no bill, nothing leaves the machine", "키 없음, 과금 없음, 이 기기 밖으로 나가지 않음"],
    ["Installation & wiring", "설치 및 연결"],
    ["On this machine", "이 기기에서"],
    ["nothing local is registered.", "등록된 로컬 항목이 없습니다."],
    ["none reported", "보고된 항목 없음"],
    ["— not declared —", "- 선언되지 않음 -"],
    ["required", "필수"],
    ["save", "저장"],
    ["saved", "저장됨"],
    ["saved in this project's .env", "이 프로젝트의 .env에 저장됨"],
    ["not set", "설정 없음"],
    ["using the default", "기본값 사용"],
    ["that file does not exist", "파일이 존재하지 않습니다"],
    ["file found", "파일 확인됨"],
    ["$0 · stays on this machine", "$0 · 이 기기에만 유지"],
    ["Then start it yourself - Builders Gate does not launch it", "직접 시작 필요 - Builders Gate는 실행하지 않습니다"],
    ["docs ↗", "문서 ↗"],
    ["hide details", "세부 정보 숨기기"],
    ["what is it doing? ↓", "무엇을 하는 중인가요? ↓"],
    ["not set yet - once it is, this is where you can see what is in it and which parts of it get overwritten", "아직 설정되지 않았습니다. 설정 후에는 여기에 내용과 덮어쓰는 부분이 표시됩니다"],
    ["the server", "서버"],
    ["right now", "현재"],
    ["what you may ship", "배포 가능 범위"],
    ["declared model", "선언된 모델"],
    ["licence", "라이선스"],
    ["license", "라이선스"],
    ["means", "의미"],
    ["what this install can see", "이 설치에서 볼 수 있는 항목"],
    ["the last few things it made", "최근 생성물"],
    ["found at", "발견 위치"],
    ["Not on PATH. Install it and reload this page - nothing here installs software.", "PATH에서 찾을 수 없습니다. 설치한 뒤 이 페이지를 다시 불러오세요. 이 화면은 소프트웨어를 설치하지 않습니다."],
    ["registered - restart that CLI before the tools appear", "등록됨 - 도구가 나타나려면 해당 CLI를 다시 시작하세요"],
    ["removed", "제거됨"],
    ["could not reach the clipboard - select it by hand", "클립보드에 접근할 수 없습니다. 직접 선택해 주세요"],

    ["Transcript", "대화 기록"],
    ["What the recording captured", "녹화에서 포착한 내용"],
    ["Tuning changes you made", "사용자가 적용한 튜닝 변경"],
    ["Gameplay moments", "게임플레이 순간"],
    ["No settings were changed during this session.", "이 세션에서 변경된 설정이 없습니다."],
    ["no telemetry", "텔레메트리 없음"],
    ["feedback items", "피드백 항목"],
    ["telemetry events", "텔레메트리 이벤트"],
    ["build", "빌드"],
    ["iteration", "반복"],
    ["commit", "커밋"],
    ["dirty", "변경 있음"],
    ["source", "소스"],
    ["export", "내보내기"],
    ["tests", "테스트"],
    ["telemetry schema", "텔레메트리 스키마"],
    ["snapshot captured; waiting for evidence", "스냅샷 캡처됨. 증거 대기 중"],
    ["no playtests yet - playtest_check, then playtest_start", "아직 플레이테스트 없음 - playtest_check 후 playtest_start"],
    ["nothing tracked yet - asset_track / asset_lock", "아직 추적 항목 없음 - asset_track / asset_lock"],
    ["retry", "재시도"],
    ["loading session", "세션 불러오는 중"],
    ["typed note · not transcribed", "입력 메모 · 전사 없음"],
    ["director recommends", "디렉터 추천"],
    ["classifier", "분류기"],
    ["speech confidence", "음성 신뢰도"],
    ["unassigned", "미배정"],
    ["like", "좋음"],
    ["fix", "수정"],
    ["add", "추가"],
    ["change", "변경"],
    ["question", "질문"],
    ["note", "메모"],
    ["promote", "승격"],
    ["dismiss", "기각"],
    ["Merge target", "병합 대상"],
    ["merge into…", "다음으로 병합..."],
    ["merge", "병합"],
    ["Link asset", "에셋 연결"],
    ["link asset", "에셋 연결"],
    ["show work", "작업 보기"],
    ["promoted · queue item is being created", "승격됨 · 큐 항목 생성 중"],
    ["no feedback items were extracted", "추출된 피드백 항목 없음"],
    ["typed", "입력됨"],
    ["confidence", "신뢰도"],
    ["Offline", "오프라인"],

    ["No agents running. Dispatch a queued item below, or add work above and send it to a seat.", "실행 중인 에이전트가 없습니다. 아래의 큐 항목을 투입하거나 위에서 작업을 추가해 좌석으로 보내세요."],
    ["steps", "단계"],
    ["expand", "펼치기"],
    ["stop", "중지"],
    ["steer this agent…", "이 에이전트에 지시..."],
    ["steer", "지시"],
    ["log", "로그"],
    ["could not read this agent", "이 에이전트를 읽을 수 없습니다"],
    ["steer this agent - e.g. that pose is off-model, regenerate against the ref", "이 에이전트에 지시 - 예: 포즈가 모델과 다르니 참조에 맞춰 다시 생성"],
    ["no activity yet - the agent is starting up", "아직 활동 없음 - 에이전트 시작 중"],
    ["RESULT", "결과"],
    ["loading full log…", "전체 로그를 불러오는 중..."],
    ["could not read the log", "로그를 읽을 수 없습니다"],
    ["empty log", "빈 로그"],
    ["agent #", "에이전트 #"],
    ["renders this agent produced", "이 에이전트가 생성한 렌더"],
    ["renders this agent produced · ref ▏ candidate (playing)", "이 에이전트가 생성한 렌더 · 참조 ▏ 후보(재생 중)"],
    ["reference:", "참조:"],
    ["like - keep as reference", "좋음 - 참조로 유지"],
    ["dislike - course-correct now + save preference", "별로 - 즉시 방향 수정 및 선호 저장"],
    ["feedback → steers + saves", "피드백 → 지시 및 저장"],
    ["rebuilding current build…", "현재 빌드 다시 빌드 중..."],
    ["exporting the game from latest source - a few seconds", "최신 소스에서 게임 내보내는 중 - 몇 초 걸립니다"],
    ["rebuild failed:", "다시 빌드 실패:"],
    ["boot anyway (stale)", "그래도 실행(이전 빌드)"],
    ["what do I install?", "무엇을 설치해야 하나요?"],
    ["Full toolchain report from a terminal:", "터미널에서 전체 툴체인 보고서 확인:"],

    ["Audio lab", "오디오 랩"],
    ["sound to work on, start an empty one, or bring one in from disk - you can drop a file straight onto this pane. Everything you open here saves back to the project.", "작업할 사운드를 고르거나, 빈 사운드를 시작하거나, 디스크에서 가져옵니다. 파일을 이 패널에 바로 끌어다 놓을 수 있습니다. 여기서 연 파일은 프로젝트에 다시 저장됩니다."],
    ["open a sound…", "사운드 열기..."],
    ["new sound…", "새 사운드..."],
    ["import a file…", "파일 가져오기..."],
    ["record…", "녹음..."],
    ["save the mix session", "믹스 세션 저장"],
    ["save as", "다른 이름으로 저장"],
    ["This clip does not loop.", "이 클립은 반복 재생되지 않습니다."],
    ["loop from selection", "선택 영역부터 반복"],
    ["enable looping", "반복 켜기"],
    ["turn off", "끄기"],
    ["audition first", "먼저 들어보기"],
    ["snap to zero", "영점에 맞추기"],
    ["the beat maker did not load", "비트 메이커를 불러오지 못했습니다"],
    ["could not decode this source", "이 소스를 디코딩할 수 없습니다"],
    ["that layer has not decoded yet", "해당 레이어가 아직 디코딩되지 않았습니다"],
    ["the clip lane holds no range - select on the waveform in clip mode", "클립 레인에 범위가 없습니다. 클립 모드에서 파형을 선택하세요"],
    ["focus a layer lane first - the clip lane cannot be split", "먼저 레이어 레인에 초점을 맞추세요. 클립 레인은 나눌 수 없습니다"],
    ["the playhead is not inside that lane - click the ruler to move it", "재생 헤드가 해당 레인 안에 없습니다. 눈금자를 클릭해 이동하세요"],
    ["nothing plays from here", "이 위치에서 재생할 항목이 없습니다"]
  ];

  const exact = new Map();
  for (const [from, to] of entries) {
    exact.set(N(from), to);
    if (from === from.toLowerCase()) exact.set(N(from).toLowerCase(), to);
  }

  const phraseRules = [
    [/^(\d+) running$/, "$1개 실행 중"],
    [/^(\d+) field(s)?$/, "$1개 필드"],
    [/^(\d+) setting(s)?$/, "$1개 설정"],
    [/^(\d+) match(es)?$/, "$1개 결과"],
    [/^\+(\d+) more$/, "+$1개 더"],
    [/^item (\d+)$/, "항목 $1"],
    [/^session (\d+)$/, "세션 $1"],
    [/^agent #(\d+)$/, "에이전트 #$1"],
    [/^queue #(\d+)$/, "큐 #$1"],
    [/^Iteration (\d+)$/, "반복 $1"],
    [/^iteration (\d+)$/, "반복 $1"],
    [/^(\d+) playtest(s)?$/, "플레이테스트 $1개"],
    [/^(\d+) active assets$/, "활성 에셋 $1개"],
    [/^(\d+) telemetry events$/, "텔레메트리 이벤트 $1개"],
    [/^(\d+) feedback items$/, "피드백 항목 $1개"],
    [/^(\d+) steps$/, "$1단계"],
    [/^(\d+) nudges$/, "$1회 조정"],
    [/^(\d+) new$/, "신규 $1개"],
    [/^(\d+) revision(s)?$/, "리비전 $1개"],
    [/^needs review · (\d+) rev(s)?$/, "검토 필요 · 리비전 $1개"],
    [/^review · (\d+) rev(s)?$/, "검토 필요 · 리비전 $1개"],
    [/^approved · (\d+) rev(s)?$/, "승인됨 · 리비전 $1개"],
    [/^rejected · (\d+) rev(s)?$/, "반려됨 · 리비전 $1개"],
    [/^build (.+)$/i, "빌드 $1"],
    [/^tests (.+)$/i, "테스트 $1"],
    [/^confidence ([\d.]+)$/i, "신뢰도 $1"],
    [/^speech confidence ([\d.]+)$/i, "음성 신뢰도 $1"],
    [/^fps (.+)$/i, "FPS $1"],
    [/^loading session (\d+)…$/, "세션 $1 불러오는 중..."],
    [/^could not read the studio - (.+)$/i, "스튜디오를 읽을 수 없습니다 - $1"],
    [/^could not read artifacts - (.+)$/i, "아티팩트를 읽을 수 없습니다 - $1"],
    [/^could not read this agent - (.+)$/i, "이 에이전트를 읽을 수 없습니다 - $1"],
    [/^could not read the log - (.+)$/i, "로그를 읽을 수 없습니다 - $1"],
    [/^rebuild failed: (.+)$/i, "다시 빌드 실패: $1"],
    [/^saved - (.+)$/i, "저장됨 - $1"],
    [/^(.+) is ready$/i, "$1 준비됨"],
    [/^(.+) saved, but (.+) is overriding it - in force: (.+)$/i, "$1 저장됨. 단, $2에서 덮어쓰는 중 - 적용값: $3"],
    [/^link to (.+) copied$/i, "$1 링크 복사됨"],
    [/^(.+) is in the address bar - copy it from there$/i, "$1이 주소 표시줄에 있습니다. 거기에서 복사하세요"],
    [/^(.+) is forced by (.+) - the environment wins$/i, "$1은 $2에서 강제됩니다. 환경 변수가 우선합니다"],
    [/^(\d+) of (\d+) running here$/i, "$2개 중 $1개가 여기서 실행 중"],
    [/^Every tracked file matches the hash recorded for it\. (\d+) tracked, (\d+) held by a seat\.$/i, "추적 중인 모든 파일이 기록된 해시와 일치합니다. 추적 $1개, 좌석 잠금 $2개."],
    [/^showing (\d+) of (\d+)$/i, "$2개 중 $1개 표시"],
    [/^load (\d+) more$/i, "$1개 더 불러오기"],
    [/^builders gate · (\d+) seats · (\d+) binaries · canon (\d+) · last poll (.+)$/i, "builders gate · 좌석 $1개 · 바이너리 $2개 · canon $3 · 마지막 폴링 $4"],
    [/^(.+) · last poll (.+)$/i, "$1 · 마지막 폴링 $2"]
  ];

  const loose = [
    [/\bnot checked\b/gi, "미확인"],
    [/\bnot running\b/gi, "실행 대기"],
    [/\bnot installed\b/gi, "설치되지 않음"],
    [/\bnot set up\b/gi, "설정 필요"],
    [/\bnot set\b/gi, "설정 없음"],
    [/\bnot declared\b/gi, "선언되지 않음"],
    [/\bno activity yet\b/gi, "아직 활동 없음"],
    [/\bno response from the server\b/gi, "서버 응답 없음"],
    [/\bcould not read\b/gi, "읽을 수 없습니다"],
    [/\bcould not reach\b/gi, "접근할 수 없습니다"],
    [/\bloading\b/gi, "불러오는 중"],
    [/\breading\b/gi, "읽는 중"],
    [/\bready\b/gi, "준비됨"],
    [/\bproblem\b/gi, "문제"],
    [/\bunsupported\b/gi, "지원되지 않음"],
    [/\bunavailable\b/gi, "사용할 수 없음"],
    [/\bconfigured\b/gi, "설정됨"],
    [/\bwired\b/gi, "연결됨"],
    [/\bdefault runner\b/gi, "기본 runner"],
    [/\bcheck wiring\b/gi, "연결 확인"],
    [/\bworking\b/gi, "작업 중"],
    [/\bfinished\b/gi, "완료됨"],
    [/\bqueued\b/gi, "대기 중"],
    [/\bdispatch\b/gi, "투입"],
    [/\bdeploy\b/gi, "투입"],
    [/\breview\b/gi, "검토"],
    [/\bapproved\b/gi, "승인됨"],
    [/\brejected\b/gi, "반려됨"],
    [/\bunknown\b/gi, "알 수 없음"],
    [/\bempty\b/gi, "비어 있음"],
    [/\bmissing\b/gi, "누락"],
    [/\bpending\b/gi, "대기 중"],
    [/\bclean\b/gi, "정상"],
    [/\bdirty\b/gi, "변경 있음"],
    [/\bsource\b/gi, "소스"],
    [/\bexport\b/gi, "내보내기"],
    [/\btelemetry\b/gi, "텔레메트리"],
    [/\bplaytest\b/gi, "플레이테스트"],
    [/\bassets\b/gi, "에셋"],
    [/\basset\b/gi, "에셋"],
    [/\bqueue\b/gi, "작업 큐"],
    [/\bagent\b/gi, "에이전트"],
    [/\bseat\b/gi, "좌석"],
    [/\bstop\b/gi, "중지"],
    [/\bclose\b/gi, "닫기"],
    [/\bretry\b/gi, "재시도"],
    [/\bsave\b/gi, "저장"],
    [/\bopen\b/gi, "열기"],
    [/\bcopy\b/gi, "복사"],
    [/\bremove\b/gi, "제거"],
    [/\bregister\b/gi, "등록"],
    [/\bverify\b/gi, "검증"],
    [/\bsettings\b/gi, "설정"],
    [/\bsetting\b/gi, "설정"],
    [/\bfield\b/gi, "필드"],
    [/\bfields\b/gi, "필드"],
    [/\bmatch(es)?\b/gi, "결과"],
    [/\bmore\b/gi, "더 보기"],
    [/\bpath\b/gi, "경로"],
    [/\bkind\b/gi, "종류"],
    [/\bsize\b/gi, "크기"],
    [/\bstate\b/gi, "상태"]
  ];

  function looksTechnical(text) {
    if (!/[A-Za-z]/.test(text)) return false;
    if (/^(https?:|wss?:|res:\/\/|user:\/\/|\/|\.\/)/i.test(text)) return true;
    if (/\b(BGATE_|GODOT_|OPENAI_|ANTHROPIC_|CODEX_|COMFY|API\b|MCP\b)/.test(text)) return true;
    if (/\.(gd|tscn|tres|import|png|jpg|jpeg|webp|wav|ogg|mp3|json|toml|md|py|js|css|html)\b/i.test(text)) return true;
    if (/[{}[\];=<>]/.test(text)) return true;
    if (/^[A-Za-z0-9_./:#-]+$/.test(text) && /[_.:/#-]/.test(text)) return true;
    if (/\b(function|const|let|var|return|class|import|export|onclick)\b/.test(text)) return true;
    return false;
  }

  function preserve(raw, translated) {
    const s = String(raw);
    const left = (s.match(/^\s*/) || [""])[0];
    const right = (s.match(/\s*$/) || [""])[0];
    return left + translated + right;
  }

  function applyLoose(text) {
    let out = text;
    for (const [re, ko] of loose) out = out.replace(re, ko);
    return out;
  }

  function translate(raw) {
    const original = String(raw == null ? "" : raw);
    const text = N(original);
    if (!text || (HAS_KO.test(text) && !/[A-Za-z]/.test(text))) return original;

    const hit = exact.get(text) || exact.get(text.toLowerCase());
    if (hit) return preserve(original, hit);

    for (const [re, ko] of phraseRules) {
      const out = text.replace(re, ko);
      if (out !== text) return preserve(original, out);
    }

    if (looksTechnical(text)) return original;

    const shortStatus = text.length <= 42
      || (text.length <= 84 && /^(no|not|could not|loading|reading|ready|review|queue|agent|seat|save|copy|open|close|retry)\b/i.test(text));
    if (!shortStatus) return original;
    const out = applyLoose(text);
    return out === text ? original : preserve(original, out);
  }

  function skipElement(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.closest("[data-ko-skip], script, style, textarea, pre, code, kbd, samp, .CodeMirror, .cm-editor, .insp-code, .lc-cmd")) return true;
    if (el.closest("svg")) return true;
    return false;
  }

  function localizeAttrs(el) {
    if (!el || el.nodeType !== 1) return;
    if (el.closest("[data-ko-skip], script, style, pre, code, kbd, samp, .CodeMirror, .cm-editor, .insp-code, .lc-cmd")) return;
    if (el.closest("svg")) return;
    for (const name of ["title", "aria-label", "placeholder"]) {
      if (!el.hasAttribute(name)) continue;
      const before = el.getAttribute(name);
      const after = translate(before);
      if (after !== before) el.setAttribute(name, after);
    }
  }

  function localizeText(root) {
    const doc = root && root.ownerDocument ? root.ownerDocument : document;
    const start = root && root.nodeType ? root : document.body;
    if (!start) return;
    if (start.nodeType === 3) {
      const parent = start.parentElement;
      if (!skipElement(parent)) {
        const after = translate(start.nodeValue);
        if (after !== start.nodeValue) start.nodeValue = after;
      }
      return;
    }
    if (start.nodeType !== 1 && start.nodeType !== 9) return;
    if (start.nodeType === 1) localizeAttrs(start);
    const attrs = start.querySelectorAll ? start.querySelectorAll("[title], [aria-label], [placeholder]") : [];
    attrs.forEach(localizeAttrs);
    const walker = doc.createTreeWalker(start, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !N(node.nodeValue)) return NodeFilter.FILTER_REJECT;
        return skipElement(node.parentElement) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const after = translate(node.nodeValue);
      if (after !== node.nodeValue) node.nodeValue = after;
    }
  }

  let queued = false;
  function schedule(root) {
    if (queued) return;
    queued = true;
    setTimeout(() => {
      queued = false;
      localizeText(root || document.body);
    }, 0);
  }

  function wrapDialogs() {
    if (window.__bgateKoWrapped) return;
    window.__bgateKoWrapped = true;

    const wrapToast = () => {
      if (typeof window.toast !== "function" || window.toast.__ko) return;
      const old = window.toast;
      const next = function (message, kind) {
        return old.call(this, translate(message), kind);
      };
      next.__ko = true;
      window.toast = next;
    };

    const wrapAsk = name => {
      if (typeof window[name] !== "function" || window[name].__ko) return;
      const old = window[name];
      const next = function (cfg) {
        if (cfg && typeof cfg === "object") {
          cfg = Object.assign({}, cfg);
          for (const key of ["title", "body", "ok", "cancel", "placeholder"]) {
            if (key in cfg) cfg[key] = translate(cfg[key]);
          }
          if (Array.isArray(cfg.items)) {
            cfg.items = cfg.items.map(item => {
              if (!item || typeof item !== "object") return item;
              const copy = Object.assign({}, item);
              if ("label" in copy) copy.label = translate(copy.label);
              if ("detail" in copy) copy.detail = translate(copy.detail);
              return copy;
            });
          }
        }
        return old.call(this, cfg);
      };
      next.__ko = true;
      window[name] = next;
    };

    wrapToast();
    wrapAsk("askText");
    wrapAsk("askConfirm");
    wrapAsk("askPick");
    setTimeout(wrapToast, 500);
  }

  function boot() {
    document.documentElement.lang = "ko";
    document.title = "Builders Gate";
    if (!document.getElementById("ko-style")) {
      const style = document.createElement("style");
      style.id = "ko-style";
      style.textContent = [
        "html[lang='ko'] body{word-break:keep-all;line-break:strict}",
        "html[lang='ko'] input,html[lang='ko'] textarea,html[lang='ko'] button,html[lang='ko'] select{font-family:inherit}",
        "html[lang='ko'] .rail .lb,html[lang='ko'] .qbtn,html[lang='ko'] .ck-mode button,html[lang='ko'] .atlas-mode{letter-spacing:0}",
        "html[lang='ko'] .view-heading p,html[lang='ko'] .cfg-note,html[lang='ko'] .lc-note{line-height:1.65}"
      ].join("");
      document.head.appendChild(style);
    }
    wrapDialogs();
    localizeText(document.body);
    new MutationObserver(mutations => {
      let root = null;
      for (const m of mutations) {
        if (m.type === "attributes") {
          localizeAttrs(m.target);
          continue;
        }
        if (m.type === "characterData") {
          localizeText(m.target);
          continue;
        }
        root = document.body;
      }
      if (root) schedule(root);
    }).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["title", "aria-label", "placeholder"]
    });
    setTimeout(() => schedule(document.body), 300);
    setTimeout(() => schedule(document.body), 1200);
  }

  window.BGateKo = { translate, localize: localizeText };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
