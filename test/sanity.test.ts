import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  CCDA_CONFORMANCE_RELEASE,
  CCDA_RELEASES,
  CCDA_RELEASE_STAMPS,
  R21_EXTENSION,
  R30_EXTENSION,
  readTemplateStamp,
  releaseForTemplateExtension,
  VERSION,
} from "../src/index.js";

const pkg: unknown = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

/** Narrow the parsed manifest without an `as` cast: the sanity test must not lie about its input. */
function manifestVersion(manifest: unknown): string {
  if (typeof manifest !== "object" || manifest === null || !("version" in manifest)) {
    throw new Error("package.json did not parse to an object with a `version` field");
  }
  const { version } = manifest;
  if (typeof version !== "string") throw new Error("package.json `version` is not a string");
  return version;
}

describe("toolchain sanity", () => {
  it("resolves the public entry point and exports VERSION as a string", () => {
    expect(typeof VERSION).toBe("string");
    expect(VERSION.length).toBeGreaterThan(0);
  });

  it("package exports VERSION matching package.json", () => {
    // Compared against package.json, never a hardcoded literal. `changeset version` bumps
    // package.json alone, so a release that skipped `scripts/sync-version.mjs` (wired into the
    // `version` script) would publish a VERSION export that lies about the release.
    //
    // This repo is not currently defective: the 0.0.8 release commit moved package.json and the
    // constant together. So this is a guard for a guard. If that step is ever removed, reordered
    // or silently fails, nothing else here catches it. `@cosyte/transform` is the worked example,
    // publishing VERSION "0.0.0" on 0.0.2, 0.0.3 and 0.0.4 while its manifest said otherwise, with
    // astm 0.0.1 and terminology 0.0.1 as earlier instances of the same class. A shape-only
    // assertion identical to the one below stayed green through all three.
    expect(VERSION).toBe(manifestVersion(pkg));
  });

  it("exposes VERSION as a semver-looking string", () => {
    // Shape only, so a bump needs no edit here: the value itself is pinned to package.json above.
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+(?:[.-].+)?$/);
  });
});

/**
 * AC4. "Which C-CDA release does this validate against" used to be answerable
 * only by reading a README sentence, which is a claim a consumer cannot branch
 * on and a release cannot keep honest. It is a value now.
 */
describe("the targeted C-CDA release is an exported value", () => {
  it("names R2.1, on the package entry point", () => {
    expect(CCDA_CONFORMANCE_RELEASE).toBe("R2.1");
    expect(typeof CCDA_CONFORMANCE_RELEASE).toBe("string");
    // It is a member of the closed release set, not free text beside it.
    expect([...CCDA_RELEASES]).toContain(CCDA_CONFORMANCE_RELEASE);
  });

  it("does not move because a later release is recognized", () => {
    // The distinction the whole phase turns on: this package can NAME the stamp
    // C-CDA introduced at Release 3.0.0 without targeting that release, and a
    // change that retargets the library has to move the line above.
    expect(R21_EXTENSION).toBe("2015-08-01");
    expect(R30_EXTENSION).toBe("2024-05-01");
    expect(releaseForTemplateExtension(R21_EXTENSION)).toBe(CCDA_CONFORMANCE_RELEASE);
    expect(releaseForTemplateExtension(R30_EXTENSION)).not.toBe(CCDA_CONFORMANCE_RELEASE);
    // The conformance tables are written against the targeted release, so the
    // stamp that carries them is the one it names.
    expect(CCDA_RELEASE_STAMPS.find((e) => e.release === CCDA_CONFORMANCE_RELEASE)?.stamp).toBe(
      R21_EXTENSION,
    );
  });

  it("keeps the stamp table closed, and reports a non-member as unknown", () => {
    expect(CCDA_RELEASE_STAMPS.map((e) => e.stamp)).toEqual(["2015-08-01", "2024-05-01"]);
    for (const value of ["", "2024-05-02", "1999-12-31", "not a date"]) {
      expect(releaseForTemplateExtension(value)).toBeUndefined();
    }
  });

  it("reads a version stamp into exactly one of three states", () => {
    expect(readTemplateStamp(undefined)).toBe("unstamped");
    expect(readTemplateStamp(R21_EXTENSION)).toBe("r21-stamped");
    expect(readTemplateStamp(R30_EXTENSION)).toBe("unmodeled-release");
    // Including a value the table does not own: not modelling a release and not
    // recognizing a stamp at all land in the same state, because from this
    // package's side they are the same fact.
    expect(readTemplateStamp("1999-12-31")).toBe("unmodeled-release");
    expect(readTemplateStamp("")).toBe("unmodeled-release");
  });
});
