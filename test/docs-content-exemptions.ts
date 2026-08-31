/**
 * The committed exemption record for the `docs-content/` export-coverage guard
 * (`test/docs-content-coverage.test.ts`).
 *
 * **WHAT AN EXEMPTION MEANS, AND WHAT IT DOES NOT.** The narrative bundle is not the API
 * reference. The docs site generates a per-symbol TypeDoc reference from `source.tar.gz`, so
 * every symbol below IS documented to a reader: its signature, its fields and its own JSDoc
 * (with an `@example`, which the JSDoc lint rule makes mandatory on a public export) are all
 * published. An entry here says only that the symbol needs no NARRATIVE page: a reader does not
 * have to be TOLD about it in prose to use the library correctly, because the task it serves is
 * already taught somewhere in the bundle and the symbol is the mechanical detail of that task.
 *
 * A symbol that carries a **behaviour a reader must know to avoid getting it wrong** does not
 * belong here, and moving one in rather than writing the page is the failure mode this record
 * makes visible. Three surfaces were exempt-shaped until `docs-content/conformance.md` was
 * written for them (the vendor-profile system, the bring-your-own terminology adapter and the
 * required-section conformance status): each was mentioned only in passing, each had a reading a
 * caller could get backwards, and none had an executable example. That is the bar.
 *
 * **THE REASON IS PER CATEGORY, NOT PER SYMBOL, AND THAT IS DELIBERATE.** Twenty-nine builder
 * input types do not have twenty-nine different reasons; they have one reason, stated once, that
 * is true of each of them. Writing it out twenty-nine times would read as twenty-nine reviewed
 * decisions when it is one, which is the opposite of what a reviewer needs. The guard flattens
 * the groups to `symbol -> reason` and refuses an empty reason, so every symbol still carries a
 * stated one.
 *
 * **THIS LIST CANNOT OUTLIVE ITS REASON.** The guard fails if any name below is no longer
 * exported by `src/index.ts`, so a rename or a removal reds here rather than leaving a record
 * that quietly excuses nothing. An EMPTY list is the healthy end state, never a missing input.
 */

/** One reviewed group of exempt symbols and the single reason that covers all of them. */
export interface ExemptionGroup {
  /** Why no page in the bundle needs to name these symbols. Never empty. */
  readonly reason: string;
  /** The exported symbol names this reason covers. */
  readonly symbols: readonly string[];
}

/**
 * The reviewed groups. Ordered roughly by how large each is, so the biggest claim is read first.
 */
export const EXEMPTION_GROUPS: readonly ExemptionGroup[] = [
  {
    reason:
      "Structural input type for buildCcda. The cookbook's builder recipe shows the object literal a caller actually writes, and the per-field contract belongs in the generated API reference rather than in prose: a narrative that listed every field would go stale against the type it was copied from.",
    symbols: [
      "BuildCcdaAllergy",
      "BuildCcdaEncounter",
      "BuildCcdaFamilyHistory",
      "BuildCcdaFamilyHistoryObservation",
      "BuildCcdaFamilyMember",
      "BuildCcdaFunctionalStatus",
      "BuildCcdaFunctionalStatusOrganizer",
      "BuildCcdaImmunization",
      "BuildCcdaInit",
      "BuildCcdaMedication",
      "BuildCcdaMentalStatus",
      "BuildCcdaMentalStatusOrganizer",
      "BuildCcdaOptions",
      "BuildCcdaPatient",
      "BuildCcdaPlannedAct",
      "BuildCcdaPlannedImmunization",
      "BuildCcdaPlannedItem",
      "BuildCcdaPlannedObservation",
      "BuildCcdaPlannedOrder",
      "BuildCcdaProblem",
      "BuildCcdaProcedure",
      "BuildCcdaResult",
      "BuildCcdaResultPanel",
      "BuildCcdaSmokingStatus",
      "BuildCcdaVital",
      "BuildCcdaVitalsPanel",
      "BuildQuantity",
      "PlannedActMood",
      "PlannedOrderMood",
    ],
  },
  {
    reason:
      "Return-shape type for an accessor the clinical-entry and document-model pages already teach by behaviour. A reader reaches these through `doc.getX()` and their editor's completion, never by importing the name; what they must be told is which distinctions are kept apart, which those pages state.",
    symbols: [
      "AllergyConcern",
      "AllergyReaction",
      "CcdaDocumentInit",
      "CcdaHeader",
      "CcdaPatient",
      "CcdaSection",
      "ClinicalEntries",
      "ConcernStatus",
      "DocumentType",
      "EventDisposition",
      "FamilyHistory",
      "FamilyHistoryObservation",
      "FamilyMember",
      "HumanName",
      "MedicationFrequency",
      "ObservationValue",
      "ParentDocument",
      "PlannedItem",
      "PlannedItemKind",
      "ProblemConcern",
      "ProblemStatus",
      "ProcedureDisposition",
      "ProcedureKind",
      "ReferenceRange",
      "RelatedDocument",
      "ResultOrganizer",
      "SectionInfo",
      "SmokingStatus",
      "StatusDomain",
      "StatusObservation",
      "SupportingObservation",
      "VitalSign",
      "VitalSignsOrganizer",
    ],
  },
  {
    reason:
      "Free-function entry extractor taking a raw section `Element`, a narrative index and a parse context. It is the plumbing behind the `doc.getX()` accessor the clinical-entry page documents; a caller reaching for it is walking the DOM themselves, which the DOM-helper exemption below covers as one escape hatch rather than two pages.",
    symbols: [
      "extractAllergies",
      "extractClinical",
      "extractEncounters",
      "extractFamilyHistory",
      "extractFunctionalStatus",
      "extractImmunizations",
      "extractMedications",
      "extractMentalStatus",
      "extractPastMedicalHistory",
      "extractPlannedItems",
      "extractProblems",
      "extractProcedures",
      "extractResults",
      "extractSmokingStatus",
      "extractVitals",
      "readObservationValue",
      "readReferenceRange",
    ],
  },
  {
    reason:
      "Per-datatype element reader for the HL7 v3 datatype layer. The datatypes page teaches that layer as a model (what each datatype carries, and that a null flavor is never coerced into a value); these functions are how the parser reads one, exposed for a caller decoding an element this package does not model.",
    symbols: [
      "ParseCtx",
      "isNullFlavor",
      "parseBl",
      "parseBlAttr",
      "parseCd",
      "parseEd",
      "parseIvlPq",
      "parseIvlTs",
      "parsePq",
      "parseSt",
      "parseTs",
      "parseV3DateTime",
    ],
  },
  {
    reason:
      "Namespace-aware DOM read helper. One escape hatch, for reading an element this package does not model, on a document you already parsed. Nothing about safe use of the library depends on it, and a page teaching it would be teaching the DOM.",
    symbols: ["attr", "child", "childElements", "children", "positionOf", "xsiType"],
  },
  {
    reason:
      "Document-editing input type. The cookbook's edit recipe shows the call and the revision trail it stamps; these name the shapes that recipe passes.",
    symbols: [
      "CcdaEditErrorCode",
      "DocumentIdInit",
      "EditCcdaOptions",
      "EditableSectionKind",
      "RevisionInit",
      "SYNTHETIC_SETID_PREFIX",
      "SectionEdit",
      "SectionEditMode",
    ],
  },
  {
    reason:
      "Recognition table or release-stamp surface. The document-model page teaches what recognition decides and that a disagreement is resolved rather than warned about; these are the lookups behind it, keyed by OID or LOINC code.",
    symbols: [
      "CCDA_RELEASES",
      "CDA_DOCUMENT_OID",
      "CcdaRelease",
      "CcdaReleaseStamp",
      "TemplateStampReading",
      "documentTypeForOid",
      "sectionForLoinc",
      "sectionForTemplateRoot",
    ],
  },
  {
    reason:
      "Code-system OID constant or structural code check. The datatypes page teaches which systems are bound at which slot and that an unexpected one is warned rather than rejected; the individual OID literals are reference data a reader looks up, not prose.",
    symbols: [
      "ICD10_PCS",
      "ICD9_CM_DX",
      "ICD9_CM_PROC",
      "INTERPRETATION",
      "NCI_ROUTE",
      "checkUcumUnit",
      "looksProductLevel",
    ],
  },
  {
    reason:
      "Parse-limit tuning surface for the hardened XML substrate. The installation and tolerance pages state that the substrate is XXE-safe and capped and that exceeding a cap is one of the seven fatals; the individual limit fields are configuration a reader reaches for only when a cap actually fires.",
    symbols: [
      "CcdaParseLimits",
      "DEFAULT_LIMITS",
      "ResolvedLimits",
      "parseSecureXml",
      "resolveLimits",
    ],
  },
  {
    reason:
      "Diagnostic-shape type. The tolerance page teaches the warning model, the stable codes and the PHI bound on a message and a position, which is everything a reader must know; the interface is the shape their editor already shows them.",
    symbols: ["CcdaPosition", "FatalCode", "OnWarningCallback", "WarningCode"],
  },
  {
    reason:
      "HL7 v3 namespace URI constant or its recognizer. Reference data for a caller working at the DOM level, covered by the same escape-hatch reason as the DOM helpers.",
    symbols: ["SDTC_NS", "V3_NS", "XSI_NS", "isRecognizedNamespace"],
  },
  {
    reason:
      "Internal warning factory on the public surface for parity with the sibling parsers. A reader consumes warnings from `doc.warnings`; they never construct one, and the tolerance page documents the codes rather than the factories.",
    symbols: ["profileQuirkApplied", "semanticCodeInvalid"],
  },
  {
    reason:
      "Model constructor used by the parser to assemble an immutable document. Exposed for parity with the sibling parsers; a reader builds a document with `buildCcda` and reads one with `parseCcda`, both of which the bundle teaches.",
    symbols: ["buildDocument", "buildHeader", "buildNarrativeIndex", "buildSection"],
  },
  {
    reason:
      "The package's own version string. Naming it in a page is precisely the staleness this bundle's version rule forbids: `npm view @cosyte/ccda version` is the answer that cannot go stale, and the pages say so instead.",
    symbols: ["VERSION"],
  },
];

/**
 * The flattened record the guard reads: exported symbol name -> the reason no page names it.
 *
 * Built from {@link EXEMPTION_GROUPS} rather than written out, so a symbol cannot pick up an
 * empty reason by being added to the wrong place. A duplicate across two groups would silently
 * take the later reason, so the guard asserts there are none.
 */
export const DOCS_CONTENT_EXEMPTIONS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    EXEMPTION_GROUPS.flatMap((group) => group.symbols.map((symbol) => [symbol, group.reason])),
  ),
);
