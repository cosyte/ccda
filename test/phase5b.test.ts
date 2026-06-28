/**
 * Phase 5b extraction tests — the deferred clinical sections: Plan of Treatment
 * (with the safety-critical performed-vs-planned `moodCode` split applied to
 * every planned-entry template), Functional Status, Mental Status, Family
 * History, and Past Medical History. Every fixture is synthetic ("Jane Doe",
 * fake OIDs) — no realistic PHI, per the repo's PHI-by-default rule.
 */

import { describe, expect, it } from "vitest";

import {
  parseCcda,
  WARNING_CODES,
  requiredSectionKeys,
  missingRequiredSections,
} from "../src/index.js";
import {
  buildCcda,
  DOC_TYPES,
  PLAN_OF_TREATMENT_SECTION,
  FUNCTIONAL_STATUS_SECTION,
  MENTAL_STATUS_SECTION,
  FAMILY_HISTORY_SECTION,
  PAST_MEDICAL_HISTORY_SECTION,
} from "./__fixtures__/ccda.js";

/** The OID for a recognized document type's template (from the fixture table). */
function oidFor(key: string): string {
  const entry = DOC_TYPES.find((d) => d.key === key);
  if (entry === undefined) throw new Error(`no fixture OID for ${key}`);
  return entry.oid;
}

/** Parse a single section under the empty-SHALL Progress Note, no header noise. */
function parseSection(section: string) {
  return parseCcda(
    buildCcda({
      docTypeOid: oidFor("progressNote"),
      sections: section,
      mrnAssigningAuthority: true,
    }),
  );
}

/**
 * A Plan of Treatment section exercising the *absent* branches: a bare Planned
 * Act (no mood, no code, no status), a Planned Observation carrying a value +
 * `negationInd`, and a Planned Supply with a `nullFlavor`.
 */
const MINIMAL_PLAN_SECTION = `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.10"/>
          <code code="18776-5" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Plan of Treatment</title>
          <text>Plan.</text>
          <entry>
            <act classCode="ACT">
              <templateId root="2.16.840.1.113883.10.20.22.4.39"/>
            </act>
          </entry>
          <entry>
            <observation classCode="OBS" moodCode="RQO" negationInd="true">
              <templateId root="2.16.840.1.113883.10.20.22.4.44"/>
              <value xsi:type="PQ" value="2" unit="1"/>
            </observation>
          </entry>
          <entry>
            <supply classCode="SPLY" moodCode="INT" nullFlavor="UNK">
              <templateId root="2.16.840.1.113883.10.20.22.4.43"/>
            </supply>
          </entry>
        </section>
      </component>`;

/**
 * A Functional Status section exercising the *absent* and skip branches: an
 * organizer with an empty component (no observation) and a component carrying an
 * unrelated template (skipped), plus a standalone observation with a
 * `negationInd` + `effectiveTime` but no code/value/status, and one with a
 * `nullFlavor`.
 */
const MINIMAL_FUNCTIONAL_SECTION = `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.14"/>
          <code code="47420-5" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Functional Status</title>
          <text>Functional status.</text>
          <entry>
            <organizer classCode="CLUSTER" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.66"/>
              <component><act classCode="ACT"/></component>
              <component>
                <observation classCode="OBS" moodCode="EVN">
                  <templateId root="2.16.840.1.113883.10.20.22.4.2"/>
                </observation>
              </component>
            </organizer>
          </entry>
          <entry>
            <observation classCode="OBS" moodCode="EVN" negationInd="true">
              <templateId root="2.16.840.1.113883.10.20.22.4.67"/>
              <effectiveTime value="20240101"/>
            </observation>
          </entry>
          <entry>
            <observation classCode="OBS" moodCode="EVN" nullFlavor="UNK">
              <templateId root="2.16.840.1.113883.10.20.22.4.67"/>
            </observation>
          </entry>
        </section>
      </component>`;

/**
 * A Family History section exercising the *absent* branches: an organizer with
 * no `subject` (relative is `{}`), an empty component, an unrelated-template
 * component, and a bare negated observation; plus a second organizer whose
 * `relatedSubject` is a direct child (no `subject` wrapper) with a person that
 * has no `deceasedInd`, and an observation carrying a `nullFlavor`.
 */
const MINIMAL_FAMILY_SECTION = `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.15"/>
          <code code="10157-6" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Family History</title>
          <text>Family history.</text>
          <entry>
            <organizer classCode="CLUSTER" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.45"/>
              <component><act classCode="ACT"/></component>
              <component>
                <observation classCode="OBS" moodCode="EVN">
                  <templateId root="2.16.840.1.113883.10.20.22.4.2"/>
                </observation>
              </component>
              <component>
                <observation classCode="OBS" moodCode="EVN" negationInd="true">
                  <templateId root="2.16.840.1.113883.10.20.22.4.46"/>
                </observation>
              </component>
            </organizer>
          </entry>
          <entry>
            <organizer classCode="CLUSTER" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.45"/>
              <relatedSubject classCode="PRS">
                <code code="MTH" codeSystem="2.16.840.1.113883.5.111" displayName="Mother"/>
                <subject>
                  <administrativeGenderCode code="F" codeSystem="2.16.840.1.113883.5.1"/>
                </subject>
              </relatedSubject>
              <component>
                <observation classCode="OBS" moodCode="EVN" nullFlavor="UNK">
                  <templateId root="2.16.840.1.113883.10.20.22.4.46"/>
                </observation>
              </component>
            </organizer>
          </entry>
        </section>
      </component>`;

describe("plan of treatment — planned entries, never performed", () => {
  it("extracts one planned item per template, each classified planned (never performed)", () => {
    const planned = parseSection(PLAN_OF_TREATMENT_SECTION).getPlannedItems();
    expect(planned.map((p) => p.kind)).toEqual([
      "observation",
      "act",
      "encounter",
      "procedure",
      "medicationActivity",
      "supply",
    ]);
    for (const item of planned) {
      expect(item.disposition).toBe("planned");
      expect(item.disposition).not.toBe("performed");
    }
  });

  it("preserves each planned mood verbatim alongside the disposition", () => {
    const byKind = new Map(
      parseSection(PLAN_OF_TREATMENT_SECTION)
        .getPlannedItems()
        .map((p) => [p.kind, p]),
    );
    expect(byKind.get("observation")?.moodCode).toBe("RQO");
    expect(byKind.get("act")?.moodCode).toBe("INT");
    expect(byKind.get("encounter")?.moodCode).toBe("APT");
    expect(byKind.get("procedure")?.moodCode).toBe("INT");
    expect(byKind.get("medicationActivity")?.moodCode).toBe("INT");
    expect(byKind.get("supply")?.moodCode).toBe("INT");
  });

  it("reads the planned observation's ordered code and the medication's consumable drug", () => {
    const byKind = new Map(
      parseSection(PLAN_OF_TREATMENT_SECTION)
        .getPlannedItems()
        .map((p) => [p.kind, p]),
    );
    expect(byKind.get("observation")?.code?.code).toBe("58410-2");
    // The Planned Medication Activity has no direct <code>; its drug lives in the consumable.
    expect(byKind.get("medicationActivity")?.code?.code).toBe("314076");
    expect(byKind.get("supply")?.code?.code).toBe("58938008");
  });

  it("yields an empty planned-items array for a document with no plan of treatment", () => {
    expect(parseCcda(buildCcda()).getPlannedItems()).toEqual([]);
  });

  it("handles bare/edge planned entries — absent mood, negation, value, nullFlavor", () => {
    const planned = parseSection(MINIMAL_PLAN_SECTION).getPlannedItems();
    expect(planned.map((p) => p.kind)).toEqual(["act", "observation", "supply"]);
    const [act, obs, supply] = planned;
    // Bare act: no mood → disposition undefined (never guessed), no code.
    expect(act?.moodCode).toBeUndefined();
    expect(act?.disposition).toBeUndefined();
    expect(act?.code).toBeUndefined();
    // Planned observation: negated, with a value, distinct from nullFlavor.
    expect(obs?.negated).toBe(true);
    expect(obs?.nullFlavor).toBeUndefined();
    expect(obs?.value?.kind).toBe("physicalQuantity");
    // Planned supply: nullFlavor surfaced, negation untouched.
    expect(supply?.nullFlavor).toBe("UNK");
    expect(supply?.negated).toBeUndefined();
  });
});

describe("functional status — organizer members + standalone observations", () => {
  it("collects the organizer's observation, its assessment scale, and the standalone observation", () => {
    const findings = parseSection(FUNCTIONAL_STATUS_SECTION).getFunctionalStatus();
    expect(findings).toHaveLength(3);
    const walk = findings.find((f) => f.code?.code === "54522-8" && f.value?.kind === "coded");
    expect(walk?.domain).toBe("functional");
    expect(walk?.value?.kind === "coded" ? walk.value.code.code : undefined).toBe("165245003");
  });

  it("flags the assessment scale member and reads its scored value", () => {
    const findings = parseSection(FUNCTIONAL_STATUS_SECTION).getFunctionalStatus();
    const scale = findings.find((f) => f.assessmentScale === true);
    expect(scale?.domain).toBe("functional");
    expect(scale?.value?.kind === "physicalQuantity" ? scale.value.quantity.value : undefined).toBe(
      85,
    );
  });

  it("captures the standalone functional observation outside any organizer", () => {
    const findings = parseSection(FUNCTIONAL_STATUS_SECTION).getFunctionalStatus();
    const selfCare = findings.find(
      (f) => f.value?.kind === "coded" && f.value.code.code === "129019007",
    );
    expect(selfCare).toBeDefined();
    expect(selfCare?.assessmentScale).toBeUndefined();
  });

  it("yields an empty functional-status array for a document with no functional status", () => {
    expect(parseCcda(buildCcda()).getFunctionalStatus()).toEqual([]);
  });

  it("skips non-status organizer members and reads bare/edge standalone observations", () => {
    const findings = parseSection(MINIMAL_FUNCTIONAL_SECTION).getFunctionalStatus();
    // The organizer's empty + unrelated-template components contribute nothing;
    // only the two standalone observations are read.
    expect(findings).toHaveLength(2);
    const negated = findings.find((f) => f.negated === true);
    expect(negated?.code).toBeUndefined();
    expect(negated?.value).toBeUndefined();
    expect(negated?.statusCode).toBeUndefined();
    expect(negated?.effectiveTime).toBeDefined();
    const unknown = findings.find((f) => f.nullFlavor === "UNK");
    expect(unknown?.negated).toBeUndefined();
  });
});

describe("mental status — domain never conflated with functional", () => {
  it("extracts a standalone mental status observation tagged mental", () => {
    const findings = parseSection(MENTAL_STATUS_SECTION).getMentalStatus();
    expect(findings).toHaveLength(1);
    const finding = findings[0];
    expect(finding?.domain).toBe("mental");
    expect(finding?.value?.kind === "coded" ? finding.value.code.code : undefined).toBe(
      "247663003",
    );
  });

  it("does not leak mental findings into functional status (and vice versa)", () => {
    const doc = parseSection(MENTAL_STATUS_SECTION);
    expect(doc.getMentalStatus()).toHaveLength(1);
    expect(doc.getFunctionalStatus()).toEqual([]);
  });

  it("yields an empty mental-status array for a document with no mental status", () => {
    expect(parseCcda(buildCcda()).getMentalStatus()).toEqual([]);
  });
});

describe("family history — relative identity + conditions", () => {
  it("reads the relative's structured identity (relation, gender, birth, deceased)", () => {
    const history = parseSection(FAMILY_HISTORY_SECTION).getFamilyHistory();
    expect(history).toHaveLength(1);
    const relative = history[0]?.relative;
    expect(relative?.relationship?.code).toBe("FTH");
    expect(relative?.gender?.code).toBe("M");
    expect(relative?.birthTime?.date).toBeInstanceOf(Date);
    expect(relative?.deceased).toBe(true);
  });

  it("reads the condition, its age at onset, and the cause-of-death flag", () => {
    const obs = parseSection(FAMILY_HISTORY_SECTION).getFamilyHistory()[0]?.observations[0];
    expect(obs?.condition?.code).toBe("22298006");
    expect(obs?.ageAtOnset?.value).toBe(57);
    expect(obs?.ageAtOnset?.unit).toBe("a");
    expect(obs?.causeOfDeath).toBe(true);
  });

  it("yields an empty family-history array for a document with no family history", () => {
    expect(parseCcda(buildCcda()).getFamilyHistory()).toEqual([]);
  });

  it("handles organizers with no subject, edge components, and bare observations", () => {
    const history = parseSection(MINIMAL_FAMILY_SECTION).getFamilyHistory();
    expect(history).toHaveLength(2);
    // Organizer 1: no subject at all → relative is empty; only the bare FH
    // observation is read (empty + unrelated-template components are skipped).
    const [first, second] = history;
    expect(first?.relative).toEqual({});
    expect(first?.observations).toHaveLength(1);
    const bare = first?.observations[0];
    expect(bare?.condition).toBeUndefined();
    expect(bare?.negated).toBe(true);
    expect(bare?.ageAtOnset).toBeUndefined();
    expect(bare?.causeOfDeath).toBeUndefined();
    // Organizer 2: relatedSubject is a direct child (no <subject> wrapper); the
    // person carries gender but no birthTime/deceasedInd.
    expect(second?.relative.relationship?.code).toBe("MTH");
    expect(second?.relative.gender?.code).toBe("F");
    expect(second?.relative.birthTime).toBeUndefined();
    expect(second?.relative.deceased).toBeUndefined();
    expect(second?.observations[0]?.nullFlavor).toBe("UNK");
  });
});

describe("past medical history — bare problem observations, no double-count", () => {
  it("extracts a bare Problem Observation as a problem", () => {
    const history = parseSection(PAST_MEDICAL_HISTORY_SECTION).getPastMedicalHistory();
    expect(history).toHaveLength(1);
    expect(history[0]?.value?.code).toBe("74400008");
  });

  it("does not surface past medical history as an active problem concern", () => {
    const doc = parseSection(PAST_MEDICAL_HISTORY_SECTION);
    expect(doc.getPastMedicalHistory()).toHaveLength(1);
    expect(doc.getProblems()).toEqual([]);
  });

  it("yields an empty past-medical-history array for a document with none", () => {
    expect(parseCcda(buildCcda()).getPastMedicalHistory()).toEqual([]);
  });
});

describe("required-section (SHALL) — Care Plan", () => {
  it("requires Health Concerns + Goals, and NEVER Plan of Treatment (which it SHALL NOT contain)", () => {
    const keys = requiredSectionKeys("carePlan");
    expect(keys).toEqual(["healthConcerns", "goals"]);
    expect(keys).not.toContain("planOfTreatment");
  });

  it("flags a Care Plan missing its required sections", () => {
    // The default fixture carries allergies + problems — neither is a Care Plan SHALL.
    const doc = parseCcda(buildCcda({ docTypeOid: oidFor("carePlan") }));
    const messaged = doc.warnings
      .filter((w) => w.code === WARNING_CODES.REQUIRED_SECTION_MISSING)
      .map((w) => w.message);
    expect(messaged.some((m) => m.includes("healthConcerns"))).toBe(true);
    expect(messaged.some((m) => m.includes("goals"))).toBe(true);
    expect(messaged.some((m) => m.includes("planOfTreatment"))).toBe(false);
  });

  it("computes the absent subset via missingRequiredSections", () => {
    expect(missingRequiredSections("carePlan", new Set(["healthConcerns"]))).toEqual(["goals"]);
    expect(missingRequiredSections("carePlan", new Set(["healthConcerns", "goals"]))).toEqual([]);
  });
});
