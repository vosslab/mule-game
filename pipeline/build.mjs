// esbuild JS-API bundler for the SolidJS app.
//
// The canonical esbuild CLI (docs/TYPESCRIPT_STYLE.md "BUILD SYSTEM") cannot
// load esbuild-plugin-solid, which the SolidJS JSX transform requires. This
// JS-API script is the doc-sanctioned second build path for Solid apps: it
// produces the same single ESM bundle the CLI does (es2020, browser, minified,
// with sourcemap) and adds the Solid plugin so .tsx files compile. .ts files
// are still handled by esbuild natively; only .tsx/.jsx go through the plugin.
//
// Build version: the bundle carries a stable per-build id via
// an esbuild `define` of __MULE_BUILD_VERSION__, consumed by src/ui/save_log.ts.
// The id is a short sha256 of every tracked source file under src/ (sorted by
// path, contents concatenated), so it changes whenever any source -- and
// therefore possibly the reducer's behavior -- changes. That is exactly the
// granularity autosave/resume needs: same-build replay is the only compatibility
// guarantee, so a save produced by a differently-behaving build must not be
// resumed (src/ui/save_log.ts discards it and the title screen shows a notice).
// Hashing source inputs (not the output bundle) keeps this a single build pass.
//
// Usage: node pipeline/build.mjs [entry]   (entry defaults to src/main.ts)
// Wired into build_github_pages.sh, which resolves the entry and owns the
// dist/ lifecycle (wipe, static-asset copy, .nojekyll, existence asserts).

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { build } from "esbuild";
import { solidPlugin } from "esbuild-plugin-solid";

const entry = process.argv[2] ?? "src/main.ts";

// Compute a stable per-build id from the source tree under src/.
const buildVersion = computeSourceHash("src");

await build({
  entryPoints: [entry],
  outfile: "dist/main.js",
  bundle: true,
  format: "esm",
  target: "es2020",
  platform: "browser",
  minify: true,
  sourcemap: true,
  define: {
    __MULE_BUILD_VERSION__: JSON.stringify(buildVersion),
  },
  plugins: [solidPlugin()],
});

//============================================
/**
 * Recursively collect every file under `root`, sorted by path, and return a
 * short sha256 of their concatenated contents (each prefixed by its path). The
 * path prefix makes a rename change the hash even when file contents are
 * unchanged. Twelve hex chars is ample to distinguish builds without bloating
 * the saved-game record.
 *
 * @param {string} root - Directory to hash (relative to the repo root).
 * @returns {string} A 12-character hex build id.
 */
function computeSourceHash(root) {
  const files = listFilesSorted(root);
  const hash = crypto.createHash("sha256");
  for (const file of files) {
    hash.update(file);
    hash.update("\0");
    hash.update(fs.readFileSync(file));
  }
  return hash.digest("hex").slice(0, 12);
}

//============================================
/**
 * Return every file under `dir`, recursively, as a sorted array of paths.
 *
 * @param {string} dir - Directory to walk.
 * @returns {string[]} Sorted file paths.
 */
function listFilesSorted(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesSorted(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  out.sort();
  return out;
}
