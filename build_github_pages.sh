#!/usr/bin/env bash
# build_github_pages.sh - canonical production build for GitHub Pages.
#
# Front door: run this directly as ./build_github_pages.sh. It is the
# interface for everyone, no npm knowledge required. The npm run build
# alias is an optional mirror that points right back at this script.
#
# Contract:
#   - Wipes dist/ from scratch.
#   - Type-checks via 'tsc --noEmit -p tsconfig.json'.
#   - Resolves the entry: src/main.ts preferred, src/init.ts legacy fallback.
#     Aborts with an actionable error if neither exists.
#   - Verifies src/index.html and src/style.css exist before copying;
#     aborts with an actionable error if missing.
#   - Verifies src/index.html references dist/main.js with a module script
#     tag (warns if missing -- the page will load but main.js is dead).
#   - Bundles the entry into dist/main.js via pipeline/build.mjs (esbuild
#     JS-API + esbuild-plugin-solid for SolidJS JSX; ESM, es2020, browser,
#     minified, with sourcemap).
#   - Copies src/index.html and src/style.css into dist/.
#   - Copies src/manifest.json and src/sw.js (PWA install: manifest + offline
#     cache) verbatim into dist/, and generates dist/icons/icon-192.png /
#     icon-512.png via tools/generate_pwa_icons.mjs.
#   - Writes dist/.nojekyll so GitHub Pages serves files starting with _.
#   - Asserts dist/index.html and dist/main.js exist before exiting.
#
# Hard rule: never produces single-file output. ESM only.

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# Resolve entry point.
if [ -f "src/main.ts" ]; then
	ENTRY="src/main.ts"
elif [ -f "src/init.ts" ]; then
	ENTRY="src/init.ts"
	echo "WARNING: using legacy src/init.ts. Rename to src/main.ts." >&2
else
	echo "ERROR: no entry point. Create src/main.ts (preferred) or src/init.ts." >&2
	exit 1
fi

# Verify required static assets before any destructive step.
for required in src/index.html src/style.css src/manifest.json src/sw.js; do
	if [ ! -f "$required" ]; then
		echo "ERROR: required source file missing: $required" >&2
		case "$required" in
			src/index.html)
				echo "  Create src/index.html with a <script type=\"module\" src=\"main.js\"></script> tag." >&2 ;;
			src/style.css)
				echo "  Create src/style.css (empty file is fine)." >&2 ;;
			src/manifest.json)
				echo "  Create src/manifest.json (PWA manifest: name, icons, start_url, display)." >&2 ;;
			src/sw.js)
				echo "  Create src/sw.js (offline-cache service worker)." >&2 ;;
		esac
		exit 1
	fi
done

# Soft-warn if index.html does not reference main.js as an ES module.
if ! grep -Eq '<script[^>]+type="module"[^>]+src="(\./)?main\.js"' src/index.html; then
	echo "WARNING: src/index.html does not appear to load main.js as an ES module." >&2
	echo "  Expected tag: <script type=\"module\" src=\"main.js\"></script>" >&2
	echo "  Build will proceed; the page may render but main.js will not run." >&2
fi

rm -rf dist
mkdir -p dist

npx tsc --noEmit -p tsconfig.json

# Bundle via the esbuild JS-API (pipeline/build.mjs) rather than the esbuild
# CLI: the SolidJS JSX transform needs esbuild-plugin-solid, which the CLI
# cannot load. The script produces the same single ESM bundle (es2020, browser,
# minified, with sourcemap) into dist/main.js. See docs/TYPESCRIPT_STYLE.md
# "esbuild CLI vs JS-API".
node pipeline/build.mjs "$ENTRY"

cp src/index.html dist/index.html
cp src/style.css dist/style.css
cp src/manifest.json dist/manifest.json
cp src/sw.js dist/sw.js
node tools/generate_pwa_icons.mjs dist/icons
touch dist/.nojekyll

test -f dist/index.html
test -f dist/main.js
test -f dist/manifest.json
test -f dist/sw.js
test -f dist/icons/icon-192.png
test -f dist/icons/icon-512.png

echo "Built dist/ (GitHub Pages-ready)."
