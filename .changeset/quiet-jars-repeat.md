---
"@cosyte/ccda": patch
---

version stamps: a document says which C-CDA release it was written for

C-CDA 3.0.0 gave every document template a new `@extension`, `2024-05-01`, and
4.0.0 and 5.0.0 kept it, so a document written for a release later than R2.1 is
detectable from the `templateId` that resolves its type. Through `0.0.15` this
parser got that case wrong twice, once loudly and once in silence.

Loudly: any `@extension` that was not `2015-08-01` drew
`TEMPLATE_EXTENSION_ABSENT`, whose frozen message reads "carries no @extension
version stamp ... (may pre-date R2.1)". For a `2024-05-01` document both halves
are false, because it carries a stamp and it post-dates R2.1.

Silently, and worse: the same path reported the document as unstamped, and the
required-section tables read that as the R1.1-origin **reduction**, which drops
every R2.1-stamp-scoped SHALL key. A post-R2.1 CCD carrying neither Social
History nor Vital Signs therefore drew no `REQUIRED_SECTION_MISSING` at all. The
library had classified a document from the future as one from the past.

**Two warning codes are added and none is renamed or removed.**
`TEMPLATE_EXTENSION_UNMODELED_RELEASE` fires when the resolving `templateId`
carries an `@extension` that is present and is not the R2.1 stamp;
`REQUIRED_SECTIONS_NOT_EVALUATED` fires once for such a document to say its SHALL
obligation was not computed. `TEMPLATE_EXTENSION_ABSENT` keeps its narrower
meaning ("no `@extension` at all", the R1.1-origin shape) and its registry message
byte for byte.

**An unmodelled stamp is reported, never reduced.** Such a document draws no
`REQUIRED_SECTION_MISSING` in either reading, and
`requiredSectionStatus(type, { stamp: "unmodeled-release" })` reports
`evaluation: "not-evaluated"` so an empty key set still says which emptiness it
is. `evaluation` is a new field on `RequiredSectionStatus` and a separate axis
from `verification`, which remains a claim about the document type that no option
moves.

**The release this package validates against is an exported value now.**
`CCDA_CONFORMANCE_RELEASE` is `"R2.1"`, beside the closed table of stamps this
package can name (`CCDA_RELEASE_STAMPS`, plus `R30_EXTENSION`,
`releaseForTemplateExtension` and the three-state `readTemplateStamp`). **This
does not retarget the library**: regulation still adopts R2.1 and SVAP use is
voluntary, so a later release is recognized and named, never read against.
4.0.0 also relaxed the US Realm Header and 5.0.0 added a Pregnancy Section, and
neither is modelled here.

Four things are decisions rather than details:

- **A reported stamp comes from a closed set of literals this package owns.** A
  message names a member of `CCDA_RELEASE_STAMPS` or names no stamp at all, so a
  sender-controlled `@extension` can never reach a `CcdaWarning.message` (or,
  under `{ strict: true }`, a thrown error's stack). No factory gained a
  parameter that a message interpolates.
- **The existential R2.1 rule is unchanged and beats a later stamp.** A document
  carrying the resolving root twice, once stamped `2015-08-01` and once for a
  later release, is inside the Schematron rule's context and is evaluated under
  the full R2.1 obligation, in either sibling order.
- **`{ r21Stamped }` behaves exactly as it did.**
  `requiredSectionKeys("ccd", { r21Stamped: false })` returns the same four keys
  in the same order. A boolean cannot express three states, so the three-state
  `{ stamp }` was added beside it rather than repurposing a published option.
- **`legacyR11` does not tolerate the new code.** It is receive-tolerance for
  documents from the past, grounded in the receive-both-R2.1-and-R1.1
  requirement; quieting a future-release stamp there would restore the silence
  this change removes. Neither new code is safety-critical, so a consumer who has
  read the later guide can still write their own profile for it.

Nothing became stricter. No fatal was added, no content the C-CDA open-template
rule permits is refused, and a post-R2.1 document's clinical reading (patient,
sections, entries, values) and its byte-faithful re-serialization are identical
to the same document stamped `2015-08-01`. Under `{ strict: true }` the new
warnings escalate like every other Tier-2 warning, which is pre-existing
caller-opted behaviour.
