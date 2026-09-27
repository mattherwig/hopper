// Notion desktop: the tabs in its tab bar, a web view titled "Tab Bar" whose tabs are buttons named after
// their page (the close, new-tab and navigation buttons only have descriptions). Tabs report no selection;
// the window's title is its selected tab's. Accessibility reaches the tab bar of the front window only, so
// Notion's other windows are listed as windows. notion:// deep links aren't used: they open the page in the
// current tab instead of switching to the tab that shows it.
//
// Each tab's detail is its page's parents (ADR-016): every tab keeps a web view whose URL ends in the page id,
// and Notion's local cache (notion.db) links each page to its parent.

import type { App, AppWindows, Platform, Tab, TabSource } from "../model";
import { fromRows, openSidebarEntry, type SidebarRef, type SidebarSpec } from "./sidebar";
import { fromWindows } from "./windows";

const TAB_BAR: SidebarSpec = {
  id: "notion",
  bundleId: "notion.id",
  kind: "tab",
  container: "Tab Bar",
  rowRole: "AXButton",
  format: "plain",
};

const DB = "Library/Application Support/Notion/notion.db";

/** Longest parent path shown before the farthest parents are replaced with "…". */
const MAX_PATH = 36;
const SEPARATOR = " / ";

/** Tabs of the front window, then Notion's other windows. Tabs with the same page appear once. */
export function fromTabBar(app: App, names: string[], appWindows: AppWindows["windows"]): Tab[] {
  const [front, ...others] = appWindows;
  const rows = [...new Set(names)].map((title) => ({ title, text: "", selected: false }));
  return [
    ...fromRows(app, TAB_BAR, rows, front?.title),
    ...fromWindows(app, others).map((t) => ({ ...t, active: false })),
  ];
}

/** The page id (dashed UUID) at the end of a Notion page URL, e.g. ".../p/Looper-3c1b...3569". */
export function pageId(url: string): string | undefined {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return undefined;
  }
  const hex = /([0-9a-f]{32})$/i.exec(path)?.[1]?.toLowerCase();
  return hex && `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Each page's ancestors in notion.db, nearest first: follows parent_id through blocks and databases
 * (collections) up to the workspace. Titles are joined from their text segments.
 */
export function ancestorsQuery(ids: string[]): string {
  const list = ids.filter((id) => /^[0-9a-f-]{36}$/.test(id)).map((id) => `'${id}'`);
  const title = (json: string) => `(select group_concat(json_extract(value, '$[0]'), '') from json_each(${json}))`;
  return `with recursive p(root, id, tab, depth) as (
  select id, id, 'block', 0 from block where id in (${list.join(", ")})
  union all
  select p.root, coalesce(b.parent_id, c.parent_id), coalesce(b.parent_table, c.parent_table), p.depth + 1
  from p left join block b on p.tab = 'block' and b.id = p.id
  left join collection c on p.tab = 'collection' and c.id = p.id
  where p.depth < 30 and p.tab in ('block', 'collection') and coalesce(b.parent_id, c.parent_id) is not null
)
select p.root, p.depth, p.tab, b.type, coalesce(${title("b.properties, '$.title'")}, ${title("c.name")}) as title
from p left join block b on p.tab = 'block' and b.id = p.id
left join collection c on p.tab = 'collection' and c.id = p.id
where p.depth > 0 order by p.root, p.depth`;
}

/**
 * Page id → titles of its parent pages and databases, nearest first. Other blocks on the way (a page nested
 * in a bulleted list or toggle) and the workspace are skipped, as in Notion's own breadcrumb.
 */
export function parseAncestors(rows: Record<string, unknown>[]): Map<string, string[]> {
  const parents = new Map<string, string[]>();
  for (const row of rows) {
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const isParent = row.tab === "collection" || (row.tab === "block" && row.type === "page");
    if (!title || !isParent || typeof row.root !== "string") continue;
    parents.set(row.root, [...(parents.get(row.root) ?? []), title]);
  }
  return parents;
}

/** "Root / … / Parent" shortened to `max` characters: the nearest parents are kept, farther ones become "…". */
export function shortPath(parents: string[], max = MAX_PATH): string {
  if (parents.length === 0) return "";
  const clip = (s: string) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);
  let shown = [clip(parents[0])];
  for (const parent of parents.slice(1)) {
    const next = [parent, ...shown];
    if (next.join(SEPARATOR).length > max) return ["…", ...shown].join(SEPARATOR);
    shown = next;
  }
  return shown.join(SEPARATOR);
}

/** Tab title → its page's parents (nearest first), for the tabs whose page could be found. */
async function readParents(app: App, platform: Platform): Promise<Map<string, string[]>> {
  const pages = await platform.webPages(app.bundleId);
  const idByTitle = new Map<string, string>();
  for (const page of pages) {
    const id = pageId(page.url);
    if (id && !idByTitle.has(page.title)) idByTitle.set(page.title, id);
  }
  if (idByTitle.size === 0) return new Map();
  const rows = await platform.querySqlite(`${platform.homeDir()}/${DB}`, ancestorsQuery([...idByTitle.values()]));
  const byId = parseAncestors(rows);
  return new Map([...idByTitle].map(([title, id]) => [title, byId.get(id) ?? []]));
}

/** Sets each tab's detail to its page's parents: shortened for display, in full for hover and search. */
export function withParents(tabs: Tab[], parents: Map<string, string[]>): Tab[] {
  return tabs.map((tab) => {
    const path = tab.source === TAB_BAR.id ? parents.get(tab.title) : undefined;
    if (!path?.length) return tab;
    return { ...tab, detail: shortPath(path), detailFull: [...path].reverse().join(SEPARATOR) };
  });
}

export const notion: TabSource<SidebarRef> = {
  id: TAB_BAR.id,
  bundleIds: [TAB_BAR.bundleId],
  list: async (app: App, platform: Platform) => {
    const [rows, all, parents] = await Promise.all([
      platform.sidebarRows(app.bundleId, TAB_BAR),
      platform.windows([app.bundleId]),
      // Parents are extra: no page views, no cache, or a changed schema just means no parents.
      readParents(app, platform).catch(() => new Map<string, string[]>()),
    ]);
    const appWindows = all.find((w) => w.bundleId === app.bundleId)?.windows ?? [];
    // Tab bar not found (hidden, or Notion's UI changed): offer its windows instead.
    if (rows.length === 0) return fromWindows(app, appWindows) as Tab[] as Tab<SidebarRef>[];
    const tabs = fromTabBar(
      app,
      rows.map((r) => r.title),
      appWindows,
    );
    return withParents(tabs, parents) as Tab<SidebarRef>[];
  },
  // Window entries carry source "windows", so their selection is routed there, not here.
  select: (tab, platform) => openSidebarEntry(tab, TAB_BAR, platform),
};
