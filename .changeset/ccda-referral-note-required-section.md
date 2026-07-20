---
"@cosyte/ccda": patch
---

Phase 7 (fifteenth slice) — the Referral Note SHALL set now asserts Reason for Referral (CCDA-P7).

Reconciles the parser's per-document-type required-section (SHALL) table with the section catalog the
fourteenth slice (Referral Note document type, PR #38) expanded. That slice added a recognized
**Reason for Referral** Section catalog key but explicitly left every document type's required-section
table unchanged; this closes that follow-up. The Referral Note document
(`2.16.840.1.113883.10.20.22.1.14`) SHALL contain a Reason for Referral Section, so a Referral Note that
omits it is non-conformant and should be flagged.

**Change.** `requiredSectionKeys("referralNote")` becomes
`["allergies", "medications", "problems", "reasonForReferral"]`. A Referral Note carrying the
Problems/Allergies/Medications triad but no Reason for Referral now raises a single
`REQUIRED_SECTION_MISSING` **warning** for `reasonForReferral` — never a fatal (a missing required section
never blocks reading the data that is present), and the section is only ever flagged when the recognized
catalog key is absent. The builder's own Referral Note (which always emits the section) stays warning-free
and round-trips fixed-point, unchanged.

**Grounding (firsthand, normative).** Traced to the normative C-CDA R2.1 Schematron — the 1,010,531-byte
`HL7/CDA-ccda-2.1` validation `.sch` (the roadmap's cited authority). The Referral Note document pattern
asserts as SHALL: Problem (CONF:1198-29087), Allergies and Intolerances (CONF:1198-30912), Medications
(CONF:1198-30923), and Reason for Referral (CONF:1198-30925). Deliberately still omitted, per the table's
conservative "unconditional, in-catalog, high-confidence SHALL only" design:

- the **Assessment-and-Plan** requirement (CONF:1198-29102 — an Assessment and Plan Section, or an
  Assessment Section and a Plan of Treatment Section: a **choice** constraint, so neither half is asserted);
- **Results** (CONF:1198-29090) and **Plan of Treatment** (CONF:1198-29066), which the Schematron marks
  **SHOULD**, not SHALL. (The build.fhir.org StructureDefinition lists `payers` and `plan` at `min=1`; that
  was confirmed against the Schematron to be StructureDefinition drift and is **not** encoded.)

No new or renamed warning codes; no public-API shape change. Purely a broadening of the conservative
required-section table (additive and safe, per its module contract).

Deferred: reconciling the other document types' SHALL tables against the expanded catalog (e.g. Transfer
Summary, Discharge Summary) is a separate slice, each needing its own firsthand Schematron trace; and the
remaining ten emittable document types remain builder-deferred.
