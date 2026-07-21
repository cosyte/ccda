/**
 * Code-system OID recognition for the C-CDA clinical entry layer. C-CDA binds
 * each coded slot to a small set of expected terminologies — a Problem value to
 * SNOMED CT or ICD-10-CM, a medication to RxNorm, an allergen to RxNorm/UNII,
 * a route to the NCI Thesaurus. This module is **structural recognition only**:
 * it checks that a coded value's `@codeSystem` OID is one expected for its slot
 * and flags deprecated systems (ICD-9). It deliberately does **not** validate
 * that a code is a real member of its system — that needs a licensed
 * terminology (SNOMED CT / RxNorm via UMLS), which the suite never bundles. See
 * the package README "Code systems & provenance" for the bring-your-own path.
 *
 * Every OID below is a public, non-redistributable-data identifier (the number
 * that names a code system), not the code-system content itself.
 */

import type { CD } from "./types/cd.js";
import type { ParseCtx } from "./types/_shared.js";
import type { TerminologyCoding } from "./terminology.js";
import {
  deprecatedCodeSystem,
  deprecatedLoinc,
  semanticCodeInvalid,
  unexpectedCodeSystem,
} from "../parser/warnings.js";
import type { CcdaPosition } from "../parser/types.js";

/** SNOMED CT — clinical findings, problems, allergen substances. */
export const SNOMED_CT = "2.16.840.1.113883.6.96";
/** RxNorm — clinical drugs and ingredients. */
export const RXNORM = "2.16.840.1.113883.6.88";
/** ICD-10-CM — US diagnosis coding. */
export const ICD10_CM = "2.16.840.1.113883.6.90";
/** ICD-10-PCS — US inpatient procedure coding. */
export const ICD10_PCS = "2.16.840.1.113883.6.4";
/** ICD-9-CM diagnosis — **deprecated** in US contexts (replaced by ICD-10-CM). */
export const ICD9_CM_DX = "2.16.840.1.113883.6.103";
/** ICD-9-CM procedure — **deprecated** (replaced by ICD-10-PCS). */
export const ICD9_CM_PROC = "2.16.840.1.113883.6.104";
/** LOINC — observations, lab tests, section/document codes. */
export const LOINC = "2.16.840.1.113883.6.1";
/** NDC — National Drug Code (packaged products). */
export const NDC = "2.16.840.1.113883.6.69";
/** UNII — FDA Unique Ingredient Identifier (substances/allergens). */
export const UNII = "2.16.840.1.113883.4.9";
/** NCI Thesaurus — the C-CDA `routeCode` value set source. */
export const NCI_ROUTE = "2.16.840.1.113883.3.26.1.1";
/** CVX — CDC vaccine administered code system (immunizations). */
export const CVX = "2.16.840.1.113883.12.292";
/** HL7 ObservationInterpretation — the `interpretationCode` value set source. */
export const INTERPRETATION = "2.16.840.1.113883.5.83";

/**
 * The coded slots whose terminology binding the parser checks. Each names a
 * safety-relevant place a `CD` appears in the reconciliation triad.
 *
 * @example
 * ```ts
 * import type { CodeSlot } from "@cosyte/ccda";
 * const slot: CodeSlot = "problem";
 * ```
 */
export type CodeSlot = "problem" | "medication" | "allergen" | "route" | "vaccine";

interface SlotBinding {
  readonly expected: readonly string[];
  readonly deprecated: readonly string[];
}

/** Expected + deprecated code systems per slot. @internal */
const SLOT_BINDINGS: Readonly<Record<CodeSlot, SlotBinding>> = {
  problem: { expected: [SNOMED_CT, ICD10_CM], deprecated: [ICD9_CM_DX] },
  medication: { expected: [RXNORM, NDC], deprecated: [] },
  allergen: { expected: [RXNORM, UNII, NDC, SNOMED_CT], deprecated: [] },
  route: { expected: [NCI_ROUTE], deprecated: [] },
  vaccine: { expected: [CVX], deprecated: [] },
};

/**
 * Validate a coded value's `@codeSystem` against the terminologies expected for
 * its {@link CodeSlot}. Emits `DEPRECATED_CODE_SYSTEM` for a known-deprecated
 * system (ICD-9) and `UNEXPECTED_CODE_SYSTEM` for any other unexpected OID. A
 * value with no `@codeSystem` (or a `nullFlavor`-only `CD`) is left unchecked —
 * there is nothing to judge, and the value is always preserved verbatim.
 *
 * @example
 * ```ts
 * import { checkCodeSlot } from "@cosyte/ccda";
 * checkCodeSlot(problemValue, "problem", { path: "value" }, ctx);
 * ```
 */
export function checkCodeSlot(
  code: CD | undefined,
  slot: CodeSlot,
  position: { readonly path?: string; readonly line?: number; readonly column?: number },
  ctx: ParseCtx,
): void {
  // A guard on `code?.codeSystem` narrows `code` to a defined `CD` with a defined
  // `codeSystem` for the rest of the function.
  if (code?.codeSystem === undefined) return;
  const oid = code.codeSystem;
  const binding = SLOT_BINDINGS[slot];
  if (binding.deprecated.includes(oid)) {
    ctx.emit(deprecatedCodeSystem(position, oid, slot));
  } else if (!binding.expected.includes(oid)) {
    ctx.emit(unexpectedCodeSystem(position, oid, slot));
  }
  // Semantic tier (opt-in): when a consumer supplied a bring-your-own terminology
  // adapter, ask it whether the code is a real member of its system — the check
  // structural recognition cannot make without a licensed terminology. The code
  // is never coerced: a negative verdict is surfaced verbatim + flagged. Runs
  // regardless of the structural verdict above (system-expectation and
  // code-membership are orthogonal axes).
  validateCodeSemantically(code, oid, slot, position, ctx);
}

/**
 * When `ctx` carries a {@link TerminologyAdapter}, semantically validate a coded
 * value against it and emit `SEMANTIC_CODE_INVALID` on a negative verdict — the
 * code preserved verbatim, never coerced. A no-adapter parse, an adapter that
 * declines (`undefined`), or a `code` with no concrete symbol is a silent no-op.
 *
 * A validation adapter is trusted consumer code: an exception it raises is **not**
 * swallowed here — a failing terminology service should surface to its owner, not
 * be masked into a document that merely *looks* validated (the confident-wrong
 * failure mode this library exists to prevent).
 * @internal
 */
function validateCodeSemantically(
  code: CD,
  system: string,
  slot: CodeSlot,
  position: CcdaPosition,
  ctx: ParseCtx,
): void {
  const adapter = ctx.terminology;
  if (adapter === undefined) return;
  const symbol = code.code;
  // Nothing to validate without a concrete code symbol (a nullFlavor-only CD
  // carries a system but no membership claim).
  if (symbol === undefined) return;

  const coding: TerminologyCoding = {
    system,
    code: symbol,
    ...(code.displayName !== undefined ? { display: code.displayName } : {}),
  };
  const verdict = adapter.validateCode(coding);
  // `undefined` = the adapter has no opinion (system out of its scope) → stay
  // silent. Only an explicit `result: false` is a flagged negative.
  if (verdict !== undefined && !verdict.result) {
    ctx.emit(semanticCodeInvalid(position, slot, system));
  }
}

/**
 * Heuristic: does an RxNorm `displayName` look like a product/branded concept
 * (carries a dose form or strength) rather than a bare ingredient? Used only to
 * flag `ALLERGEN_GRANULARITY_SUSPECT` — a best-effort signal, never a hard
 * rule. Returns `false` when there is no display text to inspect.
 *
 * @example
 * ```ts
 * import { looksProductLevel } from "@cosyte/ccda";
 * looksProductLevel("amoxicillin 500 MG Oral Tablet"); // true
 * looksProductLevel("amoxicillin");                     // false
 * ```
 */
export function looksProductLevel(displayName: string | undefined): boolean {
  if (displayName === undefined) return false;
  // A strength ("500 MG", "5 %") or a dose form keyword marks a product-level
  // concept; a bare ingredient carries neither.
  if (/\d\s*(?:mg|mcg|ml|g|unit|%)\b/iu.test(displayName)) return true;
  return /\b(?:tablet|capsule|solution|injection|cream|ointment|patch|spray|suspension|syrup|inhaler|oral|topical)\b/iu.test(
    displayName,
  );
}

/**
 * Known-deprecated LOINC observation codes mapped (in the warning) to "prefer a
 * successor". A small curated set, not the full LOINC release — LOINC's
 * deprecation status is licensed *data* the suite does not bundle. The classic
 * clinical example is BMI `41909-3` (deprecated → `39156-5`). @internal
 */
const DEPRECATED_LOINC: ReadonlySet<string> = new Set([
  "41909-3", // Body mass index — deprecated, use 39156-5
  "8478-0", // Mean blood pressure — deprecated
  "8357-6", // Blood pressure method — deprecated
]);

/**
 * Flag a result/vital observation `code` that is a known-deprecated LOINC. Emits
 * `DEPRECATED_LOINC` (code preserved) only when the value is in the LOINC code
 * system and a recognized-deprecated code; otherwise silent. A value with no
 * `code` or a non-LOINC system is left unchecked.
 *
 * @example
 * ```ts
 * import { checkLoincDeprecation } from "@cosyte/ccda";
 * checkLoincDeprecation(observationCode, { path: "code" }, ctx);
 * ```
 */
export function checkLoincDeprecation(
  code: CD | undefined,
  position: CcdaPosition,
  ctx: ParseCtx,
): void {
  if (code?.code === undefined) return;
  if (code.codeSystem !== undefined && code.codeSystem !== LOINC) return;
  if (DEPRECATED_LOINC.has(code.code)) {
    ctx.emit(deprecatedLoinc(position, code.code));
  }
}
