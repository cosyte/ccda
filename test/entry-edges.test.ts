/**
 * Clinical-entry paths the broader entry suites do not reach: optional parts left out of an
 * otherwise well-formed entry (no moodCode, no statusCode code, no reaction value), act-level
 * nullFlavors, bare and empty observation values, structural odds and ends (an `<entry>` that holds
 * no act, a `<component>` that holds no section, a narrative id nested below the first level), and
 * a narrative reference that is not a local `#id`. Each case is a synthetic variant of a fixture in
 * `__fixtures__/ccda.ts`, changed in the one place under test.
 */

import { describe, expect, it } from "vitest";
import { DOMParser } from "@xmldom/xmldom";
import type { Element } from "@xmldom/xmldom";

import {
  buildNarrativeIndex,
  checkUcumUnit,
  parseCcda,
  readObservationValue,
  readReferenceRange,
  V3_NS,
  WARNING_CODES,
  XSI_NS,
  type CcdaDocument,
  type CcdaWarning,
} from "../src/index.js";
import {
  ALLERGY_ENTRY_SECTION,
  buildCcda,
  ENCOUNTERS_SECTION,
  IMMUNIZATIONS_SECTION,
  MEDICATIONS_SECTION,
  MENTAL_STATUS_ASSESSMENT_SCALE_SECTION,
  NO_REQUIRED_SECTIONS_DOC_OID,
  PLAN_OF_TREATMENT_SECTION,
  PROBLEMS_SECTION,
  PROCEDURES_SECTION,
  RESULTS_SECTION,
  SOCIAL_HISTORY_SECTION,
  UNKNOWN_SECTION,
  VITALS_SECTION,
} from "./__fixtures__/ccda.js";

/** Parse a document of `sections` under a type with no required sections, so warnings are ours. */
function parse(sections: string): CcdaDocument {
  return parseCcda(
    buildCcda({ docTypeOid: NO_REQUIRED_SECTIONS_DOC_OID, mrnAssigningAuthority: true, sections }),
  );
}

/** Replace exactly one occurrence of `from` in `xml`, failing loudly if the fixture drifted. */
function swap(xml: string, from: string, to: string): string {
  const at = xml.indexOf(from);
  if (at === -1 || xml.indexOf(from, at + 1) !== -1) {
    throw new Error(`fixture does not contain exactly one ${JSON.stringify(from)}`);
  }
  return xml.slice(0, at) + to + xml.slice(at + from.length);
}

function codes(doc: CcdaDocument): string[] {
  return doc.warnings.map((w) => w.code);
}

function el(fragment: string): Element {
  const doc = new DOMParser().parseFromString(
    `<wrap xmlns="${V3_NS}" xmlns:xsi="${XSI_NS}">${fragment}</wrap>`,
    "application/xml",
  );
  const root = doc.documentElement;
  if (root === null || root.firstChild === null) throw new Error("fixture parse failed");
  return root.firstChild as Element;
}

function ctx(): { warnings: CcdaWarning[]; emit: (w: CcdaWarning) => void } {
  const warnings: CcdaWarning[] = [];
  return { warnings, emit: (w) => warnings.push(w) };
}

describe("allergy entries with optional parts left out", () => {
  it("reads an allergy observation with no propensity value as having no type", () => {
    const doc = parse(
      swap(
        ALLERGY_ENTRY_SECTION,
        `<value xsi:type="CD" code="416098002" codeSystem="2.16.840.1.113883.6.96" displayName="Drug allergy"/>`,
        "",
      ),
    );
    const allergy = doc.getAllergies()[0]?.allergies[0];
    expect(allergy?.type).toBeUndefined();
    expect(allergy?.allergen?.code).toBe("7980");
  });

  it("reads a reaction with no manifestation value, keeping its severity", () => {
    const doc = parse(
      swap(
        ALLERGY_ENTRY_SECTION,
        `<value xsi:type="CD" code="247472004" codeSystem="2.16.840.1.113883.6.96" displayName="Hives"/>`,
        "",
      ),
    );
    const reaction = doc.getAllergies()[0]?.allergies[0]?.reactions[0];
    expect(reaction?.manifestation).toBeUndefined();
    expect(reaction?.severity?.code).toBe("6736007");
  });
});

describe("act-level attributes that are absent or null-flavored", () => {
  it("reads an encounter with no moodCode", () => {
    const doc = parse(
      swap(
        ENCOUNTERS_SECTION,
        `<encounter classCode="ENC" moodCode="EVN">`,
        `<encounter classCode="ENC">`,
      ),
    );
    const encounter = doc.getEncounters()[0];
    expect(encounter?.moodCode).toBeUndefined();
    expect(encounter?.code?.code).toBe("99213");
  });

  it("reads an immunization with no moodCode and an act-level nullFlavor", () => {
    const doc = parse(
      swap(
        IMMUNIZATIONS_SECTION,
        `<substanceAdministration classCode="SBADM" moodCode="EVN">`,
        `<substanceAdministration classCode="SBADM" nullFlavor="UNK">`,
      ),
    );
    const immunization = doc.getImmunizations()[0];
    expect(immunization?.moodCode).toBeUndefined();
    expect(immunization?.nullFlavor).toBe("UNK");
    expect(immunization?.vaccine?.code).toBe("140");
  });

  it("reads a medication with no moodCode, an act-level nullFlavor and no statusCode", () => {
    const doc = parse(
      swap(
        swap(
          MEDICATIONS_SECTION,
          `<substanceAdministration classCode="SBADM" moodCode="EVN">`,
          `<substanceAdministration classCode="SBADM" nullFlavor="NI">`,
        ),
        `<statusCode code="active"/>`,
        "",
      ),
    );
    const med = doc.getMedications()[0];
    expect(med?.moodCode).toBeUndefined();
    expect(med?.nullFlavor).toBe("NI");
    expect(med?.statusCode).toBeUndefined();
    expect(med?.drug?.code).toBe("314076");
  });

  it("reads a procedure that carries an act-level nullFlavor", () => {
    const doc = parse(
      swap(
        PROCEDURES_SECTION,
        `<procedure classCode="PROC" moodCode="EVN">`,
        `<procedure classCode="PROC" moodCode="EVN" nullFlavor="NI">`,
      ),
    );
    expect(doc.getProcedures()[0]?.nullFlavor).toBe("NI");
  });

  it("reads a statusCode element that carries no code as no status", () => {
    const doc = parse(
      swap(PROCEDURES_SECTION, `<statusCode code="completed"/>`, `<statusCode nullFlavor="NI"/>`),
    );
    const procedure = doc.getProcedures()[0];
    expect(procedure?.statusCode).toBeUndefined();
    expect(procedure?.code?.code).toBe("80146002");
  });
});

describe("medication frequency without a period or institutionSpecified", () => {
  it("reads an event-based frequency as a frequency with no period", () => {
    const doc = parse(
      swap(
        MEDICATIONS_SECTION,
        `<effectiveTime xsi:type="PIVL_TS" institutionSpecified="true" operator="A">
                <period value="24" unit="h"/>
              </effectiveTime>`,
        `<effectiveTime xsi:type="EIVL_TS" operator="A"><event code="ACM"/></effectiveTime>`,
      ),
    );
    const med = doc.getMedications()[0];
    expect(med?.frequency).toStrictEqual({});
    expect(med?.duration?.low?.raw).toBe("20210101");
    expect(codes(doc)).not.toContain(WARNING_CODES.MULTIPLE_EFFECTIVE_TIMES_UNRESOLVED);
  });
});

describe("vital signs", () => {
  it("reads a vital sign's interpretation code", () => {
    const doc = parse(
      swap(
        VITALS_SECTION,
        `<value xsi:type="PQ" value="120" unit="mm[Hg]"/>`,
        `<value xsi:type="PQ" value="120" unit="mm[Hg]"/>
                  <interpretationCode code="N" codeSystem="2.16.840.1.113883.5.83"/>`,
      ),
    );
    expect(doc.getVitals()[0]?.vitals[0]?.interpretation?.code).toBe("N");
  });
});

describe("result organizers", () => {
  it("skips an organizer component that is not a Result Observation", () => {
    const doc = parse(
      swap(
        RESULTS_SECTION,
        `<component>
                <observation classCode="OBS" moodCode="EVN">
                  <templateId root="2.16.840.1.113883.10.20.22.4.2" extension="2015-08-01"/>`,
        `<component><act classCode="ACT" moodCode="EVN"/></component>
              <component><observation classCode="OBS" moodCode="EVN"/></component>
              <component>
                <observation classCode="OBS" moodCode="EVN">
                  <templateId root="2.16.840.1.113883.10.20.22.4.2" extension="2015-08-01"/>`,
      ),
    );
    const results = doc.getResults()[0]?.results ?? [];
    expect(results).toHaveLength(1);
    expect(results[0]?.code?.code).toBe("718-7");
  });

  it("reads a structured reference range that states only an upper bound", () => {
    const c = ctx();
    const range = readReferenceRange(
      el(`<observation><referenceRange><observationRange>
            <value xsi:type="IVL_PQ"><high value="16" unit="g/dL"/></value>
          </observationRange></referenceRange></observation>`),
      c,
    );
    expect(range?.low).toBeUndefined();
    expect(range?.high?.value).toBe(16);
    expect(c.warnings).toStrictEqual([]);
  });
});

describe("readObservationValue on sparse values", () => {
  it("returns undefined for an ST value with no text", () => {
    const c = ctx();
    expect(readObservationValue(el(`<value xsi:type="ST"/>`), c)).toBeUndefined();
    expect(c.warnings).toStrictEqual([]);
  });

  it("reads a bare INT with no value and no nullFlavor as an integer with no number", () => {
    const c = ctx();
    expect(readObservationValue(el(`<value xsi:type="INT"/>`), c)).toStrictEqual({
      kind: "integer",
    });
    expect(c.warnings).toStrictEqual([]);
  });

  it("reads an IVL_PQ value with no bounds as an empty range and checks no unit", () => {
    const c = ctx();
    expect(readObservationValue(el(`<value xsi:type="IVL_PQ"/>`), c)).toStrictEqual({
      kind: "range",
      range: {},
    });
    expect(c.warnings).toStrictEqual([]);
  });

  it("keeps the text of an unhandled typed value and flags the type", () => {
    const c = ctx();
    expect(
      readObservationValue(el(`<value xsi:type="ED">Synthetic note</value>`), c),
    ).toStrictEqual({ kind: "unsupported", xsiType: "ED", raw: "Synthetic note" });
    expect(c.warnings.map((w) => w.code)).toStrictEqual([
      WARNING_CODES.RESULT_VALUE_TYPE_UNHANDLED,
    ]);
  });
});

describe("checkUcumUnit on a quantity with neither unit nor value", () => {
  it("emits nothing: a null-flavored quantity asserts no magnitude to be missing a unit", () => {
    const c = ctx();
    checkUcumUnit({ nullFlavor: "UNK" }, { path: "value" }, c);
    expect(c.warnings).toStrictEqual([]);
  });
});

describe("assessment-scale supporting observations", () => {
  it("reads a supporting observation with no code and no value", () => {
    const doc = parse(
      swap(
        swap(
          MENTAL_STATUS_ASSESSMENT_SCALE_SECTION,
          `<code code="44250-9" codeSystem="2.16.840.1.113883.6.1" codeSystemName="LOINC"/>`,
          "",
        ),
        `<value xsi:type="INT" value="0"/>
                  <value xsi:type="CO" code="LA6568-5" displayName="Not at all" codeSystem="2.16.840.1.113883.6.1"/>`,
        "",
      ),
    );
    const supporting = doc.getMentalStatus()[0]?.supporting ?? [];
    expect(supporting).toHaveLength(2);
    expect(supporting[0]?.code).toBeUndefined();
    expect(supporting[0]?.value).toBeUndefined();
    expect(supporting[0]?.narrative).toBe("Little interest or pleasure: 0 (Not at all)");
    expect(supporting[1]?.code?.code).toBe("44255-8");
  });
});

describe("smoking status with sparse parts", () => {
  it("reads an observation with no value and no statusCode as not unknown, with no warning", () => {
    const doc = parse(
      swap(
        swap(
          SOCIAL_HISTORY_SECTION,
          `<value xsi:type="CD" code="8517006" codeSystem="2.16.840.1.113883.6.96" displayName="Former smoker"/>`,
          "",
        ),
        `<statusCode code="completed"/>`,
        "",
      ),
    );
    const status = doc.getSmokingStatus()[0];
    expect(status?.value).toBeUndefined();
    expect(status?.statusCode).toBeUndefined();
    expect(status?.unknown).toBe(false);
    expect(codes(doc)).not.toContain(WARNING_CODES.SMOKING_STATUS_UNKNOWN);
    expect(codes(doc)).not.toContain(WARNING_CODES.SMOKING_STATUS_CODE_UNRECOGNIZED);
  });

  it("does not judge a coded value that carries no code and no nullFlavor", () => {
    const doc = parse(
      swap(
        SOCIAL_HISTORY_SECTION,
        `<value xsi:type="CD" code="8517006" codeSystem="2.16.840.1.113883.6.96" displayName="Former smoker"/>`,
        `<value xsi:type="CD" codeSystem="2.16.840.1.113883.6.96"/>`,
      ),
    );
    const status = doc.getSmokingStatus()[0];
    expect(status?.unknown).toBe(false);
    expect(codes(doc)).not.toContain(WARNING_CODES.SMOKING_STATUS_UNKNOWN);
    expect(codes(doc)).not.toContain(WARNING_CODES.SMOKING_STATUS_CODE_UNRECOGNIZED);
  });
});

describe("structural odds and ends", () => {
  it("skips an entry that holds no act, in the plan, the problems and the entry authorship", () => {
    const emptyEntryAfter = (xml: string, title: string): string =>
      swap(xml, `<title>${title}</title>`, `<title>${title}</title>\n          <entry/>`);
    const plan = emptyEntryAfter(PLAN_OF_TREATMENT_SECTION, "Plan of Treatment");
    const problems = emptyEntryAfter(PROBLEMS_SECTION, "Problems");
    const doc = parse(`${plan}${problems}`);
    const baseline = parse(`${PLAN_OF_TREATMENT_SECTION}${PROBLEMS_SECTION}`);
    expect(doc.getPlannedItems()).toStrictEqual(baseline.getPlannedItems());
    expect(doc.getProblems()).toStrictEqual(baseline.getProblems());
    expect(doc.findSection("problems")?.entryAuthorship).toHaveLength(1);
  });

  it("walks past a component that holds no section, at body level and inside a section", () => {
    const nested = swap(
      PROBLEMS_SECTION,
      "<title>Problems</title>",
      "<title>Problems</title>\n          <component/>",
    );
    expect(nested).toContain("<component/>");
    const doc = parse(`\n      <component/>${nested}${ENCOUNTERS_SECTION}`);
    expect(doc.getProblems()).toHaveLength(1);
    expect(doc.getEncounters()).toHaveLength(1);
  });

  it("leaves a section unrecognized when its only extra templateId has no root", () => {
    const xml = swap(
      UNKNOWN_SECTION,
      "<section>",
      `<section>\n          <templateId nullFlavor="NI"/>`,
    );
    expect(xml).toContain(`<templateId nullFlavor="NI"/>`);
    const doc = parse(xml);
    expect(doc.sections).toHaveLength(1);
    expect(doc.sections[0]?.key).toBeUndefined();
    expect(codes(doc)).toContain(WARNING_CODES.UNKNOWN_SECTION_CODE);
  });

  it("indexes narrative ids nested below the first level of the section text", () => {
    const index = buildNarrativeIndex(
      el(`<text><list><item><content ID="deep1">Synthetic item</content></item></list></text>`),
    );
    expect(index.get("deep1")).toBe("Synthetic item");
  });

  it("ignores a narrative reference that is not a local #id, without calling it broken", () => {
    const doc = parse(
      swap(PROCEDURES_SECTION, `<reference value="#proc1"/>`, `<reference value="proc1"/>`),
    );
    expect(doc.getProcedures()[0]?.narrative).toBeUndefined();
    expect(codes(doc)).not.toContain(WARNING_CODES.NARRATIVE_REFERENCE_BROKEN);
  });

  it("reports a contradictory section code once, not again when keying the section", () => {
    const xml = swap(
      UNKNOWN_SECTION,
      `<code code="99999-9" codeSystem="2.16.840.1.113883.6.1"/>`,
      `<code code="11450-4" codeSystem="2.16.840.1.113883.6.1" nullFlavor="UNK"/>`,
    );
    const doc = parse(xml);
    expect(doc.sections[0]?.key).toBe("problems");
    expect(codes(doc).filter((c) => c === WARNING_CODES.CONTRADICTORY_NULL_FLAVOR)).toHaveLength(1);
  });
});
