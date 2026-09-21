import { describe, expect, it } from "vitest";

import {
  TIER1_AUTHORED,
  TIER1_DISCHARGE,
  TIER2_BARE_AUTHOR,
  TIER2_CONTRADICTORY_ENTRY_ID,
  TIER2_MALFORMED,
  TIER2_NO_AUTHOR,
  TIER2_NO_COMPONENT_OF,
  TIER2_UNCLAIMED_ENTRY_ID,
  TIER2_UNIDENTIFIED,
  TIER2_UNREADABLE_TIMES,
  TIER3_ROUND_TRIP,
} from "../__fixtures__/header-participations.js";
import { parseCcda, WARNING_CODES } from "../../src/index.js";
import { ALL_WARNING_MESSAGES, WARNING_MESSAGES } from "../../src/parser/warnings.js";
import type { CcdaAuthor, CcdaSection } from "../../src/index.js";

/**
 * The US Realm header PARTICIPATIONS: who authored a document, a section and a
 * top-level entry act, who has custody of it, and which encounter it summarises.
 *
 * Every test names the acceptance criterion it grades. The corpus is the three
 * tiers: spec-clean documents (AC-1 to AC-3), the vendor quirks and unhappy
 * paths those imply (AC-4 to AC-9), and re-serialization plus the published
 * warning registry (AC-10, AC-11).
 */

/** The family name of a reading's first author, the shortest observable identity. */
function firstFamily(authors: readonly CcdaAuthor[] | undefined): string | undefined {
  return authors?.[0]?.person?.family;
}

/** A named section from a parsed document, asserted present so a test reads one object. */
function section(xml: string, key: string): CcdaSection {
  const found = parseCcda(xml).findSection(key);
  expect(found, `no "${key}" section in the fixture`).toBeDefined();
  return found as CcdaSection;
}

describe("AC-1: document-level author and custodian are surfaced", () => {
  const doc = parseCcda(TIER1_AUTHORED);

  it("AC-1: surfaces every author in document order", () => {
    const authors = doc.header.authorship?.authors ?? [];
    expect(authors).toHaveLength(2);
    expect(authors[0]?.person?.family).toBe("Lirio");
    expect(authors[0]?.person?.given).toStrictEqual(["Avery"]);
    // The second is the DEVICE arm of the assignedAuthor choice, and it is second
    // because the document put it second.
    expect(authors[1]?.person).toBeUndefined();
    expect(authors[1]?.device?.manufacturerModelName).toBe("cosyte");
    expect(authors[1]?.device?.softwareName).toBe("@cosyte/ccda");
  });

  it("AC-1: surfaces each author's identifiers", () => {
    const authors = doc.header.authorship?.authors ?? [];
    expect(authors[0]?.identifiers).toStrictEqual([
      { root: "2.16.840.1.113883.4.6", extension: "NPI-SYNTH-1" },
    ]);
    expect(authors[1]?.identifiers).toStrictEqual([
      { root: "2.16.840.1.113883.19.5.99999.5", extension: "DEVICE-1" },
    ]);
  });

  it("AC-1: surfaces the represented organization the document states", () => {
    const org = doc.header.authorship?.authors[0]?.representedOrganization;
    expect(org?.name).toBe("Synthetic Cardiology Practice");
    expect(org?.identifiers).toStrictEqual([{ root: "2.16.840.1.113883.19.5.99999.3" }]);
  });

  it("AC-1: keeps the author time at exactly the precision the document stated", () => {
    const authors = doc.header.authorship?.authors ?? [];
    // Full precision with an offset, and a day-precision time on the second
    // author. Each `raw` is the document's own characters; neither is rewritten
    // to the other's precision.
    expect(authors[0]?.time?.raw).toBe("20240301103000-0500");
    expect(authors[0]?.time?.date?.toISOString()).toBe("2024-03-01T15:30:00.000Z");
    expect(authors[1]?.time?.raw).toBe("20240301");
  });

  it("AC-1: surfaces the custodian organization with its identifiers and its name", () => {
    expect(doc.header.custodian?.organization?.name).toBe("Synthetic Health Organization");
    expect(doc.header.custodian?.organization?.identifiers).toStrictEqual([
      { root: "2.16.840.1.113883.19.5.99999.4", extension: "ORG-1" },
    ]);
  });

  it("AC-1: reports a document-level reading as the document's own, never inherited", () => {
    expect(doc.header.authorship?.inherited).toBe(false);
  });
});

describe("AC-2: an author reading is conducted to a section and to a top-level entry act", () => {
  it("AC-2: a section with its own author reports it and is NOT marked inherited", () => {
    const allergies = section(TIER1_AUTHORED, "allergies");
    expect(firstFamily(allergies.authorship?.authors)).toBe("Okonkwo");
    expect(allergies.authorship?.inherited).toBe(false);
  });

  it("AC-2: a section with no author of its own reports the document's, marked inherited", () => {
    const problems = section(TIER1_AUTHORED, "problems");
    expect(firstFamily(problems.authorship?.authors)).toBe("Lirio");
    expect(problems.authorship?.inherited).toBe(true);
    // The whole enclosing reading is carried down, not just its first author.
    expect(problems.authorship?.authors).toHaveLength(2);
  });

  it("AC-2: an entry act with its own author reports it and is NOT marked inherited", () => {
    const problems = section(TIER1_AUTHORED, "problems");
    const authored = problems.entryAuthorship?.[0];
    expect(firstFamily(authored?.authorship?.authors)).toBe("Revel");
    expect(authored?.authorship?.inherited).toBe(false);
  });

  it("AC-2: an entry act with no author reports the nearest enclosing one, marked inherited", () => {
    const problems = section(TIER1_AUTHORED, "problems");
    const plain = problems.entryAuthorship?.[1];
    // The Problems section states no author either, so the nearest enclosing
    // level that does is the document.
    expect(firstFamily(plain?.authorship?.authors)).toBe("Lirio");
    expect(plain?.authorship?.inherited).toBe(true);
  });

  it("AC-2: the nearest enclosing level wins over a further one", () => {
    // The Allergies section states Okonkwo while the document states Lirio, so a
    // reading conducted from the section must be Okonkwo's and not the
    // document's. Proved on the round-trip fixture, whose Problems section also
    // carries its own author, so its entry with no author of its own inherits
    // the SECTION's rather than the document's.
    const problems = section(TIER3_ROUND_TRIP, "problems");
    expect(firstFamily(problems.authorship?.authors)).toBe("Okonkwo");
    expect(problems.authorship?.inherited).toBe(false);
    const plain = problems.entryAuthorship?.[1];
    expect(firstFamily(plain?.authorship?.authors)).toBe("Okonkwo");
    expect(plain?.authorship?.inherited).toBe(true);
  });

  it("AC-2: an entry reading carries the act's ids, so it joins to an extracted entry", () => {
    const parsed = parseCcda(TIER1_AUTHORED);
    const problems = parsed.findSection("problems");
    expect(problems?.entryAuthorship?.map((e) => e.ids[0]?.extension)).toStrictEqual([
      "prob-act-authored",
      "prob-act-plain",
    ]);
    // The same ids the extracted Problem Concern Acts carry, in the same order.
    expect(parsed.getProblems().map((c) => c.ids[0]?.extension)).toStrictEqual([
      "prob-act-authored",
      "prob-act-plain",
    ]);
  });
});

/**
 * The conduction AC-2 requires reads each top-level entry act's `<id>`s, so a
 * consumer can join the reading to an extracted entry. Reading them must not
 * change what the document REPORTS: the entry-extraction walk parses those same
 * elements, the emitter deduplicates nothing, and the item's scope is the
 * READING, so a document carrying no author at all has to come out of the parser
 * saying exactly what it said before. Framing is therefore a non-emitting read
 * of those ids, and these three tests are what holds it there.
 */
describe("AC-2: framing an entry act leaves the warning output for its ids unchanged", () => {
  it("AC-2: a contradictory entry-act id is reported once, not once per reader", () => {
    const parsed = parseCcda(TIER2_CONTRADICTORY_ENTRY_ID);
    // Exactly one warning, from the extraction walk that reads the `<id>` for
    // its value. Two would be one deviation reported twice, and this one is
    // safety-critical.
    expect(parsed.warnings.map((w) => w.code)).toStrictEqual([
      WARNING_CODES.CONTRADICTORY_NULL_FLAVOR,
    ]);
    // And the reading still carries the act's ids, which is the join key AC-2
    // needs: the second parse is gone, not the values it produced.
    expect(
      parsed.findSection("problems")?.entryAuthorship?.map((e) => e.ids[0]?.extension),
    ).toStrictEqual(["prob-act-plain"]);
  });

  it("AC-2: an id deviation on an act no extractor family claims stays unreported", () => {
    const parsed = parseCcda(TIER2_UNCLAIMED_ENTRY_ID);
    expect(parsed.warnings.map((w) => w.code)).toStrictEqual([]);
    // The act is still framed and its id still read verbatim, `nullFlavor` and
    // all; only the emitting parse of it is absent.
    const reading = parsed.findSection("problems")?.entryAuthorship;
    expect(reading).toHaveLength(1);
    expect(reading?.[0]?.ids[0]?.nullFlavor).toBe("NOT-A-NULL-FLAVOR");
  });

  it("AC-2: strict mode still parses a document whose only deviation nothing reads", () => {
    // Strict mode escalates the first warning it is handed into a
    // CcdaParseError, so a warning raised where none was raised before turns a
    // document that parsed into one that throws.
    expect(() => parseCcda(TIER2_UNCLAIMED_ENTRY_ID, { strict: true })).not.toThrow();
  });
});

describe("AC-3: componentOf/encompassingEncounter is surfaced on the header", () => {
  const doc = parseCcda(TIER1_DISCHARGE);

  it("AC-3: surfaces both effectiveTime bounds at the precision the document stated", () => {
    const period = doc.header.encompassingEncounter?.effectiveTime;
    expect(period?.low?.raw).toBe("20240228080000-0500");
    expect(period?.low?.date?.toISOString()).toBe("2024-02-28T13:00:00.000Z");
    // Day precision on the high bound, kept as day precision.
    expect(period?.high?.raw).toBe("20240302");
    expect(period?.high?.date?.toISOString()).toBe("2024-03-02T00:00:00.000Z");
  });

  it("AC-3: surfaces the dischargeDispositionCode with code, code system and display name", () => {
    expect(doc.header.encompassingEncounter?.dischargeDispositionCode).toStrictEqual({
      code: "01",
      codeSystem: "2.16.840.1.113883.12.112",
      codeSystemName: "HL7 Discharge Disposition",
      displayName: "Discharged to home care or self care",
    });
  });
});

describe("AC-4: an author identifying nobody is present, not omitted", () => {
  const doc = parseCcda(TIER2_UNIDENTIFIED);

  it("AC-4: surfaces the author marked unidentified rather than dropping it", () => {
    const authors = doc.header.authorship?.authors ?? [];
    expect(authors).toHaveLength(1);
    expect(authors[0]?.unidentified).toBe(true);
    expect(authors[0]?.person).toBeUndefined();
    expect(authors[0]?.device).toBeUndefined();
    // What the participation DID carry is still read.
    expect(authors[0]?.identifiers[0]?.extension).toBe("NPI-SYNTH-9");
    expect(authors[0]?.representedOrganization?.name).toBe("Synthetic Cardiology Practice");
  });

  it("AC-4: an author carrying no assignedAuthor at all takes the same reading", () => {
    // The emptier shape has to be the louder one, not the quieter one: an
    // `<author>` with nothing inside it identifies nobody either.
    const bare = parseCcda(TIER2_BARE_AUTHOR);
    const authors = bare.header.authorship?.authors ?? [];
    expect(authors).toHaveLength(1);
    expect(authors[0]?.unidentified).toBe(true);
    expect(authors[0]?.person).toBeUndefined();
    expect(authors[0]?.device).toBeUndefined();
    expect(authors[0]?.identifiers).toStrictEqual([]);
    // What it DID carry is still read.
    expect(authors[0]?.time?.raw).toBe("20240301");
    expect(bare.warnings.filter((w) => w.code === WARNING_CODES.UNIDENTIFIED_AUTHOR)).toHaveLength(
      1,
    );
  });

  it("AC-4: an identified author is NOT marked unidentified", () => {
    const identified = parseCcda(TIER1_AUTHORED).header.authorship?.authors ?? [];
    expect(identified.map((a) => a.unidentified)).toStrictEqual([false, false]);
  });

  it("AC-4: the unidentified author is not omitted from a reading inherited from it", () => {
    const problems = section(TIER2_UNIDENTIFIED, "problems");
    expect(problems.authorship?.inherited).toBe(true);
    expect(problems.authorship?.authors[0]?.unidentified).toBe(true);
    const plain = problems.entryAuthorship?.[1];
    expect(plain?.authorship?.inherited).toBe(true);
    expect(plain?.authorship?.authors[0]?.unidentified).toBe(true);
  });
});

describe("AC-5: the unidentified reading is declared with a stable code", () => {
  it("AC-5: emits UNIDENTIFIED_AUTHOR with a CcdaPosition locating it", () => {
    const found = parseCcda(TIER2_UNIDENTIFIED).warnings.filter(
      (w) => w.code === WARNING_CODES.UNIDENTIFIED_AUTHOR,
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.position.path).toBe("author");
    expect(typeof found[0]?.position.line).toBe("number");
  });

  it("AC-5: the message is the frozen registry entry whole, interpolating nothing", () => {
    const found = parseCcda(TIER2_UNIDENTIFIED).warnings.find(
      (w) => w.code === WARNING_CODES.UNIDENTIFIED_AUTHOR,
    );
    expect(found?.message).toBe(WARNING_MESSAGES.UNIDENTIFIED_AUTHOR);
    expect(ALL_WARNING_MESSAGES.has(found?.message ?? "")).toBe(true);
  });

  it("AC-5: the message carries nothing the document said", () => {
    // Every token the fixture's unidentified participation carries. None may
    // appear in the message, which is what makes the message PHI-free by
    // construction rather than by the caller's good behaviour.
    const fromDocument = [
      "NPI-SYNTH-9",
      "Synthetic Cardiology Practice",
      "2.16.840.1.113883.4.6",
      "Jane",
      "Doe",
    ];
    const message = WARNING_MESSAGES.UNIDENTIFIED_AUTHOR;
    for (const token of fromDocument) expect(message).not.toContain(token);
  });

  it("AC-5: a document whose authors are all identified emits none of it", () => {
    const codes = parseCcda(TIER1_AUTHORED).warnings.map((w) => w.code);
    expect(codes).not.toContain(WARNING_CODES.UNIDENTIFIED_AUTHOR);
  });
});

describe("AC-6: no author anywhere means no author reading anywhere", () => {
  const parsed = parseCcda(TIER2_NO_AUTHOR);

  it("AC-6: the reading is absent at the document, the section and the entry", () => {
    expect(parsed.header.authorship).toBeUndefined();
    const problems = parsed.findSection("problems");
    expect(problems?.authorship).toBeUndefined();
    expect(problems?.entryAuthorship).toHaveLength(2);
    for (const entry of problems?.entryAuthorship ?? []) {
      expect(entry.authorship).toBeUndefined();
    }
  });

  it("AC-6: substitutes neither the record target, the custodian, the authenticator nor an informant", () => {
    // Every one of those four is present in this document and names an entity.
    expect(parsed.getPatient()?.name?.family).toBe("Doe");
    expect(parsed.header.custodian?.organization?.name).toBe("Synthetic Health Organization");
    expect(TIER2_NO_AUTHOR).toContain("<legalAuthenticator>");
    expect(TIER2_NO_AUTHOR).toContain("<informant>");
    // And the author reading is still absent, at every level, rather than one of them.
    expect(JSON.stringify(parsed.header.authorship ?? null)).toBe("null");
    expect(parsed.findSection("problems")?.authorship).toBeUndefined();
  });
});

describe("AC-7: an unreadable time is reported unreadable, never completed", () => {
  const doc = parseCcda(TIER2_UNREADABLE_TIMES);

  it("AC-7: a partial author time stays partial and is not completed", () => {
    const first = doc.header.authorship?.authors[0]?.time;
    expect(first?.raw).toBe("2024");
    // A year-precision value resolves to the first instant of the stated
    // precision; what must never happen is `raw` being rewritten to a fuller one.
    expect(first?.raw).not.toContain("0101");
    expect(first?.date?.toISOString()).toBe("2024-01-01T00:00:00.000Z");
  });

  it("AC-7: a garbage author time keeps its verbatim value and yields no date", () => {
    const second = doc.header.authorship?.authors[1]?.time;
    expect(second?.raw).toBe("03/01/2024");
    expect(second?.date).toBeUndefined();
    expect(doc.warnings.map((w) => w.code)).toContain(WARNING_CODES.MALFORMED_DATETIME);
  });

  it("AC-7: an encounter bound carrying a nullFlavor carries it rather than a date", () => {
    const period = doc.header.encompassingEncounter?.effectiveTime;
    expect(period?.low?.nullFlavor).toBe("UNK");
    expect(period?.low?.raw).toBeUndefined();
    expect(period?.low?.date).toBeUndefined();
    // The readable bound beside it is unaffected.
    expect(period?.high?.raw).toBe("20240302");
  });
});

describe("AC-8: no componentOf means no encounter frame", () => {
  const doc = parseCcda(TIER2_NO_COMPONENT_OF);

  it("AC-8: the header carries no encounter frame at all", () => {
    expect(doc.header.encompassingEncounter).toBeUndefined();
  });

  it("AC-8: the bounds are not derived from documentationOf or the document effectiveTime", () => {
    // Both are present in this document and both carry dates.
    expect(doc.header.effectiveTime?.raw).toBe("20240305");
    expect(TIER2_NO_COMPONENT_OF).toContain('<low value="20200101"/>');
    // And no frame was manufactured from either.
    expect(doc.header.encompassingEncounter).toBeUndefined();
    expect(JSON.stringify(doc.header)).not.toContain("encompassingEncounter");
  });
});

describe("AC-9: a malformed participation subtree surfaces what is readable and never throws", () => {
  it("AC-9: parses without throwing", () => {
    expect(() => parseCcda(TIER2_MALFORMED)).not.toThrow();
  });

  const doc = parseCcda(TIER2_MALFORMED);

  it("AC-9: a custodian with no assignedCustodian is present with no organization", () => {
    expect(doc.header.custodian).toBeDefined();
    expect(doc.header.custodian?.organization).toBeUndefined();
  });

  it("AC-9: an author whose children are out of sequence is read by name, not by position", () => {
    const first = doc.header.authorship?.authors[0];
    expect(first?.person?.family).toBe("Lirio");
    expect(first?.representedOrganization?.name).toBe("Synthetic Cardiology Practice");
    expect(first?.identifiers[0]?.extension).toBe("NPI-SYNTH-1");
    expect(first?.time?.raw).toBe("20240301");
    expect(first?.unidentified).toBe(false);
  });

  it("AC-9: more than one author at one level surfaces both, in document order", () => {
    expect(doc.header.authorship?.authors.map((a) => a.person?.family)).toStrictEqual([
      "Lirio",
      "Okonkwo",
    ]);
  });

  it("AC-9: an encompassingEncounter with no effectiveTime is present with no period", () => {
    expect(doc.header.encompassingEncounter).toBeDefined();
    expect(doc.header.encompassingEncounter?.effectiveTime).toBeUndefined();
    expect(doc.header.encompassingEncounter?.dischargeDispositionCode).toBeUndefined();
  });
});

/**
 * AC-10's observable is the registry asserted ENTRY BY ENTRY, not the suite's
 * colour. This table is the `WARNING_MESSAGES` registry as it stood before the
 * change that added `UNIDENTIFIED_AUTHOR`, transcribed from the committed
 * module rather than read back out of the implementation, so a renamed code, a
 * removed one or a message whose meaning moved fails here by name.
 */
const PUBLISHED_WARNING_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  ALLERGEN_GRANULARITY_SUSPECT:
    "Allergen appears coded at product level where an ingredient-level concept is expected; granularity flagged.",
  CODE_NARRATIVE_MISMATCH:
    "A coded value and its referenced narrative disagree; both preserved, no winner chosen.",
  CONTRADICTORY_NULL_FLAVOR:
    "The element declares a nullFlavor and asserts a value at the same time; the document contradicts itself, so the value is preserved verbatim but never read as the field's value.",
  DEPRECATED_CODE_SYSTEM:
    "The code system OID is deprecated for this slot; prefer its modern successor. Value preserved.",
  DEPRECATED_LOINC:
    "The observation's LOINC code is deprecated; prefer its current successor. Code preserved.",
  ENCODING_BOM_STRIPPED: "A UTF-8 byte-order mark was stripped from the head of the input.",
  FREE_TEXT_REFERENCE_RANGE:
    "Reference range is free text, not a structured low/high interval; preserved as text, not numerically comparable.",
  IMMUNIZATION_REFUSED:
    'Immunization activity carries negationInd="true" (vaccine not administered / refused); modeled as refused, never as given.',
  INVALID_NULL_FLAVOR:
    "The nullFlavor token is not in the HL7 v3 NullFlavor code system; preserved verbatim.",
  MALFORMED_DATETIME:
    "Value does not match the HL7 v3 TS datetime shape; raw preserved, parsed date left undefined.",
  MEDICATION_PRODUCT_ARM_CONFLICT:
    "manufacturedProduct carries arms (manufacturedMaterial / manufacturedLabeledDrug, including repeated ones) whose codings name different products, counting each arm's <translation> alternates: they share no coding, or, where both arms name their product only through translations, each also names a coding the other does not and two of those are in the same code system under different symbols. The document contradicts itself and nothing in it ranks the arms, so no product code is selected (every arm survives serialization verbatim).",
  MEDICATION_PRODUCT_ARM_REPEATED:
    "manufacturedProduct carries more than one arm of the same kind (manufacturedMaterial or manufacturedLabeledDrug), which CDA R2 models as a choice of one participant; the repeat is reported rather than absorbed, and whether the repeated arms agree is answered separately by MEDICATION_PRODUCT_ARM_CONFLICT.",
  MEDICATION_PRODUCT_ARM_UNEXPECTED:
    "manufacturedProduct carries the manufacturedLabeledDrug arm, which C-CDA's medication templates are not written around; the arm is flagged, and unless a companion warning says the product was withheld (MEDICATION_PRODUCT_ARM_CONFLICT), absent (MISSING_PRODUCT_CODE) or unnamed (MISSING_CODE_VALUE) the product code was read and checked as usual.",
  MEDICATION_PRODUCT_CODE_REPEATED:
    "The product arm at this position carries more than one <code>, which CDA R2 models as at most one per arm; the repeat is reported rather than absorbed, every <code> on the arm is compared, and whether they agree is answered separately by MEDICATION_PRODUCT_ARM_CONFLICT. No <code> after the first on an arm is ever selected as the product.",
  MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY:
    "No manufacturedProduct arm's lead <code> asserts a primary @code, and the product is named in a <translation> alternate at this position; selection reads each arm's lead <code> only, and translations are preserved and re-serialized but are never slot-checked, so no product code is selected.",
  MISSING_ASSIGNING_AUTHORITY: "Patient identifier has a root OID but no assigningAuthorityName.",
  MISSING_CODE_SYSTEM:
    "The coded value has a @code but no @codeSystem, so the symbol names no terminology; value preserved verbatim, system never inferred, and terminology validation is impossible for it.",
  MISSING_CODE_VALUE:
    "The coded value is present but asserts no @code and no @nullFlavor, so nothing distinguishes an absent concept from a lost one; value preserved verbatim, no code inferred.",
  MISSING_DOSE_QUANTITY:
    "Medication activity has no doseQuantity; dose preserved as absent, never defaulted.",
  MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME:
    "A Planned Medication Activity was just written with no effectiveTime, which the template makes a SHALL (exactly one, CONF:1098-30468): the caller supplied none and this library never fabricates a date, so the act is emitted short that element and says nothing about when the drug is to be given. Only content the emitting call itself wrote is checked, so the absence of this warning says nothing about sections that call did not write.",
  MISSING_PRODUCT_CODE:
    "Substance administration has no coded product on any manufacturedProduct arm the parser reads; the product is preserved as absent, never inferred from narrative or from the entry's other fields.",
  MISSING_ROUTE_CODE:
    "Medication activity has no routeCode; route preserved as absent, never defaulted.",
  MISSING_SELF_CARE_ACTIVITY:
    "A Functional Status Organizer was asked for with no Self-Care Activities (ADL and IADL) observation, which its template SHALL contain at least one of (CONF:1098-31432): this library never fabricates an assessment nobody performed and never claims a template a document does not satisfy, so the organizer was not written and its findings were written as standalone Functional Status Observations instead. Every finding is in the document and reads back unchanged; the grouping, its categorization code and its effectiveTime are not. Supply at least one self-care activity to have the organizer written.",
  MISSING_TEMPLATE_ID: "The element carries no templateId; recognition fell back to other signals.",
  MISSING_UNIT_ON_PQ:
    "Physical-quantity value has a numeric value but no @unit; preserved as dimensionless, never defaulted.",
  MULTIPLE_EFFECTIVE_TIMES_UNRESOLVED:
    "The medication carries effectiveTime siblings that could not be classified as duration vs frequency; all preserved.",
  MULTIPLE_RECORD_TARGETS:
    "ClinicalDocument carries more than one recordTarget element; getPatient() resolves the first and header.recordTargets carries them all.",
  NARRATIVE_REFERENCE_BROKEN:
    "The narrative reference does not resolve to any ID in the section narrative.",
  NEGATION_VS_NULLFLAVOR_AMBIGUOUS:
    'Act carries both negationInd="true" and a nullFlavor; modeled as distinct fields, not collapsed.',
  NON_UCUM_UNIT:
    "The @unit is not a well-formed UCUM unit; unit and value preserved verbatim, never normalized.",
  PLANNED_VS_PERFORMED_AMBIGUOUS:
    "Procedure entry has no moodCode; performed (EVN) vs planned (INT) is ambiguous, never conflated, left unclassified.",
  PLAN_ENTRY_NOT_MODELED:
    "An entry template the Plan of Treatment reading admits was found where planned items are read (a section entry, or an act nested in a Planned Intervention Act); this parser recognizes it but does not model it as a planned item, so it is excluded from getPlannedItems(), reaches no other model field, and survives only in the re-serialized document.",
  PROBLEM_STATUS_INDETERMINATE:
    "Problem concern statusCode is missing or unrecognized; active/resolved state is indeterminate.",
  PROCEDURE_MOOD_UNEXPECTED:
    "The procedure's moodCode is neither a performed (EVN) nor a recognized planned mood; extracted but unclassified.",
  PROFILE_QUIRK_APPLIED:
    "An active profile expected this deviation and downgraded it; the deviation's own code is on `toleratedCode`, the tolerating profile on `profile`, and `expected` is set.",
  REQUIRED_SECTIONS_NOT_EVALUATED:
    "The document type's required-section (SHALL) obligations were not evaluated: the templateId that resolved the type names a C-CDA release this library does not model, and the R2.1-scoped tables here do not reach it. No REQUIRED_SECTION_MISSING is reported for this document, and the absence of one says nothing about which sections it carries.",
  REQUIRED_SECTION_MISSING:
    "The document type requires a section (SHALL) that was not found; parsed without it. missingRequiredSections() names the full set.",
  RESULT_VALUE_TYPE_UNHANDLED:
    "The observation value's xsi:type is not specialized; raw value preserved as unsupported.",
  SECTION_MATCHED_BY_LOINC_FALLBACK:
    "Section identified by its LOINC code fallback (no recognized templateId present).",
  SECTION_PLACEMENT_SUSPECT:
    "An entry template was found in a section it does not belong to; extracted but flagged.",
  SEMANTIC_CODE_INVALID:
    "The supplied terminology adapter reports the code is not a valid member of its system; code preserved verbatim, never coerced.",
  SMOKING_STATUS_CODE_UNRECOGNIZED:
    "The smoking status code is not in the recognized Smoking Status value set; preserved verbatim.",
  SMOKING_STATUS_UNKNOWN:
    'Smoking status is recorded as unknown (nullFlavor or an "unknown" SNOMED concept); preserved, flagged as unknown.',
  SUBJECT_CONTEXT_OVERRIDE:
    "A subject declaration governs clinical content here. CDA R2 makes a subject the primary target of the statements it governs, so the content it governs is not the document's record target's own; it is withheld from every read path that promises the record target's data rather than attributed to that patient, and it survives unchanged in the re-serialized document. What the declaration names is never compared with the record target.",
  TEMPLATE_EXTENSION_ABSENT:
    "The recognized templateId carries no @extension version stamp; matched by root alone (may pre-date R2.1).",
  TEMPLATE_EXTENSION_UNMODELED_RELEASE:
    "The recognized templateId carries an @extension version stamp this library does not model; these conformance tables target C-CDA R2.1, so the document is parsed leniently, nothing is refused, and no R2.1-scoped required-section claim is made about it.",
  UCUM_CASE_SUSPECT:
    "The @unit looks like a letter-case slip of a canonical UCUM unit; value preserved, review the casing.",
  UNEXPECTED_CODE_SYSTEM: "The code system OID is not expected for this slot; value preserved.",
  UNKNOWN_DOCUMENT_TEMPLATE:
    "The root templateId set names no recognized C-CDA R2.1 document type; parsed as a generic ClinicalDocument.",
  UNKNOWN_NAMESPACE_PREFIX:
    "An element outside the recognized v3/xsi/sdtc namespaces, or in no namespace at all, was found; the node is retained and reported once per distinct namespace.",
  UNKNOWN_SECTION_CODE:
    "The section's LOINC code is not a recognized C-CDA section; retained as narrative-only.",
});

describe("AC-10: adding a code leaves every published code and message untouched", () => {
  it("AC-10: every previously published code is still present under its existing name", () => {
    for (const code of Object.keys(PUBLISHED_WARNING_MESSAGES)) {
      expect(
        Object.prototype.hasOwnProperty.call(WARNING_CODES, code),
        `${code} was renamed or removed from WARNING_CODES`,
      ).toBe(true);
      expect(WARNING_CODES[code as keyof typeof WARNING_CODES]).toBe(code);
    }
  });

  it("AC-10: every previously published message is unchanged character for character", () => {
    for (const [code, message] of Object.entries(PUBLISHED_WARNING_MESSAGES)) {
      expect(
        WARNING_MESSAGES[code as keyof typeof WARNING_MESSAGES],
        `${code}'s message text moved`,
      ).toBe(message);
    }
  });

  it("AC-10: the only difference from the published registry is the added code", () => {
    // The list grows by ADDITION only, and each entry names the change that put
    // it here. `PUBLISHED_WARNING_MESSAGES` is the registry as published at
    // 0.0.15; every code below post-dates it. The two value-set codes arrived
    // with the bring-your-own value-set source (a Required binding's value set
    // does not contain the code, and the supplied source holds no expansion for
    // that value set). Nothing was renamed, removed or repurposed, which is
    // what the two assertions above and the `removed` check below still pin.
    const published = new Set(Object.keys(PUBLISHED_WARNING_MESSAGES));
    const added = Object.keys(WARNING_CODES).filter((code) => !published.has(code));
    expect(added).toStrictEqual([
      "UNIDENTIFIED_AUTHOR",
      "VALUE_SET_BINDING_VIOLATED",
      "VALUE_SET_BINDING_NOT_EVALUATED",
    ]);
    const removed = [...published].filter(
      (code) => !Object.prototype.hasOwnProperty.call(WARNING_CODES, code),
    );
    expect(removed).toStrictEqual([]);
  });
});

describe("AC-11: a document carrying all three participations re-serializes identically", () => {
  it("AC-11: parseCcda(doc.toString()).toString() === doc.toString()", () => {
    const doc = parseCcda(TIER3_ROUND_TRIP);
    const once = doc.toString();
    expect(parseCcda(once).toString()).toBe(once);
  });

  it("AC-11: the re-parsed document reports the same participation readings", () => {
    const doc = parseCcda(TIER3_ROUND_TRIP);
    const again = parseCcda(doc.toString());
    expect(again.header.authorship?.authors.map((a) => a.person?.family)).toStrictEqual(
      doc.header.authorship?.authors.map((a) => a.person?.family),
    );
    expect(again.header.custodian?.organization?.name).toBe(
      doc.header.custodian?.organization?.name,
    );
    expect(again.header.encompassingEncounter?.effectiveTime?.low?.raw).toBe(
      doc.header.encompassingEncounter?.effectiveTime?.low?.raw,
    );
  });
});
