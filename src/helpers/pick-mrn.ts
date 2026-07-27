/**
 * `pickMrn`, pick the Medical Record Number string from a C-CDA patient's
 * `patientRole/id` list. Isolated from the document model so a later
 * profile-aware variant can substitute without patching every caller.
 *
 * C-CDA `<id>` elements are HL7 v3 {@link II} instances (`root` = assigning
 * authority OID, `extension` = the local id value); unlike HL7 v2's CX they
 * carry no `identifierTypeCode`, so there is no MR-type marker to prefer. The
 * deterministic choice stays the **first** id, and when the document marked
 * that id null the answer is `undefined` rather than a different id (see
 * {@link pickMrn}). Silent (helpers emit no warnings, the datatype layer
 * already flagged the contradiction) and never throws.
 */

import type { II } from "../model/types/ii.js";

/**
 * Pick the MRN string from a list of `patientRole/id` {@link II} identifiers.
 *
 * Returns the **first** identifier's `extension`, or `undefined` when the list
 * is empty, when that identifier has no `extension` (a root-only id names an
 * assigning authority, not a patient), or when it carries a `nullFlavor`.
 *
 * **Why a `nullFlavor`-marked `<id>` is withheld rather than read.** In HL7 v3,
 * `nullFlavor` is a property of `ANY`: it marks an *exceptional* value, one
 * with no proper value. An `<id nullFlavor="UNK" extension="X"/>` therefore
 * says both "this identifier is unknown" and "this identifier is X", and
 * `parseIi` already flags that contradiction as `CONTRADICTORY_NULL_FLAVOR`
 * (safety-critical). Reading `X` out of it anyway is how a record gets filed
 * against the wrong patient, which is silent, persistent, and contaminates
 * everything downstream, so it sits alongside a wrong dose and a wrong code
 * system in this package's harm ordering.
 *
 * **And why it is not skipped past, either.** Falling through to the next
 * `<id>` looks like the helpful move and is a worse one. CDA R2 makes
 * `patientRole/id` `1..*` and neither it nor C-CDA R2.1 says which entry is the
 * MRN, so nothing in the document ranks them: the second id is not "another
 * MRN", it is whatever the sending system listed second, commonly a plan
 * member number, an account number, or the SSN under
 * `2.16.840.1.113883.4.1`. Substituting it would answer the MRN question
 * confidently from a different assigning authority, with no signal naming the
 * substitution, which trades one wrong-identifier failure for a quieter one.
 * The rule this helper is applying declines a manufactured reading; it does not
 * manufacture a replacement. Same slot, same position, reading withheld.
 *
 * **This is the `PQ.value` rule, applied one layer up rather than abandoned.**
 * `parsePq` withholds `value` on a contradicted quantity because `value` is a
 * number the parser *manufactured* from `raw`, and `raw` survives, so nothing
 * the document said is lost. `II.extension` is not like that: it **is** the
 * document's own text, with no second copy, so `parseIi` keeps it and a caller
 * reading `patient.identifiers[0].extension` still gets it with the
 * `nullFlavor` sitting on the same object. What *is* manufactured here is the
 * **selection**: picking one `<id>` out of a list and handing back a bare
 * `string` strips away the `nullFlavor` that qualified it. So the derived act
 * declines, and the verbatim data stays reachable. Both properties, rather than
 * a trade between them.
 *
 * A caller whose assigning authority genuinely carries the MRN on a later
 * `<id>`, or who treats a given `nullFlavor` as tolerable, can walk
 * `patient.identifiers` and branch on each `root`. That decision needs the
 * authority OIDs, which this helper does not have and must not guess.
 *
 * **Provenance:** no normative SHALL is cited. CDA R2 declares `@nullFlavor`
 * and `@extension` on `II` independently, and neither CDA R2 nor C-CDA R2.1
 * states which `patientRole/id` is the MRN. The rule rests on v3 datatype
 * semantics plus the harm ordering above.
 *
 * @example
 * ```ts
 * import { pickMrn } from "@cosyte/ccda";
 * pickMrn([{ root: "2.16.840.1.113883.19.5", extension: "MRN001" }]);
 * // → "MRN001"
 *
 * pickMrn([{ nullFlavor: "UNK", extension: "MRN001" }]);
 * // → undefined  (the document disowned that identifier)
 *
 * // A second id under a different authority is NOT a fallback MRN:
 * pickMrn([{ nullFlavor: "UNK", extension: "MRN001" }, { root: "2.16.840.1.113883.4.1", extension: "SYNTH-9" }]);
 * // → undefined  (still the first id, withheld; never the next authority's number)
 *
 * pickMrn([]);
 * // → undefined
 * ```
 */
export function pickMrn(identifiers: readonly II[]): string | undefined {
  const first = identifiers[0];
  return first === undefined || first.nullFlavor !== undefined ? undefined : first.extension;
}
