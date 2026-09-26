import { open } from "@raycast/api";
import { runAppleScript } from "@raycast/utils";

export interface RunningApp {
  bundleId: string;
  name: string;
  path: string;
}

/**
 * JXA script that returns regular (Dock) apps, most recently used first, across all Spaces.
 *
 * Primary source: LaunchServices' private `_LSCopyApplicationArrayInFrontToBackOrder`, the same
 * front-to-back order Cmd+Tab uses. It needs no permissions and runs in ~80ms.
 * Fallback (if the private symbol ever disappears): on-screen window z-order via
 * `CGWindowListCopyWindowInfo`, which only sees the current Space. See docs/DECISIONS.md (ADR-001).
 */
const MRU_SCRIPT = `
// No top-level ObjC.import: LaunchServices is already loaded in osascript, and importing AppKit costs ~25ms.
function fromLaunchServices() {
  ObjC.bindFunction("_LSCopyApplicationArrayInFrontToBackOrder", ["id", ["int", "unsigned int"]]);
  ObjC.bindFunction("_LSCopyApplicationInformation", ["id", ["int", "id", "id"]]);
  const asns = $._LSCopyApplicationArrayInFrontToBackOrder(-2, 0);
  const out = [];
  for (let i = 0; i < asns.count; i++) {
    const info = $._LSCopyApplicationInformation(-2, asns.objectAtIndex(i), $());
    if (ObjC.unwrap(info.objectForKey("ApplicationType")) !== "Foreground") continue;
    out.push({
      bundleId: ObjC.unwrap(info.objectForKey("CFBundleIdentifier")),
      name: ObjC.unwrap(info.objectForKey("LSDisplayName")),
      path: ObjC.unwrap(info.objectForKey("LSBundlePath")),
    });
  }
  return out;
}
function fromWindowOrder() {
  ObjC.import("AppKit");
  ObjC.import("CoreGraphics");
  const opts = $.kCGWindowListOptionOnScreenOnly | $.kCGWindowListExcludeDesktopElements;
  const windows = ObjC.castRefToObject($.CGWindowListCopyWindowInfo(opts, $.kCGNullWindowID));
  const out = [];
  for (let i = 0; i < windows.count; i++) {
    const w = windows.objectAtIndex(i);
    if (ObjC.unwrap(w.objectForKey("kCGWindowLayer")) !== 0) continue;
    const pid = ObjC.unwrap(w.objectForKey("kCGWindowOwnerPID"));
    const app = $.NSRunningApplication.runningApplicationWithProcessIdentifier(pid);
    if (!app.js || app.activationPolicy !== $.NSApplicationActivationPolicyRegular) continue;
    out.push({ bundleId: app.bundleIdentifier.js, name: app.localizedName.js, path: app.bundleURL.path.js });
  }
  return out;
}
function run() {
  let apps = [];
  try { apps = fromLaunchServices(); } catch (e) {}
  if (apps.length === 0) apps = fromWindowOrder();
  const seen = {};
  return JSON.stringify(apps.filter((a) => a.bundleId && !seen[a.bundleId] && (seen[a.bundleId] = true)));
}
`;

/** Bundle IDs never treated as history entries. Raycast itself is frontmost while its window is open. */
const IGNORED = new Set(["com.raycast.macos"]);

export async function getRecentApps(): Promise<RunningApp[]> {
  const json = await runAppleScript(MRU_SCRIPT, { language: "JavaScript" });
  return (JSON.parse(json) as RunningApp[]).filter((a) => !IGNORED.has(a.bundleId));
}

/**
 * Bring an app to the front by asking Raycast (already running, allowed to activate apps) to open its bundle.
 * Avoids spawning `open -b` (~60ms). `NSRunningApplication.activate` from osascript is ignored on
 * macOS 14+, see ADR-002. Like a Dock click, it also unhides the app.
 */
export async function activateApp(app: RunningApp): Promise<void> {
  await open(app.path);
}
