import { open } from "@raycast/api";
import { runAppleScript } from "@raycast/utils";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  accessibilityTrusted,
  appWindows,
  focusWindow,
  labelWithSuffix,
  openSidebar,
  sidebarRows,
} from "swift:../../../swift";
import type { AppWindows, Platform, SidebarRow } from "../tabs/model";

/** An app that stops responding must not hold up the whole list. */
const APPLESCRIPT_TIMEOUT = 4000;

/**
 * The tab level's Platform on macOS: AppleScript through Raycast, Accessibility through the Swift helper
 * (swift/Sources/JumperNative/Windows.swift, Sidebar.swift).
 */
export const macosTabPlatform: Platform = {
  runAppleScript: (script) => runAppleScript(script, { timeout: APPLESCRIPT_TIMEOUT }),
  accessibilityTrusted: () => accessibilityTrusted(),
  windows: async (bundleIds) => (await appWindows(bundleIds)) as AppWindows[],
  raiseWindow: (bundleId, index, title, tab) => focusWindow(bundleId, index, title, tab ?? null),
  sidebarRows: async (bundleId, query) => (await sidebarRows(bundleId, query.container, query.rowRole)) as SidebarRow[],
  openSidebarRow: (bundleId, query, name) =>
    openSidebar(bundleId, query.container, query.rowRole, name, query.namePattern ?? "", query.keyboard ?? false),
  labelWithSuffix: async (bundleId, suffix) => (await labelWithSuffix(bundleId, suffix)) ?? undefined,
  homeDir: () => homedir(),
  readFiles: async (dir, name, depth) => {
    const paths = await findFiles(dir, name, depth);
    const files = await Promise.all(
      paths.map(async (path) => ({ path, text: await readFile(path, "utf8").catch(() => "") })),
    );
    return files.filter((f) => f.text !== "");
  },
  openUrl: (url) => open(url),
};

async function findFiles(dir: string, name: RegExp, depth: number): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(
    entries.map((e) => {
      const path = join(dir, e.name);
      if (e.isDirectory()) return depth > 0 ? findFiles(path, name, depth - 1) : [];
      return name.test(e.name) ? [path] : [];
    }),
  );
  return nested.flat();
}
