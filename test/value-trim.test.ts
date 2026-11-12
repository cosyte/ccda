/**
 * The one rule the model reads a value's ends by: white space at either end of a text or an
 * attribute value is removed, where white space is every character `String.prototype.trim`
 * removes (the Unicode spaces, tab, line feed, carriage return, LINE SEPARATOR, PARAGRAPH
 * SEPARATOR, U+FEFF) and NEL (U+0085), which `trim` keeps. The three characters XML 1.1 reads as
 * line breaks are treated alike. A character inside the value is never touched.
 */

import type { Element } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";

import {
  parseCd,
  parsePq,
  parseSecureXml,
  readObservationValue,
  resolveLimits,
  text,
  V3_NS,
  XSI_NS,
  type CcdaWarning,
} from "../src/index.js";
import * as dom from "../src/model/dom.js";
import { reconcileCode } from "../src/model/entries/shared.js";
import type { ParseCtx } from "../src/model/types/_shared.js";
import { assertsConcept } from "../src/model/types/cd.js";

const NEL = "\u0085";

/**
 * A standalone HL7 v3 element fragment, read as a parse reads it: `@xmldom/xmldom`'s own default
 * would rewrite NEL as a line break, which XML 1.0 does not.
 */
function el(fragment: string): Element {
  const xml = `<wrap xmlns="${V3_NS}" xmlns:xsi="${XSI_NS}">${fragment}</wrap>`;
  const root = parseSecureXml(xml, resolveLimits(), () => {}).documentElement;
  if (root === null || root.firstChild === null) throw new Error("fixture parse failed");
  return root.firstChild as Element;
}

function ctx(): ParseCtx & { readonly warnings: CcdaWarning[] } {
  const warnings: CcdaWarning[] = [];
  return { warnings, emit: (w) => warnings.push(w) };
}

describe("trimValue", () => {
  it.each([
    ["spaces, tabs and line feeds", " \t\nx y\n\t ", "x y"],
    ["NEL at both ends", `${NEL}x${NEL}`, "x"],
    [
      "NEL among other white space at both ends",
      ` ${NEL} \u2028${NEL}xy${NEL}\u2029 ${NEL} `,
      "xy",
    ],
    ["NEL, then a space, then NEL at the start", `${NEL} ${NEL}abc`, "abc"],
    ["NEL, then a space, then NEL at the end", `abc${NEL} ${NEL}`, "abc"],
    ["LINE SEPARATOR and PARAGRAPH SEPARATOR", "\u2028x\u2029", "x"],
    ["a no-break space and U+FEFF", "\u00a0x\ufeff", "x"],
    ["nothing but NEL", `${NEL}${NEL}`, ""],
    ["nothing but white space", " \u00a0\u2028", ""],
  ])("removes %s", (_label, value, expected) => {
    expect(dom.trimValue(value)).toBe(expected);
  });

  it("keeps NEL and every other white space inside the value", () => {
    expect(dom.trimValue(`${NEL}a${NEL}b c\u2028d${NEL}`)).toBe(`a${NEL}b c\u2028d`);
  });

  it("returns a value with no white space at its ends as it is", () => {
    expect(dom.trimValue("abc")).toBe("abc");
    expect(dom.trimValue("")).toBe("");
  });
});

describe("the model reads NEL at a value's ends as it reads the other white space", () => {
  it("in an element's text", () => {
    expect(text(el(`<title>${NEL} Synthetic title ${NEL}</title>`))).toBe("Synthetic title");
    expect(text(el(`<title>\u2028Synthetic title\u2029</title>`))).toBe("Synthetic title");
    expect(text(el(`<title>${NEL}</title>`))).toBeUndefined();
  });

  it("in a code that asserts a concept or does not", () => {
    expect(assertsConcept(NEL)).toBe(false);
    expect(assertsConcept(` ${NEL} `)).toBe(false);
    expect(assertsConcept(`${NEL}X${NEL}`)).toBe(true);
    expect(assertsConcept(undefined)).toBe(false);
  });

  it("in a coded value with a nullFlavor, which a code of NEL alone does not contradict", () => {
    const blank = ctx();
    parseCd(el(`<code code="${NEL}" nullFlavor="UNK"/>`), blank);
    expect(blank.warnings.map((w) => w.code)).toEqual([]);
    const asserted = ctx();
    parseCd(el(`<code code="X" nullFlavor="UNK"/>`), asserted);
    expect(asserted.warnings.map((w) => w.code)).toContain("CONTRADICTORY_NULL_FLAVOR");
  });

  it("in a physical quantity's value", () => {
    expect(parsePq(el(`<value value="${NEL}5.5${NEL}" unit="mg"/>`), ctx())?.value).toBe(5.5);
    expect(parsePq(el(`<value value=" 7 " unit="mg"/>`), ctx())?.value).toBe(7);
    const blank = parsePq(el(`<value value=" ${NEL} " unit="mg"/>`), ctx());
    expect(blank?.value).toBeUndefined();
    expect(blank?.raw).toBe(` ${NEL} `);
    expect(parsePq(el(`<value value="  " unit="mg"/>`), ctx())?.value).toBeUndefined();
  });

  it("in an integer or real observation value", () => {
    expect(
      readObservationValue(el(`<value xsi:type="INT" value="${NEL}12${NEL}"/>`), ctx()),
    ).toStrictEqual({ kind: "integer", raw: `${NEL}12${NEL}`, value: 12 });
    expect(
      readObservationValue(el(`<value xsi:type="REAL" value="${NEL}1.5"/>`), ctx()),
    ).toStrictEqual({ kind: "real", raw: `${NEL}1.5`, value: 1.5 });
  });

  it("in a code's label compared with the narrative", () => {
    const blank = ctx();
    reconcileCode({ displayName: NEL }, "Synthetic allergen", "allergen", {}, blank);
    expect(blank.warnings).toEqual([]);
    const padded = ctx();
    reconcileCode(
      { displayName: `${NEL}Synthetic Allergen${NEL}` },
      `${NEL}synthetic allergen`,
      "allergen",
      {},
      padded,
    );
    expect(padded.warnings).toEqual([]);
    const other = ctx();
    reconcileCode({ displayName: "Synthetic A" }, "Synthetic B", "allergen", {}, other);
    expect(other.warnings.map((w) => w.code)).toEqual(["CODE_NARRATIVE_MISMATCH"]);
  });
});
