/**
 * `editCcda` paths the main edit suite does not reach: every remaining section kind as an edit
 * target, a source whose body carries shapes the required-section scan has to walk past, a source
 * with vendor-namespace content, and a header-only source where the revision elements have no later
 * sibling to sit before. Every document here is synthetic.
 */

import { describe, expect, it } from "vitest";
import { DOMParser } from "@xmldom/xmldom";
import type { Element } from "@xmldom/xmldom";

import {
  buildCcda,
  CcdaParseError,
  editCcda,
  parseCcda,
  type CcdaDocument,
  type SectionEdit,
} from "../src/index.js";
import {
  buildCcda as fixtureCcda,
  PROBLEMS_SECTION,
  ALLERGIES_SECTION,
} from "./__fixtures__/ccda.js";

const PATIENT = { mrn: "MRN001", given: ["Jane"], family: "Doe" } as const;

/** Ordered direct-child local names of the ClinicalDocument root. */
function headerOrder(xml: string): readonly string[] {
  const root = new DOMParser().parseFromString(xml, "application/xml").documentElement as Element;
  const names: string[] = [];
  for (let n = root.firstChild; n !== null; n = n.nextSibling) {
    if (n.nodeType === 1) names.push((n as Element).localName ?? "");
  }
  return names;
}

describe("editCcda on every remaining section kind", () => {
  const source = (): ReturnType<typeof buildCcda> =>
    buildCcda({ patient: PATIENT, documentType: "referralNote" });

  const cases: readonly {
    readonly edit: SectionEdit;
    readonly read: (d: ReturnType<typeof buildCcda>) => unknown;
  }[] = [
    {
      edit: {
        kind: "results",
        content: [
          {
            code: { code: "24323-8", displayName: "Comprehensive metabolic panel" },
            results: [
              {
                test: { code: "2345-7", displayName: "Glucose" },
                quantity: { value: 95, unit: "mg/dL" },
              },
            ],
          },
        ],
      },
      read: (d) => d.getResults()[0]?.results[0]?.code?.code,
    },
    {
      edit: {
        kind: "vitalSigns",
        content: [
          {
            vitals: [
              {
                code: { code: "8480-6", displayName: "Systolic blood pressure" },
                quantity: { value: 120, unit: "mm[Hg]" },
              },
            ],
          },
        ],
      },
      read: (d) => d.getVitals()[0]?.vitals[0]?.code?.code,
    },
    {
      edit: {
        kind: "immunizations",
        content: [
          {
            vaccine: {
              code: "140",
              displayName: "Influenza, seasonal, injectable, preservative free",
            },
            effectiveTime: "20240101",
          },
        ],
      },
      read: (d) => d.getImmunizations()[0]?.vaccine?.code,
    },
    {
      edit: {
        kind: "encounters",
        content: [
          {
            type: { code: "99213", displayName: "Office outpatient visit 15 minutes" },
            period: { low: "20230615" },
          },
        ],
      },
      read: (d) => d.getEncounters()[0]?.code?.code,
    },
    {
      edit: {
        kind: "socialHistory",
        content: [
          { value: { code: "8517006", displayName: "Former smoker" }, effectiveTime: "20240101" },
        ],
      },
      read: (d) => d.getSmokingStatus()[0]?.value?.code,
    },
  ];
  const expected: Record<string, string> = {
    results: "2345-7",
    vitalSigns: "8480-6",
    immunizations: "140",
    encounters: "99213",
    socialHistory: "8517006",
  };

  for (const { edit, read } of cases) {
    it(`adds a ${edit.kind} section that reads back`, () => {
      const before = source();
      expect(read(before)).toBeUndefined();
      const edited = editCcda(before, { sections: [{ ...edit, mode: "add" }] });
      expect(read(edited)).toBe(expected[edit.kind]);
      expect(parseCcda(edited.toString()).toString()).toBe(edited.toString());
    });
  }
});

describe("editCcda walks past body shapes the required-section scan cannot key", () => {
  it("edits a source whose body holds an empty component and sections keyed by LOINC or not at all", () => {
    const loincKeyed = PROBLEMS_SECTION.replace(
      `<templateId root="2.16.840.1.113883.10.20.22.2.5.1" extension="2015-08-01"/>`,
      `<templateId nullFlavor="NI"/>\n          <templateId root="2.16.840.1.113883.19.5.99999.77"/>`,
    );
    expect(loincKeyed).toContain(`<templateId nullFlavor="NI"/>`);
    const codeless = `
      <component>
        <section>
          <title>Synthetic notes</title>
          <text>Narrative only.</text>
          <component/>
        </section>
      </component>`;
    const source = parseCcda(
      fixtureCcda({ sections: `\n      <component/>${loincKeyed}${codeless}${ALLERGIES_SECTION}` }),
    );
    expect(source.findSection("problems")).toBeDefined();

    const edited = editCcda(source, {
      sections: [
        {
          kind: "medications",
          content: [
            {
              drug: { code: "314076", displayName: "Lisinopril 10 MG Oral Tablet" },
              dose: { value: 10, unit: "mg" },
              route: { code: "C38288", displayName: "Oral" },
            },
          ],
        },
      ],
    });
    const xml = edited.toString();
    expect(edited.getMedications()[0]?.drug?.code).toBe("314076");
    // The sections the scan walked past are carried through unchanged.
    expect(edited.findSection("problems")?.title).toBe("Problems");
    expect(xml).toContain("<title>Synthetic notes</title>");
    expect(xml).toContain(`<templateId root="2.16.840.1.113883.19.5.99999.77"/>`);
  });
});

describe("editCcda on a source carrying vendor-namespace content", () => {
  it("keeps the vendor element through the edit", () => {
    const vendor = `<ext:note xmlns:ext="urn:example:synthetic-vendor">kept</ext:note>`;
    const xml = fixtureCcda().replace(
      "<title>Allergies</title>",
      `<title>Allergies</title>\n          ${vendor}`,
    );
    expect(xml).toContain(vendor);
    const source = parseCcda(xml);
    const edited = editCcda(source);
    expect(edited.toString()).toContain(`xmlns:ext="urn:example:synthetic-vendor"`);
    expect(edited.toString()).toContain(">kept</ext:note>");
    expect(edited.header.versionNumber).toBe(2);
  });
});

describe("editCcda on a header-only source", () => {
  it("appends the revision elements when nothing in the header follows them", () => {
    const xml = fixtureCcda({ recordTargets: 0 }).replace(
      /<component>\s*<structuredBody>[\s\S]*<\/structuredBody>\s*<\/component>/u,
      "",
    );
    expect(headerOrder(xml)).not.toContain("component");
    const source = parseCcda(xml);
    const edited = editCcda(source);
    const order = headerOrder(edited.toString());
    expect(order.slice(-3)).toStrictEqual(["setId", "versionNumber", "relatedDocument"]);
    expect(edited.header.versionNumber).toBe(2);
    expect(edited.header.relatedDocuments[0]?.typeCode).toBe("RPLC");
    expect(edited.header.relatedDocuments[0]?.parentDocument.ids[0]?.extension).toBe("DOC123");
  });
});

describe("editCcda on a forged source whose XML has no root element", () => {
  // An untyped caller can hand editCcda any object with a `toString`. When that string has no root
  // element, the re-parse refuses it with the parse fatal, so no edit runs and no document is made.
  it.each([
    { name: "an empty string", xml: "" },
    { name: "only a comment", xml: "<!-- synthetic -->" },
    { name: "only an XML declaration", xml: '<?xml version="1.0"?>' },
  ])("refuses $name with NOT_WELL_FORMED_XML", ({ xml }) => {
    const forged = { toString: () => xml, templateIds: [] } as unknown as CcdaDocument;
    let thrown: unknown;
    try {
      editCcda(forged);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(CcdaParseError);
    expect((thrown as CcdaParseError).code).toBe("NOT_WELL_FORMED_XML");
  });
});
