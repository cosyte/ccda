---
id: serialize-a-document
title: Serialize a document
sidebar_label: Serialize a document
description: "Write a parsed C-CDA document back out as spec-clean XML, with every attribute and unmodeled element kept and the output a fixed point."
---

# Serialize a document

You parsed a document, and now need spec-clean XML back out (for storage, forwarding, or a diff)
with a guarantee that nothing was silently lost.

`serializeCcda(doc)` (or `doc.toString()`) re-emits the **parsed** document faithfully: every attribute,
namespace, `templateId`, and unmodeled element survives, and the result is a fixed point.

```ts runnable
import { parseCcda, serializeCcda } from "@cosyte/ccda";

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <realmCode code="US"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.1" extension="2015-08-01"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.2" extension="2015-08-01"/>
  <id root="2.16.840.1.113883.19.5.99999.1" extension="DOC-0011"/>
  <code code="34133-9" codeSystem="2.16.840.1.113883.6.1"/>
  <title>Synthetic CCD</title>
  <effectiveTime value="20240101"/>
  <recordTarget><patientRole>
    <id root="2.16.840.1.113883.19.5" extension="MRN-00042" assigningAuthorityName="Sample Hospital"/>
    <patient><name><given>Jane</given><family>Doe</family></name>
    <administrativeGenderCode code="F" codeSystem="2.16.840.1.113883.5.1"/></patient>
  </patientRole></recordTarget>
</ClinicalDocument>`;

const doc = parseCcda(xml);
const out = serializeCcda(doc);

out === doc.toString(); // => true
// Re-parsing and re-serializing yields the identical bytes (a fixed point).
serializeCcda(parseCcda(out)) === out; // => true
```

> `serializeCcda` re-emits a **parsed** document. To construct one from scratch, use `buildCcda`
> ([Build a document](./build-a-document.md)); to change a section of a document you already parsed,
> use `editCcda` ([Edit a document](./edit-a-document.md)). For exactly which document types and
> sections each one covers, see [Known limitations](./limitations.md#building-a-document).

## What the output keeps

- **Faithful, no silent loss.** The output is taken from the parsed XML at parse time, not
  rebuilt from the read-model, so every attribute, namespace declaration (`xmlns` / `xmlns:xsi` /
  `xmlns:sdtc`), `templateId`, and unmodeled element survives. Serialization is a **fixed point**:
  `parseCcda(serializeCcda(doc))` re-serializes to the identical string.
- **Immutable copy-with.** Models are immutable; the sanctioned mutation is `doc.withWarnings(extra)`,
  which returns a **new** document with extra warnings appended, sharing every parsed field by
  reference and leaving the original untouched.

> A hand-constructed `CcdaDocument` (not produced by `parseCcda` or `buildCcda`) retains no source XML,
> so `toString()` throws. To construct a document from scratch, use [`buildCcda`](./build-a-document.md).

## Reference

- [`serializeCcda`](./api/README.md#serializeccda) and [`CcdaDocument`](./api/README.md#ccdadocument)
  (`toString()`, `withWarnings()`).

## Related

- [Datatypes, codes, and serialization](./spec-notes-datatypes.md#the-serializer-spec-clean-round-trip-emit)
  explains how the serializer writes a document back.
