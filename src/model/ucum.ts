/**
 * A computable, zero-dependency, license-clean validator for the **Unified Code
 * for Units of Measure** (UCUM) — the unit grammar C-CDA `PQ` values are bound
 * to. UCUM's atom + prefix tables are public identifiers (not redistributable
 * licensed *data* like SNOMED/RxNorm), so the suite can ship a grammar without
 * the bring-your-own-terminology dance the coded slots need.
 *
 * This is a **syntactic** validator: it answers "is this a well-formed UCUM
 * unit?" by recursive descent over the case-sensitive (`c/s`) grammar — terms
 * joined by `.`/`/`, parenthesized sub-terms, metric prefixes on metric atoms,
 * bracket atoms (`m[Hg]`, `[degF]`), the `10*`/`10^` power atoms, integer
 * exponents, and `{annotations}`. It deliberately does **not** convert or
 * dimension-check units (no mmol↔mg), and the atom set is a curated
 * clinical-relevant subset, not the full UCUM table — enough to validate the
 * units that actually appear in lab Results and Vital Signs, and to flag the
 * rest with `NON_UCUM_UNIT` rather than silently trusting them.
 */

/** Metric prefix symbols (case-sensitive). `da` (deca) is the only two-char one. @internal */
const PREFIXES: readonly string[] = [
  "da",
  "Y",
  "Z",
  "E",
  "P",
  "T",
  "G",
  "M",
  "k",
  "h",
  "d",
  "c",
  "m",
  "u",
  "n",
  "p",
  "f",
  "a",
  "z",
  "y",
];

/** Metric (prefixable) atom symbols — a curated clinical-relevant subset. @internal */
const METRIC_ATOMS: readonly string[] = [
  "m[Hg]",
  "m[H2O]",
  "mol",
  "osm",
  "cal",
  "kat",
  "Cel",
  "Ohm",
  "Bq",
  "Gy",
  "Sv",
  "Hz",
  "Pa",
  "bar",
  "rad",
  "eq",
  "g",
  "m",
  "s",
  "L",
  "l",
  "K",
  "N",
  "J",
  "W",
  "V",
  "U",
  "t",
  "R",
];

/** Non-metric (non-prefixable) atom symbols — curated clinical-relevant subset. @internal */
const NON_METRIC_ATOMS: readonly string[] = [
  "[arb'U]",
  "[lb_av]",
  "[oz_av]",
  "[cup_us]",
  "[foz_us]",
  "[tbs_us]",
  "[tsp_us]",
  "[in_i]",
  "[ft_i]",
  "[degF]",
  "[psi]",
  "[drp]",
  "[iU]",
  "[IU]",
  "[pH]",
  "min",
  "mo",
  "wk",
  "h",
  "d",
  "a",
  "%",
];

/** Longest-first so a greedy match prefers `m[Hg]` over `m`. @internal */
function byLengthDesc(symbols: readonly string[]): readonly string[] {
  return [...symbols].sort((a, b) => b.length - a.length);
}

const PREFIXES_SORTED = byLengthDesc(PREFIXES);
const METRIC_ATOMS_SORTED = byLengthDesc(METRIC_ATOMS);
const ALL_ATOMS_SORTED = byLengthDesc([...METRIC_ATOMS, ...NON_METRIC_ATOMS]);

/** Mutable parse cursor over the unit string. @internal */
interface Cursor {
  readonly s: string;
  i: number;
}

function peek(c: Cursor): string {
  return c.i < c.s.length ? c.s.charAt(c.i) : "";
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function startsWith(s: string, lit: string, at: number): boolean {
  return s.startsWith(lit, at);
}

/**
 * A valid end-of-simple-unit boundary: end of string, an operator, a closing
 * paren, an annotation, or the start of an exponent (sign/digit). Used to reject
 * a partial atom match that would leave trailing letters. @internal
 */
function isUnitBoundary(s: string, i: number): boolean {
  if (i >= s.length) return true;
  const ch = s.charAt(i);
  return (
    ch === "." || ch === "/" || ch === ")" || ch === "{" || ch === "+" || ch === "-" || isDigit(ch)
  );
}

/** Consume a literal at the cursor, advancing on success. @internal */
function matchLiteral(c: Cursor, lit: string): boolean {
  if (startsWith(c.s, lit, c.i)) {
    c.i += lit.length;
    return true;
  }
  return false;
}

/** Consume a `{...}` annotation; returns false (without advancing) when absent. @internal */
function matchAnnotation(c: Cursor): boolean {
  if (peek(c) !== "{") return false;
  const close = c.s.indexOf("}", c.i + 1);
  if (close === -1) return false;
  c.i = close + 1;
  return true;
}

/** Consume an integer exponent (optional sign, ≥1 digit). @internal */
function matchExponent(c: Cursor, required: boolean): boolean {
  const start = c.i;
  if (peek(c) === "+" || peek(c) === "-") c.i += 1;
  let digits = 0;
  while (isDigit(peek(c))) {
    c.i += 1;
    digits += 1;
  }
  if (digits === 0) {
    c.i = start;
    return !required;
  }
  return true;
}

/**
 * Match a simple unit: a bare atom, or a metric prefix on a metric atom. Picks
 * the longest candidate that ends on a valid boundary, so `dL` resolves to
 * deci-liter (not the `d` day-atom) and `mm[Hg]` to milli-(meter-of-mercury).
 * @internal
 */
function matchSimpleUnit(c: Cursor): boolean {
  const start = c.i;
  let best = -1;

  for (const atom of ALL_ATOMS_SORTED) {
    if (startsWith(c.s, atom, start)) {
      const end = start + atom.length;
      if (isUnitBoundary(c.s, end) && end > best) best = end;
    }
  }

  for (const prefix of PREFIXES_SORTED) {
    if (!startsWith(c.s, prefix, start)) continue;
    const atomStart = start + prefix.length;
    for (const atom of METRIC_ATOMS_SORTED) {
      if (startsWith(c.s, atom, atomStart)) {
        const end = atomStart + atom.length;
        if (isUnitBoundary(c.s, end) && end > best) best = end;
      }
    }
  }

  if (best === -1) return false;
  c.i = best;
  return true;
}

/** annotatable | factor | the `10*`/`10^` power atoms. @internal */
function parseAnnotatable(c: Cursor): boolean {
  if (matchLiteral(c, "10*") || matchLiteral(c, "10^")) {
    return matchExponent(c, true);
  }
  if (isDigit(peek(c))) {
    while (isDigit(peek(c))) c.i += 1;
    return true; // a bare factor carries no exponent
  }
  if (!matchSimpleUnit(c)) return false;
  matchExponent(c, false);
  return true;
}

/** component = '(' term ')' | annotation | annotatable annotation? @internal */
function parseComponent(c: Cursor): boolean {
  const ch = peek(c);
  if (ch === "(") {
    c.i += 1;
    if (!parseTerm(c)) return false;
    if (peek(c) !== ")") return false;
    c.i += 1;
    matchAnnotation(c);
    return true;
  }
  if (ch === "{") {
    return matchAnnotation(c);
  }
  if (!parseAnnotatable(c)) return false;
  matchAnnotation(c);
  return true;
}

/** term = component (('.' | '/') component)* @internal */
function parseTerm(c: Cursor): boolean {
  if (!parseComponent(c)) return false;
  while (peek(c) === "." || peek(c) === "/") {
    c.i += 1;
    if (!parseComponent(c)) return false;
  }
  return true;
}

/**
 * Validate a string as a well-formed UCUM unit (case-sensitive). Returns `true`
 * only when the **entire** string parses — `mg/dL`, `mm[Hg]`, `10*3/uL`, `Cel`,
 * `%`, `/min`, `kg/m2`, `1` are valid; `mcg`, `cc`, `mg//dL` and partial garbage
 * are not. This is a grammatical check: a case slip like `Mg/dL` is well-formed
 * UCUM (megagram/deciliter) so it validates here — {@link isUcumCaseSuspect}
 * catches the clinical case-confusion separately. Never throws.
 *
 * @example
 * ```ts
 * import { isValidUcumUnit } from "@cosyte/ccda";
 * isValidUcumUnit("mg/dL");   // true
 * isValidUcumUnit("mm[Hg]");  // true
 * isValidUcumUnit("cc");      // false
 * ```
 */
export function isValidUcumUnit(unit: string): boolean {
  if (unit.length === 0) return false;
  const c: Cursor = { s: unit, i: 0 };
  if (peek(c) === "/") c.i += 1; // leading divide (e.g. "/min")
  if (!parseTerm(c)) return false;
  return c.i === c.s.length;
}

/**
 * Canonical case-correct spellings of the units where a case slip is the
 * classic clinical trap (`mL` vs the valid-but-wrong `ML` megaliter). @internal
 */
const CANONICAL_UNITS: readonly string[] = [
  "mg",
  "g",
  "kg",
  "ng",
  "ug",
  "pg",
  "mL",
  "L",
  "dL",
  "uL",
  "nL",
  "mol",
  "mmol",
  "umol",
  "nmol",
  "meq",
  "U",
  "Cel",
  "cm",
  "mm",
  "m",
  "mm[Hg]",
  "cm[Hg]",
  "mg/dL",
  "g/dL",
  "ng/mL",
  "ug/mL",
  "ug/dL",
  "pg/mL",
  "mmol/L",
  "mol/L",
  "meq/L",
  "U/L",
  "U/mL",
];

const CANONICAL_SET: ReadonlySet<string> = new Set(CANONICAL_UNITS);
const CANONICAL_LOWER_SET: ReadonlySet<string> = new Set(
  CANONICAL_UNITS.map((u) => u.toLowerCase()),
);

/**
 * Detect the case-confusion trap: a unit that is **not** a canonical clinical
 * spelling but whose case-folded form is one — `Mg`/`MG` for `mg`, `ML` for
 * `mL`, `mEq` for `meq`. These are reported as `UCUM_CASE_SUSPECT` (more
 * actionable than `NON_UCUM_UNIT`) because the likely fix is a single
 * letter-case change. A unit already spelled canonically returns `false`.
 *
 * @example
 * ```ts
 * import { isUcumCaseSuspect } from "@cosyte/ccda";
 * isUcumCaseSuspect("ML");  // true  (meant mL; ML is megaliter)
 * isUcumCaseSuspect("mEq"); // true  (meant meq)
 * isUcumCaseSuspect("mg");  // false (already canonical)
 * ```
 */
export function isUcumCaseSuspect(unit: string): boolean {
  if (CANONICAL_SET.has(unit)) return false;
  return CANONICAL_LOWER_SET.has(unit.toLowerCase());
}
