---
name: demo-gif
description: Record Hopper's demo GIF (extension/media/demo.gif, shown at the top of the README and so on the Store page) by driving Back, Forward, Toggle, History, and Tabs on this Mac. Use when commands or their behavior change, or when asked to redo the demo/GIF/screencast.
---

# Demo GIF

Produces `extension/media/demo.gif` (~24s, ~3 MB at 12 fps): a title card (the tagline), Back ×2, Forward ×2, Toggle ×2 (all cycling through the same three staged windows), History (↓↓ ↩), Tabs (paste the query "github pages" ↩, lands on the owner's cmux workspace `github-pages`), and an end card. Each step shows keycaps with the owner's hotkeys and a caption. `extension/README.md` embeds it as `![Hopper demo](media/demo.gif)`; Raycast requires README media in a `media/` folder at the extension's top level. The root GitHub README embeds it as `extension/media/demo.gif`. The same clip works as the PR screencast and for launch posts.

## Before running

Same prerequisites as the `store-screenshots` skill: warn the user and get a go-ahead (the screen is taken over for ~45s), one `ray develop` running, Accessibility + Screen Recording granted, and **Always Run Command** chosen once for each of `back`, `forward`, `toggle`, `history`, `tabs` (otherwise every deeplink stops at Raycast's "Request to run" prompt and nothing switches). Also needs `ffmpeg` (`brew install ffmpeg`).

## Run

From the repo root:

```bash
python3 scripts/media/store_media.py gif
```

What it does (`scripts/media/store_media.py`):
- Opens History once to measure Raycast's window, and sets the recording area to that plus a margin.
- Starts `keycast.swift` and brings up the demo apps (see `DEMO_APPS`). Before the first **staged** app (Safari with `SAFARI_TABS`, Preview on the icon, TextEdit on a scratch note), keycast puts up a dark Raycast-style **backdrop** at normal window level over the recording area: everything activated before it (the other demo apps, the owner's own windows) stays hidden behind it, and the staged windows come up above it, staggered from top left to bottom right, so each Back/Forward/Toggle visibly brings a different window forward. Then it re-activates the staged apps with `open -a` (again right before recording) so they're the three most recent.
- **Only staged apps may become frontmost during the demo**: activating any other app raises all its windows over the backdrop. Finder was dropped from `DEMO_APPS` for this: it registered in the app order late, Back landed on it, and its sidebar showed the owner's home folder name.
- **Ghostty is the owner's live session: never quit, close, or move it.** It's only activated (if already running) to fill a History row.
- Parks the pointer outside the area. `keycast.swift` is an accessory-app overlay (never takes focus, so it doesn't disturb the app history being demoed) that draws the keycaps HUD and the full-frame title cards. Keys come from `HOTKEYS` in `store_media.py` (the owner's bindings, also the README's suggested hotkeys: change both together and rerun); commands are actually triggered by deeplink, as Raycast ignores synthetic hotkeys.
- Stops if Raycast's window is still up a second after the first run of a no-view command: that is the "Request to run" prompt.
- Tabs step: opens Tabs once before recording to warm its cache (it shows the cached list first; otherwise that would be from the owner's own use). Then it **pastes** `tab_query` ("github pages", matching the owner's cmux workspace `github-pages`; cmux fills the screen, so the jump covers the recording area). If the owner's tabs change, test candidate queries first (open Tabs, `paste()`, capture Raycast's window) and pick one whose top result is the target and whose other results show nothing private. Lessons from getting this wrong:
  - Arrow keys are unreliable in Tabs: the selection after the cached list refreshes varies from run to run, and one run jumped to the owner's own Safari Start Page window, outside the recording area.
  - Tabs ranks results across all apps with Fuse.js (ADR-015), not by section order: a query matching a Chrome tab title can put that section first. Abbreviations like "gh-pages" no longer match.
  - Nothing showing the owner's name: no staged page or window with it (the staged GitHub tab is `raycast/extensions`, not the owner's repo).
  - Typing letter by letter flashes every prefix's matches ("gol" showed a Gmail tab with the owner's address). Paste instead (`paste()` restores the clipboard's text).
  - After recording, the script warns if the jump didn't land on `tab_target`: treat that GIF as bad.
- Records the area with `screencapture -v -R`, converts with ffmpeg (12 fps, 960px wide, palette), cleans up the apps it launched.

## After running: review before committing (required)

Make a contact sheet and read it:

```bash
ffmpeg -loglevel error -y -i extension/media/demo.gif -vf "select='not(mod(n\,30))',scale=480:-1,tile=4x4" -frames:v 1 "$TMPDIR/contact.png"
```

Check:
- Every step actually switched app (the frontmost window changes); no Raycast "Request to run" dialog anywhere.
- Nothing personal: only demo windows (including what's on screen in Ghostty), Raycast's History view, and labels. If a user window, notification, or menu shows up, delete the GIF and rerun (turn on Do Not Disturb).
- Every Back/Forward/Toggle brings a staged window forward over the backdrop; no other app's window appears.
- The Tabs step shows only staged rows before the query, the filtered results are harmless, and it ends on the cmux workspace.
- Nowhere shows the owner's name (Finder sidebars, GitHub tabs) or email.
- Size stays reasonable (under ~5 MB); lower `fps` or `scale` in `gif()` if not.

Then make sure `extension/README.md` starts with the demo image, `cd extension && npm run check`, commit `extension/media/demo.gif`.
