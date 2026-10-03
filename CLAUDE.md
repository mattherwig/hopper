# CLAUDE.md — Hopper (Raycast extension)

Browser-style Back / Forward for macOS apps, tab search across apps, and jumping to AI agents wherever they run; shipped as a Raycast Store extension.
Store slug `hopper`, title "Hopper".

## Start here

1. Read `docs/DECISIONS.md` before changing behavior — every non-obvious choice has an ADR with the why.
2. `docs/STATUS.md` = what's done, what's next. Update it at the end of any session that changes state.
3. `docs/RELEASING.md` = Store submission / update checklist.
4. `docs/PERFORMANCE.md` = how to profile + current latency numbers.
5. `docs/RESEARCH.md` = naming, keyword, and competitor research (with sources).

## Tasks

Work is tracked in GitHub Issues on https://github.com/mattherwig/hopper (the task system; don't keep TODO lists in docs).

- `gh issue list` — open tasks. `gh issue view <n>` — full instructions (issues are written to be executable by an agent).
- Labels: `release` (Store publishing), `decision` (needs owner input before work), `enhancement`, `bug`.
- New task → `gh issue create` with context, steps, and done-criteria. Close with `gh issue close <n> -c "<what was done>"`.
- Anything outward-facing (publishing, posting) — confirm with the owner even if an issue says to do it.

## Commands

Requires Node ≥ 22.22 (Raycast 2.x CLI) and **Xcode 16.3+** (Swift 6, for the native helper; `xcode-select -p` must point at it). Run `source ~/.nvm/nvm.sh && nvm use` first (`.nvmrc`, at the root and in `extension/`).

**Repo split (ADR-012):** the shippable extension lives in `extension/`; dev-only material (`docs/`, `scripts/`, `.claude/`, this file) stays at the repo root. All npm commands run in `extension/`. `npm run publish` must run from `extension/` and ships **everything on disk in it** (no ignore file; only `node_modules`, `raycast-env.d.ts`, `.raycast-swift-build`, `.swiftpm`, `compiled_raycast_swift`, and a few others are skipped), so never put dev-only files in `extension/`.

| Task | Command |
|---|---|
| Install deps | `cd extension && npm ci` |
| Unit tests (pure logic, no Raycast; type-checks `test/` first) | `cd extension && npm test` |
| Lint (manifest, icon, ESLint, Prettier) | `cd extension && npm run lint` / `npm run fix-lint` |
| Production build | `cd extension && npm run build` |
| All of the above | `cd extension && npm run check` |
| Load into Raycast with hot reload | `cd extension && npm run dev` (run in background; does not survive the session, restart it) |
| Publish / update on Store | `cd extension && npm run publish` (opens PR on raycast/extensions — confirm with user first; follow the `publish-store` skill) |

## Layout

```
extension/                                    the Raycast extension; everything here ships to the Store
  package.json, package-lock.json            manifest (commands, keywords) + deps
  README.md, CHANGELOG.md, LICENSE           shown on / required by the Store
  src/back.ts, src/forward.ts,
  src/toggle.ts                               no-view commands (thin; call runNavigation)
  src/history.tsx                             view command: List of running apps by recency
  src/tabs.tsx, src/app-tabs.tsx              Search / Search Current App (names `tabs` / `app-tabs`, ADR-023), thin; render SearchList
  src/agents.tsx, src/next-agent.ts           Agents (view, thin; renders AgentList) and Next Agent (no-view: jump to the longest-waiting agent)
  src/components/                             shared UI: search-list.tsx (Search: tabs and agents, grouped by app), agent-list.tsx (the agent List), switch-action.tsx (switch, then close Raycast)
  src/lib/apps/                               app level (Back/Forward/Toggle/History)
    navigation.ts                             PURE back/forward state machine — all logic lives here, unit-tested
    history.ts                                PURE filters on the app list (exclude, remove), unit-tested
    load-history.ts                           glue: getRecentApps() + filters; removals + exclusions in LocalStorage; both commands read history through loadHistory()
    run-navigation.ts                         glue: read MRU, LocalStorage state, navigate(), activate
  src/lib/tabs/                               place level (Search): tabs, windows, sessions inside apps, and their panes — PURE, sources get OS access via a Platform
    model.ts                                  Tab, Pane, TabSource types; how to add an app or an action
    registry.ts                               which source handles which app (windows is the fallback), plus DISCOVERED sources of places inside other apps (herdr) — add new apps here
    search.ts                                 search bar filter + ranking (typos, app-name first; ADR-015)
    load.ts                                   read all apps' tabs in parallel, order them, route selection (and pane selection) to the source
    history.ts, reopen.ts                     Recently Closed (ADR-019); jumpOrOpen: jump to the open tab, else open, shared with Bookmarks (ADR-033)
    bookmarks.ts                              Bookmarks: saved reopen targets (ADR-030)
    applescript.ts                            script scaffolding + record parsing shared by AppleScript sources
    sources/                                  one file per app family: chromium, safari, cmux, ghostty, iterm, terminal (AppleScript; terminals report panes by tty, Ghostty by folder);
                                              herdr (discovered: workspaces/tabs under the terminal running herdr; owns the herdr protocol; ADR-023);
                                              windows (Accessibility fallback); sidebar.ts + muse (Accessibility sidebar; ADR-017); notion (ADR-016, ADR-020); obsidian (workspace.json + tab headers by DOM class; ADR-027);
                                              notes (Apple Notes: Recent Notes menu by AXIdentifier, shown by AppleScript; ADR-034);
                                              claude (session files + claude:// deep link; Chat/Cowork via sidebar + ids learned from the page URL; ADR-014, ADR-017)
  src/lib/agents/                             agent level (Agents, Next Agent, status in Search) — PURE (ADR-022)
    model.ts                                  Agent, AgentStatus, Host, Location, AgentSource; how agents relate to places
    registry.ts                               the agent sources — add new agent products here
    sources/                                  claude (~/.claude/sessions + Claude app files), codex (state_5.sqlite + rollout files), cursor (state.vscdb),
                                              herdr (socket snapshot), cli (agent CLIs by process name)
    locate.ts                                 host → app / tab / pane: process parent chain + tty against panes; places by tab key (ADR-028)
    status.ts                                 done-until-seen, urgency order, Next Agent's pick
    load.ts                                   read all sources, merge one agent per session, locate, attach projects; jumpToAgent
  src/lib/projects/project.ts                 PURE: projects = git repositories (worktrees under their main checkout); a grouping, not a level
  src/lib/platform/                           macOS / Raycast glue shared by every level
    model.ts                                  PURE: the Platform interface (OS capabilities) and App; fake in test/fake-platform.ts
    sqlite.ts                                 PURE: when querySqlite reads a WAL database as immutable (no app holds it open; ADR-031)
    report.ts                                 reportError() → captureException to the Developer Hub, labeled; showFailure() = toast + report (ADR-029)
    os.ts                                     macosPlatform: AppleScript, Swift Accessibility + process calls, files, sockets, git files
    storage.ts                                LocalStorage JSON read/write; unreadable values fall back to defaults
    macos.ts                                  getRecentApps() (calls Swift, apps with pid) + activateApp() (Cmd+Tab-style via Accessibility, open() as fallback)
    processes.ts                              PURE: process-tree helpers (app of a process, herdr client)
    agents.ts                                 loadAllAgents(): the agent level on macOS, shared by Agents, Next Agent, Search
  swift/Sources/HopperNative/                 native helper, plain Swift except Exports.swift (@raycast): RecentApps.swift, Activate.swift (app level);
                                              AX.swift (Accessibility helpers), Windows.swift, Sidebar.swift, Menus.swift (tab level); Processes.swift (agent level)
  assets/extension-icon.png                   Store icon, 512x512
  metadata/                                   Store screenshots, 2000x1250 (skill: store-screenshots)
  media/demo.gif                              README demo, shown on the Store page (skill: demo-gif)
  test/<level>/*.test.ts                      node:test, run via --experimental-strip-types; mirrors src/lib/. test/fake-platform.ts fakes the OS
  test/setup.mjs                              lets Node resolve extensionless imports ("./model") to .ts in tests
docs/                                         dev docs (not shipped)
scripts/bench.swift                           end-to-end latency bench (see docs/PERFORMANCE.md)
scripts/smoke.py                              end-to-end smoke test in Raycast, suites nav/history/tabs, `--changed` picks them (skill: smoke-test)
scripts/smoke_herdr.py                        end-to-end herdr smoke test (Search + Agents jumps into a throwaway herdr workspace; skill: smoke-test)
scripts/smoke_claude.py                       end-to-end smoke test of Claude app Code sessions (Search + Agents jumps; skill: smoke-test)
scripts/media/                                Store media generator: store_media.py drives Raycast (skills below), writes into extension/; social-preview.sh renders the GitHub + og:image cards
README.md                                     GitHub landing page; points to extension/README.md
site/index.html                               landing page at https://addhopper.com (GitHub Pages custom domain; deployed by .github/workflows/pages.yml); its images (demo GIF, icon, hopper-1/-2/-3 screenshots) are symlinks into extension/; og-image.png (link previews) is rendered by scripts/media/social-preview.sh
```

## Invariants (don't break)

- Command `name`s in `extension/package.json` (`back`, `forward`, `toggle`, `history`, `tabs`, `app-tabs`, `agents`, `next-agent`) are permanent once published: users' hotkeys bind to them.
- Incognito / private browser windows never reach the tab list (ADR-018): filter them in the source, not the UI.
- Adding, renaming, or changing a user-facing command or action: update `extension/README.md` (Commands, Setup, How it works; the Store shows it), `extension/CHANGELOG.md`, the `extension/package.json` `description`, and the Layout table here, all in the same commit.
- Keep PURE modules (`apps/navigation.ts`, `apps/history.ts`, everything in `tabs/`, `agents/`, `projects/`, `platform/model.ts`, and `platform/sqlite.ts`) free of Raycast/Node imports so `npm test` works without Raycast. Tab and agent sources reach the OS only through `Platform` (ADR-013, ADR-022).
- Agent sources read agents' own state read-only: never install hooks, write their config, or call anything that starts, resumes, loads, or sends input to a session (ADR-022).
- `site/index.html` repeats the README's Commands, How it works, Tabs table, and Setup: changing commands, hotkeys, or behavior, update it in the same commit.
- Activate apps through `activateApp()`: Accessibility `AXFrontmost` via the Swift helper, falling back to Raycast `open(app.path)` (ADR-021; `open()` alone sends a reopen event that can show the wrong window). Never `NSRunningApplication.activate` (silently ignored on macOS 14+ from background; ADR-002).
- Raycast kills a command at 100 MB of JS heap, and Search already sits at ~30 MB live: never hold many app files that can grow (session records, transcripts) at once; use `readJsonFields` (one at a time, only the fields needed) or `readTail` (ADR-032, `docs/PERFORMANCE.md`).
- Each exported Swift call spawns a process (~7ms): keep `@raycast` functions few and coarse. Profile any change on the hot path: `docs/PERFORMANCE.md`.
- No prebuilt binaries in the repo; Swift is compiled from source by `ray build` (Store rule, ADR-008). `extension/assets/compiled_raycast_swift/` is build output and stays gitignored.
- Any Swift file using `@raycast` must `import Foundation` (the macro expands to NSObject code). `ray build` hides Swift errors; run `swift build` in `extension/swift/` to see them. The first build on a machine fetches swift-syntax (a few minutes).
- No-view commands: `closeMainWindow()` must run before activating, or Raycast restores focus and undoes the jump (ADR-004). View command (list): the reverse — activate first, since closing unmounts the view and kills the command (ADR-009).
- Nothing dev-only in `extension/`: publish copies the whole folder into raycast/extensions (ADR-012).
- Max 12 `keywords` in package.json (`ray lint` enforces).
- Store rules: MIT, US English, Title Case titles, `CHANGELOG.md` top entry `## [Title] - {PR_MERGE_DATE}`.

- A catch that hides a failure reports it (ADR-029): `platform.reportError(error, context)` in pure code, `reportError` / `showFailure` in glue (never bare `showFailureToast`). Sources also report version drift: a running app's files missing or not parsing, statuses outside the known set (`unknownStatuses`). `context` never carries titles, URLs, or paths. Reports: https://www.raycast.com/extension-issues.

## Verifying end to end (no hotkey needed)

With `npm run dev` running (in `extension/`), trigger commands via deeplink and inspect frontmost app:

```bash
open -g "raycast://extensions/matt_herwig/hopper/back"
osascript -l JavaScript -e 'ObjC.import("AppKit"); $.NSWorkspace.sharedWorkspace.frontmostApplication.bundleIdentifier.js'
```

`console.log` output from commands appears in the `ray develop` terminal. This switches the user's frontmost app — warn them first.

## Gotchas

- Check latest Raycast package versions with `npm view @raycast/api version` / `npm view @raycast/utils version`; `npm outdated` has shown a bogus 1.x "Latest" for `@raycast/api`.
- Never `xcode-select` to an Xcode that doesn't run on the current macOS: it breaks `git`/`clang` system-wide until reset (`sudo xcode-select -s /Library/Developer/CommandLineTools`).

## Raycast docs for agents

- Index: https://developers.raycast.com/llms.txt (append `.md` to any docs page URL for markdown)
- Full: https://developers.raycast.com/llms-full.txt
- Store review checklist (what reviewers/bots check): https://github.com/raycast/extensions/blob/main/.github/copilot-instructions.md
