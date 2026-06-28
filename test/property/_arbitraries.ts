/**
 * Format-specific fast-check arbitraries for the `@cosyte/ccda` property suite.
 * The shared `@cosyte/test-utils` runners own the *invariants*; this module owns
 * the *generators* — synthetic, PHI-free C-CDA XML built from the fixture
 * factory so the round-trip / immutability properties exercise real document
 * shapes (varied document types, record-target counts, and clinical sections)
 * rather than a single hand-written sample.
 */

import fc from "fast-check";

import {
  ALLERGY_ENTRY_SECTION,
  DOC_TYPES,
  IMMUNIZATIONS_SECTION,
  MEDICATIONS_SECTION,
  NKA_SECTION,
  PROBLEMS_SECTION,
  RESULTS_SECTION,
  VITALS_SECTION,
  buildCcda,
} from "../__fixtures__/ccda.js";

/** The clinical-section fixtures the generator may compose into a structured body. */
const SECTION_POOL: string[] = [
  PROBLEMS_SECTION,
  MEDICATIONS_SECTION,
  ALLERGY_ENTRY_SECTION,
  NKA_SECTION,
  RESULTS_SECTION,
  VITALS_SECTION,
  IMMUNIZATIONS_SECTION,
];

const DOC_OIDS: readonly string[] = DOC_TYPES.map((d) => d.oid);

/**
 * Generate a spec-valid, PHI-free C-CDA XML string. Every value parses without
 * a Tier-3 fatal — the document type, record-target count, R2.1 stamp,
 * declaration, and the structured vs. unstructured body all vary so the
 * serializer is exercised across the recognized surface.
 */
export function specCleanCcdaXml(): fc.Arbitrary<string> {
  return fc
    .record({
      docTypeOid: fc.constantFrom(...DOC_OIDS),
      includeHeaderTemplate: fc.boolean(),
      recordTargets: fc.integer({ min: 1, max: 2 }),
      extension: fc.option(fc.constant("2015-08-01"), { nil: undefined }),
      xmlDecl: fc.boolean(),
      nonXmlBody: fc.boolean(),
      sectionPick: fc.subarray(SECTION_POOL, { minLength: 1 }),
    })
    .map((opts) =>
      buildCcda({
        docTypeOid: opts.docTypeOid,
        includeHeaderTemplate: opts.includeHeaderTemplate,
        recordTargets: opts.recordTargets,
        extension: opts.extension,
        xmlDecl: opts.xmlDecl,
        nonXmlBody: opts.nonXmlBody,
        sections: opts.sectionPick.join(""),
      }),
    );
}
