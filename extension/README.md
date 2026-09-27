# Jumper

![Jumper demo: Back, Forward, Toggle, History, and Search](media/demo.gif)

Jump to any app, tab, or agent on your Mac.

Cmd+Tab only knows "most recent" and reshuffles every time you switch, so getting back to the app you were in three switches ago is guesswork. Jumper lets you step back through your recently used apps, and forward again, exactly like history in Safari or VS Code. And when what you want is a browser tab, a terminal tab, or a Claude session, search them all in one list and jump straight there. And when you have AI agents going in several places (Claude Code in a terminal and in the Claude app, Cursor, Codex, herdr), see which ones need you and jump to the one waiting longest.

## Commands

- **Back**: switch to the app you used before this one. Run it again to keep going back.
- **Forward**: retrace a Back step.
- **Toggle**: flip between your two most recent apps. Run it again to switch back.
- **History**: list running apps from most to least recently used and jump to any of them.
- **Search**: search everything open on your Mac and jump straight to it: browser tabs, terminal tabs, herdr workspaces, Claude and Muse chat sessions, Notion tabs, any app's windows, and AI agents (with their status). A **Recently Closed** section reopens browser tabs, Notion pages, and documents you've closed.
- **Search Current App**: the same, for the app you're in.
- **Agents**: the AI agents running on your Mac (Claude Code, Codex, Cursor, herdr, agent CLIs, web agents), grouped by status: **Needs You**, **Done**, **Working**, **Idle**. Jump to where one runs: its terminal pane, its herdr pane, or its session in the Claude app or Cursor.
- **Next Agent**: jump to the agent that has waited longest for you: one that needs your input or approval first, then one that finished a turn you haven't seen. Run it again for the next one.

## Setup

Back, Forward, Toggle, Search, and Next Agent are meant to be used with hotkeys:

1. Open Raycast Settings → Extensions → Jumper.
2. Assign a hotkey to each command, for example `⇧⌘[` for Back, `⇧⌘]` for Forward, and a double tap of `⌘` for Toggle (the keys shown in the demo), `⌃⌘` for Search, and something like `⌃⌥A` for Next Agent.

`⇧⌘[` and `⇧⌘]` also switch tabs in browsers, Terminal, and many editors; a Raycast hotkey takes priority, so pick something like `⌃⌥[` / `⌃⌥]` if you rely on those.

Back, Forward, Toggle, and History need no permissions and no background process: they read the order macOS already keeps for Cmd+Tab.

Search and Search Current App ask for permissions the first time:

- **Automation**: macOS asks once per app ("Raycast wants to control Google Chrome"). Needed for browsers and terminals.
- **Accessibility**: for other apps' windows, for Claude and Muse sessions and Notion tabs, and to recognize Safari's private windows (without it, Safari tabs aren't listed). Grant it to Raycast in System Settings → Privacy & Security → Accessibility.

An app Jumper can't read shows under **Unavailable**, with a shortcut to the right settings pane.

Agents and Next Agent read the agents' own status files and local APIs, and need no permissions of their own; jumping into a terminal pane uses the same Automation permission as Search.

## How it works

- The first **Back** remembers your current app order and moves one step back.
- Pressing Back again goes further; **Forward** retraces.
- Switching apps any other way (click, Cmd+Tab) starts a fresh history, just like visiting a new page in a browser clears the forward history.
- Apps you quit are skipped.
- In **History**, **Remove from History** (`⌃X`) hides an app (including the one you're in, once you leave it), for example one you closed all windows of but didn't quit. It comes back once you use it again.
- **Exclude from History** (`⌃⇧X`) hides an app for good. Excluded apps are listed at the bottom of History; **Include in History** brings one back.

### Search

| App | Lists |
|---|---|
| Chrome, Brave, Edge, Vivaldi, Chromium, Safari | Tabs (never incognito or private windows) |
| cmux | Workspaces (and their terminals, for agents) |
| herdr | Workspaces and tabs, under the terminal running herdr |
| iTerm, Terminal | Tabs (and iTerm's split panes, for agents) |
| Claude | Code sessions (all projects, most recent first, even with the sidebar hidden); Chat and Cowork conversations from the sidebar, plus ones you've opened recently when the sidebar is hidden (opened by link) |
| Muse | Main chat and side chats while the side chats panel is open; otherwise Muse's window |
| Notion | Tabs of the front window with each page's parent pages (opened by Notion's link), then its other windows |
| Any other app | Windows, and tabs if the window has a native tab bar |

Apps are ordered by recent use; within an app, active tabs come first. herdr isn't an app: its workspaces and tabs are listed under the terminal running herdr, and picking one switches herdr there and brings that terminal forward. Search forgives typos ("caude" finds Claude) and matches app names first: typing an app's name lists that app's own tabs before other tabs that mention it. Picking an entry selects it in its app and brings the app to the front. **Copy URL** and **Copy Title** are in the action panel. Claude's Code sessions come from Claude's own session list and open with its deep link. Muse chats and Claude Chat conversations are read from the on-screen sidebar (Claude conversations you've opened open by link even with the sidebar hidden); Notion tabs are read from its tab bar, and their parent pages from Notion's local cache (full path on hover; searching a parent's name finds its pages). An app update can change what Jumper finds; if nothing is found, the app's windows are listed instead. Incognito and private browser windows are never listed, cached, or jumped to.

**Recently Closed** lists browser tabs, Notion pages, and documents (TextEdit, Preview, Pages...) that were open the last time Search looked and are gone now, newest first, for a week (up to 100). **Reopen** opens the page in the same browser (Notion: a new tab) or the file in the same app; **Remove from Recently Closed** and **Clear Recently Closed** tidy it. Jumper only notices what it saw: a tab opened and closed between two uses of Search isn't there. Terminals, chats, and private windows are never recorded.

### Agents

| Agent | Where it runs | Status from |
|---|---|---|
| Claude Code | Terminals, the Claude app's Code tab, IDEs | Claude Code's own list of running sessions (busy, waiting for approval or input, idle); the Claude app's record of what you've looked at |
| Codex | Terminals, the Codex app | The Codex app-server daemon's thread status (working, waiting on approval or input, idle) |
| Cursor | Cursor's agents | Cursor's own flags (waiting on you, generating, unread) |
| herdr | Any agent in a herdr pane | herdr's own detection, over its socket |
| Gemini CLI, OpenCode, Amp, Aider, and other agent CLIs | Terminals | Not readable: listed as Running |
| Claude Code on the web, Codex cloud, Jules, Devin, Cursor cloud agents | Browser tabs | Not readable: listed as Running |

**Done** means an agent finished a turn since you last looked at it: in its own app (Claude records when you last opened a session), or by jumping to it from Jumper. Agents Jumper sees for the first time count as seen, so ones that were already sitting idle don't all show as done. **Needs You** is an agent stopped on a prompt: a permission request or a question.

Jumping goes to where the agent runs: the exact iTerm split, cmux terminal, or Terminal tab of a terminal agent; the pane in herdr (and the terminal running herdr); the session in the Claude app; the agent's folder in Cursor (Cursor has no link to a single agent); the browser tab of a web agent. In terminals without scripting (Ghostty), Jumper brings the app forward. **Copy Resume Command** copies `claude --resume <id>` or `codex resume <id>`. Filter by project with the dropdown: an agent's project is the git repository it works in (worktrees count as their main repository). Search shows an agent's status next to the tab it runs in (a Claude Code session, a terminal or herdr tab), and lists agents that aren't in a tab (Cursor, the Codex app) in an **Agents** section.

## Support

Jumper is free and open source. If it saves you time, you can [sponsor its development on GitHub](https://github.com/sponsors/mattherwig).
