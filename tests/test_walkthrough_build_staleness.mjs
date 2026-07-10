// Node unit tests for the stale-dist rebuild guard in
// tests/e2e/walkthrough_helpers.mjs. Covers the pure staleness decision
// (decideDistStaleness) and the recursive mtime scan (newestMtimeMsRecursive)
// without ever invoking build_github_pages.sh -- buildSiteIfStale itself
// (the function that actually shells out to the build) is left to the
// existing e2e coverage, since it is an execFileSync side effect, not pure
// logic.
// Run via check_codebase.sh: node --import tsx --test tests/test_*.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { decideDistStaleness, newestMtimeMsRecursive } from "../tests/e2e/walkthrough_helpers.mjs";

//============================================
/**
 * Create a fresh temp directory for a single test's file tree.
 *
 * @returns Absolute path of the created temp directory.
 */
function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "walkthrough-build-staleness-"));
}

// ============================================================
// decideDistStaleness: pure decision, no filesystem access.
// ============================================================

test("decideDistStaleness rebuilds when dist/index.html is missing", () => {
  const decision = decideDistStaleness(null, 1000, "src");

  assert.equal(decision.stale, true);
  assert.match(decision.reason, /missing/);
});

test("decideDistStaleness rebuilds when a source input is newer than dist", () => {
  const decision = decideDistStaleness(1000, 2000, "/repo/src");

  assert.equal(decision.stale, true);
  assert.match(decision.reason, /\/repo\/src/);
  assert.match(decision.reason, /newer than dist/);
});

test("decideDistStaleness skips the build when dist is newer than every source input", () => {
  const decision = decideDistStaleness(2000, 1000, "/repo/src");

  assert.equal(decision.stale, false);
  assert.match(decision.reason, /newer than every tracked source input/);
});

test("decideDistStaleness skips the build when dist and source share the same mtime", () => {
  // Equal mtimes are not "source newer than dist", so this is the fresh case.
  const decision = decideDistStaleness(1500, 1500, "/repo/src");

  assert.equal(decision.stale, false);
});

// ============================================================
// newestMtimeMsRecursive: real filesystem, temp directories only.
// ============================================================

test("newestMtimeMsRecursive returns a single file's own mtime", () => {
  const dir = makeTempDir();
  const filePath = path.join(dir, "only.txt");
  fs.writeFileSync(filePath, "content");
  const expected = fs.statSync(filePath).mtimeMs;

  assert.equal(newestMtimeMsRecursive(filePath), expected);
});

test("newestMtimeMsRecursive finds the newest mtime among nested files", () => {
  const dir = makeTempDir();
  const oldPath = path.join(dir, "old.txt");
  fs.writeFileSync(oldPath, "old");
  const oldTimeMs = Date.now() - 60_000;
  fs.utimesSync(oldPath, oldTimeMs / 1000, oldTimeMs / 1000);

  const nestedDir = path.join(dir, "nested");
  fs.mkdirSync(nestedDir);
  const newPath = path.join(nestedDir, "new.txt");
  fs.writeFileSync(newPath, "new");
  const newTimeMs = Date.now();
  fs.utimesSync(newPath, newTimeMs / 1000, newTimeMs / 1000);

  const newest = newestMtimeMsRecursive(dir);

  // The nested file's mtime wins; allow a small tolerance for filesystem
  // mtime rounding (some filesystems truncate to whole seconds).
  assert.ok(Math.abs(newest - newTimeMs) < 1000);
  assert.ok(newest > fs.statSync(oldPath).mtimeMs);
});

test("newestMtimeMsRecursive reflects a source edit made after the initial scan", () => {
  const dir = makeTempDir();
  const filePath = path.join(dir, "file.txt");
  fs.writeFileSync(filePath, "v1");
  const firstMtimeMs = newestMtimeMsRecursive(dir);

  // Simulate an edit landing strictly after the first scan.
  const laterTimeMs = firstMtimeMs + 5000;
  fs.writeFileSync(filePath, "v2");
  fs.utimesSync(filePath, laterTimeMs / 1000, laterTimeMs / 1000);

  const secondMtimeMs = newestMtimeMsRecursive(dir);

  assert.ok(secondMtimeMs > firstMtimeMs);
});
