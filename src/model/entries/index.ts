/**
 * Barrel for the C-CDA clinical entry layer (the reconciliation triad plus the
 * discrete-data sections — Results, Vital Signs, Immunizations). Re-exports the
 * entry models, their extractors, the entry-template OID roots, the shared
 * reconciliation helpers, and the shared observation-value machinery, so the
 * package root and the document model import the entry surface from one place.
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
export { extractResults, type Result, type ResultOrganizer } from "./result.js";
export { extractVitals, type VitalSign, type VitalSignsOrganizer } from "./vital.js";
export { extractImmunizations, type Immunization } from "./immunization.js";
export {
  checkUcumUnit,
  readObservationValue,
  readReferenceRange,
  type ObservationValue,
  type ReferenceRange,
} from "./observation.js";
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
  RESULT_ORGANIZER,
  RESULT_OBSERVATION,
  VITAL_SIGNS_ORGANIZER,
  VITAL_SIGN_OBSERVATION,
  IMMUNIZATION_ACTIVITY,
  IMMUNIZATION_MEDICATION_INFORMATION,
  childEntries,
  entryAct,
  anyEntryAct,
  idsOf,
  templateRoots,
  hasTemplateRoot,
  chain,
  relatedObservations,
  componentObservations,
  statusCodeOf,
  resolveConcernStatus,
  readNegation,
  resolveNarrative,
  reconcileCode,
  type ConcernStatus,
} from "./shared.js";
