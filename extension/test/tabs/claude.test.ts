import { test } from "node:test";
import assert from "node:assert/strict";
import { claude, parseSession } from "../../src/lib/tabs/sources/claude.ts";
import { app, fakePlatform } from "./fake-platform.ts";

const claudeApp = app("com.anthropic.claudefordesktop", "Claude");
const row = (title: string, text = "", selected = false) => ({ title, text, selected });
const session = (sessionId: string, title: string, lastFocusedAt: number, extra: object = {}) => ({
  path: `/x/${sessionId}.json`,
  text: JSON.stringify({
    sessionId,
    title,
    cwd: "/Users/me/Projects/jumper",
    lastFocusedAt,
    isArchived: false,
    ...extra,
  }),
});

test("parses session files; skips archived and unreadable ones; untitled falls back to the folder", () => {
  assert.deepEqual(parseSession(session("local_1", "tabs", 5).text), {
    sessionId: "local_1",
    title: "tabs",
    cwd: "/Users/me/Projects/jumper",
    lastFocusedAt: 5,
  });
  assert.equal(parseSession(session("local_2", "old", 1, { isArchived: true }).text), undefined);
  assert.equal(parseSession("{not json"), undefined);
  assert.equal(parseSession("{}"), undefined);
  assert.equal(parseSession(JSON.stringify({ sessionId: "local_3", cwd: "/a/b/proj" }))?.title, "proj");
});

test("Code sessions come from the files, most recently focused first, with the sidebar hidden", async () => {
  let dir = "";
  const platform = fakePlatform({
    readFiles: async (d) => {
      dir = d;
      return [session("local_a", "donate", 1), session("local_b", "tabs", 3), session("local_c", "main", 2)];
    },
    sidebarRows: async () => [],
    labelWithSuffix: async () => "main",
  });
  const tabs = await claude.list(claudeApp, platform);
  assert.equal(dir, "/Users/me/Library/Application Support/Claude/claude-code-sessions");
  assert.deepEqual(
    tabs.map((t) => [t.title, t.detail, t.active]),
    [
      ["tabs", "~/Projects/jumper", false],
      ["main", "~/Projects/jumper", true],
      ["donate", "~/Projects/jumper", false],
    ],
  );
});

test("sidebar rows the files don't have (Chat mode) are added; Code rows aren't repeated", async () => {
  const platform = fakePlatform({
    readFiles: async () => [session("local_a", "tabs", 1)],
    sidebarRows: async () => [row("Idle tabs", "tabs"), row("Idle Trip ideas", "Trip ideas")],
  });
  const tabs = await claude.list(claudeApp, platform);
  assert.deepEqual(
    tabs.map((t) => [t.title, t.ref]),
    [
      ["tabs", { sessionId: "local_a" }],
      ["Trip ideas", { name: "Trip ideas" }],
    ],
  );
});

test("selecting a Code session opens its deep link; a sidebar entry presses its row", async () => {
  const urls: string[] = [];
  const pressed: string[] = [];
  const platform = fakePlatform({
    readFiles: async () => [session("local_a", "tabs", 1)],
    sidebarRows: async () => [row("Idle Trip ideas", "Trip ideas")],
    openUrl: async (url) => {
      urls.push(url);
    },
    openSidebarRow: async (_id, _q, name) => {
      pressed.push(name);
      return true;
    },
  });
  const [code, chat] = await claude.list(claudeApp, platform);
  await claude.select(code, platform);
  await claude.select(chat, platform);
  assert.deepEqual(urls, ["claude://code/continue?session=local_a"]);
  assert.deepEqual(pressed, ["Trip ideas"]);
});

test("no session files and no sidebar: falls back to the app's windows", async () => {
  const platform = fakePlatform({
    sidebarRows: async () => [],
    windows: async () => [
      { bundleId: claudeApp.bundleId, windows: [{ index: 1, title: "Claude", minimized: false, tabs: [] }] },
    ],
  });
  assert.deepEqual(
    (await claude.list(claudeApp, platform)).map((t) => t.source),
    ["windows"],
  );
});
