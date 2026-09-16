/**
 * The conformance harness itself: fetch the pinned artifacts, validate what `buildCcda` emits,
 * round-trip the public corpus, write the tracked report, and refuse to report a pass it did
 * not earn.
 *
 * WHY THIS IS ITS OWN COMMAND AND NOT PART OF `pnpm test`. An unobtainable artifact is a
 * failure here, by criterion. Folding a network-bound run into the ordinary suite would make
 * that suite red on any machine behind an egress lockdown, and the pressure to soften that red
 * is exactly how the fail-safe gets quietly reversed. `pnpm test` reads the tracked report as a
 * file instead, and takes no network at all.
 *
 * THE FALSE-GREEN SHAPE, RESTATED FOR THIS GATE. `scripts/attw.mjs` exists in this repository
 * because a tool that read nothing exited 0 and its caller believed it. The same trap is open
 * here in two places and both are closed by an explicit refusal rather than by a count nobody
 * reads: a run that validated zero built documents fails with `NO_DOCUMENTS_VALIDATED`, and a
 * corpus that unpacked to nothing fails with `CORPUS_EMPTY`. They are separate codes because
 * they are separate faults and the remedy differs.
 *
 * THE RUN IS A FUNCTION, AND THE NETWORK IS AN ARGUMENT. `runConformance` takes its fetcher,
 * its working directory, its pins and its document set, so `test/conformance/*` can drive the
 * real harness with the network boundary doubled and nothing else substituted (`testing` T3).
 * The CLI at the bottom supplies the real ones.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { DOMParser } from "@xmldom/xmldom";
import type { Document } from "@xmldom/xmldom";

import { buildCcda, parseCcda, serializeCcda } from "../../src/index.js";
import {
  BUILT_DOCUMENT_CASES,
  type BuiltDocumentCase,
} from "../../test/__fixtures__/conformance.js";
import { CONFORMANCE_CODES, ConformanceError } from "./errors.js";
import {
  WORKING_DIRECTORY,
  fetchArtifact,
  fetchCorpus,
  fetchSchema,
  httpFetcher,
  type CorpusDocument,
  type HttpFetcher,
} from "./fetch.js";
import { readPins, type Pins } from "./pins.js";
import {
  REPORT_PATH,
  renderReport,
  type BuiltDocumentResult,
  type RoundTripDivergence,
  type RunResult,
} from "./report.js";
import { compileSchematron, evaluate, findingKey } from "./schematron.js";
import { validateAgainstSchema } from "./xsd.js";

/** The Schematron phase whose results fail a run. The artifact declares it under this id. */
export const ERROR_PHASE = "errors";

/** Everything `runConformance` needs, with the network and the document set injectable. */
export interface RunOptions {
  /** The network boundary. */
  readonly fetcher: HttpFetcher;
  /** Working directory for fetched artifacts. Gitignored; never a tracked path. */
  readonly directory: string;
  /** The artifact pins. */
  readonly pins: Pins;
  /** The documents to build and validate. */
  readonly builtDocuments: readonly BuiltDocumentCase[];
}

function parseXml(xml: string): Document {
  return new DOMParser({ onError: () => undefined }).parseFromString(xml, "text/xml");
}

/** The namespace a C-CDA document's root element has to be in for this library to read it. */
const V3_NAMESPACE = "urn:hl7-org:v3";

/**
 * Whether an entry's root element is a `ClinicalDocument` in the HL7 v3 namespace, read by
 * scanning the root start tag rather than by building a DOM.
 *
 * TWO REASONS IT IS NOT A DOM QUESTION. The corpus holds several hundred entry-level and
 * section-level FRAGMENTS beside its whole documents, and some carry namespace prefixes their
 * own file never binds, so building a DOM to ask what the root is throws on them. And an entry
 * that threw would be silently dropped from the round-trip set, which is a false green rather
 * than a skipped file: under this rule a whole document is selected and then fails loudly if
 * the library cannot carry it.
 *
 * THE NAMESPACE IS PART OF THE QUESTION, NOT A REFINEMENT OF IT. The archive carries stub
 * illustrations whose root really is spelled `ClinicalDocument` but which declare no namespace
 * at all and say in their own comments that the header and section codes are omitted. They are
 * drawings of a document rather than documents, `parseCcda` refuses them by its own published
 * contract, and admitting them here would be reporting a parser bug that does not exist.
 *
 * @param xml - The entry's text.
 * @returns True when the entry is a whole C-CDA document.
 * @example
 * ```ts
 * isClinicalDocumentXml('<ClinicalDocument xmlns="urn:hl7-org:v3"/>'); // true
 * ```
 */
export function isClinicalDocumentXml(xml: string): boolean {
  let index = 0;
  while (index < xml.length) {
    const next = xml.indexOf("<", index);
    if (next < 0) return false;
    const rest = xml.slice(next);
    if (rest.startsWith("<!--")) {
      const close = xml.indexOf("-->", next);
      if (close < 0) return false;
      index = close + 3;
      continue;
    }
    if (rest.startsWith("<?") || rest.startsWith("<!")) {
      const close = xml.indexOf(">", next);
      if (close < 0) return false;
      index = close + 1;
      continue;
    }
    const name = /^<\s*(?:([A-Za-z_][\w.-]*):)?([A-Za-z_][\w.-]*)/.exec(rest);
    if (name?.[2] !== "ClinicalDocument") return false;
    const close = xml.indexOf(">", next);
    if (close < 0) return false;
    const startTag = xml.slice(next, close);
    const prefix = name[1];
    const declaration = prefix === undefined ? "xmlns" : `xmlns:${prefix}`;
    return new RegExp(`\\s${declaration}\\s*=\\s*["']${V3_NAMESPACE}["']`).test(startTag);
  }
  return false;
}

/** Whether a corpus entry is a whole C-CDA document rather than one of the archive's fragments. */
function isClinicalDocument(document: CorpusDocument): boolean {
  return isClinicalDocumentXml(document.text);
}

/**
 * Run the whole measurement.
 *
 * @param options - The network boundary, working directory, pins and document set.
 * @returns What the run measured. Error-severity results are reported, not thrown: the caller
 *   writes the report first so the tracked file always describes the run that just happened.
 * @throws {ConformanceError} `ARTIFACT_UNREACHABLE`, `ARTIFACT_DIGEST_MISMATCH`,
 *   `ARTIFACT_MISSING_PATH`, `CORPUS_EMPTY`, `NO_DOCUMENTS_VALIDATED` or
 *   `SCHEMATRON_UNCOMPILABLE`.
 * @example
 * ```ts
 * const result = await runConformance({ fetcher: httpFetcher, directory, pins, builtDocuments });
 * ```
 */
export async function runConformance(options: RunOptions): Promise<RunResult> {
  const { fetcher, directory, pins, builtDocuments } = options;

  if (builtDocuments.length === 0) {
    throw new ConformanceError(
      CONFORMANCE_CODES.NO_DOCUMENTS_VALIDATED,
      "the run was given zero documents to build, so it validated zero documents",
      "A run over an empty document set proves nothing and must never exit zero. Restore the cases in " +
        "test/__fixtures__/conformance.ts, or fix whatever filtered them all out.",
    );
  }

  const schematronXml = await fetchArtifact(fetcher, directory, pins.schematron);
  const vocabularyXml = await fetchArtifact(fetcher, directory, pins.vocabulary);
  const schemaFiles = await fetchSchema(fetcher, directory, pins.cdaSchema);
  const corpusEntries = await fetchCorpus(fetcher, directory, pins.corpus);

  const corpus = corpusEntries.filter(isClinicalDocument);
  if (corpus.length === 0) {
    throw new ConformanceError(
      CONFORMANCE_CODES.CORPUS_EMPTY,
      `the corpus archive unpacked to ${String(corpusEntries.length)} files and zero of them are ` +
        "documents whose root element is ClinicalDocument",
      "The round-trip check is defined over whole C-CDA documents, and a corpus holding none of them " +
        "proves nothing. Check that artifacts.corpus.commit still names a commit carrying the samples.",
    );
  }

  const schema = compileSchematron(schematronXml);
  const vocabulary = parseXml(vocabularyXml);

  const built: BuiltDocumentResult[] = [];
  for (const testCase of builtDocuments) {
    const xml = serializeCcda(buildCcda(testCase.init));
    built.push({
      name: testCase.name,
      documentType: testCase.documentType,
      schema: await validateAgainstSchema(schemaFiles, xml),
      schematron: evaluate(schema, parseXml(xml), ERROR_PHASE, vocabulary),
    });
  }

  const divergences: RoundTripDivergence[] = [];
  for (const document of corpus) {
    const before = new Set(
      evaluate(schema, parseXml(document.text), ERROR_PHASE, vocabulary).map(findingKey),
    );
    let roundTripped: string;
    try {
      roundTripped = serializeCcda(parseCcda(document.text));
    } catch (cause) {
      // A document the library cannot carry through parse plus re-serialize has no output to
      // compare, which is a harder failure of this criterion than a changed error set, not a
      // reason to drop it from the denominator. The path is archive markup vocabulary; the
      // library's own message is not carried, because a fatal can quote what it read.
      throw new ConformanceError(
        CONFORMANCE_CODES.ROUND_TRIP_DIVERGED,
        `corpus document ${document.path} could not be carried through parseCcda plus serializeCcda ` +
          `at all: ${cause instanceof Error ? cause.name : "a non-Error throw"}`,
        "Re-serialization has to produce output for every document the parser accepts. Reproduce it " +
          `from ${WORKING_DIRECTORY}/ and fix the round trip; never answer it by making the parser ` +
          "refuse the document, which trades a visible failure for a silent one.",
      );
    }
    const after = new Set(
      evaluate(schema, parseXml(roundTripped), ERROR_PHASE, vocabulary).map(findingKey),
    );
    const introduced = [...after].filter((key) => !before.has(key)).sort();
    const removed = [...before].filter((key) => !after.has(key)).sort();
    if (introduced.length > 0 || removed.length > 0) {
      divergences.push({ path: document.path, introduced, removed });
    }
  }
  divergences.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  return {
    artifactRevision: pins.schematron.commit,
    artifacts: {
      schematron: pins.schematron.commit,
      vocabulary: pins.vocabulary.commit,
      corpus: pins.corpus.commit,
      cdaSchema: pins.cdaSchema.commit,
    },
    assertionCount: schema.assertionCount,
    built,
    roundTripDocuments: corpus.length,
    roundTripDivergences: divergences,
  };
}

/**
 * Write the tracked report and refuse a run whose committed report no longer matches it.
 *
 * @param result - What the run measured.
 * @param reportPath - Where the tracked report lives.
 * @returns The bytes written.
 * @throws {ConformanceError} `REPORT_STALE` when the committed bytes differ from this run's.
 * @example
 * ```ts
 * writeReport(result, REPORT_PATH);
 * ```
 */
export function writeReport(result: RunResult, reportPath: string): string {
  const rendered = renderReport(result);
  // Read once and treat the failure as absence, rather than asking `existsSync` and then
  // reading: the two-step form is a time-of-check to time-of-use race (CWE-367), which
  // CodeQL's `js/file-system-race` flags, and the one-step form has no window to race in.
  let previous: string | null;
  try {
    previous = readFileSync(reportPath, "utf8");
  } catch {
    previous = null;
  }
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, rendered);
  if (previous !== rendered) {
    throw new ConformanceError(
      CONFORMANCE_CODES.REPORT_STALE,
      previous === null
        ? `${reportPath} did not exist and has been written from this run`
        : `${reportPath} did not match this run and has been rewritten from it`,
      "The report on disk is now correct. Review the diff, update the README's conformance statement to " +
        "agree with it, and commit both: the statement is gated against this file and drifting from it is " +
        "the failure this pairing exists to prevent.",
    );
  }
  return rendered;
}

/**
 * Turn a measurement into the run's own verdict.
 *
 * @param result - What the run measured.
 * @throws {ConformanceError} `ERRORS_FOUND` when a document `buildCcda` emits carries an
 *   error-severity result, or `ROUND_TRIP_DIVERGED` when a round trip changed an error set.
 * @example
 * ```ts
 * assertClean(result);
 * ```
 */
export function assertClean(result: RunResult): void {
  const errors = result.built.reduce(
    (total, entry) => total + entry.schema.length + entry.schematron.length,
    0,
  );
  if (errors > 0) {
    const worst = result.built.filter((entry) => entry.schema.length + entry.schematron.length > 0);
    throw new ConformanceError(
      CONFORMANCE_CODES.ERRORS_FOUND,
      `${String(errors)} error-severity results across ${String(worst.length)} of ` +
        `${String(result.built.length)} documents buildCcda emits: ` +
        worst.map((entry) => entry.name).join(", "),
      `Each one is listed with its assertion id and structural location in ${REPORT_PATH}. Fix what the ` +
        "builder emits; never satisfy a cardinality by inventing a clinical time, dose, route or code, " +
        'and leave a SHALL slot with no known value at nullFlavor="UNK".',
    );
  }
  if (result.roundTripDivergences.length > 0) {
    throw new ConformanceError(
      CONFORMANCE_CODES.ROUND_TRIP_DIVERGED,
      `${String(result.roundTripDivergences.length)} of ${String(result.roundTripDocuments)} corpus ` +
        "documents have a different Schematron error set after parse plus re-serialize",
      `Each divergence is listed with the assertion ids it introduced or removed in ${REPORT_PATH}. ` +
        "Serialization must introduce no non-conformance and must not silence one either.",
    );
  }
}

/** True when this module is the process entry point rather than an import. */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === new URL(`file://${entry}`).href;
}

/** Run one `ConformanceError`-throwing step, returning the error rather than propagating it. */
function collect(step: () => void): ConformanceError | null {
  try {
    step();
    return null;
  } catch (error) {
    if (error instanceof ConformanceError) return error;
    throw error;
  }
}

/** Everything the command-line run needs, with every boundary injectable. */
export interface CliOptions {
  /** The network boundary. */
  readonly fetcher: HttpFetcher;
  /** Working directory for fetched artifacts. */
  readonly directory: string;
  /** Read the pins. A thunk, so a malformed pin file is refused inside the run rather than beside it. */
  readonly readPins: () => Pins;
  /** The documents to build and validate. */
  readonly builtDocuments: readonly BuiltDocumentCase[];
  /** Where the tracked report is written and compared. */
  readonly reportPath: string;
  /** Where progress goes. */
  readonly stdout: (text: string) => void;
  /** Where refusals go. */
  readonly stderr: (text: string) => void;
}

/**
 * The whole command-line run, INCLUDING the exit code it resolves to.
 *
 * THE EXIT CODE IS THE PRODUCT OF THIS FUNCTION, NOT A STATEMENT AT THE BOTTOM OF THE FILE.
 * `scripts/attw.mjs` exists in this repository because a tool that read nothing exited 0 and
 * its caller believed it, and a refusal that does not reach the shell is the same false green
 * one level up: every fail-safe below can be correct and `pnpm conformance` still exit 0 in CI
 * if the last link is a line nothing exercises. So the exit code is computed here, where
 * `test/conformance/fail-safe.test.ts` drives it with the network boundary doubled, and the
 * entry-point block below is one assignment with nothing left to get wrong.
 *
 * @param options - The boundaries: the network, the working directory, the pins, the document
 *   set, the report path and the two output streams.
 * @returns 0 when the run measured a clean result and the tracked report already matched it, 1
 *   for every refusal and for every failure before one could be reported.
 * @example
 * ```ts
 * process.exitCode = await runConformanceCli({ ...boundaries });
 * ```
 */
export async function runConformanceCli(options: CliOptions): Promise<number> {
  const { fetcher, directory, builtDocuments, reportPath, stdout, stderr } = options;
  let failed = false;
  try {
    const result = await runConformance({
      fetcher,
      directory,
      pins: options.readPins(),
      builtDocuments,
    });
    stdout(
      `conformance: ${String(result.built.length)} built documents, ` +
        `${String(result.roundTripDocuments)} corpus round trips, ` +
        `${String(result.assertionCount)} assertions compiled\n`,
    );
    // Both gates run, and both report. A stale report is what a run with new
    // findings ALWAYS produces, so letting it short-circuit would hide the findings
    // behind their own symptom on exactly the run that first surfaced them.
    const stale = collect(() => {
      writeReport(result, reportPath);
    });
    const unclean = collect(() => {
      assertClean(result);
    });
    for (const failure of [unclean, stale]) {
      if (failure === null) continue;
      failed = true;
      stderr(`\nERROR: ${failure.code}\n  ${failure.context}\n  ${failure.remedy}\n`);
    }
    if (!failed) stdout(`conformance: OK (report written to ${reportPath})\n`);
  } catch (error) {
    failed = true;
    if (error instanceof ConformanceError) {
      stderr(`\nERROR: ${error.code}\n  ${error.context}\n  ${error.remedy}\n`);
    } else {
      stderr(`\nERROR: the conformance harness failed before it could report.\n`);
      stderr(`  ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }
  return failed ? 1 : 0;
}

if (isEntryPoint()) {
  process.exitCode = await runConformanceCli({
    fetcher: httpFetcher,
    directory: WORKING_DIRECTORY,
    readPins,
    builtDocuments: BUILT_DOCUMENT_CASES,
    reportPath: REPORT_PATH,
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  });
}
