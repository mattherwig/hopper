# Releasing to the Raycast Store

Source: https://developers.raycast.com/basics/prepare-an-extension-for-store and https://developers.raycast.com/basics/publish-an-extension

## One-time prerequisites

- [x] Raycast username = `author` in `extension/package.json`: `matt_herwig` (confirmed by owner). Deeplinks in CLAUDE.md and scripts/bench.swift use it too. Note: a second profile `raycast.com/mattherwig` also exists; make sure Raycast is signed in as `matt_herwig` before publishing.
- [ ] GitHub account (the publish command forks `raycast/extensions` and opens a PR from it).
- [ ] Node ≥ 22.22 (`nvm use`).
- [ ] Xcode 16.3+ installed and selected (`xcode-select -p`), needed to build the Swift helper.

## Pre-submit checklist

All commands below run in `extension/`. Publish ships everything on disk in `extension/` (ADR-012): check nothing dev-only or stray (e.g. `.DS_Store`, `swift/.build/`) is in there first.

- [ ] `cd extension && npm run check` passes (tests + `ray lint` + `ray build`).
- [ ] Test the **distribution** build (the PR checklist asks for it). `npm run build` is plain `ray build`, which defaults to `-e dev`; the real one is `-e dist`. `ray build` writes into Raycast's installed copy (`~/.config/raycast/extensions/jumper`), so: stop `ray develop` (its watcher would overwrite it), `cd extension && npx ray build -e dist`, then test in Raycast. Restart `npm run dev` afterwards.
- [ ] Manually test built extension: bind hotkeys (suggest ⌃⌥[ / ⌃⌥]), walk back 3 apps, forward 3, switch manually mid-walk, quit an app mid-walk, test with apps on other Spaces and hidden apps.
- [ ] `extension/metadata/` folder: 3–6 PNG screenshots, 2000×1250 — **required** because `history` is a `view` command. Capture with Raycast "Window Capture" (hotkey in Raycast settings) → "Save to Metadata" while running `npm run dev`, or rerun the `store-screenshots` skill. Ideas: history list; command search showing both hotkey commands; HUD "No earlier app in history".
- [ ] Icon looks good in light + dark Raycast themes (`extension/assets/extension-icon.png`, 512×512 PNG; optional `extension-icon@dark.png`).
- [ ] `extension/README.md` explains hotkey setup (Store shows it).
- [ ] `extension/CHANGELOG.md` top entry `## [Title] - {PR_MERGE_DATE}` (literal placeholder; Raycast fills it).
- [ ] `extension/package-lock.json` committed.

## Publish

```bash
cd extension && npm run publish
```

Authenticates with GitHub, forks raycast/extensions, squashes, opens PR. Fill the PR template (description + screencast of Back/Forward in action + checklist). Review: first contact ~1 week (can be up to 15 business days). PRs auto-close after 21 days inactive — respond to review comments promptly. Merge = auto-published.

## Updates

1. Add `extension/CHANGELOG.md` entry on top (`## [What Changed] - {PR_MERGE_DATE}`).
2. If others contributed to the Store copy: `cd extension && npx @raycast/api@latest pull-contributions` first.
3. `cd extension && npm run check && npm run publish` → new PR.

Never rename command `name`s (breaks users' hotkeys).

## Marketing after approval

- Store page: https://www.raycast.com/matt_herwig/jumper (verify after merge).
- Post pitch (see `docs/RESEARCH.md` → Pitch) to: r/raycastapp, r/macapps, Raycast Slack #extensions, Show HN (optional), X with a short screen recording.
- Answer existing "switch to previous app mac" threads (links in RESEARCH.md) where on-topic.
