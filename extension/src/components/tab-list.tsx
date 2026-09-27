import { Action, ActionPanel, Icon, Keyboard, List, open } from "@raycast/api";
import { getFavicon, useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import { activateApp, getRecentApps } from "../lib/platform/macos";
import { macosTabPlatform } from "../lib/platform/tabs";
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
  return { ...(await loadTabs(apps, macosTabPlatform)), current: recent[0] };
}

/** Tabs, windows, and sessions of every running app (or only the current one), grouped by app. */
export function TabList({ scope }: { scope: Scope }) {
  // Cached: the last list shows instantly while fresh data loads. A stale entry is safe to pick: selection
  // looks the tab up again and reports it if it's gone.
  const { data, isLoading } = useCachedPromise(load, [scope], { keepPreviousData: true });
  const { tabs = [], failures = [], accessibility = true, current } = data ?? {};
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
        { text: shortDetail(tab), tooltip: tab.detailFull },
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

/** Host for URLs, otherwise the source's detail (working directory, status...). */
function shortDetail(tab: Tab): string {
  if (!tab.url) return tab.detail ?? "";
  try {
    return new URL(tab.url).hostname;
  } catch {
    return tab.url;
  }
}
