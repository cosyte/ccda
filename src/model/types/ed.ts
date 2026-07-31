/**
 * ED, HL7 v3 Encapsulated Data. Carries a `mediaType`, a `representation`
 * (`TXT` or `B64`), and either inline content or a `<reference value="...">`.
 *
 * **Base64 quarantine:** when `representation` is `B64`, the inline content is
 * captured verbatim into `value` and **never decoded** here, decoding hostile
 * base64 (which may carry images or arbitrary bytes) is out of scope for the
 * parser and a deliberate safety boundary.
 */

import { attr, child, text } from "../dom.js";
import { safeMediaType, safeRepresentation, WITHHELD } from "../../parser/tokens.js";
import {
  contradictsAssertedValue,
  isNullFlavor,
  readNullFlavor,
  type ParseCtx,
} from "./_shared.js";
import type { Element } from "@xmldom/xmldom";

/**
 * Parsed HL7 v3 Encapsulated Data. `value` is the inline content (verbatim,
 * never base64-decoded); `reference` is the `<reference @value>` URI pointing
 * at out-of-line content (e.g. a narrative `#id` or an external image).
 *
 * @example
 * ```ts
 * import type { ED } from "@cosyte/ccda";
 * const ref: ED = { mediaType: "image/png", representation: "B64", reference: "#img1" };
 * ```
 */
export interface ED {
  readonly mediaType?: string;
  readonly representation?: string;
  readonly value?: string;
  readonly reference?: string;
  readonly nullFlavor?: string;
}

/**
 * Parse an `ED` element into a typed {@link ED}. Returns `undefined` when the
 * element is absent. Captures inline content verbatim (base64 is not decoded)
 * and resolves a child `<reference>`'s `@value`. Never throws.
 *
 * A `@nullFlavor` declared beside inline content or a `<reference>` emits
 * `CONTRADICTORY_NULL_FLAVOR`; a `@mediaType` or `@representation` alone
 * describes a null value rather than contradicting it and stays silent. Content
 * and reference are **kept** verbatim (see {@link parsePq}).
 *
 * @example
 * ```ts
 * import { parseEd } from "@cosyte/ccda";
 * const ed = parseEd(el, { emit: () => {} });
 * console.log(ed?.reference ?? ed?.value);
 * ```
 */
export function parseEd(el: Element | undefined, ctx: ParseCtx): ED | undefined {
  if (el === undefined) return undefined;
  const out: {
    mediaType?: string;
    representation?: string;
    value?: string;
    reference?: string;
    nullFlavor?: string;
  } = {};

  // `mediaType`, `representation` and `nullFlavor` describe the *shape* of the
  // content rather than being the content, so they are the three locators on an
  // `ED` and are bounded. `value` and `reference` are the document's own text
  // and are kept verbatim.
  const mediaType = attr(el, "mediaType");
  if (mediaType !== undefined) out.mediaType = safeMediaType(mediaType);
  const representation = attr(el, "representation");
  if (representation !== undefined) out.representation = safeRepresentation(representation);

  const referenceEl = child(el, "reference");
  if (referenceEl !== undefined) {
    const ref = attr(referenceEl, "value");
    if (ref !== undefined) out.reference = ref;
  }

  // Inline content is captured verbatim, base64 is quarantined, not decoded.
  const inline = text(el);
  if (inline !== undefined) out.value = inline;

  // Bounded like the other two, and for the same reason: it rides on the object
  // the model presents as the body's shape, and `INVALID_NULL_FLAVOR` fires
  // exactly when the token is outside the set, so at that point nothing
  // distinguishes it from any other text. Bounded on membership in this
  // package's `NULL_FLAVORS`; the token itself survives in `doc.toString()`.
  const nullFlavor = readNullFlavor(el, ctx);
  if (nullFlavor !== undefined) {
    out.nullFlavor = isNullFlavor(nullFlavor) ? nullFlavor : WITHHELD;
  }
  contradictsAssertedValue(
    el,
    "ED",
    nullFlavor,
    out.value !== undefined || out.reference !== undefined,
    ctx,
  );
  return out;
}
