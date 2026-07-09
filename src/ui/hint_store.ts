// First-run tutorial hint persistence.
//
// A tiny localStorage-backed dismissed-set, deliberately separate from
// src/ui/save_log.ts's autosave slot (SAVE_STORAGE_KEY = "mule-game-save-v1"):
// hint dismissal is a standing UI preference that should survive New Game and
// outlive any single save, not part of a resumable game's own record. Same
// "-v1" suffix convention as save_log.ts, for the same reason (a future schema
// change gets its own key rather than silently reinterpreting old data).
//
// `?hints=off` is an escape hatch for a Playwright spec (or a player) that
// wants every hint suppressed without touching localStorage: it is checked
// first in isHintDismissed, so it behaves exactly like every hint already
// being dismissed.

/** The five phase-scoped hints this workstream ships, one per "first encounter". */
export type HintKind = "land_grant" | "land_auction" | "develop" | "auction" | "town";

/** localStorage key the dismissed-hint set lives under. */
export const HINTS_STORAGE_KEY = "mule-game-hints-dismissed-v1";

//============================================
/**
 * The active localStorage, or null when none exists (node unit tests, or a
 * browser with storage disabled). Matches save_log.ts's identical helper, so
 * callers never need to guard.
 *
 * @returns The Storage object, or null when unavailable.
 */
function storage(): Storage | null {
  if (typeof localStorage === "undefined") {
    return null;
  }
  return localStorage;
}

//============================================
/**
 * Whether `?hints=off` is present in the current page URL. Checked once per
 * call rather than cached, since the only caller (isHintDismissed) is itself
 * only invoked once per hint per mount.
 *
 * @returns True when the query param disables every hint.
 */
export function hintsDisabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const params = new URLSearchParams(window.location.search);
  return params.get("hints") === "off";
}

//============================================
/**
 * The set of hint kinds already dismissed, read from localStorage. A missing,
 * corrupt, or non-array stored value reads as an empty set rather than
 * throwing, matching save_log.ts's tolerant read of externally-mutable data.
 *
 * @returns The dismissed hint kinds.
 */
function readDismissedSet(): ReadonlySet<HintKind> {
  const ls = storage();
  if (ls === null) {
    return new Set();
  }
  const raw = ls.getItem(HINTS_STORAGE_KEY);
  if (raw === null) {
    return new Set();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new Set();
  }
  if (!Array.isArray(parsed)) {
    return new Set();
  }
  return new Set(parsed.filter((entry): entry is HintKind => typeof entry === "string"));
}

//============================================
/**
 * Whether a given hint has already been dismissed (or hints are globally
 * disabled via `?hints=off`), so a caller mounting a hint component knows
 * whether to render it at all.
 *
 * @param kind - The hint to check.
 * @returns True when the hint should stay hidden.
 */
export function isHintDismissed(kind: HintKind): boolean {
  if (hintsDisabled()) {
    return true;
  }
  return readDismissedSet().has(kind);
}

//============================================
/**
 * Record a hint as dismissed, so it never shows again on this device. A no-op
 * when no localStorage is available.
 *
 * @param kind - The hint being dismissed.
 */
export function dismissHint(kind: HintKind): void {
  const ls = storage();
  if (ls === null) {
    return;
  }
  const next = new Set(readDismissedSet());
  next.add(kind);
  ls.setItem(HINTS_STORAGE_KEY, JSON.stringify([...next]));
}
