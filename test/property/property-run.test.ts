/**
 * How a property here runs (`./_property.ts`): through `@cosyte/test-utils`, at the depth
 * `COSYTE_PROPERTY_RUNS` sets, from a seed printed before the run, and a failure that names the
 * seed and path which replay it.
 */

import { PROPERTY_ENV } from "@cosyte/test-utils";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { checkProperty, propertyRun, propertyTimeout } from "./_property.js";

/** Collects what a run prints. */
function capture(): { lines: string[]; write: (line: string) => void } {
  const lines: string[] = [];
  return { lines, write: (line) => lines.push(line) };
}

describe("propertyRun", () => {
  it("prints the seed and the depth before the run, and always returns a seed", () => {
    const out = capture();
    const run = propertyRun("a name", {}, {}, out.write);
    expect(run.numRuns).toBe(100);
    expect(Number.isInteger(run.seed)).toBe(true);
    expect(out.lines).toEqual([
      `[property] a name: COSYTE_PROPERTY_SEED=${String(run.seed)} COSYTE_PROPERTY_RUNS=100\n`,
    ]);
  });

  it("takes the depth, the seed and the path from the environment over a test's own", () => {
    const out = capture();
    const run = propertyRun(
      "deep",
      { numRuns: 7, seed: 1 },
      { COSYTE_PROPERTY_RUNS: "10000", COSYTE_PROPERTY_SEED: "-42", COSYTE_PROPERTY_PATH: "3:1" },
      out.write,
    );
    expect(run).toEqual({ numRuns: 10000, seed: -42, path: "3:1" });
    expect(out.lines).toEqual([
      "[property] deep: COSYTE_PROPERTY_SEED=-42 COSYTE_PROPERTY_RUNS=10000\n",
    ]);
  });

  it("refuses a malformed depth rather than running the default", () => {
    expect(() => propertyRun("bad", {}, { COSYTE_PROPERTY_RUNS: "10k" }, () => {})).toThrow(
      RangeError,
    );
  });

  it("is the shared runner's environment, not a copy of it", () => {
    expect(PROPERTY_ENV).toEqual({
      runs: "COSYTE_PROPERTY_RUNS",
      seed: "COSYTE_PROPERTY_SEED",
      path: "COSYTE_PROPERTY_PATH",
    });
  });
});

describe("checkProperty", () => {
  const failing = fc.property(fc.nat(), (n) => n < 50);

  it("passes quietly when the property holds", () => {
    expect(() =>
      checkProperty(
        "holds",
        fc.property(fc.nat(), (n) => n >= 0),
        {},
        { COSYTE_PROPERTY_SEED: "1" },
      ),
    ).not.toThrow();
  });

  it("names the property and prints the seed and path that replay the failure, already shrunk", () => {
    let message = "";
    try {
      checkProperty("below fifty", failing, {}, { COSYTE_PROPERTY_SEED: "1" });
    } catch (err) {
      message = (err as Error).message;
    }
    const replay = /COSYTE_PROPERTY_SEED=(-?\d+) COSYTE_PROPERTY_PATH=([\d:]+)/u.exec(message);
    expect(replay?.[1]).toBe("1");
    expect(message).toContain("below fifty");
    expect(message).toContain("Counterexample: [50]");

    let replayed = "";
    try {
      checkProperty(
        "below fifty",
        failing,
        {},
        { COSYTE_PROPERTY_SEED: replay?.[1], COSYTE_PROPERTY_PATH: replay?.[2] },
      );
    } catch (err) {
      replayed = (err as Error).message;
    }
    expect(replayed).toMatch(/after 1 case/u);
    expect(replayed).toContain("Counterexample: [50]");
  });
});

describe("propertyTimeout", () => {
  it("scales a test's budget with the depth", () => {
    expect(propertyTimeout({})).toBe(60_000);
    expect(propertyTimeout({ COSYTE_PROPERTY_RUNS: "10000" })).toBe(1_000_000);
  });
});
