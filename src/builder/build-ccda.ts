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
 * **This slice adds Functional Status.** A **Functional Status** section
 * (`…22.2.14`, LOINC `47420-5`, the `2014-06-09` stamp) emits one or more
 * standalone Functional Status Observations (`…22.4.67`) — each with the
 * template-**fixed** LOINC `code` (`54522-8` "Functional status"), a SHALL
 * `statusCode` (fixed `completed`), a SHALL `effectiveTime` [1..1] (the assessed
 * time, `nullFlavor="UNK"` when unknown), and the SHALL SNOMED CT `value` [1..1]
 * carrying the specific finding. **Unknown is never defaulted to a finding:** when
 * the caller supplies no `value` the SHALL `value` is emitted as
 * `nullFlavor="UNK"` — an explicit unknown, never invented. Only Functional Status
 * templates are emitted, so the parser reads every finding back tagged
 * `domain: "functional"` — never conflated with Mental Status. Like the other
 * non-SHALL sections, Functional Status is emitted only when populated. The
 * Functional Status Section has no entries-required variant, so only the base
 * `templateId` is emitted even when it carries entries.
 *
 * **This slice adds Mental Status.** A **Mental Status** section (`…22.2.56`,
 * LOINC `10190-7`, the R2.1 `2015-08-01` stamp) emits one or more standalone
 * Mental Status Observations (`…22.4.74`) — each with the R2.1 template-**fixed**
 * SNOMED CT `code` (`373930000` "Cognitive function finding"), a SHALL `statusCode`
 * (fixed `completed`), a SHALL `effectiveTime` [1..1] (the assessed time,
 * `nullFlavor="UNK"` when unknown), and the SHALL SNOMED CT `value` [1..1] carrying
 * the specific cognition/mood finding. **Unknown is never defaulted to a finding:**
 * an absent `value` is emitted as `nullFlavor="UNK"`, never invented. The Mental
 * Status templates are new in the R2.1 August 2015 errata (split out of Functional
 * Status, hence the `2015-08-01` — not `2014-06-09` — stamp) and the two extractors
 * key off their distinct observation roots (`…22.4.67` vs `…22.4.74`), so a mental
 * finding reads back tagged `domain: "mental"` — **never conflated** with functional
 * status. Like the other non-SHALL sections it is emitted only when populated, and
 * its section has no entries-required variant.
 *
 * **This slice adds Past Medical History.** A **Past Medical History** section
 * (`…22.2.20`, LOINC `11348-0`, the R2.1 `2015-08-01` stamp) emits one or more
 * historical problems as **bare** Problem Observations (`…22.4.4`) directly under
 * each `<entry>` — reusing the exact observation the Problems section builds, but
 * **without** the Problem Concern Act (`…22.4.3`) wrapper. That structural
 * distinction is load-bearing: the parser routes a bare observation to
 * `getPastMedicalHistory` and a concern-wrapped one to `getProblems`, so a resolved
 * past illness is **never double-counted** as an active problem concern. Each
 * observation carries the SHALL fixed `code` (SNOMED CT `55607006` "Problem"), a
 * SHALL `statusCode` (`completed`), the SHALL `effectiveTime` (onset as `low`, a
 * `nullFlavor="UNK"` `high` for a resolved problem — never a guessed date), and the
 * coded condition in `value`; an absent onset/resolution is `nullFlavor="UNK"`,
 * never invented. The section has no entries-required variant and, like the other
 * non-SHALL sections, is emitted only when populated.
 *
 * **This slice adds Plan of Treatment.** A **Plan of Treatment** section (V2,
 * `…22.2.10`, LOINC `18776-5`, the R2.1 `2014-06-09` stamp) emits one or more of
 * the six planned-entry templates — a Planned Act (`…4.39`), Encounter (`…4.40`),
 * Procedure (`…4.41`), Medication Activity (`…4.42`), Supply (`…4.43`), or
 * Observation (`…4.44`) — each with its coded order (its default code system
 * varies by kind: SNOMED CT for an act/procedure/supply, CPT for an encounter,
 * LOINC for an observation, RxNorm — via the `consumable` — for a medication), a
 * planned `@moodCode`, and the SHALL `statusCode` fixed to `active`. **Planned is
 * never conflated with performed.** The builder input admits *only* planned
 * `@moodCode`s (default `INT`) — `EVN` is not representable — and, correct by
 * construction, splits the mood type by kind so the appointment moods
 * (`APT`/`ARQ`) are representable **only** on act/encounter/procedure (whose CDA
 * mood domains permit them) and never on a medication/supply/observation (whose
 * `x_DocumentSubstanceMood` / `x_ActMoodDocumentObservation` domains exclude
 * them). `statusCode` is fixed to `active` (never a performed `completed`), so
 * every entry reads back through the parser as `disposition: "planned"`, never
 * mistaken for a performed Procedure or Encounter.
 * The planned `effectiveTime` is SHOULD [0..1], emitted only when supplied (a plan
 * may be undated — never a fabricated date), and the Planned Observation's
 * expected coded result `value` [0..1] is emitted only when supplied, never
 * invented. Like the other non-SHALL sections it is emitted only when populated,
 * and its section has no entries-required variant.
 *
 * **This slice adds Family History.** A **Family History** section (V3,
 * `…22.2.15`, LOINC `10157-6`, the R2.1 `2015-08-01` stamp) emits one or more
 * Family History Organizers (`…22.4.45`) — one per relative. Each organizer names
 * the relative through its `subject/relatedSubject` (`@classCode="PRS"`): a coded
 * `relationship` (SNOMED CT by default, e.g. `72705000` mother, `9947008`
 * father), and the MAY `gender`/`birthTime`/`sdtc:deceasedInd` demographics. Under
 * it, each condition is a Family History Observation (`…22.4.46`) carrying the
 * SHALL fixed `code` (SNOMED CT `64572001` "Condition"), the SHALL coded
 * `value` (the illness), and optionally a nested Age Observation (`…22.4.31`, age
 * at onset) and/or Family History Death Observation (`…22.4.47`, cause of death).
 * **Nothing clinical is fabricated:** an unknown relationship is
 * `relatedSubject/code nullFlavor="UNK"` and an unknown condition is `value
 * nullFlavor="UNK"` — an explicit unknown, never a guessed relation or illness;
 * the MAY demographics, age, death flag, and SHOULD `effectiveTime` are each
 * emitted only when supplied. Like the other non-SHALL sections it is emitted only
 * when populated, and its section has no entries-required variant.
 *
 * **This slice adds direct-entry Assessment Scale Observations.** The Functional
 * Status and Mental Status sections can now carry **Assessment Scale
 * Observations** (`…22.4.69`) — formal scored instruments such as a PHQ-9
 * depression screen or a Glasgow Coma scale. C-CDA R2.1 places these as **direct
 * section entries** (`entry/observation`), **not** as Functional/Mental Status
 * Organizer members, so the builder emits each directly under its section with the
 * **bare-root** templateId `…22.4.69` (R2.1 SHALL: `@root` with **no**
 * `@extension`), the scale `code` (LOINC), a SHALL `statusCode` (`completed`), the
 * SHALL `effectiveTime` [1..1], and the SHALL `value` [1..1] carrying the total
 * score as an `xsi:type="INT"` (the type C-CDA prefers for a questionnaire — units
 * are not allowed on an INT). The individual items are optional Assessment Scale
 * Supporting Observations (`…22.4.86`, bare root) grouped by `entryRelationship`
 * `typeCode="COMP"`, each with its own INT score. **The score is never
 * fabricated:** an omitted score (total or item) is emitted as `value
 * nullFlavor="UNK"`, an explicit unknown the parser reads back as an `integer`
 * value with no number — never a guessed reading. Because only the carrying
 * section's templates are emitted, the parser tags each scale `domain:
 * "functional"` or `"mental"` from its section, never conflating the two — exactly
 * the placement the slice-11 organizers deferred to here.
 *
 * **SHALL `effectiveTime` on every entry.** Each act/observation the builder
 * emits carries the `effectiveTime` its C-CDA R2.1 template requires — the
 * Problem/Allergy Concern Acts and their observations, the Medication Activity
 * IVL_TS duration, and the Result/Vital Signs organizers and observations. When
 * the caller supplied a time it is used; when a SHALL requires the element but no
 * time is known the slot is filled with `nullFlavor="UNK"` (satisfying the
 * cardinality without fabricating a clinical timestamp, and read back as absent),
 * mirroring how the header's SHALL `addr`/`telecom` and the never-guessed
 * dose/route are handled.
 *
 * **This slice adds a second document type: the Referral Note.** `buildCcda`
 * now emits either a **CCD** (default) or a **Referral Note**
 * (`documentType: "referralNote"`), establishing the multi-document-type pattern
 * in the builder. The Referral Note specializes the US Realm Header — its own
 * document `templateId` root (`…22.1.14`, the R2.1 `2015-08-01` stamp), LOINC
 * document `code` (`57133-1` "Referral Note"), and title — and its own SHALL
 * section set: the entries-required **Problems**, **Allergies**, and
 * **Medications** (each emitted empty as `nullFlavor="NI"` when the caller
 * supplies none), plus the narrative-only **Reason for Referral** (V2,
 * `1.3.6.1.4.1.19376.1.5.3.1.3.1`, LOINC `42349-1`), **Assessment** (`…22.2.8`,
 * unversioned — a root-only `templateId` with no `@extension` — LOINC `51848-0`),
 * and **Plan of Treatment** (`…22.2.10`, LOINC `18776-5`) — the last three
 * satisfying the Referral Note's Assessment/Plan narrative requirements
 * (confirmed against the C-CDA R2.1 IG StructureDefinition and the CC0
 * onc-healthit ToC Referral Note certification sample). Results and Vital Signs
 * are **not** Referral Note SHALL sections, so — unlike in a CCD, where they are
 * always emitted — they appear only when the caller supplies content. Every
 * emitted section is one the parser recognizes, so a clean Referral Note build
 * round-trips through {@link parseCcda} with **zero warnings**, exactly like a
 * CCD. The remaining ten document types, C-CDA document *editing*, and the
 * bring-your-own-credentials terminology adapter are deferred to a later
 * CCDA-P7 increment.
 *
 * @packageDocumentation
 */

import { CVX, INTERPRETATION, LOINC, NCI_ROUTE, RXNORM, SNOMED_CT } from "../model/code-systems.js";
import type { CcdaDocument } from "../model/document.js";
import type { PlannedItemKind } from "../model/entries/plan-of-treatment.js";
import type { ProcedureKind } from "../model/entries/procedure.js";
import { parseCcda } from "../parser/index.js";
import {
  AGE_OBSERVATION,
  ALLERGY_CONCERN_ACT,
  ALLERGY_OBSERVATION,
  ASSESSMENT_SCALE_OBSERVATION,
  ASSESSMENT_SCALE_SUPPORTING_OBSERVATION,
  CRITICALITY_OBSERVATION,
  ENCOUNTER_ACTIVITY,
  FAMILY_HISTORY_DEATH_OBSERVATION,
  FAMILY_HISTORY_OBSERVATION,
  FAMILY_HISTORY_ORGANIZER,
  FUNCTIONAL_STATUS_OBSERVATION,
  FUNCTIONAL_STATUS_ORGANIZER,
  IMMUNIZATION_ACTIVITY,
  IMMUNIZATION_MEDICATION_INFORMATION,
  MEDICATION_ACTIVITY,
  MEDICATION_INFORMATION,
  MENTAL_STATUS_OBSERVATION,
  MENTAL_STATUS_ORGANIZER,
  PLANNED_ACT,
  PLANNED_ENCOUNTER,
  PLANNED_MEDICATION_ACTIVITY,
  PLANNED_OBSERVATION,
  PLANNED_PROCEDURE,
  PLANNED_SUPPLY,
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

import { el, newCdaDocument, sdtcEl, textEl, typedEl, typedValue, type Attrs } from "./dom.js";
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
/** The Referral Note document template OID (root); the R2.1 stamp lives in `@extension`. @internal */
const REFERRAL_NOTE_TEMPLATE = "2.16.840.1.113883.10.20.22.1.14";
/**
 * The LOINC document-type code + title for a Referral Note (`57133-1`,
 * confirmed against the C-CDA R2.1 IG StructureDefinition and the CC0
 * onc-healthit ToC certification sample). @internal
 */
const REFERRAL_NOTE_DOC_CODE = { code: "57133-1", displayName: "Referral Note" } as const;
/**
 * The Assessment Section (`…22.2.8`, LOINC `51848-0`). Narrative-only. Note it
 * is **unversioned** in C-CDA R2.1 — there is no R2.0/R2.1 revision, so the
 * section carries the base R1.1 `templateId` with **no `@extension`** (verified
 * in the CC0 onc-healthit ToC Referral Note sample). @internal
 */
const ASSESSMENT_SECTION_BASE = "2.16.840.1.113883.10.20.22.2.8";
/** The LOINC `code` + title for the Assessment Section. @internal */
const ASSESSMENT_CODE = { code: "51848-0", displayName: "Assessment" } as const;
/**
 * The Reason for Referral Section (V2). An IHE PCC template, so its OID is the
 * IHE root (not a C-CDA `…22.2.*` OID); the R2.1 version stamp is the
 * `@extension` `2014-06-09`. Narrative-only. @internal
 */
const REASON_FOR_REFERRAL_SECTION_BASE = "1.3.6.1.4.1.19376.1.5.3.1.3.1";
/** The `@extension` stamp the Reason for Referral Section (V2) carries. @internal */
const REASON_FOR_REFERRAL_EXT = "2014-06-09";
/** The LOINC `code` + title for the Reason for Referral Section. @internal */
const REASON_FOR_REFERRAL_CODE = { code: "42349-1", displayName: "Reason for Referral" } as const;
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
 * The `@extension` stamp carried by both the Functional Status Section (V2,
 * `…22.2.14`) and the Functional Status Observation (`…22.4.67`) — R2.1's
 * `2014-06-09` version, not the `2015-08-01` stamp the CCD SHALL sections use.
 * @internal
 */
const FUNCTIONAL_STATUS_EXT = "2014-06-09";
/**
 * The LOINC `code` every Functional Status Observation carries — `54522-8`
 * "Functional status", **fixed** by the template (CONF: `patternCode`,
 * independent of the specific finding). The finding itself lives in the coded
 * `value`, never in this `code`. @internal
 */
const FUNCTIONAL_STATUS_CODE = {
  code: "54522-8",
  displayName: "Functional status",
} as const;
/**
 * The `@extension` stamp carried by both the Mental Status Section (V2,
 * `…22.2.56`) and the Mental Status Observation (`…22.4.74`). Unlike Functional
 * Status (which keeps the `2014-06-09` version), the Mental Status Section and its
 * observation were **introduced in the R2.1 August 2015 errata** — split out of
 * Functional Status, "not backwards compatible with prior `…22.2.14`" — so they
 * carry the `2015-08-01` stamp. Verified against the HL7 C-CDA R2.1 examples
 * (`Mental Status/*(C-CDAR2.1).xml`). @internal
 */
const MENTAL_STATUS_EXT = "2015-08-01";
/**
 * The SNOMED CT `code` every Mental Status Observation carries — `373930000`
 * "Cognitive function finding", **fixed** by the R2.1 template (the IG notes "In
 * C-CDA R2.1 August 2015 this is a fixed code"; both R2.1 examples emit it). The
 * specific finding lives in the coded `value`, never in this `code` — exactly as
 * Functional Status fixes LOINC `54522-8`. (A later C-CDA version re-binds this
 * code to LOINC `8693-4`; that is out of scope for this R2.1 builder.) @internal
 */
const MENTAL_STATUS_CODE = {
  code: "373930000",
  displayName: "Cognitive function finding",
} as const;
/**
 * The `@extension` stamp carried by the Plan of Treatment Section (V2,
 * `…22.2.10`) and all six planned-entry templates it can carry (Planned Act
 * `…4.39`, Encounter `…4.40`, Procedure `…4.41`, Medication Activity `…4.42`,
 * Supply `…4.43`, Observation `…4.44`) — R2.1's `2014-06-09` version, not the
 * `2015-08-01` stamp the CCD SHALL sections use. @internal
 */
const PLAN_OF_TREATMENT_EXT = "2014-06-09";
/**
 * The HL7 AdministrativeGender code system OID — the terminology for a family
 * member's `administrativeGenderCode` (the same system the patient's gender
 * uses). @internal
 */
const ADMINISTRATIVE_GENDER = "2.16.840.1.113883.5.1";
/**
 * The fixed `code` every Family History Observation (`…22.4.46`) carries —
 * SNOMED CT `64572001` "Condition". Like the Problem Observation's fixed
 * "Problem" code, this names the *kind* of observation; the specific illness
 * lives in the coded `value`. @internal
 */
const FAMILY_HISTORY_CONDITION_CODE = { code: "64572001", displayName: "Condition" } as const;
/**
 * The fixed `code` an Age Observation (`…22.4.31`) carries — SNOMED CT
 * `397659008` "Age". The relative's age at onset is the observation's `PQ`
 * `value` (in UCUM years). @internal
 */
const AGE_OBSERVATION_CODE = { code: "397659008", displayName: "Age" } as const;
/**
 * The UCUM unit for an age in years (`a`, annum) — the unit the Age Observation
 * `value` carries. @internal
 */
const AGE_UNIT = "a";
/**
 * The fixed coded `value` a Family History Death Observation (`…22.4.47`)
 * carries — SNOMED CT `419620001` "Death" — marking its parent condition as the
 * relative's cause of death. @internal
 */
const DEATH_VALUE = { code: "419620001", displayName: "Death" } as const;

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
 * A Functional Status finding for the Functional Status section — a Functional
 * Status Observation (`…22.4.67`, the `2014-06-09` stamp). The observation's
 * `code` is **fixed** to LOINC `54522-8` "Functional status" by the template;
 * the specific finding is the coded `value`. `value` is the SNOMED CT finding
 * (e.g. able to walk `165245003`, dependent on wheelchair `105503008`,
 * self-care `129019007`).
 *
 * **Functional and mental status are never conflated.** This builds only the
 * Functional Status templates (section `…22.2.14`, observation `…22.4.67`), so
 * the parser reads every finding back tagged `domain: "functional"` — a
 * functional finding is never filed under mental status (or vice versa).
 *
 * **Unknown is never defaulted to a finding.** When `value` is omitted the
 * observation's SHALL `value` is emitted as `nullFlavor="UNK"` — an *explicit*
 * unknown, never invented as a real finding. `effectiveTime` is when the status
 * was assessed; the template's SHALL effectiveTime is filled with
 * `nullFlavor="UNK"` when the caller supplies none, never a fabricated date.
 *
 * @example
 * ```ts
 * import type { BuildCcdaFunctionalStatus } from "@cosyte/ccda";
 * const ambulation: BuildCcdaFunctionalStatus = {
 *   value: { code: "165245003", displayName: "Able to walk" }, // SNOMED CT
 *   effectiveTime: "20240101",
 * };
 * const unrecorded: BuildCcdaFunctionalStatus = {}; // → value nullFlavor="UNK"
 * ```
 */
export interface BuildCcdaFunctionalStatus {
  /**
   * The SNOMED CT functional-status finding (the observation `value`). Omit for
   * an explicit unknown (`value nullFlavor="UNK"`) — never defaulted to a real
   * finding.
   */
  readonly value?: BuildCode;
  /** The date the status was assessed (HL7 date string); `nullFlavor="UNK"` when omitted. */
  readonly effectiveTime?: string;
}

/**
 * A Mental Status finding for the Mental Status section — a Mental Status
 * Observation (`…22.4.74`, the R2.1 `2015-08-01` stamp). The observation's `code`
 * is **fixed** to SNOMED CT `373930000` "Cognitive function finding" by the R2.1
 * template; the specific cognition/mood finding is the coded `value` (e.g. memory
 * impairment `386807006`, no abnormality detected `281900007` — SNOMED CT).
 *
 * **Mental and functional status are never conflated.** This builds only the
 * Mental Status templates (section `…22.2.56`, observation `…22.4.74`), so the
 * parser reads every finding back tagged `domain: "mental"` — a mental finding is
 * never filed under functional status (or vice versa); the two extractors key off
 * their distinct observation template roots.
 *
 * **Unknown is never defaulted to a finding.** When `value` is omitted the
 * observation's SHALL `value` is emitted as `nullFlavor="UNK"` — an *explicit*
 * unknown, never invented as a real finding. `effectiveTime` is when the status
 * was assessed; the template's SHALL effectiveTime is filled with
 * `nullFlavor="UNK"` when the caller supplies none, never a fabricated date.
 *
 * @example
 * ```ts
 * import type { BuildCcdaMentalStatus } from "@cosyte/ccda";
 * const memory: BuildCcdaMentalStatus = {
 *   value: { code: "386807006", displayName: "Memory impairment" }, // SNOMED CT
 *   effectiveTime: "20240101",
 * };
 * const unrecorded: BuildCcdaMentalStatus = {}; // → value nullFlavor="UNK"
 * ```
 */
export interface BuildCcdaMentalStatus {
  /**
   * The SNOMED CT mental-status finding (the observation `value`). Omit for an
   * explicit unknown (`value nullFlavor="UNK"`) — never defaulted to a real
   * finding.
   */
  readonly value?: BuildCode;
  /** The date the status was assessed (HL7 date string); `nullFlavor="UNK"` when omitted. */
  readonly effectiveTime?: string;
}

/**
 * A Functional Status Organizer for the Functional Status section — a Functional
 * Status Organizer (`…22.4.66`, the `2014-06-09` stamp, `@classCode="CLUSTER"`)
 * that **groups** two or more related Functional Status Observations (`…22.4.67`)
 * under one categorization. Use it instead of standalone findings when the
 * assessment is a cluster (e.g. all self-care ADLs recorded together); each
 * grouped observation is otherwise identical to a standalone
 * {@link BuildCcdaFunctionalStatus} and reads back tagged `domain: "functional"`.
 *
 * **`code` is the organizer's categorization, not a finding.** It SHALL be present
 * [1..1] and SHOULD be drawn from ICF (`2.16.840.1.113883.6.254`) or LOINC — pass
 * the ICF chapter/category (e.g. `d5` "Self-care") via `code` with its
 * `codeSystem`. When omitted the SHALL `code` is emitted as `nullFlavor="UNK"` — an
 * *explicit* unknown category, never a fabricated one. `codeSystem` defaults to
 * LOINC when a `code` is supplied without one.
 *
 * **`findings` must be non-empty.** The organizer SHALL contain at least one
 * [1..\*] Functional Status Observation; an empty organizer is a `TypeError`
 * (never an organizer emitted with zero members). The Assessment Scale Observation
 * (`…22.4.69`) — a scored scale such as a Barthel index — is a *direct section
 * entry* in C-CDA R2.1, **not** an organizer component, and is deferred to a later
 * increment; only status observations are grouped here.
 *
 * @example
 * ```ts
 * import type { BuildCcdaFunctionalStatusOrganizer } from "@cosyte/ccda";
 * const selfCare: BuildCcdaFunctionalStatusOrganizer = {
 *   code: { code: "d5", displayName: "Self-care", codeSystem: "2.16.840.1.113883.6.254" }, // ICF
 *   effectiveTime: "20240101",
 *   findings: [
 *     { value: { code: "129019007", displayName: "Self-care" } }, // SNOMED CT
 *     { value: { code: "165245003", displayName: "Able to walk" } },
 *   ],
 * };
 * ```
 */
export interface BuildCcdaFunctionalStatusOrganizer {
  /**
   * The organizer's categorization `code` (SHOULD be ICF or LOINC). Omit for an
   * explicit unknown (`code nullFlavor="UNK"`) — never a fabricated category.
   * `codeSystem` defaults to LOINC when a `code` is supplied without one.
   */
  readonly code?: BuildCode;
  /** When the grouped assessment was performed (HL7 date string); omitted (not fabricated) when absent. */
  readonly effectiveTime?: string;
  /**
   * The Functional Status Observations grouped by this organizer. **Must be
   * non-empty** — the organizer SHALL contain at least one member.
   */
  readonly findings: readonly BuildCcdaFunctionalStatus[];
}

/**
 * A Mental Status Organizer for the Mental Status section — a Mental Status
 * Organizer (`…22.4.75`, the R2.1 `2015-08-01` stamp, `@classCode="CLUSTER"`) that
 * **groups** two or more related Mental Status Observations (`…22.4.74`) under one
 * categorization. Use it instead of standalone findings when the assessment is a
 * cluster (e.g. an orientation battery); each grouped observation is otherwise
 * identical to a standalone {@link BuildCcdaMentalStatus} and reads back tagged
 * `domain: "mental"` — **never conflated** with functional status (the two key off
 * distinct organizer/observation roots).
 *
 * **`code` is the organizer's categorization, not a finding.** It SHALL be present
 * [1..1] and SHOULD be drawn from ICF (`2.16.840.1.113883.6.254`) or LOINC. When
 * omitted the SHALL `code` is emitted as `nullFlavor="UNK"` — an *explicit* unknown
 * category, never fabricated. `codeSystem` defaults to LOINC when a `code` is
 * supplied without one.
 *
 * **`findings` must be non-empty.** The organizer SHALL contain at least one
 * [1..\*] Mental Status Observation; an empty organizer is a `TypeError`. The
 * Assessment Scale Observation (`…22.4.69`) is a *direct section entry* in R2.1,
 * **not** an organizer component, and is deferred to a later increment.
 *
 * @example
 * ```ts
 * import type { BuildCcdaMentalStatusOrganizer } from "@cosyte/ccda";
 * const cognition: BuildCcdaMentalStatusOrganizer = {
 *   effectiveTime: "20240101",
 *   findings: [
 *     { value: { code: "386807006", displayName: "Memory impairment" } }, // SNOMED CT
 *     { value: { code: "247663003", displayName: "Orientation finding" } },
 *   ],
 * };
 * ```
 */
export interface BuildCcdaMentalStatusOrganizer {
  /**
   * The organizer's categorization `code` (SHOULD be ICF or LOINC). Omit for an
   * explicit unknown (`code nullFlavor="UNK"`) — never a fabricated category.
   * `codeSystem` defaults to LOINC when a `code` is supplied without one.
   */
  readonly code?: BuildCode;
  /** When the grouped assessment was performed (HL7 date string); omitted (not fabricated) when absent. */
  readonly effectiveTime?: string;
  /**
   * The Mental Status Observations grouped by this organizer. **Must be
   * non-empty** — the organizer SHALL contain at least one member.
   */
  readonly findings: readonly BuildCcdaMentalStatus[];
}

/**
 * One scored component of an Assessment Scale — an Assessment Scale Supporting
 * Observation (`…22.4.86`), e.g. a single PHQ-9 question or a Glasgow Coma
 * sub-score. `code` is the item's LOINC/SNOMED code (SHALL, LOINC default);
 * `score` its integer answer (the SHALL `value`, `xsi:type="INT"`).
 *
 * **The answer is never fabricated.** When `score` is omitted the SHALL `value`
 * is emitted as `nullFlavor="UNK"` — an *explicit* unknown, never a guessed
 * number. Units are not allowed on an `INT`, so a supporting item carries no unit.
 *
 * @example
 * ```ts
 * import type { BuildCcdaAssessmentScaleItem } from "@cosyte/ccda";
 * const q1: BuildCcdaAssessmentScaleItem = {
 *   code: { code: "44250-9", displayName: "Little interest or pleasure in doing things" },
 *   score: 0,
 * };
 * ```
 */
export interface BuildCcdaAssessmentScaleItem {
  /** The component's LOINC/SNOMED code (LOINC default). */
  readonly code: BuildCode;
  /** The integer answer/score (`xsi:type="INT"`). Omit → `value nullFlavor="UNK"`. */
  readonly score?: number;
}

/**
 * A direct-entry Assessment Scale Observation (`…22.4.69`) for the Functional
 * Status or Mental Status section — a formal scored instrument (e.g. a PHQ-9
 * depression screen or a Glasgow Coma scale). C-CDA R2.1 carries the Assessment
 * Scale Observation as a **direct section entry** (`entry/observation`), *not* as
 * a Functional/Mental Status Organizer member — so the builder emits it directly
 * under the section, and the parser reads it back tagged `assessmentScale: true`
 * with the section's `domain`. The template id is the **bare root** `…22.4.69`
 * (R2.1 SHALL: `@root` with **no** `@extension`).
 *
 * **`code` is the scale panel code** (LOINC by default, e.g. PHQ-9 `44249-1`).
 * `score` is the total score, emitted as the SHALL `value` [1..1] with
 * `xsi:type="INT"` (the type C-CDA prefers for a questionnaire — units are not
 * allowed on an `INT`). **The score is never fabricated:** when `score` is
 * omitted the SHALL `value` is `nullFlavor="UNK"`, an explicit unknown. The SHALL
 * `effectiveTime` [1..1] is the administration time (`nullFlavor="UNK"` when
 * omitted). `interpretation` (e.g. High/Low/Normal) and the `supporting`
 * components (the individual items) are optional — each emitted only when
 * supplied, never invented.
 *
 * @example
 * ```ts
 * import type { BuildCcdaAssessmentScale } from "@cosyte/ccda";
 * const phq9: BuildCcdaAssessmentScale = {
 *   code: { code: "44249-1", displayName: "PHQ-9 quick depression assessment panel" }, // LOINC
 *   score: 12,
 *   effectiveTime: "20240101",
 *   interpretation: { code: "H", displayName: "High" },
 *   supporting: [
 *     { code: { code: "44250-9", displayName: "Little interest or pleasure in doing things" }, score: 0 },
 *   ],
 * };
 * ```
 */
export interface BuildCcdaAssessmentScale {
  /** The scale/panel code (LOINC by default, e.g. PHQ-9 `44249-1`). */
  readonly code: BuildCode;
  /** The total score (`xsi:type="INT"`). Omit → SHALL `value nullFlavor="UNK"`. */
  readonly score?: number;
  /** When the scale was administered (HL7 date string); `nullFlavor="UNK"` when omitted. */
  readonly effectiveTime?: string;
  /** The score interpretation (HL7 ObservationInterpretation by default), optional. */
  readonly interpretation?: BuildCode;
  /** The individual scored components; each an Assessment Scale Supporting Observation. Optional. */
  readonly supporting?: readonly BuildCcdaAssessmentScaleItem[];
}

/**
 * The relative a {@link BuildCcdaFamilyHistory} organizer describes — the family
 * member whose conditions the organizer records. Emitted as the organizer's
 * `subject/relatedSubject` (a `@classCode="PRS"` personal relationship).
 *
 * **The relationship is never fabricated.** `relationship` is the coded relation
 * of the relative to the patient — SNOMED CT by default (e.g. `72705000` mother,
 * `9947008` father, `394859005`… ), overridable via `codeSystem` (e.g. the HL7
 * RoleCode `FTH`/`MTH` on `2.16.840.1.113883.5.111`). When omitted, the SHALL
 * `relatedSubject/code` is emitted as `nullFlavor="UNK"` — an *explicit* unknown
 * relation, never guessed. `gender` (an HL7 AdministrativeGender code, e.g.
 * `"M"`/`"F"`), `birthTime` (an HL7 date string), and `deceased` (the
 * `sdtc:deceasedInd` flag) are all optional MAY elements — each emitted only when
 * supplied, never fabricated.
 *
 * @example
 * ```ts
 * import type { BuildCcdaFamilyMember } from "@cosyte/ccda";
 * const mother: BuildCcdaFamilyMember = {
 *   relationship: { code: "72705000", displayName: "Mother" }, // SNOMED CT
 *   gender: "F",
 *   deceased: true,
 * };
 * ```
 */
export interface BuildCcdaFamilyMember {
  /**
   * The coded relationship of the relative to the patient (SNOMED CT default).
   * Omit for an explicit unknown (`relatedSubject/code nullFlavor="UNK"`) — never
   * guessed.
   */
  readonly relationship?: BuildCode;
  /** The relative's HL7 AdministrativeGender code (e.g. `"M"`/`"F"`); emitted only when supplied. */
  readonly gender?: string;
  /** The relative's birth date (HL7 date string); emitted only when supplied. */
  readonly birthTime?: string;
  /** Whether the relative is deceased (`sdtc:deceasedInd`); emitted only when supplied. */
  readonly deceased?: boolean;
}

/**
 * A single condition recorded for a relative — one Family History Observation
 * (`…22.4.46`). The illness is the coded `condition` (SNOMED CT by default);
 * `ageAtOnset` (whole UCUM years) becomes a nested Age Observation (`…22.4.31`);
 * `causeOfDeath` adds a Family History Death Observation (`…22.4.47`) marking this
 * condition as the relative's cause of death; `effectiveTime` (an HL7 date
 * string) is the SHOULD [0..1] time of the condition.
 *
 * **The condition is never fabricated.** When `condition` is omitted the SHALL
 * `value` is emitted as `nullFlavor="UNK"` — an *explicit* unknown, never a
 * guessed illness. `ageAtOnset`, `causeOfDeath`, and `effectiveTime` are optional
 * — each emitted only when supplied, never invented.
 *
 * @example
 * ```ts
 * import type { BuildCcdaFamilyHistoryObservation } from "@cosyte/ccda";
 * const mi: BuildCcdaFamilyHistoryObservation = {
 *   condition: { code: "22298006", displayName: "Myocardial infarction" }, // SNOMED CT
 *   ageAtOnset: 57,
 *   causeOfDeath: true,
 * };
 * ```
 */
export interface BuildCcdaFamilyHistoryObservation {
  /**
   * The coded condition the relative had (SNOMED CT default). Omit for an explicit
   * unknown (`value nullFlavor="UNK"`) — never guessed.
   */
  readonly condition?: BuildCode;
  /** The relative's age at onset in whole years — a nested Age Observation, emitted only when supplied. */
  readonly ageAtOnset?: number;
  /** When `true`, marks this condition as the relative's cause of death (Family History Death Observation). */
  readonly causeOfDeath?: boolean;
  /** The time/date of the condition (HL7 date string); the SHOULD [0..1] effectiveTime, emitted only when supplied. */
  readonly effectiveTime?: string;
}

/**
 * One Family History Organizer (`…22.4.45`) for the Family History section — a
 * single `relative` plus the `observations` (conditions) recorded for them. The
 * relative's identity is carried once on the organizer (not flattened into each
 * condition), so the parser reads every condition back grouped under its relative.
 *
 * @example
 * ```ts
 * import type { BuildCcdaFamilyHistory } from "@cosyte/ccda";
 * const father: BuildCcdaFamilyHistory = {
 *   relative: { relationship: { code: "9947008", displayName: "Father" }, deceased: true },
 *   observations: [
 *     { condition: { code: "22298006", displayName: "Myocardial infarction" }, causeOfDeath: true },
 *   ],
 * };
 * ```
 */
export interface BuildCcdaFamilyHistory {
  /** The family member this organizer describes. */
  readonly relative: BuildCcdaFamilyMember;
  /**
   * The conditions recorded for the relative; each becomes a Family History
   * Observation. **Must be non-empty** — the organizer SHALL carry at least one
   * observation component; pass `[{}]` (an unknown condition) rather than an empty
   * list, else {@link buildCcda} throws a `TypeError`.
   */
  readonly observations: readonly BuildCcdaFamilyHistoryObservation[];
}

/**
 * The planned `@moodCode` for the **act / encounter / procedure** kinds — the
 * Planned moodCode value set (`2.16.840.1.113883.11.20.9.23`): `INT` intent
 * (default), `RQO` request/order, `PRMS` promise, `PRP` proposal, `APT`
 * appointment, `ARQ` appointment request. The appointment moods (`APT`/`ARQ`)
 * are valid **only** on these three element domains (`x_DocumentActMood` /
 * `x_DocumentEncounterMood` / `x_DocumentProcedureMood`). `EVN` (a performed
 * event) is deliberately not a member — the plan carries only future/ordered
 * items, so a performed act can never be emitted into it.
 *
 * @example
 * ```ts
 * import type { PlannedActMood } from "@cosyte/ccda";
 * const appointment: PlannedActMood = "APT";
 * ```
 */
export type PlannedActMood = "INT" | "RQO" | "PRMS" | "PRP" | "APT" | "ARQ";

/**
 * The planned `@moodCode` for the **medication / supply / observation** kinds.
 * The base CDA R2 mood domains for these elements — `x_DocumentSubstanceMood`
 * (`substanceAdministration`/`supply`) and `x_ActMoodDocumentObservation`
 * (`observation`) — **exclude the appointment moods** (`APT`/`ARQ`), so those are
 * not representable here (you cannot "appoint" a drug order or a lab). `EVN` is
 * likewise excluded — the plan is future/ordered, never performed.
 *
 * @example
 * ```ts
 * import type { PlannedOrderMood } from "@cosyte/ccda";
 * const order: PlannedOrderMood = "RQO";
 * ```
 */
export type PlannedOrderMood = "INT" | "RQO" | "PRMS" | "PRP";

/** Fields shared by every {@link BuildCcdaPlannedItem} variant. @internal */
interface BuildCcdaPlannedItemBase {
  /** The planned act/observation/drug code; default code system varies by `kind`. */
  readonly code: BuildCode;
  /** The planned time as an HL7 date string; emitted only when supplied (SHOULD [0..1]). */
  readonly effectiveTime?: string;
}

/**
 * A planned Act / Encounter / Procedure (`…4.39` / `…4.40` / `…4.41`). `mood`
 * accepts the full Planned moodCode value set including the appointment moods
 * (`APT`/`ARQ`), which are valid on these element domains. Default code system:
 * SNOMED CT for an act/procedure, CPT for an encounter.
 *
 * @example
 * ```ts
 * import type { BuildCcdaPlannedAct } from "@cosyte/ccda";
 * const visit: BuildCcdaPlannedAct = {
 *   kind: "encounter",
 *   code: { code: "99213", displayName: "Office outpatient visit 15 minutes" },
 *   mood: "APT",
 * };
 * ```
 */
export interface BuildCcdaPlannedAct extends BuildCcdaPlannedItemBase {
  readonly kind: "act" | "encounter" | "procedure";
  /** The planned `@moodCode`; defaults to `"INT"`. Appointment moods allowed here. */
  readonly mood?: PlannedActMood;
}

/**
 * A planned Medication Activity or Supply (`…4.42` / `…4.43`). `mood` excludes
 * the appointment moods (not in these elements' base mood domain). The drug/supply
 * code defaults to RxNorm (medication, emitted in the `consumable`) / SNOMED CT
 * (supply).
 *
 * @example
 * ```ts
 * import type { BuildCcdaPlannedOrder } from "@cosyte/ccda";
 * const order: BuildCcdaPlannedOrder = {
 *   kind: "medicationActivity",
 *   code: { code: "314076", displayName: "Lisinopril 10 MG Oral Tablet" },
 *   mood: "RQO",
 * };
 * ```
 */
export interface BuildCcdaPlannedOrder extends BuildCcdaPlannedItemBase {
  readonly kind: "medicationActivity" | "supply";
  /** The planned `@moodCode`; defaults to `"INT"`. Appointment moods not representable. */
  readonly mood?: PlannedOrderMood;
}

/**
 * A planned Observation (`…4.44`). `mood` excludes the appointment moods (not in
 * `x_ActMoodDocumentObservation`). `value` is the expected coded result (a
 * goal/target, SNOMED CT by default), emitted only when supplied. Default code
 * system for the observation `code`: LOINC.
 *
 * @example
 * ```ts
 * import type { BuildCcdaPlannedObservation } from "@cosyte/ccda";
 * const cbc: BuildCcdaPlannedObservation = {
 *   kind: "observation",
 *   code: { code: "58410-2", displayName: "CBC panel" }, // LOINC
 *   mood: "RQO",
 *   effectiveTime: "20240801",
 * };
 * ```
 */
export interface BuildCcdaPlannedObservation extends BuildCcdaPlannedItemBase {
  readonly kind: "observation";
  /** The planned `@moodCode`; defaults to `"INT"`. Appointment moods not representable. */
  readonly mood?: PlannedOrderMood;
  /**
   * The expected coded result `value` (`xsi:type="CD"`, SNOMED CT default) — the
   * plan's goal/target. Emitted only when supplied; never fabricated.
   */
  readonly value?: BuildCode;
}

/**
 * A planned item for the Plan of Treatment section (`…22.2.10`) — a discriminated
 * union over the six planned-entry templates, split by which `@moodCode` domain
 * each element admits: {@link BuildCcdaPlannedAct} (act/encounter/procedure, which
 * accept the appointment moods `APT`/`ARQ`), {@link BuildCcdaPlannedOrder}
 * (medication/supply), and {@link BuildCcdaPlannedObservation} (observation, which
 * also carries an expected `value`). **The mood split is correct by
 * construction:** the base CDA R2 mood domains for `substanceAdministration`,
 * `supply`, and `observation` exclude `APT`/`ARQ`, so those appointment moods are
 * simply not representable on those kinds — the type prevents emitting a
 * schema-invalid `@moodCode`, not merely a discouraged one.
 *
 * **Everything here is future/ordered, never performed.** No variant admits the
 * performed `EVN`; each entry's `statusCode` is fixed to `"active"` (the SHALL the
 * planned templates require) — never a performed `"completed"` — and the planned
 * `@moodCode` reads back through the parser's `disposition` as `"planned"`; the
 * two dispositions are never conflated.
 *
 * @example
 * ```ts
 * import type { BuildCcdaPlannedItem } from "@cosyte/ccda";
 * const plannedColonoscopy: BuildCcdaPlannedItem = {
 *   kind: "procedure",
 *   code: { code: "73761001", displayName: "Colonoscopy" }, // SNOMED CT
 * };
 * ```
 */
export type BuildCcdaPlannedItem =
  | BuildCcdaPlannedAct
  | BuildCcdaPlannedOrder
  | BuildCcdaPlannedObservation;

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
  /**
   * The document type — `"ccd"` (default) or `"referralNote"`. Each specializes
   * the US Realm Header (its own document `templateId` + LOINC `code`) and its
   * SHALL section set; the other ten C-CDA R2.1 document types are deferred.
   */
  readonly documentType?: "ccd" | "referralNote";
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
  /** Standalone Functional Status findings; the Functional Status section is emitted when this or {@link functionalStatusOrganizers} is non-empty (a CCD SHOULD section). */
  readonly functionalStatus?: readonly BuildCcdaFunctionalStatus[];
  /**
   * Functional Status Organizers (each grouping ≥1 Functional Status Observation
   * under one categorization); emitted into the Functional Status section
   * alongside any standalone {@link functionalStatus} findings. The section is
   * emitted when either is non-empty.
   */
  readonly functionalStatusOrganizers?: readonly BuildCcdaFunctionalStatusOrganizer[];
  /**
   * Direct-entry Assessment Scale Observations (`…22.4.69`) for the Functional
   * Status section — scored instruments (e.g. a Barthel index, a Glasgow Coma
   * scale). Emitted as direct section entries (the conformant R2.1 placement),
   * read back tagged `assessmentScale: true`, `domain: "functional"`. The
   * Functional Status section is emitted when this, {@link functionalStatus}, or
   * {@link functionalStatusOrganizers} is non-empty.
   */
  readonly functionalStatusScales?: readonly BuildCcdaAssessmentScale[];
  /** Standalone Mental Status findings; the Mental Status section is emitted when this or {@link mentalStatusOrganizers} is non-empty (a CCD SHOULD section). */
  readonly mentalStatus?: readonly BuildCcdaMentalStatus[];
  /**
   * Mental Status Organizers (each grouping ≥1 Mental Status Observation under one
   * categorization); emitted into the Mental Status section alongside any
   * standalone {@link mentalStatus} findings. The section is emitted when either is
   * non-empty.
   */
  readonly mentalStatusOrganizers?: readonly BuildCcdaMentalStatusOrganizer[];
  /**
   * Direct-entry Assessment Scale Observations (`…22.4.69`) for the Mental Status
   * section — scored instruments (e.g. a PHQ-9 depression screen, a MoCA). Emitted
   * as direct section entries (the conformant R2.1 placement), read back tagged
   * `assessmentScale: true`, `domain: "mental"`. The Mental Status section is
   * emitted when this, {@link mentalStatus}, or {@link mentalStatusOrganizers} is
   * non-empty.
   */
  readonly mentalStatusScales?: readonly BuildCcdaAssessmentScale[];
  /**
   * Historical problems for the Past Medical History section; the section is
   * emitted only when non-empty (a CCD MAY section). Each is a bare Problem
   * Observation (not a concern act), read back via `getPastMedicalHistory` — never
   * conflated with the active Problems returned by `getProblems`.
   */
  readonly pastMedicalHistory?: readonly BuildCcdaProblem[];
  /**
   * Planned items for the Plan of Treatment section; the section is emitted only
   * when non-empty (a CCD SHOULD section). Every item is future/ordered — read
   * back via `getPlannedItems` with `disposition: "planned"`, never conflated
   * with the performed Procedures/Encounters.
   */
  readonly planOfTreatment?: readonly BuildCcdaPlannedItem[];
  /**
   * Family history for the Family History section; the section is emitted only
   * when non-empty (a CCD SHOULD section). Each entry is one relative (a Family
   * History Organizer) carrying that relative's conditions — read back via
   * `getFamilyHistory`, grouped by relative.
   */
  readonly familyHistory?: readonly BuildCcdaFamilyHistory[];
  /**
   * The Assessment Section narrative (`documentType: "referralNote"` only — a
   * Referral Note SHALL section). Narrative-only, so this is a free-text
   * clinician summary; when omitted the SHALL section is emitted as a spec-clean
   * empty `nullFlavor="NI"` section (never a fabricated assessment). Ignored for
   * a CCD.
   */
  readonly assessment?: string;
  /**
   * The Reason for Referral Section narrative (`documentType: "referralNote"`
   * only — a Referral Note SHALL section). Narrative-only free text; when omitted
   * the SHALL section is emitted as an empty `nullFlavor="NI"` section (never a
   * fabricated reason). Ignored for a CCD.
   */
  readonly reasonForReferral?: string;
}

/**
 * A section the builder always emits for a given document type (its SHALL set).
 * `"problems"`/`"allergies"`/`"medications"` are the entries-required clinical
 * sections; `"results"`/`"vitalSigns"` are always-on for a CCD; `"assessment"`,
 * `"reasonForReferral"`, and `"planOfTreatment"` are the Referral Note's
 * narrative SHALL sections. @internal
 */
type ShallSectionKey =
  | "problems"
  | "allergies"
  | "medications"
  | "results"
  | "vitalSigns"
  | "reasonForReferral"
  | "assessment"
  | "planOfTreatment";

/**
 * The header + SHALL-section specialization for one supported document type. The
 * `documentTemplateRoot` + `documentCode` drive the US Realm Header, and
 * `shallSections` is the ordered set the builder always emits (an empty one as a
 * spec-clean `nullFlavor="NI"` section) so the document is conformant for that
 * type and the parser's required-section validation stays quiet. @internal
 */
interface DocTypeSpec {
  /** The document-level `templateId` root (the R2.1 stamp is `@extension` `2015-08-01`). */
  readonly documentTemplateRoot: string;
  /** The LOINC document-type `code` + display/title. */
  readonly documentCode: { readonly code: string; readonly displayName: string };
  /** The ordered SHALL sections the builder always emits for this document type. */
  readonly shallSections: readonly ShallSectionKey[];
}

/**
 * The document types the builder can emit, each with its header + SHALL-section
 * specialization. **CCD** SHALL: Allergies, Medications, Problems, Results (+ the
 * builder always emits Vital Signs). **Referral Note** SHALL (confirmed against
 * the C-CDA R2.1 IG StructureDefinition + the CC0 onc-healthit ToC sample):
 * Problems, Allergies, Medications (entries-required), Reason for Referral,
 * Assessment, and Plan of Treatment — the last three satisfying the document's
 * "Assessment (and Plan) + Plan of Treatment" narrative requirements. Results and
 * Vital Signs are not Referral Note SHALL sections, so they become optional
 * (emitted only when populated). @internal
 */
const DOC_TYPE_SPECS: Readonly<Record<"ccd" | "referralNote", DocTypeSpec>> = {
  ccd: {
    documentTemplateRoot: CCD_TEMPLATE,
    documentCode: CCD_DOC_CODE,
    shallSections: ["problems", "allergies", "medications", "results", "vitalSigns"],
  },
  referralNote: {
    documentTemplateRoot: REFERRAL_NOTE_TEMPLATE,
    documentCode: REFERRAL_NOTE_DOC_CODE,
    shallSections: [
      "problems",
      "allergies",
      "medications",
      "reasonForReferral",
      "assessment",
      "planOfTreatment",
    ],
  },
};

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
 * Build a spec-clean C-CDA R2.1 document from structured input and return the
 * parsed {@link CcdaDocument}. Emits a **CCD** by default, or a **Referral Note**
 * when `documentType: "referralNote"` — each with its own US Realm Header
 * specialization (document `templateId` + LOINC `code`) and SHALL section set.
 * The emitted document round-trips through {@link parseCcda} by construction (see
 * the module doc); a clean build carries zero warnings.
 *
 * @param init - The document content; see {@link BuildCcdaInit}. `patient` is required.
 * @returns The parsed document — the parse of the spec-clean XML just emitted.
 * @throws {TypeError} When `documentType` is anything other than `"ccd"` or
 *   `"referralNote"` (the only two types this builder supports), when an allergy
 *   is neither an `allergen` nor `noKnownAllergy`, when a result does not carry
 *   exactly one value form (`quantity` / `codedValue` / `stringValue`), when a
 *   `"observation"`-variant procedure omits its SHALL `value`, or when a
 *   family-history entry carries an empty `observations` list.
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
  // Typed as a closed union so the compiler narrows an invalid value to `never`;
  // widen to a string for the runtime guard that protects untyped (JS) callers.
  const documentType: string = init.documentType ?? "ccd";
  if (documentType !== "ccd" && documentType !== "referralNote") {
    throw new TypeError(
      `buildCcda: documentType "${documentType}" is not supported yet — this builder ` +
        'emits a CCD or a Referral Note. Pass "ccd" or "referralNote" (or omit for a CCD).',
    );
  }
  const spec = DOC_TYPE_SPECS[documentType];

  const { doc, root } = newCdaDocument();
  const id = makeIdGen();
  const effectiveTime = formatEffectiveTime(init.effectiveTime);

  appendHeader(doc, root, init, effectiveTime, id, spec);

  const structuredBody = el(doc, "structuredBody");

  // This document type's SHALL sections, always emitted in its declared order —
  // an empty one as a spec-clean nullFlavor="NI" section — so the document is
  // conformant for its type and the parser's required-section validation stays
  // quiet on a clean build.
  const shall = new Set<ShallSectionKey>(spec.shallSections);
  for (const key of spec.shallSections) {
    structuredBody.appendChild(shallSection(key, doc, init, id));
  }

  // Results / Vital Signs are always-on SHALL sections for a CCD but *optional*
  // for a Referral Note — emit them here only when they are not this type's SHALL
  // section AND the caller supplied content (never a fabricated empty one).
  if (!shall.has("results") && (init.results?.length ?? 0) > 0) {
    structuredBody.appendChild(resultsSection(doc, init.results ?? [], id));
  }
  if (!shall.has("vitalSigns") && (init.vitalSigns?.length ?? 0) > 0) {
    structuredBody.appendChild(vitalsSection(doc, init.vitalSigns ?? [], id));
  }

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
  if (
    (init.functionalStatus?.length ?? 0) > 0 ||
    (init.functionalStatusOrganizers?.length ?? 0) > 0 ||
    (init.functionalStatusScales?.length ?? 0) > 0
  ) {
    structuredBody.appendChild(
      functionalStatusSection(
        doc,
        init.functionalStatus ?? [],
        init.functionalStatusOrganizers ?? [],
        init.functionalStatusScales ?? [],
        id,
      ),
    );
  }
  if (
    (init.mentalStatus?.length ?? 0) > 0 ||
    (init.mentalStatusOrganizers?.length ?? 0) > 0 ||
    (init.mentalStatusScales?.length ?? 0) > 0
  ) {
    structuredBody.appendChild(
      mentalStatusSection(
        doc,
        init.mentalStatus ?? [],
        init.mentalStatusOrganizers ?? [],
        init.mentalStatusScales ?? [],
        id,
      ),
    );
  }
  if ((init.pastMedicalHistory?.length ?? 0) > 0) {
    structuredBody.appendChild(pastMedicalHistorySection(doc, init.pastMedicalHistory ?? [], id));
  }
  // Plan of Treatment is a Referral Note SHALL section (emitted above); for a CCD
  // it is optional, emitted here only when the caller supplied planned items.
  if (!shall.has("planOfTreatment") && (init.planOfTreatment?.length ?? 0) > 0) {
    structuredBody.appendChild(planOfTreatmentSection(doc, init.planOfTreatment ?? [], id));
  }
  if ((init.familyHistory?.length ?? 0) > 0) {
    structuredBody.appendChild(familyHistorySection(doc, init.familyHistory ?? [], id));
  }
  root.appendChild(el(doc, "component", undefined, structuredBody));

  return parseCcda(serializeDocument(doc));
}

/**
 * Dispatch one SHALL section by key to its builder, defaulting the caller's
 * (possibly absent) content to empty. Each builder emits a spec-clean empty
 * (`nullFlavor="NI"`) section when it has no content, so a SHALL section is
 * always present regardless of what the caller supplied. @internal
 */
function shallSection(
  key: ShallSectionKey,
  doc: Document,
  init: BuildCcdaInit,
  id: (prefix: string) => string,
): Element {
  switch (key) {
    case "problems":
      return problemsSection(doc, init.problems ?? [], id);
    case "allergies":
      return allergiesSection(doc, init.allergies ?? [], id);
    case "medications":
      return medicationsSection(doc, init.medications ?? [], id);
    case "results":
      return resultsSection(doc, init.results ?? [], id);
    case "vitalSigns":
      return vitalsSection(doc, init.vitalSigns ?? [], id);
    case "reasonForReferral":
      return reasonForReferralSection(doc, init.reasonForReferral);
    case "assessment":
      return assessmentSection(doc, init.assessment);
    case "planOfTreatment":
      return planOfTreatmentSection(doc, init.planOfTreatment ?? [], id);
  }
}

/** Emit the US Realm Header, record target, author (device), and custodian. @internal */
function appendHeader(
  doc: Document,
  root: Element,
  init: BuildCcdaInit,
  effectiveTime: string,
  id: (prefix: string) => string,
  spec: DocTypeSpec,
): void {
  root.appendChild(el(doc, "realmCode", { code: "US" }));
  root.appendChild(
    el(doc, "typeId", { root: "2.16.840.1.113883.1.3", extension: "POCD_HD000040" }),
  );
  root.appendChild(el(doc, "templateId", { root: US_REALM_HEADER, extension: R21 }));
  root.appendChild(el(doc, "templateId", { root: spec.documentTemplateRoot, extension: R21 }));
  root.appendChild(el(doc, "id", { root: SYNTH_ROOT, extension: init.documentId ?? id("doc") }));
  root.appendChild(codeEl(doc, "code", { ...spec.documentCode, codeSystem: LOINC }));
  root.appendChild(textEl(doc, "title", init.title ?? spec.documentCode.displayName));
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
  extension: string | null = R21,
): readonly Element[] {
  // A `null` extension emits a root-only `templateId` (no `@extension`) —
  // required for unversioned templates such as the Assessment Section (…22.2.8),
  // which has no R2.0/R2.1 revision. (`null`, not `undefined`, so the `= R21`
  // default still applies when the parameter is simply omitted.)
  const templateId = (root: string): Element =>
    extension === null
      ? el(doc, "templateId", { root })
      : el(doc, "templateId", { root, extension });
  const ids = [templateId(base)];
  if (entriesRequired) ids.push(templateId(`${base}.1`));
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
  extension: string | null = R21,
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
function emptySection(
  doc: Document,
  base: string,
  loinc: string,
  title: string,
  extension: string | null = R21,
): Element {
  const section = sectionElement(
    doc,
    base,
    loinc,
    title,
    textEl(doc, "text", "No information"),
    false,
    { nullFlavor: "NI" },
    extension,
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
/** @internal */
const FUNCTIONAL_STATUS_SECTION_BASE = "2.16.840.1.113883.10.20.22.2.14";
/** @internal */
const MENTAL_STATUS_SECTION_BASE = "2.16.840.1.113883.10.20.22.2.56";
/** @internal */
const PAST_MEDICAL_HISTORY_SECTION_BASE = "2.16.840.1.113883.10.20.22.2.20";
/** @internal */
const PLAN_OF_TREATMENT_SECTION_BASE = "2.16.840.1.113883.10.20.22.2.10";
/** @internal */
const FAMILY_HISTORY_SECTION_BASE = "2.16.840.1.113883.10.20.22.2.15";

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

/**
 * Build one bare Problem Observation (`…22.4.4`, the R2.1 `2015-08-01` stamp).
 * Shared by the Problems section (nested under a Problem Concern Act via
 * {@link problemEntry}) and the Past Medical History section (bare, directly under
 * `<entry>` — {@link pastMedicalHistorySection}); both carry the identical coded
 * shape, so the same observation reuse mirrors the parser reusing `buildProblem`
 * for both. @internal
 */
function problemObservation(
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
  return obs;
}

/** Build one Problem Concern Act `<entry>`. @internal */
function problemEntry(
  doc: Document,
  p: BuildCcdaProblem,
  contentId: string,
  id: (prefix: string) => string,
): Element {
  const obs = problemObservation(doc, p, contentId, id);

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

/**
 * The narrative line for a Functional Status finding — the fixed `code` label
 * ("Functional status") plus the specific finding, so it agrees with the
 * observation's `code` (which the parser reconciles against the narrative). An
 * omitted finding reads "Functional status: unknown", never a fabricated
 * finding. @internal
 */
function functionalStatusLabel(s: BuildCcdaFunctionalStatus): string {
  return `${FUNCTIONAL_STATUS_CODE.displayName}: ${s.value?.displayName ?? "unknown"}`;
}

/**
 * Build the Functional Status section from standalone
 * {@link BuildCcdaFunctionalStatus} findings and/or
 * {@link BuildCcdaFunctionalStatusOrganizer}s. Only called when at least one is
 * non-empty (see {@link buildCcda}) — Functional Status is a CCD SHOULD (not
 * SHALL) section, so an unpopulated one is not fabricated. The Functional Status
 * Section (V2, `…22.2.14`) has no entries-required variant, so only the base
 * `templateId` (the `2014-06-09` stamp) is emitted even though the section
 * carries entries. Organizers are emitted first (a grouped assessment), then
 * standalone findings. Only Functional Status templates are emitted here, so
 * every finding reads back tagged `domain: "functional"` — never conflated with
 * mental status. @internal
 */
function functionalStatusSection(
  doc: Document,
  findings: readonly BuildCcdaFunctionalStatus[],
  organizers: readonly BuildCcdaFunctionalStatusOrganizer[],
  scales: readonly BuildCcdaAssessmentScale[],
  id: (prefix: string) => string,
): Element {
  const text = el(doc, "text");
  const entries: Element[] = [];
  for (const org of organizers) entries.push(functionalStatusOrganizerEntry(doc, org, text, id));
  for (const scale of scales) {
    entries.push(el(doc, "entry", undefined, assessmentScaleObservation(doc, scale, text, id)));
  }
  for (const s of findings) {
    entries.push(el(doc, "entry", undefined, functionalStatusObservation(doc, s, text, id)));
  }
  const section = sectionElement(
    doc,
    FUNCTIONAL_STATUS_SECTION_BASE,
    "47420-5",
    "Functional Status",
    text,
    false,
    undefined,
    FUNCTIONAL_STATUS_EXT,
  );
  for (const entry of entries) section.appendChild(entry);
  return el(doc, "component", undefined, section);
}

/**
 * Build one Functional Status Observation `<observation>` (`…22.4.67`), appending
 * its narrative content line to `text`. The `code` is the template-fixed LOINC
 * `54522-8`; the finding is the coded `value`. Shared by the standalone entry and
 * the organizer component so a grouped finding is byte-identical to a standalone
 * one. @internal
 */
function functionalStatusObservation(
  doc: Document,
  s: BuildCcdaFunctionalStatus,
  text: Element,
  id: (prefix: string) => string,
): Element {
  const contentId = id("func-txt");
  text.appendChild(textEl(doc, "content", functionalStatusLabel(s), { ID: contentId }));
  const obs = el(
    doc,
    "observation",
    { classCode: "OBS", moodCode: "EVN" },
    el(doc, "templateId", {
      root: FUNCTIONAL_STATUS_OBSERVATION,
      extension: FUNCTIONAL_STATUS_EXT,
    }),
    el(doc, "id", { root: SYNTH_ROOT, extension: id("func") }),
    // SHALL code [1..1] — the template-fixed LOINC "Functional status"; the
    // specific finding lives in `value`, not here.
    codeEl(doc, "code", { ...FUNCTIONAL_STATUS_CODE, codeSystem: LOINC, codeSystemName: "LOINC" }),
    el(doc, "text", undefined, el(doc, "reference", { value: `#${contentId}` })),
    // SHALL statusCode [1..1], fixed "completed".
    el(doc, "statusCode", { code: "completed" }),
  );
  // Functional Status Observation (…22.4.67) SHALL contain effectiveTime [1..1]
  // (CONF:1098-13930) — the time the status was assessed. Emitted as an @value
  // when supplied, else nullFlavor="UNK" (the SHALL satisfied without inventing a
  // date).
  obs.appendChild(pointEffectiveTime(doc, s.effectiveTime));
  // SHALL value [1..1] (CONF:1098-13932; SHOULD be SNOMED CT for a CD). An omitted
  // finding is an EXPLICIT nullFlavor="UNK" — never defaulted to a real finding.
  obs.appendChild(
    s.value === undefined
      ? typedValue(doc, "CD", { nullFlavor: "UNK" })
      : cdValue(doc, s.value, SNOMED_CT),
  );
  return obs;
}

/**
 * Build one Functional Status Organizer `<entry>` (`…22.4.66`, `@classCode="CLUSTER"`,
 * the `2014-06-09` stamp) grouping this organizer's Functional Status
 * Observations. Element order follows the CDA organizer schema: templateId, id,
 * code, statusCode, effectiveTime, component+. @internal
 */
function functionalStatusOrganizerEntry(
  doc: Document,
  org: BuildCcdaFunctionalStatusOrganizer,
  text: Element,
  id: (prefix: string) => string,
): Element {
  if (org.findings.length === 0) {
    throw new TypeError(
      "buildCcda: a Functional Status Organizer must contain at least one finding " +
        "(the template SHALL contain [1..*] a Functional Status Observation).",
    );
  }
  const organizer = el(
    doc,
    "organizer",
    { classCode: "CLUSTER", moodCode: "EVN" },
    el(doc, "templateId", { root: FUNCTIONAL_STATUS_ORGANIZER, extension: FUNCTIONAL_STATUS_EXT }),
    el(doc, "id", { root: SYNTH_ROOT, extension: id("func-org") }),
    // SHALL code [1..1] (SHOULD be ICF or LOINC — CONF:1098-31417). An omitted
    // categorization is an EXPLICIT nullFlavor="UNK", never a fabricated category.
    organizerCode(doc, org.code),
    // SHALL statusCode [1..1], fixed "completed".
    el(doc, "statusCode", { code: "completed" }),
  );
  // effectiveTime [0..1] — the assessment time. Emitted only when supplied; an
  // optional element is never filled with a fabricated date.
  if (org.effectiveTime !== undefined) {
    organizer.appendChild(el(doc, "effectiveTime", { value: org.effectiveTime }));
  }
  for (const s of org.findings) {
    organizer.appendChild(
      el(doc, "component", undefined, functionalStatusObservation(doc, s, text, id)),
    );
  }
  return el(doc, "entry", undefined, organizer);
}

/**
 * The narrative line for a Mental Status finding — the fixed `code` label
 * ("Cognitive function finding") plus the specific finding, so it agrees with the
 * observation's `code` (which the parser reconciles against the narrative). An
 * omitted finding reads "Cognitive function finding: unknown", never a fabricated
 * finding. @internal
 */
function mentalStatusLabel(s: BuildCcdaMentalStatus): string {
  return `${MENTAL_STATUS_CODE.displayName}: ${s.value?.displayName ?? "unknown"}`;
}

/**
 * Build the Mental Status section from standalone {@link BuildCcdaMentalStatus}
 * findings and/or {@link BuildCcdaMentalStatusOrganizer}s. Only called when at
 * least one is non-empty (see {@link buildCcda}) — Mental Status is a CCD SHOULD
 * (not SHALL) section, so an unpopulated one is not fabricated. The Mental Status
 * Section (V2, `…22.2.56`, the R2.1 `2015-08-01` stamp) has no entries-required
 * variant, so only the base `templateId` is emitted even though the section
 * carries entries. Organizers are emitted first, then standalone findings. Only
 * Mental Status templates are emitted here, so every finding reads back tagged
 * `domain: "mental"` — never conflated with functional status. @internal
 */
function mentalStatusSection(
  doc: Document,
  findings: readonly BuildCcdaMentalStatus[],
  organizers: readonly BuildCcdaMentalStatusOrganizer[],
  scales: readonly BuildCcdaAssessmentScale[],
  id: (prefix: string) => string,
): Element {
  const text = el(doc, "text");
  const entries: Element[] = [];
  for (const org of organizers) entries.push(mentalStatusOrganizerEntry(doc, org, text, id));
  for (const scale of scales) {
    entries.push(el(doc, "entry", undefined, assessmentScaleObservation(doc, scale, text, id)));
  }
  for (const s of findings) {
    entries.push(el(doc, "entry", undefined, mentalStatusObservation(doc, s, text, id)));
  }
  const section = sectionElement(
    doc,
    MENTAL_STATUS_SECTION_BASE,
    "10190-7",
    "Mental Status",
    text,
    false,
    undefined,
    MENTAL_STATUS_EXT,
  );
  for (const entry of entries) section.appendChild(entry);
  return el(doc, "component", undefined, section);
}

/**
 * Build one Mental Status Observation `<observation>` (`…22.4.74`), appending its
 * narrative content line to `text`. The `code` is the R2.1 template-fixed SNOMED
 * CT `373930000` "Cognitive function finding"; the specific finding is the coded
 * `value`. Shared by the standalone entry and the organizer component. @internal
 */
function mentalStatusObservation(
  doc: Document,
  s: BuildCcdaMentalStatus,
  text: Element,
  id: (prefix: string) => string,
): Element {
  const contentId = id("ment-txt");
  text.appendChild(textEl(doc, "content", mentalStatusLabel(s), { ID: contentId }));
  const obs = el(
    doc,
    "observation",
    { classCode: "OBS", moodCode: "EVN" },
    el(doc, "templateId", {
      root: MENTAL_STATUS_OBSERVATION,
      extension: MENTAL_STATUS_EXT,
    }),
    el(doc, "id", { root: SYNTH_ROOT, extension: id("ment") }),
    // SHALL code [1..1] — the R2.1 template-fixed SNOMED CT "Cognitive function
    // finding"; the specific finding lives in `value`, not here.
    codeEl(doc, "code", {
      ...MENTAL_STATUS_CODE,
      codeSystem: SNOMED_CT,
      codeSystemName: "SNOMED CT",
    }),
    el(doc, "text", undefined, el(doc, "reference", { value: `#${contentId}` })),
    // SHALL statusCode [1..1], fixed "completed".
    el(doc, "statusCode", { code: "completed" }),
  );
  // Mental Status Observation (…22.4.74) SHALL contain effectiveTime [1..1] — the
  // time the status was assessed. Emitted as an @value when supplied, else
  // nullFlavor="UNK" (the SHALL satisfied without inventing a date).
  obs.appendChild(pointEffectiveTime(doc, s.effectiveTime));
  // SHALL value [1..1] (SHOULD be SNOMED CT for a CD). An omitted finding is an
  // EXPLICIT nullFlavor="UNK" — never defaulted to a real finding.
  obs.appendChild(
    s.value === undefined
      ? typedValue(doc, "CD", { nullFlavor: "UNK" })
      : cdValue(doc, s.value, SNOMED_CT),
  );
  return obs;
}

/**
 * Build one Mental Status Organizer `<entry>` (`…22.4.75`, `@classCode="CLUSTER"`,
 * the R2.1 `2015-08-01` stamp) grouping this organizer's Mental Status
 * Observations. Element order follows the CDA organizer schema: templateId, id,
 * code, statusCode, effectiveTime, component+. @internal
 */
function mentalStatusOrganizerEntry(
  doc: Document,
  org: BuildCcdaMentalStatusOrganizer,
  text: Element,
  id: (prefix: string) => string,
): Element {
  if (org.findings.length === 0) {
    throw new TypeError(
      "buildCcda: a Mental Status Organizer must contain at least one finding " +
        "(the template SHALL contain [1..*] a Mental Status Observation).",
    );
  }
  const organizer = el(
    doc,
    "organizer",
    { classCode: "CLUSTER", moodCode: "EVN" },
    el(doc, "templateId", { root: MENTAL_STATUS_ORGANIZER, extension: MENTAL_STATUS_EXT }),
    el(doc, "id", { root: SYNTH_ROOT, extension: id("ment-org") }),
    // code [0..1] (SHOULD be ICF or LOINC — CONF:1198-14698); the organizer SHALL
    // have at least one of code or effectiveTime (CONF:1198-32426). We always emit
    // a code element (an EXPLICIT nullFlavor="UNK" categorization when the caller
    // supplies none — never fabricated), which satisfies the one-of floor.
    organizerCode(doc, org.code),
    // SHALL statusCode [1..1], fixed "completed".
    el(doc, "statusCode", { code: "completed" }),
  );
  // effectiveTime [0..1] — emitted only when supplied; never a fabricated date.
  if (org.effectiveTime !== undefined) {
    organizer.appendChild(el(doc, "effectiveTime", { value: org.effectiveTime }));
  }
  for (const s of org.findings) {
    organizer.appendChild(
      el(doc, "component", undefined, mentalStatusObservation(doc, s, text, id)),
    );
  }
  return el(doc, "entry", undefined, organizer);
}

/**
 * The status-organizer categorization `<code>` — SHALL [1..1], SHOULD be ICF or
 * LOINC. When the caller supplies a `code` it is emitted with its `codeSystem`
 * (defaulting to LOINC); when omitted it is an EXPLICIT `nullFlavor="UNK"`, an
 * unknown category that satisfies the SHALL without fabricating one. @internal
 */
function organizerCode(doc: Document, code: BuildCode | undefined): Element {
  if (code === undefined) return el(doc, "code", { nullFlavor: "UNK" });
  // Default the system to LOINC (an allowed SHOULD value) when the caller gave a
  // code without one; only label it "LOINC" when we defaulted, so a caller-set
  // codeSystem keeps the caller's (or an absent) system name.
  const codeSystem = code.codeSystem ?? LOINC;
  const codeSystemName =
    code.codeSystemName ?? (code.codeSystem === undefined ? "LOINC" : undefined);
  return el(doc, "code", {
    code: code.code,
    codeSystem,
    displayName: code.displayName,
    codeSystemName,
  });
}

/**
 * The narrative line for an Assessment Scale — the scale's `code` label plus its
 * total score, so it agrees with the observation's `code` (which the parser
 * reconciles against the narrative). An omitted score reads "…: unknown", never a
 * fabricated number. @internal
 */
function assessmentScaleLabel(scale: BuildCcdaAssessmentScale): string {
  return `${scale.code.displayName}: ${scale.score?.toString() ?? "unknown"}`;
}

/**
 * An assessment-scale `<value xsi:type="INT">` — the SHALL score. Emitted as an
 * `@value` when supplied, else an EXPLICIT `nullFlavor="UNK"` (the SHALL cardinality
 * satisfied without inventing a number, read back as `{ kind: "integer" }` with no
 * `value`). Units are not allowed on an INT, so none is emitted. @internal
 */
function scoreValue(doc: Document, score: number | undefined): Element {
  return score === undefined
    ? typedValue(doc, "INT", { nullFlavor: "UNK" })
    : typedValue(doc, "INT", { value: score.toString() });
}

/**
 * Build one direct-entry Assessment Scale Observation `<observation>` (`…22.4.69`,
 * the **bare root** — R2.1 SHALL: `@root` with no `@extension`), appending its
 * narrative line to `text`. Emits the SHALL slots in schema order: templateId, id,
 * code (the scale panel LOINC), text/reference, statusCode (fixed `completed`),
 * effectiveTime [1..1], value [1..1] (the INT score), then the optional
 * interpretationCode and the Assessment Scale Supporting Observations. Shared by
 * the Functional and Mental Status sections — the carrying section's domain is
 * what the parser tags the scale with, so the same observation is correct in
 * either. @internal
 */
function assessmentScaleObservation(
  doc: Document,
  scale: BuildCcdaAssessmentScale,
  text: Element,
  id: (prefix: string) => string,
): Element {
  const contentId = id("scale-txt");
  text.appendChild(textEl(doc, "content", assessmentScaleLabel(scale), { ID: contentId }));
  const obs = el(
    doc,
    "observation",
    { classCode: "OBS", moodCode: "EVN" },
    // SHALL templateId [1..1] @root="…4.69" with NO @extension (R2.1 CONF:81-14436/14437).
    el(doc, "templateId", { root: ASSESSMENT_SCALE_OBSERVATION }),
    el(doc, "id", { root: SYNTH_ROOT, extension: id("scale") }),
    // SHALL code [1..1] — the scale/panel code (LOINC default).
    codeEl(doc, "code", { ...scale.code, codeSystem: scale.code.codeSystem ?? LOINC }),
    el(doc, "text", undefined, el(doc, "reference", { value: `#${contentId}` })),
    // SHALL statusCode [1..1], fixed "completed" (CONF:81-19088).
    el(doc, "statusCode", { code: "completed" }),
  );
  // SHALL effectiveTime [1..1] (CONF:81-14445) — the administration time, else nullFlavor="UNK".
  obs.appendChild(pointEffectiveTime(doc, scale.effectiveTime));
  // SHALL value [1..1] (CONF:81-14450) — the INT score, else an EXPLICIT nullFlavor="UNK".
  obs.appendChild(scoreValue(doc, scale.score));
  // interpretationCode [0..1] — emitted only when supplied.
  if (scale.interpretation !== undefined) {
    obs.appendChild(
      codeEl(doc, "interpretationCode", {
        ...scale.interpretation,
        codeSystem: scale.interpretation.codeSystem ?? INTERPRETATION,
      }),
    );
  }
  // The scored components [0..*] — each an Assessment Scale Supporting Observation.
  for (const item of scale.supporting ?? []) {
    obs.appendChild(
      el(doc, "entryRelationship", { typeCode: "COMP" }, supportingObservation(doc, item, id)),
    );
  }
  return obs;
}

/**
 * Build one Assessment Scale Supporting Observation `<observation>` (`…22.4.86`,
 * bare root) — a scored component of a scale. Emits its SHALL slots: templateId,
 * id, code (LOINC/SNOMED), statusCode (fixed `completed`), and value [1..*] (the
 * INT item score). effectiveTime is not required on this template, so none is
 * fabricated. @internal
 */
function supportingObservation(
  doc: Document,
  item: BuildCcdaAssessmentScaleItem,
  id: (prefix: string) => string,
): Element {
  const obs = el(
    doc,
    "observation",
    { classCode: "OBS", moodCode: "EVN" },
    el(doc, "templateId", { root: ASSESSMENT_SCALE_SUPPORTING_OBSERVATION }),
    el(doc, "id", { root: SYNTH_ROOT, extension: id("scale-item") }),
    // SHALL code [1..1], @code from LOINC or SNOMED (LOINC default) (CONF:81-19178..80).
    codeEl(doc, "code", { ...item.code, codeSystem: item.code.codeSystem ?? LOINC }),
    // SHALL statusCode [1..1], fixed "completed" (CONF:81-19089).
    el(doc, "statusCode", { code: "completed" }),
  );
  // SHALL value [1..*] (CONF:81-16754) — the INT item score, else nullFlavor="UNK".
  obs.appendChild(scoreValue(doc, item.score));
  return obs;
}

/**
 * Build the Past Medical History section from one or more historical
 * {@link BuildCcdaProblem}s. Only called with a non-empty list (see
 * {@link buildCcda}) — Past Medical History is a CCD MAY (not SHALL) section, so
 * an unpopulated one is not fabricated. The Past Medical History Section (V3,
 * `…22.2.20`, LOINC `11348-0`, the R2.1 `2015-08-01` stamp) carries **bare**
 * Problem Observations (`…22.4.4`) directly under each `<entry>` — unlike the
 * Problems section, which nests each Problem Observation inside a Problem Concern
 * Act (`…22.4.3`). The two never double-count: the parser routes a bare
 * observation to `getPastMedicalHistory` and a concern-wrapped one to
 * `getProblems`, so a past illness never reads back as an active problem concern.
 * The section has no entries-required variant (`…2.20.1`), so only the base
 * `templateId` is emitted even when it carries entries. @internal
 */
function pastMedicalHistorySection(
  doc: Document,
  history: readonly BuildCcdaProblem[],
  id: (prefix: string) => string,
): Element {
  const text = el(doc, "text");
  const entries: Element[] = [];
  for (const p of history) {
    const contentId = id("pmh-txt");
    text.appendChild(textEl(doc, "content", p.problem.displayName, { ID: contentId }));
    entries.push(el(doc, "entry", undefined, problemObservation(doc, p, contentId, id)));
  }
  const section = sectionElement(
    doc,
    PAST_MEDICAL_HISTORY_SECTION_BASE,
    "11348-0",
    "Past Medical History",
    text,
    false,
  );
  for (const entry of entries) section.appendChild(entry);
  return el(doc, "component", undefined, section);
}

/**
 * The element name, `@classCode`, template root, and default code system for each
 * of the six planned-entry variants. The drug of a Planned Medication Activity
 * lives in its `consumable` (no direct `<code>`); the other five carry a direct
 * `<code>`. @internal
 */
const PLANNED_VARIANTS: Record<
  PlannedItemKind,
  {
    readonly element: string;
    readonly classCode: string;
    readonly root: string;
    readonly system: string;
  }
> = {
  act: { element: "act", classCode: "ACT", root: PLANNED_ACT, system: SNOMED_CT },
  encounter: { element: "encounter", classCode: "ENC", root: PLANNED_ENCOUNTER, system: CPT },
  procedure: {
    element: "procedure",
    classCode: "PROC",
    root: PLANNED_PROCEDURE,
    system: SNOMED_CT,
  },
  medicationActivity: {
    element: "substanceAdministration",
    classCode: "SBADM",
    root: PLANNED_MEDICATION_ACTIVITY,
    system: RXNORM,
  },
  supply: { element: "supply", classCode: "SPLY", root: PLANNED_SUPPLY, system: SNOMED_CT },
  observation: {
    element: "observation",
    classCode: "OBS",
    root: PLANNED_OBSERVATION,
    system: LOINC,
  },
};

/**
 * Build the Plan of Treatment section from one or more {@link BuildCcdaPlannedItem}s.
 * Only called with a non-empty list (see {@link buildCcda}) — Plan of Treatment is
 * a CCD SHOULD (not SHALL) section, so an unpopulated one is not fabricated. The
 * Plan of Treatment Section (V2, `…22.2.10`, LOINC `18776-5`, the R2.1
 * `2014-06-09` stamp) carries the six planned-entry templates, each future/ordered
 * — never a performed act. The section has no entries-required variant (`…2.10.1`),
 * so only the base `templateId` is emitted even when it carries entries. @internal
 */
/**
 * Build the narrative-only Assessment Section (`…22.2.8`, LOINC `51848-0`) — a
 * Referral Note SHALL section. The template is **unversioned** in C-CDA R2.1
 * (no R2.0/R2.1 revision), so it carries a root-only `templateId` with **no
 * `@extension`**. When the caller supplies no `assessment` text it is emitted as
 * a spec-clean empty `nullFlavor="NI"` section — never a fabricated assessment.
 * @internal
 */
function assessmentSection(doc: Document, narrative: string | undefined): Element {
  if (narrative === undefined) {
    return emptySection(
      doc,
      ASSESSMENT_SECTION_BASE,
      ASSESSMENT_CODE.code,
      ASSESSMENT_CODE.displayName,
      null,
    );
  }
  const section = sectionElement(
    doc,
    ASSESSMENT_SECTION_BASE,
    ASSESSMENT_CODE.code,
    ASSESSMENT_CODE.displayName,
    textEl(doc, "text", narrative),
    false,
    undefined,
    null,
  );
  return el(doc, "component", undefined, section);
}

/**
 * Build the narrative-only Reason for Referral Section (V2,
 * `1.3.6.1.4.1.19376.1.5.3.1.3.1`, LOINC `42349-1`) — a Referral Note SHALL
 * section. An IHE PCC template whose version stamp is `@extension` `2014-06-09`.
 * When the caller supplies no `reasonForReferral` text it is emitted as a
 * spec-clean empty `nullFlavor="NI"` section — never a fabricated reason.
 * @internal
 */
function reasonForReferralSection(doc: Document, narrative: string | undefined): Element {
  if (narrative === undefined) {
    return emptySection(
      doc,
      REASON_FOR_REFERRAL_SECTION_BASE,
      REASON_FOR_REFERRAL_CODE.code,
      REASON_FOR_REFERRAL_CODE.displayName,
      REASON_FOR_REFERRAL_EXT,
    );
  }
  const section = sectionElement(
    doc,
    REASON_FOR_REFERRAL_SECTION_BASE,
    REASON_FOR_REFERRAL_CODE.code,
    REASON_FOR_REFERRAL_CODE.displayName,
    textEl(doc, "text", narrative),
    false,
    undefined,
    REASON_FOR_REFERRAL_EXT,
  );
  return el(doc, "component", undefined, section);
}

function planOfTreatmentSection(
  doc: Document,
  items: readonly BuildCcdaPlannedItem[],
  id: (prefix: string) => string,
): Element {
  // A Referral Note SHALL carry a Plan of Treatment; when no planned items are
  // supplied it is emitted as a spec-clean empty nullFlavor="NI" section (the
  // section has no entries-required variant, so this stays conformant).
  if (items.length === 0) {
    return emptySection(
      doc,
      PLAN_OF_TREATMENT_SECTION_BASE,
      "18776-5",
      "Plan of Treatment",
      PLAN_OF_TREATMENT_EXT,
    );
  }
  const text = el(doc, "text");
  const entries: Element[] = [];
  for (const p of items) {
    const contentId = id("plan-txt");
    // The narrative carries the planned item's label so it agrees with the coded
    // value (the parser reconciles the planned code ↔ narrative).
    text.appendChild(textEl(doc, "content", p.code.displayName, { ID: contentId }));
    entries.push(plannedItemEntry(doc, p, contentId, id));
  }
  const section = sectionElement(
    doc,
    PLAN_OF_TREATMENT_SECTION_BASE,
    "18776-5",
    "Plan of Treatment",
    text,
    false,
    undefined,
    PLAN_OF_TREATMENT_EXT,
  );
  for (const entry of entries) section.appendChild(entry);
  return el(doc, "component", undefined, section);
}

/** Build one planned `<entry>` (one of the six planned-entry variants). @internal */
function plannedItemEntry(
  doc: Document,
  p: BuildCcdaPlannedItem,
  contentId: string,
  id: (prefix: string) => string,
): Element {
  const variant = PLANNED_VARIANTS[p.kind];
  // `@moodCode` is the planned axis. The per-kind mood types admit only planned
  // moods (never `EVN`), and appointment moods (`APT`/`ARQ`) only on the
  // act/encounter/procedure kinds whose element domains permit them — so a plan
  // item can never be emitted with a schema-invalid or performed mood. The parser
  // classifies the mood into `disposition: "planned"`.
  const mood: PlannedActMood | PlannedOrderMood = p.mood ?? "INT";
  const act = el(
    doc,
    variant.element,
    { classCode: variant.classCode, moodCode: mood },
    el(doc, "templateId", { root: variant.root, extension: PLAN_OF_TREATMENT_EXT }),
    el(doc, "id", { root: SYNTH_ROOT, extension: id("plan") }),
  );
  // Every variant but the Planned Medication Activity carries a direct <code>;
  // the medication's drug lives in its <consumable> (appended after statusCode,
  // in CDA schema order), exactly where the parser reads it back from.
  if (p.kind !== "medicationActivity") {
    act.appendChild(
      codeEl(doc, "code", { ...p.code, codeSystem: p.code.codeSystem ?? variant.system }),
    );
  }
  act.appendChild(el(doc, "text", undefined, el(doc, "reference", { value: `#${contentId}` })));
  // Planned entries fix statusCode to "active" (SHALL) — the plan is future/ordered,
  // never a performed "completed" act; the builder never emits a performed status here.
  act.appendChild(el(doc, "statusCode", { code: "active" }));
  // Planned effectiveTime is SHOULD [0..1]: emitted only when supplied — never
  // fabricated with a nullFlavor when a plan carries no date.
  if (p.effectiveTime !== undefined) {
    act.appendChild(el(doc, "effectiveTime", { value: p.effectiveTime }));
  }
  if (p.kind === "medicationActivity") {
    act.appendChild(medicationConsumable(doc, p.code));
  }
  // The Planned Observation MAY carry the expected coded result (value [0..1]);
  // emitted only when supplied — never invented for the caller.
  if (p.kind === "observation" && p.value !== undefined) {
    act.appendChild(cdValue(doc, p.value, SNOMED_CT));
  }
  return el(doc, "entry", undefined, act);
}

/**
 * The narrative line for a Family History condition — the relative (their
 * relationship label) plus the coded condition, so the narrative **contains** the
 * observation `value`'s display label and the parser's code↔narrative
 * reconciliation stays quiet. An omitted relationship reads "Relative"; an omitted
 * condition reads "unknown condition" (and reconciliation is silent, since the
 * coded value is a `nullFlavor`). @internal
 */
function familyHistoryLabel(
  relative: BuildCcdaFamilyMember,
  obs: BuildCcdaFamilyHistoryObservation,
): string {
  const who = relative.relationship?.displayName ?? "Relative";
  const what = obs.condition?.displayName ?? "unknown condition";
  return `${who}: ${what}`;
}

/**
 * Build the Family History section from one or more {@link BuildCcdaFamilyHistory}
 * organizers. Only called with a non-empty list (see {@link buildCcda}) — Family
 * History is a CCD SHOULD (not SHALL) section, so an unpopulated one is not
 * fabricated. The Family History Section (V3, `…22.2.15`, LOINC `10157-6`, the
 * R2.1 `2015-08-01` stamp) has **no** entries-required variant (`…2.15.1`), so
 * only the base `templateId` is emitted even though the section carries entries.
 * Each `<entry>` is one Family History Organizer (`…22.4.45`) naming a single
 * relative and their conditions. @internal
 */
function familyHistorySection(
  doc: Document,
  histories: readonly BuildCcdaFamilyHistory[],
  id: (prefix: string) => string,
): Element {
  const text = el(doc, "text");
  const entries: Element[] = [];
  for (const h of histories) {
    entries.push(familyHistoryEntry(doc, h, text, id));
  }
  const section = sectionElement(
    doc,
    FAMILY_HISTORY_SECTION_BASE,
    "10157-6",
    "Family History",
    text,
    false,
  );
  for (const entry of entries) section.appendChild(entry);
  return el(doc, "component", undefined, section);
}

/**
 * Build one Family History Organizer `<entry>` (`…22.4.45`) for a single relative.
 * The organizer's `subject` carries the family-member identity (relationship,
 * gender, birth time, deceased flag); each condition becomes a
 * `component/observation` (a Family History Observation). Narrative `<content>`
 * for each condition is appended to the section's shared `<text>`. @internal
 */
function familyHistoryEntry(
  doc: Document,
  h: BuildCcdaFamilyHistory,
  text: Element,
  id: (prefix: string) => string,
): Element {
  // The Family History Organizer SHALL contain at least one Family History
  // Observation component — an organizer describing a relative with no recorded
  // condition is degenerate, so reject it rather than emit a component-less
  // organizer. A caller who means "a condition, but unknown" passes `[{}]` (which
  // becomes value nullFlavor="UNK"); "no known family history" needs the negation
  // form, which is a later slice.
  if (h.observations.length === 0) {
    throw new TypeError(
      "buildCcda: each family-history entry must carry at least one observation " +
        "(pass `[{}]` for an unknown condition rather than an empty list).",
    );
  }
  const organizer = el(
    doc,
    "organizer",
    { classCode: "CLUSTER", moodCode: "EVN" },
    el(doc, "templateId", { root: FAMILY_HISTORY_ORGANIZER, extension: R21 }),
    el(doc, "id", { root: SYNTH_ROOT, extension: id("fhx-org") }),
    // SHALL statusCode [1..1], fixed "completed".
    el(doc, "statusCode", { code: "completed" }),
    // SHALL subject [1..1] — the family member this organizer describes.
    familyMemberSubject(doc, h.relative),
  );
  for (const obs of h.observations) {
    const contentId = id("fhx-txt");
    text.appendChild(
      textEl(doc, "content", familyHistoryLabel(h.relative, obs), { ID: contentId }),
    );
    organizer.appendChild(
      el(doc, "component", undefined, familyHistoryObservation(doc, obs, contentId, id)),
    );
  }
  return el(doc, "entry", undefined, organizer);
}

/**
 * Build the organizer's `subject/relatedSubject` — the family member. The
 * `relatedSubject/@classCode` is fixed "PRS" (personal relationship). The
 * relationship `code` is emitted from the caller's coded relation (SNOMED CT by
 * default), or `nullFlavor="UNK"` when unknown — never guessed. Gender, birth
 * time, and the `sdtc:deceasedInd` flag are MAY elements, each emitted only when
 * supplied. @internal
 */
function familyMemberSubject(doc: Document, relative: BuildCcdaFamilyMember): Element {
  const relatedSubject = el(doc, "relatedSubject", { classCode: "PRS" });
  // SHALL code [1..1] — the coded relation. An omitted relationship is an
  // EXPLICIT nullFlavor="UNK", never defaulted to a real relation.
  relatedSubject.appendChild(
    relative.relationship === undefined
      ? el(doc, "code", { nullFlavor: "UNK" })
      : codeEl(doc, "code", {
          ...relative.relationship,
          codeSystem: relative.relationship.codeSystem ?? SNOMED_CT,
        }),
  );
  // The relative's demographics live in the nested person <subject>. Emitted only
  // when at least one is supplied — the whole <subject> is MAY.
  if (
    relative.gender !== undefined ||
    relative.birthTime !== undefined ||
    relative.deceased !== undefined
  ) {
    const person = el(doc, "subject");
    if (relative.gender !== undefined) {
      person.appendChild(
        el(doc, "administrativeGenderCode", {
          code: relative.gender,
          codeSystem: ADMINISTRATIVE_GENDER,
        }),
      );
    }
    if (relative.birthTime !== undefined) {
      person.appendChild(el(doc, "birthTime", { value: relative.birthTime }));
    }
    if (relative.deceased !== undefined) {
      // sdtc:deceasedInd is outside the v3 namespace (an HL7 SDO extension); the
      // parser reads it by local name. Emitted only when the caller supplied the
      // flag — never fabricated.
      person.appendChild(sdtcEl(doc, "deceasedInd", { value: String(relative.deceased) }));
    }
    relatedSubject.appendChild(person);
  }
  return el(doc, "subject", undefined, relatedSubject);
}

/**
 * Build one Family History Observation (`…22.4.46`). Carries the SHALL fixed
 * `code` (SNOMED CT `64572001` "Condition"), a SHALL `statusCode` ("completed"),
 * the SHOULD [0..1] `effectiveTime` (emitted only when supplied), and the SHALL
 * coded `value` — the relative's condition, or `nullFlavor="UNK"` when unknown
 * (never guessed). An `ageAtOnset` nests an Age Observation (`…22.4.31`);
 * `causeOfDeath` nests a Family History Death Observation (`…22.4.47`). @internal
 */
function familyHistoryObservation(
  doc: Document,
  obs: BuildCcdaFamilyHistoryObservation,
  contentId: string,
  id: (prefix: string) => string,
): Element {
  const observation = el(
    doc,
    "observation",
    { classCode: "OBS", moodCode: "EVN" },
    el(doc, "templateId", { root: FAMILY_HISTORY_OBSERVATION, extension: R21 }),
    el(doc, "id", { root: SYNTH_ROOT, extension: id("fhx-obs") }),
    // SHALL code [1..1] — the template-fixed SNOMED CT "Condition"; the specific
    // illness lives in `value`, not here.
    codeEl(doc, "code", {
      ...FAMILY_HISTORY_CONDITION_CODE,
      codeSystem: SNOMED_CT,
      codeSystemName: "SNOMED CT",
    }),
    el(doc, "text", undefined, el(doc, "reference", { value: `#${contentId}` })),
    // SHALL statusCode [1..1], fixed "completed".
    el(doc, "statusCode", { code: "completed" }),
  );
  // SHOULD effectiveTime [0..1] — the time of the condition. Emitted only when
  // supplied (never fabricated with a nullFlavor when the caller gave no date).
  if (obs.effectiveTime !== undefined) {
    observation.appendChild(
      el(doc, "effectiveTime", undefined, el(doc, "low", { value: obs.effectiveTime })),
    );
  }
  // SHALL value [1..1] — the coded condition. An omitted condition is an EXPLICIT
  // nullFlavor="UNK", never defaulted to a real illness.
  observation.appendChild(
    obs.condition === undefined
      ? typedValue(doc, "CD", { nullFlavor: "UNK" })
      : cdValue(doc, obs.condition, SNOMED_CT),
  );
  // MAY Age Observation [0..1] — the relative's age at onset; emitted only when
  // supplied. The relationship is SHALL `typeCode="SUBJ"` **and** SHALL
  // `inversionInd="true"` (the age is the *subject* of the condition, inverted) —
  // the same inverted pattern the Severity/Manifestation/Criticality sub-obs use;
  // dropping the attribute defaults it to false and inverts the intended meaning.
  if (obs.ageAtOnset !== undefined) {
    observation.appendChild(
      el(
        doc,
        "entryRelationship",
        { typeCode: "SUBJ", inversionInd: "true" },
        ageObservation(doc, obs.ageAtOnset),
      ),
    );
  }
  // MAY Family History Death Observation [0..1] — marks this condition as the
  // relative's cause of death; emitted only when the caller flagged it.
  if (obs.causeOfDeath === true) {
    observation.appendChild(
      el(doc, "entryRelationship", { typeCode: "CAUS" }, deathObservation(doc)),
    );
  }
  return observation;
}

/**
 * Build an Age Observation (`…22.4.31`) — the relative's age at onset as a `PQ`
 * `value` in UCUM years (`a`). The template carries no version `@extension`.
 * @internal
 */
function ageObservation(doc: Document, years: number): Element {
  return el(
    doc,
    "observation",
    { classCode: "OBS", moodCode: "EVN" },
    el(doc, "templateId", { root: AGE_OBSERVATION }),
    codeEl(doc, "code", {
      ...AGE_OBSERVATION_CODE,
      codeSystem: SNOMED_CT,
      codeSystemName: "SNOMED CT",
    }),
    el(doc, "statusCode", { code: "completed" }),
    typedValue(doc, "PQ", { value: years.toString(), unit: AGE_UNIT }),
  );
}

/**
 * Build a Family History Death Observation (`…22.4.47`) — a fixed `ASSERTION`
 * `code` and the SNOMED CT `419620001` "Death" coded `value`, marking its parent
 * condition as the relative's cause of death. The template carries no version
 * `@extension`. @internal
 */
function deathObservation(doc: Document): Element {
  return el(
    doc,
    "observation",
    { classCode: "OBS", moodCode: "EVN" },
    el(doc, "templateId", { root: FAMILY_HISTORY_DEATH_OBSERVATION }),
    el(doc, "code", { code: "ASSERTION", codeSystem: ACT_CODE }),
    el(doc, "statusCode", { code: "completed" }),
    typedValue(doc, "CD", {
      code: DEATH_VALUE.code,
      codeSystem: SNOMED_CT,
      displayName: DEATH_VALUE.displayName,
      codeSystemName: "SNOMED CT",
    }),
  );
}
