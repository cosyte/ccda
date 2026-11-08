---
"@cosyte/ccda": patch
---

The package is now built by tsup 9 through our shared `@cosyte/process`. The JavaScript in `dist/` is byte-identical to 0.1.4. The type declarations name the same exports with the same types; tsup 9 lists the type-only exports in their own `export type {}` statement. The source maps change with the build tool.
