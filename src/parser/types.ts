/**
 * Shared type definitions consumed across the `@cosyte/ccda` parser pipeline.
 * These types are contracts between parser stages (secure-xml, namespaces,
 * templates) and the `CcdaDocument` model shell.
 *
 * Every type here is deliberately readonly, the parser produces immutable
 * data structures and consumers must not mutate them. Narrowing is done via
 * the `CcdaWarning.code` and `CcdaParseError.code` discriminants defined in
 * sibling files (`./warnings.ts`, `./errors.ts`).
 */

// Forward reference to the warning shape owned by `./warnings.ts`. Declared
// with `import type` so it contributes zero runtime cost and `./warnings.ts`
// remains the single source of truth for `CcdaWarning`.
import type { CcdaWarning } from "./warnings.js";
import type { CcdaProfile } from "../profiles/types.js";
import type { TerminologyAdapter } from "../model/terminology.js";

/**
 * Structural locator attached to every warning and fatal error. Every field is
 * optional. Together with `code` it is the whole contract for locating a
 * deviation: no diagnostic message names anything the document said.
 *
 * **The three string fields the parser populates are bounded, not copied.**
 * `path` is an element local name, which a sender can make anything, so it is
 * echoed only when it is a member of the CDA vocabulary this parser navigates
 * and is `<withheld>` otherwise. `sectionCode` is echoed only when it has the
 * shape of a LOINC part number, which matters because `UNKNOWN_SECTION_CODE`
 * fires exactly when the code is unrecognized. `templateId` is echoed only when
 * it has the shape of an HL7 v3 UID, for the same reason: it is a
 * consumer-controlled `II.root`. See `./tokens.ts` for all three, and for why a
 * shape or membership test is used rather than a length cap. `line` and
 * `column` are the XML locator and are never derived from content.
 *
 * **Which codes carry which field is narrow, and worth reading before you key a
 * profile on one.** `sectionCode` is carried by `UNKNOWN_SECTION_CODE`,
 * `SECTION_MATCHED_BY_LOINC_FALLBACK` and `SUBJECT_CONTEXT_OVERRIDE`, which
 * names the enclosing section's own `<code>` on its entry-level instances as
 * well as its section-level one, because a withheld entry is located by which
 * section it sat in. It is the bounded token or `<withheld>` like any other, and
 * a section that carries no `<code>` at all contributes none, so a warning about
 * an entry in an unrecognized section may carry no `sectionCode`.
 * `templateId` is carried by the first two (the section's first rooted
 * `<templateId>`) and by `TEMPLATE_EXTENSION_ABSENT` (the matched document-type
 * root). No other code carries either, so a `QuirkMatch` keyed on one narrows
 * those codes and matches nothing on the rest: an entry-level warning such as
 * `DEPRECATED_LOINC` carries neither field today.
 *
 * Two document-level codes carry no `templateId` **on purpose**, and it is a
 * decision rather than an omission. `MISSING_TEMPLATE_ID` has no template to
 * name. `UNKNOWN_DOCUMENT_TEMPLATE` has too many: its subject is the templateId
 * set naming no type, and the obvious pick, the first root in document order, is
 * the US Realm Header stamp carried by essentially every real C-CDA, so keying a
 * tolerance on it would read like narrowing while tolerating the code
 * everywhere.
 *
 * The claim that stood here through `0.0.4`, that the fields were PHI-free "by
 * construction" because a `path` carries element names and a `sectionCode` is a
 * LOINC code, was an assumption about the sender rather than a property of the
 * parser. For a top-level fatal like
 * `INPUT_SIZE_LIMIT_EXCEEDED` no field need be populated.
 *
 * @remarks
 * With `exactOptionalPropertyTypes: true`, do not pass `line: undefined`
 * explicitly, omit the key instead.
 *
 * @example
 * ```ts
 * import type { CcdaPosition } from "@cosyte/ccda";
 * const pos: CcdaPosition = {
 *   path: "/ClinicalDocument/component/structuredBody/component[3]/section",
 *   sectionCode: "11450-4",
 *   templateId: "2.16.840.1.113883.10.20.22.2.5.1",
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
 * consumers observe warnings in the same order the parser emitted them.
 *
 * That is emission order, and for one code it is deliberately not discovery
 * order: `UNKNOWN_NAMESPACE_PREFIX` is found during the pre-parse DOM walk and
 * replayed **last**, after the model is built. It is a statement about the whole
 * document, and emitting it where it is found would let it take the place of the
 * `NOT_A_CLINICAL_DOCUMENT` fatal, or of the first safety-critical per-element
 * warning, under `{ strict: true }`, where the first warning is the one that
 * throws. Nothing else is reordered.
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
 * nesting). All four have library defaults; callers may tighten, or, at
 * their own risk, loosen, any of them via `ParseCcdaOptions.limits`.
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
 * `{ strict: undefined }`, either omit the key or pass a boolean.
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
  /** Inline callback fired for each Tier-2 warning, in emission order (see {@link OnWarningCallback}). */
  readonly onWarning?: OnWarningCallback;
  /** Override one or more of the default safety caps applied before DOM construction. */
  readonly limits?: CcdaParseLimits;
  /**
   * The vendor/conformance {@link CcdaProfile} to apply. A profile downgrades the
   * **non-safety-critical** deviations it expects to `PROFILE_QUIRK_APPLIED`
   * (flagged `expected`), it never changes an extracted value and can never
   * tolerate a safety-critical warning. Omit to consult the process-scoped
   * default ({@link setDefaultCcdaProfile}); pass `null` to opt out of that
   * default for this call.
   */
  readonly profile?: CcdaProfile | null;
  /**
   * An optional consumer-supplied bring-your-own {@link TerminologyAdapter}. When
   * present, the parser semantically validates each recognized coded value (a
   * problem, medication, allergen, route, or vaccine code) against it and emits
   * `SEMANTIC_CODE_INVALID` on a negative verdict, the code preserved verbatim,
   * never coerced. Omit it for the default recognize-only behavior. `@cosyte/ccda`
   * never imports a terminology library; you supply the adapter.
   */
  readonly terminology?: TerminologyAdapter;
}
