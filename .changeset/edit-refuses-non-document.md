---
"@cosyte/ccda": patch
---

`editCcda` now refuses a source that is not a `CcdaDocument` with `CcdaEditError`
(`NO_SOURCE_DOCUMENT`), the error its signature documents. A caller without the TypeScript types
could pass a plain object such as `{}`: its default `toString` gave `"[object Object]"`, the edit
tried to read that as XML, and it threw `CcdaParseError` (`NOT_WELL_FORMED_XML`) instead. An object
with a `toString` of its own, the XML text itself, and a number are refused the same way. A
document from `parseCcda` or `buildCcda` edits as before, including one made by the CommonJS build
and passed to the ES module build.
