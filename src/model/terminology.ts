/**
 * The **bring-your-own (BYO) terminology adapter** contract for `@cosyte/ccda`.
 *
 * C-CDA binds its coded slots to licensed terminologies, SNOMED CT and RxNorm
 * (UMLS-gated), CPT (AMA-licensed), whose *content* this suite never bundles.
 * Structural recognition
 * ({@link ../model/code-systems.checkCodeSlot}) can confirm a value's
 * `@codeSystem` OID and code *shape*, but it cannot confirm a code is a real,
 * active member of its system. That last tier is **semantic validation**, and it
 * requires a licensed terminology service the consumer, not the parser, holds.
 *
 * This module defines the small, dependency-free interface a consumer implements
 * to plug that service in. `@cosyte/ccda` **never imports a terminology library**
 * (it stays a zero-dep sibling of the other `@cosyte/*` parsers): the consumer
 * supplies the adapter, and `parseCcda` / `buildCcda` call it **only when it is
 * supplied**, falling back to the current recognize-only behavior when it is
 * absent. The shape mirrors the FHIR Terminology Module operations
 * (`$validate-code`, `$translate`) and the sibling `@cosyte/terminology` engine,
 * so a consumer can wire that engine (or a UMLS / VSAC service) in behind this
 * interface, but the wiring, and the license, live entirely on the consumer's
 * side.
 *
 * **Fail-safe (never fabricate, never coerce).** The adapter can only ever
 * *report*, it is never handed the power to change a code. A negative
 * {@link CodeValidationResult} (`result: false`) makes the parser **surface the
 * code verbatim and flag it** with `SEMANTIC_CODE_INVALID`; it is never rewritten
 * to a "corrected" code. This preserves the same discipline the parser already
 * follows for a code↔narrative disagreement: surface both, pick no winner.
 *
 * @packageDocumentation
 */

/**
 * A single coded value handed to a {@link TerminologyAdapter}. Mirrors FHIR R4
 * `Coding` (and `@cosyte/terminology`'s `Coding`), **except** `system` is the
 * C-CDA `@codeSystem` **OID** exactly as it appears in the document (e.g.
 * `2.16.840.1.113883.6.96` for SNOMED CT), not a canonical URI, the parser hands
 * the adapter what the wire actually carries and never invents a URI. A consumer
 * bridging to a URI-based engine (such as `@cosyte/terminology`'s `resolveSystem`)
 * performs that OID→URI mapping inside their adapter.
 *
 * @example
 * ```ts
 * import type { TerminologyCoding } from "@cosyte/ccda";
 * const snomed: TerminologyCoding = {
 *   system: "2.16.840.1.113883.6.96",
 *   code: "38341003",
 *   display: "Hypertension",
 * };
 * ```
 */
export interface TerminologyCoding {
  /** The code system's OID, as carried by the C-CDA `@codeSystem` (never a URI). May be absent. */
  readonly system?: string;
  /** The symbol within the code system (the C-CDA `@code`). Required, a coding without one is meaningless. */
  readonly code: string;
  /** The human-readable label (the C-CDA `@displayName`), when present. Carried verbatim. */
  readonly display?: string;
  /** The code-system version the code is drawn from, when known. */
  readonly version?: string;
}

/**
 * The outcome of {@link TerminologyAdapter.validateCode}, modeled on the FHIR
 * `$validate-code` operation's out-parameters. `result` is the verdict: `true`
 * when the adapter confirms the code is a valid, active member of its system;
 * `false` when it confirms the code is **not** (unknown / retired / not a
 * member). `display` and `message` are advisory only, the parser **never**
 * applies `display` back onto the document (that would be a silent coercion);
 * both are surfaced to the consumer, never woven into a PHI-free warning message.
 *
 * @example
 * ```ts
 * import type { CodeValidationResult } from "@cosyte/ccda";
 * const invalid: CodeValidationResult = { result: false, message: "not in SNOMED CT US Edition" };
 * ```
 */
export interface CodeValidationResult {
  /** `true` when the code is a valid member of its system; `false` when it is not. */
  readonly result: boolean;
  /** The authoritative display the adapter knows for the code, when it has one. Advisory, never applied. */
  readonly display?: string;
  /** A human-readable reason (e.g. why a code is invalid). Advisory, never placed in a warning. */
  readonly message?: string;
}

/**
 * The outcome of {@link TerminologyAdapter.translate}, modeled on the FHIR
 * `$translate` operation and `@cosyte/terminology`'s `translate`. `matches` are
 * the declared target codings, drawn **verbatim** from the consumer's map; an
 * empty array means the source did not map. Per the never-fabricate invariant an
 * adapter must return an empty `matches` for an unmapped source, **never a
 * guessed target**.
 *
 * **Consumed on build.** `@cosyte/ccda` defines this so a consumer can wire a
 * ConceptMap-backed engine in behind {@link TerminologyAdapter.translate}.
 * `buildCcda` consults it at each clinical coded slot (problem value, allergen,
 * medication drug + route, vaccine + route) and emits any returned coding as a
 * spec-clean CDA R2 `<translation>` alternate **beside** the primary code, never
 * replacing it, and never fabricated (an empty `matches` emits nothing). The
 * alternates round-trip through `parseCcda` into `CD.translation`. `translate`
 * stays optional on the interface: a validation-only adapter need not implement it,
 * and its absence yields byte-identical output.
 *
 * @example
 * ```ts
 * import type { CodeTranslationResult } from "@cosyte/ccda";
 * const mapped: CodeTranslationResult = {
 *   matches: [{ system: "2.16.840.1.113883.6.90", code: "I10", display: "Essential hypertension" }],
 * };
 * ```
 */
export interface CodeTranslationResult {
  /** The declared target codings, verbatim from the map. Empty ⇒ unmapped (never a fabricated target). */
  readonly matches: readonly TerminologyCoding[];
}

/**
 * The bring-your-own terminology contract a consumer supplies to `parseCcda`
 * (via {@link ParseCcdaOptions.terminology}) or `buildCcda` (via
 * {@link BuildCcdaOptions.terminology}). `@cosyte/ccda` never implements or
 * imports one, it only *calls* the one you supply, and only where a coded value
 * carries both a `code` and a `system`.
 *
 * **`validateCode` is the one method the parser consumes.** For each recognized
 * coded slot (problem, medication, allergen, route, vaccine), the parser calls
 * `validateCode` and, on a `result: false`, emits `SEMANTIC_CODE_INVALID` with
 * the code **preserved verbatim**, it never rewrites the value. Returning
 * `undefined` means the adapter has no opinion (e.g. the system is outside its
 * coverage); the parser then stays silent and falls back to recognize-only, so an
 * adapter that only covers some systems adds no noise for the rest.
 *
 * **`translate` is consumed on build and optional.** `buildCcda` calls it at each
 * clinical coded slot and emits any returned coding as a `<translation>` alternate
 * beside the primary code (never a substitution), see {@link CodeTranslationResult}.
 *
 * @example
 * ```ts
 * import { parseCcda, type TerminologyAdapter } from "@cosyte/ccda";
 *
 * // A tiny BYO adapter, ccda imports no terminology library; you supply one.
 * const adapter: TerminologyAdapter = {
 *   validateCode: (coding) =>
 *     coding.system === "2.16.840.1.113883.6.96"
 *       ? { result: mySnomedService.has(coding.code) }
 *       : undefined, // no opinion on other systems
 * };
 *
 * const doc = parseCcda(xml, { terminology: adapter });
 * // A structurally-valid but non-member SNOMED code now carries SEMANTIC_CODE_INVALID.
 * ```
 */
export interface TerminologyAdapter {
  /**
   * Validate that `coding` is a real member of its code system. Return
   * `{ result: true }` when it is, `{ result: false }` when it is not, or
   * `undefined` when the adapter cannot judge (the system is out of its scope),
   * `undefined` produces no warning and no change.
   */
  readonly validateCode: (coding: TerminologyCoding) => CodeValidationResult | undefined;
  /**
   * Translate `coding` through the consumer's map, returning declared targets
   * verbatim (empty ⇒ unmapped, never fabricated). `buildCcda` emits each returned
   * coding as a `<translation>` alternate beside the primary code, never a
   * substitution. Optional, a validation-only adapter may omit it, and its absence
   * yields byte-identical output.
   */
  readonly translate?: (coding: TerminologyCoding) => CodeTranslationResult | undefined;
}

/**
 * One membership question put to a {@link ValueSetSource}: is this coded value a
 * member of this value set?
 *
 * `valueSet` is the OID of the value set the slot's C-CDA binding names, taken
 * from this package's own frozen binding table and never from the document.
 * `coding` is the document's value exactly as the wire carried it, the same
 * shape {@link TerminologyAdapter.validateCode} receives.
 *
 * @example
 * ```ts
 * import type { ValueSetMembershipQuery } from "@cosyte/ccda";
 * const query: ValueSetMembershipQuery = {
 *   valueSet: "2.16.840.1.113762.1.4.1010.4",
 *   coding: { system: "2.16.840.1.113883.6.88", code: "314076" },
 * };
 * ```
 */
export interface ValueSetMembershipQuery {
  /** The bound value set's OID, from this package's declared binding table. */
  readonly valueSet: string;
  /** The coded value to test, carried verbatim from the document. */
  readonly coding: TerminologyCoding;
}

/**
 * What a {@link ValueSetSource} can say about one membership question. Three
 * states, and the third is the reason this is not a boolean.
 *
 * - `member`: the code is in the expansion the source holds. Silent.
 * - `not-a-member`: it is not. Against a Required binding this is a SHALL
 *   violation and raises `VALUE_SET_BINDING_VIOLATED`.
 * - `no-expansion`: the source holds no expansion for that value set, so it did
 *   not evaluate the binding at all. This raises
 *   `VALUE_SET_BINDING_NOT_EVALUATED` rather than nothing, because a package
 *   that quietly skips a value set it does not hold reads exactly like one that
 *   checked and found the code fine.
 *
 * Returning `undefined` instead of an answer is the fourth state and the only
 * silent one: the source declares it has no opinion here, the same "out of my
 * scope" answer {@link TerminologyAdapter.validateCode} gives. Use it when the
 * source is not the authority for a value set; use `no-expansion` when it is the
 * authority and the package it answers from does not carry the expansion.
 *
 * @example
 * ```ts
 * import type { ValueSetMembershipAnswer } from "@cosyte/ccda";
 * const answer: ValueSetMembershipAnswer = { membership: "not-a-member" };
 * ```
 */
export interface ValueSetMembershipAnswer {
  /** The verdict, or the declaration that no expansion was available to give one. */
  readonly membership: "member" | "not-a-member" | "no-expansion";
}

/**
 * The bring-your-own **value-set** contract, the sibling of
 * {@link TerminologyAdapter} for the question an adapter cannot answer: is this
 * code inside the VALUE SET the C-CDA template binds this slot to?
 *
 * C-CDA binds each checked slot to a value set, and a Required binding makes
 * membership a SHALL. The member codes of those value sets are licensed data
 * (SNOMED CT, RxNorm and CVX expansions published through VSAC), so
 * `@cosyte/ccda` carries the value set OIDs and never their contents: you hold
 * the package, you answer the question, and the parser reports what you say.
 *
 * **`release` is not optional, and it is what makes the finding honest.** C-CDA's
 * own guidance states that for a Required binding any valid expansion of a value
 * set is conformant, so "not a member" is only ever a statement about the
 * expansion that answered. A finding therefore carries the release you declare
 * here beside the value set OID, and asserts non-conformance no wider than that.
 * The string is your own package label; this library never reads it from a
 * document and never puts it in a message.
 *
 * **Fail-safe, exactly like the terminology adapter.** The source can only
 * report: no value is rewritten, refused, reordered or dropped on a negative
 * verdict, and an exception `isMember` raises is not swallowed.
 *
 * @example
 * ```ts
 * import { parseCcda, type ValueSetSource } from "@cosyte/ccda";
 *
 * // Your own package, in process. `@cosyte/ccda` ships no expansion.
 * const expansions = new Map([["2.16.840.1.113762.1.4.1010.4", new Set(["314076"])]]);
 * const valueSets: ValueSetSource = {
 *   release: "my-vsac-package-2026.1",
 *   isMember: ({ valueSet, coding }) => {
 *     const expansion = expansions.get(valueSet);
 *     if (expansion === undefined) return { membership: "no-expansion" };
 *     return { membership: expansion.has(coding.code) ? "member" : "not-a-member" };
 *   },
 * };
 *
 * const doc = parseCcda(xml, { valueSets });
 * ```
 */
export interface ValueSetSource {
  /**
   * The release of the value-set package these answers come from, in your own
   * terms (a VSAC package version, a build tag, a date). It rides on every
   * finding this source produces, so a reader can tell which expansion said so.
   */
  readonly release: string;
  /**
   * Answer one membership question, or return `undefined` to declare no opinion.
   * Return `{ membership: "no-expansion" }` when the package holds no expansion
   * for the value set: that is reported as "not evaluated", never as a pass.
   */
  readonly isMember: (query: ValueSetMembershipQuery) => ValueSetMembershipAnswer | undefined;
}
