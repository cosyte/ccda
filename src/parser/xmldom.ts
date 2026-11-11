/**
 * `@xmldom/xmldom`, loaded the first time something needs it rather than when the package is
 * imported.
 *
 * A parse reads its tree with `./xml-tree.ts` and needs `@xmldom/xmldom` only for a text that
 * reader hands back. Writing XML (`toString`, `serializeCcda`), `editCcda`, `buildCcda` and
 * `parseSecureXml` still use it. Loading it costs more than the rest of this package together (most
 * of it the HTML entity table its parser module builds, which an XML parse never reads), so an
 * import that does not need it does not pay for it.
 *
 * It is loaded with a `require` made for this module by `createRequire`, which is synchronous, as
 * every caller here is. In the CommonJS build tsup writes `import.meta.url` as this file's URL.
 * Because the load is a call rather than an `import`, a bundler that inlines dependencies does not
 * see it: such a bundle keeps `@xmldom/xmldom` resolvable at run time (it is a dependency of this
 * package) or marks it external.
 *
 * @packageDocumentation
 */

import { createRequire } from "node:module";

import type * as Xmldom from "@xmldom/xmldom";

/** The loaded module, once loaded. @internal */
let loaded: typeof Xmldom | undefined;

/**
 * The `@xmldom/xmldom` module, loaded on the first call.
 *
 * @internal
 */
export function xmldom(): typeof Xmldom {
  loaded ??= createRequire(import.meta.url)("@xmldom/xmldom") as typeof Xmldom;
  return loaded;
}
