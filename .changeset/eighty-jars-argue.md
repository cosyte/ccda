---
"@cosyte/ccda": patch
---

docs: cover the profile, terminology and conformance surfaces, and gate the bundle

The published narrative documentation gained a page and a guard. Three surfaces
that a caller has to configure correctly were described only in passing inside
the limitations page, with nothing a reader could copy and run: the vendor
profile system, the bring-your-own `TerminologyAdapter`, and the required-section
conformance status. Each now has its own section on a new "Conformance, profiles
& terminology" page with an executable example, and every one of those examples
is compiled and run against the built package by the existing doc/code agreement
suite, so a documented call that stops working fails the build rather than
misleading a reader. The terminology example uses an in-process stub adapter: it
opens no socket and needs no licensed terminology service, which is also what
makes it a usable template for testing an adapter of your own.

Three pages claimed the package was "published on npm at `0.0.3`" while it was
twelve patches past that. No page names a published version now; they point at
`npm view @cosyte/ccda version`, which cannot go stale. Every historical note
that dates a behaviour change to a past version is untouched and is now held in
place by a retention floor, because those sentences are the change record for a
reader pinned to an older version, not staleness.

Page frontmatter was inconsistent (`sidebar_label` on five pages of nine) and
`sidebar_position` collided across five pages. Every page now carries the same
four keys, and each position agrees with the page's place in `sidebars.json`
rather than being a second, disagreeing answer to what comes next.

A new guard holds all of it: every symbol the public entry point exports, types
included, must be named by a page or carry a stated reason in a committed
exemption record that cannot outlive the symbol it excuses. The formatter now
covers the bundle as well, so the pages cannot drift out of format.
