# Performance

## How to profile

1. `cd extension && npm run dev` (in background, log to a file).
2. In-command step timings: dev builds log `PERF start <epoch>`, `PERF read <ms>`, `PERF activated <ms>` (see `timer()` in `extension/src/lib/apps/run-navigation.ts`; silent in production).
3. End-to-end (trigger → frontmost app changed):
   ```bash
   swiftc -O -o /tmp/aff-bench scripts/bench.swift   # from the repo root
   /tmp/aff-bench back back forward forward 2>/tmp/aff-t0.log
   ```
   Dispatch latency = `PERF start` epoch − `T0` epoch from stderr.
4. Micro-bench the native read without Raycast: compile `extension/swift/Sources/HopperNative/RecentApps.swift` with a tiny `main.swift` that prints `readRecentApps()` as JSON (`swiftc -O -o /tmp/recent RecentApps.swift main.swift`), then time it.

This switches the user's frontmost app repeatedly — warn them first.

Warm up first: the first deeplink after (re)starting `npm run dev` or re-registering the extension takes ~2s (cold start). Run one throwaway command before measuring.

## Baseline (2026-09-26, macOS 26.5, Apple Silicon)

| Stage | v1 | Now |
|---|---|---|
| Deeplink dispatch (`open` + URL routing + Raycast starts command) | ~170ms | ~170ms (not ours; real hotkeys skip `open`/URL routing) |
| Read MRU | ~72ms (osascript JXA) | ~50ms JXA → **~23ms native Swift** (ADR-008) |
| Activate app | ~65ms (`open -b` spawn) | ~25ms (Raycast `open(appPath)`, no spawn) |
| closeMainWindow + LocalStorage | ~5ms | ~0 (parallel with read) |
| **Our code total** | **~140ms** | **~48ms** |

## Remaining options (not done)

- **Fast path for repeated presses**: use `getFrontmostApplication()` (Raycast IPC) to validate the snapshot and skip the MRU read. Rejected for now: can't cheaply tell if the target app quit (Raycast `open` would relaunch it), and the most common action (first Back) needs a fresh MRU anyway.
- Remaining cost is mostly Raycast dispatch (hotkey → command start), which we can't change.

## Swift helper vs JXA (2026-09-26, macOS 27.0, Xcode 27, same machine, 6 runs each)

| | JXA (`main` @ 592dbc2) | Swift (`swift-helper`) |
|---|---|---|
| Read MRU (`PERF read`) | ~48ms | ~23ms |
| Our code total (`PERF activated`) | ~71ms | ~48ms |

The raw native read is <10ms; the Raycast Swift bridge adds ~15ms (Node `spawn` + `chmod` + JSON). Net saving ~25ms/press, not the ~43ms the standalone prototype suggested.


## Activate via Accessibility (2026-09-27, macOS 27.0, ADR-021)

`PERF activated − PERF read` with `frontApp()` (Accessibility `AXFrontmost`, Swift helper): **~55–65ms** (range 42–76ms over 8 toggles), vs ~25ms for Raycast `open()` alone. The extra ~30–40ms is one helper spawn (~15ms through the bridge) plus the AX call, which blocks until the target app has activated. No side-by-side `open()` run on the same day; the ~25ms is the baseline above. Candidate speedup: private SkyLight `_SLPSSetFrontProcessWithOptions` (#25).

## Search keyboard (2026-09-29, macOS 27.0, 215 rows)

Every render of Search rebuilds every row in JS (~11ms) and sends the whole tree to Raycast to diff, so what matters for arrow keys is renders per key. Measured with temporary `console.log`s of each render and `onSelectionChange` in a dev build, and a Swift script posting ↓ / ↑ / ⌥→ / ⌥← key events (CGEvent) with their epochs:

| | Renders in the run | Per ↑ / ↓ |
|---|---|---|
| #59 (selection in state, mirrored from `onSelectionChange`) | 38 | 1 full render |
| Selection in a ref, state only for jumps | 13 (loading + jumps) | 0 |

Rule: nothing that changes on every arrow key may be React state in a list view.

## Search memory (2026-09-29, macOS 27.0, 86 tabs, 10 agents, ADR-032)

Raycast stops a command at 100 MB of JS heap ("Command terminated after reaching the extension memory limit"). Measured with temporary `console.log`s of `process.memoryUsage().heapUsed` (after each tab and agent source, after `loadTabs` / `loadAllAgents`, each render) in a dev build, opening Search by deeplink and closing it with Escape (7s apart). A dev build runs React StrictMode, so the load runs twice per open: it overstates production by one load. `heapUsed` includes garbage not yet collected.

| | Peak heapUsed | Out of memory |
|---|---|---|
| `main`: Claude session files read in parallel, then parsed, by the tab and agent sources; agents also read on the cached tabs | 88.8–94.7 MB | 4 of 4 warm opens (first open survived) |
| One file at a time + `JSON.parse` (`readJsonFields`); agents after fresh tabs | 67.4 MB (52–67 per open) | 0 of 9 |
| Same, with a byte picker that decodes only the wanted fields (measured, not kept) | 50.4 MB | 0 of 9 |

Where it went: ~25 MB baseline (Raycast API, React); each Claude session read was ~30 MB of two-byte strings (14.9M chars in 42 files); a warm open ran the agent read on the cached tabs while the fresh tab read ran. Each full-list render is ~2 MB of garbage. Time from the start of the load (medians of the 9 opens, twice each in dev):

| | Claude tab source done | `loadTabs` done | Agents done |
|---|---|---|---|
| One file at a time + `JSON.parse` | 510 ms | 1049 ms | 1336 ms |
| Byte picker | 529 ms | 1085 ms | 1344 ms |

The same within noise: the other apps' reads (AppleScript, Accessibility) set the pace, not the Claude files.

Offline, 43 files, two overlapping reads, 20 MB ballast (`node --max-old-space-size`): read all then parse, or parse each as it arrives in parallel, run out of memory even at a 64 MB cap; one at a time passes at 32 MB. Rule: don't hold an app file that can grow whole, or many at once (ADR-032); watch the heap when adding a hook or a render to Search.
