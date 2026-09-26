import { getPreferenceValues, LocalStorage } from "@raycast/api";
import { applyRemovals, excludeApps, parseExcludedApps, removeApp, type Removals } from "./history";
import { getRecentApps, type RunningApp } from "./macos";

const REMOVALS_KEY = "removed-apps";

async function readRemovals(): Promise<Removals> {
  const raw = await LocalStorage.getItem<string>(REMOVALS_KEY);
  return raw ? (JSON.parse(raw) as Removals) : {};
}

async function writeRemovals(removals: Removals): Promise<void> {
  await LocalStorage.setItem(REMOVALS_KEY, JSON.stringify(removals));
}

/** Running apps, most recent first, without apps removed from history or listed in the Excluded Apps preference. */
export async function loadHistory(): Promise<RunningApp[]> {
  const { excludedApps } = getPreferenceValues<Preferences>();
  const [recent, removals] = await Promise.all([getRecentApps(), readRemovals()]);
  const result = applyRemovals(recent, removals);
  if (Object.keys(result.removals).length !== Object.keys(removals).length) await writeRemovals(result.removals);
  return excludeApps(result.apps, parseExcludedApps(excludedApps));
}

/** Hides `app` from history until it's used again. `history` is the list as shown, most recent first. */
export async function removeFromHistory(history: RunningApp[], app: RunningApp): Promise<void> {
  await writeRemovals(removeApp(history, app.bundleId, await readRemovals()));
}
