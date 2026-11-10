/**
 * Edge paths of `defineCcdaProfile` that the main profile suite does not reach: an unscoped
 * tolerance in `describe()`, a diamond of parents that share an ancestor, and an empty option key.
 */

import { describe, expect, it } from "vitest";

import { CcdaProfileDefinitionError, defineCcdaProfile } from "../src/index.js";

describe("describe() on an unscoped tolerance", () => {
  it("lists the code and rationale with no section or template scope", () => {
    const p = defineCcdaProfile({
      name: "site",
      tolerate: [{ code: "DEPRECATED_LOINC", rationale: "legacy feed" }],
    });
    const text = p.describe?.() ?? "";
    expect(text).toContain("tolerates 1 quirk(s):");
    expect(text).toContain("    - DEPRECATED_LOINC: legacy feed");
    expect(text).not.toContain("@section");
    expect(text).not.toContain("@template");
  });
});

describe("lineage of a diamond of parents", () => {
  it("lists a shared ancestor once, at its first occurrence", () => {
    const base = defineCcdaProfile({ name: "base" });
    const left = defineCcdaProfile({ name: "left", extends: base });
    const right = defineCcdaProfile({ name: "right", extends: base });
    const joined = defineCcdaProfile({ name: "joined", extends: [left, right] });
    expect(joined.lineage).toStrictEqual(["base", "left", "right", "joined"]);
    expect(joined.describe?.()).toContain("lineage: base → left → right → joined");
  });
});

describe("unknown option keys", () => {
  it("rejects an empty key without a did-you-mean hint", () => {
    let thrown: unknown;
    try {
      // @ts-expect-error, an empty string is not a known option key.
      defineCcdaProfile({ name: "x", "": true });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(CcdaProfileDefinitionError);
    const message = (thrown as Error).message;
    expect(message).toContain("unknown option key ''");
    expect(message).not.toContain("Did you mean");
  });
});
