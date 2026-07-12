// Fast-lane gate (WP-LINT-1) running devel/lint_alien_svg.py over every
// current art/aliens/<species>.svg and asserting a clean exit. The Python
// checker is pure stdlib (no third-party imports, see devel/lint_alien_svg.py),
// so this test invokes plain `python3` directly rather than
// `source source_me.sh && python3`, keeping it a single fast child process
// per species with no shell-sourcing overhead.
//
// Measured runtime (node --test tests/test_alien_svg_lint.mjs) linting both
// current species files (humanoid, gollumer) on this machine: 447ms total,
// about 180ms per spawnSync call (mostly python3 and xmllint subprocess
// startup, not check logic). Slower than the 31ms single-file raster check
// devel/measure_alien_art.py cites, but still well inside the fast lane.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { REPO_ROOT } from "./playwright/repo_root.mjs";

const LINT_SCRIPT = path.join(REPO_ROOT, "devel", "lint_alien_svg.py");
const ALIENS_DIR = path.join(REPO_ROOT, "art", "aliens");

//============================================
function discoverSpeciesFiles() {
  if (!fs.existsSync(ALIENS_DIR)) {
    return [];
  }
  return fs.readdirSync(ALIENS_DIR)
    .filter((entryName) => entryName.endsWith(".svg"))
    .map((entryName) => path.join(ALIENS_DIR, entryName));
}

const speciesFiles = discoverSpeciesFiles();

test("at least one alien species SVG exists to lint", () => {
  assert.ok(speciesFiles.length > 0, `no *.svg files found under ${ALIENS_DIR}`);
});

for (const speciesFile of speciesFiles) {
  test(`${path.basename(speciesFile)} conforms to docs/ALIEN_ART_CONTRACT.md`, () => {
    const result = spawnSync("python3", [LINT_SCRIPT, "-i", speciesFile], {
      encoding: "utf8",
    });
    assert.equal(
      result.status,
      0,
      `lint_alien_svg.py reported violations for ${speciesFile}:\n${result.stdout}${result.stderr}`,
    );
  });
}
