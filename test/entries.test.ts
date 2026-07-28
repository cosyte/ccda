/**
 * Clinical-entry extraction tests, the Phase 2 reconciliation triad (Problems,
 * Medications, Allergies). Covers Tier-1 happy-path extraction, the
 * safety-critical distinctions (negation vs nullFlavor, code vs narrative, dose/
 * route presence, concern status), and the code-system slot warnings. Every
 * fixture is synthetic (the canonical "Jane Doe"), per the PHI-by-default rule.
 */

import { describe, expect, it } from "vitest";

import { parseCcda, WARNING_CODES, type CcdaWarning } from "../src/index.js";
import {
  buildCcda,
  NO_REQUIRED_SECTIONS_DOC_OID,
  PROBLEMS_SECTION,
  MEDICATIONS_SECTION,
  ALLERGY_ENTRY_SECTION,
  IMMUNIZATIONS_SECTION,
  MENTAL_STATUS_ASSESSMENT_SCALE_SECTION,
  NKA_SECTION,
  PLAN_OF_TREATMENT_SECTION,
  RESULTS_SECTION,
  TRIAD_SECTIONS,
} from "./__fixtures__/ccda.js";

function codes(warnings: readonly CcdaWarning[]): string[] {
  return warnings.map((w) => w.code);
}

describe("clinical entries, Tier-1 extraction", () => {
  it("extracts all three triad members from a clean document", () => {
    const doc = parseCcda(
      buildCcda({
        docTypeOid: NO_REQUIRED_SECTIONS_DOC_OID,
        sections: TRIAD_SECTIONS,
        mrnAssigningAuthority: true,
      }),
    );
    expect(doc.getProblems().length).toBe(1);
    expect(doc.getMedications().length).toBe(1);
    expect(doc.getAllergies().length).toBe(1);
    // A clean, fully-stamped triad produces no parse warnings at all.
    expect(doc.warnings).toHaveLength(0);
  });

  it("extracts a Problem Concern Act with its coded value, status, and narrative", () => {
    const doc = parseCcda(buildCcda({ sections: PROBLEMS_SECTION }));
    const concern = doc.getProblems()[0];
    expect(concern?.status).toBe("active");
    expect(concern?.ids[0]?.extension).toBe("prob-act-1");
    const problem = concern?.problems[0];
    expect(problem?.value?.code).toBe("59621000");
    expect(problem?.value?.codeSystem).toBe("2.16.840.1.113883.6.96");
    expect(problem?.narrative).toBe("Essential hypertension");
    expect(problem?.effectiveTime?.low?.date).toBeInstanceOf(Date);
  });

  it("extracts a Medication Activity with drug, dose, route, and split timing", () => {
    const doc = parseCcda(buildCcda({ sections: MEDICATIONS_SECTION }));
    const med = doc.getMedications()[0];
    expect(med?.drug?.code).toBe("314076");
    expect(med?.dose?.value).toBe(10);
    expect(med?.dose?.unit).toBe("mg");
    expect(med?.route?.code).toBe("C38288");
    expect(med?.duration?.high?.date).toBeInstanceOf(Date);
    expect(med?.frequency?.period?.value).toBe(24);
    expect(med?.frequency?.institutionSpecified).toBe(true);
  });

  it("extracts an allergy with allergen, reaction+severity, and criticality", () => {
    const doc = parseCcda(buildCcda({ sections: ALLERGY_ENTRY_SECTION }));
    const allergy = doc.getAllergies()[0]?.allergies[0];
    expect(allergy?.noKnownAllergy).toBe(false);
    expect(allergy?.allergen?.code).toBe("7980");
    expect(allergy?.type?.code).toBe("416098002");
    expect(allergy?.reactions[0]?.manifestation?.code).toBe("247472004");
    expect(allergy?.reactions[0]?.severity?.code).toBe("6736007");
    expect(allergy?.criticality?.code).toBe("CRITH");
  });
});

describe("clinical entries, safety-critical distinctions", () => {
  it("models 'No Known Allergies' as negated, never as unknown", () => {
    const doc = parseCcda(buildCcda({ sections: NKA_SECTION }));
    const allergy = doc.getAllergies()[0]?.allergies[0];
    expect(allergy?.noKnownAllergy).toBe(true);
    expect(allergy?.negated).toBe(true);
    expect(allergy?.nullFlavor).toBeUndefined();
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.NEGATION_VS_NULLFLAVOR_AMBIGUOUS);
  });

  it("keeps negationInd and nullFlavor distinct and warns when both are present", () => {
    const xml = buildCcda({ sections: NKA_SECTION }).replace(
      'negationInd="true"',
      'negationInd="true" nullFlavor="NI"',
    );
    const doc = parseCcda(xml);
    const allergy = doc.getAllergies()[0]?.allergies[0];
    expect(allergy?.negated).toBe(true);
    expect(allergy?.nullFlavor).toBe("NI");
    expect(codes(doc.warnings)).toContain(WARNING_CODES.NEGATION_VS_NULLFLAVOR_AMBIGUOUS);
  });

  it("surfaces a code↔narrative mismatch without picking a winner", () => {
    const xml = buildCcda({ sections: PROBLEMS_SECTION }).replace(
      ">Essential hypertension</content>",
      ">Type 2 diabetes mellitus</content>",
    );
    const doc = parseCcda(xml);
    const problem = doc.getProblems()[0]?.problems[0];
    // Both the coded value and the (divergent) narrative are preserved verbatim.
    expect(problem?.value?.displayName).toBe("Essential hypertension");
    expect(problem?.narrative).toBe("Type 2 diabetes mellitus");
    expect(codes(doc.warnings)).toContain(WARNING_CODES.CODE_NARRATIVE_MISMATCH);
  });

  it("flags a broken narrative reference", () => {
    const xml = buildCcda({ sections: PROBLEMS_SECTION }).replace(
      'value="#prob1"',
      'value="#missing"',
    );
    const doc = parseCcda(xml);
    expect(doc.getProblems()[0]?.problems[0]?.narrative).toBeUndefined();
    expect(codes(doc.warnings)).toContain(WARNING_CODES.NARRATIVE_REFERENCE_BROKEN);
  });

  it("resolves a completed/aborted concern status to resolved", () => {
    const xml = buildCcda({ sections: PROBLEMS_SECTION }).replace(
      '<statusCode code="active"/>',
      '<statusCode code="completed"/>',
    );
    expect(parseCcda(xml).getProblems()[0]?.status).toBe("resolved");
  });

  it("maps an aborted concern to inactive, never resolved", () => {
    const xml = buildCcda({ sections: PROBLEMS_SECTION }).replace(
      '<statusCode code="active"/>',
      '<statusCode code="aborted"/>',
    );
    expect(parseCcda(xml).getProblems()[0]?.status).toBe("inactive");
  });

  it("reports an indeterminate concern status as unknown, never active", () => {
    const xml = buildCcda({ sections: PROBLEMS_SECTION }).replace(
      '<statusCode code="active"/>',
      "",
    );
    const doc = parseCcda(xml);
    expect(doc.getProblems()[0]?.status).toBe("unknown");
    expect(codes(doc.warnings)).toContain(WARNING_CODES.PROBLEM_STATUS_INDETERMINATE);
  });
});

describe("clinical entries, code-system + dosing warnings", () => {
  it("flags a deprecated ICD-9 problem code system", () => {
    const xml = buildCcda({ sections: PROBLEMS_SECTION }).replace(
      'code="59621000" codeSystem="2.16.840.1.113883.6.96"',
      'code="401.9" codeSystem="2.16.840.1.113883.6.103"',
    );
    expect(codes(parseCcda(xml).warnings)).toContain(WARNING_CODES.DEPRECATED_CODE_SYSTEM);
  });

  it("flags an unexpected code system for the medication slot", () => {
    const xml = buildCcda({ sections: MEDICATIONS_SECTION }).replace(
      'code="314076" codeSystem="2.16.840.1.113883.6.88"',
      'code="59621000" codeSystem="2.16.840.1.113883.6.96"',
    );
    expect(codes(parseCcda(xml).warnings)).toContain(WARNING_CODES.UNEXPECTED_CODE_SYSTEM);
  });

  it("flags a missing dose quantity", () => {
    const xml = buildCcda({ sections: MEDICATIONS_SECTION }).replace(
      '<doseQuantity value="10" unit="mg"/>',
      "",
    );
    const doc = parseCcda(xml);
    expect(doc.getMedications()[0]?.dose).toBeUndefined();
    expect(codes(doc.warnings)).toContain(WARNING_CODES.MISSING_DOSE_QUANTITY);
  });

  it("flags a missing route code", () => {
    const xml = buildCcda({ sections: MEDICATIONS_SECTION }).replace(
      '<routeCode code="C38288" codeSystem="2.16.840.1.113883.3.26.1.1" displayName="Oral"/>',
      "",
    );
    const doc = parseCcda(xml);
    expect(doc.getMedications()[0]?.route).toBeUndefined();
    expect(codes(doc.warnings)).toContain(WARNING_CODES.MISSING_ROUTE_CODE);
  });

  it("reads a dose expressed as a range", () => {
    const xml = buildCcda({ sections: MEDICATIONS_SECTION }).replace(
      '<doseQuantity value="10" unit="mg"/>',
      '<doseQuantity><low value="5" unit="mg"/><high value="10" unit="mg"/></doseQuantity>',
    );
    const med = parseCcda(xml).getMedications()[0];
    expect(med?.dose).toBeUndefined();
    expect(med?.doseRange?.low?.value).toBe(5);
    expect(med?.doseRange?.high?.value).toBe(10);
  });

  it("flags an RxNorm allergen coded at product granularity", () => {
    const xml = buildCcda({ sections: ALLERGY_ENTRY_SECTION })
      .replace('displayName="Penicillin G"', 'displayName="Penicillin 500 MG Oral Tablet"')
      .replace(">Penicillin G</content>", ">Penicillin 500 MG Oral Tablet</content>");
    const doc = parseCcda(xml);
    expect(doc.getAllergies()[0]?.allergies[0]?.allergenLevelSuspect).toBe(true);
    expect(codes(doc.warnings)).toContain(WARNING_CODES.ALLERGEN_GRANULARITY_SUSPECT);
  });
});

/**
 * A code with no system is not a code: `250.00` is diabetes in ICD-9-CM and an
 * unrelated concept elsewhere. Before this suite existed, `checkCodeSlot`
 * returned early on a missing `@codeSystem`, so such a value reached neither the
 * structural tier nor the bring-your-own terminology adapter and produced **no
 * warning at all**, the parser got quieter the more broken the input was. These
 * cases pin the fix at every wired `CodeSlot`, and pin the values that must stay
 * silent (a genuinely absent value, and a `nullFlavor` that asserts no code).
 */
describe("clinical entries, a code asserted with no code system", () => {
  it("flags a problem value carrying @code with no @codeSystem", () => {
    const xml = buildCcda({ sections: PROBLEMS_SECTION }).replace(
      '<value xsi:type="CD" code="59621000" codeSystem="2.16.840.1.113883.6.96"',
      '<value xsi:type="CD" code="59621000"',
    );
    expect(codes(parseCcda(xml).warnings)).toContain(WARNING_CODES.MISSING_CODE_SYSTEM);
  });

  it("flags a medication drug code with no @codeSystem", () => {
    const xml = buildCcda({ sections: MEDICATIONS_SECTION }).replace(
      '<code code="314076" codeSystem="2.16.840.1.113883.6.88"',
      '<code code="314076"',
    );
    expect(codes(parseCcda(xml).warnings)).toContain(WARNING_CODES.MISSING_CODE_SYSTEM);
  });

  it("flags a medication routeCode with no @codeSystem", () => {
    const xml = buildCcda({ sections: MEDICATIONS_SECTION }).replace(
      '<routeCode code="C38288" codeSystem="2.16.840.1.113883.3.26.1.1"',
      '<routeCode code="C38288"',
    );
    const doc = parseCcda(xml);
    expect(codes(doc.warnings)).toContain(WARNING_CODES.MISSING_CODE_SYSTEM);
    // The route is still extracted verbatim; the warning never drops the value.
    expect(doc.getMedications()[0]?.route?.code).toBe("C38288");
    expect(doc.getMedications()[0]?.route?.codeSystem).toBeUndefined();
  });

  it("flags an allergen code with no @codeSystem", () => {
    const xml = buildCcda({ sections: ALLERGY_ENTRY_SECTION }).replace(
      '<code code="7980" codeSystem="2.16.840.1.113883.6.88"',
      '<code code="7980"',
    );
    expect(codes(parseCcda(xml).warnings)).toContain(WARNING_CODES.MISSING_CODE_SYSTEM);
  });

  it("flags a vaccine code with no @codeSystem", () => {
    const xml = buildCcda({ sections: IMMUNIZATIONS_SECTION }).replace(
      '<code code="140" codeSystem="2.16.840.1.113883.12.292"',
      '<code code="140"',
    );
    expect(codes(parseCcda(xml).warnings)).toContain(WARNING_CODES.MISSING_CODE_SYSTEM);
  });

  it("flags an immunization routeCode with no @codeSystem", () => {
    const xml = buildCcda({ sections: IMMUNIZATIONS_SECTION }).replace(
      '<routeCode code="C28161" codeSystem="2.16.840.1.113883.3.26.1.1"',
      '<routeCode code="C28161"',
    );
    expect(codes(parseCcda(xml).warnings)).toContain(WARNING_CODES.MISSING_CODE_SYSTEM);
  });

  it("stays silent for a nullFlavor value that asserts no code", () => {
    const xml = buildCcda({ sections: PROBLEMS_SECTION }).replace(
      '<value xsi:type="CD" code="59621000" codeSystem="2.16.840.1.113883.6.96" displayName="Essential hypertension"/>',
      '<value xsi:type="CD" nullFlavor="UNK"/>',
    );
    expect(codes(parseCcda(xml).warnings)).not.toContain(WARNING_CODES.MISSING_CODE_SYSTEM);
  });

  it("stays silent for an absent value", () => {
    const xml = buildCcda({ sections: PROBLEMS_SECTION }).replace(
      '<value xsi:type="CD" code="59621000" codeSystem="2.16.840.1.113883.6.96" displayName="Essential hypertension"/>',
      "",
    );
    expect(codes(parseCcda(xml).warnings)).not.toContain(WARNING_CODES.MISSING_CODE_SYSTEM);
  });

  it("stays silent for an absent routeCode (MISSING_ROUTE_CODE covers that gap)", () => {
    const xml = buildCcda({ sections: MEDICATIONS_SECTION }).replace(
      '<routeCode code="C38288" codeSystem="2.16.840.1.113883.3.26.1.1" displayName="Oral"/>',
      "",
    );
    const warned = codes(parseCcda(xml).warnings);
    expect(warned).toContain(WARNING_CODES.MISSING_ROUTE_CODE);
    expect(warned).not.toContain(WARNING_CODES.MISSING_CODE_SYSTEM);
  });

  it("stays silent for a clean, fully-stamped triad", () => {
    const xml = buildCcda({
      docTypeOid: NO_REQUIRED_SECTIONS_DOC_OID,
      sections: TRIAD_SECTIONS,
      mrnAssigningAuthority: true,
    });
    expect(codes(parseCcda(xml).warnings)).not.toContain(WARNING_CODES.MISSING_CODE_SYSTEM);
  });

  it("still flags when a nullFlavor sits beside the asserted code", () => {
    // A nullFlavor is not an escape hatch: the @code is still asserted and still
    // unreadable without its system, so the deviation must not go quiet.
    const xml = buildCcda({ sections: PROBLEMS_SECTION }).replace(
      '<value xsi:type="CD" code="59621000" codeSystem="2.16.840.1.113883.6.96"',
      '<value xsi:type="CD" nullFlavor="UNK" code="59621000"',
    );
    expect(codes(parseCcda(xml).warnings)).toContain(WARNING_CODES.MISSING_CODE_SYSTEM);
  });

  it("never infers a system, so the adapter is not consulted for such a value", () => {
    // The adapter rejects everything it is shown. A system-less code must not be
    // handed to it under a guessed system, and must still be flagged.
    let consulted = 0;
    const xml = buildCcda({ sections: PROBLEMS_SECTION }).replace(
      '<value xsi:type="CD" code="59621000" codeSystem="2.16.840.1.113883.6.96"',
      '<value xsi:type="CD" code="59621000"',
    );
    const doc = parseCcda(xml, {
      terminology: {
        validateCode: () => {
          consulted += 1;
          return { result: false };
        },
      },
    });
    const warned = codes(doc.warnings);
    expect(warned).toContain(WARNING_CODES.MISSING_CODE_SYSTEM);
    expect(warned).not.toContain(WARNING_CODES.SEMANTIC_CODE_INVALID);
    expect(consulted).toBe(0);
    // The code itself is preserved verbatim, never coerced to a guessed system.
    expect(doc.getProblems()[0]?.problems[0]?.value?.code).toBe("59621000");
    expect(doc.getProblems()[0]?.problems[0]?.value?.codeSystem).toBeUndefined();
  });
});

/**
 * One defect class: **the parser got quieter the more broken the document
 * was.** Each case below reproduced on `main` with zero warnings, and each is
 * pinned here alongside the negative that keeps the fix from becoming noisy.
 */
describe("clinical entries, a nullFlavor asserted beside a populated value", () => {
  it("does not hand back a dose the document declared unknown", () => {
    // The one that matters most: `MISSING_DOSE_QUANTITY` cannot fire, because
    // the element IS present. Before the fix this parsed to
    // `{value:10, unit:"mg", nullFlavor:"UNK"}` with no warning at all, so a
    // consumer reading `med.dose.value` got 10 mg for an unknown dose.
    const xml = buildCcda({ sections: MEDICATIONS_SECTION }).replace(
      '<doseQuantity value="10" unit="mg"/>',
      '<doseQuantity nullFlavor="UNK" value="10" unit="mg"/>',
    );
    const doc = parseCcda(xml);
    const dose = doc.getMedications()[0]?.dose;
    expect(codes(doc.warnings)).toContain(WARNING_CODES.CONTRADICTORY_NULL_FLAVOR);
    // What a naive consumer sees: no number.
    expect(dose?.value).toBeUndefined();
    // Nothing the document said is lost, only the reading the parser would
    // have manufactured from it.
    expect(dose?.raw).toBe("10");
    expect(dose?.unit).toBe("mg");
    expect(dose?.nullFlavor).toBe("UNK");
  });

  it("does not hand back a dose RANGE bound the interval declared unknown", () => {
    const xml = buildCcda({ sections: MEDICATIONS_SECTION }).replace(
      '<doseQuantity value="10" unit="mg"/>',
      '<doseQuantity nullFlavor="UNK"><low value="5" unit="mg"/><high value="10" unit="mg"/></doseQuantity>',
    );
    const doc = parseCcda(xml);
    const range = doc.getMedications()[0]?.doseRange;
    expect(codes(doc.warnings)).toContain(WARNING_CODES.CONTRADICTORY_NULL_FLAVOR);
    expect(range?.low?.value).toBeUndefined();
    expect(range?.high?.value).toBeUndefined();
    expect(range?.low?.raw).toBe("5");
    expect(range?.high?.raw).toBe("10");
  });

  it("withholds the parsed date from a contradicted effectiveTime", () => {
    const xml = buildCcda({ sections: MEDICATIONS_SECTION }).replace(
      '<low value="20210101"/>',
      '<low nullFlavor="UNK" value="20210101"/>',
    );
    const doc = parseCcda(xml);
    const low = doc.getMedications()[0]?.duration?.low;
    expect(codes(doc.warnings)).toContain(WARNING_CODES.CONTRADICTORY_NULL_FLAVOR);
    expect(low?.date).toBeUndefined();
    expect(low?.raw).toBe("20210101");
  });

  it("flags a contradicted coded value but keeps the code, which is the document's own text", () => {
    const xml = buildCcda({ sections: MEDICATIONS_SECTION }).replace(
      '<routeCode code="C38288"',
      '<routeCode nullFlavor="UNK" code="C38288"',
    );
    const doc = parseCcda(xml);
    expect(codes(doc.warnings)).toContain(WARNING_CODES.CONTRADICTORY_NULL_FLAVOR);
    // Stated limit: `CD` keeps its `@code` (there is no verbatim copy to fall
    // back on), so the signal here is the warning plus the co-located nullFlavor.
    expect(doc.getMedications()[0]?.route?.code).toBe("C38288");
    expect(doc.getMedications()[0]?.route?.nullFlavor).toBe("UNK");
  });

  it("flags a contradicted patient identifier but keeps the extension", () => {
    const xml = buildCcda({ sections: MEDICATIONS_SECTION }).replace(
      '<id root="2.16.840.1.113883.19.5.99999.3" extension="med-1"/>',
      '<id nullFlavor="NI" root="2.16.840.1.113883.19.5.99999.3" extension="med-1"/>',
    );
    const doc = parseCcda(xml);
    expect(codes(doc.warnings)).toContain(WARNING_CODES.CONTRADICTORY_NULL_FLAVOR);
    expect(doc.getMedications()[0]?.ids[0]?.extension).toBe("med-1");
  });

  // ---- the negatives: shapes that must stay silent ----

  it("stays silent for a legitimately absent value", () => {
    const xml = buildCcda({ sections: MEDICATIONS_SECTION }).replace(
      '<doseQuantity value="10" unit="mg"/>',
      "",
    );
    const warned = codes(parseCcda(xml).warnings);
    expect(warned).toContain(WARNING_CODES.MISSING_DOSE_QUANTITY);
    expect(warned).not.toContain(WARNING_CODES.CONTRADICTORY_NULL_FLAVOR);
  });

  it("stays silent for a nullFlavor-only element, which asserts nothing to contradict", () => {
    const xml = buildCcda({ sections: MEDICATIONS_SECTION }).replace(
      '<doseQuantity value="10" unit="mg"/>',
      '<doseQuantity nullFlavor="UNK"/>',
    );
    const doc = parseCcda(xml);
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.CONTRADICTORY_NULL_FLAVOR);
    expect(doc.getMedications()[0]?.dose?.nullFlavor).toBe("UNK");
  });

  it("stays silent for a nullFlavor beside a unit, a dimension without a magnitude", () => {
    const xml = buildCcda({ sections: MEDICATIONS_SECTION }).replace(
      '<doseQuantity value="10" unit="mg"/>',
      '<doseQuantity nullFlavor="UNK" unit="mg"/>',
    );
    expect(codes(parseCcda(xml).warnings)).not.toContain(WARNING_CODES.CONTRADICTORY_NULL_FLAVOR);
  });

  it("stays silent for the nullFlavor + originalText idiom, which C-CDA documents use", () => {
    // "Not codable in the bound value set, here is the source text" is a
    // coherent statement, not a contradiction. Flagging it would make the
    // parser noisy on conforming documents.
    const xml = buildCcda({ sections: MEDICATIONS_SECTION }).replace(
      '<routeCode code="C38288" codeSystem="2.16.840.1.113883.3.26.1.1" displayName="Oral"/>',
      '<routeCode nullFlavor="OTH"><originalText>by mouth after meals</originalText></routeCode>',
    );
    expect(codes(parseCcda(xml).warnings)).not.toContain(WARNING_CODES.CONTRADICTORY_NULL_FLAVOR);
  });

  it("stays silent for a nullFlavor beside a root with no extension", () => {
    const xml = buildCcda({ sections: MEDICATIONS_SECTION }).replace(
      '<id root="2.16.840.1.113883.19.5.99999.3" extension="med-1"/>',
      '<id nullFlavor="NI" root="2.16.840.1.113883.19.5.99999.3"/>',
    );
    expect(codes(parseCcda(xml).warnings)).not.toContain(WARNING_CODES.CONTRADICTORY_NULL_FLAVOR);
  });

  it("leaves a clean document completely silent", () => {
    const doc = parseCcda(
      buildCcda({ docTypeOid: NO_REQUIRED_SECTIONS_DOC_OID, sections: TRIAD_SECTIONS }),
    );
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.CONTRADICTORY_NULL_FLAVOR);
  });

  // `readObservationValue` parses the INT and ST arms inline rather than through
  // `src/model/types/`, so "every v3 datatype" is only true if these are wired
  // too. This is the slot that carries assessment-scale scores.

  it("does not hand back an assessment-scale score the document declared unknown", () => {
    const xml = buildCcda({ sections: MENTAL_STATUS_ASSESSMENT_SCALE_SECTION }).replace(
      '<value xsi:type="INT" value="12"/>',
      '<value xsi:type="INT" nullFlavor="UNK" value="12"/>',
    );
    const doc = parseCcda(xml);
    const scale = doc.getMentalStatus().find((o) => o.assessmentScale === true);
    expect(codes(doc.warnings)).toContain(WARNING_CODES.CONTRADICTORY_NULL_FLAVOR);
    expect(scale?.value?.kind).toBe("integer");
    if (scale?.value?.kind === "integer") {
      expect(scale.value.value).toBeUndefined();
      expect(scale.value.raw).toBe("12");
      expect(scale.value.nullFlavor).toBe("UNK");
    }
  });

  it("keeps a clean INT score, and its raw token, unwarned", () => {
    const doc = parseCcda(buildCcda({ sections: MENTAL_STATUS_ASSESSMENT_SCALE_SECTION }));
    const value = doc.getMentalStatus().find((o) => o.assessmentScale === true)?.value;
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.CONTRADICTORY_NULL_FLAVOR);
    expect(value?.kind).toBe("integer");
    if (value?.kind === "integer") {
      expect(value.value).toBe(12);
      expect(value.raw).toBe("12");
    }
  });

  it("stays silent for a nullFlavor-only INT, a legitimately unknown score", () => {
    const xml = buildCcda({ sections: MENTAL_STATUS_ASSESSMENT_SCALE_SECTION }).replace(
      '<value xsi:type="INT" value="12"/>',
      '<value xsi:type="INT" nullFlavor="UNK"/>',
    );
    expect(codes(parseCcda(xml).warnings)).not.toContain(WARNING_CODES.CONTRADICTORY_NULL_FLAVOR);
  });

  it("flags a contradicted ST value and no longer drops its nullFlavor", () => {
    const xml = buildCcda({ sections: RESULTS_SECTION }).replace(
      '<value xsi:type="PQ" value="13.5" unit="g/dL"/>',
      '<value xsi:type="ST" nullFlavor="UNK">Positive</value>',
    );
    const doc = parseCcda(xml);
    const value = doc.getResults()[0]?.results[0]?.value;
    expect(codes(doc.warnings)).toContain(WARNING_CODES.CONTRADICTORY_NULL_FLAVOR);
    expect(value?.kind).toBe("string");
    if (value?.kind === "string") {
      // The text is the document's own content, so it is kept; what changed is
      // that the nullFlavor now travels with it instead of vanishing.
      expect(value.value).toBe("Positive");
      expect(value.nullFlavor).toBe("UNK");
    }
  });
});

/**
 * CDA R2's `ManufacturedProduct` is a **choice**: `manufacturedMaterial` or
 * `manufacturedLabeledDrug`. The parser hard-coded the first arm, so the second
 * yielded `drug: undefined` with zero warnings while dose and route survived,
 * and the record read as a well-formed medication that simply had no drug.
 */
describe("clinical entries, the ManufacturedProduct choice", () => {
  const labeledDrug = (section: string): string =>
    section
      .replace("<manufacturedMaterial>", "<manufacturedLabeledDrug>")
      .replace("</manufacturedMaterial>", "</manufacturedLabeledDrug>");

  it("reads the drug off the manufacturedLabeledDrug arm and flags the arm", () => {
    const doc = parseCcda(buildCcda({ sections: labeledDrug(MEDICATIONS_SECTION) }));
    const med = doc.getMedications()[0];
    expect(med?.drug?.code).toBe("314076");
    expect(med?.drug?.codeSystem).toBe("2.16.840.1.113883.6.88");
    expect(codes(doc.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_UNEXPECTED);
    // Dose and route are unaffected: the point is that the drug is no longer
    // the one field that silently vanishes.
    expect(med?.dose?.value).toBe(10);
    expect(med?.route?.code).toBe("C38288");
  });

  it("puts an alternate-arm code through the ordinary code-system checks", () => {
    // The arm is read, not trusted: strip the RxNorm system and the existing
    // MISSING_CODE_SYSTEM check must still fire on it.
    const xml = labeledDrug(MEDICATIONS_SECTION).replace(
      '<code code="314076" codeSystem="2.16.840.1.113883.6.88"',
      '<code code="314076"',
    );
    expect(codes(parseCcda(buildCcda({ sections: xml })).warnings)).toContain(
      WARNING_CODES.MISSING_CODE_SYSTEM,
    );
  });

  it("reads a vaccine off the alternate arm too", () => {
    const doc = parseCcda(buildCcda({ sections: labeledDrug(IMMUNIZATIONS_SECTION) }));
    expect(doc.getImmunizations()[0]?.vaccine?.code).toBe("140");
    expect(codes(doc.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_UNEXPECTED);
  });

  it("flags a medication whose consumable carries no product code on any arm", () => {
    const xml = MEDICATIONS_SECTION.replace(
      '<code code="314076" codeSystem="2.16.840.1.113883.6.88" displayName="Lisinopril 10 MG Oral Tablet"/>',
      "",
    );
    const doc = parseCcda(buildCcda({ sections: xml }));
    expect(codes(doc.warnings)).toContain(WARNING_CODES.MISSING_PRODUCT_CODE);
    expect(doc.getMedications()[0]?.drug).toBeUndefined();
  });

  it("flags a medication with no consumable at all", () => {
    const xml = MEDICATIONS_SECTION.replace(/<consumable>[\s\S]*?<\/consumable>/, "");
    expect(codes(parseCcda(buildCcda({ sections: xml })).warnings)).toContain(
      WARNING_CODES.MISSING_PRODUCT_CODE,
    );
  });

  it("stays silent on the manufacturedMaterial arm", () => {
    const warned = codes(parseCcda(buildCcda({ sections: MEDICATIONS_SECTION })).warnings);
    expect(warned).not.toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_UNEXPECTED);
    expect(warned).not.toContain(WARNING_CODES.MISSING_PRODUCT_CODE);
  });

  it("flags a PLANNED medication with no product code, the third consumable call site", () => {
    const xml = PLAN_OF_TREATMENT_SECTION.replace(
      '<code code="314076" codeSystem="2.16.840.1.113883.6.88" displayName="Lisinopril 10 MG Oral Tablet"/>',
      "",
    );
    expect(codes(parseCcda(buildCcda({ sections: xml })).warnings)).toContain(
      WARNING_CODES.MISSING_PRODUCT_CODE,
    );
  });

  it("reads a planned drug off the alternate arm, and stays quiet on a clean plan", () => {
    const alt = PLAN_OF_TREATMENT_SECTION.replace(
      "<manufacturedMaterial>",
      "<manufacturedLabeledDrug>",
    ).replace("</manufacturedMaterial>", "</manufacturedLabeledDrug>");
    const doc = parseCcda(buildCcda({ sections: alt }));
    const planned = doc.getPlannedItems().find((p) => p.kind === "medicationActivity");
    expect(planned?.code?.code).toBe("314076");
    expect(codes(doc.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_UNEXPECTED);

    const clean = codes(parseCcda(buildCcda({ sections: PLAN_OF_TREATMENT_SECTION })).warnings);
    expect(clean).not.toContain(WARNING_CODES.MISSING_PRODUCT_CODE);
    expect(clean).not.toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_UNEXPECTED);
  });
});

/**
 * The mirror of `MISSING_CODE_SYSTEM`, which `#55` scoped out and left silent:
 * a wired slot whose `CD` is present but names no symbol and declares no
 * `nullFlavor` to say why.
 */
describe("clinical entries, a coded slot present but asserting no code", () => {
  it("flags a system-only problem value", () => {
    const xml = buildCcda({ sections: PROBLEMS_SECTION }).replace(
      '<value xsi:type="CD" code="59621000" codeSystem="2.16.840.1.113883.6.96" displayName="Essential hypertension"/>',
      '<value xsi:type="CD" codeSystem="2.16.840.1.113883.6.96"/>',
    );
    expect(codes(parseCcda(xml).warnings)).toContain(WARNING_CODES.MISSING_CODE_VALUE);
  });

  it("flags an empty @code, which names no symbol", () => {
    const xml = buildCcda({ sections: ALLERGY_ENTRY_SECTION }).replace(
      '<code code="7980"',
      '<code code=""',
    );
    expect(codes(parseCcda(xml).warnings)).toContain(WARNING_CODES.MISSING_CODE_VALUE);
  });

  it("flags a whitespace-only @code", () => {
    const xml = buildCcda({ sections: MEDICATIONS_SECTION }).replace(
      '<routeCode code="C38288"',
      '<routeCode code="  "',
    );
    expect(codes(parseCcda(xml).warnings)).toContain(WARNING_CODES.MISSING_CODE_VALUE);
  });

  it("stays silent for a nullFlavor-only value, a complete statement of unknown", () => {
    const xml = buildCcda({ sections: PROBLEMS_SECTION }).replace(
      '<value xsi:type="CD" code="59621000" codeSystem="2.16.840.1.113883.6.96" displayName="Essential hypertension"/>',
      '<value xsi:type="CD" nullFlavor="UNK"/>',
    );
    const warned = codes(parseCcda(xml).warnings);
    expect(warned).not.toContain(WARNING_CODES.MISSING_CODE_VALUE);
    expect(warned).not.toContain(WARNING_CODES.MISSING_CODE_SYSTEM);
  });

  it("stays silent for an absent value, where there is no element to judge", () => {
    const xml = buildCcda({ sections: PROBLEMS_SECTION }).replace(
      '<value xsi:type="CD" code="59621000" codeSystem="2.16.840.1.113883.6.96" displayName="Essential hypertension"/>',
      "",
    );
    expect(codes(parseCcda(xml).warnings)).not.toContain(WARNING_CODES.MISSING_CODE_VALUE);
  });

  it("stays silent on a clean triad", () => {
    const doc = parseCcda(
      buildCcda({ docTypeOid: NO_REQUIRED_SECTIONS_DOC_OID, sections: TRIAD_SECTIONS }),
    );
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.MISSING_CODE_VALUE);
  });

  /**
   * The slot's system is still judged when no symbol is asserted. Adding
   * `MISSING_CODE_VALUE` must not make the parser *quieter* about a wrong or
   * deprecated terminology than it was before, which is the direction this whole
   * item exists to reverse.
   */
  it("still flags an unexpected code system on a nullFlavor-only value", () => {
    const xml = buildCcda({ sections: PROBLEMS_SECTION }).replace(
      '<value xsi:type="CD" code="59621000" codeSystem="2.16.840.1.113883.6.96" displayName="Essential hypertension"/>',
      '<value xsi:type="CD" nullFlavor="UNK" codeSystem="2.16.840.1.113883.6.1"/>',
    );
    const warned = codes(parseCcda(xml).warnings);
    expect(warned).toContain(WARNING_CODES.UNEXPECTED_CODE_SYSTEM);
    // Silent about the missing code itself, the nullFlavor declared it.
    expect(warned).not.toContain(WARNING_CODES.MISSING_CODE_VALUE);
  });

  it("still flags a deprecated code system on a nullFlavor-only value", () => {
    const xml = buildCcda({ sections: PROBLEMS_SECTION }).replace(
      '<value xsi:type="CD" code="59621000" codeSystem="2.16.840.1.113883.6.96" displayName="Essential hypertension"/>',
      '<value xsi:type="CD" nullFlavor="UNK" codeSystem="2.16.840.1.113883.6.103"/>',
    );
    expect(codes(parseCcda(xml).warnings)).toContain(WARNING_CODES.DEPRECATED_CODE_SYSTEM);
  });

  it("flags both the empty slot and its unexpected system when no nullFlavor explains it", () => {
    const xml = buildCcda({ sections: PROBLEMS_SECTION }).replace(
      '<value xsi:type="CD" code="59621000" codeSystem="2.16.840.1.113883.6.96" displayName="Essential hypertension"/>',
      '<value xsi:type="CD" codeSystem="2.16.840.1.113883.6.1"/>',
    );
    const warned = codes(parseCcda(xml).warnings);
    expect(warned).toContain(WARNING_CODES.MISSING_CODE_VALUE);
    expect(warned).toContain(WARNING_CODES.UNEXPECTED_CODE_SYSTEM);
  });

  it("stays silent for a nullFlavor-only value with no system at all", () => {
    const xml = buildCcda({ sections: PROBLEMS_SECTION }).replace(
      '<value xsi:type="CD" code="59621000" codeSystem="2.16.840.1.113883.6.96" displayName="Essential hypertension"/>',
      '<value xsi:type="CD" nullFlavor="UNK"/>',
    );
    const warned = codes(parseCcda(xml).warnings);
    expect(warned).not.toContain(WARNING_CODES.MISSING_CODE_SYSTEM);
    expect(warned).not.toContain(WARNING_CODES.MISSING_CODE_VALUE);
    expect(warned).not.toContain(WARNING_CODES.UNEXPECTED_CODE_SYSTEM);
  });
});

describe("clinical entries, field-level fidelity", () => {
  it("preserves a negated problem as distinct from an unknown one", () => {
    const xml = buildCcda({ sections: PROBLEMS_SECTION }).replace(
      '<observation classCode="OBS" moodCode="EVN">\n                  <templateId root="2.16.840.1.113883.10.20.22.4.4"',
      '<observation classCode="OBS" moodCode="EVN" negationInd="true">\n                  <templateId root="2.16.840.1.113883.10.20.22.4.4"',
    );
    const problem = parseCcda(xml).getProblems()[0]?.problems[0];
    expect(problem?.negated).toBe(true);
    expect(problem?.nullFlavor).toBeUndefined();
    // The coded value is still carried verbatim, negation is a separate axis.
    expect(problem?.value?.code).toBe("59621000");
  });

  it("carries a problem-observation nullFlavor without conflating it with negation", () => {
    const xml = buildCcda({ sections: PROBLEMS_SECTION }).replace(
      '<observation classCode="OBS" moodCode="EVN">\n                  <templateId root="2.16.840.1.113883.10.20.22.4.4"',
      '<observation classCode="OBS" moodCode="EVN" nullFlavor="NI">\n                  <templateId root="2.16.840.1.113883.10.20.22.4.4"',
    );
    const doc = parseCcda(xml);
    const problem = doc.getProblems()[0]?.problems[0];
    expect(problem?.nullFlavor).toBe("NI");
    expect(problem?.negated).toBeUndefined();
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.NEGATION_VS_NULLFLAVOR_AMBIGUOUS);
  });

  it("carries a medication moodCode and negation flag distinctly", () => {
    const xml = buildCcda({ sections: MEDICATIONS_SECTION }).replace(
      '<substanceAdministration classCode="SBADM" moodCode="EVN">',
      '<substanceAdministration classCode="SBADM" moodCode="INT" negationInd="true">',
    );
    const med = parseCcda(xml).getMedications()[0];
    expect(med?.moodCode).toBe("INT");
    expect(med?.negated).toBe(true);
    expect(med?.statusCode).toBe("active");
  });

  it("handles a reaction with no nested severity", () => {
    const xml = buildCcda({ sections: ALLERGY_ENTRY_SECTION }).replace(
      /<entryRelationship typeCode="SUBJ" inversionInd="true">\s*<observation classCode="OBS" moodCode="EVN">\s*<templateId root="2\.16\.840\.1\.113883\.10\.20\.22\.4\.8"[\s\S]*?<\/observation>\s*<\/entryRelationship>/,
      "",
    );
    const reaction = parseCcda(xml).getAllergies()[0]?.allergies[0]?.reactions[0];
    expect(reaction?.manifestation?.code).toBe("247472004");
    expect(reaction?.severity).toBeUndefined();
  });

  it("extracts triad entries nested inside a subsection", () => {
    // Wrap the Problems section as a subsection under the Allergies section.
    const nested = ALLERGY_ENTRY_SECTION.replace(
      "</section>\n      </component>",
      `${PROBLEMS_SECTION}</section>\n      </component>`,
    );
    const doc = parseCcda(buildCcda({ sections: nested }));
    expect(doc.getProblems().length).toBe(1);
    expect(doc.getAllergies().length).toBe(1);
  });
});

describe("clinical entries, placement + tolerance", () => {
  it("flags a triad entry sitting in the wrong section", () => {
    // Drop the Medication Activity into the Problems section.
    const medEntry = MEDICATIONS_SECTION.slice(
      MEDICATIONS_SECTION.indexOf("<entry>"),
      MEDICATIONS_SECTION.indexOf("</entry>") + "</entry>".length,
    );
    const xml = buildCcda({
      sections: PROBLEMS_SECTION.replace("</section>", `${medEntry}</section>`),
    });
    expect(codes(parseCcda(xml).warnings)).toContain(WARNING_CODES.SECTION_PLACEMENT_SUSPECT);
  });

  it("flags multiple unclassifiable effectiveTime siblings", () => {
    // Two bare effectiveTime elements (no xsi:type, no low/high, no period)
    // alongside the recognized IVL_TS + PIVL_TS pair are unclassifiable.
    const xml = buildCcda({ sections: MEDICATIONS_SECTION }).replace(
      '<routeCode code="C38288"',
      '<effectiveTime value="20210101"/><effectiveTime value="20210601"/><routeCode code="C38288"',
    );
    expect(codes(parseCcda(xml).warnings)).toContain(
      WARNING_CODES.MULTIPLE_EFFECTIVE_TIMES_UNRESOLVED,
    );
  });

  it("treats a single effectiveTime matching both duration and frequency axes as unresolved", () => {
    // An untyped effectiveTime carrying BOTH low/high and a period is ambiguous;
    // the parser must never silently pick one axis.
    const xml = buildCcda({ sections: MEDICATIONS_SECTION }).replace(
      '<routeCode code="C38288"',
      '<effectiveTime><low value="20210101"/><period value="12" unit="h"/></effectiveTime><routeCode code="C38288"',
    );
    expect(codes(parseCcda(xml).warnings)).toContain(
      WARNING_CODES.MULTIPLE_EFFECTIVE_TIMES_UNRESOLVED,
    );
  });

  it("yields empty triad arrays for a document with no entries", () => {
    const doc = parseCcda(buildCcda());
    expect(doc.getProblems()).toEqual([]);
    expect(doc.getMedications()).toEqual([]);
    expect(doc.getAllergies()).toEqual([]);
  });
});

/**
 * The second `PRE-EXISTING` gap `#56` named and did not close: a
 * `manufacturedProduct` carrying **both** arms of the CDA R2 choice silently
 * dropped the non-`manufacturedMaterial` one. Two drugs named on one
 * medication is a contradictory document, the same shape as a `nullFlavor`
 * beside a value, and gets the same resolution: warn, withhold the reading the
 * parser would be *manufacturing*, preserve everything verbatim.
 */
describe("clinical entries, both ManufacturedProduct arms on one product", () => {
  /** Append a `manufacturedLabeledDrug` arm beside the existing material one. */
  const bothArms = (section: string, labeledCode: string): string =>
    section.replace(
      "</manufacturedMaterial>",
      `</manufacturedMaterial>
                  <manufacturedLabeledDrug>
                    <code ${labeledCode}/>
                  </manufacturedLabeledDrug>`,
    );

  // Aspirin (the RxNorm code this repo's tolerance notes already use), a
  // different concept from the fixture's Lisinopril, so the two arms genuinely
  // disagree about which drug this medication is.
  const OTHER_DRUG = 'code="1191" codeSystem="2.16.840.1.113883.6.88" displayName="Aspirin"';

  it("refuses to choose between two arms naming different drugs", () => {
    // Before: med.drug.code === "314076", the labeled arm dropped in silence.
    const doc = parseCcda(buildCcda({ sections: bothArms(MEDICATIONS_SECTION, OTHER_DRUG) }));
    const med = doc.getMedications()[0];
    expect(med).toBeDefined();
    expect(med?.drug).toBeUndefined();
    expect(codes(doc.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
    // Dose, route and timing are untouched: the entry is still read, it just
    // no longer names a drug the document did not settle on.
    expect(med?.dose?.value).toBe(10);
    expect(med?.route?.code).toBe("C38288");
  });

  it("does not also claim no arm yielded a code", () => {
    // MISSING_PRODUCT_CODE would assert something false here, and the conflict
    // warning is the stronger, more specific statement standing in its place.
    const doc = parseCcda(buildCcda({ sections: bothArms(MEDICATIONS_SECTION, OTHER_DRUG) }));
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.MISSING_PRODUCT_CODE);
  });

  it("recovers the drug when only the alternate arm names one", () => {
    // The direction the old behaviour lost data in: a nullFlavor-only material
    // arm used to win over a labeled arm naming a real RxNorm concept, and the
    // drug vanished in silence. A null value is an exceptional value, not a
    // competing one, so there is no contradiction here to refuse.
    const xml = buildCcda({
      sections: MEDICATIONS_SECTION.replace(
        '<code code="314076" codeSystem="2.16.840.1.113883.6.88" displayName="Lisinopril 10 MG Oral Tablet"/>',
        '<code nullFlavor="UNK"/>',
      ).replace(
        "</manufacturedMaterial>",
        `</manufacturedMaterial>
                  <manufacturedLabeledDrug>
                    <code code="314076" codeSystem="2.16.840.1.113883.6.88"/>
                  </manufacturedLabeledDrug>`,
      ),
    });
    const doc = parseCcda(xml);
    expect(doc.getMedications()[0]?.drug?.code).toBe("314076");
    expect(codes(doc.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_UNEXPECTED);
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
  });

  it("keeps a determinate drug when the OTHER arm asserts no symbol", () => {
    // The mirror, and the one that matters most: refusing here would discard an
    // RxNorm code the document names exactly once, and take every checkCodeSlot
    // check on it down as well.
    const doc = parseCcda(
      buildCcda({ sections: bothArms(MEDICATIONS_SECTION, 'nullFlavor="NA"') }),
    );
    expect(doc.getMedications()[0]?.drug?.code).toBe("314076");
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.MISSING_PRODUCT_CODE);
  });

  it("keeps the code-system checks alive on a second arm that names nothing", () => {
    // The regression a naive "both arms present" rule would cause: withholding
    // the product takes UNEXPECTED_CODE_SYSTEM down with it, making the parser
    // quieter about a wrong terminology, the direction this work exists to
    // reverse.
    const wrongSystem = MEDICATIONS_SECTION.replace(
      'codeSystem="2.16.840.1.113883.6.88" displayName="Lisinopril 10 MG Oral Tablet"',
      'codeSystem="2.16.840.1.113883.6.96"',
    );
    const doc = parseCcda(buildCcda({ sections: bothArms(wrongSystem, 'nullFlavor="NA"') }));
    expect(codes(doc.warnings)).toContain(WARNING_CODES.UNEXPECTED_CODE_SYSTEM);
  });

  it("flags an alternate arm that carries no code to key off", () => {
    // The presence warning keys off the ARM, so markup shape cannot decide
    // whether the deviation gets reported. (Real-world this arm usually carries
    // a <name>; the fixture omits it because the PHI scanner reads <name> as a
    // person-name token and a brand string does not belong in its allow-list.)
    const codeless = MEDICATIONS_SECTION.replace(
      "</manufacturedMaterial>",
      `</manufacturedMaterial>
                  <manufacturedLabeledDrug/>`,
    );
    const doc = parseCcda(buildCcda({ sections: codeless }));
    expect(doc.getMedications()[0]?.drug?.code).toBe("314076");
    expect(codes(doc.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_UNEXPECTED);
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
  });

  it("keeps reading the material arm when neither arm names a symbol", () => {
    // The fall-through that must NOT change: with both arms present and neither
    // naming a product, the material arm is still the one read, so the empty-slot
    // machinery sees exactly the element it saw before this rule existed. Reading
    // the labeled arm instead would drop the material arm's @codeSystem from the
    // model and take MISSING_CODE_VALUE / UNEXPECTED_CODE_SYSTEM down with it.
    const systemOnlyMaterial = MEDICATIONS_SECTION.replace(
      '<code code="314076" codeSystem="2.16.840.1.113883.6.88" displayName="Lisinopril 10 MG Oral Tablet"/>',
      '<code codeSystem="2.16.840.1.113883.6.96"/>',
    );
    const doc = parseCcda(
      buildCcda({ sections: bothArms(systemOnlyMaterial, 'nullFlavor="UNK"') }),
    );
    expect(doc.getMedications()[0]?.drug?.codeSystem).toBe("2.16.840.1.113883.6.96");
    expect(codes(doc.warnings)).toContain(WARNING_CODES.MISSING_CODE_VALUE);
    expect(codes(doc.warnings)).toContain(WARNING_CODES.UNEXPECTED_CODE_SYSTEM);
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
  });

  it("does not treat a missing codeSystem on one arm as a different product", () => {
    // Same symbol, one arm unqualified: MISSING_CODE_SYSTEM already covers that
    // shape, and withholding instead would swap a loud warning for a quiet one.
    const doc = parseCcda(buildCcda({ sections: bothArms(MEDICATIONS_SECTION, 'code="314076"') }));
    expect(doc.getMedications()[0]?.drug?.code).toBe("314076");
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
  });

  it("treats one symbol under two terminologies as a conflict", () => {
    const doc = parseCcda(
      buildCcda({
        sections: bothArms(
          MEDICATIONS_SECTION,
          'code="314076" codeSystem="2.16.840.1.113883.6.96"',
        ),
      }),
    );
    expect(doc.getMedications()[0]?.drug).toBeUndefined();
    expect(codes(doc.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
  });

  it("reads the material arm when both arms name the same product", () => {
    // Redundant, not contradictory: there is one drug here, so withholding it
    // would discard a determinate reading for no safety gain.
    const same =
      'code="314076" codeSystem="2.16.840.1.113883.6.88" displayName="Lisinopril 10 MG Oral Tablet"';
    const doc = parseCcda(buildCcda({ sections: bothArms(MEDICATIONS_SECTION, same) }));
    expect(doc.getMedications()[0]?.drug?.code).toBe("314076");
    expect(codes(doc.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_UNEXPECTED);
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.MISSING_PRODUCT_CODE);
  });

  it("loses nothing: both arms survive serialization verbatim", () => {
    // Withholding the model reading is only defensible because the document
    // itself round-trips, so a caller who needs the dropped arm can still get it.
    const doc = parseCcda(buildCcda({ sections: bothArms(MEDICATIONS_SECTION, OTHER_DRUG) }));
    const out = doc.toString();
    expect(out).toContain("manufacturedMaterial");
    expect(out).toContain("manufacturedLabeledDrug");
    expect(out).toContain('code="1191"');
    expect(out).toContain('code="314076"');
    expect(parseCcda(out).toString()).toBe(out);
  });

  it("applies the same refusal to an immunization vaccine", () => {
    // A different CVX code from the fixture's 140; no displayName is asserted,
    // the test needs only that the two arms disagree.
    const other = 'code="141" codeSystem="2.16.840.1.113883.12.292"';
    const doc = parseCcda(buildCcda({ sections: bothArms(IMMUNIZATIONS_SECTION, other) }));
    expect(doc.getImmunizations()[0]?.vaccine).toBeUndefined();
    expect(codes(doc.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.MISSING_PRODUCT_CODE);
  });

  it("applies the same refusal to a planned medication", () => {
    const doc = parseCcda(buildCcda({ sections: bothArms(PLAN_OF_TREATMENT_SECTION, OTHER_DRUG) }));
    const planned = doc.getPlannedItems().find((p) => p.kind === "medicationActivity");
    expect(planned).toBeDefined();
    expect(planned?.code).toBeUndefined();
    expect(codes(doc.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.MISSING_PRODUCT_CODE);
  });

  // The negatives, so the new refusal cannot become "no drug for anyone".
  it("stays silent on a single-arm document and unchanged on the lone alternate arm", () => {
    const clean = codes(parseCcda(buildCcda({ sections: MEDICATIONS_SECTION })).warnings);
    expect(clean).not.toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
    expect(clean).not.toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_UNEXPECTED);

    const lone = MEDICATIONS_SECTION.replace(
      "<manufacturedMaterial>",
      "<manufacturedLabeledDrug>",
    ).replace("</manufacturedMaterial>", "</manufacturedLabeledDrug>");
    const doc = parseCcda(buildCcda({ sections: lone }));
    expect(doc.getMedications()[0]?.drug?.code).toBe("314076");
    expect(codes(doc.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_UNEXPECTED);
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
  });

  it("still flags a consumable with no code on either arm", () => {
    const none = MEDICATIONS_SECTION.replace(
      /<manufacturedMaterial>[\s\S]*?<\/manufacturedMaterial>/u,
      "",
    );
    expect(codes(parseCcda(buildCcda({ sections: none })).warnings)).toContain(
      WARNING_CODES.MISSING_PRODUCT_CODE,
    );
  });
});

/**
 * The residual `#57` named and did not close: arm selection keyed on `@code`
 * alone, so a coding carried in a `<translation>` was invisible to it, and a
 * repeated arm of one kind was never compared at all. Both are the same
 * "quietly picks between two drugs" failure the conflict rule exists to refuse,
 * one level down and one arm kind in.
 */
describe("clinical entries, arm disagreement through <translation> and repeated arms", () => {
  const RXNORM = "2.16.840.1.113883.6.88";
  const NDC = "2.16.840.1.113883.6.69";
  /** Aspirin, the RxNorm code this repo's tolerance notes already use. */
  const ASPIRIN = "1191";
  /** The fixture's drug, Lisinopril 10 MG Oral Tablet. */
  const LISINOPRIL = "314076";
  /** Lisinopril 20 MG Oral Tablet: a different strength, so a different product. */
  const LISINOPRIL_20MG = "314077";
  /** The lisinopril INGREDIENT concept, coarser than either strength above. */
  const LISINOPRIL_INGREDIENT = "29046";
  const MATERIAL_CODE = `<code code="${LISINOPRIL}" codeSystem="${RXNORM}" displayName="Lisinopril 10 MG Oral Tablet"/>`;
  // Structurally valid NDC-shaped placeholders. They are deliberately
  // all-zero/all-one rather than a real labeler-product-package triple: the
  // tests need two codings that are distinct and are not each other, and a real
  // NDC would assert a product this repo has no de-identified document for.
  const NDC_ONE = "00000-0000-00";
  const NDC_TWO = "00000-0000-11";

  /** Append a `manufacturedLabeledDrug` arm carrying the given `<code>` markup. */
  const withLabeledArm = (section: string, codeXml: string): string =>
    section.replace(
      "</manufacturedMaterial>",
      `</manufacturedMaterial>
                  <manufacturedLabeledDrug>
                    ${codeXml}
                  </manufacturedLabeledDrug>`,
    );

  /** Append a SECOND `manufacturedMaterial` arm carrying the given `<code>` markup. */
  const withSecondMaterial = (section: string, codeXml: string): string =>
    section.replace(
      "</manufacturedMaterial>",
      `</manufacturedMaterial>
                  <manufacturedMaterial>
                    ${codeXml}
                  </manufacturedMaterial>`,
    );

  /** Replace the medications fixture's material `<code>` with the given markup. */
  const materialCode = (codeXml: string): string =>
    MEDICATIONS_SECTION.replace(MATERIAL_CODE, codeXml);

  /**
   * Append a SECOND `<code>` inside the fixture's single `manufacturedMaterial`
   * arm, beside the one already there. One arm, two `<code>` children, which is
   * the shape `armCodes` used to read only the first of.
   */
  const withSecondCode = (section: string, codeXml: string): string =>
    section.replace(MATERIAL_CODE, `${MATERIAL_CODE}${codeXml}`);

  it("refuses when a null-marked labeled arm names a different drug in its translation", () => {
    // The item's shape: nullFlavor="OTH" plus <translation> is the documented
    // C-CDA idiom for "not codable in the bound value set, here is an alternate
    // coding", so this arm names Aspirin. Before, it named nothing, and the
    // material arm's Lisinopril was selected in silence.
    const doc = parseCcda(
      buildCcda({
        sections: withLabeledArm(
          MEDICATIONS_SECTION,
          `<code nullFlavor="OTH"><translation code="${ASPIRIN}" codeSystem="${RXNORM}"/></code>`,
        ),
      }),
    );
    expect(doc.getMedications()[0]?.drug).toBeUndefined();
    expect(codes(doc.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.MISSING_PRODUCT_CODE);
    // The idiom itself stays coherent: a translation beside a nullFlavor
    // describes the null value rather than contradicting it.
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.CONTRADICTORY_NULL_FLAVOR);
  });

  it("refuses in the mirror direction, when the MATERIAL arm translates to another drug", () => {
    const doc = parseCcda(
      buildCcda({
        sections: withLabeledArm(
          materialCode(
            `<code nullFlavor="OTH"><translation code="${ASPIRIN}" codeSystem="${RXNORM}"/></code>`,
          ),
          `<code code="${LISINOPRIL}" codeSystem="${RXNORM}"/>`,
        ),
      }),
    );
    expect(doc.getMedications()[0]?.drug).toBeUndefined();
    expect(codes(doc.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
  });

  it("never lets a shared translation talk two asserted primaries out of a conflict", () => {
    // The unsound direction, pinned so it cannot be reintroduced. A translation
    // shared by both arms is routinely COARSER than either primary (an RxNorm
    // ingredient, a local formulary id, an NDC spanning presentations), so
    // reading A = Z and B = Z as A = B is a transitive closure the document
    // never wrote. Here both arms translate to the lisinopril ingredient while
    // naming two different strengths: agreeing would hand back one strength of
    // a document that names two.
    const doc = parseCcda(
      buildCcda({
        sections: withLabeledArm(
          materialCode(
            `<code code="${LISINOPRIL}" codeSystem="${RXNORM}"><translation code="${LISINOPRIL_INGREDIENT}" codeSystem="${RXNORM}"/></code>`,
          ),
          `<code code="${LISINOPRIL_20MG}" codeSystem="${RXNORM}"><translation code="${LISINOPRIL_INGREDIENT}" codeSystem="${RXNORM}"/></code>`,
        ),
      }),
    );
    expect(doc.getMedications()[0]?.drug).toBeUndefined();
    expect(codes(doc.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
  });

  it("compares two asserted primaries exactly as it did before translations were read", () => {
    // The other half of the same guarantee: an arm that asserts a symbol is
    // compared on that symbol, so a translation can never suppress a
    // disagreement and can never invent one either. Same primary on both arms,
    // one of them carrying an unrelated alternate: still silent.
    const doc = parseCcda(
      buildCcda({
        sections: withLabeledArm(
          materialCode(
            `<code code="${LISINOPRIL}" codeSystem="${RXNORM}"><translation code="${NDC_ONE}" codeSystem="${NDC}"/></code>`,
          ),
          `<code code="${LISINOPRIL}" codeSystem="${RXNORM}"/>`,
        ),
      }),
    );
    expect(doc.getMedications()[0]?.drug?.code).toBe(LISINOPRIL);
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
  });

  it("does not refuse when a null-marked arm translates to the SAME drug", () => {
    const doc = parseCcda(
      buildCcda({
        sections: withLabeledArm(
          MEDICATIONS_SECTION,
          `<code nullFlavor="OTH"><translation code="${LISINOPRIL}" codeSystem="${RXNORM}"/></code>`,
        ),
      }),
    );
    expect(doc.getMedications()[0]?.drug?.code).toBe(LISINOPRIL);
    expect(codes(doc.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_UNEXPECTED);
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
  });

  it("still refuses when both arms translate, but to different concepts", () => {
    // The rule is not "any translation buys agreement": the coding sets have to
    // actually intersect.
    const doc = parseCcda(
      buildCcda({
        sections: withLabeledArm(
          materialCode(
            `<code code="${LISINOPRIL}" codeSystem="${RXNORM}"><translation code="${NDC_ONE}" codeSystem="${NDC}"/></code>`,
          ),
          `<code code="${ASPIRIN}" codeSystem="${RXNORM}"><translation code="${NDC_TWO}" codeSystem="${NDC}"/></code>`,
        ),
      }),
    );
    expect(doc.getMedications()[0]?.drug).toBeUndefined();
    expect(codes(doc.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
  });

  it("does not select a product out of a translation", () => {
    // Neither arm's PRIMARY coding names a product, so there is nothing to
    // conflict about and nothing selectable. The material arm is read exactly as
    // it was before this rule existed, translation or no translation: selecting
    // the labeled arm would hand checkCodeSlot a nullFlavor primary and validate
    // nothing at all.
    const doc = parseCcda(
      buildCcda({
        sections: withLabeledArm(
          materialCode(`<code nullFlavor="UNK"/>`),
          `<code nullFlavor="OTH"><translation code="${LISINOPRIL}" codeSystem="${RXNORM}"/></code>`,
        ),
      }),
    );
    expect(doc.getMedications()[0]?.drug?.code).toBeUndefined();
    expect(doc.getMedications()[0]?.drug?.nullFlavor).toBe("UNK");
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
  });

  it("refuses between two sibling manufacturedMaterial arms naming different drugs", () => {
    // Before: the first material arm was read and the second dropped without a
    // word. #57's fix compared material against labeled only, so one arm kind
    // repeated slipped past it.
    const doc = parseCcda(
      buildCcda({
        sections: withSecondMaterial(
          MEDICATIONS_SECTION,
          `<code code="${ASPIRIN}" codeSystem="${RXNORM}"/>`,
        ),
      }),
    );
    expect(doc.getMedications()[0]?.drug).toBeUndefined();
    expect(codes(doc.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.MISSING_PRODUCT_CODE);
    // No labeled arm is present, so the presence warning must stay quiet.
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_UNEXPECTED);
  });

  it("reads the sibling material arm that names a product when the first names none", () => {
    // The same rule already applied ACROSS arm kinds, applied within one: with
    // only one arm naming a product the pick is the document's, not the
    // parser's. Before, the first arm won unconditionally, so a null-marked
    // first sibling dropped a drug the document named exactly once, and it
    // dropped it in complete silence, with no warning of any kind.
    const doc = parseCcda(
      buildCcda({
        sections: withSecondMaterial(
          materialCode(`<code nullFlavor="UNK"/>`),
          `<code code="${ASPIRIN}" codeSystem="${RXNORM}"/>`,
        ),
      }),
    );
    expect(doc.getMedications()[0]?.drug?.code).toBe(ASPIRIN);
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.MISSING_PRODUCT_CODE);
  });

  it("keeps reading the first sibling material arm when neither names a product", () => {
    // The fall-through that must not move: the empty-slot machinery has to keep
    // seeing the element it always saw.
    const doc = parseCcda(
      buildCcda({
        sections: withSecondMaterial(
          materialCode(`<code codeSystem="2.16.840.1.113883.6.96"/>`),
          `<code nullFlavor="UNK"/>`,
        ),
      }),
    );
    expect(doc.getMedications()[0]?.drug?.codeSystem).toBe("2.16.840.1.113883.6.96");
    expect(codes(doc.warnings)).toContain(WARNING_CODES.MISSING_CODE_VALUE);
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
  });

  it("reads the first of two sibling material arms that agree", () => {
    const doc = parseCcda(
      buildCcda({
        sections: withSecondMaterial(
          MEDICATIONS_SECTION,
          `<code code="${LISINOPRIL}" codeSystem="${RXNORM}"/>`,
        ),
      }),
    );
    expect(doc.getMedications()[0]?.drug?.code).toBe(LISINOPRIL);
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
  });

  it("applies the repeated-arm refusal to an immunization vaccine", () => {
    // A different CVX code from the fixture's 140; the test needs only that the
    // two material arms disagree.
    const doc = parseCcda(
      buildCcda({
        sections: withSecondMaterial(
          IMMUNIZATIONS_SECTION,
          '<code code="141" codeSystem="2.16.840.1.113883.12.292"/>',
        ),
      }),
    );
    expect(doc.getImmunizations()[0]?.vaccine).toBeUndefined();
    expect(codes(doc.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.MISSING_PRODUCT_CODE);
  });

  it("applies the translation refusal to a planned medication", () => {
    const doc = parseCcda(
      buildCcda({
        sections: withLabeledArm(
          PLAN_OF_TREATMENT_SECTION,
          `<code nullFlavor="OTH"><translation code="${ASPIRIN}" codeSystem="${RXNORM}"/></code>`,
        ),
      }),
    );
    const planned = doc.getPlannedItems().find((p) => p.kind === "medicationActivity");
    expect(planned).toBeDefined();
    expect(planned?.code).toBeUndefined();
    expect(codes(doc.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
  });

  it("loses nothing: a translated arm and a repeated arm both round-trip verbatim", () => {
    const translated = parseCcda(
      buildCcda({
        sections: withLabeledArm(
          MEDICATIONS_SECTION,
          `<code nullFlavor="OTH"><translation code="${ASPIRIN}" codeSystem="${RXNORM}"/></code>`,
        ),
      }),
    );
    const out = translated.toString();
    expect(out).toContain("translation");
    expect(out).toContain(`code="${ASPIRIN}"`);
    expect(out).toContain(`code="${LISINOPRIL}"`);
    expect(parseCcda(out).toString()).toBe(out);

    const repeated = parseCcda(
      buildCcda({
        sections: withSecondMaterial(
          MEDICATIONS_SECTION,
          `<code code="${ASPIRIN}" codeSystem="${RXNORM}"/>`,
        ),
      }),
    );
    const repeatedOut = repeated.toString();
    expect(repeatedOut).toContain(`code="${ASPIRIN}"`);
    expect(repeatedOut).toContain(`code="${LISINOPRIL}"`);
    expect(parseCcda(repeatedOut).toString()).toBe(repeatedOut);
  });

  it("keeps a safety-critical companion beside the presence warning when nothing is selected", () => {
    // Pins the argument that lets MEDICATION_PRODUCT_ARM_UNEXPECTED stay out of
    // SAFETY_CRITICAL_CODES. A name-only manufacturedLabeledDrug selects
    // nothing, and the companion here is MISSING_PRODUCT_CODE rather than the
    // conflict code, so the argument has to name both: naming only the conflict
    // code leaves exactly this state unaccounted for.
    const nameOnly = MEDICATIONS_SECTION.replace(
      /<manufacturedMaterial>[\s\S]*?<\/manufacturedMaterial>/u,
      "<manufacturedLabeledDrug/>",
    );
    const warned = codes(parseCcda(buildCcda({ sections: nameOnly })).warnings);
    expect(warned).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_UNEXPECTED);
    expect(warned).toContain(WARNING_CODES.MISSING_PRODUCT_CODE);
    expect(warned).not.toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
  });

  it("does not let a separator inside a code collapse two disagreeing arms", () => {
    // The arms are deduped before the pairwise comparison, so the key has to be
    // injective. With a delimiter-joined key, `code="1191|"` and
    // `code="1191" codeSystem="…"` could collide and one arm's disagreement
    // would be discarded silently.
    const doc = parseCcda(
      buildCcda({
        sections: withSecondMaterial(
          materialCode(`<code code="${ASPIRIN}|${RXNORM}"/>`),
          `<code code="${ASPIRIN}" codeSystem="${RXNORM}|"/>`,
        ),
      }),
    );
    expect(doc.getMedications()[0]?.drug).toBeUndefined();
    expect(codes(doc.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
  });

  /**
   * The residuals `#58` named and did not close. Two of them are the same
   * silence one layer apart: a product the document names in a `<translation>`
   * came back as an empty product slot with no warning of any kind, and a
   * repeated arm that agreed was absorbed into one with nothing said. The third
   * is the pass-1 blocker's rule applied to the one shape it did not reach,
   * two arms that BOTH fall back to translations.
   */
  describe("residuals: an unreported translation-only product, and unreported cardinality", () => {
    it("says so when a SINGLE arm names its product only in a translation", () => {
      // The residual exactly: nullFlavor="OTH" plus <translation> is the C-CDA
      // idiom for "not codable in the bound value set, here is an alternate
      // coding", so this document DOES name a drug. Selection reads primaries
      // only (deliberately, and unchanged), so `drug.code` is undefined while
      // the coding survives on the translation list. Before, that happened in
      // total silence: MISSING_PRODUCT_CODE cannot fire because an arm did
      // carry a <code>, and checkCodeSlot is quiet by design on a
      // nullFlavor-only slot.
      const doc = parseCcda(
        buildCcda({
          sections: materialCode(
            `<code nullFlavor="OTH"><translation code="${LISINOPRIL}" codeSystem="${RXNORM}"/></code>`,
          ),
        }),
      );
      const drug = doc.getMedications()[0]?.drug;
      expect(drug?.code).toBeUndefined();
      expect(drug?.nullFlavor).toBe("OTH");
      expect(drug?.translation?.[0]?.code).toBe(LISINOPRIL);
      const warned = codes(doc.warnings);
      expect(warned).toContain(WARNING_CODES.MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY);
      // The more specific statement, so neither of the older ones may claim it.
      expect(warned).not.toContain(WARNING_CODES.MISSING_PRODUCT_CODE);
      expect(warned).not.toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
      // The idiom stays coherent: a translation beside a nullFlavor describes
      // the null value rather than contradicting it.
      expect(warned).not.toContain(WARNING_CODES.CONTRADICTORY_NULL_FLAVOR);
      // Nothing is invented in the product position, and nothing is lost.
      expect(doc.toString()).toContain(`code="${LISINOPRIL}"`);
    });

    it("says so when the translated arm is the one NOT selected", () => {
      // Two arms, neither asserting a primary. The material arm is read exactly
      // as before, so `drug` is its nullFlavor="UNK" CD, and the labeled arm's
      // translated drug would otherwise vanish without a word.
      const doc = parseCcda(
        buildCcda({
          sections: withLabeledArm(
            materialCode(`<code nullFlavor="UNK"/>`),
            `<code nullFlavor="OTH"><translation code="${LISINOPRIL}" codeSystem="${RXNORM}"/></code>`,
          ),
        }),
      );
      const drug = doc.getMedications()[0]?.drug;
      expect(drug?.nullFlavor).toBe("UNK");
      // ONLY ONE ARM EVER BECOMES THE RETURNED CD. Here it is the arm without
      // the translation, so the coding is NOT on the model. A warning that told
      // the reader to look at `drug.translation` would send them to nothing and
      // let them conclude the medication has no drug, which is precisely what it
      // is raised to prevent, so it has to say where the coding actually is.
      expect(drug?.translation).toBeUndefined();
      const warning = doc.warnings.find(
        (w) => w.code === WARNING_CODES.MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY,
      );
      expect(warning).toBeDefined();
      expect(warning?.message).toContain("not the one returned as the product CD");
      expect(warning?.message).not.toContain("translation list");
    });

    it("positions the warning on the <code> that carries the translation", () => {
      // Not on the selected element: with two arms neither asserting a primary
      // the selected one may be the arm that does not hold the coding, and a
      // position pointing there is the same false direction as a wrong message.
      const sections = withLabeledArm(
        materialCode(`<code nullFlavor="UNK"/>`),
        `<code nullFlavor="OTH"><translation code="${LISINOPRIL}" codeSystem="${RXNORM}"/></code>`,
      );
      const xml = buildCcda({ sections });
      const doc = parseCcda(xml);
      const warning = doc.warnings.find(
        (w) => w.code === WARNING_CODES.MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY,
      );
      const lines = xml.split("\n");
      const pointedAt = lines[(warning?.position.line ?? 0) - 1] ?? "";
      expect(pointedAt).toContain(`translation code="${LISINOPRIL}"`);
    });

    it("points at the returned CD, and says so, when the translated arm IS selected", () => {
      const doc = parseCcda(
        buildCcda({
          sections: materialCode(
            `<code nullFlavor="OTH"><translation code="${LISINOPRIL}" codeSystem="${RXNORM}"/></code>`,
          ),
        }),
      );
      const warning = doc.warnings.find(
        (w) => w.code === WARNING_CODES.MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY,
      );
      expect(warning?.message).toContain("translation list");
      expect(doc.getMedications()[0]?.drug?.translation?.[0]?.code).toBe(LISINOPRIL);
    });

    it("does not claim to be the lone signal where MISSING_CODE_VALUE fires with it", () => {
      // A <code> carrying a translation but asserting neither a symbol nor a
      // nullFlavor is not the documented idiom: it is the empty coded slot
      // MISSING_CODE_VALUE was scoped around, and both fire. The classification
      // does not rest on being alone here, because that companion is itself
      // safety-critical.
      const warned = codes(
        parseCcda(
          buildCcda({
            sections: materialCode(
              `<code><translation code="${LISINOPRIL}" codeSystem="${RXNORM}"/></code>`,
            ),
          }),
        ).warnings,
      );
      expect(warned).toContain(WARNING_CODES.MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY);
      expect(warned).toContain(WARNING_CODES.MISSING_CODE_VALUE);
    });

    it("stays quiet whenever an arm does assert a primary code", () => {
      // The negative that keeps the new code from becoming ambient noise: a
      // translation beside an asserted primary is ordinary, and the primary is
      // selected and slot-checked as always.
      const plain = codes(parseCcda(buildCcda({ sections: MEDICATIONS_SECTION })).warnings);
      expect(plain).not.toContain(WARNING_CODES.MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY);
      const withAlternate = codes(
        parseCcda(
          buildCcda({
            sections: materialCode(
              `<code code="${LISINOPRIL}" codeSystem="${RXNORM}"><translation code="${NDC_ONE}" codeSystem="${NDC}"/></code>`,
            ),
          }),
        ).warnings,
      );
      expect(withAlternate).not.toContain(WARNING_CODES.MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY);
    });

    it("stands down behind a conflict, and behind an outright missing product", () => {
      // Both suppressions MISSING_PRODUCT_CODE already makes, for the same
      // reason: the stronger statement is the lone signal on its shape.
      const conflicted = codes(
        parseCcda(
          buildCcda({
            sections: withLabeledArm(
              materialCode(
                `<code nullFlavor="OTH"><translation code="${ASPIRIN}" codeSystem="${RXNORM}"/></code>`,
              ),
              `<code code="${LISINOPRIL}" codeSystem="${RXNORM}"/>`,
            ),
          }),
        ).warnings,
      );
      expect(conflicted).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
      expect(conflicted).not.toContain(WARNING_CODES.MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY);

      // No <code> on any arm: there is no translation to report either.
      const nameOnly = codes(
        parseCcda(
          buildCcda({
            sections: MEDICATIONS_SECTION.replace(
              /<manufacturedMaterial>[\s\S]*?<\/manufacturedMaterial>/u,
              "<manufacturedLabeledDrug/>",
            ),
          }),
        ).warnings,
      );
      expect(nameOnly).toContain(WARNING_CODES.MISSING_PRODUCT_CODE);
      expect(nameOnly).not.toContain(WARNING_CODES.MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY);

      // A nullFlavor-only arm with no translation names nothing at all. That is
      // a complete statement ("unknown"), not a coding the parser declined to
      // read, so this code must stay quiet on it.
      const unknownOnly = codes(
        parseCcda(buildCcda({ sections: materialCode(`<code nullFlavor="UNK"/>`) })).warnings,
      );
      expect(unknownOnly).not.toContain(WARNING_CODES.MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY);
    });

    it("reports a translation-only vaccine and a translation-only planned drug", () => {
      // Same three consumable call sites the rest of this area covers.
      const immunization = parseCcda(
        buildCcda({
          sections: IMMUNIZATIONS_SECTION.replace(
            /<code code="140"[^/]*\/>/u,
            `<code nullFlavor="OTH"><translation code="141" codeSystem="2.16.840.1.113883.12.292"/></code>`,
          ),
        }),
      );
      expect(immunization.getImmunizations()[0]?.vaccine?.code).toBeUndefined();
      expect(codes(immunization.warnings)).toContain(
        WARNING_CODES.MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY,
      );

      const planned = parseCcda(
        buildCcda({
          sections: withLabeledArm(
            PLAN_OF_TREATMENT_SECTION,
            `<code nullFlavor="OTH"><translation code="${LISINOPRIL}" codeSystem="${RXNORM}"/></code>`,
          ).replace(MATERIAL_CODE, `<code nullFlavor="UNK"/>`),
        }),
      );
      expect(codes(planned.warnings)).toContain(
        WARNING_CODES.MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY,
      );
    });

    it("reports a repeated arm that AGREES, which used to be absorbed in silence", () => {
      // The residual: three assertions of one product read identically to one.
      // The drug is still read, the repeat is a structural fact reported beside
      // it rather than a reason to withhold.
      const doc = parseCcda(
        buildCcda({
          sections: withSecondMaterial(
            MEDICATIONS_SECTION,
            `<code code="${LISINOPRIL}" codeSystem="${RXNORM}"/>`,
          ),
        }),
      );
      expect(doc.getMedications()[0]?.drug?.code).toBe(LISINOPRIL);
      const warned = codes(doc.warnings);
      expect(warned).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_REPEATED);
      expect(warned).not.toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
      expect(warned).not.toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_UNEXPECTED);
    });

    it("counts arms rather than codings, so a repeat with no <code> is reported too", () => {
      const doc = parseCcda(buildCcda({ sections: withSecondMaterial(MEDICATIONS_SECTION, "") }));
      expect(doc.getMedications()[0]?.drug?.code).toBe(LISINOPRIL);
      expect(codes(doc.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_REPEATED);
    });

    it("reports a repeated labeled arm, and fires beside a conflict rather than instead of it", () => {
      const twoLabeled = withLabeledArm(
        withLabeledArm(MEDICATIONS_SECTION, `<code code="${ASPIRIN}" codeSystem="${RXNORM}"/>`),
        `<code code="${ASPIRIN}" codeSystem="${RXNORM}"/>`,
      );
      const warned = codes(parseCcda(buildCcda({ sections: twoLabeled })).warnings);
      expect(warned).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_REPEATED);
      expect(warned).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_UNEXPECTED);
      // The material arm names lisinopril and the labeled ones name aspirin, so
      // cardinality and disagreement are reported as the separate facts they are.
      expect(warned).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
    });

    it("does not call one arm of each kind a repeat", () => {
      // Cardinality is per arm kind: two kinds is the choice being violated in
      // the other direction, which MEDICATION_PRODUCT_ARM_UNEXPECTED reports.
      const warned = codes(
        parseCcda(
          buildCcda({
            sections: withLabeledArm(
              MEDICATIONS_SECTION,
              `<code code="${LISINOPRIL}" codeSystem="${RXNORM}"/>`,
            ),
          }),
        ).warnings,
      );
      expect(warned).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_UNEXPECTED);
      expect(warned).not.toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_REPEATED);
      expect(codes(parseCcda(buildCcda({ sections: MEDICATIONS_SECTION })).warnings)).not.toContain(
        WARNING_CODES.MEDICATION_PRODUCT_ARM_REPEATED,
      );
    });

    it("refuses two translation-only arms that share only a coarser coding", () => {
      // The pass-1 blocker's shape, in the one place its rule did not reach.
      // Both primaries are uncodable, so both arms fall back to translations,
      // and the old "some coding agrees" test let a shared INGREDIENT concept
      // hold together two arms naming two different strengths. Nothing
      // selectable comes out of this shape either way, so the whole difference
      // is whether the contradiction is reported.
      const doc = parseCcda(
        buildCcda({
          sections: withLabeledArm(
            materialCode(
              `<code nullFlavor="OTH"><translation code="${LISINOPRIL_INGREDIENT}" codeSystem="${RXNORM}"/><translation code="${LISINOPRIL}" codeSystem="${RXNORM}"/></code>`,
            ),
            `<code nullFlavor="OTH"><translation code="${LISINOPRIL_INGREDIENT}" codeSystem="${RXNORM}"/><translation code="${LISINOPRIL_20MG}" codeSystem="${RXNORM}"/></code>`,
          ),
        }),
      );
      expect(doc.getMedications()[0]?.drug).toBeUndefined();
      expect(codes(doc.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
    });

    it("does not refuse two translation-only arms that offer the same codings", () => {
      // The other side of the same rule: the stricter comparison must not turn
      // a redundant arm into a withheld drug.
      const doc = parseCcda(
        buildCcda({
          sections: withLabeledArm(
            materialCode(
              `<code nullFlavor="OTH"><translation code="${LISINOPRIL}" codeSystem="${RXNORM}"/></code>`,
            ),
            `<code nullFlavor="OTH"><translation code="${LISINOPRIL}" codeSystem="${RXNORM}"/></code>`,
          ),
        }),
      );
      expect(codes(doc.warnings)).not.toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
      expect(codes(doc.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY);
    });

    it("treats an extra alternate on one arm as elaboration, not as a denial", () => {
      // The boundary of the stricter rule, and the reason it is not set
      // coverage. HL7 v3 defines CD.translation as codings of THIS concept in
      // other code systems, so an arm that also offers an NDC beside the RxNorm
      // concept both arms share is elaborating its own concept; the other arm
      // staying quiet about that terminology denies nothing. Requiring the sets
      // to cover each other drew an unquietable safety-critical code on a
      // coherent document, which is a real harm of its own: it withholds a
      // reading and trains a reader to discount the code.
      const doc = parseCcda(
        buildCcda({
          sections: withLabeledArm(
            materialCode(
              `<code nullFlavor="OTH"><translation code="${LISINOPRIL}" codeSystem="${RXNORM}"/><translation code="${NDC_ONE}" codeSystem="${NDC}"/></code>`,
            ),
            `<code nullFlavor="OTH"><translation code="${LISINOPRIL}" codeSystem="${RXNORM}"/></code>`,
          ),
        }),
      );
      expect(codes(doc.warnings)).not.toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
      expect(codes(doc.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY);
    });

    it("withholds a primary-asserting arm's code when two fallback arms disagree behind it", () => {
      // What "fires more" COSTS, pinned so nobody can restate the invariant as
      // "no product code stops being reported". Firing more means withholding
      // more: the document names one product in a primary and two others in
      // translations, and the parser now declines to pick rather than answering
      // from the arm that happens to assert a symbol.
      const sections = withLabeledArm(
        withSecondMaterial(
          materialCode(`<code code="${LISINOPRIL_INGREDIENT}" codeSystem="${RXNORM}"/>`),
          `<code nullFlavor="OTH"><translation code="${LISINOPRIL_INGREDIENT}" codeSystem="${RXNORM}"/><translation code="${LISINOPRIL}" codeSystem="${RXNORM}"/></code>`,
        ),
        `<code nullFlavor="OTH"><translation code="${LISINOPRIL_INGREDIENT}" codeSystem="${RXNORM}"/><translation code="${LISINOPRIL_20MG}" codeSystem="${RXNORM}"/></code>`,
      );
      const doc = parseCcda(buildCcda({ sections }));
      expect(doc.getMedications()[0]?.drug).toBeUndefined();
      expect(codes(doc.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
      // Withheld, never lost: every arm is still in the serialized document.
      const out = doc.toString();
      expect(out).toContain(`code="${LISINOPRIL}"`);
      expect(out).toContain(`code="${LISINOPRIL_20MG}"`);
    });

    it("never tells a reader the coding is at translation[0]", () => {
      // The remediation trap: `drug.translation[0]` is NOT reliably the coding
      // the warning is about. A <code> may carry several <translation>s, and
      // the first can be nullFlavor-marked or in a code system the reader did
      // not want, so a doc or message that says "[0]" sends them either to
      // nothing or to the wrong code system, silently.
      const nullFirst = parseCcda(
        buildCcda({
          sections: materialCode(
            `<code nullFlavor="OTH"><translation nullFlavor="NA"/><translation code="${LISINOPRIL}" codeSystem="${RXNORM}"/></code>`,
          ),
        }),
      );
      const nullFirstDrug = nullFirst.getMedications()[0]?.drug;
      expect(nullFirstDrug?.translation?.[0]?.code).toBeUndefined();
      expect(nullFirstDrug?.translation?.some((t) => t.code === LISINOPRIL)).toBe(true);
      expect(codes(nullFirst.warnings)).toContain(
        WARNING_CODES.MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY,
      );

      const otherSystemFirst = parseCcda(
        buildCcda({
          sections: materialCode(
            `<code nullFlavor="OTH"><translation code="${NDC_ONE}" codeSystem="${NDC}"/><translation code="${LISINOPRIL}" codeSystem="${RXNORM}"/></code>`,
          ),
        }),
      );
      // [0] is an NDC here, not the RxNorm product concept a reader wants.
      expect(otherSystemFirst.getMedications()[0]?.drug?.translation?.[0]?.codeSystem).toBe(NDC);

      // So the message must direct at the LIST, never at an index.
      const message = otherSystemFirst.warnings.find(
        (w) => w.code === WARNING_CODES.MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY,
      )?.message;
      expect(message).toContain("translation list");
      expect(message).not.toContain("[0]");
    });

    it("does not invent a disagreement out of two different code systems", () => {
      // The unshared codings here are an NDC on one side and an NDC on the
      // other, in the same system, so they DO conflict; the same shapes across
      // two systems must not, because deciding whether an NDC and an RxNorm
      // concept denote one product is terminology work, not parsing.
      const sameSystem = parseCcda(
        buildCcda({
          sections: withLabeledArm(
            materialCode(
              `<code nullFlavor="OTH"><translation code="${LISINOPRIL}" codeSystem="${RXNORM}"/><translation code="${NDC_ONE}" codeSystem="${NDC}"/></code>`,
            ),
            `<code nullFlavor="OTH"><translation code="${LISINOPRIL}" codeSystem="${RXNORM}"/><translation code="${NDC_TWO}" codeSystem="${NDC}"/></code>`,
          ),
        }),
      );
      expect(codes(sameSystem.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);

      const acrossSystems = parseCcda(
        buildCcda({
          sections: withLabeledArm(
            materialCode(
              `<code nullFlavor="OTH"><translation code="${LISINOPRIL_INGREDIENT}" codeSystem="${RXNORM}"/><translation code="${NDC_ONE}" codeSystem="${NDC}"/></code>`,
            ),
            `<code nullFlavor="OTH"><translation code="${LISINOPRIL_INGREDIENT}" codeSystem="${RXNORM}"/><translation code="${LISINOPRIL}" codeSystem="${RXNORM}"/></code>`,
          ),
        }),
      );
      // The unshared pair here is an NDC against an RxNorm code: incomparable,
      // so no conflict is manufactured out of it.
      expect(codes(acrossSystems.warnings)).not.toContain(
        WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT,
      );
    });

    it("keeps a translation-derived arm agreeing with the primary it names", () => {
      // The mixed case is deliberately NOT tightened: the fallback arm asserts,
      // in the document's own words, that its concept is coded by exactly the
      // symbol the other arm leads with. That is the document linking the arms
      // directly, not through a shared third code.
      const doc = parseCcda(
        buildCcda({
          sections: withLabeledArm(
            MEDICATIONS_SECTION,
            `<code nullFlavor="OTH"><translation code="${LISINOPRIL_INGREDIENT}" codeSystem="${RXNORM}"/><translation code="${LISINOPRIL}" codeSystem="${RXNORM}"/></code>`,
          ),
        }),
      );
      expect(doc.getMedications()[0]?.drug?.code).toBe(LISINOPRIL);
      expect(codes(doc.warnings)).not.toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
    });

    /**
     * `CCDA-ARM-MULTI-CODE`. The residual `#62`'s refuters found and confirmed
     * `PRE-EXISTING`: `armCodes` read only the FIRST `<code>` per arm, so an arm
     * carrying two had its second never compared and never mentioned. Same harm
     * class as the rest of this area, a silent pick between two products, one
     * markup layer further in than the repeated arm.
     */
    it("refuses between two sibling <code>s inside ONE manufacturedMaterial arm", () => {
      // The defect, reproduced: before this, the parser handed back Lisinopril
      // and said NOTHING about the Aspirin beside it. Not a MEDICATION_PRODUCT_*
      // warning of any kind: MEDICATION_PRODUCT_ARM_REPEATED cannot fire (one
      // arm), MEDICATION_PRODUCT_ARM_UNEXPECTED cannot fire (the material arm),
      // and the second <code> never reached the conflict rule at all.
      const doc = parseCcda(
        buildCcda({
          sections: withSecondCode(
            MEDICATIONS_SECTION,
            `<code code="${ASPIRIN}" codeSystem="${RXNORM}"/>`,
          ),
        }),
      );
      expect(doc.getMedications()[0]?.drug).toBeUndefined();
      expect(codes(doc.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
      expect(codes(doc.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_CODE_REPEATED);
      // The conflict is the stronger statement about the same slot, so the
      // "no arm yielded a code" backstop stays suppressed behind it.
      expect(codes(doc.warnings)).not.toContain(WARNING_CODES.MISSING_PRODUCT_CODE);
    });

    it("refuses the same way inside one manufacturedLabeledDrug arm", () => {
      const doc = parseCcda(
        buildCcda({
          sections: MEDICATIONS_SECTION.replace(
            /<manufacturedMaterial>[\s\S]*?<\/manufacturedMaterial>/u,
            `<manufacturedLabeledDrug>
               <code code="${LISINOPRIL}" codeSystem="${RXNORM}"/>
               <code code="${ASPIRIN}" codeSystem="${RXNORM}"/>
             </manufacturedLabeledDrug>`,
          ),
        }),
      );
      expect(doc.getMedications()[0]?.drug).toBeUndefined();
      expect(codes(doc.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
      expect(codes(doc.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_CODE_REPEATED);
    });

    it("does not let a second <code> re-decide what is READ, and is untolerable where that loses a drug", () => {
      // The state that decides the classification. The arm's lead <code>
      // asserts a nullFlavor and its sibling names a drug. Selection stays on
      // the lead one deliberately, so the product slot comes back empty over a
      // document that names the drug one element along, and NOTHING else can
      // fire: MISSING_PRODUCT_CODE cannot (a <code> exists), the conflict rule
      // cannot (an exceptional value is not a rival drug), and checkCodeSlot is
      // quiet by design on a nullFlavor-only slot. That is
      // MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY's harm with a sibling <code> in
      // place of a <translation>, so this code is the lone signal here and must
      // be unquietable.
      const doc = parseCcda(
        buildCcda({
          sections: materialCode(
            `<code nullFlavor="UNK"/><code code="${ASPIRIN}" codeSystem="${RXNORM}"/>`,
          ),
        }),
      );
      expect(doc.getMedications()[0]?.drug?.code).toBeUndefined();
      expect(doc.getMedications()[0]?.drug?.nullFlavor).toBe("UNK");
      expect(codes(doc.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_CODE_REPEATED);
      expect(codes(doc.warnings)).not.toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
      // The drug is not lost, only unselected: it round-trips verbatim.
      expect(doc.toString()).toContain(`code="${ASPIRIN}"`);
    });

    it("keeps every safety-critical signal the LEAD <code> used to draw", () => {
      // The regression this design exists to avoid. Selecting a newly-visible
      // sibling would move the pick EARLIER in document order onto a
      // completeness-blind match, and take with it whatever the displaced
      // element was drawing. Both shapes below name one symbol throughout, so
      // nothing about the drug is in doubt; what is at stake is the guard.
      //
      // 1. An empty <code/> is what MISSING_CODE_VALUE is scoped to.
      const emptyLead = parseCcda(
        buildCcda({
          sections: materialCode(`<code/><code code="${ASPIRIN}" codeSystem="${RXNORM}"/>`),
        }),
      );
      expect(codes(emptyLead.warnings)).toContain(WARNING_CODES.MISSING_CODE_VALUE);
      expect(codes(emptyLead.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_CODE_REPEATED);
      // 2. CODE_NARRATIVE_MISMATCH reads the selected element's displayName, so
      // a bare sibling displacing a labelled arm's <code> would silence the one
      // guard on the structured code contradicting the narrative.
      const bareSibling = parseCcda(
        buildCcda({
          sections: withSecondMaterial(
            materialCode(
              `<code nullFlavor="UNK"/><code code="${ASPIRIN}" codeSystem="${RXNORM}"/>`,
            ),
            `<code code="${ASPIRIN}" codeSystem="${RXNORM}" displayName="Aspirin"/>`,
          ),
        }),
      );
      expect(bareSibling.getMedications()[0]?.drug?.displayName).toBe("Aspirin");
      expect(codes(bareSibling.warnings)).toContain(WARNING_CODES.CODE_NARRATIVE_MISMATCH);
    });

    it("still reads the product when the repeated <code>s agree, and says the arm repeats", () => {
      // Cardinality and agreement are separate facts with separate codes, the
      // same split MEDICATION_PRODUCT_ARM_REPEATED already makes one layer out.
      const doc = parseCcda(
        buildCcda({
          sections: withSecondCode(
            MEDICATIONS_SECTION,
            `<code code="${LISINOPRIL}" codeSystem="${RXNORM}"/>`,
          ),
        }),
      );
      expect(doc.getMedications()[0]?.drug?.code).toBe(LISINOPRIL);
      expect(codes(doc.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_CODE_REPEATED);
      expect(codes(doc.warnings)).not.toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
    });

    it("reaches a repeated <code> across arm kinds too", () => {
      // The cross-arm shape the reproduction started from: the labeled arm's
      // first <code> is null-marked and its second names a different drug. The
      // material arm's Lisinopril used to win in silence.
      const doc = parseCcda(
        buildCcda({
          sections: withLabeledArm(
            MEDICATIONS_SECTION,
            `<code nullFlavor="UNK"/><code code="${ASPIRIN}" codeSystem="${RXNORM}"/>`,
          ),
        }),
      );
      expect(doc.getMedications()[0]?.drug).toBeUndefined();
      expect(codes(doc.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
    });

    it("positions the repeat on the ARM that carries it, one warning per offending arm", () => {
      // Unlike MEDICATION_PRODUCT_ARM_REPEATED, which states a fact about the
      // manufacturedProduct, this states a fact about a particular arm. Two
      // offending arms draw two warnings at two positions rather than one
      // pointing at only one of them.
      const doc = parseCcda(
        buildCcda({
          sections: withLabeledArm(
            withSecondCode(
              MEDICATIONS_SECTION,
              `<code code="${LISINOPRIL}" codeSystem="${RXNORM}"/>`,
            ),
            `<code code="${LISINOPRIL}" codeSystem="${RXNORM}"/><code code="${LISINOPRIL}" codeSystem="${RXNORM}"/>`,
          ),
        }),
      );
      const repeats = doc.warnings.filter(
        (w) => w.code === WARNING_CODES.MEDICATION_PRODUCT_CODE_REPEATED,
      );
      expect(repeats).toHaveLength(2);
      expect(repeats.map((w) => w.position?.path)).toStrictEqual([
        "manufacturedMaterial",
        "manufacturedLabeledDrug",
      ]);
      // Distinct locations, not the same element reported twice.
      expect(repeats[0]?.position?.line).not.toBe(repeats[1]?.position?.line);
    });

    it("keeps the translation-only warning pointing where the coding actually is", () => {
      // The trap #62 shipped once and this slice must not re-open. The
      // translation-only scan runs over the LEAD <code>s, the same list
      // selection drew from, so the element it returns is the selected one
      // exactly when the selected arm holds the coding: `position` and the
      // "search drug.translation" branch stay true. Handing it the widened list
      // would let it land on a non-lead <code> that asserts a PRIMARY, and the
      // message would then send a reader to a <translation> that does not exist.
      //
      // What it does NOT buy, stated so nobody reads more into it: the message's
      // opening clause, "No manufacturedProduct arm asserts a primary @code", is
      // FALSE on this very fixture, whose arm asserts one on its second <code>.
      // That is PRE-EXISTING (base emits the identical message on the identical
      // input) and this slice only improves the disclosure around it, since
      // MEDICATION_PRODUCT_CODE_REPEATED now fires beside it. Narrowing that
      // clause to the lead <code>s is a separate change to a separate warning.
      const doc = parseCcda(
        buildCcda({
          sections: materialCode(
            `<code nullFlavor="OTH"><translation code="${ASPIRIN}" codeSystem="${RXNORM}"/></code><code code="${ASPIRIN}" codeSystem="${RXNORM}"/>`,
          ),
        }),
      );
      const translationOnly = doc.warnings.filter(
        (w) => w.code === WARNING_CODES.MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY,
      );
      expect(translationOnly).toHaveLength(1);
      // It points at the lead <code>, which is the selected one and does carry
      // the translation the message sends the reader to.
      expect(translationOnly[0]?.message).toContain("returned CD's translation list");
      expect(doc.getMedications()[0]?.drug?.translation?.[0]?.code).toBe(ASPIRIN);
    });

    it("pins the whole product-arm matrix: what is read, and what is said about it", () => {
      // The monotonicity argument as a diffable artifact rather than a claim.
      // Every row records the product code handed back, the code system it was
      // asserted under, the nullFlavor beside it, and the product warnings
      // raised. If a future change makes any row REPORT LESS, or hand back a
      // code where this snapshot has none, that is the silent pick between two
      // drugs coming back and the diff will show it.
      //
      // Measured, both times, by running THIS FILE against the previous
      // release's `src/` rather than by argument.
      //
      // `#62` (translations, repeated arms) moved the first nineteen rows: no
      // row lost a warning, every row that moved gained one, and exactly two
      // moved to `no CD`. One gave up a `CD` that named no product; the other
      // (a primary-asserting arm behind two disagreeing fallback arms) gave up
      // a FULLY CODED `CD`. That is what monotone COSTS, and it is why "no
      // product code stops being reported" is a false way to state this
      // invariant. Firing more means WITHHOLDING more.
      //
      // `CCDA-ARM-MULTI-CODE` (every `<code>` on an arm reaches the COMPARISON,
      // selection deliberately untouched) left all nineteen of those rows
      // BYTE-IDENTICAL and moved only the eight it added. Every one of those
      // eight gained warnings, and **every one of them reads exactly what base
      // read, except the three the conflict rule now withholds outright.** That
      // is the whole design: widening what is compared is monotone, widening
      // what is SELECTED is not, because `selectableCode` ranks on "names a
      // product" alone and a newly-visible sibling sits earlier in document
      // order, so it would displace an equally-symboled but richer coding and
      // take the safety-critical signal that coding was drawing with it. The
      // last two rows are there to make that concrete and to fail loudly if
      // anyone ever widens selection: they keep `MISSING_CODE_VALUE` and
      // `CODE_NARRATIVE_MISMATCH` alive on shapes where a bare sibling would
      // have won.
      //
      // **One row's warning set is not a superset of its old one, and it is the
      // only one:** "two translation-only codes disagreeing on strength" traded
      // `MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY` for
      // `MEDICATION_PRODUCT_ARM_CONFLICT`. That is the documented suppression,
      // not a lost signal, the translation-only code stands down behind the
      // conflict exactly as `MISSING_PRODUCT_CODE` does, because the conflict is
      // the stronger statement about the same slot. Both are in
      // `SAFETY_CRITICAL_CODES`, so no profile can quiet either. State the
      // invariant that way: no row goes from warned to silent, and no row trades
      // a safety-critical code for a weaker one.
      const shapes: readonly (readonly [string, string])[] = [
        ["single arm", MEDICATIONS_SECTION],
        [
          "single arm, translation only",
          materialCode(
            `<code nullFlavor="OTH"><translation code="${LISINOPRIL}" codeSystem="${RXNORM}"/></code>`,
          ),
        ],
        ["single arm, nullFlavor only", materialCode(`<code nullFlavor="UNK"/>`)],
        [
          "two materials agreeing",
          withSecondMaterial(
            MEDICATIONS_SECTION,
            `<code code="${LISINOPRIL}" codeSystem="${RXNORM}"/>`,
          ),
        ],
        [
          "two materials disagreeing",
          withSecondMaterial(
            MEDICATIONS_SECTION,
            `<code code="${ASPIRIN}" codeSystem="${RXNORM}"/>`,
          ),
        ],
        ["two materials, second has no code", withSecondMaterial(MEDICATIONS_SECTION, "")],
        [
          "material and labeled agreeing",
          withLabeledArm(
            MEDICATIONS_SECTION,
            `<code code="${LISINOPRIL}" codeSystem="${RXNORM}"/>`,
          ),
        ],
        [
          "material and labeled disagreeing",
          withLabeledArm(MEDICATIONS_SECTION, `<code code="${ASPIRIN}" codeSystem="${RXNORM}"/>`),
        ],
        [
          "primaries differ, translation shared",
          withLabeledArm(
            materialCode(
              `<code code="${LISINOPRIL}" codeSystem="${RXNORM}"><translation code="${LISINOPRIL_INGREDIENT}" codeSystem="${RXNORM}"/></code>`,
            ),
            `<code code="${LISINOPRIL_20MG}" codeSystem="${RXNORM}"><translation code="${LISINOPRIL_INGREDIENT}" codeSystem="${RXNORM}"/></code>`,
          ),
        ],
        [
          "both translation-only, shared coarse coding, different strengths",
          withLabeledArm(
            materialCode(
              `<code nullFlavor="OTH"><translation code="${LISINOPRIL_INGREDIENT}" codeSystem="${RXNORM}"/><translation code="${LISINOPRIL}" codeSystem="${RXNORM}"/></code>`,
            ),
            `<code nullFlavor="OTH"><translation code="${LISINOPRIL_INGREDIENT}" codeSystem="${RXNORM}"/><translation code="${LISINOPRIL_20MG}" codeSystem="${RXNORM}"/></code>`,
          ),
        ],
        [
          "both translation-only, identical",
          withLabeledArm(
            materialCode(
              `<code nullFlavor="OTH"><translation code="${LISINOPRIL}" codeSystem="${RXNORM}"/></code>`,
            ),
            `<code nullFlavor="OTH"><translation code="${LISINOPRIL}" codeSystem="${RXNORM}"/></code>`,
          ),
        ],
        [
          "both translation-only, one a subset of the other",
          withLabeledArm(
            materialCode(
              `<code nullFlavor="OTH"><translation code="${LISINOPRIL_INGREDIENT}" codeSystem="${RXNORM}"/><translation code="${LISINOPRIL}" codeSystem="${RXNORM}"/></code>`,
            ),
            `<code nullFlavor="OTH"><translation code="${LISINOPRIL_INGREDIENT}" codeSystem="${RXNORM}"/></code>`,
          ),
        ],
        [
          "material nullFlavor only, labeled translation-only",
          withLabeledArm(
            materialCode(`<code nullFlavor="UNK"/>`),
            `<code nullFlavor="OTH"><translation code="${LISINOPRIL}" codeSystem="${RXNORM}"/></code>`,
          ),
        ],
        [
          "material primary, labeled translation-only agreeing",
          withLabeledArm(
            MEDICATIONS_SECTION,
            `<code nullFlavor="OTH"><translation code="${LISINOPRIL}" codeSystem="${RXNORM}"/></code>`,
          ),
        ],
        [
          "material primary, labeled translation-only coarser",
          withLabeledArm(
            MEDICATIONS_SECTION,
            `<code nullFlavor="OTH"><translation code="${LISINOPRIL_INGREDIENT}" codeSystem="${RXNORM}"/></code>`,
          ),
        ],
        [
          "no code on any arm",
          MEDICATIONS_SECTION.replace(
            /<manufacturedMaterial>[\s\S]*?<\/manufacturedMaterial>/u,
            "<manufacturedLabeledDrug/>",
          ),
        ],
        [
          "three materials all agreeing",
          withSecondMaterial(
            withSecondMaterial(
              MEDICATIONS_SECTION,
              `<code code="${LISINOPRIL}" codeSystem="${RXNORM}"/>`,
            ),
            `<code code="${LISINOPRIL}" codeSystem="${RXNORM}"/>`,
          ),
        ],
        [
          "first material nullFlavor only, second names a drug",
          withSecondMaterial(
            materialCode(`<code nullFlavor="UNK"/>`),
            `<code code="${ASPIRIN}" codeSystem="${RXNORM}"/>`,
          ),
        ],
        [
          // THE ROW THAT SHOWS WHAT MONOTONE COSTS. A third arm asserts a real
          // primary, and the two fallback arms disagree behind it. Firing more
          // means WITHHOLDING more, so the coded CD this used to return becomes
          // `no CD`. That is the conflict code's standing trade (refuse to pick
          // when the document contradicts itself), not an accident, and any
          // claim that "no product code stops being reported" is false here.
          "primary-asserting arm behind two disagreeing fallback arms",
          withLabeledArm(
            withSecondMaterial(
              materialCode(`<code code="${LISINOPRIL_INGREDIENT}" codeSystem="${RXNORM}"/>`),
              `<code nullFlavor="OTH"><translation code="${LISINOPRIL_INGREDIENT}" codeSystem="${RXNORM}"/><translation code="${LISINOPRIL}" codeSystem="${RXNORM}"/></code>`,
            ),
            `<code nullFlavor="OTH"><translation code="${LISINOPRIL_INGREDIENT}" codeSystem="${RXNORM}"/><translation code="${LISINOPRIL_20MG}" codeSystem="${RXNORM}"/></code>`,
          ),
        ],
        // CCDA-ARM-MULTI-CODE's rows: two <code>s on ONE arm, the elements
        // `armCodes` used to drop before anything compared them.
        [
          "one material, two codes agreeing",
          withSecondCode(
            MEDICATIONS_SECTION,
            `<code code="${LISINOPRIL}" codeSystem="${RXNORM}"/>`,
          ),
        ],
        [
          // THE DEFECT. Base hands back code=314076 in complete silence.
          "one material, two codes naming different drugs",
          withSecondCode(MEDICATIONS_SECTION, `<code code="${ASPIRIN}" codeSystem="${RXNORM}"/>`),
        ],
        [
          "one material, null-marked code then a naming one",
          materialCode(`<code nullFlavor="UNK"/><code code="${ASPIRIN}" codeSystem="${RXNORM}"/>`),
        ],
        [
          "one material, naming code then a null-marked one",
          withSecondCode(MEDICATIONS_SECTION, `<code nullFlavor="UNK"/>`),
        ],
        [
          "one material, two translation-only codes disagreeing on strength",
          materialCode(
            `<code nullFlavor="OTH"><translation code="${LISINOPRIL_INGREDIENT}" codeSystem="${RXNORM}"/><translation code="${LISINOPRIL}" codeSystem="${RXNORM}"/></code><code nullFlavor="OTH"><translation code="${LISINOPRIL_INGREDIENT}" codeSystem="${RXNORM}"/><translation code="${LISINOPRIL_20MG}" codeSystem="${RXNORM}"/></code>`,
          ),
        ],
        [
          "labeled arm hides a second drug in its second code",
          withLabeledArm(
            MEDICATIONS_SECTION,
            `<code nullFlavor="UNK"/><code code="${ASPIRIN}" codeSystem="${RXNORM}"/>`,
          ),
        ],
        [
          // THE ROWS THAT PIN SELECTION AS UNCHANGED. If a newly-visible sibling
          // ever displaces the lead <code>, the safety-critical signal the lead
          // was drawing goes quiet and these rows show it: an empty <code/> is
          // what MISSING_CODE_VALUE is scoped to, and the richer sibling arm's
          // displayName is what CODE_NARRATIVE_MISMATCH reads.
          "one material, empty code then a naming one",
          materialCode(`<code/><code code="${ASPIRIN}" codeSystem="${RXNORM}"/>`),
        ],
        [
          "bare second code, richer arm behind it",
          withSecondMaterial(
            materialCode(`<code nullFlavor="UNK"/><code code="${ASPIRIN}"/>`),
            `<code code="${ASPIRIN}" codeSystem="${RXNORM}" displayName="Aspirin"/>`,
          ),
        ],
      ];
      const matrix = shapes.map(([name, sections]) => {
        const doc = parseCcda(buildCcda({ sections }));
        const drug = doc.getMedications()[0]?.drug;
        // MISSING_CODE_SYSTEM, MISSING_CODE_VALUE and CODE_NARRATIVE_MISMATCH
        // are in the frame because they are the safety-critical signals that
        // fire ON the selected element, so they are what goes quiet if anything
        // ever moves selection. A matrix that filtered them out could show a
        // stranded coding as though nothing had been said about it, which is how
        // an instrument stops being able to measure the thing it is for.
        const said = codes(doc.warnings)
          .filter(
            (c) =>
              c.startsWith("MEDICATION_PRODUCT") ||
              c === "MISSING_PRODUCT_CODE" ||
              c === "MISSING_CODE_SYSTEM" ||
              c === "MISSING_CODE_VALUE" ||
              c === "CODE_NARRATIVE_MISMATCH",
          )
          .sort()
          .join(" ");
        // The codeSystem is printed, not just the symbol: a symbol that keeps
        // its value while losing the terminology it was asserted under is a
        // different reading, and a matrix that hid it could not be used to
        // measure this area again.
        const read =
          drug === undefined
            ? "no CD"
            : `code=${drug.code ?? "none"} sys=${drug.codeSystem ?? "none"} nullFlavor=${drug.nullFlavor ?? "none"}`;
        return `${name}: ${read} | ${said || "silent"}`;
      });
      expect(matrix).toMatchInlineSnapshot(`
        [
          "single arm: code=314076 sys=2.16.840.1.113883.6.88 nullFlavor=none | silent",
          "single arm, translation only: code=none sys=none nullFlavor=OTH | MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY",
          "single arm, nullFlavor only: code=none sys=none nullFlavor=UNK | silent",
          "two materials agreeing: code=314076 sys=2.16.840.1.113883.6.88 nullFlavor=none | MEDICATION_PRODUCT_ARM_REPEATED",
          "two materials disagreeing: no CD | MEDICATION_PRODUCT_ARM_CONFLICT MEDICATION_PRODUCT_ARM_REPEATED",
          "two materials, second has no code: code=314076 sys=2.16.840.1.113883.6.88 nullFlavor=none | MEDICATION_PRODUCT_ARM_REPEATED",
          "material and labeled agreeing: code=314076 sys=2.16.840.1.113883.6.88 nullFlavor=none | MEDICATION_PRODUCT_ARM_UNEXPECTED",
          "material and labeled disagreeing: no CD | MEDICATION_PRODUCT_ARM_CONFLICT MEDICATION_PRODUCT_ARM_UNEXPECTED",
          "primaries differ, translation shared: no CD | MEDICATION_PRODUCT_ARM_CONFLICT MEDICATION_PRODUCT_ARM_UNEXPECTED",
          "both translation-only, shared coarse coding, different strengths: no CD | MEDICATION_PRODUCT_ARM_CONFLICT MEDICATION_PRODUCT_ARM_UNEXPECTED",
          "both translation-only, identical: code=none sys=none nullFlavor=OTH | MEDICATION_PRODUCT_ARM_UNEXPECTED MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY",
          "both translation-only, one a subset of the other: code=none sys=none nullFlavor=OTH | MEDICATION_PRODUCT_ARM_UNEXPECTED MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY",
          "material nullFlavor only, labeled translation-only: code=none sys=none nullFlavor=UNK | MEDICATION_PRODUCT_ARM_UNEXPECTED MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY",
          "material primary, labeled translation-only agreeing: code=314076 sys=2.16.840.1.113883.6.88 nullFlavor=none | MEDICATION_PRODUCT_ARM_UNEXPECTED",
          "material primary, labeled translation-only coarser: no CD | MEDICATION_PRODUCT_ARM_CONFLICT MEDICATION_PRODUCT_ARM_UNEXPECTED",
          "no code on any arm: no CD | MEDICATION_PRODUCT_ARM_UNEXPECTED MISSING_PRODUCT_CODE",
          "three materials all agreeing: code=314076 sys=2.16.840.1.113883.6.88 nullFlavor=none | MEDICATION_PRODUCT_ARM_REPEATED",
          "first material nullFlavor only, second names a drug: code=1191 sys=2.16.840.1.113883.6.88 nullFlavor=none | MEDICATION_PRODUCT_ARM_REPEATED",
          "primary-asserting arm behind two disagreeing fallback arms: no CD | MEDICATION_PRODUCT_ARM_CONFLICT MEDICATION_PRODUCT_ARM_REPEATED MEDICATION_PRODUCT_ARM_UNEXPECTED",
          "one material, two codes agreeing: code=314076 sys=2.16.840.1.113883.6.88 nullFlavor=none | MEDICATION_PRODUCT_CODE_REPEATED",
          "one material, two codes naming different drugs: no CD | MEDICATION_PRODUCT_ARM_CONFLICT MEDICATION_PRODUCT_CODE_REPEATED",
          "one material, null-marked code then a naming one: code=none sys=none nullFlavor=UNK | MEDICATION_PRODUCT_CODE_REPEATED",
          "one material, naming code then a null-marked one: code=314076 sys=2.16.840.1.113883.6.88 nullFlavor=none | MEDICATION_PRODUCT_CODE_REPEATED",
          "one material, two translation-only codes disagreeing on strength: no CD | MEDICATION_PRODUCT_ARM_CONFLICT MEDICATION_PRODUCT_CODE_REPEATED",
          "labeled arm hides a second drug in its second code: no CD | MEDICATION_PRODUCT_ARM_CONFLICT MEDICATION_PRODUCT_ARM_UNEXPECTED MEDICATION_PRODUCT_CODE_REPEATED",
          "one material, empty code then a naming one: code=none sys=none nullFlavor=none | MEDICATION_PRODUCT_CODE_REPEATED MISSING_CODE_VALUE",
          "bare second code, richer arm behind it: code=1191 sys=2.16.840.1.113883.6.88 nullFlavor=none | CODE_NARRATIVE_MISMATCH MEDICATION_PRODUCT_ARM_REPEATED MEDICATION_PRODUCT_CODE_REPEATED",
        ]
      `);
    });

    it("stays monotone: every shape whose primaries disagree still conflicts", () => {
      // The invariant the whole area rests on, pinned as a table rather than as
      // one example. Reading translations, and now comparing two fallback arms
      // more strictly, may only make the conflict fire MORE. If any row here
      // ever goes quiet, a document naming two drugs is being handed back as
      // one, which is the failure this rule exists to refuse.
      const shared = `<translation code="${LISINOPRIL_INGREDIENT}" codeSystem="${RXNORM}"/>`;
      const disagreeingPrimaries: readonly (readonly [string, string])[] = [
        [
          `<code code="${LISINOPRIL}" codeSystem="${RXNORM}"/>`,
          `<code code="${LISINOPRIL_20MG}" codeSystem="${RXNORM}"/>`,
        ],
        [
          `<code code="${LISINOPRIL}" codeSystem="${RXNORM}">${shared}</code>`,
          `<code code="${LISINOPRIL_20MG}" codeSystem="${RXNORM}">${shared}</code>`,
        ],
        [
          `<code code="${LISINOPRIL}" codeSystem="${RXNORM}"><translation code="${NDC_ONE}" codeSystem="${NDC}"/></code>`,
          `<code code="${ASPIRIN}" codeSystem="${RXNORM}"><translation code="${NDC_ONE}" codeSystem="${NDC}"/></code>`,
        ],
        // The same symbol under two different terminologies is two products.
        [
          `<code code="${ASPIRIN}" codeSystem="${RXNORM}"/>`,
          `<code code="${ASPIRIN}" codeSystem="2.16.840.1.113883.6.96"/>`,
        ],
      ];
      for (const [material, labeled] of disagreeingPrimaries) {
        const acrossKinds = parseCcda(
          buildCcda({ sections: withLabeledArm(materialCode(material), labeled) }),
        );
        expect(acrossKinds.getMedications()[0]?.drug).toBeUndefined();
        expect(codes(acrossKinds.warnings)).toContain(
          WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT,
        );
        // And the same pair as a repeated arm of ONE kind.
        const withinKind = parseCcda(
          buildCcda({ sections: withSecondMaterial(materialCode(material), labeled) }),
        );
        expect(withinKind.getMedications()[0]?.drug).toBeUndefined();
        expect(codes(withinKind.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
        // And the same pair as two <code>s inside ONE arm (CCDA-ARM-MULTI-CODE).
        // Every disagreeing shape above has to survive the innermost nesting
        // too, or the second <code> is back to being dropped in silence.
        const withinArm = parseCcda(buildCcda({ sections: materialCode(`${material}${labeled}`) }));
        expect(withinArm.getMedications()[0]?.drug).toBeUndefined();
        expect(codes(withinArm.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
        expect(codes(withinArm.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_CODE_REPEATED);
      }
    });
  });

  // The negatives, so the widened comparison cannot become "no drug for anyone".
  it("stays silent on a single arm that merely carries a translation", () => {
    const doc = parseCcda(
      buildCcda({
        sections: materialCode(
          `<code code="${LISINOPRIL}" codeSystem="${RXNORM}"><translation code="${NDC_ONE}" codeSystem="${NDC}"/></code>`,
        ),
      }),
    );
    expect(doc.getMedications()[0]?.drug?.code).toBe(LISINOPRIL);
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_UNEXPECTED);
  });
});
