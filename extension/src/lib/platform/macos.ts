import { open } from "@raycast/api";
import { frontApp, recentApps } from "swift:../../../swift";

export interface RunningApp {
  bundleId: string;
  name: string;
  path: string;
}

/** Bundle IDs never treated as history entries. Raycast itself is frontmost while its window is open. */
const IGNORED = new Set(["com.raycast.macos"]);

/**
 * Regular (Dock) apps, most recently used first, across all Spaces.
 * Implemented natively in `swift/Sources/JumperNative/RecentApps.swift` (~7ms per call; ADR-001, ADR-008 in https://github.com/mattherwig/jumper/blob/main/docs/DECISIONS.md).
 */
export async function getRecentApps(): Promise<RunningApp[]> {
  const apps: RunningApp[] = await recentApps();
  return apps.filter((a) => !IGNORED.has(a.bundleId));
}

/**
 * Bring an app to the front like Cmd+Tab, via Accessibility in the Swift helper. Raycast `open()` would send the app
 * a "reopen" event, and some apps answer it by showing their main window over the one the user was on (TV opens its
 * home screen over a fullscreen show). `NSRunningApplication.activate` from a background process is ignored on
 * macOS 14+ (ADR-002). The helper declines when there's no Accessibility permission or the app's main window is
 * minimized or missing; then `open()` restores or creates one like a Dock click (ADR-007). See ADR-021 in
 * https://github.com/mattherwig/jumper/blob/main/docs/DECISIONS.md.
 */
export async function activateApp(app: RunningApp): Promise<void> {
  if (await frontApp(app.bundleId)) return;
  await open(app.path);
}
