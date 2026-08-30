---
"@cosyte/ccda": patch
---

README: standardize the page, and make its usage example a test

The npm package page and the GitHub landing page are the same file, and for most
consumers it is the only page they will ever read. It was 1086 lines of deep
reference with no answer above the fold to the three questions a reader arrives
with: what is this for, is it safe to depend on, and what does it do with my
patients' data. It also carried a status line claiming the package was published
at `0.0.3`, twelve patch releases out of date, and a hand-written `alt` string on
the banner that disagreed with the one the brand assets declare for that tile.

The page now opens with the banner (carrying the declared `alt` string), the
title, a one-line hook, the four house badges and the `package.json`
`description` verbatim, followed by a table of contents. Four sections are new:

- **Why this exists**, which names the problem, the nearest alternative a reader
  would otherwise reach for, and why this is not that.
- **Status**, which states the version this package declares, says what that
  version does and does not claim about the public API, and names the surfaces
  that are still moving instead of implying they are settled.
- **PHI and safety**, which states what the library does with patient data for
  each of logging, in-memory retention and writing to disk, and names what the
  consuming application still owns.
- **Contributing**, which says where to ask, whether unsolicited pull requests
  are accepted, and every check a contribution has to clear.

`Install` now states the Node engine floor and the module format. The parse
walkthrough is consolidated into a single `Usage` example that builds a complete
synthetic CCD, reads it back and shows what every call returns, and that block is
now executed by the test suite against the built entry point: an example whose
shown output stops matching what the code produces fails the build. Roughly half
of documentation traffic is agents that lift a usage block verbatim, so a wrong
example is wrong generated code at scale.

No parse, emit, builder or profile behaviour changes, and no documented behaviour
was dropped: every reference section the page carried is still on it.
