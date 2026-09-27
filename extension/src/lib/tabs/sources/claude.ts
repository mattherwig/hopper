// Claude desktop. Code sessions come from Claude's own session files and open with the claude:// deep link
// that Claude's Dock menu and Spotlight entries use, so they're listed whether or not the sidebar is visible
// (ADR-014). Chat-mode conversations aren't stored locally: they're read from the sidebar when it shows them.

import { tildify } from "../applescript";
import type { App, Platform, Tab, TabSource } from "../model";
import { openSidebarEntry, readSidebar, type SidebarRef, type SidebarSpec } from "./sidebar";
import { windows } from "./windows";

const BUNDLE_ID = "com.anthropic.claudefordesktop";

/** <account>/<org>/local_<uuid>.json, one file per Code session. */
const SESSIONS_DIR = "Library/Application Support/Claude/claude-code-sessions";
const SESSION_FILE = /^local_[\w-]+\.json$/;

/** Rows titled "<status> <name>" (status: Running, Idle, a PR badge...); the open session or chat is named by
 * a "<name>, rename session" button above the transcript, which is there even with the sidebar hidden. */
const SIDEBAR: SidebarSpec = {
  id: "claude",
  bundleId: BUNDLE_ID,
  kind: "session",
  container: "Sidebar",
  rowRole: "AXButton",
  format: "status-prefixed",
  activeSuffix: ", rename session",
};

type Ref = { sessionId: string } | SidebarRef;

export interface CodeSession {
  sessionId: string;
  title: string;
  cwd: string;
  lastFocusedAt: number;
}

/** A session file's fields, or undefined for archived, unreadable, or unexpected files. */
export function parseSession(text: string): CodeSession | undefined {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof data?.sessionId !== "string" || data.isArchived === true) return undefined;
  const cwd = typeof data.cwd === "string" ? data.cwd : "";
  return {
    sessionId: data.sessionId,
    title: (typeof data.title === "string" && data.title) || cwd.split("/").pop() || "Code session",
    cwd,
    lastFocusedAt: typeof data.lastFocusedAt === "number" ? data.lastFocusedAt : 0,
  };
}

/** Most recently focused first; `activeTitle` (the open session) marks one as active. */
export function fromSessions(app: App, sessions: CodeSession[], activeTitle?: string): Tab<Ref>[] {
  return [...sessions]
    .sort((a, b) => b.lastFocusedAt - a.lastFocusedAt)
    .map((s) => ({
      key: `${app.bundleId}:code:${s.sessionId}`,
      app,
      source: claude.id,
      kind: "session",
      title: s.title,
      detail: tildify(s.cwd) || undefined,
      active: s.title === activeTitle,
      ref: { sessionId: s.sessionId },
    }));
}

async function readSessions(platform: Platform): Promise<CodeSession[]> {
  const files = await platform.readFiles(`${platform.homeDir()}/${SESSIONS_DIR}`, SESSION_FILE, 3);
  return files.flatMap((f) => parseSession(f.text) ?? []);
}

export const claude: TabSource<Ref> = {
  id: "claude",
  bundleIds: [BUNDLE_ID],
  list: async (app, platform) => {
    const [sessions, sidebar] = await Promise.all([readSessions(platform), readSidebar(app, SIDEBAR, platform)]);
    const active =
      sidebar.find((t) => t.active)?.title ?? (await platform.labelWithSuffix(app.bundleId, SIDEBAR.activeSuffix!));
    const code = fromSessions(app, sessions, active);
    // In Code mode the sidebar repeats the sessions; in Chat mode it adds conversations the files don't have.
    const titles = new Set(code.map((t) => t.title));
    const extra = sidebar.filter((t) => !titles.has(t.title)) as Tab<Ref>[];
    const tabs = [...code, ...extra];
    return tabs.length > 0 ? tabs : ((await windows.list(app, platform)) as Tab[] as Tab<Ref>[]);
  },
  select: async (tab, platform) => {
    if ("sessionId" in tab.ref) {
      await platform.openUrl(`claude://code/continue?session=${encodeURIComponent(tab.ref.sessionId)}`);
    } else {
      await openSidebarEntry(tab as Tab<SidebarRef>, SIDEBAR, platform);
    }
  },
};
