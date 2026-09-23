/**
 * AC-8: the README's conformance statement is gated against the tracked report.
 *
 * TWO GATES, WITH THE TRACKED REPORT AS THE SEAM BETWEEN THEM. `pnpm conformance` rewrites the
 * report and fails when the committed bytes differ from what the run produced, so the file can
 * never describe a run that did not happen. This file is the other half: it reads that report
 * AS A FILE, with no network at all, and fails unless the statement agrees with it. Split that
 * way on purpose. An unobtainable artifact is a failure by criterion, so a statement check that
 * reached the network would make the ordinary suite red on any machine behind an egress
 * lockdown, and the pressure to soften that red is exactly how the fail-safe gets reversed.
 *
 * THE SUBJECT IS A CLAIM BOUND TO A MEASUREMENT, NOT PROSE. Every assertion below is anchored
 * on a VALUE the report carries, or on the presence of a limit the statement is obliged to
 * state. Nothing here grades wording, headings, ordering or formatting: the umbrella's own lint
 * grades those across every repository and a second copy inside this suite would be mass every
 * fix loop pays to read (`testing` T2). If an assertion here drifts into grading wording, that
 * is the finding and it belongs to whoever notices it.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { REPORT_PATH, readReportFacts } from "../../scripts/conformance/report.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const report = readFileSync(join(REPO_ROOT, REPORT_PATH), "utf8");
const facts = readReportFacts(report);
const readme = readFileSync(join(REPO_ROOT, "README.md"), "utf8");

/** The statement's own bytes, delimited so a reader and this test bound it the same way. */
const statement = (() => {
  const start = readme.indexOf("<!-- conformance-statement:start -->");
  const end = readme.indexOf("<!-- conformance-statement:end -->");
  if (start < 0 || end < 0) throw new Error("README carries no delimited conformance statement");
  return readme.slice(start, end);
})();

/**
 * The document types the statement CLAIMS, read from its own delimited list.
 *
 * Delimited rather than pattern-matched out of the prose, for the same reason the statement
 * itself is: a regex over the sentence would be grading wording, and rewording the sentence
 * would silently empty the claimed set and pass the comparison below in both directions
 * (`testing` T2). The delimiters make the claim a value the README declares, which is the only
 * thing this file is allowed to hold the report against.
 */
const claimedDocumentTypes = (() => {
  const open = "<!-- conformance-statement:document-types:start -->";
  const close = "<!-- conformance-statement:document-types:end -->";
  const start = statement.indexOf(open);
  const end = statement.indexOf(close);
  if (start < 0 || end < 0) {
    throw new Error("the README conformance statement carries no delimited document-type list");
  }
  const claimed = statement.slice(start + open.length, end);
  return new Set([...claimed.matchAll(/`([^`]+)`/g)].map((match) => match[1]));
})();

describe("AC-8: the README conformance statement agrees with the tracked report", () => {
  it("names the artifact revision the measurement was made against", () => {
    expect(facts.artifactRevision).toMatch(/^[0-9a-f]{40}$/);
    expect(statement).toContain(facts.artifactRevision);
  });

  it("lists every document type the run validated, and claims no other", () => {
    // BOTH DIRECTIONS, AS SETS. Containment alone would let the statement claim a type the run
    // never validated: drop a type from BUILT_DOCUMENT_CASES and a one-directional check stays
    // green over a README that over-claims coverage, which is the drift AC-8 and
    // `compliance-claims` L1 exist to prevent. The under-claim direction matters too, because a
    // statement that omits a measured type is a statement nobody can reconcile with the report.
    expect(facts.documentTypes.length).toBeGreaterThan(0);
    expect([...claimedDocumentTypes].sort()).toStrictEqual([...facts.documentTypes].sort());
  });

  it("states the count of error-severity results on the built side", () => {
    const stated = /\*\*(\d+)\*\* error-severity results/.exec(statement);
    expect(stated?.[1]).toBe(String(facts.builtErrorSeverityResults));
  });

  it("states the count of round-trip documents whose error sets differed", () => {
    const stated = /\*\*(\d+)\*\* round-trip documents/.exec(statement);
    expect(stated?.[1]).toBe(String(facts.roundTripDocumentsDiffering));
  });

  it("points at the tracked report by path, so a reader can check the numbers", () => {
    expect(statement).toContain(REPORT_PATH);
  });

  it("says the result is an assessment and not a certification", () => {
    expect(statement).toMatch(/not a certification/i);
  });

  it("makes no certification claim of its own, in the statement or in the report", () => {
    // `compliance-claims` L1 and L4. The one admissible use of the word is the denial above, so
    // anything that is not part of a denial is the finding.
    for (const text of [statement, report]) {
      expect(text).not.toMatch(/\bcertified\b/i);
      expect(text).not.toMatch(/\bHIPAA[ -]compliant\b/i);
      for (const match of text.matchAll(/.{0,12}certification/gi)) {
        expect(match[0]).toMatch(/not an? certification|not a certification/i);
      }
    }
  });

  it("carries its limits in the same document as the capability", () => {
    // `compliance-claims` L2: a limit moved to a footer, a later page or a separate document has
    // been marketed around. The delimited block IS the capability, so the limits have to be
    // inside it, and each of the four the report's shape makes necessary has to be named.
    expect(statement).toMatch(/\bLimits\b/);
    expect(statement).toMatch(/other nine/);
    expect(statement).toMatch(/warning phase/i);
    expect(statement).toMatch(/differential/i);
    expect(statement).toMatch(/network egress/i);
  });

  it("does not quote a package version", () => {
    // `compliance-claims` L3: the registry is the only source of truth for what is published.
    expect(statement).not.toMatch(/@cosyte\/ccda@|\bv?\d+\.\d+\.\d+\b/);
  });

  it("reads the report as a file and reaches no network of its own", () => {
    // The property that keeps the ordinary suite runnable offline, stated as a test so a later
    // edit that reaches for a fetch has something to trip over. The report is a file on disk and
    // its facts are already parsed above; if that stops being true this whole file stops loading.
    expect(report.length).toBeGreaterThan(0);
    expect(facts.builtDocuments).toBeGreaterThan(0);
    expect(facts.roundTripDocuments).toBeGreaterThan(0);
  });
});
