/**
 * An ISO Schematron evaluator for the normative C-CDA R2.1 Schematron, over an XPath 1.0
 * engine and this repository's own DOM.
 *
 * WHY THIS IS A DRIVER RATHER THAN A DEPENDENCY. The published pure-JS Schematron packages
 * were measured against this artifact before this file was written, not assumed to be
 * unsuitable: `node-schematron@2.1.0` throws on the first rule it reads, because it reads
 * `@context` off every `sch:rule` and this Schematron carries 505 ABSTRACT rules that have
 * none. Abstract rules plus `sch:extends` are not a corner of this artifact, they are its
 * shape: 556 `sch:extends` elements spliced across 432 patterns. The other route, the ISO
 * skeleton XSLT under a full XSLT processor, is how the reference validators do it and would
 * be the right answer if one were available here on terms this repository can take. It is
 * not: the only maintained XSLT 3.0 engine for Node ships under a proprietary licence and
 * pulls an HTTP client into a validation toolchain.
 *
 * WHAT THE OUTSIDE PIECE IS. `xpath` evaluates the expressions, and that is the whole of what
 * is delegated: 277 distinct rule contexts and 985 distinct assertions, all XPath 1.0, none
 * of which this repository has any business reimplementing. Everything ISO Schematron adds on
 * top of XPath is here, and it is small: phases select patterns, patterns hold rules, a rule
 * splices the assertions of the abstract rules it extends, and within one pattern a node is
 * evaluated by the FIRST rule whose context selects it and by no later one.
 *
 * THE RULE CONTEXT IS A MATCH PATTERN, AND IT IS EVALUATED AS ONE. XSLT's `match="cda:x/cda:y"`
 * means "a `cda:y` whose parent is a `cda:x`", not a path from the root. Prefixing `//` to a
 * relative pattern selects exactly that node set, and the five contexts here that carry a
 * top-level `|` are split into alternatives first, because `//(a|b)` is not XPath 1.0.
 *
 * A DIAGNOSTIC NEVER CARRIES A DOCUMENT VALUE. A `Finding` carries the assertion's id, its own
 * static text as the artifact spells it, the pattern it came from, and a structural path of
 * element names and positions. It carries no element text, no attribute value and no narrative,
 * which is what lets a test seed a document with marker tokens and assert that none of them
 * reaches the report or either output stream (`phi-safety` P4, `observability` B1). The
 * artifact makes that bound cheap to hold and it was checked rather than hoped for: this
 * Schematron contains zero `sch:value-of` elements, so no assertion message interpolates
 * anything at all.
 *
 * AN EXPRESSION THIS ENGINE CANNOT COMPILE FAILS THE RUN. It is never skipped and never
 * reported as a pass. A gate that quietly drops the assertions it could not read is the false
 * green `scripts/attw.mjs` exists to refuse, restated for this one.
 */

import { DOMParser } from "@xmldom/xmldom";
import type { Document, Element, Node } from "@xmldom/xmldom";
import xpath from "xpath";

import { CONFORMANCE_CODES, ConformanceError } from "./errors.js";

const SCHEMATRON_NS = "http://purl.oclc.org/dsdl/schematron";

/**
 * The XPath 1.0 core library plus the XSLT 1.0 additions, which together are every function
 * name the XSLT query binding admits. Used only by `closeFunctionNameGap` below, where the
 * allowlist is what keeps that rewrite from touching the `and` / `or` / `div` / `mod`
 * operators, each of which can legitimately be followed by a space and a parenthesis.
 */
const XPATH_FUNCTION_NAMES: ReadonlySet<string> = new Set([
  "last",
  "position",
  "count",
  "id",
  "local-name",
  "namespace-uri",
  "name",
  "string",
  "concat",
  "starts-with",
  "contains",
  "substring-before",
  "substring-after",
  "substring",
  "string-length",
  "normalize-space",
  "translate",
  "boolean",
  "not",
  "true",
  "false",
  "lang",
  "number",
  "sum",
  "floor",
  "ceiling",
  "round",
  "document",
  "key",
  "format-number",
  "current",
  "unparsed-entity-uri",
  "generate-id",
  "system-property",
  "element-available",
  "function-available",
]);

/**
 * Remove whitespace between a core function's name and its opening parenthesis.
 *
 * XPath 1.0 allows `not (x)`: whitespace may appear between any two tokens, and a name
 * followed by `(` is a FunctionName by the specification's own lexical disambiguation rule.
 * The `xpath` package's parser does not, and refuses to compile such an expression. Measured
 * against the pinned Schematron: 1 assertion of 985 is written that way, `a-1198-8964-c`, and
 * without this it is the difference between running the artifact and not running it.
 *
 * The rewrite is deliberately the narrowest thing that closes the gap. It touches only names
 * in the XSLT query binding's own function library, never a name that is part of a longer
 * QName or step, and never anything inside a string literal, so `a div (b)` and
 * `contains(x, 'not (y)')` come back unchanged. It changes no expression's meaning: under the
 * XPath 1.0 grammar the input and the output parse to the same thing, and the only parser that
 * disagrees is the one being compensated for.
 *
 * @param expression - An XPath 1.0 expression as the artifact spells it.
 * @returns The same expression with core-function name gaps closed.
 * @example
 * ```ts
 * closeFunctionNameGap("a and not (b)"); // "a and not(b)"
 * ```
 */
export function closeFunctionNameGap(expression: string): string {
  let out = "";
  let quote: string | null = null;
  for (let index = 0; index < expression.length; index += 1) {
    const character = expression[index] ?? "";
    if (quote !== null) {
      out += character;
      if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      out += character;
      continue;
    }
    out += character;
    if (!/\s/.test(character)) continue;
    const gap = /^\s+\(/.exec(expression.slice(index));
    if (!gap) continue;
    const head = out.slice(0, out.length - 1);
    const name = /([A-Za-z_][A-Za-z0-9_.-]*)$/.exec(head);
    if (!name || !XPATH_FUNCTION_NAMES.has(name[1] ?? "")) continue;
    if (/[A-Za-z0-9_.:-]$/.test(head.slice(0, head.length - (name[1] ?? "").length))) continue;
    out = head;
    index += gap[0].length - 2;
  }
  return out;
}

/** A compiled XPath 1.0 expression, as the `xpath` package returns it from `parse`. */
interface CompiledExpression {
  select(options: Record<string, unknown>): unknown[];
  evaluateBoolean(options: Record<string, unknown>): boolean;
}

interface CompiledAssertion {
  readonly id: string;
  readonly isReport: boolean;
  readonly message: string;
  readonly expression: CompiledExpression;
}

interface CompiledRule {
  readonly selectors: readonly CompiledExpression[];
  /** Every `@root` literal the context requires of its own node, used only to skip rules cheaply. */
  readonly requiredTemplateRoots: readonly string[];
  readonly assertions: readonly CompiledAssertion[];
}

/** A Schematron compiled once and evaluated against many documents. */
export interface CompiledSchematron {
  /** Prefix to namespace URI, from the artifact's own `sch:ns` declarations. */
  readonly namespaces: Readonly<Record<string, string>>;
  /** Phase id to the pattern ids it activates. */
  readonly phases: ReadonlyMap<string, readonly string[]>;
  /** Pattern id to its concrete rules, in document order. */
  readonly patterns: ReadonlyMap<string, readonly CompiledRule[]>;
  /** How many assertions were compiled, so a caller can refuse a suspiciously small artifact. */
  readonly assertionCount: number;
}

/** One assertion that did not hold, carrying no content read out of the document. */
export interface Finding {
  /** The assertion's own `@id` in the Schematron, for example `a-1198-9027`. */
  readonly assertionId: string;
  /** The pattern the assertion was reached through. */
  readonly patternId: string;
  /** The assertion's own static text, verbatim from the artifact. */
  readonly message: string;
  /** Structural location: element names and sibling positions, root first. */
  readonly location: string;
}

function childElements(node: Element): Element[] {
  const out: Element[] = [];
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    if (child.nodeType === 1) out.push(child as Element);
  }
  return out;
}

/**
 * Split a rule context into its top-level alternatives.
 *
 * `//(a|b)` is not XPath 1.0, so a context carrying a union has to be evaluated one arm at a
 * time. Splitting is done on bracket depth and quote state rather than by a regular expression,
 * because a `|` inside a predicate or a string literal is not an alternative.
 *
 * @param context - A rule's `@context` attribute.
 * @returns One entry per top-level alternative.
 * @example
 * ```ts
 * splitContextAlternatives("cda:a | cda:b[@x='p|q']"); // ["cda:a", "cda:b[@x='p|q']"]
 * ```
 */
export function splitContextAlternatives(context: string): readonly string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let index = 0; index < context.length; index += 1) {
    const character = context[index] ?? "";
    if (quote !== null) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"') quote = character;
    else if (character === "[" || character === "(") depth += 1;
    else if (character === "]" || character === ")") depth -= 1;
    else if (character === "|" && depth === 0) {
      parts.push(context.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(context.slice(start).trim());
  return parts.filter((part) => part.length > 0);
}

function compile(expression: string, what: string): CompiledExpression {
  try {
    return xpath.parse(closeFunctionNameGap(expression));
  } catch {
    throw new ConformanceError(
      CONFORMANCE_CODES.SCHEMATRON_UNCOMPILABLE,
      `${what} is an expression this XPath 1.0 engine cannot compile`,
      "The run stops rather than skipping the rules it could not read, because a validator that silently " +
        "drops assertions reports a pass it did not earn. Either the pinned artifact moved to a construct " +
        "the engine lacks, or the engine regressed; both are changes to scripts/conformance/schematron.ts, " +
        "never a reason to exclude the rule.",
    );
  }
}

/**
 * The `@root` literals a context requires of its own node, or an empty list when the shape is
 * anything other than a flat conjunction of positive `templateId[@root='...']` predicates.
 *
 * Purely an optimisation, and a conservative one: an empty list means "cannot skip this rule",
 * and a rule is skipped only when EVERY alternative demands a template root the document does
 * not carry anywhere at all. C-CDA rule contexts are template-keyed almost without exception,
 * so this turns a 500-evaluation sweep per document into a few dozen without changing a single
 * result. A context mentioning `!=` is never eligible, because a closed-template rule fires on
 * the absence of a root rather than on its presence.
 */
function requiredTemplateRoots(alternatives: readonly string[]): readonly string[] {
  const roots: string[] = [];
  for (const alternative of alternatives) {
    if (alternative.includes("!=")) return [];
    const matches = [...alternative.matchAll(/templateId\[@root='([^']+)'/g)].map(
      (match) => match[1] ?? "",
    );
    if (matches.length === 0) return [];
    roots.push(...matches);
  }
  return roots;
}

/**
 * Compile a Schematron document into the form `evaluate` runs.
 *
 * @param schematronXml - The artifact's own bytes, decoded as UTF-8.
 * @returns The compiled schema.
 * @throws {ConformanceError} `SCHEMATRON_UNCOMPILABLE` when any rule context or assertion test
 *   cannot be compiled, or when `sch:extends` names a rule the artifact does not define.
 * @example
 * ```ts
 * const schema = compileSchematron(await fetchArtifact(httpFetcher, dir, pins.schematron));
 * ```
 */
export function compileSchematron(schematronXml: string): CompiledSchematron {
  const dom = new DOMParser({ onError: () => undefined }).parseFromString(
    schematronXml,
    "text/xml",
  );
  const root = dom.documentElement;
  if (!root) {
    throw new ConformanceError(
      CONFORMANCE_CODES.SCHEMATRON_UNCOMPILABLE,
      "the Schematron artifact parsed to a document with no root element",
      "Delete the conformance working directory and re-run so the artifact is fetched again.",
    );
  }

  const namespaces: Record<string, string> = {};
  for (const declaration of Array.from(root.getElementsByTagNameNS(SCHEMATRON_NS, "ns"))) {
    const prefix = declaration.getAttribute("prefix");
    const uri = declaration.getAttribute("uri");
    if (prefix && uri) namespaces[prefix] = uri;
  }

  const phases = new Map<string, readonly string[]>();
  for (const phase of Array.from(root.getElementsByTagNameNS(SCHEMATRON_NS, "phase"))) {
    const id = phase.getAttribute("id");
    if (!id) continue;
    phases.set(
      id,
      Array.from(phase.getElementsByTagNameNS(SCHEMATRON_NS, "active"))
        .map((active) => active.getAttribute("pattern") ?? "")
        .filter((pattern) => pattern.length > 0),
    );
  }

  const abstractRules = new Map<string, Element>();
  for (const rule of Array.from(root.getElementsByTagNameNS(SCHEMATRON_NS, "rule"))) {
    if (rule.getAttribute("abstract") === "true") {
      const id = rule.getAttribute("id");
      if (id) abstractRules.set(id, rule);
    }
  }

  let assertionCount = 0;

  function assertionsOf(rule: Element, seen: Set<string>): CompiledAssertion[] {
    const out: CompiledAssertion[] = [];
    for (const child of childElements(rule)) {
      if (child.namespaceURI !== SCHEMATRON_NS) continue;
      if (child.localName === "assert" || child.localName === "report") {
        const id = child.getAttribute("id") ?? "";
        const test = child.getAttribute("test") ?? "";
        assertionCount += 1;
        out.push({
          id,
          isReport: child.localName === "report",
          message: (child.textContent ?? "").replace(/\s+/g, " ").trim(),
          expression: compile(test, `the test of assertion ${id || "(unnamed)"}`),
        });
        continue;
      }
      if (child.localName !== "extends") continue;
      const reference = child.getAttribute("rule") ?? "";
      const target = abstractRules.get(reference);
      if (!target || seen.has(reference)) {
        throw new ConformanceError(
          CONFORMANCE_CODES.SCHEMATRON_UNCOMPILABLE,
          target
            ? `sch:extends forms a cycle at abstract rule ${reference}`
            : `sch:extends names abstract rule ${reference}, which this artifact does not define`,
          "The artifact is not self-consistent as fetched. Delete the conformance working directory and " +
            "re-run; if it persists, the pinned commit is the thing to look at.",
        );
      }
      seen.add(reference);
      out.push(...assertionsOf(target, seen));
      seen.delete(reference);
    }
    return out;
  }

  const patterns = new Map<string, readonly CompiledRule[]>();
  for (const pattern of Array.from(root.getElementsByTagNameNS(SCHEMATRON_NS, "pattern"))) {
    const patternId = pattern.getAttribute("id");
    if (!patternId) continue;
    const rules: CompiledRule[] = [];
    for (const rule of Array.from(pattern.getElementsByTagNameNS(SCHEMATRON_NS, "rule"))) {
      if (rule.getAttribute("abstract") === "true") continue;
      const context = rule.getAttribute("context") ?? "";
      const alternatives = splitContextAlternatives(context);
      rules.push({
        selectors: alternatives.map((alternative) =>
          compile(
            alternative.startsWith("/") ? alternative : `//${alternative}`,
            `the context of rule ${rule.getAttribute("id") ?? "(unnamed)"}`,
          ),
        ),
        requiredTemplateRoots: requiredTemplateRoots(alternatives),
        assertions: assertionsOf(rule, new Set()),
      });
    }
    patterns.set(patternId, rules);
  }

  return { namespaces, phases, patterns, assertionCount };
}

/**
 * The structural location of a node: element names and sibling positions from the root down.
 *
 * This is the whole of what a finding says about WHERE it fired, and it is deliberately built
 * from markup vocabulary and integers only. No attribute is read, no text is read.
 *
 * @param node - The element a finding fired on.
 * @returns A path such as `/ClinicalDocument[1]/component[1]/structuredBody[1]`.
 * @example
 * ```ts
 * structuralLocation(element); // "/ClinicalDocument[1]/recordTarget[1]"
 * ```
 */
export function structuralLocation(node: Node): string {
  const steps: string[] = [];
  let current: Node | null = node;
  while (current !== null && current.nodeType === 1) {
    const element = current as Element;
    let position = 1;
    for (
      let sibling = element.previousSibling;
      sibling !== null;
      sibling = sibling.previousSibling
    ) {
      if (sibling.nodeType === 1 && (sibling as Element).nodeName === element.nodeName)
        position += 1;
    }
    steps.unshift(`${element.nodeName}[${String(position)}]`);
    current = element.parentNode;
  }
  return `/${steps.join("/")}`;
}

function templateRootsIn(document: Document): ReadonlySet<string> {
  const roots = new Set<string>();
  for (const element of Array.from(document.getElementsByTagName("*"))) {
    if (element.localName !== "templateId") continue;
    const root = element.getAttribute("root");
    if (root) roots.add(root);
  }
  return roots;
}

/**
 * Evaluate a compiled Schematron phase against one document.
 *
 * @param schema - The compiled Schematron.
 * @param document - The document under validation.
 * @param phaseId - The phase to run; `errors` is the error-severity phase of this artifact.
 * @param vocabulary - The document `document('voc.xml')` resolves to, bound for every assertion
 *   that consults a value set.
 * @returns Every assertion that did not hold, in evaluation order.
 * @throws {ConformanceError} `SCHEMATRON_UNCOMPILABLE` when the phase names a pattern the
 *   artifact does not define.
 * @example
 * ```ts
 * const findings = evaluate(schema, document, "errors", vocabulary);
 * ```
 */
export function evaluate(
  schema: CompiledSchematron,
  document: Document,
  phaseId: string,
  vocabulary: Document,
): readonly Finding[] {
  const options = {
    namespaces: schema.namespaces,
    // The XSLT query binding's `document()`. This Schematron calls it with one argument and
    // only ever with 'voc.xml', the vocabulary file the artifact's own README says an instance
    // cannot be validated without.
    functions: { document: (): Document => vocabulary },
  };
  const present = templateRootsIn(document);
  const findings: Finding[] = [];

  for (const patternId of schema.phases.get(phaseId) ?? []) {
    const rules = schema.patterns.get(patternId);
    if (!rules) {
      throw new ConformanceError(
        CONFORMANCE_CODES.SCHEMATRON_UNCOMPILABLE,
        `phase ${phaseId} activates pattern ${patternId}, which this artifact does not define`,
        "The artifact is not self-consistent as fetched. Delete the conformance working directory and re-run.",
      );
    }
    // ISO Schematron: within one pattern a node is evaluated by the first rule whose context
    // selects it, and by no later rule in that pattern.
    const claimed = new Set<Node>();
    for (const rule of rules) {
      if (
        rule.requiredTemplateRoots.length > 0 &&
        !rule.requiredTemplateRoots.some((root) => present.has(root))
      ) {
        continue;
      }
      for (const selector of rule.selectors) {
        for (const selected of selector.select({ node: document, ...options })) {
          const node = selected as Node;
          if (claimed.has(node)) continue;
          claimed.add(node);
          for (const assertion of rule.assertions) {
            const held = assertion.expression.evaluateBoolean({ node, ...options });
            if (assertion.isReport ? held : !held) {
              findings.push({
                assertionId: assertion.id,
                patternId,
                message: assertion.message,
                location: structuralLocation(node),
              });
            }
          }
        }
      }
    }
  }
  return findings;
}

/**
 * The comparable identity of a finding, for the differential round-trip check.
 *
 * AC-2 compares error SETS across a parse plus re-serialize, so the identity has to survive a
 * faithful re-emit while still distinguishing two genuinely different failures. Assertion id
 * plus structural location is that: re-serializing does not move an element relative to its
 * siblings, and two failures of the same assertion at different places stay separate.
 *
 * @param finding - The finding to key.
 * @returns A stable key carrying no document content.
 * @example
 * ```ts
 * findingKey({ assertionId: "a-1", patternId: "p", message: "m", location: "/x[1]" });
 * ```
 */
export function findingKey(finding: Finding): string {
  return `${finding.assertionId}@${finding.location}`;
}
