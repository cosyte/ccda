---
"@cosyte/ccda": patch
---

Phase 7 (twenty-fourth slice) — `buildCcda` consumes the terminology adapter's `translate` (`$translate`) to emit `<translation>` alternate codings (CCDA-P7).

The `TerminologyAdapter.translate` method shipped defined-but-unconsumed in the twenty-first slice; this
wires it into the builder. When a caller supplies an adapter whose optional `translate` returns an alternate
coding for a clinical coded slot, `buildCcda` emits a spec-clean CDA R2 `<translation>` child on the
relevant CD/CE element (`<value xsi:type="CD">` or `<code>`/`<routeCode>`) **beside** the primary code —
`@cosyte/ccda` still imports no terminology library and only calls the adapter you supply.

- **Additive, never a coercion.** A `<translation>` is only ever an *additional* alternate coding alongside
  the original `@code`/`@codeSystem`; the primary code is emitted verbatim and is never replaced. This is
  the same discipline the validation path already follows — the adapter can add to a coded slot, never
  change it.
- **Never fabricated.** `translate` returning `undefined` (no opinion) or an empty `matches` (source
  unmapped) emits **no** `<translation>` and leaves output byte-identical; only a concrete adapter-supplied
  coding produces one. A match missing a `system` (not an unambiguous CD) is dropped rather than emitted
  half-formed — conservative on emit.
- **Opt-in, non-breaking.** No adapter, a validation-only adapter (no `translate`), or a `translate` with no
  opinions all yield byte-identical output to the pre-adapter build. `translate` stays optional on the
  interface.
- **Scoped to the recognized clinical slots.** Translations are emitted for the coded slots the parser
  recognizes via `checkCodeSlot` — problem value, allergen, medication drug + route, vaccine + route.
  Structural act/section codes (`ASSERTION`, section LOINC) are never handed to `translate`, mirroring the
  validation path's slot discipline. Results/vitals LOINC and reaction/severity/criticality values are out
  of this slice's scope, as is the `buildSectionComponent` edit/append path.
- **Round-trips.** Emitted at the correct CD/CE `xs:sequence` position (`translation` follows
  `originalText`/`qualifier`, neither of which these emitters produce). The parser reads the primary code
  unchanged and surfaces each alternate in `CD.translation` (`parseCd` already reads `<translation>`
  shallowly), so a translated build round-trips through `parseCcda` with zero new warnings. A match's
  `version` is emitted as the spec `@codeSystemVersion` (the parser's shallow translation read does not
  currently surface it — a pre-existing read scope, not a regression).

No public API or warning-code change: the surface is the existing optional `TerminologyAdapter.translate`
consumed on the `buildCcda` / `BuildCcdaOptions.terminology` path. Grounded against the HL7 v3 CD/CE
datatype (`translation` is permitted on both; its `xs:sequence` position) and the FHIR `$translate`
out-parameters (`match`/`concept`) the interface mirrors. Slice verified NOT REFUTED by the
conformance-refuter gate.
