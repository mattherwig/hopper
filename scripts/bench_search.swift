// Search keyboard bench: opens Search, presses ↓ and ⌥→ / ⌥← like a user, and logs each key's epoch.
// Build (from the repo root): swiftc -O -o /tmp/hopper-bench-search scripts/bench_search.swift
// Run (with `npm run dev` active in extension/, logging to a file): /tmp/hopper-bench-search [downs] [jumps] [interval ms]
// Prints "K <kind> <epoch ms>" per key to stderr; match against "PERF select" / "PERF render" in the dev log.
import AppKit

let args = CommandLine.arguments.dropFirst().compactMap { Int($0) }
let downs = args.count > 0 ? args[0] : 15
let jumps = args.count > 1 ? args[1] : 4
let interval = Double(args.count > 2 ? args[2] : 60) / 1000

func press(_ key: CGKeyCode, _ flags: CGEventFlags = [], _ kind: String) {
  let src = CGEventSource(stateID: .hidSystemState)
  let down = CGEvent(keyboardEventSource: src, virtualKey: key, keyDown: true)!
  let up = CGEvent(keyboardEventSource: src, virtualKey: key, keyDown: false)!
  down.flags = flags
  up.flags = flags
  FileHandle.standardError.write("K \(kind) \(Int(Date().timeIntervalSince1970 * 1000))\n".data(using: .utf8)!)
  down.post(tap: .cghidEventTap)
  up.post(tap: .cghidEventTap)
  Thread.sleep(forTimeInterval: interval)
}

let open = Process()
open.executableURL = URL(fileURLWithPath: "/usr/bin/open")
open.arguments = ["-g", "raycast://extensions/matt_herwig/hopper/tabs"]
try! open.run()
Thread.sleep(forTimeInterval: 4)  // tabs and agents load

for _ in 0..<downs { press(125, [], "down") }
Thread.sleep(forTimeInterval: 1)
for _ in 0..<downs { press(126, [], "up") }
Thread.sleep(forTimeInterval: 1)
for _ in 0..<jumps { press(124, .maskAlternate, "next") }
for _ in 0..<jumps { press(123, .maskAlternate, "prev") }
Thread.sleep(forTimeInterval: 1)
// Jump, step off, jump back: the same row must be reachable again (expect B1, B2, A1, A2, B1).
for (key, flags, kind) in [(124, CGEventFlags.maskAlternate, "next"), (125, [], "down"), (123, .maskAlternate, "prev"),
                           (125, [], "down"), (124, .maskAlternate, "next")] as [(CGKeyCode, CGEventFlags, String)] {
  press(key, flags, kind)
  Thread.sleep(forTimeInterval: 0.3)
}
Thread.sleep(forTimeInterval: 1)
press(53, [], "escape")
