---
name: publish-store
description: Submit or update Jumper on the Raycast Store (npm run publish → PR on raycast/extensions), then fill the PR, get CI green, and triage bot reviews. Use when asked to publish, re-publish, push an update to the Store, or fix a failing Store PR.
---

# Publish to the Raycast Store

Everything here is outward-facing: **confirm with the owner before running publish, editing the PR, marking it ready, or commenting.** Checklist and background: `docs/RELEASING.md`. Tracking issue: #1.

## How publishing works

- `npm run publish` (run in `extension/`) copies **every file on disk** in `extension/` into a fork of `raycast/extensions` (branch `ext/jumper`) and opens or updates a PR. Not a git export, and there is no ignore file: only `.git`, `.github`, `node_modules`, `raycast-env.d.ts`, `.direnv`, `.raycast-swift-build`, `.swiftpm`, `compiled_raycast_*` are skipped. That's why dev material lives at the repo root (ADR-012).
- Merge = published. Later updates: run publish again; it updates the open PR or opens a new one.

## 1. Before publishing

1. `extension/CHANGELOG.md` top entry is `## [Title] - {PR_MERGE_DATE}` (keep the placeholder literally; Raycast fills it on merge).
2. `cd extension && npm run check` passes.
3. Test the **distribution** build (the PR checklist asks for it): `npm run build` is plain `ray build` = `-e dev`. Stop `ray develop`, `cd extension && npx ray build -e dist` (it writes into Raycast's installed copy), exercise all commands via deeplinks, then restart `npm run dev`.
4. If `extension/metadata/` changed: run Raycast's image checker locally (see the `store-screenshots` skill). CI fails on screenshot padding.
5. Remove stray files that would ship: `rm -rf extension/swift/.build` (every `ray build`/`npm run check` recreates it) and `find extension -name .DS_Store -not -path "*/node_modules/*" -delete`.
6. Commit and push to github.com/mattherwig/jumper first, so the PR matches the repo.

## 2. Publish

Needs an interactive TTY (it fails in a background Bash with `process.stdin.setRawMode is not a function`). Run it in the owner's Terminal panel:

```bash
source ~/.nvm/nvm.sh && nvm use && npm run publish
```
(cwd `extension/`). On first use it prints a GitHub one-time code and waits for Enter: the **owner** presses Enter, pastes the code in the browser, and approves the Raycast CLI. Don't approve OAuth for them. Then it forks, pushes, and prints the PR URL.

## 3. After publishing

- Verify what shipped: `gh api repos/raycast/extensions/pulls/<n>/files --paginate --jq '.[].filename'` (expect only extension files, no `swift/.build`, no docs).
- A **new** PR is opened as a **draft with an empty template**. Fill it (description, screencast = `![demo](https://github.com/mattherwig/jumper/raw/main/extension/media/demo.gif)`, checklist) and only tick boxes that are true (e.g. "tested this distribution build" only after step 1.3 or the owner confirms).
  - `gh pr edit` fails on this repo (GraphQL "Projects (classic) is being deprecated"). Use REST: `gh api -X PATCH repos/raycast/extensions/pulls/<n> -F body=@body.md`.
  - `gh pr ready <n> --repo raycast/extensions` works.
- Comment the PR link on issue #1 (REST works: `gh api repos/mattherwig/jumper/issues/1/comments -f body=...`).

## 4. CI and bot reviews

- `gh pr checks <n> --repo raycast/extensions`; failed logs: `gh run view <run-id> --repo raycast/extensions --log-failed`.
- Known CI gates: `metadata-images` (screenshot padding/background, see `store-screenshots`), `changelog`, extension build, lint.
- Bots comment within minutes: **Greptile** (code review with P1/P2 findings) and **Socket** (dependency scan). Neither blocks merge, but human reviewers read them. Verify each finding against the code, fix the valid ones with tests, re-publish; Greptile re-reviews each push.
- Human review: first contact ~1 week (up to 15 business days). PRs go stale after 14 days and close after 21 days without activity: answer reviewers promptly. If Raycast staff edit the Store copy, `cd extension && npx @raycast/api@latest pull-contributions` before the next publish.
