import { readFileSync, readdirSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  CcdaParseError,
  CcdaProfileDefinitionError,
  SAFETY_CRITICAL_CODES,
  WARNING_CODES,
  buildDocument,
  child,
  children,
  defineCcdaProfile,
  extractAllergies,
  extractClinical,
  extractFamilyHistory,
  extractMedications,
  extractProblems,
  extractResults,
  parseCcda,
  parseSecureXml,
  resolveLimits,
  serializeCcda,
  type CcdaDocument,
  type CcdaWarning,
} from "../src/index.js";
import * as ENTRY_SHARED from "../src/model/entries/shared.js";
import { ALL_WARNING_MESSAGES } from "../src/parser/warnings.js";
import * as FIXTURES from "./__fixtures__/ccda.js";
import { buildCcda, NO_REQUIRED_SECTIONS_DOC_OID } from "./__fixtures__/ccda.js";
import type { Element } from "@xmldom/xmldom";

/**
 * `SUBJECT_CONTEXT_OVERRIDE`: whose data an entry is about.
 *
 * CDA R2 makes `Section.subject` the "Primary target of the entries recorded in
 * a section" and C-CDA admits the same override on a clinical statement, so a
 * conformant document can carry a relative's, a donor's or a contact's statement
 * inside the patient's document. Before this the parser read `<subject>` in one
 * place only (a Family History Organizer's `relatedSubject`) and every other
 * extractor handed its entries back as the patient's, silently.
 *
 * The four rules under test, each of which is a decision rather than an
 * implementation detail: presence is the trigger (no declared subject is ever
 * compared with the record target), the nearest enclosing declaration wins, the
 * TOP-LEVEL ENTRY is the unit of both withholding and counting, and a Family
 * History Organizer's own subject slot is never an override.
 */

const SNOMED = "2.16.840.1.113883.6.96";
const RXNORM = "2.16.840.1.113883.6.88";
const LOINC = "2.16.840.1.113883.6.1";
const NEW_CODE = WARNING_CODES.SUBJECT_CONTEXT_OVERRIDE;

/** A readable `<subject>` naming a relative: the shape a real override carries. */
const RELATIVE_SUBJECT = `<subject>
                <relatedSubject classCode="PRS">
                  <code code="MTH" codeSystem="2.16.840.1.113883.5.111" displayName="Mother"/>
                  <subject><name><given>Jane</given><family>Doe</family></name></subject>
                </relatedSubject>
              </subject>`;

/** A `<subject>` restating the RECORD TARGET's own name and identifier (A4). */
const SELF_SUBJECT = `<subject>
                <relatedSubject classCode="PRS">
                  <id root="2.16.840.1.113883.19.5" extension="MRN001"/>
                  <code code="SELF" codeSystem="2.16.840.1.113883.5.111"/>
                  <subject><name><given>Jane</given><family>Doe</family></name></subject>
                </relatedSubject>
              </subject>`;

/** An empty, null-flavoured declaration with no related subject inside it (A10, A7). */
const NULL_SUBJECT = `<subject nullFlavor="UNK"/>`;

/** A `templateId` element for a bare root, the one-line stamp of the F1 shape. */
const stamp = (root: string): string => `<templateId root="${root}"/>`;

/** The Family History Organizer root, stamped onto entries that are not one (F1). */
const FAMILY_HISTORY_ORGANIZER_ROOT = "2.16.840.1.113883.10.20.22.4.45";

interface ProblemEntryOptions {
  /** A `<subject>` on the Problem Concern Act itself. */
  readonly actSubject?: string;
  /** A `<subject>` on the first nested Problem Observation. */
  readonly obsSubject?: string;
  /** Add a second nested Problem Observation. */
  readonly second?: boolean;
  /** A `<subject>` on the second nested Problem Observation. */
  readonly secondSubject?: string;
  /** An extra `<templateId>` on the Problem Concern Act itself. */
  readonly actStamp?: string;
  /** An extra `<templateId>` on the first nested Problem Observation. */
  readonly obsStamp?: string;
}

/** One Problem Concern Act entry (`…22.4.3`) wrapping one or two Problem Observations. */
function problemEntry(n: number, o: ProblemEntryOptions = {}): string {
  const observation = (suffix: string, code: string, subject: string, extra = ""): string => `
              <entryRelationship typeCode="SUBJ">
                <observation classCode="OBS" moodCode="EVN">
                  <templateId root="2.16.840.1.113883.10.20.22.4.4" extension="2015-08-01"/>${extra}
                  <id root="2.16.840.1.113883.19.5.99999.2" extension="prob-obs-${suffix}"/>
                  <code code="55607006" codeSystem="${SNOMED}"/>
                  <statusCode code="completed"/>
                  <value xsi:type="CD" code="${code}" codeSystem="${SNOMED}"/>${subject}
                </observation>
              </entryRelationship>`;
  return `
          <entry>
            <act classCode="ACT" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.3" extension="2015-08-01"/>${o.actStamp ?? ""}
              <id root="2.16.840.1.113883.19.5.99999.2" extension="prob-act-${String(n)}"/>
              <statusCode code="active"/>
              <effectiveTime><low value="20210101"/></effectiveTime>${o.actSubject ?? ""}${observation(`${String(n)}a`, "59621000", o.obsSubject ?? "", o.obsStamp ?? "")}${
                o.second === true
                  ? observation(`${String(n)}b`, "38341003", o.secondSubject ?? "")
                  : ""
              }
            </act>
          </entry>`;
}

/** One Medication Activity entry (`…22.4.16`), optionally carrying its own declaration. */
function medicationEntry(n: number, subject = ""): string {
  return `
          <entry>
            <substanceAdministration classCode="SBADM" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.16" extension="2014-06-09"/>
              <id root="2.16.840.1.113883.19.5.99999.3" extension="med-${String(n)}"/>
              <statusCode code="active"/>
              <effectiveTime xsi:type="IVL_TS"><low value="20210101"/></effectiveTime>
              <routeCode code="C38288" codeSystem="2.16.840.1.113883.3.26.1.1"/>
              <doseQuantity value="10" unit="mg"/>${subject}
              <consumable>
                <manufacturedProduct classCode="MANU">
                  <templateId root="2.16.840.1.113883.10.20.22.4.23" extension="2014-06-09"/>
                  <manufacturedMaterial><code code="314076" codeSystem="${RXNORM}"/></manufacturedMaterial>
                </manufacturedProduct>
              </consumable>
            </substanceAdministration>
          </entry>`;
}

/** One Allergy Concern Act entry (`…22.4.30`) with a negated (no-known-allergy) observation. */
function allergyEntry(n: number, subject = ""): string {
  return `
          <entry>
            <act classCode="ACT" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.30" extension="2015-08-01"/>
              <id root="2.16.840.1.113883.19.5.99999.4" extension="alg-act-${String(n)}"/>
              <statusCode code="active"/>${subject}
              <entryRelationship typeCode="SUBJ">
                <observation classCode="OBS" moodCode="EVN" negationInd="true">
                  <templateId root="2.16.840.1.113883.10.20.22.4.7" extension="2014-06-09"/>
                  <code code="ASSERTION" codeSystem="2.16.840.1.113883.5.4"/>
                  <statusCode code="completed"/>
                  <value xsi:type="CD" code="416098002" codeSystem="${SNOMED}"/>
                </observation>
              </entryRelationship>
            </act>
          </entry>`;
}

/**
 * One Family History Organizer entry (`…22.4.45`). `subject` is the organizer's
 * OWN slot: the template's mechanism for naming the relative, never an override.
 * `extraStamp` is any further `<templateId>` the organizer carries.
 */
function familyHistoryEntry(n: number, subject: string, extraStamp = ""): string {
  return `
          <entry>
            <organizer classCode="CLUSTER" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.45" extension="2015-08-01"/>${extraStamp}
              <id root="2.16.840.1.113883.19.5.99999.23" extension="fhx-org-${String(n)}"/>
              <statusCode code="completed"/>${subject}
              <component>
                <observation classCode="OBS" moodCode="EVN">
                  <templateId root="2.16.840.1.113883.10.20.22.4.46" extension="2015-08-01"/>
                  <id root="2.16.840.1.113883.19.5.99999.23" extension="fhx-obs-${String(n)}"/>
                  <code code="64572001" codeSystem="${SNOMED}"/>
                  <statusCode code="completed"/>
                  <value xsi:type="CD" code="22298006" codeSystem="${SNOMED}"/>
                </observation>
              </component>
            </organizer>
          </entry>`;
}

/**
 * One Result Organizer entry (`…22.4.1`) holding one Result Observation, with an
 * optional `<subject>` of its own and an optional extra `<templateId>`. The
 * vehicle for F1: stamping it with the Family History Organizer root must not
 * hand a relative's lab panel back as the patient's.
 */
function resultEntry(o: { readonly subject?: string; readonly extraStamp?: string } = {}): string {
  return `
          <entry>
            <organizer classCode="BATTERY" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.1" extension="2015-08-01"/>${o.extraStamp ?? ""}
              <id root="2.16.840.1.113883.19.5.99999.9" extension="res-org-1"/>
              <code code="24356-8" codeSystem="${LOINC}"/>
              <statusCode code="completed"/>${o.subject ?? ""}
              <component>
                <observation classCode="OBS" moodCode="EVN">
                  <templateId root="2.16.840.1.113883.10.20.22.4.2" extension="2015-08-01"/>
                  <id root="2.16.840.1.113883.19.5.99999.9" extension="res-obs-1"/>
                  <code code="2951-2" codeSystem="${LOINC}"/>
                  <statusCode code="completed"/>
                  <effectiveTime value="20210101"/>
                  <value xsi:type="PQ" value="140" unit="mmol/L"/>
                </observation>
              </component>
            </organizer>
          </entry>`;
}

/** Wrap entries in a recognized section, optionally declaring a subject and nesting a subsection. */
function section(o: {
  readonly templateRoot: string;
  readonly code: string;
  readonly title: string;
  readonly subject?: string;
  readonly entries?: string;
  readonly subsections?: string;
  readonly narrative?: string;
}): string {
  return `
      <component>
        <section>
          <templateId root="${o.templateRoot}" extension="2015-08-01"/>
          <code code="${o.code}" codeSystem="${LOINC}"/>
          <title>${o.title}</title>
          <text>${o.narrative ?? "<paragraph>Section narrative.</paragraph>"}</text>${o.subject ?? ""}${o.entries ?? ""}${o.subsections ?? ""}
        </section>
      </component>`;
}

const problemsSection = (
  o: Omit<Parameters<typeof section>[0], "templateRoot" | "code" | "title">,
) =>
  section({
    templateRoot: "2.16.840.1.113883.10.20.22.2.5.1",
    code: "11450-4",
    title: "Problems",
    ...o,
  });

const medicationsSection = (
  o: Omit<Parameters<typeof section>[0], "templateRoot" | "code" | "title">,
) =>
  section({
    templateRoot: "2.16.840.1.113883.10.20.22.2.1.1",
    code: "10160-0",
    title: "Medications",
    ...o,
  });

const allergiesSection = (
  o: Omit<Parameters<typeof section>[0], "templateRoot" | "code" | "title">,
) =>
  section({
    templateRoot: "2.16.840.1.113883.10.20.22.2.6.1",
    code: "48765-2",
    title: "Allergies",
    ...o,
  });

const familyHistorySection = (
  o: Omit<Parameters<typeof section>[0], "templateRoot" | "code" | "title">,
) =>
  section({
    templateRoot: "2.16.840.1.113883.10.20.22.2.15",
    code: "10157-6",
    title: "Family History",
    ...o,
  });

const resultsSection = (
  o: Omit<Parameters<typeof section>[0], "templateRoot" | "code" | "title">,
) =>
  section({
    templateRoot: "2.16.840.1.113883.10.20.22.2.3.1",
    code: "30954-2",
    title: "Results",
    ...o,
  });

/**
 * A section this parser does not recognize: no catalog `templateId` and no
 * `<code>` to fall back to. The every-family walk still reaches its entries, so
 * withholding has to happen here too, and the locus carries no `sectionCode`.
 */
function unrecognizedSection(entries: string): string {
  return `
      <component>
        <section>
          <title>Laboratory</title>
          <text><paragraph>Section narrative.</paragraph></text>${entries}
        </section>
      </component>`;
}

/**
 * Assemble a Progress Note (empty SHALL table) around `sections`, with the MRN's
 * assigning authority present so the document is otherwise SILENT: every warning
 * a test sees is the one it planted, and strict mode escalates that one rather
 * than an unrelated header quirk that happened to come first.
 */
function doc(sections: string, opts: { readonly recordTargets?: number } = {}): string {
  return buildCcda({
    docTypeOid: NO_REQUIRED_SECTIONS_DOC_OID,
    mrnAssigningAuthority: true,
    sections,
    ...(opts.recordTargets === undefined ? {} : { recordTargets: opts.recordTargets }),
  });
}

/** Parse with no profile, so nothing is re-badged, and hand back the document. */
function parse(xml: string): CcdaDocument {
  return parseCcda(xml, { profile: null });
}

/** Every `SUBJECT_CONTEXT_OVERRIDE` a parse produced, in emission order. */
function overrides(parsed: CcdaDocument): readonly CcdaWarning[] {
  return parsed.warnings.filter((w) => w.code === NEW_CODE);
}

/** The count of `SUBJECT_CONTEXT_OVERRIDE` instances on a parsed document. */
function overrideCount(xml: string): number {
  return overrides(parse(xml)).length;
}

/** Every clinical family a record-target read path returns, flattened for emptiness checks. */
function recordTargetEntryCount(parsed: CcdaDocument): number {
  return (
    parsed.problems.length +
    parsed.medications.length +
    parsed.allergies.length +
    parsed.results.length +
    parsed.vitals.length +
    parsed.immunizations.length +
    parsed.procedures.length +
    parsed.encounters.length +
    parsed.smokingStatus.length +
    parsed.plannedItems.length +
    parsed.functionalStatus.length +
    parsed.mentalStatus.length +
    parsed.pastMedicalHistory.length
  );
}

/** A recording parse context: the observation channel every extractor already accepts. */
function recorder(): {
  readonly ctx: { emit: (w: CcdaWarning) => void };
  readonly seen: CcdaWarning[];
} {
  const seen: CcdaWarning[] = [];
  return { ctx: { emit: (w) => seen.push(w) }, seen };
}

/** Every `<section>` element of a document, depth-first, straight off the hardened DOM. */
function sectionElements(xml: string): readonly Element[] {
  const dom = parseSecureXml(xml, resolveLimits(), () => {
    /* diagnostics are irrelevant to navigation */
  });
  const root = dom.documentElement;
  if (root === null) throw new Error("fixture did not parse");
  const body = child(child(root, "component") ?? root, "structuredBody");
  if (body === undefined) throw new Error("fixture carries no structuredBody");
  const out: Element[] = [];
  const visit = (sectionEl: Element): void => {
    out.push(sectionEl);
    for (const comp of children(sectionEl, "component")) {
      const nested = child(comp, "section");
      if (nested !== undefined) visit(nested);
    }
  };
  for (const comp of children(body, "component")) {
    const sectionEl = child(comp, "section");
    if (sectionEl !== undefined) visit(sectionEl);
  }
  return out;
}

/** Fail the test loudly rather than assert a value away with `!`. */
function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`fixture navigation failed: ${what}`);
  return value;
}

/** The nth `<section>` element of a document, depth-first. */
function sectionAt(xml: string, index: number): Element {
  return must(sectionElements(xml)[index], `section at index ${String(index)}`);
}

/** The `structuredBody` element, for a direct `extractClinical` / `buildDocument` call. */
function bodyElement(xml: string): { readonly root: Element; readonly body: Element } {
  const dom = parseSecureXml(xml, resolveLimits(), () => {
    /* diagnostics are irrelevant to navigation */
  });
  const root = dom.documentElement;
  if (root === null) throw new Error("fixture did not parse");
  const body = child(child(root, "component") ?? root, "structuredBody");
  if (body === undefined) throw new Error("fixture carries no structuredBody");
  return { root, body };
}

// ---------------------------------------------------------------------------
// A1 to A3: the phase's own acceptance, on the three fixtures it names
// ---------------------------------------------------------------------------

describe("the phase's acceptance: an entry is never read as the patient's unless it is", () => {
  it("A1/A2: an override on a Problem Observation warns and withholds the whole entry", () => {
    const parsed = parse(
      doc(problemsSection({ entries: problemEntry(1, { obsSubject: RELATIVE_SUBJECT }) })),
    );
    const found = overrides(parsed);

    expect(found).toHaveLength(1);
    expect(SAFETY_CRITICAL_CODES.has(NEW_CODE)).toBe(true);
    // The locus names the concern act the reader expected back, bounded: an
    // element name from the CDA vocabulary, the section's LOINC code, and the
    // XML locator. Nothing the document said.
    expect(found[0]?.position.path).toBe("act");
    expect(found[0]?.position.sectionCode).toBe("11450-4");
    expect(typeof found[0]?.position.line).toBe("number");
    expect(parsed.problems).toHaveLength(0);
    expect(parsed.getProblems()).toHaveLength(0);
  });

  it("A1/A2: an override on a Medication Activity warns and withholds it", () => {
    const parsed = parse(
      doc(medicationsSection({ entries: medicationEntry(1, RELATIVE_SUBJECT) })),
    );

    expect(overrides(parsed)).toHaveLength(1);
    expect(overrides(parsed)[0]?.position.path).toBe("substanceAdministration");
    expect(parsed.medications).toHaveLength(0);
    expect(parsed.getMedications()).toHaveLength(0);
  });

  it("A3: a section-level override applies to every entry the section contains", () => {
    const parsed = parse(
      doc(
        problemsSection({ subject: RELATIVE_SUBJECT, entries: problemEntry(1) + problemEntry(2) }),
      ),
    );

    expect(overrides(parsed)).toHaveLength(2);
    expect(parsed.problems).toHaveLength(0);
    // Same document, declaration removed: the control that says the entries are
    // real and it is the declaration that withholds them.
    const control = parse(doc(problemsSection({ entries: problemEntry(1) + problemEntry(2) })));
    expect(control.problems).toHaveLength(2);
    expect(overrides(control)).toHaveLength(0);
  });

  it("A3: an entry that overrides the section declaration again is still withheld", () => {
    const parsed = parse(
      doc(
        problemsSection({
          subject: RELATIVE_SUBJECT,
          entries: problemEntry(1, { actSubject: SELF_SUBJECT }) + problemEntry(2),
        }),
      ),
    );

    // Two governed entries, two warnings: an inner declaration re-overrides an
    // outer one (A5), and because every declaration is an override the entry is
    // never handed back to the record target by re-declaring.
    expect(overrides(parsed)).toHaveLength(2);
    expect(parsed.problems).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// A4, A5: presence is the trigger; the nearest declaration governs
// ---------------------------------------------------------------------------

describe("presence is the trigger, and the nearest declaration wins", () => {
  it("A4: a declaration restating the record target's own name and MRN still withholds", () => {
    const parsed = parse(
      doc(problemsSection({ entries: problemEntry(1, { actSubject: SELF_SUBJECT }) })),
    );

    expect(overrides(parsed)).toHaveLength(1);
    expect(parsed.problems).toHaveLength(0);
    // And nothing the declaration carried reached the diagnostic.
    expect(JSON.stringify(overrides(parsed))).not.toContain("MRN001");
    expect(JSON.stringify(overrides(parsed))).not.toContain("Doe");
  });

  it("A5: a declaration nested two statements deep still governs the whole entry, once", () => {
    const parsed = parse(
      doc(
        problemsSection({
          entries: problemEntry(1, { second: true, secondSubject: RELATIVE_SUBJECT }),
        }),
      ),
    );

    expect(overrides(parsed)).toHaveLength(1);
    expect(overrides(parsed)[0]?.position.path).toBe("act");
    expect(parsed.problems).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// A6, A20: the top-level entry is the unit, in whole
// ---------------------------------------------------------------------------

describe("the top-level entry is the unit of withholding, in whole", () => {
  const twoObservationsUnderSectionOverride = doc(
    problemsSection({ subject: RELATIVE_SUBJECT, entries: problemEntry(1, { second: true }) }),
  );

  it("A6: neither nested observation is reachable through any record-target read path", () => {
    const parsed = parse(twoObservationsUnderSectionOverride);
    const { body } = bodyElement(twoObservationsUnderSectionOverride);
    const aggregate = extractClinical(body, recorder().ctx);
    const sectionEl = sectionAt(twoObservationsUnderSectionOverride, 0);

    expect(parsed.problems).toHaveLength(0);
    expect(parsed.getProblems()).toHaveLength(0);
    expect(aggregate.problems).toHaveLength(0);
    expect(extractProblems(sectionEl, new Map(), recorder().ctx)).toHaveLength(0);
    // The nested observations are not reachable anywhere on the model.
    expect(JSON.stringify({ ...parsed, warnings: [] })).not.toContain("prob-obs-1b");
    expect(recordTargetEntryCount(parsed)).toBe(0);
  });

  it("A20: a declaration on the SECOND nested observation withholds the whole concern act", () => {
    // No section-level declaration, no declaration on the concern act: only the
    // second Problem Observation carries one.
    const xml = doc(
      problemsSection({
        entries: problemEntry(1, { second: true, secondSubject: RELATIVE_SUBJECT }),
      }),
    );
    const parsed = parse(xml);
    const found = overrides(parsed);

    expect(parsed.problems).toHaveLength(0);
    expect(parsed.getProblems()).toHaveLength(0);
    // Not "a concern act carrying one observation": nothing at all.
    expect(JSON.stringify({ ...parsed, warnings: [] })).not.toContain("prob-act-1");
    expect(found).toHaveLength(1);
    expect(found[0]?.position.path).toBe("act");
    // The control locates the act rather than the observation: the observation
    // sits further down the document than the act it is nested in.
    const control = parse(doc(problemsSection({ entries: problemEntry(1, { second: true }) })));
    expect(control.problems).toHaveLength(1);
    expect(control.problems[0]?.problems).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// A7, A8, A21: the family-history carve-out, on all four faces
// ---------------------------------------------------------------------------

describe("family history is carved out in whole, on all four faces", () => {
  /** The four faces of the family-history family for one document. */
  function fourFaces(xml: string): {
    readonly field: unknown;
    readonly accessor: unknown;
    readonly extractor: unknown;
    readonly aggregate: unknown;
  } {
    const parsed = parse(xml);
    const { body } = bodyElement(xml);
    const sections = sectionElements(xml);
    const fhSection = sections.find((s) => child(s, "code")?.getAttribute("code") === "10157-6");
    return {
      field: parsed.familyHistory,
      accessor: parsed.getFamilyHistory(),
      extractor: extractFamilyHistory(
        must(fhSection, "family history section"),
        new Map(),
        recorder().ctx,
      ),
      aggregate: extractClinical(body, recorder().ctx).familyHistory,
    };
  }

  it("A7: an organizer's own null-flavoured subject slot is not an override", () => {
    const xml = doc(familyHistorySection({ entries: familyHistoryEntry(1, NULL_SUBJECT) }));
    const parsed = parse(xml);
    // The same document with the unreadable slot removed entirely: the pin reads
    // an organizer with no readable related subject exactly this way.
    const control = parse(doc(familyHistorySection({ entries: familyHistoryEntry(1, "") })));

    expect(overrides(parsed)).toHaveLength(0);
    expect(parsed.familyHistory).toHaveLength(1);
    expect(parsed.familyHistory).toStrictEqual(control.familyHistory);
  });

  it("A9/A7: repeated subject slots on an organizer draw no warning and change nothing", () => {
    const xml = doc(
      familyHistorySection({ entries: familyHistoryEntry(1, RELATIVE_SUBJECT + NULL_SUBJECT) }),
    );
    const parsed = parse(xml);
    const control = parse(
      doc(familyHistorySection({ entries: familyHistoryEntry(1, RELATIVE_SUBJECT) })),
    );

    expect(overrides(parsed)).toHaveLength(0);
    expect(parsed.familyHistory).toStrictEqual(control.familyHistory);
  });

  it("A8/A21: a declaring Family History section warns, withholds, and leaves all four faces alone", () => {
    // One organizer with its own slot (re-overrides, not governed), one with no
    // slot (governed), and a non-family-history statement in the same section
    // (governed, and its absence is what makes the withholding observable).
    const entries =
      familyHistoryEntry(1, RELATIVE_SUBJECT) + familyHistoryEntry(2, "") + problemEntry(9);
    const xml = doc(familyHistorySection({ subject: RELATIVE_SUBJECT, entries }));
    const control = doc(familyHistorySection({ entries }));
    const parsed = parse(xml);

    // Two governed top-level entries: organizer 2 and the problem concern act.
    expect(overrides(parsed)).toHaveLength(2);
    // The record-target family the extractors fill from that section is empty.
    expect(parsed.problems).toHaveLength(0);
    expect(parse(control).problems).toHaveLength(1);
    // All four family-history faces agree, and match the same document without
    // the section declaration.
    const faces = fourFaces(xml);
    const pin = fourFaces(control);
    expect(faces.field).toStrictEqual(pin.field);
    expect(faces.accessor).toStrictEqual(pin.accessor);
    expect(faces.extractor).toStrictEqual(pin.extractor);
    expect(faces.aggregate).toStrictEqual(pin.aggregate);
    expect(faces.field).toHaveLength(2);
  });

  it("A21: every OTHER aggregate slot is withheld from exactly as its field and accessor are", () => {
    const xml = doc(problemsSection({ subject: RELATIVE_SUBJECT, entries: problemEntry(1) }));
    const parsed = parse(xml);
    const { body } = bodyElement(xml);

    expect(parsed.problems).toHaveLength(0);
    expect(parsed.getProblems()).toHaveLength(0);
    expect(extractClinical(body, recorder().ctx).problems).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// F1: the carve-out reaches the organizer the family-history read path reads,
// and nothing else that happens to carry its templateId
// ---------------------------------------------------------------------------

describe("a stray family-history templateId cannot switch the rule off", () => {
  const FHX = stamp(FAMILY_HISTORY_ORGANIZER_ROOT);

  it("F1: a Result Organizer stamped with the family-history root is withheld from every face", () => {
    const xml = doc(
      resultsSection({ entries: resultEntry({ subject: RELATIVE_SUBJECT, extraStamp: FHX }) }),
    );
    const parsed = parse(xml);
    const { body } = bodyElement(xml);
    const { ctx, seen } = recorder();

    expect(parsed.results).toHaveLength(0);
    expect(parsed.getResults()).toHaveLength(0);
    expect(extractClinical(body, recorder().ctx).results).toHaveLength(0);
    expect(extractResults(sectionAt(xml, 0), new Map(), ctx)).toHaveLength(0);
    expect(seen.filter((w) => w.code === NEW_CODE)).toHaveLength(1);
    expect(overrides(parsed)).toHaveLength(1);
    expect(overrides(parsed)[0]?.position.path).toBe("organizer");
    expect(overrides(parsed)[0]?.position.sectionCode).toBe("30954-2");
    // The control is the same document minus that one `<templateId>`: it
    // withholds and reports identically, so the stamp is the whole difference.
    const control = parse(
      doc(resultsSection({ entries: resultEntry({ subject: RELATIVE_SUBJECT }) })),
    );
    expect(control.results).toHaveLength(0);
    expect(overrides(control)).toHaveLength(1);
  });

  it("F1/A21: the stamped entry still reaches the family-history face, unchanged", () => {
    // The carve-out is READ-SIDE: what the family-history path returns for this
    // document is what it returned before the rule existed (it matches on the
    // root through `childEntries`), and that is exactly why withholding it from
    // `results` costs nothing and attributes nothing to the record target.
    const xml = doc(
      resultsSection({ entries: resultEntry({ subject: RELATIVE_SUBJECT, extraStamp: FHX }) }),
    );
    const parsed = parse(xml);

    expect(parsed.familyHistory).toHaveLength(1);
    expect(parsed.getFamilyHistory()).toStrictEqual(parsed.familyHistory);
    expect(parsed.familyHistory[0]?.relative.relationship?.code).toBe("MTH");
  });

  it("F1: the same entry in a section this parser does not recognize is withheld too", () => {
    // The every-family walk reaches an unrecognized section's entries, and there
    // the document would otherwise be completely silent, strict mode included.
    const xml = doc(
      unrecognizedSection(resultEntry({ subject: RELATIVE_SUBJECT, extraStamp: FHX })),
    );
    const parsed = parse(xml);

    expect(parsed.results).toHaveLength(0);
    expect(overrides(parsed)).toHaveLength(1);
    // The section carries no `<code>`, so the locus carries no section code:
    // bounded values only, never a manufactured one.
    expect(overrides(parsed)[0]?.position.sectionCode).toBeUndefined();
    expect(() => parseCcda(xml, { profile: null, strict: true })).toThrow(CcdaParseError);
  });

  it("F1: a Problem Concern Act stamped with the family-history root is still governed", () => {
    const xml = doc(
      problemsSection({
        entries: problemEntry(1, { actSubject: RELATIVE_SUBJECT, actStamp: FHX }),
      }),
    );
    const parsed = parse(xml);

    expect(parsed.problems).toHaveLength(0);
    expect(parsed.getProblems()).toHaveLength(0);
    expect(overrides(parsed)).toHaveLength(1);
    expect(overrides(parsed)[0]?.position.path).toBe("act");
  });

  it("F1: a declaration deeper than the entry's own act never gets the carve-out", () => {
    // The stamp sits on the nested Problem Observation that carries the
    // declaration. The carve-out is the organizer the family-history read path
    // reads, matched by identity, so a nested element can never claim it.
    const xml = doc(
      problemsSection({
        entries: problemEntry(1, { obsSubject: RELATIVE_SUBJECT, obsStamp: FHX }),
      }),
    );
    const parsed = parse(xml);

    expect(parsed.problems).toHaveLength(0);
    expect(overrides(parsed)).toHaveLength(1);
    expect(overrides(parsed)[0]?.position.path).toBe("act");
  });

  it("F1: a stamped SECTION still declares an override for everything beneath it", () => {
    const xml = doc(
      section({
        templateRoot: "2.16.840.1.113883.10.20.22.2.5.1",
        code: "11450-4",
        title: "Problems",
        subject: RELATIVE_SUBJECT,
        entries: problemEntry(1) + problemEntry(2),
      }).replace("<title>Problems</title>", `${FHX}<title>Problems</title>`),
    );
    const parsed = parse(xml);

    expect(parsed.problems).toHaveLength(0);
    expect(overrides(parsed)).toHaveLength(2);
  });

  it("A7: an organizer carrying an extra vendor templateId still owns its subject slot", () => {
    // The other direction, and the reason the test is on what a RECORD-TARGET
    // read path claims rather than on carrying any second template at all: a real
    // Family History Organizer with a vendor stamp is still one, so its slot is
    // still not an override and it still draws no warning.
    const vendor = stamp("2.16.840.1.113883.3.9999.77");
    const xml = doc(familyHistorySection({ entries: familyHistoryEntry(1, NULL_SUBJECT, vendor) }));
    const parsed = parse(xml);
    const control = parse(doc(familyHistorySection({ entries: familyHistoryEntry(1, "") })));

    expect(overrides(parsed)).toHaveLength(0);
    expect(parsed.familyHistory).toStrictEqual(control.familyHistory);
    expect(recordTargetEntryCount(parsed)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// F1: and the root list the carve-out turns on stays traced
// ---------------------------------------------------------------------------

describe("the record-target root list stays in step with the extractors", () => {
  const ENTRIES_DIR = new URL("../src/model/entries/", import.meta.url);

  /** A template-root constant looked up BY NAME on the module the extractors import. */
  function rootNamed(name: string): string | undefined {
    const table: Record<string, unknown> = { ...ENTRY_SHARED };
    const value = table[name];
    return typeof value === "string" ? value : undefined;
  }

  /**
   * The roots an extractor reaches through a local name rather than a constant:
   * the two variant tables and the two status-domain parameters. Listed by
   * constant NAME, so nothing here restates an OID.
   */
  const INDIRECT: Readonly<Record<string, readonly string[]>> = {
    "variant.root": [
      "PROCEDURE_ACTIVITY_PROCEDURE",
      "PROCEDURE_ACTIVITY_ACT",
      "PROCEDURE_ACTIVITY_OBSERVATION",
      "PLANNED_ACT",
      "PLANNED_ENCOUNTER",
      "PLANNED_PROCEDURE",
      "PLANNED_MEDICATION_ACTIVITY",
      "PLANNED_SUPPLY",
      "PLANNED_OBSERVATION",
      "PLANNED_IMMUNIZATION_ACTIVITY",
    ],
    organizerRoot: ["FUNCTIONAL_STATUS_ORGANIZER", "MENTAL_STATUS_ORGANIZER"],
    observationRoot: ["FUNCTIONAL_STATUS_OBSERVATION", "MENTAL_STATUS_OBSERVATION"],
    root: ["INSTRUCTION", "HANDOFF_COMMUNICATION_PARTICIPANTS", "NUTRITION_RECOMMENDATION"],
  };

  it("F1: every root an extractor reads a top-level entry by is in the list, and nothing else is", () => {
    const found = new Set<string>();
    let scanned = 0;

    for (const file of readdirSync(ENTRIES_DIR)) {
      if (!file.endsWith(".ts")) continue;
      const source = readFileSync(new URL(file, ENTRIES_DIR), "utf8");
      // The extractors that read their entries through the choke point are the
      // record-target ones, by definition: family history reads `childEntries`.
      // The choke point's own module is not one of them (it only shows the call).
      if (source.includes("export function readableEntries")) continue;
      if (!source.includes("of readableEntries(sectionEl, ctx)")) continue;
      scanned += 1;
      const names = [
        ...source.matchAll(/entryAct\(\s*entry\s*,\s*([\w$.]+)\s*\)/g),
        ...source.matchAll(/hasTemplateRoot\(\s*act\s*,\s*([\w$.]+)\s*\)/g),
      ].map((match) => match[1] ?? "");
      expect(names.length, `${file} reads entries but names no entry template`).toBeGreaterThan(0);

      for (const name of names) {
        const direct = rootNamed(name);
        const roots =
          direct === undefined
            ? (INDIRECT[name] ?? []).map((constant) => rootNamed(constant) ?? constant)
            : [direct];
        expect(
          roots.length,
          `${file}: the template named ${name} resolves to nothing. Resolve it, add its root to RECORD_TARGET_ENTRY_ROOTS, or the family-history carve-out will exempt an entry this extractor returns.`,
        ).toBeGreaterThan(0);
        for (const root of roots) found.add(root);
      }
    }

    expect(scanned).toBe(12);
    expect([...found].sort()).toStrictEqual([...ENTRY_SHARED.RECORD_TARGET_ENTRY_ROOTS].sort());
    // And the one root that must never be on it, whatever else is.
    expect(ENTRY_SHARED.RECORD_TARGET_ENTRY_ROOTS.has(FAMILY_HISTORY_ORGANIZER_ROOT)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// A9 to A12: the malformed, missing-context and empty-state cases
// ---------------------------------------------------------------------------

describe("malformed, missing and empty cases never throw and never refuse the parse", () => {
  it("A9: two declarations on one entry withhold and warn once, without throwing", () => {
    const xml = doc(
      problemsSection({
        entries: problemEntry(1, { actSubject: RELATIVE_SUBJECT + NULL_SUBJECT }),
      }),
    );

    expect(() => parse(xml)).not.toThrow();
    expect(overrideCount(xml)).toBe(1);
    expect(parse(xml).problems).toHaveLength(0);
  });

  it("A10: an empty or null-flavoured declaration is an override, never resolved to the patient", () => {
    for (const declaration of [
      NULL_SUBJECT,
      "<subject/>",
      "<subject><relatedSubject/></subject>",
    ]) {
      const xml = doc(problemsSection({ entries: problemEntry(1, { actSubject: declaration }) }));
      expect(overrideCount(xml)).toBe(1);
      expect(parse(xml).problems).toHaveLength(0);
    }
  });

  it("A11: an absent or ambiguous record target changes nothing", () => {
    const sections = problemsSection({ subject: RELATIVE_SUBJECT, entries: problemEntry(1) });
    for (const recordTargets of [0, 2]) {
      const parsed = parse(doc(sections, { recordTargets }));
      expect(overrides(parsed)).toHaveLength(1);
      expect(parsed.problems).toHaveLength(0);
    }
  });

  it("A12: a declaring section with no entries emits exactly one warning at its own locus", () => {
    const parsed = parse(doc(allergiesSection({ subject: RELATIVE_SUBJECT })));
    const found = overrides(parsed);

    expect(found).toHaveLength(1);
    expect(found[0]?.position.path).toBe("section");
    expect(found[0]?.position.sectionCode).toBe("48765-2");
    // Every record-target read path reads exactly as it would with no declaration.
    expect(recordTargetEntryCount(parsed)).toBe(0);
    expect(recordTargetEntryCount(parse(doc(allergiesSection({}))))).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// A13: no false positives on the existing corpus
// ---------------------------------------------------------------------------

describe("a document with no overriding declaration reads exactly as it did", () => {
  /** Every `<section>` fixture the shared corpus exports, by name. */
  const CORPUS: readonly (readonly [string, string])[] = Object.entries(FIXTURES).flatMap(
    ([name, value]) =>
      typeof value === "string" && value.includes("<section>")
        ? [[name, value] as readonly [string, string]]
        : [],
  );

  it("A13: every fixture section in the corpus produces zero instances", () => {
    expect(CORPUS.length).toBeGreaterThan(10);
    for (const [name, markup] of CORPUS) {
      const parsed = parse(doc(markup));
      expect(overrides(parsed), `${name} tripped the new warning`).toHaveLength(0);
    }
  });

  it("A13: the whole corpus in one document extracts exactly what it did, and stays quiet", () => {
    const parsed = parse(doc(CORPUS.map(([, markup]) => markup).join("")));

    expect(overrides(parsed)).toHaveLength(0);
    // The document is not vacuously quiet: it really does carry entries.
    expect(recordTargetEntryCount(parsed)).toBeGreaterThan(10);
    expect(parsed.familyHistory.length).toBeGreaterThan(0);
  });

  it("A13: a Family History Organizer's own subject slot is not an override anywhere", () => {
    const parsed = parse(doc(FIXTURES.FAMILY_HISTORY_SECTION));

    expect(overrides(parsed)).toHaveLength(0);
    expect(parsed.familyHistory).toHaveLength(1);
    expect(parsed.familyHistory[0]?.relative.relationship?.code).toBe("FTH");
  });
});

// ---------------------------------------------------------------------------
// A14: the profile safety gate
// ---------------------------------------------------------------------------

describe("no vendor profile can quiet it", () => {
  it("A14: a profile definition naming the code is refused", () => {
    expect(() =>
      defineCcdaProfile({
        name: "subjectOverrideTolerant",
        tolerate: [{ code: NEW_CODE, rationale: "this vendor puts a subject on every entry" }],
      }),
    ).toThrow(CcdaProfileDefinitionError);
  });

  it("A14: an active profile leaves the warning undowngraded and unmarked as expected", () => {
    const profile = defineCcdaProfile({
      name: "benignQuirks",
      tolerate: [{ code: WARNING_CODES.DEPRECATED_LOINC, rationale: "known legacy LOINC usage" }],
    });
    const parsed = parseCcda(
      doc(problemsSection({ subject: RELATIVE_SUBJECT, entries: problemEntry(1) })),
      { profile },
    );
    const found = parsed.warnings.filter((w) => w.code === NEW_CODE);

    expect(found).toHaveLength(1);
    expect(found[0]?.expected).toBeUndefined();
    expect(found[0]?.profile).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// A15: the PHI bound, on a hostile document
// ---------------------------------------------------------------------------

describe("a hostile document cannot get a character into the diagnostic", () => {
  // A declared synthetic sentinel (`scripts/phi-allow-list.txt`), repeated so the
  // name is oversized as well as adversarial, and every other sender-controlled
  // slot around the entry is hostile too. **The binding is named for the token
  // itself on purpose**: `phi-scan` reads this file as a document and tokenizes
  // the interpolation as written, so a binding called `HOSTILE_NAME` puts the
  // undeclared tokens `HOSTILE` and `NAME` inside a `<given>`, and reds the gate.
  const ZZHOSTILESUBJECTZZ = new Array(40).fill("ZZHOSTILESUBJECTZZ").join(" ");
  const HOSTILE_OID = `9.9.${"8".repeat(300)}`;
  const HOSTILE_SECTION_CODE = `${"7".repeat(200)}-NOT-A-LOINC`;
  const HOSTILE_ELEMENT = "ZZHostileElementZZ";

  const hostile = buildCcda({
    docTypeOid: NO_REQUIRED_SECTIONS_DOC_OID,
    mrnAssigningAuthority: true,
    sections: `
      <component>
        <section>
          <templateId root="${HOSTILE_OID}"/>
          <code code="${HOSTILE_SECTION_CODE}" codeSystem="${HOSTILE_OID}"/>
          <title>${ZZHOSTILESUBJECTZZ}</title>
          <text>Narrative.</text>
          <subject>
            <relatedSubject classCode="${HOSTILE_ELEMENT}">
              <code code="${HOSTILE_SECTION_CODE}" codeSystem="${HOSTILE_OID}" displayName="${ZZHOSTILESUBJECTZZ}"/>
              <subject>
                <name><given>${ZZHOSTILESUBJECTZZ}</given><family>${ZZHOSTILESUBJECTZZ}</family></name>
              </subject>
            </relatedSubject>
          </subject>${problemEntry(1)}
          <${HOSTILE_ELEMENT}>${ZZHOSTILESUBJECTZZ}</${HOSTILE_ELEMENT}>
        </section>
      </component>`,
  });

  it("A15: the message is the registry's and the locus carries nothing the document said", () => {
    const found = overrides(parse(hostile));

    expect(found).toHaveLength(1);
    const warning = must(found[0], "the emitted warning");
    expect(ALL_WARNING_MESSAGES.has(warning.message)).toBe(true);
    const serialized = JSON.stringify(warning);
    for (const hostileValue of [
      ZZHOSTILESUBJECTZZ,
      "ZZHOSTILESUBJECTZZ",
      HOSTILE_OID,
      HOSTILE_SECTION_CODE,
      HOSTILE_ELEMENT,
    ]) {
      expect(serialized).not.toContain(hostileValue);
    }
    // The section code failed its LOINC bound, so the locus says so rather than
    // echoing it; the path is a member of the CDA element vocabulary.
    expect(warning.position.sectionCode).toBe("<withheld>");
    expect(warning.position.path).toBe("act");
  });

  it("A15: a hostile element wrapping the entry's content never reaches the locus", () => {
    // The entry's content sits inside an element the sender invented, so no
    // direct child of the `<entry>` is a clinical statement and the locus falls
    // back to the `<entry>` wrapper. The invented name reaches nothing either
    // way: `path` is bounded on the CDA vocabulary, membership, not shape.
    const xml = buildCcda({
      docTypeOid: NO_REQUIRED_SECTIONS_DOC_OID,
      mrnAssigningAuthority: true,
      sections: `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.5.1" extension="2015-08-01"/>
          <code code="11450-4" codeSystem="${LOINC}"/>
          <title>Problems</title>
          <text>Narrative.</text>
          <subject><relatedSubject classCode="PRS"/></subject>
          <entry><${HOSTILE_ELEMENT}><observation classCode="OBS" moodCode="EVN"/></${HOSTILE_ELEMENT}></entry>
        </section>
      </component>`,
    });
    const found = overrides(parse(xml));

    expect(found).toHaveLength(1);
    expect(found[0]?.position.path).toBe("entry");
    expect(JSON.stringify(found[0])).not.toContain(HOSTILE_ELEMENT);
  });
});

// ---------------------------------------------------------------------------
// A16 and the F8 counting question: per section, summed over the document
// ---------------------------------------------------------------------------

describe("the arithmetic is per section and sums over the document", () => {
  it("A16: three governed entries in one section produce exactly three, in document order", () => {
    const parsed = parse(
      doc(
        problemsSection({
          subject: RELATIVE_SUBJECT,
          entries: problemEntry(1) + problemEntry(2) + problemEntry(3),
        }),
      ),
    );
    const found = overrides(parsed);

    expect(found).toHaveLength(3);
    const lines = found.map((w) => w.position.line ?? 0);
    expect([...lines].sort((a, b) => a - b)).toStrictEqual(lines);
  });

  it("A16: three governed entries plus a declaring empty section is FOUR, never three", () => {
    const parsed = parse(
      doc(
        problemsSection({
          subject: RELATIVE_SUBJECT,
          entries: problemEntry(1) + problemEntry(2) + problemEntry(3),
        }) + allergiesSection({ subject: RELATIVE_SUBJECT }),
      ),
    );
    const found = overrides(parsed);

    expect(found).toHaveLength(4);
    expect(found.filter((w) => w.position.path === "act")).toHaveLength(3);
    expect(found.filter((w) => w.position.path === "section")).toHaveLength(1);
  });

  it("A16: the document total is a multi-family sum, counted once per governed entry", () => {
    // The aggregate walk runs all fourteen extractors over every section. If the
    // emission rode the extractor rather than the entry, this document would
    // produce fourteen instances per entry instead of one.
    const parsed = parse(
      doc(
        problemsSection({ subject: RELATIVE_SUBJECT, entries: problemEntry(1) + problemEntry(2) }) +
          medicationsSection({ subject: RELATIVE_SUBJECT, entries: medicationEntry(1) }) +
          allergiesSection({ subject: RELATIVE_SUBJECT, entries: allergyEntry(1) }),
      ),
    );

    expect(overrides(parsed)).toHaveLength(4);
    expect(recordTargetEntryCount(parsed)).toBe(0);
  });

  it("F8: a declaring section whose only governed entries sit in a nested subsection counts 2", () => {
    // Reading B, which decision 6 and A16's own exclusion clause both pick: the
    // section-locus instance is owed only to a section that governs no entry
    // ANYWHERE beneath it, so this document is two entry-locus instances and no
    // third one for the declaring section.
    const parsed = parse(
      doc(
        problemsSection({
          subject: RELATIVE_SUBJECT,
          subsections: problemsSection({ entries: problemEntry(1) + problemEntry(2) }),
        }),
      ),
    );
    const found = overrides(parsed);

    expect(found).toHaveLength(2);
    expect(found.every((w) => w.position.path === "act")).toBe(true);
    expect(parsed.problems).toHaveLength(0);
  });

  it("F8: the same holds two subsections down, and the empty sibling branch is not enough", () => {
    const parsed = parse(
      doc(
        problemsSection({
          subject: RELATIVE_SUBJECT,
          subsections:
            problemsSection({}) +
            problemsSection({ subsections: problemsSection({ entries: problemEntry(1) }) }),
        }),
      ),
    );
    const found = overrides(parsed);

    expect(found).toHaveLength(1);
    expect(found[0]?.position.path).toBe("act");
    expect(parsed.problems).toHaveLength(0);
  });

  it("F8: a declaring section with an EMPTY nested subsection still gets its one instance", () => {
    const parsed = parse(
      doc(
        problemsSection({
          subject: RELATIVE_SUBJECT,
          subsections: problemsSection({}),
        }),
      ),
    );
    const found = overrides(parsed);

    expect(found).toHaveLength(1);
    expect(found[0]?.position.path).toBe("section");
  });
});

// ---------------------------------------------------------------------------
// A17, A18, A22: serializer, strict mode and narrative are unchanged in kind
// ---------------------------------------------------------------------------

describe("withholding is read-side only", () => {
  const xml = doc(
    problemsSection({
      subject: RELATIVE_SUBJECT,
      entries: problemEntry(1, { second: true }),
      narrative: `<paragraph>Essential hypertension, since 2021.</paragraph>`,
    }),
  );

  it("A17: every withheld entry re-serializes unchanged, and the round trip is a fixed point", () => {
    const parsed = parse(xml);
    const emitted = parsed.toString();

    expect(emitted).toContain("prob-act-1");
    expect(emitted).toContain("prob-obs-1b");
    expect(emitted).toContain("relatedSubject");
    expect(serializeCcda(parsed)).toBe(emitted);
    expect(parseCcda(emitted, { profile: null }).toString()).toBe(emitted);
  });

  it("A18: strict mode escalates it under the rule every Tier-2 warning already gets", () => {
    // The same document without the declaration is silent in both modes, so the
    // escalation below is this warning's and not something that came first.
    const quiet = doc(problemsSection({ entries: problemEntry(1, { second: true }) }));
    expect(parse(quiet).warnings).toHaveLength(0);
    expect(() => parseCcda(quiet, { profile: null, strict: true })).not.toThrow();

    expect(() => parseCcda(xml, { profile: null, strict: true })).toThrow(CcdaParseError);
    try {
      parseCcda(xml, { profile: null, strict: true });
      expect.unreachable("strict mode must escalate");
    } catch (err) {
      expect(err).toBeInstanceOf(CcdaParseError);
      expect((err as CcdaParseError).code as string).toBe(NEW_CODE);
    }
    // And no failure mode of its own: lenient mode still parses the document.
    expect(() => parse(xml)).not.toThrow();
  });

  it("A22: the section's narrative is untouched on every read path and in the emitted XML", () => {
    const control = doc(
      problemsSection({
        entries: problemEntry(1, { second: true }),
        narrative: `<paragraph>Essential hypertension, since 2021.</paragraph>`,
      }),
    );
    const parsed = parse(xml);
    const pin = parse(control);

    expect(parsed.sections[0]?.narrativeText).toBe(pin.sections[0]?.narrativeText);
    expect(parsed.findSection("problems")?.narrativeText).toBe(
      pin.findSection("problems")?.narrativeText,
    );
    expect(parsed.sections[0]?.narrativeById).toStrictEqual(pin.sections[0]?.narrativeById);
    expect(parsed.toString()).toContain("Essential hypertension, since 2021.");
  });
});

// ---------------------------------------------------------------------------
// A19 and F9, F10: the directly invoked extraction is not a bypass
// ---------------------------------------------------------------------------

describe("a directly invoked extraction withholds identically and reports on the same channel", () => {
  it("A19: a per-family extraction on an overridden section omits the entries and warns N times", () => {
    const xml = doc(
      problemsSection({
        subject: RELATIVE_SUBJECT,
        entries: problemEntry(1) + problemEntry(2) + problemEntry(3),
      }),
    );
    const sectionEl = sectionAt(xml, 0);
    const { ctx, seen } = recorder();

    expect(extractProblems(sectionEl, new Map(), ctx)).toHaveLength(0);
    expect(seen.filter((w) => w.code === NEW_CODE)).toHaveLength(3);
  });

  it("A19: a family that owns none of the governed entries reports the same N", () => {
    const xml = doc(
      problemsSection({ subject: RELATIVE_SUBJECT, entries: problemEntry(1) + problemEntry(2) }),
    );
    const sectionEl = sectionAt(xml, 0);
    const { ctx, seen } = recorder();

    // Allergies owns neither entry; the section still governs two of them.
    expect(extractAllergies(sectionEl, new Map(), ctx)).toHaveLength(0);
    expect(seen.filter((w) => w.code === NEW_CODE)).toHaveLength(2);
  });

  it("A19/F10: the aggregate invoked directly counts N per section, once", () => {
    const xml = doc(
      problemsSection({ subject: RELATIVE_SUBJECT, entries: problemEntry(1) + problemEntry(2) }) +
        medicationsSection({ subject: RELATIVE_SUBJECT, entries: medicationEntry(1) }),
    );
    const { body } = bodyElement(xml);
    const { ctx, seen } = recorder();
    const aggregate = extractClinical(body, ctx);

    expect(seen.filter((w) => w.code === NEW_CODE)).toHaveLength(3);
    expect(aggregate.problems).toHaveLength(0);
    expect(aggregate.medications).toHaveLength(0);
  });

  it("F9: a NESTED, non-declaring section passed directly withholds under its ancestor", () => {
    // The consumer calls the extractor on the subsection, never on the section
    // that declares. Governance is resolved from the element's ancestors, so the
    // direct path is not a bypass around the parsed document's answer.
    const xml = doc(
      problemsSection({
        subject: RELATIVE_SUBJECT,
        subsections: problemsSection({ entries: problemEntry(1) + problemEntry(2) }),
      }),
    );
    const nested = sectionAt(xml, 1);
    const { ctx, seen } = recorder();

    expect(extractProblems(nested, new Map(), ctx)).toHaveLength(0);
    expect(seen.filter((w) => w.code === NEW_CODE)).toHaveLength(2);
  });

  it("F11: buildDocument, the other public path onto the same slots, withholds too", () => {
    const xml = doc(problemsSection({ subject: RELATIVE_SUBJECT, entries: problemEntry(1) }));
    const { root } = bodyElement(xml);
    const { ctx, seen } = recorder();
    const parts = buildDocument(root, ctx);

    expect(parts.problems).toHaveLength(0);
    expect(seen.filter((w) => w.code === NEW_CODE)).toHaveLength(1);
  });

  it("A19: an unrelated section handed to an extractor is unaffected", () => {
    const xml = doc(problemsSection({ entries: problemEntry(1) }));
    const sectionEl = sectionAt(xml, 0);
    const { ctx, seen } = recorder();

    expect(extractProblems(sectionEl, new Map(), ctx)).toHaveLength(1);
    expect(seen.filter((w) => w.code === NEW_CODE)).toHaveLength(0);
    expect(extractMedications(sectionEl, new Map(), ctx)).toHaveLength(0);
  });

  it("F2: a direct extractFamilyHistory on a declaring section reports on the caller's channel", () => {
    // A19's antecedent is true of this function (it is a per-family extraction
    // invoked directly on a declaring section), and the carve-out is about its
    // CONTENTS. So the organizers come back whole and the caller is told.
    const entries =
      familyHistoryEntry(1, RELATIVE_SUBJECT) + familyHistoryEntry(2, "") + problemEntry(9);
    const xml = doc(familyHistorySection({ subject: RELATIVE_SUBJECT, entries }));
    const control = doc(familyHistorySection({ entries }));
    const sectionEl = sectionAt(xml, 0);
    const { ctx, seen } = recorder();

    const returned = extractFamilyHistory(sectionEl, new Map(), ctx);
    expect(returned).toHaveLength(2);
    expect(returned).toStrictEqual(
      extractFamilyHistory(sectionAt(control, 0), new Map(), recorder().ctx),
    );
    // The same N every other per-family extraction reports for this section:
    // organizer 2 and the problem concern act, never organizer 1 (A7).
    expect(seen.filter((w) => w.code === NEW_CODE)).toHaveLength(2);
    expect(extractProblems(sectionAt(xml, 0), new Map(), recorder().ctx)).toHaveLength(0);
    // And the document's own total is exactly what it was: the report is
    // memoized per (context, section), so the walk still counts each entry once.
    expect(overrides(parse(xml))).toHaveLength(2);
  });

  it("F2/A7: the same call on a section that declares nothing stays at zero", () => {
    const xml = doc(familyHistorySection({ entries: familyHistoryEntry(1, NULL_SUBJECT) }));
    const { ctx, seen } = recorder();

    expect(extractFamilyHistory(sectionAt(xml, 0), new Map(), ctx)).toHaveLength(1);
    expect(seen.filter((w) => w.code === NEW_CODE)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// F3: what else can still be said about a withheld entry
// ---------------------------------------------------------------------------

describe("the override warning is the only code that says whose data it is", () => {
  it("F3: a withheld entry still draws the diagnostics that read every entry", () => {
    // `flagMisplacedEntries` and the family-history extractor deliberately read
    // every entry, withheld or not, so both can still speak about one. Neither
    // says anything about whose data it is, and neither is safety-critical.
    // `src/profiles/safety.ts` says exactly this; the test is what keeps it true.
    const xml = doc(familyHistorySection({ subject: RELATIVE_SUBJECT, entries: problemEntry(1) }));
    const parsed = parse(xml);
    const codes = parsed.warnings.map((w) => w.code);

    expect(parsed.problems).toHaveLength(0);
    expect(codes).toContain(WARNING_CODES.SUBJECT_CONTEXT_OVERRIDE);
    expect(codes).toContain(WARNING_CODES.SECTION_PLACEMENT_SUSPECT);
    expect(SAFETY_CRITICAL_CODES.has(WARNING_CODES.SECTION_PLACEMENT_SUSPECT)).toBe(false);
  });

  it("F3: and the warnings that ride the withheld reading go quiet with it", () => {
    // The other half of the same claim: an entry a record-target extractor never
    // builds cannot draw that extractor's warnings, which is why this code is the
    // lone signal about the entry rather than one of several.
    const broken = `<reference value="#nowhere"/>`;
    const entries = problemEntry(1, { actSubject: RELATIVE_SUBJECT }).replace(
      '<statusCode code="completed"/>',
      `<statusCode code="completed"/><text>${broken}</text>`,
    );
    const withheld = parse(doc(problemsSection({ entries })));
    const returned = parse(
      doc(problemsSection({ entries: entries.replace(RELATIVE_SUBJECT, "") })),
    );

    expect(withheld.problems).toHaveLength(0);
    expect(withheld.warnings.map((w) => w.code)).not.toContain(
      WARNING_CODES.NARRATIVE_REFERENCE_BROKEN,
    );
    expect(returned.warnings.map((w) => w.code)).toContain(
      WARNING_CODES.NARRATIVE_REFERENCE_BROKEN,
    );
  });
});
