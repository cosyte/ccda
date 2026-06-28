import { describe, expect, it } from "vitest";

import {
  parseCcda,
  CcdaParseError,
  WARNING_CODES,
  FATAL_CODES,
  type CcdaWarning,
} from "../src/index.js";
import { buildCcda, DOC_TYPES, LOINC_ONLY_SECTION, UNKNOWN_SECTION } from "./__fixtures__/ccda.js";

function codes(warnings: readonly CcdaWarning[]): string[] {
  return warnings.map((w) => w.code);
}

describe("parseCcda — document recognition", () => {
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

describe("parseCcda — header + patient", () => {
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

describe("parseCcda — sections", () => {
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

describe("parseCcda — unstructured documents", () => {
  it("captures nonXMLBody content without decoding base64", () => {
    const doc = parseCcda(buildCcda({ docTypeOid: DOC_TYPES[10]?.oid, nonXmlBody: true }));
    expect(doc.documentType).toBe("unstructuredDocument");
    expect(doc.sections.length).toBe(0);
    expect(doc.nonXmlBody?.representation).toBe("B64");
    expect(doc.nonXmlBody?.value).toBe("SGVsbG8gV29ybGQ=");
  });
});

describe("parseCcda — encoding", () => {
  it("strips a leading BOM and warns", () => {
    const doc = parseCcda(buildCcda({ withBom: true }));
    expect(doc.documentType).toBe("ccd");
    expect(codes(doc.warnings)).toContain(WARNING_CODES.ENCODING_BOM_STRIPPED);
  });
});

describe("parseCcda — strict mode", () => {
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

describe("parseCcda — fatal errors", () => {
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

describe("parseCcda — immutability", () => {
  it("freezes the warnings array", () => {
    const doc = parseCcda(buildCcda({ recordTargets: 2 }));
    expect(Object.isFrozen(doc.warnings)).toBe(true);
  });
});
