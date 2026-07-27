---
id: spec-notes-datatypes
title: Datatypes, codes & serialize
sidebar_label: Datatypes & serialize
sidebar_position: 4
---

# HL7 v3 datatypes, code systems & the serializer

## HL7 v3 datatypes

C-CDA is built on the HL7 v3 abstract datatypes. The parser reads the ones that carry clinical meaning
into typed shapes: `II` (instance identifier), `ST` (string), `BL` (boolean), `CD` (coded: the
constrained `CE` parses into the same `CD` shape), `PQ` (physical quantity), `IVL_PQ` (quantity
interval), `TS` (point in time), `IVL_TS` (time interval), and `ED` (encapsulated data). A `TS` supports **variable precision** (year → year-month → … → second) and
exposes both the verbatim `raw` string and a parsed `date`; a malformed value keeps its `raw` and
leaves `date` undefined (`MALFORMED_DATETIME`). Following the canonical CDA R2 / HL7 v3 `TS` literal
`YYYYMMDDHHMMSS.UUUU[±ZZzz]` (and the ISO 8601 it derives from), a fractional-second or `±ZZZZ`
timezone offset is only accepted once the **time-of-day** (at least the hour) is present. An offset
or fraction hung on a bare date, such as the dropped-dash `"2026-0721"`, is a malformed value, not a
year `2026` with a `-07:21` offset. `@nullFlavor` is preserved verbatim
throughout, and a value outside the HL7 v3 NullFlavor set is flagged (`INVALID_NULL_FLAVOR`) rather than
dropped.

### A `nullFlavor` asserted beside a value

In v3, `nullFlavor` is a property of `ANY` marking the instance as an **exceptional value**, one with
no proper value. So `<doseQuantity nullFlavor="UNK" value="10" unit="mg"/>` is a document contradicting
itself: this quantity is unknown, and this quantity is 10 mg. The CDA R2 schema declares the attributes
independently, so the shape is schema-valid and no normative SHALL is cited here (none is invented
either); the parser's response rests on the datatype semantics above and on the harm ordering.

Every v3 datatype flags it as `CONTRADICTORY_NULL_FLAVOR`, which is **safety-critical**, so no vendor
profile can tolerate it back into silence. That includes the `INT` and `ST` arms of an observation
`<value>`, the slot carrying lab values and assessment-scale scores, which are parsed inline rather
than through the datatype layer. The contradiction is then resolved **against the derived reading**:
`PQ.value`, `TS.date` and an `integer` observation value's `value` are withheld, while `raw`, `unit`
and the `nullFlavor` are all preserved. A caller reading `med.dose.value` gets `undefined` rather than
`10`, and one reading a contradicted PHQ-9 score gets `undefined` rather than `12`. This is exactly
what
`MALFORMED_DATETIME` already does to `TS.date`, a second reason not to trust an interpretation rather
than a new rule, and it costs nothing because `value`/`date` are readings the parser manufactured from
a `raw` that survives.

Withholding stops there **at the datatype layer**, deliberately. `PQ`, `TS` and the `integer`
observation value are the only shapes in this model that keep both a verbatim string and a parsed
interpretation. On `CD`, `II`, `ST`, `ED` and `BL` the value-bearing field **is** the document's own
text, with no second copy, so it is kept and the warning plus the co-located `nullFlavor` is the
signal.

The test is whether the reading was _manufactured_ beside a surviving verbatim copy, never whether
the field looks dangerous. Where a datatype's field is the document's bytes but something **above**
it derives a reading, the withholding moves up there. This model does that once for an identifier:
`pickMrn` (behind `getMrn()`) selects one `<id>` out of a list and flattens it to a bare `string`
that no longer carries the `nullFlavor`, which is exactly the relationship `PQ.value` has to
`PQ.raw`. So `getMrn()` returns `undefined` when the first `patientRole/id` is null-marked, `parseIi`
still keeps `@extension`, and a caller reading `getPatient()?.identifiers` still sees both. It
withholds rather than substituting the next id, because declining a manufactured reading is not the
same act as manufacturing a replacement, and nothing in the document ranks the ids.

The other identity slots (document `id`, `setId`, `parentDocument/id`, entry-level `<id>`s) are only
ever reported whole beside the warning, so there is nothing there to withhold. `templateId` is the
stated exception rather than a member of that list: recognition does derive the document type (and
its required-section SHALL set) from `templateId.@root`, and a null-marked `templateId` still
resolves it. That is deliberate, it asserts a document _shape_ rather than a person or a record, so
a mis-read costs a spurious `REQUIRED_SECTION_MISSING` rather than a misattributed clinical fact,
and refusing would replace a working type with `UNKNOWN_DOCUMENT_TEMPLATE`. The emit side is guarded
separately: `editCcda` refuses to build an `RPLC` `parentDocument` out of a null-marked source `<id>`
rather than copy `root`/`extension` forward and lose the marking.

One thing the check deliberately does **not** do is short-circuit the rest of the slot's validation. A
`nullFlavor`-only `CD` still names a terminology, so a wrong or deprecated `@codeSystem` on it still
draws `UNEXPECTED_CODE_SYSTEM` / `DEPRECATED_CODE_SYSTEM` exactly as before.

Only a value-bearing assertion contradicts. A `PQ` `@unit` with no `@value` (a dimension without a
magnitude), an `II` `@root` with no `@extension` (a namespace without a local identifier), and a `CD`'s
`originalText` / `<translation>` / `displayName` / bare `@codeSystem` (the documented C-CDA idiom for
"not codable in the bound value set, here is the source text or an alternate coding") all describe a
null value rather than contradicting it, and stay silent.

On the **emit** side `buildCcda` is symmetric but strict (Postel's Law, conservative on emit): every
date it writes into an `<effectiveTime>`/`low`/`high`/`value`/`birthTime` is validated against the same
v3 TS grammar the parser reads, so a malformed caller input (`"2026-07-21"` with dashes, `"July 2026"`,
or a calendar-invalid `"20260230"`) **throws a `TypeError` at build time** rather than serializing a
schema-invalid or clinically-misread timestamp. Legitimate variable precision (`"2026"`, `"202607"`,
`"20260721"`) is accepted unchanged. The builder never guesses or coerces a date it was given in the
wrong shape. It fails loud. Everything it does accept round-trips back through `parseCcda` without a
`MALFORMED_DATETIME` warning.

## Code systems: recognition, not membership

Coded slots are validated **structurally**: `checkCodeSlot` checks that a value's `@codeSystem` OID is
one expected for its slot (e.g. RxNorm on a medication, SNOMED CT / ICD-10-CM on a problem) and flags a
deprecated (`DEPRECATED_CODE_SYSTEM`, e.g. ICD-9) or unexpected (`UNEXPECTED_CODE_SYSTEM`) terminology.
A value that asserts a `@code` with **no** `@codeSystem` at all is flagged `MISSING_CODE_SYSTEM`: a code
without its system is not a code (`250.00` is diabetes in ICD-9-CM and an unrelated concept elsewhere),
so it is preserved verbatim and no system is ever inferred for it, neither from the slot's expected
list nor from a `@codeSystemName` label, which is display text rather than an identifier. A value that
is **present** but asserts no usable `@code` and declares no `@nullFlavor` to say why is flagged
`MISSING_CODE_VALUE`, the mirror shape: a system without a symbol names a concept no better than a
symbol without a system. A `nullFlavor`-only value stays silent, it is a complete statement ("this
concept is unknown"), and so does an absent element, there is nothing there to judge.
It deliberately does **not** verify that a code is a real member of its system: that needs licensed
terminology content (SNOMED CT / RxNorm via UMLS) this suite never bundles. The exported OIDs
(`SNOMED_CT`, `RXNORM`, `ICD10_CM`, `LOINC`, `NDC`, `UNII`, `CVX`, …) are public identifiers, not
redistributable code-system data. For membership checks, bring your own: pass a `TerminologyAdapter`
to `parseCcda` or `buildCcda` and it is consulted at the five recognized coded slots (`problem`,
`medication`, `allergen`, `route`, `vaccine`). A code your adapter rejects is flagged
`SEMANTIC_CODE_INVALID` and preserved **verbatim**, never rewritten. A code with no `@codeSystem`
cannot reach the adapter at all (it validates a system + code pair), which is why the structural
`MISSING_CODE_SYSTEM` above is the signal for it.

## Computable UCUM units

Every physical quantity (`PQ`) `@unit` is checked against a **computable, zero-dependency UCUM grammar**.
A non-UCUM unit is flagged `NON_UCUM_UNIT`; a letter-case slip (e.g. `ML` for `mL`) is caught as
`UCUM_CASE_SUSPECT`. The **raw unit is always preserved, never normalized away**, so a quantity is
never silently re-dimensioned. The validators are exported for your own use:

```ts runnable
import { isValidUcumUnit, isUcumCaseSuspect } from "@cosyte/ccda";

isValidUcumUnit("g/dL"); // => true
isValidUcumUnit("mm[Hg]"); // => true
isValidUcumUnit("cc"); // => false
isUcumCaseSuspect("ML"); // => true
isUcumCaseSuspect("mg"); // => false
```

The grammar covers a **curated atom subset** (the prefixes and atoms that appear in lab Results and
Vital Signs), not the full UCUM atom registry. A valid but uncurated atom may read as `NON_UCUM_UNIT`;
because the raw unit is preserved, nothing is lost.

## The serializer: spec-clean, round-trip emit

`serializeCcda(doc)` (equivalently `doc.toString()`) is the conservative **emit** half of Postel's Law.
It re-emits a **parsed** document as spec-clean C-CDA XML with a guaranteed UTF-8 declaration. The
output is snapshotted from the source XML at parse time, not rebuilt from the read-model, so every
attribute, namespace declaration, `templateId`, and unmodeled element survives: **no silent loss**.
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
// Serialization is a fixed point: re-parse + re-serialize is byte-identical.
serializeCcda(parseCcda(out)) === out; // => true
```

> A hand-constructed `CcdaDocument` (not produced by `parseCcda` or `buildCcda`) retains no source XML,
> so `toString()` throws. To construct a document from scratch, use `buildCcda`: it emits a spec-clean
> CCD or Referral Note with a US Realm header and the clinical sections you supply. See
> [Troubleshooting](./troubleshooting) for exactly what the parser, builder, and editor do and do not
> do today.
