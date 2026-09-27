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

**Consequences.** Code sessions show across all projects without Accessibility and regardless of sidebar state (~16ms for 11 files). The deep link is a public entry point (Claude's own Dock menu and Spotlight use it); the file layout is undocumented and may change, in which case the source degrades to the sidebar. Muse has no equivalent (no Spotlight items, no thread deep link, no local chat list; `hatch://` routes tested and ignored), tracked in #13. Chat and Cowork conversations: ADR-017.

## ADR-015: Own search ranking in Tabs, app before mentions, typo-tolerant (2026-09-26)

**Context.** Raycast's built-in List filter matched tabs through `keywords` (app name, detail, kind) but gave no control over ranking and no typo tolerance: typing "claude" listed browser tabs and cmux workspaces titled "Claude" ahead of (or mixed with) the Claude app's own sessions, and "caude" found nothing.

**Decision.** Tabs turns Raycast filtering off (`filtering={false}` + `onSearchTextChange`) and filters with Fuse.js in the PURE `tabs/search.ts` (a few lines of config, no custom matching code): token search with every word required (`tokenMatch: "all"`), `threshold: 0.35`, fields weighted app name 5, title 2, detail and URL 1, kind 0.5. The heavy app-name weight puts an app's own tabs above tabs that mention it, even ones that match in both title and URL. Ties keep recency; sections follow their app's best tab.

**Consequences.** Typos work, including swapped letters ("caude", "cluade"). Fuse is loose at this threshold: weak matches ("pull gitlab" finding a github.com tab) show at the bottom; below 0.35 swapped letters stop matching. Abbreviations don't ("gh" doesn't find "github"), so the demo GIF searches "github pages". No Raycast highlighting of matched text. Fuse 7.5 adds ~400KB unpacked, pure JS.

## ADR-016: Notion tabs show their page's parents, from Notion's local cache (2026-09-26)

**Context.** Notion pages nest, and tab titles alone are ambiguous ("New page", "Notes"). The tab bar (ADR-013 sidebar reader) gives titles only. Notion's own breadcrumb above a page is already elided ("Tech Interviewing / ... / Jordan Convo 2") and exists only per loaded page. Each open tab keeps its own web view (hidden ones moved off-screen) whose AXURL ends in the page id. Notion's local SQLite cache `~/Library/Application Support/Notion/notion.db` has `block.parent_id` / `parent_table` for every cached page, through databases (`collection`) up to the workspace.

**Decision.** The Swift helper returns every web view's title and URL (`webPages`, ~40ms, in parallel with the tab bar read). Tabs are matched to pages by title, the page id taken from the URL, and one read-only `sqlite3 -readonly -json` query walks all tabs' ancestors (`Platform.querySqlite`, ~25ms). Only pages and databases count as parents; list/toggle blocks and the workspace are skipped, like Notion's breadcrumb. The detail shows the nearest parent always, then farther ones while the text stays within 36 characters, else `… / `; the full path is the hover tooltip (`Tab.detailFull`) and is searched.

**Consequences.** No extra permission (the cache is the user's own file; `/usr/bin/sqlite3` ships with macOS). The cache schema is undocumented: any failure (file missing, locked, schema changed, page or database not cached) just leaves the detail empty. Tabs with the same title share the first match's path. Unloaded tabs (Notion unloads after ~10h idle) may have no web view and so no path.

## ADR-017: Claude conversations open by learned id; Muse's hidden side chats are not revealed (2026-09-26)

**Context.** Claude's Chat and Cowork conversations were only reachable while its sidebar showed them, but Claude handles `claude://claude.ai/<path>` like a claude.ai link: `chat/<uuid>` and `cowork/<cse_id>` open the conversation (tested live). Ids aren't stored locally and sidebar rows don't carry them; the open conversation's page URL does. Claude's Recents page lists ids too, but reading it means navigating the user's window. Muse 4.1 hides its "Side chats" list by default behind a "<open chat> Open chat and side chats" button, so the sidebar source (ADR-013) usually finds nothing and lists Muse's window. Muse has no deep link, App Intents, scripting, or local chat data (#13). Pressing that button through Accessibility (read, then press again) was built and worked in the background, but it flashes the panel and depends on English UI text.

**Decision.** Claude reads its page (`webPage`: first http(s) web area) on each list; a `chat/` or `cowork/` URL records title → path in LocalStorage (`tabs:claude-conversations`, newest first, max 200). Sidebar rows with a known path open by deep link; when the sidebar shows no conversations (hidden, or Code mode), the 20 most recently seen are listed. Muse: the reveal was removed at the owner's call; anything that changes an app's UI to read or open it needs the owner's OK first. Muse is read only while its panel is shown, else its window is listed; the button above the transcript (a read) names the open chat (`readLabel` now matches titles too).

**Consequences.** Claude conversations open by link only once seen open in Claude; same-named conversations share an entry. Most Muse users see only Muse's window in Tabs until Muse offers a deep link or similar (#13). Limits (list lengths, virtualization, cache eviction) are tracked in #22; reopening closed items in #21.

## ADR-018: Incognito and private windows are never listed (2026-09-26)

**Context.** Tabs listed every browser window, including incognito and private ones, and `useCachedPromise` persists the list to Raycast's on-disk cache, so private page titles and URLs were written to disk. The planned Recently Closed history (#21) would persist them longer. Owner decision: no listing, jumping, or history for private browsing at all.

**Decision.** Leave private windows out at the source, so nothing downstream (list, cache, search, history) ever sees them. Chromium: AppleScript `mode of window` is `"incognito"` → skipped in the list script. Safari: AppleScript has no marker (nor does the AX identifier), only the Accessibility window title (`"<page>, Private Browsing"`), so the Safari source also reads its AX windows (one extra Swift call, in parallel) and matches them to AppleScript windows by title, front to back. It fails closed: no AX windows (Accessibility not granted) hides all Safari tabs; an unmatchable window is hidden while a private window is unaccounted for. Windows fallback: titles ending in "Private Browsing", "Incognito", or "InPrivate" are skipped (Firefox and other browsers without a source; unverified per browser).

**Consequences.** Private tabs can't be jumped to from Tabs. Safari now needs Accessibility to list any tabs, and its private detection relies on the English suffix: in other languages private windows would show (tracked in #22). App-level Back/Forward still activate a browser whose front window is private; they switch apps, not windows.

## ADR-019: Recently Closed from consecutive reads; URLs and files only (2026-09-26)

**Context.** Owner wants closed tabs reopenable from Tabs (#21), with a rule: anything that needs UI automation (pressing buttons, opening panels) waits for the owner's OK (ADR-017). Reopen methods were tested live per app: browsers by URL, documents by the window's AXDocument path, Claude by deep link, Muse only by UI automation, terminals only by recreating a shell. Chrome and Safari's own History ▸ Recently Closed menus restore a tab with its back history, but only by pressing menu items.

**Decision.** `history.ts` (PURE) compares each read with the previous one, stored in LocalStorage (`tabs:recently-closed`: last open entries + closed list). An entry that was open in an app the read covers and isn't now becomes closed; one that's open again leaves the list. Covered: every app for Tabs (so quitting an app closes its tabs), the frontmost app for Tabs in Current App, never an app that failed to read, nothing without Accessibility (sources then see nothing, which must not look like everything closed). A source opts in with `reopenTarget(tab)`: Chromium and Safari return the http(s) URL, the windows fallback the window's file (AXDocument `file://`, not folders). Reopen is `open(target, app.path)`. Newest first, one week, max 100. Not tracked: Claude (sessions don't close; archived ones don't reopen; conversations are already listed from learned ids), Muse and terminals (no clean reopen), private windows (never listed, ADR-018).

**Consequences.** Only what Jumper saw: tabs opened and closed between two Tabs uses are missed, and a tab that moved to another window with a new URL looks closed. Reopened pages lose their back history. The browser menus that keep it are an open question for the owner (UI automation). Limits: #22.

## ADR-020: Notion tabs open by deep link with `deepLinkOpenNewTab` (2026-09-26)

**Context.** The Notion source (ADR-016) selected tabs by pressing them in the front window's tab bar, and noted that `notion://` links replace the current tab. Notion's app code (`handleProtocolUrl`) has a `deepLinkOpenNewTab=true` query parameter: it switches to the tab showing an equivalent URL in any window (`hasEquivalentUrl`: same last path segment and `p` peek param) or opens the page in a new tab. Tested live: the tab's exact URL (`/p/Q-A-<id>`) switched tabs with none added; a bare id (`/p/<id>`) opened duplicates.

**Decision.** Keep each tab-bar tab's page URL (from `webPages`, matched by title) in its ref, and select it with `notion://<host><path>?<query>&deepLinkOpenNewTab=true`; tabs without a URL still use the tab bar. The same link is the tab's Recently Closed target (ADR-019). `Tab.url` stays unset so the detail keeps showing parent pages.

**Consequences.** Selecting works through Notion's own routing, including tabs in other windows. Closed Notion pages reopen in a new tab. Same-titled tabs share the first match's URL. The parameter is undocumented; if Notion drops it the link opens the page in the current tab, not a failure.

## ADR-021: Agent level: agents as status + host, located into the tab level; projects as a grouping (2026-09-27)

**Context.** Owner wanted herdr's model (workspace → tab → pane, with agents detected in panes and marked blocked / working / done / idle) generalized to the whole Mac, with agents that run in different places (terminals, herdr, the Claude app, Cursor) reachable from one list. Research per app family (5 subagents, 2026-09-26/27) found each agent product keeps its own live state: Claude Code writes `~/.claude/sessions/<pid>.json` (session id, cwd, status `busy|shell|idle|waiting`, `waitingFor`) for every surface, including the Claude app's Code tab, which runs the same CLI; the Claude app's session files add `lastFocusedAt` and a post-turn summary; Codex 0.157 runs sessions in a shared app-server daemon with `ThreadStatus` (`active` + `waitingOnApproval|waitingOnUserInput`, `idle`), JSON-RPC over a WebSocket on `~/.codex/app-server-control/app-server-control.sock`; Cursor's `state.vscdb` has `composer.composerHeaders` (`hasBlockingPendingActions`, `hasUnreadMessages`, folder) and each composer's run `status`; herdr answers `session.snapshot` on its socket with agents, status and the agent's session id. Terminal panes can be tied to processes by tty: iTerm sessions and Terminal tabs expose it over AppleScript, cmux in its autosaved session file (panel id = AppleScript terminal id). What didn't fit: status of web agents (page titles don't change), Chrome/Safari tab groups (not scriptable), macOS Spaces (no public API), Ghostty 1.2 panes (no scripting), agents in Slack/Xcode/JetBrains/Notion/Raycast AI (no local state or no entry point). Installing hooks into Claude's or Codex's settings was rejected: invasive, and the status files already say the same.

**Decision.**
- Levels: App (unchanged) → Tab (places inside apps: windows, tabs, sessions) → Pane (new: `Tab.panes` with tty, `TabSource.selectPane`; iTerm splits, cmux terminals, Terminal's one shell). Agent is not a place but an overlay: `src/lib/agents/` (PURE). An `Agent` has an identity, a status, and a `Host` (a terminal process, a link opened with an app, a browser tab, or a herdr pane); `locate.ts` resolves the host to a `Location` by walking the process's parent chain to an app (apps now carry their pid) and matching its tty against that app's panes; herdr hosts focus the pane over herdr's socket and bring forward the terminal running a herdr client.
- Sources (`agents/sources/`, `registry.ts`): `claude` (session files, desktop session joined on `hostSessionId`, forks deduped by `cliSessionId`), `codex` (daemon: `initialize`, `thread/loaded/list`, `thread/read`; never loads, resumes or subscribes; a terminal thread's host is the one `codex` process working in its folder), `cursor` (only while Cursor runs; jump opens the agent's folder with Cursor, there's no link to a local agent), `herdr` (every session's socket), `cli` (agent CLIs by process name, status unknown), plus web agents recognized by URL in browser tabs (`web.ts`, status unknown). `mergeAgents` keeps one agent per session: herdr's pane becomes the host of a session another source knows; bare CLIs inside herdr or already described by a source are dropped.
- Status: sources report blocked / working / idle / unknown. `status.ts` makes idle agents active since last seen "done"; "seen" is the later of the agent's own record (Claude's `lastFocusedAt`, Cursor's unread flag) and Jumper's (`agents:seen`, set on jump; first sighting counts as seen). A post-turn question (Claude's `need_input`) is idle with detail "Needs input", so done until seen, not blocked forever; blocked is a live prompt.
- Commands: `agents` (List, grouped Needs You / Done / Working / Idle / Running, project dropdown, refreshes every 4s while open, Copy Resume Command) and `next-agent` (no-view: longest-waiting blocked, then done; repeated runs step through them via `agents:last-next`). Tabs shows the status of an agent on its tab (`location.tab` or the agent's `placeKey`, a Claude Code session's tab key).
- Projects (`src/lib/projects/`, PURE): a project is a git repository found from a folder by reading `.git` (no `git` process); a linked worktree belongs to its main checkout, named by branch. A grouping and filter, not a level; nothing without a folder in a repository is guessed into one. Called "project" in the UI (macOS Spaces and apps' own "workspaces" mean other things).
- `Platform` moved to `src/lib/platform/model.ts` (shared by tab and agent levels) and gained `processes` (Swift sysctl: pid, ppid, tty, name, start time, cwd of tty processes; interpreters report their script's name, other arguments are never read), `listDir`, `socketRequest`, `connectRpc` (WebSocket JSON-RPC, `ws` package), `gitRepos`. The implementation is `platform/os.ts` (`macosPlatform`); storage keys are no longer prefixed by the platform (tab keys keep `tabs:`).

**Consequences.** One Swift call (~25ms, 900 processes) plus file reads: 16 Claude sessions load in ~30–45ms; terminal tabs are read only for apps hosting an agent. Everything read is undocumented app state and parsed defensively: a format change drops that source to nothing (reported under Unavailable), never breaks the others. Codex's daemon client and the herdr source are built against their published protocols and unit-tested, not yet against a live session. Cursor status freshness depends on Cursor flushing its database. Codex terminal sessions in the same folder can't be told apart (then the app is brought forward via codex://, which needs the Codex app). Ghostty agents jump to the app only until Ghostty 1.3's AppleScript is supported. Resuming a finished agent is a copy action only.

## ADR-022: Tabs becomes Search; herdr places live inside their terminal (2026-09-27)

**Context.** With the agent level (ADR-021) the tab list had become the one place to find anything open, and the owner wants it as the main feature: "Search". herdr was installed and checked live (0.9.1, protocol 22): `session.snapshot` over `~/.config/herdr/herdr.sock` matched the schema the agent source was built from; `pane.focus` and `tab.focus` switch herdr's attached client; herdr reports the Claude session running in a pane (`agent_session`), which is also in Claude's own session list. herdr isn't an app: its client runs in some terminal (Ghostty here), whose parent chain passes through root's `login`.

**Decision.**
- The `tabs` and `app-tabs` commands keep their names (hotkeys bind to names) and are titled **Search** and **Search Current App**. The list is `components/search-list.tsx` (`SearchList`). Agents shown on a listed tab (a Claude Code session, a terminal tab or herdr tab with an agent) are a status tag on it; located agents without one (Cursor, Codex app threads) get an **Agents** section, searched with the tabs. The `tabs/` module keeps its name: it's the place level.
- Places that live inside another app are *discovered* sources: `TabSource.discover(apps, platform)`, listed in `registry.ts` `DISCOVERED`, run alongside every read and never blamed on an app when they fail. herdr (`tabs/sources/herdr.ts`, which owns the herdr protocol for both levels) lists one entry per herdr tab under the terminal app running a herdr client (unnamed tabs take their workspace's name); selecting one sends `tab.focus`, then the terminal app is brought forward. herdr agents point at their tab (`placeKey`), so their status shows there; a Claude Code session in a herdr pane takes herdr's tab too.
- The process table reads every user's processes (`KERN_PROC_ALL`), so parent chains through `login` reach the terminal app. Process-tree helpers are in `platform/processes.ts` (PURE).

**Consequences.** herdr places and agents are verified live (listing, merging the Claude session, locating Ghostty, `pane.focus`); in terminals that report panes (iTerm, cmux, Terminal) the tab and split holding the herdr client are selected too (`Tab.hostTty` → `Tab.within`, filled by loadTabs; idea from the Raycast Store's Herdr extension, which matches its clients' ttys the same way); Ghostty 1.2 has no scripting, so it's only brought forward. Ghostty 1.3 adds AppleScript (`terminals`, `focus`): the Herdr extension finds the client's Ghostty terminal by having herdr set a unique outer title (`client.window_title.set` on the socket) and clearing it after; a candidate once Ghostty 1.3 is installed. With several herdr clients in different terminals, the most recently started one is assumed. The demo GIF and Store screenshots still say "Tabs" until retaken (`demo-gif`, `store-screenshots` skills).

## ADR-023: Ghostty source; cmux terminals as entries; process names from argv[0] (2026-09-27)

**Context.** Owner saw a cmux tab ("fix-bug-2") and a Claude agent in it missing from Search and Agents, and updated Ghostty to 1.3.1 (Homebrew) for scripting. Causes: cmux workspaces can hold several terminals (tabs within a split), listed only as their workspace; cmux's AppleScript names every terminal "Terminal", while its session file has each panel's `customTitle` / `title`. The Claude process's kernel name (`p_comm`) is its versioned executable ("2.1.283"), not "claude", and it had no `~/.claude/sessions` file yet (running in the home folder, likely at the trust prompt). Ghostty 1.3's AppleScript has window → tab → terminal with `id`, `name`, `working directory`, `focus`, but no tty.

**Decision.**
- cmux: every workspace is an entry; one with several terminals also lists each terminal, titled from the session file, the workspace as detail, selected with `focus` (agents are then located in the terminal entries). herdr likewise (owner: "I want to see both"): every workspace (`workspace.focus`), then its tabs that have their own name, or all its tabs when it has several; an agent's status goes on its tab's entry, else its workspace's (`herdrPlaceKey`).
- Search lists every located agent as a row in its app's section (owner: no separate Agents section), besides its status on its tab, so an agent's name is searchable; an agent whose tab already shows the same title (a Claude Code session) gets no second row. Ghostty before 1.3 (AppleScript -1708/-1728) falls back to its windows instead of Unavailable; Unavailable shows osascript's own error text.
- Swift `processes()`: for processes with a terminal, `name` is argv[0]'s file name (login shells' "-" dropped), or an interpreter's script name; no other argument is read. `claude` is in the agent CLI list, so a Claude process without a session file shows as Running; once registered, the claude source describes it and the bare CLI entry is dropped (pid claimed).
- Ghostty source (`tabs/sources/ghostty.ts`): one entry per tab, terminals as panes with their working folder (`Pane.tty` is now optional, `Pane.cwd` added). locate.ts matches a process's tty first, else the one pane of its app in its folder (never a guess between two).
- herdr in Ghostty: after `tab.focus` / `pane.focus`, when no tty match placed it (`Tab.within`), herdr sets its terminal title to a one-off marker over the socket (`client.window_title.set`), Ghostty's terminal with that name is focused (retried ~0.3s), and the title is cleared (`client.window_title.clear`), as the Raycast Store's Herdr extension does.

**Consequences.** Verified live: cmux lists fix-bug-1 / fix-bug-2 by name; the unregistered Claude is listed and located at cmux › fix-bug-2. Ghostty's source and the herdr title marker are unit-tested only: the running Ghostty is still 1.2.3 until restarted (AppleScript fails, and it falls back to its windows). The marker briefly shows as the Ghostty window's title during a jump.
