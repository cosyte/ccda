/**
 * `editCcda`, the read→edit→write loop for `@cosyte/ccda`, the third emit-side
 * primitive alongside `parseCcda` (read) and `buildCcda` (construct). It takes a
 * document already produced by {@link parseCcda} and re-emits it with a section
 * **added** or **replaced**, then returns the re-parsed {@link CcdaDocument},
 * so `parseCcda(editCcda(parseCcda(xml), …).toString())` round-trips.
 *
 * **Byte-faithful on the untouched sections.** The edit is made on the document
 * the parser actually read (recovered from the serialized snapshot every parsed
 * document retains), not by reconstructing XML from the lossy read-model: on its
 * text, spliced where each changed element stands, when that text is in the form
 * the writer gives it (nearly always), and as DOM surgery otherwise, with the
 * same XML either way. Every section, entry, attribute, namespace declaration,
 * and even content this library never models survives an edit verbatim, only
 * the one section the caller targeted is rebuilt. The
 * replacement section is emitted through the **same per-section emitters
 * `buildCcda` uses** ({@link buildSectionComponent}), so it carries the identical
 * templateIds, LOINC code, SHALL `effectiveTime`, and narrative/entry agreement
 * a freshly-built section would, and re-parses with zero new warnings.
 *
 * **One emit-time diagnostic, over what the edit actually wrote.** A grafted
 * Plan of Treatment can carry a Planned Medication Activity short the
 * `effectiveTime` its template SHALLs (`…22.4.42`, CONF:1098-30468), because that
 * field is optional on a published input type. The returned document reports it
 * (`MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME`), appended after the re-parse's
 * warnings, and the emitted XML is unchanged: no date is invented and no
 * `nullFlavor` is written in its place. It is read off the **surviving** grafted
 * components, so an edit whose offending content a later edit in the same call
 * discarded says nothing, and an untouched section the source brought with it is
 * never re-reported.
 *
 * **Fail-safe.** An edit never silently drops or corrupts an unedited section
 * (they are carried by reference), never fabricates a clinical value (an empty
 * content list yields that section's spec-clean `nullFlavor="NI"` shell, never
 * invented entries), and never produces a document that newly violates a
 * per-document-type SHALL required-section rule, such an edit throws a typed
 * {@link CcdaEditError} instead of emitting an invalid document. The rule set
 * is the one the source was parsed under, read off its `templateIds` the way
 * the parse reads them, so an R1.1-origin document is edited under the reduced
 * set and a document stamped for an unmodelled release is not evaluated. Every builder
 * guard the section emitter enforces (a resolved-without-resolution
 * contradiction, an invalid HL7 timestamp) still throws.
 *
 * **Revision provenance (CDA R2).** By default an edit produces a *revision*:
 * the document gets a new `ClinicalDocument.id`, keeps (or, if absent, mints)
 * the `setId` that identifies the version series, increments `versionNumber`,
 * and adds a `relatedDocument typeCode="RPLC"` naming the prior version in its
 * `parentDocument` (with the **same** `setId` and the prior `versionNumber`),
 * the replacement relationship defined by CDA R2 and shown in the HL7
 * C-CDA-Examples "Parent Document Replace Relationship" sample. Pass
 * `revision: false` to edit in place without stamping a new version.
 *
 * **A minted `setId` is labelled as synthetic** (`SYNTHETIC-SETID-…` under a
 * synthetic assigning-authority root), so a receiving system can tell an
 * invented version series from one a source system asserted;
 * {@link isSyntheticSetId} is the check and {@link SYNTHETIC_SETID_PREFIX}
 * documents the scheme. **Nothing forces a receiver to read the label**, which
 * is stated there rather than papered over: a label makes the fabrication
 * visible, it does not make the identifier true.
 *
 * @packageDocumentation
 */

import { channel } from "node:diagnostics_channel";

import {
  buildSectionComponent,
  EDITABLE_SECTIONS,
  plannedMedicationDiagnostics,
} from "../builder/build-ccda.js";
import type { EditableSectionKind, SectionInput } from "../builder/build-ccda.js";
import { el } from "../builder/dom.js";
import { LOINC } from "../model/code-systems.js";
import {
  isCcdaDocument,
  markWritten,
  readDocumentTemplate,
  writtenXml,
  type CcdaDocument,
} from "../model/document.js";
import { attr, child, childElements, children } from "../model/dom.js";
import type { TerminologyAdapter } from "../model/terminology.js";
import type { II } from "../model/types/ii.js";
import { parseCcdaText } from "../parser/index.js";
import {
  missingRequiredSections,
  type RequiredSectionOptions,
} from "../parser/required-sections.js";
import {
  acceptSource,
  DEFAULT_LIMITS,
  parseSecureDom,
  parseSecureEditable,
} from "../parser/secure-xml.js";
import { sectionForLoinc, sectionForTemplateRoot, type DocumentType } from "../parser/templates.js";
import type { CcdaWarning } from "../parser/warnings.js";
import { serializeDocument } from "../serialize/serialize-dom.js";
import { DomSurface, type EditSurface } from "./surface.js";
import { readText } from "./text-read.js";
import { TextSurface } from "./text-surface.js";
import type { Document, Element } from "@xmldom/xmldom";

/** A synthetic (non-real) assigning-authority OID for editor-generated ids. @internal */
const SYNTH_ROOT = "2.16.840.1.113883.19.5.99999";

/**
 * The `@extension` prefix every `setId` {@link editCcda} **mints** carries, so a
 * minted version-series identifier is recognisable as one on sight and in code.
 *
 * A minted `setId` looks like `SYNTHETIC-SETID-e1` under the synthetic
 * assigning-authority root `2.16.840.1.113883.19.5.99999` (an OID in HL7's own
 * example arc, which is not an organisation's real namespace). Together those
 * two are the whole scheme; {@link isSyntheticSetId} is the check.
 *
 * **A `setId` the source already carried, or one the caller supplied through
 * `revision.setId`, is never relabelled.** The prefix marks what this library
 * invented, and only that.
 *
 * **The residual, stated rather than implied: nothing forces a receiving system
 * to read the label.** A receiver that ignores both the prefix and the root will
 * treat a minted `setId` exactly as it treats a real one, and this library
 * cannot make it do otherwise. Making it obvious is the whole of what a label
 * can do; it does not make the identifier true. The alternative considered and
 * rejected was to stop minting, which would emit a replacement whose `setId`
 * does not match its own `parentDocument`'s, and CDA R2 requires that it does.
 *
 * @example
 * ```ts
 * import { SYNTHETIC_SETID_PREFIX } from "@cosyte/ccda";
 * console.log(SYNTHETIC_SETID_PREFIX); // "SYNTHETIC-SETID"
 * ```
 */
export const SYNTHETIC_SETID_PREFIX = "SYNTHETIC-SETID";

/**
 * Whether a `setId` was **minted by {@link editCcda}** rather than carried by
 * the source document or supplied by the caller. True only when the identifier
 * matches the whole documented scheme: the synthetic assigning-authority root
 * *and* an `@extension` beginning {@link SYNTHETIC_SETID_PREFIX}. Both, because
 * either alone is something a real document could carry by coincidence.
 *
 * **A `false` is not a promise that the identifier is real.** It says only that
 * this library did not mint it under this scheme: a `setId` minted by some other
 * tool, or by a version of this library before the scheme existed
 * (`setid-e1`, unprefixed), reads `false` here. Use it to recognise a synthetic
 * id, never to certify a real one.
 *
 * @param setId - The `setId` to test, e.g. `doc.header.setId`. `undefined` is
 *   `false` (a document with no `setId` has nothing to recognise).
 * @returns `true` when the identifier matches the minted scheme.
 * @example
 * ```ts
 * import { parseCcda, isSyntheticSetId } from "@cosyte/ccda";
 * const doc = parseCcda(xml);
 * if (isSyntheticSetId(doc.header.setId)) {
 *   // the version series was invented by an editor, not asserted by a source system
 * }
 * ```
 */
export function isSyntheticSetId(setId: II | undefined): boolean {
  return (
    setId?.root === SYNTH_ROOT &&
    (setId.extension?.startsWith(`${SYNTHETIC_SETID_PREFIX}-`) ?? false)
  );
}

/**
 * The `ClinicalDocument` child elements that, per the CDA R2 XSD sequence
 * (`POCD_MT000040.ClinicalDocument`), follow `versionNumber`. Inserting `setId`
 * and `versionNumber` immediately before the first of these present in the
 * document lands them at their XSD slot (after `languageCode`) regardless of
 * which optional participations the document carries, a document missing
 * `recordTarget` (or carrying `copyTime`) is still ordered correctly. `component`
 * is mandatory, so at least one anchor is always present. @internal
 */
const AFTER_VERSION_NUMBER: readonly string[] = [
  "copyTime",
  "recordTarget",
  "author",
  "dataEnterer",
  "informant",
  "custodian",
  "informationRecipient",
  "legalAuthenticator",
  "authenticator",
  "participant",
  "inFulfillmentOf",
  "documentationOf",
  "relatedDocument",
  "authorization",
  "componentOf",
  "component",
];

/** The `ClinicalDocument` child elements that follow `relatedDocument` in the XSD sequence. @internal */
const AFTER_RELATED_DOCUMENT: readonly string[] = ["authorization", "componentOf", "component"];

/**
 * How a {@link SectionEdit} reconciles with the section already in the document:
 * `"add"` requires the section be **absent** (else {@link CcdaEditError}
 * `SECTION_ALREADY_PRESENT`), `"replace"` requires it be **present** (else
 * `SECTION_ABSENT`), and `"upsert"` (the default) replaces it when present and
 * adds it when absent.
 *
 * @example
 * ```ts
 * import type { SectionEditMode } from "@cosyte/ccda";
 * const mode: SectionEditMode = "add";
 * ```
 */
export type SectionEditMode = "add" | "replace" | "upsert";

/**
 * One section add/replace operation: a {@link SectionInput} (the section `kind`
 * plus its typed builder `content`) with an optional {@link SectionEditMode}
 * (default `"upsert"`). The union is discriminated on `kind`, so `content` is
 * typed to exactly that section's `BuildCcda*` shape.
 *
 * @example
 * ```ts
 * import type { SectionEdit } from "@cosyte/ccda";
 * const addAProblem: SectionEdit = {
 *   kind: "problems",
 *   mode: "replace",
 *   content: [{ problem: { code: "38341003", displayName: "Hypertension" }, status: "active" }],
 * };
 * ```
 */
export type SectionEdit = SectionInput & { readonly mode?: SectionEditMode };

/**
 * A CDA R2 instance identifier (`root` OID with an optional `extension`) for a
 * caller-supplied document `id` or `setId` in a {@link RevisionInit}.
 *
 * @example
 * ```ts
 * import type { DocumentIdInit } from "@cosyte/ccda";
 * const id: DocumentIdInit = { root: "2.16.840.1.113883.19.5", extension: "DOC-2" };
 * ```
 */
export interface DocumentIdInit {
  readonly root: string;
  readonly extension?: string;
}

/**
 * Overrides for the CDA R2 revision an edit stamps. All fields are optional:
 * omit `documentId` to mint a fresh id, omit `setId` to keep the source's
 * version-series id (or mint a **labelled synthetic** one when the source has
 * none, see {@link SYNTHETIC_SETID_PREFIX}; a `setId` supplied here is the
 * caller's assertion and is never relabelled), and omit
 * `versionNumber` to increment the prior version by one. Pass `revision: false`
 * on {@link EditCcdaOptions} instead of a `RevisionInit` to skip revision
 * stamping entirely.
 *
 * @example
 * ```ts
 * import type { RevisionInit } from "@cosyte/ccda";
 * const rev: RevisionInit = { versionNumber: 5 };
 * ```
 */
export interface RevisionInit {
  readonly documentId?: DocumentIdInit;
  readonly setId?: DocumentIdInit;
  readonly versionNumber?: number;
}

/**
 * Options for {@link editCcda}: the ordered list of section edits to apply, and
 * the revision behavior. `revision` defaults to an automatic `RPLC` revision;
 * pass a {@link RevisionInit} to override its ids/version, or `false` to edit in
 * place without stamping a new document version.
 *
 * @example
 * ```ts
 * import type { EditCcdaOptions } from "@cosyte/ccda";
 * const opts: EditCcdaOptions = {
 *   sections: [{ kind: "medications", content: [] }],
 *   revision: false,
 * };
 * ```
 */
export interface EditCcdaOptions {
  readonly sections?: readonly SectionEdit[];
  readonly revision?: RevisionInit | false;
  /**
   * An optional consumer-supplied bring-your-own {@link TerminologyAdapter},
   * forwarded to the final re-parse of the edited document so it surfaces
   * `SEMANTIC_CODE_INVALID` for any coded value the adapter rejects, the same
   * semantic-validation tier `parseCcda` and `buildCcda` already offer, now
   * reaching the edited output. `editCcda` never coerces a code to satisfy the
   * adapter (it emits every value verbatim, byte-faithful on untouched sections
   * and spec-clean on the one it rebuilds); the adapter can only ever add a flag.
   * Omit for the default recognize-only behavior. `@cosyte/ccda` never imports a
   * terminology library; you supply the adapter.
   */
  readonly terminology?: TerminologyAdapter;
}

/**
 * Stable string codes for every failure {@link editCcda} raises. Consumers
 * narrow on `err.code`.
 *
 * @example
 * ```ts
 * import type { CcdaEditErrorCode } from "@cosyte/ccda";
 * const code: CcdaEditErrorCode = "REQUIRED_SECTION_MISSING";
 * ```
 */
export type CcdaEditErrorCode =
  | "NO_SOURCE_DOCUMENT"
  | "NO_STRUCTURED_BODY"
  | "SECTION_ALREADY_PRESENT"
  | "SECTION_ABSENT"
  | "REQUIRED_SECTION_MISSING"
  | "SOURCE_MISSING_ID";

/**
 * The typed error {@link editCcda} throws when an edit cannot be applied safely
 *, a hand-constructed source with no XML to edit, a structured-body-less
 * document, an add/replace precondition violation, an edit that would drop a
 * per-document-type SHALL required section, or a revision of a source whose
 * `ClinicalDocument.id` is absent or marked `nullFlavor` (the RPLC link has no
 * prior version it can truthfully name). Consumers narrow via `code`.
 *
 * @example
 * ```ts
 * import { editCcda, CcdaEditError } from "@cosyte/ccda";
 * try {
 *   editCcda(doc, { sections: [{ kind: "problems", mode: "add", content: [] }] });
 * } catch (err) {
 *   if (err instanceof CcdaEditError && err.code === "SECTION_ALREADY_PRESENT") {
 *     // the document already has a Problems section, use "replace" or "upsert"
 *   }
 * }
 * ```
 */
export class CcdaEditError extends Error {
  /** The stable {@link CcdaEditErrorCode} discriminant. */
  public readonly code: CcdaEditErrorCode;

  /**
   * Construct a new `CcdaEditError`.
   *
   * @param code - The stable failure code.
   * @param message - A human-readable, PHI-free explanation.
   * @internal
   */
  public constructor(code: CcdaEditErrorCode, message: string) {
    super(message);
    this.name = "CcdaEditError";
    this.code = code;
  }
}

/**
 * Re-emit a parsed C-CDA document with sections added or replaced, preserving
 * every unedited section byte-faithfully and (by default) stamping a CDA R2
 * revision that supersedes the source. See the module overview for the full
 * contract.
 *
 * @param source - A document produced by {@link parseCcda} or `buildCcda`
 *   (it must retain its source XML: a hand-constructed document, or a value that
 *   is not a `CcdaDocument` at all, throws `NO_SOURCE_DOCUMENT`).
 * @param options - The section edits to apply, the revision behavior, and an
 *   optional bring-your-own `terminology` adapter forwarded to the final re-parse
 *   so the edited document flags adapter-rejected codes (`SEMANTIC_CODE_INVALID`).
 * @returns A new {@link CcdaDocument}, the re-parse of the edited XML, plus any
 *   emit-time diagnostic about what this call grafted (today only
 *   `MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME`, appended last). The `source` is
 *   never mutated.
 * @throws {@link CcdaEditError} when the source is not a `CcdaDocument` or has
 *   no retained XML, has no
 *   `structuredBody` to edit, violates an add/replace precondition, would drop a
 *   SHALL required section, or (when stamping a revision) has no usable
 *   `ClinicalDocument.id` for the RPLC link to name, absent or `nullFlavor`-marked
 *   (`SOURCE_MISSING_ID`).
 * @throws {TypeError} when a section's content violates a builder guard (an
 *   invalid timestamp, a resolved problem without a resolution date, …).
 * @example
 * ```ts
 * import { parseCcda, editCcda } from "@cosyte/ccda";
 * const doc = parseCcda(xml);
 * const revised = editCcda(doc, {
 *   sections: [
 *     {
 *       kind: "problems",
 *       content: [{ problem: { code: "38341003", displayName: "Hypertension" }, status: "active" }],
 *     },
 *   ],
 * });
 * console.log(revised.header.versionNumber); // incremented from the source
 * ```
 */
export function editCcda(source: CcdaDocument, options: EditCcdaOptions = {}): CcdaDocument {
  const { xml, diagnostics } = writeEdit(source, options);

  // Re-parse the edited XML into the returned document. When the caller supplied
  // a terminology adapter, forward it so the edited document reaches the same
  // semantic-validation tier `parseCcda`/`buildCcda` offer, surfacing
  // `SEMANTIC_CODE_INVALID` for any coded value the adapter rejects (in a grafted
  // section or an untouched one). The edit still emits every code **verbatim**; the
  // adapter can only ever add a flag, never coerce a value.
  //
  // The re-parse is what the returned document IS, not a check on it: its model,
  // its warnings and every warning's line and column are those of the XML the
  // edit wrote, which no reading of the edited tree (positioned on the source's
  // lines, the grafted nodes on none) could give back. The edited tree itself is
  // gone by now: `writeEdit` returns only the text, so the two trees are never
  // held at once.
  const parsed =
    options.terminology !== undefined
      ? parseCcdaText(xml, { terminology: options.terminology }, true)
      : parseCcdaText(xml, {}, true);

  // Appended after the parse warnings rather than interleaved, matching
  // `buildCcda`; `withWarnings` returns a new document rather than mutating.
  return diagnostics.length === 0 ? parsed : parsed.withWarnings(diagnostics);
}

/**
 * The diagnostics channel an edit reports the way it was made on: `{ path: "text" }` for an edit
 * made on the source's written text, `{ path: "dom" }` for one made on an `@xmldom/xmldom` DOM of
 * it. Published only while something subscribes (`node:diagnostics_channel`); the benchmarks read
 * it to show when an edit falls back to the DOM.
 *
 * @internal
 */
export const EDIT_PATH_CHANNEL = "cosyte:ccda:edit";

/** The channel itself, made once. @internal */
const editPath = channel(EDIT_PATH_CHANNEL);

/** Report the way an edit was made, to whatever subscribes. @internal */
function reportPath(path: "text" | "dom"): void {
  if (editPath.hasSubscribers) editPath.publish({ path });
}

/**
 * Perform the edit on the source's XML and return the XML it writes, with the emit-time
 * diagnostics read off what it grafted. Nothing it builds outlives it, so all of it can be
 * collected before {@link editCcda} parses the result.
 *
 * **On the text, where the text allows.** A source's XML is nearly always already written in the
 * form the writer gives it (`TreeDocument.writtenEnd`), and then the edit is made on that text
 * (`./text-surface.ts`): only the elements the edit looks at are read, each new node is written as
 * the same serializer writes it, and the text is spliced, with no tree and no `@xmldom/xmldom` DOM
 * of the document. The parse that made the document says whether its XML is written
 * (`writtenXml`); when it cannot, the XML is read whole once to find out. Any other text, and any
 * splice the surface cannot vouch for, is edited on a DOM as before. The XML is the same either
 * way; `onText: false` makes the edit on the DOM, for the tests that compare them.
 *
 * @internal
 */
export function writeEdit(
  source: CcdaDocument,
  options: EditCcdaOptions,
  onText = true,
): { readonly xml: string; readonly diagnostics: readonly CcdaWarning[] } {
  const xml = sourceXml(source);
  if (!onText) return editDom(parseSecureDom(xml, DEFAULT_LIMITS, ignore), source, options);
  const found = writtenSource(source, xml);
  if (found.dom !== undefined) return editDom(found.dom, source, options);
  const read = readText(found.text);
  if (read !== undefined) {
    const surface = new TextSurface(read, found.text, found.end);
    const diagnostics = editOn(surface, source, options);
    const written = surface.write();
    /* v8 ignore else -- TextSurface.write vouches for every text a parse writes (see its module comment); the DOM is the fallback it was built against */
    if (written !== undefined) {
      reportPath("text");
      return { xml: written, diagnostics };
    }
  }
  return editDom(parseSecureDom(xml, DEFAULT_LIMITS, ignore), source, options);
}

/** A warning sink that keeps nothing: the source's XML came from our own writer. @internal */
function ignore(): void {
  // Re-reading the retained (already-clean, already-safe) XML records no Tier-2 deviation, and a
  // Tier-3 fatal still throws.
}

/**
 * The source's XML, when it is written as the writer writes it, with where its last node ends,
 * after the gate and limits a read of it runs; else its DOM, for an edit on that. A document whose
 * parse found its XML written says so, and then only the gate runs again (its size and
 * references): the depth and node count held at that parse, on the same elements. Any other is
 * read whole once, with every limit, and remembered as written when it is.
 *
 * @internal
 */
function writtenSource(
  source: CcdaDocument,
  xml: string,
):
  | { readonly text: string; readonly end: number; readonly dom?: undefined }
  | { readonly dom: Document } {
  if (writtenXml(source) !== undefined) {
    acceptSource(xml, DEFAULT_LIMITS, ignore);
    return { text: xml, end: xml.length };
  }
  const read = parseSecureEditable(xml, DEFAULT_LIMITS, ignore);
  if (read.dom !== undefined) return { dom: read.dom };
  const end = read.tree.writtenEnd;
  if (read.text === xml && end === xml.length) markWritten(source);
  return { text: read.text, end };
}

/** The edit on a DOM of the source's XML, written by `serializeDocument`. @internal */
function editDom(
  dom: Document,
  source: CcdaDocument,
  options: EditCcdaOptions,
): { readonly xml: string; readonly diagnostics: readonly CcdaWarning[] } {
  const root = dom.documentElement;
  /* v8 ignore if -- a CcdaDocument retains only XML this package emitted, which always has a root element */
  if (root === null) {
    // Unreachable: sourceXml refuses anything that is not a CcdaDocument, a CcdaDocument retains the
    // XML its parse read (which had a root element), and parseSecureDom throws
    // NOT_WELL_FORMED_XML for XML with none in any case.
    throw new CcdaEditError("NO_SOURCE_DOCUMENT", "editCcda: source produced no document element.");
  }
  const diagnostics = editOn(new DomSurface(dom, root), source, options);
  reportPath("dom");
  return { xml: serializeDocument(dom), diagnostics };
}

/**
 * Apply the section edits and the revision through `surface`, and return the emit-time
 * diagnostics of what survived of the grafts.
 *
 * @internal
 */
function editOn(
  surface: EditSurface,
  source: CcdaDocument,
  options: EditCcdaOptions,
): readonly CcdaWarning[] {
  const edits = options.sections ?? [];
  // The SHALL required-section set is read under the stamp the source was PARSED
  // under, from the same templateIds by the same function, so an R1.1-origin
  // document is edited under the reduced set its parse used, and a document
  // stamped for an unmodelled release is not evaluated here either.
  const requiredOptions: RequiredSectionOptions = {
    stamp: readDocumentTemplate(source.templateIds).stamp,
  };
  const grafted =
    edits.length > 0 ? applySectionEdits(surface, edits, source.documentType, requiredOptions) : [];

  if (options.revision !== false) {
    stampRevision(surface, options.revision, uniqueIdGen(surface));
  }

  // The emit-time diagnostics, over the components this call GRAFTED that
  // SURVIVED into the emitted document. Both halves of that scope are load-bearing and
  // neither is an optimisation:
  //
  // - **Surviving, not supplied.** `options.sections` is an ORDERED list, and a
  //   later edit to the same section kind discards an earlier one's content. A
  //   check reading the list reports a SHALL violation against a document that
  //   carries the element, which is a warning misdescribing its own document.
  //   That was measured, refuted and reverted before this shape existed.
  // - **Grafted, not every section.** An untouched section is the SOURCE's
  //   content, carried by reference; re-reporting it would make an edit a
  //   validator of a document its caller did not write, and would fire on the
  //   same act again on every subsequent edit of an unrelated section.
  //
  // They are read here, before the re-parse rather than after it, because they
  // read only the grafted components (no position, no parse state), and reading
  // them here is what lets the edited document go before the re-parse builds its own.
  return plannedMedicationDiagnostics(grafted);
}

/**
 * Recover the source XML a parsed document retains, or throw `NO_SOURCE_DOCUMENT`. Anything that is
 * not a {@link CcdaDocument} is refused before it is read: its `toString` is not this package's, so
 * what it returns is not XML this package emitted (a plain object gives `"[object Object]"`). @internal
 */
function sourceXml(source: CcdaDocument): string {
  // Widened to `unknown`: the parameter is typed, so this guard exists for untyped (JS) callers.
  const value: unknown = source;
  if (!isCcdaDocument(value)) {
    throw new CcdaEditError(
      "NO_SOURCE_DOCUMENT",
      "editCcda: the source is not a CcdaDocument. Pass a document produced by parseCcda or " +
        "buildCcda.",
    );
  }
  try {
    return source.toString();
  } catch {
    throw new CcdaEditError(
      "NO_SOURCE_DOCUMENT",
      "editCcda: the source document retains no XML to edit. Only a document produced by " +
        "parseCcda can be edited; construct one with buildCcda or parse existing XML first.",
    );
  }
}

/**
 * Apply every section add/replace to the `structuredBody`, enforcing SHALL
 * safety, and return the grafted `<component>` elements that **survived** into
 * the final body.
 *
 * A component is dropped from the return when a later edit in the same call
 * replaced it, so the answer is a fact about the emitted DOM rather than about
 * the edit list. Survival is decided by walking the body's own children and
 * keeping the grafted nodes still found there, not by inspecting a removed
 * node's `parentNode`: the question is "is this in the document", and asking the
 * document is the reading that cannot be wrong about it. @internal
 */
function applySectionEdits(
  surface: EditSurface,
  edits: readonly SectionEdit[],
  documentType: DocumentType | undefined,
  requiredOptions: RequiredSectionOptions,
): readonly Element[] {
  const structuredBody = findStructuredBody(surface.root);
  if (structuredBody === undefined) {
    throw new CcdaEditError(
      "NO_STRUCTURED_BODY",
      "editCcda: the document has no structuredBody to edit (an unstructured / nonXMLBody " +
        "document carries no sections).",
    );
  }

  const requiredBefore =
    documentType === undefined
      ? new Set<string>()
      : new Set(
          missingRequiredSections(
            documentType,
            sectionKeys(surface.components(structuredBody)),
            requiredOptions,
          ),
        );

  const id = uniqueIdGen(surface);
  const grafted = new Set<Element>();
  for (const edit of edits) {
    grafted.add(applyOneSectionEdit(surface, structuredBody, edit, id));
  }

  if (documentType !== undefined) {
    const missingAfter = missingRequiredSections(
      documentType,
      sectionKeys(surface.components(structuredBody)),
      requiredOptions,
    );
    const newlyMissing = missingAfter.filter((key) => !requiredBefore.has(key));
    if (newlyMissing.length > 0) {
      throw new CcdaEditError(
        "REQUIRED_SECTION_MISSING",
        `editCcda: the edit would drop the SHALL required section(s) [${newlyMissing.join(", ")}] ` +
          `a ${documentType} document must contain.`,
      );
    }
  }

  // Every graft lands as a direct `<component>` of the body (appended or swapped
  // in place), so the body's own child list is the whole search space.
  return surface.components(structuredBody).filter((component) => grafted.has(component));
}

/**
 * Add or replace one section, honoring its {@link SectionEditMode}, and return
 * the `<component>` this edit grafted into the body. @internal
 */
function applyOneSectionEdit(
  surface: EditSurface,
  structuredBody: Element,
  edit: SectionEdit,
  id: (prefix: string) => string,
): Element {
  const meta = EDITABLE_SECTIONS[edit.kind];
  const existing = findSectionComponent(surface.components(structuredBody), edit.kind);
  const mode = edit.mode ?? "upsert";

  if (mode === "add" && existing !== undefined) {
    throw new CcdaEditError(
      "SECTION_ALREADY_PRESENT",
      `editCcda: a "${edit.kind}" section (${meta.base}) is already present, use ` +
        `mode "replace" or "upsert" to overwrite it.`,
    );
  }
  if (mode === "replace" && existing === undefined) {
    throw new CcdaEditError(
      "SECTION_ABSENT",
      `editCcda: no "${edit.kind}" section (${meta.base}) is present to replace, use ` +
        `mode "add" or "upsert" to add it.`,
    );
  }

  // `edit` is `SectionInput & { mode? }`, structurally a `SectionInput`; the
  // dispatcher's switch on `kind` narrows `content` to the right builder shape.
  const component = buildSectionComponent(surface.doc, edit, id);
  if (existing === undefined) {
    surface.append(structuredBody, component);
  } else {
    surface.replace(structuredBody, component, existing);
  }
  return component;
}

/** The `structuredBody` element, or `undefined` for an unstructured document. @internal */
function findStructuredBody(root: Element): Element | undefined {
  const component = child(root, "component");
  return component === undefined ? undefined : child(component, "structuredBody");
}

/**
 * The top-level `<component>` whose `<section>` matches the given kind, by base
 * `templateId` root (primary) or section LOINC (fallback), or `undefined`.
 * @internal
 */
function findSectionComponent(
  components: readonly Element[],
  kind: EditableSectionKind,
): Element | undefined {
  const meta = EDITABLE_SECTIONS[kind];
  for (const component of components) {
    const section = child(component, "section");
    if (section !== undefined && sectionMatches(section, meta.base, meta.loinc)) {
      return component;
    }
  }
  return undefined;
}

/** True when a `<section>` carries the base templateId root or the section LOINC. @internal */
function sectionMatches(section: Element, base: string, loinc: string): boolean {
  for (const tid of children(section, "templateId")) {
    if (attr(tid, "root") === base) return true;
  }
  const code = child(section, "code");
  return code !== undefined && attr(code, "code") === loinc && attr(code, "codeSystem") === LOINC;
}

/**
 * The recognized catalog `key` of every section under a `structuredBody`'s
 * `<component>`s (top-level and nested), by templateId root then LOINC, the
 * present-section set the SHALL required-section check runs against. @internal
 */
function sectionKeys(components: readonly Element[]): ReadonlySet<string> {
  const keys = new Set<string>();
  const visit = (section: Element): void => {
    const key = recognizeSectionKey(section);
    if (key !== undefined) keys.add(key);
    for (const component of children(section, "component")) {
      const nested = child(component, "section");
      if (nested !== undefined) visit(nested);
    }
  };
  for (const component of components) {
    const section = child(component, "section");
    if (section !== undefined) visit(section);
  }
  return keys;
}

/** Recognize a `<section>`'s catalog key by templateId root then LOINC. @internal */
function recognizeSectionKey(section: Element): string | undefined {
  for (const tid of children(section, "templateId")) {
    const rootOid = attr(tid, "root");
    if (rootOid !== undefined) {
      const info = sectionForTemplateRoot(rootOid);
      if (info !== undefined) return info.key;
    }
  }
  const code = child(section, "code");
  const loinc = code === undefined ? undefined : attr(code, "code");
  if (loinc !== undefined) {
    const info = sectionForLoinc(loinc);
    if (info !== undefined) return info.key;
  }
  return undefined;
}

/**
 * A monotonic id generator that never collides with an `ID` attribute already
 * in the document, so a section grafted into a document whose other sections
 * reuse the same builder id prefixes cannot produce a duplicate narrative `ID`
 * (which would make a `<reference value="#id">` ambiguous). Deterministic: no
 * randomness, so an edit is reproducible. @internal
 */
function uniqueIdGen(surface: EditSurface): (prefix: string) => string {
  const taken = surface.ids();
  const counters = new Map<string, number>();
  return (prefix) => {
    let n = counters.get(prefix) ?? 0;
    let candidate: string;
    do {
      n += 1;
      candidate = `${prefix}-e${n.toString()}`;
    } while (taken.has(candidate));
    counters.set(prefix, n);
    taken.add(candidate);
    return candidate;
  };
}

/**
 * Stamp a CDA R2 `RPLC` revision onto the document: give it a fresh
 * `ClinicalDocument.id`, keep/mint the version-series `setId` (a minted one
 * labelled synthetic, see {@link SYNTHETIC_SETID_PREFIX}), increment
 * `versionNumber`, and add a `relatedDocument typeCode="RPLC"` whose
 * `parentDocument` names the version being replaced. All new header elements are
 * inserted at their CDA R2 XSD sequence positions (setId/versionNumber after
 * `languageCode`, before `recordTarget`; relatedDocument after `documentationOf`,
 * before `componentOf`/`component`). @internal
 */
function stampRevision(
  surface: EditSurface,
  init: RevisionInit | undefined,
  id: (prefix: string) => string,
): void {
  const { doc: dom, root } = surface;
  const oldIdEl = child(root, "id");
  const oldCodeEl = child(root, "code");
  const oldSetIdEl = child(root, "setId");
  const oldVersion = intAttr(child(root, "versionNumber"), "value");

  // CDA R2 (POCD_MT000040.xsd): ClinicalDocument.id is [1..1] SHALL and, on the
  // RPLC revision, ParentDocument.id is [1..*] SHALL. A source with no <id> cannot
  // be truthfully revised, the relatedDocument/parentDocument exists precisely to
  // name the version being replaced by its id, and there is none to name. Minting a
  // fresh id here would fabricate a clinical identifier for a document that provably
  // has none, so we refuse rather than emit a SHALL-invalid parentDocument. Callers
  // that only want an in-place edit pass `revision: false` (this path never runs).
  if (oldIdEl === undefined) {
    throw new CcdaEditError(
      "SOURCE_MISSING_ID",
      "editCcda: the source ClinicalDocument has no <id>, so a CDA R2 RPLC revision " +
        "cannot name the prior version it replaces (ParentDocument.id is required 1..*). " +
        "Pass revision: false to edit in place, or give the source an id before revising.",
    );
  }

  // The same refusal, for an <id> that is present but marked @nullFlavor. In HL7
  // v3 a nullFlavor marks an exceptional value, one with no proper value, so such
  // an <id> names no document. `iiFrom` copies only root/extension, so building
  // the parentDocument from it would silently drop the marking and promote an
  // identifier the source disowned into an unqualified assertion on the emitted
  // document, the emit-side twin of reading an MRN out of a null-marked <id>
  // (see `pickMrn`). Carrying the nullFlavor forward instead is not an option
  // worth taking: it would emit a parentDocument/id that is itself contradictory
  // (or that names nothing at all), which the conservative-on-emit rule forbids
  // and which our own parser would flag on the way back in.
  if (attr(oldIdEl, "nullFlavor") !== undefined) {
    throw new CcdaEditError(
      "SOURCE_MISSING_ID",
      "editCcda: the source ClinicalDocument's <id> carries a nullFlavor, so it names no " +
        "prior version for a CDA R2 RPLC revision to replace (ParentDocument.id is required " +
        "1..*, and copying root/extension forward would drop the nullFlavor and assert an " +
        "identifier the source disowned). Pass revision: false to edit in place, or give the " +
        "source a real id before revising.",
    );
  }

  // The version-series id: keep the source's setId, else the caller's, else mint
  // one (the source starts a series here). The replacement's setId SHALL equal
  // the parentDocument's setId, so a single value feeds both. A setId marked
  // @nullFlavor identifies no version series, so it is treated as absent rather
  // than laundered into an asserted series id, the same rule as the <id> above
  // with the milder remedy the optional element allows. Stated plainly, because
  // the minted id does land on the parentDocument too and that looks like the
  // fabrication refused three lines up: it is not the same claim. A setId names
  // the version *series*, and minting one says "this edit starts a series",
  // which is exactly what an absent setId already got here; CDA R2 requires the
  // replacement and its parent to share it, hence both. ParentDocument.id is
  // what names the prior document itself, and that is never invented. The
  // disowned extension is carried nowhere.
  //
  // **A minted one is labelled as minted** (`SYNTHETIC-SETID-e1` under the
  // synthetic example-arc root), so a receiving system can tell an invented
  // version series from an asserted one; `isSyntheticSetId` is the check, and
  // the residual it cannot close is stated on `SYNTHETIC_SETID_PREFIX`. The
  // label goes on the minted branch **only**: a setId the source carried, or one
  // the caller passed as `revision.setId`, is somebody else's assertion and is
  // never relabelled.
  const usableSetIdEl =
    oldSetIdEl !== undefined && attr(oldSetIdEl, "nullFlavor") === undefined
      ? oldSetIdEl
      : undefined;
  const seriesId: DocumentIdInit =
    usableSetIdEl !== undefined
      ? iiFrom(usableSetIdEl)
      : (init?.setId ?? { root: SYNTH_ROOT, extension: id(SYNTHETIC_SETID_PREFIX) });

  // The version the parent carried (a source with no versionNumber is treated as
  // version 1); the replacement increments it unless the caller pins a value.
  const parentVersion = oldVersion ?? 1;
  const newVersion = init?.versionNumber ?? parentVersion + 1;

  // The new document id, different from the parent's, per CDA R2 (every document
  // has a unique ClinicalDocument.id).
  const newDocId = init?.documentId ?? deriveNewDocId(oldIdEl, id);

  // Build the parentDocument (id, code, setId, versionNumber, CDA R2 order) from
  // the identity the source carried BEFORE we overwrite it.
  const parentDocument = el(dom, "parentDocument");
  parentDocument.appendChild(idElement(dom, "id", iiFrom(oldIdEl)));
  if (oldCodeEl !== undefined) parentDocument.appendChild(cloneCode(dom, oldCodeEl));
  parentDocument.appendChild(idElement(dom, "setId", seriesId));
  parentDocument.appendChild(el(dom, "versionNumber", { value: parentVersion.toString() }));
  const relatedDocument = el(dom, "relatedDocument", { typeCode: "RPLC" }, parentDocument);

  // Overwrite the document id in place (keeping its header position).
  const newIdEl = idElement(dom, "id", newDocId);
  surface.replace(root, newIdEl, oldIdEl);

  // Replace setId + versionNumber (removing any existing pair), inserting them at
  // their CDA R2 sequence slot: immediately before the first element that follows
  // versionNumber (robust to a document that omits recordTarget).
  if (oldSetIdEl !== undefined) surface.remove(root, oldSetIdEl);
  const oldVersionEl = child(root, "versionNumber");
  if (oldVersionEl !== undefined) surface.remove(root, oldVersionEl);
  const setIdEl = idElement(dom, "setId", seriesId);
  const versionEl = el(dom, "versionNumber", { value: newVersion.toString() });
  surface.insertBefore(root, [setIdEl, versionEl], firstNamed(root, AFTER_VERSION_NUMBER));

  // A replacement supersedes the source, not the source's parent: drop any
  // relatedDocument the source carried, then add the RPLC link to the source.
  for (const existing of children(root, "relatedDocument")) surface.remove(root, existing);
  surface.insertBefore(root, [relatedDocument], firstNamed(root, AFTER_RELATED_DOCUMENT));
}

/** A fresh document id different from the parent's, same root, new extension. @internal */
function deriveNewDocId(oldIdEl: Element, id: (prefix: string) => string): DocumentIdInit {
  const rootOid = attr(oldIdEl, "root");
  return { root: rootOid ?? SYNTH_ROOT, extension: id("doc") };
}

/** Read a `root`/`extension` instance identifier off an element. @internal */
function iiFrom(element: Element): DocumentIdInit {
  const rootOid = attr(element, "root");
  const extension = attr(element, "extension");
  const out: { root: string; extension?: string } = { root: rootOid ?? SYNTH_ROOT };
  if (extension !== undefined) out.extension = extension;
  return out;
}

/** Build a `root`/`extension` id-shaped element (`<id>`/`<setId>`). @internal */
function idElement(dom: Document, name: string, ii: DocumentIdInit): Element {
  return el(dom, name, { root: ii.root, extension: ii.extension });
}

/** Copy a `<code>` element's identifying attributes into a fresh `<code>`. @internal */
function cloneCode(dom: Document, code: Element): Element {
  return el(dom, "code", {
    code: attr(code, "code"),
    codeSystem: attr(code, "codeSystem"),
    displayName: attr(code, "displayName"),
    codeSystemName: attr(code, "codeSystemName"),
  });
}

/**
 * The first child element of `root` named in `names`, the one a new header element goes before, or
 * `undefined` to append it. None of the names is one an edit adds, replaces or removes, so the
 * answer is the same before and after the other header changes. @internal
 */
function firstNamed(root: Element, names: readonly string[]): Element | undefined {
  for (const kid of childElements(root)) {
    if (kid.localName !== null && names.includes(kid.localName)) return kid;
  }
  return undefined;
}

/** Parse an integer `@name` attribute off an element, or `undefined`. @internal */
function intAttr(element: Element | undefined, name: string): number | undefined {
  if (element === undefined) return undefined;
  const raw = attr(element, name);
  if (raw === undefined) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}
