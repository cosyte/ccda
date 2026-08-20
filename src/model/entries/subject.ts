/**
 * Subject-context override: whose data an entry is about, and the read-side
 * withholding that answer forces.
 *
 * CDA R2 gives `Section.subject` cardinality `0..1`, defined as the "Primary
 * target of the entries recorded in a section", and C-CDA admits the same
 * override on a clinical statement, with contextual information trickling down
 * from outer to nested contexts and overridable at each level. So a conformant
 * document may carry a relative's, a donor's or a contact's clinical statement
 * inside the patient's document. Every read path this package documents as the
 * record target's own data must therefore withhold such an entry rather than
 * hand it back as the patient's, which is what this module decides.
 *
 * Four rules, and they are the contract:
 *
 * 1. **Presence is the trigger.** A `<subject>` declaration is an override
 *    whatever it names. Nothing here compares a declared subject with the
 *    document's record target, and nothing resolves one to the patient: that
 *    would make the answer depend on vendor identifier hygiene and is the guess
 *    the fail-safe rule forbids. An empty declaration, a `nullFlavor`-only one,
 *    a repeated one and one that restates the patient are all overrides.
 * 2. **The nearest enclosing declaration wins.** A statement's own declaration,
 *    else the innermost enclosing statement's, else the innermost enclosing
 *    section's. A section nested inside a declaring section inherits that
 *    declaration unless it declares its own, and governance is resolved from the
 *    element's ANCESTORS, so a subsection handed straight to an extractor learns
 *    of its parent section's declaration exactly as the whole-document walk does.
 * 3. **The top-level `<entry>` is the unit**, for withholding and for counting.
 *    A declaration anywhere inside an entry withholds that whole entry: a Problem
 *    Concern Act returned one observation short, silently, is the confidently
 *    wrong clinical answer this exists to prevent. Nothing smaller is ever
 *    withheld and nothing smaller ever gets a warning of its own.
 * 4. **A Family History Organizer's own subject slot is never an override.** It
 *    is that template's defined mechanism for naming the relative, WHATEVER the
 *    slot contains, so it draws no warning and it re-overrides an enclosing
 *    section declaration for the statements beneath it. The family-history read
 *    path never withholds its CONTENT and is not routed through the entry filter
 *    at all. **The carve-out is read-side, so it reaches exactly the element the
 *    family-history read path reads and nothing else**: the organizer
 *    {@link entryAct} selects for `FAMILY_HISTORY_ORGANIZER` on that top-level
 *    entry, and only while no record-target read path returns that same element
 *    ({@link RECORD_TARGET_ENTRY_ROOTS}). A `templateId` is one element and C-CDA
 *    entries carry several, so a Result Organizer or a Problem Concern Act
 *    stamped with the family-history root is still returned by `results` /
 *    `getProblems()` and friends: it is governed, withheld and reported like any
 *    other, because the carve-out's whole premise is that nothing is attributed
 *    to the record target either way. A declaration nested deeper inside the
 *    entry is never the organizer's own slot and is never carved out.
 *
 * **Withholding is read-side only.** The parsed document keeps its source
 * snapshot, so `serializeCcda` / `doc.toString()` reproduce a withheld entry
 * byte for byte, and section narrative is untouched: this module never looks at
 * `<text>`.
 *
 * @internal
 */

import { attr, child, childElements, positionOf } from "../dom.js";
import { V3_NS } from "../../parser/namespaces.js";
import { safeDerivedToken } from "../../parser/tokens.js";
import type { CcdaPosition } from "../../parser/types.js";
import { subjectContextOverride } from "../../parser/warnings.js";
import type { ParseCtx } from "../types/_shared.js";
import {
  FAMILY_HISTORY_ORGANIZER,
  RECORD_TARGET_ENTRY_ROOTS,
  childEntries,
  entryAct,
  templateRoots,
} from "./shared.js";
import type { Element, Node } from "@xmldom/xmldom";

/** Element node type per the DOM spec (`Node.ELEMENT_NODE`). @internal */
const ELEMENT_NODE = 1 as const;

/**
 * The CDA R2 clinical-statement elements: the acts a `<subject>` participation
 * attaches to, and the things a governed entry is governed BY WAY OF. An
 * `<entry>` carrying a declaration but holding no statement at all governs
 * nothing, which is why the test is on these names rather than on the wrapper.
 *
 * @internal
 */
const CLINICAL_STATEMENT_NAMES: ReadonlySet<string> = new Set([
  "act",
  "encounter",
  "observation",
  "observationMedia",
  "organizer",
  "procedure",
  "regionOfInterest",
  "substanceAdministration",
  "supply",
]);

/**
 * The sections whose governed entries have already been reported, per parse
 * context. The aggregate walk runs EVERY family's extractor over EVERY section,
 * so an unmemoized emit would produce one instance per family per governed entry
 * (fourteen times the count the contract fixes) for a single parse. The unit of
 * de-duplication is the (context, section) pair rather than the message text: a
 * locus key would collapse two entries whose XML locator is absent, and the
 * element identity never can.
 *
 * A directly invoked extractor still reports in full, because a caller who
 * builds a fresh context has been told nothing yet. Two direct calls sharing one
 * context see the section's warnings once, which is the same rule the walk
 * relies on and is what "delivered through the caller-supplied observation
 * channel" means here.
 *
 * @internal
 */
const REPORTED_SECTIONS = new WeakMap<ParseCtx, WeakSet<Element>>();

/** True when an element carries a direct `<subject>` child (v3 namespace). @internal */
function declaresSubject(el: Element): boolean {
  return child(el, "subject") !== undefined;
}

/**
 * The one element inside a top-level `<entry>` whose own `<subject>` slot is NOT
 * an overriding declaration: the Family History Organizer, as the family-history
 * read path itself reads it. `undefined` when the entry has none, which is the
 * ordinary case, and then every declaration inside the entry is an override.
 *
 * **Two conditions, and both are the carve-out's own premise rather than extra
 * caution.** It is {@link entryAct}`(entry, FAMILY_HISTORY_ORGANIZER)`, the exact
 * call `extractFamilyHistory` makes, so the exemption reaches the element that
 * path returns and, by identity, nothing nested deeper inside the entry. And the
 * element must carry no {@link RECORD_TARGET_ENTRY_ROOTS} root: the contract
 * exempts the slot because "no record-target read path returns that organizer",
 * and an entry stamped with the family-history root beside a Result Organizer's
 * or a Problem Concern Act's is one they do return. A `templateId` is one element
 * and C-CDA entries carry several, so this shape is ordinary markup rather than a
 * curiosity, and a single stamp must not be able to switch the rule off for an
 * entry a record-target read path hands back as the patient's own.
 *
 * The family-history read path is unaffected either way: it never consults this
 * module for its contents, so a stamped entry is still returned there exactly as
 * it was before this rule existed.
 *
 * @internal
 */
function carveOutOrganizer(entry: Element): Element | undefined {
  const organizer = entryAct(entry, FAMILY_HISTORY_ORGANIZER);
  if (organizer === undefined) return undefined;
  const claimed = templateRoots(organizer).some((root) => RECORD_TARGET_ENTRY_ROOTS.has(root));
  return claimed ? undefined : organizer;
}

/** True when an element is a CDA R2 clinical statement. @internal */
function isClinicalStatement(el: Element): boolean {
  const name = el.localName;
  return (
    el.namespaceURI === V3_NS && typeof name === "string" && CLINICAL_STATEMENT_NAMES.has(name)
  );
}

/**
 * True when any clinical statement inside `el` is governed by an overriding
 * subject, given the governance `inherited` from its enclosing context.
 * `carveOut` is the one element of this entry whose own declaration is not an
 * override (see {@link carveOutOrganizer}), matched by IDENTITY, so no stamp on
 * any other element can claim the exemption.
 *
 * The `<subject>` participation itself is never descended into: what is inside
 * it (a `relatedSubject`, and the `<subject>` naming the person within THAT) is
 * the declaration's content, not further governed content.
 *
 * @internal
 */
function governedStatementInside(
  el: Element,
  inherited: boolean,
  carveOut: Element | undefined,
): boolean {
  for (const kid of childElements(el)) {
    if (kid.namespaceURI === V3_NS && kid.localName === "subject") continue;
    const scope = declaresSubject(kid) ? kid !== carveOut : inherited;
    if (scope && isClinicalStatement(kid)) return true;
    if (governedStatementInside(kid, scope, carveOut)) return true;
  }
  return false;
}

/**
 * True when a top-level `<entry>` is governed: its own statement is governed, or
 * any statement nested inside it is. `sectionGoverned` is the governance the
 * enclosing section conducts to it.
 *
 * A declaration on the `<entry>` wrapper itself is always an override: the
 * carve-out belongs to the organizer the family-history read path reads, which is
 * a child of the wrapper and never the wrapper.
 *
 * @internal
 */
export function entryGoverned(entry: Element, sectionGoverned: boolean): boolean {
  const carveOut = carveOutOrganizer(entry);
  const scope = declaresSubject(entry) ? true : sectionGoverned;
  return governedStatementInside(entry, scope, carveOut);
}

/**
 * True when a `<section>` element is under an overriding subject declaration:
 * its own, or the nearest one on an enclosing section. Resolved from the DOM
 * ancestors, which is what makes a nested subsection passed DIRECTLY to an
 * extractor withhold exactly as the whole-document walk makes it withhold. A
 * section declaration is always an override (only a Family History Organizer's
 * own slot is exempt, and that is a statement, never a section).
 *
 * @internal
 */
export function sectionUnderSubjectDeclaration(sectionEl: Element): boolean {
  let el: Element | undefined = sectionEl;
  while (el !== undefined) {
    if (el.namespaceURI === V3_NS && el.localName === "section" && declaresSubject(el)) return true;
    const parent: Node | null = el.parentNode;
    el = parent !== null && parent.nodeType === ELEMENT_NODE ? (parent as Element) : undefined;
  }
  return false;
}

/** The nested `<component><section>` children of a section, in document order. @internal */
function subsectionsOf(sectionEl: Element): readonly Element[] {
  const out: Element[] = [];
  for (const comp of childElements(sectionEl)) {
    if (comp.namespaceURI !== V3_NS || comp.localName !== "component") continue;
    const nested = child(comp, "section");
    if (nested !== undefined) out.push(nested);
  }
  return out;
}

/**
 * True when a section under a declaration governs at least one top-level entry,
 * here or in any section nested inside it. This is the test the section-level
 * report turns on: a declaring section reports its own locus only when it
 * governs NO entry anywhere beneath it, so a document whose declaring section
 * holds its entries one subsection down produces the entry-level warnings and no
 * extra section-level one.
 *
 * @internal
 */
function governsAnyEntry(sectionEl: Element): boolean {
  for (const entry of childEntries(sectionEl)) {
    if (entryGoverned(entry, true)) return true;
  }
  for (const sub of subsectionsOf(sectionEl)) {
    if (governsAnyEntry(sub)) return true;
  }
  return false;
}

/**
 * The section's own LOINC `<code>`, bounded on the LOINC part-number shape, or
 * `undefined` when the section carries no code. Read off the attribute rather
 * than through `parseCd` so the locus costs no second datatype warning.
 *
 * @internal
 */
function sectionCodeOf(sectionEl: Element): string | undefined {
  const codeEl = child(sectionEl, "code");
  if (codeEl === undefined) return undefined;
  const code = attr(codeEl, "code");
  return code === undefined ? undefined : safeDerivedToken(code, "loinc");
}

/** A bounded structural locus: the element's own position plus its section's code. @internal */
function locusOf(el: Element, sectionCode: string | undefined): CcdaPosition {
  return sectionCode === undefined ? positionOf(el) : { ...positionOf(el), sectionCode };
}

/**
 * The element a governed top-level entry is reported AT: the clinical statement
 * the entry holds, in document order, falling back to the `<entry>` wrapper for
 * an entry that holds none (which is never governed, so the fallback is a
 * belt-and-braces default rather than a live path).
 *
 * The statement rather than the wrapper, deliberately, and it is the same choice
 * `SECTION_PLACEMENT_SUSPECT` already makes: the report is about the Problem
 * Concern Act (or Medication Activity, or organizer) the reader was expecting
 * back, and it names that act and never a statement nested inside it, however
 * deep the declaration that governed the entry sat.
 *
 * @internal
 */
function entryLocusElement(entry: Element): Element {
  for (const kid of childElements(entry)) {
    if (isClinicalStatement(kid)) return kid;
  }
  return entry;
}

/**
 * Report a section's subject-context overrides, at most once per section per
 * parse context. Exactly N instances for a section governing N top-level
 * entries, in document order, one per entry and each naming that entry's own
 * locus; exactly one instance at the section's own locus for a declaring section
 * that governs no entry anywhere beneath it; nothing otherwise. A document's
 * total is the sum over its sections, with no document-wide suppression.
 *
 * @internal
 */
function reportOnce(sectionEl: Element, governed: readonly Element[], ctx: ParseCtx): void {
  let reported = REPORTED_SECTIONS.get(ctx);
  if (reported === undefined) {
    reported = new WeakSet<Element>();
    REPORTED_SECTIONS.set(ctx, reported);
  }
  if (reported.has(sectionEl)) return;
  reported.add(sectionEl);

  const sectionCode = sectionCodeOf(sectionEl);
  if (governed.length > 0) {
    for (const entry of governed)
      ctx.emit(subjectContextOverride(locusOf(entryLocusElement(entry), sectionCode), "entry"));
    return;
  }
  if (!declaresSubject(sectionEl)) return;
  for (const sub of subsectionsOf(sectionEl)) {
    if (governsAnyEntry(sub)) return;
  }
  ctx.emit(subjectContextOverride(locusOf(sectionEl, sectionCode), "section"));
}

/**
 * The top-level `<entry>` children of a section that a record-target read path
 * may read: every direct entry the section carries, minus the ones an overriding
 * subject declaration governs. The withheld ones are reported through `ctx` on
 * the arithmetic above.
 *
 * **This is the choke point.** Every extractor whose family is the record
 * target's own data reads its entries through here instead of `childEntries`, so
 * the parsed document's fields and accessors, the aggregate result's slots and a
 * directly invoked per-family extraction all withhold identically and no public
 * read path is a bypass around the others. The family-history extractor
 * deliberately does NOT: its contract is a relative's data, and all four of its
 * faces return what they returned before this rule existed.
 *
 * (No `@example` import: this helper is not on the package entry point.)
 *
 * @example
 * ```ts
 * for (const entry of readableEntries(sectionEl, ctx)) { ... }
 * ```
 *
 * @internal
 */
export function readableEntries(sectionEl: Element, ctx: ParseCtx): readonly Element[] {
  const { readable, governed } = partitionEntries(sectionEl);
  reportOnce(sectionEl, governed, ctx);
  return readable;
}

/**
 * Report a section's subject-context overrides WITHOUT withholding anything: the
 * warning half of {@link readableEntries} on its own, under the identical
 * arithmetic and the identical per-(context, section) memoization.
 *
 * The family-history read path calls this. Its contents are carved out (it
 * returns what it returned before this rule existed, in every document shape),
 * but the report is not part of that carve-out: a Family History section that
 * declares somebody else's subject still declares it, and a consumer whose only
 * call is `extractFamilyHistory(sectionEl, ..., ctx)` would otherwise be the one
 * caller in the package told nothing at all. On a whole-document parse the
 * memoization makes this a no-op, because the record-target extractors reached
 * the section first, so a document's totals are exactly what they were.
 *
 * (No `@example` import: this helper is not on the package entry point.)
 *
 * @example
 * ```ts
 * reportSubjectOverrides(sectionEl, ctx);
 * ```
 *
 * @internal
 */
export function reportSubjectOverrides(sectionEl: Element, ctx: ParseCtx): void {
  reportOnce(sectionEl, partitionEntries(sectionEl).governed, ctx);
}

/**
 * Split a section's top-level entries into the ones a record-target read path may
 * read and the ones an overriding subject declaration governs, in document order.
 *
 * @internal
 */
function partitionEntries(sectionEl: Element): {
  readonly readable: readonly Element[];
  readonly governed: readonly Element[];
} {
  const sectionGoverned = sectionUnderSubjectDeclaration(sectionEl);
  const readable: Element[] = [];
  const governed: Element[] = [];
  for (const entry of childEntries(sectionEl)) {
    if (entryGoverned(entry, sectionGoverned)) governed.push(entry);
    else readable.push(entry);
  }
  return { readable, governed };
}
