---
name: store-screenshots
description: Regenerate Hopper's Raycast Store screenshots (extension/metadata/hopper-*.png, 2000x1250) by driving Raycast on this Mac. Use when the History or Tabs view's UI changes, before a Store submission or update, or when asked to retake/refresh screenshots.
---

# Store screenshots

Produces `extension/metadata/hopper-1.png` … `hopper-5.png`, the images on the Store page (Raycast requires them because History and Tabs are `view` commands; max 6, 2000×1250 PNG, first one is the hero).

| File | Shows |
|---|---|
| `hopper-1.png` | History list: Current tag, "n back" labels |
| `hopper-2.png` | History with the action panel (⌘K): Remove / Exclude from History and their shortcuts |
| `hopper-3.png` | Excluded section with Include in History (Chess is excluded for the shot, then included again) |
| `hopper-4.png` | Root search for "hopper": all commands, the second row selected (Raycast shows only the selected row's hotkey; its ranking follows usage) |
| `hopper-5.png` | Tabs, with Safari current: the staged Safari window's tabs on top, then the other demo apps' windows |

## Before running

1. **Warn the user**: the script takes over the screen for ~45s (opens apps, opens Raycast, types). Hands off keyboard and mouse. Get a go-ahead.
2. Dev mode running: `pgrep -fl "ray develop"` or start `cd extension && npm run dev` in the background (only one instance, two cause flaky reloads; it must be running from `extension/`, i.e. the path shows `hopper/extension/node_modules`, not a stale one from the old repo root).
3. Permissions for the app running the script (the Claude app): **Accessibility** (keystrokes) and **Screen Recording**. Check Accessibility without pressing keys: `osascript -e 'tell application "System Events" to get UI elements enabled'` → `true`. Only the user can grant these (System Settings → Privacy & Security); open the pane with `open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"`.
4. First deeplink to each command (including `tabs`) asks "Request to run … triggered outside of Raycast". The user must choose **Always Run Command** once per command (it is their Raycast setting; don't click it for them).

## Run

From the repo root:

```bash
python3 scripts/media/store_media.py screenshots
```

What it does (`scripts/media/store_media.py`):
- Brings up the `DEMO_APPS` (built-in apps with no personal content, plus the owner's Ghostty window if running) so they fill every visible History row and push the user's other apps out of view. Safari gets a new window with `SAFARI_TABS` (public pages); the owner's own Safari windows stay and show in Tabs' Safari section (check they're harmless). Tabs lists apps most recent first, so the owner's other apps' tabs (Chrome, Claude, Muse, Messages) sit below the visible rows. Afterwards it quits only the apps it launched and re-activates the previous app.
- Opens History by deeplink, drives it with System Events keystrokes, captures only Raycast's window (`screencapture -l`, via `raycast-window.swift`), and composites it on a purple gradient at 2000×1250 (`compose.swift`).
- Only sends Escape while Raycast's window is on screen, so it never lands in another app.

## After running: review every image (required)

Read each PNG and check:
- No personal data: only the demo apps in the list (in `hopper-5.png`: staged Safari tabs and demo windows only; the list first shows its cached copy, so the script waits 3.5s) (if the screen is taller and a user app appears at the bottom, add another neutral app to the start of `DEMO_APPS`), no names. `hopper-4.png` lists matching files from `~/Projects/hopper` below the commands; the owner accepted that.
- Chess shows in Recent in `hopper-1.png` (proves the previous run's exclusion was undone). If Chess stays excluded after a failed run: open History, find it in Excluded, Include in History.
- Sizes: `sips -g pixelWidth -g pixelHeight extension/metadata/*.png` → 2000×1250.
- **Raycast CI's image check passes** (it failed the first submission). Their CI requires ~12.5% padding on every side (8–17%), top/bottom and left/right within 4%, and the same background on every image. Run their checker locally:
  ```bash
  V="$TMPDIR/raycast-img-check"; python3 -m venv "$V" && "$V/bin/pip" -q install numpy pillow
  for f in check_raycast_images.py check_metadata_images.py; do gh api "repos/raycast/extensions/contents/scripts/$f" --jq .content | base64 -d > "$V/$f"; done
  "$V/bin/python" "$V/check_raycast_images.py" extension/metadata/*.png
  ```
  `compose.swift` handles this: shadowless capture (`screencapture -o`), cropped to visible pixels (the ⌘K panel adds transparent margin), 75% of the width, centered, with a symmetric drawn shadow.

Then `cd extension && npm run check`, commit `extension/metadata/`.

## Known limits

- Raycast ignores a synthetic ⌘Space, so root search is reached by opening History by deeplink and pressing Escape.
- Uses the current Raycast theme (light/dark) and window size. Raycast's own Window Capture (Settings → Advanced, "Save to Metadata") is the manual fallback.
