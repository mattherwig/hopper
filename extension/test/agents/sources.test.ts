import { test } from "node:test";
import assert from "node:assert/strict";
import { toAgents as cliAgents } from "../../src/lib/agents/sources/cli.ts";
import { codex, statusOf as codexStatus, terminalFor } from "../../src/lib/agents/sources/codex.ts";
import {
  parseHeaders,
  statusOf as cursorStatus,
  toAgents as cursorAgents,
} from "../../src/lib/agents/sources/cursor.ts";
import { herdr, parseSnapshot } from "../../src/lib/agents/sources/herdr.ts";
import { webAgents } from "../../src/lib/agents/sources/web.ts";
import type { Tab } from "../../src/lib/tabs/model.ts";
import { fakePlatform } from "../fake-platform.ts";
import { proc } from "./helpers.ts";

test("cli: known agent CLIs with a terminal, outermost process only", () => {
  const agents = cliAgents([
    proc(1, 0, "ttys001", "codex", { cwd: "/p" }),
    proc(2, 1, "ttys001", "codex"), // its helper
    proc(3, 0, "", "codex"), // no terminal
    proc(4, 0, "ttys002", "vim"),
    proc(5, 0, "ttys003", "gemini"),
  ]);
  assert.deepEqual(
    agents.map((a) => [a.product, a.cwd, a.host]),
    [
      ["Codex", "/p", { kind: "process", pid: 1, tty: "ttys001" }],
      ["Gemini CLI", undefined, { kind: "process", pid: 5, tty: "ttys003" }],
    ],
  );
});

test("cursor: blocked, working, done from Cursor's own flags; old idle and archived agents left out", () => {
  const headers = parseHeaders([
    { id: "a", name: "Refactor", unread: 0, blocking: 1, updatedAt: 2 * 24 * 60 * 60 * 1000 - 10, folder: "/p/app" },
    { id: "b", unread: 0, blocking: 0, updatedAt: 2 * 24 * 60 * 60 * 1000 - 10, folder: "/p/app" },
    { id: "c", unread: 1, blocking: 0, updatedAt: 2 * 24 * 60 * 60 * 1000 - 10, folder: "/p/app" },
    { id: "d", unread: 0, blocking: 0, updatedAt: 1, folder: "/p/app" },
    { id: "e", archived: 1, folder: "/p/app" },
    { id: "f", draft: 1 },
  ]);
  assert.equal(cursorStatus(headers[1], "generating"), "working");
  const agents = cursorAgents(headers, new Map([["b", "generating"]]), 2 * 24 * 60 * 60 * 1000);
  assert.deepEqual(
    agents.map((a) => [a.id, a.title, a.status]),
    [
      ["a", "Refactor", "blocked"],
      ["b", "Cursor agent", "working"],
      ["c", "Cursor agent", "done"],
    ],
  );
  assert.deepEqual(agents[0].host, {
    kind: "link",
    bundleId: "com.todesktop.230313mzl4w4u92",
    url: "/p/app",
    label: "Cursor › app",
  });
});

const snapshot = {
  id: "jumper",
  result: {
    type: "session_snapshot",
    snapshot: {
      workspaces: [{ workspace_id: "w1", label: "api" }],
      tabs: [{ tab_id: "w1:t1", label: "agents" }],
      agents: [
        {
          pane_id: "w1:p1",
          workspace_id: "w1",
          tab_id: "w1:t1",
          agent: "claude",
          agent_status: "blocked",
          agent_session: { source: "hook", agent: "claude", kind: "id", value: "s1" },
          foreground_cwd: "/p/api",
        },
        { pane_id: "w1:p2", workspace_id: "w1", tab_id: "w1:t1", agent: "pi", agent_status: "weird" },
      ],
    },
  },
};

test("herdr: agents from a snapshot, with the session they run and their pane", () => {
  const agents = parseSnapshot(snapshot, "/s");
  assert.deepEqual(
    agents.map((a) => [a.product, a.id, a.status, a.cwd, a.sessionIds, a.host]),
    [
      [
        "Claude",
        "s1",
        "blocked",
        "/p/api",
        ["s1"],
        { kind: "herdr", socket: "/s", paneId: "w1:p1", label: "herdr › api › agents" },
      ],
      [
        "Pi",
        "w1:p2",
        "unknown",
        undefined,
        undefined,
        { kind: "herdr", socket: "/s", paneId: "w1:p2", label: "herdr › api › agents" },
      ],
    ],
  );
  assert.deepEqual(parseSnapshot({ error: { code: "x" } }, "/s"), []);
});

test("herdr: asks every session's socket; one that doesn't answer is skipped", async () => {
  const asked: string[] = [];
  const platform = fakePlatform({
    listDir: async (dir) =>
      dir.endsWith("/sessions") ? ["work"] : dir.endsWith("/work") ? ["herdr.sock"] : ["herdr.sock", "config.toml"],
    socketRequest: async (path) => {
      asked.push(path);
      if (path.includes("work")) throw new Error("ECONNREFUSED");
      return snapshot;
    },
  });
  const agents = await herdr.list({ platform, apps: [], processes: [], now: 0 });
  assert.deepEqual(asked, ["/Users/me/.config/herdr/herdr.sock", "/Users/me/.config/herdr/sessions/work/herdr.sock"]);
  assert.equal(agents.length, 2);
});

test("codex: status from the daemon's thread status", () => {
  assert.deepEqual(codexStatus({ id: "t", status: { type: "active", activeFlags: ["waitingOnApproval"] } }), {
    status: "blocked",
    detail: "Needs approval",
  });
  assert.deepEqual(codexStatus({ id: "t", status: { type: "active", activeFlags: [] } }), { status: "working" });
  assert.deepEqual(codexStatus({ id: "t", status: { type: "idle" } }), { status: "idle" });
  assert.equal(codexStatus({ id: "t", status: { type: "notLoaded" } }), undefined);
});

test("codex: a terminal thread's host is the one Codex process working in its folder", () => {
  const processes = [proc(1, 0, "ttys001", "codex", { cwd: "/a" }), proc(2, 0, "ttys002", "codex", { cwd: "/b" })];
  assert.equal(terminalFor("/a", processes)?.pid, 1);
  assert.equal(terminalFor("/a", [...processes, proc(3, 0, "ttys003", "codex", { cwd: "/a" })]), undefined);
});

test("codex: lists the daemon's loaded threads, never loading or resuming any", async () => {
  const methods: string[] = [];
  const platform = fakePlatform({
    connectRpc: async () => ({
      request: async (method, params) => {
        methods.push(method);
        if (method === "thread/loaded/list") return { data: ["t1", "t2"], nextCursor: null };
        if (method === "thread/read") {
          const id = (params as { threadId: string }).threadId;
          return {
            thread: {
              id,
              name: id === "t1" ? "Fix login" : null,
              preview: "Add tests\nmore",
              cwd: "/a",
              source: id === "t1" ? "cli" : "appServer",
              updatedAt: 5,
              status: { type: "active", activeFlags: id === "t1" ? ["waitingOnUserInput"] : [] },
            },
          };
        }
        return {};
      },
      notify: (method) => void methods.push(`notify ${method}`),
      close: () => void methods.push("close"),
    }),
  });
  const agents = await codex.list({
    platform,
    apps: [],
    processes: [proc(7, 0, "ttys001", "codex", { cwd: "/a" })],
    now: 0,
  });
  assert.deepEqual(methods, [
    "initialize",
    "notify initialized",
    "thread/loaded/list",
    "thread/read",
    "thread/read",
    "close",
  ]);
  assert.deepEqual(
    agents.map((a) => [a.title, a.status, a.statusDetail, a.host, a.resumeCommand]),
    [
      ["Fix login", "blocked", "Needs input", { kind: "process", pid: 7, tty: "ttys001" }, "codex resume t1"],
      [
        "Add tests",
        "working",
        undefined,
        { kind: "link", bundleId: "com.openai.codex", url: "codex://threads/t2" },
        "codex resume t2",
      ],
    ],
  );
});

test("web: agent sessions recognized by URL, one per session", () => {
  const app = { bundleId: "com.google.Chrome", name: "Chrome", path: "/c" };
  const tab = (url: string, title = "t"): Tab => ({
    key: url,
    app,
    source: "chromium",
    kind: "tab",
    title,
    active: false,
    ref: {},
    url,
  });
  const agents = webAgents([
    tab("https://claude.ai/code/session_01ABC", "Fix CI"),
    tab("https://chatgpt.com/codex/tasks/task_e_123"),
    tab("https://jules.google.com/session/99"),
    tab("https://claude.ai/code/session_01ABC?x=1"),
    tab("https://example.com"),
  ]);
  assert.deepEqual(
    agents.map((a) => [a.product, a.id, a.status]),
    [
      ["Claude Code", "session_01ABC", "unknown"],
      ["Codex", "task_e_123", "unknown"],
      ["Jules", "99", "unknown"],
    ],
  );
});
