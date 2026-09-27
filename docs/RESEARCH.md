# Research (2026-09-26)

## How people phrase the need

Proxies used: Google autocomplete, Stack Exchange votes/views, HN points. (Google Trends returned 429 — unavailable.)

1. **"alt tab mac"** — dominant demand. [SU: make ⌘-Tab behave like Alt-Tab](https://superuser.com/questions/193922) 267 votes / 227k views; AltTab Show HN [156 pts](https://news.ycombinator.com/item?id=21253850), [106 pts](https://news.ycombinator.com/item?id=31330342).
2. **"switch between windows"** — [SU](https://superuser.com/questions/299241) 419 votes / 488k views.
3. **"app switcher mac"** — strong autocomplete; [HopTab HN](https://news.ycombinator.com/item?id=47474967) 141 pts.
4. **"switch between apps shortcut"** — strong autocomplete.
5. **"previous app" / "last app" / "toggle to previous app"** — describes *this* feature exactly but low volume. [SU: Toggle to previous App](https://superuser.com/questions/1828615), [MacRumors thread](https://forums.macrumors.com/threads/whats-your-preferred-way-of-quickly-switching-between-apps-and-why.2376264/).
6. **"app history mac"** — ambiguous (clipboard/App Store history).

**Takeaway:** people *search* "app switcher / switch apps / alt tab"; they *describe* "back/forward/previous app". Title = description of behavior, keywords = search terms.

## Store landscape

- No Store extension does Back/Forward app history (searched: switch, previous app, recent apps, app history, last app, window switcher, alt tab, toggle app).
- Nearest: Window Walker (search-based window switcher), Recents ("Recent Applications"), ShiftPlus (context sets), Raycast core "Switch Windows".
- Existing names nearby: jump, quick-jump, spacejump, hop, retrace, recents, window-walker.
- Mac-app precedent: "AppBeBack: CMD+Z for Apps", AltTab, Witch, Contexts, rcmd.

## Keywords (2026-09-26, with the Tabs commands)

How Raycast uses them ([manifest docs](https://developers.raycast.com/information/manifest)):
- Extension `keywords` (max 12): **Store search only**. The Store also matches title and description, so a keyword is only worth a slot if it's a phrase *not* already there (tabs, windows, sessions, apps, history, jump, browser are covered by the description).
- Command `keywords`: **root search** in the launcher, i.e. what an installed user types. Per command, no cap enforced; keep them few and specific.

Store search probes (`https://www.raycast.com/api/v1/store_listings/search?q=…`):
- Keywords do match: "alt tab" returns only Window Walker, via its `alt-tab` keyword.
- Open ground: "tab switcher" (no results), "app switcher" and "window switcher" (only unrelated tmux/media extensions), "recent apps", "previous app", "terminal tabs" (weak results).
- Crowded but relevant: "browser tabs", "switch tabs" (Browser Tabs, Firefox Tabs, browser extensions).
- "harpoon" matches the Harpoon extension (tag apps and switch between them, inspired by ThePrimeagen's Neovim plugin): people searching it want fast jumping, which Hopper does.

Dropped: "alt tab" and "cmd tab" (web-search terms, not how people search a Store; owner's call), "jump" and "app history" (already in the title/description), "last used app" (duplicate).

## Name

**Hopper** (`hopper`). Free in the Store; nearby names: Jump, Quick Jump, SpaceJump. Searchable terms live in command titles, description, and keywords. See ADR-005.

## Pitch (README / posts)

**Hopper**: Your Mac gets a browser-style Back button for apps. Cmd+Tab only knows "most recent" and reshuffles every time you switch, so walking back three apps is guesswork. Bind **Back** and **Forward** to hotkeys (e.g. ⌃⌘[ and ⌃⌘]; recommended set in `extension/README.md` Setup) and step through your recent apps exactly like Safari or VS Code history. **History** lists the trail so you can jump anywhere. No setup, no permissions, no background process.
