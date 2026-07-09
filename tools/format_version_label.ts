// Seeds a .ts file under tools/ so `tsc -p tsconfig.lint.json` has an input
// to type-check (see the TS18003 gotcha noted in docs/TYPESCRIPT_STYLE.md).
// Kept dependency-free (no node: imports) so it type-checks under the
// browser-focused root tsconfig.json lib set as well.

//============================================
export function formatVersionLabel(version: string): string {
  const versionLabel = `M.U.L.E. v${version}`;
  return versionLabel;
}
