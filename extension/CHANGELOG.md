# Jumper Changelog

## [Tabs] - {PR_MERGE_DATE}

- Tabs command: search tabs, windows, and sessions across running apps (Chromium browsers, Safari, cmux, iTerm, Terminal, Claude, Muse, and any app's windows) and jump to one.
- Tabs in Current App command: the same for the frontmost app.
- Tabs search tolerates typos ("caude" finds Claude) and lists an app's own tabs before tabs that mention its name.
- Claude Code sessions are listed from Claude's session files (all projects, most recent first, sidebar hidden or not) and open via Claude's deep link.
- Claude Chat and Cowork conversations you've opened open via Claude's deep link, and stay listed with the sidebar hidden.
- Muse side chats are listed and opened even when Muse's side chats panel is closed (Muse 4.1).

## [Initial Version] - {PR_MERGE_DATE}

- Back and Forward commands, designed for hotkeys.
- Toggle command to flip between your two most recent apps.
- History command listing running apps by recent use.
- Remove from History action in History to hide an app until you use it again, and Exclude from History to hide it for good.
