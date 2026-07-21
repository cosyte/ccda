import { describe, expect, it } from "vitest";

import { parseCcda, serializeCcda, CcdaDocument, type CcdaWarning } from "../src/index.js";
import { serializeDocument } from "../src/serialize/serialize-dom.js";
import { parseSecureXml, resolveLimits } from "../src/parser/secure-xml.js";
import {
  buildCcda,
  DOC_TYPES,
  TRIAD_SECTIONS,
  RESULTS_SECTION,
  VITALS_SECTION,
  IMMUNIZATIONS_SECTION,
} from "./__fixtures__/ccda.js";

describe("serializeCcda — round-trip faithfulness", () => {
  it("re-emits a parsed document and re-parses to the same model", () => {
    const doc = parseCcda(buildCcda({ sections: TRIAD_SECTIONS }));
    const xml = serializeCcda(doc);
    const reparsed = parseCcda(xml);

    expect(reparsed.documentType).toBe(doc.documentType);
    expect(reparsed.getMrn()).toBe(doc.getMrn());
    expect(reparsed.getPatient()?.name?.text).toBe(doc.getPatient()?.name?.text);
    expect(reparsed.allSections().map((s) => s.key)).toEqual(doc.allSections().map((s) => s.key));
  });

  it("is a fixed point — serialize(parse(serialize(x))) === serialize(x)", () => {
    const once = serializeCcda(parseCcda(buildCcda({ sections: TRIAD_SECTIONS })));
    const twice = serializeCcda(parseCcda(once));
    expect(twice).toBe(once);
  });

  it("preserves the clinical entries across the discrete-data sections", () => {
    const doc = parseCcda(
      buildCcda({ sections: `${RESULTS_SECTION}${VITALS_SECTION}${IMMUNIZATIONS_SECTION}` }),
    );
    const reparsed = parseCcda(serializeCcda(doc));

    expect(reparsed.getResults()[0]?.results[0]?.code?.code).toBe("718-7");
    const vital = reparsed.getVitals()[0]?.vitals[0]?.value;
    expect(vital?.kind === "physicalQuantity" ? vital.quantity.value : undefined).toBe(120);
    expect(reparsed.getImmunizations()[0]?.vaccine?.code).toBe("140");
  });

  it("does not silently drop unmodeled / non-clinical content", () => {
    const doc = parseCcda(buildCcda());
    const xml = serializeCcda(doc);
    // realmCode and typeId are never modeled by the read surface, yet must survive.
    expect(xml).toContain('<realmCode code="US"');
    expect(xml).toContain('extension="POCD_HD000040"');
  });

  it("keeps a nonXMLBody base64 payload inert across the round-trip", () => {
    const doc = parseCcda(buildCcda({ docTypeOid: DOC_TYPES[10]?.oid, nonXmlBody: true }));
    const xml = serializeCcda(doc);
    expect(xml).toContain("SGVsbG8gV29ybGQ=");
    expect(parseCcda(xml).nonXmlBody?.value).toBe("SGVsbG8gV29ybGQ=");
  });

  it("round-trips every recognized document type", () => {
    for (const { key, oid } of DOC_TYPES) {
      const doc = parseCcda(buildCcda({ docTypeOid: oid }));
      expect(parseCcda(serializeCcda(doc)).documentType).toBe(key);
    }
  });
});

describe("serializeCcda — declaration handling", () => {
  it("guarantees an XML declaration on the output", () => {
    const doc = parseCcda(buildCcda());
    expect(serializeCcda(doc).startsWith('<?xml version="1.0"')).toBe(true);
  });

  it("prepends a declaration when the source carried none", () => {
    const limits = resolveLimits(undefined);
    const dom = parseSecureXml(buildCcda({ xmlDecl: false }), limits, () => {});
    const xml = serializeDocument(dom);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(true);
  });
});

describe("serializeCcda === toString", () => {
  it("the free function and the instance method return the same string", () => {
    const doc = parseCcda(buildCcda({ sections: TRIAD_SECTIONS }));
    expect(serializeCcda(doc)).toBe(doc.toString());
  });
});

describe("CcdaDocument.toString — hand-constructed guard", () => {
  it("throws when no source document was retained", () => {
    const doc = new CcdaDocument({
      templateIds: [],
      header: { recordTargets: [], relatedDocuments: [] },
      sections: [],
      problems: [],
      medications: [],
      allergies: [],
      results: [],
      vitals: [],
      immunizations: [],
      procedures: [],
      encounters: [],
      smokingStatus: [],
      plannedItems: [],
      functionalStatus: [],
      mentalStatus: [],
      familyHistory: [],
      pastMedicalHistory: [],
      warnings: [],
    });
    expect(() => doc.toString()).toThrow(/no source document retained/);
  });
});

describe("CcdaDocument.withWarnings — structural-sharing copy-with", () => {
  const EXTRA: CcdaWarning = {
    code: "SECTION_PLACEMENT_SUSPECT",
    message: "synthetic annotation",
    position: {},
  };

  it("returns a new document with the warning appended, leaving the original untouched", () => {
    const doc = parseCcda(buildCcda());
    const before = doc.warnings.length;
    const annotated = doc.withWarnings([EXTRA]);

    expect(annotated).not.toBe(doc);
    expect(doc.warnings.length).toBe(before);
    expect(annotated.warnings.length).toBe(before + 1);
    expect(annotated.warnings.at(-1)?.code).toBe("SECTION_PLACEMENT_SUSPECT");
  });

  it("shares the parsed fields and the serialized snapshot by reference", () => {
    const doc = parseCcda(buildCcda({ sections: TRIAD_SECTIONS }));
    const annotated = doc.withWarnings([EXTRA]);

    expect(annotated.sections).toBe(doc.sections);
    expect(annotated.problems).toBe(doc.problems);
    expect(annotated.toString()).toBe(doc.toString());
    expect(annotated.documentType).toBe(doc.documentType);
  });

  it("carries the nonXmlBody through on an unstructured document", () => {
    const doc = parseCcda(buildCcda({ docTypeOid: DOC_TYPES[10]?.oid, nonXmlBody: true }));
    const annotated = doc.withWarnings([EXTRA]);
    expect(annotated.nonXmlBody).toBe(doc.nonXmlBody);
  });
});

describe("serializeCcda — golden snapshot", () => {
  it("emits a stable spec-clean document for the triad fixture", () => {
    const doc = parseCcda(buildCcda({ sections: TRIAD_SECTIONS }));
    expect(serializeCcda(doc)).toMatchSnapshot();
  });
});
