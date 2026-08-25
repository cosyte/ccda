/**
 * The per-document-type required-section (SHALL) **verification status**: the
 * four states, the trace behind every one of the twelve document types, the
 * structural decision for Unstructured Document, and the record of exactly how
 * the six re-read rows moved off the published `0.0.15` surface.
 *
 * Every fixture here is synthetic ("Jane Doe", fake OIDs), no realistic PHI,
 * per the repo's PHI-by-default rule.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  parseCcda,
  buildCcda as buildRealCcda,
  defineCcdaProfile,
  isSafetyCriticalCode,
  missingRequiredSections,
  requiredSectionKeys,
  requiredSectionStatus,
  requiredSectionStatuses,
  DOCUMENT_TYPES,
  WARNING_CODES,
  CcdaProfileDefinitionError,
  type BuildCcdaInit,
  type CcdaDocument,
  type CcdaWarning,
  type DocumentType,
  type RequiredSectionVerification,
} from "../src/index.js";
import {
  buildCcda,
  ALLERGY_ENTRY_SECTION,
  DISCHARGE_MEDICATIONS_SECTION,
  FAMILY_HISTORY_SECTION,
  GOALS_SECTION,
  HEALTH_CONCERNS_SECTION,
  HISTORY_OF_PRESENT_ILLNESS_SECTION,
  HOSPITAL_DISCHARGE_DIAGNOSIS_SECTION,
  MEDICATIONS_SECTION,
  PAST_MEDICAL_HISTORY_SECTION,
  PLAN_OF_TREATMENT_SECTION,
  PROBLEMS_SECTION,
  PROCEDURES_SECTION,
  REASON_FOR_REFERRAL_SECTION,
  RESULTS_SECTION,
  SOCIAL_HISTORY_SECTION,
  VITALS_SECTION,
} from "./__fixtures__/ccda.js";

function codes(warnings: readonly CcdaWarning[]): string[] {
  return warnings.map((w) => w.code);
}

function missingKeys(warnings: readonly CcdaWarning[]): string[] {
  return warnings
    .filter((w) => w.code === WARNING_CODES.REQUIRED_SECTION_MISSING)
    .map((w) => w.message);
}

/** The document-template OID of a recognized type, from the recognition table's arc. */
const DOC_OID: Readonly<Record<DocumentType, string>> = {
  ccd: "2.16.840.1.113883.10.20.22.1.2",
  dischargeSummary: "2.16.840.1.113883.10.20.22.1.8",
  referralNote: "2.16.840.1.113883.10.20.22.1.14",
  consultationNote: "2.16.840.1.113883.10.20.22.1.4",
  historyAndPhysical: "2.16.840.1.113883.10.20.22.1.3",
  progressNote: "2.16.840.1.113883.10.20.22.1.9",
  procedureNote: "2.16.840.1.113883.10.20.22.1.6",
  operativeNote: "2.16.840.1.113883.10.20.22.1.7",
  carePlan: "2.16.840.1.113883.10.20.22.1.15",
  diagnosticImagingReport: "2.16.840.1.113883.10.20.22.1.5",
  unstructuredDocument: "2.16.840.1.113883.10.20.22.1.10",
  transferSummary: "2.16.840.1.113883.10.20.22.1.13",
};

/** The five types read off the normative source in the first trace pass. */
const TRACED_HERE: readonly DocumentType[] = [
  "consultationNote",
  "progressNote",
  "procedureNote",
  "operativeNote",
  "diagnosticImagingReport",
];

/**
 * The six rows that already asserted keys before anyone read the source for
 * them, and whose document-level `errors` / `warnings` rules were re-read
 * against the normative artifact here.
 */
const RETRACED_HERE: readonly DocumentType[] = [
  "ccd",
  "dischargeSummary",
  "referralNote",
  "historyAndPhysical",
  "carePlan",
  "transferSummary",
];

/** How one key moved off the `0.0.15` surface, and the sentence that moved it. */
interface KeyMovement {
  readonly key: string;
  readonly direction: "added" | "withdrawn";
  /** The conformance statement, or the SHOULD / choice finding, behind the move. */
  readonly finding: string;
}

/**
 * The declared behaviour change, row by row: what `0.0.15` published, what the
 * corrected table publishes, and the normative sentence that moved every key
 * that moved, for BOTH the R2.1-stamped and the unstamped reading.
 *
 * This block supersedes the `0.0.15` pin for these six rows and only these six.
 * It is not deleted to make the suite green: the reconciliation test below
 * derives the symmetric difference between the two key sets and requires
 * `moved` / `movedUnstamped` to account for every element of it, so a silent
 * change to a published key set fails here rather than passing quietly.
 */
interface CompatibilityRow {
  readonly at0_0_15: readonly string[];
  readonly corrected: readonly string[];
  readonly moved: readonly KeyMovement[];
  readonly unstampedAt0_0_15: readonly string[];
  readonly unstampedCorrected: readonly string[];
  readonly movedUnstamped: readonly KeyMovement[];
}

const DISCHARGE_MEDICATIONS_IS_SHOULD =
  "Discharge Medications Section (entries optional) (V3) is in the Discharge Summary " +
  "WARNINGS rule as a SHOULD (CONF:1198-30525), never in its errors rule";

const COMPATIBILITY: Readonly<Record<(typeof RETRACED_HERE)[number], CompatibilityRow>> = {
  // Six SHALL sections named, six already asserted: the re-read confirmed the
  // published set exactly and moved nothing in either reading.
  ccd: {
    at0_0_15: ["allergies", "medications", "problems", "results", "socialHistory", "vitalSigns"],
    corrected: ["allergies", "medications", "problems", "results", "socialHistory", "vitalSigns"],
    moved: [],
    unstampedAt0_0_15: ["allergies", "medications", "problems", "results"],
    unstampedCorrected: ["allergies", "medications", "problems", "results"],
    movedUnstamped: [],
  },
  // The row this change exists for, wrong in both directions at `0.0.15`.
  dischargeSummary: {
    at0_0_15: ["allergies", "hospitalDischargeDiagnosis", "dischargeMedications"],
    corrected: ["allergies", "hospitalDischargeDiagnosis", "planOfTreatment"],
    moved: [
      {
        key: "dischargeMedications",
        direction: "withdrawn",
        finding: DISCHARGE_MEDICATIONS_IS_SHOULD,
      },
      {
        key: "planOfTreatment",
        direction: "added",
        finding: "Plan of Treatment Section (V2), CONF:1198-30528, in the errors rule",
      },
    ],
    unstampedAt0_0_15: ["allergies", "hospitalDischargeDiagnosis", "dischargeMedications"],
    // Plan of Treatment is new from a rule whose context requires the R2.1
    // stamp, so it does not reach an unstamped document; the withdrawal does,
    // because "the source never made it unconditional" is stamp-independent.
    unstampedCorrected: ["allergies", "hospitalDischargeDiagnosis"],
    movedUnstamped: [
      {
        key: "dischargeMedications",
        direction: "withdrawn",
        finding: DISCHARGE_MEDICATIONS_IS_SHOULD,
      },
    ],
  },
  // Four SHALL sections named, four asserted: confirmed unchanged.
  referralNote: {
    at0_0_15: ["allergies", "medications", "problems", "reasonForReferral"],
    corrected: ["allergies", "medications", "problems", "reasonForReferral"],
    moved: [],
    unstampedAt0_0_15: ["allergies", "medications", "problems", "reasonForReferral"],
    unstampedCorrected: ["allergies", "medications", "problems", "reasonForReferral"],
    movedUnstamped: [],
  },
  // Ten SHALL sections named, one asserted at `0.0.15`. Six more are in this
  // parser's catalog and are added here; three are outside it and are
  // enumerated instead.
  historyAndPhysical: {
    at0_0_15: ["allergies"],
    corrected: [
      "allergies",
      "familyHistory",
      "pastMedicalHistory",
      "medications",
      "results",
      "socialHistory",
      "vitalSigns",
    ],
    moved: [
      {
        key: "familyHistory",
        direction: "added",
        finding: "Family History Section (V3), CONF:1198-30584",
      },
      {
        key: "pastMedicalHistory",
        direction: "added",
        finding: "Past Medical History (V3), CONF:1198-30588",
      },
      {
        key: "medications",
        direction: "added",
        finding: "Medications Section (entries optional) (V2), CONF:1198-30596",
      },
      {
        key: "results",
        direction: "added",
        finding: "Results Section (entries optional) (V3), CONF:1198-30606",
      },
      {
        key: "socialHistory",
        direction: "added",
        finding: "Social History Section (V3), CONF:1198-30610",
      },
      {
        key: "vitalSigns",
        direction: "added",
        finding: "Vital Signs Section (entries optional) (V3), CONF:1198-30612",
      },
    ],
    unstampedAt0_0_15: ["allergies"],
    // Every added key comes from a rule whose context requires the stamp, so an
    // unstamped History and Physical is asserted exactly as it was.
    unstampedCorrected: ["allergies"],
    movedUnstamped: [],
  },
  // Two SHALL sections named, two asserted: confirmed unchanged.
  carePlan: {
    at0_0_15: ["healthConcerns", "goals"],
    corrected: ["healthConcerns", "goals"],
    moved: [],
    unstampedAt0_0_15: ["healthConcerns", "goals"],
    unstampedCorrected: ["healthConcerns", "goals"],
    movedUnstamped: [],
  },
  // Six SHALL sections named, three asserted at `0.0.15`; all six are in
  // catalog, so the three missing ones are added.
  transferSummary: {
    at0_0_15: ["allergies", "medications", "problems"],
    corrected: [
      "allergies",
      "medications",
      "problems",
      "results",
      "vitalSigns",
      "reasonForReferral",
    ],
    moved: [
      {
        key: "results",
        direction: "added",
        finding: "Results Section (entries required) (V3), CONF:1198-28288",
      },
      {
        key: "vitalSigns",
        direction: "added",
        finding: "Vital Signs Section (entries required) (V3), CONF:1198-28292",
      },
      {
        key: "reasonForReferral",
        direction: "added",
        finding: "Reason for Referral Section (V2), CONF:1198-31343",
      },
    ],
    unstampedAt0_0_15: ["allergies", "medications", "problems"],
    unstampedCorrected: ["allergies", "medications", "problems"],
    movedUnstamped: [],
  },
};

/** The keys in `a` that are not in `b`, plus the keys in `b` that are not in `a`. */
function symmetricDifference(a: readonly string[], b: readonly string[]): string[] {
  const left = new Set(a);
  const right = new Set(b);
  return [...a.filter((k) => !right.has(k)), ...b.filter((k) => !left.has(k))].sort();
}

describe("required-section verification status", () => {
  it("gives every one of the twelve types exactly one of the four states", () => {
    const states: readonly RequiredSectionVerification[] = [
      "traced-complete",
      "traced-partial",
      "untraced",
      "not-applicable",
    ];
    expect(DOCUMENT_TYPES).toHaveLength(12);
    for (const documentType of DOCUMENT_TYPES) {
      const status = requiredSectionStatus(documentType);
      expect(states).toContain(status.verification);
      expect(status.documentType).toBe(documentType);
    }
    // The four are distinguishable by the returned value alone.
    expect(new Set(states).size).toBe(4);
  });

  it("enumerates all twelve as traced or not-applicable, and none as untraced", () => {
    const statuses = requiredSectionStatuses();
    expect(statuses).toHaveLength(12);
    expect(statuses.map((s) => s.documentType)).toEqual([...DOCUMENT_TYPES]);
    for (const status of statuses) {
      expect(["traced-complete", "traced-partial", "not-applicable"]).toContain(
        status.verification,
      );
      expect(status.verification).not.toBe("untraced");
    }
    expect(statuses.filter((s) => s.verification === "untraced")).toEqual([]);

    // The three groups partition the twelve: no type is in two, none outside all.
    const byState = new Map(statuses.map((s) => [s.documentType, s.verification]));
    for (const documentType of [...TRACED_HERE, ...RETRACED_HERE]) {
      expect(["traced-complete", "traced-partial"]).toContain(byState.get(documentType));
    }
    expect(byState.get("unstructuredDocument")).toBe("not-applicable");
    expect(new Set([...TRACED_HERE, ...RETRACED_HERE, "unstructuredDocument"]).size).toBe(12);

    // A completeness claim is only made where the whole obligation is asserted.
    expect(
      statuses.filter((s) => s.verification === "traced-complete").map((s) => s.documentType),
    ).toEqual(["ccd", "carePlan"]);
  });

  it("makes an empty asserted key set decidable from the returned value alone", () => {
    const empties = requiredSectionStatuses().filter((s) => s.keys.length === 0);
    // Every type that asserts nothing still says WHY it asserts nothing.
    expect(empties.length).toBeGreaterThan(0);
    for (const status of empties) {
      expect(status.verification).not.toBe("");
    }
    // The same emptiness, two different readings, two different values.
    expect(requiredSectionStatus("progressNote").keys).toEqual([]);
    expect(requiredSectionStatus("progressNote").verification).toBe("traced-partial");
    expect(requiredSectionStatus("unstructuredDocument").keys).toEqual([]);
    expect(requiredSectionStatus("unstructuredDocument").verification).toBe("not-applicable");
    // A traced-complete row asserts everything its source names, so its
    // `unasserted` list is the empty one that means "nothing is left over".
    expect(requiredSectionStatus("ccd").verification).toBe("traced-complete");
    expect(requiredSectionStatus("ccd").unasserted).toEqual([]);
  });

  it("names the artifact and the artifact's own revision behind every traced row", () => {
    for (const status of requiredSectionStatuses()) {
      const source = status.source;
      expect(source, `${status.documentType} names no source`).toBeDefined();
      if (source === undefined) continue;
      // Standards provenance, not internal bookkeeping: the artifact is named
      // the way a reviewer holding it would name it.
      expect(source.artifact).toContain("C-CDA R2.1");
      expect(source.artifact).toContain("Schematron");
      // The artifact's OWN revision, so a reviewer with a later one can see the
      // trace is stale without re-deriving it.
      expect(source.revision).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
      expect(source.revision).toBe("2025-09-08");
    }
    // Narrowing to an unstamped document does not move the provenance: it is a
    // fact about the reading, not about the document in hand.
    expect(requiredSectionStatus("ccd", { r21Stamped: false }).source).toEqual(
      requiredSectionStatus("ccd").source,
    );
  });

  it("names each unasserted SHALL section by the source's name and its reason", () => {
    const consult = requiredSectionStatus("consultationNote");
    expect(consult.verification).toBe("traced-partial");
    expect(consult.unasserted.map((u) => u.reason)).toEqual([
      "not-unconditionally-required",
      "not-unconditionally-required",
    ]);
    expect(consult.unasserted.map((u) => u.sourceName)).toEqual([
      "Reason for Referral Section or Reason for Visit Section",
      "Assessment and Plan Section, or an Assessment Section and a Plan of Treatment Section",
    ]);

    // Every out-of-catalog SHALL section an Operative Note names is enumerable.
    const operative = requiredSectionStatus("operativeNote");
    expect(operative.keys).toEqual([]);
    expect(operative.unasserted).toHaveLength(8);
    expect(operative.unasserted.every((u) => u.reason === "outside-section-catalog")).toBe(true);
    expect(operative.unasserted.map((u) => u.sourceName)).toContain("Anesthesia Section (V2)");

    const imaging = requiredSectionStatus("diagnosticImagingReport");
    expect(imaging.unasserted).toEqual([
      {
        sourceName: "Findings Section (DIR)",
        conformanceId: "CONF:1198-30697",
        reason: "outside-section-catalog",
      },
    ]);

    // A Procedure Note mixes both reasons, so neither route is theoretical.
    const procedure = requiredSectionStatus("procedureNote");
    expect(new Set(procedure.unasserted.map((u) => u.reason))).toEqual(
      new Set(["outside-section-catalog", "not-unconditionally-required"]),
    );
  });

  it("names a SHALL section outside the catalog rather than dropping it", () => {
    // Hospital Course is an unconditional SHALL for a Discharge Summary that this
    // parser cannot recognize. It is neither asserted as a key (the parser could
    // never find it) nor omitted from the reported obligation (a caller has to be
    // able to see what is not being checked).
    const discharge = requiredSectionStatus("dischargeSummary");
    expect(discharge.verification).toBe("traced-partial");
    expect(discharge.keys).not.toContain("hospitalCourse");
    expect(discharge.unasserted).toEqual([
      {
        sourceName: "Hospital Course Section",
        conformanceId: "CONF:1198-30522",
        reason: "outside-section-catalog",
      },
    ]);

    // A History and Physical names three of them at once.
    const hp = requiredSectionStatus("historyAndPhysical");
    expect(
      hp.unasserted
        .filter((u) => u.reason === "outside-section-catalog")
        .map((u) => [u.sourceName, u.conformanceId]),
    ).toEqual([
      ["General Status Section", "CONF:1198-30586"],
      ["Physical Exam Section (V3)", "CONF:1198-30598"],
      ["Review of Systems Section", "CONF:1198-30608"],
    ]);
  });

  it("reports every named alternative of a choice as unasserted, and none as missing", () => {
    // The obligation is one conformance statement offering alternatives, so it is
    // reported as one row whose name enumerates each alternative. Splitting it
    // into a row per alternative would record one id against several sections,
    // which the id invariant below forbids.
    const hp = requiredSectionStatus("historyAndPhysical");
    const choices = hp.unasserted.filter((u) => u.reason === "not-unconditionally-required");
    expect(choices.map((u) => u.conformanceId)).toEqual(["CONF:1198-30613", "CONF:1198-30614"]);
    for (const alternative of [
      "Chief Complaint and Reason for Visit Section",
      "Chief Complaint Section",
      "Reason for Visit Section",
    ]) {
      expect(choices[0]?.sourceName).toContain(alternative);
    }
    for (const alternative of [
      "Assessment and Plan Section (V2)",
      "Assessment Section",
      "Plan of Treatment Section (V2)",
    ]) {
      expect(choices[1]?.sourceName).toContain(alternative);
    }
    // No alternative of a choice is ever asserted as a required key, for any of
    // the five types whose rules state one.
    for (const documentType of [
      "historyAndPhysical",
      "transferSummary",
      "referralNote",
      "consultationNote",
      "progressNote",
    ] as const) {
      const keys = requiredSectionKeys(documentType);
      for (const alternative of [
        "assessment",
        "planOfTreatment",
        "reasonForVisit",
        "chiefComplaint",
      ]) {
        expect(keys, `${documentType} asserts a choice alternative`).not.toContain(alternative);
      }
    }
  });

  it("reports a traced state for every recognized type, never `untraced`", () => {
    for (const documentType of [...TRACED_HERE, ...RETRACED_HERE]) {
      const status = requiredSectionStatus(documentType);
      expect(["traced-complete", "traced-partial"]).toContain(status.verification);
    }
    // A partial row always says what is left over; a complete row never has any.
    for (const status of requiredSectionStatuses()) {
      if (status.verification === "traced-partial") {
        expect(status.unasserted.length, `${status.documentType}`).toBeGreaterThan(0);
      } else {
        expect(status.unasserted, `${status.documentType}`).toEqual([]);
      }
    }
  });
});

describe("required-section provenance invariants", () => {
  /** Every recorded id, with the type and section it was recorded against. */
  const recorded = requiredSectionStatuses().flatMap((status) => [
    ...status.traced.map((row) => ({
      documentType: status.documentType,
      section: row.key,
      id: row.conformanceId,
      name: row.sourceName,
    })),
    ...status.unasserted.map((row) => ({
      documentType: status.documentType,
      section: row.sourceName,
      id: row.conformanceId,
      name: row.sourceName,
    })),
  ]);

  it("cites a conformance statement for every asserted key of every type", () => {
    for (const documentType of DOCUMENT_TYPES) {
      const status = requiredSectionStatus(documentType);
      // Keys and provenance rows stay in lockstep: no key without a source.
      expect(
        status.traced.map((row) => row.key),
        documentType,
      ).toEqual([...status.keys]);
      for (const row of status.traced) {
        expect(row.conformanceId, `${documentType}/${row.key}`).toMatch(/^CONF:1198-\d+$/u);
        expect(row.sourceName.length).toBeGreaterThan(0);
      }
      // The same holds for the unstamped reading: narrowing the keys narrows the
      // citations beside them rather than leaving an orphan.
      const unstamped = requiredSectionStatus(documentType, { r21Stamped: false });
      expect(
        unstamped.traced.map((row) => row.key),
        documentType,
      ).toEqual([...unstamped.keys]);
    }
    expect(requiredSectionStatus("consultationNote").traced).toEqual([
      {
        key: "historyOfPresentIllness",
        conformanceId: "CONF:1198-28907",
        sourceName: "History of Present Illness Section",
      },
      {
        key: "allergies",
        conformanceId: "CONF:1198-28911",
        sourceName: "Allergies and Intolerances Section (entries required) (V3)",
      },
      {
        key: "problems",
        conformanceId: "CONF:1198-28929",
        sourceName: "Problem Section (entries required) (V3)",
      },
    ]);
  });

  it("records only well-formed ids for the named source", () => {
    expect(recorded.length).toBeGreaterThan(0);
    for (const row of recorded) {
      expect(row.id).toMatch(/^CONF:1198-\d+$/u);
      expect(row.name.length).toBeGreaterThan(0);
    }
  });

  it("never records one id against two different document-type-and-section pairs", () => {
    const byId = new Map<string, string>();
    for (const row of recorded) {
      const pair = `${row.documentType}::${row.section}`;
      const seen = byId.get(row.id);
      expect(
        seen === undefined || seen === pair,
        `${row.id} is recorded against ${seen ?? ""} and ${pair}`,
      ).toBe(true);
      byId.set(row.id, pair);
    }
    // The same section required by two document types carries two distinct ids
    // in the source, so the invariant is a real constraint rather than a vacuous
    // one: Procedure Description is CONF:1198-30356 for a Procedure Note and
    // CONF:1198-30499 for an Operative Note.
    const description = recorded.filter((row) => row.section === "Procedure Description Section");
    expect(description).toHaveLength(2);
    expect(new Set(description.map((row) => row.id)).size).toBe(2);
  });

  it("keeps every conformance id the repository recorded before the trace", () => {
    const source = readFileSync(
      new URL("../src/parser/required-sections.ts", import.meta.url),
      "utf8",
    );
    // The CCD's six, the Referral Note's four, and the exclusions cited beside
    // them. A state is never made easier to report by deleting a citation.
    for (const id of [
      "CONF:1198-30662",
      "-30664",
      "-30666",
      "-30670",
      "-30688",
      "-30690",
      "CONF:1198-29087",
      "-30912",
      "-30923",
      "-30925",
      "CONF:1198-29102",
      "CONF:1198-29090",
      "-29066",
    ]) {
      expect(source, `citation ${id} was dropped from required-sections.ts`).toContain(id);
    }
    // And the citation behind the one WITHDRAWAL this change makes. Discharge
    // Medications is no longer an asserted key, so no `traced` row carries its
    // id; the file must still say which sentence took it out, or the withdrawal
    // becomes unreviewable.
    expect(
      source,
      "the Discharge Medications SHOULD finding (CONF:1198-30525) was dropped",
    ).toContain("CONF:1198-30525");
  });
});

describe("required-section compatibility with the 0.0.15 surface", () => {
  it("publishes the corrected key set for each re-read row, stamped and unstamped", () => {
    for (const documentType of RETRACED_HERE) {
      const row = COMPATIBILITY[documentType];
      expect(requiredSectionKeys(documentType), documentType).toEqual(row.corrected);
      expect(requiredSectionKeys(documentType, { r21Stamped: false }), documentType).toEqual(
        row.unstampedCorrected,
      );
      // The status is additive: it reports the same keys the old call returns.
      expect(requiredSectionStatus(documentType).keys).toEqual(requiredSectionKeys(documentType));
      // Every one of the six is read now, so none of them claims `untraced`.
      expect(requiredSectionStatus(documentType).verification).not.toBe("untraced");
    }
  });

  it("accounts for every key that moved off 0.0.15 with the sentence that moved it", () => {
    for (const documentType of RETRACED_HERE) {
      const row = COMPATIBILITY[documentType];
      // The record is load-bearing rather than decorative: whatever changed
      // between the published set and this one has to be named here, with the
      // conformance statement or the SHOULD / choice finding behind it.
      expect(symmetricDifference(row.at0_0_15, row.corrected), documentType).toEqual(
        row.moved.map((m) => m.key).sort(),
      );
      expect(
        symmetricDifference(row.unstampedAt0_0_15, row.unstampedCorrected),
        `${documentType} unstamped`,
      ).toEqual(row.movedUnstamped.map((m) => m.key).sort());
      for (const movement of [...row.moved, ...row.movedUnstamped]) {
        expect(movement.finding.length, `${documentType}/${movement.key}`).toBeGreaterThan(20);
        const has = row.corrected.includes(movement.key);
        expect(has, `${documentType}/${movement.key}`).toBe(movement.direction === "added");
      }
    }
    // Three rows moved, three were confirmed unchanged. Naming both halves keeps
    // "nothing changed here" a stated result rather than an unread table.
    const moved = RETRACED_HERE.filter((t) => COMPATIBILITY[t].moved.length > 0);
    expect(moved).toEqual(["dischargeSummary", "historyAndPhysical", "transferSummary"]);
  });

  it("changes the unstamped reading only where a key was withdrawn as SHOULD or choice", () => {
    // An R1.1-origin document is asserted exactly as it was at `0.0.15`, except
    // where the source turned out never to have made a key unconditional.
    for (const documentType of RETRACED_HERE) {
      const row = COMPATIBILITY[documentType];
      expect(
        row.movedUnstamped.every((m) => m.direction === "withdrawn"),
        documentType,
      ).toBe(true);
      const stillThere = row.unstampedAt0_0_15.filter(
        (key) => !row.movedUnstamped.some((m) => m.key === key),
      );
      expect(requiredSectionKeys(documentType, { r21Stamped: false }), documentType).toEqual(
        stillThere,
      );
    }
  });

  it("keeps requiredSectionKeys and missingRequiredSections in their old shape", () => {
    for (const documentType of DOCUMENT_TYPES) {
      const keys = requiredSectionKeys(documentType);
      expect(Array.isArray(keys)).toBe(true);
      expect(keys.every((key) => typeof key === "string")).toBe(true);
      expect(missingRequiredSections(documentType, new Set(keys))).toEqual([]);
      expect(missingRequiredSections(documentType, new Set())).toEqual([...keys]);
      expect(requiredSectionStatus(documentType).keys).toEqual([...keys]);
    }
  });

  it("changes the five traced rows' asserted keys by design, and only those", () => {
    // The milestone itself: Consultation Note asserted nothing at `0.0.15` and
    // asserts its three traced SHALL sections now. The other four traced types
    // name no in-catalog unconditional SHALL section, so they stay empty, which
    // is a traced result rather than an unread table.
    expect(requiredSectionKeys("consultationNote")).toEqual([
      "historyOfPresentIllness",
      "allergies",
      "problems",
    ]);
    for (const documentType of [
      "progressNote",
      "procedureNote",
      "operativeNote",
      "diagnosticImagingReport",
    ] as const) {
      expect(requiredSectionKeys(documentType)).toEqual([]);
    }
  });
});

describe("required-section validation for the newly traced types", () => {
  it("flags the SHALL sections a Consultation Note omits", () => {
    const doc = parseCcda(
      buildCcda({ docTypeOid: DOC_OID.consultationNote, sections: PROBLEMS_SECTION }),
    );
    const missing = missingKeys(doc.warnings);
    expect(missing.some((m) => m.includes("historyOfPresentIllness"))).toBe(true);
    expect(missing.some((m) => m.includes('"allergies"'))).toBe(true);
    expect(missing.some((m) => m.includes('"problems"'))).toBe(false);
  });

  it("stays silent when a Consultation Note carries all three", () => {
    const all = `${HISTORY_OF_PRESENT_ILLNESS_SECTION}${ALLERGY_ENTRY_SECTION}${PROBLEMS_SECTION}`;
    const doc = parseCcda(buildCcda({ docTypeOid: DOC_OID.consultationNote, sections: all }));
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.REQUIRED_SECTION_MISSING);
  });

  it("asserts nothing against an unstamped Consultation Note", () => {
    // All three CONF ids live in a rule whose context predicate requires
    // `@extension="2015-08-01"`. A document without the stamp is outside the
    // rule, so the parser says nothing about it rather than applying a clause
    // that does not reach it.
    const doc = parseCcda(
      buildCcda({ docTypeOid: DOC_OID.consultationNote, extension: undefined, sections: "" }),
    );
    expect(codes(doc.warnings)).toContain(WARNING_CODES.TEMPLATE_EXTENSION_ABSENT);
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.REQUIRED_SECTION_MISSING);
    expect(requiredSectionKeys("consultationNote", { r21Stamped: false })).toEqual([]);
    expect(requiredSectionStatus("consultationNote", { r21Stamped: false }).traced).toEqual([]);
    // The state is a claim about the trace, not about this document, so it does
    // not move with the stamp.
    expect(requiredSectionStatus("consultationNote", { r21Stamped: false }).verification).toBe(
      "traced-partial",
    );
  });

  it("stays silent for the four traced types that assert no in-catalog SHALL section", () => {
    for (const documentType of [
      "progressNote",
      "procedureNote",
      "operativeNote",
      "diagnosticImagingReport",
    ] as const) {
      const doc = parseCcda(
        buildCcda({ docTypeOid: DOC_OID[documentType], sections: PROCEDURES_SECTION }),
      );
      expect(doc.documentType).toBe(documentType);
      expect(codes(doc.warnings)).not.toContain(WARNING_CODES.REQUIRED_SECTION_MISSING);
    }
  });
});

/** Every in-catalog SHALL section of the six re-read types, as parseable XML. */
const CONFORMANT_SECTIONS: Readonly<
  Partial<Record<DocumentType, Readonly<Record<string, string>>>>
> = {
  dischargeSummary: {
    allergies: ALLERGY_ENTRY_SECTION,
    hospitalDischargeDiagnosis: HOSPITAL_DISCHARGE_DIAGNOSIS_SECTION,
    planOfTreatment: PLAN_OF_TREATMENT_SECTION,
  },
  historyAndPhysical: {
    allergies: ALLERGY_ENTRY_SECTION,
    familyHistory: FAMILY_HISTORY_SECTION,
    pastMedicalHistory: PAST_MEDICAL_HISTORY_SECTION,
    medications: MEDICATIONS_SECTION,
    results: RESULTS_SECTION,
    socialHistory: SOCIAL_HISTORY_SECTION,
    vitalSigns: VITALS_SECTION,
  },
  carePlan: {
    healthConcerns: HEALTH_CONCERNS_SECTION,
    goals: GOALS_SECTION,
  },
  transferSummary: {
    allergies: ALLERGY_ENTRY_SECTION,
    medications: MEDICATIONS_SECTION,
    problems: PROBLEMS_SECTION,
    results: RESULTS_SECTION,
    vitalSigns: VITALS_SECTION,
    reasonForReferral: REASON_FOR_REFERRAL_SECTION,
  },
};

/** Parse a document of `documentType` carrying exactly `keys`. */
function parseCarrying(
  documentType: DocumentType,
  keys: readonly string[],
  options?: { readonly stamped?: boolean },
): CcdaDocument {
  const catalog = CONFORMANT_SECTIONS[documentType] ?? {};
  const sections = keys.map((key) => catalog[key] ?? "").join("");
  return parseCcda(
    buildCcda({
      docTypeOid: DOC_OID[documentType],
      ...(options?.stamped === false ? { extension: undefined } : {}),
      sections,
    }),
  );
}

describe("required-section validation for the re-read types", () => {
  it("stays silent for a document carrying every key its corrected table asserts", () => {
    for (const documentType of [
      "dischargeSummary",
      "historyAndPhysical",
      "carePlan",
      "transferSummary",
    ] as const) {
      const keys = requiredSectionKeys(documentType);
      expect(keys.length).toBeGreaterThan(0);
      const doc = parseCarrying(documentType, keys);
      expect(doc.documentType).toBe(documentType);
      expect(missingKeys(doc.warnings), documentType).toEqual([]);
    }
  });

  it("names exactly the one key removed from an otherwise conformant document", () => {
    for (const documentType of [
      "dischargeSummary",
      "historyAndPhysical",
      "carePlan",
      "transferSummary",
    ] as const) {
      const keys = requiredSectionKeys(documentType);
      for (const dropped of keys) {
        const doc = parseCarrying(
          documentType,
          keys.filter((key) => key !== dropped),
        );
        const missing = missingKeys(doc.warnings);
        expect(missing, `${documentType} without ${dropped}`).toHaveLength(1);
        expect(missing[0], `${documentType} without ${dropped}`).toContain(`"${dropped}"`);
      }
    }
  });

  it("draws no warning on a conformant Discharge Summary with no Discharge Medications", () => {
    // The regression this change exists for. The document carries every section
    // the Discharge Summary errors rule requires unconditionally and this parser
    // recognizes (Allergies CONF:1198-30520, Discharge Diagnosis -30524, Plan of
    // Treatment -30528), and no Discharge Medications section, whose SHOULD is
    // CONF:1198-30525. It is conformant, so the parser says nothing.
    const doc = parseCarrying("dischargeSummary", [
      "allergies",
      "hospitalDischargeDiagnosis",
      "planOfTreatment",
    ]);
    expect(doc.documentType).toBe("dischargeSummary");
    expect(doc.findSection("dischargeMedications")).toBeUndefined();
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.REQUIRED_SECTION_MISSING);
    expect(missingKeys(doc.warnings)).toEqual([]);

    // Carrying the SHOULD section is equally silent: a SHOULD satisfied and a
    // SHOULD omitted are both conformant, so neither is a required-section
    // verdict.
    const withIt = parseCcda(
      buildCcda({
        docTypeOid: DOC_OID.dischargeSummary,
        sections: `${ALLERGY_ENTRY_SECTION}${HOSPITAL_DISCHARGE_DIAGNOSIS_SECTION}${PLAN_OF_TREATMENT_SECTION}${DISCHARGE_MEDICATIONS_SECTION}`,
      }),
    );
    expect(withIt.findSection("dischargeMedications")).toBeDefined();
    expect(missingKeys(withIt.warnings)).toEqual([]);
  });

  it("warns once, naming planOfTreatment, when a Discharge Summary omits it", () => {
    // The same document with the Plan of Treatment section removed. That one IS
    // in the errors rule (CONF:1198-30528) and IS in this parser's catalog.
    const doc = parseCarrying("dischargeSummary", ["allergies", "hospitalDischargeDiagnosis"]);
    const missing = missingKeys(doc.warnings);
    expect(missing).toHaveLength(1);
    expect(missing[0]).toContain('"planOfTreatment"');
    expect(missing.some((m) => m.includes("dischargeMedications"))).toBe(false);
  });

  it("never reports a Discharge Summary's Discharge Medications as missing", () => {
    // Whatever else the document is short of, the SHOULD section is never one of
    // the things it is short of.
    for (const carried of [
      [],
      ["allergies"],
      ["allergies", "hospitalDischargeDiagnosis"],
      ["allergies", "hospitalDischargeDiagnosis", "planOfTreatment"],
    ]) {
      const doc = parseCarrying("dischargeSummary", carried);
      expect(missingKeys(doc.warnings).some((m) => m.includes("dischargeMedications"))).toBe(false);
    }
    expect(requiredSectionKeys("dischargeSummary")).not.toContain("dischargeMedications");
    expect(requiredSectionKeys("dischargeSummary", { r21Stamped: false })).not.toContain(
      "dischargeMedications",
    );
  });

  it("does not report a choice alternative as missing on a conformant document", () => {
    // A History and Physical carrying all seven asserted sections and neither
    // half of either choice (no chief complaint / reason for visit, no
    // assessment / plan of treatment) is conformant as far as this parser can
    // tell, so it draws nothing.
    const doc = parseCarrying("historyAndPhysical", requiredSectionKeys("historyAndPhysical"));
    expect(missingKeys(doc.warnings)).toEqual([]);
    for (const alternative of [
      "assessment",
      "planOfTreatment",
      "reasonForVisit",
      "chiefComplaint",
    ]) {
      expect(missingKeys(doc.warnings).some((m) => m.includes(alternative))).toBe(false);
    }
  });

  it("asserts an unstamped document exactly as the unstamped table says", () => {
    for (const documentType of [
      "dischargeSummary",
      "historyAndPhysical",
      "transferSummary",
    ] as const) {
      const unstamped = requiredSectionKeys(documentType, { r21Stamped: false });
      const doc = parseCarrying(documentType, unstamped, { stamped: false });
      expect(codes(doc.warnings)).toContain(WARNING_CODES.TEMPLATE_EXTENSION_ABSENT);
      // Carrying only the unstamped set is enough: no stamp-scoped key is
      // reported missing against a document the rule does not reach.
      expect(missingKeys(doc.warnings), documentType).toEqual([]);
      for (const scoped of requiredSectionKeys(documentType).filter(
        (key) => !unstamped.includes(key),
      )) {
        expect(missingKeys(doc.warnings).some((m) => m.includes(scoped))).toBe(false);
      }
    }
  });
});

describe("Unstructured Document has no section obligation to trace", () => {
  it("reports not-applicable and claims nothing else", () => {
    const status = requiredSectionStatus("unstructuredDocument");
    expect(status.verification).toBe("not-applicable");
    expect(status.keys).toEqual([]);
    expect(status.traced).toEqual([]);
    expect(status.unasserted).toEqual([]);
  });

  it("reports no missing section when one is parsed", () => {
    // The R2.1 template's component SHALL contain exactly one `nonXMLBody`
    // (CONF:1198-31086), so there is no `structuredBody` and no section to be
    // missing. The parser reaches the same conclusion structurally.
    const doc = parseCcda(
      buildCcda({ docTypeOid: DOC_OID.unstructuredDocument, nonXmlBody: true }),
    );
    expect(doc.documentType).toBe("unstructuredDocument");
    expect(doc.sections).toEqual([]);
    expect(doc.nonXmlBody).toBeDefined();
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.REQUIRED_SECTION_MISSING);
  });
});

describe("required-section fail-safety", () => {
  it("parses a document missing every required section, warning only", () => {
    const doc = parseCcda(
      buildCcda({ docTypeOid: DOC_OID.consultationNote, sections: PROCEDURES_SECTION }),
    );
    // Warnings, never a throw, and everything present is still returned.
    expect(missingKeys(doc.warnings)).toHaveLength(3);
    expect(doc.findSection("procedures")).toBeDefined();
    expect(doc.getProcedures().length).toBeGreaterThan(0);
    expect(doc.getPatient()).toBeDefined();
    expect(doc.getMrn()).toBe("MRN001");
  });

  it("treats a nullFlavor=NI required section with no entries as present", () => {
    // The document satisfied the cardinality and asserted no clinical content.
    // Those are different statements, and only the first one is what a SHALL
    // section check is about.
    const empty = `
      <component>
        <section nullFlavor="NI">
          <templateId root="2.16.840.1.113883.10.20.22.2.6.1"/>
          <code code="48765-2" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Allergies</title>
          <text>No information.</text>
        </section>
      </component>`;
    const sections = `${HISTORY_OF_PRESENT_ILLNESS_SECTION}${empty}${PROBLEMS_SECTION}`;
    const doc = parseCcda(buildCcda({ docTypeOid: DOC_OID.consultationNote, sections }));
    expect(missingKeys(doc.warnings).some((m) => m.includes('"allergies"'))).toBe(false);
  });

  it("treats a LOINC-fallback match as present, with the fallback warning unchanged", () => {
    // No recognized templateId, so the section is recognized by its LOINC code
    // alone. It counts for the SHALL check exactly as a templated one does.
    const loincOnly = `
      <component>
        <section>
          <code code="10164-2" codeSystem="2.16.840.1.113883.6.1"/>
          <title>History of Present Illness</title>
          <text>Intermittent headache for two weeks.</text>
        </section>
      </component>`;
    const sections = `${loincOnly}${ALLERGY_ENTRY_SECTION}${PROBLEMS_SECTION}`;
    const doc = parseCcda(buildCcda({ docTypeOid: DOC_OID.consultationNote, sections }));
    expect(codes(doc.warnings)).toContain(WARNING_CODES.SECTION_MATCHED_BY_LOINC_FALLBACK);
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.REQUIRED_SECTION_MISSING);
  });

  it("makes no required-section claim about an unrecognized document type", () => {
    const doc = parseCcda(buildCcda({ docTypeOid: "1.2.3.4.5.6.7.8.9", sections: "" }));
    expect(doc.documentType).toBeUndefined();
    expect(codes(doc.warnings)).toContain(WARNING_CODES.UNKNOWN_DOCUMENT_TEMPLATE);
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.REQUIRED_SECTION_MISSING);
  });

  it("resolves several document templateIds, and a null-marked one, exactly as before", () => {
    const consult = DOC_OID.consultationNote;
    // A US Realm Header stamp, a null-marked templateId and the document type's
    // own root: the type resolution is unchanged and the type's obligations
    // apply to it.
    const raw =
      `<templateId nullFlavor="NI"/>` +
      `<templateId root="${consult}" extension="2015-08-01"/>` +
      `<templateId root="${DOC_OID.progressNote}" extension="2015-08-01"/>`;
    const doc = parseCcda(buildCcda({ rawTemplateIds: raw, sections: "" }));
    expect(doc.documentType).toBe("consultationNote");
    expect(missingKeys(doc.warnings)).toHaveLength(3);
  });

  it("leaves the new warnings on the profile path the existing rules define", () => {
    // REQUIRED_SECTION_MISSING is safety-critical, so no profile may quiet it,
    // and a newly traced type does not change that.
    expect(isSafetyCriticalCode(WARNING_CODES.REQUIRED_SECTION_MISSING)).toBe(true);
    expect(() =>
      defineCcdaProfile({
        name: "wishful",
        tolerate: [
          {
            code: WARNING_CODES.REQUIRED_SECTION_MISSING,
            rationale: "vendor omits the HPI section",
          },
        ],
      }),
    ).toThrow(CcdaProfileDefinitionError);

    const profile = defineCcdaProfile({
      name: "benign-only",
      tolerate: [
        { code: WARNING_CODES.TEMPLATE_EXTENSION_ABSENT, rationale: "receives R1.1 documents" },
      ],
    });
    const doc = parseCcda(buildCcda({ docTypeOid: DOC_OID.consultationNote, sections: "" }), {
      profile,
    });
    expect(codes(doc.warnings)).toContain(WARNING_CODES.REQUIRED_SECTION_MISSING);
    expect(missingKeys(doc.warnings)).toHaveLength(3);
  });
});

/**
 * Ask the builder for `documentType`, defeating the compile-time narrowing on
 * purpose. `BuildCcdaInit["documentType"]` IS the emittable set, so the only way
 * to establish at RUNTIME which types the builder emits (and to cover a
 * thirteenth the day it learns one) is to offer it a value the published type
 * excludes and watch it refuse. The cast is the probe, not a convenience.
 */
function tryBuild(documentType: DocumentType): CcdaDocument | undefined {
  const init: BuildCcdaInit = {
    patient: { mrn: "MRN001" },
    documentType: documentType as NonNullable<BuildCcdaInit["documentType"]>,
  };
  try {
    return buildRealCcda(init);
  } catch {
    return undefined; // not an emittable type: the builder refuses it outright.
  }
}

describe("emit and validate stay in lockstep", () => {
  it("builds every emittable document type empty and parses back with no missing section", () => {
    // The types are discovered rather than listed, so a builder that learns a
    // thirteenth is covered here the day it does, instead of the day someone
    // remembers to add it.
    const emittable: DocumentType[] = [];
    for (const documentType of DOCUMENT_TYPES) {
      const built = tryBuild(documentType);
      if (built === undefined) continue;
      emittable.push(documentType);
      expect(codes(built.warnings)).not.toContain(WARNING_CODES.REQUIRED_SECTION_MISSING);
      const back = parseCcda(built.toString());
      expect(back.documentType).toBe(documentType);
      expect(codes(back.warnings)).not.toContain(WARNING_CODES.REQUIRED_SECTION_MISSING);
      for (const key of requiredSectionKeys(documentType)) {
        expect(back.findSection(key)).toBeDefined();
      }
    }
    // Guard against the loop going quiet: the builder emits two types today.
    expect(emittable).toEqual(["ccd", "referralNote"]);
  });
});
