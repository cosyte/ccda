---
"@cosyte/ccda": patch
---

Phase 7 (first slice) — document **builder** `buildCcda` (CCDA-P7).

Adds the conservative _emit_ factory `buildCcda`, symmetric with `parseCcda` and mirroring the
sibling `@cosyte/hl7`'s `buildMessage`: from a semantic `BuildCcdaInit` it assembles a **spec-clean
C-CDA R2.1 Continuity of Care Document (CCD)** and returns a real `CcdaDocument`.

**Round-trip by construction.** The builder emits through the _same DOM the parser reads_ — it builds
an `@xmldom/xmldom` document with `createElementNS` (so the serializer performs all XML escaping),
serializes it with the shared `serializeDocument`, then parses that text with `parseCcda`. The
returned document is therefore the parse of the emitted XML, so a document `buildCcda` emits always
parses back to the same structured content and `parseCcda(doc.toString()).toString() === doc.toString()`
holds automatically. A clean build carries **zero warnings**.

**What this slice emits.** A CCD with the full US Realm Header (realmCode, typeId, the US Realm Header
`…22.1.1@2015-08-01` + CCD `…22.1.2@2015-08-01` templateIds, id, LOINC document code `34133-9`, title,
effectiveTime, confidentialityCode, languageCode, `recordTarget` with SHALL `addr`/`telecom`, a device
`author`, and a `custodian` — no invented person, no PHI) and the two safety-critical reconciliation
sections:

- **Problems** — Problem Concern Act `…22.4.3` → Problem Observation `…22.4.4`, the coded condition in
  `value xsi:type="CD"` (SNOMED CT default, or ICD-10-CM), active/resolved/inactive mapped to the
  concern `statusCode` (never guessed), narrative regenerated so code and text agree.
- **Allergies** — Allergy Concern Act `…22.4.30` → Allergy-Intolerance Observation `…22.4.7`, allergen
  at `participant/participantRole/playingEntity/code`, optional Reaction `…22.4.9` / Severity `…22.4.8`
  / Criticality `…22.4.145` (severity and criticality kept as distinct axes), the propensity `type`
  overridable and defaulting to the **neutral** SNOMED `419199007` "Allergy to substance" (never a
  guessed "Drug allergy" for a non-drug allergen), and the **`negationInd` "No Known Allergies"** form
  emitted as a negation with no `nullFlavor` — the single most safety-critical emit rule.

The other CCD SHALL sections (Medications, Results) are emitted as spec-clean **empty, entries-optional**
`nullFlavor="NI"` sections (they declare the entries-optional templateId only — never the entries-required
`.1` with zero entries), so the document is conformant with no `REQUIRED_SECTION_MISSING`.

New public exports: `buildCcda` and the input types `BuildCcdaInit`, `BuildCcdaPatient`,
`BuildCcdaProblem`, `BuildCcdaAllergy`, `BuildCode`. No parser change, no warning-code change.

**Deferred to a later CCDA-P7 increment:** richer section builders (Medications, Results, Vital Signs,
Immunizations, Procedures, and the rest), the other eleven document types, and the
bring-your-own-credentials semantic-terminology adapter + optional bundled redistributable data.

Synthetic-only fixtures throughout (the canonical "Jane Doe", generic placeholder MRNs, round dates,
standard terminology codes, fake OIDs) — no realistic PHI; omitted demographics emit `nullFlavor="UNK"`
rather than invented values.
