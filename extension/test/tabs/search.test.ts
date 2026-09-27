import { test } from "node:test";
import assert from "node:assert/strict";
import type { Tab, TabKind } from "../../src/lib/tabs/model.ts";
import { editDistance, matchWord, searchTabs } from "../../src/lib/tabs/search.ts";
import { app } from "./fake-platform.ts";

const chrome = app("com.google.Chrome", "Google Chrome");
const cmux = app("com.cmuxterm.app", "cmux");
const claude = app("com.anthropic.claudefordesktop", "Claude");

let n = 0;
const tab = (a: Tab["app"], title: string, extra: Partial<Tab> = {}): Tab => ({
  key: String(n++),
  app: a,
  source: "test",
  kind: "tab" as TabKind,
  title,
  active: false,
  ref: null,
  ...extra,
});

const titles = (tabs: Tab[]) => tabs.map((t) => `${t.app.name}: ${t.title}`);

test("blank query keeps every tab in order", () => {
  const tabs = [tab(chrome, "GitHub"), tab(cmux, "api")];
  assert.deepEqual(searchTabs(tabs, "  "), tabs);
});

test("an app's own tabs rank above tabs that mention its name", () => {
  const tabs = [
    tab(chrome, "Claude", { url: "https://claude.ai/new" }),
    tab(cmux, "claude"),
    tab(chrome, "GitHub"),
    tab(claude, "Fix login bug", { kind: "session" }),
    tab(claude, "Refactor tabs", { kind: "session" }),
  ];
  assert.deepEqual(titles(searchTabs(tabs, "claude")), [
    "Claude: Fix login bug",
    "Claude: Refactor tabs",
    "Google Chrome: Claude",
    "cmux: claude",
  ]);
});

test("typos still find the tab, app first", () => {
  const tabs = [tab(chrome, "Claude"), tab(chrome, "GitHub"), tab(claude, "Fix login bug")];
  assert.deepEqual(titles(searchTabs(tabs, "caude")), ["Claude: Fix login bug", "Google Chrome: Claude"]);
  assert.deepEqual(titles(searchTabs(tabs, "cluade")), ["Claude: Fix login bug", "Google Chrome: Claude"]);
  assert.deepEqual(titles(searchTabs(tabs, "githbu")), ["Google Chrome: GitHub"]);
});

test("every query word must match some field", () => {
  const tabs = [tab(chrome, "Pull requests", { url: "https://github.com/pulls" }), tab(chrome, "Pull up bar")];
  assert.deepEqual(titles(searchTabs(tabs, "pull github")), ["Google Chrome: Pull requests"]);
  assert.deepEqual(searchTabs(tabs, "pull gitlab"), []);
});

test("better matches first; ties keep recency", () => {
  const tabs = [tab(chrome, "Docs overview"), tab(chrome, "doc"), tab(chrome, "My docs"), tab(chrome, "Docs index")];
  assert.deepEqual(titles(searchTabs(tabs, "doc")), [
    "Google Chrome: doc",
    "Google Chrome: Docs overview",
    "Google Chrome: Docs index",
    "Google Chrome: My docs",
  ]);
});

test("match levels", () => {
  assert.equal(matchWord("claude", "claude"), 100);
  assert.equal(matchWord("cla", "claude"), 90);
  assert.equal(matchWord("code", "claude code"), 80);
  assert.equal(matchWord("hub", "github"), 70);
  assert.equal(matchWord("caude", "claude"), 50);
  assert.equal(matchWord("cluad", "claude"), 50);
  assert.equal(matchWord("gthb", "github"), 40);
  // Short words need an exact substring: no typos, no scattered letters.
  assert.equal(matchWord("cx", "claude"), 0);
  assert.equal(matchWord("xyz", "claude"), 0);
  assert.equal(matchWord("slack", "claude"), 0);
});

test("edit distance counts adjacent swaps as one edit", () => {
  assert.equal(editDistance("caude", "claude"), 1);
  assert.equal(editDistance("cluade", "claude"), 1);
  assert.equal(editDistance("", "abc"), 3);
  assert.equal(editDistance("kitten", "sitting"), 3);
});
