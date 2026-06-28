import { describe, expect, it } from "vitest";
import { DOMParser } from "@xmldom/xmldom";
import type { Element } from "@xmldom/xmldom";

import {
  parseIi,
  parseSt,
  parseBl,
  parseBlAttr,
  parseCd,
  parsePq,
  parseIvlPq,
  parseTs,
  parseIvlTs,
  parseEd,
  parseV3DateTime,
  isNullFlavor,
  NULL_FLAVORS,
  type CcdaWarning,
} from "../src/index.js";

const NS = "urn:hl7-org:v3";

/** Parse a standalone HL7 v3 element fragment for datatype testing. */
function el(fragment: string): Element {
  const xml = `<wrap xmlns="${NS}">${fragment}</wrap>`;
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const root = doc.documentElement;
  if (root === null || root.firstChild === null) throw new Error("fixture parse failed");
  return root.firstChild as Element;
}

function ctx(): { warnings: CcdaWarning[]; emit: (w: CcdaWarning) => void } {
  const warnings: CcdaWarning[] = [];
  return { warnings, emit: (w) => warnings.push(w) };
}

describe("datatype parsers return undefined for an absent element", () => {
  const c = ctx();
  it.each([parseIi, parseSt, parseBl, parseCd, parsePq, parseIvlPq, parseTs, parseIvlTs, parseEd])(
    "parser #%# returns undefined",
    (parse) => {
      expect(parse(undefined, c)).toBeUndefined();
    },
  );
});

describe("II", () => {
  it("parses root + extension + assigningAuthorityName", () => {
    const ii = parseIi(el(`<id root="1.2.3" extension="X" assigningAuthorityName="Auth"/>`), ctx());
    expect(ii).toEqual({ root: "1.2.3", extension: "X", assigningAuthorityName: "Auth" });
  });
  it("captures a nullFlavor", () => {
    expect(parseIi(el(`<id nullFlavor="UNK"/>`), ctx())?.nullFlavor).toBe("UNK");
  });
});

describe("ST", () => {
  it("captures trimmed text", () => {
    expect(parseSt(el(`<title>  Hi  </title>`), ctx())?.value).toBe("Hi");
  });
});

describe("BL", () => {
  it("parses true/false values", () => {
    expect(parseBl(el(`<value value="true"/>`), ctx())?.value).toBe(true);
    expect(parseBl(el(`<value value="false"/>`), ctx())?.value).toBe(false);
  });
  it("reads a boolean attribute via parseBlAttr", () => {
    expect(parseBlAttr(el(`<observation negationInd="true"/>`), "negationInd")).toBe(true);
    expect(parseBlAttr(el(`<observation/>`), "negationInd")).toBeUndefined();
  });
});

describe("CD", () => {
  it("parses code + system + translation + originalText", () => {
    const cd = parseCd(
      el(
        `<code code="x" codeSystem="s" displayName="d"><originalText>orig</originalText><translation code="t"/></code>`,
      ),
      ctx(),
    );
    expect(cd?.code).toBe("x");
    expect(cd?.codeSystem).toBe("s");
    expect(cd?.displayName).toBe("d");
    expect(cd?.originalText).toBe("orig");
    expect(cd?.translation?.[0]?.code).toBe("t");
  });
});

describe("PQ", () => {
  it("parses a numeric value + unit and preserves raw", () => {
    const pq = parsePq(el(`<value value="12.5" unit="mg"/>`), ctx());
    expect(pq?.value).toBe(12.5);
    expect(pq?.unit).toBe("mg");
    expect(pq?.raw).toBe("12.5");
  });
  it("omits value but preserves raw for a non-numeric quantity", () => {
    const pq = parsePq(el(`<value value="N/A" unit="mg"/>`), ctx());
    expect(pq?.value).toBeUndefined();
    expect(pq?.raw).toBe("N/A");
  });
});

describe("IVL_PQ", () => {
  it("parses low + high bounds", () => {
    const ivl = parseIvlPq(
      el(`<value><low value="1" unit="mg"/><high value="9" unit="mg"/></value>`),
      ctx(),
    );
    expect(ivl?.low?.value).toBe(1);
    expect(ivl?.high?.value).toBe(9);
  });
});

describe("TS", () => {
  it("parses a valid timestamp", () => {
    const ts = parseTs(el(`<effectiveTime value="20240101"/>`), ctx());
    expect(ts?.date).toBeInstanceOf(Date);
    expect(ts?.raw).toBe("20240101");
  });
  it("warns on a malformed timestamp", () => {
    const c = ctx();
    const ts = parseTs(el(`<effectiveTime value="garbage"/>`), c);
    expect(ts?.date).toBeUndefined();
    expect(c.warnings.map((w) => w.code)).toContain("MALFORMED_DATETIME");
  });
});

describe("IVL_TS", () => {
  it("parses low/high interval bounds", () => {
    const ivl = parseIvlTs(
      el(`<effectiveTime><low value="20240101"/><high value="20240201"/></effectiveTime>`),
      ctx(),
    );
    expect(ivl?.low?.date).toBeInstanceOf(Date);
    expect(ivl?.high?.date).toBeInstanceOf(Date);
  });
  it("parses a point-in-time value form", () => {
    const ivl = parseIvlTs(el(`<effectiveTime value="20240101"/>`), ctx());
    expect(ivl?.value?.date).toBeInstanceOf(Date);
  });
});

describe("ED", () => {
  it("captures base64 content verbatim without decoding", () => {
    const ed = parseEd(el(`<text mediaType="image/png" representation="B64">QUJD</text>`), ctx());
    expect(ed?.representation).toBe("B64");
    expect(ed?.value).toBe("QUJD");
  });
  it("resolves a reference value", () => {
    const ed = parseEd(el(`<text><reference value="#img1"/></text>`), ctx());
    expect(ed?.reference).toBe("#img1");
  });
});

describe("parseV3DateTime", () => {
  it("returns a Date for a full timestamp with offset", () => {
    expect(parseV3DateTime("20240101120000-0500")).toBeInstanceOf(Date);
  });
  it("treats a no-offset value as UTC", () => {
    const d = parseV3DateTime("20240101");
    expect(d?.getUTCFullYear()).toBe(2024);
  });
  it("returns undefined for an out-of-range day", () => {
    expect(parseV3DateTime("20240230")).toBeUndefined();
  });
  it("returns undefined for unparseable input", () => {
    expect(parseV3DateTime("nonsense")).toBeUndefined();
  });
});

describe("null flavors", () => {
  it("recognizes the canonical set", () => {
    for (const nf of NULL_FLAVORS) expect(isNullFlavor(nf)).toBe(true);
    expect(isNullFlavor("NOPE")).toBe(false);
  });
});
