# Timestamps, in full

How this package reads a v3 timestamp and converts it, moved out of `README.md` so the front
page stays short enough to read in one sitting. Nothing is rewritten: the headings and the
prose below are the ones `README.md` carried, at the heading levels it used, and `README.md`
links here from the heading the text left behind.

### Dates and times: `toObject`, `toISO`, `toDate`

Every timestamp this parser reads is a `TS`, carrying the document's verbatim `raw` string and a
derived `date`. `TS.date` is **eager**: a value stated to the day becomes the first instant of that
day, and a value carrying no `±ZZZZ` offset is resolved **as if it had said UTC**. On an offset-less
date of birth read in any negative-offset zone, that is a day out.

`toObject`, `toISO` and `toDate` are the honest reading of the same bytes. They are the same three
names, with the same return shapes and the same timezone rule, that every sibling `@cosyte/*` parser
exports, and they read `raw` rather than `date`.

```ts
import { toDate, toISO, toObject } from "@cosyte/ccda";

const onset = doc.getProblems()[0]?.problems[0]?.effectiveTime?.low; // a TS: { raw: "20260628" }

toObject(onset); // { year: 2026, month: 6, day: 28 } and no other key
toISO(onset); // "2026-06-28", with no trailing Z
toDate(onset); // undefined: the document stated no timezone

toDate(onset, { assumeOffsetMinutes: 0 }); // 2026-06-28T00:00:00.000Z, read as UTC because you said so
toDate(onset, { assumeOffsetMinutes: -300 }); // 2026-06-28T05:00:00.000Z
```

- **`toObject` reports only the components the value stated**, as a frozen `DateParts`. Nothing is
  zero-filled, so `Object.keys()` on a year-precision value is `["year"]` and the precision survives
  the conversion. `month` is the spec-native 1 to 12, the names are singular (`hour`, `minute`,
  `second`), and there is no `raw`, `precision` or `valid` key. `millisecond` is the first three digits
  of the stated fraction, verbatim and right-padded, so `.5` is 500 and `.0500` is 50. `offsetMinutes`
  is present **if and only if** the document wrote an offset, a stated zero included. Delete
  `offsetMinutes` and what is left is accepted unchanged, with no key renamed, by
  `Temporal.PlainDateTime.from` and by luxon's `DateTime.fromObject`; neither is a dependency here and
  neither is imported, the shape is simply chosen to fit them.
- **`toISO` truncates to that precision and appends nothing it was not given.** A month-precision
  value renders `"2026-06"`, fractional digits render exactly as written rather than padded to three,
  and a stated offset is appended as `Z` (for a stated zero) or `+HH:MM` / `-HH:MM`. **With no stated
  offset, no `Z` is fabricated.** Because a stated zero renders `Z` rather than `+0000`, this is not a
  byte round-trip; `serializeCcda` remains the round-tripping route.
- **`toDate` returns a `Date` only when the zone is determinate.** Either the value carried an offset,
  or you passed `assumeOffsetMinutes` (a `ToDateOptions`: signed minutes east of UTC, where an explicit
  `0` means "treat this naive value as UTC"). **With neither, the answer is `undefined`: the host
  machine's timezone is never read and UTC is never assumed**, so a document converts to the same
  instant on a laptop in Denver and a container in Frankfurt. A value's own offset always beats an
  assumed one, and a value below day precision fills to the lowest legal component for the instant
  only, leaving what `toObject` and `toISO` report untouched.
- **An `assumeOffsetMinutes` that names no usable zone is refused the same way.** `NaN` and the two
  infinities are not a number of minutes, and a finite offset large enough to push the result outside
  the range a JS `Date` holds does not denote an instant either. Both answer `undefined`. **What never
  comes back is an `Invalid Date`**: it satisfies the `Date | undefined` return type and defeats its
  point, because a caller cannot tell one from a real `Date` without testing `getTime()` for `NaN`,
  and calling `toISOString()` on it throws.

  ```ts
  toDate(onset, { assumeOffsetMinutes: Number.NaN }); // undefined, not an Invalid Date
  toDate(onset, { assumeOffsetMinutes: 1e15 }); // undefined: finite, but off the end of time
  ```

- **An offset the DOCUMENT states is bounded too, at 23 hours 59 minutes, and past it the value is
  refused whole.** The v3 `TS` literal's `±ZZZZ` token is four digits wide and constrains neither
  field, so `<effectiveTime value="20240229120000+9999"/>` is a legal literal stating 6039 minutes:
  not a zone, and one the shared `+HH:MM` rendering can only misspell as `+100:39`, a string no
  ISO-8601 reader accepts. All three functions answer `undefined` for such a value rather than one of
  them reporting a hundred-hour zone. 23:59 is the widest the `+HH:MM` slot can state at all, and is
  the same bound `@cosyte/hl7` applies; `@cosyte/dicom` bounds tighter, at 14:59, because its own wire
  cannot write a wider one.

  ```ts
  toObject({ raw: "20240229120000+2359" }); // { ..., offsetMinutes: 1439 }: the widest statable zone
  toISO({ raw: "20240229120000+9999" }); // undefined, never "2024-02-29T12:00:00+100:39"
  ```

So there are values where `ts.date` is a populated `Date` and `toDate(ts)` is `undefined`, on the same
object. That divergence is deliberate, and `TS.date` is unchanged: code reading it today reads exactly
what it read before. Reach for `TS.date` when you want the eager behaviour and know it assumes UTC;
for `toObject` when the precision matters (a birth date stated to the month is not a birth date at
midnight on the first); for `toISO` when you are writing the value out or comparing it as text; and
for `toDate` when you need an instant and can say which zone an offset-less value was written in.

#### Using two `@cosyte` parsers in one file

All six `@cosyte/*` standard parsers export these three names, so a file that consumes two of them has
to alias the imports:

```ts
import { parseCcda, toISO as ccdaToISO } from "@cosyte/ccda";
import { parseDtm, toISO as hl7ToISO } from "@cosyte/hl7";

const document = parseCcda(xml);

// A C-CDA encounter period: `effectiveTime` is an `IVL_TS`, so each bound is a `TS`.
const admitted = ccdaToISO(document.getEncounters()[0]?.effectiveTime?.low);

// The same conversion, over the value the v2 parser read out of an OBX-14.
const observedAt = hl7ToISO(parseDtm("20260628153045-0500"));
```

Namespace imports are the alternative, and read better when a file uses several conversions from each
package:

```ts
import * as ccda from "@cosyte/ccda";
import * as hl7 from "@cosyte/hl7";

ccda.toObject(effectiveTime);
hl7.toObject(dtm);
```

