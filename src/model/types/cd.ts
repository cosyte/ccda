/**
 * CD / CE — HL7 v3 Concept Descriptor and Coded-with-Equivalents. The coded
 * datatype behind `code`, `value xsi:type="CD"`, section codes, and most
 * vocabulary-bound fields. CE is a structural restriction of CD (no
 * `qualifier`); the suite parses both into the same {@link CD} shape. Captures
 * the code tuple, the optional `originalText` reference, and `translation`
 * alternatives.
 */

import { attr, child, children, text } from "../dom.js";
import { readNullFlavor, type ParseCtx } from "./_shared.js";
import type { Element } from "@xmldom/xmldom";

/**
 * Parsed HL7 v3 coded value. `code` + `codeSystem` form the bound concept;
 * `displayName` is the human label; `originalText` is the source text the code
 * was derived from; `translation` holds alternative codings (e.g. a local code
 * alongside a LOINC/SNOMED standard).
 *
 * @example
 * ```ts
 * import type { CD } from "@cosyte/ccda";
 * const sectionCode: CD = {
 *   code: "48765-2",
 *   codeSystem: "2.16.840.1.113883.6.1",
 *   displayName: "Allergies",
 * };
 * ```
 */
export interface CD {
  readonly code?: string;
  readonly codeSystem?: string;
  readonly codeSystemName?: string;
  readonly displayName?: string;
  readonly originalText?: string;
  readonly translation?: readonly CD[];
  readonly nullFlavor?: string;
}

/**
 * Parse a `CD`/`CE` element into a typed {@link CD}. Returns `undefined` when
 * the element is absent. Resolves a child `<originalText>` to its trimmed text
 * and parses each `<translation>` recursively (translations of a translation
 * are ignored — C-CDA does not nest them). Never throws.
 *
 * @example
 * ```ts
 * import { parseCd } from "@cosyte/ccda";
 * const code = parseCd(codeEl, { emit: () => {} });
 * console.log(code?.code, code?.displayName);
 * ```
 */
export function parseCd(el: Element | undefined, ctx: ParseCtx): CD | undefined {
  if (el === undefined) return undefined;
  const out: {
    code?: string;
    codeSystem?: string;
    codeSystemName?: string;
    displayName?: string;
    originalText?: string;
    translation?: readonly CD[];
    nullFlavor?: string;
  } = {};

  const code = attr(el, "code");
  if (code !== undefined) out.code = code;
  const codeSystem = attr(el, "codeSystem");
  if (codeSystem !== undefined) out.codeSystem = codeSystem;
  const codeSystemName = attr(el, "codeSystemName");
  if (codeSystemName !== undefined) out.codeSystemName = codeSystemName;
  const displayName = attr(el, "displayName");
  if (displayName !== undefined) out.displayName = displayName;

  const originalTextEl = child(el, "originalText");
  if (originalTextEl !== undefined) {
    const ot = text(originalTextEl);
    if (ot !== undefined) out.originalText = ot;
  }

  const translations = children(el, "translation")
    .map((t) => parseCdShallow(t, ctx))
    .filter((t): t is CD => t !== undefined);
  if (translations.length > 0) out.translation = translations;

  const nullFlavor = readNullFlavor(el, ctx);
  if (nullFlavor !== undefined) out.nullFlavor = nullFlavor;
  return out;
}

/** Parse a coded element without descending into nested translations. @internal */
function parseCdShallow(el: Element, ctx: ParseCtx): CD | undefined {
  const out: {
    code?: string;
    codeSystem?: string;
    codeSystemName?: string;
    displayName?: string;
    nullFlavor?: string;
  } = {};
  const code = attr(el, "code");
  if (code !== undefined) out.code = code;
  const codeSystem = attr(el, "codeSystem");
  if (codeSystem !== undefined) out.codeSystem = codeSystem;
  const codeSystemName = attr(el, "codeSystemName");
  if (codeSystemName !== undefined) out.codeSystemName = codeSystemName;
  const displayName = attr(el, "displayName");
  if (displayName !== undefined) out.displayName = displayName;
  const nullFlavor = readNullFlavor(el, ctx);
  if (nullFlavor !== undefined) out.nullFlavor = nullFlavor;
  if (Object.keys(out).length === 0) return undefined;
  return out;
}
