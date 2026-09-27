// Glue: the agent level on macOS, shared by the Agents list, Next Agent, and the status shown in Search.

import { loadAgents, type AgentLoadResult } from "../agents/load";
import { loadTabs } from "../tabs/load";
import { sourceFor } from "../tabs/registry";
import type { Tab } from "../tabs/model";
import { getRecentApps } from "./macos";
import type { App } from "./model";
import { macosPlatform } from "./os";

/** Apps whose tabs can hold web agents. */
const BROWSER_SOURCES = new Set(["chromium", "safari"]);

/**
 * All agents. `withWebAgents` also reads browser tabs for web agents (the Agents list; Next Agent skips them:
 * their status is never known). `tabs`: tabs already read (Search), reused to locate terminal agents.
 */
export async function loadAllAgents(
  options: { withWebAgents?: boolean; tabs?: Tab[] } = {},
): Promise<AgentLoadResult & { apps: App[] }> {
  const apps = await getRecentApps();
  const readTabs = async (hosts: App[]) => options.tabs ?? (await loadTabs(hosts, macosPlatform)).tabs;
  const browsers = apps.filter((a) => BROWSER_SOURCES.has(sourceFor(a).id));
  const result = await loadAgents(apps, macosPlatform, {
    loadTabs: readTabs,
    tabs: options.withWebAgents && browsers.length > 0 ? readTabs(browsers) : undefined,
    now: Date.now(),
  });
  return { ...result, apps };
}
