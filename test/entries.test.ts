/**
 * Clinical-entry extraction tests — the Phase 2 reconciliation triad (Problems,
 * Medications, Allergies). Covers Tier-1 happy-path extraction, the
 * safety-critical distinctions (negation vs nullFlavor, code vs narrative, dose/
 * route presence, concern status), and the code-system slot warnings. Every
 * fixture is synthetic (the canonical "Jane Doe"), per the PHI-by-default rule.
 */

import { describe, expect, it } from "vitest";

import { parseCcda, WARNING_CODES, type CcdaWarning } from "../src/index.js";
import {
  buildCcda,
  PROBLEMS_SECTION,
  MEDICATIONS_SECTION,
  ALLERGY_ENTRY_SECTION,
  NKA_SECTION,
  TRIAD_SECTIONS,
} from "./__fixtures__/ccda.js";

function codes(warnings: readonly CcdaWarning[]): string[] {
  return warnings.map((w) => w.code);
}

describe("clinical entries — Tier-1 extraction", () => {
  it("extracts all three triad members from a clean document", () => {
    const doc = parseCcda(buildCcda({ sections: TRIAD_SECTIONS, mrnAssigningAuthority: true }));
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

describe("clinical entries — safety-critical distinctions", () => {
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

describe("clinical entries — code-system + dosing warnings", () => {
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

describe("clinical entries — field-level fidelity", () => {
  it("preserves a negated problem as distinct from an unknown one", () => {
    const xml = buildCcda({ sections: PROBLEMS_SECTION }).replace(
      '<observation classCode="OBS" moodCode="EVN">\n                  <templateId root="2.16.840.1.113883.10.20.22.4.4"',
      '<observation classCode="OBS" moodCode="EVN" negationInd="true">\n                  <templateId root="2.16.840.1.113883.10.20.22.4.4"',
    );
    const problem = parseCcda(xml).getProblems()[0]?.problems[0];
    expect(problem?.negated).toBe(true);
    expect(problem?.nullFlavor).toBeUndefined();
    // The coded value is still carried verbatim — negation is a separate axis.
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

describe("clinical entries — placement + tolerance", () => {
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
