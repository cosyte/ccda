/**
 * The artifact cache: what a warm cache spares the network, and what a bad cache entry costs.
 *
 * The conformance job is meant to gate a merge, and it reaches the network by design. Two
 * properties make that bearable, and both are checked here against the real fetch layer with
 * only the network doubled:
 *
 *  1. A WARM CACHE NEEDS NO NETWORK. Every artifact read back from the working directory is
 *     re-hashed against its pin, and a run whose cache holds every pinned artifact asks the
 *     network for nothing, so an upstream outage cannot red a run that has its inputs on disk.
 *  2. A BAD CACHE ENTRY IS A MISS, NEVER A RED. A cached file that does not match its pin is
 *     fetched again rather than refused. The corpus archive is the case that needs saying: it
 *     is checked by unpacking it, and a cached archive that does not unpack, or unpacks to the
 *     wrong content, has to be fetched again exactly like a single file whose digest is wrong.
 *     Refusing it instead would leave every later run red until somebody deleted the cache.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BUILT_DOCUMENT_CASES, writeTarGz } from "../__fixtures__/conformance.js";
import { CONFORMANCE_CODES, ConformanceError } from "../../scripts/conformance/errors.js";
import { cachePathFor, fetchArtifact, fetchCorpus } from "../../scripts/conformance/fetch.js";
import { runConformance } from "../../scripts/conformance/run.js";
import { buildCcda, serializeCcda } from "../../src/index.js";
import {
  SELF_TEST_URLS,
  fullyServingFetcher,
  selfTestPins,
  servingFetcher,
} from "./_self-test-pins.js";

const CORPUS_DOCUMENT = serializeCcda(
  buildCcda({ patient: { mrn: "MRN002" }, effectiveTime: "20240102030405+0000" }),
);

const ARCHIVE = writeTarGz([{ path: "Self Test/document.xml", text: CORPUS_DOCUMENT }]);

let directory = "";

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "ccda-conformance-cache-"));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

/** Put bytes in the cache slot a URL reads from, as a stale or half-written entry would sit. */
function plantCacheEntry(url: string, bytes: Uint8Array): void {
  mkdirSync(directory, { recursive: true });
  writeFileSync(cachePathFor(directory, url), bytes);
}

describe("a warm cache needs no network", () => {
  it("asks the network for nothing on a second run over the same working directory", async () => {
    const pins = selfTestPins(ARCHIVE);
    const first = fullyServingFetcher(ARCHIVE);
    await runConformance({
      fetcher: first.fetcher,
      directory,
      pins,
      builtDocuments: BUILT_DOCUMENT_CASES,
    });
    expect(first.requested.length).toBeGreaterThan(0);

    const offline = servingFetcher({});
    const result = await runConformance({
      fetcher: offline.fetcher,
      directory,
      pins,
      builtDocuments: BUILT_DOCUMENT_CASES,
    });
    expect(offline.requested).toEqual([]);
    expect(result.roundTripDocuments).toBe(1);
  });
});

describe("a bad cache entry is fetched again, never refused", () => {
  it("re-fetches a single-file artifact whose cached bytes do not hash to the pin", async () => {
    const pins = selfTestPins(ARCHIVE);
    plantCacheEntry(SELF_TEST_URLS.schematron, new TextEncoder().encode("<stale/>"));
    const network = fullyServingFetcher(ARCHIVE);
    const text = await fetchArtifact(network.fetcher, directory, pins.schematron);
    expect(network.requested).toEqual([SELF_TEST_URLS.schematron]);
    expect(text).not.toBe("<stale/>");
  });

  it("re-fetches a cached corpus archive that does not unpack", async () => {
    const pins = selfTestPins(ARCHIVE);
    plantCacheEntry(SELF_TEST_URLS.corpus, new TextEncoder().encode("half a gzip stream"));
    const network = fullyServingFetcher(ARCHIVE);
    const documents = await fetchCorpus(network.fetcher, directory, pins.corpus);
    expect(network.requested).toEqual([SELF_TEST_URLS.corpus]);
    expect(documents.map((document) => document.text)).toEqual([CORPUS_DOCUMENT]);
  });

  it("re-fetches a cached corpus archive whose content does not match the pin", async () => {
    const pins = selfTestPins(ARCHIVE);
    plantCacheEntry(
      SELF_TEST_URLS.corpus,
      writeTarGz([
        { path: "Self Test/document.xml", text: '<ClinicalDocument xmlns="urn:hl7-org:v3"/>' },
      ]),
    );
    const network = fullyServingFetcher(ARCHIVE);
    const documents = await fetchCorpus(network.fetcher, directory, pins.corpus);
    expect(network.requested).toEqual([SELF_TEST_URLS.corpus]);
    expect(documents.map((document) => document.text)).toEqual([CORPUS_DOCUMENT]);
  });

  it("re-fetches a cached corpus archive that unpacks to nothing", async () => {
    const pins = selfTestPins(ARCHIVE);
    plantCacheEntry(SELF_TEST_URLS.corpus, writeTarGz([]));
    const network = fullyServingFetcher(ARCHIVE);
    const documents = await fetchCorpus(network.fetcher, directory, pins.corpus);
    expect(network.requested).toEqual([SELF_TEST_URLS.corpus]);
    expect(documents).toHaveLength(1);
  });

  it("overwrites the bad entry, so the run after it needs no network", async () => {
    const pins = selfTestPins(ARCHIVE);
    plantCacheEntry(SELF_TEST_URLS.corpus, new TextEncoder().encode("half a gzip stream"));
    await fetchCorpus(fullyServingFetcher(ARCHIVE).fetcher, directory, pins.corpus);
    const offline = servingFetcher({});
    const documents = await fetchCorpus(offline.fetcher, directory, pins.corpus);
    expect(offline.requested).toEqual([]);
    expect(documents).toHaveLength(1);
  });

  it("reports the upstream, not the cache, when a bad entry meets an unreachable host", async () => {
    const pins = selfTestPins(ARCHIVE);
    plantCacheEntry(SELF_TEST_URLS.corpus, new TextEncoder().encode("half a gzip stream"));
    try {
      await fetchCorpus(servingFetcher({}).fetcher, directory, pins.corpus);
      throw new Error("expected the fetch layer to refuse");
    } catch (error) {
      expect(error).toBeInstanceOf(ConformanceError);
      expect((error as ConformanceError).code).toBe(CONFORMANCE_CODES.ARTIFACT_UNREACHABLE);
      expect((error as ConformanceError).context).toContain(SELF_TEST_URLS.corpus);
    }
  });
});
