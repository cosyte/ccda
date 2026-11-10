/**
 * The three properties every Cosyte parser proves, run on the generators this package exports at
 * `@cosyte/ccda/arbitraries`:
 *
 * 1. **Round trip.** For any generated document `d`, `parseCcda(serializeCcda(d))` equals `d`, and
 *    serializing again changes nothing. Equal means: the same serialized text, byte for byte, and
 *    the same read model, compared with deep strict equality on every public field (the document
 *    type, its templates, the header, every section with its narrative, every entry list, the
 *    non-XML body, the profile and the warnings with their codes, messages and positions). The one
 *    exception is the two warnings `buildCcda` adds from its input
 *    (`MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME` and `MISSING_SELF_CARE_ACTIVITY`), which describe
 *    what the caller left out and which no parse of the text can see; they are left out of the
 *    comparison.
 * 2. **Idempotent normalize.** For each normalizer the library has, normalizing twice gives what
 *    normalizing once gave: the document normalizer `serializeCcda(parseCcda(raw))`, the profile
 *    transform `applyProfile`, the template-id bound, the bounds on tokens a position or the model
 *    echoes, and the strip of a derived value from a timestamp or a quantity.
 * 3. **Never throws in lenient mode.** Any input comes back as a document whose warnings carry
 *    registered codes, or is refused with a `CcdaParseError` carrying one of the documented fatal
 *    codes, which are what lenient mode may still throw. Nothing else escapes, with or without a
 *    profile, and whatever a warning handler does.
 *
 * Each runs 100 cases by default from a fresh seed; `COSYTE_PROPERTY_RUNS` sets the depth, and a
 * failure prints the seed and path that replay it (see `./_runner.ts`).
 */

import assert from "node:assert/strict";

import fc from "fast-check";
import { describe, it } from "vitest";

import {
  CcdaParseError,
  FATAL_CODES,
  WARNING_CODES,
  applyProfile,
  ccdaProfiles,
  parseCcda,
  serializeCcda,
  type CcdaDocument,
  type CcdaProfile,
  type II,
  type PQ,
  type TS,
} from "../../src/index.js";
import { document, documentText, hostileInput } from "../../src/arbitraries/index.js";
import { text } from "../../src/arbitraries/values.js";
import { boundTemplateId } from "../../src/model/types/ii.js";
import { pqWithoutDerivedValue } from "../../src/model/types/pq.js";
import { tsWithoutDerivedValue } from "../../src/model/types/ts.js";
import {
  safeDatatypeName,
  safeDerivedToken,
  safeElementName,
  safeMediaType,
  safeRepresentation,
} from "../../src/parser/tokens.js";

import { assertProperty, propertyTimeout } from "./_runner.js";

/** Each test's budget, scaled to the depth `COSYTE_PROPERTY_RUNS` sets. */
const TIMEOUT = propertyTimeout();

const FATAL: ReadonlySet<string> = new Set(Object.values(FATAL_CODES));
const KNOWN: ReadonlySet<string> = new Set(Object.values(WARNING_CODES));

/** The warnings `buildCcda` adds from its input, which no parse of the text can see. */
const BUILD_ONLY: ReadonlySet<string> = new Set([
  WARNING_CODES.MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME,
  WARNING_CODES.MISSING_SELF_CARE_ACTIVITY,
]);

/**
 * The warnings a generated document may carry: each describes what its input left out or
 * asserted, none a repair. A medication with no dose or route, a refused immunization, a smoking
 * status with no value or a code outside the value set, an allergen whose generated label reads
 * like a product, and the two the builder adds from its input.
 */
const ADVISORY: ReadonlySet<string> = new Set([
  ...BUILD_ONLY,
  WARNING_CODES.MISSING_DOSE_QUANTITY,
  WARNING_CODES.MISSING_ROUTE_CODE,
  WARNING_CODES.IMMUNIZATION_REFUSED,
  WARNING_CODES.SMOKING_STATUS_UNKNOWN,
  WARNING_CODES.SMOKING_STATUS_CODE_UNRECOGNIZED,
  WARNING_CODES.ALLERGEN_GRANULARITY_SUSPECT,
]);

/** The built-in profiles. */
const PROFILES: readonly CcdaProfile[] = Object.values(ccdaProfiles);

/** A document's read model: every public field, without the serialized text it keeps privately. */
function model(doc: CcdaDocument): Record<string, unknown> {
  return { ...doc };
}

/** Parse leniently: the document, or `undefined` when the parser refused with a documented fatal. */
function parseOrFatal(raw: string): CcdaDocument | undefined {
  try {
    return parseCcda(raw);
  } catch (err) {
    assert.ok(err instanceof CcdaParseError, `lenient parse threw ${String(err)}`);
    assert.ok(FATAL.has(err.code), `lenient parse threw the non-fatal code ${err.code}`);
    return undefined;
  }
}

/** Every warning carries a registered code, a message and a position object. */
function assertWarningsRegistered(doc: CcdaDocument): void {
  for (const w of doc.warnings) {
    assert.ok(KNOWN.has(w.code), `unregistered warning code ${w.code}`);
    assert.equal(typeof w.message, "string", `warning ${w.code} has no message`);
    assert.equal(typeof w.position, "object", `warning ${w.code} has no position`);
  }
}

describe("property: round trip", () => {
  it(
    "parseCcda(serializeCcda(d)) equals d for any generated document, and serializing again changes nothing",
    () => {
      assertProperty(
        "round trip",
        fc.property(document(), (d) => {
          const once = serializeCcda(d);
          const back = parseCcda(once);
          assert.equal(back.toString(), once);
          assert.deepStrictEqual(model(back), {
            ...model(d),
            warnings: d.warnings.filter((w) => !BUILD_ONLY.has(w.code)),
          });
          assert.equal(serializeCcda(back), once);
        }),
      );
    },
    TIMEOUT,
  );

  it(
    "a generated document carries advisory warnings only",
    () => {
      // This holds the generator to account: a repair warning on a built document would mean the
      // round trip above could be passing over a repair rather than proving fidelity.
      assertProperty(
        "generator is spec-clean",
        fc.property(document(), (d) => {
          const repairs = d.warnings.map((w) => w.code).filter((c) => !ADVISORY.has(c));
          assert.deepStrictEqual(repairs, []);
        }),
      );
    },
    TIMEOUT,
  );

  it(
    "a document parsed from messy text reads the same after a round trip",
    () => {
      assertProperty(
        "round trip (messy text)",
        fc.property(documentText(), (raw) => {
          const first = parseCcda(raw);
          const once = serializeCcda(first);
          const second = parseCcda(once);
          const third = parseCcda(serializeCcda(second));
          // The first parse read the messy text and the second its serialized form, so a warning's
          // line and column may move (an XML declaration added, a byte order mark dropped). What
          // was read may not: every model field but the warnings is equal, and so are the codes.
          const { warnings: firstWarnings, ...firstModel } = model(first);
          const { warnings: secondWarnings, ...secondModel } = model(second);
          assert.deepStrictEqual(secondModel, firstModel);
          const codes = (ws: unknown): string[] =>
            (ws as CcdaDocument["warnings"])
              .map((w) => w.code)
              .filter((c) => c !== WARNING_CODES.ENCODING_BOM_STRIPPED);
          assert.deepStrictEqual(codes(secondWarnings), codes(firstWarnings));
          // From the serialized form on, the round trip is exact.
          assert.deepStrictEqual(model(third), model(second));
        }),
      );
    },
    TIMEOUT,
  );
});

describe("property: idempotent normalize", () => {
  const normalizeDocument = (raw: string): string | undefined => parseOrFatal(raw)?.toString();

  it(
    "serializeCcda(parseCcda(raw)) is a fixed point for messy document text",
    () => {
      assertProperty(
        "idempotent normalize (document text)",
        fc.property(documentText(), (raw) => {
          const once = normalizeDocument(raw);
          assert.ok(once !== undefined, "messy document text was refused");
          assert.equal(normalizeDocument(once), once);
        }),
      );
    },
    TIMEOUT,
  );

  it(
    "serializeCcda(parseCcda(raw)) is a fixed point for any hostile input the parser accepts",
    () => {
      assertProperty(
        "idempotent normalize (hostile input)",
        fc.property(hostileInput(), (raw) => {
          const once = normalizeDocument(raw);
          if (once === undefined) return;
          assert.equal(normalizeDocument(once), once);
        }),
      );
    },
    TIMEOUT,
  );

  it(
    "applyProfile is idempotent for every built-in profile, on every warning a parse raises",
    () => {
      assertProperty(
        "idempotent normalize (profile)",
        fc.property(documentText(), fc.constantFrom(...PROFILES), (raw, profile) => {
          for (const w of parseCcda(raw, { profile: null }).warnings) {
            const once = applyProfile(profile, w);
            assert.deepStrictEqual(applyProfile(profile, once), once);
          }
        }),
      );
    },
    TIMEOUT,
  );

  /** Strings near and far from the shapes and sets the token bounds accept. */
  const tokenText = fc.oneof(
    fc.constantFrom(
      "2.16.840.1.113883.10.20.22.1.2",
      "2015-08-01",
      "11450-4",
      "0a1b2c3d-0000-4000-8000-00000000000a",
      "section",
      "templateId",
      "PQ",
      "IVL_TS",
      "text/plain",
      "application/pdf",
      "B64",
      "TXT",
      "<withheld>",
      "",
    ),
    fc.string({ unit: fc.constantFrom(..."0123456789.-abcdefABCDEF/_<>"), maxLength: 40 }),
    text(),
  );

  it(
    "each token bound is idempotent",
    () => {
      const bounds: readonly ((value: string) => string)[] = [
        (v) => safeDerivedToken(v, "uid"),
        (v) => safeDerivedToken(v, "templateVersion"),
        (v) => safeDerivedToken(v, "loinc"),
        safeElementName,
        safeDatatypeName,
        safeMediaType,
        safeRepresentation,
      ];
      assertProperty(
        "idempotent normalize (token bounds)",
        fc.property(tokenText, (raw) => {
          for (const bound of bounds) {
            const once = bound(raw);
            assert.equal(bound(once), once);
          }
        }),
      );
    },
    TIMEOUT,
  );

  it(
    "the template-id bound is idempotent",
    () => {
      const id: fc.Arbitrary<II> = fc.record(
        {
          root: tokenText,
          extension: tokenText,
          assigningAuthorityName: tokenText,
          nullFlavor: fc.oneof(fc.constantFrom("UNK", "NI", "NA", "MSK"), tokenText),
        },
        { requiredKeys: [] },
      );
      assertProperty(
        "idempotent normalize (template id)",
        fc.property(id, (raw) => {
          const once = boundTemplateId(raw);
          assert.deepStrictEqual(boundTemplateId(once), once);
        }),
      );
    },
    TIMEOUT,
  );

  it(
    "stripping a derived value from a timestamp or a quantity is idempotent",
    () => {
      const ts: fc.Arbitrary<TS> = fc.record(
        { raw: tokenText, date: fc.date(), nullFlavor: fc.constantFrom("UNK", "NI") },
        { requiredKeys: [] },
      );
      const pq: fc.Arbitrary<PQ> = fc.record(
        { raw: tokenText, value: fc.double(), unit: tokenText, nullFlavor: fc.constant("UNK") },
        { requiredKeys: [] },
      );
      assertProperty(
        "idempotent normalize (derived values)",
        fc.property(ts, pq, (t, q) => {
          const tOnce = tsWithoutDerivedValue(t);
          assert.deepStrictEqual(tsWithoutDerivedValue(tOnce), tOnce);
          const qOnce = pqWithoutDerivedValue(q);
          assert.deepStrictEqual(pqWithoutDerivedValue(qOnce), qOnce);
        }),
      );
    },
    TIMEOUT,
  );
});

describe("property: never throws in lenient mode", () => {
  it(
    "any hostile input parses with registered warnings or is refused with a documented fatal",
    () => {
      assertProperty(
        "never throws in lenient mode",
        fc.property(hostileInput(), (raw) => {
          const doc = parseOrFatal(raw);
          if (doc !== undefined) assertWarningsRegistered(doc);
        }),
      );
    },
    TIMEOUT,
  );

  it(
    "messy document text always parses, with registered warnings",
    () => {
      assertProperty(
        "never throws in lenient mode (document text)",
        fc.property(documentText(), (raw) => {
          assertWarningsRegistered(parseCcda(raw));
        }),
      );
    },
    TIMEOUT,
  );

  it(
    "a built-in profile, or a warning handler that throws, makes no difference to what escapes",
    () => {
      const input = fc.oneof(hostileInput(), documentText());
      assertProperty(
        "never throws in lenient mode (profiles and handlers)",
        fc.property(input, fc.constantFrom(...PROFILES), (raw, profile) => {
          let doc: CcdaDocument | undefined;
          try {
            doc = parseCcda(raw, {
              profile,
              onWarning: () => {
                throw new Error("a handler that throws");
              },
            });
          } catch (err) {
            assert.ok(err instanceof CcdaParseError, `lenient parse threw ${String(err)}`);
            assert.ok(FATAL.has(err.code), `lenient parse threw the non-fatal code ${err.code}`);
          }
          if (doc !== undefined) assertWarningsRegistered(doc);
        }),
      );
    },
    TIMEOUT,
  );
});
