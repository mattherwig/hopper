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

Dev builds log `PERF select <epoch> <id>` (Raycast reports a new selection), `PERF jump <epoch>` (⌥→ / ⌥←), and `PERF render <ms> rows=<n>` (each React render of Search, JS side only). The bench presses keys like a user and logs each key's epoch:

```bash
swiftc -O -o /tmp/hopper-bench-search scripts/bench_search.swift   # from the repo root
/tmp/hopper-bench-search 15 4 60 2>/tmp/keys.log                   # 15 ↓, 15 ↑, 4 ⌥→, 4 ⌥←, then jump/step/jump back
```

Key → `PERF select` is Raycast delivering the selection (~8ms median), not what you see: the cost is each render, which rebuilds every row in JS (~11ms) and sends the whole tree to Raycast to diff. So count renders per key.

| | Renders in the bench | Per ↑ / ↓ |
|---|---|---|
| #59 (selection in state, mirrored from `onSelectionChange`) | 38 | 1 full render |
| Selection in a ref, state only for jumps | 13 (loading + jumps) | 0 |

Rule: nothing that changes on every arrow key may be React state in a list view.
