// PURE: Bookmarks. Pages, notes, and files saved from Search (a tab or a Recently Closed entry) to come back to.
// Picking one jumps to a tab already showing it, in any app, and only opens it (in the app it was saved from) when
// none is. What can be bookmarked is what can be reopened: a source's reopenTarget (a web page, a file, a Notion
// or Obsidian link), so private windows never get here either (ADR-018).

import type { ClosedTab } from "./history";
import { reopenable } from "./history";
import { selectTab } from "./load";
import type { App, Platform, ReopenTarget, Tab } from "./model";
import { TabGoneError } from "./model";
import { sourceById } from "./registry";

/** Same shape as a Recently Closed entry: `id` is `<bundleId> <target>`, `app` the app it was saved from. */
export type Bookmark = Omit<ClosedTab, "closedAt"> & { addedAt: number };

const KEY = "tabs:bookmarks";

/** Newest first. */
export function loadBookmarks(platform: Platform): Promise<Bookmark[]> {
  return platform.loadJson<Bookmark[]>(KEY, []);
}

/** What bookmarking `tab` would save, or undefined if its source can't open it again. */
export function bookmarkFor(tab: Tab): Omit<Bookmark, "addedAt"> | undefined {
  return reopenable([tab])[0];
}

/** `bookmarks` with `entry` on top; bookmarking the same thing again moves it there with its new title. */
export function withBookmark(bookmarks: Bookmark[], entry: Omit<Bookmark, "addedAt">, now: number): Bookmark[] {
  const { id, app, kind, title, detail, url, reopen } = entry;
  return [{ id, app, kind, title, detail, url, reopen, addedAt: now }, ...withoutBookmark(bookmarks, id)];
}

export function withoutBookmark(bookmarks: Bookmark[], id: string): Bookmark[] {
  return bookmarks.filter((b) => b.id !== id);
}

/** Adds `entry` (`on`) or removes it, and returns the bookmarks after. */
export async function setBookmark(
  platform: Platform,
  entry: Omit<Bookmark, "addedAt">,
  on: boolean,
  now: number,
): Promise<Bookmark[]> {
  const bookmarks = await loadBookmarks(platform);
  const next = on ? withBookmark(bookmarks, entry, now) : withoutBookmark(bookmarks, entry.id);
  await platform.saveJson(KEY, next);
  return next;
}

/**
 * The listed tab showing `bookmark`: one in the app it was saved from first, then the active tab of any other app
 * (a page saved in Chrome and open in Safari), then any. Pages match ignoring a trailing slash.
 */
export function openTabFor(bookmark: Bookmark, tabs: Tab[]): Tab | undefined {
  const target = comparable(bookmark.reopen);
  const showing = tabs.filter((tab) => {
    const reopen = sourceById(tab.source)?.reopenTarget?.(tab);
    return reopen?.kind === bookmark.reopen.kind && comparable(reopen) === target;
  });
  return showing.find((t) => t.app.bundleId === bookmark.app.bundleId) ?? showing.find((t) => t.active) ?? showing[0];
}

/**
 * Jumps to the tab showing `bookmark` among `tabs` and brings its app forward with `activate`; opens the bookmark
 * in the app it was saved from if no tab shows it, or the tab closed since `tabs` was read.
 */
export async function openBookmark(
  bookmark: Bookmark,
  tabs: Tab[],
  platform: Platform,
  activate: (app: App) => Promise<void>,
): Promise<void> {
  const tab = openTabFor(bookmark, tabs);
  if (tab) {
    try {
      await selectTab(tab, platform);
      await activate(tab.app);
      return;
    } catch (error) {
      if (!(error instanceof TabGoneError)) throw error;
    }
  }
  await platform.openUrl(bookmark.reopen.target, bookmark.app.path);
}

function comparable(reopen: ReopenTarget): string {
  return reopen.kind === "url" ? reopen.target.replace(/\/$/, "") : reopen.target;
}
