// Staleness gate for the generated species sprites (WP-GEN-1).
//
// src/ui/sprites/sprites_species.ts is generated from the alien art in
// art/aliens/ by devel/build_species_sprites.py. This test regenerates into a
// temporary buffer and compares it byte for byte with the committed file, so a
// hand edit to the generated TypeScript, or an art edit that was never
// regenerated, fails here instead of silently diverging.
//
// While the eight-species cast is still being drawn, art/aliens/ is incomplete.
// The test skips (loudly, naming the missing species) rather than failing for a
// missing input: there is nothing to compare against until every species has a
// file. Once the cast lands and the file is regenerated, the skip goes away on
// its own and the comparison starts gating.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { SPECIES_NAMES } from "../src/ui/sprites/sprites_species.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ART_DIR = path.join(REPO_ROOT, "art", "aliens");
const GENERATOR = path.join(REPO_ROOT, "devel", "build_species_sprites.py");
const GENERATED_FILE = path.join(REPO_ROOT, "src", "ui", "sprites", "sprites_species.ts");

// Species whose art file does not exist yet.
function missingSpecies() {
  return SPECIES_NAMES.filter((species) => !fs.existsSync(path.join(ART_DIR, `${species}.svg`)));
}

// Run the generator into a scratch file and return the TypeScript it would write.
function generateIntoBuffer() {
  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "species-sprites-"));
  const scratchFile = path.join(scratchDir, "sprites_species.ts");
  const result = spawnSync("python3", [GENERATOR, "--art-dir", ART_DIR, "--output", scratchFile], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `devel/build_species_sprites.py failed:\n${result.stderr ?? ""}`);
  const generated = fs.readFileSync(scratchFile, "utf8");
  fs.rmSync(scratchDir, { recursive: true, force: true });
  return generated;
}

test("sprites_species.ts matches a fresh generation from art/aliens/", (t) => {
  const missing = missingSpecies();
  if (missing.length > 0) {
    t.skip(`art/aliens/ is incomplete; still unwritten: ${missing.join(", ")}`);
    return;
  }
  const fresh = generateIntoBuffer();
  const committed = fs.readFileSync(GENERATED_FILE, "utf8");
  assert.equal(
    committed,
    fresh,
    "src/ui/sprites/sprites_species.ts is stale or hand-edited. Edit art/aliens/*.svg, then run:\n" +
      "  source source_me.sh && python3 devel/build_species_sprites.py",
  );
});
