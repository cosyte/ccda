/**
 * The per-document-type required-section (SHALL) **verification status**: the
 * four states, the trace behind the five document types that were read off the
 * normative C-CDA R2.1 source, the structural decision for Unstructured
 * Document, and the compatibility promise that the six rows nobody re-traced
 * keep returning exactly what they returned before.
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
  HISTORY_OF_PRESENT_ILLNESS_SECTION,
  PROBLEMS_SECTION,
  PROCEDURES_SECTION,
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

/** The five types read off the normative source here. */
const TRACED_HERE: readonly DocumentType[] = [
  "consultationNote",
  "progressNote",
  "procedureNote",
  "operativeNote",
  "diagnosticImagingReport",
];

/** The six rows that already asserted keys and are deliberately not re-traced. */
const NOT_RETRACED: readonly DocumentType[] = [
  "ccd",
  "dischargeSummary",
  "referralNote",
  "historyAndPhysical",
  "carePlan",
  "transferSummary",
];

/**
 * The asserted key sets measured on the published `0.0.15` surface, before the
 * verification status existed. The six rows below are the compatibility promise:
 * a caller written against `0.0.15` gets the same value, in the same shape, from
 * the same call. The five traced rows change by design and are pinned
 * separately, which is the whole point of the change.
 */
const KEYS_AT_0_0_15: Readonly<Partial<Record<DocumentType, readonly string[]>>> = {
  ccd: ["allergies", "medications", "problems", "results", "socialHistory", "vitalSigns"],
  dischargeSummary: ["allergies", "hospitalDischargeDiagnosis", "dischargeMedications"],
  referralNote: ["allergies", "medications", "problems", "reasonForReferral"],
  historyAndPhysical: ["allergies"],
  carePlan: ["healthConcerns", "goals"],
  transferSummary: ["allergies", "medications", "problems"],
};

/** The same six, as an unstamped (R1.1-origin) document reads them. */
const UNSTAMPED_KEYS_AT_0_0_15: Readonly<Partial<Record<DocumentType, readonly string[]>>> = {
  ccd: ["allergies", "medications", "problems", "results"],
  dischargeSummary: ["allergies", "hospitalDischargeDiagnosis", "dischargeMedications"],
  referralNote: ["allergies", "medications", "problems", "reasonForReferral"],
  historyAndPhysical: ["allergies"],
  carePlan: ["healthConcerns", "goals"],
  transferSummary: ["allergies", "medications", "problems"],
};

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

  it("enumerates all twelve through the published export surface, none unset", () => {
    const statuses = requiredSectionStatuses();
    expect(statuses).toHaveLength(12);
    expect(statuses.map((s) => s.documentType)).toEqual([...DOCUMENT_TYPES]);
    for (const status of statuses) {
      expect(typeof status.verification).toBe("string");
      expect(status.verification.length).toBeGreaterThan(0);
    }
    // The three groups partition the twelve: no type is in two, none outside all.
    const byState = new Map(statuses.map((s) => [s.documentType, s.verification]));
    for (const documentType of TRACED_HERE) {
      expect(["traced-complete", "traced-partial"]).toContain(byState.get(documentType));
    }
    for (const documentType of NOT_RETRACED) expect(byState.get(documentType)).toBe("untraced");
    expect(byState.get("unstructuredDocument")).toBe("not-applicable");
    expect(new Set([...TRACED_HERE, ...NOT_RETRACED, "unstructuredDocument"]).size).toBe(12);
  });

  it("makes an empty asserted key set decidable from the returned value alone", () => {
    const empties = requiredSectionStatuses().filter((s) => s.keys.length === 0);
    // Every type that asserts nothing still says WHY it asserts nothing.
    expect(empties.length).toBeGreaterThan(0);
    for (const status of empties) {
      expect(status.verification).not.toBe("");
    }
    // The same emptiness, three different readings, three different values.
    expect(requiredSectionStatus("progressNote").keys).toEqual([]);
    expect(requiredSectionStatus("progressNote").verification).toBe("traced-partial");
    expect(requiredSectionStatus("unstructuredDocument").keys).toEqual([]);
    expect(requiredSectionStatus("unstructuredDocument").verification).toBe("not-applicable");
    // And an untraced row's emptiness would read as `untraced`: the CCD's
    // unstamped reading is non-empty, so the state is what separates them.
    expect(requiredSectionStatus("ccd").verification).toBe("untraced");
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

  it("reports a traced state for all five source-dependent types, never `untraced`", () => {
    for (const documentType of TRACED_HERE) {
      const status = requiredSectionStatus(documentType);
      expect(["traced-complete", "traced-partial"]).toContain(status.verification);
      // Each one names at least one SHALL section it does not assert, which is
      // why none of the five is `traced-complete`.
      expect(status.unasserted.length).toBeGreaterThan(0);
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

  it("gives every newly asserted key an id and the source's own section name", () => {
    for (const documentType of TRACED_HERE) {
      const status = requiredSectionStatus(documentType);
      // Keys and provenance rows stay in lockstep: no key without a source.
      expect(status.traced.map((row) => row.key)).toEqual([...status.keys]);
      for (const row of status.traced) {
        expect(row.sourceName.length).toBeGreaterThan(0);
      }
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
    // them. Reporting `untraced` must never be achieved by deleting a citation.
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
  });
});

describe("required-section compatibility with the 0.0.15 surface", () => {
  it("returns the same value in the same shape for every row it did not trace", () => {
    for (const documentType of NOT_RETRACED) {
      expect(requiredSectionKeys(documentType)).toEqual(KEYS_AT_0_0_15[documentType]);
      expect(requiredSectionKeys(documentType, { r21Stamped: false })).toEqual(
        UNSTAMPED_KEYS_AT_0_0_15[documentType],
      );
      // The status is additive: it reports the same keys the old call returns.
      expect(requiredSectionStatus(documentType).keys).toEqual(requiredSectionKeys(documentType));
      expect(requiredSectionStatus(documentType).verification).toBe("untraced");
      // An untraced row claims no provenance of its own here, cited or not.
      expect(requiredSectionStatus(documentType).traced).toEqual([]);
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
