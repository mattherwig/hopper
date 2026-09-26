import { getPreferenceValues } from "@raycast/api";
import { excludeApps, parseExcludedApps } from "./history";
import { getRecentApps, type RunningApp } from "./macos";

/** Running apps, most recent first, with the user's Excluded Apps preference applied. */
export async function loadHistory(): Promise<RunningApp[]> {
  const { excludedApps } = getPreferenceValues<Preferences>();
  return excludeApps(await getRecentApps(), parseExcludedApps(excludedApps));
}
