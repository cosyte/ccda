import { describe, expect, it } from "vitest";

import {
  parseCcda,
  CcdaParseError,
  WARNING_CODES,
  FATAL_CODES,
  sectionForLoinc,
  sectionForTemplateRoot,
  type CcdaWarning,
} from "../src/index.js";
import { buildCcda, DOC_TYPES, LOINC_ONLY_SECTION, UNKNOWN_SECTION } from "./__fixtures__/ccda.js";

function codes(warnings: readonly CcdaWarning[]): string[] {
  return warnings.map((w) => w.code);
}

describe("parseCcda, document recognition", () => {
  it.each(DOC_TYPES)("recognizes the $key document type", ({ key, oid }) => {
    const doc = parseCcda(buildCcda({ docTypeOid: oid }));
    expect(doc.documentType).toBe(key);
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.UNKNOWN_DOCUMENT_TEMPLATE);
  });

  it("emits MISSING_TEMPLATE_ID when the root carries no templateId", () => {
    const doc = parseCcda(buildCcda({ includeHeaderTemplate: false, includeDocTemplate: false }));
    expect(doc.documentType).toBeUndefined();
    expect(codes(doc.warnings)).toContain(WARNING_CODES.MISSING_TEMPLATE_ID);
  });

  it("emits UNKNOWN_DOCUMENT_TEMPLATE for an unrecognized document OID", () => {
    const doc = parseCcda(buildCcda({ docTypeOid: "1.2.3.4.5", includeHeaderTemplate: false }));
    expect(doc.documentType).toBeUndefined();
    expect(codes(doc.warnings)).toContain(WARNING_CODES.UNKNOWN_DOCUMENT_TEMPLATE);
  });

  it("emits TEMPLATE_EXTENSION_ABSENT when the R2.1 stamp is missing", () => {
    const doc = parseCcda(buildCcda({ extension: undefined }));
    expect(doc.documentType).toBe("ccd");
    expect(codes(doc.warnings)).toContain(WARNING_CODES.TEMPLATE_EXTENSION_ABSENT);
  });
});

describe("parseCcda, header + patient", () => {
  it("extracts document identity fields", () => {
    const doc = parseCcda(buildCcda());
    expect(doc.header.documentId?.extension).toBe("DOC123");
    expect(doc.header.code?.code).toBe("34133-9");
    expect(doc.header.title).toBe("Synthetic Test Document");
    expect(doc.header.effectiveTime?.date).toBeInstanceOf(Date);
    expect(doc.header.confidentialityCode?.code).toBe("N");
    expect(doc.header.languageCode).toBe("en-US");
  });

  it("extracts the patient name parts and demographics", () => {
    const patient = parseCcda(buildCcda()).getPatient();
    expect(patient?.name?.given).toEqual(["Jane", "Q"]);
    expect(patient?.name?.family).toBe("Doe");
    expect(patient?.name?.prefix).toEqual(["Ms"]);
    expect(patient?.name?.suffix).toEqual(["Jr"]);
    expect(patient?.genderCode?.code).toBe("F");
    expect(patient?.birthTime?.date).toBeInstanceOf(Date);
    expect(patient?.maritalStatusCode?.code).toBe("M");
    expect(patient?.raceCode?.code).toBe("2106-3");
    expect(patient?.ethnicGroupCode?.code).toBe("2186-5");
  });

  it("selects the MRN from the first patientRole id", () => {
    expect(parseCcda(buildCcda({ mrnExtension: "MRN001" })).getMrn()).toBe("MRN001");
  });

  it("returns undefined MRN when the id carries no extension", () => {
    const doc = parseCcda(buildCcda({ mrnExtension: undefined }));
    expect(doc.getMrn()).toBeUndefined();
    expect(codes(doc.warnings)).toContain(WARNING_CODES.MISSING_ASSIGNING_AUTHORITY);
  });

  it("emits MULTIPLE_RECORD_TARGETS when more than one record target is present", () => {
    const doc = parseCcda(buildCcda({ recordTargets: 2 }));
    expect(doc.header.recordTargets.length).toBe(2);
    expect(codes(doc.warnings)).toContain(WARNING_CODES.MULTIPLE_RECORD_TARGETS);
  });

  it("tolerates an invalid administrativeGenderCode nullFlavor", () => {
    const doc = parseCcda(buildCcda({ genderNullFlavor: "BOGUS" }));
    expect(codes(doc.warnings)).toContain(WARNING_CODES.INVALID_NULL_FLAVOR);
    expect(doc.getPatient()?.genderCode?.nullFlavor).toBe("BOGUS");
  });

  it("flags a malformed effective time", () => {
    const doc = parseCcda(buildCcda().replace('value="20240101120000-0500"', 'value="not-a-date"'));
    expect(codes(doc.warnings)).toContain(WARNING_CODES.MALFORMED_DATETIME);
    expect(doc.header.effectiveTime?.date).toBeUndefined();
    expect(doc.header.effectiveTime?.raw).toBe("not-a-date");
  });
});

describe("parseCcda, sections", () => {
  it("frames a templateId-recognized section and its subsection", () => {
    const doc = parseCcda(buildCcda());
    const allergies = doc.findSection("allergies");
    expect(allergies?.recognizedBy).toBe("templateId");
    expect(allergies?.narrativeText).toContain("No known allergies");
    expect(allergies?.narrativeById.get("a1")).toBe("penicillin note");
    expect(doc.findSection("problems")?.recognizedBy).toBe("templateId");
    expect(doc.allSections().length).toBe(2);
  });

  it("falls back to LOINC recognition and warns", () => {
    const doc = parseCcda(buildCcda({ sections: LOINC_ONLY_SECTION }));
    expect(doc.findSection("problems")?.recognizedBy).toBe("loinc");
    expect(codes(doc.warnings)).toContain(WARNING_CODES.SECTION_MATCHED_BY_LOINC_FALLBACK);
  });

  it("retains an unrecognized section as narrative-only and warns", () => {
    const doc = parseCcda(buildCcda({ sections: UNKNOWN_SECTION }));
    expect(doc.sections[0]?.key).toBeUndefined();
    expect(doc.sections[0]?.narrativeText).toBe("Unknown content.");
    expect(codes(doc.warnings)).toContain(WARNING_CODES.UNKNOWN_SECTION_CODE);
  });
});

describe("parseCcda, the Interventions Section joins the catalog", () => {
  /**
   * An Interventions Section (`…21.2.3`, LOINC `62387-6`), with each recognition
   * signal independently switchable so the matrix below can vary one at a time.
   * `entry` defaults to the section's own conformant content, a Planned
   * Intervention Act (`…22.4.146`); the misplacement rows swap in an act whose
   * home section is elsewhere.
   */
  const interventionsSection = (opts: {
    readonly templateExtension?: string | null;
    readonly withTemplate?: boolean;
    readonly loinc?: string;
    readonly entry?: string;
  }): string => {
    const version = opts.templateExtension === undefined ? "2015-08-01" : opts.templateExtension;
    const ext = version === null ? "" : ` extension="${version}"`;
    const tid =
      opts.withTemplate === false
        ? ""
        : `<templateId root="2.16.840.1.113883.10.20.21.2.3"${ext}/>`;
    const entry =
      opts.entry ??
      `<act classCode="ACT" moodCode="INT">
             <templateId root="2.16.840.1.113883.10.20.22.4.146" extension="2015-08-01"/>
             <statusCode code="active"/>
           </act>`;
    return `
      <component>
        <section>
          ${tid}
          <code code="${opts.loinc ?? "62387-6"}" codeSystem="2.16.840.1.113883.6.1" displayName="Interventions Provided"/>
          <title>Interventions</title>
          <text><content ID="ivn1">Planned toward the recorded goal</content></text>
          <entry>${entry}</entry>
        </section>
      </component>`;
  };

  /** A Planned Act (`…22.4.39`), whose home section is the Plan of Treatment. */
  const plannedAct = `<act classCode="ACT" moodCode="INT">
             <templateId root="2.16.840.1.113883.10.20.22.4.39" extension="2014-06-09"/>
             <code code="409073007" codeSystem="2.16.840.1.113883.6.96" displayName="Education"/>
             <statusCode code="active"/>
           </act>`;

  /**
   * A Results Section, whose root `…22.2.3` differs from the Interventions
   * Section's `…21.2.3` by exactly one arc. It is the control that rules out the
   * confusion the new entry is most exposed to, so it carries the OID rather
   * than relying on a LOINC fallback.
   */
  const resultsSection = `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.3" extension="2015-08-01"/>
          <code code="30954-2" codeSystem="2.16.840.1.113883.6.1" displayName="Results"/>
          <title>Results</title>
          <text>No results recorded.</text>
        </section>
      </component>`;

  it("pins the section-framing matrix: what is recognized, and what is said about it", () => {
    // MEASURED against base `src/` (f653606), not argued. The catalog gained one
    // entry, so the only honest question is which documents move and in which
    // direction. Base read, in full:
    //
    //   rows 1-4, 6, 7  key=none by=none | UNKNOWN_SECTION_CODE
    //   row 5           key=problems by=loinc | SECTION_MATCHED_BY_LOINC_FALLBACK
    //   row 8           key=none by=none | UNKNOWN_SECTION_CODE
    //   rows 9, 10      unchanged (see 1)
    //
    // 1. EVERY ROW THAT MOVES IS AN INTERVENTIONS SECTION. Rows 8, 9 and 10 are
    //    byte-identical to base. Row 10 is the one that matters: a Results
    //    section's root `…22.2.3` differs from Interventions' `…21.2.3` by a
    //    single arc, and it still resolves to `results`, which is what rules out
    //    a collision with the OID this entry is most confusable with.
    //
    // 2. `UNKNOWN_SECTION_CODE` IS WITHDRAWN ONLY WHERE IT WAS FIRING
    //    UNCONDITIONALLY. Before this change no `templateRoot` matched `…21.2.3`
    //    and `sectionForLoinc("62387-6")` was always `undefined`, so EVERY
    //    section carrying that code drew it, on every shape here, with no input
    //    that avoided it. That is this repo's bar for withdrawing a warning, and
    //    it is met by construction rather than by sampling: for `62387-6` the
    //    code was reachable only through a catalog miss that can no longer
    //    happen.
    //
    // 3. ROW 5 IS THE OTHER WITHDRAWAL, AND IT NEEDS ITS OWN ARGUMENT, because
    //    unlike the above it is a warning that base fired on a document that
    //    base ALSO recognized. A section carrying the Interventions templateId
    //    under a Problems `<code>` was framed by base as `key=problems`, off the
    //    LOINC fallback, because the root matched nothing. It now matches, so
    //    recognition resolves on the PRIMARY path and the fallback is not taken.
    //    `SECTION_MATCHED_BY_LOINC_FALLBACK` says "no recognized templateId was
    //    present, the code was used instead"; after this change that sentence is
    //    simply false about this document, so emitting it would be a warning
    //    misdescribing what it is about. This is a subject correction of the same
    //    kind the planned-medication slice made, not a signal traded away -- and
    //    the reading it replaces was the worse one: base handed back an
    //    Interventions Section framed as a patient's Problems list.
    //
    // 4. THE REMAINING TWO MOVES ARE PURE GAINS.
    //    `SECTION_MATCHED_BY_LOINC_FALLBACK` on row 4 replaces the unknown-code
    //    warning on the code-only shape: the section is still reported as
    //    deviating, now as the narrower and truer fact. And
    //    `SECTION_PLACEMENT_SUSPECT` on row 7 fires where base was silent,
    //    because `flagMisplacedEntries` returns early on an unrecognized section
    //    -- recognizing the section is what makes a misplaced entry inside it
    //    visible at all. A Planned Act is not an entry the Interventions Section
    //    admits. Its conformant entries (rows 1-3, 5, 6) are `…22.4.146` and
    //    `…22.4.131`, which are in no home-section map, so they stay silent.
    const shapes: readonly (readonly [string, string])[] = [
      ["V3 stamp + LOINC (conformant)", interventionsSection({})],
      [
        "V2 stamp (HL7's own Care Plan example)",
        interventionsSection({ templateExtension: "2014-06-09" }),
      ],
      ["unversioned root (R1.1)", interventionsSection({ templateExtension: null })],
      ["LOINC only, no templateId", interventionsSection({ withTemplate: false })],
      ["templateId + a wrong section code", interventionsSection({ loinc: "11450-4" })],
      ["conformant entry (Planned Intervention Act)", interventionsSection({})],
      ["misplaced entry (a Planned Act)", interventionsSection({ entry: plannedAct })],
      ["control: unrecognized LOINC", UNKNOWN_SECTION],
      ["control: Problems by LOINC fallback", LOINC_ONLY_SECTION],
      ["control: Results (…22.2.3, one arc away)", resultsSection],
    ];
    const matrix = shapes.map(([name, sections]) => {
      const doc = parseCcda(buildCcda({ sections }));
      const section = doc.sections[0];
      const said = codes(doc.warnings)
        .filter((c) => c.startsWith("SECTION_") || c === "UNKNOWN_SECTION_CODE")
        .sort()
        .join(" ");
      const read = `key=${section?.key ?? "none"} by=${section?.recognizedBy ?? "none"}`;
      return `${name}: ${read} | ${said || "silent"}`;
    });
    expect(matrix).toMatchInlineSnapshot(`
      [
        "V3 stamp + LOINC (conformant): key=interventions by=templateId | silent",
        "V2 stamp (HL7's own Care Plan example): key=interventions by=templateId | silent",
        "unversioned root (R1.1): key=interventions by=templateId | silent",
        "LOINC only, no templateId: key=interventions by=loinc | SECTION_MATCHED_BY_LOINC_FALLBACK",
        "templateId + a wrong section code: key=interventions by=templateId | silent",
        "conformant entry (Planned Intervention Act): key=interventions by=templateId | silent",
        "misplaced entry (a Planned Act): key=interventions by=templateId | SECTION_PLACEMENT_SUSPECT",
        "control: unrecognized LOINC: key=none by=none | UNKNOWN_SECTION_CODE",
        "control: Problems by LOINC fallback: key=problems by=loinc | SECTION_MATCHED_BY_LOINC_FALLBACK",
        "control: Results (…22.2.3, one arc away): key=results by=templateId | silent",
      ]
    `);
  });

  it("resolves the section through both recognition surfaces", () => {
    // The public tables, checked directly rather than only through a parse, so a
    // consumer branching on `sectionForLoinc("62387-6")` is covered too.
    expect(sectionForTemplateRoot("2.16.840.1.113883.10.20.21.2.3")?.key).toBe("interventions");
    expect(sectionForLoinc("62387-6")?.key).toBe("interventions");
    // The near-miss OID this one is genuinely confusable with stays Results.
    expect(sectionForTemplateRoot("2.16.840.1.113883.10.20.22.2.3")?.key).toBe("results");
    // There is no entries-optional sibling root: Interventions has exactly one,
    // and expresses optionality as [0..*] on its entries.
    expect(sectionForTemplateRoot("2.16.840.1.113883.10.20.21.2.3.1")).toBeUndefined();
  });
});

describe("parseCcda, unstructured documents", () => {
  it("captures nonXMLBody content without decoding base64", () => {
    const doc = parseCcda(buildCcda({ docTypeOid: DOC_TYPES[10]?.oid, nonXmlBody: true }));
    expect(doc.documentType).toBe("unstructuredDocument");
    expect(doc.sections.length).toBe(0);
    expect(doc.nonXmlBody?.representation).toBe("B64");
    expect(doc.nonXmlBody?.value).toBe("SGVsbG8gV29ybGQ=");
  });
});

describe("parseCcda, encoding", () => {
  it("strips a leading BOM and warns", () => {
    const doc = parseCcda(buildCcda({ withBom: true }));
    expect(doc.documentType).toBe("ccd");
    expect(codes(doc.warnings)).toContain(WARNING_CODES.ENCODING_BOM_STRIPPED);
  });
});

describe("parseCcda, strict mode", () => {
  it("escalates the first Tier-2 warning to a thrown CcdaParseError", () => {
    expect(() => parseCcda(buildCcda({ recordTargets: 2 }), { strict: true })).toThrow(
      CcdaParseError,
    );
  });

  it("forwards warnings to onWarning in lenient mode", () => {
    const seen: string[] = [];
    parseCcda(buildCcda({ recordTargets: 2 }), { onWarning: (w) => seen.push(w.code) });
    expect(seen).toContain(WARNING_CODES.MULTIPLE_RECORD_TARGETS);
  });

  it("contains a throwing onWarning handler instead of aborting the parse", () => {
    const doc = parseCcda(buildCcda({ recordTargets: 2 }), {
      onWarning: () => {
        throw new Error("noisy handler");
      },
    });
    expect(codes(doc.warnings)).toContain(WARNING_CODES.MULTIPLE_RECORD_TARGETS);
  });
});

describe("parseCcda, fatal errors", () => {
  it("rejects a declared DTD/DOCTYPE", () => {
    const xml = `<?xml version="1.0"?>\n<!DOCTYPE foo>\n${buildCcda({ xmlDecl: false })}`;
    expect(() => parseCcda(xml)).toThrow(
      expect.objectContaining({ code: FATAL_CODES.XXE_OR_DTD_PRESENT }),
    );
  });

  it("rejects input over the size cap", () => {
    expect(() => parseCcda(buildCcda(), { limits: { maxInputBytes: 10 } })).toThrow(
      expect.objectContaining({ code: FATAL_CODES.INPUT_SIZE_LIMIT_EXCEEDED }),
    );
  });

  it("rejects nesting beyond the depth cap", () => {
    expect(() => parseCcda(buildCcda(), { limits: { maxDepth: 2 } })).toThrow(
      expect.objectContaining({ code: FATAL_CODES.ELEMENT_DEPTH_LIMIT_EXCEEDED }),
    );
  });

  it("rejects more elements than the node-count cap", () => {
    expect(() => parseCcda(buildCcda(), { limits: { maxNodeCount: 5 } })).toThrow(
      expect.objectContaining({ code: FATAL_CODES.NODE_COUNT_LIMIT_EXCEEDED }),
    );
  });

  it("rejects empty input", () => {
    expect(() => parseCcda("")).toThrow(CcdaParseError);
    expect(() => parseCcda("   ")).toThrow(CcdaParseError);
  });

  it("rejects malformed XML", () => {
    expect(() => parseCcda("<ClinicalDocument><unclosed></ClinicalDocument>")).toThrow(
      CcdaParseError,
    );
  });

  it("rejects a well-formed non-ClinicalDocument root", () => {
    expect(() => parseCcda(`<Foo xmlns="urn:hl7-org:v3"/>`)).toThrow(
      expect.objectContaining({ code: FATAL_CODES.NOT_A_CLINICAL_DOCUMENT }),
    );
  });

  it("rejects a ClinicalDocument outside the HL7 v3 namespace", () => {
    expect(() => parseCcda(`<ClinicalDocument/>`)).toThrow(
      expect.objectContaining({ code: FATAL_CODES.NOT_A_CLINICAL_DOCUMENT }),
    );
  });
});

describe("parseCcda, immutability", () => {
  it("freezes the warnings array", () => {
    const doc = parseCcda(buildCcda({ recordTargets: 2 }));
    expect(Object.isFrozen(doc.warnings)).toBe(true);
  });
});
