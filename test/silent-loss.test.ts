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
 * Most classes pass and are pinned as regressions. Three do not today, and they
 * are written with `it.fails` so the suite stays a true record rather than a
 * wish: each states the outcome it wants, Vitest checks that the outcome is
 * still missing, and the day a fix lands the test goes red and says so. Flip it
 * to `it` then. `docs-content/limitations.md` lists every class with its result.
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

  it("a REAL observation value is reported with RESULT_VALUE_TYPE_UNHANDLED", () => {
    const xml = documentWith(REAL_VALUE);
    const doc = parseCcda(xml);
    const value = doc.getResults()[0]?.results[0]?.value;
    expect(value).toStrictEqual({ kind: "unsupported", xsiType: "REAL" });
    const range = linesOf(xml, 'xsi:type="REAL"', "<value", "/>");
    expect(warningsWithin(doc, range)).toStrictEqual([WARNING_CODES.RESULT_VALUE_TYPE_UNHANDLED]);
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

describe("no silent loss: classes that still drop a value without a warning", () => {
  // Each of these states the outcome it wants. `it.fails` passes while that
  // outcome is missing and goes red when a fix provides it: flip it to `it`.

  it.fails("a medication entry with no templateId is kept or reported", () => {
    expectKeptOrReported(MEDICATION_MISSING_TEMPLATE, "med-unstamped-1", {
      open: "<entry>",
      close: "</entry>",
    });
  });

  it.fails("a Goal Observation in a Goals section is kept or reported", () => {
    expectKeptOrReported(GOALS_WITH_ENTRY, "SYN-GOAL-1", { open: "<entry>", close: "</entry>" });
  });

  it.fails("an implant's device and UDI are kept or reported", () => {
    expectKeptOrReported(IMPLANTS, "(01)99999999999999", {
      open: "<participant",
      close: "</participant>",
    });
  });

  // The halves of those three that do hold today, so a regression in them is
  // not hidden behind the expected failure above.
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
