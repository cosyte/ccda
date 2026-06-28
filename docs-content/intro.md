---
id: intro
title: Getting started
sidebar_position: 1
---

# @cosyte/ccda

Parse real-world, vendor-quirky C-CDA and pull fields out in one line — without reading the spec.
`@cosyte/ccda` is a near-zero-dependency TypeScript toolkit following the cosyte parser archetype: a
lenient parser and an immutable model. It mirrors the API shape of the reference parser, `@cosyte/hl7`.
Its single runtime dependency is the hardened W3C-DOM substrate `@xmldom/xmldom` (exact-pinned).

> **Status:** pre-alpha (`0.0.x`), not yet published to npm. **Phase 1** ships the working parser:
> document recognition, the US Realm header + patient demographics, and section framing (identity +
> narrative). Clinical entry extraction and a spec-clean serializer land in later phases.

## Install

```bash
npm install @cosyte/ccda
```

## Parse a document

```ts
import { parseCcda } from "@cosyte/ccda";

const doc = parseCcda(xml);

doc.documentType; // e.g. "ccd" — one of the 12 US Realm document types (or undefined)
doc.getPatient()?.name?.family; // patient demographics from the recordTarget
doc.getMrn(); // the patient's medical record number
doc.findSection("allergies")?.narrativeText; // framed section narrative
doc.warnings; // stable, positional tolerance warnings
```

The parser is **lenient by default** — recoverable vendor quirks become stable-coded warnings on
`doc.warnings`, not failures (Postel's Law). `{ strict: true }` escalates the first tolerated deviation
to a thrown `CcdaParseError`; unrecoverable or hostile input (DTD/XXE, billion-laughs entity expansion,
oversized/over-deep/over-wide documents, malformed XML, a non-`ClinicalDocument` root) always throws.

## What it extracts (Phase 1)

- **Document type** — all 12 US Realm document types resolved from the root `templateId`.
- **US Realm header** — document identity and the `recordTarget` patient (demographics + identifiers),
  via `getPatient()` / `getMrn()`.
- **Sections** — framed by `templateId` with a LOINC-code fallback, with nested subsections, narrative
  text, and a narrative `ID`→text index, via `findSection()` / `allSections()`.
- **HL7 v3 datatypes** — `II`, `ST`, `BL`, `CD`, `PQ`, `IVL_PQ`, `TS`, `IVL_TS`, `ED`, with
  variable-precision v3 datetime parsing and null-flavor handling.

## Known limitations (Phase 1)

- No clinical entry extraction yet — sections carry identity + narrative only (Phase 2+).
- No serializer/builder yet — parse only.
- No vendor profile system yet — `getMrn()` selects the first `patientRole/id` extension.

## Next

- Read the **API reference** for every export, generated from source.
