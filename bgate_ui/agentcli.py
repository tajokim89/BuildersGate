"""Is each coding-agent CLI installed, and is Builders Gate actually wired into it.

THE PAPERCUT THIS EXISTS FOR IS NAMED IN CLAUDE.md, and it is the worst one in
the product's setup story:

    claude mcp add builders-gate --scope user -- <ABSOLUTE-python-path> -m bgate_mcp.server

    **Use the absolute path to the interpreter.** The claude CLI resolves a bare
    `python` differently than the shell does and reports "failed to connect" for
    a server that runs fine. On Windows this is the single most common failure,
    and the error message points nowhere near the cause.

A registration pointing at the wrong interpreter looks EXACTLY like a working
one until a tool call fails, and the failure names the connection rather than
the interpreter. Nothing in the product could see that state, so nothing could
say it out loud. This module can: it reads the registration, compares the
interpreter against the one this dashboard is running on, and says which of the
three states it is in.

WHAT IT DOES NOT DO.

  * IT DOES NOT LAUNCH ANYBODY'S CLI. Detection, wiring status, and a config
    write. Spawning an interactive session is the brainstorm room's machinery
    and there must not be a second one.
  * IT DOES NOT HAND-EDIT THEIR CONFIG. ``~/.claude.json`` and
    ``~/.codex/config.toml`` are files the user also edits, in formats their
    owners are free to change. Registration goes through the CLI's OWN
    ``mcp add`` subcommand — argv list, no shell — so the tool that owns the
    format writes the format. Reading is done directly, because reading cannot
    corrupt anything and shelling out per repaint would not be free.
  * IT DOES NOT DUPLICATE :mod:`bgate_ui.runners`. That module is the registry —
    which CLIs exist, how to find them, what each one can do — and
    ``runners.available()`` is the installed/path detection. This adds only the
    half runners has no opinion about: how each CLI persistently registers an
    MCP server for the user's OWN interactive sessions, which is a different
    thing from ``runners.mcp_overrides()`` (that is per-invocation, in memory,
    for a dispatched agent, and deliberately leaves nothing behind).

A THIRD CLI IS ONE ENTRY in :data:`WIRINGS` — provided ``runners.RUNNERS`` has
it, since that is where "does this CLI exist" is answered.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Optional

from bgate_ui import runners as _runners

# Windows: never flash a console window out of a dashboard request.
_NO_WINDOW = 0x08000000 if sys.platform == "win32" else 0

SERVER = _runners.MCP_SERVER_NAME
MODULE_ARGS = ["-m", "bgate_mcp.server"]

# A registration whose command is one of these AND carries no directory part is
# the documented failure. The "no directory part" half is load-bearing: an
# absolute path ending in python.exe is the CORRECT answer, and a set membership
# test on the basename alone would flag every good registration as broken. That
# mistake was made once here and caught by running it against this machine.
_BARE = {"python", "python3", "py", "python.exe", "python3.exe", "py.exe",
         "pythonw.exe", "python.bat"}


def _is_bare(command: str) -> bool:
    head, tail = os.path.split(command or "")
    return not head and tail.lower() in _BARE

# How long a `mcp add` is allowed to take. Generous: these CLIs sometimes touch
# the network on first run.
REGISTER_TIMEOUT = 90
VERIFY_TIMEOUT = 45


@dataclass(frozen=True)
class Wiring:
    """How one CLI persistently registers an MCP server, and where that lands."""

    id: str
    label: str
    # The config file a human would open. Shown, never written by this module.
    config: Callable[[], Path] = field(repr=False, default=lambda: Path())
    read: Callable[[], dict] = field(repr=False, default=lambda: {})
    # exe, interpreter -> argv. The CLI's own subcommand does the write.
    argv: Callable[[str, str], list[str]] = field(
        repr=False, default=lambda exe, py: [])
    how: str = ""
    scope_note: str = ""


# ---------------------------------------------------------------------------
# Claude Code — ~/.claude.json, "mcpServers" at user scope
# ---------------------------------------------------------------------------

def _claude_config() -> Path:
    return Path.home() / ".claude.json"


def _claude_read() -> dict:
    """The builders-gate entry, at whichever scope it is registered.

    USER SCOPE IS CHECKED FIRST AND IS THE ONE THIS PANEL OFFERS, because it
    covers every game project on the machine including ones that do not exist
    yet — the same argument ``bgate hook-install --scope user`` makes. A
    project-scoped entry is reported when found so a user who set one up by hand
    is not told they have nothing.
    """
    path = _claude_config()
    out: dict[str, Any] = {"found": False, "path": str(path), "scope": "",
                           "command": "", "args": [], "error": ""}
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError:
        out["error"] = "no ~/.claude.json yet — the CLI writes it on first run"
        return out
    try:
        doc = json.loads(raw)
    except ValueError:
        out["error"] = f"{path} is not valid JSON; refusing to guess at it"
        return out
    if not isinstance(doc, dict):
        out["error"] = f"{path} is not an object"
        return out

    entry = ((doc.get("mcpServers") or {}) if isinstance(
        doc.get("mcpServers"), dict) else {}).get(SERVER)
    scope = "user"
    if not isinstance(entry, dict):
        entry, scope = None, ""
        projects = doc.get("projects")
        if isinstance(projects, dict):
            for name, blob in projects.items():
                if not isinstance(blob, dict):
                    continue
                candidate = (blob.get("mcpServers") or {})
                if isinstance(candidate, dict) and isinstance(
                        candidate.get(SERVER), dict):
                    entry, scope = candidate[SERVER], f"local ({name})"
                    break
    if not isinstance(entry, dict):
        return out
    args = entry.get("args")
    out.update(found=True, scope=scope,
               command=str(entry.get("command") or ""),
               args=[str(a) for a in args] if isinstance(args, list) else [])
    return out


def _claude_argv(exe: str, interpreter: str) -> list[str]:
    # `mcp add` refuses a name it already holds, so the existing one is removed
    # first — this is a re-register as much as a register, and the broken state
    # it fixes is one where an entry is already there.
    return [exe, "mcp", "add", SERVER, "--scope", "user", "--",
            interpreter, *MODULE_ARGS]


def _claude_unregister(exe: str) -> list[str]:
    return [exe, "mcp", "remove", SERVER, "--scope", "user"]


# ---------------------------------------------------------------------------
# Codex — ~/.codex/config.toml, [mcp_servers.<name>]
# ---------------------------------------------------------------------------

def _codex_config() -> Path:
    return Path(os.environ.get("CODEX_HOME") or (Path.home() / ".codex")) / "config.toml"


_TOML_TABLE = re.compile(r"^\s*\[mcp_servers\.(?:\"([^\"]+)\"|([^\].]+))\]\s*$")
_TOML_STR = re.compile(r"""^\s*command\s*=\s*(['"])(.*)\1\s*$""")
_TOML_ARGS = re.compile(r"^\s*args\s*=\s*(\[.*\])\s*$")


def _codex_read() -> dict:
    """The ``[mcp_servers.builders-gate]`` table.

    Parsed with ``tomllib`` when it is there (3.11+) and with a line scan when
    it is not — this project supports 3.10, and a setup panel that goes blank on
    the oldest supported interpreter is a setup panel that fails exactly where
    setup is hardest. The scan reads only ``command`` and ``args`` and is
    explicitly not a TOML parser; anything it cannot read is reported as
    unreadable rather than as absent.
    """
    path = _codex_config()
    out: dict[str, Any] = {"found": False, "path": str(path), "scope": "user",
                           "command": "", "args": [], "error": ""}
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError:
        out["error"] = "no ~/.codex/config.toml yet — Codex writes it on first run"
        return out

    try:
        import tomllib
    except ImportError:
        tomllib = None                                           # noqa: N806
    if tomllib is not None:
        try:
            doc = tomllib.loads(raw)
        except Exception as exc:                                 # noqa: BLE001
            out["error"] = f"{path} would not parse as TOML: {exc}"
            return out
        entry = (doc.get("mcp_servers") or {}).get(SERVER)
        if isinstance(entry, dict):
            args = entry.get("args")
            out.update(found=True, command=str(entry.get("command") or ""),
                       args=[str(a) for a in args] if isinstance(args, list) else [])
        return out

    inside = False
    for line in raw.splitlines():
        header = _TOML_TABLE.match(line)
        if header:
            inside = (header.group(1) or header.group(2) or "").strip() == SERVER
            if inside:
                out["found"] = True
            continue
        if not inside:
            continue
        got = _TOML_STR.match(line)
        if got:
            out["command"] = got.group(2)
            continue
        got = _TOML_ARGS.match(line)
        if got:
            try:
                out["args"] = [str(a) for a in json.loads(got.group(1))]
            except ValueError:
                pass
    return out


def _codex_argv(exe: str, interpreter: str) -> list[str]:
    return [exe, "mcp", "add", SERVER, "--", interpreter, *MODULE_ARGS]


def _codex_unregister(exe: str) -> list[str]:
    return [exe, "mcp", "remove", SERVER]


WIRINGS: dict[str, Wiring] = {
    "codex": Wiring(
        id="codex", label="Codex CLI",
        config=_codex_config, read=_codex_read, argv=_codex_argv,
        how=("Codex 자체 설정에 [mcp_servers.builders-gate] 항목을 씁니다. "
             "투입 실행마다 주입되는 임시 MCP 연결과는 별개라서, 사용자가 직접 "
             "여는 Codex 세션에도 도구가 보입니다."),
        scope_note="사용자 범위 · ~/.codex/config.toml"),
}

_UNREGISTER = {"codex": _codex_unregister}


# ---------------------------------------------------------------------------
# The verdict
# ---------------------------------------------------------------------------

def interpreter() -> str:
    """The interpreter a registration SHOULD name: the one running this process.

    Same value ``runners.mcp_overrides`` uses and the same value
    ``bgate_cli._pin`` writes into the hook, for the same reason all three give:
    it is the environment ``pip install -e .`` ran in, and a bare name resolves
    against whatever is first on PATH when the CLI fires.
    """
    return sys.executable


def _same_file(a: str, b: str) -> bool:
    if not a or not b:
        return False
    try:
        return os.path.normcase(os.path.realpath(a)) == os.path.normcase(
            os.path.realpath(b))
    except OSError:
        return os.path.normcase(a) == os.path.normcase(b)


def _judge(entry: dict) -> dict:
    """Which of the four wiring states this registration is in.

    ``pinned`` is the only good one. The other three all render as "registered"
    in the CLI's own listing, which is exactly why they are worth separating
    here — the whole point of this row is to distinguish a registration that
    works from one that looks identical and does not.
    """
    if not entry.get("found"):
        return {"state": "absent",
                "verdict": "등록되지 않았습니다. 사용자가 직접 여는 이 CLI 세션에는 "
                           "Builders Gate 도구가 보이지 않습니다.",
                "ok": False}
    command = str(entry.get("command") or "")
    args = list(entry.get("args") or [])
    if _is_bare(command):
        return {"state": "bare",
                "verdict": f"등록은 되어 있지만 명령이 '{command}'만 가리킵니다. "
                           "CLI가 서버를 띄울 때 PATH의 첫 실행 파일을 잡으므로 "
                           "Builders Gate가 설치된 환경과 달라질 수 있습니다. "
                           "그 경우 원인은 인터프리터인데도 연결 실패처럼 보입니다.",
                "ok": False}
    if args and args != MODULE_ARGS:
        return {"state": "odd-args",
                "verdict": f"등록은 되어 있지만 {' '.join(MODULE_ARGS)} 대신 "
                           f"{' '.join(args)}를 실행합니다. 의도한 설정일 수 있으므로 "
                           "요청 없이 바꾸지 않습니다.",
                "ok": False}
    if not _same_file(command, interpreter()):
        return {"state": "other-interpreter",
                "verdict": f"이 대시보드와 다른 인터프리터에 등록되어 있습니다. "
                           f"그 인터프리터에도 Builders Gate가 설치되어 있으면 "
                           f"작동하지만, 없으면 연결 실패가 납니다. 등록값: {command}",
                "ok": False}
    return {"state": "pinned",
            "verdict": "사용자 범위에 등록되어 있고, 이 대시보드와 같은 인터프리터에 고정되어 있습니다.",
            "ok": True}


def command_line(runner_id: str) -> str:
    """The command a human would type, for the copy button and for the docs.

    Shown even when the button is available: this is the line in CLAUDE.md and
    in every support answer, and a user who wants to know what a button did is
    owed the ability to read it.
    """
    one = WIRINGS.get(runner_id)
    if not one:
        return ""
    return " ".join(_quote(part) for part in one.argv(runner_id, interpreter()))


def _quote(part: str) -> str:
    return f'"{part}"' if " " in part else part


def _used_for(runner_id: str) -> str:
    """The human-facing one-line role for a CLI runner.

    Keep this separate from DEFAULT_RUNNER: the Mac setup can pin the
    brainstorm room, the art seat, and optionally the board dispatch default to
    Codex without pretending the upstream constant changed.
    """
    brainstorm = (os.environ.get("BGATE_BRAINSTORM_RUNNER") or "codex").strip()
    art = (os.environ.get("BGATE_ART_RUNNER") or "").strip()
    dispatch = (os.environ.get("BGATE_DISPATCH_RUNNER")
                or _runners.DEFAULT_RUNNER).strip()
    bits = []
    if runner_id == brainstorm:
        bits.append("브레인스토밍 방이 사용합니다")
    if runner_id == art:
        bits.append("아트 좌석이 사용합니다")
    if runner_id == dispatch:
        bits.append("보드에 투입되는 에이전트의 기본 실행기입니다")
    if bits:
        suffix = "" if runner_id == dispatch else \
            ". 다른 보드 좌석은 기본 실행기를 따릅니다."
        return "; ".join(bits) + suffix
    if runner_id == _runners.DEFAULT_RUNNER and dispatch == _runners.DEFAULT_RUNNER:
        return ("보드에 투입되는 에이전트의 기본 실행기입니다. 지원되는 좌석은 "
                "좌석별 설정으로 다른 실행기를 쓸 수 있습니다.")
    return "설치되어 있어도 현재 기본 실행기는 아닙니다."


def status() -> list[dict]:
    """Every coding-agent CLI: installed, wired, and what is wrong if anything.

    Never raises and never blocks on a subprocess — every fact here comes from a
    ``shutil.which`` and a file read.
    """
    found = _runners.available()
    dispatch_runner = (os.environ.get("BGATE_DISPATCH_RUNNER")
                       or _runners.DEFAULT_RUNNER).strip()
    rows = []
    ordered = sorted(
        _runners.RUNNERS.items(),
        key=lambda kv: (kv[0] != dispatch_runner, kv[0] != "codex", kv[0]),
    )
    for runner_id, runner in ordered:
        one = WIRINGS.get(runner_id)
        detected = found.get(runner_id) or {}
        try:
            entry = one.read() if one else {}
        except Exception as exc:                                 # noqa: BLE001
            entry = {"found": False, "error": f"{type(exc).__name__}: {exc}"}
        judged = _judge(entry) if one else {
            "state": "unknown", "ok": False,
            "verdict": "이 CLI에 대한 MCP 연결 방식이 아직 정의되지 않았습니다."}
        rows.append({
            "id": runner_id,
            "label": one.label if one else runner_id,
            "installed": bool(detected.get("installed")),
            "path": str(detected.get("path") or ""),
            "note": runner.note,
            "steerable": bool(runner.steerable),
            "cost_tracked": bool(runner.cost_tracked),
            "requires_git_repo": bool(runner.requires_git_repo),
            "used_for": _used_for(runner_id),
            "default_runner": runner_id == dispatch_runner,
            "mcp": {
                **entry,
                **judged,
                "server": SERVER,
                "expected_command": interpreter(),
                "expected_args": list(MODULE_ARGS),
                "how": one.how if one else "",
                "scope_note": one.scope_note if one else "",
                "command_line": command_line(runner_id),
                "can_register": bool(detected.get("installed")) and bool(one),
            },
        })
    return rows


def payload() -> dict:
    return {
        "runners": status(),
        "interpreter": interpreter(),
        "server": SERVER,
        # The one fact that makes the whole section legible: WHY an absolute
        # path. Stated once, here, rather than in the three places it is shown.
        "why_absolute": (
            "`python`만 쓰면 CLI가 서버를 띄울 때 PATH에서 먼저 잡히는 실행 파일을 "
            "사용합니다. 대개 Builders Gate가 설치된 환경과 다릅니다. 그러면 "
            "원인은 인터프리터인데도 연결 실패처럼 보입니다. 여기서 작성하는 등록은 "
            "모두 이 정확한 인터프리터를 지정합니다."),
    }


# ---------------------------------------------------------------------------
# The two writes
# ---------------------------------------------------------------------------

def _run(argv: list[str], timeout: int) -> dict:
    """One bounded subprocess, argv list, no shell, stdin closed.

    NO SHELL, EVER: the interpreter path contains spaces on the supported
    platform and a shell string is one quoting mistake from executing something
    else. stdin=DEVNULL for the reason the adapters give — under a stdio MCP
    server an inherited stdin is the client's protocol channel.
    """
    try:
        proc = subprocess.run(argv, capture_output=True, text=True,
                              timeout=timeout, stdin=subprocess.DEVNULL,
                              creationflags=_NO_WINDOW)
    except FileNotFoundError:
        return {"ok": False, "output": f"{argv[0]} is not on PATH any more"}
    except subprocess.TimeoutExpired:
        return {"ok": False, "output": f"timed out after {timeout}s"}
    except Exception as exc:                                     # noqa: BLE001
        return {"ok": False, "output": f"{type(exc).__name__}: {exc}"}
    text = ((proc.stdout or "") + ("\n" + proc.stderr if proc.stderr else "")).strip()
    return {"ok": proc.returncode == 0, "code": proc.returncode,
            "output": text[-1200:]}


def register(runner_id: str) -> dict:
    """Register (or re-register) the Builders Gate MCP server for one CLI.

    A CONFIG WRITE, PERFORMED BY THE CLI THAT OWNS THE CONFIG. The existing
    entry is removed first so this is idempotent and so it can repair the broken
    states :func:`_judge` names — ``mcp add`` refuses a name it already holds,
    which would make the one button that fixes a bad registration the one button
    that cannot.

    The caller gates this on a human. Registering an MCP server changes what
    every future session of that CLI can do, on this whole machine.
    """
    one = WIRINGS.get(runner_id)
    if not one:
        return {"ok": False, "error": f"no MCP wiring described for '{runner_id}'"}
    runner = _runners.RUNNERS.get(runner_id)
    exe = runner.find() if runner else None
    if not exe:
        return {"ok": False,
                "error": f"the {runner_id} CLI is not on PATH, so there is "
                         "nothing to register into"}
    before = one.read()
    removed = None
    if before.get("found"):
        removed = _run(_UNREGISTER[runner_id](exe), REGISTER_TIMEOUT)
    added = _run(one.argv(exe, interpreter()), REGISTER_TIMEOUT)
    after = one.read()
    judged = _judge(after)
    if not added["ok"] and not judged["ok"]:
        return {"ok": False,
                "error": (f"`{one.label} mcp add` failed: "
                          + (added.get("output") or "no output")),
                "command_line": command_line(runner_id),
                "removed": removed}
    return {"ok": True, "state": judged["state"], "verdict": judged["verdict"],
            "output": added.get("output", ""), "entry": after}


def unregister(runner_id: str) -> dict:
    one = WIRINGS.get(runner_id)
    runner = _runners.RUNNERS.get(runner_id)
    exe = runner.find() if runner else None
    if not one or not exe:
        return {"ok": False, "error": f"the {runner_id} CLI is not available"}
    got = _run(_UNREGISTER[runner_id](exe), REGISTER_TIMEOUT)
    after = one.read()
    return {"ok": not after.get("found"), "output": got.get("output", ""),
            "entry": after}


def verify(runner_id: str) -> dict:
    """Ask the REGISTERED interpreter whether it can actually import the server.

    This is the check that separates a registration that works from one that
    only looks right, and it is the reason the interpreter comparison is not the
    last word: a different interpreter is fine if Builders Gate is installed in
    it, and this is the only way to find that out short of starting a session
    and watching a tool call fail.

    Human-gated by the caller, because it executes the command the config names.
    It runs a one-line import and prints nothing but a path — it does not start
    the MCP server, which would sit on stdin forever.
    """
    one = WIRINGS.get(runner_id)
    if not one:
        return {"ok": False, "error": f"no MCP wiring described for '{runner_id}'"}
    entry = one.read()
    command = str(entry.get("command") or "")
    if not entry.get("found") or not command:
        return {"ok": False,
                "error": "이 CLI에는 등록된 항목이 없어 확인할 인터프리터가 없습니다"}
    if _is_bare(command):
        return {"ok": False, "command": command,
                "error": "등록값이 절대경로가 아닌 인터프리터만 가리킵니다. CLI가 "
                         "어떤 실행 파일을 잡을지 이 프로세스에서 재현할 수 없습니다. "
                         "다시 등록해 고정하세요."}
    got = _run([command, "-c",
                "import bgate_mcp.server, sys; print(sys.executable)"],
               VERIFY_TIMEOUT)
    if got["ok"]:
        return {"ok": True, "command": command,
                "detail": "해당 인터프리터가 Builders Gate MCP 서버를 정상적으로 "
                          "불러옵니다. 등록이 작동 중입니다.",
                "output": got.get("output", "")}
    return {"ok": False, "command": command,
            "error": "해당 인터프리터가 bgate_mcp를 불러오지 못합니다. 내부에서 "
                     "확인한 연결 실패 상태입니다.",
            "output": got.get("output", "")}


# What each bad state means, in one clause, for the doctor line. The panel gets
# the full paragraph from _judge; a report row gets the short form of the same
# fact so the two never say different things about one registration.
_SHORT = {
    "absent": "등록되지 않음 - 이 CLI 세션에는 Builders Gate 도구가 없습니다",
    "bare": "맨 `python`에 등록됨 - 실행 시 PATH의 첫 인터프리터를 잡습니다",
    "other-interpreter": "이 대시보드와 다른 인터프리터에 등록됨",
    "odd-args": "`-m bgate_mcp.server`가 아닌 다른 명령으로 등록됨",
    "unknown": "이 CLI의 MCP 연결 방식이 정의되지 않았습니다",
}


def doctor_row() -> dict:
    """One optional row: is at least one coding-agent CLI correctly wired.

    Green needs BOTH halves. "Installed" alone was the only half anything ever
    checked, and it is the half that is almost never the problem.
    """
    try:
        rows = status()
    except Exception as exc:                                     # noqa: BLE001
        return {"name": "agent_cli", "available": False, "optional": True,
                "detail": f"{type(exc).__name__}: {exc}"}
    good = [r["label"] for r in rows if r["installed"] and r["mcp"].get("ok")]
    if good:
        return {"name": "agent_cli", "available": True, "optional": True,
                "detail": ", ".join(good) + "가 이 인터프리터에 연결되어 있습니다"}
    installed = [r for r in rows if r["installed"]]
    if not installed:
        return {"name": "agent_cli", "available": False, "optional": True,
                "detail": "PATH에서 코딩 에이전트 CLI를 찾을 수 없습니다. 작업은 "
                          "등록할 수 있지만 투입은 되지 않습니다"}
    return {
        "name": "agent_cli", "available": False, "optional": True,
        "detail": "; ".join(
            f"{r['label']} {_SHORT.get(r['mcp'].get('state'), r['mcp'].get('state'))}"
            for r in installed)
        + " - 설정 → Codex CLI에서 고치세요",
    }


def find_optional(runner_id: str) -> Optional[str]:
    """The resolved CLI path, or None. Thin wrapper so callers do not reach into
    ``runners.RUNNERS`` for a lookup this module already does."""
    runner = _runners.RUNNERS.get(runner_id)
    return runner.find() if runner else None
