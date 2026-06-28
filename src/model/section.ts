/**
 * Section model + framing for `@cosyte/ccda`. A C-CDA structured body is a tree
 * of `<section>` elements; Phase 1 frames them down to recognized identity +
 * narrative (no clinical entry extraction — that is Phase 2+). Recognition is
 * `templateId`-root primary with a LOINC `code` fallback, matching the
 * roadmap's section-framing contract; the captured narrative `<text>` is
 * indexed by content `ID` so Phase 2 entries can resolve `<reference value="#id">`.
 */

import { sectionForLoinc, sectionForTemplateRoot, type SectionInfo } from "../parser/templates.js";
import { sectionMatchedByLoincFallback, unknownSectionCode } from "../parser/warnings.js";
import { attr, child, childElements, children, positionOf, text } from "./dom.js";
import { parseCd, type CD } from "./types/cd.js";
import { parseIi, type II } from "./types/ii.js";
import type { ParseCtx } from "./types/_shared.js";
import type { Element } from "@xmldom/xmldom";

/** Element node type per the DOM spec (`Node.ELEMENT_NODE`). @internal */
const ELEMENT_NODE = 1 as const;

/**
 * A framed C-CDA section. `key`/`title` carry the recognized identity (when the
 * section matched the catalog); `code` and `templateIds` are the raw signals;
 * `narrativeText` is the human-readable `<text>` block and `narrativeById`
 * indexes its `ID`-bearing nodes; `subsections` holds nested
 * `<component><section>` children.
 *
 * @example
 * ```ts
 * import type { CcdaSection } from "@cosyte/ccda";
 * function summarize(s: CcdaSection): string {
 *   return `${s.key ?? "unknown"}: ${s.narrativeText ?? "(no narrative)"}`;
 * }
 * ```
 */
export interface CcdaSection {
  readonly key?: string;
  readonly title?: string;
  readonly code?: CD;
  readonly templateIds: readonly II[];
  readonly recognizedBy?: "templateId" | "loinc";
  readonly narrativeText?: string;
  readonly narrativeById: ReadonlyMap<string, string>;
  readonly subsections: readonly CcdaSection[];
}

/**
 * Frame a `<section>` element into a {@link CcdaSection}. Recognizes the section
 * by `templateId` root (primary) or LOINC `code` (fallback, emitting
 * `SECTION_MATCHED_BY_LOINC_FALLBACK`); an unrecognized coded section emits
 * `UNKNOWN_SECTION_CODE` and is retained as narrative-only. Recurses into
 * nested `<component><section>` subsections. Never throws.
 *
 * @example
 * ```ts
 * import { buildSection } from "@cosyte/ccda";
 * const section = buildSection(sectionEl, { emit: () => {} });
 * console.log(section.key, section.subsections.length);
 * ```
 */
export function buildSection(el: Element, ctx: ParseCtx): CcdaSection {
  const templateIds = children(el, "templateId")
    .map((t) => parseIi(t, ctx))
    .filter((t): t is II => t !== undefined);
  const code = parseCd(child(el, "code"), ctx);
  const titleEl = child(el, "title");
  const title = titleEl === undefined ? undefined : text(titleEl);

  const match = recognize(el, templateIds, code, ctx);

  const out: {
    key?: string;
    title?: string;
    code?: CD;
    templateIds: readonly II[];
    recognizedBy?: "templateId" | "loinc";
    narrativeText?: string;
    narrativeById: ReadonlyMap<string, string>;
    subsections: readonly CcdaSection[];
  } = {
    templateIds,
    narrativeById: new Map(),
    subsections: [],
  };

  if (match !== undefined) {
    out.key = match.info.key;
    out.recognizedBy = match.by;
  }
  if (title !== undefined) out.title = title;
  if (code !== undefined) out.code = code;

  const textEl = child(el, "text");
  if (textEl !== undefined) {
    const narrative = text(textEl);
    if (narrative !== undefined) out.narrativeText = narrative;
    out.narrativeById = buildNarrativeIndex(textEl);
  }

  out.subsections = children(el, "component")
    .map((comp) => child(comp, "section"))
    .filter((s): s is Element => s !== undefined)
    .map((s) => buildSection(s, ctx));

  return out;
}

/** Resolve section identity via templateId root then LOINC fallback. @internal */
function recognize(
  el: Element,
  templateIds: readonly II[],
  code: CD | undefined,
  ctx: ParseCtx,
): { readonly info: SectionInfo; readonly by: "templateId" | "loinc" } | undefined {
  for (const tid of templateIds) {
    if (tid.root === undefined) continue;
    const info = sectionForTemplateRoot(tid.root);
    if (info !== undefined) return { info, by: "templateId" };
  }

  const loinc = code?.code;
  if (loinc !== undefined) {
    const info = sectionForLoinc(loinc);
    const pos = { ...positionOf(el), sectionCode: loinc };
    if (info !== undefined) {
      ctx.emit(sectionMatchedByLoincFallback(pos, loinc));
      return { info, by: "loinc" };
    }
    ctx.emit(unknownSectionCode(pos, loinc));
  }
  return undefined;
}

/**
 * Index a narrative `<text>` block by the `ID` attributes carried on its
 * descendant elements, mapping each `ID` to that node's trimmed text. C-CDA
 * entries reference narrative via `<reference value="#id">`; this index lets
 * the entry layer resolve those references without re-walking the DOM.
 *
 * @example
 * ```ts
 * import { buildNarrativeIndex, child } from "@cosyte/ccda";
 * const index = buildNarrativeIndex(child(sectionEl, "text")!);
 * console.log(index.get("problem1"));
 * ```
 */
export function buildNarrativeIndex(textEl: Element): ReadonlyMap<string, string> {
  const index = new Map<string, string>();
  let level: Element[] = [...childElements(textEl)];
  while (level.length > 0) {
    const next: Element[] = [];
    for (const node of level) {
      const id = attr(node, "ID");
      if (id !== undefined) {
        const value = text(node);
        if (value !== undefined) index.set(id, value);
      }
      for (let c = node.firstChild; c !== null; c = c.nextSibling) {
        if (c.nodeType === ELEMENT_NODE) next.push(c as Element);
      }
    }
    level = next;
  }
  return index;
}
