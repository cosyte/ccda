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
  extractProcedures,
  type Procedure,
  type ProcedureKind,
  type ProcedureDisposition,
} from "./procedure.js";
export { extractEncounters, type Encounter } from "./encounter.js";
export { extractSmokingStatus, type SmokingStatus } from "./social-history.js";
export {
  extractPlannedItems,
  type PlannedItem,
  type PlannedItemKind,
} from "./plan-of-treatment.js";
export {
  extractFunctionalStatus,
  extractMentalStatus,
  type StatusDomain,
  type StatusObservation,
} from "./functional-mental-status.js";
export {
  extractFamilyHistory,
  type FamilyHistory,
  type FamilyHistoryObservation,
  type FamilyMember,
} from "./family-history.js";
export { extractPastMedicalHistory } from "./past-medical-history.js";
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
  PROCEDURE_ACTIVITY_PROCEDURE,
  PROCEDURE_ACTIVITY_ACT,
  PROCEDURE_ACTIVITY_OBSERVATION,
  ENCOUNTER_ACTIVITY,
  SMOKING_STATUS_OBSERVATION,
  PLANNED_ACT,
  PLANNED_ENCOUNTER,
  PLANNED_PROCEDURE,
  PLANNED_MEDICATION_ACTIVITY,
  PLANNED_SUPPLY,
  PLANNED_OBSERVATION,
  FUNCTIONAL_STATUS_ORGANIZER,
  FUNCTIONAL_STATUS_OBSERVATION,
  MENTAL_STATUS_ORGANIZER,
  MENTAL_STATUS_OBSERVATION,
  ASSESSMENT_SCALE_OBSERVATION,
  FAMILY_HISTORY_ORGANIZER,
  FAMILY_HISTORY_OBSERVATION,
  FAMILY_HISTORY_DEATH_OBSERVATION,
  AGE_OBSERVATION,
  classifyDisposition,
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
  type EventDisposition,
} from "./shared.js";
