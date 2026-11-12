import { buildCcda } from "@cosyte/ccda";
import type {
  BuildableDocumentType,
  BuildCcdaAllergy,
  BuildCcdaAssessmentScale,
  BuildCcdaEncounter,
  BuildCcdaFamilyHistory,
  BuildCcdaFunctionalStatusOrganizer,
  BuildCcdaImmunization,
  BuildCcdaInit,
  BuildCcdaMedication,
  BuildCcdaMentalStatusOrganizer,
  BuildCcdaPatient,
  BuildCcdaPlannedItem,
  BuildCcdaProblem,
  BuildCcdaProcedure,
  BuildCcdaResult,
  BuildCcdaResultPanel,
  BuildCcdaSmokingStatus,
  BuildCcdaVitalsPanel,
  CcdaDocument,
  PlannedActMood,
  PlannedOrderMood,
} from "@cosyte/ccda";
import fc from "fast-check";
import type { Arbitrary } from "fast-check";

import { code, quantity, text, timestamp, token } from "./values.js";

/** A builder field that may be left out: drawn as `undefined` about one time in three. @internal */
function maybe<T>(arb: Arbitrary<T>): Arbitrary<T | undefined> {
  return fc.option(arb, { nil: undefined, freq: 3 });
}

/**
 * An object type with each key that may hold `undefined` made optional instead, as
 * `exactOptionalPropertyTypes` wants a builder input written.
 *
 * @internal
 */
export type Compacted<T> = {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K];
} & {
  [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<T[K], undefined>;
};

/**
 * Drop the keys whose value is `undefined`, so a generated object carries only the fields it sets,
 * as a caller writing it by hand would.
 *
 * @internal
 */
export function compact<T extends object>(value: T): Compacted<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as Compacted<T>;
}

/** A list of up to `max` items. @internal */
function list<T>(arb: Arbitrary<T>, max: number, min = 0): Arbitrary<T[]> {
  return fc.array(arb, { minLength: min, maxLength: max });
}

/** The three statuses a concern or a medication takes. @internal */
const CONCERN_STATUS = fc.constantFrom<"active" | "inactive">("active", "inactive");

/** A name part: `Z` and lower-case letters, so it looks like no real name. @internal */
const namePart: Arbitrary<string> = fc
  .string({ unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz"), minLength: 1, maxLength: 8 })
  .map((s) => `Z${s}`);

/**
 * Generate the record-target patient: a synthetic MRN, name parts that start with `Z`, an
 * administrative gender code and a birth time, each sometimes left out (the builder then writes a
 * `nullFlavor`).
 *
 * @returns An arbitrary of a `BuildCcdaPatient`.
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { patient } from "@cosyte/ccda/arbitraries";
 *
 * const [p] = fc.sample(patient(), 1);
 * // p is like { mrn: "ZK41", given: ["Zqa"], family: "Zmo", gender: "F" }
 * ```
 */
export function patient(): Arbitrary<BuildCcdaPatient> {
  return fc
    .record({
      mrn: maybe(token()),
      prefix: maybe(list(namePart, 1, 1)),
      given: maybe(list(namePart, 2, 1)),
      family: maybe(namePart),
      suffix: maybe(list(namePart, 1, 1)),
      gender: maybe(fc.constantFrom("M", "F", "UN")),
      birthTime: maybe(timestamp({ maxYear: 2025 })),
    })
    .map(compact);
}

/**
 * Generate a problem: a coded condition, a status, and an onset date; a resolved one may carry a
 * resolution date.
 *
 * @returns An arbitrary of a `BuildCcdaProblem`.
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { problem } from "@cosyte/ccda/arbitraries";
 *
 * const [p] = fc.sample(problem(), 1);
 * // p is like { problem: { code: "4417", displayName: "Zq" }, status: "active" }
 * ```
 */
export function problem(): Arbitrary<BuildCcdaProblem> {
  return fc.oneof(
    fc
      .record({ problem: code(), status: maybe(CONCERN_STATUS), onset: maybe(timestamp()) })
      .map(compact),
    fc
      .record({
        problem: code(),
        status: fc.constant("resolved" as const),
        onset: maybe(timestamp()),
        resolution: maybe(timestamp()),
      })
      .map(compact),
  );
}

/**
 * Generate an allergy: an allergen with an optional type, reaction, severity, criticality and
 * dates, or a "no known allergies" assertion.
 *
 * @returns An arbitrary of a `BuildCcdaAllergy`.
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { allergy } from "@cosyte/ccda/arbitraries";
 *
 * const [a] = fc.sample(allergy(), 1);
 * // a is like { allergen: { code: "7980", displayName: "Zq" }, reaction: { ... } }
 * ```
 */
export function allergy(): Arbitrary<BuildCcdaAllergy> {
  const details = {
    type: maybe(code()),
    reaction: maybe(code()),
    severity: maybe(code()),
    criticality: maybe(code()),
    onset: maybe(timestamp()),
  };
  return fc.oneof(
    fc.record({ allergen: code(), status: maybe(CONCERN_STATUS), ...details }).map(compact),
    fc
      .record({
        allergen: code(),
        status: fc.constant("resolved" as const),
        resolution: maybe(timestamp()),
        ...details,
      })
      .map(compact),
    fc.constant({ noKnownAllergy: true }),
  );
}

/** A therapy or encounter window: either bound, or both. @internal */
const period: Arbitrary<{ readonly low?: string; readonly high?: string }> = fc
  .record({ low: maybe(timestamp()), high: maybe(timestamp()) })
  .map(compact);

/**
 * Generate a medication: a coded drug, with an optional dose, route, frequency, therapy window and
 * status.
 *
 * @returns An arbitrary of a `BuildCcdaMedication`.
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { medication } from "@cosyte/ccda/arbitraries";
 *
 * const [m] = fc.sample(medication(), 1);
 * // m is like { drug: { code: "314076", displayName: "Zq" }, dose: { value: 1, unit: "{tablet}" } }
 * ```
 */
export function medication(): Arbitrary<BuildCcdaMedication> {
  return fc
    .record({
      drug: code(),
      dose: maybe(quantity()),
      route: maybe(code()),
      frequency: maybe(quantity({ units: ["h", "d", "min"] })),
      duration: maybe(period),
      status: maybe(
        fc.constantFrom<"active" | "inactive" | "resolved">("active", "inactive", "resolved"),
      ),
    })
    .map(compact);
}

/** One result: exactly one value form. @internal */
const result: Arbitrary<BuildCcdaResult> = fc
  .record({
    test: code(),
    value: fc.oneof(
      quantity().map((q) => ({ quantity: q })),
      code().map((c) => ({ codedValue: c })),
      text().map((s) => ({ stringValue: s })),
    ),
    referenceRange: maybe(
      fc.oneof(
        fc.record({ low: quantity() }),
        fc.record({ high: quantity() }),
        fc.record({ low: quantity(), high: quantity() }),
      ),
    ),
    interpretation: maybe(code()),
    effectiveTime: maybe(timestamp()),
  })
  .map(({ value, ...rest }) => compact({ ...rest, ...value }));

/**
 * Generate a results panel: a coded panel with one to three results, each carrying exactly one
 * value form (a quantity, a coded value or a string), and optional reference ranges,
 * interpretations and times.
 *
 * @returns An arbitrary of a `BuildCcdaResultPanel`.
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { resultPanel } from "@cosyte/ccda/arbitraries";
 *
 * const [panel] = fc.sample(resultPanel(), 1);
 * // panel.results.length is 1, 2 or 3
 * ```
 */
export function resultPanel(): Arbitrary<BuildCcdaResultPanel> {
  return fc
    .record({
      code: code(),
      effectiveTime: maybe(timestamp()),
      results: list(result, 3, 1),
    })
    .map(compact);
}

/**
 * Generate a vital signs panel: one to three readings, each a coded vital with a quantity, and an
 * optional interpretation and time.
 *
 * @returns An arbitrary of a `BuildCcdaVitalsPanel`.
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { vitalsPanel } from "@cosyte/ccda/arbitraries";
 *
 * const [panel] = fc.sample(vitalsPanel(), 1);
 * // panel.vitals.length is 1, 2 or 3
 * ```
 */
export function vitalsPanel(): Arbitrary<BuildCcdaVitalsPanel> {
  const vital = fc
    .record({
      code: code(),
      quantity: quantity(),
      interpretation: maybe(code()),
      effectiveTime: maybe(timestamp()),
    })
    .map(compact);
  return fc.record({ effectiveTime: maybe(timestamp()), vitals: list(vital, 3, 1) }).map(compact);
}

/**
 * Generate an immunization: a coded vaccine with an optional dose, route and date, sometimes
 * refused.
 *
 * @returns An arbitrary of a `BuildCcdaImmunization`.
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { immunization } from "@cosyte/ccda/arbitraries";
 *
 * const [i] = fc.sample(immunization(), 1);
 * // i is like { vaccine: { code: "140", displayName: "Zq" }, effectiveTime: "20240101" }
 * ```
 */
export function immunization(): Arbitrary<BuildCcdaImmunization> {
  return fc
    .record({
      vaccine: code(),
      dose: maybe(quantity({ units: ["mL"] })),
      route: maybe(code()),
      effectiveTime: maybe(timestamp()),
      refused: maybe(fc.boolean()),
    })
    .map(compact);
}

/**
 * Generate a procedure of each kind (an operative procedure, an act, or an observation with its
 * value), performed or planned, with an optional date.
 *
 * @returns An arbitrary of a `BuildCcdaProcedure`.
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { procedure } from "@cosyte/ccda/arbitraries";
 *
 * const [p] = fc.sample(procedure(), 1);
 * // p is like { code: { code: "80146002", displayName: "Zq" }, disposition: "performed" }
 * ```
 */
export function procedure(): Arbitrary<BuildCcdaProcedure> {
  return fc
    .record({
      kind: fc.constantFrom<"procedure" | "act" | "observation">("procedure", "act", "observation"),
      code: code(),
      disposition: maybe(fc.constantFrom<"performed" | "planned">("performed", "planned")),
      effectiveTime: maybe(timestamp()),
      value: code(),
    })
    .map(({ kind, value, ...rest }) =>
      compact(kind === "observation" ? { kind, value, ...rest } : { kind, ...rest }),
    );
}

/**
 * Generate an encounter: a coded encounter type with an optional status and period.
 *
 * @returns An arbitrary of a `BuildCcdaEncounter`.
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { encounter } from "@cosyte/ccda/arbitraries";
 *
 * const [e] = fc.sample(encounter(), 1);
 * // e is like { type: { code: "99213", displayName: "Zq" }, period: { low: "20230615" } }
 * ```
 */
export function encounter(): Arbitrary<BuildCcdaEncounter> {
  return fc
    .record({ type: code(), status: maybe(fc.constant("completed")), period: maybe(period) })
    .map(compact);
}

/** A smoking status observation. @internal */
const smokingStatus: Arbitrary<BuildCcdaSmokingStatus> = fc
  .record({ value: maybe(code()), effectiveTime: maybe(timestamp()) })
  .map(compact);

/** A planned item of each kind. @internal */
const plannedItem: Arbitrary<BuildCcdaPlannedItem> = fc.oneof(
  fc
    .record({
      kind: fc.constantFrom<"act" | "encounter" | "procedure">("act", "encounter", "procedure"),
      code: code(),
      mood: maybe(fc.constantFrom<PlannedActMood>("INT", "RQO", "PRMS", "PRP", "APT", "ARQ")),
      effectiveTime: maybe(timestamp()),
    })
    .map(compact),
  fc
    .record({
      kind: fc.constantFrom<"medicationActivity" | "supply">("medicationActivity", "supply"),
      code: code(),
      mood: maybe(fc.constantFrom<PlannedOrderMood>("INT", "RQO", "PRMS", "PRP")),
      effectiveTime: maybe(timestamp()),
    })
    .map(compact),
  fc
    .record({
      kind: fc.constant("observation" as const),
      code: code(),
      mood: maybe(fc.constantFrom<PlannedOrderMood>("INT", "RQO", "PRMS", "PRP")),
      value: maybe(code()),
      effectiveTime: maybe(timestamp()),
    })
    .map(compact),
  fc
    .record({
      kind: fc.constant("immunizationActivity" as const),
      code: code(),
      mood: maybe(fc.constantFrom<PlannedOrderMood>("INT", "RQO", "PRMS", "PRP")),
      effectiveTime: timestamp(),
    })
    .map(compact),
);

/** One relative and their conditions. @internal */
const familyHistory: Arbitrary<BuildCcdaFamilyHistory> = fc.record({
  relative: fc
    .record({
      relationship: maybe(code()),
      gender: maybe(fc.constantFrom("M", "F", "UN")),
      birthTime: maybe(timestamp({ maxYear: 2025 })),
      deceased: maybe(fc.boolean()),
    })
    .map(compact),
  observations: list(
    fc
      .record({
        condition: maybe(code()),
        ageAtOnset: maybe(fc.integer({ min: 0, max: 110 })),
        causeOfDeath: maybe(fc.boolean()),
        effectiveTime: maybe(timestamp()),
      })
      .map(compact),
    2,
    1,
  ),
});

/** A finding with an optional value and time. @internal */
const finding = fc.record({ value: maybe(code()), effectiveTime: maybe(timestamp()) }).map(compact);

/** A functional status organizer. @internal */
const functionalOrganizer: Arbitrary<BuildCcdaFunctionalStatusOrganizer> = fc
  .record({
    code: maybe(code()),
    effectiveTime: maybe(timestamp()),
    findings: list(finding, 2, 1),
    selfCareActivities: maybe(
      list(
        fc
          .record({ code: maybe(code()), value: maybe(code()), effectiveTime: maybe(timestamp()) })
          .map(compact),
        2,
        1,
      ),
    ),
  })
  .map(compact);

/** A mental status organizer. @internal */
const mentalOrganizer: Arbitrary<BuildCcdaMentalStatusOrganizer> = fc
  .record({ code: maybe(code()), effectiveTime: maybe(timestamp()), findings: list(finding, 2, 1) })
  .map(compact);

/** An assessment scale with optional supporting items. @internal */
const assessmentScale: Arbitrary<BuildCcdaAssessmentScale> = fc
  .record({
    code: code(),
    score: maybe(fc.integer({ min: 0, max: 100 })),
    effectiveTime: maybe(timestamp()),
    interpretation: maybe(code()),
    supporting: maybe(
      list(
        fc.record({ code: code(), score: maybe(fc.integer({ min: 0, max: 10 })) }).map(compact),
        2,
        1,
      ),
    ),
  })
  .map(compact);

/** Options for {@link documentInit} and {@link document}. */
export interface DocumentOptions {
  /**
   * The document types to build. Defaults to all six the builder emits: `"ccd"`,
   * `"referralNote"`, `"dischargeSummary"`, `"progressNote"`, `"historyAndPhysical"` and
   * `"consultationNote"`.
   */
  readonly documentTypes?: readonly BuildableDocumentType[];
  /** The most entries in each clinical list. Defaults to 2. */
  readonly maxEntries?: number;
}

/**
 * Generate the structured input for `buildCcda`: a document type, a fixed document id and time (so
 * the same input always builds the same bytes), a patient, and clinical lists of up to
 * `maxEntries` items each, with the narrative sections and the encompassing encounter each type
 * carries.
 *
 * @param options - The document types and list sizes; see {@link DocumentOptions}.
 * @returns An arbitrary of a `BuildCcdaInit` that `buildCcda` accepts.
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { buildCcda } from "@cosyte/ccda";
 * import { documentInit } from "@cosyte/ccda/arbitraries";
 *
 * const [init] = fc.sample(documentInit(), 1);
 * const doc = buildCcda(init!);
 * ```
 */
export function documentInit(options: DocumentOptions = {}): Arbitrary<BuildCcdaInit> {
  const types = options.documentTypes ?? [
    "ccd",
    "referralNote",
    "dischargeSummary",
    "progressNote",
    "historyAndPhysical",
    "consultationNote",
  ];
  const max = Math.max(0, options.maxEntries ?? 2);
  const common = {
    documentId: token(),
    title: maybe(text()),
    effectiveTime: timestamp({ minYear: 2000 }),
    languageCode: maybe(fc.constantFrom("en-US", "es-US")),
    confidentiality: maybe(fc.constantFrom("N", "R", "V")),
    custodianName: maybe(text()),
    patient: patient(),
    problems: maybe(list(problem(), max)),
    allergies: maybe(list(allergy(), max)),
    medications: maybe(list(medication(), max)),
    results: maybe(list(resultPanel(), max)),
    vitalSigns: maybe(list(vitalsPanel(), max)),
    immunizations: maybe(list(immunization(), max)),
    procedures: maybe(list(procedure(), max)),
    encounters: maybe(list(encounter(), max)),
    smokingStatus: maybe(list(smokingStatus, max)),
    functionalStatus: maybe(list(finding, max)),
    functionalStatusOrganizers: maybe(list(functionalOrganizer, max)),
    functionalStatusScales: maybe(list(assessmentScale, max)),
    mentalStatus: maybe(list(finding, max)),
    mentalStatusOrganizers: maybe(list(mentalOrganizer, max)),
    mentalStatusScales: maybe(list(assessmentScale, max)),
    pastMedicalHistory: maybe(list(problem(), max)),
    planOfTreatment: maybe(list(plannedItem, max)),
    familyHistory: maybe(list(familyHistory, max)),
  };
  const narrative = (): Arbitrary<string | undefined> => maybe(text({ maxLength: 60 }));
  const officeVisit = {
    assessment: narrative(),
    historyOfPresentIllness: narrative(),
    chiefComplaintAndReasonForVisit: narrative(),
    reviewOfSystems: narrative(),
    physicalExam: narrative(),
    generalStatus: narrative(),
    encompassingEncounter: maybe(
      fc.record({ period: maybe(period), dischargeDisposition: maybe(code()) }).map(compact),
    ),
  };
  const byType: Record<BuildableDocumentType, Arbitrary<BuildCcdaInit>> = {
    ccd: fc.record({ documentType: fc.constant("ccd" as const), ...common }).map(compact),
    referralNote: fc
      .record({
        documentType: fc.constant("referralNote" as const),
        ...common,
        assessment: maybe(text({ maxLength: 60 })),
        reasonForReferral: maybe(text({ maxLength: 60 })),
      })
      .map(compact),
    dischargeSummary: fc
      .record({
        documentType: fc.constant("dischargeSummary" as const),
        ...common,
        hospitalCourse: maybe(text({ maxLength: 60 })),
        dischargeDiagnoses: maybe(list(problem(), max)),
        encompassingEncounter: maybe(
          fc.record({ period: maybe(period), dischargeDisposition: maybe(code()) }).map(compact),
        ),
      })
      .map(compact),
    progressNote: fc
      .record({ documentType: fc.constant("progressNote" as const), ...common, ...officeVisit })
      .map(compact),
    historyAndPhysical: fc
      .record({
        documentType: fc.constant("historyAndPhysical" as const),
        ...common,
        ...officeVisit,
      })
      .map(compact),
    consultationNote: fc
      .record({
        documentType: fc.constant("consultationNote" as const),
        ...common,
        ...officeVisit,
        reasonForReferral: narrative(),
      })
      .map(compact),
  };
  return fc.oneof(...types.map((type) => byType[type]));
}

/**
 * Build a document from its input, and make it print as the `buildCcda(...)` call that rebuilds
 * it, and clone by building again, so a test that changes a document cannot change the case
 * fast-check replays.
 *
 * @internal
 */
export function builtDocument(init: BuildCcdaInit): CcdaDocument {
  const doc = buildCcda(init);
  Object.defineProperty(doc, fc.toStringMethod, {
    value: () => `buildCcda(${fc.stringify(init)})`,
  });
  Object.defineProperty(doc, fc.cloneMethod, { value: () => builtDocument(init) });
  return doc;
}

/**
 * Generate a spec-clean C-CDA R2.1 document: a CCD, a Referral Note, a Discharge Summary, a
 * Progress Note, a History and Physical or a Consultation Note that `buildCcda` builds from
 * {@link documentInit}, with its patient, problems, allergies,
 * medications, results, vital signs, immunizations, procedures, encounters, social history,
 * functional and mental status, past medical history, plan of treatment and family history.
 * Every value in it is synthetic and random.
 *
 * Its warnings describe what the input left out or asserted (a medication with no dose, a refused
 * immunization, a smoking status code outside the value set), never a repair: the document
 * serializes to text that parses back to the same document. A failing document prints as the
 * `buildCcda(...)` call that rebuilds it.
 *
 * @param options - The document types and list sizes; see {@link DocumentOptions}.
 * @returns An arbitrary of a parsed `CcdaDocument`.
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { parseCcda } from "@cosyte/ccda";
 * import { document } from "@cosyte/ccda/arbitraries";
 *
 * fc.assert(
 *   fc.property(document(), (doc) => parseCcda(doc.toString()).toString() === doc.toString()),
 * );
 * ```
 */
export function document(options: DocumentOptions = {}): Arbitrary<CcdaDocument> {
  return documentInit(options).map(builtDocument);
}
