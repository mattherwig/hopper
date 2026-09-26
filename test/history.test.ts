import { test } from "node:test";
import assert from "node:assert/strict";
import { excludeApps, parseExcludedApps } from "../src/lib/history.ts";

const app = (bundleId: string, name: string) => ({ bundleId, name });
const finder = app("com.apple.finder", "Finder");
const safari = app("com.apple.Safari", "Safari");
const notes = app("com.apple.Notes", "Notes");

test("parses names and bundle IDs, commas or new lines, ignoring case, spaces and .app", () => {
  assert.deepEqual(
    [...parseExcludedApps(" Finder.app, com.apple.Safari\n\nNotes ,")],
    ["finder", "com.apple.safari", "notes"],
  );
  assert.equal(parseExcludedApps(undefined).size, 0);
  assert.equal(parseExcludedApps("").size, 0);
});

test("excludes apps by name or bundle ID", () => {
  assert.deepEqual(excludeApps([notes, finder, safari], parseExcludedApps("finder, COM.APPLE.SAFARI")), [notes]);
});

test("always keeps the frontmost app, so Back from an excluded app works", () => {
  assert.deepEqual(excludeApps([finder, safari, notes], parseExcludedApps("Finder")), [finder, safari, notes]);
  assert.deepEqual(excludeApps([safari, finder, notes], parseExcludedApps("Finder")), [safari, notes]);
});
