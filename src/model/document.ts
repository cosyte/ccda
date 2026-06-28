/**
 * `CcdaDocument` — the immutable parsed-document model produced by `parseCcda`.
 * It ties the Phase 1 pieces together: the recognized {@link DocumentType}
 * (from the root `templateId` OID, with the R2.1 `@extension` stamp checked),
 * the US Realm {@link CcdaHeader}, the framed top-level {@link CcdaSection}s
 * from a `structuredBody` (or the quarantined `nonXMLBody` content for an
 * unstructured document), and the lenient-parse warnings — frozen at the model
 * boundary so callers cannot mutate parser output after handoff.
 *
 * Phase 1 frames identity + narrative only; clinical entry extraction is
 * Phase 2+. The convenience accessors (`getPatient`, `getMrn`, `findSection`,
 * `allSections`) answer the archetype's "whose document, what kind, what's in
 * it" in one call without re-walking the DOM.
 */

import { child, children, positionOf } from "./dom.js";
import { buildHeader, type CcdaHeader, type CcdaPatient } from "./header.js";
import { buildSection, type CcdaSection } from "./section.js";
import { parseEd, type ED } from "./types/ed.js";
import { parseIi, type II } from "./types/ii.js";
import type { ParseCtx } from "./types/_shared.js";
import { pickMrn } from "../helpers/pick-mrn.js";
import { documentTypeForOid, R21_EXTENSION, type DocumentType } from "../parser/templates.js";
import {
  missingTemplateId,
  templateExtensionAbsent,
  unknownDocumentTemplate,
} from "../parser/warnings.js";
import type { CcdaWarning } from "../parser/warnings.js";
import type { Element } from "@xmldom/xmldom";

/**
 * Constructor init for {@link CcdaDocument}. Produced by {@link buildDocument}
 * (the parts) plus the orchestrator's accumulated `warnings`. Optional keys are
 * omitted (never set to `undefined`) per `exactOptionalPropertyTypes`.
 *
 * @example
 * ```ts
 * import type { CcdaDocumentInit } from "@cosyte/ccda";
 * const init: CcdaDocumentInit = {
 *   templateIds: [],
 *   header: { recordTargets: [] },
 *   sections: [],
 *   warnings: [],
 * };
 * ```
 */
export interface CcdaDocumentInit {
  readonly documentType?: DocumentType;
  readonly templateIds: readonly II[];
  readonly header: CcdaHeader;
  readonly sections: readonly CcdaSection[];
  readonly nonXmlBody?: ED;
  readonly warnings: readonly CcdaWarning[];
}

/**
 * The immutable parsed C-CDA document. Carries the recognized identity, the
 * header, the top-level sections (empty for an unstructured document — see
 * `nonXmlBody`), and the frozen lenient-parse warnings.
 *
 * @example
 * ```ts
 * import { parseCcda } from "@cosyte/ccda";
 * const doc = parseCcda(xml);
 * console.log(doc.documentType, doc.getPatient()?.name?.text, doc.getMrn());
 * ```
 */
export class CcdaDocument {
  /** The recognized document type, or `undefined` when the root `templateId` is unrecognized/absent. */
  public readonly documentType: DocumentType | undefined;
  /** The root `templateId`s, in document order (raw recognition signal). */
  public readonly templateIds: readonly II[];
  /** The parsed US Realm Header. */
  public readonly header: CcdaHeader;
  /** Top-level framed sections from the `structuredBody`. Empty for an unstructured document. */
  public readonly sections: readonly CcdaSection[];
  /** The quarantined `nonXMLBody` content for an unstructured document (base64 never decoded). */
  public readonly nonXmlBody: ED | undefined;
  /** Lenient-parse warnings, frozen at the model boundary. */
  public readonly warnings: readonly CcdaWarning[];

  /**
   * Construct a `CcdaDocument`. Freezes the `warnings` array (after a `slice`)
   * so callers cannot mutate parser output after handoff.
   *
   * @internal
   */
  public constructor(init: CcdaDocumentInit) {
    this.documentType = init.documentType;
    this.templateIds = init.templateIds;
    this.header = init.header;
    this.sections = init.sections;
    this.nonXmlBody = init.nonXmlBody;
    this.warnings = Object.freeze(init.warnings.slice());
  }

  /**
   * The first `recordTarget` patient, or `undefined` when the document carries
   * none. A document with multiple record targets emits
   * `MULTIPLE_RECORD_TARGETS` at parse time; this returns the first.
   *
   * @example
   * ```ts
   * const p = doc.getPatient();
   * console.log(p?.name?.text ?? "unknown patient");
   * ```
   */
  public getPatient(): CcdaPatient | undefined {
    return this.header.recordTargets[0];
  }

  /**
   * The patient's MRN string — the first `patientRole/id` extension (see
   * {@link pickMrn}). `undefined` when there is no patient or no usable id.
   *
   * @example
   * ```ts
   * console.log(doc.getMrn() ?? "no MRN");
   * ```
   */
  public getMrn(): string | undefined {
    const patient = this.getPatient();
    return patient === undefined ? undefined : pickMrn(patient.identifiers);
  }

  /**
   * Find the first recognized section with the given catalog `key`, searching
   * top-level sections then their subsections (depth-first). Returns
   * `undefined` when no recognized section matches.
   *
   * @example
   * ```ts
   * const allergies = doc.findSection("allergies");
   * console.log(allergies?.narrativeText);
   * ```
   */
  public findSection(key: string): CcdaSection | undefined {
    for (const section of this.allSections()) {
      if (section.key === key) return section;
    }
    return undefined;
  }

  /**
   * Every section in the document, flattened depth-first (top-level sections
   * followed by their nested subsections). Order is document order.
   *
   * @example
   * ```ts
   * for (const s of doc.allSections()) console.log(s.key ?? "(unrecognized)");
   * ```
   */
  public allSections(): readonly CcdaSection[] {
    const out: CcdaSection[] = [];
    const visit = (section: CcdaSection): void => {
      out.push(section);
      for (const sub of section.subsections) visit(sub);
    };
    for (const section of this.sections) visit(section);
    return out;
  }
}

/**
 * Build the {@link CcdaDocumentInit} parts (everything except `warnings`) from a
 * `ClinicalDocument` root element. Recognizes the document type, parses the
 * header, and frames the body — a `structuredBody` yields sections; a
 * `nonXMLBody` yields the quarantined `nonXmlBody` content. Never throws; the
 * orchestrator supplies `warnings` and constructs the {@link CcdaDocument}.
 *
 * @example
 * ```ts
 * import { buildDocument, CcdaDocument } from "@cosyte/ccda";
 * const parts = buildDocument(root, ctx);
 * const doc = new CcdaDocument({ ...parts, warnings: [] });
 * ```
 */
export function buildDocument(root: Element, ctx: ParseCtx): Omit<CcdaDocumentInit, "warnings"> {
  const templateIds = children(root, "templateId")
    .map((t) => parseIi(t, ctx))
    .filter((t): t is II => t !== undefined);

  const documentType = recognizeDocumentType(root, templateIds, ctx);

  const header = buildHeader(root, ctx);

  const out: {
    documentType?: DocumentType;
    templateIds: readonly II[];
    header: CcdaHeader;
    sections: readonly CcdaSection[];
    nonXmlBody?: ED;
  } = { templateIds, header, sections: [] };
  if (documentType !== undefined) out.documentType = documentType;

  const component = child(root, "component");
  if (component !== undefined) {
    const structuredBody = child(component, "structuredBody");
    if (structuredBody !== undefined) {
      out.sections = children(structuredBody, "component")
        .map((comp) => child(comp, "section"))
        .filter((s): s is Element => s !== undefined)
        .map((s) => buildSection(s, ctx));
    } else {
      const nonXmlBody = child(component, "nonXMLBody");
      if (nonXmlBody !== undefined) {
        const ed = parseEd(child(nonXmlBody, "text"), ctx);
        if (ed !== undefined) out.nonXmlBody = ed;
      }
    }
  }

  return out;
}

/**
 * Recognize the {@link DocumentType} from the root `templateId`s. Emits
 * `MISSING_TEMPLATE_ID` when none are present, `TEMPLATE_EXTENSION_ABSENT` when
 * the matched type's `templateId` lacks the R2.1 `@extension` stamp, and
 * `UNKNOWN_DOCUMENT_TEMPLATE` when `templateId`s are present but none map to a
 * recognized type. The generic US Realm Header / CDA-base templates are not in
 * the document-type table, so they are naturally passed over — only a specific
 * document-type `templateId` resolves a {@link DocumentType}.
 *
 * @internal
 */
function recognizeDocumentType(
  root: Element,
  templateIds: readonly II[],
  ctx: ParseCtx,
): DocumentType | undefined {
  if (templateIds.length === 0) {
    ctx.emit(missingTemplateId(positionOf(root), "ClinicalDocument"));
    return undefined;
  }

  let firstRootedOid: string | undefined;
  for (const tid of templateIds) {
    if (tid.root === undefined) continue;
    if (firstRootedOid === undefined) firstRootedOid = tid.root;
    const documentType = documentTypeForOid(tid.root);
    if (documentType !== undefined) {
      if (tid.extension !== R21_EXTENSION) {
        ctx.emit(templateExtensionAbsent(positionOf(root), tid.root));
      }
      return documentType;
    }
  }

  ctx.emit(unknownDocumentTemplate(positionOf(root), firstRootedOid ?? ""));
  return undefined;
}
