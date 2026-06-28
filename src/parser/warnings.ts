/**
 * Tier-2 warning registry and factories for the `@cosyte/ccda` parser
 * pipeline. Consumers compare `warning.code === WARNING_CODES.<CODE>` to
 * narrow and react; the parser uses the factories here to construct every
 * warning it emits so that messages, payload shape, and positional context
 * stay consistent across stages.
 *
 * Every message string is **PHI-free by construction** — factories interpolate
 * only structural values (OIDs, LOINC codes, element names, namespace
 * prefixes), never attribute values or narrative text from the document.
 */

import type { CcdaPosition } from "./types.js";

/**
 * Stable string codes for every Tier-2 warning the parser may emit. The
 * registry is frozen via `as const` so TypeScript infers the exact string
 * literal union for `WarningCode` — there is zero runtime cost and no
 * magic-string comparisons for consumers. Each code is its own value
 * (`key === value`) so the set survives `Object.values(...)` into a snapshot
 * tripwire. Renaming a code is a **breaking change**.
 *
 * @example
 * ```ts
 * import { parseCcda, WARNING_CODES } from "@cosyte/ccda";
 * const doc = parseCcda(raw);
 * if (doc.warnings.some((w) => w.code === WARNING_CODES.UNKNOWN_DOCUMENT_TEMPLATE)) {
 *   // handle an unrecognized document type
 * }
 * ```
 */
export const WARNING_CODES = {
  UNKNOWN_DOCUMENT_TEMPLATE: "UNKNOWN_DOCUMENT_TEMPLATE",
  MISSING_TEMPLATE_ID: "MISSING_TEMPLATE_ID",
  TEMPLATE_EXTENSION_ABSENT: "TEMPLATE_EXTENSION_ABSENT",
  UNKNOWN_SECTION_CODE: "UNKNOWN_SECTION_CODE",
  SECTION_MATCHED_BY_LOINC_FALLBACK: "SECTION_MATCHED_BY_LOINC_FALLBACK",
  INVALID_NULL_FLAVOR: "INVALID_NULL_FLAVOR",
  UNKNOWN_NAMESPACE_PREFIX: "UNKNOWN_NAMESPACE_PREFIX",
  MALFORMED_DATETIME: "MALFORMED_DATETIME",
  MULTIPLE_RECORD_TARGETS: "MULTIPLE_RECORD_TARGETS",
  MISSING_ASSIGNING_AUTHORITY: "MISSING_ASSIGNING_AUTHORITY",
  ENCODING_BOM_STRIPPED: "ENCODING_BOM_STRIPPED",
  NEGATION_VS_NULLFLAVOR_AMBIGUOUS: "NEGATION_VS_NULLFLAVOR_AMBIGUOUS",
  ALLERGEN_GRANULARITY_SUSPECT: "ALLERGEN_GRANULARITY_SUSPECT",
  CODE_NARRATIVE_MISMATCH: "CODE_NARRATIVE_MISMATCH",
  NARRATIVE_REFERENCE_BROKEN: "NARRATIVE_REFERENCE_BROKEN",
  UNEXPECTED_CODE_SYSTEM: "UNEXPECTED_CODE_SYSTEM",
  DEPRECATED_CODE_SYSTEM: "DEPRECATED_CODE_SYSTEM",
  MISSING_DOSE_QUANTITY: "MISSING_DOSE_QUANTITY",
  MISSING_ROUTE_CODE: "MISSING_ROUTE_CODE",
  MULTIPLE_EFFECTIVE_TIMES_UNRESOLVED: "MULTIPLE_EFFECTIVE_TIMES_UNRESOLVED",
  PROBLEM_STATUS_INDETERMINATE: "PROBLEM_STATUS_INDETERMINATE",
  SECTION_PLACEMENT_SUSPECT: "SECTION_PLACEMENT_SUSPECT",
  NON_UCUM_UNIT: "NON_UCUM_UNIT",
  UCUM_CASE_SUSPECT: "UCUM_CASE_SUSPECT",
  MISSING_UNIT_ON_PQ: "MISSING_UNIT_ON_PQ",
  FREE_TEXT_REFERENCE_RANGE: "FREE_TEXT_REFERENCE_RANGE",
  RESULT_VALUE_TYPE_UNHANDLED: "RESULT_VALUE_TYPE_UNHANDLED",
  IMMUNIZATION_REFUSED: "IMMUNIZATION_REFUSED",
  DEPRECATED_LOINC: "DEPRECATED_LOINC",
} as const;

/**
 * Discriminant type for `CcdaWarning.code`. Narrowing a warning by this code
 * lets consumers write exhaustive `switch` blocks (enabled by the
 * `switch-exhaustiveness-check` lint rule) and guarantees a typo-free
 * comparison against the `WARNING_CODES` registry.
 *
 * @example
 * ```ts
 * import type { CcdaWarning, WarningCode } from "@cosyte/ccda";
 * function describe(w: CcdaWarning): string {
 *   const code: WarningCode = w.code;
 *   switch (code) {
 *     case "UNKNOWN_DOCUMENT_TEMPLATE":
 *       return "unrecognized document type";
 *     default:
 *       return `warning: ${code}`;
 *   }
 * }
 * ```
 */
export type WarningCode = (typeof WARNING_CODES)[keyof typeof WARNING_CODES];

/**
 * Data shape for every Tier-2 warning emitted by the parser. Warnings are
 * plain data (distinct from `CcdaParseError`, which is a thrown `Error`
 * subclass) so they can be safely accumulated into `CcdaDocument.warnings`
 * and passed to `onWarning` callbacks.
 *
 * @example
 * ```ts
 * import type { CcdaWarning } from "@cosyte/ccda";
 * const w: CcdaWarning = {
 *   code: "UNKNOWN_SECTION_CODE",
 *   message: "Section LOINC code 99999-9 is not a recognized C-CDA section.",
 *   position: { sectionCode: "99999-9" },
 * };
 * ```
 */
export interface CcdaWarning {
  readonly code: WarningCode;
  readonly message: string;
  readonly position: CcdaPosition;
}

/**
 * Build an `UNKNOWN_DOCUMENT_TEMPLATE` warning. Emitted when the document's
 * root `templateId` set contains no OID matching one of the 12 recognized
 * C-CDA R2.1 document types — the document is still parsed as a generic
 * ClinicalDocument.
 *
 * @example
 * ```ts
 * import { unknownDocumentTemplate } from "@cosyte/ccda";
 * const w = unknownDocumentTemplate({ path: "/ClinicalDocument" }, "1.2.3.4");
 * ```
 */
export function unknownDocumentTemplate(position: CcdaPosition, observedOid: string): CcdaWarning {
  return {
    code: WARNING_CODES.UNKNOWN_DOCUMENT_TEMPLATE,
    message: `Document templateId "${observedOid}" is not a recognized C-CDA R2.1 document type; parsed as a generic ClinicalDocument.`,
    position,
  };
}

/**
 * Build a `MISSING_TEMPLATE_ID` warning. Emitted when an element that should
 * carry a `templateId` (the ClinicalDocument root or a section) has none —
 * recognition falls back to other signals (e.g. a section's LOINC code).
 *
 * @example
 * ```ts
 * import { missingTemplateId } from "@cosyte/ccda";
 * const w = missingTemplateId({ path: "/ClinicalDocument" }, "ClinicalDocument");
 * ```
 */
export function missingTemplateId(position: CcdaPosition, elementName: string): CcdaWarning {
  return {
    code: WARNING_CODES.MISSING_TEMPLATE_ID,
    message: `Element "${elementName}" has no templateId; recognition fell back to other signals.`,
    position,
  };
}

/**
 * Build a `TEMPLATE_EXTENSION_ABSENT` warning. Emitted when a recognized
 * `templateId` root is present but carries no `@extension` (the R2.1 version
 * stamp, e.g. `2015-08-01`) — the template is matched by root alone and may
 * be an earlier release.
 *
 * @example
 * ```ts
 * import { templateExtensionAbsent } from "@cosyte/ccda";
 * const w = templateExtensionAbsent(
 *   { path: "/ClinicalDocument" },
 *   "2.16.840.1.113883.10.20.22.1.2",
 * );
 * ```
 */
export function templateExtensionAbsent(position: CcdaPosition, oid: string): CcdaWarning {
  return {
    code: WARNING_CODES.TEMPLATE_EXTENSION_ABSENT,
    message: `templateId "${oid}" has no @extension version stamp; matched by root alone (may pre-date R2.1).`,
    position,
  };
}

/**
 * Build an `UNKNOWN_SECTION_CODE` warning. Emitted when a section's LOINC
 * `code` is not one of the recognized C-CDA section codes and no recognized
 * `templateId` identified it either — the section is retained as
 * narrative-only.
 *
 * @example
 * ```ts
 * import { unknownSectionCode } from "@cosyte/ccda";
 * const w = unknownSectionCode({ sectionCode: "99999-9" }, "99999-9");
 * ```
 */
export function unknownSectionCode(position: CcdaPosition, loincCode: string): CcdaWarning {
  return {
    code: WARNING_CODES.UNKNOWN_SECTION_CODE,
    message: `Section LOINC code "${loincCode}" is not a recognized C-CDA section; retained as narrative-only.`,
    position,
  };
}

/**
 * Build a `SECTION_MATCHED_BY_LOINC_FALLBACK` warning. Emitted when a section
 * carried no recognized `templateId` but its LOINC `code` matched a known
 * C-CDA section — recognition succeeded via the fallback path.
 *
 * @example
 * ```ts
 * import { sectionMatchedByLoincFallback } from "@cosyte/ccda";
 * const w = sectionMatchedByLoincFallback({ sectionCode: "48765-2" }, "48765-2");
 * ```
 */
export function sectionMatchedByLoincFallback(
  position: CcdaPosition,
  loincCode: string,
): CcdaWarning {
  return {
    code: WARNING_CODES.SECTION_MATCHED_BY_LOINC_FALLBACK,
    message: `Section identified by LOINC code "${loincCode}" fallback (no recognized templateId present).`,
    position,
  };
}

/**
 * Build an `INVALID_NULL_FLAVOR` warning. Emitted when an element's
 * `@nullFlavor` attribute carries a token outside the HL7 v3 NullFlavor code
 * system (`2.16.840.1.113883.5.1008`) — the value is preserved verbatim but
 * flagged as non-conforming.
 *
 * @example
 * ```ts
 * import { invalidNullFlavor } from "@cosyte/ccda";
 * const w = invalidNullFlavor({ path: "/ClinicalDocument/effectiveTime" }, "NOPE");
 * ```
 */
export function invalidNullFlavor(position: CcdaPosition, observed: string): CcdaWarning {
  return {
    code: WARNING_CODES.INVALID_NULL_FLAVOR,
    message: `nullFlavor "${observed}" is not in the HL7 v3 NullFlavor code system; preserved verbatim.`,
    position,
  };
}

/**
 * Build an `UNKNOWN_NAMESPACE_PREFIX` warning. Emitted when an element or
 * attribute uses a namespace prefix the parser does not recognize (anything
 * outside the default `urn:hl7-org:v3`, `xsi`, and `sdtc` set) — the node is
 * still retained.
 *
 * @example
 * ```ts
 * import { unknownNamespacePrefix } from "@cosyte/ccda";
 * const w = unknownNamespacePrefix({ path: "/ClinicalDocument" }, "vendor");
 * ```
 */
export function unknownNamespacePrefix(position: CcdaPosition, prefix: string): CcdaWarning {
  return {
    code: WARNING_CODES.UNKNOWN_NAMESPACE_PREFIX,
    message: `Unknown namespace prefix "${prefix}" — not in the recognized v3/xsi/sdtc set; node retained.`,
    position,
  };
}

/**
 * Build a `MALFORMED_DATETIME` warning. Emitted when an HL7 v3 `TS` value
 * does not match the `YYYYMMDDHHMMSS[.S][±ZZZZ]` shape (or a recognized
 * truncation of it) — the raw string is preserved and the parsed `Date` is
 * left `undefined`.
 *
 * @example
 * ```ts
 * import { malformedDateTime } from "@cosyte/ccda";
 * const w = malformedDateTime({ path: "/ClinicalDocument/effectiveTime" });
 * ```
 */
export function malformedDateTime(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.MALFORMED_DATETIME,
    message: `Value does not match the HL7 v3 TS datetime shape; raw preserved, parsed date left undefined.`,
    position,
  };
}

/**
 * Build a `MULTIPLE_RECORD_TARGETS` warning. Emitted when a ClinicalDocument
 * carries more than one `recordTarget` (more than one patient) — the parser
 * keeps all of them but `getPatient()` resolves the first.
 *
 * @example
 * ```ts
 * import { multipleRecordTargets } from "@cosyte/ccda";
 * const w = multipleRecordTargets({ path: "/ClinicalDocument" }, 2);
 * ```
 */
export function multipleRecordTargets(position: CcdaPosition, count: number): CcdaWarning {
  return {
    code: WARNING_CODES.MULTIPLE_RECORD_TARGETS,
    message: `ClinicalDocument has ${String(count)} recordTarget elements; getPatient() resolves the first.`,
    position,
  };
}

/**
 * Build a `MISSING_ASSIGNING_AUTHORITY` warning. Emitted when a patient
 * identifier `II` has a `@root` but no `@assigningAuthorityName` — the
 * identifier is still usable but lacks a human-readable authority label.
 *
 * @example
 * ```ts
 * import { missingAssigningAuthority } from "@cosyte/ccda";
 * const w = missingAssigningAuthority({ path: "/ClinicalDocument/recordTarget" });
 * ```
 */
export function missingAssigningAuthority(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.MISSING_ASSIGNING_AUTHORITY,
    message: `Patient identifier has a root OID but no assigningAuthorityName.`,
    position,
  };
}

/**
 * Build an `ENCODING_BOM_STRIPPED` warning. Emitted once per parse when a
 * UTF-8 byte-order mark was detected and removed from the head of the input
 * before XML parsing.
 *
 * @example
 * ```ts
 * import { encodingBomStripped } from "@cosyte/ccda";
 * const w = encodingBomStripped({});
 * ```
 */
export function encodingBomStripped(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.ENCODING_BOM_STRIPPED,
    message: `A UTF-8 byte-order mark was stripped from the head of the input.`,
    position,
  };
}

/**
 * Build a `NEGATION_VS_NULLFLAVOR_AMBIGUOUS` warning. Emitted when a clinical
 * act carries **both** `@negationInd="true"` and a `@nullFlavor` — two distinct
 * "this did not / is not known" signals at once. The parser never collapses
 * them: both are preserved on the model and this flags the ambiguity.
 *
 * @example
 * ```ts
 * import { negationVsNullFlavorAmbiguous } from "@cosyte/ccda";
 * const w = negationVsNullFlavorAmbiguous({ path: "observation" }, "NI");
 * ```
 */
export function negationVsNullFlavorAmbiguous(
  position: CcdaPosition,
  nullFlavor: string,
): CcdaWarning {
  return {
    code: WARNING_CODES.NEGATION_VS_NULLFLAVOR_AMBIGUOUS,
    message: `Act carries both negationInd="true" and nullFlavor "${nullFlavor}"; modeled as distinct fields, not collapsed.`,
    position,
  };
}

/**
 * Build an `ALLERGEN_GRANULARITY_SUSPECT` warning. Emitted when an allergen is
 * coded at a product/branded level (a dose-form or strength is detectable in
 * the RxNorm display) where an ingredient-level concept is expected — the code
 * is preserved, the granularity is flagged for review.
 *
 * @example
 * ```ts
 * import { allergenGranularitySuspect } from "@cosyte/ccda";
 * const w = allergenGranularitySuspect({ path: "playingEntity" });
 * ```
 */
export function allergenGranularitySuspect(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.ALLERGEN_GRANULARITY_SUSPECT,
    message: `Allergen appears coded at product level where an ingredient-level concept is expected; granularity flagged.`,
    position,
  };
}

/**
 * Build a `CODE_NARRATIVE_MISMATCH` warning. Emitted when a coded entry value
 * and the narrative text it references via `<reference value="#id">` disagree.
 * The parser surfaces **both** and picks no winner — a safety-critical
 * fail-safe so a structured/narrative divergence is never silently resolved.
 *
 * @example
 * ```ts
 * import { codeNarrativeMismatch } from "@cosyte/ccda";
 * const w = codeNarrativeMismatch({ path: "value" }, "problem");
 * ```
 */
export function codeNarrativeMismatch(position: CcdaPosition, slot: string): CcdaWarning {
  return {
    code: WARNING_CODES.CODE_NARRATIVE_MISMATCH,
    message: `Coded ${slot} value and its referenced narrative disagree; both preserved, no winner chosen.`,
    position,
  };
}

/**
 * Build a `NARRATIVE_REFERENCE_BROKEN` warning. Emitted when an entry's
 * `<reference value="#id">` points at a narrative `ID` that is not present in
 * the section's narrative index — the structured data is kept, the dangling
 * reference is flagged.
 *
 * @example
 * ```ts
 * import { narrativeReferenceBroken } from "@cosyte/ccda";
 * const w = narrativeReferenceBroken({ path: "reference" }, "prob1");
 * ```
 */
export function narrativeReferenceBroken(position: CcdaPosition, referenceId: string): CcdaWarning {
  return {
    code: WARNING_CODES.NARRATIVE_REFERENCE_BROKEN,
    message: `Narrative reference "#${referenceId}" does not resolve to any ID in the section narrative.`,
    position,
  };
}

/**
 * Build an `UNEXPECTED_CODE_SYSTEM` warning. Emitted when a coded value's
 * `@codeSystem` OID is not one of the systems expected for that slot (e.g. a
 * non-RxNorm OID on a medication, a non-SNOMED/ICD-10 OID on a problem). The
 * value is preserved verbatim.
 *
 * @example
 * ```ts
 * import { unexpectedCodeSystem } from "@cosyte/ccda";
 * const w = unexpectedCodeSystem({ path: "value" }, "1.2.3", "problem");
 * ```
 */
export function unexpectedCodeSystem(
  position: CcdaPosition,
  observedOid: string,
  slot: string,
): CcdaWarning {
  return {
    code: WARNING_CODES.UNEXPECTED_CODE_SYSTEM,
    message: `Code system OID "${observedOid}" is not expected for the ${slot} slot; value preserved.`,
    position,
  };
}

/**
 * Build a `DEPRECATED_CODE_SYSTEM` warning. Emitted when a coded value uses a
 * deprecated code system (ICD-9-CM diagnosis/procedure) where its modern
 * successor (ICD-10-CM/PCS, SNOMED) is expected — the value is preserved.
 *
 * @example
 * ```ts
 * import { deprecatedCodeSystem } from "@cosyte/ccda";
 * const w = deprecatedCodeSystem({ path: "value" }, "2.16.840.1.113883.6.103", "problem");
 * ```
 */
export function deprecatedCodeSystem(
  position: CcdaPosition,
  observedOid: string,
  slot: string,
): CcdaWarning {
  return {
    code: WARNING_CODES.DEPRECATED_CODE_SYSTEM,
    message: `Code system OID "${observedOid}" is deprecated for the ${slot} slot; prefer its modern successor. Value preserved.`,
    position,
  };
}

/**
 * Build a `MISSING_DOSE_QUANTITY` warning. Emitted when a Medication Activity
 * carries no `doseQuantity` — a safety-critical field. The dose is preserved as
 * absent (never defaulted) and the gap is flagged.
 *
 * @example
 * ```ts
 * import { missingDoseQuantity } from "@cosyte/ccda";
 * const w = missingDoseQuantity({ path: "substanceAdministration" });
 * ```
 */
export function missingDoseQuantity(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.MISSING_DOSE_QUANTITY,
    message: `Medication activity has no doseQuantity; dose preserved as absent, never defaulted.`,
    position,
  };
}

/**
 * Build a `MISSING_ROUTE_CODE` warning. Emitted when a Medication Activity
 * carries no `routeCode`. The route is preserved as absent (never defaulted)
 * and the gap is flagged.
 *
 * @example
 * ```ts
 * import { missingRouteCode } from "@cosyte/ccda";
 * const w = missingRouteCode({ path: "substanceAdministration" });
 * ```
 */
export function missingRouteCode(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.MISSING_ROUTE_CODE,
    message: `Medication activity has no routeCode; route preserved as absent, never defaulted.`,
    position,
  };
}

/**
 * Build a `MULTIPLE_EFFECTIVE_TIMES_UNRESOLVED` warning. A Medication Activity
 * carries its dosing period (`IVL_TS`) and frequency (`PIVL_TS`) as sibling
 * `effectiveTime` elements distinguished by `xsi:type`. This is emitted when
 * extra `effectiveTime` siblings cannot be classified into those two slots —
 * all are preserved, none discarded.
 *
 * @example
 * ```ts
 * import { multipleEffectiveTimesUnresolved } from "@cosyte/ccda";
 * const w = multipleEffectiveTimesUnresolved({ path: "substanceAdministration" }, 3);
 * ```
 */
export function multipleEffectiveTimesUnresolved(
  position: CcdaPosition,
  count: number,
): CcdaWarning {
  return {
    code: WARNING_CODES.MULTIPLE_EFFECTIVE_TIMES_UNRESOLVED,
    message: `Medication carries ${String(count)} effectiveTime elements that could not be classified as duration vs frequency; all preserved.`,
    position,
  };
}

/**
 * Build a `PROBLEM_STATUS_INDETERMINATE` warning. Emitted when a Problem
 * Concern Act's `statusCode` is absent or carries a token outside the
 * recognized `active`/`completed`/`suspended`/`aborted` set — the active vs
 * resolved state cannot be determined, so it is reported as `unknown`.
 *
 * @example
 * ```ts
 * import { problemStatusIndeterminate } from "@cosyte/ccda";
 * const w = problemStatusIndeterminate({ path: "act" });
 * ```
 */
export function problemStatusIndeterminate(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.PROBLEM_STATUS_INDETERMINATE,
    message: `Problem concern statusCode is missing or unrecognized; active/resolved state is indeterminate.`,
    position,
  };
}

/**
 * Build a `SECTION_PLACEMENT_SUSPECT` warning. Emitted when a recognized
 * clinical entry template appears in a section where it does not belong (e.g. a
 * Medication Activity inside the Problems section) — the entry is still
 * extracted, but the misplacement is flagged.
 *
 * @example
 * ```ts
 * import { sectionPlacementSuspect } from "@cosyte/ccda";
 * const w = sectionPlacementSuspect({ path: "entry" }, "medications", "problems");
 * ```
 */
export function sectionPlacementSuspect(
  position: CcdaPosition,
  entryExpectedSection: string,
  foundInSection: string,
): CcdaWarning {
  return {
    code: WARNING_CODES.SECTION_PLACEMENT_SUSPECT,
    message: `An entry template that belongs in the "${entryExpectedSection}" section was found in the "${foundInSection}" section; extracted but flagged.`,
    position,
  };
}

/**
 * Build a `NON_UCUM_UNIT` warning. Emitted when a `PQ` `@unit` is not a
 * well-formed UCUM unit (validated by the computable grammar). The raw unit
 * string and the value are **preserved verbatim** — never normalized away — so
 * the quantity is never silently re-dimensioned. The `@unit` is structural
 * metadata, not PHI.
 *
 * @example
 * ```ts
 * import { nonUcumUnit } from "@cosyte/ccda";
 * const w = nonUcumUnit({ path: "value" }, "cc");
 * ```
 */
export function nonUcumUnit(position: CcdaPosition, unit: string): CcdaWarning {
  return {
    code: WARNING_CODES.NON_UCUM_UNIT,
    message: `Unit "${unit}" is not a well-formed UCUM unit; value preserved verbatim, never normalized.`,
    position,
  };
}

/**
 * Build a `UCUM_CASE_SUSPECT` warning. Emitted when a `PQ` `@unit` differs only
 * in letter case from a canonical clinical UCUM spelling — `ML` for `mL`
 * (megaliter vs milliliter), `Mg` for `mg`, `mEq` for `meq`. The value is
 * preserved; the likely fix is a single case change.
 *
 * @example
 * ```ts
 * import { ucumCaseSuspect } from "@cosyte/ccda";
 * const w = ucumCaseSuspect({ path: "value" }, "ML");
 * ```
 */
export function ucumCaseSuspect(position: CcdaPosition, unit: string): CcdaWarning {
  return {
    code: WARNING_CODES.UCUM_CASE_SUSPECT,
    message: `Unit "${unit}" looks like a letter-case slip of a canonical UCUM unit; value preserved, review the casing.`,
    position,
  };
}

/**
 * Build a `MISSING_UNIT_ON_PQ` warning. Emitted when a physical-quantity value
 * carries a numeric `@value` but no `@unit` — a dimensionless measurement where
 * a unit is expected. The value is preserved; the missing unit is flagged, never
 * defaulted.
 *
 * @example
 * ```ts
 * import { missingUnitOnPq } from "@cosyte/ccda";
 * const w = missingUnitOnPq({ path: "value" });
 * ```
 */
export function missingUnitOnPq(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.MISSING_UNIT_ON_PQ,
    message: `Physical-quantity value has a numeric value but no @unit; preserved as dimensionless, never defaulted.`,
    position,
  };
}

/**
 * Build a `FREE_TEXT_REFERENCE_RANGE` warning. Emitted when a result's
 * `referenceRange` carries free text instead of a structured `IVL_PQ`
 * (`low`/`high`) — the text is preserved on the range, but it cannot be compared
 * numerically against the result value.
 *
 * @example
 * ```ts
 * import { freeTextReferenceRange } from "@cosyte/ccda";
 * const w = freeTextReferenceRange({ path: "referenceRange" });
 * ```
 */
export function freeTextReferenceRange(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.FREE_TEXT_REFERENCE_RANGE,
    message: `Reference range is free text, not a structured low/high interval; preserved as text, not numerically comparable.`,
    position,
  };
}

/**
 * Build a `RESULT_VALUE_TYPE_UNHANDLED` warning. Emitted when a result/vital
 * observation `value` carries an `xsi:type` the model does not specialize
 * (anything beyond `PQ`/`CD`/`CE`/`ST`/`IVL_PQ`). The raw value is preserved as
 * an `unsupported` value so nothing is dropped — only the typed view is absent.
 * The type name is structural metadata, not PHI.
 *
 * @example
 * ```ts
 * import { resultValueTypeUnhandled } from "@cosyte/ccda";
 * const w = resultValueTypeUnhandled({ path: "value" }, "RTO");
 * ```
 */
export function resultValueTypeUnhandled(position: CcdaPosition, xsiType: string): CcdaWarning {
  return {
    code: WARNING_CODES.RESULT_VALUE_TYPE_UNHANDLED,
    message: `Observation value xsi:type "${xsiType}" is not specialized; raw value preserved as unsupported.`,
    position,
  };
}

/**
 * Build an `IMMUNIZATION_REFUSED` warning. Emitted (informationally) when an
 * Immunization Activity carries `@negationInd="true"` — the vaccine was **not**
 * administered (refused / not given). The negation is modeled distinctly on
 * `refused`; this surfaces it so a refusal is never read as an administration.
 *
 * @example
 * ```ts
 * import { immunizationRefused } from "@cosyte/ccda";
 * const w = immunizationRefused({ path: "substanceAdministration" });
 * ```
 */
export function immunizationRefused(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.IMMUNIZATION_REFUSED,
    message: `Immunization activity carries negationInd="true" (vaccine not administered / refused); modeled as refused, never as given.`,
    position,
  };
}

/**
 * Build a `DEPRECATED_LOINC` warning. Emitted when a result/vital observation
 * `code` is a known-deprecated LOINC (e.g. BMI `41909-3`, superseded by
 * `39156-5`) — the code is preserved; the deprecation is flagged for review. The
 * LOINC code is a structural identifier, not PHI.
 *
 * @example
 * ```ts
 * import { deprecatedLoinc } from "@cosyte/ccda";
 * const w = deprecatedLoinc({ path: "code" }, "41909-3");
 * ```
 */
export function deprecatedLoinc(position: CcdaPosition, loincCode: string): CcdaWarning {
  return {
    code: WARNING_CODES.DEPRECATED_LOINC,
    message: `LOINC code "${loincCode}" is deprecated; prefer its current successor. Code preserved.`,
    position,
  };
}
