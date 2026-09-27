// cmux: window → workspace (the sidebar entry; "tab" in its AppleScript dictionary) → terminals (splits).
// Workspaces are listed; their terminals are the panes, so an agent running in one can be jumped to exactly.
// AppleScript gives terminal ids but no tty; cmux's own session file (autosaved on change) maps each terminal
// ("panel", same id) to its tty.

import { isTrue, listScript, parseRecords, quote, runSelect, tildify } from "../applescript";
import type { App, Pane, Platform, Tab, TabSource } from "../model";

interface Ref {
  windowId: string;
  tabId: string;
}

const SESSION_DIR = "Library/Application Support/cmux";
const SESSION_FILE = /^session-com\.cmuxterm\.app\.json$/;

const LIST = `repeat with win in windows
  set wid to id of win
  repeat with t in tabs of win
    set cwd to ""
    try
      set cwd to working directory of focused terminal of t
    end try
    set AppleScript's text item delimiters to ","
    set termIds to (id of terminals of t) as text
    set AppleScript's text item delimiters to ""
    set out to out & wid & F & (id of t) & F & (name of t) & F & (selected of t) & F & cwd & F & termIds & R
  end repeat
end repeat`;

const select = ({ windowId, tabId }: Ref) => `repeat with win in windows
  if (id of win) is ${quote(windowId)} then
    repeat with t in tabs of win
      if (id of t) is ${quote(tabId)} then
        select tab t
        activate window win
        return "ok"
      end if
    end repeat
  end if
end repeat`;

const selectTerminal = (terminalId: string) => `repeat with win in windows
  repeat with t in tabs of win
    repeat with term in terminals of t
      if (id of term) is ${quote(terminalId)} then
        select tab t
        activate window win
        focus term
        return "ok"
      end if
    end repeat
  end repeat
end repeat`;

/** Rows: windowId, tabId, title, selected, workingDirectory, terminal ids (comma-separated). */
export function parse(app: App, out: string, ttys: Map<string, string> = new Map()): Tab<Ref>[] {
  return parseRecords(out, 6).map(([windowId, tabId, title, selected, cwd, terminalIds]) => {
    const panes = terminalIds
      .split(",")
      .map((id) => id.trim())
      .flatMap((id): Pane[] => {
        const tty = ttys.get(id);
        return tty ? [{ id, tty }] : [];
      });
    return {
      key: `${app.bundleId}:${tabId}`,
      app,
      source: cmux.id,
      kind: "workspace",
      title: title || tildify(cwd) || "Workspace",
      detail: tildify(cwd) || undefined,
      active: isTrue(selected),
      ref: { windowId, tabId },
      ...(panes.length > 0 ? { panes } : {}),
    };
  });
}

/** Terminal id → tty, from cmux's session file; empty if it's unreadable. */
export function parseTtys(text: string): Map<string, string> {
  const ttys = new Map<string, string>();
  try {
    for (const win of JSON.parse(text)?.windows ?? []) {
      for (const workspace of win?.tabManager?.workspaces ?? []) {
        for (const panel of workspace?.panels ?? []) {
          if (typeof panel?.id === "string" && typeof panel?.ttyName === "string" && panel.ttyName) {
            ttys.set(panel.id, panel.ttyName);
          }
        }
      }
    }
  } catch {
    // Unreadable session file: no panes; workspaces still list.
  }
  return ttys;
}

async function readTtys(platform: Platform): Promise<Map<string, string>> {
  const [file] = await platform.readFiles(`${platform.homeDir()}/${SESSION_DIR}`, SESSION_FILE, 0);
  return file ? parseTtys(file.text) : new Map();
}

export const cmux: TabSource<Ref> = {
  id: "cmux",
  bundleIds: ["com.cmuxterm.app"],
  list: async (app, platform) => {
    const [out, ttys] = await Promise.all([
      platform.runAppleScript(listScript(app.bundleId, LIST)),
      readTtys(platform).catch(() => new Map<string, string>()),
    ]);
    return parse(app, out, ttys);
  },
  select: (tab, platform) => runSelect(platform, tab.app.bundleId, select(tab.ref)),
  selectPane: (tab, paneId, platform) => runSelect(platform, tab.app.bundleId, selectTerminal(paneId)),
};
