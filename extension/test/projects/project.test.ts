import { test } from "node:test";
import assert from "node:assert/strict";
import { projectLabel, projectOf } from "../../src/lib/projects/project.ts";

test("a repository is a project; a worktree belongs to its main checkout, named by branch", () => {
  assert.equal(projectOf(undefined), undefined);
  const main = projectOf({ root: "/p/jumper", mainRoot: "/p/jumper", branch: "main" });
  assert.deepEqual(main, { name: "jumper", root: "/p/jumper" });
  const worktree = projectOf({ root: "/p/jumper-agents", mainRoot: "/p/jumper", branch: "agents/levels" });
  assert.deepEqual(worktree, { name: "jumper", root: "/p/jumper", worktree: "agents/levels" });
  assert.equal(projectLabel(worktree!), "jumper · agents/levels");
  assert.equal(projectOf({ root: "/p/x-wt", mainRoot: "/p/x" })?.worktree, "x-wt");
});
