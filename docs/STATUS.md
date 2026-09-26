# Status

_Narrative snapshot. Update at the end of every session that changes state. Actionable work lives in GitHub Issues (see CLAUDE.md → Tasks), not here._

## 2026-09-26 — v1 built (Swift helper merged), on GitHub, not yet submitted to Store

Done:
- Commands: Jump Back to Previous App, Jump Forward to Next App, Show App History.
- Pure navigation logic + 6 unit tests passing; `ray lint` + `ray build` clean.
- E2E verified via deeplinks on macOS 26.5 and again on macOS 27.0 / Xcode 27 with the Swift helper.
- Perf: in-command time 140ms → ~48ms. App list now read by a native Swift helper (ADR-008, #2), measured on macOS 27 / Xcode 27.
- Icon generated (`scripts/make-icon.swift`).
- Raycast author confirmed: `matt_herwig`. Owner has hotkeys bound and is dogfooding.
- Public repo: https://github.com/mattherwig/jumper. Tasks tracked as Issues.

- Show App History actions: Remove from History (hidden until used again, inferred from MRU order) and Exclude from History (#4; permanent, undo from the Excluded section). Stored in LocalStorage, not preferences, since commands can't write preferences. Unit-tested; not yet dogfooded in Raycast.

Next: `gh issue list`. Publishing (#1) is **on hold** by owner choice; the issue is ready to execute when resumed.
