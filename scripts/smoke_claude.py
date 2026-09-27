#!/usr/bin/env python3
"""End-to-end smoke test for Claude Code sessions in the Claude app: jumps to one from Search and one from Agents.

  python3 scripts/smoke_claude.py         # against the running dev build (`cd extension && npm run dev`)

Needs the Claude app running with at least three live Code sessions (the one you're in, plus two to jump to). A jump
counts when Claude comes to the front and the Claude app itself records the session as focused (its session file's
`lastFocusedAt` moves). Search selects the session's tab (Claude tab source); Agents opens its deep link without
reading Claude's tabs (ADR-028). Afterwards the session that was focused before is reopened and the previous app
brought back. Takes over the screen for ~20s. See .claude/skills/smoke-test/SKILL.md.
"""

import json
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent / "media"))
import store_media as sm  # noqa: E402
from smoke_herdr import Smoke  # noqa: E402  (jump: open a command, paste, pick the top result)

DESKTOP = Path.home() / "Library/Application Support/Claude/claude-code-sessions"
REGISTRY = Path.home() / ".claude/sessions"


def read(path: Path) -> dict:
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return {}


def desktop_sessions() -> dict[str, dict]:
    """The Claude app's Code sessions by id (`local_<uuid>`), not archived."""
    sessions = (read(f) for f in DESKTOP.glob("*/*/local_*.json"))
    return {s["sessionId"]: s for s in sessions if s.get("sessionId") and not s.get("isArchived")}


def live_hosts() -> set[str]:
    """Claude app sessions with a running Claude Code process (the ones Agents lists)."""
    hosts = set()
    for f in REGISTRY.glob("*.json"):
        data = read(f)
        pid = data.get("pid")
        if data.get("hostSessionId") and pid and subprocess.run(["kill", "-0", str(pid)], capture_output=True).returncode == 0:
            hosts.add(data["hostSessionId"])
    return hosts


def focused_at(session_id: str) -> int:
    return desktop_sessions().get(session_id, {}).get("lastFocusedAt") or 0


def main() -> None:
    if subprocess.run(["pgrep", "-f", "ray develop"], capture_output=True).returncode != 0:
        sys.exit("No `ray develop` running: start `cd extension && npm run dev`.")
    sessions = desktop_sessions()
    if not sessions:
        sys.exit("No Claude app Code sessions found: is the Claude app installed and used for Code?")
    current = max(sessions.values(), key=lambda s: s.get("lastFocusedAt") or 0)
    titles = [s.get("title") for s in sessions.values()]
    live = live_hosts()
    # Distinctive titles (unique, long) so the search's top result is the session; never the one you're in.
    targets = sorted(
        (s for s in sessions.values()
         if s["sessionId"] in live and s is not current and s.get("title") and titles.count(s["title"]) == 1),
        key=lambda s: -len(s["title"]),
    )[:2]
    if len(targets) < 2:
        sys.exit("Need two live Claude app Code sessions with unique titles, besides the current one.")
    previous_app = sm.frontmost()
    sm.close_raycast()
    s = Smoke({"Claude"})
    try:
        for command, name, session in (("tabs", "Search", targets[0]), ("agents", "Agents", targets[1])):
            print(f"{name} ('{session['title']}')")
            before = focused_at(session["sessionId"])
            s.jump(command, session["title"])
            for _ in range(10):  # Claude writes lastFocusedAt shortly after showing the session
                if focused_at(session["sessionId"]) > before:
                    break
                time.sleep(0.5)
            s.check(f"{name}: Claude frontmost", "Claude", sm.frontmost())
            s.check(f"{name}: session focused", "yes", "yes" if focused_at(session["sessionId"]) > before else "no")
    finally:
        subprocess.run(["open", f"claude://code/continue?session={current['sessionId']}"])
        time.sleep(1)
        sm.osa(f'tell application "System Events" to set frontmost of process "{previous_app}" to true')

    failed = s.results.count(False)
    print(f"\n{len(s.results) - failed}/{len(s.results)} checks passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
