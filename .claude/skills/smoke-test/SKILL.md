---
name: smoke-test
description: End-to-end smoke test of every Jumper feature in the real Raycast app (Back, Forward, Toggle, History, Remove/Exclude/Include, quit and manual-switch handling), on the dev or distribution build. Use after changing behavior, before any publish, after macOS or Raycast updates, or when asked to smoke test / verify the extension works.
---

# Smoke test

`scripts/smoke.py` drives the installed extension by deeplink and checks which app ends up frontmost after each step. 30 checks, ~2 minutes (~2½ with `--dist`). Unit tests (`cd extension && npm test`) cover the pure logic; this covers the real thing: the Swift helper's app order, LocalStorage state, activation through Raycast, and the History UI.

## Before running

Same setup as the media skills (see `store-screenshots`):
1. **Warn the owner and get a go-ahead**: it takes over the screen (opens apps, switches between them, types into Raycast). Hands off keyboard and mouse.
2. Accessibility + Screen Recording granted to the app running it; **Always Run Command** chosen once for `back`, `forward`, `toggle`, `history` (the script stops if Raycast shows the "Request to run" prompt).
3. Dev build: one `ray develop` running from `extension/` (`pgrep -fl "ray develop"`). For `--dist` it doesn't matter: the script stops dev mode, runs `npx ray build -e dist` into Raycast's installed copy, and restarts dev mode at the end.

## Run

```bash
python3 scripts/smoke.py          # dev build
python3 scripts/smoke.py --dist   # distribution build (what the Store ships); do this before publishing
```

Exit code 0 = all checks passed. Each line prints the step, the expected frontmost app, and what macOS reports.

## What it checks

| Scenario | Checks |
|---|---|
| Back / Forward walk | Back ×3, Forward ×3, Forward at newest does nothing |
| Toggle | flips between the last two apps; a Back right after keeps walking deeper |
| Manual switch mid-walk | Forward does nothing afterwards (fresh history), Back goes from the new app |
| Quit mid-walk | Forward skips an app that quit (only quits an app the script launched) |
| History | ↓↓ ↩ and ↓ ↩ switch to the right rows |
| Remove from History (⌃X) | Back skips it; after switching to it manually it's back |
| Exclude / Include (⌃⇧X, Include) | Back skips it; after Include it's back. Include runs in a `finally`, so a failure never leaves an app excluded |

Not covered: "Back at oldest" (the owner's own apps lie past the demo apps; `navigation.test.ts` covers it) and real hotkey presses (Raycast ignores synthetic hotkeys; press them by hand once).

## How it knows the expected app

- It sets up a known app order itself with `DemoApps` from `scripts/media/store_media.py` (built-in apps launched with `open -a`, the owner's Ghostty activated if running; nothing is framed or moved). Don't set up order with AppleScript `activate`: an AppleScript-activated Finder did not register in macOS's app order and produced false failures.
- `Model` in `smoke.py` mirrors the rules in `extension/src/lib/navigation.ts` (snapshot, cursor, fresh start on manual switch, Toggle always fresh, skip quit apps) and `history.ts` (removed apps hidden until frontmost again, excluded apps hidden, frontmost never hidden). **If you change those rules, update `Model` too**, or the smoke test reports the new behavior as a failure.
- Compares by process name (`ghostty` is lowercase; see `PROCESS` in `store_media.py`).

## After running

- Failures: rerun once (a slow app launch can race the 1.3s step); if it repeats, it's real. Check `sm.frontmost()` output vs expected, then the dev log (`ray develop` terminal, or the log path the script prints after `--dist`).
- Cleanup is automatic: apps the script launched are quit, the previous app is re-activated, Ghostty is never closed. `rm -rf extension/swift/.build` afterwards if you're about to publish (`--dist` builds recreate it).
