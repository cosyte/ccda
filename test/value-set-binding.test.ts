/**
 * The bring-your-own **value-set source**: a consumer holding their own value
 * set package learns that a coded value sits outside a Required binding, which
 * C-CDA states as a SHALL, rather than only learning that its code system was
 * unexpected.
 *
 * Each test names the acceptance criterion it grades. The PHI non-leak property
 * (AC-3) is graded in `value-set-binding-phi.test.ts`, and the published-code
 * surface (AC-9) in `warning-codes.test.ts`, where the existing snapshots of
 * that surface already live.
 */

import { describe, expect, it } from "vitest";

import {
  parseCcda,
  valueSetBinding,
  valueSetBindings,
  WARNING_CODES,
  type CcdaWarning,
  type ValueSetBinding,
  type ValueSetSource,
} from "../src/index.js";
import { CODE_SLOTS } from "../src/parser/warnings.js";
import { checkSlotValueSetBinding, checkValueSetBinding } from "../src/model/value-set-bindings.js";
import { QUIRK_CODES, quirkDocument } from "./__fixtures__/value-set-binding.js";

const RELEASE = "stub-value-set-package-2026.1";

const codes = (warnings: readonly CcdaWarning[]): string[] => warnings.map((w) => w.code);

/** The value-set findings a parse produced, in emission order. */
function bindingFindings(warnings: readonly CcdaWarning[]): readonly CcdaWarning[] {
  return warnings.filter(
    (w) =>
      w.code === WARNING_CODES.VALUE_SET_BINDING_VIOLATED ||
      w.code === WARNING_CODES.VALUE_SET_BINDING_NOT_EVALUATED,
  );
}

/** Everything about a finding a caller can observe, for set comparisons. */
const shapeOf = (warnings: readonly CcdaWarning[]): string[] =>
  warnings.map((w) => JSON.stringify(w));

/** A source that answers `membership` for `valueSet` and declines everything else. */
function sourceFor(
  valueSet: string,
  membership: "member" | "not-a-member" | "no-expansion",
): ValueSetSource {
  return {
    release: RELEASE,
    isMember: (query) => (query.valueSet === valueSet ? { membership } : undefined),
  };
}

/** A source that reports every code it is asked about a non-member. */
const rejectsEverything: ValueSetSource = {
  release: RELEASE,
  isMember: () => ({ membership: "not-a-member" }),
};

describe("value-set binding declaration", () => {
  it("AC-7: every declared row names the artifact and revision it was read from", () => {
    const rows = valueSetBindings();
    expect(rows.map((row) => row.slot)).toStrictEqual([...CODE_SLOTS]);
    for (const row of rows) {
      expect(row.source.artifact, row.slot).toContain("C-CDA R2.1");
      expect(row.source.revision, row.slot).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
      // A row asserts a binding only where it can say which statement in that
      // artifact it read it from, and which template's rule carries it.
      expect(row.conformanceId, row.slot).toMatch(/^CONF:\d+-\d+$/u);
      expect(row.sourceTemplate, row.slot).toContain("2.16.840.1.113883.10.20.22.4.");
      expect(row.valueSet, row.slot).toMatch(/^[\d.]+$/u);
      expect(["required", "preferred"]).toContain(row.strength);
    }
  });

  it("AC-7: the declaration is what the check reads, slot for slot", () => {
    for (const slot of CODE_SLOTS) {
      expect(valueSetBinding(slot).slot).toBe(slot);
    }
  });
});

describe("value-set membership at a Required binding", () => {
  const xml = quirkDocument();

  it("AC-1: a non-member at a Required binding is a typed finding naming the slot and value set", () => {
    const binding = valueSetBinding("medication");
    const doc = parseCcda(xml, { valueSets: sourceFor(binding.valueSet, "not-a-member") });

    const found = bindingFindings(doc.warnings);
    expect(found).toHaveLength(1);
    expect(found[0]?.code).toBe(WARNING_CODES.VALUE_SET_BINDING_VIOLATED);
    expect(found[0]?.valueSet).toBe(binding.valueSet);
    expect(found[0]?.message).toContain("medication");
    // The offending value is nowhere in the finding, and the model still has it.
    expect(JSON.stringify(found[0])).not.toContain(QUIRK_CODES.medication);
    expect(doc.getMedications()[0]?.drug?.code).toBe(QUIRK_CODES.medication);
  });

  it("AC-1: a member at the same binding produces no finding", () => {
    const binding = valueSetBinding("medication");
    const doc = parseCcda(xml, { valueSets: sourceFor(binding.valueSet, "member") });
    expect(bindingFindings(doc.warnings)).toStrictEqual([]);
  });

  it("AC-1: every Required slot is reachable, none is declared and then never asked", () => {
    const doc = parseCcda(xml, { valueSets: rejectsEverything });
    const required = valueSetBindings().filter((row) => row.strength === "required");
    const reported = new Set(bindingFindings(doc.warnings).map((w) => w.valueSet));
    for (const row of required) {
      expect(reported.has(row.valueSet), `${row.slot} was declared Required but never asked`).toBe(
        true,
      );
    }
  });

  it("AC-1: a slot with no code symbol is never asked about", () => {
    // A `nullFlavor`-only or symbol-less CD carries no membership claim to test,
    // so the source is not consulted and no finding is produced for it. The
    // mirror of the adapter's own rule, and the reason it matters here is that
    // asking would invite an answer about a code the document never asserted.
    const asked: string[] = [];
    const watching: ValueSetSource = {
      release: RELEASE,
      isMember: ({ coding }) => {
        asked.push(coding.code);
        return { membership: "not-a-member" };
      },
    };
    const noDrugCode = xml.replaceAll(`code="${QUIRK_CODES.medication}"`, "");
    parseCcda(noDrugCode, { valueSets: watching });
    expect(asked).not.toContain("");
    expect(asked).not.toContain(QUIRK_CODES.medication);

    // Driven directly, the same rule with no display text on the coding: no
    // symbol, no question, and nothing emitted.
    const emitted: CcdaWarning[] = [];
    checkSlotValueSetBinding(
      { codeSystem: "2.16.840.1.113883.6.88" },
      "2.16.840.1.113883.6.88",
      "medication",
      { path: "manufacturedMaterial" },
      { emit: (w) => emitted.push(w), valueSets: watching },
    );
    expect(emitted).toStrictEqual([]);

    // With a symbol and no display text it IS asked, so the silence above is the
    // missing symbol rather than a checker that never runs.
    checkSlotValueSetBinding(
      { code: QUIRK_CODES.medication, codeSystem: "2.16.840.1.113883.6.88" },
      "2.16.840.1.113883.6.88",
      "medication",
      { path: "manufacturedMaterial" },
      { emit: (w) => emitted.push(w), valueSets: watching },
    );
    expect(codes(emitted)).toStrictEqual([WARNING_CODES.VALUE_SET_BINDING_VIOLATED]);
  });

  it("AC-2: the checker asks nothing when no source is in the parse context", () => {
    const emitted: CcdaWarning[] = [];
    checkValueSetBinding(
      valueSetBinding("medication"),
      { system: "2.16.840.1.113883.6.88", code: QUIRK_CODES.medication },
      { path: "manufacturedMaterial" },
      { emit: (w) => emitted.push(w) },
    );
    expect(emitted).toStrictEqual([]);
  });

  it("AC-6: an error the source raises reaches the caller", () => {
    const boom = new Error("value set service unavailable");
    const throwing: ValueSetSource = {
      release: RELEASE,
      isMember: () => {
        throw boom;
      },
    };
    // Not swallowed into a document that merely looks checked: the caller gets
    // the failure and can decide, which is the whole fail-safe discipline.
    expect(() => parseCcda(xml, { valueSets: throwing })).toThrow(boom);
  });
});

describe("a binding the source cannot evaluate", () => {
  const xml = quirkDocument();

  it("AC-4: no expansion held yields the not-evaluated finding and no non-membership", () => {
    const binding = valueSetBinding("vaccine");
    const doc = parseCcda(xml, { valueSets: sourceFor(binding.valueSet, "no-expansion") });

    const found = bindingFindings(doc.warnings);
    expect(found).toHaveLength(1);
    expect(found[0]?.code).toBe(WARNING_CODES.VALUE_SET_BINDING_NOT_EVALUATED);
    expect(found[0]?.valueSet).toBe(binding.valueSet);
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.VALUE_SET_BINDING_VIOLATED);
  });

  it("AC-4: a declared absence of opinion stays silent, which is a different answer", () => {
    // `undefined` is the source saying "not my authority"; `no-expansion` is it
    // saying "mine, and I do not hold it". Only the second is reported.
    const doc = parseCcda(xml, { valueSets: { release: RELEASE, isMember: () => undefined } });
    expect(bindingFindings(doc.warnings)).toStrictEqual([]);
  });
});

describe("a Preferred binding is never reported at Required severity", () => {
  const xml = quirkDocument();

  it("AC-5: the problem slot is declared Preferred and draws no Required-binding finding", () => {
    // Read off the pinned R2.1 Schematron: the Problem Observation's value SHALL
    // be present and its code SHOULD be selected from the Problem value set
    // (CONF:1198-9058), which C-CDA's own guidance makes a Preferred binding.
    expect(valueSetBinding("problem").strength).toBe("preferred");

    const doc = parseCcda(xml, { valueSets: rejectsEverything });
    const problemFindings = bindingFindings(doc.warnings).filter((w) =>
      w.message.includes("problem"),
    );
    expect(problemFindings).toStrictEqual([]);
    expect(bindingFindings(doc.warnings).map((w) => w.valueSet)).not.toContain(
      valueSetBinding("problem").valueSet,
    );
  });

  it("AC-5: a constructed Preferred row is silent whatever the declared table says", () => {
    // The criterion is graded against the CONTRACT, not against today's table:
    // if every declared row ever came back Required, the assertion above would
    // have no case to run and this one still would.
    const emitted: CcdaWarning[] = [];
    const preferred: ValueSetBinding = {
      ...valueSetBinding("medication"),
      strength: "preferred",
    };
    checkValueSetBinding(
      preferred,
      { system: "2.16.840.1.113883.6.88", code: QUIRK_CODES.medication },
      { path: "manufacturedMaterial" },
      { emit: (w) => emitted.push(w), valueSets: rejectsEverything },
    );
    expect(emitted).toStrictEqual([]);

    // The negative control: the same row at Required severity does fire, so the
    // silence above is the strength and not a broken driver.
    checkValueSetBinding(
      valueSetBinding("medication"),
      { system: "2.16.840.1.113883.6.88", code: QUIRK_CODES.medication },
      { path: "manufacturedMaterial" },
      { emit: (w) => emitted.push(w), valueSets: rejectsEverything },
    );
    expect(codes(emitted)).toStrictEqual([WARNING_CODES.VALUE_SET_BINDING_VIOLATED]);
  });
});

describe("a parse with no source is the parse this library always produced", () => {
  const xml = quirkDocument();

  it("AC-2: no source supplied means no value-set finding at all", () => {
    const doc = parseCcda(xml);
    expect(bindingFindings(doc.warnings)).toStrictEqual([]);
  });

  it("AC-2: membership is never inferred from the code system alone", () => {
    // Every slot in this fixture carries the code system its slot expects, so
    // nothing structural fires and, with no source, nothing else does either:
    // the library forms no opinion about membership it was not given.
    const doc = parseCcda(xml);
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.UNEXPECTED_CODE_SYSTEM);
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.VALUE_SET_BINDING_VIOLATED);
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.VALUE_SET_BINDING_NOT_EVALUATED);
  });

  it("AC-2: supplying a source adds value-set findings and moves nothing else", () => {
    const baseline = parseCcda(xml).warnings;
    const withSource = parseCcda(xml, { valueSets: rejectsEverything }).warnings;
    const others = withSource.filter(
      (w) =>
        w.code !== WARNING_CODES.VALUE_SET_BINDING_VIOLATED &&
        w.code !== WARNING_CODES.VALUE_SET_BINDING_NOT_EVALUATED,
    );
    // Same findings, same messages, same positions, same order.
    expect(shapeOf(others)).toStrictEqual(shapeOf(baseline));
  });
});

describe("no value is refused, rewritten, reordered or dropped", () => {
  const xml = quirkDocument();

  it("AC-8: every coded value survives a non-membership verdict verbatim", () => {
    const baseline = parseCcda(xml);
    const flagged = parseCcda(xml, { valueSets: rejectsEverything });

    // There ARE findings, so this is not a vacuous comparison over a quiet run.
    expect(bindingFindings(flagged.warnings).length).toBeGreaterThan(0);

    expect(flagged.getProblems()[0]?.problems[0]?.value?.code).toBe(QUIRK_CODES.problem);
    expect(flagged.getMedications()[0]?.drug?.code).toBe(QUIRK_CODES.medication);
    expect(flagged.getMedications()[0]?.route?.code).toBe(QUIRK_CODES.route);
    expect(flagged.getAllergies()[0]?.allergies[0]?.allergen?.code).toBe(QUIRK_CODES.allergen);
    expect(flagged.getImmunizations()[0]?.vaccine?.code).toBe(QUIRK_CODES.vaccine);

    // Nothing anywhere on the document moved, including order.
    expect(JSON.stringify(flagged.getProblems())).toBe(JSON.stringify(baseline.getProblems()));
    expect(JSON.stringify(flagged.getMedications())).toBe(
      JSON.stringify(baseline.getMedications()),
    );
    expect(JSON.stringify(flagged.getAllergies())).toBe(JSON.stringify(baseline.getAllergies()));
    expect(JSON.stringify(flagged.getImmunizations())).toBe(
      JSON.stringify(baseline.getImmunizations()),
    );
    expect(flagged.toString()).toBe(baseline.toString());
  });
});
