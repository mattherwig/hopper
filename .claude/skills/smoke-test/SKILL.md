---
name: smoke-test
description: End-to-end smoke test of Jumper in the real Raycast app, in suites (nav = Back/Forward/Toggle, history = History + Remove/Exclude, tabs = Tabs search and jump), on the dev or distribution build. Run only when the owner asks for it or agrees to it (it takes their screen for ~30s–2½ min depending on suites); suggest it, naming the suites `--changed` picks and why, after user-facing behavior changes or macOS/Raycast updates.
---

# Smoke test

`scripts/smoke.py` drives the installed extension by deeplink and checks which app (and Safari tab) ends up frontmost after each step. Unit tests (`cd extension && npm test`) cover the pure logic; this covers the real thing: the Swift helper's app order, LocalStorage state, activation through Raycast, the History UI, and Tabs search + jump.

| Suite | Covers | Checks | Time |
|---|---|---|---|
| `nav` | Back, Forward, Toggle, manual switch, quit mid-walk | 21 | ~50s |
| `history` | History list, Remove, Exclude/Include | 11 | ~50s |
| `tabs` | Tabs: search (exact, typo, app name) and jump to a Safari tab / app | 3 | ~20s |

Plus ~20s setup (demo apps). Suites run in that order.

## When to run

Only on request, or after the owner agrees to a suggestion. It takes over their screen. Worth suggesting when user-facing behavior changed or after a macOS/Raycast update; not for refactors, docs, or media. `cd extension && npm test` is the cheap check for logic changes.

Suggest only the suites the change needs: `python3 scripts/smoke.py --changed --list` prints them (from the branch's diff vs `origin/main` plus uncommitted files, via `AFFECTS` in `smoke.py`). Name them and the time when suggesting, e.g. "tabs suite, ~40s, because the Tabs search changed". Full run (all suites, `--dist`) before publishing. When adding a source file, add it to `AFFECTS` if the prefix rules don't already place it (anything unlisted under `extension/` runs every suite).

## Before running

Same setup as the media skills (see `store-screenshots`):
1. **Warn the owner and get a go-ahead**: it takes over the screen (opens apps, switches between them, types into Raycast). Hands off keyboard and mouse.
2. Accessibility + Screen Recording granted to the app running it; **Always Run Command** chosen once for `back`, `forward`, `toggle`, `history`, `tabs` (the script stops if Raycast shows the "Request to run" prompt).
3. Dev build: one `ray develop` running from `extension/` (`pgrep -fl "ray develop"`). For `--dist` it doesn't matter: the script stops dev mode, runs `npx ray build -e dist` into Raycast's installed copy, and restarts dev mode at the end.

## Run

```bash
python3 scripts/smoke.py --changed        # suites this branch needs (dev build)
python3 scripts/smoke.py --only tabs      # chosen suites: nav, history, tabs
python3 scripts/smoke.py                  # every suite
python3 scripts/smoke.py --dist           # every suite on the distribution build (what the Store ships); before publishing
```

`--changed --list` prints the suites without running anything.

Exit code 0 = all checks passed. Each line prints the step, the expected frontmost app, and what macOS reports.

## What it checks

| Scenario (suite) | Checks |
|---|---|
| Back / Forward walk (nav) | Back ×3, Forward ×3, Forward at newest does nothing |
| Toggle (nav) | flips between the last two apps; a Back right after keeps walking deeper |
| Manual switch mid-walk (nav) | Forward does nothing afterwards (fresh history), Back goes from the new app |
| Quit mid-walk (nav) | Forward skips an app that quit (only quits an app the script launched) |
| History (history) | ↓↓ ↩ and ↓ ↩ switch to the right rows |
| Remove from History, ⌃X (history) | Back skips it; after switching to it manually it's back |
| Exclude / Include, ⌃⇧X (history) | Back skips it; after Include it's back. Include runs in a `finally`, so a failure never leaves an app excluded |
| Tabs (tabs) | exact title of staged Safari tab 3 → Safari on tab 3; "textedt" → TextEdit; typo'd title of tab 2 → Safari on tab 2 |

Not covered: "Back at oldest" (the owner's own apps lie past the demo apps; `navigation.test.ts` covers it) and real hotkey presses (Raycast ignores synthetic hotkeys; press them by hand once).

## How it knows the expected app

- It sets up a known app order itself with `DemoApps` from `scripts/media/store_media.py` (built-in apps launched with `open -a`, the owner's Ghostty activated if running; nothing is framed or moved). Don't set up order with AppleScript `activate`: an AppleScript-activated Finder did not register in macOS's app order and produced false failures.
- `Model` in `smoke.py` mirrors the rules in `extension/src/lib/apps/navigation.ts` (snapshot, cursor, fresh start on manual switch, Toggle always fresh, skip quit apps) and `history.ts` (removed apps hidden until frontmost again, excluded apps hidden, frontmost never hidden). **If you change those rules, update `Model` too**, or the smoke test reports the new behavior as a failure.
- Compares by process name (`ghostty` is lowercase; see `PROCESS` in `store_media.py`).

## After running

- Failures: rerun once (a slow app launch can race the 1.3s step); if it repeats, it's real. Check `sm.frontmost()` output vs expected, then the dev log (`ray develop` terminal, or the log path the script prints after `--dist`).
- Cleanup is automatic: apps the script launched are quit, the previous app is re-activated, Ghostty is never closed. `rm -rf extension/swift/.build` afterwards if you're about to publish (`--dist` builds recreate it).
