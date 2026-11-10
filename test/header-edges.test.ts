/**
 * Header and document-level paths the broader suites do not reach: sparse author, device,
 * organization, custodian, related-document and componentOf shapes, a body with no
 * `structuredBody`, and `withWarnings` on documents missing optional attribution. Every value is
 * synthetic: the canonical Jane Doe and invented identifiers.
 */

import { describe, expect, it } from "vitest";
import { DOMImplementation, DOMParser } from "@xmldom/xmldom";

import {
  buildDocument,
  CcdaDocument,
  defineCcdaProfile,
  parseCcda,
  positionOf,
  V3_NS,
  WARNING_CODES,
  type CcdaWarning,
} from "../src/index.js";
import { participationDoc } from "./__fixtures__/header-participations.js";
import { buildCcda } from "./__fixtures__/ccda.js";

const SYNTH_ROOT = "2.16.840.1.113883.19.5.99999";

describe("author participations with sparse parts", () => {
  it("reads an author with no time and an unnamed assigned person", () => {
    const doc = parseCcda(
      participationDoc({
        afterRecordTarget: `
  <author>
    <assignedAuthor>
      <id root="${SYNTH_ROOT}.7" extension="AUTH-1"/>
      <assignedPerson/>
    </assignedAuthor>
  </author>`,
      }),
    );
    const author = doc.header.authorship?.authors[0];
    expect(author?.time).toBeUndefined();
    // A person element with no name still identifies a person author, so it is not unidentified.
    expect(author?.person).toStrictEqual({});
    expect(author?.unidentified).toBe(false);
    expect(author?.identifiers[0]?.extension).toBe("AUTH-1");
    expect(doc.warnings.map((w) => w.code)).not.toContain(WARNING_CODES.UNIDENTIFIED_AUTHOR);
  });

  it("reads a device author with neither model nor software name, and an unnamed organization", () => {
    const doc = parseCcda(
      participationDoc({
        afterRecordTarget: `
  <author>
    <time value="20240301"/>
    <assignedAuthor>
      <id root="${SYNTH_ROOT}.5" extension="DEVICE-2"/>
      <assignedAuthoringDevice/>
      <representedOrganization><id root="${SYNTH_ROOT}.3"/></representedOrganization>
    </assignedAuthor>
  </author>`,
      }),
    );
    const author = doc.header.authorship?.authors[0];
    expect(author?.device).toStrictEqual({});
    expect(author?.unidentified).toBe(false);
    expect(author?.representedOrganization?.name).toBeUndefined();
    expect(author?.representedOrganization?.identifiers[0]?.root).toBe(`${SYNTH_ROOT}.3`);
  });

  it("omits a device name whose element is present but empty", () => {
    const doc = parseCcda(
      participationDoc({
        afterRecordTarget: `
  <author>
    <time value="20240301"/>
    <assignedAuthor>
      <id root="${SYNTH_ROOT}.5" extension="DEVICE-3"/>
      <assignedAuthoringDevice>
        <manufacturerModelName>  </manufacturerModelName>
        <softwareName/>
      </assignedAuthoringDevice>
    </assignedAuthor>
  </author>`,
      }),
    );
    expect(doc.header.authorship?.authors[0]?.device).toStrictEqual({});
  });
});

describe("custodian and componentOf with missing inner parts", () => {
  it("yields a custodian with no organization when representedCustodianOrganization is absent", () => {
    const doc = parseCcda(
      participationDoc({
        afterRecordTarget: `
  <custodian><assignedCustodian/></custodian>`,
      }),
    );
    expect(doc.header.custodian).toStrictEqual({});
  });

  it("reads no encompassing encounter from a componentOf that carries none", () => {
    const doc = parseCcda(participationDoc({ afterRecordTarget: `\n  <componentOf/>` }));
    expect(doc.header.encompassingEncounter).toBeUndefined();
  });
});

describe("relatedDocument shapes", () => {
  it("reads a relatedDocument with no typeCode and no parentDocument as an empty parent", () => {
    const doc = parseCcda(participationDoc({ beforeRecordTarget: `\n  <relatedDocument/>` }));
    expect(doc.header.relatedDocuments).toStrictEqual([{ parentDocument: { ids: [] } }]);
  });

  it("reads a parentDocument that carries only an id", () => {
    const doc = parseCcda(
      participationDoc({
        beforeRecordTarget: `
  <relatedDocument typeCode="RPLC">
    <parentDocument><id root="${SYNTH_ROOT}.1" extension="DOC-0006"/></parentDocument>
  </relatedDocument>`,
      }),
    );
    const related = doc.header.relatedDocuments[0];
    expect(related?.typeCode).toBe("RPLC");
    expect(related?.parentDocument.ids[0]?.extension).toBe("DOC-0006");
    expect(related?.parentDocument.code).toBeUndefined();
    expect(related?.parentDocument.setId).toBeUndefined();
    expect(related?.parentDocument.versionNumber).toBeUndefined();
  });
});

describe("a document body that is neither structured nor a usable nonXMLBody", () => {
  it("parses a component with no body element, leaving sections empty and no nonXmlBody", () => {
    const xml = buildCcda({ sections: "" }).replace(
      /<component>\s*<structuredBody>\s*<\/structuredBody>\s*<\/component>/u,
      "<component/>",
    );
    expect(xml).toContain("<component/>");
    const doc = parseCcda(xml);
    expect(doc.sections).toStrictEqual([]);
    expect(doc.nonXmlBody).toBeUndefined();
  });

  it("leaves nonXmlBody unset when the nonXMLBody carries no text element", () => {
    const xml = buildCcda({ nonXmlBody: true }).replace(
      /<nonXMLBody>[\s\S]*<\/nonXMLBody>/u,
      "<nonXMLBody/>",
    );
    expect(xml).toContain("<nonXMLBody/>");
    const doc = parseCcda(xml);
    expect(doc.nonXmlBody).toBeUndefined();
    expect(doc.sections).toStrictEqual([]);
  });
});

describe("withWarnings preserves what the source document carried", () => {
  const extra: CcdaWarning = {
    code: WARNING_CODES.SECTION_PLACEMENT_SUSPECT,
    message: "synthetic",
    position: {},
  };

  it("keeps an absent document type absent", () => {
    const doc = parseCcda(buildCcda({ includeDocTemplate: false }));
    expect(doc.documentType).toBeUndefined();
    const annotated = doc.withWarnings([extra]);
    expect(annotated.documentType).toBeUndefined();
    expect(annotated.warnings).toHaveLength(doc.warnings.length + 1);
    expect(annotated.toString()).toBe(doc.toString());
  });

  it("carries the profile attribution through", () => {
    const profile = defineCcdaProfile({ name: "synthetic-site" });
    const doc = parseCcda(buildCcda(), { profile });
    expect(doc.profile?.name).toBe("synthetic-site");
    const annotated = doc.withWarnings([extra]);
    expect(annotated.profile).toStrictEqual(doc.profile);
    expect(annotated.warnings.at(-1)).toStrictEqual(extra);
  });

  it("keeps a hand-constructed document unserializable", () => {
    const root = new DOMParser().parseFromString(buildCcda(), "application/xml").documentElement;
    if (root === null) throw new Error("fixture parse failed");
    const doc = new CcdaDocument({ ...buildDocument(root, { emit: () => {} }), warnings: [] });
    expect(() => doc.toString()).toThrow(/no source document retained/u);
    const annotated = doc.withWarnings([extra]);
    expect(annotated.warnings).toStrictEqual([extra]);
    expect(() => annotated.toString()).toThrow(/no source document retained/u);
  });
});

describe("positionOf an element with no source location", () => {
  it("returns the bounded path with no line or column", () => {
    const doc = new DOMImplementation().createDocument(V3_NS, "section", null);
    const el = doc.documentElement;
    if (el === null) throw new Error("fixture build failed");
    expect(positionOf(el)).toStrictEqual({ path: "section" });
  });
});
