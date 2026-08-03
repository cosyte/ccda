---
"@cosyte/ccda": patch
---

The `attw` publish gate no longer reports a pass on a tarball that carries no types.

`pnpm attw` ran the bare CLI. `@arethetypeswrong/cli@0.18.4`'s `getExitCode.js` opens with
`if (!analysis.types) return 0`, returning before the problem list is read, so no `--profile`,
`--ignore-rules` or config setting can reach it. That is not a bug in `attw`: an untyped package is
a legitimate npm package, so "no types at all" is a description rather than a problem. But for a
package that ships types it means the declarations were **not in the tarball**, which is a broken
publish reported as a pass. A false red costs an hour; **a false green merges.** The script is now
`node scripts/attw.mjs`, which preflights and post-checks around the CLI. Nothing in `src/` changed
and the published package behaves identically: this is the release gate only.

**The race only supplies the condition; it is not the defect.** Reproduced here deterministically,
with zero concurrency, against this package's own `dist/`: both `rm -rf dist && attw --pack .` and
`rm -f dist/index.d.ts dist/index.d.cts && attw --pack .` print "This package does not contain
types." and exit 0. The second is the realistic one. `tsup` emits JS in one pass and the declaration
files in a later pass, so **every** build here has an interval where `dist/` holds `.mjs`/`.cjs` and
no `.d.ts`; polling three consecutive `pnpm build` runs put it at 1.7 s, 2.4 s and 3.1 s. Those
figures move with box load and differ by 80%, so read them as "seconds", never as a constant. A
concurrent build or a `clean` in the same working tree lands `attw` in that interval.

**Deliberately not answered with a lock, a lease, a semaphore or a build queue.** Whatever removed
the inputs, a gate has to be able to say its own inputs were missing. Serializing the builders would
hide this instance and leave the gate exactly as unable to report the next one.

**Two nets, and they catch different things.** The preflight checks that every relative path
`package.json` promises exists and is non-empty: `main`, `module`, `types`, `typings`, and every
string leaf of `exports`, which here is `./dist/index.cjs`, `./dist/index.mjs`, `./dist/index.d.ts`
and `./dist/index.d.cts`. It catches the build window and names the missing file instead of leaving
the reader to infer it. The post-check promotes `attw`'s untyped sentence to a failure, and catches
what the preflight structurally cannot: declarations present on disk and still absent from the
tarball. No instance of that second case is on record in this repo, and it remains the case
`attw --pack` exists to catch. Demonstrated rather than assumed: with the declarations on disk, so
the preflight passes, and `files` narrowed to the two JS entry points, the bare CLI prints the
untyped sentence and exits 0 while the wrapper exits 1.

The preflight's non-emptiness half closes a second, quieter false green that the post-check
structurally cannot see: a **zero-byte** declaration file. `attw` finds a types entry point there,
reports "No problems found" and exits 0 over a package that declares nothing, and the untyped
sentence never appears.

Which route emptied the tarball depends on the `.npmignore`'s **depth**, not on whether one exists.
Both measured with `npm pack` on this manifest: a **root** `.npmignore` naming the declarations
changes nothing, because `files` is present and npm gives it precedence; a **`dist/.npmignore`**
naming them does strip them, because a `.npmignore` inside a directory `files` selected still filters
that directory's contents. The gate's failure message names both. Net 2 does not depend on the
distinction either way, since it reads what `attw` says about the packed tarball rather than
reasoning about how the tarball was assembled.

**The post-check reads a string, so what would hide that string is refused rather than tolerated.**
Nine routes were measured against the pinned CLI, each handing back exit 0 over an untyped pack with
the sentence absent: `--quiet`, `-q`, `--format json`, `--format=json`, `-f json`, `-fjson`, `-Pq`,
and a `.attw.json` setting `quiet` or `format` (`readConfig()` applies it after argv). Two more are
refused without being blinding routes, because the rule is by option name and not by value:
`--config-path`, by inference rather than measurement, since it would move the config file out of
view; and `-f=json`, on which bare `attw` exits 1 as a usage error. A harmless `--format
table-flipped` is refused as well. That is the deliberate trade: value-parsing these would be a third
moving part in the guard, and being over-strict about an argument nobody passes to a repo's own
publish gate costs less than a route back to a false green. Everything else is forwarded, so
`--profile node16` still works.

`-fjson` is the route the sibling's guard misses, and it is why the refusal reads a short cluster's
letters rather than comparing whole tokens: commander parses `-fjson` as `-f json`, so a
`split("=")[0]` token test lets it through. Over-strictness is bounded rather than asserted, because
of this CLI's six short options only `-f` takes a value at all, so a `q` or an `f` inside a
single-dash token is either one of these options or part of `-f`'s own value. A test pins that a
legitimate short option is still let through.

A third guard sits behind the two nets: if `attw` exits 0 having printed nothing at all, the script
fails rather than passing, because the post-check read nothing and cannot vouch for what it did not
see. It is the backstop for a blinding route nobody has enumerated.

**The suite that guards it is load-bearing, measured rather than asserted.**
`test/scripts/attw-gate.test.ts` runs 21 cases against the real binary over throwaway fixtures in a
temp directory, so it neither needs this repo's build nor can race one. It pins the upstream exit-0
itself, so an `attw` upgrade that rewords the sentence or fixes the exit code reds the suite instead
of letting the net go quietly slack; it pins a negative control on a well-formed package, because a
gate that only ever fails is not a gate; and it pins that a real `attw` failure still fails, because
a wrapper that swallowed the status would pass every other case here. That last one does not
distinguish `attw`'s own status from a hardcoded 1, since `getExitCode()` returns literally 1 on
problems and the gate's own failure path also exits 1; pass-through is true by inspection rather than
by that assertion. Reverting the wrapper to the bare invocation reds 16 of the 21, and the 5 that
stay green are exactly the pass-through ones: three pins on `attw`'s own behaviour, the real failure,
and the negative control.
