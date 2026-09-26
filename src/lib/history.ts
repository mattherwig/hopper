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
