# 05 — Research Notes and Evidence

## How to read the evidence tags

Every decision in `03-decision-log.md` cites its basis with one of these tags.
The point is to let a debating agent see at a glance which claims are checked
facts and which are judgment.

| Tag | Meaning |
|---|---|
| **[V]** | **Verified this session** against a primary source (registry, official docs, standards body). Listed below with the source. |
| **[BP]** | **Established best practice** — widely documented guidance, cited by name. Recalled from the model's knowledge, *not* re-fetched this session. |
| **[K]** | **Domain / technical knowledge** — how a tool or a domain works, recalled, not re-fetched. |
| **[J]** | **Judgment** — a trade-off call or a belief about what reviewers value. Arguable by nature. |
| **[U]** | **Unverified claim** — believed, could matter, should be checked before relying on it. |

**Limitation:** the web-search tool was unavailable in this session (it
returned a model-access error on every call). Verification was therefore done
by fetching primary sources directly (npm registry, nodejs.org, Docker Hub,
postgresql.org, IETF datatracker, Wikipedia raw text). Blog-level "X vs Y"
comparisons were **not** consulted, so ecosystem-sentiment claims are
tagged [J] or [U], not [V]. A debating agent with working search should
re-check anything tagged [BP], [K] or [U] that it wants to lean on.

In debate round 1 the reviewers that had web access did so: U-1, U-2 and the
PostgreSQL 18 volume path in V-3 were re-checked by them and then read
directly by the author. V-8 to V-11 were added while applying the round's
outcome, again from primary sources (package tarballs and official docs).

Debate round 2 added V-12 to V-15. The author computed or ran V-12 and V-13,
and read the sources of V-14 and V-15 directly after a reviewer raised them.
The same round left four claims that nobody checked: U-9 to U-12.

The catalog change that followed round 2 (D-07, D-27) rests on no new
verified fact. Its mechanisms are judgment ([J]) and ordinary PostgreSQL
behaviour ([K]: `ON CONFLICT DO NOTHING`, advisory locks, foreign keys).
Debate round 3 reviewed them (`debate/round-3-summary.md`). The author ran
the round's checkable claims on the local Node 26 (V-16) and left nine
recalled claims unchecked, each with the test that settles it (U-13 to
U-21).

After round 3 the owner changed the time model (D-09: only the UTC instant
is stored). The author ran the facts it rests on on the local Node 26
(V-17); web search worked for one lookup and confirmed how RFC 9557 reads
`Z` (K-18); three recalled database and framework details are listed as
unchecked (U-22 to U-24). Round 4 reviewed the change; the author ran its
checkable claims (V-18) and listed two more recalled details (U-25, U-26).
After the round-4 apply the author checked the four database details
(U-23 to U-26) on PGlite 0.5.17, the PostgreSQL 18.7 engine compiled to
WebAssembly and run inside Node from a scratch folder outside the project
(V-19).
A review of the catalog refresh then ran its database questions on the
same engine (V-20), recorded three recalled facts (K-19) and one reasoned
deadlock that a single connection cannot run (U-27). A check of key lengths
ran on the local Node 26 and the same engine (V-21), and the configuration
review rests on recalled tool behaviour (K-20).

Before implementation the author read how Claude Code starts a subagent and
what the pstack plugin contains, and ran the first of these (V-24 to V-26).
Two things about the tools are left unchecked (U-30, U-31).
The owner then chose a pull request per task with a second review by Grok;
the author ran the two tools it needs (V-27).

## Verified facts [V]

### V-1 Runtime and framework versions (npm registry, nodejs.org)

| Package | Version | Note |
|---|---|---|
| Node.js | 26.13.1 is the newest LTS line ("Lithium"); 24 ("Krypton") and 22 ("Jod") are older LTS lines | `nodejs.org/dist/index.json`. Local machine has v26.12.0. |
| `@nestjs/core` | 12.5.1 | `engines.node >= 20`; package is `"type": "module"`. |
| `@nestjs/swagger` | 12.1.2 | peer `typescript: ^5.5.0 \|\| ^6.0.0` — **TypeScript 7 not supported**. |
| `@nestjs/config` / `terminus` | 12.1.1 / 12.2.0 | |
| `typescript` | `latest` = 7.0.2; newest 6.x = 6.0.3 | |
| `ts-jest` | 29.4.15 | peer `typescript >=4.3 <7`, `jest ^29 \|\| ^30`. |
| `jest` / `vitest` | 30.5.2 / 5.1.1 | |
| `nestjs-pino` / `pino` | 5.3.2 / 10.4.0 | peer `@nestjs/core ^11.0.8 \|\| ^12.0.2`. |
| `class-validator` | 0.15.1 | `@nestjs/common` 12 peer: `class-validator >=0.13.2`. |
| `zod` / `nestjs-zod` | 4.6.7 / 5.6.0 | `nestjs-zod` peer `@nestjs/common ^10 \|\| ^11` — **Nest 12 not declared**. |
| `drizzle-orm` / `drizzle-kit` | 0.45.4 / 0.31.11 (`latest`); 1.0.0-rc.5 under the `rc` tag | pre-1.0. |
| `prisma` | **`latest` tag points at 8.0.0-rc.34**; last stable is 7.10.1 (tag `prev`) | a plain `npm i prisma` installs a release candidate. |
| `typeorm` | 1.1.3 | |
| `kysely` / `pg` | 0.29.9 / 8.23.1 | |
| `testcontainers`, `@testcontainers/postgresql` | 12.2.1 | |
| `fast-check` / `decimal.js` / `supertest` / `helmet` | 4.10.3 / 10.6.0 / 7.3.2 / 8.3.0 | |

### V-2 NestJS 12 starter templates (`@nestjs/schematics` tarball)

- Default `ts` template: **Jest 30 + ts-jest 29.4**, `typescript ^6.0.2`, `module: nodenext`, target ES2023.
- A separate `ts-esm` template uses **Vitest** (`^4.1.2`) with `"type": "module"`.
- Both ship `@nestjs/platform-express` as the HTTP adapter.

### V-3 Database images (Docker Hub tags)

- `postgres`: newest stable is **18.7** (`18-alpine`); 19 exists only as `19rc2`.
- `mongo`: newest is 9.0.8.
- From PostgreSQL 18 the official image sets `PGDATA` to
  `/var/lib/postgresql/18/docker` and declares its volume at
  `/var/lib/postgresql`; mounts must target that path (read from the image's
  own documentation, docker-library/docs `postgres/content.md`; raised by the
  Grok review). The PostgreSQL 18 manual describes `uuidv7()` as "millisecond
  precision + sub-millisecond timestamp + random" (functions-uuid page).

### V-4 PostgreSQL 18 documentation (postgresql.org/docs/18)

- **`uuidv7()`** is a built-in function: "Generates a version 7 (time-ordered)
  UUID" (functions-uuid).
- **pg_trgm** GIN/GiST indexes "support trigram-based index searches for LIKE,
  ILIKE, ~, ~* and = queries"; "the search string need not be left-anchored";
  "a pattern with no extractable trigrams will degenerate to a full-index scan" (pgtrgm).
- **numeric** is "user-specified precision, exact"; `real`/`double precision`
  are "variable-precision, inexact" (datatype-numeric).

### V-5 Idempotency-Key (IETF datatracker)

- `draft-ietf-httpapi-idempotency-key-header` is at revision **-08**. It is still an Internet-Draft, **not an RFC**.

### V-6 Epley formula (Wikipedia, "One-repetition maximum", raw wikitext)

- Listed as `w · (1 + r/30)`, **"assuming r > 1"**, citing Epley 1985.
- "Of the formulas, the Epley and the Brzycki formulas are most commonly used."

### V-7 Local environment

- Node v26.12.0 (has global `Temporal`), Docker CLI 29.8.2, Docker Compose v5.6.0, git 2.50.1.
- Whether the Docker **daemon** is running was not confirmed.
- The project folder is **not yet a git repository**.

### V-8 `Temporal` typings (TypeScript 6.0.3 package tarball)

- The package ships `lib/lib.esnext.temporal.d.ts` (`declare namespace
  Temporal`, including `PlainDateTime`, `ZonedDateTime`,
  `toZonedDateTimeISO` and `toPlainDate`), referenced from `lib.esnext.d.ts`.
- There is no `es20xx` variant of that file, so `tsconfig` must list `esnext`
  or `esnext.temporal` in `lib`; the Nest template targets ES2023 (V-2) and
  would not pick it up on its own.
- The runtime side is V-7: the local Node 26 exposes a global `Temporal`.

### V-9 How node-postgres returns dates (node-postgres docs, "Data types")

- `date`, `timestamp` and `timestamptz` values are parsed into JavaScript
  `Date` objects. `DATE` and `TIMESTAMP` columns are interpreted in the local
  time of the Node process (`process.env.TZ`).
- Consequence: a `date` of `2025-02-10` read in a UTC+7 process is a `Date` at
  local midnight, which is `2025-02-09T17:00:00Z`; formatting it with
  `toISOString()` prints the previous day. In a UTC process (the Docker
  default) nothing shifts, so the bug stays hidden until the code runs
  somewhere else. Hence: read SQL `date` as text, test under a non-UTC zone.
- After round 3 no column is a `date`. `performed_at` is a `timestamptz(3)`,
  which arrives as an exact `Date` because both hold milliseconds; the
  non-UTC test zones stay, to catch any accidental cast through a zone.

### V-10 `uuid` package, `v7()` (npm registry; `src/v7.ts` in the repository)

- `latest` is 14.0.3.
- `v7()` keeps the last millisecond and a 32-bit sequence as module state:
  a second id in the same millisecond gets the next sequence value, and the
  timestamp is moved forward if the sequence would roll over. Ids made by one
  process therefore always increase, including within one millisecond.

### V-11 Hand-written migrations with Drizzle Kit (official docs, "Custom migrations")

- `drizzle-kit generate --custom --name=<name>` (drizzle-kit 0.31.11) creates
  an empty SQL migration file for statements the kit does not generate; it is
  tracked and applied like any generated migration.

### V-12 Exact kilograms, and what four decimals did to ties (computed by the author with arbitrary-precision decimals)

- `225 lb × 0.45359237 = 102.05828325 kg`. An input with three decimals times
  a factor with eight has at most eleven decimals, so `numeric(17,11)` stores
  every accepted weight whole.
- `100 lb × 10` and `200 lb × 5` are both 1 000 lb, exactly `453.59237 kg`.
  With each set rounded to four decimals first they are `45.3592 × 10 =
  453.5920` and `90.7185 × 5 = 453.5925`: a true tie turned into a 0.5 g win
  for the second set.
- Survey: every load from 45 to 500 lb in 5-lb steps, at 1 to 15 reps
  (1 380 sets). Of the 1 391 pairs with exactly equal volume, 1 074 (77 %)
  are no longer equal at four decimals. Of the 424 pairs with exactly equal
  estimated 1RM, 405 (96 %) are no longer equal.
- Kilogram entries never had the problem: they are stored as sent.
- With exact storage a pound load and a kilogram load do not collide by
  accident: on a 0.25-lb grid up to 1 000 lb there are three
  near-coincidences, and in each the two nominal loads differ.

### V-13 `Temporal` behaviours the time model relies on (run by the author on the local Node 26)

- `Temporal.PlainDateTime.from` drops an offset written in the string and
  rejects a string that ends in `Z`. This is why the parser is chosen by the
  shape of the input, not by which of `date` and `timeZone` was sent.
- `19:30` at `−08:00` is `10:30` on the next calendar day in
  `Asia/Ho_Chi_Minh`: the local date is taken in the entry's zone, never
  from the UTC date.
- A wall time in a daylight-saving gap (`02:30` on the night the clocks go
  forward) resolves to `03:30`; a wall time in an overlap resolves to the
  earlier occurrence. Both are the default `disambiguation: 'compatible'`.
  `'reject'` throws instead.
- Fractions down to the microsecond are accepted; the stored instant is cut
  to milliseconds.
- After round 3 the first three points are no longer used: the server never
  turns a wall time into an instant, and `date` has one format with one
  parser (`Temporal.Instant.from`). Cutting to milliseconds still applies
  (V-17).

### V-14 `uuid` 14 is ESM-only (npm registry metadata)

- The package is `"type": "module"` and its `exports` map has no `require`
  condition. Under Jest with `ts-jest` in the template's CommonJS-style
  setup the import is the first thing that can fail, so the first slice
  contains a test that imports `v7` (see also U-5).

### V-15 A primary key can carry `INCLUDE` columns (PostgreSQL 18 manual, `CREATE TABLE`)

- The table-constraint form is `PRIMARY KEY ( column_name [, ... ] )
  [ INCLUDE ( column_name [, ...]) ]`. The first rung of the PR fallback
  ladder (design §11) — `PRIMARY KEY (entry_id, set_number) INCLUDE (reps,
  weight_kg)` on `workout_sets` — is therefore valid SQL. Raised by a
  reviewer in round 2; the page was then read directly by the author.

### V-16 Claims checked in debate round 3 (run by the author on the local Node 26, exact decimal arithmetic)

- `instant.toZonedDateTimeISO('Z')` throws a `RangeError`; `'UTC'`,
  `'+07:00'` and `'-05:00'` work. A `Z` instant is therefore converted with
  the zone `UTC` (design §8).
- `Temporal.PlainDate.from('2025-02-30')` throws, and so does an instant
  carrying that date. A non-existent date is a 400 naming the field, not a
  silent roll-over to March.
- `crypto.timingSafeEqual` throws `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH` on
  buffers of different length. The guard compares SHA-256 digests, which
  always have the same length (design §10.7).
- The largest ranking product the caps allow has 18 significant digits —
  under `decimal.js`'s default precision of 20 (U-13), which is set to 40
  anyway (design §6).
- 10 000 001 accepted weights (0–10 000, up to three decimals) went through
  `JSON.parse` and `String(n)` and came back as typed: 0 mismatches.
- A delta can differ from the difference of the two displayed figures:
  `104.37` and `103.33` are shown, their difference is `1.04`, and the delta
  from exact values is `1.03` (README note, design §9.4).
- `100.125 kg × 1` shows `weight: 100.125` (the original) and `volume:
  100.13` (computed, two decimals).

### V-17 The instant-only time model (run by the author on the local Node 26.12, after round 3)

- `Temporal.Instant.from` throws on a date alone (`2025-02-10`), on a
  date-time with no offset (`2025-02-10T05:30:00`) and on a number written
  as text (`1739165400000`). It accepts a space instead of `T`, lower-case
  `t` and `z`, `+07` and `+0700`, the compact `20250210T053000Z`, and
  `-00:00`; it reads a leap second `23:59:60Z` as `23:59:59Z`; it keeps up to
  nine fraction digits; and it accepts years from `-000001` and beyond.
- It also accepts a zone in brackets and ignores it, even one that
  contradicts the offset: `2025-02-10T05:30:00+07:00[America/Denver]` gives
  the same instant as without the brackets. That was the reason for the
  400 for brackets after round 3; since round 4 a bracket is accepted and
  ignored (D-09, V-18).
- The traveller pair: `2025-02-10T05:30:00+07:00` is `2025-02-09T22:30:00Z`
  and `2025-02-10T20:30:00-07:00` is `2025-02-11T03:30:00Z`, 29 hours apart.
  In `Asia/Ho_Chi_Minh` they show as Feb 10 05:30 and Feb 11 10:30; at
  `-07:00` as Feb 9 15:30 and Feb 10 20:30.
- A Monday 06:00 session in `Asia/Ho_Chi_Minh` is Sunday 15:00 in
  `America/Los_Angeles`; a 14:59 session there is still the previous day,
  23:59.
- Noon UTC of 2025-03-01 is 2025-03-01 at every offset from `-12:00` to
  `+11:45`, and 2025-03-02 at `+12:00`, `+13:00` and `+14:00`. Midnight UTC
  of the same date is Feb 28 16:00 in Los Angeles. (Why noon UTC was
  considered for a date alone, and why a client filling in a time should
  not use midnight UTC.)
- `Temporal.Instant.from` rejects a date that does not exist inside a
  date-time: `2025-02-30T09:00:00Z`, `2025-02-29T09:00:00Z` and
  `2025-02-10T24:00:00Z` throw; `2024-02-29T09:00:00Z` is accepted.
- `node:querystring` and `URLSearchParams` both turn
  `from=2025-02-01T00:00:00+07:00` into `2025-02-01T00:00:00 07:00`; with
  `%2B` the `+` survives. `Temporal.Instant.from` throws on the space form.
- Los Angeles, the week starting 2025-03-09 (clocks go forward that night):
  adding 168 hours ends at `2025-03-16T01:00-07:00`, adding one week at
  `2025-03-16T00:00-07:00`, and a workout at 00:30 on Mar 16 falls inside
  the 168-hour week. March 2025 there is 743 hours long.
- `Temporal.Instant.fromEpochMilliseconds(i.epochMilliseconds)` cuts
  `…:00.9999Z` to `…:00.999Z`. JavaScript's `new Date('2025-02-10')` is
  midnight UTC while `new Date('2025-02-10T05:30:00')` is local time — the
  reason the server never parses dates with `Date`.
- base64url output never contains `+`, so a cursor survives a query string.

### V-18 Claims checked in debate round 4 (run by the author on the local Node 26.12)

- `Temporal.ZonedDateTime.prototype.toString()` and `toJSON()` print the
  zone in brackets by default (`2025-03-09T00:00:00-08:00[America/Los_Angeles]`),
  and `JSON.stringify` does too; `.toInstant().toString()` prints
  `2025-03-09T08:00:00Z`. `Temporal.Instant.from` reads a bracketed string
  by its offset and ignores the bracket, also for `[u-ca=iso8601]`.
- `ZonedDateTime.from(…, { offset: 'reject' })` accepts a matching zone and
  throws on a contradicting one (the option that was not taken).
- `Temporal.Instant.from` accepts years `0000` and `-000500`.
- Noon `+07:00` is 150 minutes ahead of 09:30 the same morning in Hanoi, and
  is 21:00 the previous day in Los Angeles.
- A Monday 06:00 session in Hanoi is Sunday 15:00 in Los Angeles in February
  and Sunday 16:00 in July.
- A Vietnam 20:00 session sent as `20:00Z` is 6 hours ahead when logged at
  21:00 local, and 18 hours in the past when logged the next evening.
- The old `+` pattern matched only `T…hh:mm` followed by `hh:mm`; it missed
  `07`, `0700`, a lower-case `t` and a space for `T`.
- Against millisecond values, cutting `to=…00.123456Z` down excludes a row at
  `.123` that is inside the range; rounding both bounds up to the next
  millisecond gave the exact answer in all three cases tried.

### V-19 Database details checked after round 4 (PGlite 0.5.17, run by the author)

- The engine reports `PostgreSQL 18.7 (PGlite 0.5.17) on
  wasm32-unknown-emscripten`: the same major version as the
  `postgres:18-alpine` image the design pins. It is the server's own code,
  so its parsing and storage rules are the server's; it is not a network
  server, so it says nothing about `node-postgres` (V-9 covers that).
- **U-23 holds.** Written to `timestamptz(3)`, `…:00.9996Z` becomes
  `…:01`, `…:00.9994Z` becomes `…:00.999`, `…:00.0005Z` becomes `…:00.001`
  and `…:00.0004Z` becomes `…:00`: PostgreSQL rounds to the column's
  precision, halves up; it does not cut.
- **U-25 holds.** `'2025-02-10T05:30:00+07:00'::timestamp` is
  `2025-02-10 05:30:00` with the session zone set to UTC and to
  `America/Los_Angeles` alike, and a `timestamp` column stores the same,
  with no error or warning. The same text as `timestamptz` is
  `2025-02-09 22:30:00+00` in a UTC session and `2025-02-09 14:30:00-08` in
  a Los Angeles one: one moment, printed in the session's zone.
- **U-26 holds, with one detail corrected.** Year `0000` is refused with
  `22008` ("date/time field value out of range"). A minus-sign year
  (`-000001-01-01T00:00:00Z`, the form `Temporal` prints) is refused too,
  but with `22007` ("invalid input syntax"). PostgreSQL's own form for
  those years is a `BC` suffix (`0001-01-01 00:00:00Z BC` is accepted).
- **U-24 holds.** The earliest `timestamptz` accepted is
  `4714-11-24 00:00:00+00 BC` in the proleptic Gregorian calendar (the
  documentation's "4713 BC"); one second earlier is `22008` "timestamp out
  of range". `1900-01-01T00:00:00Z` is accepted.
- On the local Node 26.12, a client gets its local offset instead of `Z`
  with `Temporal.Now.zonedDateTimeISO().toString({ smallestUnit:
  'millisecond', timeZoneName: 'never' })`: under `TZ=Asia/Ho_Chi_Minh`
  the output ends in `+07:00` (a fixed example prints
  `2025-02-10T05:30:00.000+07:00`). `Date.prototype.getTimezoneOffset()`
  gives `-420` there and `480` / `420` in Los Angeles in winter / summer:
  minutes behind UTC, so its sign is the reverse of the written offset.

### V-20 The catalog refresh review (PGlite 0.5.17 = PostgreSQL 18.7, one session, run by the author)

- **`ON DELETE RESTRICT` answers `23001`, not `23503`.** Deleting a
  referenced row through a foreign key declared `ON DELETE RESTRICT` fails
  with `23001` ("violates RESTRICT setting of foreign key constraint"); with
  `ON DELETE NO ACTION`, or no action written, the same delete fails with
  `23503`. Design §5 had declared `RESTRICT` and mapped `23503`.
- **Statement-level triggers fire on writes that change nothing.** An
  `AFTER … FOR EACH STATEMENT` trigger ran for an `INSERT … ON CONFLICT DO
  NOTHING` that inserted no row, an `UPDATE` matching no row and a `DELETE`
  matching no row; a `BEFORE` statement trigger did too. A row-level trigger
  ran for none of them. A statement trigger also ran on the link table when
  deleting an exercise cascaded to its links, and did not run for
  `TRUNCATE` or with `session_replication_role = replica`.
- **The foreign-key check runs before an `AFTER STATEMENT` trigger.** With a
  statement trigger that raises an error, inserting a link to a missing
  group failed with the foreign-key error, not the trigger's.
- **A rolled-back transaction leaves a counter row as it was; a sequence
  moves on.** `nextval` called inside a rolled-back transaction still
  advanced the sequence.
- **What a load costs.** For 300 exercises, 40 groups and 900 links, one
  statement returning the version, every exercise with its groups in order,
  and every group took 2.6 ms and produced 26 KB of JSON; reading one
  version row took 0.07 ms. PGlite runs inside Node with no network, so a
  real server adds a round trip: the figures are an order of magnitude.

### V-21 Key lengths (Node 26.12 over every code point; PGlite 0.5.17 = PostgreSQL 18.7; run by the author)

`exerciseKey` as design §10.1 defines it: NFKC, trim, collapse whitespace,
lower-case.

- The longest key from one character is U+FDFA: 18 code points, 33 UTF-8
  bytes. A name of 100 × U+FDFA is 100 characters and gives a key of 1 800
  code points, 3 300 bytes.
- Exactly one character gets longer when lower-cased after NFKC: U+0130
  (`İ`), which becomes two. A name of 100 × `İ` is 100 characters after
  NFKC and gives a key of 200, so measuring the normalised name does not
  bound the key.
- No non-blank character gives an empty key.
- U+FDFA is a letter (`\p{L}`), and its NFKC passes a letters, digits,
  spaces and hyphens rule, so it reaches a group name too.
- An emoji is 2 in JavaScript's `length` and 1 in PostgreSQL's
  `char_length`, which counts code points.
- **At the entry insert today** (no `CHECK`), the 1 800-character key was
  stored: repeated, it compresses under the B-tree limit of both indexes.
  A mix drawn from the 41 characters that expand to 10 bytes or more gave
  460 code points and 1 323 bytes, also stored. An incompressible key of
  3 300 bytes failed with `54000` ("index row size 3344 exceeds btree
  version 4 maximum 2704") on `ix_entries_history`, but a 100-character name
  cannot produce one: past the limit it must be mostly U+FDFA, which
  repeats.
- **At the catalog insert**, a key over 100 characters and a name of 101
  ASCII characters each failed with `23514` (`check_violation`), which no
  route maps: a 500 on create, and a failed `migrate` step on seed.

### V-22 Claims checked in the plan review (run by the author on the local Node 26.12)

- `Temporal.Instant.from('2025-02-10T06:30:00+07:00[Asia/Ho_Chi_Minh]')` is
  `2025-02-09T23:30:00Z`: a zone in brackets is accepted, as V-18 recorded.
  A reviewer's claim that it throws is wrong.
- `Temporal.PlainDate.from` accepts `"2025-02-10 06:30:00"` (Python's
  `str(datetime)`), `"2025-02-10T06:30:00"` and `"20250210"`, so it cannot
  tell a date alone from a date-time with no offset. The plan recognises a
  date alone by the shape of the text instead.
- `Temporal.Instant.from` accepts the compact `20250210T053000Z`, and reads
  the leap second `2016-12-31T23:59:60Z` as `…23:59:59Z`.
- `String(1e-7)` and `String(0.0000001)` are both `"1e-7"`, and
  `JSON.parse("1e-7")` is `1e-7`: counting decimal places on the text must
  handle exponent notation.
- `101 kg × 1` and `100 kg × 1` show estimated maxima of 104.37 and 103.33.
  The delta from exact values rounds to 1.03 and the percent to 1; the
  difference of the shown values is 1.04.
- Design §17 says `GET …/workout-entries/{id}` accepts `unit`; the plan had
  left it out.

### V-23 Library facts behind the library convention (npm registry, project pages, local Node 26.12; read by the author)

- **npm registry:** `lodash` 4.18.1 has no `"type"` field and `main: lodash.js`, so it is CommonJS; `@types/lodash` is 4.17.27; `simple-statistics` 8.0.0 is `"type": "module"` with a CommonJS build as `main` (`dist/simple-statistics.cjs`).
- **autocannon README** (repository master, 9.0.0): the programmatic result's latency percentiles are `p2_5`, `p50`, `p75`, `p90`, `p97_5`, `p99`, `p99_9`, `p99_99` and `p99_999` — no p95, and no option for other percentiles or raw samples. `amount` and `connections` exist; warm-up is a CLI option measured in time, not in requests. The package is CommonJS.
- **drizzle-orm 0.44.0 release notes:** "we've introduced a new `DrizzleQueryError` that wraps all errors from database drivers". The notes do not say which property holds the original error (U-29).
- **Node 26.12:** `Object.groupBy`, `Map.groupBy`, the `Set` methods such as `union`, `structuredClone`, `RegExp.escape`, `Array.prototype.toSorted` and `Buffer`'s `base64url` are all built in.

### V-24 What a Claude Code subagent starts with (official docs, read by the author; then run by the author on Claude Code 2.1.329 and in the desktop session)

- **Docs** (code.claude.com, "Create custom subagents", "What loads at startup"): a subagent that is not a fork starts with a fresh context and none of the conversation. It loads "every level of the CLAUDE.md hierarchy the main conversation loads"; the built-in Explore, Plan and web-fetch agents skip this. The same section says the main conversation's auto memory "isn't loaded".
- **Run, a new session in this repository** (the CLI, `claude -p`, a `general-purpose` subagent told to use no tools): the subagent gave the checkpoint list of `CLAUDE.md` §3 from its context, and named `CLAUDE.md` and the memory index `MEMORY.md` as present. So the rules file reaches a subagent, and so does the one-line memory index, against the docs' sentence.
- **Run, the session that wrote the file** (the desktop app): a `general-purpose` subagent had the memory index and not `CLAUDE.md`; an Explore subagent had neither. The file is read when a session starts, so a session that was open before the file existed does not have it.
- **A test that proved nothing:** the same question in a scratch folder under the temporary directory found no rules file, but a control showed that the main session there had not loaded it either. Why was not established.
- **Docs, other details relied on:** with both files present Claude Code reads `CLAUDE.md` and not `AGENTS.md` ("Memory", AGENTS.md table). A subagent in its own worktree takes its instruction files from the main conversation, and the worktree branches from the default branch unless `worktree.baseRef` is `"head"` ("Worktrees"). Hooks from settings and plugins also run inside subagents ("Hooks"). A skill with `disable-model-invocation: true` cannot be invoked by the model or preloaded into a subagent ("Skills").
- **Not tested:** a new session of the desktop app (U-30).

### V-25 The pstack plugin (repository `cursor/plugins`, commit `7a58391`, version 0.15.46; files read by the author, nothing installed or run)

- **What Claude Code would install:** the marketplace file lists pstack with the source `harness/pstack/claude-code`, a generated copy. It lists one other plugin, `origin-apps`, and not `cursor-team-kit`, which holds the `/deslop` step that pstack requires before a commit.
- **Nothing is enforced:** the copy has no hooks. 57 of its 58 skills set `disable-model-invocation: true` (all but `setup-pstack`), and its own Claude Code adapter says "The `Skill` tool refuses most pstack skills".
- **How rules reach a delegate:** only if the spawning agent writes "Read <path>/worker.md before anything else." as the first line of the brief, and spawns `pstack:poteto-agent`. That agent's file carries a model slug of another product, which the adapter says must be overridden on every spawn.
- **`worker.md`, in its words:** "Never call a tool that shows a person a question. Make any choice you can undo"; "The bar in your kickoff is the whole bar. Add no check, gate, sign-off or review round above it"; "Open every PR ready for review, never as a draft".
- **The decision log** (`show-me-your-work`): six tab-separated columns, the first an ISO timestamp that `scripts/log.sh` stamps; kept out of git by default; its closing audit asks for a reviewer on another vendor's model.
- **Playbooks:** the multi-phase-plan playbook writes a plan and stops; the shipping playbook lands pull requests with `gh pr merge <pr> --squash`.
- **Global side effect:** `setup-pstack` writes `~/.claude/rules/pstack-models.md`, which Claude Code loads into every new session of every project.
- **Read in full:** `worker.md`, `poteto-mode/SKILL.md`, the adapter, both agent files, `show-me-your-work` with its script, the never-block principle, and the multi-phase-plan, feature, autonomous-run and session-pickup playbooks. Read in part: six more playbooks, `setup-pstack`, `no-comments`. Not read: the other twelve playbooks and the other principle skills.

### V-26 Plugin updates and agent teams in Claude Code (official docs, read by the author)

- **Auto-update** is on by default for the official marketplace and off by default for "every other marketplace, including the community marketplace, third-party marketplaces, and local development marketplaces" ("Discover and install plugins"). pstack's README says the same and gives `claude plugin update pstack@cursor-plugins` for an update by hand. An install or an update takes the repository's head; the repository's last commit was hours old when it was read.
- **Agent teams** "are experimental and disabled by default", with known limits around resuming a session ("Agent teams"). A teammate loads `CLAUDE.md` like any session.

### V-27 The tools behind the pull-request flow (run by the author on this machine)

- **GitHub CLI:** `gh` is installed and logged in, with the `repo` scope. Two accounts are logged in, which is why the owner creates the repository.
- **Grok through the Copilot CLI** (version 1.0.114): `copilot -p "<prompt>" --model grok-4.7 -s --no-ask-user` answered and named itself Grok 4.7. The model id `grok-4-7` was refused as not available.
- **The Agent tool** of Claude Code takes a `model` of `opus`, `fable`, `sonnet` or `haiku` for a subagent, so the implementer and the first reviewer can be set per call (tool schema, and the docs of V-24).
- **Not checked:** the ids of the fallback models in the Copilot CLI; how long a CI run or a Grok review of a real diff takes; the Copilot CLI's limits on the size of a prompt (round 3 saw Grok's long replies cut off, W-33).

## Best-practice and knowledge claims relied on (not re-fetched) [BP] / [K]

| # | Claim | Where it is used |
|---|---|---|
| K-1 | 1 lb = 0.45359237 kg exactly (international yard and pound agreement, 1959); 1 stone = 14 lb = 6.35029318 kg. | D-08 |
| K-2 | RFC 9457 "Problem Details for HTTP APIs" (obsoletes RFC 7807) defines `application/problem+json` with `type`, `title`, `status`, `detail`, `instance` and allows extension members. | D-19 |
| K-3 | Keyset ("seek") pagination is O(log n) per page and stable under inserts; OFFSET cost grows with the offset and pages shift when rows are inserted (Markus Winand, *Use The Index, Luke* — "no offset"). PostgreSQL supports row-value comparison `(a,b,c) < (x,y,z)` that a matching B-tree can use. | D-10 |
| K-4 | Stripe's API popularised `Idempotency-Key`: same key + same payload replays the stored response; same key + different payload is an error. | D-15 |
| K-5 | Strava's API exposes both `start_date` (UTC) and `start_date_local` for an activity — precedent for storing an instant plus a local wall time. | D-09 |
| K-6 | PostgreSQL B-tree `INCLUDE` columns enable index-only scans, which depend on the visibility map being kept current by (auto)vacuum; since PG 13 autovacuum also triggers on insert-only tables. | D-11, D-16 |
| K-7 | A CTE referenced more than once is materialised (computed once) in PostgreSQL 12+; `MATERIALIZED` forces it. | D-11 |
| K-8 | PostgreSQL enum types are awkward to evolve (values cannot be removed; historically `ADD VALUE` had transaction restrictions). | D-08 |
| K-9 | MongoDB multi-document transactions require a replica set (or sharded cluster), not a standalone `mongod`. A single-node replica set is enough, and is a small compose change (the second half is U-12). | D-03 — a fact about MongoDB, no longer an argument against it |
| K-10 | `ON CONFLICT DO NOTHING` on a unique index waits for a concurrent in-flight insert of the same key to commit or roll back before deciding. | D-15 — behind the README's description of the key as the next step; nothing in v1 relies on it |
| K-11 | Twelve-Factor App: config in the environment, logs as event streams to stdout. | D-23 |
| K-12 | The test pyramid / "don't mock what you don't own": integration tests against the real database engine catch what mocks cannot. | D-22 |
| K-13 | 1RM estimation formulas lose accuracy as reps rise (commonly cited as beyond ~10 reps). | D-12 (README note) |
| K-14 | What real lifting data looks like. Plates step by 0.5 kg or 2.5 lb as a rule, by 0.25 kg or 0.5 lb with small plates, by 0.125 kg or 0.25 lb at the finest; calibrated competition plates are made to about ±10 g. A set is 1–30 reps; a session is 5–12 exercises of 3–6 sets, and a main lift runs to six to ten sets once warm-ups are logged; a committed lifter logs 1 000–2 500 entries a year. The heaviest barbell lifts are around 500 kg. Lifters who train in pounds load round numbers (5-lb steps), which is what makes exact ties common (V-12). | D-06, D-08, D-18, D-22; rule 8 of the debate brief |
| K-15 | What clients send for a date. JavaScript's `Date.prototype.toISOString()` always prints UTC with `Z`. Python's `datetime.isoformat()` on a naive value and the HTML `datetime-local` input print a date-time with no offset. | D-09 |
| K-16 | PostgreSQL's wire protocol allows at most 65 535 bind parameters in one statement. | D-14 (why the `unnest` rewrite was withdrawn) |
| K-17 | PostgreSQL behaviours the catalog relies on: `INSERT … ON CONFLICT DO NOTHING` skips a row whose key exists, and with `RETURNING` returns no row for it; a session advisory lock (`pg_advisory_lock`) serialises two runs of the `migrate` step until it is released; a foreign key refuses an insert that names a missing row and a delete of a row still referenced, with SQLSTATE `23503` (under the default `NO ACTION`; `RESTRICT` answers `23001` — V-20). | D-07, D-27 (the seed, the admin writes and the closed muscle-group list) |
| K-18 | RFC 9557 (April 2024) updates RFC 3339 so that `Z` can mean "the UTC time is known, the local offset is not" — the role RFC 3339 had given `-00:00`. Found by web search after round 3 (the IETF datatracker entry and the AUTH48 discussion); the final section text was not read word for word. Why the stored offset is `NULL` for `Z` (design §8, after round 4). | D-09 |
| K-19 | `LISTEN` needs a session that stays on one server connection, so it does not work through a pooler in transaction mode (such as PgBouncer's); under READ COMMITTED a second `UPDATE` of a row another transaction holds waits, then re-reads the committed row, so two concurrent increments both count; `deadlock_timeout` defaults to 1 second. Recalled during the catalog refresh review. | Design §10.2, §10.8 (D-07) |
| K-20 | Tool behaviour the configuration relies on: the default request serializer of `pino-http` (behind `nestjs-pino`) logs the request headers, `authorization` included, unless redacted; Docker Compose substitutes `${VAR:-default}` and reads a `.env` file in the project directory for it; `@nestjs/config` lets a variable already in the environment win over `.env`; `node-postgres` pools default to 10 connections. Recalled during the configuration review. | Design §13 (D-23) |

## Unverified claims that could matter [U]

| # | Claim | Why it matters | How to check |
|---|---|---|---|
| U-1 | Everfit's production stack is Node.js + **MongoDB**. **Now checked — only half true:** Everfit's own "Backend Engineer (Nodejs)" posting on ITviec asks for "Express.js, MongoDB, Redis, and PostgreSQL" (found by the Opus review; page read directly to confirm). | PostgreSQL is part of their stack, so D-03 costs little in "fits your stack". Note the posting also names **Express**, not NestJS. | Done. |
| U-2 | Drizzle 0.45 can express everything in §5 of the design from its schema DSL (`uuidv7()` default, `timestamptz(3)`, `INCLUDE` columns, `DESC` index columns). **Refuted for `INCLUDE`:** drizzle-orm issue #2972 ("Indexes with Included Columns (PG)") is an open feature request (found by the Opus review; issue read directly to confirm). | The design no longer depends on it: migrations are SQL files written by hand, created with `drizzle-kit generate --custom` (V-11), and `schema.ts` is for typing only (D-04, design §13). | Done for `INCLUDE`; the rest no longer matters. |
| U-3 | The name and muscle-group filters on `ix_entries_history` finish a 50k-row worst case in < 100 ms. The worst cases are two: a term that matches nothing, and a term or muscle group that matches a rarely logged exercise (the scan must walk most of the index to fill a page). | The "no trigram index" decision (D-16) rests on it. Requires the two-step query and a current visibility map, so the benchmark also runs after fresh inserts without a vacuum. If it fails, the fallback needs no new table: list the user's distinct keys from `ix_entries_exercise`, keep the matching ones in memory, and fetch the newest rows per key from the same index (design §11). Not a trigram index. | The benchmark in design §11. This is a gate, not an assumption. |
| U-4 | `@testcontainers/postgresql` 12 works with Docker Engine 29 / Compose v5 on this machine and in GitHub Actions. | Test strategy depends on it. | First integration test. |
| U-5 | NestJS 12's default template is still CommonJS-style output despite `@nestjs/core` being `"type": "module"` (Node 26 can `require()` ESM). | Affects Jest configuration. | `nest new` and run the generated tests. |
| U-6 | Reviewers will not run an automated checker that expects literal Epley at `reps = 1` or `userId` in the request body. | **No longer applies.** After round 1 both follow the literal reading: D-12 uses the brief's formula for every rep count, and D-17 accepts a body `userId` that matches the path. | Closed. |
| U-7 | `Temporal` can resolve IANA zone names (`Asia/Ho_Chi_Minh`) inside the `node:26-alpine` image. Believed true because Node's official builds bundle full ICU data, so the zone data would come from the Node binary and not from the operating system. | The `timeZone` field (D-09) fails at runtime in the container otherwise. | **No longer relied on after round 3:** the server resolves no zone. Only the daylight-saving bounds test does, and it runs on the test host, not in the image. |
| U-8 | Joining a realistic heavy user's entries to their sets (2 500–4 000 entries for the busiest exercise, six to ten sets each) answers a PR request in < 50 ms. Which join the planner picks is not assumed; the benchmark prints it. | D-06 and D-11 dropped the stored per-entry maxima on this expectation. | The benchmark in design §11. If it fails, the ladder is: a covering primary key on `workout_sets` (V-15) plus extended statistics; then the maxima as the `INCLUDE` payload of `ix_entries_exercise`; then per-metric indexes. |
| U-9 | What NestJS does out of the box with a body that is not JSON (form-encoded, plain text): whether the handler sees an empty object and answers with a misleading validation error. Nobody checked it in round 2. | The 415 for a non-JSON body (design §9.6) is written on the assumption that it must be added. | Send one form-encoded request in the logging slice, before the handler is written. |
| U-10 | Whether `nest build` copies non-TypeScript files — the JSON catalog seed and the SQL migrations — into its output, or leaves them out so that the built image starts without them. | A catalog seed that is missing from the image fails the `migrate` step; migrations that are missing leave an empty database. | The clean-image check in CI (design §12): build the image with no bind mount and start it against an empty database. From slice 3 it asserts that `api` is ready and the migrations are applied; from slice 6 it also reads one seeded exercise. The check exists so that this need not be known in advance. |
| U-11 | The benchmark data — roughly three million set rows — loads in under three minutes on a laptop with `COPY` or in-database generation. | A reviewer who runs the benchmark waits for it. | The first load. If it misses the budget the background users are reduced, never the heavy user. |
| U-12 | Running MongoDB as a single-node replica set in compose takes one flag and one init command. Recalled by a reviewer in round 2; not checked by anyone. | The design used to argue "a replica set complicates compose" against MongoDB and no longer does. Nothing is built on the claim. | Would be checked only if the MongoDB path were taken. |
| U-13 | `decimal.js` has a default precision of 20 significant digits and converts a JavaScript number through its text form. Recalled in round 3. | Exact ranking and conversion (D-08). | Not relied on: precision is set to 40 and the registry test asserts it, and weights are built from `String(n)` (design §6). |
| U-14 | Drizzle's migrator takes no lock of its own, so two `migrate` runs at once could race. Recalled in round 3. | Two deploys started together. | Not relied on: the `migrate` entry point takes a session advisory lock before the migrator runs (design §10.3). Confirmed while writing slice 3 (design §14). |
| U-15 | Where a TypeScript file outside `src/` lands in the build output, and whether the runtime image keeps the migration tool. Recalled in round 3. | The `migrate` step must run from the runtime image. | Not relied on: the entry point is `src/cli/migrate.ts`, compiled with the app, and uses the library's migrator, not `drizzle-kit`; the clean-image check runs it. The benchmark scripts are development tools, and the `bench` profile builds on the Dockerfile's build stage. |
| U-16 | Compose leaves an exited `api` container down unless it has a `restart:` policy. Recalled in round 3. | A failed first catalog load ends the process (D-07). | `api` has `restart: on-failure` (design §13); the clean-image check exercises the start. |
| U-17 | An unused import fails the lint step as the project configures it. Recalled in round 3. | Why the guard takes two lines (import and decorator), not one. | The first lint run with the guard's import commented in and the decorator commented out. |
| U-18 | What the validation pipe does with an array body, and that a pipe cannot see path parameters. Recalled in round 3. | The 400 for an array body and the body-`userId` rule (design §9.1). | The first-request test (design §12): an array body, and a body `userId` that differs from the path. |
| U-19 | NestJS finishes every `onModuleInit` before the HTTP server listens. Recalled in round 3. | The process must not answer before the first catalog load (D-07). | Confirmed in slice 6 (design §14), before the readiness test relies on it. |
| U-20 | Express decodes `%2F` inside one path parameter, so `/v1/exercises/90%2F90%20hip%20stretch` reaches the route with `90/90 hip stretch`. Recalled in round 3. | Exercise names with a slash (D-27, design §10.5). | The `90/90 Hip Stretch` integration test, in slice 12 (design §14). A proxy in front may decode or refuse it; the README says so. |
| U-21 | HTTP requires `WWW-Authenticate` on a 401. Recalled in round 3. | The guard's 401 (design §10.7). | Sent anyway, `WWW-Authenticate: Bearer`; the guard's unit test asserts it. |
| U-22 | Express 5's default query parser is `node:querystring`, and `qs` also turns `+` into a space. Recalled after round 3. | Whether a ranged curl with `+07:00` reaches the parser as a space (V-17 shows both built-in parsers do). | The `+` rule handles either; one ranged request with a `+` in the first-request integration test settles it. |
| U-23 | PostgreSQL rounds fractional seconds to the column's precision rather than cutting them, so `…:00.9996` stored in `timestamptz(3)` becomes `…:01.000`. Recalled after round 3. **Now checked (V-19): true**; halves round up. | A cursor built from a value the database rounded differently would skip or repeat a row. | The application cuts to the millisecond before every write, so the answer does not change the design; one integration assertion settles it. |
| U-24 | PostgreSQL's `timestamptz` starts at 4713 BC, while `Temporal` accepts years down to −271821 (V-17). Recalled after round 3. **Now checked (V-19): true**; the earliest value is `4714-11-24 00:00:00 BC`. | A far-past year would be a database error, a 500. | The 1900-01-01 floor, on writes and on read bounds since round 4, keeps every accepted value inside the range either way. |
| U-25 | A PostgreSQL `timestamp` (without time zone) silently drops an offset written in its input, so `2025-02-10T05:30:00+07:00` is stored as 05:30 with no place. Recalled after round 4. **Now checked (V-19): true**, whatever the session's zone. | Why `performed_at` is a `timestamptz` (design §8). | The column is `timestamptz`, so the answer does not change the design; a one-line `psql` check settles it. |
| U-26 | PostgreSQL refuses year `0000` and minus-sign years in ISO input (`22008`), while `Temporal` accepts them. Recalled by a reviewer in round 4. **Now checked (V-19): both are refused**, year `0000` with `22008` and a minus-sign year with `22007` (invalid syntax). | A far-past read bound would have been a 500. | The 1900 floor on read bounds makes it moot. |
| U-27 | Two catalog writes can deadlock. A PUT that keeps group G deletes the exercise's link to G and inserts it again; a delete of G that starts in between locks G, and its foreign-key check waits on the link row the PUT deleted; the PUT's insert then waits on G. A counter bumped by an `AFTER` trigger would add a second cycle (the exercise write holds the counter, the group delete holds G). Reasoned from recalled lock rules (a delete takes the strongest row lock; foreign-key checks take `FOR KEY SHARE`) and the order checked in V-20; not run, because PGlite has one connection, and the owner chose not to run a two-connection check. | A deadlock is a `40P01`, mapped nowhere: a 500. | Moot for v1: every catalog write takes one advisory lock first (design §10.5), so two never interleave. |
| U-28 | Seven framework details a plan reviewer recalled, none checked: that a root-level TypeScript file moves the build output to `dist/src/`; that a JavaScript array inside a Drizzle `sql` template becomes a parameter list, and that `db.execute` may return a `timestamptz` as text; that Jest's `--selectProjects` takes a following path as a project name; that helmet's default Content Security Policy can blank Swagger UI over plain HTTP; that Nest answers DELETE with 200 and parses bodies itself with a 100 kb limit; whether BusyBox `wget` accepts `-qO-`; and whether the compiled app can `require` the ESM-only `uuid` 14. The author added one while applying: that class-validator's `maxDecimalPlaces` reads `String(n)` and miscounts exponent notation. | Each would break a task as first written. | Not relied on: each is avoided or pinned by a test in the task that meets it (`07-implementation-plan.md`, Tasks 1–4, 10a, 13, 17a and 17b). |
| U-29 | Drizzle's `DrizzleQueryError` keeps the driver's error as `cause`, and does not copy its `code` to the top level. Recalled; the release notes say only that it wraps every driver error (V-23). | The 409 for a muscle group in use, the 400 for a group deleted mid-write and the 503 for a lost database all read the code; read from the wrong place, each is a 500. | `driverErrorCode` reads the code from the error or its `cause` (plan, Task 2), and the in-use test in Task 17b runs through Drizzle, so it settles the shape. |
| U-30 | A new session of the Claude desktop app loads `CLAUDE.md` into its subagents, as the CLI does (V-24). Tested on the CLI only. | The rules for every agent are in that file (D-25). | `CLAUDE.md` §3: before Task 0 the controller asks one subagent, with no tools, after which tasks the run stops. Every brief also begins with "Read `CLAUDE.md`…", so a failed load costs nothing. |
| U-31 | The Superpowers plugin stays at the version that was read (7.0.2) for the whole build. It is delivered by the desktop app, and how that copy updates was not found. | Its `subagent-driven-development` skill runs the plan; a new version could change the controller's instructions between sessions. | Note the version when the run starts and at each checkpoint. The two rules that must not move (decisions to the owner, the checkpoints) are in `CLAUDE.md`, which a skill does not override. |
