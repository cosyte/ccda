/**
 * Reads `scripts/conformance/artifacts.json`, the file that pins every validation artifact
 * this harness measures against, and gives it a type.
 *
 * The pin file is data rather than a module so that the harness, the provenance test and a
 * human all read the same bytes. It is parsed and shape-checked here rather than imported,
 * because an import assertion would make the pin a build concern of every consumer of this
 * directory and would hide a malformed file behind a resolver error.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** A single file fetched by URL and checked against the digest of its bytes. */
export interface PinnedFile {
  /** Path inside the source repository, reused as the path in the schema working directory. */
  readonly path: string;
  /** The immutable URL: a raw content URL rooted at a git commit SHA. */
  readonly url: string;
  /** Expected byte length, checked before the digest so a truncated fetch names itself. */
  readonly bytes: number;
  /** Lowercase hex sha256 of the bytes. */
  readonly sha256: string;
}

/** A single-file artifact pinned by the digest of its own bytes. */
export interface PinnedArtifact extends PinnedFile {
  readonly title: string;
  readonly repository: string;
  readonly commit: string;
  readonly integrity: "bytes";
}

/** The corpus archive, pinned by a digest over its content rather than its packaging. */
export interface PinnedCorpus {
  readonly title: string;
  readonly repository: string;
  readonly licence: string;
  readonly commit: string;
  readonly url: string;
  readonly integrity: "content-manifest";
  readonly sha256: string;
  readonly documents: number;
}

/** The multi-file XML schema, pinned file by file with one of them named as the entry point. */
export interface PinnedSchema {
  readonly title: string;
  readonly repository: string;
  readonly commit: string;
  readonly integrity: "bytes";
  readonly entry: string;
  readonly files: readonly PinnedFile[];
}

/** Every artifact the harness needs, as pinned by this repository. */
export interface Pins {
  readonly schematron: PinnedArtifact;
  readonly vocabulary: PinnedArtifact;
  readonly corpus: PinnedCorpus;
  readonly cdaSchema: PinnedSchema;
}

/** Absolute path of the pin file, exported so a test can read the same bytes the harness does. */
export const PIN_FILE_PATH: string = fileURLToPath(new URL("./artifacts.json", import.meta.url));

function requireString(source: Record<string, unknown>, key: string, where: string): string {
  const value = source[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`artifacts.json: ${where}.${key} must be a non-empty string`);
  }
  return value;
}

function requireNumber(source: Record<string, unknown>, key: string, where: string): number {
  const value = source[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new TypeError(`artifacts.json: ${where}.${key} must be a non-negative integer`);
  }
  return value;
}

function requireObject(
  source: Record<string, unknown>,
  key: string,
  where: string,
): Record<string, unknown> {
  const value = source[key];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`artifacts.json: ${where}.${key} must be an object`);
  }
  return value as Record<string, unknown>;
}

function readFile(raw: Record<string, unknown>, where: string): PinnedFile {
  return {
    path: requireString(raw, "path", where),
    url: requireString(raw, "url", where),
    bytes: requireNumber(raw, "bytes", where),
    sha256: requireString(raw, "sha256", where),
  };
}

function readArtifact(root: Record<string, unknown>, key: string): PinnedArtifact {
  const raw = requireObject(root, key, "artifacts");
  return {
    ...readFile(raw, `artifacts.${key}`),
    title: requireString(raw, "title", `artifacts.${key}`),
    repository: requireString(raw, "repository", `artifacts.${key}`),
    commit: requireString(raw, "commit", `artifacts.${key}`),
    integrity: "bytes",
  };
}

/**
 * Parse the pin file and return every artifact reference in it.
 *
 * @param path - Pin file to read; defaults to this directory's `artifacts.json`.
 * @returns The four pinned artifact references.
 * @throws {TypeError} When the file is not valid JSON, or a field is missing or ill-typed.
 * @example
 * ```ts
 * const pins = readPins();
 * console.log(pins.schematron.commit);
 * ```
 */
export function readPins(path: string = PIN_FILE_PATH): Pins {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (typeof parsed !== "object" || parsed === null) {
    throw new TypeError("artifacts.json: top level must be an object");
  }
  const root = requireObject(parsed as Record<string, unknown>, "artifacts", "");

  const corpusRaw = requireObject(root, "corpus", "artifacts");
  const corpus: PinnedCorpus = {
    title: requireString(corpusRaw, "title", "artifacts.corpus"),
    repository: requireString(corpusRaw, "repository", "artifacts.corpus"),
    licence: requireString(corpusRaw, "licence", "artifacts.corpus"),
    commit: requireString(corpusRaw, "commit", "artifacts.corpus"),
    url: requireString(corpusRaw, "url", "artifacts.corpus"),
    integrity: "content-manifest",
    sha256: requireString(corpusRaw, "sha256", "artifacts.corpus"),
    documents: requireNumber(corpusRaw, "documents", "artifacts.corpus"),
  };

  const schemaRaw = requireObject(root, "cdaSchema", "artifacts");
  const files = schemaRaw["files"];
  if (!Array.isArray(files) || files.length === 0) {
    throw new TypeError("artifacts.json: artifacts.cdaSchema.files must be a non-empty array");
  }
  const cdaSchema: PinnedSchema = {
    title: requireString(schemaRaw, "title", "artifacts.cdaSchema"),
    repository: requireString(schemaRaw, "repository", "artifacts.cdaSchema"),
    commit: requireString(schemaRaw, "commit", "artifacts.cdaSchema"),
    integrity: "bytes",
    entry: requireString(schemaRaw, "entry", "artifacts.cdaSchema"),
    files: files.map((entry, index) => {
      if (typeof entry !== "object" || entry === null) {
        throw new TypeError(
          `artifacts.json: artifacts.cdaSchema.files[${index}] must be an object`,
        );
      }
      return readFile(entry as Record<string, unknown>, `artifacts.cdaSchema.files[${index}]`);
    }),
  };

  return {
    schematron: readArtifact(root, "schematron"),
    vocabulary: readArtifact(root, "vocabulary"),
    corpus,
    cdaSchema,
  };
}
