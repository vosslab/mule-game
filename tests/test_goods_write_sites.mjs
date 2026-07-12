// Structural guard: every place in src/engine that constructs a Player's
// `goods` field must be one of a small, explicitly reviewed set of "write
// sites". This protects the round ledger's exactness identity
// (previous - usage - spoilage + production + eventDelta = held): that
// identity holds only because every site that produces a new `goods` value
// is either recorded directly, captured indirectly through a before/after
// diff, or explicitly outside the ledger's round window. A new, unreviewed
// write site would silently under-record and the accounting screen would
// quietly start lying to the player -- exactly the failure the ledger exists
// to prevent. Run via `node --import tsx --test tests/test_goods_write_sites.mjs`
// (also runs standalone with plain `node --test`; this file parses source
// text with regex instead of importing the .ts modules, so it needs no
// loader and stays correct while the engine files it scans keep changing).
//
// LIMITS OF THIS GUARD:
// - It is a text/regex scan, not a TypeScript parser. It anchors each write
//   on the nearest preceding named-function or personal-event-name line, so
//   unusual formatting (a `goods:` key split oddly across lines, two
//   functions of the same name in different files colliding with one
//   allow-list entry) could confuse it.
// - It proves only that a NEW, unaccounted-for site exists (or that an
//   allow-listed site has gone stale). It says nothing about whether an
//   allow-listed site is still handled correctly -- that is what the round
//   ledger's own reconciliation tests are for, not this file.
// - It scans only src/engine, because that is the code path the round
//   ledger and the real turn/auction loop actually run through. Hand-built
//   fixture GameStates for standalone demo screens (for example
//   src/ui/solid/map_demo.tsx) also construct a `goods:` value but never
//   flow through the round ledger's turn loop, so they are out of scope.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE_DIR = path.join(REPO_ROOT, "src", "engine");

// Matches a `goods:` VALUE construction (object literal or a lowercase-
// starting variable reference), such as `goods: { ...player.goods, food:
// kept }` or `goods: afterSpoilage`. Deliberately lowercase-only on the
// identifier branch so it does not also match a TYPE reference (TypeScript
// convention capitalizes type names), which is what excludes both
// `applySpoilage(goods: ResourceRecord)`'s parameter declaration and
// player.ts's `readonly goods: Readonly<Record<Resource, number>>;` field
// declaration without needing a separate allow-list entry for either.
const GOODS_WRITE_PATTERN = /\bgoods:\s*(\{|[a-z_])/;
// Prose in a comment can still contain the literal substring "goods:"
// (see turn.ts's "did to the player's goods: the personal event's..."),
// so comment lines are excluded regardless of what follows the colon.
const COMMENT_LINE_PATTERN = /^\s*\/\//;

// Anchors a write to the nearest enclosing named function...
const FUNCTION_ANCHOR_PATTERN = /^\s*(?:export\s+)?function\s+(\w+)/;
// ...or, for object-literal event handlers with no named function of their
// own (events.ts's personal-event descriptors), the nearest enclosing
// `name: "some_event"` field.
const EVENT_NAME_ANCHOR_PATTERN = /name:\s*"(\w+)"/;

// The known, reviewed set of places a Player's `goods` value is constructed.
// Each entry names the file (relative to src/engine/), the anchor (enclosing
// function or personal-event name), and WHY that site needs no DIRECT
// ledger-recording call of its own.
const ALLOWED_WRITE_SITES = [
  {
    file: "turn.ts",
    anchor: "createStartingPlayer",
    reason: "initial player creation, outside any round window (legitimately unrecorded)",
  },
  {
    file: "turn.ts",
    anchor: "beginDevelopTurn",
    reason: "develop-turn food usage, recorded via recordDevelopTurnInLedger",
  },
  {
    file: "turn.ts",
    anchor: "enterProduction",
    reason: "post-spoilage/production assignment, recorded via recordProductionInLedger",
  },
  {
    file: "auction.ts",
    anchor: "tradePlayer",
    reason:
      "trade execution (buyer credit and seller debit), correctly outside the ledger " +
      "window; the ledger closes at window creation",
  },
  {
    file: "events.ts",
    anchor: "addGood",
    reason:
      "personal-event goods-delta helper; its net effect is captured through the " +
      "before/after diff in turn.ts's beginDevelopTurn (recordDevelopTurnInLedger " +
      "compares preFoodPlayer.goods to the post-event player.goods), not a direct " +
      "ledger call of its own",
  },
  {
    file: "events.ts",
    anchor: "mischievous_elves",
    reason: "personal event handler (halves food); same before/after diff capture as addGood",
  },
];

//============================================
function findAnchor(lines, matchLineIndex) {
  for (let lineIndex = matchLineIndex; lineIndex >= 0; lineIndex -= 1) {
    const functionMatch = FUNCTION_ANCHOR_PATTERN.exec(lines[lineIndex]);
    if (functionMatch !== null) {
      return functionMatch[1];
    }
    const eventMatch = EVENT_NAME_ANCHOR_PATTERN.exec(lines[lineIndex]);
    if (eventMatch !== null) {
      return eventMatch[1];
    }
  }
  return "(no enclosing function or event name found)";
}

//============================================
function findWriteSites(filePath) {
  const relFile = path.relative(ENGINE_DIR, filePath).split(path.sep).join("/");
  const lines = fs.readFileSync(filePath, "utf8").split("\n");
  const sites = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (!GOODS_WRITE_PATTERN.test(line) || COMMENT_LINE_PATTERN.test(line)) {
      continue;
    }
    sites.push({ file: relFile, anchor: findAnchor(lines, lineIndex), lineNumber: lineIndex + 1 });
  }
  return sites;
}

//============================================
function isAllowed(site) {
  return ALLOWED_WRITE_SITES.some(
    (allowed) => allowed.file === site.file && allowed.anchor === site.anchor,
  );
}

//============================================
function formatFailureMessage(site) {
  const location = `src/engine/${site.file}, inside "${site.anchor}" (near line ${site.lineNumber})`;
  const explanation =
    "The round ledger's exactness identity " +
    "(previous - usage - spoilage + production + eventDelta = held) holds only " +
    "because EVERY write to a player's goods is either recorded, captured through " +
    "a before/after diff, or explicitly outside the ledger's round window. This " +
    "site is none of those (yet).";
  const fix =
    "Fix by doing one of:\n" +
    "  1. Record this mutation in the round ledger (call recordDevelopTurnInLedger, " +
    "recordProductionInLedger, or add an equivalent record* call), or\n" +
    "  2. If the net effect is already captured elsewhere (like beginDevelopTurn's " +
    "before/after diff) or the site is legitimately outside the ledger's round window " +
    "(like initial player creation or trade execution), add it to ALLOWED_WRITE_SITES " +
    "in tests/test_goods_write_sites.mjs with a short reason.";
  return `Unaccounted-for player.goods write site: ${location}\n${explanation}\n${fix}`;
}

//============================================
function scanEngineForGoodsWrites() {
  const files = fs
    .readdirSync(ENGINE_DIR)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => path.join(ENGINE_DIR, name));
  return files.flatMap(findWriteSites);
}

test("at least one player.goods write site is found (guard is not silently scanning nothing)", () => {
  const sites = scanEngineForGoodsWrites();
  assert.ok(sites.length > 0);
});

test("every player.goods write site in src/engine is an allow-listed, accounted-for site", () => {
  const sites = scanEngineForGoodsWrites();
  const unaccountedSites = sites.filter((site) => !isAllowed(site));

  assert.deepEqual(unaccountedSites, [], unaccountedSites.map(formatFailureMessage).join("\n\n"));
});

test("the allow-list has no stale entries (every entry still matches a real write in src/engine)", () => {
  const sites = scanEngineForGoodsWrites();
  const staleEntries = ALLOWED_WRITE_SITES.filter(
    (allowed) =>
      !sites.some((site) => site.file === allowed.file && site.anchor === allowed.anchor),
  );

  const message =
    "These ALLOWED_WRITE_SITES entries no longer match any goods write in src/engine; " +
    "remove them (or fix the file/anchor) so the allow-list stays an accurate map of " +
    `reality: ${JSON.stringify(staleEntries)}`;
  assert.deepEqual(staleEntries, [], message);
});
