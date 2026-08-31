# Release 0.1.0 audit

`@cosyte/ccda` is published at `0.0.15`. This document audits the pending changeset
set, certifies the public API surface against a `0.1.0` release, records the bearing
of the one runtime dependency on that certification, and registers the break
candidates the pending set carries.

**This audit publishes nothing and decides nothing.** It reclassifies changeset bump
lines and writes this file. It does not run `changeset version`, `pnpm run version`,
`pnpm run release` or `changeset publish`; it does not edit `version` in
`package.json` (still `0.0.15`) or the `VERSION` export (still `"0.0.15"`); it does
not approve or cancel a parked `release` environment run. Every break candidate below
is left unresolved and undisturbed in the code. See **Release status** at the end.

The `0.1.0` number is a semantic claim: that the public API is settled and stable
enough to depend on. What follows is what could be established about that claim from
this tree, and, as importantly, what could not.

Audited against commit `af150080c18068f8bded87266ba413c5dc8d376f`, with the built
declarations produced by `pnpm run build` at that tree.

## The pending changeset set

Six changesets are pending in `.changeset/`:

```
lucky-pandas-refuse.md
olive-pumas-greet.md
pink-cobras-invent.md
plenty-donuts-attack.md
quiet-jars-repeat.md
rare-owls-listen.md
```

All six were `patch` before this audit, computing `0.0.16`.

### Drift from the set this audit was scoped against

The audit was scoped against five files. The set actually present carries **six**.
The difference, by file name:

| file | status |
|---|---|
| `lucky-pandas-refuse.md` | present, as scoped |
| `pink-cobras-invent.md` | present, as scoped |
| `plenty-donuts-attack.md` | present, as scoped |
| `quiet-jars-repeat.md` | present, as scoped |
| `rare-owls-listen.md` | present, as scoped |
| `olive-pumas-greet.md` | **added since the audit was scoped; not in the scoped list** |

No scoped file is missing. `olive-pumas-greet.md` is the README standardization
changeset and is audited below on the same rule as the other five. The set actually
present is what was audited.

## Classification

The rule applied: a changeset whose body names a symbol newly exported from the
package entry point, or a newly added warning or fatal code, is `minor`; a changeset
whose body changes no published surface keeps `patch`. Every symbol and code a body
claims was checked against the built declarations and the built module before its
bump line was touched (see **Unresolved**).

Four changesets earn `minor`; two keep `patch`. No changeset was added and none was
deleted. Only the bump line was edited in each case; no body text was changed.

| changeset file | classification | the sentence the classification was read from |
|---|---|---|
| `lucky-pandas-refuse.md` | `minor` | "`requiredSectionStatuses(options?)`: all twelve, so the whole picture is enumerable by a consumer." |
| `olive-pumas-greet.md` | `patch` | "No parse, emit, builder or profile behaviour changes, and no documented behaviour was dropped: every reference section the page carried is still on it." |
| `pink-cobras-invent.md` | `minor` | "The new `RequiredSectionSource` type is exported alongside it." |
| `plenty-donuts-attack.md` | `patch` | "No published API, warning code or parser behaviour changes; this is the commit gate only." |
| `quiet-jars-repeat.md` | `minor` | "Two warning codes are added and none is renamed or removed." |
| `rare-owls-listen.md` | `minor` | "A top-level `<entry>` that a subject declaration governs is now **withheld** from every record-target read path and flagged with a new safety-critical Tier-2 warning, `SUBJECT_CONTEXT_OVERRIDE`, which no vendor profile may tolerate." |

Notes on individual rows, so the table is auditable rather than merely stated:

- **`lucky-pandas-refuse.md`.** The quoted sentence is one bullet under the body's
  `New exports:` list. That list names `requiredSectionStatus`,
  `requiredSectionStatuses` and `DOCUMENT_TYPES` as new values and
  `RequiredSectionStatus`, `RequiredSectionVerification`, `TracedRequiredSection`,
  `UnassertedRequiredSection` and `UnassertedSectionReason` as new types. All eight
  are present in `dist/index.d.ts`. Any one of them earns `minor` on its own.
- **`olive-pumas-greet.md`.** `README.md` is in the package's `files` array and does
  ship inside the tarball, so this changeset does change bytes a consumer receives.
  It changes no exported symbol and no warning or fatal code, which is what the rule
  keys on, so it stays `patch`.
- **`pink-cobras-invent.md`.** `RequiredSectionSource` is present in
  `dist/index.d.ts`. This changeset also moves the values returned by
  `requiredSectionKeys` and `missingRequiredSections`, which is why it carries the
  largest share of the break-candidate register below.
- **`plenty-donuts-attack.md`.** The change is entirely inside `scripts/phi-scan.ts`
  and its supporting files. `scripts/` is not in the `files` array, so none of it
  reaches `dist` or the tarball.
- **`quiet-jars-repeat.md`.** The body sets the quoted sentence in bold. The two
  codes are `TEMPLATE_EXTENSION_UNMODELED_RELEASE` and
  `REQUIRED_SECTIONS_NOT_EVALUATED`; both are present in the built `WARNING_CODES`.
  The changeset also newly exports `CCDA_CONFORMANCE_RELEASE`, `CCDA_RELEASE_STAMPS`,
  `R30_EXTENSION`, `releaseForTemplateExtension` and `readTemplateStamp`, all present
  in `dist/index.d.ts`, so the row is earned twice over.
- **`rare-owls-listen.md`.** `SUBJECT_CONTEXT_OVERRIDE` is present in the built
  `WARNING_CODES` and `isSafetyCriticalCode("SUBJECT_CONTEXT_OVERRIDE")` returns
  `true`, matching the body's claim. This changeset exports no new symbol; the new
  warning code alone earns `minor`.

### What the set now computes

With those four lines set to `minor`, the pending set computes exactly one release:

```
@cosyte/ccda   minor   0.0.15 -> 0.1.0
```

One package, one release, `0.1.0`. All six changesets are consumed by it.

`0.1.0` is therefore reachable from the pending set on the honest classification
alone. No changeset was added to force the bump, and none would have been: had no
changeset earned `minor`, this section would have recorded `0.1.0` as unreachable
from the pending set and left the decision to the operator rather than manufacturing
a bump.

## Public API surface certification

### Method

The surface is enumerated from the **built type declarations**, not from the export
list in `src/index.ts`. `package.json` points `types` at `dist/index.d.ts` and
resolves both `exports["."].import.types` and `exports["."].require.types` into
`dist/`, so the declarations are what a consumer's compiler actually reads. The
enumeration walks the module symbol of `dist/index.d.ts` with the TypeScript compiler
API and takes `getExportsOfModule`, which resolves re-exports and aliases rather than
counting export statements.

Reading `src/index.ts` alone cannot produce this list. That file ends its enumerated
exports with a wildcard, `export * from "./model/types/index.js"`, and a wildcard's
contribution is not visible in the file that writes it.

`dist/index.d.ts` and `dist/index.d.cts` are **byte-identical** at this tree (321192
bytes each, zero differing lines), so a single enumeration certifies both the ESM and
the CJS type conditions.

### Counts

| measure | count |
|---|---|
| exported names in `dist/index.d.ts` | **226** |
| of those, value-side (functions, classes, const values) | 108 |
| of those, type-only (interfaces, type aliases) | 118 |
| contributed by the explicit export statements in `src/index.ts` | 202 |
| contributed by the wildcard `export * from "./model/types/index.js"` | **24** |

### What the wildcard re-export contributes

The wildcard contributes **24** names: 13 value-side and 11 type-only. All 24 reach
`dist/index.d.ts`; none is shadowed or dropped. In full:

**Values (13):**

```
NULL_FLAVORS      isNullFlavor      parseBl           parseBlAttr
parseCd           parseEd           parseIi           parseIvlPq
parseIvlTs        parsePq           parseSt           parseTs
parseV3DateTime
```

**Types (11):**

```
BL      CD      ED      II      IVL_PQ    IVL_TS
NullFlavor        PQ      ParseCtx        ST      TS
```

Two things about that list matter to a `0.1.0` claim:

1. These 24 names are public API that no reader of `src/index.ts` sees enumerated.
   A future edit to `src/model/types/index.ts` adds to or removes from the published
   surface without touching the entry point, and no gate in this repo reports it.
2. **Ten of the 24 carry `@xmldom/xmldom` types in their signatures**
   (`parseBl`, `parseBlAttr`, `parseCd`, `parseEd`, `parseIi`, `parseIvlPq`,
   `parseIvlTs`, `parsePq`, `parseSt`, `parseTs`), so the wildcard is also an
   unenumerated share of the dependency exposure described in the next section.

### Where this certification does not reach

Recorded plainly, because a certification that does not state its limits is worth
less than none.

- **It certifies names and declared types, not behaviour.** A symbol whose runtime
  behaviour changes while its declared type holds still is invisible to this method.
  Four of the six pending changesets change behaviour; they are in the register
  below, found by reading the changeset bodies, not by this enumeration.
- **There is no committed API baseline in this repo.** No API Extractor report, no
  `.api.md`, no snapshot of the export list is tracked. So this enumeration is a
  measurement taken once, at one commit, by a script that is not committed and does
  not run in CI. Nothing will fail if the surface moves after this audit, and there
  is no artifact for a future release to diff against. If `0.1.0` is meant to be a
  standing promise rather than a claim about one afternoon, that gap is the first
  thing to close, and closing it is out of scope here.
- **`@xmldom/xmldom`'s types are inside the certified surface but are not this
  package's to hold still.** See the next section; this is the single largest
  qualification on the whole certification.
- **The published `.d.ts` carries a known documentation defect.** This repo's own
  agent documentation records 64 `@example` blocks citing an import specifier that
  does not resolve, four of which reach consumers in the published declarations. That
  is filed and open. It does not move a type, but it is on the published surface and
  a `0.1.0` reader will meet it.
- **Only the `.` export condition was enumerated.** The package's other export,
  `./package.json`, is data rather than API.
- **The section-key vocabularies, warning codes and fatal codes are public contract
  but were not separately enumerated here** beyond the specific codes the changeset
  bodies claim. The built registries carry 50 warning codes and 7 fatal codes at this
  tree; renaming any one of them is a breaking change per this repo's own standing
  disciplines.

## The `@xmldom/xmldom` runtime dependency

`@cosyte/ccda` carries exactly one runtime dependency, `@xmldom/xmldom`, exact-pinned
at `0.9.10`. It is the suite's capped, ADR-justified exception to a zero-runtime-
dependency default, and the ADR that ratifies it describes it as a one-way door: once
published, consumers inherit it and removing it later is a breaking change.

**The finding: those types are not merely in the tree, they are in the signatures of
exported symbols.** The first line of the published `dist/index.d.ts` is

```ts
import { Element, Document } from '@xmldom/xmldom';
```

and **39 of the 226 exported names reference `Element` or `Document` in their
declarations**. Named in full, since a count is not a finding:

- **The entry point's DOM read helpers, all seven:** `attr`, `child`, `children`,
  `childElements`, `text`, `xsiType`, `positionOf`.
- **`parseSecureXml`**, which is the one carrier of `Document` rather than `Element`.
- The model builders: `buildDocument`, `buildHeader`, `buildSection`,
  `buildNarrativeIndex`.
- All fifteen entry extractors: `extractClinical`, `extractProblems`,
  `extractMedications`, `extractAllergies`, `extractResults`, `extractVitals`,
  `extractImmunizations`, `extractProcedures`, `extractEncounters`,
  `extractSmokingStatus`, `extractPlannedItems`, `extractFunctionalStatus`,
  `extractMentalStatus`, `extractFamilyHistory`, `extractPastMedicalHistory`.
- The observation readers `readObservationValue` and `readReferenceRange`.
- The ten datatype parsers the wildcard contributes: `parseBl`, `parseBlAttr`,
  `parseCd`, `parseEd`, `parseIi`, `parseIvlPq`, `parseIvlTs`, `parsePq`, `parseSt`,
  `parseTs`.

`Node` is imported from `@xmldom/xmldom` inside `src/model/dom.ts` but does not reach
the published declarations; only `Element` and `Document` do.

**What this does to an unqualified `0.1.0` stability claim.** `@xmldom/xmldom` is
itself on a `0.x` line, which by its own maintainers' semver signals advertised
non-completeness. Because `Element` and `Document` are imported into the published
declarations rather than restated by this package, a `@xmldom/xmldom` release that
changed either type would change the public type surface of `@cosyte/ccda` for a
consumer who installs it, **without `@cosyte/ccda` changing a line, cutting a
changeset, or moving its own version number**. A consumer's build could start failing
against a `@cosyte/ccda` version they never upgraded.

The exact pin (`0.9.10`, not a caret) is what holds this in check today, and it holds
it well: an exact pin means no consumer receives a different `@xmldom/xmldom` through
this package's own dependency resolution. But a pin is a decision this package can
revisit, and it does not bind a consumer who installs `@xmldom/xmldom` themselves at
a different version and hands its `Element` to one of the 39 symbols above.

So an **unqualified** claim that "the public API of `@cosyte/ccda` 0.1.0 is stable"
is not supportable as written: 39 of 226 exported names are stable only as far as a
third party's `0.x` types are, and this package does not control that. The claim is
supportable **qualified**, and this audit recommends the qualification rather than a
code change:

> The public API is settled. Where an exported symbol takes or returns a DOM node,
> its type comes from `@xmldom/xmldom`, pinned exactly at `0.9.10`; that dependency
> is on a `0.x` line and its type surface is not covered by this package's stability
> claim.

Three routes that would remove the qualification rather than state it, recorded so
they are decided rather than drifted into, and **none taken here**: restating the DOM
types as this package's own aliases; withdrawing the DOM helpers from the entry
point; or replacing the dependency. The second and third are themselves breaking
changes, so each belongs in the register below and in an operator decision, not in
this audit's diff. Removing or replacing `@xmldom/xmldom` is out of scope for this
work, and so is any change to the ADR that ratified it.

## Break-candidate register

Every candidate the pending set carries that a consumer on `0.0.15` could observe as
a removal, a narrowing, a newly thrown error, or a warning that stops firing.
"Published" means the affected surface reaches `dist` and therefore the tarball;
"repo-internal" means it does not.

**Every one of these is left unresolved and undisturbed in the code by this audit.**
Nothing under `src/` was changed, softened, reverted or guarded. They are surfaced
here so the operator decides, per repo, before any release.

| id | changeset | consumer-visible symptom | surface |
|---|---|---|---|
| BC-1 | `pink-cobras-invent.md` | `requiredSectionKeys("dischargeSummary")` and `missingRequiredSections` no longer return `dischargeMedications`. A consumer keying on that value, or asserting on its presence, sees it disappear. Verified at this tree: the Discharge Summary key set reads `allergies`, `hospitalDischargeDiagnosis`, `planOfTreatment`. | **published** |
| BC-2 | `pink-cobras-invent.md` | `REQUIRED_SECTION_MISSING` **stops firing** for a conformant Discharge Summary that omits a Discharge Medications section. A consumer whose test suite asserts that warning fires there goes red. | **published** |
| BC-3 | `pink-cobras-invent.md` | `REQUIRED_SECTION_MISSING` **newly fires** for Discharge Summary (`planOfTreatment`), History and Physical (six added keys) and Transfer Summary (three added keys). The code is safety-critical, so no vendor profile can quiet it, and under `{ strict: true }` it escalates to a throw on documents that previously parsed. | **published** |
| BC-4 | `lucky-pandas-refuse.md` | `REQUIRED_SECTION_MISSING` **newly fires** on an R2.1-stamped Consultation Note omitting History of Present Illness, Allergies or Problems, where it previously parsed silent. Same escalation to a throw under `{ strict: true }`. | **published** |
| BC-5 | `quiet-jars-repeat.md` | `TEMPLATE_EXTENSION_ABSENT` **narrows**: it previously fired for any `@extension` that was not the R2.1 stamp, and now fires only when there is no `@extension` at all. A consumer matching on that code for a document stamped for a later release stops receiving it and receives `TEMPLATE_EXTENSION_UNMODELED_RELEASE` instead. | **published** |
| BC-6 | `quiet-jars-repeat.md` | Two new warnings fire on documents that previously drew neither. Under `{ strict: true }` they escalate like every other Tier-2 warning, so a caller who opted into strict mode gets a **newly thrown error** on a document that previously parsed. | **published** |
| BC-7 | `rare-owls-listen.md` | **Entries are removed from results.** A document carrying a subject declaration loses those entries from `getProblems()`, `getMedications()`, `getAllergies()` and the other record-target families, where they were previously returned. This is the largest behavioural change in the set. | **published** |
| BC-8 | `rare-owls-listen.md` | `SUBJECT_CONTEXT_OVERRIDE` is safety-critical, so no vendor profile may tolerate it, and under `{ strict: true }` a document carrying an override **now throws** where it previously parsed. | **published** |
| BC-9 | `plenty-donuts-attack.md` | `--allow-fixture` can no longer reach exit 0 in any mode of the repository's PHI scan script. A contributor's local or CI invocation that previously exited 0 now exits 2. | repo-internal |

Read together: **eight of the nine candidates are on the published surface**, all
eight from three changesets, and they cluster in two places. BC-1 through BC-6 are
the required-section and version-stamp work, where the direction of change is
"warns more, and more correctly". BC-7 and BC-8 are the subject-override work, where
the direction is "returns less", which is the more consequential shape: a consumer
who upgrades and does not read the release note gets fewer clinical entries back
from the same document and no compile error anywhere.

Both directions are defensible on safety grounds, and each changeset argues its own
case in its body. **This audit takes no position on any of them and changes none of
them.** The operator decides, per repo, before any release.

A ninth consideration that is a consequence of the bump rather than of any changeset,
recorded here because it changes what consumers receive: at `0.0.15` a caret range
(`^0.0.15`) resolves to exactly that version, so no consumer receives a new release
automatically. At `0.1.0`, `^0.1.0` admits every future `0.1.x`. The same publishing
cadence therefore reaches consumers automatically after this bump where it did not
before, which raises the cost of each of the candidates above.

## Unresolved

Changesets whose body claims an export or a code that the entry point does not carry.
Such a changeset keeps its bump line untouched and is listed here.

**None.** Every symbol and code claimed by every one of the six bodies was checked
against the built module and the built declarations and resolved:

- Exports checked and present: `requiredSectionStatus`, `requiredSectionStatuses`,
  `DOCUMENT_TYPES`, `RequiredSectionStatus`, `RequiredSectionVerification`,
  `TracedRequiredSection`, `UnassertedRequiredSection`, `UnassertedSectionReason`,
  `RequiredSectionSource`, `CCDA_CONFORMANCE_RELEASE`, `CCDA_RELEASE_STAMPS`,
  `R30_EXTENSION`, `releaseForTemplateExtension`, `readTemplateStamp`,
  `requiredSectionKeys`, `missingRequiredSections`.
- Codes checked and present in the built `WARNING_CODES`:
  `REQUIRED_SECTION_MISSING`, `TEMPLATE_EXTENSION_ABSENT`,
  `TEMPLATE_EXTENSION_UNMODELED_RELEASE`, `REQUIRED_SECTIONS_NOT_EVALUATED`,
  `SUBJECT_CONTEXT_OVERRIDE`.

The heading stands whether or not it has entries, so a later reader can tell an empty
`Unresolved` list from an audit that never checked.

## Gate results

The repository's full pre-publish gate chain (`pnpm run prepublishOnly`: clean,
typecheck, lint, test, build, attw) was run at the audited tree with this audit's
changes in place and **passed**, exit code 0:

| gate | result |
|---|---|
| `typecheck` | pass |
| `lint` | pass |
| `test` | pass, 29 files, 1082 tests |
| `build` | pass, ESM + CJS + declarations |
| `attw` | pass, no problems found across node10, node16 CJS, node16 ESM, bundler |
| `check:no-emdash` | pass |
| `phi-scan` | pass |
| `check:agent-notes` | pass |
| `changeset status` | one release, `@cosyte/ccda` `0.0.15` to `0.1.0` |

No gate failed, so no certification in this document is contradicted by the
repository's own checks. Had one failed in a way that could not be made green without
changing behaviour, this section would record the failure and the surface would not
have been certified.

## Release status

**Blocked. Nothing is published by this audit and nothing may be published yet.**

The release is blocked pending the landing of the release-frequency policy that puts
the `release` environment on the publish path only. Until that lands, no release of
this package is authorised, whatever this audit concludes about the classification or
the surface.

Concretely, and recorded so a later reader can confirm nothing was taken:

- `version` in `package.json` is `0.0.15`, unchanged, and the `VERSION` export still
  reads `"0.0.15"`. The version bump is the release pipeline's write, not this
  audit's.
- No release script was run. No `changeset version`, no `pnpm run version`, no
  `pnpm run release`, no `changeset publish`.
- The `Release` workflow's trigger and its caller-side permission contract are
  unchanged, so the run that merging to `main` starts parks at the `release`
  environment and publishes nothing. That contract is asserted by
  `test/release-workflow-contract.test.ts`, which passes at this tree.
- No parked `release` environment run was approved and none was cancelled.

A `Release` run sitting in `waiting` after this merges is the designed steady state,
not a failure to chase.
