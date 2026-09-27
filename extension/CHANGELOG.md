# Jumper Changelog

## [Tabs] - {PR_MERGE_DATE}

- Tabs command: search tabs, windows, and sessions across running apps (Chromium browsers, Safari, cmux, iTerm, Terminal, Claude, Muse, and any app's windows) and jump to one.
- Tabs in Current App command: the same for the frontmost app.
- Tabs search tolerates typos ("caude" finds Claude) and lists an app's own tabs before tabs that mention its name.
- Claude Code sessions are listed from Claude's session files (all projects, most recent first, sidebar hidden or not) and open via Claude's deep link.
- Notion tabs: the front window's tabs (read from its tab bar) with each page's parent pages, then its other windows.
- Claude Chat and Cowork conversations you've opened open via Claude's deep link, and stay listed with the sidebar hidden.
- Incognito and private browser windows are left out of Tabs entirely.
- Recently Closed section in Tabs: reopen browser tabs, Notion pages, and documents closed since Tabs last looked, with Remove and Clear actions.
- Notion tabs open through Notion's own link, which switches to the tab showing the page in any window.

## [Initial Version] - {PR_MERGE_DATE}

- Back and Forward commands, designed for hotkeys.
- Toggle command to flip between your two most recent apps.
- History command listing running apps by recent use.
- Remove from History action in History to hide an app until you use it again, and Exclude from History to hide it for good.
