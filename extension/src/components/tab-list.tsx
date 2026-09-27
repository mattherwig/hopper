import { Action, ActionPanel, Icon, Keyboard, List, open } from "@raycast/api";
import { getFavicon, useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import { activateApp, getRecentApps } from "../lib/platform/macos";
import { macosTabPlatform } from "../lib/platform/tabs";
import { forgetClosed, recordHistory, reopenClosed, type ClosedTab } from "../lib/tabs/history";
import { loadTabs, selectTab } from "../lib/tabs/load";
import type { App, Tab, TabKind } from "../lib/tabs/model";
import { searchTabs } from "../lib/tabs/search";
import { SwitchAction } from "./switch-action";

export type Scope = "all" | "current";

const AUTOMATION_SETTINGS = "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation";
const ACCESSIBILITY_SETTINGS = "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";

const KIND_ICON: Record<TabKind, Icon> = {
  tab: Icon.AppWindowSidebarLeft,
  window: Icon.AppWindow,
  workspace: Icon.Terminal,
  session: Icon.SpeechBubble,
  conversation: Icon.Message,
};

async function load(scope: Scope) {
  const recent = await getRecentApps();
  // The frontmost app is recent[0]: Raycast itself is filtered out by getRecentApps().
  const apps = scope === "current" ? recent.slice(0, 1) : recent;
  const result = await loadTabs(apps, macosTabPlatform);
  // Only apps this read speaks for can have closed tabs: all of them (running or not) for Tabs, the current app
  // for Tabs in Current App, never an app that failed to read. Without Accessibility some sources see nothing,
  // which must not look like everything closed.
  const failed = new Set(result.failures.map((f) => f.app.bundleId));
  const covered = (bundleId: string) =>
    result.accessibility && !failed.has(bundleId) && (scope === "all" || bundleId === recent[0]?.bundleId);
  const closed = await recordHistory(macosTabPlatform, result.tabs, covered, Date.now());
  return {
    ...result,
    closed: scope === "all" ? closed : closed.filter((c) => c.app.bundleId === recent[0]?.bundleId),
    current: recent[0],
  };
}

/** Tabs, windows, and sessions of every running app (or only the current one), grouped by app. */
export function TabList({ scope }: { scope: Scope }) {
  // Cached: the last list shows instantly while fresh data loads. A stale entry is safe to pick: selection
  // looks the tab up again and reports it if it's gone.
  const { data, isLoading, revalidate } = useCachedPromise(load, [scope], { keepPreviousData: true });
  const { tabs = [], closed = [], failures = [], accessibility = true, current } = data ?? {};
  // Own filtering (ADR-015): typo-tolerant, and ranks an app's own tabs above tabs that mention its name.
  const [query, setQuery] = useState("");

  return (
    <List
      isLoading={isLoading}
      filtering={false}
      onSearchTextChange={setQuery}
      searchBarPlaceholder={
        scope === "current" && current ? `Filter ${current.name} tabs` : "Filter tabs, windows, and sessions"
      }
    >
      {groupByApp(searchTabs(tabs, query)).map(({ app, tabs }) => (
        <List.Section key={app.bundleId} title={app.name} subtitle={String(tabs.length)}>
          {tabs.map((tab) => (
            <TabItem key={tab.key} tab={tab} />
          ))}
        </List.Section>
      ))}
      {closed.length > 0 && (
        <List.Section title="Recently Closed" subtitle={String(closed.length)}>
          {searchTabs(closed, query).map((entry) => (
            <ClosedItem key={entry.id} entry={entry} onForget={revalidate} />
          ))}
        </List.Section>
      )}
      {(failures.length > 0 || !accessibility) && (
        <List.Section title="Unavailable">
          {!accessibility && (
            <List.Item
              icon={Icon.Warning}
              title="Windows and Sessions"
              subtitle="Allow Raycast in Accessibility settings"
              actions={
                <ActionPanel>
                  <Action title="Open Accessibility Settings" onAction={() => open(ACCESSIBILITY_SETTINGS)} />
                </ActionPanel>
              }
            />
          )}
          {failures.map(({ app, message }) => (
            <List.Item
              key={`failed-${app.bundleId}`}
              icon={{ fileIcon: app.path }}
              title={app.name}
              subtitle={message}
              accessories={[{ icon: Icon.Warning }]}
              actions={
                <ActionPanel>
                  <Action title="Open Automation Settings" onAction={() => open(AUTOMATION_SETTINGS)} />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}
    </List>
  );
}

function TabItem({ tab }: { tab: Tab }) {
  return (
    <List.Item
      icon={tab.url ? getFavicon(tab.url, { fallback: Icon.Globe }) : { fileIcon: tab.app.path }}
      title={tab.title}
      accessories={[
        ...(tab.active ? [{ tag: "Active" }] : []),
        { text: shortDetail(tab) },
        { icon: KIND_ICON[tab.kind], tooltip: tab.kind },
      ]}
      actions={
        <ActionPanel>
          <SwitchAction
            title="Jump to Tab"
            failureTitle={`Could not jump to ${tab.title}`}
            onSwitch={async () => {
              await selectTab(tab, macosTabPlatform);
              await activateApp(tab.app);
            }}
          />
          {tab.url && <Action.CopyToClipboard title="Copy URL" content={tab.url} />}
          <Action.CopyToClipboard title="Copy Title" content={tab.title} shortcut={Keyboard.Shortcut.Common.Copy} />
        </ActionPanel>
      }
    />
  );
}

function ClosedItem({ entry, onForget }: { entry: ClosedTab; onForget: () => void }) {
  const forget = async (id?: string) => {
    await forgetClosed(macosTabPlatform, id);
    onForget();
  };
  return (
    <List.Item
      icon={entry.url ? getFavicon(entry.url, { fallback: Icon.Globe }) : { fileIcon: entry.reopen.target }}
      title={entry.title}
      subtitle={entry.app.name}
      accessories={[{ text: closedDetail(entry) }, { date: new Date(entry.closedAt), tooltip: "Closed" }]}
      actions={
        <ActionPanel>
          <SwitchAction
            title="Reopen"
            failureTitle={`Could not reopen ${entry.title}`}
            onSwitch={() => reopenClosed(entry, macosTabPlatform)}
          />
          {entry.url && <Action.CopyToClipboard title="Copy URL" content={entry.url} />}
          <Action
            title="Remove from Recently Closed"
            icon={Icon.XMarkCircle}
            shortcut={Keyboard.Shortcut.Common.Remove}
            onAction={() => forget(entry.id)}
          />
          <Action
            title="Clear Recently Closed"
            icon={Icon.Trash}
            style={Action.Style.Destructive}
            shortcut={Keyboard.Shortcut.Common.RemoveAll}
            onAction={() => forget()}
          />
        </ActionPanel>
      }
    />
  );
}

/** One section per app, in order of each app's first tab (so the best search match's app comes first). */
function groupByApp(tabs: Tab[]): { app: App; tabs: Tab[] }[] {
  const sections = new Map<string, { app: App; tabs: Tab[] }>();
  for (const tab of tabs) {
    const section = sections.get(tab.app.bundleId);
    if (section) section.tabs.push(tab);
    else sections.set(tab.app.bundleId, { app: tab.app, tabs: [tab] });
  }
  return [...sections.values()];
}

/** Host for pages, the containing folder for files. */
function closedDetail(entry: ClosedTab): string {
  if (entry.reopen.kind === "url") return shortDetail(entry);
  return entry.reopen.target.split("/").slice(-2, -1)[0] ?? "";
}

/** Host for URLs, otherwise the source's detail (working directory, status...). */
function shortDetail(tab: Pick<Tab, "url" | "detail">): string {
  if (!tab.url) return tab.detail ?? "";
  try {
    return new URL(tab.url).hostname;
  } catch {
    return tab.url;
  }
}
