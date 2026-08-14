"""Which CLI a dispatched agent actually runs on.

This installation is Codex-only. The runner table is still explicit because the
dashboard, settings panel and preflight checks need one place to answer how the
CLI is found, how prompts are passed, and which capabilities are available.

WHAT A RUNNER MUST DECLARE, because dispatch's behaviour depends on all four
and guessing any of them produces a silent failure rather than an error:

    steerable      `codex exec` reads stdin ONCE, as an appended block, and
                   closes it. A steer sent to a Codex agent goes nowhere, so the
                   caller has to be told rather than left watching a message
                   that will never land.

    cost_tracked   Codex reports TOKENS and no price. A price table would be a
                   number in this repo going stale against OpenAI's, silently
                   under-reporting until somebody notices the bill — so there
                   is none, the ceiling is declared not to apply, and the run
                   says so everywhere it is shown. An untracked cost that
                   ANNOUNCES itself is recoverable; one that reads as $0.00 is
                   the thing that empties an account overnight.

    prompt_via     "stream" keeps the pipe open for the life of the run;
                   "stdin_once" writes the prompt and closes, which is the only
                   thing `codex exec` will act on.

    events         the log parser reads Codex JSON events such as
                   `thread.started`, `item.completed` and `turn.completed`.

THE SANDBOX IS NOT BYPASSED. Codex runs under `--sandbox workspace-write` with
`--cd` at the project, which was verified to write to the real directory rather
than the sandbox's shadow copy. That distinction is worth stating because the
shadow is the default OUTSIDE a git repo: a run started with
`--skip-git-repo-check` on a non-repo directory reports every write as
successful and leaves the real tree untouched. `requires_git_repo` is that
finding turned into a precondition.
"""
from __future__ import annotations

import os
import shutil
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional

# The MCP server every seat needs whichever CLI it runs on. An art agent that
# cannot call ref_list, asset_lock, consistency_check or artifact register is
# not an art seat, it is an image generator with a prompt — the whole point of
# routing a seat here is that ONLY the generation step changes.
MCP_SERVER_NAME = "builders-gate"


def _npm_shim(name: str) -> Optional[str]:
    """Windows npm installs a `.cmd` shim that `shutil.which` finds only when
    the npm prefix is on PATH — and it is not, in a service started from an
    IDE or a scheduled task. Codex lives here on this platform, so a runner
    reported "not installed" while `npm ls -g` listed it."""
    if sys.platform != "win32":
        return None
    shim = Path(os.environ.get("APPDATA", "")) / "npm" / f"{name}.cmd"
    return str(shim) if shim.is_file() else None


def find_codex() -> Optional[str]:
    return shutil.which("codex") or _npm_shim("codex")


def mcp_overrides(server_name: str = MCP_SERVER_NAME) -> list[str]:
    """Register the Builders Gate MCP server for ONE invocation.

    `-c` overlays config.toml in memory, so this never edits the user's
    ~/.codex/config.toml. That is deliberate: the dashboard writing into a
    config the user also hand-edits is a merge nobody asked it to perform, and
    an entry left behind after an experiment is worse than one that has to be
    re-passed. Verified with `codex mcp list -c mcp_servers.…`, which shows the
    injected server alongside the persistent ones.

    The interpreter is THIS process's, not a bare `python`: the same absolute
    path the install docs insist on, for the same reason — a bare name resolves
    differently under a spawned CLI than in the shell and the failure reads as
    "server not connected" with nothing pointing at the interpreter.
    """
    return [
        "-c", f'mcp_servers.{server_name}.command={_toml_str(sys.executable)}',
        "-c", f'mcp_servers.{server_name}.args=["-m","bgate_mcp.server"]',
    ]


def _toml_str(value: str) -> str:
    """A TOML literal string. `-c` parses the value as TOML, and a Windows path
    in a basic string turns \\U into a bad unicode escape and fails the parse."""
    return "'" + str(value).replace("'", "") + "'"


@dataclass(frozen=True)
class Chat:
    """How a runner holds a THINKING conversation that cannot touch the repo.

    A second shape for the same CLI, and it exists because the brainstorm room
    needed a real CLI session and the room's whole promise is that
    nothing is written until a human presses Deploy. A dispatched agent is the
    opposite of that by design, so the two cannot share ``build_args``.

    ``readonly_by`` is the flags that make "it cannot write" a FACT about the
    process rather than a sentence in a prompt. It is stored as text because it
    is the thing to SHOW a human who asks why they should believe the promise —
    see brainsession.thinker(), which puts it in the session payload.

    ``prompt_via`` repeats the field of the same name on Runner because the two
    can differ: a runner may be steerable while dispatched and still have no way
    to take a second conversational turn. "stream" means one process holds the
    whole conversation; "stdin_once" means every turn is a fresh process that
    has to be re-seeded with the transcript.
    """

    build_args: Callable[..., list[str]] = field(repr=False, default=None)
    prompt_via: str = "stream"
    cost_tracked: bool = True
    readonly_by: str = ""


@dataclass(frozen=True)
class Runner:
    name: str
    find: Callable[[], Optional[str]]
    steerable: bool
    cost_tracked: bool
    prompt_via: str                     # "stream" | "stdin_once"
    requires_git_repo: bool = False
    # Why this runner might be chosen over the default, shown in Settings.
    note: str = ""
    build_args: Callable[..., list[str]] = field(repr=False, default=None)
    # How this runner talks WITHOUT being able to write. None means it has no
    # such mode here yet, and the brainstorm room refuses it rather than
    # guessing — see the codex entry below for exactly what an entry needs.
    chat: Optional[Chat] = None


def _codex_args(exe: str, *, permission_mode: str, model: Optional[str],
                cwd: str, native_images: bool, max_turns: int = 0) -> list[str]:
    """`codex exec`, JSONL, sandboxed to the project directory.

    --sandbox workspace-write --cd <project> writes to the REAL tree. Verified
    rather than assumed: an identical run outside a git repo (with
    --skip-git-repo-check) wrote into a shadow cwd under
    ~/.codex/.sandbox/cwd/<hash> and reported success, which is why
    requires_git_repo is a precondition and why --skip-git-repo-check is not
    passed here however convenient it looks.

    --disable image_generation IS THE SETTING. `art.image_backend=bgate` turns
    the CLI's own image tool off at the process boundary, so the agent cannot
    quietly use it instead of image_generate — which matters because the bgate
    path is the one carrying the pinned references, the style, the consistency
    check and the artifact ledger. Prompt text asking it not to would be a
    request; a missing tool is a fact.

    `max_turns` is accepted and dropped: `codex exec` has no turn ceiling to
    pass it to. Taking the argument keeps ONE call site in dispatch — the
    alternative is the caller branching on runner name, which is the
    hardcoding this module exists to remove. Runs here are already marked
    cost-not-tracked wherever they are shown, and unbounded turns are the same
    class of fact about the same runner.
    """
    args = [exe, "exec", "--json", "--sandbox", "workspace-write", "--cd", cwd]
    args += mcp_overrides()
    args += ["--enable" if native_images else "--disable", "image_generation"]
    if model:
        args += ["--model", model]
    return args


CODEX_READONLY_BY = (
    "codex exec --ignore-user-config --ignore-rules (so user/project MCP "
    "servers and rules are not loaded), --sandbox read-only, --ephemeral, "
    "--skip-git-repo-check inside the brainstorm scratch directory, and no "
    "Builders Gate MCP override. The prompt is sent through local Codex CLI "
    "stdin using the existing ChatGPT login, not an API key.")


def _codex_chat_args(exe: str, *, system: str, model: Optional[str],
                     max_usd: float = 0.0, mcp_config: str = "",
                     resume: str = "", cwd: str = "") -> list[str]:
    """A one-shot Codex thinking turn, with user config and tools absent.

    `codex exec` reads one prompt, answers, and exits, so the brainstorm room
    re-seeds the transcript on each turn. That is local Codex CLI auth, not an
    API key.

    The safety claim is made with process flags rather than a prompt:
    --ignore-user-config keeps the persistent Builders Gate MCP registration
    out of this room, --ignore-rules keeps AGENTS.md out of it, --sandbox
    read-only makes any accidental shell path unable to write, and --ephemeral
    keeps these short brainstorming turns out of the Codex session store.
    """
    args = [exe, "exec", "--json", "--ignore-user-config", "--ignore-rules",
            "--sandbox", "read-only", "--skip-git-repo-check", "--ephemeral",
            "--disable", "image_generation"]
    if cwd:
        args[2:2] = ["--cd", cwd]
    if model:
        args += ["--model", model]
    return args + ["-"]


# `find` is late-bound so tests and local setup can patch the Codex lookup.
RUNNERS: dict[str, Runner] = {
    "codex": Runner(
        name="codex", find=lambda: find_codex(), steerable=False, cost_tracked=False,
        prompt_via="stdin_once", requires_git_repo=True, build_args=_codex_args,
        chat=Chat(build_args=_codex_chat_args, prompt_via="stdin_once",
                  cost_tracked=False, readonly_by=CODEX_READONLY_BY),
        note=("이미지를 자체 생성합니다. 실행 중 지시는 지원하지 않고 비용 대신 "
              "토큰을 보고하므로 실행별 비용 한도는 적용되지 않습니다.")),
}

DEFAULT_RUNNER = "codex"


def get(name: str) -> Runner:
    """The named runner, or the default. Never raises on an unknown name: this
    is read from stored settings, and a typo there must not take the board down
    — it falls back to the runner that always works."""
    return RUNNERS.get((name or "").strip().lower() or DEFAULT_RUNNER,
                       RUNNERS[DEFAULT_RUNNER])


def available() -> dict[str, dict]:
    """Every runner and whether its CLI is actually on this machine — what the
    Settings panel needs to grey out an option instead of offering one that
    fails at dispatch."""
    out = {}
    for key, runner in RUNNERS.items():
        exe = runner.find()
        out[key] = {"name": key, "installed": bool(exe), "path": exe or "",
                    "steerable": runner.steerable,
                    "cost_tracked": runner.cost_tracked,
                    "note": runner.note}
    return out


_LOOK_IT_UP = object()   # "the caller did not resolve one", NOT "found nothing"


def preflight(runner: Runner, cwd: str, exe=_LOOK_IT_UP) -> Optional[str]:
    """The reason this runner cannot start here, or None.

    Checked BEFORE a process exists, because both failures it catches are
    silent afterwards: a missing CLI is an exec error nobody reads, and a
    non-repo working directory makes every write land in a sandbox shadow and
    report success.

    ``exe`` lets the caller pass a path it already resolved. A caller that
    passes None is saying IT FOUND NOTHING, which is why the sentinel exists:
    falling back to the table on a falsy value would look the CLI up a second
    way, pass, and hand Popen a None argv[0].
    """
    resolved = runner.find() if exe is _LOOK_IT_UP else exe
    if not resolved:
        return f"{runner.name} CLI를 PATH에서 찾을 수 없습니다"
    try:
        safe_cwd = Path(cwd).resolve(strict=False)
    except (OSError, RuntimeError, ValueError):
        return f"{cwd} is not a valid working directory"
    # NO CONTAINMENT CHECK AGAINST Path.cwd(). One was added here by a CodeQL
    # autofix and it refused every real dispatch: `cwd` is the GAME PROJECT
    # root (or its .bgate/work worktree), and the dashboard's own process
    # directory is wherever `bgate serve` was launched — the checkout, another
    # project, or C:\Windows\System32 if it started from a service. Those are
    # unrelated by design; the board serves projects it does not live inside.
    # The alert it silenced is about untrusted input reaching a path
    # expression, and the answer to that here is provenance, not containment:
    # this value comes from the registry and from make_worktree, never from a
    # request body.
    if runner.requires_git_repo and not (safe_cwd / ".git").exists():
        return (f"{cwd}는 Git 저장소가 아닙니다. {runner.name}는 저장소가 아닌 "
                "작업 경로를 그림자 복사본으로 격리하므로, 성공처럼 보여도 "
                "이 프로젝트에는 변경이 남지 않습니다")
    return None
