---
"@cosyte/ccda": minor
---

feat: report a coded value that sits outside the value set its slot is bound to

A consumer could learn that a coded value's code system was unexpected, and, with a terminology
adapter, that its code was not a real member of that system. Neither question is the one a
certifier asks. C-CDA binds each checked slot to a **value set**, and where that binding is
Required the standard states membership as a SHALL, so a document can carry the right system and a
real code and still be non-conformant at a safety-critical slot. Nothing in this package could see
that case.

`parseCcda(xml, { valueSets })` now takes a bring-your-own `ValueSetSource` beside the existing
`terminology` adapter. It answers one question, `isMember`, and it declares the `release` of the
package it answers from. A code the source reports outside a Required binding's value set raises
`VALUE_SET_BINDING_VIOLATED`; a value set the source holds no expansion for raises
`VALUE_SET_BINDING_NOT_EVALUATED`, never silence, because a skipped value set reads exactly like a
clean one; returning `undefined` is "no opinion" and is silent. An exception your source raises
reaches you rather than being swallowed into a document that merely looks checked.

**This package ships value set identifiers and never their member codes.** Expansions are licensed
data. `valueSetBinding(slot)` and `valueSetBindings()` expose the declaration: for each of the five
checked slots, the bound value set's OID, whether C-CDA R2.1 binds it as `required` or `preferred`,
and the conformance statement, template and artifact revision the row was read from. Every row was
read off the normative C-CDA R2.1 Schematron this repository already pins by commit and digest, so
no binding is asserted that the normative source was not read for.

**Four of the five bindings are Required and one is Preferred, and the difference is reported, not
rounded off.** A Preferred binding never produces the Required-binding finding: the Problem
Observation's value SHALL be present and its code only SHOULD come from the Problem value set, and
reporting a departure from that as a SHALL violation would turn a conformant problem list into a
defect. Binding strength is the verb attached to "be selected from", not the cardinality beside it:
a `routeCode` a template only SHOULD contain, whose code SHALL come from the route value set, is a
Required binding.

Nothing a parse returns changes. No value is refused, rewritten, reordered or dropped on a negative
verdict, the document re-serializes identically, and a parse that supplies no source produces
exactly the findings it always did: membership is never inferred from the code system alone.

**This is why the bump is minor rather than patch.** It adds two warning codes and eleven exported
symbols (`ValueSetSource`, `ValueSetMembershipQuery`, `ValueSetMembershipAnswer`, `ValueSetBinding`,
`ValueSetBindingStrength`, `ValueSetBindingSource`, `BoundValueSet`, `valueSetBinding`,
`valueSetBindings`, `valueSetBindingViolated`, `valueSetBindingNotEvaluated`), and renames, removes
and repurposes nothing. `CcdaWarning` gains two optional fields, `valueSet` and `valueSetRelease`,
carried only by the two new codes: a message still comes whole from the frozen registry, so the
value set OID and the release ride as data rather than as interpolated text, and the coded value
that caused the finding appears nowhere in it.
