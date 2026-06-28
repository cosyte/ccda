/**
 * Phase 5 extraction tests — Procedures (with the safety-critical
 * performed-vs-planned `moodCode` split), Encounters, Social-History smoking
 * status, and the per-document-type required-section (SHALL) validation. Every
 * fixture is synthetic ("Jane Doe", fake OIDs) — no realistic PHI, per the
 * repo's PHI-by-default rule.
 */

import { describe, expect, it } from "vitest";

import {
  parseCcda,
  WARNING_CODES,
  missingRequiredSections,
  requiredSectionKeys,
  type CcdaWarning,
  type DocumentType,
} from "../src/index.js";
import {
  buildCcda,
  DOC_TYPES,
  PROCEDURES_SECTION,
  PLANNED_PROCEDURE_SECTION,
  ENCOUNTERS_SECTION,
  SOCIAL_HISTORY_SECTION,
  SMOKING_UNKNOWN_SECTION,
  PROBLEMS_SECTION,
  MEDICATIONS_SECTION,
  ALLERGY_ENTRY_SECTION,
  RESULTS_SECTION,
} from "./__fixtures__/ccda.js";

function codes(warnings: readonly CcdaWarning[]): string[] {
  return warnings.map((w) => w.code);
}

/** The OID for a recognized document type's template (from the fixture table). */
function oidFor(key: string): string {
  const entry = DOC_TYPES.find((d) => d.key === key);
  if (entry === undefined) throw new Error(`no fixture OID for ${key}`);
  return entry.oid;
}

/** A minimal Procedures section carrying a bare procedure with no moodCode. */
const MINIMAL_PROCEDURE_SECTION = `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.7.1" extension="2014-06-09"/>
          <code code="47519-4" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Procedures</title>
          <text>Procedures.</text>
          <entry>
            <procedure classCode="PROC">
              <templateId root="2.16.840.1.113883.10.20.22.4.14" extension="2014-06-09"/>
            </procedure>
          </entry>
        </section>
      </component>`;

/** A Procedures section carrying the non-altering `<act>` variant (…22.4.12). */
const PROCEDURE_ACT_SECTION = `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.7.1" extension="2014-06-09"/>
          <code code="47519-4" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Procedures</title>
          <text>Dressing change.</text>
          <entry>
            <act classCode="ACT" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.12" extension="2014-06-09"/>
              <id root="2.16.840.1.113883.19.5.99999.9" extension="proc-act-1"/>
              <code code="34896006" codeSystem="2.16.840.1.113883.6.96" displayName="Wound dressing change"/>
              <statusCode code="completed"/>
            </act>
          </entry>
        </section>
      </component>`;

/** A Procedures section carrying the assessment `<observation>` variant (…22.4.13). */
const PROCEDURE_OBSERVATION_SECTION = `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.7.1" extension="2014-06-09"/>
          <code code="47519-4" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Procedures</title>
          <text>Visual acuity.</text>
          <entry>
            <observation classCode="OBS" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.13" extension="2014-06-09"/>
              <id root="2.16.840.1.113883.19.5.99999.9" extension="proc-obs-1"/>
              <code code="36228007" codeSystem="2.16.840.1.113883.6.96" displayName="Ophthalmic examination"/>
              <statusCode code="completed"/>
              <value xsi:type="CD" code="260388006" codeSystem="2.16.840.1.113883.6.96" displayName="Normal"/>
            </observation>
          </entry>
        </section>
      </component>`;

/** A minimal Encounters section carrying a bare encounter (every field absent). */
const MINIMAL_ENCOUNTERS_SECTION = `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.22.1" extension="2015-08-01"/>
          <code code="46240-8" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Encounters</title>
          <text>Encounters.</text>
          <entry>
            <encounter classCode="ENC" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.49" extension="2015-08-01"/>
            </encounter>
          </entry>
        </section>
      </component>`;

/** A Social History section whose smoking value falls outside the value set. */
const SMOKING_OFF_VALUESET_SECTION = `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.17"/>
          <code code="29762-2" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Social History</title>
          <text>Smoking status.</text>
          <entry>
            <observation classCode="OBS" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.78" extension="2014-06-09"/>
              <code code="72166-2" codeSystem="2.16.840.1.113883.6.1"/>
              <statusCode code="completed"/>
              <value xsi:type="CD" code="999999999" codeSystem="2.16.840.1.113883.6.96" displayName="Bogus"/>
            </observation>
          </entry>
        </section>
      </component>`;

/** A Social History section whose smoking value is a nullFlavor (unknown). */
const SMOKING_NULLFLAVOR_SECTION = `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.17"/>
          <code code="29762-2" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Social History</title>
          <text>Smoking status not recorded.</text>
          <entry>
            <observation classCode="OBS" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.78" extension="2014-06-09"/>
              <code code="72166-2" codeSystem="2.16.840.1.113883.6.1"/>
              <statusCode code="completed"/>
              <value xsi:type="CD" nullFlavor="UNK"/>
            </observation>
          </entry>
        </section>
      </component>`;

describe("procedures — performed vs planned (moodCode)", () => {
  it("extracts a performed procedure (EVN) with code, status, time, narrative", () => {
    const doc = parseCcda(
      buildCcda({
        docTypeOid: oidFor("progressNote"),
        sections: PROCEDURES_SECTION,
        mrnAssigningAuthority: true,
      }),
    );
    const proc = doc.getProcedures()[0];
    expect(proc?.kind).toBe("procedure");
    expect(proc?.disposition).toBe("performed");
    expect(proc?.moodCode).toBe("EVN");
    expect(proc?.code?.code).toBe("80146002");
    expect(proc?.statusCode).toBe("completed");
    expect(proc?.effectiveTime?.value?.date).toBeInstanceOf(Date);
    expect(proc?.narrative).toBe("Appendectomy");
    expect(doc.warnings).toHaveLength(0);
  });

  it("classifies a planned procedure (INT) as planned, never performed", () => {
    const doc = parseCcda(buildCcda({ sections: PLANNED_PROCEDURE_SECTION }));
    const proc = doc.getProcedures()[0];
    expect(proc?.disposition).toBe("planned");
    expect(proc?.moodCode).toBe("INT");
  });

  it("flags a procedure with no moodCode as ambiguous, leaving disposition undefined", () => {
    const doc = parseCcda(buildCcda({ sections: MINIMAL_PROCEDURE_SECTION }));
    const proc = doc.getProcedures()[0];
    expect(proc?.disposition).toBeUndefined();
    expect(proc?.moodCode).toBeUndefined();
    expect(codes(doc.warnings)).toContain(WARNING_CODES.PLANNED_VS_PERFORMED_AMBIGUOUS);
  });

  it("flags an unrecognized moodCode, leaving disposition undefined", () => {
    const xml = buildCcda({ sections: PROCEDURES_SECTION }).replace(
      '<procedure classCode="PROC" moodCode="EVN">',
      '<procedure classCode="PROC" moodCode="GOL">',
    );
    const doc = parseCcda(xml);
    const proc = doc.getProcedures()[0];
    expect(proc?.disposition).toBeUndefined();
    expect(proc?.moodCode).toBe("GOL");
    expect(codes(doc.warnings)).toContain(WARNING_CODES.PROCEDURE_MOOD_UNEXPECTED);
  });

  it("extracts the non-altering act variant", () => {
    const doc = parseCcda(buildCcda({ sections: PROCEDURE_ACT_SECTION }));
    const proc = doc.getProcedures()[0];
    expect(proc?.kind).toBe("act");
    expect(proc?.code?.code).toBe("34896006");
    expect(proc?.disposition).toBe("performed");
  });

  it("extracts the assessment observation variant, reading its coded value", () => {
    const doc = parseCcda(buildCcda({ sections: PROCEDURE_OBSERVATION_SECTION }));
    const proc = doc.getProcedures()[0];
    expect(proc?.kind).toBe("observation");
    expect(proc?.value?.kind).toBe("coded");
    if (proc?.value?.kind === "coded") expect(proc.value.code.code).toBe("260388006");
  });

  it("models a negated procedure as negated, distinct from nullFlavor", () => {
    const xml = buildCcda({ sections: PROCEDURES_SECTION }).replace(
      '<procedure classCode="PROC" moodCode="EVN">',
      '<procedure classCode="PROC" moodCode="EVN" negationInd="true">',
    );
    const proc = parseCcda(xml).getProcedures()[0];
    expect(proc?.negated).toBe(true);
    expect(proc?.nullFlavor).toBeUndefined();
  });

  it("yields an empty procedures array for a document with no procedures", () => {
    expect(parseCcda(buildCcda()).getProcedures()).toEqual([]);
  });
});

describe("encounters — Tier-1 extraction", () => {
  it("extracts an Encounter Activity with type code, status, and visit period", () => {
    const doc = parseCcda(
      buildCcda({
        docTypeOid: oidFor("progressNote"),
        sections: ENCOUNTERS_SECTION,
        mrnAssigningAuthority: true,
      }),
    );
    const enc = doc.getEncounters()[0];
    expect(enc?.code?.code).toBe("99213");
    expect(enc?.statusCode).toBe("completed");
    expect(enc?.moodCode).toBe("EVN");
    expect(enc?.effectiveTime?.low?.date).toBeInstanceOf(Date);
    expect(enc?.narrative).toBe("Office outpatient visit");
    expect(doc.warnings).toHaveLength(0);
  });

  it("extracts a bare Encounter Activity with every optional field absent", () => {
    const enc = parseCcda(buildCcda({ sections: MINIMAL_ENCOUNTERS_SECTION })).getEncounters()[0];
    expect(enc?.code).toBeUndefined();
    expect(enc?.statusCode).toBeUndefined();
    expect(enc?.effectiveTime).toBeUndefined();
    expect(enc?.narrative).toBeUndefined();
  });

  it("yields an empty encounters array for a document with no encounters", () => {
    expect(parseCcda(buildCcda()).getEncounters()).toEqual([]);
  });
});

describe("social history — smoking status", () => {
  it("extracts a known smoking-status value, not flagged unknown", () => {
    const doc = parseCcda(
      buildCcda({
        docTypeOid: oidFor("progressNote"),
        sections: SOCIAL_HISTORY_SECTION,
        mrnAssigningAuthority: true,
      }),
    );
    const smk = doc.getSmokingStatus()[0];
    expect(smk?.value?.code).toBe("8517006");
    expect(smk?.unknown).toBe(false);
    expect(smk?.effectiveTime?.value?.date).toBeInstanceOf(Date);
    expect(smk?.narrative).toBe("Former smoker");
    expect(doc.warnings).toHaveLength(0);
  });

  it("marks an explicitly-unknown SNOMED concept as unknown and flags it", () => {
    const doc = parseCcda(buildCcda({ sections: SMOKING_UNKNOWN_SECTION }));
    const smk = doc.getSmokingStatus()[0];
    expect(smk?.unknown).toBe(true);
    expect(smk?.value?.code).toBe("266927001");
    expect(codes(doc.warnings)).toContain(WARNING_CODES.SMOKING_STATUS_UNKNOWN);
  });

  it("marks a nullFlavor value as unknown and flags it", () => {
    const doc = parseCcda(buildCcda({ sections: SMOKING_NULLFLAVOR_SECTION }));
    const smk = doc.getSmokingStatus()[0];
    expect(smk?.unknown).toBe(true);
    expect(codes(doc.warnings)).toContain(WARNING_CODES.SMOKING_STATUS_UNKNOWN);
  });

  it("flags a value outside the Current Smoking Status value set, not unknown", () => {
    const doc = parseCcda(buildCcda({ sections: SMOKING_OFF_VALUESET_SECTION }));
    const smk = doc.getSmokingStatus()[0];
    expect(smk?.unknown).toBe(false);
    expect(smk?.value?.code).toBe("999999999");
    expect(codes(doc.warnings)).toContain(WARNING_CODES.SMOKING_STATUS_CODE_UNRECOGNIZED);
  });

  it("yields an empty smoking-status array for a document with no social history", () => {
    expect(parseCcda(buildCcda()).getSmokingStatus()).toEqual([]);
  });
});

describe("required-section (SHALL) validation", () => {
  it("flags each required section a CCD is missing", () => {
    // The default allergies fixture carries allergies + a nested problems
    // section, so a CCD is still missing medications + results.
    const doc = parseCcda(buildCcda());
    const missing = doc.warnings.filter((w) => w.code === WARNING_CODES.REQUIRED_SECTION_MISSING);
    const messaged = missing.map((w) => w.message);
    expect(messaged.some((m) => m.includes("medications"))).toBe(true);
    expect(messaged.some((m) => m.includes("results"))).toBe(true);
    // allergies + problems are present, so neither is flagged.
    expect(messaged.some((m) => m.includes('"allergies"'))).toBe(false);
    expect(messaged.some((m) => m.includes('"problems"'))).toBe(false);
  });

  it("emits no required-section warning when every SHALL section is present", () => {
    const all = `${PROBLEMS_SECTION}${MEDICATIONS_SECTION}${ALLERGY_ENTRY_SECTION}${RESULTS_SECTION}`;
    const doc = parseCcda(buildCcda({ sections: all }));
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.REQUIRED_SECTION_MISSING);
  });

  it("asserts nothing for a document type with an empty SHALL table", () => {
    const doc = parseCcda(
      buildCcda({ docTypeOid: oidFor("progressNote"), sections: PROCEDURES_SECTION }),
    );
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.REQUIRED_SECTION_MISSING);
  });

  it("does not validate required sections for an unrecognized document type", () => {
    const doc = parseCcda(buildCcda({ docTypeOid: "1.2.3.4.5.6.7.8.9" }));
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.REQUIRED_SECTION_MISSING);
  });

  it("exposes the SHALL table via requiredSectionKeys", () => {
    expect(requiredSectionKeys("ccd")).toEqual(["allergies", "medications", "problems", "results"]);
    expect(requiredSectionKeys("progressNote")).toEqual([]);
  });

  it("computes the absent subset via missingRequiredSections", () => {
    expect(missingRequiredSections("ccd", new Set(["allergies", "problems"]))).toEqual([
      "medications",
      "results",
    ]);
    expect(
      missingRequiredSections("ccd", new Set(["allergies", "medications", "problems", "results"])),
    ).toEqual([]);
  });

  it("validates every recognized document type without throwing", () => {
    for (const { key } of DOC_TYPES) {
      const doc = parseCcda(buildCcda({ docTypeOid: oidFor(key) }));
      expect(doc.documentType).toBe(key as DocumentType);
    }
  });
});
