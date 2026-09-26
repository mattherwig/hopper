import { test } from "node:test";
import assert from "node:assert/strict";
import { applyRemovals, excludeApps, removeApp } from "../src/lib/history.ts";

const app = (bundleId: string, name: string) => ({ bundleId, name });
const finder = app("com.apple.finder", "Finder");
const safari = app("com.apple.Safari", "Safari");
const notes = app("com.apple.Notes", "Notes");

test("excludes apps by bundle ID", () => {
  assert.deepEqual(excludeApps([notes, finder, safari], new Set(["com.apple.finder", "com.apple.Safari"])), [notes]);
});

test("always keeps the frontmost app, so Back from an excluded app works", () => {
  const excluded = new Set(["com.apple.finder"]);
  assert.deepEqual(excludeApps([finder, safari, notes], excluded), [finder, safari, notes]);
  assert.deepEqual(excludeApps([safari, finder, notes], excluded), [safari, notes]);
});

test("removed app is hidden while the order is unchanged or others move", () => {
  const removals = removeApp([notes, safari, finder], "com.apple.Safari", {});
  assert.deepEqual(removals, { "com.apple.Safari": ["com.apple.Notes"] });
  assert.deepEqual(applyRemovals([notes, safari, finder], removals), { apps: [notes, finder], removals });
  assert.deepEqual(applyRemovals([finder, notes, safari], removals).apps, [finder, notes]);
});

test("removed app comes back once used again", () => {
  const removals = removeApp([notes, safari, finder], "com.apple.Safari", {});
  // Frontmost.
  assert.deepEqual(applyRemovals([safari, notes, finder], removals), { apps: [safari, notes, finder], removals: {} });
  // Used, then left for Finder: now ahead of Notes, which was ahead of it.
  assert.deepEqual(applyRemovals([finder, safari, notes], removals).removals, {});
});

test("removal is forgotten when the app quits", () => {
  const removals = removeApp([notes, safari], "com.apple.Safari", {});
  assert.deepEqual(applyRemovals([notes], removals), { apps: [notes], removals: {} });
});

test("removing an app not in history is a no-op", () => {
  assert.deepEqual(removeApp([notes], "com.apple.Safari", {}), {});
});
