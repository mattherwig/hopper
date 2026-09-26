# Jumper

A browser-style Back button for your Mac's apps.

Cmd+Tab only knows "most recent" and reshuffles every time you switch, so getting back to the app you were in three switches ago is guesswork. Jumper lets you step back through your recently used apps, and forward again, exactly like history in Safari or VS Code.

## Commands

- **Jump Back to Previous App**: switch to the app you used before this one. Run it again to keep going back.
- **Jump Forward to Next App**: retrace a Jump Back step.
- **Show App History**: list running apps from most to least recently used and jump to any of them.

## Setup

Jump Back and Jump Forward are meant to be used with hotkeys:

1. Open Raycast Settings → Extensions → Jumper.
2. Assign a hotkey to each command, for example `⌃⌥[` and `⌃⌥]`.

No permissions and no background process needed. The extension reads the order macOS already keeps for Cmd+Tab.

## How it works

- The first **Jump Back** remembers your current app order and moves one step back.
- Pressing Back again goes further; **Jump Forward** retraces.
- Switching apps any other way (click, Cmd+Tab) starts a fresh history, just like visiting a new page in a browser clears the forward history.
- Apps you quit are skipped.
