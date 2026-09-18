# Conformance report

Written by `pnpm conformance`, which fails when this file's committed bytes differ from what the
run produced. It is generated output: do not hand-edit it, and do not update the README statement
it gates without re-running the harness.

**This is an assessment, not a certification.** The harness validates documents against published
HL7 artifacts at the revisions named below and reports what those artifacts say. No accredited body
has reviewed this software or this result, and a green run is not a statement about any deployment.

**What it measures, and what it does not.** It measures the documents `buildCcda` emits, against the
CDA R2 XML schema and then the error-severity phase of the C-CDA R2.1 Schematron, and it measures
whether parsing and re-serializing a public sample changes that sample's Schematron error set. It
does not measure value-set membership beyond what the Schematron's own vocabulary file asserts, it
does not measure the ten document types `buildCcda` does not emit, and it says nothing about
documents this library has not been pointed at.

## Measured against

- `cdaSchema`: commit `e922fc35586fd2629f0c8a021080bca9ab424e18`
- `corpus`: commit `ad5007abd912a45bbd04ce96e871c70954c2b2c2`
- `schematron`: commit `6d3ed96160b45a111895da4df5510c7fad9de01f`
- `vocabulary`: commit `6d3ed96160b45a111895da4df5510c7fad9de01f`

Assertions compiled from the Schematron: 4102.

## Documents `buildCcda` emits

13 documents validated, covering document types `ccd` and `referralNote`. Error-severity results: 0.

| document | type | schema | schematron |
| --- | --- | ---: | ---: |
| `ccd-minimal` | `ccd` | 0 | 0 |
| `ccd-populated` | `ccd` | 0 | 0 |
| `referral-note-minimal` | `referralNote` | 0 | 0 |
| `referral-note-populated` | `referralNote` | 0 | 0 |
| `ccd-past-medical-history` | `ccd` | 0 | 0 |
| `ccd-plan-of-treatment` | `ccd` | 0 | 0 |
| `ccd-family-history` | `ccd` | 0 | 0 |
| `ccd-mental-status` | `ccd` | 0 | 0 |
| `ccd-mental-status-organizers` | `ccd` | 0 | 0 |
| `ccd-mental-status-scales` | `ccd` | 0 | 0 |
| `ccd-functional-status-organizer` | `ccd` | 0 | 0 |
| `ccd-functional-status-organizer-without-activity` | `ccd` | 0 | 0 |
| `ccd-functional-status-scales` | `ccd` | 0 | 0 |

## Round trip over the public sample corpus

20 corpus documents were parsed and re-serialized, and each
document's Schematron error set was compared with the error set of its own input. Documents whose
error set differed: 0.

This comparison is differential and not absolute. A sample may carry Schematron errors of its own;
what this measures is that parsing and re-serializing it introduces none and removes none.

## Machine-readable facts

`test/conformance/statement.test.ts` reads this block as a file, with no network, and fails
unless the README's conformance statement agrees with it.

```json conformance-facts
{
  "artifactRevision": "6d3ed96160b45a111895da4df5510c7fad9de01f",
  "documentTypes": [
    "ccd",
    "referralNote"
  ],
  "builtErrorSeverityResults": 0,
  "roundTripDocumentsDiffering": 0,
  "builtDocuments": 13,
  "roundTripDocuments": 20,
  "artifacts": {
    "schematron": "6d3ed96160b45a111895da4df5510c7fad9de01f",
    "vocabulary": "6d3ed96160b45a111895da4df5510c7fad9de01f",
    "corpus": "ad5007abd912a45bbd04ce96e871c70954c2b2c2",
    "cdaSchema": "e922fc35586fd2629f0c8a021080bca9ab424e18"
  },
  "assertionCount": 4102
}
```
