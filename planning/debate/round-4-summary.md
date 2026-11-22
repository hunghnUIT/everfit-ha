# Round 4 — summary: the time-model change

**Status: applied.** The owner chose to store the offset (4C-1 (a)) and to
accept a zone in brackets and ignore it (4B-1); every other item of section
8 is applied as recommended (`resolution.md` §22). The text below is the
round as it was argued, before anything was applied.

Three models reviewed only the time-model change made after round 3, with
the prompt in `round-4-prompt.md`, the old model as `BEFORE.md`, the whole
requirements and design, and the time-related parts of the decision log,
research notes and resolution. None had tools; every outside fact they gave
is a recollection unless the author checked it (section 6).

| Reviewer | How it ran | File |
|---|---|---|
| Claude Fable 5.2 | Claude CLI, high effort | `round-4-fable.md` |
| Gemini 4 Argon | GitHub Copilot CLI, high effort | `round-4-gemini.md` |
| Grok 4.7 | GitHub Copilot CLI, high effort (completed this time) | `round-4-grok.md` |

The estimate was out of scope and nobody commented on it.

## 1. Verdict

All three: **ready after the fixes listed.** All three keep the core of the
change — one UTC instant, half-open instant ranges, order on
`(performed_at, id)` — and say plainly that the traveller pair can no longer
share a day. All three also put the same thing first: **the offset the
client sends is parsed and then thrown away**, and they want it stored for
display. The owner declined that once; it comes back as the one owner's
call (4C-1) because all three raised it independently and because it cannot
be undone later.

The rest is a cluster of defects the author introduced while applying the
change, most of them visible to a grader on the first ranged request: the
README's own "noon" advice collides with the future bound, the `to` bound's
exclusivity is never told to the caller, the `+` repair is narrower than the
parser, the two error messages contradict each other, a table does not
render, and about a dozen sentences still describe the old model.

## 2. Rulings, side by side

| # | Item | Fable | Gemini | Grok | Outcome |
|---|---|---|---|---|---|
| 1 | Store only the UTC instant | Keep | Keep | Keep | **Kept** |
| 2 | One input format; a date alone is a 400 | Keep w/ mod. | Keep w/ mod. | Keep | **Kept**; the README advice and the message change (4A-1, 4A-4) |
| 3 | Half-open instant ranges, no zone parameter | Keep | Keep w/ mod. | Keep w/ mod. | **Kept**; tell the caller `to` is excluded, bound the read years (4A-2, 4A-6) |
| 4 | Order and indexes on `(performed_at, id)` | Keep | Keep | Keep | **Kept** |
| 5 | No settings table; no stored offset | Table keep; offset **change** | Offset **change** | Offset **change** | Table kept; **offset back to the owner (4C-1)** |
| 6 | now + 15 min; 1900-01-01 | Keep w/ mod. | Keep w/ mod. | Keep | **Kept**; restated honestly (4A-7, 4A-8) |
| 7 | `date` as the response field | Keep w/ mod. | Keep | Keep w/ mod. | **Kept**; the sample shows a morning write (4B-3) |
| a | A space read back as `+` | Keep w/ mod. | Keep w/ mod. | Keep w/ mod. | **Kept, widened** (4A-3) |
| b | A zone in brackets is a 400 | Keep w/ mod. | **Change** | **Change** | **Changed** — accepted (4B-1) |
| c | `from >= to` is a 400 | Keep | Keep w/ mod. | Keep | **Kept**, checked after rounding (4A-6) |
| d | One message for both refusals | **Change** | **Change** | **Change** | **Changed** — two messages (4A-4) |
| e | The daylight-saving bounds test | Recipe keep; test **change** | Recipe keep; test **change** | Keep | **Changed** — a boundary test instead (4B-2) |
| f | Two non-UTC test zones | Keep | Keep | Keep | **Kept** |

## 3. The owner's call: the offset

**What the reviewers say.** The client already sends the offset in `date`;
the server parses it and deletes it. Three things follow, each named by at
least two reviewers:

- A morning workout in Vietnam, `2025-02-10T05:30:00+07:00`, comes back as
  `"date": "2025-02-09T22:30:00.000Z"` — the previous day, in a field named
  `date`, in the first response a grader reads. The §9.1 sample (19:30)
  hides it. (All three.)
- An athlete who moves sees every old session on the neighbouring day, for
  good, because nothing can rebuild the offset (§8 says so). (All three.)
- A coach in another zone sees the client's Monday-morning session on
  Sunday (verified: 15:00 in winter, 16:00 in summer). (All three.)

**What the author model adds.** The owner's reason for not storing a zone —
"a stored zone would go stale exactly when the user travels" — is a reason
against a *settings table*. A per-entry offset records where the athlete
was at that moment and cannot go stale (Fable's point, and it is right).
Storing it changes no filter, sort, index or cursor; the traveller fix is
untouched. It is one nullable `smallint`, `NULL` for `Z` (RFC 9557 reads
`Z` as "offset unknown", K-18).

**What it does not fix.** It does not give a coach "the athlete's week" on
the server — filters stay on instants — and it is empty for every
JavaScript client that sends `toISOString()` (`Z`). It lets a client *show*
a workout at the athlete's local time and lets a later version build an
athlete-day view from history already logged.

## 4. Findings by topic

### 4.1 The README's advice for a missing time (all three)

The design tells a client that knows only the day to send noon in the
athlete's offset. Two problems, both verified:

- **It collides with the future bound.** Logging today's session at 09:30
  in Hanoi with noon `+07:00` is 150 minutes ahead of now → a 400 whose
  message blames a `Z` mistake the client did not make. Every morning, for
  every day-only client. *The author's own error: the two rules were
  written in the same section and never read together.*
- **"Within twelve hours" is true but hides the common pair.** Noon
  `+07:00` is 21:00 the previous day in Los Angeles; Vietnam and the US
  west coast are 14–15 hours apart, outside the twelve the sentence
  promises. Gemini called this a refutation; it is not — the sentence holds
  — but the pair the design itself uses as its example is outside it, so
  the README should say what noon does and does not keep.

→ 4A-1.

### 4.2 Read bounds a grader will get wrong (all three)

- A grader told "send the instant form" turns `to=2025-02-28` into
  `to=2025-02-28T00:00:00Z` and silently loses the last day. Nothing tells
  them `to` is excluded; the compare message even says "up to", which reads
  as inclusive.
- The §9.2 and §9.4 examples are UTC months, while §8 says periods are cut
  in the viewer's zone. A Hanoi grader copying them puts the 1st's morning
  session in the previous month.
- Read bounds have no year limits. `Temporal` accepts year `0000` and
  `-000500` (verified); whether PostgreSQL then fails with an error is
  recalled, not checked here (no database in this session; checked
  afterwards, V-19: it does). Either way a
  1900 floor on reads costs nothing.
- A bound with sub-millisecond digits is cut down to the millisecond, which
  can exclude a row that is inside the range (verified: a row at `.123`
  against `to=.123456`). Rounding **both** bounds **up** to the next
  millisecond gives exactly `from <= r < to` for stored millisecond values
  (verified on three cases). `from >= to` is then checked after rounding.

→ 4A-2, 4A-6, 4B-3.

### 4.3 The `+` repair (all three)

The pattern requires an upper-case `T` and an `hh:mm` offset, so the forms
§8 promises to accept — `+07`, `+0700`, lower-case `t`, a space for `T` —
are still a 400 when their `+` arrives as a space (verified). Grok adds two
implementation points: the repair must run on the parsed query before
validation, and U-22 promises an integration request with an unencoded
`+07:00` that the §12 list never contains.

→ 4A-3.

### 4.4 Error messages (all three)

§8 says a date-time with no offset "gets the same message", whose text
says the input "has no time or UTC offset"; §9.6 shows a different, correct
text ("has no UTC offset"). An offset-less date-time *has* a time. Fable
adds that "or with `Z`" invites a sender to put `Z` after a local time —
exactly the mistake the future bound is meant to catch.

→ 4A-4.

### 4.5 Brackets (two of three want them accepted)

`Temporal.ZonedDateTime.prototype.toString()` and `toJSON()` print a zone in
brackets by default (verified: `2025-03-09T00:00:00-08:00[America/Los_Angeles]`),
and so does Java's `ZonedDateTime.toString()` (recalled). The design
recommends `ZonedDateTime` for computing bounds and then refuses its output.

Three proposals: keep the 400 with a better message (Fable); parse with
`ZonedDateTime.from(…, { offset: 'reject' })` so a matching zone passes and
a contradicting one is a 400 (Gemini; verified that it behaves so); accept
and use the offset (Grok). The author takes Grok's: `Temporal.Instant.from`
already reads such a string by its offset and ignores the bracket
(V-17), so accepting needs no code and no zone data on the server.
Gemini's version would bring IANA zone resolution back into the server and
U-7 with it, to catch a contradiction no real client produces. The README
recipe still ends with `.toInstant().toString()`, which prints `Z` with no
`+` and no brackets.

→ 4B-1.

### 4.6 The daylight-saving test (two of three)

The integration test computes Los Angeles weeks with `ZonedDateTime.add`
inside the test file; the server only compares two instants. Fable and
Gemini: it tests `Temporal`, not this code — the standard §9.4 applies when
it declines a two-connection test. What the server does own and nobody
tests is the exact boundary. Grok keeps the test. The author agrees with
the two: keep the recipe in the README, replace the test with entries at
`from − 1 ms`, `from`, `to − 1 ms` and `to` across two adjacent periods,
each appearing in exactly one, on history, PRs and compare.

→ 4B-2.

### 4.7 Same-instant entries are the normal case (Fable, Grok)

A session of 5–12 exercises is usually logged once with one time, so
history lists most sessions last exercise first and a page can split a
session. The order itself stays — a mixed-direction keyset would lose the
row-value comparison — but the README says so, and the benchmark data
groups entries into sessions that share one instant rather than "a few
percent".

→ 4B-4.

### 4.8 Statements that overclaim

- **The future bound.** §8 says it catches a local time sent with `Z` east
  of UTC. It catches it only when the entry is logged within about the
  offset's hours of the workout: a Vietnam 20:00 session sent as `20:00Z`
  at 21:00 local is 6 hours ahead and refused, but logged the next evening
  it is 18 hours in the past and accepted (verified). (Fable.)
- **The 1900 floor.** D-18 says it stops "a year typed short (`0225`) and
  dates PostgreSQL cannot store", as if year 225 were outside PostgreSQL. It
  is not; the database range starts at 4713 BC (U-24). The floor is a typo
  guard that also keeps far-past values away from the database. (Grok.)
- **§7 "always compares real moments"** contradicts §8's "a time the client
  invented cannot be told from a real one". (Grok.)
- **"RFC 3339 … one format only"** while §8 also accepts `+07`, `+0700` and
  the compact form, which are ISO 8601 but not RFC 3339 (recalled by
  Fable and Gemini). The documents should say "RFC 3339; some ISO 8601
  variants are tolerated".
- **Why values are cut before writing.** §8 says a cursor built from a
  different value would skip a row; cursors are built from the stored row,
  so that cannot happen. The real reasons: the 201 body matches the stored
  row, and a filter compares like with like. (Gemini.)
- **D-22 "no `Date` at local midnight"** describes the `date`-column bug
  that no longer exists; the zones now guard app-side parsing of offset-less
  text and session-zone casts. (Gemini.)
- "A 06:00 Monday session in Hanoi is Sunday 15:00 in Los Angeles" is
  winter only; 16:00 in summer (verified). (Fable.)

→ 4A-7, 4A-8, 4A-9.

### 4.9 "Days are the viewer's" (Fable, Grok)

Nothing in the API forces the viewer's zone: the caller chooses the zone
in which a period is cut. For a coach's view of a client the natural choice
is the client's zone — which no caller can know under T4 without a profile.
The documents present the coach-sees-Sunday result as inherent; it is a
consequence of having no athlete zone in v1. Text only.

→ 4B-5.

### 4.10 Leftovers (all three; each checked against the files)

- §6: "(§7 — the earliest date keeps the record)".
- §8: "A **timed** instant later than now + 15 minutes" — there are no
  untimed entries.
- §8 input table: three header cells over a four-column separator — it does
  not render.
- §9.1: the cross-field rules include "the date rules" — the date rule is a
  single-field rule now.
- §12 intro: "a date that passes through any of them".
- §12 Metrics: "ties → earliest date, then lowest set number".
- §12 Dates: "`.123Z` and `.123456` are accepted" — `.123456` without an
  offset is a 400.
- §12 paging walk: "on the same days".
- Design status line: does not mention the time-model change.
- D-09 after-round-3 line: "the two input shapes".
- D-22: "no `Date` at local midnight".
- Requirements §9 intro: does not say A1 and A6 changed after round 3.
- Overlapping compare periods are accepted and unstated.

→ 4A-5.

## 5. Things no reviewer contested

Instant-only storage and the traveller fix; half-open ranges partitioning
periods exactly; the keyset and both indexes; the two-step history query
and the benchmark plan; bulk order against history order (stated and
tested); millisecond storage; the non-UTC test zones; the offline phone
case being better than before; refusing a date alone (all three keep the
400, Fable and Grok with a better message).

## 6. What the author checked by running it (Node 26.12)

| Claim | Reviewer | Result |
|---|---|---|
| `ZonedDateTime.toString()` / `toJSON()` print `[zone]` | Gemini, Fable, Grok | True |
| `ZonedDateTime.from(…, { offset: 'reject' })` passes a matching zone, throws on a contradicting one | Gemini | True |
| `Instant.from` accepts year `0000`, `-000500`, and `[u-ca=iso8601]` | Gemini | True |
| Noon `+07:00` logged at 09:30 Hanoi is in the future | Fable, Gemini | True, by 150 minutes |
| Noon `+07:00` is the previous evening in Los Angeles | Gemini, Grok | True, 21:00 |
| Hanoi Monday 06:00 is Sunday 15:00 in Los Angeles only in winter | Fable | True; 16:00 in July |
| The `+` pattern misses `+07`, `+0700`, `t`, a space for `T` | all three | True |
| A local time sent as `Z` is caught only if logged soon | Fable | True: +6 h refused, −18 h next day accepted |
| Cutting `to` down excludes a row inside the range; rounding both bounds up is exact | Gemini, Grok | True |
| The §8 table does not render | Fable | True |
| PostgreSQL rejects year `0000` with `22008` | Gemini | **Not checked** (no database here); the read floor makes it moot. *Checked afterwards (V-19): true* |

## 7. Reviewer mistakes

- Gemini: "within twelve hours" is not refuted by the Hanoi–Los Angeles
  pair; that pair is outside twelve hours. The concern behind it is real.
- Gemini: "an offline app fails if the athlete pre-logs a session 30
  minutes before it starts" — logging a workout not yet done is not the
  use the API serves; the bound is right to refuse it.
- Grok: the traveller seeing Feb 11 after flying home is the viewer-zone
  rule the owner chose, not a new defect; it belongs under 4C-1.
- Gemini: D-14's round-3 line about date-only entries is a history line,
  not a leftover.

## 8. The list

### 4A — corrections

| # | Change | Where |
|---|---|---|
| 4A-1 | The README advice for a missing time: noon in the athlete's offset for a past day, **the current time for today if noon has not come yet**; it keeps the athlete's own day, and a viewer more than twelve hours away (Vietnam and the US west coast) still sees a neighbouring day | §8, D-09, README items |
| 4A-2 | Tell the caller `to` is excluded: in the OpenAPI text, in the 400 for a date-alone bound ("to include all of 2025-02-28, send the start of the next day"), and in the compare message ("from … (included) to … (excluded)") | §8, §9.2, §9.4 |
| 4A-3 | Widen the `+` repair to every offset form `Temporal` accepts after a time (`hh`, `hhmm`, `hh:mm`; `T`, `t` or a space), run it on the parsed query before validation, and add the unencoded `+07:00` ranged request to the first-request integration test | §8, §12, U-22 |
| 4A-4 | Two messages: a date alone "has no time or UTC offset"; a date-time with no offset "has no UTC offset". Both say "add the time and your UTC offset, e.g. 2025-02-10T09:00:00+07:00; `Z` means UTC, not local time" | §8, §9.6, §12, D-19 |
| 4A-5 | Fix the leftovers of section 4.10 | §6, §8, §9.1, §12, status line, D-09, D-22, requirements §9 |
| 4A-6 | Read bounds: the same 1900 floor as writes (as the instant `1900-01-01T00:00:00Z`); both bounds rounded **up** to the millisecond; `from >= to` checked after rounding; overlapping compare periods stated as allowed | §8, §9.4, D-13, D-18 |
| 4A-7 | Restate what the future bound catches: a local time sent with `Z` east of UTC, when logged within a few hours of the workout | §8, D-18 |
| 4A-8 | Restate the 1900 floor: a typo guard that also keeps far-past values away from the database — not "dates PostgreSQL cannot store" | §8, D-18 |
| 4A-9 | Smaller wording: §7 "real moments" goes; "RFC 3339; some ISO 8601 variants are tolerated"; the real reason values are cut before writing; D-22's guard described correctly; "Sunday 15:00 (16:00 in summer)" | §7, §8, D-22, V-17 |

### 4B — recommended changes

| # | Change | Where |
|---|---|---|
| 4B-1 | Accept a zone in brackets: the offset decides the instant and the bracket is ignored, as `Temporal.Instant.from` already does. The README recipe ends with `.toInstant().toString()` | §8, §12, D-09 |
| 4B-2 | Replace the daylight-saving integration test with a boundary test: entries at `from − 1 ms`, `from`, `to − 1 ms`, `to` across two adjacent periods, each in exactly one, on history, PRs and compare. The recipe stays in the README | §8, §12, D-22 |
| 4B-3 | Examples: the §9.1 sample is a morning `+07:00` write whose `date` is the previous UTC day, with one line in OpenAPI that the first ten characters are not a local date; one §9.2 or §9.4 example uses Hanoi bounds written as `Z` (`from=2025-01-31T17:00:00Z&to=2025-02-28T17:00:00Z`) | §9.1, §9.2, §9.4 |
| 4B-4 | Same-instant sessions: a README line on history order within one time; benchmark data grouped into sessions sharing one instant | §8, §11 |
| 4B-5 | Text: the caller chooses the zone a period is cut in; for a coach's view of a client that is normally the client's zone, which needs a profile and is out of scope under T4 | §8, D-09, A6 |

### 4C — the owner's call

| # | Question | Options |
|---|---|---|
| 4C-1 | Store the offset the client sends, for display only? | **(a)** Store it: `utc_offset_minutes smallint NULL` (`NULL` for `Z` and `-00:00`), returned as `utcOffset: "+07:00" \| null` beside `date`; no filter, sort, index or cursor changes; the README's next step becomes an athlete-day view built on it. **(b)** Keep it discarded, as decided; add the morning sample (4B-3) and one README sentence on what a client cannot show. All three reviewers and the author model recommend (a): it is the one loss in this change that cannot be repaired later. |

### 4D — not followed

- Gemini's `ZonedDateTime.from(…, { offset: 'reject' })` for brackets: it
  brings zone resolution back into the server to catch a contradiction no
  real client sends (4B-1 instead).
- Gemini's upper limit of year 9999 on read bounds: `to` far in the future
  is harmless and the brief has no use for it.
- Making the history order put a session in sent order (a mixed-direction
  keyset): it loses the row-value comparison for a display detail the
  client can fix (4B-4 instead).

### 4F — the author's calls while reading the reviews

- 4B-1 takes Grok's version of the bracket change over Gemini's.
- 4B-2 sides with Fable and Gemini against Grok on the daylight-saving test.
- Rounding both read bounds up to the millisecond (4A-6) is the author's
  rule for Gemini's and Grok's finding; it was checked on three cases.
