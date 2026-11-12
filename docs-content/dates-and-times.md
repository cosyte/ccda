---
id: dates-and-times
title: Dates and times
sidebar_label: Dates and times
description: "Reading C-CDA timestamps honestly with toObject, toISO, and toDate, and using them beside another Cosyte parser."
---

# Dates and times

The conversion functions are `toObject`, `toISO`, and `toDate`.

Every timestamp this parser reads is a `TS`, carrying the document's verbatim `raw` string and a
derived `date`. `TS.date` is **eager**: a value stated to the day becomes the first instant of that
day, and a value carrying no `±ZZZZ` offset is resolved **as if it had said UTC**. On an offset-less
date of birth read in any negative-offset zone, that is a day out.

`toObject`, `toISO`, and `toDate` are the honest reading of the same bytes. They are the same three
names, with the same return shapes and the same timezone rule, that every sibling `@cosyte/*` parser
exports, and they read `raw` rather than `date`.

```ts runnable
import { buildCcda, toDate, toISO, toObject } from "@cosyte/ccda";

const doc = buildCcda({
  patient: { mrn: "MRN-00042" },
  problems: [
    { problem: { code: "59621000", displayName: "Essential hypertension" }, onset: "20260628" },
  ],
});

const onset = doc.getProblems()[0]?.problems[0]?.effectiveTime?.low; // a TS
onset?.raw; // => "20260628"

toObject(onset); // => { year: 2026, month: 6, day: 28 }
toISO(onset); // => "2026-06-28"
toDate(onset); // => undefined

toDate(onset, { assumeOffsetMinutes: 0 })?.toISOString(); // => "2026-06-28T00:00:00.000Z"
toDate(onset, { assumeOffsetMinutes: -300 })?.toISOString(); // => "2026-06-28T05:00:00.000Z"
```

`toObject` gives back only the stated components and no other key, `toISO` adds no trailing `Z`,
and `toDate` answers `undefined` because the document stated no timezone. Read as UTC, or five
hours west of it, it is an instant only because you said which zone.

- **`toObject` reports only the components the value stated**, as a frozen `DateParts`. Nothing is
  zero-filled, so `Object.keys()` on a year-precision value is `["year"]` and the precision survives
  the conversion. `month` is the spec-native 1 to 12, the names are singular (`hour`, `minute`,
  `second`), and there is no `raw`, `precision`, or `valid` key. `millisecond` is the first three digits
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

  ```ts runnable
  import { toDate } from "@cosyte/ccda";

  const onset = { raw: "20260628" };
  toDate(onset, { assumeOffsetMinutes: Number.NaN }); // => undefined
  toDate(onset, { assumeOffsetMinutes: 1e15 }); // => undefined
  ```

  The first is not a number of minutes; the second is finite, but off the end of time. Neither comes
  back as an Invalid Date.

- **An offset the DOCUMENT states is bounded too, at 23 hours 59 minutes, and past it the value is
  refused whole.** The v3 `TS` literal's `±ZZZZ` token is four digits wide and constrains neither
  field, so `<effectiveTime value="20240229120000+9999"/>` is a legal literal stating 6039 minutes:
  not a zone, and one the shared `+HH:MM` rendering can only misspell as `+100:39`, a string no
  ISO-8601 reader accepts. All three functions answer `undefined` for such a value rather than one of
  them reporting a hundred-hour zone. 23:59 is the widest the `+HH:MM` slot can state at all, and is
  the same bound `@cosyte/hl7` applies; `@cosyte/dicom` bounds tighter, at 14:59, because its own wire
  cannot write a wider one.

  ```ts runnable
  import { toISO, toObject } from "@cosyte/ccda";

  toObject({ raw: "20240229120000+2359" })?.offsetMinutes; // => 1439
  toISO({ raw: "20240229120000+9999" }); // => undefined
  ```

  The first is the widest zone the slot can state; the second is refused whole, never rendered as
  `"2024-02-29T12:00:00+100:39"`.

So there are values where `ts.date` is a populated `Date` and `toDate(ts)` is `undefined`, on the same
object. That divergence is deliberate, and `TS.date` is unchanged: code reading it today reads exactly
what it read before. Reach for `TS.date` when you want the eager behavior and know it assumes UTC;
for `toObject` when the precision matters (a birth date stated to the month is not a birth date at
midnight on the first); for `toISO` when you are writing the value out or comparing it as text; and
for `toDate` when you need an instant and can say which zone an offset-less value was written in.

## Using two `@cosyte` parsers in one file

All six `@cosyte/*` standard parsers export these three names, so a file that consumes two of them has
to alias the imports, or import each package as a namespace, which reads better when a file uses
several conversions from each. Here is the `@cosyte/ccda` half of both forms:

```ts runnable
import * as ccda from "@cosyte/ccda";
import { toISO as ccdaToISO } from "@cosyte/ccda";

// A C-CDA timestamp with its offset, as an encounter's `effectiveTime.low` carries it.
const admitted = { raw: "20260628153045-0500" };

ccdaToISO(admitted); // => "2026-06-28T15:30:45-05:00"
ccda.toObject(admitted)?.offsetMinutes; // => -300
```

The other package's half is the same shape: `import { toISO as hl7ToISO } from "@cosyte/hl7"`, or
`import * as hl7 from "@cosyte/hl7"` and then `hl7.toISO(...)` over the value its own parser read,
such as an OBX-14 from `parseDtm`.

## How-to guides that apply this

- [Read the active problem list](./read-the-problem-list.md), whose problems carry the dates read here.
- [Build a document](./build-a-document.md), which writes them.
