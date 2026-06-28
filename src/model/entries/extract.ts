/**
 * Clinical-entry extraction walker. Given a `structuredBody`, it visits every
 * `<section>` (depth-first, including nested subsections), resolves each
 * section's narrative index, and runs the Problems / Medications / Allergies /
 * Results / Vital Signs / Immunizations extractors. Section recognition here is
 * **silent** — Phase 1's `buildSection` already emitted the section-level
 * warnings (LOINC fallback, unknown code), so re-emitting them would
 * double-count. The only new section-level signal is `SECTION_PLACEMENT_SUSPECT`:
 * an entry whose home section differs from the section it was found in.
 */

import { child, children, positionOf } from "../dom.js";
import { buildNarrativeIndex } from "../section.js";
import { sectionForLoinc, sectionForTemplateRoot } from "../../parser/templates.js";
import { sectionPlacementSuspect } from "../../parser/warnings.js";
import { parseCd } from "../types/cd.js";
import type { ParseCtx } from "../types/_shared.js";
import { ENTRY_ROOT_TO_SECTION, anyEntryAct, childEntries, templateRoots } from "./shared.js";
import { extractProblems, type ProblemConcern } from "./problem.js";
import { extractMedications, type Medication } from "./medication.js";
import { extractAllergies, type AllergyConcern } from "./allergy.js";
import { extractResults, type ResultOrganizer } from "./result.js";
import { extractVitals, type VitalSignsOrganizer } from "./vital.js";
import { extractImmunizations, type Immunization } from "./immunization.js";
import type { Element } from "@xmldom/xmldom";

/**
 * The clinical entries extracted from a document body: the reconciliation triad
 * (Problems, Medications, Allergies) plus the discrete-data sections (Results,
 * Vital Signs, Immunizations). Empty arrays when a body carries none.
 *
 * @example
 * ```ts
 * import type { ClinicalEntries } from "@cosyte/ccda";
 * function summarize(e: ClinicalEntries): number {
 *   return e.problems.length + e.medications.length + e.allergies.length;
 * }
 * ```
 */
export interface ClinicalEntries {
  readonly problems: readonly ProblemConcern[];
  readonly medications: readonly Medication[];
  readonly allergies: readonly AllergyConcern[];
  readonly results: readonly ResultOrganizer[];
  readonly vitals: readonly VitalSignsOrganizer[];
  readonly immunizations: readonly Immunization[];
}

/**
 * Extract the reconciliation triad from a `structuredBody` element. Walks every
 * section, runs each triad extractor, and flags misplaced entries. Never
 * throws; an unstructured document (no `structuredBody`) is handled by the
 * caller and never reaches here.
 *
 * @example
 * ```ts
 * import { extractClinical } from "@cosyte/ccda";
 * const entries = extractClinical(structuredBodyEl, ctx);
 * console.log(entries.problems.length);
 * ```
 */
export function extractClinical(structuredBody: Element, ctx: ParseCtx): ClinicalEntries {
  const problems: ProblemConcern[] = [];
  const medications: Medication[] = [];
  const allergies: AllergyConcern[] = [];
  const results: ResultOrganizer[] = [];
  const vitals: VitalSignsOrganizer[] = [];
  const immunizations: Immunization[] = [];

  for (const sectionEl of allSectionElements(structuredBody)) {
    const key = sectionKeyOf(sectionEl);
    const narrativeById = narrativeIndexOf(sectionEl);

    problems.push(...extractProblems(sectionEl, narrativeById, ctx));
    medications.push(...extractMedications(sectionEl, narrativeById, ctx));
    allergies.push(...extractAllergies(sectionEl, narrativeById, ctx));
    results.push(...extractResults(sectionEl, narrativeById, ctx));
    vitals.push(...extractVitals(sectionEl, narrativeById, ctx));
    immunizations.push(...extractImmunizations(sectionEl, narrativeById, ctx));

    flagMisplacedEntries(sectionEl, key, ctx);
  }

  return { problems, medications, allergies, results, vitals, immunizations };
}

/** Every `<section>` element under a body, depth-first (top-level then nested). @internal */
function allSectionElements(structuredBody: Element): readonly Element[] {
  const out: Element[] = [];
  const visit = (sectionEl: Element): void => {
    out.push(sectionEl);
    for (const comp of children(sectionEl, "component")) {
      const nested = child(comp, "section");
      if (nested !== undefined) visit(nested);
    }
  };
  for (const comp of children(structuredBody, "component")) {
    const sectionEl = child(comp, "section");
    if (sectionEl !== undefined) visit(sectionEl);
  }
  return out;
}

/** The narrative `ID` index for a section's `<text>`, or an empty map. @internal */
function narrativeIndexOf(sectionEl: Element): ReadonlyMap<string, string> {
  const textEl = child(sectionEl, "text");
  return textEl === undefined ? new Map() : buildNarrativeIndex(textEl);
}

/** Silently recognize a section's catalog key (templateId root, then LOINC). @internal */
function sectionKeyOf(sectionEl: Element): string | undefined {
  for (const root of templateRoots(sectionEl)) {
    const info = sectionForTemplateRoot(root);
    if (info !== undefined) return info.key;
  }
  const code = parseCd(child(sectionEl, "code"), { emit: () => {} });
  if (code?.code !== undefined) {
    const info = sectionForLoinc(code.code);
    if (info !== undefined) return info.key;
  }
  return undefined;
}

/** Emit `SECTION_PLACEMENT_SUSPECT` for a triad entry sitting in the wrong section. @internal */
function flagMisplacedEntries(
  sectionEl: Element,
  sectionKey: string | undefined,
  ctx: ParseCtx,
): void {
  if (sectionKey === undefined) return;
  for (const entry of childEntries(sectionEl)) {
    const act = anyEntryAct(entry);
    if (act === undefined) continue;
    for (const root of templateRoots(act)) {
      const home = ENTRY_ROOT_TO_SECTION.get(root);
      if (home !== undefined && home !== sectionKey) {
        ctx.emit(sectionPlacementSuspect(positionOf(act), home, sectionKey));
        break;
      }
    }
  }
}
