/**
 * `xpath@0.0.34` exports `parse` at run time and does not declare it in `xpath.d.ts`.
 *
 * `parse` is the only route to a PRE-COMPILED expression, and pre-compiling is what makes this
 * harness affordable: the Schematron holds 4102 assertions and 505 rule contexts, each evaluated
 * against every document in the run, so re-parsing the expression text per document would
 * dominate the measurement. The shipped declarations cover only the convenience `select`
 * helpers, which take a string every time.
 *
 * This augments the package's own types rather than casting at the call site, so the shape is
 * stated once, in the file that explains why it is here, instead of being asserted wherever it
 * is used. `evaluateBoolean` and `select` are the two members this repository calls; the object
 * has more, and they are deliberately not declared.
 */

import "xpath";

declare module "xpath" {
  /** An XPath 1.0 expression parsed once and evaluated many times. */
  export interface ParsedXPathExpression {
    /** Evaluate as a node set. `options` carries `node`, `namespaces` and `functions`. */
    select(options: Record<string, unknown>): unknown[];
    /** Evaluate under the XPath boolean conversion. */
    evaluateBoolean(options: Record<string, unknown>): boolean;
  }

  /**
   * Parse an XPath 1.0 expression.
   *
   * @param expression - The expression text.
   * @returns The compiled expression.
   * @throws {Error} When the expression cannot be parsed.
   */
  export function parse(expression: string): ParsedXPathExpression;
}
