/**
 * Barrel for the C-CDA clinical entry layer (the Phase 2 reconciliation triad).
 * Re-exports the entry models, their extractors, the entry-template OID roots,
 * and the shared reconciliation helpers, so the package root and the document
 * model import the entry surface from one place.
 */

export { extractClinical, type ClinicalEntries } from "./extract.js";
export {
  extractProblems,
  type Problem,
  type ProblemConcern,
  type ProblemStatus,
} from "./problem.js";
export { extractMedications, type Medication, type MedicationFrequency } from "./medication.js";
export {
  extractAllergies,
  type Allergy,
  type AllergyConcern,
  type AllergyReaction,
} from "./allergy.js";
export {
  PROBLEM_CONCERN_ACT,
  PROBLEM_OBSERVATION,
  MEDICATION_ACTIVITY,
  MEDICATION_INFORMATION,
  ALLERGY_CONCERN_ACT,
  ALLERGY_OBSERVATION,
  REACTION_OBSERVATION,
  SEVERITY_OBSERVATION,
  CRITICALITY_OBSERVATION,
  childEntries,
  entryAct,
  anyEntryAct,
  idsOf,
  templateRoots,
  hasTemplateRoot,
  chain,
  relatedObservations,
  statusCodeOf,
  resolveConcernStatus,
  readNegation,
  resolveNarrative,
  reconcileCode,
  type ConcernStatus,
} from "./shared.js";
