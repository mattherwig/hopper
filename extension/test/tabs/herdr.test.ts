import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTabs, selectTab } from "../../src/lib/tabs/load.ts";
import { fromSnapshot, herdr } from "../../src/lib/tabs/sources/herdr.ts";
import { app, fakePlatform } from "../fake-platform.ts";
import { proc } from "../agents/helpers.ts";

const ghostty = { ...app("com.mitchellh.ghostty", "Ghostty"), pid: 50 };
const snapshot = {
  focused_tab_id: "w1:t1",
  workspaces: [
    { workspace_id: "w1", label: "jumper", number: 1 },
    { workspace_id: "w2", label: "", number: 2 },
  ],
  tabs: [
    { tab_id: "w1:t1", workspace_id: "w1", label: "agents" },
    { tab_id: "w2:t1", workspace_id: "w2", label: "1" },
  ],
  panes: [{ pane_id: "w1:p1", tab_id: "w1:t1", foreground_cwd: "/p/jumper" }],
};

test("herdr tabs are listed under the terminal running herdr; unnamed tabs take their workspace's name", () => {
  const tabs = fromSnapshot(ghostty, "/s", snapshot);
  assert.deepEqual(
    tabs.map((t) => [t.key, t.app.name, t.title, t.detail, t.detailFull, t.active]),
    [
      ["herdr:/s:w1:t1", "Ghostty", "agents", "herdr › jumper", "/p/jumper", true],
      ["herdr:/s:w2:t1", "Ghostty", "Workspace 2", "herdr", undefined, false],
    ],
  );
});

test("discovered through the herdr client's terminal; selecting focuses the tab in herdr", async () => {
  const requests: string[] = [];
  const platform = fakePlatform({
    listDir: async (dir) => (dir.endsWith(".config/herdr") ? ["herdr.sock"] : []),
    socketRequest: async (_path, request) => {
      const { method, params } = request as { method: string; params: object };
      requests.push(`${method} ${JSON.stringify(params)}`);
      return method === "session.snapshot" ? { id: "jumper", result: { snapshot } } : { id: "jumper", result: {} };
    },
    // Ghostty (50) → login (51, root) → zsh (52) → herdr client (53); herdr server (54) has no tty.
    processes: async () => [
      proc(51, 50, "ttys001", "login"),
      proc(52, 51, "ttys001", "zsh"),
      proc(53, 52, "ttys001", "herdr"),
      proc(54, 53, "", "herdr"),
    ],
    accessibilityTrusted: async () => true,
    windows: async () => [],
  });
  const { tabs } = await loadTabs([ghostty], platform);
  assert.deepEqual(
    tabs.filter((t) => t.source === "herdr").map((t) => t.title),
    ["agents", "Workspace 2"],
  );
  await selectTab(
    tabs.find((t) => t.title === "Workspace 2")!,
    platform,
  );
  assert.equal(requests.at(-1), 'tab.focus {"tab_id":"w2:t1"}');
});

test("herdr not running or no client in a known terminal: nothing listed", async () => {
  const platform = fakePlatform({
    listDir: async () => ["herdr.sock"],
    socketRequest: async () => {
      throw new Error("ECONNREFUSED");
    },
  });
  assert.deepEqual(await herdr.discover!([ghostty], platform), []);
});

test("a herdr tab in iTerm also selects the iTerm split running herdr", async () => {
  const iterm = { ...app("com.googlecode.iterm2", "iTerm"), pid: 60 };
  const scripts: string[] = [];
  const platform = fakePlatform({
    listDir: async (dir) => (dir.endsWith(".config/herdr") ? ["herdr.sock"] : []),
    socketRequest: async () => ({ id: "jumper", result: { snapshot } }),
    processes: async () => [proc(61, 60, "ttys007", "login"), proc(62, 61, "ttys007", "herdr")],
    runAppleScript: async (script) => {
      scripts.push(script);
      return script.includes("sessions of t\n") || script.includes("repeat with p in sessions")
        ? `1\u001fS-1\u001fzsh\u001ftrue\u001fS-1=/dev/ttys006,S-2=/dev/ttys007,\u001e`
        : "ok";
    },
  });
  const { tabs } = await loadTabs([iterm], platform);
  const place = tabs.find((t) => t.title === "agents")!;
  assert.deepEqual(
    [place.app.name, place.within?.tab.key, place.within?.paneId],
    ["iTerm", "com.googlecode.iterm2:S-1", "S-2"],
  );
  await selectTab(place, platform);
  assert.match(scripts.at(-1)!, /if \(id of s\) is "S-2" then/);
});
