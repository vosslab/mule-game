// Node unit test enforcing that every exported rule constant in
// src/engine/constants.ts carries a source comment. Run via check_codebase.sh:
// node --import tsx --test tests/test_*.mjs (also runs standalone with plain
// `node --test tests/test_constants_sources.mjs`; this file parses source
// text with regex instead of importing the .ts module, so it needs no loader
// and stays correct while another concurrent lane widens the Resource type
// in constants.ts -- this test only reads the file's text at run time).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Shrink-me allowlist: exported constants whose nearest "Source:" comment
// sits more than SOURCE_COMMENT_WINDOW lines above the declaration (usually
// because several sibling constants share one group comment block). Add an
// entry here (naming the constant) only when a genuinely new constant is
// added without its own nearby source comment; remove an entry once that
// constant gets a dedicated source comment within the window.
const MISSING_NEARBY_SOURCE_ALLOWLIST = new Set(["STORE_OPENING_STOCK", "YIELD_TABLE_BY_RESOURCE"]);

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONSTANTS_FILE = path.join(REPO_ROOT, "src", "engine", "constants.ts");

const EXPORT_CONST_PATTERN = /^export const (\w+)/;
const SOURCE_COMMENT_WINDOW = 10;

//============================================
function findConstantDeclarations(lines) {
  const declarations = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const match = EXPORT_CONST_PATTERN.exec(lines[lineIndex]);
    if (match === null) {
      continue;
    }
    declarations.push({ name: match[1], lineIndex });
  }
  return declarations;
}

//============================================
function hasNearbySourceComment(lines, lineIndex) {
  const windowStart = Math.max(0, lineIndex - SOURCE_COMMENT_WINDOW);
  const windowLines = lines.slice(windowStart, lineIndex);
  // Word-boundary match: a plain /source/i also matches inside "Resource"
  // (Record<Resource, number> shows up in nearly every constant's type
  // annotation), which would make every constant falsely pass.
  return windowLines.some((line) => /\bsource\b/i.test(line));
}

const constantsSourceText = fs.readFileSync(CONSTANTS_FILE, "utf8");
const constantsLines = constantsSourceText.split("\n");
const declarations = findConstantDeclarations(constantsLines);

test("constants.ts exports at least one rule constant to check", () => {
  assert.ok(declarations.length > 0);
});

test("every exported constant carries a source comment within 10 lines, or is allowlisted", () => {
  const violations = [];
  for (const { name, lineIndex } of declarations) {
    if (MISSING_NEARBY_SOURCE_ALLOWLIST.has(name)) {
      continue;
    }
    if (hasNearbySourceComment(constantsLines, lineIndex)) {
      continue;
    }
    violations.push(
      `${name} (line ${lineIndex + 1}): no "Source" comment within ${SOURCE_COMMENT_WINDOW} lines above`,
    );
  }
  assert.deepEqual(violations, []);
});

test("allowlisted constants still exist and still lack a nearby source comment", () => {
  const declaredNames = new Set(declarations.map((declaration) => declaration.name));
  const stale = [];
  for (const allowlistedName of MISSING_NEARBY_SOURCE_ALLOWLIST) {
    if (!declaredNames.has(allowlistedName)) {
      stale.push(`${allowlistedName}: no longer declared in constants.ts, remove from allowlist`);
      continue;
    }
    const declaration = declarations.find((entry) => entry.name === allowlistedName);
    if (hasNearbySourceComment(constantsLines, declaration.lineIndex)) {
      stale.push(`${allowlistedName}: now has a nearby source comment, remove from allowlist`);
    }
  }
  assert.deepEqual(stale, []);
});
