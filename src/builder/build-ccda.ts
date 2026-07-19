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
 * **Scope (builder, second slice).** This slice emits a **Continuity of Care
 * Document (CCD)** with the full US Realm Header and populated **discrete-data**
 * sections: the reconciliation triad **Problems** and **Allergies** (including
 * the `negationInd` "No Known Allergies" form, the single most safety-critical
 * emit rule), plus **Medications** (RxNorm drug, dose, route, and the two
 * `effectiveTime` timing siblings), **Results** (Result Organizer → Result
 * Observation with a UCUM-checked `PQ`, coded, or string value, reference range,
 * and interpretation), and **Vital Signs** (Vital Signs Organizer → Vital Sign
 * Observation, LOINC + UCUM). It also emits an **Immunizations** section (an
 * Immunization Activity → Immunization Medication Information with a CVX vaccine,
 * dose, route, and the SHALL administration `effectiveTime`) when the caller
 * supplies immunizations — a `refused` shot is emitted as `negationInd="true"`,
 * never conflated with a `nullFlavor` "unknown", exactly as the parser reads it
 * back. Every section carries the entries-required templateId only when it has
 * entries; a CCD SHALL section (Problems, Allergies, Medications, Results, Vital
 * Signs) for which no content is supplied is emitted as a spec-clean empty
 * `nullFlavor="NI"` section so the document stays conformant. The Immunizations
 * section — not a CCD SHALL section — is emitted only when populated.
 *
 * **This slice adds Procedures and Encounters.** A **Procedures** section emits
 * one of the three Procedure Activity variants — an operative `<procedure>`
 * (`…22.4.14`), a non-altering `<act>` service (`…22.4.12`), or an assessment
 * `<observation>` (`…22.4.13`) — each with its coded procedure, the
 * performed-vs-planned `moodCode` (`EVN`/`INT`, read back as the parser's
 * disposition and never conflated), a SHALL `statusCode`, and the SHOULD [0..1]
 * `effectiveTime` emitted only when supplied. An **Encounters** section emits an
 * Encounter Activity (`…22.4.49`) with its SHALL `code` [1..1] (the encounter
 * type, CPT by default) and SHALL `effectiveTime` [1..1] visit period (an
 * `IVL_TS`; a `nullFlavor="UNK"` low when no period is known). Both — like
 * Immunizations, and unlike the four CCD SHALL sections — are emitted only when
 * populated; neither is a CCD SHALL section, so an empty one is never fabricated.
 * The Procedures section and its entry templates carry the R2.1 `2014-06-09`
 * stamp (not the `2015-08-01` stamp the other sections use).
 *
 * **This slice adds Social History (Smoking Status).** A **Social History**
 * section (`…22.2.17`, LOINC `29762-2`) emits one or more Smoking Status —
 * Meaningful Use observations (`…22.4.78`, the `2014-06-09` stamp) — each with
 * the fixed LOINC `code` (`72166-2` "Tobacco smoking status"), a SHALL
 * `statusCode`, a SHALL `effectiveTime` (the recorded time, `nullFlavor="UNK"`
 * when unknown), and the SHALL SNOMED CT `value` from the Current Smoking Status
 * value set. **Unknown is never defaulted to a status:** when the caller supplies
 * no `value` the SHALL `value` is emitted as `nullFlavor="UNK"` — an explicit
 * unknown the parser reads back as `unknown: true` and flags
 * `SMOKING_STATUS_UNKNOWN` — never invented as a "never smoker" (absent status ≠
 * non-smoker, the single safety rule this section turns on). Like Immunizations,
 * Procedures, and Encounters — and unlike the four CCD SHALL sections — Social
 * History is emitted only when populated; it is a CCD SHOULD section, so an empty
 * one is never fabricated.
 *
 * **SHALL `effectiveTime` on every entry.** Each act/observation the builder
 * emits carries the `effectiveTime` its C-CDA R2.1 template requires — the
 * Problem/Allergy Concern Acts and their observations, the Medication Activity
 * IVL_TS duration, and the Result/Vital Signs organizers and observations. When
 * the caller supplied a time it is used; when a SHALL requires the element but no
 * time is known the slot is filled with `nullFlavor="UNK"` (satisfying the
 * cardinality without fabricating a clinical timestamp, and read back as absent),
 * mirroring how the header's SHALL `addr`/`telecom` and the never-guessed
 * dose/route are handled. The other eleven document types, C-CDA document
 * *editing*, and the bring-your-own-credentials terminology adapter are deferred
 * to a later CCDA-P7 increment.
 *
 * @packageDocumentation
 */

import { CVX, INTERPRETATION, LOINC, NCI_ROUTE, RXNORM, SNOMED_CT } from "../model/code-systems.js";
import type { CcdaDocument } from "../model/document.js";
import type { ProcedureKind } from "../model/entries/procedure.js";
import { parseCcda } from "../parser/index.js";
import {
  ALLERGY_CONCERN_ACT,
  ALLERGY_OBSERVATION,
  CRITICALITY_OBSERVATION,
  ENCOUNTER_ACTIVITY,
  IMMUNIZATION_ACTIVITY,
  IMMUNIZATION_MEDICATION_INFORMATION,
  MEDICATION_ACTIVITY,
  MEDICATION_INFORMATION,
  PROBLEM_CONCERN_ACT,
  PROBLEM_OBSERVATION,
  PROCEDURE_ACTIVITY_ACT,
  PROCEDURE_ACTIVITY_OBSERVATION,
  PROCEDURE_ACTIVITY_PROCEDURE,
  REACTION_OBSERVATION,
  RESULT_OBSERVATION,
  RESULT_ORGANIZER,
  SEVERITY_OBSERVATION,
  SMOKING_STATUS_OBSERVATION,
  VITAL_SIGN_OBSERVATION,
  VITAL_SIGNS_ORGANIZER,
} from "../model/entries/shared.js";
import { serializeDocument } from "../serialize/serialize-dom.js";

import { el, newCdaDocument, textEl, typedEl, typedValue, type Attrs } from "./dom.js";
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
/** The R2.1 `@extension` stamp the Medication Activity/Information templates carry. @internal */
const MED_EXT = "2014-06-09";
/** The R2.1 `@extension` stamp the Vital Sign *Observation* template carries. @internal */
const VITAL_OBS_EXT = "2014-06-09";
/** The `@extension` stamp the Immunization Medication Information template carries. @internal */
const IMMUNIZATION_MED_INFO_EXT = "2014-06-09";
/**
 * The `@extension` stamp carried by the Procedures Section (V2) and all three
 * Procedure Activity templates (Procedure `…4.14`, Act `…4.12`, Observation
 * `…4.13`) — these are R2.1's `2014-06-09` versions, not the `2015-08-01` stamp
 * the other sections use. @internal
 */
const PROCEDURE_EXT = "2014-06-09";
/** The CPT-4 code system OID — the default terminology for an encounter type code. @internal */
const CPT = "2.16.840.1.113883.6.12";
/**
 * The `@extension` stamp carried by the Smoking Status — Meaningful Use (V2)
 * observation template (`…22.4.78`) — R2.1's `2014-06-09` version. @internal
 */
const SMOKING_STATUS_EXT = "2014-06-09";
/**
 * The LOINC `code` every Smoking Status observation carries — `72166-2`
 * "Tobacco smoking status" (fixed by the Smoking Status — Meaningful Use
 * template, independent of the coded `value`). @internal
 */
const SMOKING_STATUS_CODE = {
  code: "72166-2",
  displayName: "Tobacco smoking status",
} as const;

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
 * A dimensioned quantity for the builder — a numeric `value` and a **UCUM** unit
 * (the parser round-trips it as a `PQ`). The unit is emitted verbatim: it is the
 * caller's responsibility that it be valid, case-correct UCUM (`"mg/dL"`,
 * `"mm[Hg]"`, `"10*3/uL"`), because a non-UCUM or case-slipped unit is a real
 * defect the parser is designed to flag (`NON_UCUM_UNIT` / `UCUM_CASE_SUSPECT`) —
 * the builder never silently "corrects" a unit to a confident-wrong value.
 *
 * @example
 * ```ts
 * import type { BuildQuantity } from "@cosyte/ccda";
 * const glucose: BuildQuantity = { value: 95, unit: "mg/dL" };
 * ```
 */
export interface BuildQuantity {
  /** The numeric magnitude. */
  readonly value: number;
  /** The UCUM unit (emitted verbatim — must be valid, case-correct UCUM). */
  readonly unit: string;
}

/**
 * A Medication Activity for the Medications section. `drug` is the RxNorm coded
 * product (RxNorm by default). `dose`, `route`, `frequency`, and `duration` are
 * all optional and **never guessed**: an omitted `dose`/`route` is emitted as
 * absent, which the parser then flags (`MISSING_DOSE_QUANTITY` /
 * `MISSING_ROUTE_CODE`) rather than being defaulted to a confident-wrong value.
 * `frequency` is the periodic timing (a `PIVL_TS` period, e.g. every 8 hours);
 * `duration` is the therapy window (an `IVL_TS` low/high) — the two are emitted
 * as distinct `effectiveTime` siblings, never conflated.
 *
 * @example
 * ```ts
 * import type { BuildCcdaMedication } from "@cosyte/ccda";
 * const lisinopril: BuildCcdaMedication = {
 *   drug: { code: "314076", displayName: "Lisinopril 10 MG Oral Tablet" },
 *   dose: { value: 1, unit: "{tablet}" },
 *   route: { code: "C38288", displayName: "Oral" },
 *   frequency: { value: 24, unit: "h" },
 * };
 * ```
 */
export interface BuildCcdaMedication {
  /** The coded drug product (RxNorm by default, or NDC). */
  readonly drug: BuildCode;
  /** The dose per administration (`doseQuantity`); absent → parser flags it. */
  readonly dose?: BuildQuantity;
  /** The administration route (`routeCode`); NCI Thesaurus by default. */
  readonly route?: BuildCode;
  /** The periodic dosing frequency — a `PIVL_TS` period (e.g. `{ value: 8, unit: "h" }`). */
  readonly frequency?: BuildQuantity;
  /** The therapy window (`IVL_TS`) as HL7 date strings; either bound optional. */
  readonly duration?: { readonly low?: string; readonly high?: string };
  /** Active / resolved / inactive; maps to the `statusCode`. Defaults to `"active"`. */
  readonly status?: "active" | "resolved" | "inactive";
}

/**
 * One member observation of a Results panel — a Result Observation. `test` is the
 * LOINC test code. **Exactly one** value form is required: a UCUM `quantity`
 * (`xsi:type="PQ"`), a `codedValue` (`xsi:type="CD"`), or a `stringValue`
 * (`xsi:type="ST"`) — the builder throws if none (or more than one) is set, so a
 * result value is never silently dropped or invented. `referenceRange` (when
 * given) is emitted as a structured `IVL_PQ` so it round-trips numerically.
 *
 * @example
 * ```ts
 * import type { BuildCcdaResult } from "@cosyte/ccda";
 * const glucose: BuildCcdaResult = {
 *   test: { code: "2345-7", displayName: "Glucose" },
 *   quantity: { value: 95, unit: "mg/dL" },
 *   referenceRange: { low: { value: 70, unit: "mg/dL" }, high: { value: 100, unit: "mg/dL" } },
 *   interpretation: { code: "N", displayName: "Normal" },
 * };
 * ```
 */
export interface BuildCcdaResult {
  /** The LOINC test code. */
  readonly test: BuildCode;
  /** A `PQ` value (UCUM). Exactly one of `quantity`/`codedValue`/`stringValue`. */
  readonly quantity?: BuildQuantity;
  /** A `CD` value. Exactly one of `quantity`/`codedValue`/`stringValue`. */
  readonly codedValue?: BuildCode;
  /** A free-text (`ST`) value. Exactly one of `quantity`/`codedValue`/`stringValue`. */
  readonly stringValue?: string;
  /** The normal interval, emitted as a structured `IVL_PQ`; either bound optional. */
  readonly referenceRange?: { readonly low?: BuildQuantity; readonly high?: BuildQuantity };
  /** The H/L/N interpretation (HL7 ObservationInterpretation by default), optional. */
  readonly interpretation?: BuildCode;
  /** The observation time as an HL7 date string, optional. */
  readonly effectiveTime?: string;
}

/**
 * A Results panel — a Result Organizer (the battery/panel wrapper, e.g. a CBC)
 * around one or more {@link BuildCcdaResult} member observations. `code` is the
 * panel LOINC; `status` maps to the organizer `statusCode` (default
 * `"completed"`).
 *
 * @example
 * ```ts
 * import type { BuildCcdaResultPanel } from "@cosyte/ccda";
 * const cmp: BuildCcdaResultPanel = {
 *   code: { code: "24323-8", displayName: "Comprehensive metabolic panel" },
 *   results: [{ test: { code: "2345-7", displayName: "Glucose" }, quantity: { value: 95, unit: "mg/dL" } }],
 * };
 * ```
 */
export interface BuildCcdaResultPanel {
  /** The panel/battery LOINC code. */
  readonly code: BuildCode;
  /** The organizer `statusCode`; defaults to `"completed"`. */
  readonly status?: string;
  /**
   * The panel's span/collection time as an HL7 date string. Emitted as the
   * organizer's `effectiveTime`; when omitted the SHALL slot is filled with
   * `nullFlavor="UNK"` (the member observations still carry their own times).
   */
  readonly effectiveTime?: string;
  /** The member Result Observations (at least one for a populated panel). */
  readonly results: readonly BuildCcdaResult[];
}

/**
 * One member reading of a Vital Signs panel — a Vital Sign Observation. `code` is
 * the LOINC vital (e.g. `8480-6` systolic BP); `quantity` is the UCUM-checked
 * `PQ` reading (required — a vital sign without a value is not emitted).
 *
 * @example
 * ```ts
 * import type { BuildCcdaVital } from "@cosyte/ccda";
 * const systolic: BuildCcdaVital = {
 *   code: { code: "8480-6", displayName: "Systolic blood pressure" },
 *   quantity: { value: 120, unit: "mm[Hg]" },
 * };
 * ```
 */
export interface BuildCcdaVital {
  /** The LOINC vital-sign code. */
  readonly code: BuildCode;
  /** The reading as a UCUM `PQ` (required). */
  readonly quantity: BuildQuantity;
  /** The H/L/N interpretation (HL7 ObservationInterpretation by default), optional. */
  readonly interpretation?: BuildCode;
  /** The reading time as an HL7 date string, optional. */
  readonly effectiveTime?: string;
}

/**
 * A Vital Signs panel — a Vital Signs Organizer clustering the readings taken in
 * one event (e.g. a set of vitals at a single visit). `status` maps to the
 * organizer `statusCode` (default `"completed"`); `vitals` are the member
 * readings.
 *
 * @example
 * ```ts
 * import type { BuildCcdaVitalsPanel } from "@cosyte/ccda";
 * const panel: BuildCcdaVitalsPanel = {
 *   vitals: [
 *     { code: { code: "8480-6", displayName: "Systolic blood pressure" }, quantity: { value: 120, unit: "mm[Hg]" } },
 *     { code: { code: "8462-4", displayName: "Diastolic blood pressure" }, quantity: { value: 80, unit: "mm[Hg]" } },
 *   ],
 * };
 * ```
 */
export interface BuildCcdaVitalsPanel {
  /** The organizer `statusCode`; defaults to `"completed"`. */
  readonly status?: string;
  /**
   * The cluster's reading time as an HL7 date string. Emitted as the organizer's
   * SHALL `effectiveTime`; when omitted the slot is filled with `nullFlavor="UNK"`.
   */
  readonly effectiveTime?: string;
  /** The member Vital Sign Observations (at least one for a populated panel). */
  readonly vitals: readonly BuildCcdaVital[];
}

/**
 * An Immunization Activity for the Immunizations section. `vaccine` is the CVX
 * coded product (CVX by default). `dose` and `route` are optional and **never
 * guessed** — an omitted one is simply left absent. `refused: true` emits the
 * administration with `negationInd="true"` (a *not-administered* / refused
 * record), which the parser reads back as `refused` and flags
 * `IMMUNIZATION_REFUSED` — the clinically load-bearing refusal is surfaced, never
 * conflated with a `nullFlavor` "unknown". `effectiveTime` is the administration
 * date; when omitted the SHALL slot is filled with `nullFlavor="UNK"`.
 *
 * @example
 * ```ts
 * import type { BuildCcdaImmunization } from "@cosyte/ccda";
 * const flu: BuildCcdaImmunization = {
 *   vaccine: { code: "140", displayName: "Influenza, seasonal, injectable" }, // CVX
 *   dose: { value: 0.5, unit: "mL" },
 *   route: { code: "C28161", displayName: "Intramuscular" }, // NCI Thesaurus
 *   effectiveTime: "20240101",
 * };
 * const refused: BuildCcdaImmunization = {
 *   vaccine: { code: "140", displayName: "Influenza, seasonal, injectable" },
 *   refused: true,
 * };
 * ```
 */
export interface BuildCcdaImmunization {
  /** The CVX-coded vaccine product (CVX by default). */
  readonly vaccine: BuildCode;
  /** The amount administered (`doseQuantity`), optional — never defaulted. */
  readonly dose?: BuildQuantity;
  /** The administration route (`routeCode`); NCI Thesaurus by default. */
  readonly route?: BuildCode;
  /** The administration date as an HL7 date string; `nullFlavor="UNK"` when omitted. */
  readonly effectiveTime?: string;
  /** Emit a refused / not-administered record (`negationInd="true"`); parser flags `IMMUNIZATION_REFUSED`. */
  readonly refused?: boolean;
  /** The `statusCode`; defaults to `"completed"`. */
  readonly status?: string;
}

/**
 * A Procedure for the Procedures section. `kind` selects the C-CDA Procedure
 * Activity variant — an altering/operative `"procedure"` (default, `<procedure>`
 * `…22.4.14`), a non-altering `"act"` service (`<act>` `…22.4.12`), or an
 * assessment `"observation"` (`<observation>` `…22.4.13`). `code` is the coded
 * procedure (SNOMED CT by default, or CPT / ICD-10-PCS / LOINC) and is required
 * (the template SHALL contain a `code`). `disposition` maps to the act's
 * `moodCode` — **performed** (`EVN`) vs **planned** (`INT`) — which the parser
 * reads back as its performed-vs-planned disposition; the two are never
 * conflated. `effectiveTime` is emitted only when supplied (the template's
 * effectiveTime is SHOULD [0..1], CONF:1098-7662 — not fabricated when unknown).
 *
 * @example
 * ```ts
 * import type { BuildCcdaProcedure } from "@cosyte/ccda";
 * const appendectomy: BuildCcdaProcedure = {
 *   code: { code: "80146002", displayName: "Appendectomy" },
 *   disposition: "performed",
 *   effectiveTime: "20230615",
 * };
 * const plannedColonoscopy: BuildCcdaProcedure = {
 *   code: { code: "73761001", displayName: "Colonoscopy" },
 *   disposition: "planned",
 * };
 * ```
 */
export interface BuildCcdaProcedure {
  /** The Procedure Activity variant; defaults to `"procedure"` (operative). */
  readonly kind?: ProcedureKind;
  /** The coded procedure (SNOMED CT by default, or CPT / ICD-10-PCS / LOINC). */
  readonly code: BuildCode;
  /** Performed (`EVN`) or planned (`INT`); defaults to `"performed"`. Never conflated. */
  readonly disposition?: "performed" | "planned";
  /**
   * The `statusCode`; defaults per disposition (performed → `"completed"`,
   * planned → `"active"`). SHALL [1..1] on the template, so always emitted.
   */
  readonly status?: string;
  /** The procedure date as an HL7 date string; emitted only when supplied (SHOULD [0..1]). */
  readonly effectiveTime?: string;
  /**
   * The coded result `value` (`xsi:type="CD"`, SNOMED CT default). **Required for
   * the `"observation"` variant** — Procedure Activity Observation (`…22.4.13`)
   * SHALL contain a `value` [1..1] — and ignored for the other two variants;
   * {@link buildCcda} throws if a `"observation"` procedure omits it.
   */
  readonly value?: BuildCode;
}

/**
 * An Encounter Activity for the Encounters section (`…22.4.49`). `type` is the
 * coded encounter type (CPT by default, or SNOMED CT / HL7 ActEncounterCode) and
 * is required — the template SHALL contain a `code` [1..1]. `period` is the
 * visit/admission window emitted as the SHALL `effectiveTime` [1..1] (an
 * `IVL_TS`); when omitted the SHALL slot is filled with a `nullFlavor="UNK"`
 * `low` rather than a fabricated date. `status` maps to the optional `statusCode`.
 *
 * @example
 * ```ts
 * import type { BuildCcdaEncounter } from "@cosyte/ccda";
 * const visit: BuildCcdaEncounter = {
 *   type: { code: "99213", displayName: "Office outpatient visit 15 minutes" }, // CPT
 *   status: "completed",
 *   period: { low: "20230615", high: "20230615" },
 * };
 * ```
 */
export interface BuildCcdaEncounter {
  /** The coded encounter type (CPT by default, or SNOMED CT / HL7 ActEncounterCode). */
  readonly type: BuildCode;
  /** The encounter `statusCode`; defaults to `"completed"`. */
  readonly status?: string;
  /**
   * The visit/admission period as HL7 date strings (an `IVL_TS` low/high); either
   * bound optional. Emitted as the SHALL `effectiveTime`; `nullFlavor="UNK"` low
   * when omitted.
   */
  readonly period?: { readonly low?: string; readonly high?: string };
}

/**
 * A Smoking Status observation for the Social History section — the Smoking
 * Status — Meaningful Use observation (`…22.4.78`), the safety-relevant
 * social-history fact most consumers ask for. `value` is the SNOMED CT concept
 * from the Current Smoking Status value set (`2.16.840.1.113883.11.20.9.38`,
 * e.g. former smoker `8517006`, never smoker `266919005`, current every-day
 * smoker `449868002`).
 *
 * **Unknown is never defaulted to a status.** When `value` is omitted the
 * observation's SHALL `value` is emitted as `nullFlavor="UNK"` — an *explicit*
 * unknown that the parser reads back as `unknown: true` (and flags
 * `SMOKING_STATUS_UNKNOWN`). The builder will **never** invent a "never smoker"
 * (or any other) reading the caller did not supply: absent status ≠ non-smoker.
 * `effectiveTime` is when the status was recorded; `nullFlavor="UNK"` when omitted.
 *
 * @example
 * ```ts
 * import type { BuildCcdaSmokingStatus } from "@cosyte/ccda";
 * const former: BuildCcdaSmokingStatus = {
 *   value: { code: "8517006", displayName: "Former smoker" }, // SNOMED CT
 *   effectiveTime: "20240101",
 * };
 * const unrecorded: BuildCcdaSmokingStatus = {}; // → value nullFlavor="UNK"
 * ```
 */
export interface BuildCcdaSmokingStatus {
  /**
   * The SNOMED CT smoking-status concept (Current Smoking Status value set).
   * Omit for an explicit unknown (`value nullFlavor="UNK"`) — never defaulted to
   * a real status.
   */
  readonly value?: BuildCode;
  /** The date the status was recorded (HL7 date string); `nullFlavor="UNK"` when omitted. */
  readonly effectiveTime?: string;
  /** The observation `statusCode`; defaults to `"completed"`. */
  readonly status?: string;
}

/**
 * Input to {@link buildCcda}. `patient` is required; each clinical collection
 * (`problems`, `allergies`, `medications`, `results`, `vitalSigns`) defaults to
 * empty, in which case its section is emitted as a spec-clean empty
 * `nullFlavor="NI"` section. `immunizations` is optional — its section is emitted
 * only when populated (Immunizations is not a CCD SHALL section). `documentType`
 * is `"ccd"` in this slice.
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
  /** Medication Activities for the Medications section; empty section when omitted. */
  readonly medications?: readonly BuildCcdaMedication[];
  /** Result panels for the Results section; empty section when omitted. */
  readonly results?: readonly BuildCcdaResultPanel[];
  /** Vital Signs panels for the Vital Signs section; empty section when omitted. */
  readonly vitalSigns?: readonly BuildCcdaVitalsPanel[];
  /** Immunization Activities; the Immunizations section is emitted only when non-empty. */
  readonly immunizations?: readonly BuildCcdaImmunization[];
  /** Procedures; the Procedures section is emitted only when non-empty (a CCD SHOULD section). */
  readonly procedures?: readonly BuildCcdaProcedure[];
  /** Encounter Activities; the Encounters section is emitted only when non-empty (a CCD SHOULD section). */
  readonly encounters?: readonly BuildCcdaEncounter[];
  /** Smoking Status observations for the Social History section; emitted only when non-empty (a CCD SHOULD section). */
  readonly smokingStatus?: readonly BuildCcdaSmokingStatus[];
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
 * A point-in-time `<effectiveTime>` for an observation-level SHALL slot (the
 * Result Observation `…22.4.2` / Vital Sign Observation `…22.4.27`, and the
 * Result/Vital Signs organizers). When the caller supplied a time it is emitted
 * as an `@value`; when nothing is known the element is emitted with
 * `nullFlavor="UNK"` — the SHALL cardinality is satisfied **without inventing** a
 * clinical timestamp, and the parser reads a `nullFlavor` time back as absent
 * (`date === undefined`), never as a real `Date`.
 * @internal
 */
function pointEffectiveTime(doc: Document, value: string | undefined): Element {
  return value === undefined
    ? el(doc, "effectiveTime", { nullFlavor: "UNK" })
    : el(doc, "effectiveTime", { value });
}

/**
 * A Concern Act / concern-scoped observation `<effectiveTime>` (the
 * concern-tracking window). The C-CDA Concern Act pattern (shared by the Problem
 * and Allergy Concern Acts) SHALL contain effectiveTime [1..1]; when the concern
 * is **active** it SHALL contain a `low`, and when **completed** (a resolved
 * concern) it SHALL contain a `high` — on the Problem Concern Act `…22.4.3` these
 * are CONF:1198-7504 (active→low) and CONF:1198-10085 (completed→high); the
 * Allergy Concern Act `…22.4.30` carries the same generic rule under its own
 * constraint ids. The Problem/Allergy-Intolerance Observation likewise SHALL
 * carry an effectiveTime whose `low` is the onset. The `low` carries the onset
 * when supplied, else `nullFlavor="UNK"`; a resolved concern adds a
 * `nullFlavor="UNK"` `high` — the builder never invents a resolution date it was
 * not given.
 * @internal
 */
function concernEffectiveTime(
  doc: Document,
  onset: string | undefined,
  status: "active" | "resolved" | "inactive" | undefined,
): Element {
  const et = el(doc, "effectiveTime");
  et.appendChild(
    onset === undefined ? el(doc, "low", { nullFlavor: "UNK" }) : el(doc, "low", { value: onset }),
  );
  if (status === "resolved") et.appendChild(el(doc, "high", { nullFlavor: "UNK" }));
  return et;
}

/**
 * The Medication Activity duration `<effectiveTime xsi:type="IVL_TS">` — the
 * therapy window. C-CDA Medication Activity SHALL contain this effectiveTime
 * [1..1] (CONF:1098-7495; it SHALL be an IVL_TS, CONF:1098-7496). Bounds are
 * emitted when supplied; when the window is unknown a `nullFlavor="UNK"` `low`
 * keeps the SHALL satisfied without a confident-wrong date (and satisfies
 * CONF:1098-32890 — it carries a `low`, not an invented `@value`). The separate
 * `PIVL_TS` frequency remains a distinct, caller-supplied-only sibling.
 * @internal
 */
function medicationDuration(
  doc: Document,
  duration: { readonly low?: string; readonly high?: string } | undefined,
): Element {
  const ivl = typedEl(doc, "effectiveTime", "IVL_TS");
  ivl.appendChild(
    duration?.low === undefined
      ? el(doc, "low", { nullFlavor: "UNK" })
      : el(doc, "low", { value: duration.low }),
  );
  if (duration?.high !== undefined) ivl.appendChild(el(doc, "high", { value: duration.high }));
  return ivl;
}

/**
 * Build a spec-clean C-CDA R2.1 CCD from structured input and return the parsed
 * {@link CcdaDocument}. The emitted document round-trips through {@link parseCcda}
 * by construction (see the module doc); a clean build carries zero warnings.
 *
 * @param init - The document content; see {@link BuildCcdaInit}. `patient` is required.
 * @returns The parsed document — the parse of the spec-clean XML just emitted.
 * @throws {TypeError} When `documentType` is anything other than `"ccd"` (the
 *   only type this slice supports), when an allergy is neither an `allergen` nor
 *   `noKnownAllergy`, when a result does not carry exactly one value form
 *   (`quantity` / `codedValue` / `stringValue`), or when a `"observation"`-variant
 *   procedure omits its SHALL `value`.
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
  structuredBody.appendChild(medicationsSection(doc, init.medications ?? [], id));
  structuredBody.appendChild(resultsSection(doc, init.results ?? [], id));
  structuredBody.appendChild(vitalsSection(doc, init.vitalSigns ?? [], id));
  // Immunizations, Procedures, and Encounters are not CCD SHALL sections — each is
  // emitted only when populated, rather than fabricating an empty section the
  // caller did not ask for.
  if ((init.immunizations?.length ?? 0) > 0) {
    structuredBody.appendChild(immunizationsSection(doc, init.immunizations ?? [], id));
  }
  if ((init.procedures?.length ?? 0) > 0) {
    structuredBody.appendChild(proceduresSection(doc, init.procedures ?? [], id));
  }
  if ((init.encounters?.length ?? 0) > 0) {
    structuredBody.appendChild(encountersSection(doc, init.encounters ?? [], id));
  }
  if ((init.smokingStatus?.length ?? 0) > 0) {
    structuredBody.appendChild(socialHistorySection(doc, init.smokingStatus ?? [], id));
  }
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
  extension: string = R21,
): readonly Element[] {
  const ids = [el(doc, "templateId", { root: base, extension })];
  if (entriesRequired) ids.push(el(doc, "templateId", { root: `${base}.1`, extension }));
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
  extension: string = R21,
): Element {
  const section = el(doc, "section", attrs);
  for (const tid of sectionTemplateIds(doc, base, entriesRequired, extension)) {
    section.appendChild(tid);
  }
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
/** @internal */
const VITALS_SECTION_BASE = "2.16.840.1.113883.10.20.22.2.4";
/** @internal */
const IMMUNIZATIONS_SECTION_BASE = "2.16.840.1.113883.10.20.22.2.2";
/** @internal */
const PROCEDURES_SECTION_BASE = "2.16.840.1.113883.10.20.22.2.7";
/** @internal */
const ENCOUNTERS_SECTION_BASE = "2.16.840.1.113883.10.20.22.2.22";
/** @internal */
const SOCIAL_HISTORY_SECTION_BASE = "2.16.840.1.113883.10.20.22.2.17";

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
  // Problem Observation (…22.4.4) SHALL carry an effectiveTime — always emitted,
  // onset as low when supplied (nullFlavor="UNK" otherwise), plus a nullFlavor
  // high for a resolved problem (resolved-but-date-unknown), never a guessed date.
  obs.appendChild(concernEffectiveTime(doc, p.onset, p.status));
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
  // Problem Concern Act (…22.4.3) SHALL contain effectiveTime [1..1]
  // (active→SHALL low CONF:1198-7504; completed→SHALL high CONF:1198-10085).
  act.appendChild(concernEffectiveTime(doc, p.onset, p.status));
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
  // Allergy-Intolerance Observation (…22.4.7) SHALL carry an effectiveTime whose
  // low is the biological onset. No onset is supplied to the builder, so the low
  // is nullFlavor="UNK" (a resolved concern adds a nullFlavor high) — the SHALL is
  // satisfied without inventing a clinical time.
  obs.appendChild(concernEffectiveTime(doc, undefined, a.status));
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
  );
  // Allergy Concern Act (…22.4.30) SHALL contain effectiveTime [1..1] under the
  // shared Concern Act rule (active→SHALL low; completed→SHALL high), emitted
  // before the entryRelationship per the Act element order.
  act.appendChild(concernEffectiveTime(doc, undefined, a.status));
  act.appendChild(el(doc, "entryRelationship", { typeCode: "SUBJ" }, obs));
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

/** A `PQ`-shaped element (`<name value unit>`) from a {@link BuildQuantity}. @internal */
function pqEl(doc: Document, name: string, q: BuildQuantity): Element {
  return el(doc, name, { value: q.value.toString(), unit: q.unit });
}

/** Build the Medications section — populated, or empty when there are none. @internal */
function medicationsSection(
  doc: Document,
  meds: readonly BuildCcdaMedication[],
  id: (prefix: string) => string,
): Element {
  if (meds.length === 0) {
    return emptySection(doc, MEDICATIONS_SECTION_BASE, "10160-0", "Medications");
  }
  const text = el(doc, "text");
  const entries: Element[] = [];
  for (const m of meds) {
    const contentId = id("med-txt");
    // The narrative must carry the drug label so it agrees with the coded product
    // (the parser reconciles medication code ↔ narrative).
    text.appendChild(textEl(doc, "content", m.drug.displayName, { ID: contentId }));
    entries.push(medicationEntry(doc, m, contentId, id));
  }
  const section = sectionElement(
    doc,
    MEDICATIONS_SECTION_BASE,
    "10160-0",
    "Medications",
    text,
    true,
  );
  for (const entry of entries) section.appendChild(entry);
  return el(doc, "component", undefined, section);
}

/** Build one Medication Activity `<entry>`. @internal */
function medicationEntry(
  doc: Document,
  m: BuildCcdaMedication,
  contentId: string,
  id: (prefix: string) => string,
): Element {
  const sbadm = el(
    doc,
    "substanceAdministration",
    { classCode: "SBADM", moodCode: "EVN" },
    el(doc, "templateId", { root: MEDICATION_ACTIVITY, extension: MED_EXT }),
    el(doc, "id", { root: SYNTH_ROOT, extension: id("med") }),
    el(doc, "text", undefined, el(doc, "reference", { value: `#${contentId}` })),
    el(doc, "statusCode", { code: concernStatusCode(m.status) }),
  );
  // Timing is two distinct effectiveTime siblings — an IVL_TS therapy window and
  // a PIVL_TS periodic frequency — never conflated (mirrors how the parser reads
  // them back). The IVL_TS duration is a SHALL slot (CONF:1098-7495), so it is
  // ALWAYS emitted (nullFlavor="UNK" low when no window is supplied); the PIVL_TS
  // frequency is optional and emitted only when the caller supplied it.
  sbadm.appendChild(medicationDuration(doc, m.duration));
  if (m.frequency !== undefined) {
    sbadm.appendChild(
      typedEl(
        doc,
        "effectiveTime",
        "PIVL_TS",
        { institutionSpecified: "false" },
        pqEl(doc, "period", m.frequency),
      ),
    );
  }
  // Route + dose are safety-critical and never defaulted: an omitted one is left
  // absent so the parser flags it (MISSING_ROUTE_CODE / MISSING_DOSE_QUANTITY),
  // rather than being invented into a confident-wrong value.
  if (m.route !== undefined) {
    sbadm.appendChild(
      codeEl(doc, "routeCode", { ...m.route, codeSystem: m.route.codeSystem ?? NCI_ROUTE }),
    );
  }
  if (m.dose !== undefined) sbadm.appendChild(pqEl(doc, "doseQuantity", m.dose));
  sbadm.appendChild(medicationConsumable(doc, m.drug));

  return el(doc, "entry", undefined, sbadm);
}

/** Build the `consumable/manufacturedProduct` carrying the RxNorm drug code. @internal */
function medicationConsumable(doc: Document, drug: BuildCode): Element {
  const material = el(
    doc,
    "manufacturedMaterial",
    undefined,
    codeEl(doc, "code", { ...drug, codeSystem: drug.codeSystem ?? RXNORM }),
  );
  const product = el(
    doc,
    "manufacturedProduct",
    { classCode: "MANU" },
    el(doc, "templateId", { root: MEDICATION_INFORMATION, extension: MED_EXT }),
    material,
  );
  return el(doc, "consumable", undefined, product);
}

/** Build the Results section — populated, or empty when there are none. @internal */
function resultsSection(
  doc: Document,
  panels: readonly BuildCcdaResultPanel[],
  id: (prefix: string) => string,
): Element {
  if (panels.length === 0) {
    return emptySection(doc, RESULTS_SECTION_BASE, "30954-2", "Results");
  }
  const text = el(doc, "text");
  const entries = panels.map((panel) => resultOrganizerEntry(doc, panel, text, id));
  const section = sectionElement(doc, RESULTS_SECTION_BASE, "30954-2", "Results", text, true);
  for (const entry of entries) section.appendChild(entry);
  return el(doc, "component", undefined, section);
}

/** Build one Result Organizer `<entry>` (the panel/battery). @internal */
function resultOrganizerEntry(
  doc: Document,
  panel: BuildCcdaResultPanel,
  text: Element,
  id: (prefix: string) => string,
): Element {
  const organizer = el(
    doc,
    "organizer",
    { classCode: "BATTERY", moodCode: "EVN" },
    el(doc, "templateId", { root: RESULT_ORGANIZER, extension: R21 }),
    el(doc, "id", { root: SYNTH_ROOT, extension: id("res-org") }),
    codeEl(doc, "code", {
      ...panel.code,
      codeSystem: panel.code.codeSystem ?? LOINC,
      codeSystemName: panel.code.codeSystemName ?? "LOINC",
    }),
    el(doc, "statusCode", { code: panel.status ?? "completed" }),
  );
  // Result Organizer (…22.4.1) effectiveTime spans the contained observations.
  // Emitted for spec-completeness (nullFlavor="UNK" unless the caller supplied a
  // panel time) — the member observations each carry their own required time.
  organizer.appendChild(pointEffectiveTime(doc, panel.effectiveTime));
  for (const result of panel.results) {
    organizer.appendChild(
      el(doc, "component", undefined, resultObservation(doc, result, text, id)),
    );
  }
  return el(doc, "entry", undefined, organizer);
}

/** Build one Result Observation, appending its narrative content. @internal */
function resultObservation(
  doc: Document,
  result: BuildCcdaResult,
  text: Element,
  id: (prefix: string) => string,
): Element {
  const value = observationValue(doc, result.test, result);
  const contentId = id("res-txt");
  text.appendChild(
    textEl(doc, "content", observationNarrative(result.test, result), { ID: contentId }),
  );

  const obs = el(
    doc,
    "observation",
    { classCode: "OBS", moodCode: "EVN" },
    el(doc, "templateId", { root: RESULT_OBSERVATION, extension: R21 }),
    el(doc, "id", { root: SYNTH_ROOT, extension: id("res-obs") }),
    codeEl(doc, "code", {
      ...result.test,
      codeSystem: result.test.codeSystem ?? LOINC,
      codeSystemName: result.test.codeSystemName ?? "LOINC",
    }),
    el(doc, "text", undefined, el(doc, "reference", { value: `#${contentId}` })),
    el(doc, "statusCode", { code: "completed" }),
  );
  // Result Observation (…22.4.2) SHALL contain effectiveTime [1..1] — the
  // clinically-relevant measurement time. Always emitted (nullFlavor="UNK" when
  // the caller supplied none), never a guessed timestamp.
  obs.appendChild(pointEffectiveTime(doc, result.effectiveTime));
  obs.appendChild(value);
  if (result.interpretation !== undefined) {
    obs.appendChild(
      codeEl(doc, "interpretationCode", {
        ...result.interpretation,
        codeSystem: result.interpretation.codeSystem ?? INTERPRETATION,
      }),
    );
  }
  if (result.referenceRange !== undefined) {
    obs.appendChild(referenceRangeEl(doc, result.referenceRange));
  }
  return obs;
}

/**
 * Build a result's typed `<value>`, enforcing **exactly one** value form. A UCUM
 * `quantity` → `xsi:type="PQ"`; a `codedValue` → `xsi:type="CD"` (SNOMED CT by
 * default); a `stringValue` → `xsi:type="ST"`. Throws when none (or more than
 * one) is set — a result value is never dropped or invented.
 * @internal
 */
function observationValue(doc: Document, testCode: BuildCode, r: BuildCcdaResult): Element {
  const forms = [r.quantity, r.codedValue, r.stringValue].filter((v) => v !== undefined).length;
  if (forms !== 1) {
    throw new TypeError(
      `buildCcda: result "${testCode.displayName}" must set exactly one of ` +
        "`quantity`, `codedValue`, or `stringValue`.",
    );
  }
  if (r.quantity !== undefined) {
    return typedValue(doc, "PQ", { value: r.quantity.value.toString(), unit: r.quantity.unit });
  }
  if (r.codedValue !== undefined) {
    return typedValue(doc, "CD", {
      code: r.codedValue.code,
      codeSystem: r.codedValue.codeSystem ?? SNOMED_CT,
      displayName: r.codedValue.displayName,
      codeSystemName: r.codedValue.codeSystemName,
    });
  }
  const st = typedValue(doc, "ST");
  st.appendChild(doc.createTextNode(r.stringValue ?? ""));
  return st;
}

/** A human-readable narrative line for a result/vital observation. @internal */
function observationNarrative(code: BuildCode, r: BuildCcdaResult): string {
  if (r.quantity !== undefined) {
    return `${code.displayName}: ${r.quantity.value.toString()} ${r.quantity.unit}`;
  }
  if (r.codedValue !== undefined) return `${code.displayName}: ${r.codedValue.displayName}`;
  return `${code.displayName}: ${r.stringValue ?? ""}`;
}

/** Build a structured `<referenceRange>` (`observationRange/value xsi:type="IVL_PQ"`). @internal */
function referenceRangeEl(
  doc: Document,
  range: { readonly low?: BuildQuantity; readonly high?: BuildQuantity },
): Element {
  const ivl = typedEl(doc, "value", "IVL_PQ");
  if (range.low !== undefined) ivl.appendChild(pqEl(doc, "low", range.low));
  if (range.high !== undefined) ivl.appendChild(pqEl(doc, "high", range.high));
  return el(doc, "referenceRange", undefined, el(doc, "observationRange", undefined, ivl));
}

/** The SNOMED CT "Vital signs" cluster code the Vital Signs Organizer carries. @internal */
const VITAL_SIGNS_CLUSTER = {
  code: "46680005",
  codeSystem: SNOMED_CT,
  displayName: "Vital signs",
  codeSystemName: "SNOMED CT",
} as const;

/** Build the Vital Signs section — populated, or empty when there are none. @internal */
function vitalsSection(
  doc: Document,
  panels: readonly BuildCcdaVitalsPanel[],
  id: (prefix: string) => string,
): Element {
  if (panels.length === 0) {
    return emptySection(doc, VITALS_SECTION_BASE, "8716-3", "Vital Signs");
  }
  const text = el(doc, "text");
  const entries = panels.map((panel) => vitalsOrganizerEntry(doc, panel, text, id));
  const section = sectionElement(doc, VITALS_SECTION_BASE, "8716-3", "Vital Signs", text, true);
  for (const entry of entries) section.appendChild(entry);
  return el(doc, "component", undefined, section);
}

/** Build one Vital Signs Organizer `<entry>` (a reading cluster). @internal */
function vitalsOrganizerEntry(
  doc: Document,
  panel: BuildCcdaVitalsPanel,
  text: Element,
  id: (prefix: string) => string,
): Element {
  const organizer = el(
    doc,
    "organizer",
    { classCode: "CLUSTER", moodCode: "EVN" },
    el(doc, "templateId", { root: VITAL_SIGNS_ORGANIZER, extension: R21 }),
    el(doc, "id", { root: SYNTH_ROOT, extension: id("vit-org") }),
    codeEl(doc, "code", VITAL_SIGNS_CLUSTER),
    el(doc, "statusCode", { code: panel.status ?? "completed" }),
  );
  // Vital Signs Organizer (…22.4.26) SHALL contain effectiveTime [1..1] — always
  // emitted (nullFlavor="UNK" unless a panel time was supplied).
  organizer.appendChild(pointEffectiveTime(doc, panel.effectiveTime));
  for (const vital of panel.vitals) {
    organizer.appendChild(el(doc, "component", undefined, vitalObservation(doc, vital, text, id)));
  }
  return el(doc, "entry", undefined, organizer);
}

/** Build one Vital Sign Observation, appending its narrative content. @internal */
function vitalObservation(
  doc: Document,
  vital: BuildCcdaVital,
  text: Element,
  id: (prefix: string) => string,
): Element {
  const contentId = id("vit-txt");
  text.appendChild(
    textEl(
      doc,
      "content",
      `${vital.code.displayName}: ${vital.quantity.value.toString()} ${vital.quantity.unit}`,
      { ID: contentId },
    ),
  );
  const obs = el(
    doc,
    "observation",
    { classCode: "OBS", moodCode: "EVN" },
    el(doc, "templateId", { root: VITAL_SIGN_OBSERVATION, extension: VITAL_OBS_EXT }),
    el(doc, "id", { root: SYNTH_ROOT, extension: id("vit-obs") }),
    codeEl(doc, "code", {
      ...vital.code,
      codeSystem: vital.code.codeSystem ?? LOINC,
      codeSystemName: vital.code.codeSystemName ?? "LOINC",
    }),
    el(doc, "text", undefined, el(doc, "reference", { value: `#${contentId}` })),
    el(doc, "statusCode", { code: "completed" }),
  );
  // Vital Sign Observation (…22.4.27) SHALL contain effectiveTime [1..1] — the
  // reading time. Always emitted (nullFlavor="UNK" when none supplied).
  obs.appendChild(pointEffectiveTime(doc, vital.effectiveTime));
  obs.appendChild(
    typedValue(doc, "PQ", { value: vital.quantity.value.toString(), unit: vital.quantity.unit }),
  );
  if (vital.interpretation !== undefined) {
    obs.appendChild(
      codeEl(doc, "interpretationCode", {
        ...vital.interpretation,
        codeSystem: vital.interpretation.codeSystem ?? INTERPRETATION,
      }),
    );
  }
  return obs;
}

/**
 * Build the Immunizations section from one or more Immunization Activities. This
 * section is only ever called with a non-empty list (see {@link buildCcda}) — it
 * is not a CCD SHALL section, so an unpopulated Immunizations section is not
 * emitted rather than fabricated as an empty `nullFlavor="NI"` shell.
 * @internal
 */
function immunizationsSection(
  doc: Document,
  imms: readonly BuildCcdaImmunization[],
  id: (prefix: string) => string,
): Element {
  const text = el(doc, "text");
  const entries: Element[] = [];
  for (const imm of imms) {
    const contentId = id("imm-txt");
    // The narrative carries the vaccine label so it agrees with the coded product
    // (the parser reconciles the immunization vaccine code ↔ narrative).
    text.appendChild(textEl(doc, "content", imm.vaccine.displayName, { ID: contentId }));
    entries.push(immunizationEntry(doc, imm, contentId, id));
  }
  const section = sectionElement(
    doc,
    IMMUNIZATIONS_SECTION_BASE,
    "11369-6",
    "Immunizations",
    text,
    true,
  );
  for (const entry of entries) section.appendChild(entry);
  return el(doc, "component", undefined, section);
}

/** Build one Immunization Activity `<entry>`. @internal */
function immunizationEntry(
  doc: Document,
  imm: BuildCcdaImmunization,
  contentId: string,
  id: (prefix: string) => string,
): Element {
  // A refused / not-administered shot is `negationInd="true"` — the parser reads
  // it back as `refused` and flags IMMUNIZATION_REFUSED; it is NEVER conflated
  // with a `nullFlavor` "unknown" (opposite clinical meaning).
  const attrs: Attrs =
    imm.refused === true
      ? { classCode: "SBADM", moodCode: "EVN", negationInd: "true" }
      : { classCode: "SBADM", moodCode: "EVN" };
  const sbadm = el(
    doc,
    "substanceAdministration",
    attrs,
    el(doc, "templateId", { root: IMMUNIZATION_ACTIVITY, extension: R21 }),
    el(doc, "id", { root: SYNTH_ROOT, extension: id("imm") }),
    el(doc, "text", undefined, el(doc, "reference", { value: `#${contentId}` })),
    el(doc, "statusCode", { code: imm.status ?? "completed" }),
  );
  // Immunization Activity (…22.4.52) SHALL contain effectiveTime [1..1] — the
  // administration time (the exact CONF id is not re-verified here; the substantive
  // SHALL-[1..1] cardinality is grounded against the R2.1 IG's Immunization Activity
  // constraint). Emitted as an @value when supplied, else nullFlavor="UNK" (the SHALL
  // satisfied without inventing a date), consistent with the every-entry effectiveTime rule.
  sbadm.appendChild(pointEffectiveTime(doc, imm.effectiveTime));
  // Route + dose are never guessed: an omitted one is left absent (the parser does
  // not require either on an immunization), never defaulted to a confident-wrong value.
  if (imm.route !== undefined) {
    sbadm.appendChild(
      codeEl(doc, "routeCode", { ...imm.route, codeSystem: imm.route.codeSystem ?? NCI_ROUTE }),
    );
  }
  if (imm.dose !== undefined) sbadm.appendChild(pqEl(doc, "doseQuantity", imm.dose));
  sbadm.appendChild(immunizationConsumable(doc, imm.vaccine));
  return el(doc, "entry", undefined, sbadm);
}

/**
 * Build the `consumable/manufacturedProduct` carrying the CVX vaccine code (the
 * Immunization Medication Information template `…22.4.54`).
 * @internal
 */
function immunizationConsumable(doc: Document, vaccine: BuildCode): Element {
  const material = el(
    doc,
    "manufacturedMaterial",
    undefined,
    codeEl(doc, "code", { ...vaccine, codeSystem: vaccine.codeSystem ?? CVX }),
  );
  const product = el(
    doc,
    "manufacturedProduct",
    { classCode: "MANU" },
    el(doc, "templateId", {
      root: IMMUNIZATION_MEDICATION_INFORMATION,
      extension: IMMUNIZATION_MED_INFO_EXT,
    }),
    material,
  );
  return el(doc, "consumable", undefined, product);
}

/** The element name, `@classCode`, and template root for each Procedure variant. @internal */
const PROCEDURE_VARIANTS: Readonly<
  Record<
    ProcedureKind,
    { readonly element: string; readonly classCode: string; readonly root: string }
  >
> = {
  procedure: { element: "procedure", classCode: "PROC", root: PROCEDURE_ACTIVITY_PROCEDURE },
  act: { element: "act", classCode: "ACT", root: PROCEDURE_ACTIVITY_ACT },
  observation: { element: "observation", classCode: "OBS", root: PROCEDURE_ACTIVITY_OBSERVATION },
};

/**
 * Build the Procedures section from one or more {@link BuildCcdaProcedure}s. Only
 * called with a non-empty list (see {@link buildCcda}) — Procedures is a CCD
 * SHOULD (not SHALL) section, so an unpopulated one is not fabricated. The
 * section and its entry templates carry the R2.1 `2014-06-09` stamp.
 * @internal
 */
function proceduresSection(
  doc: Document,
  procedures: readonly BuildCcdaProcedure[],
  id: (prefix: string) => string,
): Element {
  const text = el(doc, "text");
  const entries: Element[] = [];
  for (const p of procedures) {
    const contentId = id("proc-txt");
    // The narrative carries the procedure label so it agrees with the coded value
    // (the parser reconciles the procedure code ↔ narrative).
    text.appendChild(textEl(doc, "content", p.code.displayName, { ID: contentId }));
    entries.push(procedureEntry(doc, p, contentId, id));
  }
  const section = sectionElement(
    doc,
    PROCEDURES_SECTION_BASE,
    "47519-4",
    "Procedures",
    text,
    true,
    undefined,
    PROCEDURE_EXT,
  );
  for (const entry of entries) section.appendChild(entry);
  return el(doc, "component", undefined, section);
}

/** Build one Procedure Activity `<entry>` (procedure / act / observation variant). @internal */
function procedureEntry(
  doc: Document,
  p: BuildCcdaProcedure,
  contentId: string,
  id: (prefix: string) => string,
): Element {
  const kind = p.kind ?? "procedure";
  // Procedure Activity Observation (…22.4.13) SHALL contain a value [1..1] (the
  // assessment result — "if nothing is appropriate, use a nullFlavor"). Refuse to
  // emit a value-less observation-variant procedure rather than ship a document
  // that violates the SHALL — a caller with an unknown result passes an explicit
  // `nullFlavor`-bearing value form in a later slice; today it is required.
  if (kind === "observation" && p.value === undefined) {
    throw new TypeError(
      `buildCcda: procedure "${p.code.displayName}" uses kind "observation", which SHALL ` +
        "carry a `value` (Procedure Activity Observation …22.4.13) — supply `value`.",
    );
  }
  const variant = PROCEDURE_VARIANTS[kind];
  // `moodCode` is the performed-vs-planned axis: performed → EVN, planned → INT.
  // The parser classifies it back into a disposition; the two are never conflated.
  const moodCode = p.disposition === "planned" ? "INT" : "EVN";
  const statusCode = p.status ?? (p.disposition === "planned" ? "active" : "completed");
  const act = el(
    doc,
    variant.element,
    { classCode: variant.classCode, moodCode },
    el(doc, "templateId", { root: variant.root, extension: PROCEDURE_EXT }),
    el(doc, "id", { root: SYNTH_ROOT, extension: id("proc") }),
    codeEl(doc, "code", { ...p.code, codeSystem: p.code.codeSystem ?? SNOMED_CT }),
    el(doc, "text", undefined, el(doc, "reference", { value: `#${contentId}` })),
    el(doc, "statusCode", { code: statusCode }),
  );
  // Procedure Activity effectiveTime is SHOULD [0..1] (CONF:1098-7662): emitted
  // only when supplied — never fabricated with a nullFlavor when unknown.
  if (p.effectiveTime !== undefined) {
    act.appendChild(el(doc, "effectiveTime", { value: p.effectiveTime }));
  }
  // The assessment `observation` variant carries its SHALL coded result `value`
  // (guaranteed present by the guard above; the parser reads it back).
  if (kind === "observation" && p.value !== undefined) {
    act.appendChild(cdValue(doc, p.value, SNOMED_CT));
  }
  return el(doc, "entry", undefined, act);
}

/**
 * Build the Encounters section from one or more {@link BuildCcdaEncounter}s. Only
 * called with a non-empty list (see {@link buildCcda}) — Encounters is a CCD
 * SHOULD (not SHALL) section, so an unpopulated one is not fabricated.
 * @internal
 */
function encountersSection(
  doc: Document,
  encounters: readonly BuildCcdaEncounter[],
  id: (prefix: string) => string,
): Element {
  const text = el(doc, "text");
  const entries: Element[] = [];
  for (const e of encounters) {
    const contentId = id("enc-txt");
    // The narrative carries the encounter-type label so it agrees with the coded
    // value (the parser reconciles the encounter code ↔ narrative).
    text.appendChild(textEl(doc, "content", e.type.displayName, { ID: contentId }));
    entries.push(encounterEntry(doc, e, contentId, id));
  }
  const section = sectionElement(doc, ENCOUNTERS_SECTION_BASE, "46240-8", "Encounters", text, true);
  for (const entry of entries) section.appendChild(entry);
  return el(doc, "component", undefined, section);
}

/** Build one Encounter Activity `<entry>` (`…22.4.49`). @internal */
function encounterEntry(
  doc: Document,
  e: BuildCcdaEncounter,
  contentId: string,
  id: (prefix: string) => string,
): Element {
  const enc = el(
    doc,
    "encounter",
    { classCode: "ENC", moodCode: "EVN" },
    el(doc, "templateId", { root: ENCOUNTER_ACTIVITY, extension: R21 }),
    el(doc, "id", { root: SYNTH_ROOT, extension: id("enc") }),
    // Encounter Activity SHALL contain a code [1..1] (the encounter type; CPT by
    // default). `type` is required on the builder input, so it is always emitted.
    codeEl(doc, "code", { ...e.type, codeSystem: e.type.codeSystem ?? CPT }),
    el(doc, "text", undefined, el(doc, "reference", { value: `#${contentId}` })),
    el(doc, "statusCode", { code: e.status ?? "completed" }),
  );
  // Encounter Activity SHALL contain effectiveTime [1..1] — the visit/admission
  // period. Always emitted as an IVL_TS; a nullFlavor="UNK" low satisfies the
  // SHALL without inventing a date when the caller supplied no period.
  enc.appendChild(encounterPeriod(doc, e.period));
  return el(doc, "entry", undefined, enc);
}

/**
 * The Encounter Activity SHALL `<effectiveTime>` (an `IVL_TS` visit period). The
 * `low` carries the start when supplied, else `nullFlavor="UNK"`; a `high` is
 * added only when an end was supplied — the builder never invents a discharge
 * date it was not given.
 * @internal
 */
function encounterPeriod(
  doc: Document,
  period: { readonly low?: string; readonly high?: string } | undefined,
): Element {
  const et = el(doc, "effectiveTime");
  et.appendChild(
    period?.low === undefined
      ? el(doc, "low", { nullFlavor: "UNK" })
      : el(doc, "low", { value: period.low }),
  );
  if (period?.high !== undefined) et.appendChild(el(doc, "high", { value: period.high }));
  return et;
}

/** The narrative line for a Smoking Status — the status label, or an explicit "unknown". @internal */
function smokingStatusLabel(s: BuildCcdaSmokingStatus): string {
  return s.value?.displayName ?? "Smoking status unknown";
}

/**
 * Build the Social History section from one or more {@link BuildCcdaSmokingStatus}
 * observations. Only called with a non-empty list (see {@link buildCcda}) —
 * Social History is a CCD SHOULD (not SHALL) section, so an unpopulated one is not
 * fabricated. The Social History Section template (`…22.2.17`) has no
 * entries-required variant, so only the base `templateId` is emitted even though
 * the section carries entries.
 * @internal
 */
function socialHistorySection(
  doc: Document,
  statuses: readonly BuildCcdaSmokingStatus[],
  id: (prefix: string) => string,
): Element {
  const text = el(doc, "text");
  const entries: Element[] = [];
  for (const s of statuses) {
    const contentId = id("smk-txt");
    // The narrative carries the smoking-status label so it agrees with the coded
    // value (an unknown status reads "Smoking status unknown", never a fabricated
    // reading).
    text.appendChild(textEl(doc, "content", smokingStatusLabel(s), { ID: contentId }));
    entries.push(smokingStatusEntry(doc, s, contentId, id));
  }
  const section = sectionElement(
    doc,
    SOCIAL_HISTORY_SECTION_BASE,
    "29762-2",
    "Social History",
    text,
    false,
  );
  for (const entry of entries) section.appendChild(entry);
  return el(doc, "component", undefined, section);
}

/** Build one Smoking Status observation `<entry>` (`…22.4.78`). @internal */
function smokingStatusEntry(
  doc: Document,
  s: BuildCcdaSmokingStatus,
  contentId: string,
  id: (prefix: string) => string,
): Element {
  const obs = el(
    doc,
    "observation",
    { classCode: "OBS", moodCode: "EVN" },
    el(doc, "templateId", { root: SMOKING_STATUS_OBSERVATION, extension: SMOKING_STATUS_EXT }),
    el(doc, "id", { root: SYNTH_ROOT, extension: id("smk") }),
    // SHALL code [1..1] — the fixed LOINC "Tobacco smoking status"; the specific
    // reading lives in `value`, not here.
    codeEl(doc, "code", { ...SMOKING_STATUS_CODE, codeSystem: LOINC, codeSystemName: "LOINC" }),
    el(doc, "statusCode", { code: s.status ?? "completed" }),
  );
  // Smoking Status Observation (…22.4.78) SHALL contain effectiveTime [1..1] — the
  // time the status was recorded. Emitted as an @value when supplied, else
  // nullFlavor="UNK" (the SHALL satisfied without inventing a date).
  obs.appendChild(pointEffectiveTime(doc, s.effectiveTime));
  // SHALL value [1..1] (SNOMED CT, Current Smoking Status value set). An omitted
  // status is an EXPLICIT nullFlavor="UNK" — read back as `unknown: true` and
  // flagged SMOKING_STATUS_UNKNOWN — NEVER defaulted to a real reading such as
  // "never smoker" (absent status ≠ non-smoker; the single safety rule here).
  obs.appendChild(
    s.value === undefined
      ? typedValue(doc, "CD", { nullFlavor: "UNK" })
      : cdValue(doc, s.value, SNOMED_CT),
  );
  obs.appendChild(el(doc, "text", undefined, el(doc, "reference", { value: `#${contentId}` })));
  return el(doc, "entry", undefined, obs);
}
