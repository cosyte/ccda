/**
 * `scripts/sync-readme-version.ts` keeps the version README.md's `## Status` declares equal to
 * `package.json` across a Changesets version commit, which is what lets that commit pass the README
 * status check in `test/docs-content.test.ts` before the release publishes it. Every case is driven
 * on README text built here, except the last, which reads this repository's own README.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { syncReadmeVersion } from "../../scripts/sync-readme-version.js";

const README = [
  "# @cosyte/ccda",
  "",
  "## Status",
  "",
  "`package.json` declares **`0.0.15`**. From `0.1.0` the public API is settled.",
  "",
  "## Install",
  "",
  "**`9.9.9`** outside the section is never touched.",
  "",
].join("\n");

describe("syncing the README status version", () => {
  it("rewrites the one marker in ## Status to the manifest version", () => {
    const result = syncReadmeVersion(README, "0.1.0");
    expect("text" in result && result.text).toBe(README.replace("**`0.0.15`**", "**`0.1.0`**"));
  });

  it("leaves everything outside the marker byte for byte", () => {
    const result = syncReadmeVersion(README, "0.1.0");
    const text = "text" in result ? result.text : "";
    expect(text).toContain("From `0.1.0` the public API is settled.");
    expect(text).toContain("**`9.9.9`** outside the section is never touched.");
  });

  it("is idempotent", () => {
    expect(syncReadmeVersion(README, "0.0.15")).toEqual({ text: README });
  });

  it("refuses a README with no ## Status section", () => {
    expect(syncReadmeVersion("# x\n\n## Install\n", "0.1.0")).toHaveProperty("error");
  });

  it("refuses a status with no marker, so a reworded line cannot stop being synced in silence", () => {
    const reworded = README.replace("**`0.0.15`**", "`0.0.15`");
    expect(syncReadmeVersion(reworded, "0.1.0")).toHaveProperty("error");
  });

  it("refuses a status with two markers", () => {
    const doubled = README.replace(
      "declares **`0.0.15`**",
      "declares **`0.0.15`**, then **`0.0.14`**",
    );
    expect(syncReadmeVersion(doubled, "0.1.0")).toHaveProperty("error");
  });

  it("refuses a manifest version that is not a semantic version", () => {
    expect(syncReadmeVersion(README, "")).toHaveProperty("error");
    expect(syncReadmeVersion(README, "$&")).toHaveProperty("error");
  });

  it("finds exactly one marker in this repository's README, already in sync", () => {
    const readme = readFileSync(join(import.meta.dirname, "..", "..", "README.md"), "utf8");
    const pkg: unknown = JSON.parse(
      readFileSync(join(import.meta.dirname, "..", "..", "package.json"), "utf8"),
    );
    const version =
      typeof pkg === "object" && pkg !== null && "version" in pkg && typeof pkg.version === "string"
        ? pkg.version
        : "";
    expect(syncReadmeVersion(readme, version)).toEqual({ text: readme });
  });
});
