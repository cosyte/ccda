# GitHub repository description (proposal of record)

The line below is the proposed one-line GitHub repository description for
`cosyte/ccda`. It is the entire proposal; everything beneath it is provenance.

```text
C-CDA parser, serializer, and builder for Node.js and TypeScript: lenient on parse, spec-clean on emit.
```

## Application status

Not applied.

No stage of the SDD pipeline that produced this file can reach the GitHub
repository description field: a stage's only egress writes into a spec folder,
and no verb or allowlisted command touches the GitHub repository settings API.
The **operator** is the party who applies this proposal, by copying the fenced
line above into the repository description field with no editing of any kind.

The report that the field is currently empty comes from the backlog item that
seeded this work (`S0195-ccda-description-1`, "Currently public with no
description"). It is carried here as a premise attributed to that item. No
stage of this pipeline observed that field's value, and nothing here should be
read as a claim that one did.

## Rewrite status

Rewrite required: yes

The `description` in `package.json` before this change was:

`C-CDA parser, serializer, and builder for Node.js and TypeScript, lenient on parse, spec-clean on emit.`

It satisfies constraints 1 through 5 below and fails **constraint 6**: it
separates the shared family phrase from the differentiator with a comma rather
than with the required colon-and-space separator. The rewrite keeps the
`C-CDA` token, the capabilities list and the differentiator wording exactly as
they were and corrects only that separator. Nothing was truncated to reach
conformance. The `description` in `package.json` is byte-identical to the
fenced line above.

## The formula this line was derived from

A conforming suite description is ONE line of the shape:

`<STANDARD> <capabilities> for Node.js and TypeScript: <differentiator>.`

- `<STANDARD>` is the healthcare data standard the repo implements, named as
  the org names it. For this repo that token is exactly `C-CDA`, hyphenated,
  and the line starts with it.
- `<capabilities>` is the primary artefacts the package ships, as a comma
  separated noun list. Here: `parser, serializer, and builder`.
- `for Node.js and TypeScript` is verbatim and identical in every suite repo.
  It is the phrase that makes the suite read as one product family.
- `: ` is a colon and one space separating the family phrase from the
  differentiator.
- `<differentiator>` is one short clause on what this implementation is like,
  with no marketing superlatives, no version numbers and no links. Here:
  `lenient on parse, spec-clean on emit`.
- The line is terminated by a single `.`.

The mechanical constraints, all checkable against the fenced line above:

1. Exactly one line; no embedded newline.
2. Length between 40 and 140 characters inclusive (this line: 103).
3. Printable US-ASCII only. No en dash, no em dash, no smart quotes, no emoji.
4. Begins with `C-CDA ` and contains the substring `for Node.js and TypeScript`.
5. Ends with `.` and carries no leading or trailing whitespace.
6. Contains the substring `for Node.js and TypeScript: `, the colon separator
   the shape above already requires.

Provenance: umbrella spec `work/specs/S0195-ccda-description-1/spec.md`, which
is where the suite-wide formula is normative.
