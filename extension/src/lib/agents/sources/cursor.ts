// Cursor agents (composers), from Cursor's own state database: its header list has each agent's folder and the
// flags Cursor's UI uses (blocking pending actions, unread messages); each agent's record has its run status
// (generating / completed / aborted). Cursor has no public link to a local agent, so jumping opens the agent's
// folder with Cursor, which brings that window forward (ADR-022). Only read while Cursor runs: its agents
// don't run otherwise.

import type { Agent, AgentContext, AgentSource, AgentStatus } from "../model";

const BUNDLE_ID = "com.todesktop.230313mzl4w4u92";
const DB = "Library/Application Support/Cursor/User/globalStorage/state.vscdb";
/** Idle agents older than this aren't listed: the list is for what's going on now. */
const IDLE_WINDOW_MS = 24 * 60 * 60 * 1000;

const HEADERS = `select
  json_extract(e.value, '$.composerId') as id,
  json_extract(e.value, '$.name') as name,
  json_extract(e.value, '$.isArchived') as archived,
  json_extract(e.value, '$.isDraft') as draft,
  json_extract(e.value, '$.hasUnreadMessages') as unread,
  json_extract(e.value, '$.hasBlockingPendingActions') as blocking,
  coalesce(json_extract(e.value, '$.lastUpdatedAt'), json_extract(e.value, '$.createdAt')) as updatedAt,
  json_extract(e.value, '$.workspaceIdentifier.uri.fsPath') as folder
from ItemTable, json_each(json_extract(ItemTable.value, '$.allComposers')) e
where ItemTable.key = 'composer.composerHeaders'`;

const statusQuery = (ids: string[]) =>
  `select substr(key, 14) as id, json_extract(value, '$.status') as status from cursorDiskKV
where key in (${ids.map((id) => `'composerData:${id.replace(/'/g, "''")}'`).join(",")})`;

export interface Header {
  id: string;
  name?: string;
  archived: boolean;
  draft: boolean;
  unread: boolean;
  blocking: boolean;
  updatedAt?: number;
  folder?: string;
}

export function parseHeaders(rows: Record<string, unknown>[]): Header[] {
  return rows.flatMap((r): Header[] =>
    typeof r.id === "string"
      ? [
          {
            id: r.id,
            name: typeof r.name === "string" && r.name ? r.name : undefined,
            archived: r.archived === 1,
            draft: r.draft === 1,
            unread: r.unread === 1,
            blocking: r.blocking === 1,
            updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : undefined,
            folder: typeof r.folder === "string" && r.folder ? r.folder : undefined,
          },
        ]
      : [],
  );
}

/** Blocked while Cursor waits on the user, working while generating, done while it has unread messages. */
export function statusOf(header: Header, runStatus: string | undefined): AgentStatus {
  if (header.blocking) return "blocked";
  if (runStatus === "generating") return "working";
  if (header.unread) return "done";
  return "idle";
}

export function toAgents(headers: Header[], runStatus: Map<string, string>, now: number): Agent[] {
  return headers.flatMap((h): Agent[] => {
    if (h.archived || h.draft || !h.folder) return [];
    const status = statusOf(h, runStatus.get(h.id));
    if (status === "idle" && (h.updatedAt === undefined || now - h.updatedAt > IDLE_WINDOW_MS)) return [];
    const folderName = h.folder.split("/").pop() ?? h.folder;
    return [
      {
        key: `cursor:${h.id}`,
        source: cursor.id,
        product: "Cursor",
        id: h.id,
        title: h.name ?? "Cursor agent",
        cwd: h.folder,
        status,
        statusDetail: status === "blocked" ? "Needs input" : undefined,
        since: h.updatedAt,
        activeAt: h.updatedAt,
        // Cursor's own unread flag already says whether it was seen.
        seenAt: status === "done" ? 0 : h.updatedAt,
        host: { kind: "link", bundleId: BUNDLE_ID, url: h.folder, label: `Cursor › ${folderName}` },
      },
    ];
  });
}

export const cursor: AgentSource = {
  id: "cursor",
  list: async ({ platform, apps, now }: AgentContext) => {
    if (!apps.some((a) => a.bundleId === BUNDLE_ID)) return [];
    const db = `${platform.homeDir()}/${DB}`;
    const headers = parseHeaders(await platform.querySqlite(db, HEADERS)).filter((h) => !h.archived && !h.draft);
    if (headers.length === 0) return [];
    const rows = await platform.querySqlite(db, statusQuery(headers.map((h) => h.id)));
    const runStatus = new Map(rows.map((r) => [String(r.id), String(r.status ?? "")]));
    return toAgents(headers, runStatus, now);
  },
};
