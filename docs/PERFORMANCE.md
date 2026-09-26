# Performance

## How to profile

1. `npm run dev` (in background, log to a file).
2. In-command step timings: dev builds log `PERF start <epoch>`, `PERF read <ms>`, `PERF activated <ms>` (see `timer()` in `src/lib/run-navigation.ts`; silent in production).
3. End-to-end (trigger → frontmost app changed):
   ```bash
   swiftc -O -o /tmp/aff-bench scripts/bench.swift
   /tmp/aff-bench go-back go-back go-forward go-forward 2>/tmp/aff-t0.log
   ```
   Dispatch latency = `PERF start` epoch − `T0` epoch from stderr.
4. Micro-bench a JXA change standalone: extract `MRU_SCRIPT`, append `run()`, time `osascript -l JavaScript file.js`.

This switches the user's frontmost app repeatedly — warn them first.

## Baseline (2026-09-26, macOS 26.5, Apple Silicon)

| Stage | v1 | Now |
|---|---|---|
| Deeplink dispatch (`open` + URL routing + Raycast starts command) | ~170ms | ~170ms (not ours; real hotkeys skip `open`/URL routing) |
| Read MRU via osascript JXA | ~72ms | ~50ms (dropped top-level `ObjC.import("AppKit")`, −25ms) |
| Activate app | ~65ms (`open -b` spawn) | ~25ms (Raycast `open(appPath)`, no spawn) |
| closeMainWindow + LocalStorage | ~5ms | ~0 (parallel with read) |
| **Our code total** | **~140ms** | **~75ms** |

## Remaining options (not done)

- **Native Swift helper for MRU read: ~7ms vs ~50ms** (measured with a `dlsym` prototype). Store forbids prebuilt binaries, so it must go through `raycast/extensions-swift-tools` (compiled from source at build; needs Swift 6 / Xcode 16.3+). Cost: toolchain requirement for contributors, more build complexity. Saves ~43ms/press.
- **Fast path for repeated presses**: use `getFrontmostApplication()` (Raycast IPC) to validate the snapshot and skip the MRU read. Rejected for now: can't cheaply tell if the target app quit (Raycast `open` would relaunch it), and the most common action (first Back) needs a fresh MRU anyway.
- osascript floor: process spawn + JXA runtime ≈ 35–40ms even for `1`. JXA can't go much lower.
