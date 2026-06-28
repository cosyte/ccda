/**
 * Public entry point for the `@cosyte/ccda` package — a lenient, PHI-aware
 * parser for HL7 Consolidated CDA R2.1 documents.
 *
 * `parseCcda` turns vendor-quirky C-CDA XML into an immutable
 * {@link CcdaDocument}: the recognized {@link DocumentType}, the US Realm
 * {@link CcdaHeader}, and the framed {@link CcdaSection}s — with recoverable
 * deviations surfaced as stable-coded {@link CcdaWarning}s rather than thrown.
 * The XML substrate is hardened against XXE / billion-laughs / oversized input
 * (Tier-3 {@link FatalCode}s). This module re-exports the public surface every
 * sibling `@cosyte/*` parser mirrors.
 *
 * @example
 * ```ts
 * import { parseCcda } from "@cosyte/ccda";
 * const doc = parseCcda(xml);
 * console.log(doc.documentType, doc.getPatient()?.name?.text, doc.getMrn());
 * ```
 */

/**
 * Library version string, synced with `package.json#version` at build time.
 *
 * @example
 * ```ts
 * import { VERSION } from "@cosyte/ccda";
 * console.log(VERSION);
 * ```
 */
export const VERSION = "0.0.0";

// Parser entry point + options.
export { parseCcda } from "./parser/index.js";
export type {
  ParseCcdaOptions,
  CcdaParseLimits,
  OnWarningCallback,
  CcdaPosition,
} from "./parser/types.js";

// Hardened XML substrate + the safety caps it enforces (tunable via options).
export { parseSecureXml, resolveLimits, DEFAULT_LIMITS } from "./parser/secure-xml.js";
export type { ResolvedLimits } from "./parser/secure-xml.js";

// Tier-2 warning registry + Tier-3 fatal registry (stable public contract).
export { WARNING_CODES } from "./parser/warnings.js";
export type { WarningCode, CcdaWarning } from "./parser/warnings.js";
export { FATAL_CODES, CcdaParseError } from "./parser/errors.js";
export type { FatalCode } from "./parser/errors.js";

// Document model + convenience accessors.
export { CcdaDocument, buildDocument } from "./model/document.js";
export type { CcdaDocumentInit } from "./model/document.js";

// Header + patient + section models.
export { buildHeader } from "./model/header.js";
export type { CcdaHeader, CcdaPatient, HumanName } from "./model/header.js";
export { buildSection, buildNarrativeIndex } from "./model/section.js";
export type { CcdaSection } from "./model/section.js";

// Clinical entry layer (Phase 2 reconciliation triad: Problems, Medications, Allergies).
export {
  extractClinical,
  extractProblems,
  extractMedications,
  extractAllergies,
} from "./model/entries/index.js";
export type {
  ClinicalEntries,
  Problem,
  ProblemConcern,
  ProblemStatus,
  Medication,
  MedicationFrequency,
  Allergy,
  AllergyConcern,
  AllergyReaction,
  ConcernStatus,
} from "./model/entries/index.js";

// Code-system OIDs + slot validation used by the entry layer.
export {
  SNOMED_CT,
  RXNORM,
  ICD10_CM,
  ICD10_PCS,
  ICD9_CM_DX,
  ICD9_CM_PROC,
  LOINC,
  NDC,
  UNII,
  NCI_ROUTE,
  checkCodeSlot,
  looksProductLevel,
} from "./model/code-systems.js";
export type { CodeSlot } from "./model/code-systems.js";

// Recognition tables — document types + section catalog.
export {
  documentTypeForOid,
  sectionForTemplateRoot,
  sectionForLoinc,
  CDA_DOCUMENT_OID,
  R21_EXTENSION,
} from "./parser/templates.js";
export type { DocumentType, SectionInfo } from "./parser/templates.js";

// HL7 v3 datatype layer (interfaces + parsers + null-flavor / datetime helpers).
export * from "./model/types/index.js";

// HL7 v3 namespaces.
export { V3_NS, XSI_NS, SDTC_NS, isRecognizedNamespace } from "./parser/namespaces.js";

// Namespace-aware DOM read helpers.
export { attr, child, children, childElements, text, xsiType, positionOf } from "./model/dom.js";

// MRN selection helper (overridable by a later profile-aware variant).
export { pickMrn } from "./helpers/pick-mrn.js";
