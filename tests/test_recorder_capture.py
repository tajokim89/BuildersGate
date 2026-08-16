"""What ffmpeg gets pointed at, and why it is never `title=`.

THE BUG THIS FILE EXISTS FOR: every playtest recorded a black rectangle with a
live mouse cursor moving over it. `gdigrab -i title=X` asks GDI for that
window's device context, and a Godot game never draws into one — it renders
through Vulkan/D3D and presents a swapchain the compositor owns, so GDI returns
the window's cleared background. gdigrab then composites the system cursor on
top itself, which is why the cursor was the only thing that ever moved.
Measured against the Godot editor at the time of the fix: every pixel of a
`title=` grab was RGB(36,36,36), while a desktop grab of the same screen came
back with a full 0-255 range.

These are argument-shape assertions, not capture tests — a real grab needs a
real window and a real ffmpeg, and lives behind the `slow` marker elsewhere.
The shape is the part that regressed, and it is the part a reader will be
tempted to "simplify" back to `title=`.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

from bgate_adapters import recorder


def _args(title, *, fps=30):
    return recorder._video_input(title, fps)[0]


@pytest.fixture()
def win32_recorder(monkeypatch):
    monkeypatch.setattr(recorder.sys, "platform", "win32")


@pytest.mark.usefixtures("win32_recorder")
class TestItNeverPointsGdigrabAtAWindow:
    def test_a_named_window_is_still_a_desktop_grab(self, monkeypatch):
        monkeypatch.setattr(recorder, "window_rect",
                            lambda _t: {"x": 10, "y": 20,
                                        "width": 640, "height": 480})
        args = _args("Downsizing")
        assert "-i" in args and args[args.index("-i") + 1] == "desktop"
        assert not any(a.startswith("title=") for a in args), (
            "back to `title=` — that is the black-recording bug returning")

    def test_no_window_is_a_desktop_grab_too(self):
        args = _args(None)
        assert args[args.index("-i") + 1] == "desktop"
        assert "-video_size" not in args, "an uncropped grab takes the whole canvas"


@pytest.mark.usefixtures("win32_recorder")
class TestTheCrop:
    def test_it_carries_the_window_rect(self, monkeypatch):
        monkeypatch.setattr(recorder, "window_rect",
                            lambda _t: {"x": 10, "y": 20,
                                        "width": 640, "height": 480})
        args = _args("Downsizing")
        assert args[args.index("-offset_x") + 1] == "10"
        assert args[args.index("-offset_y") + 1] == "20"
        assert args[args.index("-video_size") + 1] == "640x480"

    def test_the_offsets_are_absolute_not_origin_relative(self, monkeypatch):
        """gdigrab assigns clip_rect.left = offset_x outright once -video_size is
        set. Subtracting the virtual-desktop origin first put the crop a monitor
        to the right and ffmpeg refused the input."""
        monkeypatch.setattr(recorder, "window_rect",
                            lambda _t: {"x": -1920, "y": 0,
                                        "width": 800, "height": 600})
        args = _args("Downsizing")
        assert args[args.index("-offset_x") + 1] == "-1920"

    def test_an_unlocatable_window_records_uncropped_rather_than_nothing(
            self, monkeypatch):
        monkeypatch.setattr(recorder, "window_rect", lambda _t: None)
        args, note = recorder._video_input("Downsizing", 30)
        assert args[args.index("-i") + 1] == "desktop"
        assert "-video_size" not in args
        assert "could not be located" in note

    def test_the_note_says_what_is_really_being_captured(self, monkeypatch):
        monkeypatch.setattr(recorder, "window_rect",
                            lambda _t: {"x": 0, "y": 0,
                                        "width": 1920, "height": 1032})
        _, note = recorder._video_input("Downsizing", 30)
        assert "1920x1032" in note and "Downsizing" in note


@pytest.mark.usefixtures("win32_recorder")
class TestTheCursorIsStillDrawn:
    def test_draw_mouse_is_explicit(self):
        """It was only ever on by default. Now that the cursor is no longer the
        one thing that survives, keep it deliberate rather than inherited."""
        assert _args(None)[_args(None).index("-draw_mouse") + 1] == "1"


class TestMacOSAvfoundation:
    def test_it_parses_screen_devices_from_ffmpeg_output(self):
        text = """
[AVFoundation indev @ 0x123] AVFoundation video devices:
[AVFoundation indev @ 0x123] [0] Capture screen 0
[AVFoundation indev @ 0x123] [1] FaceTime HD Camera
[AVFoundation indev @ 0x123] AVFoundation audio devices:
[AVFoundation indev @ 0x123] [0] MacBook Pro Microphone
"""
        devices = recorder._parse_avfoundation_devices(text, "video")
        assert devices == [
            {"index": 0, "name": "Capture screen 0"},
            {"index": 1, "name": "FaceTime HD Camera"},
        ]

    def test_it_uses_avfoundation_screen_capture_on_macos(self, monkeypatch):
        monkeypatch.setattr(recorder.sys, "platform", "darwin")
        monkeypatch.setattr(
            recorder, "_mac_screen_device",
            lambda: {"index": 2, "name": "Capture screen 0"},
        )

        args, note = recorder._video_input("Downsizing", 24)

        assert args[:4] == ["-f", "avfoundation", "-framerate", "24"]
        assert args[args.index("-i") + 1] == "2:none"
        assert "-capture_cursor" in args
        assert "Capture screen 0" in note

    def test_probe_video_capture_accepts_a_macos_screen_device(self, monkeypatch):
        monkeypatch.setattr(recorder.sys, "platform", "darwin")
        monkeypatch.setattr(recorder, "_mac_avfoundation_devices", lambda: {
            "video": [{"index": 0, "name": "Capture screen 0"}],
            "audio": [],
            "raw": "",
            "returncode": 1,
        })

        got = recorder.probe_video_capture()

        assert got["ok"] is True
        assert got["device"]["index"] == 0
        assert got["whole_desktop"] is True


class TestVideoOnlyFallback:
    def test_stop_writes_a_silent_wav_when_no_audio_blocks_arrived(self, tmp_path):
        rec = recorder.Recording(
            out_dir=tmp_path,
            video_path=tmp_path / "session.mp4",
            audio_path=tmp_path / "session.wav",
            started_at=100.0,
            video_started_at=100.0,
            audio_started_at=100.0,
        )

        got = recorder.stop(rec)

        assert got["audio_silent"] is True
        assert got["audio_path"].endswith("session.wav")
        assert Path(got["audio_path"]).is_file()
        assert got["audio_offset_s"] == 0.0


@pytest.mark.skipif(sys.platform != "win32", reason="Win32 geometry")
class TestWindowRect:
    def test_a_window_that_does_not_exist_is_none(self):
        assert recorder.window_rect("no such window exists anywhere ever") is None

    def test_a_real_window_is_even_sized_and_inside_the_desktop(self):
        """An odd-width crop is rejected when the input is opened, before any
        scale filter gets a chance to fix it — and a rect that leaves the canvas
        is the "Capture area extends outside window area" refusal.

        Run against whatever window this machine happens to have open, because
        the geometry being checked is Win32's, not ours. Skipped on a machine
        with no windows at all (a headless CI runner).
        """
        import ctypes

        windows = [w for w in recorder.list_windows() if w.get("title")]
        rect = next((r for r in (recorder.window_rect(w["title"])
                                 for w in windows) if r), None)
        if rect is None:
            pytest.skip("no locatable top-level window on this machine")

        user32 = ctypes.windll.user32
        vx, vy = user32.GetSystemMetrics(76), user32.GetSystemMetrics(77)
        vr = vx + user32.GetSystemMetrics(78)
        vb = vy + user32.GetSystemMetrics(79)

        assert rect["width"] % 2 == 0 and rect["height"] % 2 == 0
        assert rect["width"] > 0 and rect["height"] > 0
        assert vx <= rect["x"] and rect["x"] + rect["width"] <= vr
        assert vy <= rect["y"] and rect["y"] + rect["height"] <= vb
