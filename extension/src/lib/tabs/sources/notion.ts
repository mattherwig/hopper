// Notion desktop: the tabs in its tab bar, a web view titled "Tab Bar" whose tabs are buttons named after
// their page (the close, new-tab and navigation buttons only have descriptions). Tabs report no selection;
// the window's title is its selected tab's. Accessibility reaches the tab bar of the front window only, so
// Notion's other windows are listed as windows. notion:// deep links aren't used: they open the page in the
// current tab instead of switching to the tab that shows it.

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

/** Tabs of the front window, then Notion's other windows. Tabs with the same page appear once. */
export function fromTabBar(app: App, names: string[], appWindows: AppWindows["windows"]): Tab[] {
  const [front, ...others] = appWindows;
  const rows = [...new Set(names)].map((title) => ({ title, text: "", selected: false }));
  return [
    ...fromRows(app, TAB_BAR, rows, front?.title),
    ...fromWindows(app, others).map((t) => ({ ...t, active: false })),
  ];
}

export const notion: TabSource<SidebarRef> = {
  id: TAB_BAR.id,
  bundleIds: [TAB_BAR.bundleId],
  list: async (app: App, platform: Platform) => {
    const [rows, all] = await Promise.all([
      platform.sidebarRows(app.bundleId, TAB_BAR),
      platform.windows([app.bundleId]),
    ]);
    const appWindows = all.find((w) => w.bundleId === app.bundleId)?.windows ?? [];
    // Tab bar not found (hidden, or Notion's UI changed): offer its windows instead.
    if (rows.length === 0) return fromWindows(app, appWindows) as Tab[] as Tab<SidebarRef>[];
    return fromTabBar(
      app,
      rows.map((r) => r.title),
      appWindows,
    ) as Tab<SidebarRef>[];
  },
  // Window entries carry source "windows", so their selection is routed there, not here.
  select: (tab, platform) => openSidebarEntry(tab, TAB_BAR, platform),
};
