#!/usr/bin/env python3
"""End-to-end smoke test for Jumper: drives the real extension in Raycast and checks which app ends up frontmost.

  python3 scripts/smoke.py          # against the running dev build (`cd extension && npm run dev`)
  python3 scripts/smoke.py --dist   # builds `ray build -e dist` into Raycast first, then restores dev mode

Commands run by deeplink (Raycast ignores synthetic hotkeys). Expected results come from a small model of the rules
in extension/src/lib/navigation.ts and history.ts, fed with the app order this script sets up itself. Takes over the
screen for ~2 minutes. See .claude/skills/smoke-test/SKILL.md.
"""

import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "media"))
import store_media as sm  # noqa: E402  (shared helpers: demo apps, deeplinks, safe Escape)

EXT = sm.ROOT / "extension"
STEP = 1.3  # seconds for a command to switch apps


class Model:
    """What Jumper should do, per navigation.ts / history.ts. Apps are process names, most recent first."""

    def __init__(self, mru: list[str]):
        self.mru = mru
        self.state: tuple[list[str], int] | None = None
        self.removed: set[str] = set()
        self.excluded: set[str] = set()

    def activate(self, app: str) -> None:
        self.mru.remove(app)
        self.mru.insert(0, app)
        self.removed.discard(app)  # a removed app comes back once it's frontmost

    def quit(self, app: str) -> None:
        self.mru.remove(app)

    def history(self) -> list[str]:
        """The list Back/Forward/History work on: removed and excluded apps hidden, except the frontmost."""
        return [a for i, a in enumerate(self.mru) if i == 0 or (a not in self.removed and a not in self.excluded)]

    def nav(self, direction: str) -> str:
        """Returns the app that should be frontmost after `direction`, updating state like runNavigation()."""
        apps = self.history()
        current = apps[0]
        prev = self.state
        continuing = direction != "toggle" and prev is not None and prev[0][prev[1]] == current
        snapshot, cursor = prev if continuing and prev else (apps, 0)
        step = -1 if direction == "forward" else 1
        i = cursor + step
        while 0 <= i < len(snapshot) and snapshot[i] not in apps:
            i += step
        if not 0 <= i < len(snapshot):
            return current  # "No earlier/later app": nothing switches, state unchanged
        self.state = (snapshot, i)
        self.activate(snapshot[i])
        return snapshot[i]


class Smoke:
    def __init__(self, demo: sm.DemoApps, order: list[str]):
        self.demo = demo
        self.m = Model(order)
        self.results: list[tuple[str, str, str, bool]] = []
        self.prompt_checked: set[str] = set()

    def check(self, step: str, expected: str) -> None:
        got = sm.frontmost()
        self.results.append((step, expected, got, got == expected))
        mark = "✓" if got == expected else "✗"
        print(f"  {mark} {step:<44} expected {expected:<12} got {got}")

    def run(self, command: str, label: str | None = None) -> None:
        expected = self.m.nav(command)
        sm.deeplink(command)
        time.sleep(STEP)
        if command not in self.prompt_checked:
            self.prompt_checked.add(command)
            if sm.raycast_window() is not None:
                time.sleep(1)
                if sm.raycast_window() is not None:
                    sys.exit(f"Raycast asked before running '{command}': the owner must choose Always Run Command.")
        self.check(label or command.capitalize(), expected)

    def manual(self, app: str) -> None:
        """Switch app the way a user would (not through Jumper)."""
        name = next(n for n, *_ in sm.DEMO_APPS if sm.PROCESS.get(n, n) == app)
        if name == "Ghostty":
            sm.osa('tell application "Ghostty" to activate')
        else:
            subprocess.run(["open", "-a", name], check=True)
        time.sleep(STEP)
        self.m.activate(app)
        self.check(f"Manual switch to {app}", app)

    def history_action(self, app: str, keystroke: str) -> None:
        """Opens History, filters to `app`, and sends `keystroke` (System Events syntax)."""
        sm.deeplink("history")
        time.sleep(1.8)
        name = next(n for n, *_ in sm.DEMO_APPS if sm.PROCESS.get(n, n) == app)
        sm.keys(f'keystroke "{name}"')
        time.sleep(0.8)
        sm.keys(keystroke)
        time.sleep(1.5)
        sm.close_raycast()
        time.sleep(0.5)

    def pick_in_history(self, index: int) -> None:
        expected = self.m.history()[index]
        sm.deeplink("history")
        time.sleep(1.8)
        for _ in range(index):
            sm.keys("key code 125")
            time.sleep(0.3)
        sm.keys("key code 36")
        time.sleep(STEP)
        self.m.activate(expected)  # History doesn't touch nav state; the next Back starts fresh
        self.check(f"History ↓×{index} ↩", expected)


def scenarios(s: Smoke) -> None:
    print("Back / Forward walk")
    s.run("back"), s.run("back"), s.run("back")
    s.run("forward"), s.run("forward"), s.run("forward")
    s.run("forward", "Forward at newest (no-op)")

    # No "Back at oldest" check: past the demo apps lie the owner's own apps, which this script doesn't control.
    # navigation.test.ts covers it.

    print("Toggle")
    s.run("toggle"), s.run("toggle")
    s.run("back", "Back after Toggle keeps walking")
    s.run("forward")

    print("Manual switch mid-walk starts fresh history")
    s.run("back")
    s.manual(s.m.mru[3])
    s.run("forward", "Forward after manual switch (no-op)")
    s.run("back", "Back after manual switch")
    s.run("forward")

    print("Quit an app mid-walk")
    quittable = [a for a in s.m.history()[1:] if a in {sm.PROCESS.get(n, n) for n in s.demo.launched}]
    if len(quittable) >= 1:
        victim = quittable[0]
        depth = s.m.history().index(victim) + 1
        for _ in range(depth):
            s.run("back", "Back (past the app to quit)")
        name = next(n for n, *_ in sm.DEMO_APPS if sm.PROCESS.get(n, n) == victim)
        sm.osa(f'tell application "{name}" to quit')
        time.sleep(1.5)
        s.m.quit(victim)
        s.demo.launched.remove(name)
        s.run("forward", f"Forward skips quit {victim}")
        while s.m.state and s.m.state[1] > 0:
            s.run("forward", "Forward (return)")
    else:
        print("  - skipped: no app launched by this script to quit")

    print("History")
    s.pick_in_history(2)
    s.pick_in_history(1)

    print("Remove from History")
    target = s.m.history()[1]
    s.history_action(target, 'keystroke "x" using control down')
    s.m.removed.add(target)
    s.run("back", f"Back skips removed {target}")
    s.run("forward")
    s.manual(target)  # using it again brings it back
    s.run("back", f"{target} is back in history")
    s.run("forward")

    print("Exclude / Include")
    target = s.m.history()[1]
    try:
        s.history_action(target, 'keystroke "x" using {control down, shift down}')
        s.m.excluded.add(target)
        s.run("back", f"Back skips excluded {target}")
        s.run("forward")
    finally:
        s.history_action(target, "key code 36")  # Return on the Excluded row = Include in History
        s.m.excluded.discard(target)
    s.run("back", f"{target} included again")
    s.run("forward")


def build_dist() -> None:
    subprocess.run(["pkill", "-f", "ray develop"])
    time.sleep(1)
    subprocess.run(
        f'source ~/.nvm/nvm.sh >/dev/null && nvm use >/dev/null && npx ray build -e dist',
        shell=True, cwd=EXT, check=True, executable="/bin/zsh",
    )


def restart_dev() -> None:
    log = Path(tempfile.gettempdir()) / "jumper-dev.log"
    subprocess.Popen(
        'source ~/.nvm/nvm.sh >/dev/null && nvm use >/dev/null && npm run dev',
        shell=True, cwd=EXT, executable="/bin/zsh", start_new_session=True,
        stdout=open(log, "w"), stderr=subprocess.STDOUT,
    )
    print(f"dev mode restarted (log: {log})")


def main() -> None:
    dist = "--dist" in sys.argv
    if dist:
        build_dist()
    elif subprocess.run(["pgrep", "-f", "ray develop"], capture_output=True).returncode != 0:
        sys.exit("No `ray develop` running: start `cd extension && npm run dev`, or pass --dist.")
    sm.close_raycast()
    s: Smoke | None = None
    try:
        with sm.DemoApps() as demo:
            order = [sm.PROCESS.get(n, n) for n, *_ in reversed(sm.DEMO_APPS) if sm.running(n)]
            s = Smoke(demo, order)
            print(f"Build: {'dist' if dist else 'dev'}. Starting order: {', '.join(order[:6])}, …")
            scenarios(s)
    finally:
        if dist:
            restart_dev()
    if s is None:
        sys.exit(1)
    failed = [r for r in s.results if not r[3]]
    print(f"\n{len(s.results) - len(failed)}/{len(s.results)} checks passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
