/**
 * Discrete-data extraction tests — Results, Vital Signs, and Immunizations (the
 * Phase 3 sections). Covers happy-path extraction with units intact, the
 * UCUM unit warnings (never normalized away), reference-range handling, the
 * polymorphic observation `value`, deprecated-LOINC flagging, and the
 * immunization refused/CVX paths. Every fixture is synthetic ("Jane Doe").
 */

import { describe, expect, it } from "vitest";

import { parseCcda, WARNING_CODES, type CcdaWarning } from "../src/index.js";
import {
  buildCcda,
  RESULTS_SECTION,
  VITALS_SECTION,
  IMMUNIZATIONS_SECTION,
} from "./__fixtures__/ccda.js";

function codes(warnings: readonly CcdaWarning[]): string[] {
  return warnings.map((w) => w.code);
}

/** Replace the Hemoglobin result `<value>` with an arbitrary value element. */
function withResultValue(valueXml: string): string {
  return buildCcda({ sections: RESULTS_SECTION }).replace(
    '<value xsi:type="PQ" value="13.5" unit="g/dL"/>',
    valueXml,
  );
}

/**
 * A Results section with a bare Result Organizer + Observation — no organizer
 * `code`/`statusCode`, no result `code`/`value`/`interpretation`/`effectiveTime`/
 * `referenceRange`/narrative — exercising every "field absent" branch.
 */
const MINIMAL_RESULTS_SECTION = `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.3.1" extension="2015-08-01"/>
          <code code="30954-2" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Results</title>
          <text>Results.</text>
          <entry>
            <organizer classCode="BATTERY" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.1" extension="2015-08-01"/>
              <component>
                <observation classCode="OBS" moodCode="EVN">
                  <templateId root="2.16.840.1.113883.10.20.22.4.2" extension="2015-08-01"/>
                </observation>
              </component>
            </organizer>
          </entry>
        </section>
      </component>`;

/** A Vital Signs section with a bare organizer + observation (every field absent). */
const MINIMAL_VITALS_SECTION = `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.4.1" extension="2015-08-01"/>
          <code code="8716-3" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Vital Signs</title>
          <text>Vitals.</text>
          <entry>
            <organizer classCode="CLUSTER" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.26" extension="2015-08-01"/>
              <component>
                <observation classCode="OBS" moodCode="EVN">
                  <templateId root="2.16.840.1.113883.10.20.22.4.27" extension="2015-08-01"/>
                </observation>
              </component>
            </organizer>
          </entry>
        </section>
      </component>`;

/** An Immunizations section with a bare activity — no vaccine/dose/route/date/narrative. */
const MINIMAL_IMMUNIZATIONS_SECTION = `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.2.1" extension="2015-08-01"/>
          <code code="11369-6" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Immunizations</title>
          <text>Immunizations.</text>
          <entry>
            <substanceAdministration classCode="SBADM" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.52" extension="2015-08-01"/>
            </substanceAdministration>
          </entry>
        </section>
      </component>`;

describe("results — Tier-1 extraction", () => {
  it("extracts a Result Organizer with a UCUM-checked value and reference range", () => {
    const doc = parseCcda(buildCcda({ sections: RESULTS_SECTION, mrnAssigningAuthority: true }));
    const panel = doc.getResults()[0];
    expect(panel?.code?.code).toBe("58410-2");
    expect(panel?.statusCode).toBe("completed");
    const result = panel?.results[0];
    expect(result?.code?.code).toBe("718-7");
    expect(result?.value?.kind).toBe("physicalQuantity");
    if (result?.value?.kind === "physicalQuantity") {
      expect(result.value.quantity.value).toBe(13.5);
      expect(result.value.quantity.unit).toBe("g/dL");
    }
    expect(result?.referenceRange?.low?.value).toBe(12);
    expect(result?.referenceRange?.high?.value).toBe(16);
    expect(result?.interpretation?.code).toBe("N");
    expect(result?.narrative).toBe("Hemoglobin 13.5 g/dL");
    // A clean, valid-UCUM result panel produces no warnings.
    expect(doc.warnings).toHaveLength(0);
  });

  it("flags a non-UCUM unit but preserves it verbatim, never normalizing", () => {
    const xml = buildCcda({ sections: RESULTS_SECTION }).replace(
      'value="13.5" unit="g/dL"',
      'value="13.5" unit="grams/dL"',
    );
    const doc = parseCcda(xml);
    const result = doc.getResults()[0]?.results[0];
    expect(result?.value?.kind).toBe("physicalQuantity");
    if (result?.value?.kind === "physicalQuantity") {
      expect(result.value.quantity.unit).toBe("grams/dL");
    }
    expect(codes(doc.warnings)).toContain(WARNING_CODES.NON_UCUM_UNIT);
  });

  it("flags a case-suspect unit slip", () => {
    const xml = buildCcda({ sections: RESULTS_SECTION }).replace(
      'value="13.5" unit="g/dL"',
      'value="13.5" unit="G/DL"',
    );
    expect(codes(parseCcda(xml).warnings)).toContain(WARNING_CODES.UCUM_CASE_SUSPECT);
  });

  it("flags a numeric value with no unit at all", () => {
    const xml = buildCcda({ sections: RESULTS_SECTION }).replace(
      'value="13.5" unit="g/dL"',
      'value="13.5"',
    );
    expect(codes(parseCcda(xml).warnings)).toContain(WARNING_CODES.MISSING_UNIT_ON_PQ);
  });

  it("flags a free-text-only reference range", () => {
    const xml = buildCcda({ sections: RESULTS_SECTION }).replace(
      'xsi:type="IVL_PQ"',
      'xsi:type="ST"',
    );
    expect(codes(parseCcda(xml).warnings)).toContain(WARNING_CODES.FREE_TEXT_REFERENCE_RANGE);
  });

  it("preserves an unhandled value xsi:type as unsupported, flagging it", () => {
    const xml = buildCcda({ sections: RESULTS_SECTION })
      .replace('value="13.5" unit="g/dL"', "")
      .replace('xsi:type="PQ"', 'xsi:type="RTO"');
    const doc = parseCcda(xml);
    expect(doc.getResults()[0]?.results[0]?.value?.kind).toBe("unsupported");
    expect(codes(doc.warnings)).toContain(WARNING_CODES.RESULT_VALUE_TYPE_UNHANDLED);
  });

  it("flags a deprecated LOINC result code", () => {
    const xml = buildCcda({ sections: RESULTS_SECTION }).replace('code="718-7"', 'code="41909-3"');
    expect(codes(parseCcda(xml).warnings)).toContain(WARNING_CODES.DEPRECATED_LOINC);
  });

  it("does not flag a deprecated-looking code in a non-LOINC system", () => {
    const xml = buildCcda({ sections: RESULTS_SECTION }).replace(
      'code="718-7" codeSystem="2.16.840.1.113883.6.1"',
      'code="41909-3" codeSystem="2.16.840.1.113883.6.96"',
    );
    expect(codes(parseCcda(xml).warnings)).not.toContain(WARNING_CODES.DEPRECATED_LOINC);
  });

  it("reads a reference range with only a low bound", () => {
    const xml = buildCcda({ sections: RESULTS_SECTION }).replace(
      '<high value="16" unit="g/dL"/>',
      "",
    );
    const range = parseCcda(xml).getResults()[0]?.results[0]?.referenceRange;
    expect(range?.low?.value).toBe(12);
    expect(range?.high).toBeUndefined();
  });

  it("preserves a free-text reference range alongside the free-text warning", () => {
    const xml = buildCcda({ sections: RESULTS_SECTION }).replace(
      /<referenceRange>[\s\S]*?<\/referenceRange>/,
      "<referenceRange><observationRange><text>12-16 g/dL</text></observationRange></referenceRange>",
    );
    const doc = parseCcda(xml);
    const range = doc.getResults()[0]?.results[0]?.referenceRange;
    expect(range?.text).toBe("12-16 g/dL");
    expect(codes(doc.warnings)).toContain(WARNING_CODES.FREE_TEXT_REFERENCE_RANGE);
  });

  it("yields an empty results array for a document with no results", () => {
    expect(parseCcda(buildCcda()).getResults()).toEqual([]);
  });
});

describe("results — polymorphic observation value", () => {
  it("reads a coded (CD) result value", () => {
    const xml = withResultValue(
      '<value xsi:type="CD" code="260385009" codeSystem="2.16.840.1.113883.6.96" displayName="Negative"/>',
    );
    const value = parseCcda(xml).getResults()[0]?.results[0]?.value;
    expect(value?.kind).toBe("coded");
    if (value?.kind === "coded") expect(value.code.code).toBe("260385009");
  });

  it("reads a free-text (ST) result value", () => {
    const xml = withResultValue('<value xsi:type="ST">Positive</value>');
    const value = parseCcda(xml).getResults()[0]?.results[0]?.value;
    expect(value?.kind).toBe("string");
    if (value?.kind === "string") expect(value.value).toBe("Positive");
  });

  it("reads an IVL_PQ range result value, UCUM-checking both bounds", () => {
    const xml = withResultValue(
      '<value xsi:type="IVL_PQ"><low value="1" unit="mg"/><high value="2" unit="mg"/></value>',
    );
    const value = parseCcda(xml).getResults()[0]?.results[0]?.value;
    expect(value?.kind).toBe("range");
    if (value?.kind === "range") {
      expect(value.range.low?.value).toBe(1);
      expect(value.range.high?.value).toBe(2);
    }
  });

  it("infers a quantity from an untyped value carrying @value", () => {
    const xml = withResultValue('<value value="13.5" unit="g/dL"/>');
    expect(parseCcda(xml).getResults()[0]?.results[0]?.value?.kind).toBe("physicalQuantity");
  });

  it("infers a coded value from an untyped value carrying @code", () => {
    const xml = withResultValue('<value code="260385009" codeSystem="2.16.840.1.113883.6.96"/>');
    expect(parseCcda(xml).getResults()[0]?.results[0]?.value?.kind).toBe("coded");
  });

  it("preserves an untyped value with no code/value as unsupported, silently", () => {
    const xml = withResultValue("<value/>");
    const doc = parseCcda(xml);
    expect(doc.getResults()[0]?.results[0]?.value?.kind).toBe("unsupported");
    // An untyped value carries no xsi:type to report, so nothing is flagged.
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.RESULT_VALUE_TYPE_UNHANDLED);
  });

  it("reads a reference range expressed directly on referenceRange (no observationRange)", () => {
    const xml = buildCcda({ sections: RESULTS_SECTION }).replace(
      /<referenceRange>[\s\S]*?<\/referenceRange>/,
      '<referenceRange><value xsi:type="IVL_PQ"><low value="12" unit="g/dL"/><high value="16" unit="g/dL"/></value></referenceRange>',
    );
    const range = parseCcda(xml).getResults()[0]?.results[0]?.referenceRange;
    expect(range?.low?.value).toBe(12);
    expect(range?.high?.value).toBe(16);
  });

  it("extracts a bare Result Organizer with every optional field absent", () => {
    const doc = parseCcda(buildCcda({ sections: MINIMAL_RESULTS_SECTION }));
    const panel = doc.getResults()[0];
    expect(panel?.code).toBeUndefined();
    expect(panel?.statusCode).toBeUndefined();
    const result = panel?.results[0];
    expect(result?.code).toBeUndefined();
    expect(result?.value).toBeUndefined();
    expect(result?.referenceRange).toBeUndefined();
    expect(result?.interpretation).toBeUndefined();
    expect(result?.narrative).toBeUndefined();
  });
});

describe("vital signs — Tier-1 extraction", () => {
  it("extracts a Vital Signs Organizer with a UCUM-checked PQ value", () => {
    const doc = parseCcda(buildCcda({ sections: VITALS_SECTION, mrnAssigningAuthority: true }));
    const cluster = doc.getVitals()[0];
    expect(cluster?.statusCode).toBe("completed");
    const vital = cluster?.vitals[0];
    expect(vital?.code?.code).toBe("8480-6");
    expect(vital?.value?.kind).toBe("physicalQuantity");
    if (vital?.value?.kind === "physicalQuantity") {
      expect(vital.value.quantity.value).toBe(120);
      expect(vital.value.quantity.unit).toBe("mm[Hg]");
    }
    expect(vital?.effectiveTime?.value?.date).toBeInstanceOf(Date);
    expect(doc.warnings).toHaveLength(0);
  });

  it("flags a non-UCUM vital unit, preserving it", () => {
    const xml = buildCcda({ sections: VITALS_SECTION }).replace('unit="mm[Hg]"', 'unit="mmHg"');
    const doc = parseCcda(xml);
    const vital = doc.getVitals()[0]?.vitals[0];
    if (vital?.value?.kind === "physicalQuantity") {
      expect(vital.value.quantity.unit).toBe("mmHg");
    }
    expect(codes(doc.warnings)).toContain(WARNING_CODES.NON_UCUM_UNIT);
  });

  it("extracts a bare Vital Signs Organizer with every optional field absent", () => {
    const doc = parseCcda(buildCcda({ sections: MINIMAL_VITALS_SECTION }));
    const cluster = doc.getVitals()[0];
    expect(cluster?.code).toBeUndefined();
    expect(cluster?.statusCode).toBeUndefined();
    const vital = cluster?.vitals[0];
    expect(vital?.code).toBeUndefined();
    expect(vital?.value).toBeUndefined();
    expect(vital?.interpretation).toBeUndefined();
    expect(vital?.effectiveTime).toBeUndefined();
    expect(vital?.narrative).toBeUndefined();
  });

  it("yields an empty vitals array for a document with no vital signs", () => {
    expect(parseCcda(buildCcda()).getVitals()).toEqual([]);
  });
});

describe("immunizations — Tier-1 extraction", () => {
  it("extracts an Immunization Activity with its CVX vaccine, dose, and route", () => {
    const doc = parseCcda(
      buildCcda({ sections: IMMUNIZATIONS_SECTION, mrnAssigningAuthority: true }),
    );
    const imm = doc.getImmunizations()[0];
    expect(imm?.vaccine?.code).toBe("140");
    expect(imm?.dose?.value).toBe(0.5);
    expect(imm?.dose?.unit).toBe("mL");
    expect(imm?.route?.code).toBe("C28161");
    expect(imm?.effectiveTime?.value?.date).toBeInstanceOf(Date);
    expect(imm?.refused).toBeUndefined();
    expect(doc.warnings).toHaveLength(0);
  });

  it("models a refused immunization as negated and flags it", () => {
    const xml = buildCcda({ sections: IMMUNIZATIONS_SECTION }).replace(
      '<substanceAdministration classCode="SBADM" moodCode="EVN">',
      '<substanceAdministration classCode="SBADM" moodCode="EVN" negationInd="true">',
    );
    const doc = parseCcda(xml);
    expect(doc.getImmunizations()[0]?.refused).toBe(true);
    expect(codes(doc.warnings)).toContain(WARNING_CODES.IMMUNIZATION_REFUSED);
  });

  it("flags an unexpected code system for the vaccine slot", () => {
    const xml = buildCcda({ sections: IMMUNIZATIONS_SECTION }).replace(
      'codeSystem="2.16.840.1.113883.12.292"',
      'codeSystem="2.16.840.1.113883.6.96"',
    );
    expect(codes(parseCcda(xml).warnings)).toContain(WARNING_CODES.UNEXPECTED_CODE_SYSTEM);
  });

  it("extracts a bare Immunization Activity with every optional field absent", () => {
    const doc = parseCcda(buildCcda({ sections: MINIMAL_IMMUNIZATIONS_SECTION }));
    const imm = doc.getImmunizations()[0];
    expect(imm?.vaccine).toBeUndefined();
    expect(imm?.dose).toBeUndefined();
    expect(imm?.route).toBeUndefined();
    expect(imm?.effectiveTime).toBeUndefined();
    expect(imm?.refused).toBeUndefined();
    expect(imm?.narrative).toBeUndefined();
  });

  it("yields an empty immunizations array for a document with no immunizations", () => {
    expect(parseCcda(buildCcda()).getImmunizations()).toEqual([]);
  });
});
