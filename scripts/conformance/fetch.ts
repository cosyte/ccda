/**
 * The conformance harness's fetch layer: the only place this repository reaches the network,
 * and the only place a validation input is admitted.
 *
 * THREE PROPERTIES, and each is a criterion rather than a nicety.
 *
 *  1. NOTHING IS COMMITTED (AC-3, AC-9). Every artifact lands under `WORKING_DIRECTORY`,
 *     which `.gitignore` excludes, so `git status --porcelain` is unchanged by a run and
 *     `pnpm phi-scan` (which walks the working tree minus gitignored paths) never sees a
 *     third-party clinical document. Nothing here ever writes to a tracked path, not even
 *     transiently.
 *  2. THE DIGEST IS CHECKED BEFORE THE BYTES ARE USED (AC-7). A fetch whose bytes do not
 *     hash to the pin fails the run with `ARTIFACT_DIGEST_MISMATCH` and the caller receives
 *     no content at all, so there is no path by which a validation result is produced
 *     against an artifact nobody can name.
 *  3. EVERY FAILURE MODE IS DISTINCT (AC-4, AC-5, `observability` B2). Unreachable, wrong
 *     digest, missing path inside the archive and empty corpus are four codes, not one.
 *
 * THE NETWORK IS AN INJECTED BOUNDARY. `HttpFetcher` is the seam `test/conformance/*` doubles
 * (`testing` T3): a test denies the network, or serves bytes that do not match the pin, and
 * asserts what this layer does about it. Nothing below the seam is ever doubled, because the
 * digest check and the archive reader ARE the subject.
 *
 * THE CACHE IS KEYED ON THE DIGEST, NOT ON THE PATH. A cached file is used only when its own
 * bytes still hash to the pin, so a poisoned or half-written cache entry is a cache miss
 * rather than a way past clause 2. That is also what makes the 65 MB vocabulary file bearable
 * to iterate against: the second run of the day reads it from disk and re-hashes it.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";

import { CONFORMANCE_CODES, ConformanceError } from "./errors.js";
import type { PinnedArtifact, PinnedCorpus, PinnedFile, PinnedSchema } from "./pins.js";

/**
 * The network boundary. Returns the response body, or throws for any reason at all: no
 * network, DNS failure, a non-2xx status, a timeout. The harness never inspects the throw,
 * it re-reports it as `ARTIFACT_UNREACHABLE` against the artifact that was being fetched.
 */
export type HttpFetcher = (url: string) => Promise<Uint8Array>;

/** Directory every fetched artifact lands in, relative to the repository root. Gitignored. */
export const WORKING_DIRECTORY = ".conformance-artifacts";

/** One document read out of the corpus archive. */
export interface CorpusDocument {
  /** Path inside the archive with the tarball's top-level directory stripped. */
  readonly path: string;
  /** The document's own bytes, decoded as UTF-8. */
  readonly text: string;
}

/** The real network boundary: `fetch`, with a timeout and a status check. */
export const httpFetcher: HttpFetcher = async (url: string): Promise<Uint8Array> => {
  const response = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
  return new Uint8Array(await response.arrayBuffer());
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function cachePathFor(directory: string, url: string): string {
  return `${directory}/${sha256(new TextEncoder().encode(url)).slice(0, 16)}.bin`;
}

async function fetchChecked(
  fetcher: HttpFetcher,
  directory: string,
  file: PinnedFile,
  label: string,
): Promise<Uint8Array> {
  const cachePath = cachePathFor(directory, file.url);
  if (existsSync(cachePath)) {
    const cached = new Uint8Array(readFileSync(cachePath));
    if (cached.length === file.bytes && sha256(cached) === file.sha256) return cached;
  }

  let received: Uint8Array;
  try {
    received = await fetcher(file.url);
    // The cause is deliberately not carried into the message: a transport or decompression
    // error can quote bytes it was reading, and nothing this layer prints may do that.
  } catch {
    throw new ConformanceError(
      CONFORMANCE_CODES.ARTIFACT_UNREACHABLE,
      `${label} could not be fetched from ${file.url}`,
      "This check needs network egress and never passes without it. Run it where the host is reachable, " +
        `or populate ${WORKING_DIRECTORY}/ once from a machine that can reach it. A cached artifact is ` +
        "re-hashed against the pin on every run, so a stale cache cannot turn this red into a green.",
    );
  }

  if (received.length !== file.bytes || sha256(received) !== file.sha256) {
    throw new ConformanceError(
      CONFORMANCE_CODES.ARTIFACT_DIGEST_MISMATCH,
      `${label} fetched ${String(received.length)} bytes hashing to ${sha256(received)}, ` +
        `the pin names ${String(file.bytes)} bytes hashing to ${file.sha256}`,
      "Nothing was validated against these bytes. Either the host served something other than the pinned " +
        "commit, or the pin is stale. Read the diff between the two commits before moving the pin in " +
        "scripts/conformance/artifacts.json.",
    );
  }

  mkdirSync(directory, { recursive: true });
  writeFileSync(cachePath, received);
  return received;
}

/**
 * Fetch one single-file artifact and return its text, having first checked its bytes against
 * the pin.
 *
 * @param fetcher - The network boundary.
 * @param directory - Working directory for the cache; created if absent.
 * @param artifact - The pinned artifact to fetch.
 * @returns The artifact decoded as UTF-8.
 * @throws {ConformanceError} `ARTIFACT_UNREACHABLE` or `ARTIFACT_DIGEST_MISMATCH`.
 * @example
 * ```ts
 * const sch = await fetchArtifact(httpFetcher, ".conformance-artifacts", pins.schematron);
 * ```
 */
export async function fetchArtifact(
  fetcher: HttpFetcher,
  directory: string,
  artifact: PinnedArtifact,
): Promise<string> {
  const bytes = await fetchChecked(fetcher, directory, artifact, artifact.title);
  return new TextDecoder("utf-8").decode(bytes);
}

/** One member of the XML schema set, named by the path the schema's own includes use. */
export interface SchemaFile {
  readonly fileName: string;
  readonly contents: string;
}

/**
 * Fetch every file of the multi-file XML schema, each checked against its own digest.
 *
 * @param fetcher - The network boundary.
 * @param directory - Working directory for the cache.
 * @param schema - The pinned schema set.
 * @returns The entry point first, then the files its includes resolve against.
 * @throws {ConformanceError} `ARTIFACT_UNREACHABLE`, `ARTIFACT_DIGEST_MISMATCH`, or
 *   `ARTIFACT_MISSING_PATH` when the pin names an entry point that is not in its own file list.
 * @example
 * ```ts
 * const [entry, ...rest] = await fetchSchema(httpFetcher, dir, pins.cdaSchema);
 * ```
 */
export async function fetchSchema(
  fetcher: HttpFetcher,
  directory: string,
  schema: PinnedSchema,
): Promise<readonly SchemaFile[]> {
  const entry = schema.files.find((file) => file.path === schema.entry);
  if (!entry) {
    throw new ConformanceError(
      CONFORMANCE_CODES.ARTIFACT_MISSING_PATH,
      `${schema.title} names entry point ${schema.entry}, which is not in its own file list`,
      "Add the entry point to artifacts.cdaSchema.files, or correct artifacts.cdaSchema.entry.",
    );
  }
  const ordered = [entry, ...schema.files.filter((file) => file.path !== schema.entry)];
  const out: SchemaFile[] = [];
  for (const file of ordered) {
    const bytes = await fetchChecked(fetcher, directory, file, `${schema.title} (${file.path})`);
    out.push({ fileName: file.path, contents: new TextDecoder("utf-8").decode(bytes) });
  }
  return out;
}

/**
 * The canonical content digest of a corpus: one `sha256  path` line per document, sorted by
 * that line, newline-joined and newline-terminated.
 *
 * Digesting the content rather than the gzip stream is what makes the corpus pin sound. The
 * archive is generated on demand by the host and its compression is not promised to be stable,
 * while the content at a commit SHA is fixed forever; a digest over the packaging would go red
 * on a recompression and would have said nothing about the documents.
 *
 * @param documents - Every document read out of the archive.
 * @returns Lowercase hex sha256 of the canonical manifest.
 * @example
 * ```ts
 * const digest = corpusContentDigest([{ path: "a.xml", text: "<x/>" }]);
 * ```
 */
export function corpusContentDigest(documents: readonly CorpusDocument[]): string {
  const encoder = new TextEncoder();
  const lines = documents
    .map((document) => `${sha256(encoder.encode(document.text))}  ${document.path}`)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return sha256(encoder.encode(`${lines.join("\n")}\n`));
}

/**
 * Read every `.xml` member out of an uncompressed tar stream.
 *
 * A tar reader rather than a shell out to `tar`: the archive must never touch a tracked path,
 * and keeping it in memory is the cheapest way to be sure of that. Only regular files are
 * yielded, and the archive's single top-level directory (which carries the commit SHA and so
 * differs between pins) is stripped from every path.
 *
 * @param tar - The uncompressed archive.
 * @returns Every `.xml` member, in archive order.
 * @example
 * ```ts
 * const documents = readTarXmlEntries(gunzipSync(archiveBytes));
 * ```
 */
export function readTarXmlEntries(tar: Uint8Array): readonly CorpusDocument[] {
  const buffer = Buffer.from(tar.buffer, tar.byteOffset, tar.byteLength);
  const decoder = new TextDecoder("utf-8");
  const out: CorpusDocument[] = [];
  let offset = 0;
  let longName: string | null = null;

  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const rawName = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
    const prefix = header.subarray(345, 500).toString("utf8").replace(/\0.*$/, "");
    const sizeField = header.subarray(124, 136).toString("utf8").replace(/\0.*$/, "").trim();
    const size = Number.parseInt(sizeField, 8);
    const typeFlag = String.fromCharCode(header[156] ?? 0);
    const dataStart = offset + 512;
    const length = Number.isNaN(size) ? 0 : size;
    const data = buffer.subarray(dataStart, dataStart + length);
    offset = dataStart + Math.ceil(length / 512) * 512;

    // GNU long-name records carry the following entry's path in their own payload.
    if (typeFlag === "L") {
      longName = data.toString("utf8").replace(/\0.*$/, "");
      continue;
    }
    const name = longName ?? (prefix ? `${prefix}/${rawName}` : rawName);
    longName = null;
    if (typeFlag !== "0" && typeFlag !== "\0") continue;
    if (!/\.xml$/i.test(name)) continue;
    out.push({ path: name.split("/").slice(1).join("/"), text: decoder.decode(data) });
  }
  return out;
}

/**
 * Fetch the corpus archive, unpack it in memory, and check its content against the pin.
 *
 * @param fetcher - The network boundary.
 * @param directory - Working directory for the cache.
 * @param corpus - The pinned corpus archive.
 * @returns Every `.xml` document in the archive.
 * @throws {ConformanceError} `ARTIFACT_UNREACHABLE` when the archive cannot be fetched,
 *   `CORPUS_EMPTY` when it unpacks to no documents, `ARTIFACT_DIGEST_MISMATCH` when its
 *   content digest differs from the pin, or `ARTIFACT_MISSING_PATH` when the document count
 *   differs from the pin.
 * @example
 * ```ts
 * const documents = await fetchCorpus(httpFetcher, dir, pins.corpus);
 * ```
 */
export async function fetchCorpus(
  fetcher: HttpFetcher,
  directory: string,
  corpus: PinnedCorpus,
): Promise<readonly CorpusDocument[]> {
  const cachePath = cachePathFor(directory, corpus.url);
  let archive: Uint8Array | null = existsSync(cachePath)
    ? new Uint8Array(readFileSync(cachePath))
    : null;

  if (archive === null) {
    try {
      archive = await fetcher(corpus.url);
      // The cause is deliberately not carried into the message: a transport or decompression
      // error can quote bytes it was reading, and nothing this layer prints may do that.
    } catch {
      throw new ConformanceError(
        CONFORMANCE_CODES.ARTIFACT_UNREACHABLE,
        `${corpus.title} could not be fetched from ${corpus.url}`,
        "The round-trip half of this check needs the corpus and never passes without it. Run it where " +
          `the host is reachable, or populate ${WORKING_DIRECTORY}/ once from a machine that can.`,
      );
    }
  }

  let documents: readonly CorpusDocument[];
  try {
    documents = readTarXmlEntries(new Uint8Array(gunzipSync(archive)));
    // The cause is deliberately not carried into the message: a transport or decompression
    // error can quote bytes it was reading, and nothing this layer prints may do that.
  } catch {
    throw new ConformanceError(
      CONFORMANCE_CODES.ARTIFACT_MISSING_PATH,
      `${corpus.title} was fetched but could not be unpacked as a gzipped tar archive`,
      `Delete ${WORKING_DIRECTORY}/ and re-run so the archive is fetched again.`,
    );
  }

  if (documents.length === 0) {
    throw new ConformanceError(
      CONFORMANCE_CODES.CORPUS_EMPTY,
      `${corpus.title} unpacked cleanly and contained zero documents`,
      "A corpus that unpacks to nothing proves nothing, so this run fails rather than reporting a pass " +
        "over an empty set. Check that artifacts.corpus.commit still names a commit carrying the samples.",
    );
  }

  const digest = corpusContentDigest(documents);
  if (digest !== corpus.sha256) {
    throw new ConformanceError(
      CONFORMANCE_CODES.ARTIFACT_DIGEST_MISMATCH,
      `${corpus.title} unpacked to ${String(documents.length)} documents whose content digest is ` +
        `${digest}, the pin names ${String(corpus.documents)} documents digesting to ${corpus.sha256}`,
      "Nothing was validated against this corpus. Read the diff between the two commits before moving " +
        "artifacts.corpus in scripts/conformance/artifacts.json.",
    );
  }

  mkdirSync(directory, { recursive: true });
  writeFileSync(cachePath, archive);
  return documents;
}
