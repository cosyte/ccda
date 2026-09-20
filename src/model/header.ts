/**
 * US Realm Header model + extraction for `@cosyte/ccda`. The C-CDA header is
 * the CDA R2 wrapper around every document type: the document `id`/`code`/
 * `title`/`effectiveTime`, and one or more `recordTarget` participations
 * carrying the patient. The parser extracts the header fields most consumers
 * reach for first, enough to answer "whose document is this, what kind, and
 * when" in one line.
 */

import {
  missingAssigningAuthority,
  multipleRecordTargets,
  unidentifiedAuthor,
} from "../parser/warnings.js";
import { attr, child, children, positionOf, text } from "./dom.js";
import { parseCd, type CD } from "./types/cd.js";
import { parseIi, type II } from "./types/ii.js";
import { parseIvlTs, type IVL_TS } from "./types/ivl-ts.js";
import { parseTs, type TS } from "./types/ts.js";
import type { ParseCtx } from "./types/_shared.js";
import type { Element } from "@xmldom/xmldom";

/**
 * A parsed C-CDA person name (`<name>`). Captures the structured parts plus the
 * `text` fallback (the element's full trimmed text) for senders that put the
 * whole name in a single node.
 *
 * @example
 * ```ts
 * import type { HumanName } from "@cosyte/ccda";
 * const n: HumanName = { given: ["Jane"], family: "Doe", text: "Jane Doe" };
 * ```
 */
export interface HumanName {
  readonly prefix?: readonly string[];
  readonly given?: readonly string[];
  readonly family?: string;
  readonly suffix?: readonly string[];
  readonly text?: string;
}

/**
 * A parsed C-CDA patient (`recordTarget/patientRole`). `identifiers` are the
 * patient ids (the MRN lives here); demographics carry the coded gender, birth
 * time, and optional race/ethnicity/marital status.
 *
 * @example
 * ```ts
 * import type { CcdaPatient } from "@cosyte/ccda";
 * function label(p: CcdaPatient): string {
 *   return p.name?.text ?? p.identifiers[0]?.extension ?? "unknown";
 * }
 * ```
 */
export interface CcdaPatient {
  readonly identifiers: readonly II[];
  readonly name?: HumanName;
  readonly genderCode?: CD;
  readonly birthTime?: TS;
  readonly maritalStatusCode?: CD;
  readonly raceCode?: CD;
  readonly ethnicGroupCode?: CD;
}

/**
 * A parsed CDA R2 organization: the `representedOrganization` behind an author,
 * or the `representedCustodianOrganization` behind the custodian. Carries the
 * organization's identifiers (its NPI, its assigning-authority OID) and its
 * name. Every field is omitted when the document does not carry it; nothing here
 * is derived from anywhere else in the document.
 *
 * @example
 * ```ts
 * import type { CcdaOrganization } from "@cosyte/ccda";
 * function label(o: CcdaOrganization): string {
 *   return o.name ?? o.identifiers[0]?.root ?? "unnamed organization";
 * }
 * ```
 */
export interface CcdaOrganization {
  readonly identifiers: readonly II[];
  readonly name?: string;
}

/**
 * A parsed `assignedAuthoringDevice`, the machine arm of the CDA R2
 * `assignedAuthor` choice: the software or instrument that authored the content
 * rather than a person. Both fields are plain labels the document supplied, and
 * neither is a person's name.
 *
 * @example
 * ```ts
 * import type { CcdaAuthoringDevice } from "@cosyte/ccda";
 * function device(d: CcdaAuthoringDevice): string {
 *   return d.softwareName ?? d.manufacturerModelName ?? "unnamed device";
 * }
 * ```
 */
export interface CcdaAuthoringDevice {
  readonly manufacturerModelName?: string;
  readonly softwareName?: string;
}

/**
 * A parsed `author` participation: who (or what) authored the content, at the
 * level the participation was written on. `identifiers` are the
 * `assignedAuthor/id` values; exactly one of `person` and `device` is populated
 * on a conforming participation (the CDA R2 `assignedAuthor` choice);
 * `representedOrganization` is the organization the document states the author
 * acted for; `time` is the author time at the precision the document stated,
 * never completed and never defaulted (`clinical-safety` C3).
 *
 * `unidentified` is `true` exactly when the participation carried neither arm of
 * the choice, which the US Realm Header requires one of (CONF:1198-8456). Such
 * an author is still surfaced and still conducts to nested levels, beside an
 * `UNIDENTIFIED_AUTHOR` warning, rather than being dropped: "an author whose
 * identity the document never states" and "no author" are different facts.
 *
 * @example
 * ```ts
 * import type { CcdaAuthor } from "@cosyte/ccda";
 * function who(a: CcdaAuthor): string {
 *   if (a.unidentified) return "author present, identity not stated";
 *   return a.person?.text ?? a.device?.softwareName ?? "unnamed author";
 * }
 * ```
 */
export interface CcdaAuthor {
  readonly identifiers: readonly II[];
  readonly person?: HumanName;
  readonly device?: CcdaAuthoringDevice;
  readonly representedOrganization?: CcdaOrganization;
  readonly time?: TS;
  readonly unidentified: boolean;
}

/**
 * The author reading for one level of a document: the document itself, a
 * `<section>`, or a top-level entry act within a section.
 *
 * `inherited` is the whole point of the type. `false` means this level carried
 * these `author` participations itself. `true` means it carried none and these
 * are the nearest enclosing level's, reported so a consumer is not left with
 * nothing, and marked so a consumer is never told this level's content was
 * authored by that person. Reporting the nearest enclosing author and asserting
 * that this entry's author is that person are different claims, and only the
 * first is one the document supports.
 *
 * The reading is **absent** rather than empty when no level carries an author:
 * nothing is substituted for it, not the record target, not the custodian, not a
 * legal authenticator, not an informant.
 *
 * @example
 * ```ts
 * import type { CcdaAuthorship } from "@cosyte/ccda";
 * function provenance(a: CcdaAuthorship): string {
 *   const who = a.authors[0]?.person?.text ?? "an unnamed author";
 *   return a.inherited ? `inherited from an enclosing level: ${who}` : `stated here: ${who}`;
 * }
 * ```
 */
export interface CcdaAuthorship {
  readonly authors: readonly CcdaAuthor[];
  readonly inherited: boolean;
}

/**
 * The author reading for one top-level entry act within a section, beside the
 * act's own `<id>`s so a consumer can join it to an extracted clinical entry.
 *
 * `CcdaSection.entryAuthorship` holds one of these per top-level entry act in
 * the section, in document order, so the Nth element describes the Nth such act.
 * Every extracted entry family carries an `ids` array read from the same
 * `<id>` children, so `ids` is the join key where the act carries one and
 * document order is the join where it does not.
 *
 * @example
 * ```ts
 * import type { CcdaEntryAuthorship } from "@cosyte/ccda";
 * function isInherited(e: CcdaEntryAuthorship): boolean {
 *   return e.authorship?.inherited === true;
 * }
 * ```
 */
export interface CcdaEntryAuthorship {
  readonly ids: readonly II[];
  readonly authorship?: CcdaAuthorship;
}

/**
 * A parsed `custodian` participation: the organization that holds the document
 * and is responsible for maintaining it. The US Realm Header requires exactly
 * one (CONF:1198-5519).
 *
 * `organization` is omitted when the `custodian` carried no
 * `assignedCustodian/representedCustodianOrganization` to read: the participation
 * is still surfaced, because the document did carry one, and nothing is invented
 * to fill it.
 *
 * @example
 * ```ts
 * import type { CcdaCustodian } from "@cosyte/ccda";
 * function custodianName(c: CcdaCustodian): string {
 *   return c.organization?.name ?? "custodian present, organization not stated";
 * }
 * ```
 */
export interface CcdaCustodian {
  readonly organization?: CcdaOrganization;
}

/**
 * A parsed `componentOf/encompassingEncounter`: the encounter the document
 * summarises, which an inpatient Discharge Summary carries (CONF:1198-8471,
 * -8472).
 *
 * `effectiveTime` is the encounter period as an {@link IVL_TS}, so each bound
 * keeps `raw` at exactly the precision the document stated and a bound declaring
 * a `nullFlavor` carries it rather than resolving to a date. The frame itself is
 * **absent** when the document carries no `componentOf`: its bounds are never
 * derived from the document `effectiveTime`, from a `documentationOf` service
 * event, or from any other date in the document.
 *
 * @example
 * ```ts
 * import type { CcdaEncompassingEncounter } from "@cosyte/ccda";
 * function admitted(e: CcdaEncompassingEncounter): string | undefined {
 *   return e.effectiveTime?.low?.raw;
 * }
 * ```
 */
export interface CcdaEncompassingEncounter {
  readonly effectiveTime?: IVL_TS;
  readonly dischargeDispositionCode?: CD;
}

/**
 * A CDA R2 `parentDocument`, the earlier document a {@link RelatedDocument}
 * points back at. Carries the parent's `id`(s), optional `code`, and the
 * `setId`/`versionNumber` revision pair (the version this document supersedes).
 *
 * @example
 * ```ts
 * import type { ParentDocument } from "@cosyte/ccda";
 * function priorVersion(p: ParentDocument): number | undefined {
 *   return p.versionNumber;
 * }
 * ```
 */
export interface ParentDocument {
  readonly ids: readonly II[];
  readonly code?: CD;
  readonly setId?: II;
  readonly versionNumber?: number;
}

/**
 * A CDA R2 `relatedDocument`, the header link that makes one document a
 * revision of another. `typeCode` is the ActRelationshipType (`RPLC` replaces,
 * `APND` appends, `XFRM` transforms); `parentDocument` names the prior version.
 * A replacement (revision) carries `typeCode="RPLC"`, the **same** `setId` as
 * its parent, and an incremented `versionNumber`.
 *
 * @example
 * ```ts
 * import type { RelatedDocument } from "@cosyte/ccda";
 * function replaces(r: RelatedDocument): boolean {
 *   return r.typeCode === "RPLC";
 * }
 * ```
 */
export interface RelatedDocument {
  readonly typeCode?: string;
  readonly parentDocument: ParentDocument;
}

/**
 * The parsed US Realm Header. `documentId` + `code` + `title` + `effectiveTime`
 * answer the document's identity; `recordTargets` are the patient(s) (usually
 * exactly one, more than one emits `MULTIPLE_RECORD_TARGETS`). `setId` +
 * `versionNumber` + `relatedDocuments` carry the CDA R2 revision chain, a
 * replacement document (see {@link editCcda}) shares its predecessor's `setId`,
 * bumps `versionNumber`, and names the prior version in a `RPLC`
 * {@link RelatedDocument}.
 *
 * The three participation readings answer "who wrote it, who holds it, and what
 * encounter it summarises". `authorship` is the document-level author reading
 * (its `inherited` is always `false`: the document is the outermost level, so
 * there is nothing for it to inherit from), `custodian` the organization
 * responsible for the document, and `encompassingEncounter` the
 * `componentOf` encounter frame. Each is absent when the document carries none,
 * and nothing is substituted for an absent one.
 *
 * @example
 * ```ts
 * import type { CcdaHeader } from "@cosyte/ccda";
 * function when(h: CcdaHeader): Date | undefined {
 *   return h.effectiveTime?.date;
 * }
 * ```
 */
export interface CcdaHeader {
  readonly documentId?: II;
  readonly code?: CD;
  readonly title?: string;
  readonly effectiveTime?: TS;
  readonly confidentialityCode?: CD;
  readonly languageCode?: string;
  readonly setId?: II;
  readonly versionNumber?: number;
  readonly recordTargets: readonly CcdaPatient[];
  readonly relatedDocuments: readonly RelatedDocument[];
  readonly authorship?: CcdaAuthorship;
  readonly custodian?: CcdaCustodian;
  readonly encompassingEncounter?: CcdaEncompassingEncounter;
}

/**
 * Extract the {@link CcdaHeader} from a `ClinicalDocument` root element. Never
 * throws; omits any field the document does not carry. Emits
 * `MULTIPLE_RECORD_TARGETS` when more than one `recordTarget` is present, and
 * `UNIDENTIFIED_AUTHOR` once per `author` participation carrying neither arm of
 * the `assignedAuthor` choice.
 *
 * More than one `author` at the document level is read as more than one author,
 * in document order, and draws no warning of its own: the US Realm Header
 * requires **at least** one (CONF:1198-5444), so several is conforming rather
 * than a deviation. An absent `author` and an absent `custodian` are likewise
 * left to document-level conformance validation; this function reports what the
 * document carries and never fabricates the participation it does not.
 *
 * @example
 * ```ts
 * import { buildHeader } from "@cosyte/ccda";
 * const header = buildHeader(rootEl, { emit: () => {} });
 * console.log(header.title, header.recordTargets.length);
 * ```
 */
export function buildHeader(root: Element, ctx: ParseCtx): CcdaHeader {
  const out: {
    documentId?: II;
    code?: CD;
    title?: string;
    effectiveTime?: TS;
    confidentialityCode?: CD;
    languageCode?: string;
    setId?: II;
    versionNumber?: number;
    recordTargets: readonly CcdaPatient[];
    relatedDocuments: readonly RelatedDocument[];
    authorship?: CcdaAuthorship;
    custodian?: CcdaCustodian;
    encompassingEncounter?: CcdaEncompassingEncounter;
  } = { recordTargets: [], relatedDocuments: [] };

  const documentId = parseIi(child(root, "id"), ctx);
  if (documentId !== undefined) out.documentId = documentId;
  const code = parseCd(child(root, "code"), ctx);
  if (code !== undefined) out.code = code;
  const titleEl = child(root, "title");
  const title = titleEl === undefined ? undefined : text(titleEl);
  if (title !== undefined) out.title = title;
  const effectiveTime = parseTs(child(root, "effectiveTime"), ctx);
  if (effectiveTime !== undefined) out.effectiveTime = effectiveTime;
  const confidentialityCode = parseCd(child(root, "confidentialityCode"), ctx);
  if (confidentialityCode !== undefined) out.confidentialityCode = confidentialityCode;
  const langEl = child(root, "languageCode");
  const languageCode = langEl === undefined ? undefined : attr(langEl, "code");
  if (languageCode !== undefined) out.languageCode = languageCode;
  const setId = parseIi(child(root, "setId"), ctx);
  if (setId !== undefined) out.setId = setId;
  const versionNumber = intValue(child(root, "versionNumber"));
  if (versionNumber !== undefined) out.versionNumber = versionNumber;

  const recordTargets = children(root, "recordTarget");
  if (recordTargets.length > 1) {
    ctx.emit(multipleRecordTargets(positionOf(root)));
  }
  out.recordTargets = recordTargets
    .map((rt) => child(rt, "patientRole"))
    .filter((pr): pr is Element => pr !== undefined)
    .map((pr) => buildPatient(pr, ctx));

  out.relatedDocuments = children(root, "relatedDocument").map((rd) =>
    parseRelatedDocument(rd, ctx),
  );

  const authorship = readAuthorship(root, ctx, undefined);
  if (authorship !== undefined) out.authorship = authorship;

  const custodianEl = child(root, "custodian");
  if (custodianEl !== undefined) out.custodian = parseCustodian(custodianEl, ctx);

  const componentOf = child(root, "componentOf");
  if (componentOf !== undefined) {
    const encounterEl = child(componentOf, "encompassingEncounter");
    if (encounterEl !== undefined) {
      out.encompassingEncounter = parseEncompassingEncounter(encounterEl, ctx);
    }
  }

  return out;
}

/**
 * Resolve the {@link CcdaAuthorship} reading for one level of the document.
 *
 * The level's OWN `author` participations win and are reported uninherited.
 * With none of its own the nearest enclosing level's reading is carried down and
 * marked `inherited`, which is CDA R2's context conduction reported as what it
 * is: the nearest enclosing author, not this level's. `undefined` propagates
 * unchanged, so a level inside a document that names no author anywhere reads
 * absent rather than empty and nothing else in the header is substituted for it.
 *
 * An `enclosing` reading that was itself inherited stays `inherited` on the way
 * down: it is still not this level's own, however many levels it has travelled.
 *
 * @internal
 */
export function readAuthorship(
  el: Element,
  ctx: ParseCtx,
  enclosing: CcdaAuthorship | undefined,
): CcdaAuthorship | undefined {
  const own = children(el, "author").map((a) => parseAuthor(a, ctx));
  if (own.length > 0) return { authors: own, inherited: false };
  if (enclosing === undefined) return undefined;
  return enclosing.inherited ? enclosing : { authors: enclosing.authors, inherited: true };
}

/**
 * Parse an `<author>` participation into a {@link CcdaAuthor}. Never throws: an
 * `author` with no `assignedAuthor`, or with children in an order CDA R2 does
 * not use, yields whatever is readable and omits the rest, because `child()`
 * matches a direct child by name rather than by position.
 *
 * Emits `UNIDENTIFIED_AUTHOR` when the `assignedAuthor` carries neither an
 * `assignedPerson` nor an `assignedAuthoringDevice`, positioned on the `author`
 * element. That is also the reading an `author` with no `assignedAuthor` at all
 * gets: nothing in it identifies anybody either.
 *
 * @internal
 */
function parseAuthor(authorEl: Element, ctx: ParseCtx): CcdaAuthor {
  const out: {
    identifiers: readonly II[];
    person?: HumanName;
    device?: CcdaAuthoringDevice;
    representedOrganization?: CcdaOrganization;
    time?: TS;
    unidentified: boolean;
  } = { identifiers: [], unidentified: true };

  const time = parseTs(child(authorEl, "time"), ctx);
  if (time !== undefined) out.time = time;

  const assigned = child(authorEl, "assignedAuthor");
  if (assigned !== undefined) {
    out.identifiers = children(assigned, "id")
      .map((idEl) => parseIi(idEl, ctx))
      .filter((ii): ii is II => ii !== undefined);

    const personEl = child(assigned, "assignedPerson");
    if (personEl !== undefined) {
      const nameEl = child(personEl, "name");
      out.person = nameEl === undefined ? {} : parseName(nameEl);
    }

    const deviceEl = child(assigned, "assignedAuthoringDevice");
    if (deviceEl !== undefined) out.device = parseAuthoringDevice(deviceEl);

    const orgEl = child(assigned, "representedOrganization");
    if (orgEl !== undefined) out.representedOrganization = parseOrganization(orgEl, ctx);
  }

  out.unidentified = out.person === undefined && out.device === undefined;
  if (out.unidentified) ctx.emit(unidentifiedAuthor(positionOf(authorEl)));
  return out;
}

/** Parse an `<assignedAuthoringDevice>` into a {@link CcdaAuthoringDevice}. @internal */
function parseAuthoringDevice(deviceEl: Element): CcdaAuthoringDevice {
  const out: { manufacturerModelName?: string; softwareName?: string } = {};
  const modelEl = child(deviceEl, "manufacturerModelName");
  const model = modelEl === undefined ? undefined : text(modelEl);
  if (model !== undefined) out.manufacturerModelName = model;
  const softwareEl = child(deviceEl, "softwareName");
  const software = softwareEl === undefined ? undefined : text(softwareEl);
  if (software !== undefined) out.softwareName = software;
  return out;
}

/** Parse an organization element into a {@link CcdaOrganization}. @internal */
function parseOrganization(orgEl: Element, ctx: ParseCtx): CcdaOrganization {
  const out: { identifiers: readonly II[]; name?: string } = {
    identifiers: children(orgEl, "id")
      .map((idEl) => parseIi(idEl, ctx))
      .filter((ii): ii is II => ii !== undefined),
  };
  const nameEl = child(orgEl, "name");
  const name = nameEl === undefined ? undefined : text(nameEl);
  if (name !== undefined) out.name = name;
  return out;
}

/**
 * Parse a `<custodian>` into a {@link CcdaCustodian}. A `custodian` with no
 * `assignedCustodian`, or an `assignedCustodian` with no
 * `representedCustodianOrganization`, yields the participation with no
 * organization rather than throwing or inventing one.
 *
 * @internal
 */
function parseCustodian(custodianEl: Element, ctx: ParseCtx): CcdaCustodian {
  const assigned = child(custodianEl, "assignedCustodian");
  if (assigned === undefined) return {};
  const orgEl = child(assigned, "representedCustodianOrganization");
  if (orgEl === undefined) return {};
  return { organization: parseOrganization(orgEl, ctx) };
}

/**
 * Parse an `<encompassingEncounter>` into a {@link CcdaEncompassingEncounter}.
 * An encounter with no `effectiveTime` yields the frame with no period rather
 * than throwing, and nothing else in the document is read in its place.
 *
 * @internal
 */
function parseEncompassingEncounter(
  encounterEl: Element,
  ctx: ParseCtx,
): CcdaEncompassingEncounter {
  const out: { effectiveTime?: IVL_TS; dischargeDispositionCode?: CD } = {};
  const effectiveTime = parseIvlTs(child(encounterEl, "effectiveTime"), ctx);
  if (effectiveTime !== undefined) out.effectiveTime = effectiveTime;
  const disposition = parseCd(child(encounterEl, "dischargeDispositionCode"), ctx);
  if (disposition !== undefined) out.dischargeDispositionCode = disposition;
  return out;
}

/**
 * The `@value` of an `INT`-typed element (e.g. `<versionNumber value="2"/>`) as
 * a finite number, or `undefined` when the element or a parseable value is
 * absent. @internal
 */
function intValue(el: Element | undefined): number | undefined {
  if (el === undefined) return undefined;
  const raw = attr(el, "value");
  if (raw === undefined) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

/** Parse a `<relatedDocument>` into a {@link RelatedDocument}. @internal */
function parseRelatedDocument(rd: Element, ctx: ParseCtx): RelatedDocument {
  const parentEl = child(rd, "parentDocument");
  const parent: {
    ids: readonly II[];
    code?: CD;
    setId?: II;
    versionNumber?: number;
  } = { ids: [] };
  if (parentEl !== undefined) {
    parent.ids = children(parentEl, "id")
      .map((idEl) => parseIi(idEl, ctx))
      .filter((ii): ii is II => ii !== undefined);
    const code = parseCd(child(parentEl, "code"), ctx);
    if (code !== undefined) parent.code = code;
    const parentSetId = parseIi(child(parentEl, "setId"), ctx);
    if (parentSetId !== undefined) parent.setId = parentSetId;
    const parentVersion = intValue(child(parentEl, "versionNumber"));
    if (parentVersion !== undefined) parent.versionNumber = parentVersion;
  }
  const out: { typeCode?: string; parentDocument: ParentDocument } = { parentDocument: parent };
  const typeCode = attr(rd, "typeCode");
  if (typeCode !== undefined) out.typeCode = typeCode;
  return out;
}

/** Extract a patient from a `patientRole` element. @internal */
function buildPatient(patientRole: Element, ctx: ParseCtx): CcdaPatient {
  const out: {
    identifiers: readonly II[];
    name?: HumanName;
    genderCode?: CD;
    birthTime?: TS;
    maritalStatusCode?: CD;
    raceCode?: CD;
    ethnicGroupCode?: CD;
  } = { identifiers: [] };

  const identifiers = children(patientRole, "id")
    .map((idEl) => {
      const ii = parseIi(idEl, ctx);
      if (ii !== undefined && ii.root !== undefined && ii.assigningAuthorityName === undefined) {
        ctx.emit(missingAssigningAuthority(positionOf(idEl)));
      }
      return ii;
    })
    .filter((ii): ii is II => ii !== undefined);
  out.identifiers = identifiers;

  const patient = child(patientRole, "patient");
  if (patient !== undefined) {
    const nameEl = child(patient, "name");
    if (nameEl !== undefined) out.name = parseName(nameEl);
    const genderCode = parseCd(child(patient, "administrativeGenderCode"), ctx);
    if (genderCode !== undefined) out.genderCode = genderCode;
    const birthTime = parseTs(child(patient, "birthTime"), ctx);
    if (birthTime !== undefined) out.birthTime = birthTime;
    const maritalStatusCode = parseCd(child(patient, "maritalStatusCode"), ctx);
    if (maritalStatusCode !== undefined) out.maritalStatusCode = maritalStatusCode;
    const raceCode = parseCd(child(patient, "raceCode"), ctx);
    if (raceCode !== undefined) out.raceCode = raceCode;
    const ethnicGroupCode = parseCd(child(patient, "ethnicGroupCode"), ctx);
    if (ethnicGroupCode !== undefined) out.ethnicGroupCode = ethnicGroupCode;
  }

  return out;
}

/** Parse a `<name>` element into a {@link HumanName}. @internal */
function parseName(nameEl: Element): HumanName {
  const out: {
    prefix?: readonly string[];
    given?: readonly string[];
    family?: string;
    suffix?: readonly string[];
    text?: string;
  } = {};

  const prefix = textParts(children(nameEl, "prefix"));
  if (prefix.length > 0) out.prefix = prefix;
  const given = textParts(children(nameEl, "given"));
  if (given.length > 0) out.given = given;
  const familyEl = child(nameEl, "family");
  const family = familyEl === undefined ? undefined : text(familyEl);
  if (family !== undefined) out.family = family;
  const suffix = textParts(children(nameEl, "suffix"));
  if (suffix.length > 0) out.suffix = suffix;
  const whole = text(nameEl);
  if (whole !== undefined) out.text = whole;

  return out;
}

/** Map a list of elements to their non-empty trimmed text values. @internal */
function textParts(els: readonly Element[]): readonly string[] {
  return els.map((e) => text(e)).filter((t): t is string => t !== undefined);
}
