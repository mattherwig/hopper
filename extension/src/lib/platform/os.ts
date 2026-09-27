import { open } from "@raycast/api";
import { runAppleScript } from "@raycast/utils";
import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { createConnection } from "node:net";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import WebSocket from "ws";
import {
  accessibilityTrusted,
  appWindows,
  focusWindow,
  labelWithSuffix,
  openSidebar,
  processes,
  sidebarRows,
  webPages,
} from "swift:../../../swift";
import type { AppWindows, GitRepo, Platform, RpcConnection, SidebarRow } from "./model";
import { readJson, writeJson } from "./storage";

/** An app that stops responding must not hold up the whole list. */
const APPLESCRIPT_TIMEOUT = 4000;
const SQLITE_TIMEOUT = 2000;
const SOCKET_TIMEOUT = 1000;

const execFileAsync = promisify(execFile);

/**
 * The Platform on macOS: AppleScript through Raycast, Accessibility and the process table through the Swift
 * helper (swift/Sources/JumperNative), files and sockets through Node.
 */
export const macosPlatform: Platform = {
  runAppleScript: (script) => runAppleScript(script, { timeout: APPLESCRIPT_TIMEOUT }),
  accessibilityTrusted: () => accessibilityTrusted(),
  windows: async (bundleIds) => (await appWindows(bundleIds)) as AppWindows[],
  raiseWindow: (bundleId, index, title, tab) => focusWindow(bundleId, index, title, tab ?? null),
  sidebarRows: async (bundleId, query) => (await sidebarRows(bundleId, query.container, query.rowRole)) as SidebarRow[],
  openSidebarRow: (bundleId, query, name) =>
    openSidebar(bundleId, query.container, query.rowRole, name, query.namePattern ?? "", query.keyboard ?? false),
  labelWithSuffix: async (bundleId, suffix) => (await labelWithSuffix(bundleId, suffix)) ?? undefined,
  webPages: (bundleId) => webPages(bundleId),
  loadJson: (key, fallback) => readJson(key, fallback),
  saveJson: (key, value) => writeJson(key, value),
  homeDir: () => homedir(),
  readFiles: async (dir, name, depth) => {
    const paths = await findFiles(dir, name, depth);
    const files = await Promise.all(
      paths.map(async (path) => ({ path, text: await readFile(path, "utf8").catch(() => "") })),
    );
    return files.filter((f) => f.text !== "");
  },
  listDir: (dir) => readdir(dir).catch(() => []),
  openUrl: (url, appPath) => open(url, appPath),
  querySqlite: async (path, sql) => {
    const { stdout } = await execFileAsync("/usr/bin/sqlite3", ["-readonly", "-json", path, sql], {
      timeout: SQLITE_TIMEOUT,
      maxBuffer: 16 * 1024 * 1024,
    });
    // sqlite3 prints nothing, not "[]", when there are no rows.
    return stdout.trim() ? JSON.parse(stdout) : [];
  },
  processes: () => processes(),
  socketRequest,
  connectRpc,
  gitRepos: (dirs) => Promise.all(dirs.map((dir) => gitRepo(dir).catch(() => undefined))),
};

async function findFiles(dir: string, name: RegExp, depth: number): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(
    entries.map((e) => {
      const path = join(dir, e.name);
      if (e.isDirectory()) return depth > 0 ? findFiles(path, name, depth - 1) : [];
      return name.test(e.name) ? [path] : [];
    }),
  );
  return nested.flat();
}

/** One request, one response line, then the connection is closed. */
function socketRequest(path: string, request: unknown): Promise<unknown> {
  return new Promise((resolvePromise, reject) => {
    const socket = createConnection(path);
    let buffer = "";
    const fail = (error: Error) => {
      socket.destroy();
      reject(error);
    };
    socket.setTimeout(SOCKET_TIMEOUT, () => fail(new Error(`No answer from ${path}`)));
    socket.on("error", fail);
    socket.on("connect", () => socket.write(JSON.stringify(request) + "\n"));
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      const end = buffer.indexOf("\n");
      if (end === -1) return;
      socket.destroy();
      try {
        resolvePromise(JSON.parse(buffer.slice(0, end)));
      } catch (error) {
        reject(error as Error);
      }
    });
  });
}

/** JSON-RPC over a WebSocket on a Unix socket; requests are numbered from 1. */
function connectRpc(path: string): Promise<RpcConnection> {
  return new Promise((resolveConnection, reject) => {
    const socket = new WebSocket(`ws+unix://${path}:/`, { handshakeTimeout: SOCKET_TIMEOUT });
    const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
    let next = 1;
    socket.on("error", (error) => {
      reject(error);
      for (const p of pending.values()) p.reject(error);
      pending.clear();
    });
    socket.on("message", (data) => {
      let message: { id?: number; result?: unknown; error?: { message?: string } };
      try {
        message = JSON.parse(data.toString());
      } catch {
        return;
      }
      const waiting = typeof message.id === "number" ? pending.get(message.id) : undefined;
      if (!waiting) return;
      pending.delete(message.id!);
      if (message.error) waiting.reject(new Error(message.error.message ?? "Request failed"));
      else waiting.resolve(message.result);
    });
    socket.on("open", () =>
      resolveConnection({
        request: (method, params) =>
          new Promise((resolve, rejectRequest) => {
            const id = next++;
            const timer = setTimeout(() => {
              pending.delete(id);
              rejectRequest(new Error(`No answer to ${method}`));
            }, SOCKET_TIMEOUT);
            pending.set(id, {
              resolve: (v) => (clearTimeout(timer), resolve(v)),
              reject: (e) => (clearTimeout(timer), rejectRequest(e)),
            });
            socket.send(JSON.stringify({ id, method, params }));
          }),
        notify: (method, params) => socket.send(JSON.stringify(params === undefined ? { method } : { method, params })),
        close: () => socket.close(),
      }),
    );
  });
}

/**
 * The repository containing `dir`, read from the files git keeps (no `git` process: ~10ms each, and this runs
 * for every agent). A linked worktree's `.git` is a file pointing into the main checkout's `.git/worktrees/`.
 */
async function gitRepo(dir: string): Promise<GitRepo | undefined> {
  for (let current = dir; ; current = dirname(current)) {
    const dotGit = join(current, ".git");
    const info = await stat(dotGit).catch(() => undefined);
    if (info) {
      const gitDir = info.isFile() ? await linkedGitDir(dotGit, current) : dotGit;
      const commonDir = await readFile(join(gitDir, "commondir"), "utf8")
        .then((text) => resolve(gitDir, text.trim()))
        .catch(() => gitDir);
      const [head, config] = await Promise.all([
        readFile(join(gitDir, "HEAD"), "utf8").catch(() => ""),
        readFile(join(commonDir, "config"), "utf8").catch(() => ""),
      ]);
      return {
        root: current,
        mainRoot: dirname(commonDir),
        branch: /^ref: refs\/heads\/(.+)$/m.exec(head)?.[1],
        remote: /\[remote "origin"\][^[]*?\burl\s*=\s*(\S+)/.exec(config)?.[1],
      };
    }
    if (dirname(current) === current) return undefined;
  }
}

async function linkedGitDir(dotGitFile: string, root: string): Promise<string> {
  const text = await readFile(dotGitFile, "utf8");
  const target = /^gitdir:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? "";
  return isAbsolute(target) ? target : resolve(root, target);
}
