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

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BUILT_DOCUMENT_CASES, SELF_TEST_SCHEMA, writeTarGz } from "../__fixtures__/conformance.js";
import { CONFORMANCE_CODES, ConformanceError } from "../../scripts/conformance/errors.js";
import { runConformance, runConformanceCli } from "../../scripts/conformance/run.js";
import type { CliOptions } from "../../scripts/conformance/run.js";
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

/**
 * The built cases a run can be CLEAN over with the self-test artifacts in place.
 *
 * The self-test Schematron's second pattern asserts `false()` on every `cda:observation` it
 * reaches, which is how the tests about first-rule-wins see the shadowed rule fire. A real
 * populated document carries observations, so it is dirty against that artifact by design, and
 * a case whose subject is the exit code on a CLEAN run has to use documents that carry none.
 * The two minimal inits are exactly that: every SHALL section is an empty `nullFlavor="NI"`
 * one. Nothing about the harness is weakened by the choice; the real artifacts and the real
 * documents are what `pnpm conformance` measures.
 */
const CLEAN_AGAINST_SELF_TEST = BUILT_DOCUMENT_CASES.filter((entry) =>
  entry.name.endsWith("-minimal"),
);

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

describe("AC-5: the refusal reaches the shell, not only the caller", () => {
  /**
   * THE LAST LINK, WHICH THE REFUSALS ABOVE DO NOT COVER. Every case above proves the harness
   * refuses; none of them proves `pnpm conformance` exits non-zero when it does. Delete the
   * exit-code assignment and all of them stay green while CI reports a pass over a failed run,
   * which is the false-green shape `scripts/attw.mjs` exists to refuse. These drive the whole
   * command-line run, with only the network doubled, and assert the number it resolves to.
   *
   * The report path is a file in the per-test temporary directory, never the tracked one: a
   * test that rewrote `documentation/conformance-report.md` would break AC-9 to check AC-5.
   */
  function cli(overrides: Partial<CliOptions>): {
    readonly options: CliOptions;
    readonly out: string[];
    readonly err: string[];
  } {
    const out: string[] = [];
    const err: string[] = [];
    const { fetcher } = fullyServingFetcher(ARCHIVE);
    return {
      out,
      err,
      options: {
        fetcher,
        directory,
        readPins: () => selfTestPins(ARCHIVE),
        builtDocuments: BUILT_DOCUMENT_CASES,
        reportPath: join(directory, "report.md"),
        stdout: (text) => out.push(text),
        stderr: (text) => err.push(text),
        ...overrides,
      },
    };
  }

  it("exits 1 when the run validated zero documents", async () => {
    const { options, err } = cli({ builtDocuments: [] });
    expect(await runConformanceCli(options)).toBe(1);
    expect(err.join("")).toContain(CONFORMANCE_CODES.NO_DOCUMENTS_VALIDATED);
  });

  it("exits 1 when the corpus unpacked to zero documents", async () => {
    const empty = writeTarGz([]);
    const { fetcher } = fullyServingFetcher(empty);
    const { options, err } = cli({ fetcher, readPins: () => selfTestPins(empty) });
    expect(await runConformanceCli(options)).toBe(1);
    expect(err.join("")).toContain(CONFORMANCE_CODES.CORPUS_EMPTY);
  });

  it("exits 1 when the network is denied", async () => {
    const { options, err } = cli({ fetcher: servingFetcher({}).fetcher });
    expect(await runConformanceCli(options)).toBe(1);
    expect(err.join("")).toContain(CONFORMANCE_CODES.ARTIFACT_UNREACHABLE);
  });

  it("exits 1 when a built document carries an error-severity result", async () => {
    // Measured, not simulated: the strict self-test schema describes the self-test documents and
    // nothing else, so a real CCD really is invalid against it and the real validator really does
    // say so. Nothing below the network is doubled to produce this.
    const strict = new TextEncoder().encode(SELF_TEST_SCHEMA);
    const { options, err } = cli({
      readPins: () => selfTestPins(ARCHIVE, SELF_TEST_SCHEMA),
      fetcher: fullyServingFetcher(ARCHIVE, { [SELF_TEST_URLS.schema]: strict }).fetcher,
    });
    expect(await runConformanceCli(options)).toBe(1);
    expect(err.join("")).toContain(CONFORMANCE_CODES.ERRORS_FOUND);
  });

  it("exits 1 when a report exists on disk and differs from the run", async () => {
    // The covered branch elsewhere is the ABSENT report. This is the other one: a report that
    // is there, is stale, and is rewritten. Both have to reach the shell.
    const { options, err } = cli({ builtDocuments: CLEAN_AGAINST_SELF_TEST });
    writeFileSync(options.reportPath, "# Conformance report\n\nstale bytes\n");
    expect(await runConformanceCli(options)).toBe(1);
    expect(err.join("")).toContain(CONFORMANCE_CODES.REPORT_STALE);
    expect(err.join("")).toContain("did not match this run");
  });

  it("exits 0 only when the run was clean and the report already matched it", async () => {
    const first = cli({ builtDocuments: CLEAN_AGAINST_SELF_TEST });
    // The first run writes the report and refuses, because nothing was there to match.
    expect(await runConformanceCli(first.options)).toBe(1);
    expect(first.err.join("")).toContain(CONFORMANCE_CODES.REPORT_STALE);
    const second = cli({
      builtDocuments: CLEAN_AGAINST_SELF_TEST,
      reportPath: first.options.reportPath,
    });
    const code = await runConformanceCli(second.options);
    expect(second.err.join("")).toBe("");
    expect(code).toBe(0);
    expect(second.out.join("")).toContain("conformance: OK");
  });
});
