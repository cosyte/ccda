import { describe, expect, it } from "vitest";
import { DOMParser } from "@xmldom/xmldom";
import type { Element } from "@xmldom/xmldom";

import {
  parseCcda,
  parseIi,
  parseSt,
  parseBl,
  parseCd,
  parsePq,
  parseIvlPq,
  parseTs,
  parseIvlTs,
  parseEd,
  parseV3DateTime,
  isRecognizedNamespace,
  V3_NS,
  XSI_NS,
  SDTC_NS,
  attr,
  xsiType,
  child,
  children,
  childElements,
  text,
  positionOf,
  WARNING_CODES,
  type CcdaWarning,
} from "../src/index.js";
import { unknownNamespacePrefix } from "../src/parser/warnings.js";
import { buildCcda } from "./__fixtures__/ccda.js";

function el(fragment: string): Element {
  const doc = new DOMParser().parseFromString(
    `<wrap xmlns="${V3_NS}" xmlns:xsi="${XSI_NS}">${fragment}</wrap>`,
    "application/xml",
  );
  const root = doc.documentElement;
  if (root === null || root.firstChild === null) throw new Error("fixture parse failed");
  return root.firstChild as Element;
}

function ctx(): { warnings: CcdaWarning[]; emit: (w: CcdaWarning) => void } {
  const warnings: CcdaWarning[] = [];
  return { warnings, emit: (w) => warnings.push(w) };
}

describe("datatype nullFlavor / absent-field branches", () => {
  it("ST captures nullFlavor with no text value", () => {
    const st = parseSt(el(`<title nullFlavor="NI"/>`), ctx());
    expect(st?.value).toBeUndefined();
    expect(st?.nullFlavor).toBe("NI");
  });

  it("BL omits value for a non-boolean token", () => {
    expect(parseBl(el(`<value value="maybe"/>`), ctx())?.value).toBeUndefined();
  });

  it("PQ captures nullFlavor with no value", () => {
    const pq = parsePq(el(`<value nullFlavor="UNK"/>`), ctx());
    expect(pq?.value).toBeUndefined();
    expect(pq?.nullFlavor).toBe("UNK");
  });

  it("CD captures codeSystemName and ignores an empty translation", () => {
    const cd = parseCd(el(`<code codeSystemName="LOINC"><translation/></code>`), ctx());
    expect(cd?.codeSystemName).toBe("LOINC");
    expect(cd?.translation).toBeUndefined();
  });

  it("CD keeps populated originalText but drops an empty one", () => {
    expect(
      parseCd(el(`<code code="x"><originalText>note</originalText></code>`), ctx())?.originalText,
    ).toBe("note");
    expect(
      parseCd(el(`<code code="x"><originalText/></code>`), ctx())?.originalText,
    ).toBeUndefined();
  });

  it("CD keeps a fully-populated translation but drops its nested translations", () => {
    const cd = parseCd(
      el(
        `<code code="a"><translation code="b" codeSystem="s" codeSystemName="n" displayName="d" nullFlavor="OTH"><translation code="c"/></translation></code>`,
      ),
      ctx(),
    );
    const t = cd?.translation?.[0];
    expect(t?.code).toBe("b");
    expect(t?.codeSystem).toBe("s");
    expect(t?.codeSystemName).toBe("n");
    expect(t?.displayName).toBe("d");
    expect(t?.nullFlavor).toBe("OTH");
  });

  it("BL captures a nullFlavor", () => {
    expect(parseBl(el(`<value nullFlavor="NI"/>`), ctx())?.nullFlavor).toBe("NI");
  });

  it("IVL_PQ captures center + width + nullFlavor", () => {
    const ivl = parseIvlPq(
      el(
        `<value nullFlavor="OTH"><center value="5" unit="mg"/><width value="2" unit="mg"/></value>`,
      ),
      ctx(),
    );
    expect(ivl?.center?.value).toBe(5);
    expect(ivl?.width?.value).toBe(2);
    expect(ivl?.nullFlavor).toBe("OTH");
  });

  it("TS captures a nullFlavor", () => {
    expect(parseTs(el(`<effectiveTime nullFlavor="UNK"/>`), ctx())?.nullFlavor).toBe("UNK");
  });

  it("IVL_TS captures a nullFlavor and warns on a malformed value form", () => {
    expect(parseIvlTs(el(`<effectiveTime nullFlavor="UNK"/>`), ctx())?.nullFlavor).toBe("UNK");
    const c = ctx();
    const ivl = parseIvlTs(el(`<effectiveTime value="bad"/>`), c);
    expect(ivl?.value?.date).toBeUndefined();
    expect(ivl?.value?.raw).toBe("bad");
    expect(c.warnings.map((w) => w.code)).toContain(WARNING_CODES.MALFORMED_DATETIME);
  });

  it("ED captures a nullFlavor and tolerates a reference with no value", () => {
    expect(parseEd(el(`<text nullFlavor="NI"/>`), ctx())?.nullFlavor).toBe("NI");
    expect(parseEd(el(`<text><reference/></text>`), ctx())?.reference).toBeUndefined();
  });

  it("II without a root emits no missing-assigning-authority warning", () => {
    const c = ctx();
    parseIi(el(`<id extension="X"/>`), c);
    expect(c.warnings).toHaveLength(0);
  });
});

describe("parseV3DateTime precision + offset branches", () => {
  it("accepts an hour-only timezone offset", () => {
    expect(parseV3DateTime("20240101120000+05")).toBeInstanceOf(Date);
  });
  it("accepts fractional seconds", () => {
    expect(parseV3DateTime("20240101120000.5")).toBeInstanceOf(Date);
  });
  it("rejects an out-of-range month", () => {
    expect(parseV3DateTime("20241301")).toBeUndefined();
  });
  it("rejects an out-of-range hour", () => {
    expect(parseV3DateTime("2024010125")).toBeUndefined();
  });
  it("defaults month and day for a year-only value", () => {
    expect(parseV3DateTime("2024")?.toISOString()).toBe("2024-01-01T00:00:00.000Z");
  });
  it("defaults the day for a year-month value", () => {
    expect(parseV3DateTime("202406")?.toISOString()).toBe("2024-06-01T00:00:00.000Z");
  });
});

describe("namespaces", () => {
  it("recognizes the v3, xsi, and sdtc namespaces", () => {
    expect(isRecognizedNamespace(V3_NS)).toBe(true);
    expect(isRecognizedNamespace(XSI_NS)).toBe(true);
    expect(isRecognizedNamespace(SDTC_NS)).toBe(true);
  });
  it("rejects an unknown or null namespace", () => {
    expect(isRecognizedNamespace("urn:vendor")).toBe(false);
    expect(isRecognizedNamespace(null)).toBe(false);
  });
});

describe("DOM helpers", () => {
  it("attr returns undefined for an absent or empty attribute", () => {
    expect(attr(el(`<id/>`), "root")).toBeUndefined();
    expect(attr(el(`<id root=""/>`), "root")).toBeUndefined();
  });
  it("xsiType strips a leading prefix and reads the bare form", () => {
    expect(xsiType(el(`<value xsi:type="hl7:PQ"/>`))).toBe("PQ");
    expect(xsiType(el(`<value xsi:type="CD"/>`))).toBe("CD");
    expect(xsiType(el(`<value/>`))).toBeUndefined();
  });
  it("child / children / childElements / text walk the tree", () => {
    const wrap = el(`<observation><a/><a/><b>hi</b></observation>`);
    expect(child(wrap, "b")).toBeDefined();
    expect(children(wrap, "a")).toHaveLength(2);
    expect(childElements(wrap)).toHaveLength(3);
    expect(text(el(`<b>  hi  </b>`))).toBe("hi");
    expect(text(el(`<b/>`))).toBeUndefined();
  });
  it("positionOf yields a PHI-free locator", () => {
    const pos = positionOf(el(`<section/>`));
    expect(pos.path).toBe("section");
  });
});

describe("warning factory — unknownNamespacePrefix", () => {
  it("reports the prefix without any clinical value", () => {
    const w = unknownNamespacePrefix({ path: "value" }, "zz");
    expect(w.code).toBe(WARNING_CODES.UNKNOWN_NAMESPACE_PREFIX);
    expect(w.message).toContain("zz");
  });
});

describe("header / section / document structural edge cases", () => {
  it("handles a record target with no patient element", () => {
    const xml = buildCcda().replace(/<patient>[\s\S]*?<\/patient>/u, "");
    const patient = parseCcda(xml).getPatient();
    expect(patient?.identifiers[0]?.extension).toBe("MRN001");
    expect(patient?.name).toBeUndefined();
  });

  it("handles a name carrying only free text", () => {
    const xml = buildCcda().replace(/<name>[\s\S]*?<\/name>/u, "<name>Jane Doe</name>");
    expect(parseCcda(xml).getPatient()?.name?.text).toBe("Jane Doe");
  });

  it("frames a section with no text, code, or title", () => {
    const bare = `
      <component><section><templateId root="2.16.840.1.113883.10.20.22.2.17"/></section></component>`;
    const doc = parseCcda(buildCcda({ sections: bare }));
    expect(doc.findSection("socialHistory")).toBeDefined();
    expect(doc.findSection("socialHistory")?.narrativeText).toBeUndefined();
  });

  it("omits header fields and patient demographics the document does not carry", () => {
    const minimal = `<ClinicalDocument xmlns="${V3_NS}">
      <templateId root="2.16.840.1.113883.10.20.22.1.1" extension="2015-08-01"/>
      <templateId root="2.16.840.1.113883.10.20.22.1.2" extension="2015-08-01"/>
      <recordTarget><patientRole>
        <id root="2.16.840.1.113883.19.5"/>
        <patient><name><given>Jane</given></name></patient>
      </patientRole></recordTarget>
      <component><structuredBody/></component>
    </ClinicalDocument>`;
    const doc = parseCcda(minimal);
    expect(doc.documentType).toBe("ccd");
    expect(doc.header.documentId).toBeUndefined();
    expect(doc.header.code).toBeUndefined();
    expect(doc.header.title).toBeUndefined();
    expect(doc.header.effectiveTime).toBeUndefined();
    expect(doc.header.confidentialityCode).toBeUndefined();
    expect(doc.header.languageCode).toBeUndefined();
    const patient = doc.getPatient();
    expect(patient?.genderCode).toBeUndefined();
    expect(patient?.birthTime).toBeUndefined();
    expect(patient?.maritalStatusCode).toBeUndefined();
    expect(patient?.raceCode).toBeUndefined();
    expect(patient?.ethnicGroupCode).toBeUndefined();
    expect(doc.sections).toHaveLength(0);
  });

  it("ignores a patientRole-less record target", () => {
    const xml = buildCcda().replace(/<patientRole>[\s\S]*?<\/patientRole>/u, "");
    expect(parseCcda(xml).getPatient()).toBeUndefined();
  });

  it("handles a patient element carrying no name", () => {
    const xml = buildCcda().replace(/<name>[\s\S]*?<\/name>/u, "");
    expect(parseCcda(xml).getPatient()?.name).toBeUndefined();
  });

  it("frames an empty name element with no parts or free text", () => {
    const xml = buildCcda().replace(/<name>[\s\S]*?<\/name>/u, "<name></name>");
    const name = parseCcda(xml).getPatient()?.name;
    expect(name).toBeDefined();
    expect(name?.text).toBeUndefined();
    expect(name?.given).toBeUndefined();
    expect(name?.family).toBeUndefined();
  });

  it("emits no missing-assigning-authority warning when the id carries one", () => {
    const doc = parseCcda(buildCcda({ mrnAssigningAuthority: true }));
    expect(doc.getMrn()).toBe("MRN001");
    expect(doc.warnings.map((w) => w.code)).not.toContain(
      WARNING_CODES.MISSING_ASSIGNING_AUTHORITY,
    );
  });

  it("returns undefined for an unknown section key", () => {
    expect(parseCcda(buildCcda()).findSection("nonexistent")).toBeUndefined();
  });

  it("indexes only narrative nodes that carry both an ID and text", () => {
    const sections = `
      <component><section>
        <templateId root="2.16.840.1.113883.10.20.22.2.6.1"/>
        <text>Note <content ID="x"/> <content ID="y">seen</content></text>
      </section></component>`;
    const section = parseCcda(buildCcda({ sections })).findSection("allergies");
    expect(section?.narrativeText).toBe("Note  seen");
    expect(section?.narrativeById.get("y")).toBe("seen");
    expect(section?.narrativeById.has("x")).toBe(false);
  });

  it("frames a section whose text element is empty", () => {
    const sections = `
      <component><section>
        <templateId root="2.16.840.1.113883.10.20.22.2.6.1"/>
        <text/>
      </section></component>`;
    const section = parseCcda(buildCcda({ sections })).findSection("allergies");
    expect(section?.narrativeText).toBeUndefined();
    expect(section?.narrativeById.size).toBe(0);
  });

  it("tolerates predefined and custom entity references in narrative", () => {
    const sections = `
      <component><section>
        <templateId root="2.16.840.1.113883.10.20.22.2.6.1"/>
        <text>A &amp; B</text>
      </section></component>`;
    expect(parseCcda(buildCcda({ sections })).documentType).toBe("ccd");
  });

  it("emits UNKNOWN_DOCUMENT_TEMPLATE with an empty observed OID when no templateId has a root", () => {
    const xml = buildCcda({ includeHeaderTemplate: false, includeDocTemplate: false }).replace(
      "<id root=",
      "<templateId/>\n  <id root=",
    );
    const doc = parseCcda(xml);
    expect(doc.documentType).toBeUndefined();
    expect(doc.warnings.map((w) => w.code)).toContain(WARNING_CODES.UNKNOWN_DOCUMENT_TEMPLATE);
  });
});
