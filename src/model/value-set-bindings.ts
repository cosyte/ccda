/**
 * The **value-set binding** each checked {@link CodeSlot} carries in C-CDA R2.1,
 * and the opt-in membership check a consumer's own value-set package drives.
 *
 * **This is a different question from the one `./code-systems.ts` answers.**
 * That module asks whether a coded value's `@codeSystem` OID is one expected for
 * its slot, and a supplied {@link TerminologyAdapter} asks whether the code is a
 * real member of that CODE SYSTEM. Neither can see the case a certifier and a
 * receiving clinician both care about: the system is right, the code is real,
 * and the value is still outside the VALUE SET the template binds. Against a
 * Required binding that is a SHALL violation.
 *
 * **Identifiers only, never members.** A value set OID is a public identifier;
 * the codes inside an expansion are licensed data this package never carries,
 * never downloads and never ships. The membership answer comes from a
 * {@link ValueSetSource} the consumer supplies, exactly as semantic validation
 * comes from a {@link TerminologyAdapter} the consumer supplies.
 *
 * **Every row below was read off the normative artifact, never from memory and
 * never from a later release.** The artifact is the C-CDA R2.1 Schematron HL7
 * publishes for that release, pinned by commit SHA and by the sha256 of its
 * bytes in `scripts/conformance/artifacts.json`, which is where the pin lives so
 * that it lives in one place: the SHA is deliberately not repeated here. Each
 * row names the conformance statement it came from and the template whose rule
 * carries that statement, so a reviewer holding the same bytes can re-check the
 * assertion instead of re-deriving it.
 *
 * **Binding strength is the verb attached to "be selected from", not the
 * cardinality beside it**, and the two differ on two of the five rows. C-CDA's
 * general guidance states that SHALL bindings are represented as Required
 * bindings while SHOULD and MAY bindings are represented as Preferred bindings.
 * So a `value` a template SHALL contain whose code SHOULD be selected from a
 * value set is a **Preferred** binding (the problem slot, CONF:1198-9058), and a
 * `routeCode` a template SHOULD contain whose code SHALL be selected from a
 * value set is a **Required** one (the route slot, CONF:1098-7514). Reading the
 * cardinality as the strength inverts both.
 *
 * **A Preferred row is reported by nobody.** {@link checkValueSetBinding} emits
 * the Required-binding finding only where the declared strength is `required`:
 * a Preferred binding is guidance, and reporting a departure from it at the
 * severity of a SHALL violation would turn a conformant document into a
 * reported defect at a safety-critical slot.
 */

import type { CD } from "./types/cd.js";
import type { ParseCtx } from "./types/_shared.js";
import type { TerminologyCoding, ValueSetSource } from "./terminology.js";
import {
  valueSetBindingNotEvaluated,
  valueSetBindingViolated,
  CODE_SLOTS,
  type BoundValueSet,
  type CodeSlot,
} from "../parser/warnings.js";
import type { CcdaPosition } from "../parser/types.js";

/**
 * How strongly C-CDA binds a value set to a coded slot, in the vocabulary the
 * standard's own general guidance defines: a SHALL binding is `required`, a
 * SHOULD or MAY binding is `preferred`.
 *
 * The distinction is the difference between a conformance failure and a
 * suggestion, which is why it is declared data here rather than assumed: only a
 * `required` row can produce `VALUE_SET_BINDING_VIOLATED`.
 *
 * @example
 * ```ts
 * import { valueSetBinding, type ValueSetBindingStrength } from "@cosyte/ccda";
 * const strength: ValueSetBindingStrength = valueSetBinding("medication").strength;
 * // "required"
 * ```
 */
export type ValueSetBindingStrength = "required" | "preferred";

/**
 * The normative artifact a binding row was read from, and that artifact's **own**
 * revision, so a reviewer holding a later revision can tell a row has gone stale
 * without re-deriving it.
 *
 * `revision` is the artifact's self-reported revision, never the date this
 * package read it: a re-read that changes nothing does not move it, and a newer
 * artifact does move it even if nobody has looked yet. That is the property a
 * staleness check needs, and it is the same rule
 * {@link RequiredSectionSource} follows.
 *
 * @example
 * ```ts
 * import { valueSetBinding } from "@cosyte/ccda";
 * valueSetBinding("vaccine").source.revision; // "2025-09-08"
 * ```
 */
export interface ValueSetBindingSource {
  /** The normative artifact, named as standards provenance. */
  readonly artifact: string;
  /** That artifact's own revision date, `YYYY-MM-DD`. */
  readonly revision: string;
}

/**
 * One checked slot's value-set binding as this package declares it: the value
 * set the C-CDA R2.1 template binds the slot to, how strongly it binds it, and
 * the provenance of that reading.
 *
 * Every field is a fixed literal this package owns. No part of a row comes from
 * a parsed document, which is what lets `valueSet` ride on a warning.
 *
 * @example
 * ```ts
 * import { valueSetBinding } from "@cosyte/ccda";
 * const binding = valueSetBinding("allergen");
 * binding.valueSet; // "2.16.840.1.113762.1.4.1010.1"
 * binding.conformanceId; // "CONF:1098-7419"
 * ```
 */
export interface ValueSetBinding {
  /** The checked slot this row is about. */
  readonly slot: CodeSlot;
  /** Required (a SHALL binding) or preferred (a SHOULD or MAY binding). */
  readonly strength: ValueSetBindingStrength;
  /**
   * The bound value set's published OID. An identifier, never its members, and
   * a member of the closed {@link BOUND_VALUE_SETS} list so that the compiler,
   * rather than review, holds the bound on what can reach a diagnostic.
   */
  readonly valueSet: BoundValueSet;
  /** The source's own name for that value set. */
  readonly valueSetName: string;
  /** The conformance statement the binding was read from (`CONF:` + digits). */
  readonly conformanceId: string;
  /** The template whose rule carries that statement, in the source's own words. */
  readonly sourceTemplate: string;
  /** The artifact the row was read from, and that artifact's own revision. */
  readonly source: ValueSetBindingSource;
}

/**
 * The single normative artifact every row here was read from: the C-CDA R2.1
 * Schematron HL7 publishes for that release.
 *
 * The revision is the artifact's own, the date of the last entry in the dated
 * manual-update log its head comment carries. A publication that adds a log
 * entry is a newer revision of the same artifact and every row here is stale
 * against it until re-read. It is the same artifact, at the same revision, that
 * `../parser/required-sections.ts` traced its SHALL tables to.
 * @internal
 */
const R21_SCHEMATRON: ValueSetBindingSource = {
  artifact: "HL7 C-CDA R2.1 normative Schematron (Consolidated CDA Templates for Clinical Notes)",
  revision: "2025-09-08",
};

/**
 * Each checked slot's declared binding, read off {@link R21_SCHEMATRON}.
 *
 * **One row is Preferred and four are Required, and that split is a fact about
 * the artifact rather than a policy of this package.** The Problem Observation's
 * `value` is the Preferred one: its rule says the value SHALL be present and its
 * code SHOULD be selected from the Problem value set (CONF:1198-9058). A
 * Required sentence naming the SAME value set does exist in the artifact, on the
 * Precondition for Substance Administration criterion (CONF:1098-7369) and on
 * other templates this parser does not slot-check, and taking a row from one of
 * those would report a SHALL violation on a conformant problem list.
 *
 * **The route row's scope is stated rather than implied.** The artifact carries
 * exactly one element-level binding for a route of administration, on the
 * Medication Activity (CONF:1098-7514), and this package checks the `route` slot
 * at an Immunization Activity's `routeCode` as well, where R2.1 binds the
 * element's own code to nothing and binds only its `<translation>`
 * (CONF:1198-32970). The row names the sentence it was read from so that scope
 * is visible; no second row is invented for a slot the artifact does not bind
 * separately, and the slot set is not widened to carry one.
 * @internal
 */
const SLOT_VALUE_SET_BINDINGS: Readonly<Record<CodeSlot, ValueSetBinding>> = Object.freeze({
  problem: {
    slot: "problem",
    strength: "preferred",
    valueSet: "2.16.840.1.113883.3.88.12.3221.7.4",
    valueSetName: "Problem",
    conformanceId: "CONF:1198-9058",
    sourceTemplate:
      "Problem Observation (V3) (urn:hl7ii:2.16.840.1.113883.10.20.22.4.4:2015-08-01)",
    source: R21_SCHEMATRON,
  },
  medication: {
    slot: "medication",
    strength: "required",
    valueSet: "2.16.840.1.113762.1.4.1010.4",
    valueSetName: "Medication Clinical Drug",
    conformanceId: "CONF:1098-7412",
    sourceTemplate:
      "Medication Information (V2) (urn:hl7ii:2.16.840.1.113883.10.20.22.4.23:2014-06-09)",
    source: R21_SCHEMATRON,
  },
  allergen: {
    slot: "allergen",
    strength: "required",
    valueSet: "2.16.840.1.113762.1.4.1010.1",
    valueSetName: "Substance Reactant for Intolerance",
    conformanceId: "CONF:1098-7419",
    sourceTemplate:
      "Allergy - Intolerance Observation (V2) (urn:hl7ii:2.16.840.1.113883.10.20.22.4.7:2014-06-09)",
    source: R21_SCHEMATRON,
  },
  route: {
    slot: "route",
    strength: "required",
    valueSet: "2.16.840.1.113883.3.88.12.3221.8.7",
    valueSetName: "SPL Drug Route of Administration Terminology",
    conformanceId: "CONF:1098-7514",
    sourceTemplate:
      "Medication Activity (V2) (urn:hl7ii:2.16.840.1.113883.10.20.22.4.16:2014-06-09)",
    source: R21_SCHEMATRON,
  },
  vaccine: {
    slot: "vaccine",
    strength: "required",
    valueSet: "2.16.840.1.113762.1.4.1010.6",
    valueSetName: "CVX Vaccines Administered Vaccine Set",
    conformanceId: "CONF:1098-9007",
    sourceTemplate:
      "Immunization Medication Information (V2) (urn:hl7ii:2.16.840.1.113883.10.20.22.4.54:2014-06-09)",
    source: R21_SCHEMATRON,
  },
});

/**
 * The value-set binding this package declares for one checked slot: the bound
 * value set, how strongly C-CDA R2.1 binds it, and the artifact and artifact
 * revision the row was read from.
 *
 * @example
 * ```ts
 * import { valueSetBinding } from "@cosyte/ccda";
 * valueSetBinding("route").strength; // "required"
 * valueSetBinding("problem").strength; // "preferred"
 * ```
 */
export function valueSetBinding(slot: CodeSlot): ValueSetBinding {
  return SLOT_VALUE_SET_BINDINGS[slot];
}

/**
 * Every declared binding, in {@link CODE_SLOTS} order: the whole table a
 * consumer needs to see which slots this package will report against and which
 * value sets their own package has to hold to answer for them.
 *
 * @example
 * ```ts
 * import { valueSetBindings } from "@cosyte/ccda";
 * valueSetBindings().filter((b) => b.strength === "required").length; // 4
 * ```
 */
export function valueSetBindings(): readonly ValueSetBinding[] {
  return CODE_SLOTS.map((slot) => SLOT_VALUE_SET_BINDINGS[slot]);
}

/**
 * Ask the consumer's {@link ValueSetSource} whether a coded value is a member of
 * the value set its slot's binding names, and report what comes back.
 *
 * The four outcomes are exhaustive and each is deliberate:
 *
 * - **no source, or a Preferred row**: nothing is asked and nothing is emitted.
 *   A parse with no source behaves exactly as it always has, and a Preferred
 *   binding never reaches the finding reserved for a Required one.
 * - **`undefined`**: the source declares no opinion, the same "out of my scope"
 *   answer a {@link TerminologyAdapter} gives, and the slot stays silent.
 * - **`no-expansion`**: the source holds no expansion for that value set, so the
 *   binding was **not evaluated**. `VALUE_SET_BINDING_NOT_EVALUATED` says so,
 *   because silence here would read as membership.
 * - **`not-a-member`**: `VALUE_SET_BINDING_VIOLATED`, the code preserved
 *   verbatim and never coerced.
 *
 * **An exception the source raises is not swallowed.** A failing value-set
 * service must surface to its owner rather than be masked into a document that
 * merely looks checked, which is the same rule the terminology adapter follows.
 *
 * The binding is a parameter rather than a lookup so that the caller decides
 * which row is in force, which is what lets a test drive this with a Preferred
 * row whatever the declared table says.
 * @internal
 */
export function checkValueSetBinding(
  binding: ValueSetBinding,
  coding: TerminologyCoding,
  position: CcdaPosition,
  ctx: ParseCtx,
): void {
  const source: ValueSetSource | undefined = ctx.valueSets;
  if (source === undefined) return;
  // A Preferred binding is guidance. Reporting a departure from it with the code
  // a Required binding owns would turn a conformant document into a reported
  // SHALL violation at a safety-critical slot.
  if (binding.strength !== "required") return;

  const answer = source.isMember({ valueSet: binding.valueSet, coding });
  // `undefined` = the source declares no opinion (this value set is outside what
  // it answers for), which is not the same statement as "it holds no expansion":
  // that one is `no-expansion` below and is reported.
  if (answer === undefined) return;
  switch (answer.membership) {
    case "member":
      return;
    case "not-a-member":
      ctx.emit(valueSetBindingViolated(position, binding.slot, binding.valueSet, source.release));
      return;
    case "no-expansion":
      ctx.emit(
        valueSetBindingNotEvaluated(position, binding.slot, binding.valueSet, source.release),
      );
      return;
  }
}

/**
 * Run the value-set membership check for one coded value at one slot, when the
 * value names both a system and a symbol.
 *
 * A `nullFlavor`-only `CD` carries no membership claim to test, and a symbol
 * with no system is already reported (`MISSING_CODE_SYSTEM`) and can identify
 * nothing, so neither is handed to the source. Nothing here reads or returns a
 * document value: the coded value is passed to the consumer's own source and is
 * otherwise untouched.
 * @internal
 */
export function checkSlotValueSetBinding(
  code: CD,
  system: string,
  slot: CodeSlot,
  position: CcdaPosition,
  ctx: ParseCtx,
): void {
  if (ctx.valueSets === undefined) return;
  const symbol = code.code;
  if (symbol === undefined) return;
  const coding: TerminologyCoding = {
    system,
    code: symbol,
    ...(code.displayName !== undefined ? { display: code.displayName } : {}),
  };
  checkValueSetBinding(valueSetBinding(slot), coding, position, ctx);
}
