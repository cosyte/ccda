---
"@cosyte/ccda": minor
---

**This is 0.1.0, the first release whose public API we treat as settled.**

What is covered, and what you can build against:

- Reading C-CDA R2.1 documents: all twelve US Realm document types are recognized, the header and
  the patient are typed, and fourteen entry families are extracted (problems, medications,
  allergies, results, vital signs, immunizations, procedures, encounters, smoking status, plan of
  treatment, functional status, mental status, family history and past medical history), each coded
  value keeping the code system it was sent with.
- Lenient parsing with stable warning codes and a `{ strict: true }` mode that refuses the first
  tolerated deviation; hostile XML (a DTD, entity expansion, an oversized or over-deep document) is
  always refused.
- Building a spec-clean CCD, Referral Note or inpatient Discharge Summary with `buildCcda`, editing
  a parsed document section by section with `editCcda` (which stamps a CDA R2 revision), and
  re-serializing a parsed document, where parse and serialize are a fixed point.
- Required-section validation that reports, for every document type, how much of its obligation it
  asserts, and UCUM checks on the quantities in results and vital signs.

What the version promises. The exported names, options, return shapes and warning codes are the
surface we keep stable. While the package is below 1.0, a breaking change bumps the minor version
(0.1 to 0.2) and is called out in this changelog with its migration; a fix that changes no public
value ships as a patch.

What is not covered yet. `buildCcda` emits three of the twelve document types and throws for the
other nine. Editing replaces or adds whole sections only: no entry-level append and no section
removal. Required-section validation under-warns for most document types, so a quiet parse is not a
conformance result. A terminology adapter is consulted at five coded slots only, and this package
ships value set identifiers, never their member codes. UCUM checking is grammatical over a curated
set of atoms.
