/**
 * AC-4 and AC-5: the conformance harness fails explicitly rather than reporting a pass it did
 * not earn.
 *
 * EVERY CASE ASSERTS THE EXACT CODE, NEVER `not.toBe(0)`. A crash also produces a non-zero
 * exit and an error, so a test that accepted any failure would accept the one outcome this
 * gate exists to distinguish: a harness that refused, and a harness that fell over before it
 * could refuse. `phi-scan-overrides.md` names that trap for this repository's other gate and
 * it is the same trap here.
 *
 * ONLY THE NETWORK IS DOUBLED (`testing` T3). The digest check, the archive reader and the
 * emptiness refusals below are the real harness, running for real.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BUILT_DOCUMENT_CASES, writeTarGz } from "../__fixtures__/conformance.js";
import { CONFORMANCE_CODES, ConformanceError } from "../../scripts/conformance/errors.js";
import { runConformance } from "../../scripts/conformance/run.js";
import { buildCcda, serializeCcda } from "../../src/index.js";
import {
  SELF_TEST_URLS,
  fullyServingFetcher,
  selfTestPins,
  servingFetcher,
} from "./_self-test-pins.js";

/** One whole C-CDA document, so the corpus half of a run has something real to work on. */
const CORPUS_DOCUMENT = serializeCcda(
  buildCcda({ patient: { mrn: "MRN002" }, effectiveTime: "20240102030405+0000" }),
);

const ARCHIVE = writeTarGz([{ path: "Self Test/document.xml", text: CORPUS_DOCUMENT }]);

let directory = "";

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "ccda-conformance-"));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

/** Run the harness and return the `ConformanceError` it refused with. */
async function refusal(run: () => Promise<unknown>): Promise<ConformanceError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof ConformanceError) return error;
    throw new Error(
      `expected a ConformanceError, got ${error instanceof Error ? error.name : typeof error}`,
      { cause: error },
    );
  }
  throw new Error("expected the harness to refuse, it returned a result");
}

describe("AC-4: an unobtainable artifact fails the check rather than reporting a pass", () => {
  it("refuses with ARTIFACT_UNREACHABLE when the network is denied outright", async () => {
    const { fetcher } = servingFetcher({});
    const error = await refusal(() =>
      runConformance({
        fetcher,
        directory,
        pins: selfTestPins(ARCHIVE),
        builtDocuments: BUILT_DOCUMENT_CASES,
      }),
    );
    expect(error.code).toBe(CONFORMANCE_CODES.ARTIFACT_UNREACHABLE);
    expect(error.context).toContain(SELF_TEST_URLS.schematron);
    expect(error.remedy).toContain("network egress");
  });

  it("refuses with ARTIFACT_UNREACHABLE when only the corpus is unobtainable", async () => {
    const { fetcher } = fullyServingFetcher(ARCHIVE);
    const pins = selfTestPins(ARCHIVE);
    const denied = servingFetcher({});
    const error = await refusal(() =>
      runConformance({
        fetcher: (url) => (url === SELF_TEST_URLS.corpus ? denied.fetcher(url) : fetcher(url)),
        directory,
        pins,
        builtDocuments: BUILT_DOCUMENT_CASES,
      }),
    );
    expect(error.code).toBe(CONFORMANCE_CODES.ARTIFACT_UNREACHABLE);
    expect(error.context).toContain(SELF_TEST_URLS.corpus);
  });

  it("refuses with ARTIFACT_MISSING_PATH when the corpus archive is not an archive", async () => {
    const { fetcher } = fullyServingFetcher(ARCHIVE, {
      [SELF_TEST_URLS.corpus]: new TextEncoder().encode("not a gzip stream"),
    });
    const error = await refusal(() =>
      runConformance({
        fetcher,
        directory,
        pins: selfTestPins(ARCHIVE),
        builtDocuments: BUILT_DOCUMENT_CASES,
      }),
    );
    expect(error.code).toBe(CONFORMANCE_CODES.ARTIFACT_MISSING_PATH);
  });

  it("refuses with ARTIFACT_MISSING_PATH when the schema pin names an entry it does not carry", async () => {
    const pins = selfTestPins(ARCHIVE);
    const { fetcher } = fullyServingFetcher(ARCHIVE);
    const error = await refusal(() =>
      runConformance({
        fetcher,
        directory,
        pins: { ...pins, cdaSchema: { ...pins.cdaSchema, entry: "absent.xsd" } },
        builtDocuments: BUILT_DOCUMENT_CASES,
      }),
    );
    expect(error.code).toBe(CONFORMANCE_CODES.ARTIFACT_MISSING_PATH);
    expect(error.context).toContain("absent.xsd");
  });
});

describe("AC-5: a run that validated nothing fails and names which state it observed", () => {
  it("refuses with NO_DOCUMENTS_VALIDATED over an empty document set", async () => {
    const { fetcher } = fullyServingFetcher(ARCHIVE);
    const error = await refusal(() =>
      runConformance({ fetcher, directory, pins: selfTestPins(ARCHIVE), builtDocuments: [] }),
    );
    expect(error.code).toBe(CONFORMANCE_CODES.NO_DOCUMENTS_VALIDATED);
    expect(error.context).toContain("validated zero documents");
  });

  it("refuses with CORPUS_EMPTY when the archive unpacks to zero documents", async () => {
    const empty = writeTarGz([]);
    const { fetcher } = fullyServingFetcher(empty);
    const error = await refusal(() =>
      runConformance({
        fetcher,
        directory,
        pins: selfTestPins(empty),
        builtDocuments: BUILT_DOCUMENT_CASES,
      }),
    );
    expect(error.code).toBe(CONFORMANCE_CODES.CORPUS_EMPTY);
    expect(error.context).toContain("zero documents");
  });

  it("refuses with CORPUS_EMPTY when the archive carries only fragments, never whole documents", async () => {
    // The public corpus is mostly entry-level and section-level fragments, and the round-trip
    // check is defined over whole documents. An archive that unpacks cleanly and yields no
    // whole document is the same false green as one that yields nothing at all, and it names
    // the state it observed rather than sharing a code with the other one.
    const fragments = writeTarGz([
      {
        path: "Fragments/section.xml",
        text: '<section xmlns="urn:hl7-org:v3"><title>x</title></section>',
      },
    ]);
    const { fetcher } = fullyServingFetcher(fragments);
    const error = await refusal(() =>
      runConformance({
        fetcher,
        directory,
        pins: selfTestPins(fragments),
        builtDocuments: BUILT_DOCUMENT_CASES,
      }),
    );
    expect(error.code).toBe(CONFORMANCE_CODES.CORPUS_EMPTY);
    expect(error.context).toContain("root element is ClinicalDocument");
  });

  it("the two empty states are distinct codes, so a reader can tell them apart", () => {
    expect(CONFORMANCE_CODES.NO_DOCUMENTS_VALIDATED).not.toBe(CONFORMANCE_CODES.CORPUS_EMPTY);
  });
});
