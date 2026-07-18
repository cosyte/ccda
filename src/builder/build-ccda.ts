/**
 * `buildCcda` — the conservative *emit* factory for `@cosyte/ccda`, symmetric
 * with `parseCcda` and mirroring the sibling `@cosyte/hl7`'s `buildMessage`.
 * From a semantic {@link BuildCcdaInit} it assembles a **spec-clean C-CDA R2.1
 * document** — correct `templateId`s, LOINC section codes, structured entries
 * whose coded values agree with a regenerated narrative — and returns a real
 * {@link CcdaDocument}.
 *
 * **Round-trip by construction.** The builder emits through the *same DOM the
 * parser reads*: it builds a `@xmldom/xmldom` document, serializes it with the
 * shared serializer, then parses that text with {@link parseCcda}. The returned
 * document is therefore the parse of the emitted XML — a document `buildCcda`
 * emits always parses back to the same structured content, and
 * `parseCcda(doc.toString()).toString() === doc.toString()` (the serializer
 * fixed-point) holds automatically. A clean build produces **zero warnings**.
 *
 * **Scope (first builder slice).** This slice emits a **Continuity of Care
 * Document (CCD)** with the full US Realm Header and the two safety-critical
 * reconciliation sections — **Problems** and **Allergies** (including the
 * `negationInd` "No Known Allergies" form, the single most safety-critical emit
 * rule) — populated from structured input. The other CCD `SHALL` sections
 * (Medications, Results) are emitted as spec-clean, empty `nullFlavor="NI"`
 * sections so the document is conformant. Richer section builders, the other
 * eleven document types, and the bring-your-own-credentials terminology adapter
 * are deferred to a later CCDA-P7 increment.
 *
 * @packageDocumentation
 */

import { LOINC, RXNORM, SNOMED_CT } from "../model/code-systems.js";
import type { CcdaDocument } from "../model/document.js";
import { parseCcda } from "../parser/index.js";
import {
  ALLERGY_CONCERN_ACT,
  ALLERGY_OBSERVATION,
  CRITICALITY_OBSERVATION,
  PROBLEM_CONCERN_ACT,
  PROBLEM_OBSERVATION,
  REACTION_OBSERVATION,
  SEVERITY_OBSERVATION,
} from "../model/entries/shared.js";
import { serializeDocument } from "../serialize/serialize-dom.js";

import { el, newCdaDocument, textEl, typedValue, type Attrs } from "./dom.js";
import type { Document, Element } from "@xmldom/xmldom";

/** The US Realm Header template OID (root); the R2.1 stamp lives in `@extension`. @internal */
const US_REALM_HEADER = "2.16.840.1.113883.10.20.22.1.1";
/** The CCD document template OID (root). @internal */
const CCD_TEMPLATE = "2.16.840.1.113883.10.20.22.1.2";
/** The C-CDA R2.1 version stamp carried in a versioned `templateId/@extension`. @internal */
const R21 = "2015-08-01";
/** A synthetic (non-real) assigning-authority OID for builder-generated ids. @internal */
const SYNTH_ROOT = "2.16.840.1.113883.19.5.99999";
/** The v3 ActCode `ASSERTION` code system, used on allergy/reaction observations. @internal */
const ACT_CODE = "2.16.840.1.113883.5.4";
/** The LOINC document-type code + title for a CCD. @internal */
const CCD_DOC_CODE = { code: "34133-9", displayName: "Summarization of Episode Note" } as const;

/**
 * A coded value for the builder — the tuple the parser reads back as a `CD`.
 * `codeSystem` defaults per slot (SNOMED CT for a problem, RxNorm for an
 * allergen), so most callers pass only `code` + `displayName`.
 *
 * @example
 * ```ts
 * import type { BuildCode } from "@cosyte/ccda";
 * const hypertension: BuildCode = { code: "59621000", displayName: "Essential hypertension" };
 * ```
 */
export interface BuildCode {
  /** The code within its system (e.g. a SNOMED CT concept id). */
  readonly code: string;
  /** The code system OID; defaults per slot when omitted. */
  readonly codeSystem?: string;
  /** The human-readable label — regenerated into the narrative so the two agree. */
  readonly displayName: string;
  /** The code system's human name (e.g. `"SNOMED CT"`), optional. */
  readonly codeSystemName?: string;
}

/**
 * A patient for the document's single `recordTarget`. Every field is optional;
 * an omitted demographic is emitted as a spec-clean `nullFlavor="UNK"` rather
 * than invented. Supply `mrn` to set the patient identifier the parser returns
 * from {@link CcdaDocument.getMrn}.
 *
 * @example
 * ```ts
 * import type { BuildCcdaPatient } from "@cosyte/ccda";
 * const patient: BuildCcdaPatient = {
 *   mrn: "MRN001",
 *   given: ["Jane"],
 *   family: "Doe",
 *   gender: "F",
 *   birthTime: "19800101",
 * };
 * ```
 */
export interface BuildCcdaPatient {
  /** The medical record number (the `patientRole/id/@extension`). */
  readonly mrn?: string;
  /** The assigning-authority OID for the MRN; defaults to a synthetic root. */
  readonly mrnRoot?: string;
  /** The assigning-authority name for the MRN; defaults to a synthetic label. */
  readonly mrnAssigningAuthority?: string;
  readonly prefix?: readonly string[];
  readonly given?: readonly string[];
  readonly family?: string;
  readonly suffix?: readonly string[];
  /** Administrative gender code (`M` / `F` / `UN`), HL7 AdministrativeGender. */
  readonly gender?: string;
  /** Birth time as an HL7 date/datetime string (e.g. `"19800101"`). */
  readonly birthTime?: string;
}

/**
 * A Problem Concern for the Problems section. The coded `problem` (SNOMED CT by
 * default, or ICD-10-CM) is the condition; `status` maps to the concern act's
 * status (active/resolved/inactive) and is never guessed.
 *
 * @example
 * ```ts
 * import type { BuildCcdaProblem } from "@cosyte/ccda";
 * const p: BuildCcdaProblem = {
 *   problem: { code: "59621000", displayName: "Essential hypertension" },
 *   status: "active",
 *   onset: "20210101",
 * };
 * ```
 */
export interface BuildCcdaProblem {
  /** The coded condition (SNOMED CT default, or ICD-10-CM). */
  readonly problem: BuildCode;
  /** Active / resolved / inactive; defaults to `"active"`. */
  readonly status?: "active" | "resolved" | "inactive";
  /** Onset date as an HL7 date string (e.g. `"20210101"`), optional. */
  readonly onset?: string;
}

/**
 * An Allergy Concern for the Allergies section. Either an `allergen` (RxNorm at
 * ingredient level by default, or UNII / SNOMED CT) **or** `noKnownAllergy:
 * true` (the `negationInd` "No Known Allergies" assertion) is required — the two
 * are never conflated. `reaction`, `severity`, and `criticality` are optional;
 * severity (of a reaction) and criticality (of the propensity) are distinct axes.
 *
 * @example
 * ```ts
 * import type { BuildCcdaAllergy } from "@cosyte/ccda";
 * const penicillin: BuildCcdaAllergy = {
 *   allergen: { code: "7980", displayName: "Penicillin G" },
 *   reaction: { code: "247472004", displayName: "Hives" },
 *   criticality: { code: "CRITH", displayName: "High criticality" },
 * };
 * const nka: BuildCcdaAllergy = { noKnownAllergy: true };
 * ```
 */
export interface BuildCcdaAllergy {
  /** The offending substance (RxNorm ingredient default, or UNII / SNOMED CT). */
  readonly allergen?: BuildCode;
  /**
   * The propensity **type** — the Allergy-Intolerance Observation `value` (SNOMED
   * CT by default), from the C-CDA Allergy/Intolerance Type value set: e.g. drug
   * allergy `416098002`, food allergy `414285001`, environmental `426232007`.
   * Defaults to the neutral `419199007` "Allergy to substance" — the builder does
   * **not** guess "Drug allergy" for a non-drug allergen.
   */
  readonly type?: BuildCode;
  /** Assert "No Known Allergies" (`negationInd="true"`) — mutually exclusive with `allergen`. */
  readonly noKnownAllergy?: boolean;
  /** The reaction manifestation (SNOMED CT by default), optional. */
  readonly reaction?: BuildCode;
  /** The reaction's severity (SNOMED CT by default), optional. */
  readonly severity?: BuildCode;
  /** The propensity criticality (HL7 ObservationValue by default), optional. */
  readonly criticality?: BuildCode;
  /** Active / resolved / inactive; defaults to `"active"`. */
  readonly status?: "active" | "resolved" | "inactive";
}

/**
 * Input to {@link buildCcda}. `patient` is required; `problems` and `allergies`
 * default to empty (their sections are then emitted as spec-clean empty
 * `nullFlavor="NI"` sections). `documentType` is `"ccd"` in this slice.
 *
 * @example
 * ```ts
 * import type { BuildCcdaInit } from "@cosyte/ccda";
 * const init: BuildCcdaInit = {
 *   patient: { mrn: "MRN001", given: ["Jane"], family: "Doe", gender: "F" },
 *   problems: [{ problem: { code: "59621000", displayName: "Essential hypertension" } }],
 *   allergies: [{ noKnownAllergy: true }],
 * };
 * ```
 */
export interface BuildCcdaInit {
  /** The document type. Only `"ccd"` is supported in this builder slice. */
  readonly documentType?: "ccd";
  /** The document `id`'s extension; a synthetic id is generated when omitted. */
  readonly documentId?: string;
  /** The document title; defaults to the CCD document-code display name. */
  readonly title?: string;
  /** The document `effectiveTime` (a `Date` is formatted to UTC); defaults to now. */
  readonly effectiveTime?: Date | string;
  /** The document language; defaults to `"en-US"`. */
  readonly languageCode?: string;
  /** The confidentiality code; defaults to `"N"` (normal). */
  readonly confidentiality?: string;
  /** The custodian organization name; defaults to a synthetic label. */
  readonly custodianName?: string;
  /** The single record-target patient (required). */
  readonly patient: BuildCcdaPatient;
  /** Problem Concerns for the Problems section; empty section when omitted. */
  readonly problems?: readonly BuildCcdaProblem[];
  /** Allergy Concerns for the Allergies section; empty section when omitted. */
  readonly allergies?: readonly BuildCcdaAllergy[];
}

/** A monotonic id generator scoped to one build, for stable act/content ids. @internal */
function makeIdGen(): (prefix: string) => string {
  let n = 0;
  return (prefix) => `${prefix}-${(++n).toString()}`;
}

/** Format an `effectiveTime` input to an HL7 v3 timestamp string. @internal */
function formatEffectiveTime(input: Date | string | undefined): string {
  if (typeof input === "string") return input;
  const d = input ?? new Date();
  const p = (v: number, width = 2): string => v.toString().padStart(width, "0");
  return (
    `${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}+0000`
  );
}

/**
 * Build a spec-clean C-CDA R2.1 CCD from structured input and return the parsed
 * {@link CcdaDocument}. The emitted document round-trips through {@link parseCcda}
 * by construction (see the module doc); a clean build carries zero warnings.
 *
 * @param init - The document content; see {@link BuildCcdaInit}. `patient` is required.
 * @returns The parsed document — the parse of the spec-clean XML just emitted.
 * @throws {TypeError} When `documentType` is anything other than `"ccd"` (the
 *   only type this slice supports), or when an allergy is neither an `allergen`
 *   nor `noKnownAllergy`.
 * @example
 * ```ts
 * import { buildCcda, serializeCcda } from "@cosyte/ccda";
 * const doc = buildCcda({
 *   patient: { mrn: "MRN001", given: ["Jane"], family: "Doe", gender: "F" },
 *   problems: [{ problem: { code: "59621000", displayName: "Essential hypertension" } }],
 *   allergies: [{ allergen: { code: "7980", displayName: "Penicillin G" } }],
 * });
 * console.log(doc.getMrn());                 // "MRN001"
 * console.log(doc.getProblems().length);     // 1
 * const xml = serializeCcda(doc);            // spec-clean C-CDA R2.1
 * ```
 */
export function buildCcda(init: BuildCcdaInit): CcdaDocument {
  // Typed as `"ccd"` so the compiler narrows an invalid value to `never`; widen
  // to a string for the runtime guard that protects untyped (JS) callers.
  const documentType: string | undefined = init.documentType;
  if (documentType !== undefined && documentType !== "ccd") {
    throw new TypeError(
      `buildCcda: documentType "${documentType}" is not supported yet — this builder ` +
        'slice emits a CCD only. Omit documentType or pass "ccd".',
    );
  }

  const { doc, root } = newCdaDocument();
  const id = makeIdGen();
  const effectiveTime = formatEffectiveTime(init.effectiveTime);

  appendHeader(doc, root, init, effectiveTime, id);

  const structuredBody = el(doc, "structuredBody");
  structuredBody.appendChild(problemsSection(doc, init.problems ?? [], id));
  structuredBody.appendChild(allergiesSection(doc, init.allergies ?? [], id));
  structuredBody.appendChild(emptySection(doc, MEDICATIONS_SECTION_BASE, "10160-0", "Medications"));
  structuredBody.appendChild(emptySection(doc, RESULTS_SECTION_BASE, "30954-2", "Results"));
  root.appendChild(el(doc, "component", undefined, structuredBody));

  return parseCcda(serializeDocument(doc));
}

/** Emit the US Realm Header, record target, author (device), and custodian. @internal */
function appendHeader(
  doc: Document,
  root: Element,
  init: BuildCcdaInit,
  effectiveTime: string,
  id: (prefix: string) => string,
): void {
  root.appendChild(el(doc, "realmCode", { code: "US" }));
  root.appendChild(
    el(doc, "typeId", { root: "2.16.840.1.113883.1.3", extension: "POCD_HD000040" }),
  );
  root.appendChild(el(doc, "templateId", { root: US_REALM_HEADER, extension: R21 }));
  root.appendChild(el(doc, "templateId", { root: CCD_TEMPLATE, extension: R21 }));
  root.appendChild(el(doc, "id", { root: SYNTH_ROOT, extension: init.documentId ?? id("doc") }));
  root.appendChild(codeEl(doc, "code", { ...CCD_DOC_CODE, codeSystem: LOINC }));
  root.appendChild(textEl(doc, "title", init.title ?? CCD_DOC_CODE.displayName));
  root.appendChild(el(doc, "effectiveTime", { value: effectiveTime }));
  root.appendChild(
    el(doc, "confidentialityCode", {
      code: init.confidentiality ?? "N",
      codeSystem: "2.16.840.1.113883.5.25",
    }),
  );
  root.appendChild(el(doc, "languageCode", { code: init.languageCode ?? "en-US" }));
  root.appendChild(recordTarget(doc, init.patient));
  root.appendChild(author(doc, effectiveTime));
  root.appendChild(custodian(doc, init.custodianName ?? "Synthetic Health Organization"));
}

/**
 * A `nullFlavor="UNK"` `<addr>` — satisfies the US Realm Header's SHALL
 * `addr[1..*]` cardinality on `patientRole` / `assignedAuthor` /
 * `representedCustodianOrganization` without inventing (fabricating) a synthetic
 * street address. Consistent with the omitted-demographic policy elsewhere.
 * @internal
 */
function addrStub(doc: Document): Element {
  return el(doc, "addr", { nullFlavor: "UNK" });
}

/** A `nullFlavor="UNK"` `<telecom>` — satisfies the SHALL `telecom[1..*]` cardinality. @internal */
function telecomStub(doc: Document): Element {
  return el(doc, "telecom", { nullFlavor: "UNK" });
}

/** Build the `recordTarget/patientRole`. @internal */
function recordTarget(doc: Document, patient: BuildCcdaPatient): Element {
  const patientRole = el(doc, "patientRole");
  if (patient.mrn !== undefined) {
    patientRole.appendChild(
      el(doc, "id", {
        root: patient.mrnRoot ?? SYNTH_ROOT,
        extension: patient.mrn,
        assigningAuthorityName: patient.mrnAssigningAuthority ?? "Synthetic Health Authority",
      }),
    );
  } else {
    patientRole.appendChild(el(doc, "id", { nullFlavor: "UNK" }));
  }
  // US Realm Header: patientRole SHALL addr[1..*] + telecom[1..*] (before patient).
  patientRole.appendChild(addrStub(doc));
  patientRole.appendChild(telecomStub(doc));
  patientRole.appendChild(patientEl(doc, patient));
  return el(doc, "recordTarget", undefined, patientRole);
}

/** Build the `<patient>` demographics, using `nullFlavor="UNK"` for omitted facts. @internal */
function patientEl(doc: Document, patient: BuildCcdaPatient): Element {
  const p = el(doc, "patient");
  p.appendChild(nameEl(doc, patient));
  p.appendChild(
    patient.gender === undefined
      ? el(doc, "administrativeGenderCode", { nullFlavor: "UNK" })
      : el(doc, "administrativeGenderCode", {
          code: patient.gender,
          codeSystem: "2.16.840.1.113883.5.1",
        }),
  );
  p.appendChild(
    patient.birthTime === undefined
      ? el(doc, "birthTime", { nullFlavor: "UNK" })
      : el(doc, "birthTime", { value: patient.birthTime }),
  );
  return p;
}

/** Build a structured `<name>`, or `nullFlavor="UNK"` when no parts are given. @internal */
function nameEl(doc: Document, patient: BuildCcdaPatient): Element {
  const hasParts =
    (patient.given?.length ?? 0) > 0 ||
    patient.family !== undefined ||
    (patient.prefix?.length ?? 0) > 0 ||
    (patient.suffix?.length ?? 0) > 0;
  if (!hasParts) return el(doc, "name", { nullFlavor: "UNK" });
  const name = el(doc, "name");
  for (const prefix of patient.prefix ?? []) name.appendChild(textEl(doc, "prefix", prefix));
  for (const given of patient.given ?? []) name.appendChild(textEl(doc, "given", given));
  if (patient.family !== undefined) name.appendChild(textEl(doc, "family", patient.family));
  for (const suffix of patient.suffix ?? []) name.appendChild(textEl(doc, "suffix", suffix));
  return name;
}

/** Build a minimal device `<author>` (no person → no PHI). @internal */
function author(doc: Document, time: string): Element {
  const device = el(
    doc,
    "assignedAuthoringDevice",
    undefined,
    textEl(doc, "manufacturerModelName", "cosyte"),
    textEl(doc, "softwareName", "@cosyte/ccda"),
  );
  // US Realm Header: assignedAuthor SHALL addr[1..*] + telecom[1..*] (before the
  // assignedPerson/assignedAuthoringDevice).
  const assigned = el(
    doc,
    "assignedAuthor",
    undefined,
    el(doc, "id", { root: SYNTH_ROOT }),
    addrStub(doc),
    telecomStub(doc),
    device,
  );
  return el(doc, "author", undefined, el(doc, "time", { value: time }), assigned);
}

/** Build a minimal `<custodian>` (organization only). @internal */
function custodian(doc: Document, orgName: string): Element {
  // representedCustodianOrganization order: id, name, telecom, addr; the US Realm
  // Header requires telecom[1..1] + addr[1..1].
  const org = el(
    doc,
    "representedCustodianOrganization",
    undefined,
    el(doc, "id", { root: SYNTH_ROOT }),
    textEl(doc, "name", orgName),
    telecomStub(doc),
    addrStub(doc),
  );
  return el(doc, "custodian", undefined, el(doc, "assignedCustodian", undefined, org));
}

/** Build a coded element (`<code>`, propensity `<code>`, …). @internal */
function codeEl(
  doc: Document,
  name: string,
  code: BuildCode & { readonly codeSystem: string },
): Element {
  const attrs: Attrs = {
    code: code.code,
    codeSystem: code.codeSystem,
    displayName: code.displayName,
    codeSystemName: code.codeSystemName,
  };
  return el(doc, name, attrs);
}

/** Build a `<value xsi:type="CD">` from a {@link BuildCode} with a default system. @internal */
function cdValue(doc: Document, code: BuildCode, defaultSystem: string): Element {
  return typedValue(doc, "CD", {
    code: code.code,
    codeSystem: code.codeSystem ?? defaultSystem,
    displayName: code.displayName,
    codeSystemName: code.codeSystemName,
  });
}

/**
 * Build a section's `<templateId>`s. The entries-**optional** template
 * (`root` = base, `@2015-08-01`) is always emitted; the entries-**required**
 * template (`${base}.1`) is added only when the section carries entries — an
 * entries-required template with zero entries violates its "SHALL contain at
 * least one entry" conformance statement, so an empty (`nullFlavor="NI"`)
 * section must NOT declare it.
 * @internal
 */
function sectionTemplateIds(
  doc: Document,
  base: string,
  entriesRequired: boolean,
): readonly Element[] {
  const ids = [el(doc, "templateId", { root: base, extension: R21 })];
  if (entriesRequired) ids.push(el(doc, "templateId", { root: `${base}.1`, extension: R21 }));
  return ids;
}

/**
 * Build a `<section>` shell (`templateId`s, `code`, `title`, `<text>`) ready for
 * entries to be appended. Returned unwrapped so the caller can append entries
 * before wrapping it in a `<component>`.
 * @internal
 */
function sectionElement(
  doc: Document,
  base: string,
  loinc: string,
  title: string,
  textNode: Element,
  entriesRequired: boolean,
  attrs?: Attrs,
): Element {
  const section = el(doc, "section", attrs);
  for (const tid of sectionTemplateIds(doc, base, entriesRequired)) section.appendChild(tid);
  section.appendChild(
    el(doc, "code", {
      code: loinc,
      codeSystem: LOINC,
      displayName: title,
      codeSystemName: "LOINC",
    }),
  );
  section.appendChild(textEl(doc, "title", title));
  section.appendChild(textNode);
  return section;
}

/** Build a spec-clean empty required section (`nullFlavor="NI"`, no entries). @internal */
function emptySection(doc: Document, base: string, loinc: string, title: string): Element {
  const section = sectionElement(
    doc,
    base,
    loinc,
    title,
    textEl(doc, "text", "No information"),
    false,
    { nullFlavor: "NI" },
  );
  return el(doc, "component", undefined, section);
}

/** Entries-optional (base) section template OIDs the builder emits. @internal */
const PROBLEMS_SECTION_BASE = "2.16.840.1.113883.10.20.22.2.5";
/** @internal */
const ALLERGIES_SECTION_BASE = "2.16.840.1.113883.10.20.22.2.6";
/** @internal */
const MEDICATIONS_SECTION_BASE = "2.16.840.1.113883.10.20.22.2.1";
/** @internal */
const RESULTS_SECTION_BASE = "2.16.840.1.113883.10.20.22.2.3";

/** Build the Problems section — populated, or empty when there are none. @internal */
function problemsSection(
  doc: Document,
  problems: readonly BuildCcdaProblem[],
  id: (prefix: string) => string,
): Element {
  if (problems.length === 0) {
    return emptySection(doc, PROBLEMS_SECTION_BASE, "11450-4", "Problems");
  }
  const text = el(doc, "text");
  const entries: Element[] = [];
  for (const p of problems) {
    const contentId = id("prob-txt");
    text.appendChild(textEl(doc, "content", p.problem.displayName, { ID: contentId }));
    entries.push(problemEntry(doc, p, contentId, id));
  }
  const section = sectionElement(doc, PROBLEMS_SECTION_BASE, "11450-4", "Problems", text, true);
  for (const entry of entries) section.appendChild(entry);
  return el(doc, "component", undefined, section);
}

/** Build one Problem Concern Act `<entry>`. @internal */
function problemEntry(
  doc: Document,
  p: BuildCcdaProblem,
  contentId: string,
  id: (prefix: string) => string,
): Element {
  const obs = el(
    doc,
    "observation",
    { classCode: "OBS", moodCode: "EVN" },
    el(doc, "templateId", { root: PROBLEM_OBSERVATION, extension: R21 }),
    el(doc, "id", { root: SYNTH_ROOT, extension: id("prob-obs") }),
    el(doc, "code", {
      code: "55607006",
      codeSystem: SNOMED_CT,
      displayName: "Problem",
      codeSystemName: "SNOMED CT",
    }),
    el(doc, "statusCode", { code: "completed" }),
  );
  if (p.onset !== undefined) {
    obs.appendChild(el(doc, "effectiveTime", undefined, el(doc, "low", { value: p.onset })));
  }
  obs.appendChild(cdValue(doc, p.problem, SNOMED_CT));
  obs.appendChild(el(doc, "text", undefined, el(doc, "reference", { value: `#${contentId}` })));

  const act = el(
    doc,
    "act",
    { classCode: "ACT", moodCode: "EVN" },
    el(doc, "templateId", { root: PROBLEM_CONCERN_ACT, extension: R21 }),
    el(doc, "id", { root: SYNTH_ROOT, extension: id("prob-act") }),
    el(doc, "statusCode", { code: concernStatusCode(p.status) }),
  );
  if (p.onset !== undefined) {
    act.appendChild(el(doc, "effectiveTime", undefined, el(doc, "low", { value: p.onset })));
  }
  act.appendChild(el(doc, "entryRelationship", { typeCode: "SUBJ" }, obs));
  return el(doc, "entry", undefined, act);
}

/** Build the Allergies section — populated, or empty when there are none. @internal */
function allergiesSection(
  doc: Document,
  allergies: readonly BuildCcdaAllergy[],
  id: (prefix: string) => string,
): Element {
  if (allergies.length === 0) {
    return emptySection(doc, ALLERGIES_SECTION_BASE, "48765-2", "Allergies");
  }
  const text = el(doc, "text");
  const entries: Element[] = [];
  for (const a of allergies) {
    if (a.noKnownAllergy !== true && a.allergen === undefined) {
      throw new TypeError(
        "buildCcda: each allergy must set either `allergen` or `noKnownAllergy: true`.",
      );
    }
    const label = a.noKnownAllergy === true ? "No known allergies" : a.allergen?.displayName;
    const contentId = id("alg-txt");
    text.appendChild(textEl(doc, "content", label ?? "No known allergies", { ID: contentId }));
    entries.push(allergyEntry(doc, a, contentId, id));
  }
  const section = sectionElement(doc, ALLERGIES_SECTION_BASE, "48765-2", "Allergies", text, true);
  for (const entry of entries) section.appendChild(entry);
  return el(doc, "component", undefined, section);
}

/** Build one Allergy Concern Act `<entry>`. @internal */
function allergyEntry(
  doc: Document,
  a: BuildCcdaAllergy,
  contentId: string,
  id: (prefix: string) => string,
): Element {
  const nka = a.noKnownAllergy === true;
  const obsAttrs: Attrs = nka
    ? { classCode: "OBS", moodCode: "EVN", negationInd: "true" }
    : { classCode: "OBS", moodCode: "EVN" };
  const obs = el(
    doc,
    "observation",
    obsAttrs,
    el(doc, "templateId", { root: ALLERGY_OBSERVATION, extension: "2014-06-09" }),
    el(doc, "id", { root: SYNTH_ROOT, extension: id("alg-obs") }),
    el(doc, "code", { code: "ASSERTION", codeSystem: ACT_CODE }),
    el(doc, "statusCode", { code: "completed" }),
  );
  // The observation value is the propensity *type* (NOT the allergen). It defaults
  // to the neutral SNOMED "Allergy to substance" (419199007) — never a guessed
  // "Drug allergy", which would mis-classify a food/environmental allergen. A
  // caller sets `type` for the specific class.
  obs.appendChild(
    cdValue(doc, a.type ?? { code: "419199007", displayName: "Allergy to substance" }, SNOMED_CT),
  );
  if (!nka && a.allergen !== undefined) {
    obs.appendChild(allergenParticipant(doc, a.allergen));
  }
  if (a.reaction !== undefined) obs.appendChild(reactionRelationship(doc, a.reaction, a.severity));
  if (a.criticality !== undefined) obs.appendChild(criticalityRelationship(doc, a.criticality));
  obs.appendChild(el(doc, "text", undefined, el(doc, "reference", { value: `#${contentId}` })));

  const act = el(
    doc,
    "act",
    { classCode: "ACT", moodCode: "EVN" },
    el(doc, "templateId", { root: ALLERGY_CONCERN_ACT, extension: R21 }),
    el(doc, "id", { root: SYNTH_ROOT, extension: id("alg-act") }),
    el(doc, "statusCode", { code: concernStatusCode(a.status) }),
    el(doc, "entryRelationship", { typeCode: "SUBJ" }, obs),
  );
  return el(doc, "entry", undefined, act);
}

/** Build the allergen `participant/participantRole/playingEntity/code`. @internal */
function allergenParticipant(doc: Document, allergen: BuildCode): Element {
  const playingEntity = el(
    doc,
    "playingEntity",
    { classCode: "MMAT" },
    codeEl(doc, "code", { ...allergen, codeSystem: allergen.codeSystem ?? RXNORM }),
  );
  const role = el(doc, "participantRole", { classCode: "MANU" }, playingEntity);
  return el(doc, "participant", { typeCode: "CSM" }, role);
}

/** Build a Reaction Observation relationship, with a nested Severity when given. @internal */
function reactionRelationship(
  doc: Document,
  reaction: BuildCode,
  severity: BuildCode | undefined,
): Element {
  const obs = el(
    doc,
    "observation",
    { classCode: "OBS", moodCode: "EVN" },
    el(doc, "templateId", { root: REACTION_OBSERVATION, extension: "2014-06-09" }),
    el(doc, "code", { code: "ASSERTION", codeSystem: ACT_CODE }),
    el(doc, "statusCode", { code: "completed" }),
    cdValue(doc, reaction, SNOMED_CT),
  );
  if (severity !== undefined) {
    const sev = el(
      doc,
      "observation",
      { classCode: "OBS", moodCode: "EVN" },
      el(doc, "templateId", { root: SEVERITY_OBSERVATION, extension: "2014-06-09" }),
      el(doc, "code", { code: "SEV", codeSystem: ACT_CODE }),
      el(doc, "statusCode", { code: "completed" }),
      cdValue(doc, severity, SNOMED_CT),
    );
    obs.appendChild(el(doc, "entryRelationship", { typeCode: "SUBJ", inversionInd: "true" }, sev));
  }
  return el(doc, "entryRelationship", { typeCode: "MFST", inversionInd: "true" }, obs);
}

/** Build a Criticality Observation relationship on the propensity. @internal */
function criticalityRelationship(doc: Document, criticality: BuildCode): Element {
  const obs = el(
    doc,
    "observation",
    { classCode: "OBS", moodCode: "EVN" },
    el(doc, "templateId", { root: CRITICALITY_OBSERVATION }),
    el(doc, "code", { code: "82606-5", codeSystem: LOINC, displayName: "Criticality" }),
    el(doc, "statusCode", { code: "completed" }),
    cdValue(doc, criticality, "2.16.840.1.113883.5.1063"),
  );
  return el(doc, "entryRelationship", { typeCode: "SUBJ", inversionInd: "true" }, obs);
}

/** Map a builder status to the concern act's `statusCode/@code`. @internal */
function concernStatusCode(status: "active" | "resolved" | "inactive" | undefined): string {
  switch (status) {
    case "resolved":
      return "completed";
    case "inactive":
      return "suspended";
    case "active":
    case undefined:
    default:
      return "active";
  }
}
