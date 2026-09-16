# Code systems, terminology and provenance, in full

Slot validation, the bring-your-own terminology adapter, and what a `nullFlavor` asserted
beside a value does to a derived reading. Moved out of `README.md` so the front page stays
short enough to read in one sitting. Nothing is rewritten: the headings and the prose below
are the ones `README.md` carried, at the heading levels it used, and `README.md` links here
from the heading the text left behind.

## Code systems & provenance

Slot validation (`checkCodeSlot`, exported OIDs `SNOMED_CT` / `RXNORM` / `ICD10_CM` / `NDC` / `UNII` /
`NCI_ROUTE` / …) is **structural recognition only**: it checks that a coded value's `@codeSystem` OID
is one expected for its slot and flags a deprecated (ICD-9) or unexpected terminology. It deliberately
does **not** verify that a code is a real member of its system: that needs licensed terminology
content (SNOMED CT / RxNorm via UMLS), which this suite never bundles. The OIDs themselves are public
identifiers, not redistributable code-system data. Bring your own terminology service for membership
checks.

**Bring-your-own terminology adapter (semantic validation).** For that last tier, `parseCcda` and
`buildCcda` accept an optional `terminology` adapter: a small, dependency-free interface
(`TerminologyAdapter`) you implement over your own licensed terminology service. `@cosyte/ccda` imports
no terminology library; it only calls the adapter you supply, and only when supplied (absent → the
recognize-only behavior above). Its shape mirrors the FHIR Terminology Module (`$validate-code`,
`$translate`) and the sibling `@cosyte/terminology` engine, so you can wire that in behind it:

```ts
import { parseCcda, type TerminologyAdapter } from "@cosyte/ccda";

const adapter: TerminologyAdapter = {
  // system is the C-CDA @codeSystem OID exactly as the document carries it.
  validateCode: (coding) =>
    coding.system === "2.16.840.1.113883.6.96" // SNOMED CT
      ? { result: mySnomedService.has(coding.code) }
      : undefined, // no opinion on other systems → no warning
};

const doc = parseCcda(xml, { terminology: adapter });
// A structurally-valid but non-member code now carries SEMANTIC_CODE_INVALID,
// surfaced verbatim, never rewritten to a "corrected" value.
```

The adapter can only ever **report**: a `validateCode` verdict of `{ result: false }` raises
`SEMANTIC_CODE_INVALID` with the code preserved verbatim (never coerced); `undefined` means "no
opinion" (silent).

> **The adapter is consulted at five coded slots only, so read a silent document carefully.** Those
> slots are the `CodeSlot` set `checkCodeSlot` recognizes: `problem`, `medication`, `allergen`, `route`,
> and `vaccine`. Every other coded value is **never handed to your adapter** and therefore can never
> raise `SEMANTIC_CODE_INVALID`: the Results and Vital Signs LOINC codes, the procedure, encounter and
> family-history codes, the planned-item codes for the five variants whose `code` is the planned act
> (the other two are exceptions: a planned **medication**'s `code` is the drug and a planned
> **immunization**'s is the vaccine, so those are checked at the `medication` and `vaccine` slots
> like any other), the smoking-status, functional-status and mental-status
> observation values, the allergy propensity type, and the reaction, severity and criticality
> observations. Within the five, the checks apply to the slot's **primary** coding; alternate codings
> carried in `<translation>` are preserved and re-serialized but are not themselves slot-checked.
> **A clean run means those five slots passed, not that the document's terminology was verified.**

A coded value at one of those slots that asserts a `@code` with **no** `@codeSystem` never reaches the
adapter, which validates a system + code pair. It is flagged `MISSING_CODE_SYSTEM` instead, and the
system is **never inferred**, not from the slot's expected list and not from a `@codeSystemName` label,
which is display text rather than an identifier. A code without its system is not a code: `250.00` is
diabetes in ICD-9-CM and an unrelated concept elsewhere.

The mirror shape is flagged too: a slot that is **present** but asserts no usable `@code` (absent,
empty, or whitespace) **and** declares no `@nullFlavor` raises `MISSING_CODE_VALUE`. A system without
a symbol identifies a concept no better than a symbol without a system. The `@nullFlavor` is what
separates the two cases, and a `nullFlavor`-only value stays silent: it is a _complete_ statement
("this concept is unknown"), while a value that says nothing at all leaves you unable to tell an
absent concept from one lost in transformation. An absent element is silent too, there is nothing
there to judge.

### A `nullFlavor` asserted beside a value

`<doseQuantity nullFlavor="UNK" value="10" unit="mg"/>` says two incompatible things: this quantity is
unknown, and this quantity is 10 mg. The parser flags it `CONTRADICTORY_NULL_FLAVOR` (safety-critical,
so no profile can tolerate it) and **resolves the contradiction against the number**:

```ts
const dose = doc.getMedications()[0]?.dose;
dose?.value; // undefined  ← not 10
dose?.raw; // "10"
dose?.unit; // "mg"
dose?.nullFlavor; // "UNK"
```

Nothing the document said is lost. What is withheld is the reading the parser would have
_manufactured_ from it: `value` is a `number` derived from `raw`, and `raw` is still right there. This
is the same rule `MALFORMED_DATETIME` already applies one datatype over, where `TS` keeps `raw` and
drops the parsed `date`.

The warning itself is **class-wide**: `PQ`, `TS`, `IVL_PQ`, `IVL_TS`, `CD`, `II`, `ST`, `ED` and `BL`
all route their `nullFlavor` through one check, as do the `INT` and `ST` arms of an observation
`<value>` (the slot that carries lab values and assessment-scale scores), which are parsed inline
rather than through the datatype layer.

**Where the withholding applies, and where it does not.** `PQ.value`, `TS.date`, and an `integer`
observation value's `value` are withheld, because they are the places in the model where a verbatim
copy survives beside a derived reading (the `integer` value carries `raw` for exactly this reason, as
`PQ` does). On `CD`, `II`, `ST`, `ED` and `BL` the value-bearing field **is** the document's own text
(`@code`, `@extension`, the element's content) with no second copy, so withholding it would delete
what the document said rather than decline to embellish it. Those keep the field: a contradicted
`allergy.allergen.code` still returns the code, with `nullFlavor` on the same object and the warning
in `doc.warnings`.

**Where a derived reading exists above the datatype, it is withheld there instead.** The one place
this model manufactures an identifier out of an `II` is `pickMrn` (behind `getMrn()`), which
_selects_ one `<id>` from a list and flattens it to a bare `string` with the `nullFlavor` gone. So
`getMrn()` withholds when the first `patientRole/id` is null-marked:

```ts
doc.getMrn(); // undefined  ← the document marked that <id> unknown
doc.getPatient()?.identifiers[0]; // { root, extension: "MRN001", nullFlavor: "UNK" }
```

It withholds rather than falling through to the next `<id>`. CDA R2 makes `patientRole/id` `1..*`
and nothing in the document ranks the entries, so the second id is not another MRN, it is whatever
the sending system listed second, often a plan member number, an account number, or the SSN under
`2.16.840.1.113883.4.1`. Substituting it would answer confidently from a different assigning
authority with no signal naming the substitution. A caller who knows their own authority OIDs can
resolve it from `getPatient()?.identifiers`, which still reports every id in full.

The other identity slots (`ClinicalDocument.id`, `setId`, `parentDocument/id`, entry-level `<id>`s)
are only ever reported as the whole datatype beside the warning, so there is no naked value to
withhold. `templateId` is the stated exception: document- and section-type recognition does derive a
reading from its `@root`, so a null-marked `templateId` still resolves a document type. That is
deliberate, a `templateId` is a conformance assertion about the document's shape rather than an
identifier for a person or a record, so a mis-read costs a spurious `REQUIRED_SECTION_MISSING`, not
a misattributed clinical fact. On the emit side, `editCcda` refuses to stamp an `RPLC` revision from
a null-marked `ClinicalDocument.id` (`CcdaEditError` `SOURCE_MISSING_ID`) rather than copy
`root`/`extension` forward and drop the marking.

Only a _value-bearing_ assertion contradicts. Metadata that qualifies a null value is coherent and
stays silent: a `PQ` `@unit` with no `@value` (a dimension without a magnitude), an `II` `@root` with
no `@extension` (a namespace without a local identifier), and a `CD`'s `originalText`,
`<translation>`, `displayName` or bare `@codeSystem`, which is the documented C-CDA idiom for "not
codable in the bound value set, here is the source text or an alternate coding".

**Provenance:** no normative SHALL is cited for this, and none is invented. The CDA R2 schema declares
`nullFlavor` and the value attributes independently, so the shape is schema-valid. The rule rests on
HL7 v3 datatype semantics, where `nullFlavor` marks an _exceptional value_, one with no proper value,
and on the harm ordering: of the two readings, the reassuring one is the one that can hurt a patient.

The interface also declares an optional `translate` (`$translate`) method. `buildCcda` consults it at
the same five slots (problem value, allergen, medication drug and route, vaccine and route) and emits
any returned coding as a spec-clean CDA R2 `<translation>` alternate **beside** the primary code, an
_additional_ coding, never a substitution:

```ts
import { buildCcda, type TerminologyAdapter } from "@cosyte/ccda";

const adapter: TerminologyAdapter = {
  validateCode: () => ({ result: true }),
  // Map a SNOMED problem to an ICD-10-CM alternate; empty matches ⇒ unmapped (never fabricated).
  translate: (coding) =>
    coding.code === "38341003" // Hypertension (SNOMED CT)
      ? {
          matches: [
            { system: "2.16.840.1.113883.6.90", code: "I10", display: "Essential hypertension" },
          ],
        }
      : { matches: [] },
};

const doc = buildCcda(init, { terminology: adapter });
// The problem <value> now carries a <translation> alongside its verbatim SNOMED code;
// parseCcda reads the primary code unchanged and surfaces the alternate in CD.translation.
```

Here too the adapter can only ever **add**: `translate` returning `undefined` (no opinion) or an empty
`matches` (unmapped) emits no `<translation>` and leaves output byte-identical, and the primary code is
never rewritten to satisfy it. The Results and Vital Signs LOINC codes, the reaction / severity /
criticality observations, and the procedure, encounter, planned-item and family-history codes are **not**
wired for `<translation>` emission, and neither is the section-rebuild path `editCcda` uses.

