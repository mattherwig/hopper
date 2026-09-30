import { test } from "node:test";
import assert from "node:assert/strict";
import { FIELD as F, RECORD as R } from "../../src/lib/tabs/applescript.ts";
import {
  bookmarkFor,
  loadBookmarks,
  openBookmark,
  openTabFor,
  setBookmark,
  type Bookmark,
} from "../../src/lib/tabs/bookmarks.ts";
import type { App, Tab } from "../../src/lib/tabs/model.ts";
import * as chromium from "../../src/lib/tabs/sources/chromium.ts";
import { app, fakePlatform } from "../fake-platform.ts";

const chrome = app("com.google.Chrome", "Google Chrome");
const brave = app("com.brave.Browser", "Brave Browser");
const muse = app("com.meta.endo", "Muse");
const tab = (browser: App, id: string, url: string, active = false): Tab =>
  chromium.parse(browser, `${id}${F}${url}${F}${url}${F}${active}${R}`)[0];
const saved = (t: Tab, addedAt = 1): Bookmark => ({ ...bookmarkFor(t)!, addedAt });

test("bookmarkFor: what the tab's source can open again, else nothing", () => {
  assert.deepEqual(bookmarkFor(tab(chrome, "1", "https://a.com"))?.reopen, { kind: "url", target: "https://a.com" });
  assert.equal(bookmarkFor(tab(chrome, "1", "chrome://settings")), undefined);
  const museChat: Tab = { key: "m", app: muse, source: "muse", kind: "session", title: "x", active: false, ref: {} };
  assert.equal(bookmarkFor(museChat), undefined);
});

test("add puts newest first, re-adding moves it up; remove drops it", async () => {
  const platform = fakePlatform();
  const [a, b] = [bookmarkFor(tab(chrome, "1", "https://a.com"))!, bookmarkFor(tab(chrome, "2", "https://b.com"))!];
  await setBookmark(platform, a, true, 1);
  await setBookmark(platform, b, true, 2);
  assert.deepEqual(
    (await loadBookmarks(platform)).map((x) => x.id),
    [b.id, a.id],
  );
  await setBookmark(platform, { ...a, title: "A again" }, true, 3);
  assert.deepEqual(
    (await loadBookmarks(platform)).map((x) => [x.id, x.title, x.addedAt]),
    [
      [a.id, "A again", 3],
      [b.id, "https://b.com", 2],
    ],
  );
  assert.deepEqual(
    (await setBookmark(platform, a, false, 4)).map((x) => x.id),
    [b.id],
  );
  assert.deepEqual(await loadBookmarks(platform), await setBookmark(platform, a, false, 5));
});

test("openTabFor: the saved app's tab first, then another app's active tab; trailing slash ignored", () => {
  const bookmark = saved(tab(chrome, "1", "https://a.com/x"));
  const inBrave = tab(brave, "7", "https://a.com/x/");
  const activeInBrave = tab(brave, "8", "https://a.com/x", true);
  const inChrome = tab(chrome, "2", "https://a.com/x");
  assert.equal(openTabFor(bookmark, [inBrave, activeInBrave, inChrome]), inChrome);
  assert.equal(openTabFor(bookmark, [inBrave, activeInBrave]), activeInBrave);
  assert.equal(openTabFor(bookmark, [inBrave]), inBrave);
  assert.equal(openTabFor(bookmark, [tab(chrome, "3", "https://a.com/y")]), undefined);
});

test("openBookmark: jumps to the open tab, else opens it in the app it was saved from", async () => {
  const opened: [string, string | undefined][] = [];
  const activated: string[] = [];
  const activate = async (a: App) => void activated.push(a.bundleId);
  const bookmark = saved(tab(chrome, "1", "https://a.com"));
  const openTab = tab(brave, "7", "https://a.com");

  const selects = fakePlatform({ runAppleScript: async () => "ok" });
  await openBookmark(bookmark, [openTab], selects, activate);
  assert.match(selects.scripts[0], /is "7" then/);
  assert.deepEqual(activated, [brave.bundleId]);

  const opens = fakePlatform({ openUrl: async (url, appPath) => void opened.push([url, appPath]) });
  await openBookmark(bookmark, [], opens, activate);
  assert.deepEqual(opened, [["https://a.com", chrome.path]]);

  // The tab closed after the list was read: open it instead.
  const gone = fakePlatform({
    runAppleScript: async () => "",
    openUrl: async (url, appPath) => void opened.push([url, appPath]),
  });
  await openBookmark(bookmark, [openTab], gone, activate);
  assert.equal(opened.length, 2);
  assert.deepEqual(activated, [brave.bundleId]);
});
