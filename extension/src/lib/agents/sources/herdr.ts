// herdr (herdr.dev), a terminal multiplexer that recognizes agents in its panes and tracks their status itself.
// One `session.snapshot` request on its local socket returns every workspace, tab, pane and agent. Each named
// session has its own socket. Jumping focuses the pane through the socket (herdr moves its attached clients
// there), then the terminal running herdr is brought forward (locate.ts). Built against herdr's API schema
// (src/api/schema); not yet tested against a running herdr (ADR-021).

import type { Agent, AgentContext, AgentSource, AgentStatus } from "../model";
import type { Platform } from "../../platform/model";

const CONFIG_DIR = ".config/herdr";
const STATUSES = new Set<AgentStatus>(["blocked", "working", "done", "idle", "unknown"]);

interface Named {
  workspace_id?: string;
  tab_id?: string;
  label?: string;
}

interface SnapshotAgent {
  pane_id?: string;
  workspace_id?: string;
  tab_id?: string;
  name?: string;
  agent?: string;
  display_agent?: string;
  title?: string;
  terminal_title_stripped?: string;
  agent_status?: string;
  agent_session?: { agent?: string; kind?: string; value?: string };
  cwd?: string;
  foreground_cwd?: string;
}

/** Socket paths of the default session and every named one. */
export async function socketPaths(platform: Platform): Promise<string[]> {
  const base = `${platform.homeDir()}/${CONFIG_DIR}`;
  const [top, sessions] = await Promise.all([platform.listDir(base), platform.listDir(`${base}/sessions`)]);
  return [
    ...(top.includes("herdr.sock") ? [`${base}/herdr.sock`] : []),
    ...(
      await Promise.all(
        sessions.map(async (name) =>
          (await platform.listDir(`${base}/sessions/${name}`)).includes("herdr.sock")
            ? [`${base}/sessions/${name}/herdr.sock`]
            : [],
        ),
      )
    ).flat(),
  ];
}

/** Agents in one session's snapshot response; [] for anything unexpected. */
export function parseSnapshot(response: unknown, socket: string): Agent[] {
  const snapshot = (response as { result?: { snapshot?: Record<string, unknown> } })?.result?.snapshot;
  if (!snapshot) return [];
  const workspaces = new Map(((snapshot.workspaces as Named[]) ?? []).map((w) => [w.workspace_id, w.label] as const));
  const tabs = new Map(((snapshot.tabs as Named[]) ?? []).map((t) => [t.tab_id, t.label] as const));
  return ((snapshot.agents as SnapshotAgent[]) ?? []).flatMap((a): Agent[] => {
    if (!a.pane_id) return [];
    const product = a.display_agent || a.agent || "Agent";
    const status = STATUSES.has(a.agent_status as AgentStatus) ? (a.agent_status as AgentStatus) : "unknown";
    const place = [workspaces.get(a.workspace_id), tabs.get(a.tab_id)].filter(Boolean).join(" › ");
    const session = a.agent_session?.kind === "id" ? a.agent_session.value : undefined;
    return [
      {
        key: `herdr:${socket}:${a.pane_id}`,
        source: herdr.id,
        product: capitalize(product),
        id: session ?? a.pane_id,
        title: a.name || a.title || a.terminal_title_stripped || place || product,
        cwd: a.foreground_cwd || a.cwd,
        status,
        host: { kind: "herdr", socket, paneId: a.pane_id, label: place ? `herdr › ${place}` : "herdr" },
        ...(session ? { sessionIds: [session] } : {}),
      },
    ];
  });
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const herdr: AgentSource = {
  id: "herdr",
  list: async ({ platform }: AgentContext) => {
    const sockets = await socketPaths(platform);
    const results = await Promise.all(
      sockets.map((socket) =>
        platform
          .socketRequest(socket, { id: "jumper", method: "session.snapshot", params: {} })
          .then((response) => parseSnapshot(response, socket))
          // A stale socket (herdr not running) is not an error.
          .catch(() => []),
      ),
    );
    return results.flat();
  },
};

/** Focus `paneId` in herdr: its clients switch to that workspace, tab and pane. */
export async function focusPane(platform: Platform, socket: string, paneId: string): Promise<void> {
  const response = (await platform.socketRequest(socket, {
    id: "jumper",
    method: "pane.focus",
    params: { pane_id: paneId },
  })) as { error?: { message?: string } };
  if (response?.error) throw new Error(response.error.message ?? "herdr couldn't focus the pane");
}
