/**
 * ED — HL7 v3 Encapsulated Data. Carries a `mediaType`, a `representation`
 * (`TXT` or `B64`), and either inline content or a `<reference value="...">`.
 *
 * **Base64 quarantine:** when `representation` is `B64`, the inline content is
 * captured verbatim into `value` and **never decoded** here — decoding hostile
 * base64 (which may carry images or arbitrary bytes) is out of scope for the
 * parser and a deliberate safety boundary (see `docs/adr/0001-xml-parser.md`).
 */

import { attr, child, text } from "../dom.js";
import { readNullFlavor, type ParseCtx } from "./_shared.js";
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

  const mediaType = attr(el, "mediaType");
  if (mediaType !== undefined) out.mediaType = mediaType;
  const representation = attr(el, "representation");
  if (representation !== undefined) out.representation = representation;

  const referenceEl = child(el, "reference");
  if (referenceEl !== undefined) {
    const ref = attr(referenceEl, "value");
    if (ref !== undefined) out.reference = ref;
  }

  // Inline content is captured verbatim — base64 is quarantined, not decoded.
  const inline = text(el);
  if (inline !== undefined) out.value = inline;

  const nullFlavor = readNullFlavor(el, ctx);
  if (nullFlavor !== undefined) out.nullFlavor = nullFlavor;
  return out;
}
