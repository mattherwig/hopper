#!/usr/bin/env python3
"""End-to-end smoke test for Hopper's herdr support: drives Search and Agents in Raycast and checks what herdr focused.

  python3 scripts/smoke_herdr.py          # against the running dev build (`cd extension && npm run dev`)

Needs herdr running with a client attached in a terminal app (Ghostty, cmux, iTerm...). Unlike smoke.py it opens no
demo apps: it adds a throwaway herdr workspace ("hopper-smoke-ws", with a tab "hopper-smoke-tab"), and closes it,
refocuses the herdr workspace and tab that were focused, and brings the previous app back afterwards. Takes over
the screen for ~20s. See .claude/skills/smoke-test/SKILL.md.

Checks (each starts from a different herdr focus, so the jump has to move it):
  - Search "hopper-smoke-tab"   → herdr focuses that tab; a terminal running herdr is frontmost
  - Search "hopper-smoke-ws"    → herdr focuses that workspace
  - Agents "<agent title>"      → herdr focuses the agent's tab and pane (only if herdr reports an agent)
"""

import json
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "media"))
import store_media as sm  # noqa: E402  (shared helpers: deeplinks, paste, safe Escape)

WORKSPACE = "hopper-smoke-ws"
TAB = "hopper-smoke-tab"
LOAD = 3.0  # seconds for a fresh list (not the cached one)
STEP = 2.0  # seconds for a jump: herdr focus, then the terminal (Ghostty: by title marker)


def herdr(*args: str) -> dict:
    out = subprocess.run(["herdr", *args], capture_output=True, text=True, check=True).stdout
    return json.loads(out) if out.strip().startswith("{") else {}


def snapshot() -> dict:
    data = herdr("api", "snapshot")
    return data.get("result", data).get("snapshot", data)


def ps(pid: int) -> tuple[int, str]:
    out = subprocess.run(["ps", "-o", "ppid=,comm=", "-p", str(pid)], capture_output=True, text=True).stdout.split(None, 1)
    return (int(out[0]), out[1].strip()) if len(out) == 2 else (0, "")


def client_terminals() -> set[str]:
    """Process names of the terminal apps running a herdr client (the ones Hopper may bring forward)."""
    pids = subprocess.run(["pgrep", "-x", "herdr"], capture_output=True, text=True).stdout.split()
    names = set()
    for pid in map(int, pids):
        tty = subprocess.run(["ps", "-o", "tty=", "-p", str(pid)], capture_output=True, text=True).stdout.strip()
        if tty in ("", "??"):
            continue  # the server
        current = pid
        for _ in range(64):
            current, command = ps(current)
            if ".app/Contents/MacOS/" in command:
                names.add(Path(command).name)
                break
            if current <= 1:
                break
    return names


def agent_title(agent: dict, place: str) -> str:
    """The title Hopper lists for a herdr agent: its Claude session's name if Claude Code knows it, else herdr's."""
    session = (agent.get("agent_session") or {}).get("value")
    for f in (Path.home() / ".claude/sessions").glob("*.json"):
        try:
            data = json.loads(f.read_text())
        except (OSError, ValueError):
            continue
        if session and data.get("sessionId") == session:
            return data.get("name") or Path(data.get("cwd", "")).name or "Claude Code"
    return agent.get("name") or agent.get("title") or agent.get("terminal_title_stripped") or place


class Smoke:
    def __init__(self, terminals: set[str]):
        self.terminals = terminals
        self.results: list[bool] = []
        self.prompt_checked: set[str] = set()

    def check(self, step: str, expected: str, got: str) -> None:
        ok = got == expected
        self.results.append(ok)
        print(f"  {'✓' if ok else '✗'} {step:<40} expected {expected:<28} got {got}")

    def jump(self, command: str, query: str) -> None:
        """Opens `command` (tabs = Search, agents = Agents), pastes `query`, and picks the top result."""
        sm.deeplink(command)
        time.sleep(LOAD)
        if command not in self.prompt_checked:
            self.prompt_checked.add(command)
            if sm.raycast_window() is None:
                sys.exit(f"Raycast didn't open '{command}': is it asking to run it? Choose Always Run Command once.")
        sm.paste(query)
        time.sleep(1.2)
        sm.keys("key code 36")
        time.sleep(STEP)
        if sm.raycast_window() is not None:
            sm.close_raycast()

    def frontmost_terminal(self, step: str) -> None:
        front = sm.frontmost()
        expected = front if front in self.terminals else " or ".join(sorted(self.terminals))
        self.check(f"{step}: terminal frontmost", expected, front)


def main() -> None:
    if subprocess.run(["pgrep", "-f", "ray develop"], capture_output=True).returncode != 0:
        sys.exit("No `ray develop` running: start `cd extension && npm run dev`.")
    try:
        before = snapshot()
    except (subprocess.CalledProcessError, FileNotFoundError, ValueError):
        sys.exit("herdr isn't answering: start it (`herdr`) in a terminal app.")
    terminals = client_terminals()
    if not terminals:
        sys.exit("No herdr client attached in a terminal app: run `herdr` in Ghostty, cmux, iTerm or Terminal.")
    home_ws, home_tab = before.get("focused_workspace_id"), before.get("focused_tab_id")
    previous_app = sm.frontmost()
    sm.close_raycast()

    created = herdr("workspace", "create", "--label", WORKSPACE, "--no-focus")["result"]
    ws = created["workspace"]["workspace_id"]
    s = Smoke(terminals)
    print(f"herdr clients in: {', '.join(sorted(terminals))}. Staged workspace {ws}.")
    try:
        tab = herdr("tab", "create", "--workspace", ws, "--label", TAB, "--no-focus")["result"]["tab"]["tab_id"]
        time.sleep(0.5)

        print("Search")
        s.jump("tabs", TAB)
        s.check("herdr tab", tab, snapshot().get("focused_tab_id", ""))
        s.frontmost_terminal("herdr tab")

        herdr("workspace", "focus", home_ws) if home_ws else None
        s.jump("tabs", WORKSPACE)
        s.check("herdr workspace", ws, snapshot().get("focused_workspace_id", ""))

        agents = [a for a in before.get("agents", []) if a.get("pane_id") and a.get("workspace_id") != ws]
        if not agents:
            print("Agents\n  - skipped: herdr reports no agent (start one in a herdr pane, e.g. `claude`)")
        else:
            agent = agents[0]
            workspace = next((w for w in before["workspaces"] if w["workspace_id"] == agent.get("workspace_id")), {})
            title = agent_title(agent, workspace.get("label", ""))
            print(f"Agents ('{title}' in {agent['pane_id']})")
            herdr("tab", "focus", tab)  # away from the agent
            s.jump("agents", title)
            after = snapshot()
            focused = next((p["pane_id"] for p in after.get("panes", []) if p.get("focused") and p.get("tab_id") == after.get("focused_tab_id")), "")
            s.check("herdr agent: tab", agent.get("tab_id", ""), after.get("focused_tab_id", ""))
            s.check("herdr agent: pane", agent["pane_id"], focused)
            s.frontmost_terminal("herdr agent")
    finally:
        herdr("workspace", "close", ws)
        if home_ws:
            herdr("workspace", "focus", home_ws)
        if home_tab:
            herdr("tab", "focus", home_tab)
        sm.osa(f'tell application "System Events" to set frontmost of process "{previous_app}" to true')

    failed = s.results.count(False)
    print(f"\n{len(s.results) - failed}/{len(s.results)} checks passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
