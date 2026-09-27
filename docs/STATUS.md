# Status

_Narrative snapshot. Update at the end of every session that changes state. Actionable work lives in GitHub Issues (see CLAUDE.md → Tasks), not here._

## 2026-09-27 — Agent level, Search, herdr, Ghostty (ADR-022–024, branch `agents/levels`)

- Levels: App → Tab → Pane (new) as places; Agent as an overlay (status + host, located into places); Project (git repository) as a grouping. Research per app family by subagents; what fits and what didn't is in ADR-022.
- New commands `agents` (Agents) and `next-agent` (Next Agent). Sources: Claude Code (all surfaces, `~/.claude/sessions`), Codex (thread db + rollout logs; app and CLI, verified live with the Codex app), Cursor (`state.vscdb`), herdr (socket), agent CLIs by process name. Web agents cut (owner).
- Tabs / Tabs in Current App retitled **Search** / **Search Current App** (names unchanged). Agents show as rows in their app's section and as a status tag on their tab.
- herdr (0.9.1) verified live: workspaces and named tabs under the terminal running herdr, the Claude session in a pane merged into its herdr pane, `pane.focus`, the terminal tab holding herdr selected (tty in iTerm/cmux/Terminal; Ghostty by title marker, idea from the Raycast Store's Herdr extension).
- cmux lists workspaces and their terminals by name; Ghostty 1.3 source (Ghostty upgraded 1.2.3 → 1.3.1, verified live after restart); Claude processes found before they register (argv[0] names); Codex CLI upgraded to 0.157.1.
- Verified: 112 unit tests, lint, build; agent loading and the cmux/iTerm/herdr/Ghostty reads against this Mac. Not verified live: jumping from Raycast (pane selection, Next Agent), Cursor (not running); Codex "working" seen only in tests (the live thread had finished).
- Next: owner smoke test in Raycast; retake the demo GIF and Store screenshots (they say "Tabs"); menu bar agent status (idea).

## 2026-09-27 — Switch apps like Cmd+Tab (ADR-021)

- Bug: Back to TV playing a show fullscreen showed TV's home window. Cause: Raycast `open()` sends a reopen event. Now `activateApp()` sets `AXFrontmost` via the Swift helper (`frontApp`), falling back to `open()` without Accessibility or when the main window is minimized/missing.
- Verified live in Raycast (deeplink + owner's hotkey): TV back to the fullscreen player; Calculator across Spaces; minimized Calculator and window-less TextEdit via fallback. Cost ~30–40ms per switch; faster private path: #25.

## 2026-09-26 — Claude conversations by deep link; private windows excluded (ADR-017, ADR-018, branch `tabs/muse-reveal-claude-links`)

- Muse 4.1 hides its Side chats list, so Tabs lists Muse's window unless the panel is open. A reveal (press the button, read, press again) was built, verified live, then removed at the owner's call: too hacky. Owner rule: UI-changing workarounds need a yes first.
- Claude: page URL (`webPage` Swift call, ~3ms) teaches title → `chat/<uuid>` / `cowork/<cse_id>`; those open by `claude://claude.ai/<path>` (tested live), and stay listed with the sidebar hidden (20 most recent). Archived Code sessions' deep link lands on the Code home screen: still skipped.
- Reopen capabilities for all sources researched and tested live: #21 (Recently Closed). Limits and stress test: #22. New app issues: Messages #15, Codex #16, Cursor #17, Notes #18, Notion #19.
- Incognito/private windows left out of Tabs entirely (ADR-018): Chromium by `mode`, Safari by AX title matched to AppleScript windows (fails closed; Safari now needs Accessibility), fallback by title. Chrome script verified live (25 tabs, 0 incognito).
- Muse reveal removed (owner: too hacky); Muse lists its window unless the Side chats panel is open.
- Recently Closed (ADR-019, #21 v1): browser tabs by URL and documents by file path, from consecutive reads. Swift `readWindows` now returns each window's AXDocument (verified live: TextEdit file; Terminal/Ghostty folders, skipped).
- Merged main (Notion source): Claude now reads its page through Notion's shared `webPages` call; my ADRs renumbered 017–019. Notion tabs select and reopen via `notion://…?deepLinkOpenNewTab=true` (ADR-020; tested live: switches to the existing tab, exact URL required).
- Not yet run in Raycast (dev build) or through the smoke test.

## 2026-09-26 — Tabs search: typo-tolerant, app first (ADR-015, branch `feature/tab-search-ranking`)

- Tabs filters with `tabs/search.ts` instead of Raycast's filter: "caude" finds Claude; typing an app's name lists that app's tabs before browser/terminal tabs titled with it. Matching is Fuse.js (swapped from ~100 lines of custom scoring); demo GIF query now "github pages" (Fuse has no abbreviations). Live in Raycast: "claude" and "caude" both list the Claude app's 13 sessions first. Smoke test 32/32.

## 2026-09-26 — Landing page: tab level + new tagline (branch `site/tabs-branding`)

- `site/index.html` rebuilt around "Jump to any app, tab, or session": demo GIF up top, Apps and Tabs as equal columns (Store screenshots jumper-1 / jumper-5, symlinked), how it works for both, supported-apps table, permissions in Setup.

## 2026-09-26 — Notion tabs (#19)

- Notion source (`sources/notion.ts`) reuses the sidebar reader on Notion's "Tab Bar" web view: tabs are AXButtons titled with the page name; AXPress switches tabs (verified live, Notion 7.35.1). No AXSelected on tabs, so the active tab is the one matching the window title.
- Only the front window's tab bar is read; other Notion windows are listed as windows. Tabs with the same page title appear once.
- `notion://www.notion.so/<id>` deep links exist but navigate the *current* tab, so they aren't used for switching. `state.json` holds tabs only as saved at quit, not live.
- Parent pages (ADR-016): each tab's web view URL gives its page id; one `sqlite3 -readonly` query on `notion.db` walks parents. Shown nearest-first within 36 chars (`… / Pinterest / Jordan Convo 2`), full path on hover and searched. Verified against the live cache (23ms for 6 pages); pages whose database isn't cached get no path.
- Not done: live run through Raycast (smoke test not run).

## 2026-09-26 — Claude Code sessions without the sidebar (ADR-014)

- Claude source reads Claude's session files and opens sessions with `claude://code/continue?session=<id>`: listed across projects, most recent first, with the sidebar hidden. Deep link verified live; source verified against the real files (11 sessions, 16ms). Chat-mode conversations still come from the sidebar.
- Muse has no equivalent (probed: no deep link, Spotlight items, or local chat list): #13.

## 2026-09-26 — Tab level merged to main (ADR-013)

Done:
- Tabs + Tabs in Current App commands: Chromium browsers, Safari, cmux, iTerm, Terminal (AppleScript), Claude + Muse sidebars and any app's windows / native tabs (Accessibility).
- `src/lib` regrouped by level (`apps/`, `tabs/`, `platform/`). 43 unit tests, sources tested against a fake Platform.
- AppleScript for every source compile-checked against the real dictionaries and run live (read-only); Claude and Muse read and open verified from a standalone helper build. Prototype jumps tested by owner for cmux, iTerm, Terminal, Muse.

- Owner smoke-tested the app-level commands on this branch (History uses the new shared SwitchAction): good.

Not done: Messages (probed, out: rows are unlabeled groups whose only text is "name, preview, time", and group names contain commas); Cursor (descoped, needs a spike); tab Back/Forward (needs a switch recorder).

## 2026-09-26 — GitHub Pages landing page (branch `site/github-pages`)

- `site/index.html`: hero, demo GIF, commands, how it works, setup. (An interactive in-browser playground was prototyped and dropped: the GIF shows the real thing.) Deployed by `.github/workflows/pages.yml` on push to `main`; Pages source set to GitHub Actions.
- Store button points at the not-yet-live listing: follow-up in #8.

## 2026-09-26 — v1 submitted to the Raycast Store (#1)

Done:
- Commands: Back, Forward, Toggle, History.
- Pure navigation logic + 6 unit tests passing; `ray lint` + `ray build` clean.
- E2E verified via deeplinks on macOS 26.5 and again on macOS 27.0 / Xcode 27 with the Swift helper.
- Perf: in-command time 140ms → ~48ms. App list now read by a native Swift helper (ADR-008, #2), measured on macOS 27 / Xcode 27.
- Icon: owner-supplied design (purple back/forward arrows), `extension/assets/extension-icon.png` 512×512.
- Raycast author confirmed: `matt_herwig`. Owner has hotkeys bound and is dogfooding.
- Public repo: https://github.com/mattherwig/jumper. Tasks tracked as Issues.

- History actions: Remove from History (hidden until used again, inferred from MRU order) and Exclude from History (#4; permanent, undo from the Excluded section). Stored in LocalStorage, not preferences, since commands can't write preferences. Unit-tested; not yet dogfooded in Raycast.

- Toggle command (#5, ADR-010): flips between the two most recent apps. E2E-verified via deeplinks while recording the demo GIF.

- Commands renamed to Back / Forward / Toggle / History, IDs `back` / `forward` / `toggle` / `history` (ADR-011). Owner rebound hotkeys (⇧⌘[ / ⇧⌘] / ⌘⌘ / History).

- Store media (#11): `extension/metadata/jumper-1..5.png` (5 = Tabs) + `extension/media/demo.gif` (README; includes a Tabs jump), generated by `scripts/media/store_media.py`; rerun via the `store-screenshots` / `demo-gif` skills.

- Repo split (ADR-012): the extension moved to `extension/` so `npm run publish` (run from there) ships only the extension, not docs/, scripts/, CLAUDE.md. The open publish PR still contains the old dev files; republish from `extension/` to update it.

Next: Raycast review of the publish PR (#1 has the link); reply to review comments within 21 days. Then `gh issue list`.
