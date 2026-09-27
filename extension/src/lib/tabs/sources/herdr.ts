// herdr (herdr.dev), a terminal multiplexer: workspace → tab → pane, inside whatever terminal runs a herdr client.
// It isn't an app, so it's a *discovered* source (registry.ts): its tabs are listed under the terminal app running
// herdr, found through the client process's parent chain. One `session.snapshot` request on herdr's local socket
// (one per named session) returns every workspace, tab, pane and agent; `tab.focus` / `pane.focus` switch herdr's
// clients there. The agent level reads the same snapshot for herdr's agents (agents/sources/herdr.ts; ADR-022).

import { appOfProcess, herdrClient } from "../../platform/processes";
import type { App, Platform, Tab, TabSource } from "../model";

const CONFIG_DIR = ".config/herdr";

interface Ref {
  socket: string;
  tabId: string;
}

export interface Snapshot {
  focused_tab_id?: string;
  workspaces?: { workspace_id?: string; label?: string; number?: number }[];
  tabs?: { tab_id?: string; workspace_id?: string; label?: string; number?: number; pane_count?: number }[];
  panes?: { pane_id?: string; tab_id?: string; cwd?: string; foreground_cwd?: string }[];
  agents?: HerdrAgent[];
}

export interface HerdrAgent {
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
  const named = await Promise.all(
    sessions.map(async (name) =>
      (await platform.listDir(`${base}/sessions/${name}`)).includes("herdr.sock")
        ? [`${base}/sessions/${name}/herdr.sock`]
        : [],
    ),
  );
  return [...(top.includes("herdr.sock") ? [`${base}/herdr.sock`] : []), ...named.flat()];
}

/** The snapshot in a `session.snapshot` response, or undefined. */
export function snapshotOf(response: unknown): Snapshot | undefined {
  return (response as { result?: { snapshot?: Snapshot } })?.result?.snapshot;
}

/** Every reachable session's snapshot; sessions that don't answer (herdr not running) are skipped. */
export async function readSnapshots(platform: Platform): Promise<{ socket: string; snapshot: Snapshot }[]> {
  const sockets = await socketPaths(platform);
  const results = await Promise.all(
    sockets.map((socket) =>
      platform
        .socketRequest(socket, { id: "jumper", method: "session.snapshot", params: {} })
        .then((response) => {
          const snapshot = snapshotOf(response);
          return snapshot ? [{ socket, snapshot }] : [];
        })
        .catch(() => []),
    ),
  );
  return results.flat();
}

/** Key of a herdr tab's entry; agents in it point at it (Agent.placeKey) so Search shows their status there. */
export const herdrTabKey = (socket: string, tabId: string) => `herdr:${socket}:${tabId}`;

/** "Workspace › Tab" names, with herdr's numbers for unnamed ones. */
export function workspaceName(snapshot: Snapshot, workspaceId?: string): string {
  const w = snapshot.workspaces?.find((x) => x.workspace_id === workspaceId);
  return w?.label || (w?.number !== undefined ? `Workspace ${w.number}` : "Workspace");
}

/** One entry per herdr tab, under the terminal app running herdr. Unnamed tabs (herdr labels them "1", "2"...) are
 * named by their workspace. */
export function fromSnapshot(app: App, socket: string, snapshot: Snapshot): Tab<Ref>[] {
  return (snapshot.tabs ?? []).flatMap((t): Tab<Ref>[] => {
    if (!t.tab_id) return [];
    const workspace = workspaceName(snapshot, t.workspace_id);
    const unnamed = !t.label || /^\d+$/.test(t.label);
    const pane = snapshot.panes?.find((p) => p.tab_id === t.tab_id);
    const cwd = pane?.foreground_cwd || pane?.cwd;
    return [
      {
        key: herdrTabKey(socket, t.tab_id),
        app,
        source: herdr.id,
        kind: "workspace",
        title: unnamed ? workspace : t.label!,
        detail: unnamed ? "herdr" : `herdr › ${workspace}`,
        detailFull: cwd,
        active: t.tab_id === snapshot.focused_tab_id,
        ref: { socket, tabId: t.tab_id },
      },
    ];
  });
}

async function focus(platform: Platform, socket: string, method: string, params: object): Promise<void> {
  const response = (await platform.socketRequest(socket, { id: "jumper", method, params })) as {
    error?: { message?: string };
  };
  if (response?.error) throw new Error(response.error.message ?? `herdr couldn't ${method}`);
}

/** Focus a pane: herdr's clients switch to its workspace, tab and pane. */
export const focusPane = (platform: Platform, socket: string, paneId: string) =>
  focus(platform, socket, "pane.focus", { pane_id: paneId });

export const herdr: TabSource<Ref> = {
  id: "herdr",
  bundleIds: [],
  list: async () => [],
  discover: async (apps, platform) => {
    const [snapshots, processes] = await Promise.all([readSnapshots(platform), platform.processes()]);
    if (snapshots.length === 0) return [];
    const client = herdrClient(processes);
    const app = client && appOfProcess(client.pid, new Map(processes.map((p) => [p.pid, p])), apps);
    // No client attached in a terminal we know: nothing to bring forward, so nothing to jump to.
    if (!app) return [];
    return snapshots.flatMap(({ socket, snapshot }) => fromSnapshot(app, socket, snapshot));
  },
  select: (tab, platform) => focus(platform, tab.ref.socket, "tab.focus", { tab_id: tab.ref.tabId }),
};
