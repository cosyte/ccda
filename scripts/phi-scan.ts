#!/usr/bin/env tsx
/**
 * `@cosyte/ccda` PHI scanner — the CI / pre-commit half of the PHI commit-gate.
 *
 * Pure Node. Zero runtime deps (it does NOT import the package's `@xmldom/xmldom`
 * runtime dependency — a commit gate must run without a build and must tolerate
 * the malformed / fragmentary XML a real leaked document arrives as, which a
 * strict DOM parser would reject). Walks the ENTIRE working tree (CI) / every
 * staged file (pre-commit) — enumeration is not scoped by directory or extension,
 * so a real document cannot dodge the scanner by its file name — then decides per
 * file whether to run the full structured C-CDA scan (a document) or the
 * conservative dashed-SSN + email text pass (`src/` + `scripts/` code), and
 * REFUSES anything that looks like real PHI, so a developer cannot commit a
 * real-looking C-CDA document by accident.
 *
 * C-CDA (HL7 CDA R2.1, an XML clinical document) carries PHI by design: patient
 * (and guardian / informant / related-person / provider) names, dates of birth,
 * SSNs, MRNs / other identifiers, addresses, and telecoms. Unlike a JSON fixture
 * there is no natural place for an inline `<!-- synthetic: true -->` marker that
 * every parser test would agree to ignore, and `@cosyte/ccda` keeps its fixtures
 * as embedded XML inside `test/__fixtures__/*.ts` (plus any committed `.xml`), so
 * we use the same proven approach the byte-strict siblings (`@cosyte/hl7`,
 * `@cosyte/dicom`, `@cosyte/x12`) use: a **synthetic allow-list**
 * (`scripts/phi-allow-list.txt`) is the positive declaration that a fixture's
 * identifiers are fake. Any realistic-PHI-shaped token not covered by the
 * allow-list is a hit. Adding a new synthetic fixture therefore means either
 * reusing known-synthetic tokens or consciously extending the allow-list — a
 * reviewed act, never silent.
 *
 * Detection is CDA-shape-aware, NOT a blind text regex: the scanner reads the
 * text of the person-name elements (`given` / `family`, plus a bare `name`),
 * the `birthTime@value` date, `id@root`/`@extension` identifiers, the address
 * elements (`streetAddressLine` / `city` / `postalCode`), and `telecom@value` —
 * and ONLY those. That is deliberate — a naive scan for `<code code="…">` or a
 * `templateId root="2.16.840…"` OID would trip on coded clinical values and
 * template identifiers, giving false confidence, not safety. The detectors are
 * namespace-prefix tolerant (`<given>` == `<v3:given>`), case tolerant, quote
 * tolerant (`"` or `'`), and decode XML entities + CDATA before matching, so a
 * `<family>&#x53;mith</family>` or `<![CDATA[Smith]]>` bypass is caught. See
 * `phi-scan-overrides.md` for the locus → rule map and the documented limits.
 *
 * SECURITY: every subprocess is `git`, invoked via `execFileSync` with array
 * args only. Never shell-form spawn.
 *
 * Modes:
 *   --staged                 - scan only files staged in `git diff --cached`
 *   --allow-fixture <path>   - bypass one path; rejected unless logged in
 *                              phi-scan-overrides.md
 *   <path> [<path>...]       - scan specific paths
 *   (no args)                - scan all in-scope working-tree files
 *
 * Exit codes: 0 (clean), 1 (hits found), 2 (invocation error).
 */

import { readFileSync, statSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve, relative, sep, isAbsolute } from "node:path";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const REPO_ROOT = process.cwd();
const ALLOW_LIST_PATH = join(REPO_ROOT, "scripts", "phi-allow-list.txt");
const OVERRIDE_LOG_PATH = join(REPO_ROOT, "phi-scan-overrides.md");

// "all" mode walks the ENTIRE working tree (gitignored paths filtered out), not
// just `test/` + `src/`. Enumeration must not be directory- or extension-scoped:
// a real C-CDA document can land anywhere (a `.cda` fixture, an `examples/`
// sample, a repo-root file) and detection follows the file's CONTENT, so the
// walk has to reach every candidate. `scanTarget` then decides per file whether
// it is in scope (a C-CDA document, or `src/` code for the conservative pass) —
// keeping incidental config/lockfile emails (e.g. the author address in
// package.json) out of scope so they are not false positives.
const WALK_SKIP_DIRS = new Set<string>([
  ".git",
  "node_modules",
  "dist",
  "dist-artifacts",
  "coverage",
  ".turbo",
  ".cache",
  ".vitest-cache",
]);

// The scanner's OWN test (test/scripts/phi-scan.test.ts) is excluded from the
// walk: it necessarily embeds real-looking violator strings ("Anderson", a fake
// SSN, a non-555 phone) as adversarial inputs, and its runtime violators are
// written to a throwaway temp dir, never the repo. Scanning it would flag the
// gate's own negative-control literals.
const EXCLUDED_PREFIX = "test/scripts/";

// The HL7 v3 OID that identifies a United States Social Security Number. An
// `<id root="2.16.840.1.113883.4.1" extension="…"/>` is an SSN by declaration.
const SSN_ROOT_OID = "2.16.840.1.113883.4.1";

// Person-name tokens that are honorific / degree / suffix words, never an
// identifying name — skipped when they appear inside a bare `<name>` element.
const NAME_NOISE_TOKENS = new Set<string>([
  "MD",
  "DO",
  "DR",
  "MR",
  "MRS",
  "MS",
  "MISS",
  "JR",
  "SR",
  "II",
  "III",
  "IV",
  "RN",
  "NP",
  "PA",
  "PHD",
  "DDS",
  "DMD",
  "ESQ",
  "PROF",
  "FNP",
  "APRN",
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Hit {
  path: string;
  locus: string; // element/attribute locus (e.g. "patient/name/given") or "(ssn)"
  value: string;
  reason: string;
}

interface AllowList {
  /** Uppercase synthetic person-name tokens (`given` / `family` / bare `name`). */
  names: Set<string>;
  /** Synthetic dates of birth, normalized (YYYYMMDD / YYYYMM / YYYY). */
  dobs: Set<string>;
  /** Synthetic street-address lines (`streetAddressLine`), lower-cased. */
  addresses: Set<string>;
  /** Synthetic city names (`city`), upper-cased. */
  cities: Set<string>;
  /** Synthetic postal codes (`postalCode`). */
  zips: Set<string>;
  /** Synthetic id values that legitimately match an SSN / bare-MRN shape. */
  ids: Set<string>;
  /** Allowed email domains (anything else is a hit). */
  emailDomains: Set<string>;
}

interface Args {
  mode: "all" | "staged" | "paths";
  paths: string[];
  allowFixtures: string[];
}

class InvocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvocationError";
  }
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): Args {
  let staged = false;
  const paths: string[] = [];
  const allowFixtures: string[] = [];
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a === "--") {
      for (let j = i + 1; j < argv.length; j += 1) {
        const v = argv[j];
        if (v !== undefined) paths.push(v);
      }
      break;
    } else if (a === "--staged") {
      staged = true;
      i += 1;
    } else if (a === "--allow-fixture") {
      const next = argv[i + 1];
      if (next === undefined) {
        throw new InvocationError("--allow-fixture requires a path argument");
      }
      allowFixtures.push(next);
      i += 2;
    } else if (a !== undefined && a.startsWith("--")) {
      throw new InvocationError(`Unknown flag: ${a}`);
    } else if (a !== undefined) {
      paths.push(a);
      i += 1;
    } else {
      i += 1;
    }
  }

  if (staged && paths.length > 0) {
    throw new InvocationError("--staged cannot be combined with positional paths");
  }

  // An `--allow-fixture` path is a *subtractive* acknowledgement on a broader
  // scan, never a scan target on its own — so it also seeds the positional path
  // set. That makes `--allow-fixture X` mean "scan X, but allow it" (proving the
  // override gate actually subtracts a scanned target) instead of a silent no-op.
  const scanPaths = paths.length > 0 ? paths : [...allowFixtures];

  let mode: Args["mode"];
  if (staged) {
    mode = "staged";
  } else if (scanPaths.length > 0) {
    mode = "paths";
  } else {
    mode = "all";
  }
  return { mode, paths: scanPaths, allowFixtures };
}

// ---------------------------------------------------------------------------
// Allow-list + override log
// ---------------------------------------------------------------------------

function loadAllowList(): AllowList {
  if (!existsSync(ALLOW_LIST_PATH)) {
    throw new InvocationError(`allow-list not found at ${ALLOW_LIST_PATH}`);
  }
  const raw = readFileSync(ALLOW_LIST_PATH, "utf8");
  const names = new Set<string>();
  const dobs = new Set<string>();
  const addresses = new Set<string>();
  const cities = new Set<string>();
  const zips = new Set<string>();
  const ids = new Set<string>();
  const emailDomains = new Set<string>();
  for (const lineRaw of raw.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const sp = line.indexOf(" ");
    if (sp < 0) continue;
    const tag = line.slice(0, sp);
    const value = line.slice(sp + 1).trim();
    if (value.length === 0) continue;
    switch (tag) {
      case "NAME":
        names.add(value.toUpperCase());
        break;
      case "DOB":
        dobs.add(value);
        break;
      case "ADDR":
        addresses.add(value.toLowerCase());
        break;
      case "CITY":
        cities.add(value.toUpperCase());
        break;
      case "ZIP":
        zips.add(value);
        break;
      case "ID":
        ids.add(value.toUpperCase());
        break;
      case "EMAILDOMAIN":
        emailDomains.add(value.toLowerCase());
        break;
      default:
        break;
    }
  }
  return { names, dobs, addresses, cities, zips, ids, emailDomains };
}

function normalizePath(p: string): string {
  const abs = isAbsolute(p) ? p : resolve(REPO_ROOT, p);
  const rel = relative(REPO_ROOT, abs);
  return rel.split(sep).join("/");
}

function loadOverrideLog(): Set<string> {
  if (!existsSync(OVERRIDE_LOG_PATH)) return new Set();
  const raw = readFileSync(OVERRIDE_LOG_PATH, "utf8");
  const out = new Set<string>();
  for (const lineRaw of raw.split(/\r?\n/)) {
    const m = /^###\s+(.+?)\s*$/.exec(lineRaw);
    if (m && m[1] !== undefined) out.add(normalizePath(m[1]));
  }
  return out;
}

function validateAllowFixtures(allowFixtures: string[]): void {
  if (allowFixtures.length === 0) return;
  const overrides = loadOverrideLog();
  const missing = allowFixtures.map(normalizePath).filter((p) => !overrides.has(p));
  if (missing.length > 0) {
    const lines = missing.map((p) => `  - ${p}`).join("\n");
    throw new InvocationError(
      `--allow-fixture rejected: no matching entry in phi-scan-overrides.md for:\n${lines}\n` +
        `Add a "### <path>" subsection to phi-scan-overrides.md and commit it.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Target enumeration
// ---------------------------------------------------------------------------

interface Target {
  path: string; // forward-slash repo-relative path for reporting
  read: () => Buffer;
}

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (WALK_SKIP_DIRS.has(e.name)) continue;
      walk(join(dir, e.name), out);
    } else if (e.isFile()) {
      // README / markdown docs may legitimately describe violator values; they
      // are documentation, not fixtures.
      if (e.name.toLowerCase().endsWith(".md")) continue;
      out.push(join(dir, e.name));
    }
  }
}

function gitIgnored(paths: string[]): Set<string> {
  const ignored = new Set<string>();
  if (paths.length === 0) return ignored;
  try {
    // SECURITY: array-form execFileSync, no shell. Default (Buffer) encoding —
    // `encoding: "buffer"` with `input` is rejected by Node.
    const out = execFileSync("git", ["check-ignore", "--stdin", "-z"], {
      input: paths.map(normalizePath).join("\0"),
      stdio: ["pipe", "pipe", "ignore"],
    });
    for (const p of out.toString("utf8").split("\0")) {
      if (p.length > 0) ignored.add(p);
    }
  } catch {
    // `git check-ignore` exits 1 when nothing matches — treat as none ignored.
  }
  return ignored;
}

function buildTargetsForAll(): Target[] {
  const files: string[] = [];
  walk(REPO_ROOT, files);
  const ignored = gitIgnored(files);
  return files
    .map((abs) => ({ abs, rel: normalizePath(abs) }))
    .filter(({ rel }) => !ignored.has(rel))
    .filter(({ rel }) => !rel.startsWith(EXCLUDED_PREFIX))
    .map(({ abs, rel }) => ({ path: rel, read: () => readFileSync(abs) }));
}

function buildTargetsForPaths(paths: string[]): Target[] {
  return paths.map((p) => {
    const abs = isAbsolute(p) ? p : resolve(REPO_ROOT, p);
    if (!existsSync(abs)) throw new InvocationError(`File not found: ${p}`);
    if (!statSync(abs).isFile()) throw new InvocationError(`Not a regular file: ${p}`);
    return { path: normalizePath(abs), read: () => readFileSync(abs) };
  });
}

function buildTargetsForStaged(): Target[] {
  let listBuf: Buffer;
  try {
    // SECURITY: array-form execFileSync, no shell.
    listBuf = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=AM", "-z"], {
      encoding: "buffer",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    throw new InvocationError(
      `git diff --cached failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  // Every staged (added/modified) file except markdown docs and the scanner's own
  // test is a candidate — `scanTarget` decides scope by content, so a real C-CDA
  // document staged under ANY name / directory (`patient.cda`, a root `.xml`, an
  // `examples/` sample) is caught, not just `test/` / `.xml` / `src/*.ts`.
  const list = listBuf
    .toString("utf8")
    .split("\0")
    .filter((p) => p.length > 0)
    .filter((p) => !p.toLowerCase().endsWith(".md"))
    .filter((p) => !p.startsWith(EXCLUDED_PREFIX));
  return list.map((relPath) => ({
    path: relPath,
    // SECURITY: array-form execFileSync, no shell. `:<path>` is a git pathspec.
    read: (): Buffer =>
      execFileSync("git", ["show", `:${relPath}`], {
        encoding: "buffer",
        stdio: ["ignore", "pipe", "pipe"],
      }),
  }));
}

// ---------------------------------------------------------------------------
// XML structural helpers (tolerant — fragments, malformed input, no DOM)
// ---------------------------------------------------------------------------

/** Best-effort code-point from an entity, guarding invalid values. */
function safeFromCodePoint(cp: number): string {
  if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return "";
  try {
    return String.fromCodePoint(cp);
  } catch {
    return "";
  }
}

/**
 * Decode XML character references + the five predefined entities. Runs before
 * every name / value comparison so a `&#x53;mith` or `&amp;` cannot smuggle a
 * real token past the token comparison. `&amp;` is decoded LAST so an already
 * literal `&` is not double-interpreted.
 */
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h: string) => safeFromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => safeFromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, "&");
}

/** Replace every `<![CDATA[ … ]]>` section with its literal inner text. */
function stripCdata(text: string): string {
  return text.replace(/<!\[CDATA\[([\s\S]*?)]]>/g, (_m, inner: string) => inner);
}

/** Escape a fixed local-name for embedding in a dynamic RegExp. */
function reEscape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Yield the direct text of every leaf `<localName>…</localName>` element,
 * namespace-prefix + case tolerant, entities decoded. The `[^<]*` body captures
 * only DIRECT text, so an element with child elements (`<name><given>…`) yields
 * an empty (skipped) body — its children are matched on their own.
 */
function* leafTexts(text: string, localName: string): Generator<string> {
  const n = reEscape(localName);
  const re = new RegExp(`<(?:[\\w.-]+:)?${n}\\b[^>]*>([^<]*)</(?:[\\w.-]+:)?${n}\\s*>`, "gi");
  for (const m of text.matchAll(re)) {
    const body = m[1];
    if (body !== undefined && body.length > 0) yield decodeXmlEntities(body);
  }
}

/** Parse the attributes of a single start-tag body into a lower-cased map. */
function parseAttrs(tagBody: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const m of tagBody.matchAll(re)) {
    const rawName = m[1] ?? "";
    const name = rawName.toLowerCase().replace(/^[\w.-]+:/, "");
    const val = m[2] ?? m[3] ?? "";
    if (name.length > 0) out[name] = decodeXmlEntities(val);
  }
  return out;
}

/** Yield the attribute map of every `<localName …>` start tag. */
function* elementTags(text: string, localName: string): Generator<Record<string, string>> {
  const n = reEscape(localName);
  const re = new RegExp(`<(?:[\\w.-]+:)?${n}\\b([^>]*?)/?>`, "gi");
  for (const m of text.matchAll(re)) {
    yield parseAttrs(m[1] ?? "");
  }
}

/** Unicode-aware name tokenizer (drops single Latin initials, keeps single CJK). */
function nameTokens(value: string): string[] {
  const out: string[] = [];
  for (const raw of value.split(/[^\p{L}]+/u)) {
    if (raw.length === 0) continue;
    if (!/\p{L}/u.test(raw)) continue;
    // A single Latin letter is a middle initial — not identifying. A single CJK
    // ideograph / kana / hangul IS a name (Chinese/Korean surnames are 1 char).
    const isCjk = /[぀-ヿ㐀-鿿가-힯]/u.test(raw);
    if (raw.length < 2 && !isCjk) continue;
    out.push(raw);
  }
  return out;
}

function isNameToken(tok: string): boolean {
  return !NAME_NOISE_TOKENS.has(tok.toUpperCase());
}

function normalizeDob(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 8) {
    const d = digits.slice(0, 8);
    const month = Number(d.slice(4, 6));
    const day = Number(d.slice(6, 8));
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return d;
  }
  if (/^\d{6}$/.test(digits)) {
    const month = Number(digits.slice(4, 6));
    if (month < 1 || month > 12) return null;
    return digits; // YYYYMM month-precision
  }
  if (/^\d{4}$/.test(digits)) return digits; // year-only precision
  return null;
}

// ---------------------------------------------------------------------------
// Category detectors (element / attribute aware)
// ---------------------------------------------------------------------------

function checkNames(path: string, text: string, allow: AllowList, hits: Hit[]): void {
  // Structured PN parts — `<given>` / `<family>` wherever they appear (patient,
  // guardian, assignedPerson, informant, relatedSubject, provider). The element
  // name alone identifies a person-name part in CDA, so no ancestor path needed.
  for (const loc of ["given", "family"] as const) {
    for (const body of leafTexts(text, loc)) {
      for (const tok of nameTokens(body)) {
        if (!isNameToken(tok)) continue;
        if (!allow.names.has(tok.toUpperCase())) {
          hits.push({
            path,
            locus: `name/${loc}`,
            value: tok,
            reason: "person-name token not in synthetic allow-list",
          });
        }
      }
    }
  }
  // A bare `<name>` carrying DIRECT text (`<name>Jane Doe</name>`) — an
  // unstructured person / organization name. `leafTexts` captures only direct
  // text (`[^<]*`), so a structured name (with `<given>` / `<family>` children)
  // yields an empty body and is handled by the part detectors above. Direct-text
  // capture is deliberate: a span-to-next-`</name>` regex would run away across
  // source files that merely mention `<name>` in a comment. The loose-text half
  // of a mixed-content name (`<name>John <family>Doe</family></name>`) is a
  // documented MINOR limitation (see phi-scan-overrides.md); its structured
  // `<family>` child is still caught above.
  for (const body of leafTexts(text, "name")) {
    for (const tok of nameTokens(body)) {
      if (!isNameToken(tok)) continue;
      if (!allow.names.has(tok.toUpperCase())) {
        hits.push({
          path,
          locus: "name",
          value: tok,
          reason: "unstructured name token not in synthetic allow-list",
        });
      }
    }
  }
}

function checkBirthTime(path: string, text: string, allow: AllowList, hits: Hit[]): void {
  for (const attrs of elementTags(text, "birthTime")) {
    const v = attrs["value"];
    if (v === undefined) continue;
    const dob = normalizeDob(v);
    if (dob === null) continue;
    if (!allow.dobs.has(dob)) {
      hits.push({
        path,
        locus: "birthTime@value",
        value: dob,
        reason: "date of birth not in synthetic allow-list",
      });
    }
  }
}

function checkIds(path: string, text: string, allow: AllowList, hits: Hit[]): void {
  for (const attrs of elementTags(text, "id")) {
    const root = (attrs["root"] ?? "").trim();
    const ext = (attrs["extension"] ?? "").trim();
    if (ext.length === 0) continue;
    const extUpper = ext.toUpperCase();
    const digits = ext.replace(/\D/g, "");
    if (root === SSN_ROOT_OID) {
      // SSN by OID declaration — a 9-digit extension is an SSN.
      if (/^\d{9}$/.test(digits) && !allow.ids.has(extUpper) && !allow.ids.has(digits)) {
        hits.push({
          path,
          locus: "id@extension",
          value: ext,
          reason: "SSN (id@root is the US SSN OID) not in synthetic allow-list",
        });
      }
      continue;
    }
    // A bare all-numeric extension of 6+ digits is a real-looking MRN / account
    // number (or a 9-digit SSN dropped in the wrong slot). Synthetic fixtures use
    // prefixed / alphanumeric shapes (MRN001, DOC123, prob-act-1), so a bare
    // numeric id is suspect. A `code`/`templateId`/OID never reaches here — only
    // `<id>`. Not upper-bounded: a real MRN / account is commonly 10+ digits.
    if (/^\d{6,}$/.test(ext) && !allow.ids.has(extUpper)) {
      hits.push({
        path,
        locus: "id@extension",
        value: ext,
        reason: "bare-numeric MRN / account identifier not in synthetic allow-list",
      });
    }
  }
}

function checkAddress(path: string, text: string, allow: AllowList, hits: Hit[]): void {
  for (const body of leafTexts(text, "streetAddressLine")) {
    const street = body.trim();
    // A street line: house number + at least one word (`123 Main St`).
    if (!/^\d+\s+\p{L}/u.test(street)) continue;
    if (!allow.addresses.has(street.toLowerCase())) {
      hits.push({
        path,
        locus: "streetAddressLine",
        value: street,
        reason: "street address not in synthetic allow-list",
      });
    }
  }
  for (const body of leafTexts(text, "city")) {
    for (const tok of nameTokens(body)) {
      if (!allow.cities.has(tok.toUpperCase())) {
        hits.push({
          path,
          locus: "city",
          value: tok,
          reason: "city not in synthetic allow-list",
        });
      }
    }
  }
  for (const body of leafTexts(text, "postalCode")) {
    const zip = body.trim();
    if (!/^\d{5}(?:-\d{4})?$/.test(zip)) continue;
    if (!allow.zips.has(zip)) {
      hits.push({
        path,
        locus: "postalCode",
        value: zip,
        reason: "postal code not in synthetic allow-list",
      });
    }
  }
}

function checkTelecom(path: string, text: string, hits: Hit[]): void {
  for (const attrs of elementTags(text, "telecom")) {
    const v = attrs["value"];
    if (v === undefined || v.length === 0) continue;
    // Email telecoms (`mailto:`) are covered by the whole-payload email pass.
    if (/^mailto:/i.test(v)) continue;
    const digits = v.replace(/\D/g, "");
    // A real dialable number is >= 10 digits. The `555` fake-exchange convention
    // (555-01xx is reserved for fiction) marks a synthetic number.
    if (digits.length >= 10 && !digits.includes("555")) {
      hits.push({
        path,
        locus: "telecom@value",
        value: v,
        reason: "phone number without the 555 fake-exchange convention",
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Shape checks shared by CDA and plain-text targets
// ---------------------------------------------------------------------------

function scanCommonShapes(path: string, content: string, allow: AllowList, hits: Hit[]): void {
  // Dashed SSN anywhere (covers narrative text and non-CDA targets).
  for (const m of content.matchAll(/\b\d{3}-\d{2}-\d{4}\b/g)) {
    hits.push({ path, locus: "(ssn)", value: m[0], reason: "dashed SSN pattern" });
  }
  // Emails whose domain is not an allow-listed reserved / test domain (also
  // catches `mailto:` telecoms, which the telecom detector defers to here).
  for (const m of content.matchAll(/\b[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g)) {
    const domain = (m[1] ?? "").toLowerCase();
    if (!allow.emailDomains.has(domain)) {
      hits.push({ path, locus: "(email)", value: m[0], reason: "email with non-test domain" });
    }
  }
}

// ---------------------------------------------------------------------------
// CDA dispatch
// ---------------------------------------------------------------------------

/** True when the text carries a C-CDA structural marker (namespace/root/loci). */
function hasCdaMarker(text: string): boolean {
  return (
    /<(?:[\w.-]+:)?ClinicalDocument\b/i.test(text) ||
    /urn:hl7-org:v3/i.test(text) ||
    /<(?:[\w.-]+:)?recordTarget\b/i.test(text) ||
    /<(?:[\w.-]+:)?patientRole\b/i.test(text)
  );
}

/** Hand-written source code (src/ or scripts/), by extension + location. */
function isSourceCode(path: string): boolean {
  return (
    /\.(?:ts|tsx|js|mjs|cjs)$/i.test(path) &&
    (path.startsWith("src/") || path.startsWith("scripts/"))
  );
}

/**
 * A target is treated as an actual C-CDA DOCUMENT (→ full structured scan) when
 * it has a native C-CDA extension (`.xml` / `.cda` / `.ccda`), lives under
 * `test/` (this repo's fixtures + suites embed C-CDA there), or carries a C-CDA
 * content marker while NOT being hand-written source code. The content-sniff is
 * what closes the "rename the document to dodge the scanner" bypass — detection
 * follows the bytes, not the file name. The `!isSourceCode` guard keeps a marker
 * that appears in a `src/` or `scripts/` comment / example string (including this
 * scanner's own doc comment) from turning code into a "document" and flagging its
 * illustrative tokens; such files still get the conservative shape pass.
 */
function looksLikeCda(text: string, path: string): boolean {
  if (/\.(?:xml|cda|ccda)$/i.test(path)) return true;
  if (path.startsWith("test/")) return true;
  return hasCdaMarker(text) && !isSourceCode(path);
}

function scanCda(path: string, text: string, allow: AllowList, hits: Hit[]): void {
  checkNames(path, text, allow, hits);
  checkBirthTime(path, text, allow, hits);
  checkIds(path, text, allow, hits);
  checkAddress(path, text, allow, hits);
  checkTelecom(path, text, hits);
}

/**
 * Scope + scan one target. `force` (paths mode — a file named explicitly on the
 * CLI) scans whatever it is pointed at. In `all` / `staged` mode a file is in
 * scope only when it is a C-CDA document (full structured scan) or `src/` code
 * (conservative shape pass) — an incidental config / lockfile (e.g. package.json,
 * whose author email is not PHI) is out of scope and skipped, so it is not a
 * false positive.
 */
function scanTarget(target: Target, allow: AllowList, hits: Hit[], force: boolean): void {
  let buf: Buffer;
  try {
    buf = target.read();
  } catch (err) {
    throw new InvocationError(
      `could not read ${target.path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const text = stripCdata(buf.toString("utf8"));
  if (looksLikeCda(text, target.path)) {
    scanCda(target.path, text, allow, hits);
    scanCommonShapes(target.path, text, allow, hits);
    return;
  }
  if (force || isSourceCode(target.path)) {
    // Not a document — conservative shape pass only (dashed SSN + non-test email)
    // over hand-written src/ + scripts/ code (or an explicitly-named path).
    scanCommonShapes(target.path, text, allow, hits);
  }
  // Otherwise: out of scope (config / lockfile / non-code non-document) — skip.
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function report(hits: Hit[]): void {
  if (hits.length === 0) {
    process.stdout.write("[phi-scan] OK — no hits\n");
    return;
  }
  const byPath = new Map<string, Hit[]>();
  for (const h of hits) {
    const arr = byPath.get(h.path);
    if (arr) arr.push(h);
    else byPath.set(h.path, [h]);
  }
  for (const [path, group] of byPath) {
    process.stderr.write(`[phi-scan] HIT: ${path}\n`);
    for (const h of group) {
      process.stderr.write(`  locus=${h.locus} value=${JSON.stringify(h.value)} (${h.reason})\n`);
    }
  }
  process.stderr.write(
    `[phi-scan] ${String(hits.length)} hit(s) across ${String(byPath.size)} file(s). ` +
      `If a value is genuinely synthetic, declare it in scripts/phi-allow-list.txt OR ` +
      `run with --allow-fixture <path> AND log it in phi-scan-overrides.md.\n`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): number {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
    validateAllowFixtures(args.allowFixtures);
  } catch (err) {
    if (err instanceof InvocationError) {
      process.stderr.write(`[phi-scan] ${err.message}\n`);
      return 2;
    }
    throw err;
  }

  const allow = loadAllowList();
  const allowed = new Set<string>(args.allowFixtures.map(normalizePath));

  let targets: Target[];
  try {
    if (args.mode === "staged") targets = buildTargetsForStaged();
    else if (args.mode === "paths") targets = buildTargetsForPaths(args.paths);
    else targets = buildTargetsForAll();
  } catch (err) {
    if (err instanceof InvocationError) {
      process.stderr.write(`[phi-scan] ${err.message}\n`);
      return 2;
    }
    throw err;
  }

  targets = targets.filter((t) => !allowed.has(t.path));

  // Paths mode scans exactly what the caller pointed at (force); the sweeping
  // all / staged modes decide scope per file inside scanTarget.
  const force = args.mode === "paths";
  const hits: Hit[] = [];
  for (const t of targets) {
    try {
      scanTarget(t, allow, hits, force);
    } catch (err) {
      if (err instanceof InvocationError) {
        process.stderr.write(`[phi-scan] ${err.message}\n`);
        return 2;
      }
      throw err;
    }
  }

  report(hits);
  return hits.length === 0 ? 0 : 1;
}

process.exit(main());
