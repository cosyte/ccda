/**
 * The `@cosyte/ccda/arbitraries` subpath: what each generator promises, checked on fixed seeds so
 * every run reaches the same cases, and how the subpath is packaged (an optional peer dependency
 * that the main entry point never loads).
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  CcdaDocument,
  CcdaParseError,
  buildCcda,
  isValidUcumUnit,
  parseCcda,
  parseV3DateTime,
} from "../src/index.js";
import {
  allergy,
  code,
  document,
  documentInit,
  documentText,
  encounter,
  hostileInput,
  immunization,
  medication,
  patient,
  problem,
  procedure,
  quantity,
  resultPanel,
  text,
  timestamp,
  vitalsPanel,
} from "../src/arbitraries/index.js";
import { builtDocument, compact } from "../src/arbitraries/document.js";
import { QUIRKS, applyEdits, applyQuirk, applyQuirks } from "../src/arbitraries/text.js";
import { TEXT_UNITS, UCUM_UNITS, token, trimText } from "../src/arbitraries/values.js";

const root = join(import.meta.dirname, "..");

/** Draw `n` values from a fixed seed. */
function draw<T>(arb: fc.Arbitrary<T>, n = 200, seed = 20261110): T[] {
  return fc.sample(arb, { numRuns: n, seed });
}

/** A small spec-clean document's text, the input the quirks are written against. */
const CLEAN = buildCcda({
  documentId: "ZQ1",
  effectiveTime: "20260101",
  patient: { mrn: "ZM1", given: ["Zab"], family: "Zcd" },
  problems: [{ problem: { code: "1", displayName: "Zx" } }],
}).toString();

describe("text", () => {
  it("is never empty, never starts or ends with whitespace, and reaches every kind of character", () => {
    const values = draw(text(), 600);
    for (const v of values) {
      expect(v.length).toBeGreaterThan(0);
      expect(v).toBe(trimText(v));
    }
    const all = values.join("");
    for (const c of ["<", "&", '"', "]]>", "\n", "\r", "\t", "\u00e9", "\u{1f9ea}"]) {
      expect(all).toContain(c);
    }
  });

  it("honours the length bounds", () => {
    for (const v of draw(text({ minLength: 3, maxLength: 3 }), 100)) {
      expect([...v].length).toBeLessThanOrEqual(3 * Math.max(...TEXT_UNITS.map((u) => u.length)));
    }
    expect(draw(text({ minLength: 0, maxLength: 0 }), 20).every((v) => v.length > 0)).toBe(true);
  });

  it("trims only whitespace from the ends", () => {
    expect(trimText(" \t\r\na b\n ")).toBe("a b");
    expect(trimText("\n\n")).toBe("");
  });
});

describe("token and code", () => {
  it("token starts with Z and never ends with a hyphen", () => {
    for (const t of draw(token(), 300)) {
      expect(t).toMatch(/^Z[A-Z0-9-]*$/u);
      expect(t.endsWith("-")).toBe(false);
    }
  });

  it("code gives a code and a displayName, and a system only when asked", () => {
    const codes = draw(code(), 300);
    for (const c of codes) {
      expect(c.code).toMatch(/^(?:\d+|\d+-\d|[A-Z]\d+)$/u);
      expect(c.displayName.length).toBeGreaterThan(0);
      expect(c.codeSystem).toBeUndefined();
    }
    expect(codes.some((c) => c.codeSystemName !== undefined)).toBe(true);
    expect(codes.some((c) => c.codeSystemName === undefined)).toBe(true);
    const named = draw(code({ codeSystems: ["2.16.840.1.113883.6.96"] }), 50);
    expect(named.every((c) => c.codeSystem === "2.16.840.1.113883.6.96")).toBe(true);
  });
});

describe("timestamp", () => {
  it("is always a timestamp the parser reads, at every precision", () => {
    const values = draw(timestamp(), 600);
    for (const v of values) expect(parseV3DateTime(v), v).toBeDefined();
    for (const length of [4, 6, 8, 10, 12, 14]) {
      expect(values.some((v) => /^\d+/u.exec(v)?.[0].length === length)).toBe(true);
    }
    expect(values.some((v) => v.includes("."))).toBe(true);
    expect(values.some((v) => /[+-]\d{4}$/u.test(v))).toBe(true);
  });

  it("honours the year bounds, and keeps them within four digits", () => {
    const years = draw(timestamp({ minYear: 2020, maxYear: 2021 }), 100).map((v) =>
      Number(v.slice(0, 4)),
    );
    expect(years.every((y) => y === 2020 || y === 2021)).toBe(true);
    const clamped = draw(timestamp({ minYear: 0, maxYear: 99_999 }), 100);
    expect(clamped.every((v) => parseV3DateTime(v) !== undefined)).toBe(true);
    expect(
      draw(timestamp({ minYear: 2030, maxYear: 2000 }), 10).every((v) => v.startsWith("2030")),
    ).toBe(true);
  });
});

describe("quantity", () => {
  it("gives a finite number and a valid UCUM unit", () => {
    for (const unit of UCUM_UNITS) expect(isValidUcumUnit(unit), unit).toBe(true);
    const values = draw(quantity(), 300);
    for (const q of values) {
      expect(Number.isFinite(q.value)).toBe(true);
      expect(UCUM_UNITS).toContain(q.unit);
    }
    expect(values.some((q) => !Number.isInteger(q.value))).toBe(true);
  });

  it("uses the given units", () => {
    expect(draw(quantity({ units: ["mL"] }), 20).every((q) => q.unit === "mL")).toBe(true);
  });
});

describe("the clinical entries", () => {
  it("patient fields start with Z, and any of them may be left out", () => {
    const patients = draw(patient(), 200);
    for (const p of patients) {
      for (const part of [...(p.given ?? []), p.family ?? "Z", p.mrn ?? "Z"]) {
        expect(part.startsWith("Z")).toBe(true);
      }
      expect(Object.values(p).includes(undefined)).toBe(false);
    }
    expect(patients.some((p) => p.mrn === undefined)).toBe(true);
    expect(patients.some((p) => p.birthTime !== undefined)).toBe(true);
  });

  it("a resolution date appears only on a resolved problem or allergy", () => {
    const problems = draw(problem(), 300);
    expect(problems.some((p) => p.resolution !== undefined)).toBe(true);
    for (const p of problems) if (p.resolution !== undefined) expect(p.status).toBe("resolved");
    const allergies = draw(allergy(), 300);
    expect(allergies.some((a) => a.noKnownAllergy === true)).toBe(true);
    expect(allergies.some((a) => a.resolution !== undefined)).toBe(true);
    for (const a of allergies) {
      if (a.resolution !== undefined) expect(a.status).toBe("resolved");
      expect(a.noKnownAllergy === true || a.allergen !== undefined).toBe(true);
    }
  });

  it("each result carries exactly one value form, and a reference range has a bound", () => {
    const panels = draw(resultPanel(), 200);
    for (const panel of panels) {
      expect(panel.results.length).toBeGreaterThan(0);
      for (const r of panel.results) {
        const forms = [r.quantity, r.codedValue, r.stringValue].filter((f) => f !== undefined);
        expect(forms).toHaveLength(1);
        if (r.referenceRange !== undefined) {
          expect(r.referenceRange.low ?? r.referenceRange.high).toBeDefined();
        }
      }
    }
  });

  it("an observation procedure carries its value, and the others carry none", () => {
    const procedures = draw(procedure(), 200);
    for (const p of procedures) expect(p.value !== undefined).toBe(p.kind === "observation");
    expect(new Set(procedures.map((p) => p.kind)).size).toBe(3);
  });

  it("medications, vitals, immunizations and encounters build", () => {
    const [m, v, i, e] = [
      draw(medication(), 30),
      draw(vitalsPanel(), 30),
      draw(immunization(), 30),
      draw(encounter(), 30),
    ];
    const doc = buildCcda({
      documentId: "ZQ2",
      effectiveTime: "20260101",
      patient: {},
      medications: m,
      vitalSigns: v,
      immunizations: i,
      encounters: e,
    });
    expect(doc.getMedications()).toHaveLength(30);
    expect(doc.getVitals()).toHaveLength(30);
    expect(doc.getImmunizations()).toHaveLength(30);
    expect(doc.getEncounters()).toHaveLength(30);
  });

  it("compact drops undefined keys and keeps the rest", () => {
    expect(compact({ a: 1, b: undefined, c: null, d: "" })).toEqual({ a: 1, c: null, d: "" });
  });
});

describe("documentInit and document", () => {
  it("every input builds, at every document type, with the same bytes each time", () => {
    const inits = draw(documentInit(), 30);
    expect(new Set(inits.map((i) => i.documentType))).toEqual(
      new Set([
        "ccd",
        "referralNote",
        "dischargeSummary",
        "progressNote",
        "historyAndPhysical",
        "consultationNote",
      ]),
    );
    for (const init of inits) {
      expect(buildCcda(init).toString()).toBe(buildCcda(init).toString());
    }
  });

  it("honours the document types and the list size", () => {
    const inits = draw(documentInit({ documentTypes: ["referralNote"], maxEntries: 0 }), 30);
    for (const init of inits) {
      expect(init.documentType).toBe("referralNote");
      expect(init.problems ?? []).toEqual([]);
    }
    expect(draw(documentInit({ maxEntries: -1 }), 5).length).toBe(5);
  });

  it("gives parsed documents of the main entry point's class, recognized as their type", () => {
    for (const doc of draw(document({ maxEntries: 1 }), 30)) {
      expect(doc).toBeInstanceOf(CcdaDocument);
      expect(doc.documentType).toMatch(
        /^(?:ccd|referralNote|dischargeSummary|progressNote|historyAndPhysical|consultationNote)$/u,
      );
      expect(doc.getPatient()).toBeDefined();
    }
  });

  it("prints a document as the buildCcda call that rebuilds it, and clones it by building again", () => {
    const init = { documentId: "ZQ3", effectiveTime: "2026", patient: {} };
    const doc = builtDocument(init);
    const printed = fc.stringify(doc);
    expect(printed).toBe(`buildCcda(${fc.stringify(init)})`);
    const clone = (doc as unknown as Record<symbol, () => CcdaDocument>)[fc.cloneMethod]?.();
    expect(clone).not.toBe(doc);
    expect(clone?.toString()).toBe(doc.toString());
    expect(Object.keys(doc)).not.toContain(String(fc.toStringMethod));
  });
});

describe("documentText", () => {
  it("every quirk changes the text and leaves a document the parser accepts", () => {
    for (const quirk of QUIRKS) {
      const messy = applyQuirk(CLEAN, quirk);
      expect(messy, quirk).not.toBe(CLEAN);
      expect(parseCcda(messy).documentType, quirk).toBe("ccd");
    }
  });

  it("applies quirks in a fixed order, whatever order they were drawn in", () => {
    const quirks = ["byteOrderMark", "crlf", "stylesheet", "noDeclaration"] as const;
    expect(applyQuirks(CLEAN, quirks)).toBe(applyQuirks(CLEAN, [...quirks].reverse()));
    expect(applyQuirks(CLEAN, [])).toBe(CLEAN);
  });

  it("writes each quirk as a sender would", () => {
    expect(applyQuirk(CLEAN, "noDeclaration").startsWith("<ClinicalDocument")).toBe(true);
    expect(applyQuirk(CLEAN, "byteOrderMark").startsWith("\uFEFF<?xml")).toBe(true);
    expect(applyQuirk(CLEAN, "stylesheet")).toMatch(/^<\?xml [^>]*\?>\n<\?xml-stylesheet /u);
    expect(applyQuirk(applyQuirk(CLEAN, "noDeclaration"), "stylesheet")).toMatch(
      /^<\?xml-stylesheet [^>]*\?>\n<ClinicalDocument/u,
    );
    expect(applyQuirk(CLEAN, "crlf")).toContain("?>\r\n<ClinicalDocument");
    expect(applyQuirk(CLEAN, "singleQuotes")).toContain("<realmCode code='US'/>");
    expect(applyQuirk(CLEAN, "explicitClose")).toContain('<realmCode code="US"></realmCode>');
    expect(applyQuirk(CLEAN, "comments")).toContain("<!-- after -->");
    expect(applyQuirk(CLEAN, "indentHeader")).toContain("/>\n    <typeId");
    expect(applyQuirk(CLEAN, "characterReferences")).toContain("Summarizatio&#x6E;");
    expect(applyQuirk(CLEAN, "carriageReturnInText")).toContain("&#13;</title>");
    expect(applyQuirk(CLEAN, "cdataTitles")).toContain("<title><![CDATA[Problems]]></title>");
    expect(applyQuirk(CLEAN, "unstampedDocument")).toContain(
      '<templateId root="2.16.840.1.113883.10.20.22.1.2"/>',
    );
    expect(applyQuirk(CLEAN, "loincOnlySections")).toContain("<section><code");
  });

  it("leaves a quoted value holding an apostrophe, and a CDATA section, as they were", () => {
    const xml = `<a x="it's" y="b"><![CDATA[k="v"]]><?pi z="w"?></a>`;
    expect(applyQuirk(xml, "singleQuotes")).toBe(
      `<a x="it's" y='b'><![CDATA[k="v"]]><?pi z="w"?></a>`,
    );
  });

  it("indents a header that has no structured body after it", () => {
    expect(applyQuirk("<a/><b/>", "indentHeader")).toBe("<a/>\n    <b/>");
  });

  it("always parses, with warnings for what it changed", () => {
    const texts = draw(documentText({ maxEntries: 1 }), 60);
    const codes = new Set(texts.flatMap((t) => parseCcda(t).warnings.map((w) => w.code)));
    for (const c of [
      "ENCODING_BOM_STRIPPED",
      "UNKNOWN_NAMESPACE_PREFIX",
      "TEMPLATE_EXTENSION_ABSENT",
    ]) {
      expect(codes, c).toContain(c);
    }
  });
});

describe("hostileInput", () => {
  it(
    "gives every kind of hostile input, and the parser refuses some with each documented fatal",
    {
      timeout: 30_000,
    },
    () => {
      // About half the 120 draws build and serialize a whole document first: 2 s on an idle runner.
      const inputs = draw(hostileInput({ maxLength: 40 }), 120);
      const refused = new Set<string>();
      let accepted = 0;
      for (const raw of inputs) {
        try {
          parseCcda(raw);
          accepted += 1;
        } catch (err) {
          expect(err).toBeInstanceOf(CcdaParseError);
          refused.add((err as CcdaParseError).code);
        }
      }
      expect(accepted).toBeGreaterThan(0);
      for (const c of [
        "NOT_WELL_FORMED_XML",
        "XXE_OR_DTD_PRESENT",
        "ELEMENT_DEPTH_LIMIT_EXCEEDED",
        "NOT_A_CLINICAL_DOCUMENT",
      ]) {
        expect(refused, c).toContain(c);
      }
      expect(draw(hostileInput(), 50).some((raw) => raw.length > 40)).toBe(true);
    },
  );

  it("applyEdits cuts, deletes and inserts at positions taken modulo the length", () => {
    expect(applyEdits("abcdef", [{ kind: "cut", at: 3 }])).toBe("abc");
    expect(applyEdits("abcdef", [{ kind: "cut", at: 9 }])).toBe("abc");
    expect(applyEdits("abcdef", [{ kind: "delete", at: 1, length: 2 }])).toBe("adef");
    expect(applyEdits("abc", [{ kind: "insert", at: 1, text: "XY" }])).toBe("aXYbc");
    expect(applyEdits("", [{ kind: "insert", at: 5, text: "Z" }])).toBe("Z");
  });
});

describe("packaging", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    exports: Record<string, unknown>;
    typesVersions: Record<string, Record<string, string[]>>;
    dependencies?: Record<string, string>;
    peerDependencies: Record<string, string>;
    peerDependenciesMeta: Record<string, { optional?: boolean }>;
  };

  it("exports the subpath for import and require, each with its own types", () => {
    expect(pkg.exports["./arbitraries"]).toEqual({
      import: { types: "./dist/arbitraries.d.ts", default: "./dist/arbitraries.mjs" },
      require: { types: "./dist/arbitraries.d.cts", default: "./dist/arbitraries.cjs" },
    });
    expect(pkg.typesVersions["*"]?.["arbitraries"]).toEqual(["./dist/arbitraries.d.ts"]);
  });

  it("takes fast-check as an optional peer dependency, never a dependency", () => {
    expect(pkg.peerDependencies["fast-check"]).toBeDefined();
    expect(pkg.peerDependenciesMeta["fast-check"]?.optional).toBe(true);
    expect(pkg.dependencies?.["fast-check"]).toBeUndefined();
  });

  it("imports fast-check only under src/arbitraries, and nothing the main entry reaches imports that folder", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? walk(join(dir, e.name))
          : e.name.endsWith(".ts")
            ? [join(dir, e.name)]
            : [],
      );
    const offenders: string[] = [];
    for (const file of walk(join(root, "src"))) {
      const rel = relative(join(root, "src"), file);
      if (rel.startsWith("arbitraries")) continue;
      const source = readFileSync(file, "utf8");
      if (
        /from\s+["']fast-check["']/u.test(source) ||
        /from\s+["'][./]*arbitraries/u.test(source)
      ) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});
