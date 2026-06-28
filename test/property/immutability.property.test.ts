/**
 * Property test for the immutability contract of the parsed `CcdaDocument`.
 *
 * The read surface (`warnings`, `sections`, the entry collections) is declared
 * `readonly` and the `warnings` array is frozen; the only sanctioned change is
 * the explicit, structural-sharing copy-with (`withWarnings`), which returns a
 * NEW document and never touches the original. This asserts, over generated
 * documents, that a mutation attempt leaves the original's serialized form and
 * warning set byte-for-byte unchanged.
 */

import { describe, it } from "vitest";
import { immutabilityProperty } from "@cosyte/test-utils";

import { parseCcda, type CcdaWarning } from "../../src/index.js";

import { specCleanCcdaXml } from "./_arbitraries.js";

const EXTRA_WARNING: CcdaWarning = {
  code: "SECTION_PLACEMENT_SUSPECT",
  message: "synthetic post-parse annotation",
  position: {},
};

describe("ccda immutability (archetype invariant)", () => {
  it("withWarnings returns a new document and never perturbs the original", () => {
    immutabilityProperty({
      arbitrary: specCleanCcdaXml(),
      parse: (raw) => parseCcda(raw),
      // The copy-with is the sanctioned mutation: it returns a new instance,
      // which the runner accepts as a correct immutable response.
      mutate: (doc) => doc.withWarnings([EXTRA_WARNING]),
      getSnapshot: (doc) => ({
        serialized: doc.toString(),
        warningCodes: doc.warnings.map((w) => w.code),
      }),
    });
  });
});
