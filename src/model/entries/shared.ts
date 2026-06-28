/**
 * Shared structure for the C-CDA clinical entry extractors (Problems,
 * Medications, Allergies). Holds the entry-template OID roots (matched on root
 * only — the R2.1 IG pins different `@extension` stamps per template), small
 * DOM-navigation helpers the extractors share, and the two cross-cutting
 * safety-critical reconciliations: `negationInd`-vs-`nullFlavor` (never
 * collapsed) and coded-value-vs-narrative (both surfaced, no winner picked).
 */

import { attr, child, children, positionOf, xsiType } from "../dom.js";
import { parseBlAttr } from "../types/bl.js";
import type { CD } from "../types/cd.js";
import { parseIi, type II } from "../types/ii.js";
import type { ParseCtx } from "../types/_shared.js";
import type { CcdaPosition } from "../../parser/types.js";
import {
  codeNarrativeMismatch,
  narrativeReferenceBroken,
  negationVsNullFlavorAmbiguous,
  problemStatusIndeterminate,
} from "../../parser/warnings.js";
import type { Element } from "@xmldom/xmldom";

/**
 * The resolved active-vs-resolved state of a Problem/Allergy Concern Act,
 * derived from its `statusCode` (with `effectiveTime` available for refinement).
 *
 * @example
 * ```ts
 * import type { ConcernStatus } from "@cosyte/ccda";
 * const s: ConcernStatus = "active";
 * ```
 */
export type ConcernStatus = "active" | "resolved" | "inactive" | "unknown";

/** Problem Concern Act — wraps one or more Problem Observations. */
export const PROBLEM_CONCERN_ACT = "2.16.840.1.113883.10.20.22.4.3";
/** Problem Observation — carries the coded problem in `value xsi:type="CD"`. */
export const PROBLEM_OBSERVATION = "2.16.840.1.113883.10.20.22.4.4";
/** Medication Activity — the `substanceAdministration` for one medication. */
export const MEDICATION_ACTIVITY = "2.16.840.1.113883.10.20.22.4.16";
/** Medication Information — the `manufacturedMaterial` carrying the RxNorm code. */
export const MEDICATION_INFORMATION = "2.16.840.1.113883.10.20.22.4.23";
/** Allergy Concern Act — wraps one or more Allergy-Intolerance Observations. */
export const ALLERGY_CONCERN_ACT = "2.16.840.1.113883.10.20.22.4.30";
/** Allergy-Intolerance Observation — the propensity assertion + allergen. */
export const ALLERGY_OBSERVATION = "2.16.840.1.113883.10.20.22.4.7";
/** Reaction Observation — a manifestation of an allergy. */
export const REACTION_OBSERVATION = "2.16.840.1.113883.10.20.22.4.9";
/** Severity Observation — nested in a reaction (or the allergy) propensity. */
export const SEVERITY_OBSERVATION = "2.16.840.1.113883.10.20.22.4.8";
/** Criticality Observation — the clinical criticality of the propensity. */
export const CRITICALITY_OBSERVATION = "2.16.840.1.113883.10.20.22.4.145";
/** Result Organizer — the panel/battery wrapper around Result Observations. */
export const RESULT_ORGANIZER = "2.16.840.1.113883.10.20.22.4.1";
/** Result Observation — a single coded lab/diagnostic result + its value. */
export const RESULT_OBSERVATION = "2.16.840.1.113883.10.20.22.4.2";
/** Vital Signs Organizer — the cluster wrapper around Vital Sign Observations. */
export const VITAL_SIGNS_ORGANIZER = "2.16.840.1.113883.10.20.22.4.26";
/** Vital Sign Observation — a single coded vital sign + its `PQ` value. */
export const VITAL_SIGN_OBSERVATION = "2.16.840.1.113883.10.20.22.4.27";
/** Immunization Activity — the `substanceAdministration` for one vaccination. */
export const IMMUNIZATION_ACTIVITY = "2.16.840.1.113883.10.20.22.4.52";
/** Immunization Medication Information — the `manufacturedMaterial` carrying the CVX. */
export const IMMUNIZATION_MEDICATION_INFORMATION = "2.16.840.1.113883.10.20.22.4.54";
/** Procedure Activity Procedure — a `<procedure>` (an altering/operative act). */
export const PROCEDURE_ACTIVITY_PROCEDURE = "2.16.840.1.113883.10.20.22.4.14";
/** Procedure Activity Act — an `<act>` procedure (a non-altering service). */
export const PROCEDURE_ACTIVITY_ACT = "2.16.840.1.113883.10.20.22.4.12";
/** Procedure Activity Observation — an `<observation>` procedure (an assessment). */
export const PROCEDURE_ACTIVITY_OBSERVATION = "2.16.840.1.113883.10.20.22.4.13";
/** Encounter Activity — the `<encounter>` for one visit/admission. */
export const ENCOUNTER_ACTIVITY = "2.16.840.1.113883.10.20.22.4.49";
/** Smoking Status — Meaningful Use observation (current smoking status). */
export const SMOKING_STATUS_OBSERVATION = "2.16.840.1.113883.10.20.22.4.78";

/** Each top-level entry act/organizer root mapped to its home section key. @internal */
export const ENTRY_ROOT_TO_SECTION: ReadonlyMap<string, string> = new Map([
  [PROBLEM_CONCERN_ACT, "problems"],
  [MEDICATION_ACTIVITY, "medications"],
  [ALLERGY_CONCERN_ACT, "allergies"],
  [RESULT_ORGANIZER, "results"],
  [VITAL_SIGNS_ORGANIZER, "vitalSigns"],
  [IMMUNIZATION_ACTIVITY, "immunizations"],
  [PROCEDURE_ACTIVITY_PROCEDURE, "procedures"],
  [PROCEDURE_ACTIVITY_ACT, "procedures"],
  [PROCEDURE_ACTIVITY_OBSERVATION, "procedures"],
  [ENCOUNTER_ACTIVITY, "encounters"],
  [SMOKING_STATUS_OBSERVATION, "socialHistory"],
]);

/**
 * The `templateId` root OIDs carried by an element, in document order. Used to
 * recognize an act/observation by template without descending.
 *
 * @example
 * ```ts
 * import { templateRoots } from "@cosyte/ccda";
 * templateRoots(actEl).includes("2.16.840.1.113883.10.20.22.4.3");
 * ```
 */
export function templateRoots(el: Element): readonly string[] {
  const out: string[] = [];
  for (const t of children(el, "templateId")) {
    const root = attr(t, "root");
    if (root !== undefined) out.push(root);
  }
  return out;
}

/**
 * True when an element carries the given `templateId` root (extension ignored —
 * roots match across R2.0/R2.1 mixed-extension documents).
 *
 * @example
 * ```ts
 * import { hasTemplateRoot, PROBLEM_OBSERVATION } from "@cosyte/ccda";
 * if (hasTemplateRoot(observationEl, PROBLEM_OBSERVATION)) { ... }
 * ```
 */
export function hasTemplateRoot(el: Element, root: string): boolean {
  return templateRoots(el).includes(root);
}

/**
 * Walk a direct-child element chain (each step a v3-namespace child by local
 * name), returning the element at the end or `undefined` if any step is absent.
 *
 * @example
 * ```ts
 * import { chain } from "@cosyte/ccda";
 * const drugCode = chain(sbadm, "consumable", "manufacturedProduct", "manufacturedMaterial", "code");
 * ```
 */
export function chain(el: Element | undefined, ...names: readonly string[]): Element | undefined {
  let current: Element | undefined = el;
  for (const name of names) {
    if (current === undefined) return undefined;
    current = child(current, name);
  }
  return current;
}

/** Breadth-first search for the first descendant with the given local name. @internal */
function firstDescendant(el: Element, localName: string): Element | undefined {
  let level: readonly Element[] = childElementsOf(el);
  while (level.length > 0) {
    const next: Element[] = [];
    for (const node of level) {
      if (node.localName === localName) return node;
      next.push(...childElementsOf(node));
    }
    level = next;
  }
  return undefined;
}

/** Direct child elements of any namespace. @internal */
function childElementsOf(el: Element): readonly Element[] {
  const out: Element[] = [];
  for (let n = el.firstChild; n !== null; n = n.nextSibling) {
    if (n.nodeType === 1) out.push(n as Element);
  }
  return out;
}

/**
 * All `entryRelationship/observation` children of an act/observation whose
 * `observation` carries the given `templateId` root. Used to pull the typed
 * sub-observations (problem, reaction, severity, criticality) out of a concern
 * or propensity act.
 *
 * @example
 * ```ts
 * import { relatedObservations, PROBLEM_OBSERVATION } from "@cosyte/ccda";
 * const problems = relatedObservations(concernAct, PROBLEM_OBSERVATION);
 * ```
 */
export function relatedObservations(el: Element, root: string): readonly Element[] {
  const out: Element[] = [];
  for (const er of children(el, "entryRelationship")) {
    const obs = child(er, "observation");
    if (obs !== undefined && hasTemplateRoot(obs, root)) out.push(obs);
  }
  return out;
}

/**
 * All `component/observation` children of an organizer whose `observation`
 * carries the given `templateId` root. An organizer (Result, Vital Signs) nests
 * its member observations through `<component>` rather than `entryRelationship`.
 *
 * @example
 * ```ts
 * import { componentObservations, RESULT_OBSERVATION } from "@cosyte/ccda";
 * const results = componentObservations(organizer, RESULT_OBSERVATION);
 * ```
 */
export function componentObservations(el: Element, root: string): readonly Element[] {
  const out: Element[] = [];
  for (const comp of children(el, "component")) {
    const obs = child(comp, "observation");
    if (obs !== undefined && hasTemplateRoot(obs, root)) out.push(obs);
  }
  return out;
}

/**
 * Read the `statusCode/@code` of an act/observation (the v3 ActStatus token),
 * lower-cased, or `undefined` when absent.
 *
 * @example
 * ```ts
 * import { statusCodeOf } from "@cosyte/ccda";
 * statusCodeOf(concernAct); // "active" | "completed" | ...
 * ```
 */
export function statusCodeOf(el: Element): string | undefined {
  const sc = child(el, "statusCode");
  if (sc === undefined) return undefined;
  const code = attr(sc, "code");
  return code === undefined ? undefined : code.toLowerCase();
}

/**
 * Read the negation/nullFlavor pair off a clinical act as two **distinct,
 * never-collapsed** fields. Emits `NEGATION_VS_NULLFLAVOR_AMBIGUOUS` when both
 * are present (a sender asserting "did not happen" and "value unknown" at
 * once). Returns both so the caller models them separately.
 *
 * @example
 * ```ts
 * import { readNegation } from "@cosyte/ccda";
 * const { negated, nullFlavor } = readNegation(observationEl, ctx);
 * ```
 */
export function readNegation(
  el: Element,
  ctx: ParseCtx,
): { readonly negated?: boolean; readonly nullFlavor?: string } {
  const negated = parseBlAttr(el, "negationInd");
  const nullFlavor = attr(el, "nullFlavor");
  if (negated === true && nullFlavor !== undefined) {
    ctx.emit(negationVsNullFlavorAmbiguous(positionOf(el), nullFlavor));
  }
  const out: { negated?: boolean; nullFlavor?: string } = {};
  if (negated !== undefined) out.negated = negated;
  if (nullFlavor !== undefined) out.nullFlavor = nullFlavor;
  return out;
}

/**
 * Resolve an entry's narrative reference. Searches the act subtree for the
 * first `<reference value="#id">`, looks the `id` up in the section's narrative
 * index, and returns the narrative text. Emits `NARRATIVE_REFERENCE_BROKEN`
 * when the `#id` resolves to nothing. Returns `undefined` when there is no
 * reference at all.
 *
 * @example
 * ```ts
 * import { resolveNarrative } from "@cosyte/ccda";
 * const narrative = resolveNarrative(observationEl, section.narrativeById, ctx);
 * ```
 */
export function resolveNarrative(
  el: Element,
  narrativeById: ReadonlyMap<string, string>,
  ctx: ParseCtx,
): string | undefined {
  const ref = firstDescendant(el, "reference");
  if (ref === undefined) return undefined;
  const value = attr(ref, "value");
  if (value === undefined || !value.startsWith("#")) return undefined;
  const id = value.slice(1);
  const narrative = narrativeById.get(id);
  if (narrative === undefined) {
    ctx.emit(narrativeReferenceBroken(positionOf(ref), id));
    return undefined;
  }
  return narrative;
}

/**
 * Reconcile a coded value against its resolved narrative. When both a display
 * label (the code's `displayName`/`originalText`) and a narrative are present
 * and neither contains the other (case-insensitive), emits
 * `CODE_NARRATIVE_MISMATCH` — surfacing the divergence without picking a winner.
 * Conservative by design: silent when either side is absent.
 *
 * @example
 * ```ts
 * import { reconcileCode } from "@cosyte/ccda";
 * reconcileCode(problemValue, narrative, "problem", positionOf(valueEl), ctx);
 * ```
 */
export function reconcileCode(
  code: CD | undefined,
  narrative: string | undefined,
  slot: string,
  position: CcdaPosition,
  ctx: ParseCtx,
): void {
  if (narrative === undefined) return;
  const label = code?.displayName ?? code?.originalText;
  if (label === undefined || label.trim() === "") return;
  const a = label.trim().toLowerCase();
  const b = narrative.trim().toLowerCase();
  if (!b.includes(a) && !a.includes(b)) {
    ctx.emit(codeNarrativeMismatch(position, slot));
  }
}

/**
 * Resolve a concern act's {@link ConcernStatus} from its `statusCode` (the four
 * Concern Act ActStatus values). `completed` is the only one that ran its course
 * → `"resolved"`; `aborted` (stopped early) and `suspended` (on hold) are both
 * `"inactive"` — neither is collapsed into `"resolved"`, since "cancelled" is not
 * "ran to resolution". Emits `PROBLEM_STATUS_INDETERMINATE` when the status is
 * absent or outside the recognized set, returning `"unknown"` (never a guessed
 * `"active"`).
 *
 * @example
 * ```ts
 * import { resolveConcernStatus } from "@cosyte/ccda";
 * const status = resolveConcernStatus(concernAct, ctx);
 * ```
 */
export function resolveConcernStatus(act: Element, ctx: ParseCtx): ConcernStatus {
  switch (statusCodeOf(act)) {
    case "active":
      return "active";
    case "completed":
      return "resolved";
    case "aborted":
    case "suspended":
      return "inactive";
    case undefined:
    default:
      ctx.emit(problemStatusIndeterminate(positionOf(act)));
      return "unknown";
  }
}

/**
 * The `xsi:type` local name of an element (namespace prefix stripped), or
 * `undefined`. Distinguishes an `effectiveTime`'s `IVL_TS` (duration) from a
 * `PIVL_TS`/`EIVL_TS` (frequency) without committing to a prefix.
 *
 * @example
 * ```ts
 * import { typeOf } from "@cosyte/ccda";
 * if (typeOf(effectiveTimeEl) === "PIVL_TS") { ... }
 * ```
 */
export function typeOf(el: Element): string | undefined {
  return xsiType(el);
}

/**
 * The direct `<entry>` child elements of a `<section>`, in document order.
 *
 * @example
 * ```ts
 * import { childEntries } from "@cosyte/ccda";
 * for (const entry of childEntries(sectionEl)) { ... }
 * ```
 */
export function childEntries(sectionEl: Element): readonly Element[] {
  return children(sectionEl, "entry");
}

/**
 * The clinical act inside an `<entry>` — its first `act` /
 * `substanceAdministration` / `observation` / `organizer` child — that carries
 * the given `templateId` root, or `undefined` when the entry holds no such act.
 *
 * @example
 * ```ts
 * import { entryAct, PROBLEM_CONCERN_ACT } from "@cosyte/ccda";
 * const act = entryAct(entryEl, PROBLEM_CONCERN_ACT);
 * ```
 */
export function entryAct(entry: Element, root: string): Element | undefined {
  for (const name of ACT_NAMES) {
    const el = child(entry, name);
    if (el !== undefined && hasTemplateRoot(el, root)) return el;
  }
  return undefined;
}

/**
 * The clinical act inside an `<entry>` regardless of template — its first
 * `act` / `substanceAdministration` / `observation` / `organizer` child. Used
 * to inspect an entry's templates for misplacement detection.
 *
 * @example
 * ```ts
 * import { anyEntryAct } from "@cosyte/ccda";
 * const act = anyEntryAct(entryEl);
 * ```
 */
export function anyEntryAct(entry: Element): Element | undefined {
  for (const name of ACT_NAMES) {
    const el = child(entry, name);
    if (el !== undefined) return el;
  }
  return undefined;
}

/** The element names a C-CDA `<entry>` clinical act can take. @internal */
const ACT_NAMES = [
  "act",
  "substanceAdministration",
  "observation",
  "organizer",
  "procedure",
  "encounter",
] as const;

/**
 * Parse the direct `<id>` children of an act/observation into {@link II}s.
 *
 * @example
 * ```ts
 * import { idsOf } from "@cosyte/ccda";
 * const ids = idsOf(actEl, ctx);
 * ```
 */
export function idsOf(el: Element, ctx: ParseCtx): readonly II[] {
  return children(el, "id")
    .map((idEl) => parseIi(idEl, ctx))
    .filter((ii): ii is II => ii !== undefined);
}
