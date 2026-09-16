/**
 * The self-test artifact set and the doubled network boundary the conformance tests drive the
 * harness through.
 *
 * WHAT IS DOUBLED AND WHAT IS NOT. Exactly one thing is doubled here: `fetch`. Everything
 * below the network is the real harness, running for real, over bytes these tests chose: the
 * digest check, the archive reader, the Schematron compiler, the XPath evaluator, the XSD
 * validator, the redaction seam and the report renderer. A test that doubled any of those
 * would have substituted the subject (`testing` T3).
 *
 * WHY THE ARTIFACTS ARE SMALL. `pnpm test` takes no network by design, so it cannot fetch the
 * 1 MB normative Schematron or its 65 MB vocabulary file. The small artifact in
 * `test/__fixtures__/conformance.ts` exercises every construct the real one leans on, and the
 * real one is exercised by `pnpm conformance`, which is where AC-1 and AC-2 are graded.
 */

import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

import {
  PERMISSIVE_SCHEMA,
  SELF_TEST_SCHEMATRON,
  SELF_TEST_VOCABULARY,
} from "../__fixtures__/conformance.js";
import {
  corpusContentDigest,
  readTarXmlEntries,
  type HttpFetcher,
} from "../../scripts/conformance/fetch.js";
import type { Pins } from "../../scripts/conformance/pins.js";

/** Made-up hosts. Nothing here is ever reached: the fetcher below answers from a map. */
const BASE = "https://self-test.invalid";

/** URL of each self-test artifact, so a test can decide which one to break. */
export const SELF_TEST_URLS = {
  schematron: `${BASE}/self-test.sch`,
  vocabulary: `${BASE}/voc.xml`,
  schema: `${BASE}/self-test.xsd`,
  corpus: `${BASE}/corpus.tar.gz`,
} as const;

const encoder = new TextEncoder();

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Build the self-test pin set over a chosen corpus.
 *
 * The corpus digest is computed the way the harness computes it, by unpacking the archive and
 * digesting what came out, so a test that wants a MISMATCH has to change the bytes rather than
 * the arithmetic.
 *
 * @param corpusArchive - The gzipped corpus archive this pin set describes.
 * @returns Pins whose digests are the digests of the fixture bytes.
 * @example
 * ```ts
 * const pins = selfTestPins(writeTarGz([{ path: "a.xml", text: doc }]));
 * ```
 */
export function selfTestPins(corpusArchive: Uint8Array): Pins {
  const schematron = encoder.encode(SELF_TEST_SCHEMATRON);
  const vocabulary = encoder.encode(SELF_TEST_VOCABULARY);
  const schema = encoder.encode(PERMISSIVE_SCHEMA);
  const documents = readTarXmlEntries(new Uint8Array(gunzipSync(corpusArchive)));
  return {
    schematron: {
      title: "self-test Schematron",
      repository: `${BASE}/schematron`,
      commit: "0000000000000000000000000000000000000001",
      integrity: "bytes",
      path: "self-test.sch",
      url: SELF_TEST_URLS.schematron,
      bytes: schematron.length,
      sha256: sha256(schematron),
    },
    vocabulary: {
      title: "self-test vocabulary",
      repository: `${BASE}/schematron`,
      commit: "0000000000000000000000000000000000000001",
      integrity: "bytes",
      path: "voc.xml",
      url: SELF_TEST_URLS.vocabulary,
      bytes: vocabulary.length,
      sha256: sha256(vocabulary),
    },
    corpus: {
      title: "self-test corpus",
      repository: `${BASE}/corpus`,
      licence: "CC0-1.0",
      commit: "0000000000000000000000000000000000000002",
      url: SELF_TEST_URLS.corpus,
      integrity: "content-manifest",
      sha256: corpusContentDigest(documents),
      documents: documents.length,
    },
    cdaSchema: {
      title: "self-test XML schema",
      repository: `${BASE}/schema`,
      commit: "0000000000000000000000000000000000000003",
      integrity: "bytes",
      entry: "self-test.xsd",
      files: [
        {
          path: "self-test.xsd",
          url: SELF_TEST_URLS.schema,
          bytes: schema.length,
          sha256: sha256(schema),
        },
      ],
    },
  };
}

/** A doubled network boundary and the list of URLs it was actually asked for. */
export interface DoubledNetwork {
  readonly fetcher: HttpFetcher;
  readonly requested: string[];
}

/**
 * A fetcher that answers from a map and throws for anything else, standing in for the network
 * and for nothing else.
 *
 * @param bodies - URL to the bytes that URL serves. A URL absent from the map is unreachable.
 * @returns The doubled boundary.
 * @example
 * ```ts
 * const { fetcher } = servingFetcher({ [SELF_TEST_URLS.schematron]: bytes });
 * ```
 */
export function servingFetcher(bodies: Readonly<Record<string, Uint8Array>>): DoubledNetwork {
  const requested: string[] = [];
  const fetcher: HttpFetcher = (url: string) => {
    requested.push(url);
    const body = bodies[url];
    if (body === undefined) return Promise.reject(new Error("ENOTFOUND self-test.invalid"));
    return Promise.resolve(body);
  };
  return { fetcher, requested };
}

/**
 * The fetcher that serves every self-test artifact, for the cases where the fetch itself is
 * meant to succeed. Individual artifacts can be overridden to break one of them.
 *
 * @param corpusArchive - The gzipped corpus archive to serve.
 * @param overrides - Bytes to serve instead, keyed by URL.
 * @returns The doubled boundary.
 * @example
 * ```ts
 * const { fetcher } = fullyServingFetcher(archive, { [SELF_TEST_URLS.schematron]: tampered });
 * ```
 */
export function fullyServingFetcher(
  corpusArchive: Uint8Array,
  overrides: Readonly<Record<string, Uint8Array>> = {},
): DoubledNetwork {
  return servingFetcher({
    [SELF_TEST_URLS.schematron]: encoder.encode(SELF_TEST_SCHEMATRON),
    [SELF_TEST_URLS.vocabulary]: encoder.encode(SELF_TEST_VOCABULARY),
    [SELF_TEST_URLS.schema]: encoder.encode(PERMISSIVE_SCHEMA),
    [SELF_TEST_URLS.corpus]: corpusArchive,
    ...overrides,
  });
}
