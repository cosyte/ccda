/**
 * Section model + framing for `@cosyte/ccda`. A C-CDA structured body is a tree
 * of `<section>` elements; framing reduces them to recognized identity +
 * narrative, without clinical entry extraction. Recognition is
 * `templateId`-root primary with a LOINC `code` fallback; the captured
 * narrative `<text>` is indexed by content `ID` so clinical entries can
 * resolve `<reference value="#id">`.
 */

import { sectionForLoinc, sectionForTemplateRoot, type SectionInfo } from "../parser/templates.js";
import { safeDerivedToken } from "../parser/tokens.js";
import type { CcdaPosition } from "../parser/types.js";
import { sectionMatchedByLoincFallback, unknownSectionCode } from "../parser/warnings.js";
import { attr, child, childElements, children, positionOf, text } from "./dom.js";
import { readAuthorship, type CcdaAuthorship, type CcdaEntryAuthorship } from "./header.js";
import { anyEntryAct, childEntries, readIds } from "./entries/shared.js";
import { entryGoverned, sectionUnderSubjectDeclaration } from "./entries/subject.js";
import { parseCd, type CD } from "./types/cd.js";
import { boundTemplateId, parseIi, type II } from "./types/ii.js";
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
 * `authorship` is the section's author reading and `entryAuthorship` holds one
 * reading per top-level entry act in the section, in document order. Either is
 * the level's own participation where it carries one, and otherwise the nearest
 * enclosing level's marked `inherited`; both are absent when no enclosing level
 * carries an author either. `entryAuthorship` runs over the entry acts a
 * record-target read path may read, so an entry an overriding `<subject>`
 * declaration governs is absent from it entirely, exactly as it is absent from
 * every extracted entry family.
 *
 * `entryAuthorship` is optional on the type and always populated by the parser:
 * {@link buildSection} sets it on every section it frames, empty where the
 * section has no entry act to read. It is optional because this interface is an
 * INPUT surface as well as an output one, reachable through
 * `CcdaDocumentInit.sections`, so requiring it would stop a consumer's existing
 * section literal from compiling.
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
  readonly authorship?: CcdaAuthorship;
  readonly entryAuthorship?: readonly CcdaEntryAuthorship[];
}

/**
 * Frame a `<section>` element into a {@link CcdaSection}. Recognizes the section
 * by `templateId` root (primary) or LOINC `code` (fallback, emitting
 * `SECTION_MATCHED_BY_LOINC_FALLBACK`); an unrecognized coded section emits
 * `UNKNOWN_SECTION_CODE` and is retained as narrative-only. Recurses into
 * nested `<component><section>` subsections. Never throws.
 *
 * `enclosing` is the author reading of the level this section sits inside (the
 * document's for a top-level section, the parent section's for a subsection). It
 * is conducted down to this section and on to its entry acts wherever the level
 * carries no `author` of its own, and marked `inherited` when it is. Omit it and
 * the section is read as having no enclosing author, which is what a caller
 * framing a detached `<section>` element is actually looking at.
 *
 * @example
 * ```ts
 * import { buildSection } from "@cosyte/ccda";
 * const section = buildSection(sectionEl, { emit: () => {} });
 * console.log(section.key, section.subsections.length);
 * ```
 */
export function buildSection(el: Element, ctx: ParseCtx, enclosing?: CcdaAuthorship): CcdaSection {
  const templateIds = children(el, "templateId")
    .map((t) => parseIi(t, ctx))
    .filter((t): t is II => t !== undefined)
    .map(boundTemplateId);
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
    authorship?: CcdaAuthorship;
    entryAuthorship: readonly CcdaEntryAuthorship[];
  } = {
    templateIds,
    narrativeById: new Map(),
    subsections: [],
    entryAuthorship: [],
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

  const authorship = readAuthorship(el, ctx, enclosing);
  if (authorship !== undefined) out.authorship = authorship;
  out.entryAuthorship = readEntryAuthorship(el, ctx, authorship);

  out.subsections = children(el, "component")
    .map((comp) => child(comp, "section"))
    .filter((s): s is Element => s !== undefined)
    .map((s) => buildSection(s, ctx, authorship));

  return out;
}

/**
 * The author reading for each of a section's top-level entry acts, in document
 * order.
 *
 * **A "top-level entry act" is this package's existing notion of one**: the
 * clinical statement {@link anyEntryAct} resolves inside a direct `<entry>`
 * child of the section, which is the same unit `SECTION_PLACEMENT_SUSPECT` and
 * `SUBJECT_CONTEXT_OVERRIDE` are already scoped to. An `<entry>` holding no such
 * statement contributes no reading, so the list runs over the section's entry
 * acts rather than over its `<entry>` elements; a statement NESTED inside one
 * (an `entryRelationship` target) gets no reading of its own, because the
 * top-level act is the unit and nothing smaller.
 *
 * **An entry an overriding `<subject>` declaration governs contributes nothing
 * here, not even its `<id>`s.** This is a record-target read path: it answers
 * "who authored this patient's entry", so a governed entry appearing in it would
 * put another person's entry back on the model through a second door, which is
 * exactly what the whole-entry withholding rule exists to stop. The governance
 * test is the same one `readableEntries` partitions on, called directly so that
 * NO warning is emitted from here: `SUBJECT_CONTEXT_OVERRIDE` belongs to the
 * entry-extraction walk that already reports it, once per section, and framing a
 * section must not move where a safety-critical warning is raised.
 *
 * **The act's `<id>`s are read here through {@link readIds}, which emits
 * nothing.** They are wanted as a join key, and the entry-extraction walk parses
 * the same elements: parsing them a second time reports one deviation twice,
 * reports one on an act no extractor family claims where nothing reported it
 * before (which under `strict: true` throws on a document that parsed), and
 * moves where an existing one lands in `warnings[]`. Framing a section changes
 * no document's warning output.
 *
 * @internal
 */
function readEntryAuthorship(
  sectionEl: Element,
  ctx: ParseCtx,
  sectionAuthorship: CcdaAuthorship | undefined,
): readonly CcdaEntryAuthorship[] {
  const sectionGoverned = sectionUnderSubjectDeclaration(sectionEl);
  const out: CcdaEntryAuthorship[] = [];
  for (const entry of childEntries(sectionEl)) {
    if (entryGoverned(entry, sectionGoverned)) continue;
    const act = anyEntryAct(entry);
    if (act === undefined) continue;
    const authorship = readAuthorship(act, ctx, sectionAuthorship);
    const reading: { ids: readonly II[]; authorship?: CcdaAuthorship } = {
      ids: readIds(act),
    };
    if (authorship !== undefined) reading.authorship = authorship;
    out.push(reading);
  }
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
    // `sectionCode` is echoed only when it has the shape of a LOINC part number.
    // `UNKNOWN_SECTION_CODE` fires precisely when the code is unrecognized, so
    // membership would always withhold here and a sender's arbitrary `@code`
    // would otherwise reach the position object verbatim.
    //
    // `templateId` names the section's first rooted `<templateId>` in document
    // order, when it has one. Both codes below fire only after root matching
    // failed, so that root is the vendor/legacy stamp a profile author would
    // key a tolerance on. Bounded on the v3 UID shape for the same reason the
    // LOINC code is bounded on its own: it is a consumer-controlled `II.root`.
    const templateRoot = templateIds.find((t) => t.root !== undefined)?.root;
    const pos: CcdaPosition = {
      ...positionOf(el),
      sectionCode: safeDerivedToken(loinc, "loinc"),
      ...(templateRoot === undefined ? {} : { templateId: safeDerivedToken(templateRoot, "uid") }),
    };
    if (info !== undefined) {
      ctx.emit(sectionMatchedByLoincFallback(pos));
      return { info, by: "loinc" };
    }
    ctx.emit(unknownSectionCode(pos));
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
