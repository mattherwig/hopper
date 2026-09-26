# Architecture Decision Records

Newest at bottom. Add an ADR whenever a choice would surprise a future reader. Format: context → decision → consequences.

## ADR-001: Read history from macOS instead of recording it (2026-09-26)

**Context.** Raycast extensions only run when invoked; there is no long-lived process to watch app activations. Options were: (a) background `interval` command (min 10s, coarse, disabled by default for Store installs), (b) ship a daemon/LaunchAgent (Store-hostile, heavy), (c) ask macOS for its existing MRU order at invocation time.

**Decision.** (c). LaunchServices' private `_LSCopyApplicationArrayInFrontToBackOrder` returns running apps front-to-back across all Spaces — the same order Cmd+Tab shows. Called via JXA (`runAppleScript(..., { language: "JavaScript" })`, officially supported by `@raycast/utils`). ~80ms, no permissions. Fallback if the private symbol disappears: `CGWindowListCopyWindowInfo` window z-order (current Space only, no permissions needed for owner PID).

**Consequences.** Zero setup, no daemon. History is per-app (deduped MRU), not a log of every visit — A→B→A→B collapses. Private API risk: if Apple removes it, fallback degrades gracefully to current-Space-only.

## ADR-002: Activate with `open -b` (2026-09-26)

**Context.** Tested on macOS 26.5: `NSRunningApplication.activateWithOptions` from osascript returns `true` but the app does not come forward (cooperative activation since macOS 14). `open -b <bundleId>` works every time.

**Decision.** `execFile("open", ["-b", id])`.

**Consequences.** Behaves like a Dock click: unhides hidden apps; an app with zero windows may open a new window (Finder, some browsers). Acceptable, arguably expected.

## ADR-003: Snapshot + cursor navigation model (2026-09-26)

**Context.** Activating an app moves it to MRU front, so naive "go to MRU[1]" just toggles between two apps forever.

**Decision.** First Back snapshots the MRU list, cursor=1. Subsequent Back/Forward move the cursor within the snapshot. The snapshot stays valid while `snapshot[cursor]` is still frontmost; any manual switch invalidates it (browser semantics: navigating elsewhere drops forward stack). Apps that quit are skipped. State in Raycast `LocalStorage` (key `nav-state`). Logic is pure in `src/lib/navigation.ts` with unit tests.

**Consequences.** Single Back ≈ Cmd+Tab toggle; repeated Back walks deeper without the list reshuffling; Forward retraces.

## ADR-004: `closeMainWindow()` before switching (2026-09-26)

**Context.** E2E test via deeplink: the first Back in a burst did nothing. Raycast came forward, we switched apps, then Raycast hid and restored focus to the previous app.

**Decision.** Call `closeMainWindow({ popToRootType: Immediate })` at the start of the no-view commands and before switching from the list view.

## ADR-005: Name "Jumper" (2026-09-26)

**Context.** Store search matches title, description, and keywords. Checked raycast/extensions (3,322 extensions): no `jumper`. Neighbors: Jump (websites/folders), Quick Jump (team links), SpaceJump (macOS Spaces switcher, closest risk of confusion).

**Decision.** Title `Jumper`, slug `jumper`. The title is brandable; command titles carry the searchable words ("Jump Back to Previous App", "Jump Forward to Next App", "Show App History"), and description/keywords carry "app switcher", "previous app", "alt tab" (what people actually search, see `docs/RESEARCH.md`). Command `name`s are `go-back` / `go-forward` / `show-app-history` (internal IDs; never rename after publish).

**Consequences.** The title alone doesn't say "apps"; discoverability leans on command titles, description, and keywords. Revisit if Store search performs poorly.

## ADR-006: No Swift, no binaries (2026-09-26)

`raycast/extensions-swift-tools` would give typed Swift, but needs Xcode 16.3+/Swift 6 and a compile step. JXA via osascript is enough for two API calls and keeps review simple (no opaque binaries). Revisit if we need event-driven tracking (would require a real process anyway).

## ADR-007: Activate via Raycast `open(appPath)`; supersedes ADR-002's `open -b` (2026-09-26)

**Context.** Profiling (docs/PERFORMANCE.md): spawning `open -b` cost ~65ms. Raycast's `open()` asks the already-running Raycast app to open the bundle — no spawn, ~25ms, and Raycast is allowed to activate other apps.

**Decision.** `activateApp(app)` calls `open(app.path)`. Same Dock-click semantics (unhides). Also dropped top-level `ObjC.import("AppKit")` from the JXA script (−25ms); AppKit is imported only in the window-order fallback.
