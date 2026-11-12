/**
 * A character XML 1.0 forbids never reaches a document `buildCcda` writes, and `parseCcda` refuses
 * a text that holds one.
 *
 * XML 1.0 (Fifth Edition) section 2.2, production [2], transcribed:
 *
 * ```
 * Char ::= #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]
 * ```
 *
 * Section 4.1's Legal Character constraint extends it to character references. The table below is
 * written from that production, not imported from the code under test, and libxml2 (through
 * `xmllint-wasm`, the parser the conformance harness already uses) is the independent judge of
 * well-formedness. Every value is synthetic.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { validateXML } from "xmllint-wasm";

import { documentInit } from "../src/arbitraries/document.js";
import { el, textEl } from "../src/builder/dom.js";
import { newCdaDocument } from "../src/builder/dom.js";
import {
  buildCcda,
  CcdaParseError,
  parseCcda,
  serializeCcda,
  type BuildCcdaInit,
  type TerminologyAdapter,
} from "../src/index.js";

/** Whether a code point matches production [2], written from the spec. */
function specChar(code: number): boolean {
  return (
    code === 0x9 ||
    code === 0xa ||
    code === 0xd ||
    (code >= 0x20 && code <= 0xd7ff) ||
    (code >= 0xe000 && code <= 0xfffd) ||
    (code >= 0x10000 && code <= 0x10ffff)
  );
}

/** Every code point at or below U+10FFFF that production [2] excludes: 2,080 of them. */
const FORBIDDEN: readonly number[] = Array.from({ length: 0x110000 }, (_v, i) => i).filter(
  (code) => !specChar(code),
);

/** The forbidden code points a UTF-8 text can carry: all but the surrogates. */
const FORBIDDEN_ENCODABLE = FORBIDDEN.filter((code) => code < 0xd800 || code > 0xdfff);

/** `U+` and at least four upper-case hexadecimal digits. */
const label = (code: number): string => `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;

/** One UTF-16 string holding exactly this code point (an unpaired surrogate for a surrogate). */
const charOf = (code: number): string => String.fromCodePoint(code);

/** Whether a string holds a code point production [2] excludes, read code point by code point. */
function holdsForbidden(value: string): boolean {
  for (const ch of value) {
    if (!specChar(ch.codePointAt(0) ?? 0)) return true;
  }
  return false;
}

/** libxml2's verdict on a text: well-formed or not. */
async function wellFormed(xml: string): Promise<boolean> {
  const result = await validateXML({
    xml: [{ fileName: "doc.xml", contents: xml }],
    normalization: "format",
  });
  return result.valid;
}

/** A marker that must never appear in a refusal: the refusal names the field, not the text. */
const MARKER = "ZQMARKER";

const PATIENT = { mrn: "ZQ0001", given: ["Zq"], family: "Testpatient" } as const;

const PROBLEM = {
  problem: { code: "59621000", displayName: "Essential hypertension" },
  status: "active",
} as const;

/** The inputs the issue names: the hospital course and the five office-visit narratives. */
const NARRATIVE_FIELDS: readonly {
  readonly documentType: NonNullable<BuildCcdaInit["documentType"]>;
  readonly field: keyof BuildCcdaInit;
}[] = [
  { documentType: "dischargeSummary", field: "hospitalCourse" },
  { documentType: "progressNote", field: "assessment" },
  { documentType: "progressNote", field: "historyOfPresentIllness" },
  { documentType: "progressNote", field: "chiefComplaintAndReasonForVisit" },
  { documentType: "progressNote", field: "reviewOfSystems" },
  { documentType: "progressNote", field: "physicalExam" },
  { documentType: "progressNote", field: "generalStatus" },
  { documentType: "consultationNote", field: "reasonForReferral" },
];

/** Every string leaf of a value, as the builder names it, with a way to set it on a copy. */
function stringLeaves(value: unknown, path = ""): string[] {
  if (typeof value === "string") return [path];
  if (Array.isArray(value)) {
    return value.flatMap((item: unknown, i) => stringLeaves(item, `${path}[${String(i)}]`));
  }
  if (typeof value === "object" && value !== null && !(value instanceof Date)) {
    return Object.entries(value).flatMap(([key, item]) =>
      stringLeaves(item, path === "" ? key : `${path}.${key}`),
    );
  }
  return [];
}

/** A copy of `init` with the string at `path` replaced by `to`. */
function withLeaf(init: BuildCcdaInit, path: string, to: string): BuildCcdaInit {
  const copy = structuredClone(init) as unknown as Record<string, unknown>;
  const steps = path.match(/[^.[\]]+/gu) ?? [];
  let at: Record<string, unknown> = copy;
  for (const step of steps.slice(0, -1)) at = at[step] as Record<string, unknown>;
  at[steps[steps.length - 1] ?? ""] = to;
  return copy as unknown as BuildCcdaInit;
}

/** What `buildCcda` threw, or `undefined` when it returned. */
function thrownBy(run: () => unknown): Error | undefined {
  try {
    run();
  } catch (err) {
    return err as Error;
  }
  return undefined;
}

describe("buildCcda refuses a character XML 1.0 forbids", () => {
  it.each(NARRATIVE_FIELDS)("in $field of a $documentType", ({ documentType, field }) => {
    const init: BuildCcdaInit = {
      documentType,
      patient: PATIENT,
      [field]: `${MARKER} before${charOf(0x1)}after`,
    };
    const err = thrownBy(() => buildCcda(init));
    expect(err).toBeInstanceOf(TypeError);
    expect(err?.message).toContain(`${field} holds U+0001`);
    expect(err?.message).not.toContain(MARKER);
  });

  it.each([
    ["title", { title: `${MARKER}${charOf(0xb)}` }, "title holds U+000B"],
    [
      "custodianName",
      { custodianName: `${MARKER}${charOf(0xffff)}` },
      "custodianName holds U+FFFF",
    ],
    [
      "documentId (an attribute)",
      { documentId: `${MARKER}${charOf(0x0)}` },
      "documentId holds U+0000",
    ],
    [
      "a patient given name",
      { patient: { ...PATIENT, given: ["Zq", `${MARKER}${charOf(0x1f)}`] } },
      "patient.given[1] holds U+001F",
    ],
    [
      "a problem displayName (an attribute and the narrative)",
      {
        problems: [
          PROBLEM,
          { ...PROBLEM, problem: { code: "38341003", displayName: `${MARKER}${charOf(0xfffe)}` } },
        ],
      },
      "problems[1].problem.displayName holds U+FFFE",
    ],
    ["an unpaired high surrogate", { title: `${MARKER}${charOf(0xd83d)}x` }, "title holds U+D83D"],
    ["an unpaired low surrogate", { title: `${MARKER}${charOf(0xdc00)}` }, "title holds U+DC00"],
  ] as const)("in %s", (_name, extra, message) => {
    const err = thrownBy(() => buildCcda({ patient: PATIENT, ...extra }));
    expect(err).toBeInstanceOf(TypeError);
    expect(err?.message).toContain(message);
    expect(err?.message).not.toContain(MARKER);
  });

  it("never quotes a documentType it refuses, so no caller text reaches the message", () => {
    for (const documentType of [MARKER, `${MARKER}${charOf(0x1)}`]) {
      const err = thrownBy(() =>
        buildCcda({ documentType, patient: PATIENT } as unknown as BuildCcdaInit),
      );
      expect(err).toBeInstanceOf(TypeError);
      expect(err?.message).toMatch(/^buildCcda: documentType of type string is not supported yet/u);
      expect(err?.message).not.toContain(MARKER);
    }
  });

  it("accepts what XML allows: tab, line feed, carriage return and a surrogate pair", () => {
    const doc = buildCcda({
      patient: PATIENT,
      documentType: "dischargeSummary",
      hospitalCourse: `a\tb\nc\rd ${charOf(0x1f9ea)} ${charOf(0xfffd)} ${charOf(0x10ffff)}`,
    });
    expect(serializeCcda(doc)).toContain(charOf(0x1f9ea));
  });

  it("skips a Date, a shared object and an object with no prototype, checking each string once", () => {
    const code: { code: string; displayName: string } = Object.assign(
      Object.create(null) as object,
      { code: "59621000", displayName: "Essential hypertension" },
    );
    const doc = buildCcda({
      patient: PATIENT,
      effectiveTime: new Date(Date.UTC(2024, 0, 2, 3, 4, 5)),
      problems: [
        { problem: code, status: "active" },
        { problem: code, status: "active" },
      ],
    });
    expect(doc.getProblems()).toHaveLength(2);
  });

  it("refuses a terminology adapter's translation that holds one, naming the adapter", () => {
    const adapter: TerminologyAdapter = {
      validateCode: () => ({ result: true }),
      translate: () => ({
        matches: [
          { system: "2.16.840.1.113883.6.90", code: "I10", version: "2024" },
          { system: "2.16.840.1.113883.6.90", code: "I10", display: `${MARKER}${charOf(0x7)}` },
        ],
      }),
    };
    const err = thrownBy(() =>
      buildCcda({ patient: PATIENT, problems: [PROBLEM] }, { terminology: adapter }),
    );
    expect(err).toBeInstanceOf(TypeError);
    expect(err?.message).toContain(
      "options.terminology.translate() matches[1].display holds U+0007",
    );
    expect(err?.message).not.toContain(MARKER);
  });

  it("refuses at the element too, for a value that reaches the DOM by any other route", () => {
    const { doc } = newCdaDocument();
    expect(() => textEl(doc, "title", `${MARKER}${charOf(0x2)}`)).toThrow(
      "the text of <title> holds U+0002",
    );
    expect(() => el(doc, "code", { displayName: `${MARKER}${charOf(0x3)}` })).toThrow(
      "the displayName attribute of <code> holds U+0003",
    );
    const err = thrownBy(() => textEl(doc, "title", `${MARKER}${charOf(0x2)}`));
    expect(err?.message).not.toContain(MARKER);
  });

  it("names every string field of any document input, and never its text (property)", () => {
    fc.assert(
      fc.property(
        documentInit({ maxEntries: 2 }),
        fc.nat(),
        fc.constantFrom(...FORBIDDEN),
        (init, pick, code) => {
          // documentType is checked against the closed list of types first, and that refusal
          // names the requested type; it is not clinical text.
          const leaves = stringLeaves(init).filter((path) => path !== "documentType");
          const path = leaves[pick % leaves.length] ?? "patient.mrn";
          const err = thrownBy(() => buildCcda(withLeaf(init, path, `${MARKER}${charOf(code)}`)));
          expect(err).toBeInstanceOf(TypeError);
          expect(err?.message).toContain(`buildCcda: ${path} holds ${label(code)},`);
          expect(err?.message).not.toContain(MARKER);
        },
      ),
      { numRuns: 300 },
    );
  });

  it("writes only text libxml2 reads as well-formed, whatever string reaches any field (property)", async () => {
    const anyCodePoint = fc.oneof(
      fc.constantFrom(...FORBIDDEN).map(charOf),
      fc.integer({ min: 0, max: 0x10ffff }).map(charOf),
    );
    await fc.assert(
      fc.asyncProperty(
        documentInit({ maxEntries: 1 }),
        fc.nat(),
        fc.string({ unit: anyCodePoint, minLength: 1, maxLength: 12 }),
        async (init, pick, value) => {
          const leaves = stringLeaves(init).filter((path) => path !== "documentType");
          const path = leaves[pick % leaves.length] ?? "patient.mrn";
          let xml: string;
          try {
            xml = serializeCcda(buildCcda(withLeaf(init, path, value)));
          } catch (err) {
            // Refused: for a forbidden character, by this refusal and no other.
            if (holdsForbidden(value)) {
              expect((err as Error).message).toContain(`buildCcda: ${path} holds U+`);
            }
            return;
          }
          expect(holdsForbidden(value)).toBe(false);
          expect(holdsForbidden(xml)).toBe(false);
          expect(await wellFormed(xml)).toBe(true);
        },
      ),
      { numRuns: 120 },
    );
  }, 120_000);
});

describe("every code point, through the builder, libxml2 and the parser", () => {
  it("builds every allowed code point into text and an attribute that libxml2 and parseCcda read", async () => {
    for (let plane = 0; plane < 0x110000; plane += 0x10000) {
      let chunk = "";
      for (let code = plane; code < plane + 0x10000; code++) {
        if (specChar(code)) chunk += charOf(code);
      }
      const xml = serializeCcda(
        buildCcda({
          documentType: "dischargeSummary",
          patient: PATIENT,
          hospitalCourse: `x${chunk}x`,
          problems: [{ ...PROBLEM, problem: { code: "59621000", displayName: `x${chunk}x` } }],
        }),
      );
      expect(await wellFormed(xml), label(plane)).toBe(true);
      expect(() => parseCcda(xml), label(plane)).not.toThrow();
    }
  }, 120_000);

  it("refuses every forbidden code point, in text and in an attribute", () => {
    for (const code of FORBIDDEN) {
      const inText = thrownBy(() =>
        buildCcda({
          documentType: "dischargeSummary",
          patient: PATIENT,
          hospitalCourse: `a${charOf(code)}b`,
        }),
      );
      expect(inText?.message).toContain(`hospitalCourse holds ${label(code)},`);
      const inAttribute = thrownBy(() =>
        buildCcda({ patient: PATIENT, documentId: `a${charOf(code)}b` }),
      );
      expect(inAttribute?.message).toContain(`documentId holds ${label(code)},`);
    }
  });

  it("agrees with libxml2: each forbidden code point a UTF-8 text can carry is not XML", async () => {
    for (const code of FORBIDDEN_ENCODABLE) {
      expect(await wellFormed(`<a b="${charOf(code)}">x</a>`), label(code)).toBe(false);
      expect(await wellFormed(`<a>x${charOf(code)}</a>`), label(code)).toBe(false);
      expect(await wellFormed(`<a>&#x${code.toString(16)};</a>`), label(code)).toBe(false);
    }
  }, 60_000);
});

describe("parseCcda refuses a text that holds a character XML 1.0 forbids", () => {
  const ROOT = '<ClinicalDocument xmlns="urn:hl7-org:v3">';
  const wrap = (inner: string): string => `${ROOT}<title a="1">${inner}</title></ClinicalDocument>`;

  /** The fatal code `parseCcda` threw, or `"none"`. */
  function fatalOf(text: string): string {
    const err = thrownBy(() => parseCcda(text));
    if (err === undefined) return "none";
    expect(err).toBeInstanceOf(CcdaParseError);
    return (err as CcdaParseError).code;
  }

  it("refuses every forbidden code point written raw, in text, in an attribute and in a comment", () => {
    for (const code of FORBIDDEN) {
      const ch = charOf(code);
      expect(fatalOf(wrap(`a${ch}b`)), label(code)).toBe("NOT_WELL_FORMED_XML");
      expect(fatalOf(`${ROOT}<title a="${ch}">t</title></ClinicalDocument>`), label(code)).toBe(
        "NOT_WELL_FORMED_XML",
      );
      expect(fatalOf(`${ROOT}<!-- ${ch} --><title/></ClinicalDocument>`), label(code)).toBe(
        "NOT_WELL_FORMED_XML",
      );
    }
  });

  it("refuses every forbidden code point written as a decimal or hexadecimal reference", () => {
    for (const code of FORBIDDEN) {
      expect(fatalOf(wrap(`&#${String(code)};`)), label(code)).toBe("NOT_WELL_FORMED_XML");
      expect(fatalOf(wrap(`&#x${code.toString(16)};`)), label(code)).toBe("NOT_WELL_FORMED_XML");
      expect(
        fatalOf(
          `${ROOT}<title a="&#x${code.toString(16).toUpperCase()};">t</title></ClinicalDocument>`,
        ),
        label(code),
      ).toBe("NOT_WELL_FORMED_XML");
    }
  });

  it.each([
    ["past U+10FFFF", "&#x110000;"],
    ["far past it, with more digits than a code point has", "&#99999999999999999999;"],
    ["zero", "&#0;"],
    ["zero, with leading zeros", "&#x0000;"],
  ])("refuses a reference %s", (_name, ref) => {
    expect(fatalOf(wrap(ref))).toBe("NOT_WELL_FORMED_XML");
  });

  it.each([
    ["tab, line feed and carriage return", "&#9;&#10;&#13;&#x9;&#xA;&#xD;"],
    ["the edges of the allowed ranges", "&#x20;&#xD7FF;&#xE000;&#xFFFD;&#x10000;&#x10FFFF;"],
    ["leading zeros", "&#0000000000065;&#x000000041;"],
    ["a surrogate pair written raw", charOf(0x1f9ea)],
  ])("reads %s as before", (_name, inner) => {
    expect(fatalOf(wrap(inner))).toBe("none");
  });

  it.each([
    ["an upper-case X", "&#X1;"],
    ["decimal digits mixed with letters", "&#1a;"],
  ])("leaves a reference with %s to the parser, as before", (_name, inner) => {
    // Neither is a character reference in XML; the gate does not decide them.
    const before = thrownBy(() => parseCcda(wrap(inner)));
    expect(before === undefined || before instanceof CcdaParseError).toBe(true);
  });

  // In a comment ([15]), a CDATA section ([20]) and a processing instruction ([16]) the characters
  // `&#1;` are Char text, not a reference (section 4.4, "Not recognized" in a comment), so the
  // document is well-formed: libxml2 reads it, and so must parseCcda.
  const NOT_EXPANDED: readonly (readonly [string, string])[] = [
    ["a comment", `${ROOT}<!-- &#1; --><title/></ClinicalDocument>`],
    ["a CDATA section", `${ROOT}<title><![CDATA[&#xFFFE;]]></title></ClinicalDocument>`],
    ["a processing instruction", `${ROOT}<?pi &#0;?><title/></ClinicalDocument>`],
    ["a comment before the root", `<!-- &#x110000; -->${ROOT}<title/></ClinicalDocument>`],
    ["a processing instruction before the root", `<?pi &#1;?>${ROOT}<title/></ClinicalDocument>`],
    [
      "a comment that holds what looks like a CDATA section's end",
      `${ROOT}<!-- ]]> &#1; --><title/></ClinicalDocument>`,
    ],
    [
      "a CDATA section that holds what looks like a comment's start",
      `${ROOT}<title><![CDATA[<!-- &#1;]]></title></ClinicalDocument>`,
    ],
  ];

  it.each(NOT_EXPANDED)(
    "reads a reference to a forbidden code point in %s, where XML does not expand it",
    async (_name, text) => {
      expect(await wellFormed(text)).toBe(true);
      expect(fatalOf(text)).toBe("none");
    },
  );

  const EXPANDED_AFTER: readonly (readonly [string, string])[] = [
    ["after a comment closes", `${ROOT}<!-- x --><title>&#1;</title></ClinicalDocument>`],
    ["after a CDATA section closes", `${ROOT}<title><![CDATA[x]]>&#1;</title></ClinicalDocument>`],
    [
      "after a processing instruction closes",
      `${ROOT}<?pi x?><title a="&#1;"/></ClinicalDocument>`,
    ],
    [
      "after a CDATA section that held what looks like a comment's start",
      `${ROOT}<title><![CDATA[<!--]]>&#1;<!-- --></title></ClinicalDocument>`,
    ],
    [
      "in a second reference after one inside a comment",
      `${ROOT}<!-- &#1; --><title>&#1;</title></ClinicalDocument>`,
    ],
    ["in a comment that never closes", `${ROOT}<!-- &#1; <title/></ClinicalDocument>`],
    ["after the root element closes", `${ROOT}<title/></ClinicalDocument>&#1;`],
  ];

  it("decides a reference after many openers that never close in time linear in the text", () => {
    // A lazy regular expression over the three spans retries from each opener and would run for
    // minutes here; the walk reads the text once.
    for (const opener of ["<!--", "<![CDATA[", "<?"]) {
      const text = `${ROOT}<title>${opener.repeat(100_000)}&#1;</title></ClinicalDocument>`;
      expect(fatalOf(text), opener).toBe("NOT_WELL_FORMED_XML");
    }
  });

  it.each(EXPANDED_AFTER)("still refuses a reference %s", async (_name, text) => {
    expect(await wellFormed(text)).toBe(false);
    expect(fatalOf(text)).toBe("NOT_WELL_FORMED_XML");
  });

  it("still refuses a forbidden code point written raw in a CDATA section and an instruction", async () => {
    for (const text of [
      `${ROOT}<title>${charOf(0x1)}<!-- &#1; --></title></ClinicalDocument>`,
      `${ROOT}<title><![CDATA[${charOf(0x1)}]]></title></ClinicalDocument>`,
      `${ROOT}<?pi ${charOf(0xfffe)}?><title/></ClinicalDocument>`,
    ]) {
      expect(await wellFormed(text)).toBe(false);
      expect(fatalOf(text)).toBe("NOT_WELL_FORMED_XML");
    }
  });

  it("puts nothing of the text in the fatal", () => {
    const err = thrownBy(() => parseCcda(wrap(`${MARKER}${charOf(0x1)}`)));
    expect(err?.message).toBe("Input is not well-formed XML.");
    expect(JSON.stringify(err)).not.toContain(MARKER);
  });

  it("reports a declared DTD first, and the entity cap before the character", () => {
    expect(fatalOf(`<!DOCTYPE x>${wrap(charOf(0x1))}`)).toBe("XXE_OR_DTD_PRESENT");
    expect(fatalOf(wrap(`${charOf(0x1)}<!DOCTYPE x>`))).toBe("XXE_OR_DTD_PRESENT");
    expect(
      thrownBy(() =>
        parseCcda(wrap(`${charOf(0x1)}&a;&b;`), { limits: { maxEntityExpansions: 1 } }),
      )?.message,
    ).toBe("Input exceeds the custom entity-reference cap.");
  });
});
