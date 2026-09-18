/**
 * AC-3 and AC-7: where the validation artifacts come from, and what happens when they are not
 * what this repository pinned.
 *
 * AC-3 is two claims and both are checked here: no validation artifact is COMMITTED, and the
 * harness obtains each one through the fetch layer rather than from a checked-in path. The
 * strongest form of the second is the one the spec names: denied the network, the harness
 * cannot produce a validation result at all. A harness quietly reading a vendored copy would
 * still return one.
 *
 * AC-7 is the pin doing its job: bytes that do not hash to what the repository pinned are
 * refused, and no validation result is produced from them.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BUILT_DOCUMENT_CASES, writeTarGz } from "../__fixtures__/conformance.js";
import { CONFORMANCE_CODES, ConformanceError } from "../../scripts/conformance/errors.js";
import { PIN_FILE_PATH, readPins } from "../../scripts/conformance/pins.js";
import { runConformance } from "../../scripts/conformance/run.js";
import { buildCcda, serializeCcda } from "../../src/index.js";
import {
  SELF_TEST_URLS,
  fullyServingFetcher,
  selfTestPins,
  servingFetcher,
} from "./_self-test-pins.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const ARCHIVE = writeTarGz([
  {
    path: "Self Test/document.xml",
    text: serializeCcda(
      buildCcda({ patient: { mrn: "MRN002" }, effectiveTime: "20240102030405+0000" }),
    ),
  },
]);

let directory = "";

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "ccda-conformance-"));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

function trackedPaths(): string[] {
  return execFileSync("git", ["ls-files", "-z"], { cwd: REPO_ROOT, encoding: "utf8" })
    .split("\0")
    .filter((path) => path.length > 0);
}

describe("AC-3: the validation artifacts are fetched at run time, never committed", () => {
  it("tracks no .sch, .xsd or voc.xml path anywhere in the repository", () => {
    const offenders = trackedPaths().filter(
      (path) => /\.(sch|xsd)$/i.test(path) || /(^|\/)voc\.xml$/i.test(path),
    );
    expect(offenders).toEqual([]);
  });

  it("tracks no XML or C-CDA document at all, which is the state a fetch-not-vendor harness preserves", () => {
    const offenders = trackedPaths().filter((path) => /\.(xml|cda|ccda)$/i.test(path));
    expect(offenders).toEqual([]);
  });

  it("gitignores the working directory every fetched artifact lands in", () => {
    expect(readFileSync(join(REPO_ROOT, ".gitignore"), "utf8")).toContain(
      ".conformance-artifacts/",
    );
  });

  it("cannot produce a validation result at all when the network is denied", async () => {
    // The decisive check. A harness that had a vendored copy to fall back on would still
    // return a result here, and a green run would say nothing about where its inputs came from.
    const { fetcher, requested } = servingFetcher({});
    await expect(
      runConformance({
        fetcher,
        directory,
        pins: selfTestPins(ARCHIVE),
        builtDocuments: BUILT_DOCUMENT_CASES,
      }),
    ).rejects.toBeInstanceOf(ConformanceError);
    expect(requested.length).toBeGreaterThan(0);
  });

  it("asks the network for every artifact the pin file names", async () => {
    const { fetcher, requested } = fullyServingFetcher(ARCHIVE);
    await runConformance({
      fetcher,
      directory,
      pins: selfTestPins(ARCHIVE),
      builtDocuments: BUILT_DOCUMENT_CASES,
    });
    expect(new Set(requested)).toEqual(new Set(Object.values(SELF_TEST_URLS)));
  });
});

describe("AC-7: an artifact that does not match its pin is refused before any validation", () => {
  it("names a commit SHA rather than a branch for every pinned artifact", () => {
    // `pinning` G1: a branch or a moving tag is not a pin. A 40-character lowercase hex commit
    // SHA is content-addressed over the whole tree at that commit, so the same URL cannot serve
    // different bytes; a branch URL can and would make the digest below unmaintainable rather
    // than protective.
    const pins = readPins();
    for (const commit of [
      pins.schematron.commit,
      pins.vocabulary.commit,
      pins.corpus.commit,
      pins.cdaSchema.commit,
    ]) {
      expect(commit).toMatch(/^[0-9a-f]{40}$/);
    }
    for (const url of [
      pins.schematron.url,
      pins.vocabulary.url,
      ...pins.cdaSchema.files.map((file) => file.url),
    ]) {
      expect(url).toMatch(/\/[0-9a-f]{40}\//);
    }
    expect(pins.corpus.url).toMatch(/[0-9a-f]{40}$/);
  });

  it("carries a sha256 for every artifact, including the corpus", () => {
    const pins = readPins();
    for (const digest of [
      pins.schematron.sha256,
      pins.vocabulary.sha256,
      pins.corpus.sha256,
      ...pins.cdaSchema.files.map((file) => file.sha256),
    ]) {
      expect(digest).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(readFileSync(PIN_FILE_PATH, "utf8")).toContain("sha256");
  });

  it("refuses a Schematron whose bytes do not hash to the pin", async () => {
    const tampered = new TextEncoder().encode("<sch:schema xmlns:sch='x'/>");
    const { fetcher } = fullyServingFetcher(ARCHIVE, { [SELF_TEST_URLS.schematron]: tampered });
    try {
      await runConformance({
        fetcher,
        directory,
        pins: selfTestPins(ARCHIVE),
        builtDocuments: BUILT_DOCUMENT_CASES,
      });
      throw new Error("expected the harness to refuse the tampered artifact");
    } catch (error) {
      expect(error).toBeInstanceOf(ConformanceError);
      expect((error as ConformanceError).code).toBe(CONFORMANCE_CODES.ARTIFACT_DIGEST_MISMATCH);
      expect((error as ConformanceError).remedy).toContain(
        "Nothing was validated against these bytes",
      );
    }
  });

  it("refuses a corpus whose content digest does not match the pin", async () => {
    // The corpus is pinned by a digest over its CONTENT rather than over its gzip bytes,
    // because the host generates the archive on demand. One changed byte in one sample has to
    // move that digest, and that is what this asserts.
    const other = writeTarGz([
      { path: "Self Test/document.xml", text: '<ClinicalDocument xmlns="urn:hl7-org:v3"/>' },
    ]);
    const { fetcher } = fullyServingFetcher(ARCHIVE, { [SELF_TEST_URLS.corpus]: other });
    try {
      await runConformance({
        fetcher,
        directory,
        pins: selfTestPins(ARCHIVE),
        builtDocuments: BUILT_DOCUMENT_CASES,
      });
      throw new Error("expected the harness to refuse the tampered corpus");
    } catch (error) {
      expect(error).toBeInstanceOf(ConformanceError);
      expect((error as ConformanceError).code).toBe(CONFORMANCE_CODES.ARTIFACT_DIGEST_MISMATCH);
    }
  });

  it("refuses a schema file whose bytes do not hash to the pin", async () => {
    const tampered = new TextEncoder().encode(
      "<xs:schema xmlns:xs='http://www.w3.org/2001/XMLSchema'/>",
    );
    const { fetcher } = fullyServingFetcher(ARCHIVE, { [SELF_TEST_URLS.schema]: tampered });
    try {
      await runConformance({
        fetcher,
        directory,
        pins: selfTestPins(ARCHIVE),
        builtDocuments: BUILT_DOCUMENT_CASES,
      });
      throw new Error("expected the harness to refuse the tampered schema");
    } catch (error) {
      expect((error as ConformanceError).code).toBe(CONFORMANCE_CODES.ARTIFACT_DIGEST_MISMATCH);
    }
  });
});
