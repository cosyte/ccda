---
"@cosyte/ccda": minor
---

Add the shared `toObject` / `toISO` / `toDate` conversion surface for a parsed `TS`

Every `@cosyte/*` standard parser now exports the same three conversions, under the same
names, with the same return shapes and the same timezone rule, so moving between two of
them costs nothing to relearn. Five names are added to the package entry point:
`toObject`, `toISO`, `toDate`, and the `DateParts` and `ToDateOptions` types.

- `toObject(ts)` returns a frozen `DateParts` carrying **only** the components the document
  stated. Nothing is zero-filled, so `Object.keys()` on a year-precision value is `["year"]`
  and the value's precision survives the conversion. `month` is the spec-native 1 to 12, the
  component names are singular, and there is no `raw`, `precision` or `valid` key.
  `millisecond` is the first three digits of the stated fraction taken verbatim and
  right-padded (`.5` is 500, `.0500` is 50), never a floating-point fraction multiplied by
  1000. `offsetMinutes` is present if and only if the value carried an explicit offset, a
  stated zero included. Deleting `offsetMinutes` leaves an object
  `Temporal.PlainDateTime.from` and luxon's `DateTime.fromObject` accept unchanged; neither
  library is a dependency and neither is imported.
- `toISO(ts)` renders ISO-8601 truncated to that same precision and pads nothing out, with
  fractional digits rendered exactly as written. A stated offset is appended (`Z` for a
  stated zero, otherwise `+HH:MM` / `-HH:MM`); with no stated offset nothing is appended and
  no `Z` is fabricated. Because a stated zero renders `Z`, this is not a byte round-trip of
  the wire value, and `serializeCcda` remains the round-tripping route.
- `toDate(ts, options?)` returns a `Date` only when the zone is determinate: the value
  carried an offset, or the caller passed `assumeOffsetMinutes` (signed minutes east of UTC,
  where an explicit `0` means "read this naive value as UTC"). With neither, the answer is
  `undefined`. The host machine's timezone is never read and UTC is never assumed. A value's
  own offset always beats an assumed one, a year below 100 stays that year rather than being
  remapped into the 1900s, and components below the stated precision fill to their lowest
  legal value for the instant only.

None of the three ever throws, for any input: an absent value, a `TS` with no `@value`, a
`TS` whose `@nullFlavor` contradicts a populated `@value` (the grounds on which `parseTs`
already withholds `date`), and a `@value` this package parses as malformed all answer
`undefined`.

**`TS.date` is unchanged and stays unchanged.** It remains eager: it zero-fills a truncated
value and resolves an offset-less one as if it had said UTC, so there are values where
`ts.date` is a populated `Date` and `toDate(ts)` is `undefined`, on the same object. That
divergence is deliberate rather than an oversight, it is documented in `README.md` and in the
docs bundle, and the old answer stays reachable by asking for it with
`{ assumeOffsetMinutes: 0 }`. Nothing reading `TS.date` today reads anything different.

Parts are derived by re-parsing `TS.raw`, the document's own bytes; `TS.date` is never read.
No dependency of any kind was added, runtime or development, and `engines.node` is unchanged
at `>=22.0.0`.
