/**
 * The tracked conformance report: what a run measured, rendered deterministically.
 *
 * THE REPORT IS THE SEAM BETWEEN TWO GATES (`standards-conformance` S5). `pnpm conformance`
 * rewrites this file and fails when the committed bytes differ from what the run just
 * produced, so the file on disk can never describe a run that did not happen. `pnpm test`
 * then reads the same file with no network at all and fails unless the README statement
 * agrees with it. A statement that can drift from the code is worse than none, because an
 * integrator relies on it.
 *
 * EVERY BYTE IS DERIVED FROM THE MEASUREMENT. No timestamp, no duration, no host, no package
 * version (`compliance-claims` L3). A report carrying the clock would differ from its
 * committed copy on every run and the comparison above would have to be softened, which is
 * exactly how a gate like this stops gating.
 *
 * THE REPORT CARRIES NO DOCUMENT CONTENT. Findings are assertion ids, the artifact's own static
 * assertion text, schema vocabulary and structural locations. That is what lets AC-6 be graded
 * by searching the whole file for a marker token seeded into a document.
 *
 * THE REPORT MAKES NO CERTIFICATION CLAIM (`compliance-claims` L1, L4). A green run is an
 * assessment against a published artifact at a named revision. No accredited body has reviewed
 * it, and the report says so in its own words rather than leaving a reader to assume.
 */

import type { SchemaFinding } from "./xsd.js";
import type { Finding } from "./schematron.js";

/** What one built document measured against. */
export interface BuiltDocumentResult {
  /** The case name from the fixtures. */
  readonly name: string;
  /** The document type `buildCcda` emitted. */
  readonly documentType: string;
  /** Schema violations, redacted to schema vocabulary. */
  readonly schema: readonly SchemaFinding[];
  /** Error-severity Schematron results. */
  readonly schematron: readonly Finding[];
}

/** One corpus document whose error set changed across parse plus re-serialize. */
export interface RoundTripDivergence {
  /** Path inside the corpus archive. Third-party markup vocabulary, not document content. */
  readonly path: string;
  /** Finding keys present after the round trip and not before. */
  readonly introduced: readonly string[];
  /** Finding keys present before the round trip and not after. */
  readonly removed: readonly string[];
}

/** Everything one run measured. */
export interface RunResult {
  /** Commit SHA of the Schematron, the revision the whole measurement is against. */
  readonly artifactRevision: string;
  /** Commit SHA per artifact, so a reader can reproduce the run exactly. */
  readonly artifacts: Readonly<Record<string, string>>;
  /** How many assertions the Schematron compiled to. A drop means the artifact moved. */
  readonly assertionCount: number;
  /** One entry per built document, in fixture order. */
  readonly built: readonly BuiltDocumentResult[];
  /** How many corpus documents the round-trip check ran over. */
  readonly roundTripDocuments: number;
  /** The divergences, sorted by path. */
  readonly roundTripDivergences: readonly RoundTripDivergence[];
}

/** The four fields AC-8 binds the README statement to, plus what a reader needs around them. */
export interface ReportFacts {
  readonly artifactRevision: string;
  readonly documentTypes: readonly string[];
  readonly builtErrorSeverityResults: number;
  readonly roundTripDocumentsDiffering: number;
  readonly builtDocuments: number;
  readonly roundTripDocuments: number;
  readonly artifacts: Readonly<Record<string, string>>;
  readonly assertionCount: number;
}

/** Path of the tracked report, relative to the repository root. */
export const REPORT_PATH = "documentation/conformance-report.md";

/** Fence the machine-readable facts live behind, so a reader and a test read the same numbers. */
const FACTS_FENCE = "```json conformance-facts";

/**
 * Reduce a run to the facts the README statement is gated against.
 *
 * @param result - What the run measured.
 * @returns The machine-readable facts.
 * @example
 * ```ts
 * const facts = factsOf(result);
 * ```
 */
export function factsOf(result: RunResult): ReportFacts {
  const documentTypes = [...new Set(result.built.map((entry) => entry.documentType))].sort();
  const builtErrorSeverityResults = result.built.reduce(
    (total, entry) => total + entry.schema.length + entry.schematron.length,
    0,
  );
  return {
    artifactRevision: result.artifactRevision,
    documentTypes,
    builtErrorSeverityResults,
    roundTripDocumentsDiffering: result.roundTripDivergences.length,
    builtDocuments: result.built.length,
    roundTripDocuments: result.roundTripDocuments,
    artifacts: result.artifacts,
    assertionCount: result.assertionCount,
  };
}

/**
 * Read the machine-readable facts back out of a rendered report.
 *
 * `test/conformance/statement.test.ts` uses this to hold the README beside the report with no
 * network of its own, which is what keeps the ordinary suite runnable offline.
 *
 * @param markdown - A rendered report.
 * @returns The facts it carries.
 * @throws {Error} When the fenced facts block is absent or is not valid JSON.
 * @example
 * ```ts
 * const facts = readReportFacts(readFileSync(REPORT_PATH, "utf8"));
 * ```
 */
export function readReportFacts(markdown: string): ReportFacts {
  const start = markdown.indexOf(FACTS_FENCE);
  if (start < 0) throw new Error(`conformance report carries no ${FACTS_FENCE} block`);
  const bodyStart = start + FACTS_FENCE.length;
  const end = markdown.indexOf("```", bodyStart);
  if (end < 0) throw new Error("conformance report's facts block is not closed");
  return JSON.parse(markdown.slice(bodyStart, end)) as ReportFacts;
}

function renderSchemaFinding(finding: SchemaFinding): string {
  const where =
    finding.attribute === null ? finding.element : `${finding.element}/@${finding.attribute}`;
  const expected = finding.expected.length > 0 ? ` expected: ${finding.expected.join(", ")}` : "";
  const line = finding.line === null ? "" : ` line ${String(finding.line)}`;
  return `- \`${finding.code}\` at \`${where}\`${line}.${expected}`;
}

function renderSchematronFinding(finding: Finding): string {
  return `- \`${finding.assertionId}\` at \`${finding.location}\`: ${finding.message}`;
}

/**
 * Render a run as the tracked report.
 *
 * @param result - What the run measured.
 * @returns The report's whole bytes, deterministic for a given measurement.
 * @example
 * ```ts
 * writeFileSync(REPORT_PATH, renderReport(result));
 * ```
 */
export function renderReport(result: RunResult): string {
  const facts = factsOf(result);
  const lines: string[] = [];

  lines.push("# Conformance report");
  lines.push("");
  lines.push(
    "Written by `pnpm conformance`, which fails when this file's committed bytes differ from what the",
    "run produced. It is generated output: do not hand-edit it, and do not update the README statement",
    "it gates without re-running the harness.",
    "",
    "**This is an assessment, not a certification.** The harness validates documents against published",
    "HL7 artifacts at the revisions named below and reports what those artifacts say. No accredited body",
    "has reviewed this software or this result, and a green run is not a statement about any deployment.",
    "",
    "**What it measures, and what it does not.** It measures the documents `buildCcda` emits, against the",
    "CDA R2 XML schema and then the error-severity phase of the C-CDA R2.1 Schematron, and it measures",
    "whether parsing and re-serializing a public sample changes that sample's Schematron error set. It",
    "does not measure value-set membership beyond what the Schematron's own vocabulary file asserts, it",
    "does not measure the ten document types `buildCcda` does not emit, and it says nothing about",
    "documents this library has not been pointed at.",
    "",
  );

  lines.push("## Measured against");
  lines.push("");
  for (const [name, commit] of Object.entries(facts.artifacts).sort(([a], [b]) =>
    a < b ? -1 : 1,
  )) {
    lines.push(`- \`${name}\`: commit \`${commit}\``);
  }
  lines.push("");
  lines.push(`Assertions compiled from the Schematron: ${String(facts.assertionCount)}.`);
  lines.push("");

  lines.push("## Documents `buildCcda` emits");
  lines.push("");
  lines.push(
    `${String(facts.builtDocuments)} documents validated, covering document types ` +
      `${facts.documentTypes.map((type) => `\`${type}\``).join(" and ")}. ` +
      `Error-severity results: ${String(facts.builtErrorSeverityResults)}.`,
  );
  lines.push("");
  lines.push("| document | type | schema | schematron |");
  lines.push("| --- | --- | ---: | ---: |");
  for (const entry of result.built) {
    lines.push(
      `| \`${entry.name}\` | \`${entry.documentType}\` | ${String(entry.schema.length)} | ${String(entry.schematron.length)} |`,
    );
  }
  lines.push("");
  for (const entry of result.built) {
    if (entry.schema.length === 0 && entry.schematron.length === 0) continue;
    lines.push(`### \`${entry.name}\``);
    lines.push("");
    for (const finding of entry.schema) lines.push(renderSchemaFinding(finding));
    for (const finding of entry.schematron) lines.push(renderSchematronFinding(finding));
    lines.push("");
  }

  lines.push("## Round trip over the public sample corpus");
  lines.push("");
  lines.push(
    `${String(facts.roundTripDocuments)} corpus documents were parsed and re-serialized, and each`,
    "document's Schematron error set was compared with the error set of its own input. Documents whose",
    `error set differed: ${String(facts.roundTripDocumentsDiffering)}.`,
    "",
    "This comparison is differential and not absolute. A sample may carry Schematron errors of its own;",
    "what this measures is that parsing and re-serializing it introduces none and removes none.",
    "",
  );
  for (const divergence of result.roundTripDivergences) {
    lines.push(`### \`${divergence.path}\``);
    lines.push("");
    for (const key of divergence.introduced) lines.push(`- introduced: \`${key}\``);
    for (const key of divergence.removed) lines.push(`- removed: \`${key}\``);
    lines.push("");
  }

  lines.push("## Machine-readable facts");
  lines.push("");
  lines.push(
    "`test/conformance/statement.test.ts` reads this block as a file, with no network, and fails",
  );
  lines.push("unless the README's conformance statement agrees with it.");
  lines.push("");
  lines.push(FACTS_FENCE);
  lines.push(JSON.stringify(facts, null, 2));
  lines.push("```");
  lines.push("");

  return `${lines.join("\n")}`;
}
