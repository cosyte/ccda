/**
 * `editCcda` — the read→edit→write loop for `@cosyte/ccda`, the third emit-side
 * primitive alongside `parseCcda` (read) and `buildCcda` (construct). It takes a
 * document already produced by {@link parseCcda} and re-emits it with a section
 * **added** or **replaced**, then returns the re-parsed {@link CcdaDocument} —
 * so `parseCcda(editCcda(parseCcda(xml), …).toString())` round-trips.
 *
 * **Byte-faithful on the untouched sections.** The edit is performed as DOM
 * surgery on the document the parser actually read (recovered from the
 * serialized snapshot every parsed document retains), not by reconstructing XML
 * from the lossy read-model. Every section, entry, attribute, namespace
 * declaration, and even content this library never models survives an edit
 * verbatim — only the one section the caller targeted is rebuilt. The
 * replacement section is emitted through the **same per-section emitters
 * `buildCcda` uses** ({@link buildSectionComponent}), so it carries the identical
 * templateIds, LOINC code, SHALL `effectiveTime`, and narrative/entry agreement
 * a freshly-built section would, and re-parses with zero new warnings.
 *
 * **Fail-safe.** An edit never silently drops or corrupts an unedited section
 * (they are carried by reference), never fabricates a clinical value (an empty
 * content list yields that section's spec-clean `nullFlavor="NI"` shell, never
 * invented entries), and never produces a document that newly violates a
 * per-document-type SHALL required-section rule — such an edit throws a typed
 * {@link CcdaEditError} instead of emitting an invalid document. Every builder
 * guard the section emitter enforces (a resolved-without-resolution
 * contradiction, an invalid HL7 timestamp) still throws.
 *
 * **Revision provenance (CDA R2).** By default an edit produces a *revision*:
 * the document gets a new `ClinicalDocument.id`, keeps (or, if absent, mints)
 * the `setId` that identifies the version series, increments `versionNumber`,
 * and adds a `relatedDocument typeCode="RPLC"` naming the prior version in its
 * `parentDocument` (with the **same** `setId` and the prior `versionNumber`) —
 * the replacement relationship defined by CDA R2 and shown in the HL7
 * C-CDA-Examples "Parent Document Replace Relationship" sample. Pass
 * `revision: false` to edit in place without stamping a new version.
 *
 * @packageDocumentation
 */

import { buildSectionComponent, EDITABLE_SECTIONS } from "../builder/build-ccda.js";
import type { EditableSectionKind, SectionInput } from "../builder/build-ccda.js";
import { el } from "../builder/dom.js";
import { LOINC } from "../model/code-systems.js";
import type { CcdaDocument } from "../model/document.js";
import { attr, child, childElements, children } from "../model/dom.js";
import type { TerminologyAdapter } from "../model/terminology.js";
import { parseCcda } from "../parser/index.js";
import { missingRequiredSections } from "../parser/required-sections.js";
import { DEFAULT_LIMITS, parseSecureXml } from "../parser/secure-xml.js";
import { sectionForLoinc, sectionForTemplateRoot, type DocumentType } from "../parser/templates.js";
import { serializeDocument } from "../serialize/serialize-dom.js";
import type { Document, Element } from "@xmldom/xmldom";

/** A synthetic (non-real) assigning-authority OID for editor-generated ids. @internal */
const SYNTH_ROOT = "2.16.840.1.113883.19.5.99999";

/**
 * The `ClinicalDocument` child elements that, per the CDA R2 XSD sequence
 * (`POCD_MT000040.ClinicalDocument`), follow `versionNumber`. Inserting `setId`
 * and `versionNumber` immediately before the first of these present in the
 * document lands them at their XSD slot (after `languageCode`) regardless of
 * which optional participations the document carries — a document missing
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
 * version-series id (or mint one when the source has none), and omit
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
   * `SEMANTIC_CODE_INVALID` for any coded value the adapter rejects — the same
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
 * — a hand-constructed source with no XML to edit, a structured-body-less
 * document, an add/replace precondition violation, an edit that would drop a
 * per-document-type SHALL required section, or a revision of a source that
 * carries no `ClinicalDocument.id` (the RPLC link has no prior version to name).
 * Consumers narrow via `code`.
 *
 * @example
 * ```ts
 * import { editCcda, CcdaEditError } from "@cosyte/ccda";
 * try {
 *   editCcda(doc, { sections: [{ kind: "problems", mode: "add", content: [] }] });
 * } catch (err) {
 *   if (err instanceof CcdaEditError && err.code === "SECTION_ALREADY_PRESENT") {
 *     // the document already has a Problems section — use "replace" or "upsert"
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
 * @param source - A document produced by {@link parseCcda} (it must retain its
 *   source XML — a hand-constructed document throws `NO_SOURCE_DOCUMENT`).
 * @param options - The section edits to apply, the revision behavior, and an
 *   optional bring-your-own `terminology` adapter forwarded to the final re-parse
 *   so the edited document flags adapter-rejected codes (`SEMANTIC_CODE_INVALID`).
 * @returns A new {@link CcdaDocument} — the re-parse of the edited XML. The
 *   `source` is never mutated.
 * @throws {@link CcdaEditError} when the source has no retained XML, has no
 *   `structuredBody` to edit, violates an add/replace precondition, would drop a
 *   SHALL required section, or (when stamping a revision) has no
 *   `ClinicalDocument.id` for the RPLC link to name (`SOURCE_MISSING_ID`).
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
  const xml = sourceXml(source);
  // Re-parse the retained (already-clean, already-safe) XML into a fresh DOM we
  // can mutate. A no-op emitter: this XML came from our own serializer, so it
  // carries no Tier-2 deviations to record — and any Tier-3 fatal is impossible.
  const dom = parseSecureXml(xml, DEFAULT_LIMITS, () => undefined);
  const root = dom.documentElement;
  if (root === null) {
    // Unreachable: the source already parsed as a ClinicalDocument.
    throw new CcdaEditError("NO_SOURCE_DOCUMENT", "editCcda: source produced no document element.");
  }

  const edits = options.sections ?? [];
  if (edits.length > 0) {
    applySectionEdits(dom, root, edits, source.documentType);
  }

  if (options.revision !== false) {
    stampRevision(dom, root, options.revision, uniqueIdGen(root));
  }

  // Re-parse the edited XML into the returned document. When the caller supplied
  // a terminology adapter, forward it so the edited document reaches the same
  // semantic-validation tier `parseCcda`/`buildCcda` offer — surfacing
  // `SEMANTIC_CODE_INVALID` for any coded value the adapter rejects (in a grafted
  // section or an untouched one). The edit still emits every code **verbatim**; the
  // adapter can only ever add a flag, never coerce a value.
  return options.terminology !== undefined
    ? parseCcda(serializeDocument(dom), { terminology: options.terminology })
    : parseCcda(serializeDocument(dom));
}

/** Recover the source XML a parsed document retains, or throw `NO_SOURCE_DOCUMENT`. @internal */
function sourceXml(source: CcdaDocument): string {
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

/** Apply every section add/replace to the `structuredBody`, enforcing SHALL safety. @internal */
function applySectionEdits(
  dom: Document,
  root: Element,
  edits: readonly SectionEdit[],
  documentType: DocumentType | undefined,
): void {
  const structuredBody = findStructuredBody(root);
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
      : new Set(missingRequiredSections(documentType, sectionKeys(structuredBody)));

  const id = uniqueIdGen(root);
  for (const edit of edits) {
    applyOneSectionEdit(dom, structuredBody, edit, id);
  }

  if (documentType !== undefined) {
    const missingAfter = missingRequiredSections(documentType, sectionKeys(structuredBody));
    const newlyMissing = missingAfter.filter((key) => !requiredBefore.has(key));
    if (newlyMissing.length > 0) {
      throw new CcdaEditError(
        "REQUIRED_SECTION_MISSING",
        `editCcda: the edit would drop the SHALL required section(s) [${newlyMissing.join(", ")}] ` +
          `a ${documentType} document must contain.`,
      );
    }
  }
}

/** Add or replace one section, honoring its {@link SectionEditMode}. @internal */
function applyOneSectionEdit(
  dom: Document,
  structuredBody: Element,
  edit: SectionEdit,
  id: (prefix: string) => string,
): void {
  const meta = EDITABLE_SECTIONS[edit.kind];
  const existing = findSectionComponent(structuredBody, edit.kind);
  const mode = edit.mode ?? "upsert";

  if (mode === "add" && existing !== undefined) {
    throw new CcdaEditError(
      "SECTION_ALREADY_PRESENT",
      `editCcda: a "${edit.kind}" section (${meta.base}) is already present — use ` +
        `mode "replace" or "upsert" to overwrite it.`,
    );
  }
  if (mode === "replace" && existing === undefined) {
    throw new CcdaEditError(
      "SECTION_ABSENT",
      `editCcda: no "${edit.kind}" section (${meta.base}) is present to replace — use ` +
        `mode "add" or "upsert" to add it.`,
    );
  }

  // `edit` is `SectionInput & { mode? }`, structurally a `SectionInput`; the
  // dispatcher's switch on `kind` narrows `content` to the right builder shape.
  const component = buildSectionComponent(dom, edit, id);
  if (existing === undefined) {
    structuredBody.appendChild(component);
  } else {
    structuredBody.replaceChild(component, existing);
  }
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
  structuredBody: Element,
  kind: EditableSectionKind,
): Element | undefined {
  const meta = EDITABLE_SECTIONS[kind];
  for (const component of children(structuredBody, "component")) {
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
 * The recognized catalog `key` of every section under a `structuredBody`
 * (top-level and nested), by templateId root then LOINC — the present-section
 * set the SHALL required-section check runs against. @internal
 */
function sectionKeys(structuredBody: Element): ReadonlySet<string> {
  const keys = new Set<string>();
  const visit = (section: Element): void => {
    const key = recognizeSectionKey(section);
    if (key !== undefined) keys.add(key);
    for (const component of children(section, "component")) {
      const nested = child(component, "section");
      if (nested !== undefined) visit(nested);
    }
  };
  for (const component of children(structuredBody, "component")) {
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
 * in the document — so a section grafted into a document whose other sections
 * reuse the same builder id prefixes cannot produce a duplicate narrative `ID`
 * (which would make a `<reference value="#id">` ambiguous). Deterministic: no
 * randomness, so an edit is reproducible. @internal
 */
function uniqueIdGen(root: Element): (prefix: string) => string {
  const taken = collectIds(root);
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

/** Collect every `ID` attribute value in the document (narrative reference targets). @internal */
function collectIds(root: Element): Set<string> {
  const ids = new Set<string>();
  const visit = (node: Element): void => {
    const id = attr(node, "ID");
    if (id !== undefined) ids.add(id);
    for (const kid of childElements(node)) visit(kid);
  };
  visit(root);
  return ids;
}

/**
 * Stamp a CDA R2 `RPLC` revision onto the document: give it a fresh
 * `ClinicalDocument.id`, keep/mint the version-series `setId`, increment
 * `versionNumber`, and add a `relatedDocument typeCode="RPLC"` whose
 * `parentDocument` names the version being replaced. All new header elements are
 * inserted at their CDA R2 XSD sequence positions (setId/versionNumber after
 * `languageCode`, before `recordTarget`; relatedDocument after `documentationOf`,
 * before `componentOf`/`component`). @internal
 */
function stampRevision(
  dom: Document,
  root: Element,
  init: RevisionInit | undefined,
  id: (prefix: string) => string,
): void {
  const oldIdEl = child(root, "id");
  const oldCodeEl = child(root, "code");
  const oldSetIdEl = child(root, "setId");
  const oldVersion = intAttr(child(root, "versionNumber"), "value");

  // CDA R2 (POCD_MT000040.xsd): ClinicalDocument.id is [1..1] SHALL and, on the
  // RPLC revision, ParentDocument.id is [1..*] SHALL. A source with no <id> cannot
  // be truthfully revised — the relatedDocument/parentDocument exists precisely to
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

  // The version-series id: keep the source's setId, else the caller's, else mint
  // one (the source starts a series here). The replacement's setId SHALL equal
  // the parentDocument's setId, so a single value feeds both.
  const seriesId: DocumentIdInit =
    oldSetIdEl !== undefined
      ? iiFrom(oldSetIdEl)
      : (init?.setId ?? { root: SYNTH_ROOT, extension: id("setid") });

  // The version the parent carried (a source with no versionNumber is treated as
  // version 1); the replacement increments it unless the caller pins a value.
  const parentVersion = oldVersion ?? 1;
  const newVersion = init?.versionNumber ?? parentVersion + 1;

  // The new document id — different from the parent's, per CDA R2 (every document
  // has a unique ClinicalDocument.id).
  const newDocId = init?.documentId ?? deriveNewDocId(oldIdEl, id);

  // Build the parentDocument (id, code, setId, versionNumber — CDA R2 order) from
  // the identity the source carried BEFORE we overwrite it.
  const parentDocument = el(dom, "parentDocument");
  parentDocument.appendChild(idElement(dom, "id", iiFrom(oldIdEl)));
  if (oldCodeEl !== undefined) parentDocument.appendChild(cloneCode(dom, oldCodeEl));
  parentDocument.appendChild(idElement(dom, "setId", seriesId));
  parentDocument.appendChild(el(dom, "versionNumber", { value: parentVersion.toString() }));
  const relatedDocument = el(dom, "relatedDocument", { typeCode: "RPLC" }, parentDocument);

  // Overwrite the document id in place (keeping its header position).
  const newIdEl = idElement(dom, "id", newDocId);
  root.replaceChild(newIdEl, oldIdEl);

  // Replace setId + versionNumber (removing any existing pair), inserting them at
  // their CDA R2 sequence slot: immediately before the first element that follows
  // versionNumber (robust to a document that omits recordTarget).
  if (oldSetIdEl !== undefined) root.removeChild(oldSetIdEl);
  const oldVersionEl = child(root, "versionNumber");
  if (oldVersionEl !== undefined) root.removeChild(oldVersionEl);
  const setIdEl = idElement(dom, "setId", seriesId);
  const versionEl = el(dom, "versionNumber", { value: newVersion.toString() });
  insertBeforeFirst(root, setIdEl, AFTER_VERSION_NUMBER);
  root.insertBefore(versionEl, setIdEl.nextSibling);

  // A replacement supersedes the source, not the source's parent: drop any
  // relatedDocument the source carried, then add the RPLC link to the source.
  for (const existing of children(root, "relatedDocument")) root.removeChild(existing);
  insertBeforeFirst(root, relatedDocument, AFTER_RELATED_DOCUMENT);
}

/** A fresh document id different from the parent's — same root, new extension. @internal */
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

/** Insert `node` before the first child element named in `beforeNames`, else append. @internal */
function insertBeforeFirst(root: Element, node: Element, beforeNames: readonly string[]): void {
  for (const kid of childElements(root)) {
    if (kid.localName !== null && beforeNames.includes(kid.localName)) {
      root.insertBefore(node, kid);
      return;
    }
  }
  root.appendChild(node);
}

/** Parse an integer `@name` attribute off an element, or `undefined`. @internal */
function intAttr(element: Element | undefined, name: string): number | undefined {
  if (element === undefined) return undefined;
  const raw = attr(element, name);
  if (raw === undefined) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}
