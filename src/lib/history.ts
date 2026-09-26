/**
 * Pure filters applied to the running-app list before it's used as history. No Raycast or Node imports so they
 * can be unit-tested with `node --test`.
 */

export interface HistoryApp {
  bundleId: string;
  name: string;
}

/** Parses the Excluded Apps preference: app names or bundle IDs, separated by commas or new lines. */
export function parseExcludedApps(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(/[,\n]/)
      .map((s) =>
        s
          .trim()
          .toLowerCase()
          .replace(/\.app$/, ""),
      )
      .filter(Boolean),
  );
}

/**
 * Drops excluded apps, matched by bundle ID or name (case-insensitive). The frontmost app (`apps[0]`) is always
 * kept: it's where you are, and `navigate()` relies on the first entry being the current app.
 */
export function excludeApps<T extends HistoryApp>(apps: T[], excluded: Set<string>): T[] {
  return apps.filter(
    (app, i) => i === 0 || !(excluded.has(app.bundleId.toLowerCase()) || excluded.has(app.name.toLowerCase())),
  );
}

/** Apps removed from history by bundle ID, each with the bundle IDs that were ahead of it when it was removed. */
export type Removals = Record<string, string[]>;

/** Records `bundleId` as removed. `apps` is the history as shown, most recent first. */
export function removeApp(apps: HistoryApp[], bundleId: string, removals: Removals): Removals {
  const i = apps.findIndex((a) => a.bundleId === bundleId);
  if (i < 0) return removals;
  return { ...removals, [bundleId]: apps.slice(0, i).map((a) => a.bundleId) };
}

/**
 * Hides removed apps and forgets removals that no longer apply. A removed app comes back once you use it again.
 * With no background process, that's read from the MRU order: the app is frontmost, or it moved ahead of an app
 * that was ahead of it when removed. Removals of apps that quit are forgotten too.
 */
export function applyRemovals<T extends HistoryApp>(apps: T[], removals: Removals): { apps: T[]; removals: Removals } {
  const index = new Map(apps.map((a, i) => [a.bundleId, i]));
  const kept: Removals = {};
  for (const [bundleId, ahead] of Object.entries(removals)) {
    const i = index.get(bundleId);
    if (i === undefined || i === 0) continue;
    if (ahead.some((a) => (index.get(a) ?? -1) > i)) continue;
    kept[bundleId] = ahead;
  }
  return { apps: apps.filter((a) => !(a.bundleId in kept)), removals: kept };
}
