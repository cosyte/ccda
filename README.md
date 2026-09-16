<a href="https://cosyte.com">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://cosyte.com/tile/cosyte-lockup-tile-on-dark-1200x300.png">
    <img alt="The Cosyte logo on its own white ground: the icon beside the word Cosyte." src="https://cosyte.com/tile/cosyte-lockup-tile-on-light-1200x300.png">
  </picture>
</a>

# @cosyte/ccda

> Read the C-CDA a vendor actually sent, and never guess at what it meant.

[![npm version](https://img.shields.io/npm/v/@cosyte/ccda.svg)](https://www.npmjs.com/package/@cosyte/ccda)
[![CI](https://img.shields.io/github/actions/workflow/status/cosyte/ccda/ci.yml?branch=main&label=CI)](https://github.com/cosyte/ccda/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/cosyte/ccda/blob/main/LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org)

C-CDA parser, serializer, and builder for Node.js and TypeScript, lenient on parse, spec-clean on emit.

- [Why this exists](#why-this-exists)
- [Status](#status)
- [Install](#install)
- [Usage](#usage)
- [PHI and safety](#phi-and-safety)
- [What it extracts: document type, header, and section framing](#what-it-extracts-document-type-header-and-section-framing)
- [What it extracts: the reconciliation triad](#what-it-extracts-the-reconciliation-triad)
- [What it extracts: discrete clinical data](#what-it-extracts-discrete-clinical-data)
- [What it extracts: procedures, encounters, and social history](#what-it-extracts-procedures-encounters-and-social-history)
- [What it extracts: plan of treatment, status, and history sections](#what-it-extracts-plan-of-treatment-status-and-history-sections)
- [Whose data an entry is about: the subject override](#whose-data-an-entry-is-about-the-subject-override)
- [Which C-CDA release this validates against](#which-c-cda-release-this-validates-against)
- [Required-section validation](#required-section-validation)
- [Serialize & round-trip](#serialize--round-trip)
- [Build a document](#build-a-document)
- [Edit a document](#edit-a-document)
- [Code systems & provenance](#code-systems--provenance)
- [Known limitations](#known-limitations)
- [The cosyte parser archetype](#the-cosyte-parser-archetype)
- [Contributing](#contributing)
- [License](#license)

Some sections below link to their full text under `documentation/` in this repository.

## Why this exists

Every sending system bends C-CDA somewhere, so a team that has to read what an EHR actually produced
is usually choosing between an XML library that hands back a DOM and leaves every clinical judgement
to the caller, and a conformance validator that rejects the document and returns nothing. This
package is neither: it reads a real, vendor-quirky document into typed clinical models and turns each
deviation into a stable coded warning, so a document a validator would reject still yields the
problems, medications and allergies it does carry. The nearest alternative most teams reach for is a
generic XML parser plus hand-written XPath, which works until a vendor moves a `templateId` and never
tells you when a reading was unsafe to make. This package will not make that reading: where a
document contradicts itself, the derived value is withheld and flagged rather than resolved in
silence.

## Status

`package.json` declares **`0.0.15`**, on the pre-alpha `0.0.x` version ladder. What that version
claims is narrow and worth reading literally: the behaviour documented on this page is implemented
and covered by tests, but the public API is **not settled**, and any release may change it, so pin an
exact version rather than a range. These surfaces are named rather than implied:

- **Building is partial.** `buildCcda` emits two of the twelve US Realm document types (CCD and
  Referral Note); the other ten throw rather than emitting something that merely resembles the type
  you asked for.
- **Editing is whole-section.** `editCcda` covers twelve section kinds. Functional Status, Mental
  Status and the Referral Note's narrative-only sections are buildable but not editable, and there is
  no entry-level append and no section removal.
- **Required-section validation under-warns**, and every document type reports how much of its
  obligation has been read off the normative source. A quiet parse is not a conformance result.
- **A terminology adapter is consulted at five coded slots only**, so a clean run means those five
  slots passed, not that the document was terminology-verified.

[Known limitations](#known-limitations) carries the boundaries in full, and each is stated
under-warning rather than talked around.

## Install

```bash
npm install @cosyte/ccda
```

`pnpm add @cosyte/ccda` and `yarn add @cosyte/ccda` install the same package.

**Node `>=22.0.0`** is required, which is what `package.json` declares in `engines.node`. The package
ships a **dual ESM and CJS** build with per-condition type declarations, so both `import` and
`require` resolve to the right types. There is **one** runtime dependency,
[`@xmldom/xmldom`](https://www.npmjs.com/package/@xmldom/xmldom) (exact-pinned), the hardened W3C-DOM
substrate for C-CDA's XML.

## Usage

One example, end to end: build a complete, spec-clean CCD, read it back, and check what came out. The
`// =>` comments are the values this code really produces. A test in this repository executes this
block against the published entry point and fails if either side drifts, so a reader (or an agent)
lifting it verbatim gets code that runs.

```ts runnable
import { buildCcda, parseCcda } from "@cosyte/ccda";

// A complete synthetic CCD, built here so the example stands on its own. In your
// integration this is the document a sending system handed you.
const xml = buildCcda({
  patient: { mrn: "MRN001", given: ["Jane"], family: "Doe", gender: "F", birthTime: "19800101" },
  problems: [{ problem: { code: "59621000", displayName: "Essential hypertension" } }],
  medications: [
    {
      drug: { code: "314076", displayName: "Lisinopril 10 MG Oral Tablet" }, // RxNorm
      dose: { value: 1, unit: "{tablet}" },
      route: { code: "C38288", displayName: "Oral" }, // NCI Thesaurus
    },
  ],
  allergies: [
    {
      allergen: { code: "7980", displayName: "Penicillin G" }, // RxNorm
      reaction: { code: "247472004", displayName: "Hives" }, // SNOMED CT
    },
  ],
  vitalSigns: [
    {
      vitals: [
        {
          code: { code: "8480-6", displayName: "Systolic blood pressure" }, // LOINC
          quantity: { value: 120, unit: "mm[Hg]" }, // UCUM
        },
      ],
    },
  ],
}).toString();

const doc = parseCcda(xml);

doc.documentType; // => "ccd"
doc.getPatient()?.name?.family; // => "Doe"
doc.getMrn(); // => "MRN001"
doc.getProblems()[0]?.problems[0]?.value?.code; // => "59621000"
doc.getProblems()[0]?.status; // => "active"
doc.getMedications()[0]?.drug?.code; // => "314076"
doc.getAllergies()[0]?.allergies[0]?.allergen?.code; // => "7980"
doc.warnings; // => []

// An observation value is a discriminated union; switch on `kind` to reach the
// UCUM-checked quantity, with the document's own unit intact.
const systolic = doc.getVitals()[0]?.vitals[0]?.value;
systolic?.kind; // => "physicalQuantity"
systolic?.kind === "physicalQuantity" ? systolic.quantity?.value : undefined; // => 120

// The emit half is a fixed point: re-parsing and re-serializing changes nothing.
parseCcda(doc.toString()).toString() === xml; // => true
```

The parser is **lenient by default**: recoverable vendor quirks become stable-coded `CcdaWarning`s on
`doc.warnings` (also forwarded to `options.onWarning`), not failures. `{ strict: true }` escalates the
first tolerated deviation to a thrown `CcdaParseError`. Unrecoverable or hostile input (DTD/XXE,
billion-laughs entity expansion, oversized/over-deep/over-wide documents, malformed XML, a
non-`ClinicalDocument` root) is always a thrown `CcdaParseError`.

### The full read surface

The full section is in [read-surface.md](documentation/read-surface.md).

### Dates and times: `toObject`, `toISO`, `toDate`

The full section is in [datetimes.md](documentation/datetimes.md).

## PHI and safety

A C-CDA document is a patient record by construction, so treat everything this library hands back as
protected health information. What the library itself does with it is deliberately small, and each
half is stated rather than left to be inferred.

- **Logging: it does not.** There is no `console` call in library code, and no logger, sink,
  telemetry hook or debug flag to configure or forget to turn off. Warning and fatal messages come
  whole from a frozen registry and interpolate nothing, so no value from your document can reach a
  message; a diagnostic's `position` carries bounded structural identifiers only (element path,
  section LOINC code, template OID) plus line and column.
- **In-memory retention: for exactly as long as you hold the object.** A parsed `CcdaDocument` holds
  the typed model and a snapshot of the source XML, which is what lets `serializeCcda()` /
  `toString()` re-emit the document byte for byte. Nothing is cached in module scope, nothing is
  shared between calls, and there is no registry to clear: drop the reference and the document is
  garbage like any other object.
- **Writing to disk: it does not.** No file is opened, no socket is dialled, no database is touched,
  and no terminology or reference data is bundled or fetched. A string goes in and a model or a
  string comes back. A `TerminologyAdapter` is code **you** supply and this library calls, so any
  network egress there is yours and visible in your own code.

**What your application still owns**, because nothing here can own it for you: where the document
came from and where the output goes, transport security, authentication, access control and audit,
retention and deletion, and whether anything you log about a parse (a document id, a warning's
element path, even a count) is safe to write where you write it. Redaction and de-identification are
out of scope for this package. Every example in this file, and every fixture in this repository, uses
an invented patient and invented identifiers; keep it that way in anything you paste into an issue.

## What it extracts: document type, header, and section framing

The full section is in [read-surface.md](documentation/read-surface.md).

## What it extracts: the reconciliation triad

The full section is in [read-surface.md](documentation/read-surface.md).

## What it extracts: discrete clinical data

The full section is in [read-surface.md](documentation/read-surface.md).

## What it extracts: procedures, encounters, and social history

The full section is in [read-surface.md](documentation/read-surface.md).

## What it extracts: plan of treatment, status, and history sections

The full section is in [read-surface.md](documentation/read-surface.md).

## Whose data an entry is about: the subject override

The full section is in [subject-override.md](documentation/subject-override.md).

## Which C-CDA release this validates against

The full section is in [conformance.md](documentation/conformance.md).

## Required-section validation

The full section is in [conformance.md](documentation/conformance.md).

## Serialize & round-trip

The full section is in [serialize-build-edit.md](documentation/serialize-build-edit.md).

## Build a document

The full section is in [serialize-build-edit.md](documentation/serialize-build-edit.md).

## Edit a document

The full section is in [serialize-build-edit.md](documentation/serialize-build-edit.md).

## Code systems & provenance

The full section is in [code-systems.md](documentation/code-systems.md).

## Known limitations

The full section is in [known-limitations.md](documentation/known-limitations.md).

## The cosyte parser archetype

`@cosyte/ccda` is a near-zero-dependency TypeScript toolkit that follows the cosyte parser archetype: a
lenient parser that turns real-world, vendor-quirky input into **warnings** rather than failures
(Postel's Law). It mirrors the API shape of the reference parser,
[`@cosyte/hl7`](https://github.com/cosyte/hl7). Its single runtime dependency is
[`@xmldom/xmldom`](https://www.npmjs.com/package/@xmldom/xmldom) (exact-pinned), the hardened W3C-DOM
substrate for C-CDA's XML.

- **Postel's Law**: liberal parser (lenient default + warnings), conservative serializer (always
  spec-clean), so quirks don't propagate downstream on round-trip.
- **Tiered tolerance**: Tier 0/1 silent, Tier 2 warning + recovery (escalates in strict mode),
  Tier 3 fatal always.
- **Stable warning codes**: warnings carry stable string codes + positional context; consumers
  branch on `w.code`, so renaming a code is a breaking change.
- **Near-zero dependencies**: one exact-pinned runtime dep (`@xmldom/xmldom`) for the XML substrate;
  healthcare integrations vet every dependency, so the cap is **≤ 3** justified deps.
- **PHI-safe diagnostics**: warning and fatal messages come whole from a frozen registry and
  interpolate nothing, so no value from your document reaches one; positions carry bounded
  structural identifiers only (element path, section LOINC code, template OID) plus line/column.
- **Dual ESM + CJS**: built with `tsup`, validated with `attw`.
- **Immutability**: parsed models are immutable; mutation is via explicit methods.
- **Profile system**: a `defineCcdaProfile()` API for vendor/conformance quirks, with a
  provenance-backed registry (`ccdaProfiles`) of built-ins authored through the same public API. A
  safety gate refuses any profile that tries to tolerate a safety-critical warning code.

## Contributing

**Where to ask:** open an issue at
[https://github.com/cosyte/ccda/issues](https://github.com/cosyte/ccda/issues). A parsing report is
most useful with the smallest document shape that reproduces it and the warning codes you got back;
**never attach a real patient document**, reduce it to a synthetic one first.

**Unsolicited pull requests are accepted.** For anything that changes what a document parses to, adds
or renames a warning code, or moves the public API, open an issue first so the behaviour can be
agreed before you write it: a warning code is public surface, so renaming one is a breaking change.
Typo, link and test fixes can go straight to a pull request.

**What a contribution has to clear**, every one of them a script this package declares:

| check                         | what it is                                              |
| ----------------------------- | ------------------------------------------------------- |
| `pnpm lint`                   | ESLint, at `--max-warnings=0`                           |
| `pnpm typecheck`              | `tsc --noEmit`, strict                                  |
| `pnpm test`                   | Vitest, including the example on this page              |
| `pnpm format:check`           | Prettier                                                |
| `pnpm build`                  | the dual ESM + CJS bundle                               |
| `pnpm attw`                   | per-condition type resolution for consumers             |
| `pnpm phi-scan`               | no patient-shaped identifier anywhere in a tracked file |
| `pnpm check:no-emdash`        | the house punctuation rule                              |
| `pnpm check:no-internal-refs` | no internal bookkeeping on the public surface           |

New behaviour needs a test beside it, and a change a consumer would notice needs a changeset
(`pnpm changeset`), whose summary becomes the changelog entry.

## License

[MIT](https://github.com/cosyte/ccda/blob/main/LICENSE) (SPDX identifier `MIT`), copyright Cosyte.
