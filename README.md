# @cosyte/ccda

> C-CDA parser, serializer, and builder for Node.js and TypeScript — **lenient on parse,
> spec-clean on emit**.

[![npm version](https://img.shields.io/npm/v/@cosyte/ccda.svg)](https://www.npmjs.com/package/@cosyte/ccda)
[![CI](https://img.shields.io/github/actions/workflow/status/cosyte/ccda/ci.yml?branch=main&label=CI)](https://github.com/cosyte/ccda/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org)

`@cosyte/ccda` is a near-zero-dependency TypeScript toolkit that follows the cosyte parser archetype: a
lenient parser that turns real-world, vendor-quirky input into **warnings** rather than failures
(Postel's Law). It mirrors the API shape of the reference parser,
[`@cosyte/hl7`](https://github.com/cosyte/hl7). Its single runtime dependency is
[`@xmldom/xmldom`](https://www.npmjs.com/package/@xmldom/xmldom) (exact-pinned), the hardened W3C-DOM
substrate for C-CDA's XML.

> **Status:** pre-alpha (`0.0.x`), not yet published to npm. **Phase 1** ships the working parser:
> document recognition, the US Realm header + patient demographics, and section framing (identity +
> narrative). Clinical entry extraction and a spec-clean serializer land in later phases.

## Install

```bash
npm install @cosyte/ccda
```

## Parse

```ts
import { parseCcda } from "@cosyte/ccda";

const doc = parseCcda(xml);

doc.documentType; // e.g. "ccd" — one of the 12 US Realm document types (or undefined)
doc.getPatient()?.name?.family; // patient demographics from the recordTarget
doc.getMrn(); // the patient's medical record number
doc.findSection("allergies")?.narrativeText; // framed section narrative
doc.warnings; // stable, positional tolerance warnings (never throws on quirks)
```

The parser is **lenient by default** — recoverable vendor quirks become stable-coded `CcdaWarning`s on
`doc.warnings` (also forwarded to `options.onWarning`), not failures. `{ strict: true }` escalates the
first tolerated deviation to a thrown `CcdaParseError`. Unrecoverable or hostile input (DTD/XXE,
billion-laughs entity expansion, oversized/over-deep/over-wide documents, malformed XML, a
non-`ClinicalDocument` root) is always a thrown `CcdaParseError`.

## What it extracts (Phase 1)

- **Document type** — all 12 US Realm document types resolved from the root `templateId` (CCD,
  Discharge Summary, Referral Note, Consultation Note, History & Physical, Progress Note, Procedure
  Note, Operative Note, Care Plan, Diagnostic Imaging Report, Unstructured Document, Transfer Summary).
- **US Realm header** — document identity (`code`, `title`, `effectiveTime`, `confidentialityCode`,
  `languageCode`) and the `recordTarget` patient (name parts, gender, birth time, marital status, race,
  ethnic group) + identifiers, via `getPatient()` / `getMrn()`.
- **Sections** — framed by `templateId` with a LOINC-code fallback, including nested subsections,
  narrative text, and a narrative `ID`→text index for later reference resolution, via `findSection()` /
  `allSections()`. Unstructured documents expose their `nonXMLBody` (base64 left inert).
- **HL7 v3 datatypes** — `II`, `ST`, `BL`, `CD`, `PQ`, `IVL_PQ`, `TS`, `IVL_TS`, `ED`, with
  variable-precision v3 datetime parsing and null-flavor handling.

## Known limitations (Phase 1)

- **No clinical entry extraction yet** — sections carry identity + narrative only; structured entries
  (problems, medications, results, …) arrive in Phase 2+.
- **No serializer/builder yet** — parse only; the spec-clean emit half of Postel's Law is a later phase.
- **No vendor profile system yet** — `getMrn()` selects the first `patientRole/id` extension; a
  profile-aware override is planned.

## The cosyte parser archetype

- **Postel's Law** — liberal parser (lenient default + warnings), conservative serializer (always
  spec-clean), so quirks don't propagate downstream on round-trip.
- **Tiered tolerance** — Tier 0/1 silent, Tier 2 warning + recovery (escalates in strict mode),
  Tier 3 fatal always.
- **Stable warning codes** — warnings carry stable string codes + positional context; consumers
  branch on `w.code`, so renaming a code is a breaking change.
- **Near-zero dependencies** — one exact-pinned runtime dep (`@xmldom/xmldom`) for the XML substrate;
  healthcare integrations vet every dependency, so the cap is **≤ 3** justified deps.
- **PHI-safe diagnostics** — every warning/fatal message and position carries only structural locators
  (element names, OIDs, coded tokens, line/column); clinical values never reach a diagnostic.
- **Dual ESM + CJS** — built with `tsup`, validated with `attw`.
- **Immutability** — parsed models are immutable; mutation is via explicit methods.
- **Profile system** — a `defineProfile()` API for vendor quirks (to be added), with built-in
  profiles authored through the same public API.

## License

MIT © Cosyte
