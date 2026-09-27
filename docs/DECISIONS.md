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

**Decision.** Call `closeMainWindow({ popToRootType: Immediate })` at the start of the no-view commands. (The list view does the reverse; see ADR-009.)

## ADR-005: Name "Jumper" (2026-09-26)

**Context.** Store search matches title, description, and keywords. Checked raycast/extensions (3,322 extensions): no `jumper`. Neighbors: Jump (websites/folders), Quick Jump (team links), SpaceJump (macOS Spaces switcher, closest risk of confusion).

**Decision.** Title `Jumper`, slug `jumper`. The title is brandable; command titles carry the searchable words ("Jump Back to Previous App", "Jump Forward to Next App", "Show App History"), and description/keywords carry "app switcher", "previous app", "alt tab" (what people actually search, see `docs/RESEARCH.md`). Command `name`s are `go-back` / `go-forward` / `show-app-history` (internal IDs; never rename after publish). Command titles and names superseded by ADR-011.

**Consequences.** The title alone doesn't say "apps"; discoverability leans on command titles, description, and keywords. Revisit if Store search performs poorly.

## ADR-006: No Swift, no binaries (2026-09-26) — superseded by ADR-008

`raycast/extensions-swift-tools` would give typed Swift, but needs Xcode 16.3+/Swift 6 and a compile step. JXA via osascript is enough for two API calls and keeps review simple (no opaque binaries). Revisit if we need event-driven tracking (would require a real process anyway).

## ADR-007: Activate via Raycast `open(appPath)`; supersedes ADR-002's `open -b` (2026-09-26)

**Context.** Profiling (docs/PERFORMANCE.md): spawning `open -b` cost ~65ms. Raycast's `open()` asks the already-running Raycast app to open the bundle — no spawn, ~25ms, and Raycast is allowed to activate other apps.

**Decision.** `activateApp(app)` calls `open(app.path)`. Same Dock-click semantics (unhides). Also dropped top-level `ObjC.import("AppKit")` from the JXA script (−25ms); AppKit is imported only in the window-order fallback.

## ADR-008: Native Swift helper for the app list; supersedes ADR-006 (2026-09-26)

**Context.** Profiling showed the osascript/JXA read of the app list was the biggest cost we control (~50ms of ~75ms). A native prototype does the same read in ~7ms. Owner chose speed (issue #2).

**Decision.** Move `readRecentApps()` to Swift (`swift/Sources/JumperNative/`), exported with `@raycast` via `raycast/extensions-swift-tools`, imported in TS as `swift:../../swift`. Swift is compiled from source by `ray build`, so there is no prebuilt binary (Store rule: https://developers.raycast.com/basics/prepare-an-extension-for-store.md, Binary Dependencies). The JXA path is removed (one code path). Activation stays in TS via Raycast `open()` (ADR-007) because a background helper can't reliably activate apps (ADR-002).

**Consequences.** Builders need Xcode 16.3+ (Swift 6). The bridge spawns the helper once per call, so keep exported functions few and coarse. The bridge rejects Windows (see issue #7). `RecentApps.swift` has no macro imports, so it can be checked with plain `swiftc` (see docs/PERFORMANCE.md).

## ADR-009: In History, activate before closing the window (2026-09-26)

**Context.** Selecting an app in History did nothing. Debug logging showed `closeMainWindow({ popToRootType: Immediate })` unmounts the view command and ends its process, so the `open()` after it never ran. ADR-004's order (close, then activate) only holds for no-view commands.

**Decision.** The list action calls `activateApp(app)` first, then `closeMainWindow()`. Verified by deeplink (temporary `launchContext` hook firing the same handler): picking the 3rd entry switched to it, so the switch isn't just Raycast restoring the previous app on hide.

## ADR-010: Toggle = Back that always starts fresh (2026-09-26)

**Context.** Owner wanted a one-key flip between two apps (#5). Back walks deeper on repeat (ADR-003), so pressing it twice goes A→B→C, not A→B→A.

**Decision.** New `toggle` direction in `navigate()`: ignores saved state, snapshots the current MRU, targets index 1. Because activating moves the target to the MRU front, repeating it flips between the two most recent apps. It still saves `nav-state`, so a Back after a toggle keeps walking deeper. Command name `toggle` (permanent once published).

## ADR-011: Short command titles and names (2026-09-26)

**Context.** Titles like "Jump Back to Previous App" were redundant ("back" = "previous", "Jump" repeats the extension name that Raycast shows as the subtitle), and Back and Toggle had near-identical descriptions. Not yet published, so renaming IDs breaks no users.

**Decision.** Titles `Back`, `Forward`, `Toggle`, `History`; command `name`s match (`back`, `forward`, `toggle`, `history`), as do the source files. Descriptions distinguish Back (walks deeper) from Toggle (flips between two). Search terms like "previous app", "last app", "jump" live in keywords. Supersedes the command naming in ADR-005 and ADR-010.

**Consequences.** Short titles are generic in Raycast root search; the "Jumper" subtitle and keywords disambiguate. Names are permanent once published. Existing dev hotkeys must be rebound.

## ADR-012: Extension lives in extension/, dev material at repo root (2026-09-26)

**Context.** `npm run publish` (Raycast CLI) copies the entire extension directory from disk into the raycast/extensions monorepo. There is no ignore file; it only skips `.git`, `.github`, `node_modules`, `raycast-env.d.ts`, `.direnv`, `.raycast-swift-build`, `.swiftpm`, `compiled_raycast_swift`, `compiled_raycast_rust`. With the extension at the repo root, the first publish PR (raycast/extensions#31608) shipped `docs/`, `CLAUDE.md`, `AGENTS.md`, and `scripts/`.

**Decision.** Everything that ships (package.json + lock, `src/`, `swift/`, `assets/`, `metadata/`, `media/`, `test/`, README, CHANGELOG, LICENSE, tsconfig/eslint/prettier config, `.nvmrc`) lives in `extension/`, and publish runs from there. Dev-only material stays at the root: `docs/`, `scripts/`, `.claude/`, `CLAUDE.md`/`AGENTS.md`, a short GitHub README pointing to `extension/README.md`. LICENSE and `.nvmrc` exist in both places (GitHub repo license; `nvm use` works at either level).

**Consequences.** All npm commands run in `extension/` (`cd extension && npm run check`). Anything on disk in `extension/` ships, including untracked files (stray `.DS_Store`, `swift/.build/` from a manual `swift build`), so check before publishing. `scripts/media/store_media.py` writes into `extension/metadata/` and `extension/media/`. Source paths in earlier ADRs (`src/…`, `swift/…`) are relative to `extension/`.

## ADR-013: Tab level as pluggable sources behind a Platform (2026-09-26)

**Context.** Owner wanted to go below apps: browser tabs, terminal tabs, chat sessions (prototype on `prototype/chrome-tabs`). Each app exposes this differently: AppleScript dictionaries (Chromium, Safari, cmux, iTerm, Terminal), only Accessibility (Claude, Muse), or nothing but windows. More apps and more per-tab actions (e.g. close) are expected, and some apps won't be supportable.

**Decision.** `src/lib/tabs/` holds a `TabSource` per app family (`sources/*.ts`), mapped by bundle ID in `registry.ts`, with the Accessibility windows source as the fallback for every other app. Sources are pure: all OS access goes through a `Platform` interface (`model.ts`), implemented by `src/lib/platform/tabs.ts` (Raycast `runAppleScript` + Swift helper) and faked in tests. Sidebar apps are data (`SidebarSpec`) on one generic source. New per-tab actions become optional `TabSource` methods, shown only for sources that implement them. Commands `tabs` and `app-tabs` share one `TabList`.

Mechanics learned in the prototype:
- Chromium AppleScript reads properties in bulk per window (`title of tabs of win`): 1s → 0.18s for 25 tabs.
- Tabs are found again at selection time (Chrome tab id, cmux/iTerm ids, Terminal tty, Safari URL), so a cached or stale list can't jump to the wrong tab; a vanished tab throws `TabGoneError`.
- Electron apps (Claude) expose web content to AX only after setting `AXManualAccessibility`; the first read needs ~0.4s to build the tree.
- Muse ignores AXPress (reports success, doesn't navigate). Rows are opened by setting AXFocused and posting Return to the app's pid; the helper must stay alive ~150ms after posting or the event is dropped. Muse also appends "<date> More thread actions" to a hovered row's title, so rows are matched by a name pattern, not raw title.

**Consequences.** Tab commands need Automation (per scripted app) and Accessibility permissions; failures are listed per app, not fatal. Sidebar sources depend on the apps' UI structure and can break on app updates (they fall back to windows). Node tests import extensionless paths, so `npm test` loads `test/setup.mjs` to resolve `.ts`. Cursor was descoped pending a spike. Messages was probed and left out: its conversation rows are unlabeled AXGroups whose only text is "name, last message, time" (group names contain commas, so the name can't be split reliably), and like every AX source it only sees windows on the current Space.

## ADR-014: Claude Code sessions from Claude's session files + deep link (2026-09-26)

**Context.** The Claude source read sessions from the on-screen sidebar (ADR-013), so hiding the sidebar (⌘B) removed them from Tabs. Yet macOS Spotlight still found them: Claude indexes Code sessions itself (Core Spotlight, `setSpotlightEntries` in its Swift addon) and builds its Dock menu from the same list. Each entry's identifier is a deep link, `claude://code/continue?session=<sessionId>`, handled by Claude's normal URL handler. Core Spotlight items can't be queried by other apps (`mdfind` doesn't see them).

**Decision.** List Code sessions from Claude's per-session files, `~/Library/Application Support/Claude/claude-code-sessions/<account>/<org>/local_<uuid>.json` (`sessionId`, `title`, `cwd`, `isArchived`, `lastFocusedAt`), skipping archived ones, most recently focused first. Open one with the deep link through `Platform.openUrl`. Keep reading the sidebar for Chat-mode conversations (not stored locally), adding rows the files don't have. The open session is still named by the "<name>, rename session" label, which stays visible with the sidebar hidden. Fall back to windows if both are empty.

**Consequences.** Code sessions show across all projects without Accessibility and regardless of sidebar state (~16ms for 11 files). The deep link is a public entry point (Claude's own Dock menu and Spotlight use it); the file layout is undocumented and may change, in which case the source degrades to the sidebar. Muse has no equivalent (no Spotlight items, no thread deep link, no local chat list; `hatch://` routes tested and ignored), tracked in #13.

## ADR-015: Own search ranking in Tabs, app before mentions, typo-tolerant (2026-09-26)

**Context.** Raycast's built-in List filter matched tabs through `keywords` (app name, detail, kind) but gave no control over ranking and no typo tolerance: typing "claude" listed browser tabs and cmux workspaces titled "Claude" ahead of (or mixed with) the Claude app's own sessions, and "caude" found nothing.

**Decision.** Tabs turns Raycast filtering off (`filtering={false}` + `onSearchTextChange`) and filters with Fuse.js in the PURE `tabs/search.ts` (a few lines of config, no custom matching code): token search with every word required (`tokenMatch: "all"`), `threshold: 0.35`, fields weighted app name 5, title 2, detail and URL 1, kind 0.5. The heavy app-name weight puts an app's own tabs above tabs that mention it, even ones that match in both title and URL. Ties keep recency; sections follow their app's best tab.

**Consequences.** Typos work, including swapped letters ("caude", "cluade"). Fuse is loose at this threshold: weak matches ("pull gitlab" finding a github.com tab) show at the bottom; below 0.35 swapped letters stop matching. Abbreviations don't ("gh" doesn't find "github"), so the demo GIF searches "github pages". No Raycast highlighting of matched text. Fuse 7.5 adds ~400KB unpacked, pure JS.

## ADR-016: Notion tabs show their page's parents, from Notion's local cache (2026-09-26)

**Context.** Notion pages nest, and tab titles alone are ambiguous ("New page", "Notes"). The tab bar (ADR-013 sidebar reader) gives titles only. Notion's own breadcrumb above a page is already elided ("Tech Interviewing / ... / Jordan Convo 2") and exists only per loaded page. Each open tab keeps its own web view (hidden ones moved off-screen) whose AXURL ends in the page id. Notion's local SQLite cache `~/Library/Application Support/Notion/notion.db` has `block.parent_id` / `parent_table` for every cached page, through databases (`collection`) up to the workspace.

**Decision.** The Swift helper returns every web view's title and URL (`webPages`, ~40ms, in parallel with the tab bar read). Tabs are matched to pages by title, the page id taken from the URL, and one read-only `sqlite3 -readonly -json` query walks all tabs' ancestors (`Platform.querySqlite`, ~25ms). Only pages and databases count as parents; list/toggle blocks and the workspace are skipped, like Notion's breadcrumb. The detail shows the nearest parent always, then farther ones while the text stays within 36 characters, else `… / `; the full path is the hover tooltip (`Tab.detailFull`) and is searched.

**Consequences.** No extra permission (the cache is the user's own file; `/usr/bin/sqlite3` ships with macOS). The cache schema is undocumented: any failure (file missing, locked, schema changed, page or database not cached) just leaves the detail empty. Tabs with the same title share the first match's path. Unloaded tabs (Notion unloads after ~10h idle) may have no web view and so no path.
