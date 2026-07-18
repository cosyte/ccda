/**
 * Shared type definitions consumed across the `@cosyte/ccda` parser pipeline.
 * These types are contracts between parser stages (secure-xml, namespaces,
 * templates) and the `CcdaDocument` model shell.
 *
 * Every type here is deliberately readonly — the parser produces immutable
 * data structures and consumers must not mutate them. Narrowing is done via
 * the `CcdaWarning.code` and `CcdaParseError.code` discriminants defined in
 * sibling files (`./warnings.ts`, `./errors.ts`).
 */

// Forward reference to the warning shape owned by `./warnings.ts`. Declared
// with `import type` so it contributes zero runtime cost and `./warnings.ts`
// remains the single source of truth for `CcdaWarning`.
import type { CcdaWarning } from "./warnings.js";
import type { CcdaProfile } from "../profiles/types.js";

/**
 * Structural locator attached to every warning and fatal error. Every field
 * is optional and **PHI-free by construction** — a `path` carries element
 * names and positional indices (never attribute values or narrative text),
 * and `templateId` / `sectionCode` are OIDs / LOINC codes, not patient data.
 * For a top-level fatal like `INPUT_SIZE_LIMIT_EXCEEDED` no field need be
 * populated; for a section warning deep in the body the `path`, `templateId`,
 * and `sectionCode` may all be set.
 *
 * @remarks
 * With `exactOptionalPropertyTypes: true`, do not pass `line: undefined`
 * explicitly — omit the key instead.
 *
 * @example
 * ```ts
 * import type { CcdaPosition } from "@cosyte/ccda";
 * const pos: CcdaPosition = {
 *   path: "/ClinicalDocument/component/structuredBody/component[3]/section",
 *   sectionCode: "11450-4",
 * };
 * ```
 */
export interface CcdaPosition {
  readonly path?: string;
  readonly line?: number;
  readonly column?: number;
  readonly templateId?: string;
  readonly sectionCode?: string;
}

/**
 * Callback invoked inline each time the parser emits a Tier-2 warning.
 * Always fires BEFORE the warning is appended to `CcdaDocument.warnings` so
 * consumers observe warnings in the same order the parser discovered them.
 *
 * @example
 * ```ts
 * import { parseCcda, type OnWarningCallback } from "@cosyte/ccda";
 * const onWarning: OnWarningCallback = (w) => {
 *   console.warn(w.code, w.message);
 * };
 * parseCcda(raw, { onWarning });
 * ```
 */
export type OnWarningCallback = (warning: CcdaWarning) => void;

/**
 * Hard safety limits applied to every parse before the XML is handed to the
 * DOM. Each cap defends a specific denial-of-service vector for hostile XML
 * (oversized payloads, billion-laughs entity expansion, pathological element
 * nesting). All four have library defaults; callers may tighten — or, at
 * their own risk, loosen — any of them via `ParseCcdaOptions.limits`.
 *
 * @example
 * ```ts
 * import type { CcdaParseLimits } from "@cosyte/ccda";
 * const tight: CcdaParseLimits = { maxInputBytes: 1_000_000, maxDepth: 100 };
 * ```
 */
export interface CcdaParseLimits {
  /** Maximum decoded input size in bytes. Exceeding it throws `INPUT_SIZE_LIMIT_EXCEEDED`. */
  readonly maxInputBytes?: number;
  /** Maximum element nesting depth. Exceeding it throws `ELEMENT_DEPTH_LIMIT_EXCEEDED`. */
  readonly maxDepth?: number;
  /** Maximum total element-node count. Exceeding it throws `NODE_COUNT_LIMIT_EXCEEDED`. */
  readonly maxNodeCount?: number;
  /** Maximum count of `&...;` entity references permitted in the raw input. */
  readonly maxEntityExpansions?: number;
}

/**
 * Options accepted by `parseCcda` to tune lenient/strict behaviour and the
 * security limits. Every field is optional; `parseCcda(raw, {})` is valid and
 * produces the library defaults (lenient parse, default safety caps).
 *
 * @remarks
 * With `exactOptionalPropertyTypes: true`, callers cannot pass
 * `{ strict: undefined }` — either omit the key or pass a boolean.
 *
 * @example
 * ```ts
 * import { parseCcda, type ParseCcdaOptions } from "@cosyte/ccda";
 * const opts: ParseCcdaOptions = {
 *   strict: false,
 *   onWarning: (w) => console.warn(w.code),
 * };
 * parseCcda(raw, opts);
 * ```
 */
export interface ParseCcdaOptions {
  /** When `true`, escalate every Tier-2 deviation to a thrown error instead of a warning. */
  readonly strict?: boolean;
  /** Inline callback fired for each Tier-2 warning, in discovery order. */
  readonly onWarning?: OnWarningCallback;
  /** Override one or more of the default safety caps applied before DOM construction. */
  readonly limits?: CcdaParseLimits;
  /**
   * The vendor/conformance {@link CcdaProfile} to apply. A profile downgrades the
   * **non-safety-critical** deviations it expects to `PROFILE_QUIRK_APPLIED`
   * (flagged `expected`) — it never changes an extracted value and can never
   * tolerate a safety-critical warning. Omit to consult the process-scoped
   * default ({@link setDefaultCcdaProfile}); pass `null` to opt out of that
   * default for this call.
   */
  readonly profile?: CcdaProfile | null;
}
