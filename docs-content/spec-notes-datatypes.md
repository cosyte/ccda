---
id: spec-notes-datatypes
title: Datatypes, codes & serialize
sidebar_label: Datatypes & serialize
sidebar_position: 4
---

# HL7 v3 datatypes, code systems & the serializer

## HL7 v3 datatypes

C-CDA is built on the HL7 v3 abstract datatypes. The parser reads the ones that carry clinical meaning
into typed shapes: `II` (instance identifier), `ST` (string), `BL` (boolean), `CD` (coded — the
constrained `CE` parses into the same `CD` shape), `PQ` (physical quantity), `IVL_PQ` (quantity
interval), `TS` (point in time), `IVL_TS` (time interval), and `ED` (encapsulated data). A `TS` supports **variable precision** (year → year-month → … → second, with
an optional timezone) and exposes both the verbatim `raw` string and a parsed `date`; a malformed value
keeps its `raw` and leaves `date` undefined (`MALFORMED_DATETIME`). `@nullFlavor` is preserved verbatim
throughout, and a value outside the HL7 v3 NullFlavor set is flagged (`INVALID_NULL_FLAVOR`) rather than
dropped.

## Code systems — recognition, not membership

Coded slots are validated **structurally**: `checkCodeSlot` checks that a value's `@codeSystem` OID is
one expected for its slot (e.g. RxNorm on a medication, SNOMED CT / ICD-10-CM on a problem) and flags a
deprecated (`DEPRECATED_CODE_SYSTEM`, e.g. ICD-9) or unexpected (`UNEXPECTED_CODE_SYSTEM`) terminology.
It deliberately does **not** verify that a code is a real member of its system — that needs licensed
terminology content (SNOMED CT / RxNorm via UMLS) this suite never bundles. The exported OIDs
(`SNOMED_CT`, `RXNORM`, `ICD10_CM`, `LOINC`, `NDC`, `UNII`, `CVX`, …) are public identifiers, not
redistributable code-system data — bring your own terminology service for membership checks.

## Computable UCUM units

Every physical quantity (`PQ`) `@unit` is checked against a **computable, zero-dependency UCUM grammar**.
A non-UCUM unit is flagged `NON_UCUM_UNIT`; a letter-case slip (e.g. `ML` for `mL`) is caught as
`UCUM_CASE_SUSPECT`. The **raw unit is always preserved — never normalized away**, so a quantity is
never silently re-dimensioned. The validators are exported for your own use:

```ts runnable
import { isValidUcumUnit, isUcumCaseSuspect } from "@cosyte/ccda";

isValidUcumUnit("g/dL"); // => true
isValidUcumUnit("mm[Hg]"); // => true
isValidUcumUnit("cc"); // => false
isUcumCaseSuspect("ML"); // => true
isUcumCaseSuspect("mg"); // => false
```

The grammar covers a **curated atom subset** — the prefixes and atoms that appear in lab Results and
Vital Signs — not the full UCUM atom registry. A valid but uncurated atom may read as `NON_UCUM_UNIT`;
because the raw unit is preserved, nothing is lost.

## The serializer — spec-clean, round-trip emit

`serializeCcda(doc)` (equivalently `doc.toString()`) is the conservative **emit** half of Postel's Law.
It re-emits a **parsed** document as spec-clean C-CDA XML with a guaranteed UTF-8 declaration. The
output is snapshotted from the source XML at parse time, not rebuilt from the read-model, so every
attribute, namespace declaration, `templateId`, and unmodeled element survives — **no silent loss**.
Serialization is a **fixed point**: `parseCcda(serializeCcda(doc))` re-serializes to the identical
string.

```ts runnable
import { parseCcda, serializeCcda } from "@cosyte/ccda";

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <realmCode code="US"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.1" extension="2015-08-01"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.2" extension="2015-08-01"/>
  <id root="2.16.840.1.113883.19.5.99999.1" extension="DOC-0007"/>
  <code code="34133-9" codeSystem="2.16.840.1.113883.6.1"/>
  <title>Synthetic CCD</title>
  <effectiveTime value="20240101"/>
  <recordTarget><patientRole>
    <id root="2.16.840.1.113883.19.5" extension="MRN-00042" assigningAuthorityName="Sample Hospital"/>
    <patient>
      <name><given>Jane</given><family>Doe</family></name>
      <administrativeGenderCode code="F" codeSystem="2.16.840.1.113883.5.1"/>
    </patient>
  </patientRole></recordTarget>
</ClinicalDocument>`;

const doc = parseCcda(xml);
const out = serializeCcda(doc);

out === doc.toString(); // => true
out.startsWith("<?xml"); // => true
// Serialization is a fixed point — re-parse + re-serialize is byte-identical.
serializeCcda(parseCcda(out)) === out; // => true
```

> A hand-constructed `CcdaDocument` (not produced by `parseCcda` or `buildCcda`) retains no source XML,
> so `toString()` throws. To construct a document from scratch, use `buildCcda` — its first slice emits a
> spec-clean CCD (US Realm header + Problems + Allergies). See
> [Troubleshooting](./troubleshooting) for the full list of what is not yet parsed or built.
