---
"@cosyte/ccda": patch
---

Flag a coded value that asserts a `@code` with no `@codeSystem`: the new stable warning code
`MISSING_CODE_SYSTEM`.

`checkCodeSlot` opened with `if (code?.codeSystem === undefined) return;`, so a `CD` carrying a
`@code` but no `@codeSystem` reached neither the structural tier (the slot's deprecated / expected
code-system checks) nor the bring-your-own `TerminologyAdapter`, and emitted no warning of any kind.
A built document parsed with an adapter configured to reject everything produced zero warnings and
never consulted the adapter. A code without its system is not a code (`250.00` is diabetes in
ICD-9-CM and an unrelated concept elsewhere), so this was the parser getting quieter the more broken
the input was, the one direction that can cause harm.

`MISSING_CODE_SYSTEM` now fires at all five wired `CodeSlot`s (`problem`, `medication`, `allergen`,
`route`, `vaccine`). Nothing is inferred: no system is guessed from the slot's expected list or from
a `@codeSystemName` label (display text, not an identifier), and the value is preserved verbatim. The
adapter is still not consulted for such a value, which is correct, it validates a system + code pair
and there is no system, which is exactly why the structural warning is the only signal it can get. An
absent value and a `CD` asserting no `@code` at all (the `nullFlavor`-only shape) stay silent, there
is no concept being asserted; within this check a `nullFlavor` beside an asserted `@code` does not buy
silence (a `nullFlavor` beside a fully coded value is a separate shape, unchanged here).

The code is **safety-critical** (`SAFETY_CRITICAL_CODES`), so no vendor profile may tolerate it. It is
strictly worse than the already-listed `UNEXPECTED_CODE_SYSTEM`, where the system is wrong but known
and a reader can still tell what was meant, and it is the lone signal for such a value since
`SEMANTIC_CODE_INVALID` can never fire behind it. No normative SHALL is cited for either the warning
or the classification, and none is invented: the CD datatype leaves `@codeSystem` optional, so this
rests on the datatype's own semantics (a `@code` is a symbol defined by a code system) and on the harm
ordering that set has always encoded.

Adding a warning code is a public-surface change on the `0.0.x` ladder: a consumer switching
exhaustively on `WarningCode` will see the new member. The shipped sentence "a clean run means those
five slots passed" was false for this shape and is no longer, which is why the fix is upstream rather
than a doc hedge. The docs are updated with it and now also state the two remaining precisions: within
the five slots the checks cover the primary coding (alternate codings in `<translation>` are preserved
but not themselves slot-checked), and a slot asserting no code at all is not judged.
