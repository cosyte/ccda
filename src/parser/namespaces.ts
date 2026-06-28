/**
 * XML namespace constants for HL7 CDA R2 / C-CDA R2.1 and the small set of
 * companion namespaces the parser recognizes. C-CDA documents default to the
 * HL7 v3 namespace `urn:hl7-org:v3`; `xsi` drives `xsi:type` dispatch on
 * polymorphic elements, and `sdtc` carries the HL7 standards-extension
 * attributes (e.g. `sdtc:raceCode`). Anything outside this set is retained but
 * flagged with `UNKNOWN_NAMESPACE_PREFIX`.
 */

/**
 * The HL7 v3 / CDA R2 default namespace. Every structural C-CDA element
 * (`ClinicalDocument`, `recordTarget`, `section`, …) lives here.
 *
 * @example
 * ```ts
 * import { V3_NS } from "@cosyte/ccda";
 * console.log(V3_NS); // "urn:hl7-org:v3"
 * ```
 */
export const V3_NS = "urn:hl7-org:v3";

/**
 * The XML Schema Instance namespace. Carries the `xsi:type` attribute that
 * selects a concrete HL7 v3 datatype for a polymorphic element (e.g.
 * `value xsi:type="PQ"`).
 *
 * @example
 * ```ts
 * import { XSI_NS } from "@cosyte/ccda";
 * console.log(XSI_NS); // "http://www.w3.org/2001/XMLSchema-instance"
 * ```
 */
export const XSI_NS = "http://www.w3.org/2001/XMLSchema-instance";

/**
 * The HL7 standards-development-organization extension namespace (`sdtc`),
 * used for attributes/elements the base CDA schema does not define but C-CDA
 * permits (e.g. `sdtc:raceCode`, `sdtc:deceasedInd`).
 *
 * @example
 * ```ts
 * import { SDTC_NS } from "@cosyte/ccda";
 * console.log(SDTC_NS); // "urn:hl7-org:sdtc"
 * ```
 */
export const SDTC_NS = "urn:hl7-org:sdtc";

/** The namespace URIs the parser recognizes without warning. @internal */
const RECOGNIZED_NAMESPACES: ReadonlySet<string> = new Set([V3_NS, XSI_NS, SDTC_NS]);

/**
 * Return `true` when a namespace URI is one the parser recognizes
 * (`urn:hl7-org:v3`, the XSI namespace, or `urn:hl7-org:sdtc`). A `null` URI —
 * an element with no namespace at all — counts as unrecognized.
 *
 * @example
 * ```ts
 * import { isRecognizedNamespace, V3_NS } from "@cosyte/ccda";
 * isRecognizedNamespace(V3_NS);          // true
 * isRecognizedNamespace("urn:vendor");   // false
 * isRecognizedNamespace(null);           // false
 * ```
 */
export function isRecognizedNamespace(namespaceUri: string | null): boolean {
  return namespaceUri !== null && RECOGNIZED_NAMESPACES.has(namespaceUri);
}
