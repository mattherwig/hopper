#!/usr/bin/env python3
"""Generate Raycast Store media for Hopper by driving Raycast on this Mac.

  python3 scripts/media/store_media.py screenshots   -> extension/metadata/hopper-1.png ... (2000x1250)
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
DEEPLINK = "raycast://extensions/matt_herwig/hopper/"
TMP = Path(tempfile.mkdtemp(prefix="hopper-media-"))
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

# Keys shown in the GIF overlay: the owner's own bindings (Raycast Settings → Extensions → Hopper).
# Commands are actually triggered by deeplink, since Raycast ignores synthetic hotkeys.
HOTKEYS = {
    "back": ["⌃", "⌘", "["],
    "forward": ["⌃", "⌘", "]"],
    "toggle": ["⌘", "⌘"],  # double-tap ⌘
    "history": ["⌃", "⌘"],
    "tabs": ["⌃", "⌃"],  # double-tap ⌃
    "agents": ["⌥", "⌘"],
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


def raycast_open() -> bool:
    """True while Raycast has any window on screen, including the Request to run prompt."""
    try:
        return int(osa('tell application "System Events" to count windows of process "Raycast"')) > 0
    except subprocess.CalledProcessError:
        return False


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

    def __init__(
        self,
        frames: dict[str, tuple[int, int, int, int]] | None = None,
        before_staged=None,
        safari_tabs: list[str] | None = None,
        include_ghostty: bool = True,
        note_name: str = "Hopper.txt",
        preview_name: str | None = None,
        apps: list | None = None,
        note_text: str | None = None,
    ):
        self.frames = frames or {}  # staged app -> window rect (x, y, w, h), for the GIF
        self.before_staged = before_staged  # called once before the first staged app comes up (the backdrop)
        self.safari_tabs = safari_tabs or SAFARI_TABS
        self.include_ghostty = include_ghostty
        self.preview_name = preview_name  # window title for the Preview shot; copies the extension icon
        self.apps = apps or DEMO_APPS
        self.note_text = note_text or NOTE
        self.launched: list[str] = []
        self.safari_window: str | None = None
        self.note = TMP / note_name
        self.previous_app = frontmost()

    def __enter__(self):
        self.note.write_text(self.note_text)
        for name, cmd, staged in self.apps:
            process = PROCESS.get(name, name)
            if staged and self.before_staged:
                self.before_staged()
                self.before_staged = None
            if name == "Ghostty":
                if not self.include_ghostty:
                    continue
                if not running(name):
                    print("note: Ghostty not running, leaving it out of the demo", file=sys.stderr)
                    continue
                osa('tell application "Ghostty" to activate')
            else:
                if not running(name):
                    self.launched.append(name)
                if name == "TextEdit":
                    subprocess.run(["open", "-a", "TextEdit", str(self.note)], check=True)
                elif name == "Preview" and self.preview_name:
                    preview = TMP / self.preview_name
                    shutil.copy(EXT / "assets/extension-icon.png", preview)
                    subprocess.run(["open", "-a", "Preview", str(preview)], check=True)
                elif name == "Safari":
                    tabs = self.safari_tabs
                    self.safari_window = osa(
                        'tell application "Safari"\n'
                        f'  make new document with properties {{URL:"{tabs[0]}"}}\n'
                        "  set w to front window\n"
                        + "".join(f'  tell w to make new tab at end of tabs with properties {{URL:"{u}"}}\n' for u in tabs[1:])
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


def replace_query(text: str) -> None:
    """Replaces the search field's text. The field is focused when a view command opens."""
    keys('keystroke "a" using command down')
    time.sleep(0.15)
    keys(f'keystroke "{text}"')


def capture_search(out: Path) -> None:
    """Search with an empty query: whatever is already open. Don't launch apps or type."""
    close_raycast()
    deeplink("tabs")
    time.sleep(4)  # the list first shows its cached copy, then refreshes
    if raycast_window() is None:
        raise RuntimeError("Search did not open")
    capture(out / "hopper-1.png")
    close_raycast()


def screenshots() -> None:
    """Five Store frames, in carousel order. See the store-screenshots skill.

    Search is the machine as it is, with an empty query. Recently Closed uses one staged
    public page. History uses built-in apps. Agents is whatever is actually running:
    review that frame before keeping it.
    """
    out = EXT / "metadata"
    out.mkdir(exist_ok=True)
    capture_search(out)
    # The macOS page is opened so Search can record it, then closed so it lands in Recently Closed.
    open_tabs = [
        "https://www.raycast.com/store",
        "https://github.com/raycast/extensions",
        "https://developers.raycast.com/",
        "https://www.apple.com/os/macos/",
    ]
    with DemoApps(safari_tabs=open_tabs, include_ghostty=False, note_name="Raycast.txt", preview_name="Raycast.png") as demo:
        deeplink("tabs")
        time.sleep(4.5)  # record the open list, including the page we are about to close
        close_raycast()
        osa(
            'tell application "Safari"\n'
            f"  set w to window id {demo.safari_window}\n"
            '  close (every tab of w whose URL contains "apple.com/os/macos")\n'
            "end tell"
        )
        time.sleep(0.6)

        # 4. Recently Closed: Search, query matches only the tab we just closed.
        deeplink("tabs")
        time.sleep(4)
        replace_query("macos")
        time.sleep(1.4)
        capture(out / "hopper-4.png")
        close_raycast()

        # 2. Agents. Live sessions; review for personal titles before this ships.
        deeplink("agents")
        time.sleep(4)
        capture(out / "hopper-2.png")
        close_raycast()

        # 3. History: built-in apps, most recent first.
        deeplink("history")
        time.sleep(2)
        capture(out / "hopper-3.png")
        close_raycast()

    # 5. Root search for "hopper": every command, the second row selected to show its hotkey (Raycast ranks by use).
    # Raycast ignores a synthetic ⌘Space, but Escape from a command's view pops to root search. Matching files from
    # the user's disk show below the commands; review them before committing.
    deeplink("history")
    time.sleep(1.5)
    escape()
    time.sleep(0.6)
    if raycast_window() is None:
        raise RuntimeError("root search did not open")
    keys('keystroke "hopper"')
    time.sleep(1.5)
    keys("key code 125")  # Raycast shows the hotkey of the selected row only
    time.sleep(0.6)
    capture(out / "hopper-5.png")
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
    video = TMP / "demo.mov"
    back, fwd, hist, tog, tabs, agents = (HOTKEYS[c] for c in ("back", "forward", "history", "toggle", "tabs", "agents"))
    # Queries are typed one character at a time, and never shown as keycaps: they are not Hopper commands.
    # Copy is performed without a ⌘C label for the same reason.
    tab_query, tab_target = "macos", "Safari"
    agent_query, agent_target = "obsidian", "Claude"
    copy_text = "Hopper"
    card = {"card": "Hopper", "sub": "Built for context switchers"}
    gif_apps = [
        ("Notion", ["open", "-a", "Notion"], True),
        ("Safari", None, True),
        ("TextEdit", None, True),
    ]
    gif_tabs = [
        "https://www.apple.com/os/macos/",
        "https://www.google.com/",
        "https://www.raycast.com/store",
    ]
    staged = [n for n, _, st in gif_apps if st]
    ww, wh = int(w * 0.6), int(h * 0.6)
    frames = {
        name: (x + int(w * (0.06 + 0.14 * i)), y + int(h * (0.05 + 0.15 * i)), ww, wh) for i, name in enumerate(staged)
    }
    # Claude is placed into this rect before the jump, so it is already the right size when it comes forward.
    claude_frame = (x + 48, y + 36, w - 96, h - 140)
    # (overlay message, action, seconds to hold). "…|App" checks the jump landed on App.
    timeline = [
        (card, None, 2.0),
        ({}, None, 0.25),
        ({"keys": tabs, "title": "Search", "detail": "everything open, one list"}, "tabs", 0.9),
        ({"keys": tabs, "title": "Search", "detail": "everything open, one list"}, f"type:{tab_query}", 0.65),
        ({"keys": ["↩"], "title": "Jump to Tab", "detail": "the macOS page in Safari"}, f"key code 36|{tab_target}", 1.5),
        ({"keys": agents, "title": "Agents", "detail": "every agent, wherever it runs"}, "agents", 0.9),
        ({"keys": agents, "title": "Agents", "detail": "every agent, wherever it runs"}, f"type:{agent_query}", 0.6),
        ({}, "place:Claude", 0.15),
        ({"keys": ["↩"], "title": "Jump to Agent", "detail": "and land in that app"}, f"key code 36|{agent_target}", 1.7),
        ({}, "close", 0.2),
        ({}, "restage", 0.4),
        ({"keys": hist, "title": "History", "detail": "the apps you actually use"}, "history", 1.7),
        ({}, "close", 0.2),
        ({"keys": back, "title": "Back", "detail": "to the previous app"}, "back", 1.2),
        ({"keys": back, "title": "Back", "detail": "back to Notion"}, "back", 1.3),
        ({"keys": fwd, "title": "Forward", "detail": "retrace that step"}, "forward", 1.1),
        ({}, "copy-note", 0.7),
        ({"keys": tog, "title": "Toggle", "detail": "over to the browser"}, "toggle", 1.0),
        ({}, "paste-google", 1.5),
        ({}, None, 0.25),
        ({"card": "Hopper", "sub": "Free on the Raycast Store"}, None, 2.0),
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

    staged_names = set(frames)
    parked: list[str] = []

    def bring_staged() -> None:
        for name in frames:
            subprocess.run(["open", "-a", name], check=True)
            time.sleep(0.35)

    def place(process: str, rect: tuple[int, int, int, int]) -> None:
        """Size and position a window before that app is activated. Leaves fullscreen first."""
        fx, fy, fw, fh = (int(v) for v in rect)
        result = subprocess.run(
            [
                "osascript",
                "-e",
                f'tell application "System Events" to tell process "{process}"\n'
                "  if (count of windows) < 1 then error \"no window\"\n"
                "  try\n"
                '    set value of attribute "AXMinimized" of window 1 to false\n'
                "  end try\n"
                "  try\n"
                '    set value of attribute "AXFullScreen" of window 1 to false\n'
                "  end try\n"
                "end tell\n"
                "delay 0.3\n"
                f'tell application "System Events" to tell process "{process}"\n'
                "  set n to count of windows\n"
                "  repeat with i from n to 2 by -1\n"
                "    try\n"
                '      set value of attribute "AXMinimized" of window i to true\n'
                "    end try\n"
                "  end repeat\n"
                f"  set size of window 1 to {{{fw}, {fh}}}\n"
                f"  set position of window 1 to {{{fx}, {fy}}}\n"
                f"  set size of window 1 to {{{fw}, {fh}}}\n"
                "end tell",
            ],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            print(f"warning: could not place {process}: {result.stderr.strip()}", file=sys.stderr)
            return
        got = osa(
            f'tell application "System Events" to tell process "{process}" '
            "to get {position of window 1, size of window 1}"
        )
        print(f"placed {process} -> {got}", file=sys.stderr)

    def reframe() -> None:
        for name, rect in frames.items():
            place(PROCESS.get(name, name), rect)

    def hide_other_apps() -> None:
        """Minimize every other app's windows so they can't cover the backdrop. Restored at the end."""
        # Claude stays unminimized: it was already sized, and minimizing would restore the old size on the jump.
        keep = staged_names | {"Raycast", "swift", "keycast", "Claude"}
        try:
            raw = osa('tell application "System Events" to get name of every process whose background only is false')
        except subprocess.CalledProcessError:
            return
        for name in (n.strip() for n in raw.split(",")):
            if not name or name in keep or name in parked:
                continue
            parked.append(name)
            subprocess.run(
                [
                    "osascript",
                    "-e",
                    f'tell application "System Events" to tell process "{name}"\n'
                    "  repeat with w in windows\n"
                    "    try\n"
                    '      set value of attribute "AXMinimized" of w to true\n'
                    "    end try\n"
                    "  end repeat\n"
                    "end tell",
                ],
                capture_output=True,
            )

    def clear_stage() -> None:
        hide_other_apps()
        reframe()

    def restage() -> None:
        """Hide whatever the agent jump raised, then put the staged apps back on top, newest last."""
        current = frontmost()
        if current not in staged_names and current != "Raycast":
            parked.append(current)
            subprocess.run(
                [
                    "osascript",
                    "-e",
                    f'tell application "System Events" to tell process "{current}"\n'
                    "  repeat with w in windows\n"
                    '    set value of attribute "AXMinimized" of w to true\n'
                    "  end repeat\n"
                    "end tell",
                ],
                capture_output=True,
            )
        # Size the cast in place. open -a would bring Notion forward at its old size first.
        reframe()

    def copy_note() -> None:
        """Make the note and Safari the last two apps, then copy the note's line."""
        subprocess.run(["open", "-a", "Safari"], check=True)
        time.sleep(0.25)
        subprocess.run(["open", "-a", "TextEdit"], check=True)
        time.sleep(0.35)
        osa(f'tell application "TextEdit" to set text of front document to "{copy_text}"')
        keys('keystroke "a" using command down')
        time.sleep(0.15)
        keys('keystroke "c" using command down')

    def paste_google() -> None:
        """Paste the copied line into Safari's address bar and search. Default search is Google."""
        keys('keystroke "l" using command down')
        time.sleep(0.3)
        keys('keystroke "v" using command down')
        time.sleep(0.55)
        keys("key code 36")

    def restore_parked() -> None:
        for name in parked:
            subprocess.run(
                [
                    "osascript",
                    "-e",
                    f'tell application "System Events" to tell process "{name}"\n'
                    "  repeat with w in windows\n"
                    '    set value of attribute "AXMinimized" of w to false\n'
                    "  end repeat\n"
                    "end tell",
                ],
                capture_output=True,
            )

    with DemoApps(
        frames,
        before_staged=backdrop,
        safari_tabs=gif_tabs,
        include_ghostty=False,
        apps=gif_apps,
        note_text=copy_text + "\n",
    ):
        try:
            # Warm the lists: each shows its cached copy first, which would otherwise be from the owner's own use.
            for command in ("tabs", "agents"):
                deeplink(command)
                time.sleep(3)
                close_raycast()
            bring_staged()
            clear_stage()
            # Size Claude while it is still covered, then put the backdrop back over it.
            place("Claude", claude_frame)
            overlay({"backdrop": True})
            time.sleep(0.3)
            reframe()
            # Park the pointer outside the recording area (screencapture -v records it).
            subprocess.run(["swift", "-e", "import CoreGraphics; CGWarpMouseCursorPosition(CGPoint(x: 2, y: 2000))"])
            overlay(card)
            time.sleep(1)  # the card is up before recording starts
            duration = sum(hold for *_, hold in timeline) + 16
            rec = subprocess.Popen(
                ["screencapture", "-x", "-v", "-V", str(int(duration) + 1), "-R", f"{x},{y},{w},{h}", str(video)]
            )
            time.sleep(1)  # screencapture startup; trimmed off below
            misses: list[str] = []
            for message, action, hold in timeline:
                overlay(message)
                expect = None
                if action and "|" in action:
                    action, expect = action.split("|", 1)
                if action == "restage":
                    restage()
                elif action == "close":
                    close_raycast()
                elif action and action.startswith("place:"):
                    who = action.removeprefix("place:")
                    place(who, claude_frame if who == "Claude" else frames[who])
                elif action and action.startswith("type:"):
                    for ch in action.removeprefix("type:"):
                        keys(f'keystroke "{ch}"')
                        time.sleep(0.18)
                elif action == "copy-note":
                    copy_note()
                elif action == "paste-google":
                    paste_google()
                elif action and action.startswith("paste:"):
                    keys('keystroke "a" using command down')
                    time.sleep(0.1)
                    paste(action.removeprefix("paste:"))
                elif action and action.startswith(("key code", "keystroke")):
                    keys(action)
                elif action:
                    deeplink(action)
                time.sleep(hold)
                if expect and frontmost() != expect:
                    misses.append(f"{expect} (landed on {frontmost()})")
                no_view = action in ("back", "forward", "toggle")
                if no_view and raycast_open():
                    # No-view commands only flash Raycast. Still open after the hold means the
                    # "Request to run" prompt. Always Run Command has to be chosen once.
                    time.sleep(0.8)
                    if raycast_open():
                        rec.kill()
                        keycast.kill()
                        sys.exit(f"Raycast asked before running '{action}': choose Always Run Command, then rerun.")
            rec.wait()
        finally:
            restore_parked()
            if keycast.poll() is None:
                keycast.stdin.close()
                keycast.wait()
        for miss in misses:
            print(f"warning: jump missed {miss}: don't use this GIF", file=sys.stderr)

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
