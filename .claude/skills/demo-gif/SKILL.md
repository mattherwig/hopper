---
name: demo-gif
description: Record Hopper's demo GIF (extension/media/demo.gif, shown at the top of the README and so on the Store page) by driving Search, Agents, Back, Forward, and Toggle on this Mac. Use when commands or their behavior change, or when asked to redo the demo/GIF/screencast.
---

# Demo GIF

Produces `extension/media/demo.gif` (~30s, under 5 MB): title card ("Built for context switchers"), Search, `macos` typed out, jump to that Safari tab, Agents, `obsidian` typed out, jump to Claude, History, Back ×2, Forward, copy the word Hopper, Toggle, paste it into Google, end card. `extension/README.md` embeds it as `![Hopper demo](media/demo.gif)`. The root README embeds `extension/media/demo.gif`. The same clip is the PR screencast.

## Before running

Same prerequisites as the `store-screenshots` skill: warn the user and get a go-ahead (the screen is taken over for about a minute), one `ray develop` running, Accessibility + Screen Recording granted, and **Always Run Command** chosen once for each of `back`, `forward`, `toggle`, `history`, `tabs`, `agents` (otherwise a deeplink stops on "Request to run"). Also needs `ffmpeg` (`brew install ffmpeg`). The script minimizes other apps' windows for the take and restores them after. Claude is resized, not quit.

## Run

From the repo root:

```bash
python3 scripts/media/store_media.py gif
```

What it does (`scripts/media/store_media.py`, `gif()`):
- The cast is three real apps, staggered on the backdrop: Notion, Safari (the macOS page, Google, the Raycast Store), and a TextEdit note whose only word is `Hopper`. No Chess, Dictionary, or other filler apps. History should show apps a person actually uses.
- **Size every window before it comes forward.** Notion left at its real size covered the backdrop. Claude is placed in the frame while it is still covered, and placed again before Return, so the jump reveals it already fitted. `open -a` during the take brings the old size forward first; `place()` sets fullscreen off, then size, then position, before the command that activates the app.
- Other apps' windows, and extra windows of a staged app (the owner's other Safari windows), are minimized for the take and restored after. Activating an app raises all of its windows over the backdrop.
- **Keycaps are only Hopper commands** (Search, Agents, Back, Forward, Toggle, History, Return to jump). Do not label `macos`, `obsidian`, ⌘C, or ⌘V as commands. Copy still happens; the note coming forward is the cue. Paste still happens; the word landing in Google is the cue.
- Queries are typed one character at a time (~0.18s), starting shortly after the list appears. A long hold after Search looks stuck. A second paste appends (`macosmacos`). Do not type `raycast`: the app name weighs most (ADR-015). Each prefix's matches flash; check the contact sheet for a private row.
- Arrow keys in Search are unreliable. Return on the typed query. The script warns if a jump misses Safari or Claude.
- `keycast.swift` draws the HUD and title cards and never takes focus. Commands are deeplinked; Raycast ignores synthetic hotkeys. Keys in the HUD are `HOTKEYS` (the README's suggested bindings).
- Stops if Raycast's window is still up after a no-view command: that is "Request to run".
- The recording length has to cover typing and `place()` time. A short `-V` cuts off Toggle, the paste, and the end card.
- Records with `screencapture -v -R`, converts with ffmpeg (12 fps, 960px wide, palette).

**Ghostty is the owner's live session: never quit, close, or move it.** The GIF cast does not include it. Finder was dropped from the old filler list: its sidebar shows the home folder name, and it registered in the app order late so Back landed on it.

## After running: review before committing (required)

Make a contact sheet and read it:

```bash
ffmpeg -loglevel error -y -i extension/media/demo.gif -vf "select='not(mod(n\,30))',scale=480:-1,tile=4x4" -frames:v 1 "$TMPDIR/contact.png"
```

Check:
- Every step actually switched app (the frontmost window changes); no Raycast "Request to run" dialog anywhere.
- Nothing personal: only the staged windows, Raycast's Search and Agents lists, the one agent jumped to, and labels. If a user window, notification, or menu shows up, delete the GIF and rerun (turn on Do Not Disturb).
- Every Back/Forward/Toggle brings a staged window forward over the backdrop; no other app's window appears.
- Search shows the list, then `macos` appearing character by character under the Search label (not as its own keycap), and lands on Safari. Agents does the same with `obsidian` and lands on a Claude window that already fits the frame. Notion is one of the three staggered windows, not a full-bleed page behind them.
- The note says `Hopper`. No ⌘C or ⌘V keycap. Toggle is followed by that word in Google. The clip ends on the end card.
- Nowhere shows the owner's name (Finder sidebars, Notion workspace name, GitHub tabs) or email.
- Size stays reasonable (under ~5 MB); lower `fps` or `scale` in `gif()` if not.

Then make sure `extension/README.md` starts with the demo image, `cd extension && npm run check`, commit `extension/media/demo.gif`.
