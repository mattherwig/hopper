# CLAUDE.md — Jumper (Raycast extension)

Browser-style Back / Forward for macOS apps, shipped as a Raycast Store extension.
Store slug `jumper`, title "Jumper".

## Start here

1. Read `docs/DECISIONS.md` before changing behavior — every non-obvious choice has an ADR with the why.
2. `docs/STATUS.md` = what's done, what's next. Update it at the end of any session that changes state.
3. `docs/RELEASING.md` = Store submission / update checklist.
4. `docs/PERFORMANCE.md` = how to profile + current latency numbers.
5. `docs/RESEARCH.md` = naming, keyword, and competitor research (with sources).

## Tasks

Work is tracked in GitHub Issues on https://github.com/mattherwig/jumper (the task system; don't keep TODO lists in docs).

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
  src/lib/apps/                               app level (Back/Forward/Toggle/History)
    navigation.ts                             PURE back/forward state machine — all logic lives here, unit-tested
    history.ts                                PURE filters on the app list (exclude, remove), unit-tested
    load-history.ts                           glue: getRecentApps() + filters; removals + exclusions in LocalStorage; both commands read history through loadHistory()
    run-navigation.ts                         glue: read MRU, LocalStorage state, navigate(), activate
  src/lib/platform/                           macOS / Raycast glue shared by every level
    storage.ts                                LocalStorage JSON read/write; unreadable values fall back to defaults
    macos.ts                                  getRecentApps() (calls Swift) + activateApp() via Raycast open()
  swift/Sources/JumperNative/                 native helper: RecentApps.swift (logic, plain Swift) + Exports.swift (@raycast)
  assets/extension-icon.png                   Store icon, 512x512
  metadata/                                   Store screenshots, 2000x1250 (skill: store-screenshots)
  media/demo.gif                              README demo, shown on the Store page (skill: demo-gif)
  test/<level>/*.test.ts                      node:test, run via --experimental-strip-types; mirrors src/lib/
docs/                                         dev docs (not shipped)
scripts/bench.swift                           end-to-end latency bench (see docs/PERFORMANCE.md)
scripts/smoke.py                              end-to-end smoke test of every feature in Raycast (skill: smoke-test)
scripts/media/                                Store media generator: store_media.py drives Raycast (skills below), writes into extension/
README.md                                     GitHub landing page; points to extension/README.md
```

## Invariants (don't break)

- Command `name`s in `extension/package.json` (`back`, `forward`, `toggle`, `history`) are permanent: users' hotkeys bind to them.
- Adding, renaming, or changing a user-facing command or action: update `extension/README.md` (Commands, Setup, How it works; the Store shows it), `extension/CHANGELOG.md`, the `extension/package.json` `description`, and the Layout table here, all in the same commit.
- Keep PURE modules (`apps/navigation.ts`, `apps/history.ts`) free of Raycast/Node imports so `npm test` works without Raycast.
- Activate apps with Raycast `open(app.path)` (ADR-007), never `NSRunningApplication.activate` (silently ignored on macOS 14+ from background; ADR-002).
- Each exported Swift call spawns a process (~7ms): keep `@raycast` functions few and coarse. Profile any change on the hot path: `docs/PERFORMANCE.md`.
- No prebuilt binaries in the repo; Swift is compiled from source by `ray build` (Store rule, ADR-008). `extension/assets/compiled_raycast_swift/` is build output and stays gitignored.
- Any Swift file using `@raycast` must `import Foundation` (the macro expands to NSObject code). `ray build` hides Swift errors; run `swift build` in `extension/swift/` to see them. The first build on a machine fetches swift-syntax (a few minutes).
- No-view commands: `closeMainWindow()` must run before activating, or Raycast restores focus and undoes the jump (ADR-004). View command (list): the reverse — activate first, since closing unmounts the view and kills the command (ADR-009).
- Nothing dev-only in `extension/`: publish copies the whole folder into raycast/extensions (ADR-012).
- Max 12 `keywords` in package.json (`ray lint` enforces).
- Store rules: MIT, US English, Title Case titles, `CHANGELOG.md` top entry `## [Title] - {PR_MERGE_DATE}`.

## Verifying end to end (no hotkey needed)

With `npm run dev` running (in `extension/`), trigger commands via deeplink and inspect frontmost app:

```bash
open -g "raycast://extensions/matt_herwig/jumper/back"
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
