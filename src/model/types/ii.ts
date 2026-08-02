/**
 * II, HL7 v3 Instance Identifier. The universal identifier datatype in CDA:
 * `templateId`, document `id`, patient identifiers, and assigned-authority ids
 * are all II. Carries a `root` (an OID or UUID), an optional `extension`
 * (the local id within that root), an optional human-readable
 * `assigningAuthorityName`, and `nullFlavor`. This parser is silent, callers
 * that need to flag, e.g., a missing assigning authority do so at their layer.
 */

import { attr } from "../dom.js";
import { safeDerivedToken, WITHHELD } from "../../parser/tokens.js";
import {
  contradictsAssertedValue,
  isNullFlavor,
  readNullFlavor,
  type ParseCtx,
} from "./_shared.js";
import type { Element } from "@xmldom/xmldom";

/**
 * Parsed HL7 v3 Instance Identifier. `root` is the namespace OID/UUID;
 * `extension` is the local identifier within it. For a `templateId`, `root`
 * (and optionally `extension`, the R2.1 version stamp) are the meaningful
 * fields; for a patient id, `root`+`extension` form the full MRN.
 *
 * @example
 * ```ts
 * import type { II } from "@cosyte/ccda";
 * const id: II = { root: "2.16.840.1.113883.19.5", extension: "12345" };
 * ```
 */
export interface II {
  readonly root?: string;
  readonly extension?: string;
  readonly assigningAuthorityName?: string;
  readonly nullFlavor?: string;
}

/**
 * Parse an `II` element into a typed {@link II}. Returns `undefined` when the
 * element itself is absent. Never throws; omits any field the element does not
 * carry.
 *
 * A `@nullFlavor` declared beside an `@extension` emits
 * `CONTRADICTORY_NULL_FLAVOR`: the element says both "this identifier is
 * unknown" and "this identifier is 12345". Only `@extension` counts as the
 * contradicted assertion; a `@root` alone is a namespace without a local
 * identifier, so no identifier value is produced and the shape stays silent.
 *
 * The `@extension` itself is **kept**. It is the document's own text, with no
 * second copy the way `PQ.raw` sits beside `PQ.value`, so withholding it here
 * would delete what the document said rather than decline to embellish it (see
 * {@link parsePq} for the rule and its limit). Nor is there a derived reading
 * to withhold: at this layer `extension` *is* the datum, not something the
 * parser manufactured from it.
 *
 * **Where the withholding happens instead.** The dangerous act is not reporting
 * an `II` whole, with its `nullFlavor` attached, it is *selecting* one and
 * handing back a naked `string` that no longer carries the marking. This model
 * does that in exactly one place, {@link pickMrn} (behind `getMrn()`), and that
 * is where a null-marked identifier is declined. The identity slots,
 * `ClinicalDocument.id`, `setId`, `relatedDocument/parentDocument/id` and every
 * entry-level `<id>`, are only ever reported as the whole datatype beside the
 * warning, so the `nullFlavor` never goes missing and there is nothing to
 * withhold. The emit side is guarded separately: `editCcda` refuses to build an
 * `RPLC` `parentDocument` out of a null-marked source `<id>`, because copying
 * `root`/`extension` forward would launder a disowned identifier into an
 * asserted one.
 *
 * **`templateId` is the stated exception, and it is deliberate.** Document- and
 * section-type recognition *does* derive a reading from `templateId.@root`, so
 * `<templateId root="…22.1.2" nullFlavor="NA"/>` still resolves the document
 * type and its required-section SHALL set. That is left alone on purpose: a
 * `templateId` is a conformance assertion about the *document's shape*, not an
 * identifier for a person or a record, so a mis-read costs a spurious or
 * missing `REQUIRED_SECTION_MISSING` rather than a misattributed clinical fact.
 * Declining to recognize would also make the parser less informative, not
 * safer, replacing a working document type with `UNKNOWN_DOCUMENT_TEMPLATE`.
 * Note too that the shape stays silent here by the rule above: `@root` is not
 * the contradicted assertion, only `@extension` is.
 *
 * @example
 * ```ts
 * import { parseIi } from "@cosyte/ccda";
 * const id = parseIi(idEl, { emit: () => {} });
 * console.log(id?.root);
 * ```
 */
export function parseIi(el: Element | undefined, ctx: ParseCtx): II | undefined {
  if (el === undefined) return undefined;
  const out: {
    root?: string;
    extension?: string;
    assigningAuthorityName?: string;
    nullFlavor?: string;
  } = {};
  const root = attr(el, "root");
  if (root !== undefined) out.root = root;
  const extension = attr(el, "extension");
  if (extension !== undefined) out.extension = extension;
  const authority = attr(el, "assigningAuthorityName");
  if (authority !== undefined) out.assigningAuthorityName = authority;
  const nullFlavor = readNullFlavor(el, ctx);
  if (nullFlavor !== undefined) out.nullFlavor = nullFlavor;
  contradictsAssertedValue(el, "II", nullFlavor, extension !== undefined, ctx);
  return out;
}

/**
 * Bound a `<templateId>` that is about to be kept on the model.
 *
 * A `templateId` is the one II whose fields are pure **locators**: it names a
 * template, so a downstream package describing "where" a deviation was reads
 * exactly this. Every field on it is consumer-controlled, and through `0.0.4`
 * every one was copied verbatim onto `CcdaDocument.templateIds` and
 * `CcdaSection.templateIds`. That is the `@cosyte/hl7` → `@cosyte/deid` failure
 * precisely: bounding the warning messages leaves the model carrying the same
 * unbounded string.
 *
 * **All four fields, not the obvious two.** The first cut of this bounded `root`
 * and `extension` and spread the rest through, which left
 * `assigningAuthorityName` (free text, no shape at all) and `nullFlavor` copied
 * verbatim on an element the model presents as a structural identifier. Both are
 * schema-legal here (`root`, `extension`, `assigningAuthorityName` are `II`'s
 * own attributes and `nullFlavor` is inherited from `ANY`), so a sender can
 * write anything in either. Neither means anything on a `templateId`: a template
 * OID has no assigning authority to label, so the label is withheld outright
 * rather than shape-tested, and the `nullFlavor` is bounded on membership in
 * `NULL_FLAVORS`.
 *
 * **That list is load-bearing for this bound, so mind what it contains.** It
 * held eight of the code system's seventeen concepts through `0.0.4`, which
 * meant a conforming `nullFlavor="PINF"` both drew a false
 * `INVALID_NULL_FLAVOR` and read `<withheld>` here. It is the whole code system
 * now, so a conforming token is echoed and only a token outside the system is
 * withheld. The bound itself did not change: it is membership in a closed set of
 * literals this package owns, never a shape test, because at the point a token
 * fails membership nothing distinguishes it from any other sender-chosen text.
 *
 * A conforming stamp passes through untouched (`2.16.840.1.113883.10.20.22.1.2`
 * is a UID, `2015-08-01` is a version, and neither other attribute appears at
 * all), so recognition is unaffected: a root that fails the shape could not have
 * matched the catalog either. Only the **other** II uses are left alone, because
 * there `extension` is the identifier the model exists to report (an MRN, an
 * accession number) and `assigningAuthorityName` labels the authority that
 * issued it, so withholding either would delete clinical data instead of
 * declining to echo a locator.
 *
 * @example
 * ```ts
 * import { boundTemplateId } from "./ii.js";
 * const bounded = boundTemplateId({ root: "2.16.840.1.113883.10.20.22.1.2" });
 * ```
 *
 * @internal
 */
export function boundTemplateId(id: II): II {
  const out: {
    root?: string;
    extension?: string;
    assigningAuthorityName?: string;
    nullFlavor?: string;
  } = { ...id };
  if (id.root !== undefined) out.root = safeDerivedToken(id.root, "uid");
  if (id.extension !== undefined) out.extension = safeDerivedToken(id.extension, "templateVersion");
  if (id.assigningAuthorityName !== undefined) out.assigningAuthorityName = WITHHELD;
  if (id.nullFlavor !== undefined)
    out.nullFlavor = isNullFlavor(id.nullFlavor) ? id.nullFlavor : WITHHELD;
  return out;
}
