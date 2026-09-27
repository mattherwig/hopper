#!/usr/bin/env python3
"""Generate Raycast Store media for Jumper by driving Raycast on this Mac.

  python3 scripts/media/store_media.py screenshots   -> extension/metadata/jumper-1.png ... (2000x1250)
  python3 scripts/media/store_media.py gif           -> extension/media/demo.gif

Needs: `npm run dev` running (in extension/), Accessibility + Screen Recording permission for the calling app,
ffmpeg (gif only). Takes over the screen while running: hands off keyboard and mouse.
See .claude/skills/store-screenshots and .claude/skills/demo-gif for the full procedure.
"""

import atexit
import json
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # repo root
EXT = ROOT / "extension"  # the Raycast extension (what ships to the Store)
HERE = Path(__file__).resolve().parent
DEEPLINK = "raycast://extensions/matt_herwig/jumper/"
TMP = Path(tempfile.mkdtemp(prefix="jumper-media-"))
atexit.register(shutil.rmtree, TMP, ignore_errors=True)

# Built-in apps with no personal content, activated oldest -> newest so they fill every visible
# History row (about 10 on a 1352x878pt screen) and push the user's own apps out of view.
# The last one is "Current".
# `staged` apps are the GIF's cast: their windows are placed staggered over the recording area, above a backdrop
# that hides everything else (the other demo apps' windows and the owner's own). Back, Forward, and Toggle cycle
# through them. Keep them last, and keep the owner's personal content out of them. No Finder: its sidebar shows
# the home folder name, and it registered in the app order late, so Back landed on it instead of a staged app.
DEMO_APPS = [
    ("Tips", ["open", "-a", "Tips"], False),
    ("Stocks", ["open", "-a", "Stocks"], False),
    ("Clock", ["open", "-a", "Clock"], False),
    ("Calculator", ["open", "-a", "Calculator"], False),
    ("Dictionary", ["open", "dict://jump"], False),
    ("Font Book", ["open", "-a", "Font Book"], False),
    ("Chess", ["open", "-a", "Chess"], False),
    ("Ghostty", None, False),  # the owner's own session: used only if already running, never quit or moved
    ("Safari", None, True),  # a new window with SAFARI_TABS; the owner's own windows are left alone
    ("Preview", ["open", "-a", "Preview", str(EXT / "assets/extension-icon.png")], True),
    ("TextEdit", None, True),  # opens a scratch note
]

# Public pages for the staged Safari window: the Tabs command's shots and GIF show these, with the owner's own
# apps' tabs pushed below the visible rows (Tabs lists apps most recent first). The first one is current.
SAFARI_TABS = [
    "https://www.raycast.com/store",
    "https://www.apple.com/os/macos/",
    "https://github.com/raycast/extensions",
    "https://developers.raycast.com/",
]

# Apps whose process name differs from the app name.
PROCESS = {"Ghostty": "ghostty"}

# Keys shown in the GIF overlay: the owner's own bindings (Raycast Settings → Extensions → Jumper).
# Commands are actually triggered by deeplink, since Raycast ignores synthetic hotkeys.
HOTKEYS = {
    "back": ["⇧", "⌘", "["],
    "forward": ["⇧", "⌘", "]"],
    "toggle": ["⌘", "⌘"],  # double-tap ⌘
    "history": ["⇧", "⌘"],
    "tabs": ["⌃", "⌘"],
}

NOTE = "Launch checklist\n\n- Screenshots\n- Demo GIF\n- Submit to the Raycast Store\n"


def osa(script: str) -> str:
    return subprocess.run(["osascript", "-e", script], capture_output=True, text=True, check=True).stdout.strip()


def keys(expr: str) -> None:
    """System Events keystroke, e.g. 'keystroke "k" using command down' or 'key code 53'."""
    osa(f'tell application "System Events" to {expr}')


def escape(times: int = 1) -> None:
    for _ in range(times):
        keys("key code 53")
        time.sleep(0.35)


def close_raycast() -> None:
    """Escape until Raycast's window is gone. Never sends Escape to another app (it could be this terminal)."""
    for _ in range(6):
        if raycast_window() is None:
            return
        escape()
    raise RuntimeError("Raycast window did not close")


def paste(text: str) -> None:
    """Pastes `text` into the focused field in one go, then puts the owner's clipboard text back."""
    saved = subprocess.run(["pbpaste"], capture_output=True).stdout
    subprocess.run(["pbcopy"], input=text.encode(), check=True)
    keys('keystroke "v" using command down')
    time.sleep(0.3)
    subprocess.run(["pbcopy"], input=saved, check=True)


def deeplink(command: str) -> None:
    subprocess.run(["open", "-g", DEEPLINK + command], check=True)


def running(app: str) -> bool:
    return subprocess.run(["pgrep", "-xq", PROCESS.get(app, app)]).returncode == 0


def frontmost() -> str:
    return osa('tell application "System Events" to get name of first process whose frontmost is true')


def raycast_window() -> tuple[int, int, int, int, int] | None:
    """(id, x, y, w, h) of Raycast's launcher window while it is on screen, else None."""
    out = subprocess.run(["swift", str(HERE / "raycast-window.swift")], capture_output=True, text=True)
    if out.returncode != 0:
        return None
    wid, x, y, w, h = map(int, out.stdout.split())
    return wid, x, y, w, h


def wait_for_window(process: str, timeout: float = 10) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            if int(osa(f'tell application "System Events" to count windows of process "{process}"')) > 0:
                return
        except subprocess.CalledProcessError:
            pass
        time.sleep(0.3)
    raise RuntimeError(f"{process} opened no window")


class DemoApps:
    """Brings up DEMO_APPS in order and undoes it afterwards (quits only what it launched)."""

    def __init__(self, frames: dict[str, tuple[int, int, int, int]] | None = None, before_staged=None):
        self.frames = frames or {}  # staged app -> window rect (x, y, w, h), for the GIF
        self.before_staged = before_staged  # called once before the first staged app comes up (the backdrop)
        self.launched: list[str] = []
        self.safari_window: str | None = None
        self.note = TMP / "Jumper.txt"
        self.previous_app = frontmost()

    def __enter__(self):
        self.note.write_text(NOTE)
        for name, cmd, staged in DEMO_APPS:
            process = PROCESS.get(name, name)
            if staged and self.before_staged:
                self.before_staged()
                self.before_staged = None
            if name == "Ghostty":
                if not running(name):
                    print("note: Ghostty not running, leaving it out of the demo", file=sys.stderr)
                    continue
                osa('tell application "Ghostty" to activate')
            else:
                if not running(name):
                    self.launched.append(name)
                if name == "TextEdit":
                    subprocess.run(["open", "-a", "TextEdit", str(self.note)], check=True)
                elif name == "Safari":
                    self.safari_window = osa(
                        'tell application "Safari"\n'
                        f'  make new document with properties {{URL:"{SAFARI_TABS[0]}"}}\n'
                        "  set w to front window\n"
                        + "".join(f'  tell w to make new tab at end of tabs with properties {{URL:"{u}"}}\n' for u in SAFARI_TABS[1:])
                        + "  set current tab of w to tab 1 of w\n"
                        "  return id of w\n"
                        "end tell"
                    )
                    # `open -a`, not AppleScript activate: an AppleScript-activated app may not register in
                    # macOS's app order.
                    subprocess.run(["open", "-a", "Safari"], check=True)
                    time.sleep(3)  # let the pages load, so titles and favicons are real
                else:
                    subprocess.run(cmd, check=True)
            wait_for_window(process)
            time.sleep(0.8)
            if name in self.frames:
                x, y, w, h = self.frames[name]
                try:
                    osa(
                        f'tell application "System Events" to tell process "{process}"\n'
                        f"  set position of window 1 to {{{x}, {y}}}\n"
                        f"  set size of window 1 to {{{w}, {h}}}\n"
                        "end tell"
                    )
                except subprocess.CalledProcessError as e:
                    print(f"warning: could not frame {name}: {e.stderr.strip()}", file=sys.stderr)
        if self.frames:
            # Make the staged apps the three most recent for sure: an app activated during setup can register in
            # macOS's app order late (Finder did), and a Back into an unstaged app raises all its windows over the
            # backdrop.
            for name in self.frames:
                subprocess.run(["open", "-a", name], check=True)
                time.sleep(0.8)
        time.sleep(0.5)
        return self

    def __exit__(self, *exc):
        if self.safari_window:
            subprocess.run(["osascript", "-e", f'tell application "Safari" to close (window id {self.safari_window})'])
        subprocess.run(
            ["osascript", "-e", f'tell application "TextEdit" to close (every document whose name is "{self.note.name}") saving no']
        )
        for name in self.launched:
            subprocess.run(["osascript", "-e", f'tell application "{name}" to quit'], capture_output=True)
            if running(name):  # some apps (Stocks) refuse the AppleScript quit
                subprocess.run(["pkill", "-x", name])
        subprocess.run(["osascript", "-e", f'tell application "{self.previous_app}" to activate'])


def capture(path: Path) -> None:
    wid = raycast_window()[0]  # type: ignore[index]
    raw = TMP / "window.png"
    subprocess.run(["screencapture", "-x", "-o", "-l", str(wid), str(raw)], check=True)
    subprocess.run(["swift", str(HERE / "compose.swift"), str(raw), str(path)], check=True)
    print(f"wrote {path.relative_to(ROOT)}")


def screenshots() -> None:
    out = EXT / "metadata"
    out.mkdir(exist_ok=True)
    for old in out.glob("jumper-*.png"):
        old.unlink()
    close_raycast()
    with DemoApps():
        # 1. History list
        deeplink("history")
        time.sleep(2)
        capture(out / "jumper-1.png")

        # 2. Action panel
        keys('keystroke "k" using command down')
        time.sleep(1)
        capture(out / "jumper-2.png")
        escape()

        # 3. Excluded section: exclude Chess, filter to it, show Include in History, then undo.
        keys('keystroke "Chess"')
        time.sleep(0.8)
        keys('keystroke "x" using {control down, shift down}')
        time.sleep(3)  # let the success toast fade
        keys('keystroke "k" using command down')
        time.sleep(1)
        capture(out / "jumper-3.png")
        keys("key code 36")  # Return = Include in History
        time.sleep(1.5)
        close_raycast()

        # 5. Tabs, from the staged Safari window: its tabs on top, then the other demo apps' windows.
        subprocess.run(["open", "-a", "Safari"], check=True)
        time.sleep(1)
        deeplink("tabs")
        time.sleep(3.5)  # the list first shows the cached copy, then refreshes
        capture(out / "jumper-5.png")
        close_raycast()

    # 4. Root search for "jumper": every command, the second row selected to show its hotkey (Raycast ranks by use). Raycast ignores a synthetic
    # ⌘Space, but Escape from a command's view pops to root search. Matching files from the
    # user's disk show below the commands; review them before committing.
    deeplink("history")
    time.sleep(1.5)
    escape()
    time.sleep(0.6)
    if raycast_window() is None:
        raise RuntimeError("root search did not open")
    keys('keystroke "jumper"')
    time.sleep(1.5)
    keys("key code 125")  # Raycast shows the hotkey of the selected row only
    time.sleep(0.6)
    capture(out / "jumper-4.png")
    close_raycast()


def gif() -> None:
    if not shutil.which("ffmpeg"):
        sys.exit("ffmpeg not found: brew install ffmpeg")
    close_raycast()
    # Recording area: Raycast's window plus a margin. A backdrop covers it; the staged apps' windows sit staggered on
    # top (top left to bottom right), so each switch visibly brings a different window forward.
    deeplink("history")
    deadline = time.time() + 6
    while (window := raycast_window()) is None and time.time() < deadline:
        time.sleep(0.3)
    if window is None:
        sys.exit("History did not open: is `ray develop` running?")
    time.sleep(0.5)  # let it settle at its final size
    _, rx, ry, rw, rh = raycast_window()  # type: ignore[misc]
    close_raycast()
    frame = (rx - 120, max(ry - 50, 40), rw + 240, rh + 170)
    x, y, w, h = frame
    staged = [n for n, _, st in DEMO_APPS if st]
    ww, wh = int(w * 0.6), int(h * 0.6)
    frames = {
        name: (x + int(w * (0.06 + 0.14 * i)), y + int(h * (0.05 + 0.15 * i)), ww, wh) for i, name in enumerate(staged)
    }
    video = TMP / "demo.mov"
    back, fwd, tog, hist, tabs = (HOTKEYS[c] for c in ("back", "forward", "toggle", "history", "tabs"))
    # App order after setup: TextEdit (current), Preview, Safari. Back/Forward/Toggle cycle through those three;
    # History ↓↓ lands on Safari. Tabs then pastes a fuzzy query for the owner's cmux workspace "github-pages" (cmux
    # fills the screen, so it covers the recording area). Pasted, not typed: every prefix ("g", "gh") would briefly
    # list matching private tabs. Raycast ranks matches across all apps; "gh-pages" ranks the cmux workspace first
    # (check with a test run if the owner's tabs change). Checked after recording.
    tab_query, tab_target = "gh-pages", "cmux"
    card = {"card": "Jumper", "sub": "Jump to any app, tab, or session"}
    # (overlay message, deeplink command or keystroke or None, seconds to hold)
    timeline = [
        (card, None, 2.6),
        ({}, None, 0.3),
        ({"keys": back, "title": "Back", "detail": "to the previous app"}, "back", 1.3),
        ({"keys": back, "title": "Back", "detail": "and further back"}, "back", 1.4),
        ({"keys": fwd, "title": "Forward", "detail": "retrace your steps"}, "forward", 1.3),
        ({"keys": fwd, "title": "Forward", "detail": "back where you started"}, "forward", 1.4),
        ({"keys": tog, "title": "Toggle", "detail": "flip between your last two apps"}, "toggle", 1.3),
        ({"keys": tog, "title": "Toggle", "detail": "and back"}, "toggle", 1.4),
        ({"keys": hist, "title": "History", "detail": "every running app, most recent first"}, "history", 1.8),
        ({"keys": ["↓"], "title": "History", "detail": "pick any app"}, "key code 125", 0.4),
        ({"keys": ["↓"], "title": "History", "detail": "pick any app"}, "key code 125", 0.7),
        ({"keys": ["↩"], "title": "Switch to App", "detail": "jump straight there"}, "key code 36", 1.5),
        ({"keys": tabs, "title": "Tabs", "detail": "tabs, windows, and sessions of every app"}, "tabs", 2.0),
        ({"keys": [tab_query], "title": "Fuzzy search", "detail": "finds the github-pages workspace in cmux"}, f"paste:{tab_query}", 1.8),
        ({"keys": ["↩"], "title": "Jump to Tab", "detail": "straight to that workspace"}, "key code 36", 2.0),
        ({}, None, 0.3),
        ({"card": "Jumper", "sub": "Free on the Raycast Store"}, None, 2.6),
    ]
    keycast = subprocess.Popen(
        ["swift", str(HERE / "keycast.swift"), *map(str, frame), str(EXT / "assets/extension-icon.png")], stdin=subprocess.PIPE, text=True
    )

    def overlay(message: dict) -> None:
        keycast.stdin.write(json.dumps(message) + "\n")  # type: ignore[union-attr]
        keycast.stdin.flush()  # type: ignore[union-attr]

    def backdrop() -> None:
        overlay({"backdrop": True})
        time.sleep(5)  # keycast compiles on first run

    with DemoApps(frames, before_staged=backdrop):

        # Warm Tabs' cache: it shows the last list first, which would otherwise be from the owner's own use.
        deeplink("tabs")
        time.sleep(3)
        close_raycast()
        for name in frames:  # the warm-up can shift the app order; staged apps must be the three most recent
            subprocess.run(["open", "-a", name], check=True)
            time.sleep(0.8)
        # Park the pointer outside the recording area (screencapture -v records it).
        subprocess.run(["swift", "-e", "import CoreGraphics; CGWarpMouseCursorPosition(CGPoint(x: 2, y: 2000))"])
        overlay(card)
        time.sleep(1)  # the card is up before recording starts
        duration = sum(hold for *_, hold in timeline) + 1.5
        rec = subprocess.Popen(
            ["screencapture", "-x", "-v", "-V", str(int(duration) + 1), "-R", f"{x},{y},{w},{h}", str(video)]
        )
        time.sleep(1)  # screencapture startup; trimmed off below
        checked: set[str] = set()
        for message, action, hold in timeline:
            overlay(message)
            if action and action.startswith("paste:"):
                paste(action.removeprefix("paste:"))
            elif action and action.startswith(("key code", "keystroke")):
                keys(action)
            elif action:
                deeplink(action)
            time.sleep(hold)
            no_view = action in ("back", "forward", "toggle")
            if no_view and action not in checked and raycast_window() is not None:
                # No-view commands only flash Raycast's window; if it is still up a second later,
                # it's the "Request to run" prompt. The user must pick Always Run Command once.
                time.sleep(1)
                if raycast_window() is not None:
                    rec.kill()
                    keycast.kill()
                    sys.exit(f"Raycast asked before running '{action}': choose Always Run Command, then rerun.")
            if no_view:
                checked.add(action)  # type: ignore[arg-type]
        rec.wait()
        keycast.stdin.close()
        keycast.wait()
        if frontmost() != tab_target:
            print(f"warning: Tabs jump landed on {frontmost()}, expected {tab_target}: don't use this GIF", file=sys.stderr)

        out = EXT / "media"
        out.mkdir(exist_ok=True)
        subprocess.run(
            [
                "ffmpeg", "-y", "-loglevel", "error", "-ss", "1", "-i", str(video),
                "-vf", "fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];"
                "[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle",
                str(out / "demo.gif"),
            ],
            check=True,
        )
        print(f"wrote extension/media/demo.gif ({(out / 'demo.gif').stat().st_size // 1024} KB)")


if __name__ == "__main__":
    {"screenshots": screenshots, "gif": gif}.get(sys.argv[1] if len(sys.argv) > 1 else "", lambda: sys.exit(__doc__))()
