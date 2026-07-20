---
"@cosyte/ccda": patch
---

Phase 7 (fourteenth slice) — builder emits a second C-CDA document type, the Referral Note (CCDA-P7).

Establishes the **multi-document-type pattern** in `buildCcda`: it now emits either a **CCD** (default) or
a **Referral Note** (`documentType: "referralNote"`), each with its own US Realm Header specialization and
document-type-specific SHALL section set. Previously the builder emitted only a CCD and threw for the other
eleven types, while `parseCcda` already read all twelve — this closes the first of that asymmetry.
Confirmed firsthand against the C-CDA R2.1 IG document-level StructureDefinition
(`2.16.840.1.113883.10.20.22.1.14`) and the **CC0** `onc-healthit/2015-certification-ccda-testdata` ToC
Referral Note certification sample (`170.315_b1_toc_amb_rn_r21_sample1`). A clean Referral Note build
carries **zero warnings** and round-trips through `parseCcda` fixed-point, exactly like a CCD.

**Header specialization.** The Referral Note carries the document `templateId` root
`2.16.840.1.113883.10.20.22.1.14` (R2.1 `2015-08-01` stamp) and the LOINC document `code` `57133-1`
"Referral Note" (title defaults to it, overridable). A `DOC_TYPE_SPECS` table drives the header
(`templateId` + `code`) and the SHALL section set per type, so the two document types share one emit path.

**Referral Note SHALL section set.** Always emitted:

- **Problems**, **Allergies**, **Medications** — the entries-required clinical trio, each emitted as a
  spec-clean empty `nullFlavor="NI"` section when the caller supplies no content (the entries-required
  `.X.1` templateId is correctly dropped for an empty section).
- **Reason for Referral** (V2, `1.3.6.1.4.1.19376.1.5.3.1.3.1`, `@extension 2014-06-09`, LOINC `42349-1`) —
  narrative-only, from the new optional `reasonForReferral` init string; `nullFlavor="NI"` when omitted.
- **Assessment** (`2.16.840.1.113883.10.20.22.2.8`, LOINC `51848-0`) — narrative-only, from the new
  optional `assessment` init string. The Assessment Section is **unversioned** in C-CDA R2.1 (no R2.0/R2.1
  revision), so it is emitted as a **root-only** `templateId` with **no `@extension`**; `nullFlavor="NI"`
  when omitted.
- **Plan of Treatment** (`2.16.840.1.113883.10.20.22.2.10`, `@extension 2014-06-09`, LOINC `18776-5`) —
  structured when `planOfTreatment` items are supplied, else an empty `nullFlavor="NI"` section.

Assessment + Plan of Treatment together satisfy the Referral Note's "Assessment and Plan (V2) OR
(Assessment + Plan of Treatment)" SHALL choice via the two-section branch. **Results** and **Vital Signs**
are **not** Referral Note SHALL sections (`0..1` in the IG) — unlike in a CCD, where the builder always
emits them, a Referral Note emits them only when the caller supplies content, never a fabricated empty one.

**Nothing clinical is fabricated.** An unpopulated SHALL section is an explicit empty (`nullFlavor="NI"`),
never invented content; the narrative Assessment / Reason-for-Referral sections carry only caller-supplied
text.

**Parser (recognition).** The section catalog gains a `reasonForReferral` entry (LOINC `42349-1`, template
root `1.3.6.1.4.1.19376.1.5.3.1.3.1`) so the emitted Reason-for-Referral section is recognized (no
`UNKNOWN_SECTION_CODE`) and the Referral Note round-trips warning-free. Purely additive — no change to any
document type's required-section table, and CCD emit is byte-unchanged (same SHALL sections, order,
templateIds, codes).

New/changed public surface: `BuildCcdaInit.documentType` widens to `"ccd" | "referralNote"`, and
`BuildCcdaInit` gains optional `assessment` and `reasonForReferral` narrative strings (ignored for a CCD).
No warning-code change.

Deferred: the remaining ten document types (Discharge Summary, Consultation Note, History & Physical,
Progress Note, etc.); C-CDA document editing; the bring-your-own-credentials terminology adapter; and the
external-validator/Schematron differential-testing gate.
