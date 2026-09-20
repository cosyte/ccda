import { describe, expect, it } from "vitest";
import { sortedCodeSet } from "@cosyte/test-utils";

import { WARNING_CODES, FATAL_CODES } from "../src/index.js";
import { WARNING_MESSAGES } from "../src/parser/warnings.js";

/**
 * The warning + fatal code surface is part of the public contract, consumers
 * branch on `w.code`, so adding/removing/renaming a code is a reviewable event.
 * These inline snapshots turn any such change into a failing diff.
 *
 * **Two codes were ADDED at CCDA-5 and none was renamed or removed**, which is
 * the shape an addition to a published surface has to have:
 * `TEMPLATE_EXTENSION_UNMODELED_RELEASE` (the resolving `templateId` carries a
 * stamp this library does not model, split out of `TEMPLATE_EXTENSION_ABSENT`,
 * which keeps its narrower meaning and its message) and
 * `REQUIRED_SECTIONS_NOT_EVALUATED` (that document's SHALL obligation was not
 * computed, rather than computed smaller in silence).
 *
 * **One more was ADDED when the builder's output was first measured against the
 * normative Schematron**, again with nothing renamed or removed:
 * `MISSING_SELF_CARE_ACTIVITY` (a Functional Status Organizer was asked for
 * without the Self-Care Activities observation its template SHALL contain, so
 * the findings were written standalone instead of an organizer claiming a
 * template it does not satisfy).
 *
 * **One more was ADDED when the header participations were first read**, again
 * with nothing renamed or removed: `UNIDENTIFIED_AUTHOR` (an `author`
 * participation carrying neither arm of the `assignedAuthor` choice, which the
 * US Realm Header requires one of; the author is kept and marked unidentified
 * rather than dropped, so the tolerance is declared instead of silent).
 *
 * **Two more were ADDED with the bring-your-own value-set source**, and again
 * nothing was renamed, removed or repurposed: `VALUE_SET_BINDING_VIOLATED` (a
 * supplied source reports the code is outside the value set a Required C-CDA
 * binding names, which is a SHALL violation) and
 * `VALUE_SET_BINDING_NOT_EVALUATED` (the source holds no expansion for that
 * value set, so the binding was not evaluated and the silence says nothing).
 *
 * **The second half of the contract is graded separately below**, because it is
 * the half that regresses without a diff anyone reads: adding a code is not what
 * breaks a consumer, quietly redefining one is. The frozen code-to-message
 * registry is pinned entry for entry, so a reworded published message reds here.
 */
describe("code surface stability", () => {
  it("warning codes are stable", () => {
    expect(sortedCodeSet(WARNING_CODES)).toMatchInlineSnapshot(`
      [
        "ALLERGEN_GRANULARITY_SUSPECT",
        "CODE_NARRATIVE_MISMATCH",
        "CONTRADICTORY_NULL_FLAVOR",
        "DEPRECATED_CODE_SYSTEM",
        "DEPRECATED_LOINC",
        "ENCODING_BOM_STRIPPED",
        "FREE_TEXT_REFERENCE_RANGE",
        "IMMUNIZATION_REFUSED",
        "INVALID_NULL_FLAVOR",
        "MALFORMED_DATETIME",
        "MEDICATION_PRODUCT_ARM_CONFLICT",
        "MEDICATION_PRODUCT_ARM_REPEATED",
        "MEDICATION_PRODUCT_ARM_UNEXPECTED",
        "MEDICATION_PRODUCT_CODE_REPEATED",
        "MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY",
        "MISSING_ASSIGNING_AUTHORITY",
        "MISSING_CODE_SYSTEM",
        "MISSING_CODE_VALUE",
        "MISSING_DOSE_QUANTITY",
        "MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME",
        "MISSING_PRODUCT_CODE",
        "MISSING_ROUTE_CODE",
        "MISSING_SELF_CARE_ACTIVITY",
        "MISSING_TEMPLATE_ID",
        "MISSING_UNIT_ON_PQ",
        "MULTIPLE_EFFECTIVE_TIMES_UNRESOLVED",
        "MULTIPLE_RECORD_TARGETS",
        "NARRATIVE_REFERENCE_BROKEN",
        "NEGATION_VS_NULLFLAVOR_AMBIGUOUS",
        "NON_UCUM_UNIT",
        "PLANNED_VS_PERFORMED_AMBIGUOUS",
        "PLAN_ENTRY_NOT_MODELED",
        "PROBLEM_STATUS_INDETERMINATE",
        "PROCEDURE_MOOD_UNEXPECTED",
        "PROFILE_QUIRK_APPLIED",
        "REQUIRED_SECTIONS_NOT_EVALUATED",
        "REQUIRED_SECTION_MISSING",
        "RESULT_VALUE_TYPE_UNHANDLED",
        "SECTION_MATCHED_BY_LOINC_FALLBACK",
        "SECTION_PLACEMENT_SUSPECT",
        "SEMANTIC_CODE_INVALID",
        "SMOKING_STATUS_CODE_UNRECOGNIZED",
        "SMOKING_STATUS_UNKNOWN",
        "SUBJECT_CONTEXT_OVERRIDE",
        "TEMPLATE_EXTENSION_ABSENT",
        "TEMPLATE_EXTENSION_UNMODELED_RELEASE",
        "UCUM_CASE_SUSPECT",
        "UNEXPECTED_CODE_SYSTEM",
        "UNIDENTIFIED_AUTHOR",
        "UNKNOWN_DOCUMENT_TEMPLATE",
        "UNKNOWN_NAMESPACE_PREFIX",
        "UNKNOWN_SECTION_CODE",
        "VALUE_SET_BINDING_NOT_EVALUATED",
        "VALUE_SET_BINDING_VIOLATED",
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

  /**
   * A published code never changes meaning, and the meaning a consumer reads is
   * the message the registry gives it. The code list above cannot see that: it
   * would stay green while every message under it was rewritten. Pinning the
   * whole mapping entry for entry is what makes a redefinition a reviewable
   * diff rather than a silent release.
   */
  it("the code-to-message registry is unchanged entry for entry", () => {
    expect(Object.fromEntries(Object.entries(WARNING_MESSAGES).sort())).toMatchSnapshot();
  });
});
