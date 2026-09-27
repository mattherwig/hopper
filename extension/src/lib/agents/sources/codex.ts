// Codex. Its sessions (threads) run in a shared local app-server daemon that the Codex CLI starts and connects to;
// the daemon knows each open thread's status, including waiting on an approval or on user input. It speaks
// JSON-RPC over a WebSocket on ~/.codex/app-server-control/app-server-control.sock (ADR-021). Only threads the
// daemon has loaded (open in a client, or still running) are listed; Jumper never loads, resumes or subscribes.
//
// A terminal session isn't tied to its thread by the daemon: the Codex process in a terminal whose working folder
// is the thread's is taken as its host. Threads from the Codex app open with its codex:// link.
// Built against the protocol of Codex 0.157 (codex app-server generate-ts); not yet tested with a live session.

import type { Process, RpcConnection } from "../../platform/model";
import type { Agent, AgentContext, AgentSource, AgentStatus, Host } from "../model";

const SOCKET = ".codex/app-server-control/app-server-control.sock";
const CODEX_APP = "com.openai.codex";

export interface Thread {
  id: string;
  name?: string | null;
  preview?: string;
  cwd?: string;
  updatedAt?: number;
  source?: unknown;
  status?: { type?: string; activeFlags?: string[] };
}

export function statusOf(thread: Thread): { status: AgentStatus; detail?: string } | undefined {
  const flags = thread.status?.activeFlags ?? [];
  switch (thread.status?.type) {
    case "active":
      if (flags.includes("waitingOnApproval")) return { status: "blocked", detail: "Needs approval" };
      if (flags.includes("waitingOnUserInput")) return { status: "blocked", detail: "Needs input" };
      return { status: "working" };
    case "idle":
      return { status: "idle" };
    case "systemError":
      return { status: "idle", detail: "Error" };
    default:
      // notLoaded: not open anywhere.
      return undefined;
  }
}

/** The Codex process in a terminal working in `cwd`, if exactly one is (two would be a guess). */
export function terminalFor(cwd: string | undefined, processes: Process[]): Process | undefined {
  if (!cwd) return undefined;
  const byPid = new Map(processes.map((p) => [p.pid, p]));
  const matches = processes.filter(
    (p) => p.name === "codex" && p.tty && p.cwd === cwd && byPid.get(p.ppid)?.name !== "codex",
  );
  return matches.length === 1 ? matches[0] : undefined;
}

export function toAgents(threads: Thread[], processes: Process[]): Agent[] {
  return threads.flatMap((thread): Agent[] => {
    const state = statusOf(thread);
    if (!state) return [];
    const terminal = thread.source === "cli" ? terminalFor(thread.cwd, processes) : undefined;
    const host: Host = terminal
      ? { kind: "process", pid: terminal.pid, tty: terminal.tty }
      : { kind: "link", bundleId: CODEX_APP, url: `codex://threads/${thread.id}` };
    const updatedAt = thread.updatedAt ? thread.updatedAt * 1000 : undefined;
    return [
      {
        key: `codex:${thread.id}`,
        source: codex.id,
        product: "Codex",
        id: thread.id,
        title: thread.name || firstLine(thread.preview) || "Codex",
        cwd: thread.cwd || undefined,
        status: state.status,
        statusDetail: state.detail,
        since: updatedAt,
        activeAt: state.status === "idle" ? updatedAt : undefined,
        host,
        resumeCommand: `codex resume ${thread.id}`,
      },
    ];
  });
}

const firstLine = (text?: string) => text?.split("\n")[0]?.trim().slice(0, 80) || undefined;

async function loadedThreads(rpc: RpcConnection): Promise<Thread[]> {
  await rpc.request("initialize", {
    clientInfo: { name: "jumper", title: "Jumper", version: "1" },
    capabilities: { experimentalApi: false, requestAttestation: false },
  });
  rpc.notify("initialized");
  const loaded = (await rpc.request("thread/loaded/list", {})) as { data?: string[] };
  const reads = await Promise.all(
    (loaded?.data ?? []).map((threadId) =>
      rpc.request("thread/read", { threadId, includeTurns: false }).catch(() => undefined),
    ),
  );
  return reads.flatMap((r) => ((r as { thread?: Thread })?.thread ? [(r as { thread: Thread }).thread] : []));
}

export const codex: AgentSource = {
  id: "codex",
  list: async ({ platform, processes }: AgentContext) => {
    const path = `${platform.homeDir()}/${SOCKET}`;
    // No daemon: Codex isn't running (its CLI processes are still found by the cli source).
    const rpc = await platform.connectRpc(path).catch(() => undefined);
    if (!rpc) return [];
    try {
      return toAgents(await loadedThreads(rpc), processes);
    } finally {
      rpc.close();
    }
  },
};
