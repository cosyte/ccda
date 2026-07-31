---
"@cosyte/ccda": patch
---

Warning and fatal messages no longer echo anything from the parsed document. Every message now comes
whole from a frozen registry, and no factory takes a value parameter, so a template OID, a section
`@code`, a `nullFlavor` token, a unit, an `xsi:type`, a `@moodCode`, a `<reference>` target and an XML
element name can no longer reach `.message`, `err.message` or `err.stack`.

This is a behaviour change on a surface people log. Thirteen warning factories and the
`NOT_A_CLINICAL_DOCUMENT` fatal used to interpolate a value taken straight from the document: a
500,000-byte `templateId` root produced a 500,106-byte `.message`, unbounded, on a 30 MB input
ceiling. The published docs claimed the opposite.

- **One exported signature changed: `semanticCodeInvalid(position, slot, observedOid)` is now
  `semanticCodeInvalid(position, slot)`.** It is the only warning factory besides
  `profileQuirkApplied` that this package exports, so that is the whole breaking surface for a
  consumer. Every warning **code** is unchanged, so branching on `w.code` is unaffected. The other
  forty-odd factories are internal and lost their value parameters too.
- **`PROFILE_QUIRK_APPLIED` no longer restates the tolerated warning's message or names the profile in
  its text.** Both are still there as typed fields, `toleratedCode` and `profile`.
- **`CcdaPosition` is bounded rather than copied.** `path` is echoed only when the element local name
  is one this parser navigates, `sectionCode` only when the code has the shape of a LOINC part number;
  anything else reads `<withheld>`. `line` and `column` are unchanged and still locate exactly.
- **The model is bounded too, not just the diagnostics.** On a `templateId` all four `II` fields are
  bounded: `root` must look like a UID, `extension` like a version stamp, `nullFlavor` must be in the
  v3 NullFlavor table, and `assigningAuthorityName` (meaningless on a template, and free text) is
  withheld outright. An unsupported observation value's `xsiType` must be a listed HL7 v3 datatype
  name, and an `ED`'s `mediaType`, `representation` and `nullFlavor` listed values. Recognition cannot move: every
  catalog OID and version stamp passes its shape. Patient identifiers are deliberately not bounded:
  an `II.extension` outside a `templateId` is the identifier the model exists to report.
- **Not quite "a conforming document is untouched".** The datatype and media-type lists are
  hand-assembled, so a legitimate but unlisted `xsi:type` or media type now reads `<withheld>` on the
  model where `0.0.4` read the token. The value's own text is still beside it and `doc.toString()` is
  unchanged, so this costs diagnostic detail, not data.
- **Two specifics are genuinely gone from the diagnostics**, and are worth knowing before you rely on
  them: `MULTIPLE_EFFECTIVE_TIMES_UNRESOLVED` no longer says how many siblings it could not classify
  and no model field counts them; and a `PROFILE_QUIRK_APPLIED` keeps the tolerated `code` and
  `position` but not its wording, so which `CodeSlot` a tolerated `UNEXPECTED_CODE_SYSTEM` was about
  is not recoverable from it. Everything else a message used to name is on the model, and
  `doc.toString()` re-emits the parsed DOM byte-for-byte in every case.
