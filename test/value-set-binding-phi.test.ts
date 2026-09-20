/**
 * AC-3, the PHI non-leak property of the value-set diagnostic surface, proved
 * rather than asserted.
 *
 * A finding about a value-set binding has to say two things a caller can act on,
 * the bound value set and the release it was checked against, and it must say
 * neither by quoting the document. So the grader plants a distinctive sentinel
 * at every coded slot the parser checks, supplies a source that reports every
 * one of them a non-member, and then sweeps **every field of every finding the
 * parse produced**, not only the message text: a leak that hid in a position or
 * in a new structured field would pass a message-only check.
 *
 * The second half is the structural one, and it is the half that survives a
 * sentinel nobody remembers to add: every emitted message is a whole member of
 * the frozen registry, so a factory that started interpolating fails here
 * without anyone having to think of the value it would interpolate.
 */

import { describe, expect, it } from "vitest";

import {
  parseCcda,
  valueSetBinding,
  valueSetBindings,
  WARNING_CODES,
  type CcdaWarning,
  type ValueSetSource,
} from "../src/index.js";
import { ALL_WARNING_MESSAGES, BOUND_VALUE_SETS } from "../src/parser/warnings.js";
import {
  ALL_SENTINELS,
  SENTINEL_CODES,
  sentinelDocument,
} from "./__fixtures__/value-set-binding.js";

const RELEASE = "stub-value-set-package-2026.1";

/** Rejects every code it is asked about, so every Required slot produces a finding. */
const rejectsEverything: ValueSetSource = {
  release: RELEASE,
  isMember: () => ({ membership: "not-a-member" }),
};

/** Holds no expansion for anything, so every Required slot reports "not evaluated". */
const holdsNothing: ValueSetSource = {
  release: RELEASE,
  isMember: () => ({ membership: "no-expansion" }),
};

/**
 * Every character of a finding a consumer can reach: the whole object, own keys
 * and nested objects included, rather than the message alone.
 */
function serializeFinding(warning: CcdaWarning): string {
  const seen: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(warning)) seen[key] = value;
  return `${JSON.stringify(seen)}|${Object.keys(seen).join(",")}|${Object.values(seen)
    .map((v) => String(v))
    .join("|")}`;
}

/** Assert no sentinel, and no four-byte fragment of one, appears in `text`. */
function expectNoSentinel(text: string, where: string): void {
  for (const sentinel of ALL_SENTINELS) {
    expect(text, `${where}: whole sentinel`).not.toContain(sentinel);
    // Four bytes is the granularity the shared PHI runner sweeps at: a leak that
    // truncated the value would still be a leak.
    for (let i = 0; i + 4 <= sentinel.length; i += 1) {
      expect(text, `${where}: fragment @${String(i)}`).not.toContain(sentinel.slice(i, i + 4));
    }
  }
}

describe("PHI: a value-set finding carries identifiers, never the value it is about", () => {
  const xml = sentinelDocument();

  it("AC-3: no sentinel reaches any field of any finding, for either answer", () => {
    for (const [name, source] of [
      ["not-a-member", rejectsEverything],
      ["no-expansion", holdsNothing],
    ] as const) {
      const doc = parseCcda(xml, { valueSets: source });

      // The probe reached the branch that could leak: the parse really did
      // produce value-set findings about the sentinel-coded slots.
      const bindingFindings = doc.warnings.filter(
        (w) =>
          w.code === WARNING_CODES.VALUE_SET_BINDING_VIOLATED ||
          w.code === WARNING_CODES.VALUE_SET_BINDING_NOT_EVALUATED,
      );
      expect(bindingFindings.length, name).toBeGreaterThan(0);

      for (const warning of doc.warnings) {
        expectNoSentinel(serializeFinding(warning), `${name} ${warning.code}`);
      }

      // The positive control for the sweep: the sentinel IS in the document the
      // parse read and in the document it re-serializes. The bound is on the
      // diagnostic surface, not on the data, and a sweep that passed because
      // nothing was planted would prove nothing.
      expect(doc.toString()).toContain(SENTINEL_CODES.medication);
    }
  });

  it("AC-3: every emitted message is a whole member of the frozen registry", () => {
    const doc = parseCcda(xml, { valueSets: rejectsEverything });
    let seen = 0;
    for (const warning of doc.warnings) {
      expect(
        ALL_WARNING_MESSAGES.has(warning.message),
        `${warning.code} produced a message outside the registry: ${warning.message}`,
      ).toBe(true);
      seen += 1;
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("AC-3: the finding names the value set by identifier and the release it was checked against", () => {
    const doc = parseCcda(xml, { valueSets: rejectsEverything });
    const findings = doc.warnings.filter(
      (w) => w.code === WARNING_CODES.VALUE_SET_BINDING_VIOLATED,
    );
    const required = new Set(
      valueSetBindings()
        .filter((row) => row.strength === "required")
        .map((row) => row.valueSet),
    );

    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings) {
      // Every finding names a value set this package declared as Required, and
      // the release the source that answered declared.
      expect(finding.valueSet !== undefined && required.has(finding.valueSet)).toBe(true);
      expect(finding.valueSetRelease).toBe(RELEASE);
    }
    expect(findings.map((w) => w.valueSet)).toContain(valueSetBinding("medication").valueSet);
    // The identifier is this package's own literal, never the document's: the
    // declared table and the closed list the factories accept are the same set,
    // which is what makes "library-owned" a mechanical claim rather than a
    // reading of the code.
    const declared = new Set(valueSetBindings().map((row) => row.valueSet));
    expect([...declared].sort()).toStrictEqual([...BOUND_VALUE_SETS].sort());
  });
});
