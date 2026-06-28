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
