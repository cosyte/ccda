---
id: property-test-your-code
title: Property-test your own code with generated documents
sidebar_label: Property-test your code
description: "Test your own C-CDA code on generated documents, messy document text and hostile input with the fast-check generators at @cosyte/ccda/arbitraries."
---

# Property-test your own code with generated documents

A test written by hand checks the documents its author thought of. A property-based test states a
rule, such as "this never throws" or "every problem I was given is in the summary", and checks it
on as many generated inputs as you ask for. `@cosyte/ccda/arbitraries` exports the generators we
use to test this library, built on [fast-check](https://fast-check.dev), so you can point them at
code you build on it.

Every generated value is synthetic and random: names and identifiers start with `Z`, and codes are
random numbers that name no real concept, so a failing case is safe to paste into an issue.

## Install fast-check

```bash
npm install --save-dev fast-check
```

fast-check is an optional peer dependency of `@cosyte/ccda`. Only `@cosyte/ccda/arbitraries`
loads it; the main entry point never does, so code that only parses documents does not need it.

## Check that your code handles any document

`document()` generates a parsed `CcdaDocument`: a CCD, a Referral Note or a Discharge Summary that
`buildCcda` builds from generated input, with problems, allergies, medications, results, vital
signs, immunizations, procedures, encounters, social history, functional and mental status, past
medical history, plan of treatment and family history. Any list may be empty, any optional field
may be missing, and the text in it carries the characters XML has to escape, line breaks and
characters outside ASCII. State the rule your code must keep, and let fast-check look for a
document that breaks it.

```ts runnable
import fc from "fast-check";
import { CcdaDocument } from "@cosyte/ccda";
import { document } from "@cosyte/ccda/arbitraries";

// Your code: one line per problem, for a summary screen.
function problemLines(doc: CcdaDocument): string[] {
  return doc
    .getProblems()
    .flatMap((concern) =>
      concern.problems.map((p) => `${p.value?.displayName ?? "(no name)"}: ${concern.status}`),
    );
}

// The rule: every problem observation gets exactly one line.
fc.assert(
  fc.property(document(), (doc) => {
    const observations = doc.getProblems().flatMap((concern) => concern.problems);
    return problemLines(doc).length === observations.length;
  }),
  { numRuns: 20 },
);

const [sample] = fc.sample(document(), { numRuns: 1, seed: 1 });
sample instanceof CcdaDocument; // => true
```

Each case is a new document, built from its input again when fast-check replays it.

## Check what you build from structured input

`documentInit()` generates the input `buildCcda` takes, so you can test code that builds documents,
or code that reads what a built document says against what went into it. The rule below is the
one that matters most for code that reads a problem list: nothing that went in goes missing.

```ts runnable
import fc from "fast-check";
import { buildCcda, parseCcda } from "@cosyte/ccda";
import { documentInit } from "@cosyte/ccda/arbitraries";

// Your code: the problem codes a document lists, read from its XML.
function problemCodes(xml: string): string[] {
  return parseCcda(xml)
    .getProblems()
    .flatMap((concern) => concern.problems.map((p) => p.value?.code ?? "?"));
}

fc.assert(
  fc.property(documentInit(), (init) => {
    const xml = buildCcda(init).toString();
    const wanted = (init.problems ?? []).map((p) => p.problem.code);
    return JSON.stringify(problemCodes(xml)) === JSON.stringify(wanted);
  }),
  { numRuns: 20 },
);

const xml = buildCcda({
  patient: {},
  effectiveTime: "20260101",
  problems: [{ problem: { code: "59621000", displayName: "Essential hypertension" } }],
}).toString();
problemCodes(xml); // => ["59621000"]
```

Each generated input names its document id and time, so the same input always builds the same
bytes.

## Feed your code messy and hostile input

Two generators produce text rather than parsed documents:

- `documentText()` is document text a real sender might produce: no XML declaration, a byte order
  mark, a stylesheet instruction, comments, indented lines, CRLF line endings, single-quoted
  attributes, character references, CDATA, a vendor extension in a namespace of its own, an unknown
  template, templates with no version stamp, and sections recognized only by their LOINC code. The
  parser accepts all of it, with a warning for what it noticed.
- `hostileInput()` is random strings, random markup, document text cut short or with text
  inserted and deleted, document type declarations and entity bombs, nesting past the depth limit,
  and roots that are not an HL7 v3 `ClinicalDocument`. The parser may refuse these, with one of
  its documented fatal errors, but throws nothing else.

```ts runnable
import fc from "fast-check";
import { CcdaParseError, parseCcda } from "@cosyte/ccda";
import { documentText, hostileInput } from "@cosyte/ccda/arbitraries";

// Your code: read the document type off an inbound message without ever crashing the listener.
function readType(raw: string): string | undefined {
  try {
    return parseCcda(raw).documentType;
  } catch (err) {
    if (err instanceof CcdaParseError) return undefined;
    throw err;
  }
}

// Messy text always parses, so its type is always read.
fc.assert(
  fc.property(documentText(), (raw) => readType(raw) !== undefined),
  { numRuns: 20 },
);

// Hostile input may be refused, but never crashes the reader.
fc.assert(
  fc.property(hostileInput(), (raw) => {
    readType(raw);
  }),
  { numRuns: 50 },
);

readType("not a document"); // => undefined
```

## Pick the generators

| Generator                                                                                                                  | Generates                                                                  | Options                       |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------- |
| `document()`                                                                                                               | a parsed, spec-clean `CcdaDocument` that `buildCcda` built                 | `documentTypes`, `maxEntries` |
| `documentInit()`                                                                                                           | the `BuildCcdaInit` input `buildCcda` accepts                              | the same as `document()`      |
| `documentText()`                                                                                                           | messy document text the parser accepts                                     | the same as `document()`      |
| `hostileInput()`                                                                                                           | a string the parser may refuse                                             | `maxLength`                   |
| `patient()`                                                                                                                | a `BuildCcdaPatient`, any field of it left out                             | none                          |
| `problem()`, `allergy()`, `medication()`, `resultPanel()`, `vitalsPanel()`, `immunization()`, `procedure()`, `encounter()` | one clinical entry for the builder                                         | none                          |
| `code()`                                                                                                                   | a `BuildCode`: a random code and a `displayName`                           | `codeSystems`                 |
| `quantity()`                                                                                                               | a `BuildQuantity`: a finite number and a valid UCUM unit                   | `units`                       |
| `timestamp()`                                                                                                              | an HL7 v3 timestamp, from a year to a fraction of a second with an offset  | `minYear`, `maxYear`          |
| `text()`                                                                                                                   | free text with markup characters, line breaks and characters outside ASCII | `minLength`, `maxLength`      |

A generated document's warnings describe what its input left out or asserted (a medication with no
dose, a refused immunization, a smoking status code outside the value set), never a repair, so it
serializes to text that parses back to the same document.

## Replay a failure

When a rule fails, fast-check shrinks the case to a small one and reports the seed and path that
produced it. A failing document prints as the `buildCcda(...)` call that rebuilds it.

```ts runnable
import fc from "fast-check";
import { document } from "@cosyte/ccda/arbitraries";

// A rule that is wrong: a document may leave the patient's family name out.
const everyPatientHasAFamilyName = fc.property(
  document(),
  (doc) => doc.getPatient()?.name?.family !== undefined,
);

let report = "";
try {
  fc.assert(everyPatientHasAFamilyName, { seed: 42 });
} catch (err) {
  report = String(err);
}
report.includes("seed: 42"); // => true
report.includes("Counterexample: [buildCcda({"); // => true
```

Pass the reported `seed` and `path` back to `fc.assert` to run that one case again, already shrunk,
while you fix it. A test in CI can run more cases than one on a laptop: set `numRuns` from an
environment variable, as we do with `COSYTE_PROPERTY_RUNS`.

## Reference

- [`parseCcda`](./api/README.md#parseccda), [`buildCcda`](./api/README.md#buildccda),
  [`CcdaDocument`](./api/README.md#ccdadocument), [`CcdaParseError`](./api/README.md#ccdaparseerror)
- The generators' options are in their TSDoc comments, which an editor shows on hover.
- [Testing and quality](./testing-and-quality.md) says how we use these generators on this
  library, and [Tolerance and the warning model](./spec-notes-tolerance.md) explains what
  lenient parsing notices and what it refuses.
