/**
 * Clinical-entry extraction tests, the Phase 2 reconciliation triad (Problems,
 * Medications, Allergies). Covers Tier-1 happy-path extraction, the
 * safety-critical distinctions (negation vs nullFlavor, code vs narrative, dose/
 * route presence, concern status), and the code-system slot warnings. Every
 * fixture is synthetic (the canonical "Jane Doe"), per the PHI-by-default rule.
 */

import { describe, expect, it } from "vitest";

import {
  parseCcda,
  SAFETY_CRITICAL_CODES,
  WARNING_CODES,
  type CcdaWarning,
  type CD,
} from "../src/index.js";
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
      // The message's opening clause used to read "No manufacturedProduct arm
      // asserts a primary @code", which is FALSE on this very fixture, whose arm
      // asserts one on its second <code>, and it called the translation the
      // ONLY place the product was named, false on the same shape.
      // CCDA-ARM-MULTI-CODE improved the disclosure around it (a
      // MEDICATION_PRODUCT_CODE_REPEATED now fires beside it) and deliberately
      // left the clause; CCDA-PLANNED-MED-ARM-CONFLICT-UNREACHABLE narrows it to
      // the LEAD <code>s, which is what selection actually reads.
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
      // And the message no longer says a thing this document contradicts: the
      // arm DOES assert a primary @code, on its second <code>, and the product
      // is named there as well as in the translation.
      expect(translationOnly[0]?.message).toContain("arm's lead <code> asserts a primary @code");
      expect(translationOnly[0]?.message).not.toContain("named only in a <translation>");
      expect(codes(doc.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_CODE_REPEATED);
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

/**
 * `CCDA-PLANNED-MED-ARM-CONFLICT-UNREACHABLE`. The Plan of Treatment is the
 * third `consumable` call site, and it was the one where none of the product
 * warnings could fire.
 *
 * `plannedCodeElement` returned the act's direct `<code>` **before** it ever
 * called `consumableProductCode`, so a Planned Medication Activity carrying its
 * own `<code>` (legal, `SubstanceAdministration.code` being `[0..1]` in CDA R2, and one it defines as the *kind of
 * administration act* rather than the substance) read that act type into the
 * drug slot and skipped the consumable entirely. Every warning that function
 * raises was unreachable there, `MEDICATION_PRODUCT_ARM_CONFLICT` above all:
 * two `manufacturedProduct` arms naming two different drugs went completely
 * unmentioned, on the section that says what a patient is **about to be given**.
 *
 * The builder is what hid it. It emits the drug in the `consumable` and no
 * direct `<code>` for this variant, so no round-trip fixture could produce the
 * shape.
 */
describe("clinical entries, a Planned Medication Activity carrying its own act <code>", () => {
  const RXNORM = "2.16.840.1.113883.6.88";
  const SNOMED_CT = "2.16.840.1.113883.6.96";
  /** Aspirin, the RxNorm code this repo's tolerance notes already use. */
  const ASPIRIN = "1191";
  /** The fixture's drug, Lisinopril 10 MG Oral Tablet. */
  const LISINOPRIL = "314076";
  /** SNOMED CT "Administration of drug or medicament (procedure)". */
  const ADMIN_OF_DRUG = "18629005";

  /**
   * `SubstanceAdministration.code`: an `ActSubstanceAdministrationCode`, the
   * kind of administration act, NOT the substance. The `displayName` is the
   * concept's own label, and it is deliberately nothing like a drug name, which
   * is the whole point of the reconciliation rows below.
   *
   * `18629005` is "Administration of drug or medicament (procedure)", verified
   * against SNOMED CT rather than carried over. Do NOT use `416118004` here:
   * that is "Administration (procedure)", a different and now-inactive concept
   * (inactivated 2021-09-30), and pairing it with this label would be the third
   * instance of the fixture defect this area has already produced twice (RXCUI
   * `197361` labelled as lisinopril, CVX `140` labelled with CVX `141`'s name).
   */
  const ACT_CODE = `<code code="${ADMIN_OF_DRUG}" codeSystem="${SNOMED_CT}" displayName="Administration of drug or medicament"/>`;
  /** A narrative reference, so `reconcileCode` has something to compare against. */
  const TEXT_REF = `<text><reference value="#planmed1"/></text>`;
  const MATERIAL_ARM = `<manufacturedMaterial><code code="${LISINOPRIL}" codeSystem="${RXNORM}" displayName="Lisinopril 10 MG Oral Tablet"/></manufacturedMaterial>`;

  /**
   * A Plan of Treatment section carrying exactly ONE Planned Medication
   * Activity, so a warning set reads only that entry rather than the six-entry
   * fixture's other five. Synthetic throughout, per the PHI-by-default rule:
   * the drug and the narrative line are the same Lisinopril the canonical
   * "Jane Doe" fixtures already use.
   */
  const plannedMed = (arms: string, sbadmExtra = ""): string => `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.10" extension="2014-06-09"/>
          <code code="18776-5" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Plan of Treatment</title>
          <text><content ID="planmed1">Lisinopril 10 MG Oral Tablet</content></text>
          <entry>
            <substanceAdministration classCode="SBADM" moodCode="INT">
              <templateId root="2.16.840.1.113883.10.20.22.4.42" extension="2014-06-09"/>
              <id root="2.16.840.1.113883.19.5.99999.20" extension="plan-med-1"/>
              ${sbadmExtra}
              <statusCode code="active"/>
              <consumable>
                <manufacturedProduct>
                  ${arms}
                </manufacturedProduct>
              </consumable>
            </substanceAdministration>
          </entry>
        </section>
      </component>`;

  const plannedDrug = (sections: string): CD | undefined =>
    parseCcda(buildCcda({ sections }))
      .getPlannedItems()
      .find((p) => p.kind === "medicationActivity")?.code;

  it("reads the DRUG, not the act code, when the planned medication carries both", () => {
    // The reading the model always claimed and only sometimes delivered: `code`
    // was the drug on a planned medication with no act <code> and the act TYPE
    // on one with it, so a consumer could not rely on it being either.
    const drug = plannedDrug(plannedMed(MATERIAL_ARM, ACT_CODE));
    expect(drug?.code).toBe(LISINOPRIL);
    expect(drug?.codeSystem).toBe(RXNORM);
    expect(drug?.code).not.toBe(ADMIN_OF_DRUG);
  });

  it("refuses to pick between two arms naming different drugs, which it never could before", () => {
    // THE DEFECT. Base returns code=18629005 (the act type) and says NOTHING:
    // one planned medication, two named drugs, silently reduced to neither of
    // them without a warning of any kind.
    const doc = parseCcda(
      buildCcda({
        sections: plannedMed(
          `${MATERIAL_ARM}<manufacturedLabeledDrug><code code="${ASPIRIN}" codeSystem="${RXNORM}"/></manufacturedLabeledDrug>`,
          ACT_CODE,
        ),
      }),
    );
    const planned = doc.getPlannedItems().find((p) => p.kind === "medicationActivity");
    expect(planned).toBeDefined();
    expect(planned?.code).toBeUndefined();
    expect(codes(doc.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT);
    // The conflict is the stronger, more specific statement; "no arm yielded a
    // code" would be false, exactly as at the other two call sites.
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.MISSING_PRODUCT_CODE);
  });

  it("flags a planned medication whose consumable names no product on any arm", () => {
    const doc = parseCcda(buildCcda({ sections: plannedMed("<manufacturedMaterial/>", ACT_CODE) }));
    expect(codes(doc.warnings)).toContain(WARNING_CODES.MISSING_PRODUCT_CODE);
    expect(plannedDrug(plannedMed("<manufacturedMaterial/>", ACT_CODE))).toBeUndefined();
  });

  it("flags a planned medication with an act code and no consumable at all", () => {
    const noConsumable = plannedMed(MATERIAL_ARM, ACT_CODE).replace(
      /<consumable>[\s\S]*?<\/consumable>/u,
      "",
    );
    expect(codes(parseCcda(buildCcda({ sections: noConsumable })).warnings)).toContain(
      WARNING_CODES.MISSING_PRODUCT_CODE,
    );
  });

  it("reaches every other product warning too, not just the conflict", () => {
    // The short-circuit skipped the whole function, so all of these were
    // unreachable on this variant, not merely the headline one.
    const unexpected = codes(
      parseCcda(
        buildCcda({
          sections: plannedMed(
            `${MATERIAL_ARM}<manufacturedLabeledDrug><code code="${LISINOPRIL}" codeSystem="${RXNORM}"/></manufacturedLabeledDrug>`,
            ACT_CODE,
          ),
        }),
      ).warnings,
    );
    expect(unexpected).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_UNEXPECTED);

    const repeated = codes(
      parseCcda(
        buildCcda({
          sections: plannedMed(
            `${MATERIAL_ARM}<manufacturedMaterial><code code="${LISINOPRIL}" codeSystem="${RXNORM}"/></manufacturedMaterial>`,
            ACT_CODE,
          ),
        }),
      ).warnings,
    );
    expect(repeated).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_REPEATED);

    const codeRepeated = codes(
      parseCcda(
        buildCcda({
          sections: plannedMed(
            `<manufacturedMaterial><code code="${LISINOPRIL}" codeSystem="${RXNORM}"/><code code="${LISINOPRIL}" codeSystem="${RXNORM}"/></manufacturedMaterial>`,
            ACT_CODE,
          ),
        }),
      ).warnings,
    );
    expect(codeRepeated).toContain(WARNING_CODES.MEDICATION_PRODUCT_CODE_REPEATED);

    const translationOnly = codes(
      parseCcda(
        buildCcda({
          sections: plannedMed(
            `<manufacturedMaterial><code nullFlavor="OTH"><translation code="${LISINOPRIL}" codeSystem="${RXNORM}"/></code></manufacturedMaterial>`,
            ACT_CODE,
          ),
        }),
      ).warnings,
    );
    expect(translationOnly).toContain(WARNING_CODES.MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY);
  });

  it("points CODE_NARRATIVE_MISMATCH at the drug, the only thing it can usefully compare", () => {
    // Reachable before, but blind to its subject: it reconciled the ACT code's
    // label against a narrative that names the DRUG, so it fired on every
    // well-formed document carrying both and could not see the one failure it
    // exists to catch. Now the drug is what is compared, so a structured drug
    // agreeing with the narrative is quiet...
    const agreeing = codes(
      parseCcda(buildCcda({ sections: plannedMed(MATERIAL_ARM, `${ACT_CODE}${TEXT_REF}`) }))
        .warnings,
    );
    expect(agreeing).not.toContain(WARNING_CODES.CODE_NARRATIVE_MISMATCH);

    // ...and a structured drug CONTRADICTING the narrative is not. Base is
    // silent on this document: it compared "Administration of drug or
    // medicament" against "Lisinopril 10 MG Oral Tablet", found them different,
    // and fired for the wrong reason on both of these, which is the same
    // warning being useless in both directions.
    const contradicting = codes(
      parseCcda(
        buildCcda({
          sections: plannedMed(
            `<manufacturedMaterial><code code="${ASPIRIN}" codeSystem="${RXNORM}" displayName="Aspirin"/></manufacturedMaterial>`,
            `${ACT_CODE}${TEXT_REF}`,
          ),
        }),
      ).warnings,
    );
    expect(contradicting).toContain(WARNING_CODES.CODE_NARRATIVE_MISMATCH);
  });

  it("leaves the other five planned kinds reading their own <code>", () => {
    // Only the medication variant has a consumable, and only it changed. The
    // other five carry the planned act itself in <code>, and an absence there
    // is not a lost drug, so nothing is flagged for them either.
    const doc = parseCcda(buildCcda({ sections: PLAN_OF_TREATMENT_SECTION }));
    const byKind = new Map(doc.getPlannedItems().map((p) => [p.kind, p.code?.code]));
    expect(byKind.get("observation")).toBe("58410-2");
    expect(byKind.get("act")).toBe("409073007");
    expect(byKind.get("encounter")).toBe("99213");
    expect(byKind.get("procedure")).toBe("73761001");
    expect(byKind.get("supply")).toBe("58938008");
    expect(byKind.get("medicationActivity")).toBe(LISINOPRIL);
  });

  it("loses nothing: the act code and both arms round-trip verbatim", () => {
    // The act <code> is not on the model for this variant, exactly as it is not
    // on a performed Medication Activity or an Immunization Activity. Dropping
    // it from the model is only defensible because the document itself survives.
    const doc = parseCcda(
      buildCcda({
        sections: plannedMed(
          `${MATERIAL_ARM}<manufacturedLabeledDrug><code code="${ASPIRIN}" codeSystem="${RXNORM}"/></manufacturedLabeledDrug>`,
          ACT_CODE,
        ),
      }),
    );
    const out = doc.toString();
    expect(out).toContain(`code="${ADMIN_OF_DRUG}"`);
    expect(out).toContain(`code="${LISINOPRIL}"`);
    expect(out).toContain(`code="${ASPIRIN}"`);
    expect(parseCcda(out).toString()).toBe(out);
  });

  it("restores the tolerability argument: a drugless planned medication now carries an unquietable code", () => {
    // `CCDA-PLANNED-CODE-SLOT`. This block used to pin the OPPOSITE, as a
    // measured PRE-EXISTING limit: `checkCodeSlot` was never called on a
    // PlannedItem.code, so MISSING_CODE_VALUE could not fire here, and the
    // conditional tolerability argument for MEDICATION_PRODUCT_ARM_UNEXPECTED
    // and MEDICATION_PRODUCT_ARM_REPEATED ("each state where a <code> was not
    // selected and read normally carries an unquietable companion") was FALSE at
    // this call site and only at this call site. Its sharpest form: a planned
    // medication whose only arm was <manufacturedLabeledDrug><code/></...> had NO
    // drug identity at all and drew a single PROFILE-QUIETABLE warning, which the
    // documented "filter the expected noise" pattern reduces to total silence, on
    // the section that says what a patient is ABOUT TO BE GIVEN.
    //
    // The slot is wired now, so the named companion fires and the argument holds
    // at all three consumable call sites. What is READ is unchanged in both
    // shapes: `checkCodeSlot` only emits.
    const labeled = parseCcda(
      buildCcda({
        sections: plannedMed("<manufacturedLabeledDrug><code/></manufacturedLabeledDrug>"),
      }),
    );
    const fromLabeled = labeled.getPlannedItems().find((p) => p.kind === "medicationActivity");
    expect(fromLabeled?.code).toStrictEqual({});
    expect(fromLabeled?.code?.code).toBeUndefined();
    expect(codes(labeled.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_UNEXPECTED);
    expect(codes(labeled.warnings)).toContain(WARNING_CODES.MISSING_CODE_VALUE);
    // Still not MISSING_PRODUCT_CODE: an arm did carry a <code>. That backstop
    // and this slot check answer different questions and neither substitutes.
    expect(codes(labeled.warnings)).not.toContain(WARNING_CODES.MISSING_PRODUCT_CODE);

    const repeated = parseCcda(
      buildCcda({
        sections: plannedMed(
          "<manufacturedMaterial><code/></manufacturedMaterial><manufacturedMaterial><code/></manufacturedMaterial>",
        ),
      }),
    );
    expect(codes(repeated.warnings)).toContain(WARNING_CODES.MEDICATION_PRODUCT_ARM_REPEATED);
    expect(codes(repeated.warnings)).toContain(WARNING_CODES.MISSING_CODE_VALUE);

    // The tolerable codes stay tolerable; what changed is that the companion
    // carrying their argument is present, and no profile can quiet it.
    expect(SAFETY_CRITICAL_CODES.has(WARNING_CODES.MEDICATION_PRODUCT_ARM_UNEXPECTED)).toBe(false);
    expect(SAFETY_CRITICAL_CODES.has(WARNING_CODES.MEDICATION_PRODUCT_ARM_REPEATED)).toBe(false);
    expect(SAFETY_CRITICAL_CODES.has(WARNING_CODES.MISSING_CODE_VALUE)).toBe(true);
  });

  it("leaves the other five planned kinds unchecked, because their <code> is the planned ACT", () => {
    // The wiring is scoped to `medicationActivity` on purpose. The other five
    // carry the planned act itself: a LOINC observation, a SNOMED act, a CPT
    // encounter, a SNOMED procedure, a SNOMED supply. None is one of the five
    // bound CodeSlots, and picking one for them would flag conformant documents,
    // so an empty <code> on those variants stays silent exactly as it always has.
    const emptyCoded = PLAN_OF_TREATMENT_SECTION.replace(
      /<code code="58410-2"[^/]*\/>/u,
      "<code/>",
    );
    const doc = parseCcda(buildCcda({ sections: emptyCoded }));
    const observation = doc.getPlannedItems().find((p) => p.kind === "observation");
    expect(observation?.code).toStrictEqual({});
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.MISSING_CODE_VALUE);
  });

  it("pins the planned-medication matrix: what is read, and what is said about it", () => {
    // The monotonicity argument for THIS call site as a diffable artifact
    // rather than a claim, MEASURED by running this block against base `src/`.
    // Every arm shape appears three times, once with no act <code>, once with
    // one, and once with an act <code> plus a narrative reference. The triple IS
    // the defect: against base the three variants of a row disagree, and after
    // the fix they agree except where the narrative reconciliation legitimately
    // separates them. Nine shapes, twenty-seven rows; eighteen move.
    //
    // 1. THE NINE "no act code" ROWS COME BACK BYTE-IDENTICAL. Nothing on that
    //    path changed, and the performed-medication matrix above is unchanged
    //    too, so this slice moves one call site and no other.
    //
    // 2. THE NINE "act code present" ROWS ARE PURE GAIN. Base reads
    //    code=18629005 (a value in the ActSubstanceAdministrationCode slot: the
    //    binding is extensible, the value set itself being HL7 ActCode
    //    DRUG/FD/IMMUNIZ, so a SNOMED procedure concept is permitted there but
    //    is not a member of the domain) into the drug slot on all nine and is
    //    SILENT on
    //    all nine. Each now matches its "no act code" twin, which across the
    //    nine is two MEDICATION_PRODUCT_ARM_CONFLICTs (the headline defect,
    //    twice: two arms, and two <code>s on one arm), a MISSING_PRODUCT_CODE,
    //    two MEDICATION_PRODUCT_ARM_UNEXPECTEDs, a MEDICATION_PRODUCT_ARM_REPEATED,
    //    a MEDICATION_PRODUCT_CODE_REPEATED and a
    //    MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY, eight warnings across six
    //    rows. Not one loses a warning. THREE stop handing back a code, and
    //    each does so beside a safety-critical warning that says why: the
    //    conflict rule's standing trade twice over, and the missing product.
    //    The remaining THREE are silent before and after and still move,
    //    because reading an act type as the drug was wrong even where nothing
    //    was said about it.
    //
    // 3. THE NINE "act code + narrative" ROWS MOVE ONLY ON CODE_NARRATIVE_MISMATCH,
    //    AND THAT IS THIS SLICE'S EXCEPTION TO THE INVARIANT. Base fires it on
    //    NINE OF NINE, including the clean single arm and including the row
    //    whose structured drug contradicts the narrative. It could not do
    //    otherwise: it was comparing an act type's displayName against a
    //    narrative that names a drug, which no conformant document will ever
    //    match. It was a constant, not a predicate. After, it fires on ONE of
    //    nine, exactly the row whose drug contradicts the narrative, which is
    //    the failure the code exists to catch and the one base reported
    //    identically to the clean document.
    //
    //    So eight rows lose it. TWO of those go WARNED TO SILENT ("clean single
    //    arm" and "single arm, empty code"), and TWO trade a safety-critical
    //    code for a tolerable one (MEDICATION_PRODUCT_ARM_UNEXPECTED,
    //    MEDICATION_PRODUCT_ARM_REPEATED). Both halves of the invariant are
    //    broken by those four rows and it is stated rather than hidden: what is
    //    removed is a false positive that fired on every well-formed document of
    //    this shape, not a signal. No row loses a PRODUCT warning, and the code
    //    that moved is now reachable on its subject for the first time.
    //
    //    THAT ENUMERATION IS THE MATRIX'S, NOT THE UNIVERSE'S. It counts the
    //    rows of THIS fixture, whose act <code> is an act type. A vendor writing
    //    a DRUG code into SubstanceAdministration.code, contradicting its own
    //    consumable, is a third warned-to-silent shape base reported and head
    //    does not. Head is still the safer answer there (base handed back a
    //    confidently wrong drug), and warning on it would mean treating that
    //    element as a rival drug assertion, the manufactured reading this area
    //    refuses, with no de-identified document to ground it. Stated, not
    //    quietly excluded.
    //
    // 4. `CCDA-PLANNED-CODE-SLOT` MOVED THREE OF THESE TWENTY-SEVEN ROWS, ALL IN
    //    ONE DIRECTION, measured by running this block against that slice's base
    //    `src/`. The three "single arm, empty code" rows each GAINED
    //    MISSING_CODE_VALUE; the other twenty-four came back BYTE-IDENTICAL, and
    //    so did the performed-medication matrix above. No row's reading changed
    //    at all: `checkCodeSlot` only emits, it selects nothing and withholds
    //    nothing, so unlike the two slices before it this one cannot break the
    //    invariant in either of its halves. State it plainly: no row goes from
    //    warned to silent, no row trades a safety-critical code for a weaker one,
    //    and no row stops handing back a code.
    const armShapes: readonly (readonly [string, string])[] = [
      ["clean single arm", MATERIAL_ARM],
      [
        // THE DEFECT. Base: code=18629005, silent.
        "two arms naming different drugs",
        `${MATERIAL_ARM}<manufacturedLabeledDrug><code code="${ASPIRIN}" codeSystem="${RXNORM}"/></manufacturedLabeledDrug>`,
      ],
      [
        "two arms naming the same drug",
        `${MATERIAL_ARM}<manufacturedLabeledDrug><code code="${LISINOPRIL}" codeSystem="${RXNORM}"/></manufacturedLabeledDrug>`,
      ],
      ["no code on any arm", "<manufacturedMaterial/>"],
      [
        "two materials agreeing",
        `${MATERIAL_ARM}<manufacturedMaterial><code code="${LISINOPRIL}" codeSystem="${RXNORM}"/></manufacturedMaterial>`,
      ],
      [
        "one material, two codes naming different drugs",
        `<manufacturedMaterial><code code="${LISINOPRIL}" codeSystem="${RXNORM}"/><code code="${ASPIRIN}" codeSystem="${RXNORM}"/></manufacturedMaterial>`,
      ],
      [
        "single arm, translation only",
        `<manufacturedMaterial><code nullFlavor="OTH"><translation code="${LISINOPRIL}" codeSystem="${RXNORM}"/></code></manufacturedMaterial>`,
      ],
      [
        // THE ROW `CCDA-PLANNED-CODE-SLOT` MOVED, and the ONLY shape here it
        // moves. An arm whose <code> asserts neither a symbol nor a nullFlavor
        // used to come back as a truthy but empty CD in TOTAL SILENCE, where the
        // performed twin drew MISSING_CODE_VALUE. It now draws it too, in all
        // three variants: three rows gain a safety-critical warning, none loses
        // one, and what is READ is byte-identical.
        "single arm, empty code (now slot-checked)",
        `<manufacturedMaterial><code/></manufacturedMaterial>`,
      ],
      [
        // THE ROW THAT MEASURES THE RECONCILIATION MOVE. Every other shape here
        // names the Lisinopril the narrative names; this one names Aspirin, so
        // the structured drug CONTRADICTS the narrative. Base reports it
        // identically to the clean row above, which is the whole problem.
        "single arm whose drug contradicts the narrative",
        `<manufacturedMaterial><code code="${ASPIRIN}" codeSystem="${RXNORM}" displayName="Aspirin"/></manufacturedMaterial>`,
      ],
    ];
    const variants: readonly (readonly [string, string])[] = [
      ["no act code", ""],
      ["act code present", ACT_CODE],
      ["act code + narrative", `${ACT_CODE}${TEXT_REF}`],
    ];
    const matrix = armShapes.flatMap(([name, arms]) =>
      variants.map(([label, extra]) => {
        const doc = parseCcda(buildCcda({ sections: plannedMed(arms, extra) }));
        const drug = doc.getPlannedItems().find((p) => p.kind === "medicationActivity")?.code;
        // CODE_NARRATIVE_MISMATCH is in the frame deliberately: it is the one
        // warning whose SUBJECT this change moves, from the act code's label to
        // the drug's, so a matrix that filtered it out could not measure the
        // thing most likely to go wrong here.
        //
        // MISSING_CODE_SYSTEM and MISSING_CODE_VALUE are in the frame because
        // this is where wiring the slot shows, and it did:
        // `CCDA-PLANNED-CODE-SLOT` moved exactly the three "single arm, empty
        // code" rows, each purely gaining MISSING_CODE_VALUE. Their absence from
        // the other twenty-four is a MEASUREMENT, not an assumption: every one of
        // those either names an RxNorm product (the `medication` binding expects
        // it) or asserts a nullFlavor, which is a complete statement and silent
        // by design. The dedicated slot matrix below is where the rest of the
        // newly-reachable codes are measured, against their performed twins.
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
        const read =
          drug === undefined
            ? "no CD"
            : `code=${drug.code ?? "none"} sys=${drug.codeSystem ?? "none"} nullFlavor=${drug.nullFlavor ?? "none"}`;
        return `${name} / ${label}: ${read} | ${said || "silent"}`;
      }),
    );
    expect(matrix).toMatchInlineSnapshot(`
      [
        "clean single arm / no act code: code=314076 sys=2.16.840.1.113883.6.88 nullFlavor=none | silent",
        "clean single arm / act code present: code=314076 sys=2.16.840.1.113883.6.88 nullFlavor=none | silent",
        "clean single arm / act code + narrative: code=314076 sys=2.16.840.1.113883.6.88 nullFlavor=none | silent",
        "two arms naming different drugs / no act code: no CD | MEDICATION_PRODUCT_ARM_CONFLICT MEDICATION_PRODUCT_ARM_UNEXPECTED",
        "two arms naming different drugs / act code present: no CD | MEDICATION_PRODUCT_ARM_CONFLICT MEDICATION_PRODUCT_ARM_UNEXPECTED",
        "two arms naming different drugs / act code + narrative: no CD | MEDICATION_PRODUCT_ARM_CONFLICT MEDICATION_PRODUCT_ARM_UNEXPECTED",
        "two arms naming the same drug / no act code: code=314076 sys=2.16.840.1.113883.6.88 nullFlavor=none | MEDICATION_PRODUCT_ARM_UNEXPECTED",
        "two arms naming the same drug / act code present: code=314076 sys=2.16.840.1.113883.6.88 nullFlavor=none | MEDICATION_PRODUCT_ARM_UNEXPECTED",
        "two arms naming the same drug / act code + narrative: code=314076 sys=2.16.840.1.113883.6.88 nullFlavor=none | MEDICATION_PRODUCT_ARM_UNEXPECTED",
        "no code on any arm / no act code: no CD | MISSING_PRODUCT_CODE",
        "no code on any arm / act code present: no CD | MISSING_PRODUCT_CODE",
        "no code on any arm / act code + narrative: no CD | MISSING_PRODUCT_CODE",
        "two materials agreeing / no act code: code=314076 sys=2.16.840.1.113883.6.88 nullFlavor=none | MEDICATION_PRODUCT_ARM_REPEATED",
        "two materials agreeing / act code present: code=314076 sys=2.16.840.1.113883.6.88 nullFlavor=none | MEDICATION_PRODUCT_ARM_REPEATED",
        "two materials agreeing / act code + narrative: code=314076 sys=2.16.840.1.113883.6.88 nullFlavor=none | MEDICATION_PRODUCT_ARM_REPEATED",
        "one material, two codes naming different drugs / no act code: no CD | MEDICATION_PRODUCT_ARM_CONFLICT MEDICATION_PRODUCT_CODE_REPEATED",
        "one material, two codes naming different drugs / act code present: no CD | MEDICATION_PRODUCT_ARM_CONFLICT MEDICATION_PRODUCT_CODE_REPEATED",
        "one material, two codes naming different drugs / act code + narrative: no CD | MEDICATION_PRODUCT_ARM_CONFLICT MEDICATION_PRODUCT_CODE_REPEATED",
        "single arm, translation only / no act code: code=none sys=none nullFlavor=OTH | MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY",
        "single arm, translation only / act code present: code=none sys=none nullFlavor=OTH | MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY",
        "single arm, translation only / act code + narrative: code=none sys=none nullFlavor=OTH | MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY",
        "single arm, empty code (now slot-checked) / no act code: code=none sys=none nullFlavor=none | MISSING_CODE_VALUE",
        "single arm, empty code (now slot-checked) / act code present: code=none sys=none nullFlavor=none | MISSING_CODE_VALUE",
        "single arm, empty code (now slot-checked) / act code + narrative: code=none sys=none nullFlavor=none | MISSING_CODE_VALUE",
        "single arm whose drug contradicts the narrative / no act code: code=1191 sys=2.16.840.1.113883.6.88 nullFlavor=none | silent",
        "single arm whose drug contradicts the narrative / act code present: code=1191 sys=2.16.840.1.113883.6.88 nullFlavor=none | silent",
        "single arm whose drug contradicts the narrative / act code + narrative: code=1191 sys=2.16.840.1.113883.6.88 nullFlavor=none | CODE_NARRATIVE_MISMATCH",
      ]
    `);
  });
});

/**
 * `CCDA-PLANNED-CODE-SLOT`. A `PlannedItem.code` on the `medicationActivity`
 * variant IS the drug, read from the same `consumable/manufacturedProduct` a
 * performed Medication Activity reads, but it was never handed to
 * `checkCodeSlot`, so the whole slot-check tier was unreachable there.
 *
 * The sharpest consequence, and the reason this is a slice rather than a tidy:
 * `MEDICATION_PRODUCT_ARM_UNEXPECTED` and `MEDICATION_PRODUCT_ARM_REPEATED` are
 * deliberately tolerable, and that rests on the claim that wherever they fire
 * without a `<code>` having been selected and read normally, an **unquietable**
 * companion fires beside them. On the shape where an arm's `<code>` asserts
 * neither a symbol nor a `nullFlavor`, the companion that claim names is
 * `MISSING_CODE_VALUE`. It could not fire here, so a planned medication with no
 * drug identity at all carried one profile-quietable warning, on the section
 * that says what a patient is about to be given.
 *
 * The bar this block measures is **parity**: a planned drug must draw exactly
 * what its performed twin draws, on the same arms, code for code. Anything
 * looser would be an invented binding rather than the one C-CDA already applies
 * to `Medication Information`.
 */
describe("clinical entries, the drug slot on a Planned Medication Activity", () => {
  const RXNORM = "2.16.840.1.113883.6.88";
  const SNOMED_CT = "2.16.840.1.113883.6.96";
  const NDC = "2.16.840.1.113883.6.69";
  /** ICD-9-CM diagnosis. Deprecated for the `problem` slot; merely UNEXPECTED here. */
  const ICD9_CM_DX = "2.16.840.1.113883.6.103";
  /** Lisinopril 10 MG Oral Tablet, the drug every fixture in this file uses. */
  const LISINOPRIL = "314076";
  /**
   * SNOMED CT "Administration of drug or medicament (procedure)", verified in
   * the block above. Reused here rather than minting a new SNOMED code: it is
   * exactly the wrong-slot mistake `UNEXPECTED_CODE_SYSTEM` exists to catch (an
   * act concept written into the consumable), and reusing a checked code avoids
   * a fourth instance of this area's fixture-code defect.
   */
  const ADMIN_OF_DRUG = "18629005";
  /**
   * A placeholder in NDC's 5-4-2 shape, carrying **no** `displayName`, so it
   * asserts no product identity for a label to be wrong about and this file
   * makes no claim about which drug (if any) it is assigned to. The row measures
   * one thing only: that the NDC OID is in the `medication` binding's expected
   * set, so a drug coded under it draws nothing. Deliberately not an RxNorm code,
   * because the clean row above already covers that half of the binding.
   */
  const PLACEHOLDER_NDC = "12345-6789-01";

  const material = (codeXml: string): string =>
    `<manufacturedMaterial>${codeXml}</manufacturedMaterial>`;

  /** One Planned Medication Activity, arms as given, no act `<code>` and no narrative. */
  const planned = (arms: string): string => `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.10" extension="2014-06-09"/>
          <code code="18776-5" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Plan of Treatment</title>
          <text><content ID="slot1">Lisinopril 10 MG Oral Tablet</content></text>
          <entry>
            <substanceAdministration classCode="SBADM" moodCode="INT">
              <templateId root="2.16.840.1.113883.10.20.22.4.42" extension="2014-06-09"/>
              <id root="2.16.840.1.113883.19.5.99999.20" extension="slot-plan-1"/>
              <statusCode code="active"/>
              <consumable><manufacturedProduct>${arms}</manufacturedProduct></consumable>
            </substanceAdministration>
          </entry>
        </section>
      </component>`;

  /**
   * The performed twin: the SAME arms on a Medication Activity. `doseQuantity`
   * and `routeCode` are present so the only warnings this document can raise are
   * the product + slot ones under measurement.
   */
  const performed = (arms: string): string => `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.1.1" extension="2015-08-01"/>
          <code code="10160-0" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Medications</title>
          <text><content ID="slot2">Lisinopril 10 MG Oral Tablet</content></text>
          <entry>
            <substanceAdministration classCode="SBADM" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.16" extension="2014-06-09"/>
              <id root="2.16.840.1.113883.19.5.99999.3" extension="slot-perf-1"/>
              <statusCode code="active"/>
              <routeCode code="C38288" codeSystem="2.16.840.1.113883.3.26.1.1" displayName="Oral"/>
              <doseQuantity value="10" unit="mg"/>
              <consumable><manufacturedProduct>${arms}</manufacturedProduct></consumable>
            </substanceAdministration>
          </entry>
        </section>
      </component>`;

  /**
   * The codes under measurement: the whole slot-check tier, the datatype-level
   * contradiction it sits beside, and every product warning, so a row that
   * traded one family for the other would be visible rather than filtered away.
   */
  const relevant = (warnings: readonly CcdaWarning[]): string[] =>
    codes(warnings)
      .filter(
        (c) =>
          c.startsWith("MEDICATION_PRODUCT") ||
          c === "MISSING_PRODUCT_CODE" ||
          c === "MISSING_CODE_VALUE" ||
          c === "MISSING_CODE_SYSTEM" ||
          c === "UNEXPECTED_CODE_SYSTEM" ||
          c === "DEPRECATED_CODE_SYSTEM" ||
          c === "SEMANTIC_CODE_INVALID" ||
          c === "CONTRADICTORY_NULL_FLAVOR",
      )
      .sort();

  const shapes: readonly (readonly [string, string])[] = [
    [
      "RxNorm drug, clean",
      material(
        `<code code="${LISINOPRIL}" codeSystem="${RXNORM}" displayName="Lisinopril 10 MG Oral Tablet"/>`,
      ),
    ],
    [
      "NDC drug, the binding's other expected system",
      material(`<code code="${PLACEHOLDER_NDC}" codeSystem="${NDC}"/>`),
    ],
    [
      // A SNOMED act concept written into the consumable: the wrong-slot mistake.
      "SNOMED concept in the drug slot",
      material(`<code code="${ADMIN_OF_DRUG}" codeSystem="${SNOMED_CT}"/>`),
    ],
    [
      // THE ROW THAT MEASURES WHAT IS *NOT* REACHABLE. ICD-9-CM is in the
      // `problem` slot's DEPRECATED list, which is why one might expect
      // DEPRECATED_CODE_SYSTEM here. The `medication` binding declares NO
      // deprecated systems, so it cannot fire at this slot on a PERFORMED
      // medication either, and this row draws UNEXPECTED_CODE_SYSTEM in both
      // columns. Four codes became reachable at this call site, not five.
      "ICD-9-CM OID on a drug",
      material(`<code code="401.9" codeSystem="${ICD9_CM_DX}"/>`),
    ],
    ["@code with no @codeSystem", material(`<code code="${LISINOPRIL}"/>`)],
    ["empty <code/>", material(`<code/>`)],
    ["@codeSystem with no @code", material(`<code codeSystem="${RXNORM}"/>`)],
    [
      "@codeSystem with no @code, and the wrong system",
      material(`<code codeSystem="${SNOMED_CT}"/>`),
    ],
    // A complete statement ("this drug is unknown"), silent by design at every slot.
    ["nullFlavor only", material(`<code nullFlavor="UNK"/>`)],
    [
      // The structural tier runs on the system even with no symbol asserted.
      "nullFlavor only, wrong system",
      material(`<code nullFlavor="UNK" codeSystem="${SNOMED_CT}"/>`),
    ],
    [
      // A nullFlavor beside an asserted symbol buys no silence: the symbol is
      // still unreadable without a system.
      "@code beside a nullFlavor, no system",
      material(`<code code="${LISINOPRIL}" nullFlavor="UNK"/>`),
    ],
    [
      // THE SHARPEST FORM, verbatim from the item. Before this slice: one
      // profile-quietable warning over a planned drug with NO identity at all.
      "labeled arm only, empty code",
      `<manufacturedLabeledDrug><code/></manufacturedLabeledDrug>`,
    ],
    ["two material arms, both empty codes", `${material(`<code/>`)}${material(`<code/>`)}`],
  ];

  it("pins the drug-slot matrix, planned against its performed twin, arm for arm", () => {
    // THE BASE-MEASURED MATRIX for this slice, twenty-six rows over thirteen
    // shapes. Measured by running this block against base `src/` rather than
    // argued.
    //
    // AGAINST BASE, ALL THIRTEEN `performed` ROWS COME BACK BYTE-IDENTICAL and
    // TEN OF THE THIRTEEN `planned` rows move, every one of them by GAINING the
    // slot code its performed twin was already drawing. ELEVEN codes across those
    // ten rows, counted per code rather than per row because one row gains two:
    // five MISSING_CODE_VALUE, four UNEXPECTED_CODE_SYSTEM, two
    // MISSING_CODE_SYSTEM. ("@codeSystem with no @code, and the wrong system" is
    // the row in two of those buckets.) The three that do not move are the two rows base
    // already got right (a clean RxNorm drug, an NDC drug) and the
    // nullFlavor-only row, which is a complete statement and silent at every slot
    // by design. Nothing is withdrawn anywhere, and that is not a claim but a
    // property of the change:
    // `checkCodeSlot` only emits. It selects nothing, returns nothing, and never
    // touches the `CD`, so no document can go from warned to silent here, no row
    // can trade a safety-critical code for a weaker one, and no row can stop
    // handing back a drug. That is the strongest form of the invariant this area
    // states, and this is the first slice in the series able to satisfy it whole.
    //
    // AFTER, THE TWO COLUMNS OF ALL THIRTEEN SHAPES AGREE EXACTLY, which is the
    // acceptance bar: a planned drug is the same coded value in the same
    // terminology at the same slot, so it must draw the same codes.
    //
    // The `read` column is in the frame for exactly that reason: it must be
    // identical in the two columns of every row and identical to base, and a
    // future change that "improves" the slot check into something that selects
    // would show up here first.
    const matrix = shapes.flatMap(([name, arms]) => {
      const p = parseCcda(buildCcda({ sections: planned(arms) }));
      const q = parseCcda(buildCcda({ sections: performed(arms) }));
      const drug = p.getPlannedItems().find((i) => i.kind === "medicationActivity")?.code;
      const perfDrug = q.getMedications()[0]?.drug;
      const render = (cd: CD | undefined, said: readonly string[]): string =>
        `${
          cd === undefined
            ? "no CD"
            : `code=${cd.code ?? "none"} sys=${cd.codeSystem ?? "none"} nullFlavor=${cd.nullFlavor ?? "none"}`
        } | ${said.join(" ") || "silent"}`;
      return [
        `${name} / planned:   ${render(drug, relevant(p.warnings))}`,
        `${name} / performed: ${render(perfDrug, relevant(q.warnings))}`,
      ];
    });
    expect(matrix).toMatchInlineSnapshot(`
      [
        "RxNorm drug, clean / planned:   code=314076 sys=2.16.840.1.113883.6.88 nullFlavor=none | silent",
        "RxNorm drug, clean / performed: code=314076 sys=2.16.840.1.113883.6.88 nullFlavor=none | silent",
        "NDC drug, the binding's other expected system / planned:   code=12345-6789-01 sys=2.16.840.1.113883.6.69 nullFlavor=none | silent",
        "NDC drug, the binding's other expected system / performed: code=12345-6789-01 sys=2.16.840.1.113883.6.69 nullFlavor=none | silent",
        "SNOMED concept in the drug slot / planned:   code=18629005 sys=2.16.840.1.113883.6.96 nullFlavor=none | UNEXPECTED_CODE_SYSTEM",
        "SNOMED concept in the drug slot / performed: code=18629005 sys=2.16.840.1.113883.6.96 nullFlavor=none | UNEXPECTED_CODE_SYSTEM",
        "ICD-9-CM OID on a drug / planned:   code=401.9 sys=2.16.840.1.113883.6.103 nullFlavor=none | UNEXPECTED_CODE_SYSTEM",
        "ICD-9-CM OID on a drug / performed: code=401.9 sys=2.16.840.1.113883.6.103 nullFlavor=none | UNEXPECTED_CODE_SYSTEM",
        "@code with no @codeSystem / planned:   code=314076 sys=none nullFlavor=none | MISSING_CODE_SYSTEM",
        "@code with no @codeSystem / performed: code=314076 sys=none nullFlavor=none | MISSING_CODE_SYSTEM",
        "empty <code/> / planned:   code=none sys=none nullFlavor=none | MISSING_CODE_VALUE",
        "empty <code/> / performed: code=none sys=none nullFlavor=none | MISSING_CODE_VALUE",
        "@codeSystem with no @code / planned:   code=none sys=2.16.840.1.113883.6.88 nullFlavor=none | MISSING_CODE_VALUE",
        "@codeSystem with no @code / performed: code=none sys=2.16.840.1.113883.6.88 nullFlavor=none | MISSING_CODE_VALUE",
        "@codeSystem with no @code, and the wrong system / planned:   code=none sys=2.16.840.1.113883.6.96 nullFlavor=none | MISSING_CODE_VALUE UNEXPECTED_CODE_SYSTEM",
        "@codeSystem with no @code, and the wrong system / performed: code=none sys=2.16.840.1.113883.6.96 nullFlavor=none | MISSING_CODE_VALUE UNEXPECTED_CODE_SYSTEM",
        "nullFlavor only / planned:   code=none sys=none nullFlavor=UNK | silent",
        "nullFlavor only / performed: code=none sys=none nullFlavor=UNK | silent",
        "nullFlavor only, wrong system / planned:   code=none sys=2.16.840.1.113883.6.96 nullFlavor=UNK | UNEXPECTED_CODE_SYSTEM",
        "nullFlavor only, wrong system / performed: code=none sys=2.16.840.1.113883.6.96 nullFlavor=UNK | UNEXPECTED_CODE_SYSTEM",
        "@code beside a nullFlavor, no system / planned:   code=314076 sys=none nullFlavor=UNK | CONTRADICTORY_NULL_FLAVOR MISSING_CODE_SYSTEM",
        "@code beside a nullFlavor, no system / performed: code=314076 sys=none nullFlavor=UNK | CONTRADICTORY_NULL_FLAVOR MISSING_CODE_SYSTEM",
        "labeled arm only, empty code / planned:   code=none sys=none nullFlavor=none | MEDICATION_PRODUCT_ARM_UNEXPECTED MISSING_CODE_VALUE",
        "labeled arm only, empty code / performed: code=none sys=none nullFlavor=none | MEDICATION_PRODUCT_ARM_UNEXPECTED MISSING_CODE_VALUE",
        "two material arms, both empty codes / planned:   code=none sys=none nullFlavor=none | MEDICATION_PRODUCT_ARM_REPEATED MISSING_CODE_VALUE",
        "two material arms, both empty codes / performed: code=none sys=none nullFlavor=none | MEDICATION_PRODUCT_ARM_REPEATED MISSING_CODE_VALUE",
      ]
    `);
  });

  it("draws the same codes on a planned drug as on a performed one, for every shape", () => {
    // The matrix above is the diffable artifact; this is the invariant itself,
    // asserted per shape so a failure names the shape rather than a snapshot
    // line. Parity is the whole bar: a planned drug is the same coded value in
    // the same terminology at the same slot, so it must draw the same codes.
    for (const [name, arms] of shapes) {
      const p = relevant(parseCcda(buildCcda({ sections: planned(arms) })).warnings);
      const q = relevant(parseCcda(buildCcda({ sections: performed(arms) })).warnings);
      expect(`${name}: ${p.join(" ")}`).toBe(`${name}: ${q.join(" ")}`);
    }
  });

  it("reaches the semantic tier too, when a caller supplies a terminology adapter", () => {
    // The fifth code the slot check gates. It needs a bring-your-own adapter, so
    // it cannot appear in the matrix above (which parses with none), but it is
    // newly reachable on a planned drug exactly as the four structural ones are.
    const rejecting = { validateCode: () => ({ result: false }) };
    const arms = material(`<code code="${LISINOPRIL}" codeSystem="${RXNORM}"/>`);
    const xml = buildCcda({ sections: planned(arms) });

    expect(codes(parseCcda(xml).warnings)).not.toContain(WARNING_CODES.SEMANTIC_CODE_INVALID);
    const checked = parseCcda(xml, { terminology: rejecting });
    expect(codes(checked.warnings)).toContain(WARNING_CODES.SEMANTIC_CODE_INVALID);
    // Surfaced, never coerced: the code itself is untouched.
    expect(checked.getPlannedItems().find((i) => i.kind === "medicationActivity")?.code?.code).toBe(
      LISINOPRIL,
    );
  });

  it("is not reachable through the act <code> on the other five planned kinds", () => {
    // The wiring is scoped to the one variant whose `code` is a drug. A planned
    // observation carries LOINC, a planned encounter CPT, a planned act/procedure/
    // supply SNOMED, and none of the five bound CodeSlots binds any of those, so
    // checking them would mean inventing a binding this repo cannot cite.
    const doc = parseCcda(buildCcda({ sections: PLAN_OF_TREATMENT_SECTION }));
    const said = relevant(doc.warnings);
    expect(said).toStrictEqual([]);
    // And the LOINC/CPT/SNOMED act codes are still read, unflagged.
    const byKind = new Map(doc.getPlannedItems().map((i) => [i.kind, i.code?.code]));
    expect(byKind.get("observation")).toBe("58410-2");
    expect(byKind.get("encounter")).toBe("99213");
    expect(byKind.get("supply")).toBe("58938008");
  });
});
