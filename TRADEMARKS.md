# Trademarks

`@cosyte/ccda` is an independent open-source project. Cosyte is **not affiliated with, endorsed by,
or sponsored by** any organization named in this repository or its documentation.

## Why these names appear

A C-CDA document is built on HL7's Clinical Document Architecture and coded with vocabularies that
other organizations publish and maintain. Naming the standard and each code system is the only way to
say which documents the package reads and which codes it recognizes.

Every reference is **descriptive**: it identifies a standard, a code system, or a public conformance
tool, and nothing more. The package ships no code-system release and no value-set expansion.

## Names referenced

| Name                                                     | Where it appears                                                                                                                                          |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HL7, CDA, C-CDA                                          | The documents the package parses, builds, and edits (HL7 CDA R2 with the C-CDA R2.1 templates), and the published C-CDA Schematron it is measured against |
| FHIR                                                     | The shape of the terminology adapter, which mirrors the FHIR terminology operations                                                                       |
| SNOMED CT, LOINC, RxNorm, CVX, ICD-10-CM, CPT, NDC, UCUM | Code systems the parser recognizes by their identifiers, and the documentation's examples; a release of any of them is one you supply                     |
| SMART C-CDA Scorecard                                    | `ccdaProfiles.smartScorecard`, a built-in profile grounded in the public SMART C-CDA Scorecard rubric                                                     |

HL7 and FHIR are the registered trademarks of Health Level Seven International, and their use does
not constitute endorsement by HL7.

All product names, logos, and brands are the property of their respective owners. Use of a name here
does not imply any affiliation with, or endorsement by, its owner. If you own one of these marks and
would like a reference changed, please open an issue.
