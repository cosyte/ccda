/**
 * No silent loss on the cases users report against other C-CDA libraries.
 *
 * The open issues on other C-CDA parsers are mostly one complaint: a value the
 * document carried came back as nothing, with nothing said. This suite takes
 * each class of that complaint, writes a synthetic document for it
 * (`test/__fixtures__/silent-loss.ts`, by hand, no real data), and asserts one
 * of two outcomes: the value is in the typed model, or a warning with a named
 * code is raised **at the element that holds it**. Dropping it with neither is
 * the one outcome no test here accepts.
 *
 * Every class passes and is pinned as a regression. Three of them used to fail
 * (an entry with no templateId, a Goal Observation, an implant's device) and
 * were written with `it.fails` until the parser kept or reported each value;
 * they are plain tests now. `docs-content/limitations.md` lists every class
 * with its result.
 */

import { describe, expect, it } from "vitest";

import { parseCcda, toDate, toObject, WARNING_CODES, type CcdaDocument } from "../src/index.js";
import { buildCcda, NO_REQUIRED_SECTIONS_DOC_OID } from "./__fixtures__/ccda.js";
import {
  ALLERGY_NON_FOOD,
  ALLERGY_SINGLE_PARTICIPANT,
  ED_VALUE,
  FAMILY_HISTORY,
  GOALS_WITH_ENTRY,
  IMPLANTS,
  INTERVAL_EFFECTIVE_TIMES,
  MEDICATION_MISSING_TEMPLATE,
  MEDICATION_SECOND_TEMPLATE,
  NEGATED_MEDICATION,
  NEGATED_PROBLEM,
  REAL_VALUE,
  ZONELESS_TIMESTAMP,
} from "./__fixtures__/silent-loss.js";

/** The full synthetic document around one fixture section. */
function documentWith(sections: string): string {
  return buildCcda({
    docTypeOid: NO_REQUIRED_SECTIONS_DOC_OID,
    sections,
    mrnAssigningAuthority: true,
  });
}

/** Parse a document built around one fixture section. */
function parse(sections: string): CcdaDocument {
  return parseCcda(documentWith(sections));
}

/** The 1-based line on which a character offset of `xml` falls. */
function lineAt(xml: string, offset: number): number {
  return xml.slice(0, offset).split("\n").length;
}

/**
 * The line range of the element that holds `marker`: from the nearest `open`
 * before it to the first `close` after it. The marker must be unique.
 */
function linesOf(
  xml: string,
  marker: string,
  open: string,
  close: string,
): { first: number; last: number } {
  const at = xml.indexOf(marker);
  expect(at, `marker ${marker} is not in the fixture`).toBeGreaterThan(-1);
  expect(xml.indexOf(marker, at + 1), `marker ${marker} is not unique`).toBe(-1);
  const start = xml.lastIndexOf(open, at);
  const end = xml.indexOf(close, at);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(-1);
  return { first: lineAt(xml, start), last: lineAt(xml, end) };
}

/** The codes of every warning raised on a line inside `range`. */
function warningsWithin(doc: CcdaDocument, range: { first: number; last: number }): string[] {
  return doc.warnings
    .filter((w) => {
      const line = w.position?.line;
      return line !== undefined && line >= range.first && line <= range.last;
    })
    .map((w) => w.code);
}

/** Every value of the typed model, as one string a lost value can be searched for in. */
function modelText(doc: CcdaDocument): string {
  return JSON.stringify({
    problems: doc.getProblems(),
    medications: doc.getMedications(),
    allergies: doc.getAllergies(),
    results: doc.getResults(),
    vitals: doc.getVitals(),
    immunizations: doc.getImmunizations(),
    procedures: doc.getProcedures(),
    encounters: doc.getEncounters(),
    plannedItems: doc.getPlannedItems(),
    functionalStatus: doc.getFunctionalStatus(),
    mentalStatus: doc.getMentalStatus(),
    familyHistory: doc.getFamilyHistory(),
    pastMedicalHistory: doc.getPastMedicalHistory(),
  });
}

/**
 * The rule every class is held to: the value (found by a string only it
 * carries) is in the typed model, or a named warning was raised on the element
 * that holds it.
 */
function expectKeptOrReported(
  sections: string,
  value: string,
  element: { readonly open: string; readonly close: string },
): void {
  const xml = documentWith(sections);
  const doc = parseCcda(xml);
  const kept = modelText(doc).includes(value);
  const reported = warningsWithin(doc, linesOf(xml, value, element.open, element.close));
  expect(
    kept || reported.length > 0,
    `"${value}" is neither in the typed model nor reported by a warning on its element`,
  ).toBe(true);
}

describe("no silent loss: classes that keep the value", () => {
  it("an allergy whose category is not food keeps its type and allergen", () => {
    const allergy = parse(ALLERGY_NON_FOOD).getAllergies()[0]?.allergies[0];
    expect(allergy?.type?.code).toBe("SYN-ENV-ALLERGY");
    expect(allergy?.allergen?.code).toBe("SYN-POLLEN-1");
    expect(allergy?.noKnownAllergy).toBe(false);
  });

  it("an interval effectiveTime keeps both bounds on a medication and on a result", () => {
    const doc = parse(INTERVAL_EFFECTIVE_TIMES);
    const duration = doc.getMedications()[0]?.duration;
    expect(duration?.low?.raw).toBe("20230101");
    expect(duration?.high?.raw).toBe("20230331");
    const timed = doc.getResults()[0]?.results[0]?.effectiveTime;
    expect(timed?.low?.raw).toBe("20240101080000-0500");
    expect(timed?.high?.raw).toBe("20240102080000-0500");
    expect(doc.warnings).toHaveLength(0);
  });

  it("a REAL observation value keeps its number, with no warning", () => {
    const xml = documentWith(REAL_VALUE);
    const doc = parseCcda(xml);
    const value = doc.getResults()[0]?.results[0]?.value;
    expect(value).toStrictEqual({ kind: "real", value: 7.25, raw: "7.25" });
    const range = linesOf(xml, 'xsi:type="REAL"', "<value", "/>");
    expect(warningsWithin(doc, range)).toStrictEqual([]);
  });

  it("an ED observation value keeps its text and is reported", () => {
    const xml = documentWith(ED_VALUE);
    const doc = parseCcda(xml);
    const value = doc.getResults()[0]?.results[0]?.value;
    expect(value).toStrictEqual({
      kind: "unsupported",
      xsiType: "ED",
      raw: "Synthetic encapsulated report text",
    });
    const range = linesOf(xml, 'xsi:type="ED"', "<value", "</value>");
    expect(warningsWithin(doc, range)).toStrictEqual([WARNING_CODES.RESULT_VALUE_TYPE_UNHANDLED]);
  });

  it("a Family History section keeps the relative and the condition", () => {
    const doc = parse(FAMILY_HISTORY);
    const history = doc.getFamilyHistory()[0];
    expect(history?.relative.relationship?.code).toBe("MTH");
    expect(history?.observations[0]?.condition?.code).toBe("SYN-FHX-1");
    expect(doc.findSection("familyHistory")).toBeDefined();
  });

  it("negationInd on a problem is kept as negated, beside its value", () => {
    const problem = parse(NEGATED_PROBLEM).getProblems()[0]?.problems[0];
    expect(problem?.negated).toBe(true);
    expect(problem?.value?.code).toBe("SYN-PROB-1");
  });

  it("negationInd on a medication is kept as negated, beside its drug", () => {
    const med = parse(NEGATED_MEDICATION).getMedications()[0];
    expect(med?.negated).toBe(true);
    expect(med?.drug?.code).toBe("SYN-RX-2");
  });

  it("a medication whose first templateId is not the routed one is still read", () => {
    const doc = parse(MEDICATION_SECOND_TEMPLATE);
    expect(doc.getMedications().map((m) => m.drug?.code)).toStrictEqual(["SYN-RX-3"]);
    expect(doc.warnings).toHaveLength(0);
  });

  it("a zoneless timestamp keeps its digits and never invents a zone", () => {
    const ts = parse(ZONELESS_TIMESTAMP).getResults()[0]?.results[0]?.effectiveTime?.value;
    expect(ts?.raw).toBe("20240315083000");
    expect(toObject(ts)?.offsetMinutes).toBeUndefined();
    expect(toObject(ts)?.hour).toBe(8);
    // No instant without a declared zone; with one, the caller's zone is used.
    expect(toDate(ts)).toBeUndefined();
    expect(toDate(ts, { assumeOffsetMinutes: -300 })?.toISOString()).toBe(
      "2024-03-15T13:30:00.000Z",
    );
  });

  it("a single participant still yields the allergen", () => {
    const allergy = parse(ALLERGY_SINGLE_PARTICIPANT).getAllergies()[0]?.allergies[0];
    expect(allergy?.allergen?.code).toBe("SYN-DRUG-1");
  });
});

describe("no silent loss: the classes that used to drop a value without a warning", () => {
  it("a medication entry with no templateId is kept or reported", () => {
    expectKeptOrReported(MEDICATION_MISSING_TEMPLATE, "med-unstamped-1", {
      open: "<entry>",
      close: "</entry>",
    });
  });

  it("a medication entry with no templateId is reported with MISSING_TEMPLATE_ID on its act", () => {
    const xml = documentWith(MEDICATION_MISSING_TEMPLATE);
    const doc = parseCcda(xml);
    const range = linesOf(xml, "med-unstamped-1", "<entry>", "</entry>");
    expect(warningsWithin(doc, range)).toStrictEqual([WARNING_CODES.MISSING_TEMPLATE_ID]);
  });

  it("a Goal Observation in a Goals section is kept or reported", () => {
    expectKeptOrReported(GOALS_WITH_ENTRY, "SYN-GOAL-1", { open: "<entry>", close: "</entry>" });
  });

  it("a Goal Observation is reported with PLAN_ENTRY_NOT_MODELED on its act", () => {
    const xml = documentWith(GOALS_WITH_ENTRY);
    const doc = parseCcda(xml);
    const range = linesOf(xml, "SYN-GOAL-1", "<entry>", "</entry>");
    expect(warningsWithin(doc, range)).toStrictEqual([WARNING_CODES.PLAN_ENTRY_NOT_MODELED]);
  });

  it("an implant's device and UDI are kept or reported", () => {
    expectKeptOrReported(IMPLANTS, "(01)99999999999999", {
      open: "<participant",
      close: "</participant>",
    });
    expectKeptOrReported(IMPLANTS, "SYN-DEVICE-1", {
      open: "<participant",
      close: "</participant>",
    });
  });

  it("an implant's device code and UDI are kept on the procedure", () => {
    const procedure = parse(IMPLANTS).getProcedures()[0];
    expect(procedure?.devices).toHaveLength(1);
    const device = procedure?.devices?.[0];
    expect(device?.ids.map((id) => [id.root, id.extension])).toStrictEqual([
      ["2.16.840.1.113883.3.3719", "(01)99999999999999(17)991231(10)SYN1(21)SYN2"],
    ]);
    expect(device?.code?.code).toBe("SYN-DEVICE-1");
  });

  it("a Procedure Activity Procedure in Medical Equipment is not flagged as misplaced", () => {
    // The C-CDA R2.1 Medical Equipment Section (V2) names this entry itself:
    // CONF:1098-31885 / 1098-31886.
    const doc = parse(IMPLANTS);
    expect(doc.warnings.map((w) => w.code)).not.toContain(WARNING_CODES.SECTION_PLACEMENT_SUSPECT);
  });

  // The parts of those three that held before the fix, kept as regressions.
  it("the stamped medication beside the unstamped one is still read", () => {
    const doc = parse(MEDICATION_MISSING_TEMPLATE);
    expect(doc.getMedications().map((m) => m.drug?.code)).toStrictEqual(["SYN-RX-4"]);
  });

  it("the Goals section itself is recognized and keeps its narrative", () => {
    const goals = parse(GOALS_WITH_ENTRY).findSection("goals");
    expect(goals?.narrativeText).toBe("Synthetic goal.");
  });

  it("the implant procedure itself is read, with its code", () => {
    const doc = parse(IMPLANTS);
    expect(doc.getProcedures().map((p) => p.code?.code)).toStrictEqual(["SYN-IMPLANT-PROC"]);
    expect(doc.findSection("medicalEquipment")?.narrativeText).toBe("Synthetic implant.");
  });
});

describe("no silent loss: an entry with no templateId, in every section that reads entries", () => {
  // Every entry family is routed by templateId, so an entry act with none
  // reaches no extractor. Each section and each act element name is checked,
  // not only the medication that was first reported.
  const SECTIONS: ReadonlyArray<readonly [string, string, string]> = [
    ["Allergies", "2.16.840.1.113883.10.20.22.2.6.1", "48765-2"],
    ["Medications", "2.16.840.1.113883.10.20.22.2.1.1", "10160-0"],
    ["Problems", "2.16.840.1.113883.10.20.22.2.5.1", "11450-4"],
    ["Results", "2.16.840.1.113883.10.20.22.2.3.1", "30954-2"],
    ["Vital Signs", "2.16.840.1.113883.10.20.22.2.4.1", "8716-3"],
    ["Procedures", "2.16.840.1.113883.10.20.22.2.7.1", "47519-4"],
    ["Immunizations", "2.16.840.1.113883.10.20.22.2.2.1", "11369-6"],
    ["Social History", "2.16.840.1.113883.10.20.22.2.17", "29762-2"],
    ["Encounters", "2.16.840.1.113883.10.20.22.2.22.1", "46240-8"],
    ["Plan of Treatment", "2.16.840.1.113883.10.20.22.2.10", "18776-5"],
    ["Functional Status", "2.16.840.1.113883.10.20.22.2.14", "47420-5"],
    ["Mental Status", "2.16.840.1.113883.10.20.22.2.56", "10190-7"],
    ["Family History", "2.16.840.1.113883.10.20.22.2.15", "10157-6"],
    ["Past Medical History", "2.16.840.1.113883.10.20.22.2.20", "11348-0"],
    ["Medical Equipment", "2.16.840.1.113883.10.20.22.2.23", "46264-8"],
    ["Goals", "2.16.840.1.113883.10.20.22.2.60", "61146-7"],
  ];
  const ACTS = [
    "act",
    "substanceAdministration",
    "observation",
    "organizer",
    "procedure",
    "encounter",
    "supply",
  ] as const;

  for (const [title, root, loinc] of SECTIONS) {
    it(`reports an unstamped entry act in ${title}`, () => {
      const entries = ACTS.map(
        (name, i) => `
          <entry>
            <${name} classCode="ACT" moodCode="EVN">
              <id root="2.16.840.1.113883.19.5.99999.61" extension="unstamped-${String(i)}"/>
              <code code="SYN-UNSTAMPED-${String(i)}" codeSystem="2.16.840.1.113883.6.96"/>
            </${name}>
          </entry>`,
      ).join("");
      const sections = `
      <component>
        <section>
          <templateId root="${root}"/>
          <code code="${loinc}" codeSystem="2.16.840.1.113883.6.1"/>
          <title>${title}</title>
          <text>Synthetic section.</text>${entries}
        </section>
      </component>`;
      const xml = documentWith(sections);
      const doc = parseCcda(xml);
      for (const [i] of ACTS.entries()) {
        const range = linesOf(xml, `unstamped-${String(i)}"`, "<entry>", "</entry>");
        expect(warningsWithin(doc, range), `act ${String(i)} in ${title}`).toStrictEqual([
          WARNING_CODES.MISSING_TEMPLATE_ID,
        ]);
      }
    });
  }

  it("does not report an entry act that carries a templateId", () => {
    const doc = parse(MEDICATION_SECOND_TEMPLATE);
    expect(doc.warnings.map((w) => w.code)).not.toContain(WARNING_CODES.MISSING_TEMPLATE_ID);
  });
});

describe("no silent loss: the edges of the fixes", () => {
  const SNOMED = "2.16.840.1.113883.6.96";
  const IDS = "2.16.840.1.113883.19.5.99999.61";

  /** One procedure entry, in a section given by its templateId root and LOINC. */
  function procedureIn(root: string, loinc: string, inner: string): string {
    return `
      <component>
        <section>
          <templateId root="${root}"/>
          <code code="${loinc}" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Synthetic section</title>
          <text>Synthetic procedure.</text>
          <entry>
            <procedure classCode="PROC" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.14" extension="2014-06-09"/>
              <id root="${IDS}" extension="edge-proc-1"/>
              <code code="SYN-EDGE-PROC" codeSystem="${SNOMED}" displayName="Synthetic procedure"/>
              <statusCode code="completed"/>${inner}
            </procedure>
          </entry>
        </section>
      </component>`;
  }
  const PROCEDURES = ["2.16.840.1.113883.10.20.22.2.7.1", "47519-4"] as const;

  it("keeps a REAL value's nullFlavor and gives no number when it has no @value", () => {
    const doc = parse(REAL_VALUE.replace('value="7.25"', 'nullFlavor="UNK"'));
    expect(doc.getResults()[0]?.results[0]?.value).toStrictEqual({
      kind: "real",
      nullFlavor: "UNK",
    });
  });

  it("withholds a REAL number a nullFlavor contradicts, and keeps its token", () => {
    const doc = parse(REAL_VALUE.replace('value="7.25"', 'value="7.25" nullFlavor="UNK"'));
    expect(doc.getResults()[0]?.results[0]?.value).toStrictEqual({
      kind: "real",
      raw: "7.25",
      nullFlavor: "UNK",
    });
    expect(doc.warnings.map((w) => w.code)).toContain(WARNING_CODES.CONTRADICTORY_NULL_FLAVOR);
  });

  it("reports a REAL whose @value is not a number, and keeps no number", () => {
    const doc = parse(REAL_VALUE.replace('value="7.25"', 'value="seven"'));
    expect(doc.getResults()[0]?.results[0]?.value).toStrictEqual({
      kind: "unsupported",
      xsiType: "REAL",
    });
    expect(doc.warnings.map((w) => w.code)).toContain(WARNING_CODES.RESULT_VALUE_TYPE_UNHANDLED);
  });

  it("reads only DEV participants with a role, and a device with no code keeps its ids", () => {
    const doc = parse(
      procedureIn(
        ...PROCEDURES,
        `
              <participant typeCode="LOC">
                <participantRole classCode="SDLOC"><id root="${IDS}" extension="loc-1"/></participantRole>
              </participant>
              <participant typeCode="DEV"/>
              <participant typeCode="DEV">
                <participantRole classCode="MANU"><id root="${IDS}" extension="dev-no-playing"/></participantRole>
              </participant>
              <participant typeCode="DEV">
                <participantRole classCode="MANU">
                  <id root="${IDS}" extension="dev-no-code"/>
                  <playingDevice/>
                </participantRole>
              </participant>`,
      ),
    );
    const devices = doc.getProcedures()[0]?.devices;
    expect(devices).toStrictEqual([
      { ids: [{ root: IDS, extension: "dev-no-playing" }] },
      { ids: [{ root: IDS, extension: "dev-no-code" }] },
    ]);
  });

  it("gives a procedure with no device participant no devices field", () => {
    const procedure = parse(procedureIn(...PROCEDURES, "")).getProcedures()[0];
    expect(procedure).toBeDefined();
    expect(procedure && "devices" in procedure).toBe(false);
  });

  it("still flags a Procedure Activity Procedure in a section the guide does not name", () => {
    // Results is neither its home nor Medical Equipment.
    const doc = parse(procedureIn("2.16.840.1.113883.10.20.22.2.3.1", "30954-2", ""));
    expect(doc.warnings.map((w) => w.code)).toContain(WARNING_CODES.SECTION_PLACEMENT_SUSPECT);
  });

  it("reports nothing for an entry that holds no clinical statement", () => {
    const doc = parse(`
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.60"/>
          <code code="61146-7" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Goals</title>
          <text>Synthetic goal.</text>
          <entry/>
        </section>
      </component>`);
    expect(doc.warnings.map((w) => w.code)).not.toContain(WARNING_CODES.MISSING_TEMPLATE_ID);
  });
});
