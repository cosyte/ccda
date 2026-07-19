/**
 * Public builder surface for `@cosyte/ccda` — the conservative *emit* factory
 * `buildCcda`, symmetric with `parseCcda` and mirroring the sibling
 * `@cosyte/hl7`'s `buildMessage`. Re-exported from the package root.
 */

export { buildCcda } from "./build-ccda.js";
export type {
  BuildCcdaInit,
  BuildCcdaPatient,
  BuildCcdaProblem,
  BuildCcdaAllergy,
  BuildCcdaMedication,
  BuildCcdaResultPanel,
  BuildCcdaResult,
  BuildCcdaVitalsPanel,
  BuildCcdaVital,
  BuildCcdaImmunization,
  BuildCcdaProcedure,
  BuildCcdaEncounter,
  BuildQuantity,
  BuildCode,
} from "./build-ccda.js";
