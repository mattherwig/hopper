import { test } from "node:test";
import assert from "node:assert/strict";
import { notion } from "../../src/lib/tabs/sources/notion.ts";
import type { AXWindow, SidebarQuery } from "../../src/lib/tabs/model.ts";
import { app, fakePlatform } from "./fake-platform.ts";

const notionApp = app("notion.id", "Notion");
const row = (title: string) => ({ title, text: "", selected: false });
const win = (index: number, title: string): AXWindow => ({ index, title, minimized: false, tabs: [] });

test("Notion: front window's tabs, the selected one named by the window title, then other windows", async () => {
  const platform = fakePlatform({
    sidebarRows: async () => [row("Q/A"), row("Looper"), row("Q/A")],
    windows: async () => [{ bundleId: "notion.id", windows: [win(1, "Looper"), win(2, "Roadmap")] }],
  });
  const tabs = await notion.list(notionApp, platform);
  assert.deepEqual(
    tabs.map((t) => [t.title, t.kind, t.source, t.active]),
    [
      ["Q/A", "tab", "notion", false],
      ["Looper", "tab", "notion", true],
      ["Roadmap", "window", "windows", false],
    ],
  );
});

test("Notion: selecting a tab presses it in the tab bar", async () => {
  let opened: unknown[] = [];
  const platform = fakePlatform({
    sidebarRows: async () => [row("Looper")],
    windows: async () => [{ bundleId: "notion.id", windows: [win(1, "Looper")] }],
    openSidebarRow: async (...args) => {
      opened = args;
      return true;
    },
  });
  const [tab] = await notion.list(notionApp, platform);
  await notion.select(tab, platform);
  assert.equal(opened[0], "notion.id");
  assert.equal((opened[1] as SidebarQuery).container, "Tab Bar");
  assert.equal(opened[2], "Looper");
});

test("Notion: no tab bar found falls back to its windows", async () => {
  const platform = fakePlatform({
    sidebarRows: async () => [],
    windows: async () => [{ bundleId: "notion.id", windows: [win(1, "Looper"), win(2, "Roadmap")] }],
  });
  const tabs = await notion.list(notionApp, platform);
  assert.deepEqual(
    tabs.map((t) => [t.title, t.source, t.active]),
    [
      ["Looper", "windows", true],
      ["Roadmap", "windows", false],
    ],
  );
});
