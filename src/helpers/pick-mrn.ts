/**
 * `pickMrn` — pick the Medical Record Number string from a C-CDA patient's
 * `patientRole/id` list. Isolated from the document model so a later
 * profile-aware variant can substitute without patching every caller.
 *
 * C-CDA `<id>` elements are HL7 v3 {@link II} instances (`root` = assigning
 * authority OID, `extension` = the local id value); unlike HL7 v2's CX they
 * carry no `identifierTypeCode`, so there is no MR-type marker to prefer. The
 * deterministic choice is the **first** id's `extension`. Silent (helpers emit
 * no warnings) and never throws.
 */

import type { II } from "../model/types/ii.js";

/**
 * Pick the MRN string from a list of `patientRole/id` {@link II} identifiers.
 *
 * Returns the first identifier's `extension` (the local id value an MRN is
 * carried in). Returns `undefined` when the list is empty or the first id has
 * no `extension` (e.g. a root-only id, or a `nullFlavor` id). Callers needing
 * authority-specific resolution can walk `patient.identifiers` themselves and
 * branch on each `root`.
 *
 * @example
 * ```ts
 * import { pickMrn } from "@cosyte/ccda";
 * pickMrn([{ root: "2.16.840.1.113883.19.5", extension: "MRN001" }]);
 * // → "MRN001"
 *
 * pickMrn([{ nullFlavor: "UNK" }]);
 * // → undefined  (first id carries no extension)
 *
 * pickMrn([]);
 * // → undefined
 * ```
 */
export function pickMrn(identifiers: readonly II[]): string | undefined {
  return identifiers[0]?.extension;
}
