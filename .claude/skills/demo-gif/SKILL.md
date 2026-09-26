---
name: demo-gif
description: Record Jumper's demo GIF (extension/media/demo.gif, shown at the top of the README and so on the Store page) by driving Back, Forward, Toggle, and History on this Mac. Use when commands or their behavior change, or when asked to redo the demo/GIF/screencast.
---

# Demo GIF

Produces `extension/media/demo.gif` (~27s, ~3.4 MB): a title card, Back ×3, Forward ×3, Toggle ×2, then History (↓↓↓ ↩), and an end card. Each step shows keycaps with the owner's hotkeys and a caption. `extension/README.md` embeds it as `![Jumper demo](media/demo.gif)`; Raycast requires README media in a `media/` folder at the extension's top level. The root GitHub README embeds it as `extension/media/demo.gif`. The same clip works as the PR screencast and for launch posts.

## Before running

Same prerequisites as the `store-screenshots` skill: warn the user and get a go-ahead (the screen is taken over for ~45s), one `ray develop` running, Accessibility + Screen Recording granted, and **Always Run Command** chosen once for each of `back`, `forward`, `toggle`, `history` (otherwise every deeplink stops at Raycast's "Request to run" prompt and nothing switches). Also needs `ffmpeg` (`brew install ffmpeg`).

## Run

From the repo root:

```bash
python3 scripts/media/store_media.py gif
```

What it does (`scripts/media/store_media.py`):
- Opens History once to measure Raycast's window, and sets the recording area to that plus a margin.
- Brings up the demo apps (see `DEMO_APPS`) and moves every framed app's window exactly onto the recording area, so the user's own windows behind are never recorded. Framed: Finder on /System/Applications, Preview on the icon, the owner's **Ghostty** window, TextEdit on a scratch note.
- **Ghostty is the owner's live session: never quit or close it.** The script only uses it if already running, saves its window frame, and restores it afterwards (position before size, or macOS clips the width).
- Parks the pointer outside the area, then starts `keycast.swift`, an accessory-app overlay (never takes focus, so it doesn't disturb the app history being demoed) that draws the keycaps HUD and the full-frame title cards. Keys come from `HOTKEYS` in `store_media.py` (the owner's bindings, also the README's suggested hotkeys: change both together and rerun); commands are actually triggered by deeplink, as Raycast ignores synthetic hotkeys.
- Stops if Raycast's window is still up a second after the first run of a no-view command: that is the "Request to run" prompt.
- Records the area with `screencapture -v -R`, converts with ffmpeg (15 fps, 960px wide, palette), cleans up the apps it launched.

## After running: review before committing (required)

Make a contact sheet and read it:

```bash
ffmpeg -loglevel error -y -i extension/media/demo.gif -vf "select='not(mod(n\,30))',scale=480:-1,tile=4x4" -frames:v 1 "$TMPDIR/contact.png"
```

Check:
- Every step actually switched app (the frontmost window changes); no Raycast "Request to run" dialog anywhere.
- Nothing personal: only demo windows (including what's on screen in Ghostty), Raycast's History view, and labels. If a user window, notification, or menu shows up, delete the GIF and rerun (turn on Do Not Disturb).
- Size stays reasonable (under ~4 MB); lower `fps` or `scale` in `gif()` if not.

Then make sure `extension/README.md` starts with the demo image, `cd extension && npm run check`, commit `extension/media/demo.gif`.
