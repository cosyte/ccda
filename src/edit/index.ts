/**
 * Public document-editing surface for `@cosyte/ccda` — the read→edit→write
 * primitive `editCcda`, symmetric with `parseCcda` (read) and `buildCcda`
 * (construct). Re-exported from the package root.
 */

export { editCcda, CcdaEditError } from "./edit-ccda.js";
export type {
  EditCcdaOptions,
  SectionEdit,
  SectionEditMode,
  RevisionInit,
  DocumentIdInit,
  CcdaEditErrorCode,
} from "./edit-ccda.js";
export type { EditableSectionKind } from "../builder/build-ccda.js";
