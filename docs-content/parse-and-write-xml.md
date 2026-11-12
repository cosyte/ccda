---
id: parse-and-write-xml
title: Parse and write any XML safely
sidebar_label: Parse and write any XML
description: "Read any XML format with the hardened reader parseCcda uses, which refuses DTDs, external entities and entity expansion under limits you set, and write it back with serializeXml."
---

# Parse and write any XML safely

You read an XML format that is not C-CDA, from a sender you do not control, and need the same
protection `parseCcda` has: no DTD, no external entity fetched, no entity expanded, and a cap on
size, depth and element count.

`parseXml(text, options)` is the reader `parseCcda` stands on, for any XML. It returns an
`@xmldom/xmldom` `Document`, the standard DOM. `serializeXml(node)` writes a document or an element
back out, and refuses a tree `parseXml` would not read back.

```ts runnable
import { parseXml, serializeXml } from "@cosyte/ccda";

const doc = parseXml('<pathway id="example-1"><step order="1">Synthetic step</step></pathway>');
const root = doc.documentElement;

root?.getAttribute("id"); // => "example-1"
root?.getElementsByTagName("step").length; // => 1

root?.setAttribute("status", "active");
serializeXml(doc); // => '<?xml version="1.0" encoding="UTF-8"?>\n<pathway id="example-1" status="active"><step order="1">Synthetic step</step></pathway>'
```

## What the reader refuses

Each refusal throws a `CcdaParseError` and never returns part of a document. The `code` is the
same one `parseCcda` throws for the same text, from the same code:

| Code                           | When                                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| `XXE_OR_DTD_PRESENT`           | The text declares a DTD or an entity anywhere (`<!DOCTYPE`, `<!ENTITY`, in any case).    |
| `ENTITY_EXPANSION_LIMIT`       | More custom entity references (`&name;`) than `maxEntityExpansions`.                     |
| `INPUT_SIZE_LIMIT_EXCEEDED`    | More UTF-8 bytes than `maxInputBytes`.                                                   |
| `ELEMENT_DEPTH_LIMIT_EXCEEDED` | Elements nested deeper than `maxDepth`.                                                  |
| `NODE_COUNT_LIMIT_EXCEEDED`    | More elements than `maxNodeCount`.                                                       |
| `NOT_WELL_FORMED_XML`          | Not well-formed, no root element, or a character XML 1.0 forbids, raw or as a reference. |

No DTD is ever read, so no external entity is ever fetched and no entity is ever expanded. The
five predefined entities (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;`) and character references
(`&#65;`) are read as XML reads them and never count toward `maxEntityExpansions`. No message or
position names anything the text said, so a refusal is safe to log.

```ts runnable
import { CcdaParseError, FATAL_CODES, parseXml } from "@cosyte/ccda";

const xxe = '<!DOCTYPE p [<!ENTITY x SYSTEM "file:///etc/passwd">]><p>&x;</p>';
let code = "";
try {
  parseXml(xxe);
} catch (err) {
  if (err instanceof CcdaParseError) code = err.code;
}
code === FATAL_CODES.XXE_OR_DTD_PRESENT; // => true
```

## Set the limits

The limits are options. Each one you leave out keeps its default, which `DEFAULT_LIMITS` holds:
30,000,000 bytes, a depth of 1,000, 1,000,000 elements and 1,000 custom entity references. A format
smaller than a C-CDA document can set them tighter:

```ts runnable
import { CcdaParseError, parseXml } from "@cosyte/ccda";

const limits = { maxInputBytes: 1_000_000, maxDepth: 16, maxNodeCount: 10_000 };
parseXml("<pathway><step/></pathway>", { limits }).documentElement?.localName; // => "pathway"

const deep = `${"<a>".repeat(17)}${"</a>".repeat(17)}`;
let refused = "";
try {
  parseXml(deep, { limits });
} catch (err) {
  if (err instanceof CcdaParseError) refused = err.code;
}
refused; // => "ELEMENT_DEPTH_LIMIT_EXCEEDED"
```

A limit of `NaN` throws a `TypeError` before anything is read, since every comparison with `NaN`
is false and the cap would be off; leave a limit out to keep its default. `Infinity` lifts a cap.

The one warning the reader raises is `ENCODING_BOM_STRIPPED`, when the text starts with a byte order
mark, which it removes. It goes to `options.onWarning`; without one it is dropped. Unlike
`parseCcda`, `parseXml` does not check the root element and raises no `UNKNOWN_NAMESPACE_PREFIX`:
any namespace is as expected as any other in a format that is not C-CDA.

## What the writer refuses

`serializeXml` writes a document with an XML declaration and a line feed first, unless it already
carries one, and an element alone, with a declaration for each namespace its names need. It writes
with a writer of its own: every attribute value, namespace and text goes through one escaping path,
and it declares every namespace itself. In text, attribute values and namespaces, a carriage
return, NEL, LINE SEPARATOR and PARAGRAPH SEPARATOR are written as character references, so a parse
keeps each of them rather than reading a line feed.

Then, before it returns, it reads its own text back with the reader `parseXml` uses (its limits
lifted) and compares that tree with yours: names, namespaces, attributes in order, the namespace
declarations you set, text, CDATA sections, comments and processing instructions, in order. If the
reader refuses the text or reads another tree, it throws a `TypeError` naming the kind of node that
differs, never what it holds. Adjacent text nodes compare as one text, and an empty text node or
CDATA section as none, as a parse reads them. Outside the root element, white space is not
compared, nor is the declaration the writer adds.

So it throws a `TypeError` instead of writing text a reader would reject or read differently, and
these are the trees it refuses before it writes anything:

- a character XML 1.0 forbids in text, an attribute value, a comment, a CDATA section, a processing
  instruction or a namespace (the message names the code point, never the text);
- a DOCTYPE, which `parseXml` refuses, and `<!DOCTYPE` or `<!ENTITY` (in any case) inside a
  comment, a CDATA section or a processing instruction, which `parseXml` refuses wherever it sits;
- a carriage return, NEL, LINE SEPARATOR or PARAGRAPH SEPARATOR in a comment, a CDATA section or a
  processing instruction, where no reference can be written and a parse would read a line feed;
- a processing instruction whose data starts with a space, tab or line feed, which a parse drops;
- text other than white space, or a CDATA section, directly under the document, which a parse
  drops or refuses;
- an XML declaration (an instruction with the target `xml` first in the document) that is not a
  version, then an optional encoding and an optional standalone;
- a prefixed element or attribute name with no namespace, which no declaration would bind;
- one prefix bound to two namespaces on one element, by its name, its attributes' names or a
  declaration it carries, or declared twice on it; a child may rebind a prefix, and is written
  with its own declaration;
- an element with the prefix `xmlns`, an attribute in a namespace with no prefix, and a declaration
  Namespaces in XML 1.0 forbids (the prefix `xmlns`, the xml or xmlns namespace under another
  prefix, or a prefix bound to no namespace);
- a name that is not an XML name, a comment holding `--` or ending in `-`, a CDATA section holding
  `]]>`, a processing instruction holding `?>` or with the target `xml` anywhere but first, or a
  document with no root element.

The read-back is a parse of the output and a walk of both trees on every call, so a write costs
more than writing alone. `bench/ccda.bench.mjs` measures `serializeXml` beside `parseXml` and
beside xmldom's own `XMLSerializer`, which checks nothing and reads nothing back. One reading on a
4-CPU GitHub-hosted runner with Node 22 (Bench reading run 43181575140), the median of 3 processes:

| Input                         | `parseXml` | `serializeXml` | xmldom `XMLSerializer`, unchecked |
| ----------------------------- | ---------- | -------------- | --------------------------------- |
| Referral Note, 23 KiB         | 1.856 ms   | 5.059 ms       | 0.437 ms                          |
| CCD, 100 entries, 0.2 MiB     | 18.912 ms  | 53.266 ms      | 5.908 ms                          |

So a checked write took about 9 to 12 times as long as xmldom's unchecked one, and about 2.7 to 2.8
times as long as reading the same text.

The writer does not apply the reader's limits. A tree deeper or larger than the limits you read
with, or a comment holding more `&name;` strings than `maxEntityExpansions` (the reader counts them
wherever they sit), is written, and `parseXml` with those limits refuses it.

```ts runnable throws
import { parseXml, serializeXml } from "@cosyte/ccda";

const doc = parseXml("<pathway/>");
doc.documentElement?.setAttribute("note", "bell\u0007");
serializeXml(doc); // throws TypeError: the tree holds U+0007
```

## Reference

- [`parseXml`](./api/README.md#parsexml), [`ParseXmlOptions`](./api/README.md#parsexmloptions) and
  [`serializeXml`](./api/README.md#serializexml).
- [`CcdaParseError`](./api/README.md#ccdaparseerror) and
  [`FATAL_CODES`](./api/README.md#fatal_codes) for the refusals.

## Related

- [Serialize a document](./serialize-a-document.md) writes a parsed C-CDA document back out.
- [Troubleshooting](./troubleshooting.md) lists every fatal code `parseCcda` throws.
