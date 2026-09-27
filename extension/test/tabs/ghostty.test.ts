import { test } from "node:test";
import assert from "node:assert/strict";
import { FIELD as F, RECORD as R } from "../../src/lib/tabs/applescript.ts";
import { ghostty, parse } from "../../src/lib/tabs/sources/ghostty.ts";
import { app, fakePlatform } from "../fake-platform.ts";

const G = "\u001d";
const ghosttyApp = app("com.mitchellh.ghostty", "Ghostty");

test("Ghostty: one entry per tab; its terminals are panes with their folder (Ghostty has no ttys)", () => {
  const [tab] = parse(
    ghosttyApp,
    `W1${F}T1${F}nvim${F}true${F}/Users/me/p, with comma${F}A=/Users/me/p, with comma${G}B=${G}${R}`,
  );
  assert.deepEqual(
    [tab.title, tab.detail, tab.active, tab.panes],
    ["nvim", "~/p, with comma", true, [{ id: "A", cwd: "/Users/me/p, with comma" }, { id: "B" }]],
  );
});

test("Ghostty: selecting a pane focuses that terminal", async () => {
  const platform = fakePlatform({ runAppleScript: async () => "ok" });
  const [tab] = parse(ghosttyApp, `W1${F}T1${F}t${F}true${F}${F}A=${G}${R}`);
  await ghostty.selectPane!(tab, "A", platform);
  assert.match(platform.scripts[0], /if \(id of term\) is "A" then[\s\S]*focus term/);
});
