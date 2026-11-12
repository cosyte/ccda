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
[![Node](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org)

C-CDA parser, serializer, and builder for Node.js and TypeScript, lenient on parse, spec-clean on emit.

- [Why this exists](#why-this-exists)
- [Status](#status)
- [Install](#install)
- [Usage](#usage)
- [PHI and safety](#phi-and-safety)
- [Conformance](#conformance)
- [Documentation](#documentation)
- [Support](#support)
- [Security](#security)
- [Contributing](#contributing)
- [License](#license)

## Why this exists

Every sending system bends C-CDA somewhere, so a team that has to read what an EHR actually produced
is usually choosing between an XML library that hands back a DOM and leaves every clinical judgment
to the caller, and a conformance validator that rejects the document and returns nothing. This
package is neither: it reads a real, vendor-quirky document into typed clinical models and turns each
deviation into a stable coded warning, so a document a validator would reject still yields the
problems, medications, and allergies it does carry. The nearest alternative most teams reach for is a
generic XML parser plus hand-written XPath, which works until a vendor moves a `templateId` and never
tells you when a reading was unsafe to make. This package will not make that reading: where a
document contradicts itself, the derived value is withheld and flagged rather than resolved in
silence.

## Status

**The `0.1` line.** From 0.1 the public API is settled and safe to depend on:
the behavior documented on this page is implemented and covered by tests, the exported names,
options, return shapes, and warning codes are the surface we keep stable, and below 1.0 a breaking
change bumps the minor version and is called out in the changelog with its migration. Some
surfaces are still partial, and they are named rather than implied:

- **The conformance target is C-CDA R2.1 with Companion Guide R4.1** (USCDI v3): we build R2.1,
  read 3.0.0 to 5.0.0 documents leniently, and do not trace the Companion Guide yet
  ([versions we read and build](https://docs.cosyte.com/ccda/spec-notes-versions)).
- **Building is partial.** `buildCcda` emits six of the twelve US Realm document types (CCD,
  Referral Note, inpatient Discharge Summary, Progress Note, History and Physical, and Consultation
  Note); the other six throw rather than emitting something that merely resembles the type you
  asked for.
- **Editing is whole-section.** `editCcda` covers twelve section kinds. Functional Status, Mental
  Status, and the narrative-only sections (Assessment, Reason for Referral, and the office notes'
  history, review of systems, examination, and status narratives) are buildable but not editable, and
  there is no entry-level append and no section removal.
- **Required-section validation under-warns**, and every document type reports how much of its
  obligation has been read off the normative source. A quiet parse is not a conformance result.
- **A terminology adapter is consulted at five coded slots only**, so a clean run means those five
  slots passed, not that the document was terminology-verified. The same five carry a declared
  value-set binding, and a value-set source you supply is what checks it: this package ships value
  set identifiers, never their member codes.

[Known limitations](https://docs.cosyte.com/ccda/limitations) lists every boundary, and
[the boundaries of reading, building and editing](https://docs.cosyte.com/ccda/boundaries) explains
each one rather than talking around it.

## Install

```bash
npm install @cosyte/ccda
```

`pnpm add @cosyte/ccda` and `yarn add @cosyte/ccda` install the same package.

**Node.js 22 or later, tested on 22, 24, and 26.** `package.json` declares `>=22.0.0` in `engines.node`. The package
ships a **dual ESM and CJS** build with per-condition type declarations, so both `import` and
`require` resolve to the right types. There is **one** runtime dependency,
[`@xmldom/xmldom`](https://www.npmjs.com/package/@xmldom/xmldom) (exact-pinned), the W3C-DOM substrate
for C-CDA's XML. The optional `@cosyte/ccda/arbitraries` entry point, fast-check generators for
[property-testing your own code](https://github.com/cosyte/ccda/blob/main/docs-content/property-test-your-code.md),
needs `fast-check` installed beside it; the main entry point never loads it.

## Usage

One example, end to end: build a complete, spec-clean CCD, read it back, and print what came out.
The `// =>` comments are the values this code really produces, and the output below is what it
prints. Tests in this repository execute this block against the published entry point and fail if
either side drifts, so a reader (or an agent) lifting it verbatim gets code that runs.

```ts runnable
import { buildCcda, parseCcda } from "@cosyte/ccda";

// A synthetic CCD, built here so the example stands on its own. In your integration this is the
// document a sending system handed you.
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
}).toString();

const doc = parseCcda(xml);
const problem = doc.getProblems()[0];
const allergen = doc.getAllergies()[0]?.allergies[0]?.allergen;

console.log(doc.documentType, doc.getMrn(), doc.getPatient()?.name?.family);
console.log("problem", problem?.problems[0]?.value?.code, problem?.status);
console.log("medication", doc.getMedications()[0]?.drug?.code);
console.log("allergy", allergen?.code, allergen?.displayName);
console.log("warnings", doc.warnings.length);
// The emit half is a fixed point: re-parsing and re-serializing changes nothing.
console.log("round trip unchanged", parseCcda(doc.toString()).toString() === xml);

// The values printed above, which the test suite asserts on every run:
doc.documentType; // => "ccd"
doc.getMrn(); // => "MRN001"
problem?.problems[0]?.value?.code; // => "59621000"
problem?.status; // => "active"
doc.getMedications()[0]?.drug?.code; // => "314076"
allergen?.code; // => "7980"
doc.warnings; // => []
parseCcda(doc.toString()).toString() === xml; // => true
```

It prints:

```text
ccd MRN001 Doe
problem 59621000 active
medication 314076
allergy 7980 Penicillin G
warnings 0
round trip unchanged true
```

The parser is **lenient by default**: recoverable vendor quirks become stable-coded `CcdaWarning`s on
`doc.warnings` (also forwarded to `options.onWarning`), not failures. `{ strict: true }` escalates the
first tolerated deviation to a thrown `CcdaParseError`. Unrecoverable or hostile input (DTD/XXE,
billion-laughs entity expansion, oversized/over-deep/over-wide documents, XML that does not
parse, a non-`ClinicalDocument` root) is always a thrown `CcdaParseError`.

### The full read surface

Every accessor a parsed document exposes, in one place. Each is described in detail on
[What it extracts](https://docs.cosyte.com/ccda/what-it-extracts).

```ts
import { parseCcda } from "@cosyte/ccda";

const doc = parseCcda(xml);

doc.documentType; // e.g. "ccd", one of the 12 US Realm document types, "patientGeneratedDocument", or undefined
doc.getPatient()?.name?.family; // patient demographics from the recordTarget
doc.getMrn(); // the patient's medical record number
doc.findSection("allergies")?.narrativeText; // framed section narrative
doc.getProblems()[0]?.problems[0]?.value?.code; // coded condition (SNOMED CT / ICD-10-CM)
doc.getMedications()[0]?.drug?.code; // RxNorm drug
doc.getAllergies()[0]?.allergies[0]?.allergen?.code; // offending substance
doc.getResults()[0]?.results[0]?.value; // polymorphic ObservationValue (UCUM-checked PQ, coded, …)
doc.getVitals()[0]?.vitals[0]?.value; // e.g. systolic BP, units intact
doc.getImmunizations()[0]?.vaccine?.code; // CVX vaccine code
doc.getProcedures()[0]?.disposition; // "performed" vs "planned" (moodCode, never guessed)
doc.getEncounters()[0]?.code?.code; // encounter type (CPT / SNOMED / ActEncounterCode)
doc.getSmokingStatus()[0]?.value?.code; // SNOMED smoking-status concept
doc.getPlannedItems()[0]?.disposition; // planned only, never read as performed
doc.getFunctionalStatus()[0]?.value; // functional finding (domain-tagged, never mental)
doc.getFamilyHistory()[0]?.relative?.relationship?.code; // relative + their conditions
doc.getPastMedicalHistory()[0]?.value?.code; // historical problem (bare, not a concern)
doc.warnings; // stable, positional tolerance warnings (never throws on quirks)
```

## PHI and safety

A C-CDA document is a patient record by construction, so treat everything this library hands back as
protected health information. What the library itself does with it is deliberately small, and each
half is stated rather than left to be inferred.

- **Logging: it does not.** There is no `console` call in library code, and no logger, sink,
  telemetry hook, or debug flag to configure or forget to turn off. Warning and fatal messages come
  whole from a frozen registry and interpolate nothing, so no value from your document can reach a
  message; a diagnostic's `position` carries bounded structural identifiers only (element path,
  section LOINC code, template OID) plus line and column.
- **In-memory retention: for exactly as long as you hold the object.** A parsed `CcdaDocument` holds
  the typed model and a snapshot of the source XML, which is what lets `serializeCcda()` /
  `toString()` re-emit the document byte for byte. Nothing is cached in module scope, nothing is
  shared between calls, and there is no registry to clear: drop the reference and the document is
  garbage like any other object.
- **Writing to disk: it does not.** No file is opened, no socket is dialed, no database is touched,
  and no terminology or reference data is bundled or fetched. A string goes in and a model or a
  string comes back. A `TerminologyAdapter` is code **you** supply and this library calls, so any
  network egress there is yours and visible in your own code.

**What your application still owns**, because nothing here can own it for you: where the document
came from and where the output goes, transport security, authentication, access control and audit,
retention and deletion, and whether anything you log about a parse (a document id, a warning's
element path, even a count) is safe to write where you write it. Redaction and de-identification are
out of scope for this package. Every example in this file, and every fixture in this repository, uses
an invented patient and invented identifiers; keep it that way in anything you paste into an issue.

## Conformance

<!-- conformance-statement:start -->

**Conformance, measured rather than expected.** `pnpm conformance` fetches the normative C-CDA R2.1
Schematron, its vocabulary file, and the CDA R2 XML schema at run time from pinned immutable
references, validates every document `buildCcda` emits against the schema and then the
error-severity phase of the Schematron, and re-runs the Schematron over a public sample corpus
parsed and re-serialized through this library. The result is tracked at
[`documentation/conformance-report.md`](https://github.com/cosyte/ccda/blob/main/documentation/conformance-report.md), it is rewritten by
every run, and a run fails if the committed bytes disagree with what it just produced.
**Measured against Schematron revision `6d3ed96160b45a111895da4df5510c7fad9de01f`**, the document
types validated are

<!-- conformance-statement:document-types:start -->`ccd`, `consultationNote`, `dischargeSummary`, `historyAndPhysical`, `progressNote`, and `referralNote`<!-- conformance-statement:document-types:end -->,

with **0** error-severity results on the built side
and **0** round-trip documents whose Schematron error set differed.
**This is an assessment against a published artifact, not a certification**, and no accredited body
has reviewed this software or this result.
**Limits, and they sit here beside the capability rather than in a footer.** The measurement covers
the six document types `buildCcda` emits and says nothing about the other six, which it does not
emit. It covers the error-severity phase; the Schematron's warning phase is not run and a clean
result is not a claim about it. Value-set membership is checked only where the Schematron's own
vocabulary file checks it, so a clean result is not a terminology verification. The round-trip half
is **differential**: a public sample may carry Schematron errors of its own, and what is measured is
that parsing and re-serializing it introduces none and removes none, not that the sample was clean.
The run needs network egress and fails explicitly without it, by design; there is no offline pass.

<!-- conformance-statement:end -->

## Documentation

The full reference is on [docs.cosyte.com/ccda](https://docs.cosyte.com/ccda):

- [Installation](https://docs.cosyte.com/ccda/installation) and the
  [quickstart](https://docs.cosyte.com/ccda/quickstart).
- How-to guides: [read the active problem list](https://docs.cosyte.com/ccda/read-the-problem-list),
  [triage warnings](https://docs.cosyte.com/ccda/triage-warnings),
  [build a document](https://docs.cosyte.com/ccda/build-a-document),
  [edit a document](https://docs.cosyte.com/ccda/edit-a-document),
  [serialize a document](https://docs.cosyte.com/ccda/serialize-a-document),
  [parse and write any XML safely](https://docs.cosyte.com/ccda/parse-and-write-xml),
  [apply a vendor profile](https://docs.cosyte.com/ccda/apply-a-vendor-profile),
  [check codes with your own terminology service](https://docs.cosyte.com/ccda/check-codes-with-your-terminology),
  [check value-set membership](https://docs.cosyte.com/ccda/check-value-set-membership), and
  [check required sections](https://docs.cosyte.com/ccda/check-required-sections).
- Explanation: the [document model](https://docs.cosyte.com/ccda/spec-notes-model),
  [tolerance and warnings](https://docs.cosyte.com/ccda/spec-notes-tolerance),
  [clinical entries](https://docs.cosyte.com/ccda/spec-notes-clinical),
  [datatypes](https://docs.cosyte.com/ccda/spec-notes-datatypes),
  [dates and times](https://docs.cosyte.com/ccda/dates-and-times),
  [the boundaries of reading, building and editing](https://docs.cosyte.com/ccda/boundaries),
  [code systems and provenance](https://docs.cosyte.com/ccda/code-systems),
  [validation against C-CDA R2.1](https://docs.cosyte.com/ccda/validation), and
  [the parser archetype](https://docs.cosyte.com/ccda/parser-archetype).
- Reference: [what it extracts](https://docs.cosyte.com/ccda/what-it-extracts),
  [warning and error codes](https://docs.cosyte.com/ccda/warning-codes), the
  [known limitations](https://docs.cosyte.com/ccda/limitations), and the API reference, generated
  from the TSDoc comments in the source.
- [Testing and quality](https://docs.cosyte.com/ccda/testing-and-quality) and
  [performance](https://docs.cosyte.com/ccda/performance).
- [Troubleshooting](https://docs.cosyte.com/ccda/troubleshooting). Read the
  [known limitations](https://docs.cosyte.com/ccda/limitations) before you point this at real data.
- [`CHANGELOG.md`](https://github.com/cosyte/ccda/blob/main/CHANGELOG.md): every release.

## Support

Questions, bug reports, and quirks from the systems you receive documents from go in
[GitHub issues](https://github.com/cosyte/ccda/issues). Use synthetic data only, never a real
patient's. Need a C-CDA integration built, or hosted and run for you? See our
[integration services](https://cosyte.com/integration-services).

## Security

Report a vulnerability privately, never in a public issue, and with no real patient data in it. Our
[security policy](https://github.com/cosyte/ccda/security/policy) says how.

## Contributing

**Where to ask:** open an issue at
[https://github.com/cosyte/ccda/issues](https://github.com/cosyte/ccda/issues). A parsing report is
most useful with the smallest document shape that reproduces it and the warning codes you got back;
**never attach a real patient document**, reduce it to a synthetic one first.

**Unsolicited pull requests are accepted.** For anything that changes what a document parses to, adds
or renames a warning code, or moves the public API, open an issue first so the behavior can be
agreed before you write it: a warning code is public surface, so renaming one is a breaking change.
Typo, link, and test fixes can go straight to a pull request.

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

New behavior needs a test beside it, and a change a consumer would notice needs a changeset
(`pnpm changeset`), whose summary becomes the changelog entry.

## License

[MIT](https://github.com/cosyte/ccda/blob/main/LICENSE) (SPDX identifier `MIT`), copyright Cosyte LLC.

HL7 is a registered trademark of Health Level Seven International, and its use does not constitute
endorsement by HL7. Cosyte is not affiliated with, endorsed by, or sponsored by HL7 or any other
organization these documents name. See
[TRADEMARKS.md](https://github.com/cosyte/ccda/blob/main/TRADEMARKS.md).
