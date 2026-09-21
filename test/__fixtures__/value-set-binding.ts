/**
 * **Synthetic, PHI-free fixtures for the value-set binding checks.** Every value
 * here is invented or is a public terminology identifier: the canonical
 * synthetic patient ("Jane Doe", `MRN001`, the same one the other fixtures use),
 * invented document ids, and code symbols chosen for what they demonstrate. No
 * real patient record was read, anonymised or adapted to produce any of it.
 *
 * **Tier 2 of the three-tier corpus** (spec-clean, vendor-quirk, round-trip):
 * these documents are structurally spec-clean and carry the deviation this item
 * exists to detect, a coded value whose `@codeSystem` is exactly the one its
 * slot expects and whose symbol is outside the value set C-CDA R2.1 binds that
 * slot to. The structural tier says nothing about such a value: the system is
 * right, so no `UNEXPECTED_CODE_SYSTEM` fires, and a code-system-level
 * terminology adapter can confirm the code is real and still miss it.
 *
 * **The quirk is reproduced from its SHAPE, not from a captured message**
 * (`phi-safety` P2). The shape is the one a certifier reports and a receiving
 * system trips over: an RxNorm symbol in a medication product slot the template
 * binds to Medication Clinical Drug, and a CVX-system symbol in a vaccine slot
 * bound to the administered-vaccine set. Whether a given symbol really is in a
 * given published expansion is not asserted anywhere here and is not something
 * this package can know: membership is decided by the stub source a test
 * supplies, which is exactly how a consumer's own package decides it.
 *
 * The documents are assembled with this package's own builder rather than
 * hand-written XML, so every fixture is spec-clean by construction and no
 * hand-copied markup can drift from the serializer.
 */

import { buildCcda, serializeCcda, type BuildCcdaInit } from "../../src/index.js";

/** RxNorm, the code system the medication and allergen slots expect. */
export const RXNORM = "2.16.840.1.113883.6.88";
/** SNOMED CT, one of the two code systems the problem slot expects. */
export const SNOMED_CT = "2.16.840.1.113883.6.96";
/** NCI Thesaurus, the code system the route slot expects. */
export const NCI_ROUTE = "2.16.840.1.113883.3.26.1.1";
/** CVX, the code system the vaccine slot expects. */
export const CVX = "2.16.840.1.113883.12.292";

/**
 * The coded values the quirk fixture carries, one per checked slot, keyed by
 * slot so a test can name the code it expects a finding about without repeating
 * the literal.
 *
 * The display labels these are built with are illustrative fixture text. Nothing
 * here asserts that a symbol carries that meaning in its published system, or
 * that it is in or out of any published expansion: membership is the stub
 * source's answer, and that is the whole point of the contract under test.
 */
export const QUIRK_CODES = {
  problem: "38341003",
  medication: "29046",
  allergen: "7980",
  route: "C38288",
  vaccine: "88",
} as const;

/**
 * Distinctive sentinel symbols, one per checked slot: not codes any terminology
 * issues, and long enough that a four-byte fragment of one could not appear in a
 * registry message by accident. They exist so the PHI sweep can ask "did any
 * character the document supplied reach any field of any finding" and get an
 * answer that means something.
 */
export const SENTINEL_CODES = {
  problem: "QQSENTINELPROBLEMQQ",
  medication: "QQSENTINELMEDQQ",
  allergen: "QQSENTINELALLERGENQQ",
  route: "QQSENTINELROUTEQQ",
  vaccine: "QQSENTINELVACCINEQQ",
} as const;

/** Display labels, kept distinctive for the same reason the symbols are. */
const SENTINEL_DISPLAYS = {
  problem: "QQSENTINELDISPLAYPROBLEMQQ",
  medication: "QQSENTINELDISPLAYMEDQQ",
  allergen: "QQSENTINELDISPLAYALLERGENQQ",
  route: "QQSENTINELDISPLAYROUTEQQ",
  vaccine: "QQSENTINELDISPLAYVACCINEQQ",
} as const;

/** Which slot each fixture code belongs to. */
export type SlotCodes = Readonly<Record<keyof typeof QUIRK_CODES, string>>;

/**
 * Assemble a CCD carrying one coded value at each of the five checked slots,
 * every one in the code system its slot expects.
 *
 * `effectiveTime` is pinned so two builds of the same input serialize
 * byte-for-byte: several assertions compare one parse against another and a
 * `new Date()` stamp at second resolution turns those into a race.
 */
function documentFor(codes: SlotCodes, displays: SlotCodes): string {
  const init: BuildCcdaInit = {
    effectiveTime: "20240101120000+0000",
    patient: { mrn: "MRN001", given: ["Jane"], family: "Doe", gender: "F" },
    problems: [
      {
        problem: { code: codes.problem, codeSystem: SNOMED_CT, displayName: displays.problem },
        status: "active",
      },
    ],
    medications: [
      {
        drug: { code: codes.medication, codeSystem: RXNORM, displayName: displays.medication },
        dose: { value: 1, unit: "{tablet}" },
        route: { code: codes.route, codeSystem: NCI_ROUTE, displayName: displays.route },
      },
    ],
    allergies: [
      {
        allergen: { code: codes.allergen, codeSystem: RXNORM, displayName: displays.allergen },
        status: "active",
      },
    ],
    immunizations: [
      {
        vaccine: { code: codes.vaccine, codeSystem: CVX, displayName: displays.vaccine },
        effectiveTime: "20240101",
      },
    ],
  };
  return serializeCcda(buildCcda(init));
}

/**
 * **Tier 2.** The vendor-quirk document: spec-clean structure, every slot coded
 * in the system its slot expects, and the symbols are the ones a test's stub
 * source reports outside the bound value set.
 */
export function quirkDocument(): string {
  return documentFor(QUIRK_CODES, {
    problem: "Hypertensive disorder",
    medication: "Lisinopril",
    allergen: "Penicillin G",
    route: "Oral route",
    vaccine: "Influenza vaccine",
  });
}

/**
 * The same document with a distinctive sentinel at every coded slot, symbol and
 * display alike, for the PHI sweep over every field of every finding.
 */
export function sentinelDocument(): string {
  return documentFor(SENTINEL_CODES, SENTINEL_DISPLAYS);
}

/** Every sentinel string planted in {@link sentinelDocument}, symbols and displays. */
export const ALL_SENTINELS: readonly string[] = [
  ...Object.values(SENTINEL_CODES),
  ...Object.values(SENTINEL_DISPLAYS),
];
