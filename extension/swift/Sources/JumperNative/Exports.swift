import Foundation  // required: the @raycast macro expands to NSObject-based code
import RaycastSwiftMacros

// Functions exported to TypeScript. Each call spawns this executable once (~7ms), so keep them few and coarse.

// MARK: App level

@raycast func recentApps() -> [RunningApp] {
  readRecentApps()
}

/// Processes of the current user (agent level: liveness, tty, parent chain).
@raycast func processes() -> [RunningProcess] {
  readProcesses()
}

// MARK: Tab level (Accessibility; wrapped by src/lib/platform/tabs.ts)

@raycast func accessibilityTrusted() -> Bool {
  axTrusted()
}

/// Windows and native tabs of many apps in one call.
@raycast func appWindows(bundleIds: [String]) -> [AppWindows] {
  readWindows(bundleIds: bundleIds)
}

@raycast func focusWindow(bundleId: String, index: Int, title: String, tab: String?) -> Bool {
  raiseWindow(bundleId: bundleId, index: index, title: title, tab: tab)
}

@raycast func sidebarRows(bundleId: String, container: String, rowRole: String) -> [SidebarRow] {
  readSidebarRows(bundleId: bundleId, container: container, rowRole: rowRole)
}

@raycast func openSidebar(
  bundleId: String, container: String, rowRole: String, name: String, namePattern: String, keyboard: Bool
) -> Bool {
  openSidebarRow(
    bundleId: bundleId, container: container, rowRole: rowRole, name: name, namePattern: namePattern,
    keyboard: keyboard)
}

@raycast func labelWithSuffix(bundleId: String, suffix: String) -> String? {
  readLabel(bundleId: bundleId, suffix: suffix)
}

/// Title and URL of each web page open in the app (Notion: one per tab).
@raycast func webPages(bundleId: String) -> [WebPage] {
  readWebPages(bundleId: bundleId)
}
