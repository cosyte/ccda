/**
 * US Realm Header model + extraction for `@cosyte/ccda`. The C-CDA header is
 * the CDA R2 wrapper around every document type: the document `id`/`code`/
 * `title`/`effectiveTime`, and one or more `recordTarget` participations
 * carrying the patient. Phase 1 extracts the header fields most consumers
 * reach for first — enough to answer "whose document is this, what kind, and
 * when" in one line.
 */

import { missingAssigningAuthority, multipleRecordTargets } from "../parser/warnings.js";
import { attr, child, children, positionOf, text } from "./dom.js";
import { parseCd, type CD } from "./types/cd.js";
import { parseIi, type II } from "./types/ii.js";
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
 * The parsed US Realm Header. `documentId` + `code` + `title` + `effectiveTime`
 * answer the document's identity; `recordTargets` are the patient(s) (usually
 * exactly one — more than one emits `MULTIPLE_RECORD_TARGETS`).
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
  readonly recordTargets: readonly CcdaPatient[];
}

/**
 * Extract the {@link CcdaHeader} from a `ClinicalDocument` root element. Never
 * throws; omits any field the document does not carry. Emits
 * `MULTIPLE_RECORD_TARGETS` when more than one `recordTarget` is present.
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
    recordTargets: readonly CcdaPatient[];
  } = { recordTargets: [] };

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

  const recordTargets = children(root, "recordTarget");
  if (recordTargets.length > 1) {
    ctx.emit(multipleRecordTargets(positionOf(root), recordTargets.length));
  }
  out.recordTargets = recordTargets
    .map((rt) => child(rt, "patientRole"))
    .filter((pr): pr is Element => pr !== undefined)
    .map((pr) => buildPatient(pr, ctx));

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
