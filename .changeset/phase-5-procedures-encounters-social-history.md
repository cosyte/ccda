---
"@cosyte/ccda": patch
---

Phase 5 — remaining clinical sections + per-document-type required-section validation. `parseCcda(xml)`
now extracts three more entry families and validates a document's SHALL sections:

- **Procedures** — the three Procedure Activity templates a Procedures section can carry: an
  altering/operative `<procedure>` (`…22.4.14`), a non-altering `<act>` service (`…22.4.12`), and an
  assessment `<observation>` (`…22.4.13`), preserved as a `kind` discriminant. **`moodCode` is
  safety-critical here:** a performed procedure (`EVN`) and a planned/ordered one
  (`INT`/`RQO`/`PRMS`/`PRP`/`APT`/`ARQ`) are surfaced as a `disposition` of `"performed"` vs
  `"planned"` and **never conflated** — a missing mood is `PLANNED_VS_PERFORMED_AMBIGUOUS` and an
  unrecognized mood is `PROCEDURE_MOOD_UNEXPECTED`, both leaving `disposition` undefined rather than
  guessing. A `negationInd` "did not happen" stays distinct from a `nullFlavor` "unknown". Surfaced via
  `doc.getProcedures()` / `doc.procedures`.
- **Encounters** — the Encounter Activity (`…22.4.49`) `<encounter>`: the visit type `code`,
  `statusCode`, and visit-period `effectiveTime`. Surfaced via `doc.getEncounters()` / `doc.encounters`.
- **Social History — Smoking Status** — the Smoking Status — Meaningful Use observation (`…22.4.78`):
  the SNOMED CT `value` from the Current Smoking Status value set (`…11.20.9.38`). An explicitly-unknown
  status (a `nullFlavor` or an "unknown" SNOMED concept) sets `unknown: true` and emits
  `SMOKING_STATUS_UNKNOWN` — never silently read as "never smoked"; a value outside the value set is
  preserved verbatim and flagged `SMOKING_STATUS_CODE_UNRECOGNIZED`. Surfaced via
  `doc.getSmokingStatus()` / `doc.smokingStatus`.

Adds **per-document-type required-section (SHALL) validation**: for a recognized `DocumentType`, a
required catalog section that is absent emits `REQUIRED_SECTION_MISSING` (a Tier-2 **warning**, never a
fatal — a missing required section never blocks reading the data that _is_ present). The table is
**conservative**: it asserts only unconditional, in-catalog, high-confidence SHALL constraints, and
deliberately omits choice constraints (`A OR B`), SHOULD/MAY sections, and SHALL sections outside the
recognized catalog. The new `requiredSectionKeys(documentType)` and
`missingRequiredSections(documentType, presentKeys)` expose the table.

Five new Tier-2 warning codes: `REQUIRED_SECTION_MISSING`, `PROCEDURE_MOOD_UNEXPECTED`,
`PLANNED_VS_PERFORMED_AMBIGUOUS`, `SMOKING_STATUS_UNKNOWN`, `SMOKING_STATUS_CODE_UNRECOGNIZED`.
