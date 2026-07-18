import { describe, expect, it } from "vitest";
import { sortedCodeSet } from "@cosyte/test-utils";

import { WARNING_CODES, FATAL_CODES } from "../src/index.js";

/**
 * The warning + fatal code surface is part of the public contract — consumers
 * branch on `w.code`, so adding/removing/renaming a code is a reviewable event.
 * These inline snapshots turn any such change into a failing diff.
 */
describe("code surface stability", () => {
  it("warning codes are stable", () => {
    expect(sortedCodeSet(WARNING_CODES)).toMatchInlineSnapshot(`
      [
        "ALLERGEN_GRANULARITY_SUSPECT",
        "CODE_NARRATIVE_MISMATCH",
        "DEPRECATED_CODE_SYSTEM",
        "DEPRECATED_LOINC",
        "ENCODING_BOM_STRIPPED",
        "FREE_TEXT_REFERENCE_RANGE",
        "IMMUNIZATION_REFUSED",
        "INVALID_NULL_FLAVOR",
        "MALFORMED_DATETIME",
        "MISSING_ASSIGNING_AUTHORITY",
        "MISSING_DOSE_QUANTITY",
        "MISSING_ROUTE_CODE",
        "MISSING_TEMPLATE_ID",
        "MISSING_UNIT_ON_PQ",
        "MULTIPLE_EFFECTIVE_TIMES_UNRESOLVED",
        "MULTIPLE_RECORD_TARGETS",
        "NARRATIVE_REFERENCE_BROKEN",
        "NEGATION_VS_NULLFLAVOR_AMBIGUOUS",
        "NON_UCUM_UNIT",
        "PLANNED_VS_PERFORMED_AMBIGUOUS",
        "PROBLEM_STATUS_INDETERMINATE",
        "PROCEDURE_MOOD_UNEXPECTED",
        "PROFILE_QUIRK_APPLIED",
        "REQUIRED_SECTION_MISSING",
        "RESULT_VALUE_TYPE_UNHANDLED",
        "SECTION_MATCHED_BY_LOINC_FALLBACK",
        "SECTION_PLACEMENT_SUSPECT",
        "SMOKING_STATUS_CODE_UNRECOGNIZED",
        "SMOKING_STATUS_UNKNOWN",
        "TEMPLATE_EXTENSION_ABSENT",
        "UCUM_CASE_SUSPECT",
        "UNEXPECTED_CODE_SYSTEM",
        "UNKNOWN_DOCUMENT_TEMPLATE",
        "UNKNOWN_NAMESPACE_PREFIX",
        "UNKNOWN_SECTION_CODE",
      ]
    `);
  });

  it("fatal codes are stable", () => {
    expect(sortedCodeSet(FATAL_CODES)).toMatchInlineSnapshot(`
      [
        "ELEMENT_DEPTH_LIMIT_EXCEEDED",
        "ENTITY_EXPANSION_LIMIT",
        "INPUT_SIZE_LIMIT_EXCEEDED",
        "NODE_COUNT_LIMIT_EXCEEDED",
        "NOT_A_CLINICAL_DOCUMENT",
        "NOT_WELL_FORMED_XML",
        "XXE_OR_DTD_PRESENT",
      ]
    `);
  });

  it("every code key equals its value (snapshot-safe registries)", () => {
    for (const [k, v] of Object.entries(WARNING_CODES)) expect(k).toBe(v);
    for (const [k, v] of Object.entries(FATAL_CODES)) expect(k).toBe(v);
  });
});
