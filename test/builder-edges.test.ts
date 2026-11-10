/**
 * `buildCcda` input shapes the main builder suite does not reach: name parts beyond given and
 * family, a one-sided reference range, a vital-sign interpretation with and without a code system,
 * an organizer code whose system the caller set without naming it, and an untyped caller's coding
 * with no symbol meeting a terminology adapter. Every input is synthetic.
 */

import { describe, expect, it } from "vitest";

import {
  buildCcda,
  editCcda,
  serializeCcda,
  type BuildCcdaInit,
  type BuildCcdaResult,
  type BuildCode,
  type SectionEdit,
  type TerminologyAdapter,
  type TerminologyCoding,
} from "../src/index.js";

const ICF = "2.16.840.1.113883.6.254";
const INTERPRETATION = "2.16.840.1.113883.5.83";
const PATIENT = { mrn: "MRN001", given: ["Jane"], family: "Doe" } as const;

describe("patient name parts", () => {
  it("emits prefix and suffix around the given and family names, in CDA order", () => {
    const doc = buildCcda({
      patient: { prefix: ["Ms"], given: ["Jane"], family: "Doe", suffix: ["Jr"] },
    });
    expect(doc.getPatient()?.name).toMatchObject({
      prefix: ["Ms"],
      given: ["Jane"],
      family: "Doe",
      suffix: ["Jr"],
    });
    expect(serializeCcda(doc)).toContain(
      "<name><prefix>Ms</prefix><given>Jane</given><family>Doe</family><suffix>Jr</suffix></name>",
    );
  });

  it("emits a name of prefix and suffix alone, with no given or family invented", () => {
    const doc = buildCcda({ patient: { prefix: ["Dr"], suffix: ["III"] } });
    const name = doc.getPatient()?.name;
    expect(name?.prefix).toStrictEqual(["Dr"]);
    expect(name?.suffix).toStrictEqual(["III"]);
    expect(name?.given).toBeUndefined();
    expect(name?.family).toBeUndefined();
    expect(serializeCcda(doc)).toContain("<name><prefix>Dr</prefix><suffix>III</suffix></name>");
  });
});

describe("result reference ranges with one bound", () => {
  const panel = (referenceRange: {
    low?: { value: number; unit: string };
    high?: { value: number; unit: string };
  }): BuildCcdaInit => ({
    patient: PATIENT,
    results: [
      {
        code: { code: "24323-8", displayName: "Comprehensive metabolic panel" },
        results: [
          {
            test: { code: "2345-7", displayName: "Glucose" },
            quantity: { value: 95, unit: "mg/dL" },
            referenceRange,
          },
        ],
      },
    ],
  });

  it("emits and reads back a range with only a lower bound", () => {
    const doc = buildCcda(panel({ low: { value: 70, unit: "mg/dL" } }));
    const range = doc.getResults()[0]?.results[0]?.referenceRange;
    expect(range?.low?.value).toBe(70);
    expect(range?.high).toBeUndefined();
    expect(doc.warnings).toStrictEqual([]);
  });

  it("emits and reads back a range with only an upper bound", () => {
    const doc = buildCcda(panel({ high: { value: 100, unit: "mg/dL" } }));
    const range = doc.getResults()[0]?.results[0]?.referenceRange;
    expect(range?.low).toBeUndefined();
    expect(range?.high?.value).toBe(100);
    expect(doc.warnings).toStrictEqual([]);
  });
});

describe("vital-sign interpretation", () => {
  const vitals = (interpretation: BuildCode): BuildCcdaInit => ({
    patient: PATIENT,
    vitalSigns: [
      {
        vitals: [
          {
            code: { code: "8480-6", displayName: "Systolic blood pressure" },
            quantity: { value: 150, unit: "mm[Hg]" },
            interpretation,
          },
        ],
      },
    ],
  });

  it("defaults the interpretation to the HL7 ObservationInterpretation system", () => {
    const doc = buildCcda(vitals({ code: "H", displayName: "High" }));
    const interpretation = doc.getVitals()[0]?.vitals[0]?.interpretation;
    expect(interpretation?.code).toBe("H");
    expect(interpretation?.codeSystem).toBe(INTERPRETATION);
    expect(doc.warnings).toStrictEqual([]);
  });

  it("keeps a caller-set interpretation system", () => {
    const doc = buildCcda(
      vitals({ code: "HIGH", displayName: "High", codeSystem: "2.16.840.1.113883.19.5.99999.40" }),
    );
    const interpretation = doc.getVitals()[0]?.vitals[0]?.interpretation;
    expect(interpretation?.code).toBe("HIGH");
    expect(interpretation?.codeSystem).toBe("2.16.840.1.113883.19.5.99999.40");
  });
});

describe("status organizer code", () => {
  it("does not label a caller-set code system as LOINC", () => {
    const doc = buildCcda({
      patient: PATIENT,
      functionalStatusOrganizers: [
        {
          code: { code: "d5", displayName: "Self-care", codeSystem: ICF },
          findings: [{ value: { code: "129019007", displayName: "Self-care" } }],
          selfCareActivities: [
            {
              code: { code: "54520-2", displayName: "Bathing" },
              value: { code: "371153006", displayName: "Independent" },
            },
          ],
        },
      ],
    });
    const xml = serializeCcda(doc);
    expect(xml).toContain(`<code code="d5" codeSystem="${ICF}" displayName="Self-care"/>`);
    expect(xml).not.toMatch(/code="d5"[^>]*codeSystemName/u);
  });
});

describe("terminology translation of a coding with no symbol", () => {
  it("does not consult the adapter and emits no translation", () => {
    const seen: TerminologyCoding[] = [];
    const adapter: TerminologyAdapter = {
      validateCode: () => ({ result: true }),
      translate: (coding) => {
        seen.push(coding);
        return { matches: [{ system: "2.16.840.1.113883.6.90", code: "I10" }] };
      },
    };
    // An untyped caller can hand the builder a problem with no code; the builder keeps its
    // display and asks the adapter nothing about a coding that names no concept.
    const symbolless = { displayName: "Essential hypertension" } as unknown as BuildCode;
    const doc = buildCcda(
      { patient: PATIENT, problems: [{ problem: symbolless, status: "active" }] },
      { terminology: adapter },
    );
    expect(seen).toStrictEqual([]);
    expect(serializeCcda(doc)).not.toContain("<translation");
  });
});

describe("result value forms from an untyped caller", () => {
  it("refuses a result whose only value form is null, rather than emitting an empty value", () => {
    // `stringValue` is `string | undefined` in the type; an untyped caller can pass `null`. That
    // is no value at all, so the exactly-one-form rule refuses it like any other missing value.
    const result = {
      test: { code: "2345-7", displayName: "Glucose" },
      stringValue: null,
    } as unknown as BuildCcdaResult;
    expect(() =>
      buildCcda({
        patient: PATIENT,
        results: [
          {
            code: { code: "24323-8", displayName: "Comprehensive metabolic panel" },
            results: [result],
          },
        ],
      }),
    ).toThrow(/must set exactly one of `quantity`, `codedValue`, or `stringValue`/u);
  });
});

describe("a null value form beside a real one, from an untyped caller", () => {
  // `null` is absent in the exactly-one count, so it is absent in the choice of form too: the real
  // form is emitted, as if the `null` key were not there. A JSON row with empty columns has this
  // shape. Every case is checked in the emitted XML and in the re-parsed model.
  const panelOf = (result: BuildCcdaResult): NonNullable<BuildCcdaInit["results"]> => [
    { code: { code: "24323-8", displayName: "Comprehensive metabolic panel" }, results: [result] },
  ];
  const untyped = (forms: Record<string, unknown>): BuildCcdaResult => {
    // The types admit no `null` form; an untyped caller's object reaches the builder as is.
    const result: unknown = { test: { code: "2345-7", displayName: "Glucose" }, ...forms };
    return result as BuildCcdaResult;
  };

  it.each([
    { name: "quantity: null", forms: { quantity: null, stringValue: "high" } },
    { name: "codedValue: null", forms: { codedValue: null, stringValue: "high" } },
    { name: "both null", forms: { quantity: null, codedValue: null, stringValue: "high" } },
  ])("emits the string value when $name sits beside it", ({ forms }) => {
    const doc = buildCcda({ patient: PATIENT, results: panelOf(untyped(forms)) });
    const xml = serializeCcda(doc);
    expect(xml).toContain('<value xsi:type="ST">high</value>');
    expect(xml).toMatch(/<content ID="[^"]+">Glucose: high<\/content>/u);
    expect(xml).not.toContain('xsi:type="PQ"');
    expect(xml).not.toContain('xsi:type="CD"');
    const value = doc.getResults()[0]?.results[0]?.value;
    expect(value).toMatchObject({ kind: "string", value: "high" });
  });

  it("emits the coded value when quantity: null sits beside it", () => {
    const doc = buildCcda({
      patient: PATIENT,
      results: panelOf(
        untyped({ quantity: null, codedValue: { code: "260385009", displayName: "Negative" } }),
      ),
    });
    const xml = serializeCcda(doc);
    expect(xml).toMatch(/<value code="260385009"[^>]*displayName="Negative"[^>]*xsi:type="CD"\/>/u);
    expect(xml).toMatch(/<content ID="[^"]+">Glucose: Negative<\/content>/u);
    const value = doc.getResults()[0]?.results[0]?.value;
    expect(value?.kind).toBe("coded");
    if (value?.kind === "coded") expect(value.code.code).toBe("260385009");
  });

  it("emits the quantity when stringValue: null sits beside it, with no empty ST", () => {
    const doc = buildCcda({
      patient: PATIENT,
      results: panelOf(untyped({ stringValue: null, quantity: { value: 5, unit: "mg/dL" } })),
    });
    const xml = serializeCcda(doc);
    expect(xml).toContain('<value value="5" unit="mg/dL" xsi:type="PQ"/>');
    expect(xml).toMatch(/<content ID="[^"]+">Glucose: 5 mg\/dL<\/content>/u);
    expect(xml).not.toContain('xsi:type="ST"');
    const value = doc.getResults()[0]?.results[0]?.value;
    expect(value?.kind).toBe("physicalQuantity");
    if (value?.kind === "physicalQuantity") expect(value.quantity).toMatchObject({ value: 5 });
  });

  it("still refuses two real forms when a third is null", () => {
    expect(() =>
      buildCcda({
        patient: PATIENT,
        results: panelOf(
          untyped({
            quantity: { value: 5, unit: "mg/dL" },
            codedValue: { code: "260385009", displayName: "Negative" },
            stringValue: null,
          }),
        ),
      }),
    ).toThrow(/must set exactly one of `quantity`, `codedValue`, or `stringValue`/u);
  });

  it("refuses a result whose every form is null", () => {
    expect(() =>
      buildCcda({
        patient: PATIENT,
        results: panelOf(untyped({ quantity: null, codedValue: null, stringValue: null })),
      }),
    ).toThrow(/must set exactly one of `quantity`, `codedValue`, or `stringValue`/u);
  });

  it("treats the same shapes the same way through editCcda", () => {
    const source = buildCcda({ patient: PATIENT });
    const edited = editCcda(source, {
      sections: [
        {
          kind: "results",
          content: panelOf(untyped({ quantity: null, stringValue: "high" })),
        },
      ],
    });
    expect(serializeCcda(edited)).toContain('<value xsi:type="ST">high</value>');
    expect(edited.getResults()[0]?.results[0]?.value).toMatchObject({
      kind: "string",
      value: "high",
    });
    expect(() =>
      editCcda(source, {
        sections: [
          {
            kind: "results",
            content: panelOf(untyped({ quantity: null, codedValue: null, stringValue: null })),
          },
        ],
      }),
    ).toThrow(/must set exactly one of `quantity`, `codedValue`, or `stringValue`/u);
  });
});

describe("a null or missing coded value from an untyped caller", () => {
  // The types make each of these a `BuildCode`; a caller without them (a JSON row with an empty
  // column) can pass `null`, or leave a required one out. Each reached the narrative builder and
  // threw a raw "Cannot read properties of null" `TypeError`. A required code is now refused with a
  // `TypeError` that names its field, and an optional one that is `null` reads as absent, the same
  // as a missing key, in the narrative and in the entry alike.
  const DOC = { documentId: "DOC-NULL-1", effectiveTime: "20240102030405+0000" } as const;
  const untyped = (value: Record<string, unknown>): BuildCcdaInit => {
    const init: unknown = { patient: PATIENT, ...DOC, ...value };
    return init as BuildCcdaInit;
  };
  const code = (c: string, displayName: string): BuildCode => ({ code: c, displayName });

  it("refuses an allergy whose allergen is null with the documented allergy error", () => {
    expect(() => buildCcda(untyped({ allergies: [{ allergen: null }] }))).toThrow(
      "buildCcda: each allergy must set either `allergen` or `noKnownAllergy: true`.",
    );
  });

  it("still builds a no-known-allergies entry whose allergen is null", () => {
    const doc = buildCcda(untyped({ allergies: [{ allergen: null, noKnownAllergy: true }] }));
    expect(doc.getAllergies()[0]?.allergies[0]?.noKnownAllergy).toBe(true);
  });

  const required: readonly {
    readonly field: string;
    readonly init: (value: unknown) => Record<string, unknown>;
  }[] = [
    { field: "problems[].problem", init: (v) => ({ problems: [{ problem: v }] }) },
    { field: "medications[].drug", init: (v) => ({ medications: [{ drug: v }] }) },
    {
      field: "results[].results[].test",
      init: (v) => ({
        results: [{ code: code("24323-8", "Panel"), results: [{ test: v, stringValue: "x" }] }],
      }),
    },
    {
      field: "vitalSigns[].vitals[].code",
      init: (v) => ({
        vitalSigns: [{ vitals: [{ code: v, quantity: { value: 1, unit: "kg" } }] }],
      }),
    },
    { field: "immunizations[].vaccine", init: (v) => ({ immunizations: [{ vaccine: v }] }) },
    { field: "procedures[].code", init: (v) => ({ procedures: [{ code: v }] }) },
    { field: "encounters[].type", init: (v) => ({ encounters: [{ type: v }] }) },
    {
      field: "functionalStatusScales[].code",
      init: (v) => ({ functionalStatusScales: [{ code: v, score: 1 }] }),
    },
    {
      field: "mentalStatusScales[].code",
      init: (v) => ({ mentalStatusScales: [{ code: v, score: 1 }] }),
    },
    {
      field: "pastMedicalHistory[].problem",
      init: (v) => ({ pastMedicalHistory: [{ problem: v }] }),
    },
    {
      field: "dischargeDiagnoses[].problem",
      init: (v) => ({ documentType: "dischargeSummary", dischargeDiagnoses: [{ problem: v }] }),
    },
    {
      field: "planOfTreatment[].code",
      init: (v) => ({ planOfTreatment: [{ kind: "procedure", code: v }] }),
    },
  ];

  it.each(
    required.flatMap((r) =>
      [
        { value: null, got: "null" },
        { value: undefined, got: "missing" },
        { value: "Essential hypertension", got: "of type string" },
      ].map((v) => ({ ...r, ...v })),
    ),
  )(
    "refuses $field set to $value with a TypeError naming the field",
    ({ field, init, value, got }) => {
      let thrown: unknown;
      try {
        buildCcda(untyped(init(value)));
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(TypeError);
      const message = (thrown as TypeError).message;
      expect(message).toBe(
        `buildCcda: \`${field}\` is required as a code with a \`displayName\`, and it was ${got}. ` +
          "Supply the code.",
      );
      // A string where the code belongs may be document text, and is never echoed back.
      expect(message).not.toContain("hypertension");
    },
  );

  const optional: readonly {
    readonly name: string;
    readonly withNull: Record<string, unknown>;
    readonly without: Record<string, unknown>;
  }[] = [
    {
      name: "smokingStatus[].value",
      withNull: { smokingStatus: [{ value: null }] },
      without: { smokingStatus: [{}] },
    },
    {
      name: "functionalStatus[].value",
      withNull: { functionalStatus: [{ value: null }] },
      without: { functionalStatus: [{}] },
    },
    {
      name: "mentalStatus[].value",
      withNull: { mentalStatus: [{ value: null }] },
      without: { mentalStatus: [{}] },
    },
    {
      name: "functionalStatusOrganizers[].findings[].value",
      withNull: { functionalStatusOrganizers: [{ findings: [{ value: null }] }] },
      without: { functionalStatusOrganizers: [{ findings: [{}] }] },
    },
    {
      name: "mentalStatusOrganizers[].findings[].value",
      withNull: { mentalStatusOrganizers: [{ findings: [{ value: null }] }] },
      without: { mentalStatusOrganizers: [{ findings: [{}] }] },
    },
    {
      name: "functionalStatusOrganizers[].selfCareActivities[].code and .value",
      withNull: {
        functionalStatusOrganizers: [
          { findings: [{}], selfCareActivities: [{ code: null, value: null }] },
        ],
      },
      without: { functionalStatusOrganizers: [{ findings: [{}], selfCareActivities: [{}] }] },
    },
    {
      name: "familyHistory[].relative.relationship and observations[].condition",
      withNull: {
        familyHistory: [{ relative: { relationship: null }, observations: [{ condition: null }] }],
      },
      without: { familyHistory: [{ relative: {}, observations: [{}] }] },
    },
  ];

  it.each(optional)("reads $name set to null as absent", ({ withNull, without }) => {
    const expected = buildCcda(untyped(without));
    const actual = buildCcda(untyped(withNull));
    expect(serializeCcda(actual)).toBe(serializeCcda(expected));
    expect(actual.warnings).toStrictEqual(expected.warnings);
  });

  it("treats the same shapes the same way through editCcda", () => {
    const source = buildCcda({ patient: PATIENT });
    const edit = (kind: string, content: unknown): SectionEdit => {
      const section: unknown = { kind, content };
      return section as SectionEdit;
    };
    expect(() => editCcda(source, { sections: [edit("problems", [{ problem: null }])] })).toThrow(
      "buildCcda: `problems[].problem` is required",
    );
    expect(() => editCcda(source, { sections: [edit("allergies", [{ allergen: null }])] })).toThrow(
      "buildCcda: each allergy must set either `allergen` or `noKnownAllergy: true`.",
    );
    const edited = editCcda(source, { sections: [edit("socialHistory", [{ value: null }])] });
    expect(serializeCcda(edited)).toContain("Smoking status unknown");
  });
});
