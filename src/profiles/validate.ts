/**
 * Validation helpers for `defineCcdaProfile`. Every validator returns `void` on
 * success and throws {@link CcdaProfileDefinitionError} on failure. The name
 * validator is split out so the factory can call it FIRST and pass `opts.name`
 * to every subsequent throw site (a bad-tolerance error should name the profile
 * it came from).
 *
 * The load-bearing check is {@link validateTolerations}: it refuses any
 * `tolerate` entry whose code is unknown, whose rationale is empty, or — the
 * safety rule — whose code is **safety-critical**. That refusal is what lets the
 * rest of the system treat "an active profile" as safe by construction.
 *
 * Zero runtime deps — inlined Levenshtein for the "did you mean?" hint.
 *
 * @internal
 */

import { CcdaProfileDefinitionError } from "../parser/errors.js";
import { WARNING_CODES } from "../parser/warnings.js";

import { isSafetyCriticalCode } from "./safety.js";
import type { DefineCcdaProfileOptions, QuirkTolerance } from "./types.js";

/**
 * Known top-level option keys accepted by `defineCcdaProfile`. Any key outside
 * this list throws with an optional Levenshtein-based "did you mean?" hint.
 *
 * @internal
 */
const KNOWN_OPTION_KEYS: readonly string[] = [
  "name",
  "description",
  "tolerate",
  "provenance",
  "extends",
];

/**
 * The set of every real warning code, for O(1) membership checks in
 * {@link validateTolerations}.
 *
 * @internal
 */
const ALL_WARNING_CODES: ReadonlySet<string> = new Set(Object.values(WARNING_CODES));

/**
 * Iterative DP Levenshtein distance. Zero-dep, ≤15 LoC; used only for the
 * unknown-option-key hint.
 *
 * @internal
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev: number[] = [];
  for (let j = 0; j <= b.length; j++) prev.push(j);
  for (let i = 1; i <= a.length; i++) {
    const curr: number[] = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr.push(Math.min((prev[j] ?? 0) + 1, (curr[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost));
    }
    prev = curr;
  }
  return prev[b.length] ?? 0;
}

/**
 * Validate the profile NAME (fail-fast). Throws on null/undefined opts, a
 * non-string name, or an empty/whitespace-only name.
 *
 * @internal
 */
export function validateProfileName(opts: DefineCcdaProfileOptions): void {
  if (opts === null || opts === undefined) {
    throw new CcdaProfileDefinitionError(
      `defineCcdaProfile: options is required and must be an object. Received: ${String(opts)}.`,
    );
  }
  if (typeof opts.name !== "string") {
    throw new CcdaProfileDefinitionError(
      "defineCcdaProfile: 'name' is required and must be a non-empty string. " +
        `Received: ${JSON.stringify((opts as { name?: unknown }).name)}.`,
    );
  }
  if (opts.name.trim().length === 0) {
    throw new CcdaProfileDefinitionError(
      "defineCcdaProfile: 'name' is required and must be a non-empty string. " +
        `Received: ${JSON.stringify(opts.name)}.`,
      opts.name,
    );
  }
}

/**
 * Validate TOP-LEVEL option keys. Throws on any unknown key with a
 * Levenshtein-based hint when the edit distance to a known key is ≤ 2.
 *
 * @internal
 */
export function validateOptionKeys(opts: DefineCcdaProfileOptions): void {
  for (const key of Object.keys(opts)) {
    if (KNOWN_OPTION_KEYS.includes(key)) continue;
    let hint: string | undefined;
    for (const known of KNOWN_OPTION_KEYS) {
      if (levenshtein(key, known) <= 2) {
        hint = known;
        break;
      }
    }
    throw new CcdaProfileDefinitionError(
      `Profile '${opts.name}' has unknown option key '${key}'. ` +
        (hint !== undefined ? `Did you mean '${hint}'? ` : "") +
        `Known keys: ${KNOWN_OPTION_KEYS.join(", ")}.`,
      opts.name,
    );
  }
}

/**
 * Validate a `tolerate` list: every entry's `code` must be a real
 * {@link WarningCode}, must **not** be safety-critical, and must carry a
 * non-empty `rationale` (a tolerated deviation without a stated, grounded reason
 * is exactly the "invented quirk" the anti-invention rule forbids). Runs
 * post-merge so a tolerance inherited from a rogue parent is caught too.
 *
 * @internal
 */
export function validateTolerations(
  tolerate: readonly QuirkTolerance[],
  profileName: string,
): void {
  for (const t of tolerate) {
    if (typeof t.code !== "string" || !ALL_WARNING_CODES.has(t.code)) {
      throw new CcdaProfileDefinitionError(
        `Profile '${profileName}' tolerate entry has unknown warning code ${JSON.stringify(t.code)}. ` +
          `Only codes in WARNING_CODES may be tolerated.`,
        profileName,
      );
    }
    if (isSafetyCriticalCode(t.code)) {
      throw new CcdaProfileDefinitionError(
        `Profile '${profileName}' may not tolerate '${t.code}' — it is a safety-critical warning ` +
          `code (patient identity / allergy / dose / unit / value integrity). A profile quiets ` +
          `benign structural noise, never a deviation that could change a clinical reading.`,
        profileName,
      );
    }
    if (typeof t.rationale !== "string" || t.rationale.trim().length === 0) {
      throw new CcdaProfileDefinitionError(
        `Profile '${profileName}' tolerate entry for '${t.code}' needs a non-empty 'rationale' ` +
          `documenting the real, grounded deviation it expects.`,
        profileName,
      );
    }
  }
}
