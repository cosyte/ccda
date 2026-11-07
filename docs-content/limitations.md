---
id: limitations
title: Known limitations
sidebar_label: Known limitations
sidebar_position: 17
description: The boundaries of what the package reads, builds, and validates, stated so you can decide before you rely on it.
---

# Known limitations

- **A subject override withholds and warns; it never models the third party.** There is no accessor for
  an entry another subject governs: it is reachable only through `toString()`. And because presence is
  the trigger, a document that repeats the patient as an entry subject loses those entries from the
  record-target read paths. Both are deliberate, and the second is the accepted cost of never guessing
  that a declared subject "is really the patient".
- **Fourteen entry families (so far)**: Problems / Medications / Allergies / Results / Vital Signs /
  Immunizations / Procedures / Encounters / Social-History smoking status / Plan of Treatment /
  Functional Status / Mental Status / Family History / Past Medical History are extracted; any remaining
  sections still carry only identity and narrative.
- **UCUM validation is grammatical, on a curated atom subset**: the validator checks that a unit is
  well-formed UCUM (case-sensitive prefixes/atoms, `.`/`/` terms, `[…]` and `{…}` forms) against a
  curated table of the prefixes and atoms that appear in lab Results and Vital Signs, not the full
  UCUM atom registry. A valid but uncurated atom may read as `NON_UCUM_UNIT`; the raw unit is always
  preserved, so nothing is lost.
- **LOINC deprecation is a curated set**: `checkLoincDeprecation` flags a curated list of known
  deprecated LOINC codes, not every deprecation in the LOINC release. As with all code-system checks,
  this is recognition only: membership validation needs a licensed terminology service.
- **A terminology adapter is consulted at five coded slots only**: `problem`, `medication`, `allergen`,
  `route`, `vaccine`. Results/Vital Signs LOINC codes, procedure, encounter, and
  family-history codes, the planned-item codes for the five variants whose `code` is the planned act
  (a planned **medication**'s `code` is the drug and a planned **immunization**'s is the vaccine, so
  those two go to the `medication` and `vaccine` slots),
  the smoking/functional/mental status values, the allergy propensity type, and
  the reaction/severity/criticality observations are never handed to it. Within the five, the checks
  apply to the slot's primary coding; alternate codings in `<translation>` are preserved but not
  slot-checked. A clean run means those five slots passed, **not** that the document was
  terminology-verified.
- **Required-section (SHALL) validation under-warns, and every type says by how much**: CCD and Care
  Plan report `traced-complete`; the other nine structured types report `traced-partial`, naming the
  SHALL sections they do not assert and why; Unstructured Document reports `not-applicable` because it
  carries no section; no type reports `untraced`. Progress Note, Procedure Note, Operative Note, and
  Diagnostic Imaging Report assert nothing, because every SHALL section their template names is either
  outside the recognized catalog or a choice. A document of a `traced-partial` type can still be
  missing a section its type requires and parse clean: read `requiredSectionStatus(documentType)`
  rather than treating a quiet parse as a conformance result.
- **Editing is whole-section, across twelve kinds**: Functional Status and Mental Status are buildable
  but **not editable** (each takes three separate content lists), as are the Referral Note's
  narrative-only Assessment and Reason for Referral sections. There is no entry-level append (a
  `replace` rebuilds the section from your typed input, dropping unmodeled detail in it), no section
  removal, and no `APND` / `XFRM` relationship: an edit stamps `RPLC` only.
- **Serializer re-emits a parsed document; the builder constructs one**: `serializeCcda` / `toString()`
  faithfully re-emit a _parsed_ document (the spec-clean emit half of Postel's Law). To construct a
  document from scratch, `buildCcda` emits a spec-clean **CCD**, **Referral Note**
  (`documentType: "referralNote"`) or inpatient **Discharge Summary**
  (`documentType: "dischargeSummary"`) with the US Realm header. A CCD always carries its six SHALL
  sections (**Problems, Allergies, Medications, Results, Vital Signs, and Social History**), plus
  **Immunizations, Procedures, Encounters, Functional
  Status, Mental Status, Past Medical History, Plan of Treatment, and Family History** emitted only
  when populated (none is a CCD SHALL section); a Referral Note instead specializes the header and
  always emits Problems, Allergies, Medications, Reason for Referral, Assessment, and Plan of Treatment,
  emitting Results, Vital Signs and Social History only when you supply them;
  and a Discharge Summary specializes the header with its own SHALL set (Allergies, Hospital Course,
  Discharge Diagnosis, Plan of Treatment) plus the `componentOf/encompassingEncounter` frame its
  template requires, an encounter period and a discharge disposition, each emitted verbatim when
  supplied and as an explicit `nullFlavor="UNK"` when not, never derived from another date in the
  document. A Discharge Summary emits Problems and Medications only when you supply them, the
  medications in the Medications Section (it does not emit the Discharge Medications Section). Input
  one type carries is **refused**, never dropped: `hospitalCourse`, `dischargeDiagnoses`, and
  `encompassingEncounter` throw on a CCD or a Referral Note, and `assessment` and `reasonForReferral`
  throw on a Discharge Summary. (A CCD still ignores `assessment` and `reasonForReferral`, as it
  always has.)
  To change a section of a document you already parsed, use `editCcda`. The remaining nine document
  types are not implemented. "Spec-clean" here means well-formed,
  correctly-templated, and **round-tripping** through `parseCcda` with zero warnings, for all three
  types. A Discharge Summary's **Hospital Course** section (CONF:1198-30522) is an IHE PCC template
  the parser recognizes by its root but does not assert as required, so a reparse will not report it
  missing: `pnpm conformance` is what checks that it is there.
  Every entry
  emits the `SHALL`-cardinality `effectiveTime` its C-CDA R2.1 template requires: the Problems/Allergies
  concern acts + observations, the Medication Activity `IVL_TS` duration, and the Results/Vital Signs
  organizers + observations. When the caller supplied a time it is used; when a `SHALL` requires the
  element but no time is known the slot is `nullFlavor="UNK"` (satisfying the cardinality without inventing
  a clinical time, read back as absent), the same fail-safe as the header's `SHALL` `addr`/`telecom` and
  the never-guessed `dose`/`route`. The reaction/severity/criticality sub-observations' optional
  (`0..1`, non-`SHALL`) `effectiveTime` is not emitted.
- **A Functional Status Organizer is written only when it carries a self-care activity.** The R2.1
  template SHALL contain a Self-Care Activities (ADL and IADL) observation as well as a Functional
  Status Observation, so `BuildCcdaFunctionalStatusOrganizer` takes `selfCareActivities` (the
  activity assessed as `code`, the ability observed as `value`, each `nullFlavor="UNK"` when you
  supply none). Pass no activity and the organizer is **not** written: its findings are emitted as
  standalone Functional Status Observations, all of them present and read back unchanged, and the
  returned document carries `MISSING_SELF_CARE_ACTIVITY` saying the grouping, its categorization
  code and its `effectiveTime` were dropped. The builder will neither invent an assessment nobody
  performed nor stamp a template the document does not satisfy.

- **Vendor profiles tolerate, they never relax safety**: a `CcdaProfile` only downgrades the
  **non-safety-critical** deviations it expects (re-badged `PROFILE_QUIRK_APPLIED`, flagged
  `expected`); it can never tolerate a dose, allergen, unit, identity, or wrong or missing code system
  warning (refused at `defineCcdaProfile()` time) and never changes an extracted value. Besides
  `ccdaProfiles.default`, which tolerates nothing, two built-ins ship (`ccdaProfiles.smartScorecard`,
  `ccdaProfiles.legacyR11`), each grounded in a cited public source; named per-vendor profiles await a
  real vendor-attributed grounding document.
