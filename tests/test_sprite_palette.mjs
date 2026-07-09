// Node unit test enforcing that every sprite module draws colors only from
// the shared palette (src/ui/sprites/palette.ts). Run via check_codebase.sh:
// node --import tsx --test tests/test_*.mjs (also runs standalone with plain
// `node --test tests/test_sprite_palette.mjs`; this file parses source text
// with regex instead of importing the .ts modules, so it needs no loader).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Shrink-me allowlist: legacy hex literals in src/ui/sprites.ts that predate
// the palette module and have not yet been migrated to a PALETTE token. Add
// an entry here (with a comment naming the file) only when a genuinely new
// legacy hex shows up; remove an entry once its sprite file is migrated to
// import PALETTE directly. Empty today because sprites.ts's current hex
// literals already match the palette values chosen in the spec doc.
const LEGACY_HEX_ALLOWLIST = new Set();

// Non-hex fill/stroke values that are always allowed (no palette lookup
// applies): keyword values and url() references to gradients/patterns.
const NON_HEX_ALLOWLIST = new Set(["none", "currentColor"]);

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SPRITES_DIR = path.join(REPO_ROOT, "src", "ui", "sprites");
const LEGACY_SPRITES_FILE = path.join(REPO_ROOT, "src", "ui", "sprites.ts");
const PALETTE_FILE = path.join(SPRITES_DIR, "palette.ts");

const QUOTED_HEX_PATTERN = /["'](#[0-9a-fA-F]{3,8})["']/g;
const PALETTE_KEY_PATTERN = /^\s*(\w+):\s*"#[0-9a-fA-F]{3,8}"/gm;
const URL_REF_PATTERN = /url\([^)]*\)/g;

//============================================
function extractQuotedHexLiterals(sourceText) {
  const withoutUrlRefs = sourceText.replace(URL_REF_PATTERN, "");
  const hexValues = [];
  for (const match of withoutUrlRefs.matchAll(QUOTED_HEX_PATTERN)) {
    const hexValue = match[1];
    if (hexValue === undefined) {
      continue;
    }
    hexValues.push(hexValue.toLowerCase());
  }
  return hexValues;
}

//============================================
function discoverSpriteFiles() {
  const files = [LEGACY_SPRITES_FILE];
  if (fs.existsSync(SPRITES_DIR)) {
    for (const entryName of fs.readdirSync(SPRITES_DIR)) {
      if (!entryName.endsWith(".ts")) {
        continue;
      }
      // palette.ts is the definition file, not a color consumer; excluded
      // from the "must draw from PALETTE" check it enforces on everyone else.
      if (entryName === "palette.ts") {
        continue;
      }
      files.push(path.join(SPRITES_DIR, entryName));
    }
  }
  return files;
}

const paletteSourceText = fs.readFileSync(PALETTE_FILE, "utf8");
const paletteHexSet = new Set(extractQuotedHexLiterals(paletteSourceText));
// Distinct token count uses key matches, not distinct hex values: a few
// tokens intentionally reuse another token's hex (player2 mirrors gold,
// textOnLight mirrors bgDeep), which is a legitimate naming choice, not a
// missing color.
const paletteTokenCount = Array.from(paletteSourceText.matchAll(PALETTE_KEY_PATTERN)).length;

test("palette.ts defines at least 20 named tokens", () => {
  assert.ok(paletteTokenCount >= 20, `expected >=20 palette tokens, found ${paletteTokenCount}`);
});

const spriteFiles = discoverSpriteFiles();

test("every sprite file's hex literals come from PALETTE or the legacy allowlist", () => {
  const violations = [];
  for (const filePath of spriteFiles) {
    const relPath = path.relative(REPO_ROOT, filePath);
    const sourceText = fs.readFileSync(filePath, "utf8");
    for (const hexValue of extractQuotedHexLiterals(sourceText)) {
      if (NON_HEX_ALLOWLIST.has(hexValue)) {
        continue;
      }
      if (paletteHexSet.has(hexValue)) {
        continue;
      }
      if (LEGACY_HEX_ALLOWLIST.has(hexValue)) {
        continue;
      }
      violations.push(`${relPath}: ${hexValue}`);
    }
  }
  assert.deepEqual(violations, []);
});
