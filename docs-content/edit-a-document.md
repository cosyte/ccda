---
id: edit-a-document
title: Edit a document
sidebar_label: Edit a document
description: "Add or replace one section of a parsed C-CDA document, keep every other section byte for byte, and stamp a CDA R2 revision."
---

# Edit a document

You have a C-CDA document, and you need to correct one section (add a Problem, swap out the
Medications) and send the fix, **without** disturbing every other section or losing the audit trail
that this is a new version of the original.

`editCcda(doc, options)` is the read→edit→write loop. It takes a document from `parseCcda`, rebuilds
only the section you target (through the same emitters `buildCcda` uses), and carries every other
section through **byte-for-byte**. By default it stamps a CDA R2 revision: a new document `id`, the
same version-series `setId`, an incremented `versionNumber`, and a `relatedDocument typeCode="RPLC"`
naming the version it replaces.

```ts runnable
import { buildCcda, editCcda, parseCcda } from "@cosyte/ccda";

// Start from a document the parser produced (here, one we built and re-parsed).
const original = parseCcda(
  buildCcda({
    patient: { mrn: "MRN-00042", given: ["Jane"], family: "Doe" },
    documentId: "DOC-1",
    problems: [{ problem: { code: "38341003", displayName: "Hypertension" }, status: "active" }],
    medications: [{ drug: { code: "197361", displayName: "Amlodipine 5 MG" } }],
  }).toString(),
);

const revised = editCcda(original, {
  sections: [
    // Replace the Medications section wholesale…
    {
      kind: "medications",
      mode: "replace",
      content: [{ drug: { code: "314076", displayName: "Lisinopril 10 MG" } }],
    },
    // …and add a Family History section the source did not have.
    {
      kind: "familyHistory",
      content: [
        {
          relative: { relationship: { code: "72705000", displayName: "Mother" } },
          observations: [{ condition: { code: "73211009", displayName: "Diabetes mellitus" } }],
        },
      ],
    },
  ],
});

revised.getMedications()[0]?.drug?.code; // => "314076"
revised.getFamilyHistory().length; // => 1
// The untouched Problems section is preserved:
revised.getProblems()[0]?.problems[0]?.value?.code; // => "38341003"

// A CDA R2 revision that replaces DOC-1 (version 1):
revised.header.versionNumber; // => 2
revised.header.relatedDocuments[0]?.typeCode; // => "RPLC"
revised.header.relatedDocuments[0]?.parentDocument.ids[0]?.extension; // => "DOC-1"

// Re-parsing the edited XML is a fixed point.
parseCcda(revised.toString()).toString() === revised.toString(); // => true
```

## How a revision is stamped

By default an edit stamps a **CDA R2 revision**: a new `ClinicalDocument.id`, the same version-series
`setId` (minted when absent), an incremented `versionNumber`, and a `relatedDocument typeCode="RPLC"`
naming the prior version, inserted at their CDA R2 XSD sequence positions, and surfaced back on the
parsed header (`setId` / `versionNumber` / `relatedDocuments`). Pass `revision: false` to edit in place.
A source with no `ClinicalDocument.id` cannot be revised: the RPLC link's `parentDocument.id` is a CDA
R2 SHALL (1..\*) and there is no prior-version id to name, so `editCcda` throws
`CcdaEditError` (`SOURCE_MISSING_ID`) rather than fabricate one; use `revision: false` to edit it in place.

## A minted `setId` is labeled as synthetic

CDA R2 requires a replacement and its `parentDocument`
to share a version-series `setId`, so one is minted when the source has none; minting it invents an
identifier, and the invention is made obvious rather than hidden. A minted id is
`SYNTHETIC-SETID-…` under a synthetic assigning-authority root
(`2.16.840.1.113883.19.5.99999`, in HL7's example arc), and `isSyntheticSetId(doc.header.setId)`
is the check. Both halves are required, because either alone is something a real document could carry.
A `setId` the source already asserted, or one you pass as `revision.setId`, is **never** relabelled.

**Nothing forces a receiving system to read the label.** A receiver that
ignores the prefix and the root treats a minted `setId` exactly as it treats a real one, and this
library cannot make it do otherwise. A `false` from `isSyntheticSetId` is likewise not a promise the
id is real, only that this library did not mint it under this scheme.

## An edit reports what it wrote

An edit reports what it wrote, over the sections it actually grafted. A grafted Plan of Treatment
can carry a Planned Medication Activity short the `effectiveTime` its template SHALLs, so the returned
document raises `MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME`, appended after the re-parse's warnings,
with the emitted XML unchanged. The scope is deliberately narrow in **both** directions and neither
half is an optimization. It reads what **survived** into the emitted document, so an offending edit
that a later edit in the same call discarded says nothing (`sections` is an ordered list, and reading
the list rather than the result reports a violation against a document that does not have one). And it
covers only what **this call grafted**, so an offending act the source brought with it is never
re-reported: an edit is not a validator of a document its caller did not write.

## Modes, and what an edit refuses

An edit is fail-safe: an unedited section is carried by reference (never dropped), an empty content list
emits a spec-clean `nullFlavor="NI"` shell (never fabricated entries), and an edit that would drop a
SHALL required section throws a typed `CcdaEditError`. The required set is the one the document was
parsed under: an R1.1-origin document (no R2.1 `@extension` stamp) is edited under the reduced set,
and a document stamped for a release we do not model is not evaluated. `mode` is `"add"` (require absent), `"replace"`
(require present), or `"upsert"` (default: replace-or-add). `editCcda(doc, { terminology })` forwards an
optional adapter to the final re-parse, so an adapter-rejected code in a grafted **or** untouched section
is flagged; the edit still emits every code verbatim.

## What editing does not cover

The twelve editable section kinds are `problems`, `allergies`,
`medications`, `results`, `vitalSigns`, `immunizations`, `procedures`, `encounters`, `socialHistory`,
`pastMedicalHistory`, `planOfTreatment`, and `familyHistory`. **Functional Status and Mental Status are
buildable but not editable**: each is assembled from three separate content lists, which the single-list
edit shape does not fit. The Referral Note's narrative-only Assessment and Reason for Referral sections
are likewise not editable. There is **no entry-level append**: adding one problem to an existing
Problems section means a `replace` carrying the full entry set, which rebuilds that section from your
typed input, so anything in the original section you do not carry over, **including detail this library
does not model**, is absent from the result (every section you did not target is still carried through
byte-for-byte). There is no way to remove a section at all, and the `APND` / `XFRM` document
relationships are not implemented: an edit stamps `RPLC` only.

## Reference

- [`editCcda`](./api/README.md#editccda), its options [`EditCcdaOptions`](./api/README.md#editccdaoptions)
  and one edit, [`SectionEdit`](./api/README.md#sectionedit).
- [`CcdaEditError`](./api/README.md#ccdaediterror) and its codes,
  [`CcdaEditErrorCode`](./api/README.md#ccdaediterrorcode).
- [`isSyntheticSetId`](./api/README.md#issyntheticsetid) and
  [`SYNTHETIC_SETID_PREFIX`](./api/README.md#synthetic_setid_prefix).

## Related

- [Build a document](./build-a-document.md), which uses the same section emitters.
- [The boundaries of editing](./boundaries.md#editing-a-document) explains every boundary of the editor.
