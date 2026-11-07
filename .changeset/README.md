# Changesets

This folder is managed by [Changesets](https://github.com/changesets/changesets). Changesets drives
the **version bump**, the **publish**, and the **release section in `CHANGELOG.md`** for
`@cosyte/ccda`: a release writes its own version heading there from the changesets it consumed. So
**the changeset summary is the changelog entry**. Write it there and do not hand-edit
`CHANGELOG.md`, whose sections above `## Released before this file was generated` are generated
output.

Add a changeset for every meaningful change:

```bash
pnpm changeset
```

The package is on the 0.1 line. Classify the bump from what the change does, as `CLAUDE.md` says:
**minor** when it adds an export or a warning or fatal code, **patch** for everything else. The
release standard behind this (a generated changelog, a `vX.Y.Z` tag and a GitHub release for every
version) is ST35 in the umbrella's `plans/standards.md`.
