# Known limitations, in full

Every boundary this package states about itself, under-warning rather than talked around.
Moved out of `README.md` so the front page stays short enough to read in one sitting. Nothing
is rewritten: the heading and the prose below are the ones `README.md` carried, and
`README.md` links here from the heading the text left behind.

## Known limitations

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
  `route`, `vaccine`. Results/Vital Signs LOINC codes, procedure, encounter and
  family-history codes, the planned-item codes for the five variants whose `code` is the planned act
  (a planned **medication**'s `code` is the drug and a planned **immunization**'s is the vaccine, so
  those two go to the `medication` and `vaccine` slots),
  the smoking/functional/mental status values, the allergy propensity type, and
  the reaction/severity/criticality observations are never handed to it. Within the five, the checks
  apply to the slot's primary coding; alternate codings in `<translation>` are preserved but not
  slot-checked. A clean run means those five slots passed, **not** that the document was
  terminology-verified.
- **Required-section (SHALL) validation under-warns, and every type says by how much**: five of the
  twelve report `traced-partial` (Consultation Note, Progress Note, Procedure Note, Operative Note,
  Diagnostic Imaging Report), naming the SHALL sections they do not assert and why; Unstructured
  Document reports `not-applicable` because it carries no section; the remaining six report
  `untraced`, so no claim is made that their sets are complete. Four of the five traced types assert
  nothing, because every SHALL section their template names is either outside the recognized catalog
  or a choice. A document of a `traced-partial` or `untraced` type can still be missing a section its
  type requires and parse clean: read `requiredSectionStatus(documentType)` rather than treating a
  quiet parse as a conformance result.
- **Editing is whole-section, across twelve kinds**: Functional Status and Mental Status are buildable
  but **not editable** (each takes three separate content lists), as are the Referral Note's
  narrative-only Assessment and Reason for Referral sections. There is no entry-level append (a
  `replace` rebuilds the section from your typed input, dropping unmodeled detail in it), no section
  removal, and no `APND` / `XFRM` relationship: an edit stamps `RPLC` only.
- **Serializer re-emits a parsed document; the builder constructs one**: `serializeCcda` / `toString()`
  faithfully re-emit a _parsed_ document (the spec-clean emit half of Postel's Law). To construct a
  document from scratch, `buildCcda` emits a spec-clean **CCD** or **Referral Note**
  (`documentType: "referralNote"`) with the US Realm header + the CCD's six SHALL sections
  (**Problems, Allergies, Medications, Results, Vital Signs, and Social History**), plus
  **Immunizations, Procedures, Encounters, Functional
  Status, Mental Status, Past Medical History, Plan of Treatment, and Family History** emitted only
  when populated (none is a CCD SHALL section); a Referral Note additionally
  specializes the header and emits its own SHALL set (Reason for Referral, Assessment, Plan of Treatment).
  To change a section of a document you already parsed, use `editCcda`. The remaining ten document
  types are not implemented. "Spec-clean" here means well-formed,
  correctly-templated, and **round-tripping** through `parseCcda` with zero warnings. Every entry
  emits the `SHALL`-cardinality `effectiveTime` its C-CDA R2.1 template requires: the Problems/Allergies
  concern acts + observations, the Medication Activity `IVL_TS` duration, and the Results/Vital Signs
  organizers + observations. When the caller supplied a time it is used; when a `SHALL` requires the
  element but no time is known the slot is `nullFlavor="UNK"` (satisfying the cardinality without inventing
  a clinical time, read back as absent), the same fail-safe as the header's `SHALL` `addr`/`telecom` and
  the never-guessed `dose`/`route`. **Limitation:** the builder does not assert full XSD
  element-order or the complete Schematron rule set, and this gap was grounded against the raw C-CDA R2.1
  IG text rather than a validator run, so a `buildCcda` document is expected-but-not-proven to pass an
  external IG validator. The reaction/severity/criticality sub-observations' optional (`0..1`, non-`SHALL`)
  `effectiveTime` is not emitted.
- **Vendor profiles tolerate, they never relax safety**: a `CcdaProfile` only downgrades the
  **non-safety-critical** deviations it expects (re-badged `PROFILE_QUIRK_APPLIED`, flagged
  `expected`); it can never tolerate a dose/allergen/unit/identity/code-system warning (refused at
  `defineCcdaProfile()` time) and never changes an extracted value. Two built-ins ship
  (`ccdaProfiles.smartScorecard`, `ccdaProfiles.legacyR11`), each grounded in a cited public source;
  named per-vendor profiles await a real vendor-attributed grounding document.

