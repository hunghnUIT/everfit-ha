# Round 2 — Summary of external reviews, with the author's comments

Three models reviewed the design as revised after round 1, using
`04-debate-brief.md` unchanged and the same material. Their full replies are
next to this file. This file lays their rulings side by side, groups their
findings by topic, tests each finding against real use, and says what I
(Claude, the design's author) would change, what I would not, and what is the
candidate's to decide.

**Status: nothing in `02-design.md`, `03-decision-log.md` or `resolution.md`
has been changed by this round.** Section 9 is the list waiting for the
candidate.

The test applied to every finding is the one the candidate set after round 1:
*who sends this, how often, and what do they see?* A finding that is correct
arithmetic about an input nobody produces is not accepted.

## 1. Who reviewed, and how

| Reviewer | File | How it ran | What it could verify |
|---|---|---|---|
| Gemini 3.8 Flash (High) | `round-2-gemini.md` | Antigravity CLI, read the files from the folder, no web access | Nothing: all five of its re-checks are recalled |
| Claude Opus 5.5 | `round-2-opus.md` | GitHub Copilot CLI, high reasoning effort, web lookups | Two claims verified against sources and one in part; the rest marked recalled or judgment |
| GPT-6.2 Astra | `round-2-gpt-astra.md` | GitHub Copilot CLI, high reasoning effort, web access | Mechanics verified against sources; every timing marked unverified |

Each received the brief, files 01, 02, 03 and 05, `resolution.md`, and the
round-1 reviews by Grok, Gemini, Opus and GPT-6.2 Astra.

Not in this round: **Grok** (its CLI account had no credits left when the
round was run) and **GPT-OSS 120B** (none of its round-1 findings survived a
check against the documents, so it was not asked again).

What became of each reviewer's numbered objections:

| Reviewer | Objections | Followed | Followed in part or held for a fallback | Candidate's call | Not followed |
|---|---|---|---|---|---|
| Gemini | 8 | 1 | 1 | 1 | 5 |
| Opus | 10 | 8 | 1 | 1 | 0 |
| Astra | 6 | 3 | 2 (O-3: the corrections are taken, the snapshot is the candidate's call; O-6 applies only if the key is built) | 1 (O-1, recommended) | 0 |

## 2. Verdicts, and what the round comes to

| Reviewer | Verdict | The three changes it puts first |
|---|---|---|
| Gemini | "nearly ready to build" | Build the cursor from the stored ordering value, not the public `null`; bind cursors to a filter hash; reorder the cut list |
| Opus | "The design is ready to build." | Aim the history fallback at the case that is actually slow; keep the one test the PR design depends on off the cut list; close the gaps in a reviewer's first request |
| Astra | "Not ready to build exactly as written." | Keep true PR ties intact; stop promising one order for both the bulk response and history; make compare return one coherent result |

All three concede the main shape: PostgreSQL, two tables, PRs computed on
read, keyset paging, the literal Epley formula, an optional `timeZone`, an
optional idempotency key.

What the round comes to:

- **One real defect in a decided item.** Rounding kilograms to four decimals
  breaks true ties between ordinary pound sets, so a tied record can be
  credited to the later workout (5.1). Two reviewers ruled the opposite; the
  arithmetic and a survey of real loads side with the third.
- **Mistakes the revision itself introduced:** an order promise that
  contradicts the sort key, a column nothing reads, a response outside the
  agreed envelope, an error message naming the wrong thing (5.2, 5.7, 5.12).
- **A fallback aimed at the wrong case**, found independently by two
  reviewers (5.5), and **a cut list that removes the test a decision rests
  on** (5.6).
- **Builder traps** the design text does not guard against: the paging
  cursor, the time parser, files missing from the Docker image, an
  ESM-only package under Jest (5.3, 5.4, 5.9).
- About three hours of additions if everything recommended is taken (9.E).

## 3. Rulings on the twelve contested decisions

| # | Decision | Gemini | Opus | Astra | Where they differ, and my position |
|---|---|---|---|---|---|
| 1 | D-03 PostgreSQL | Keep · High | Keep · High | Keep · High | Unanimous. Opus: stop arguing that a replica set complicates compose; show the MongoDB document, index and pipeline instead. Taken (A-10). |
| 2 | D-06 · D-11 two tables, PRs on read | Keep · High | Modify · Medium | Keep · High | Opus wants `INCLUDE (reps, weight_kg)` on the sets primary key now. Astra: one probe per entry is "a possible nested-loop plan, not a property of the schema". Measure first; the index becomes the first fallback rung (5.6). |
| 3 | D-09 instant + local date, optional zone | Keep · High | Keep · Medium | Modify · High | The shape stands. Opus moves the date-only ordering value; Astra corrects a claim about daylight-saving times. Both taken (5.3, 5.4). |
| 4 | D-12 literal Epley | Keep · High | Keep · High | Keep · High | Unanimous. Astra: call the number an estimate wherever it is shown (A-11). |
| 5 | D-15 append-only, optional key · D-16 partial match | Keep · High | D-15 Keep · High; D-16 Modify · Medium | Modify · High | D-15 unanimous. D-16: Opus and Astra both show the planned fallback helps the wrong case (5.5). |
| 6 | D-04 Drizzle, SQL migrations by hand | Keep with modification · Medium | Keep · Medium | Keep · Medium | No change. Gemini: the integration tests on a real database are what catches typing drift. |
| 7 | D-07 catalog from a JSON file | Keep · High | Keep · High | Keep · High | Unanimous. Astra adds that the file must actually reach the image (5.9). |
| 8 | D-14 separate atomic `/bulk` | Keep · High | Keep · High | Modify · High | Astra's modification is the contradictory order promise (5.2). Opus: answer a bare array clearly (5.8). |
| 9 | D-17 `userId` in the path | Keep · High | Modify · Medium | Keep · High | Opus lists what still fails a first request written from the brief (5.8). |
| 10 | D-05 · D-22 class-validator, Jest, real PostgreSQL | Keep · High | Keep · High | Keep · High | Unanimous. Opus: put the database in a non-UTC zone as well. Astra: run one real HTTP test early (5.9). |
| 11 | D-08 · D-24 `decimal.js`, `numeric(10,4)` | Keep · High | Keep · High | **Modify · High** | The round's one substantive split. Astra is right (5.1). |
| 12 | D-26 estimate and cut list | Modify · Medium | Modify · Medium | Modify · Medium | All three change the cut order, each differently; Opus puts the total at 17–19 h (5.11). |

## 4. The author's four calls

Calls I made while applying round 1 that nobody had reviewed (resolution §7).

| # | Call | Gemini | Opus | Astra | Position |
|---|---|---|---|---|---|
| 1 | `time_known` flag with a non-null ordering key | Keep | Modify: the ordering value for a date-only entry should be the date at midnight UTC minus 14 hours | Keep: "Encode the **stored** `at` in the cursor, never the public `performedAt: null`. Test both at page size one." | Keep the shape, take both points (5.3) |
| 2 | `uuid` package `v7()` for ids | Keep | Keep with a check: import it in a Jest test in the first slice | Keep; it "does not turn descending ID order into input order" | Keep, with the first-slice check (5.9) and the order correction (5.2) |
| 3 | `Temporal` for zone conversion | Keep with modification: verify zone data on Alpine | Keep; write down which parser handles which input shape | Modify: reject wall times that fall in a daylight-saving gap or overlap | Keep; take Opus's point, not Astra's (5.4) |
| 4 | Aliases `lbs`, `kgs` | Keep with modification: add `pound`, `pounds`, `kilo`, `kilograms` | Keep: "I know of no client that sends" full words | Keep; document input as a free string and output as an enum | Keep the list; take the documentation point (5.12) |

## 5. Findings by topic

Each topic gives who raised it, what it is, the real-use test, and my
position. Codes such as A-1 or B-4 point to the list in section 9.

### 5.1 Weight precision: a true tie between two pound sets is broken by rounding

- **Raised by:** Astra O-1 (Blocker). Gemini and Opus rule the opposite.
  Gemini: four decimals are "completely preventing ranking errors on
  real-world inputs". Opus: "I cannot name a load a lifter would enter for
  which four decimals gives a wrong answer."
- **The finding:** `weight_kg` is rounded to four decimals when stored, and
  records are ranked on the stored value. Two pound sets with exactly the
  same volume then get different scores. `100 lb × 10` is stored as
  45.3592 kg, volume 453.5920; `200 lb × 5` is stored as 90.7185 kg, volume
  453.5925. Both are 1 000 lb. If the 100 × 10 set came first, the later set
  takes the record — against the design's own rule in §7: "A later lift that
  merely equals the record does not move the date."
- **Checked:** the arithmetic holds exactly. I then counted, over every load
  from 45 to 500 lb and 1 to 15 reps, the pairs of sets with different loads
  whose true scores are equal, and how many of those the four-decimal value
  pulls apart:

  | Load step | Record | Pairs that truly tie | Tie broken at four decimals |
  |---|---|---|---|
  | 5 lb | best volume | 1 391 | 1 074 (77 %) |
  | 5 lb | estimated 1RM | 424 | 405 (96 %) |
  | 2.5 lb | best volume | 2 745 | 2 081 (76 %) |
  | 2.5 lb | estimated 1RM | 871 | 824 (95 %) |

  Ordinary examples: `135 × 10` and `225 × 6` (1 350 lb each);
  `225 × 8`, `200 × 9`, `180 × 10` and `150 × 12` (1 800 lb each, stored as
  four different scores: 816.4664, 816.4665, 816.4660, 816.4668);
  `200 × 5` and `175 × 10` (the same estimated 1RM, 233.33 lb). Kilogram
  entries are not affected: a kilogram weight with up to three decimals is
  stored exactly.
- **Real use:** *Who:* a lifter who logs in pounds and reaches the same
  volume, or the same estimated 1RM, with a different load and rep count —
  225 × 8 one month, 200 × 9 another. *How often:* only when the tie is at
  the record, so not daily; my estimate is a few times across the exercises
  of a long pound log, more on pin-loaded machines where the same loads
  repeat. Nobody measured this. *What they see:* the right value with the
  wrong date and entry behind it. Which set rounds higher is arbitrary, so
  the later workout takes the record in about half of the broken ties.
  Nothing fails and no number shown is wrong.
- **Severity:** Major rather than Blocker. Nothing stops the build. But it is
  a wrong answer to "when did I set this record", produced by loads people
  enter every day, and it contradicts a rule the design states.
- **Why round 1 missed it:** the round-1 form of this finding argued for
  eleven decimals with a load nobody enters (`88.185 lb`), and the candidate
  rejected it for that reason, correctly. The re-check that followed asked
  how far apart two sets must be before rounding puts them in the wrong
  order, and found the gap far below any plate. It never asked whether sets
  that are exactly equal stay equal. Astra, who wrote the round-1 example:
  "the candidate was right to reject a contrived converted load. The
  conclusion does not survive two ordinary pound sets with equal volume."
- **The design's reason for rounding does not hold either.** §6 says more
  decimals "would announce a new record to someone repeating 40 kg and
  logging it in pounds." 40 kg is 88.1849 lb, which nobody enters. An app
  that shows pounds to one decimal sends `88.2 lb`, which is 40.0068 kg and
  already beats 40 kg at four decimals. Rounding protects no real entry.
  Among all loads on a 0.25-lb grid up to 1 000 lb, three land within 0.05 g
  of a load on the 0.125-kg grid (83.5, 810.75 and 894.25 lb), each a
  different nominal load from its neighbour.
- **Position:** store the exact product — `weight_kg = weight × kgPerUnit`
  with no rounding on write, in `numeric(17,11)`. Three input decimals plus
  eight in the conversion factor make eleven, so the product is exact for
  every registered unit; the registry test asserts that no factor has more
  than eight decimals. The ranking SQL does not change: it already orders by
  exact products (§9.3). Rounding stays where values are displayed. Two fixed
  tests assert that the **earlier** entry keeps the record: `100 lb × 10`
  then `200 lb × 5` for volume, `200 lb × 5` then `175 lb × 10` for estimated
  1RM. Side effect: the "known display limit" in §6 (`6 lb × 50` shows
  300.01) goes away. +0.25 h. This reopens resolution §4 item 3, so it is the
  candidate's to confirm → **C-1**.

### 5.2 Order of entries: the bulk response and history cannot both be "request order"

- **Raised by:** Astra O-2 (Major), Opus (technical errors).
- **The finding:** §8 says ids are generated in input order "so entries
  logged in one request keep the order of the request, and date-only entries
  of the same day come back newest-logged first." History sorts by id
  descending, so the second clause is true and the first is not: a request
  that logs squat then row reads back as row, squat. §12 plans a test that
  "two date-only entries of one request page in that order" — a test that
  would either fail or be written to assert the reverse under the wrong name.
- **Real use:** *Who:* anyone who logs a session through `/bulk` and then
  opens history — the brief's own flow. *How often:* every time. *What they
  see:* the day's exercises newest first, which is consistent with the rest
  of the list. The behaviour is defensible; the document promises something
  else.
- **Position:** correct the text, keep the behaviour. The bulk **response**
  lists entries in the order sent; **history** lists same-day date-only
  entries newest id first. The test asserts the POST order, then walks two
  GET pages of size one and checks the reverse order and that each id still
  carries its own sets. Sorting a day ascending inside a descending list was
  considered and dropped: it breaks the single row comparison keyset paging
  relies on. +0.15 h → **A-1**.

### 5.3 Date-only entries: what the cursor carries, and where they sort

- **Raised by:** Gemini O-1 (Blocker), Astra (call 1), Opus O-5 (Minor).
- **Finding 1 — the cursor.** A date-only entry returns `performedAt: null`
  but has a non-null stored ordering value. If the cursor is built from the
  response object, `null` goes into the row comparison, the comparison is
  unknown for every row, and the next page is empty with no error.
  *Who:* any user with a date-only entry at a page boundary — the brief's
  own example entry is date-only. *How often:* always, if it is built that
  way. *What they see:* history that silently stops. The design does not say
  it is built that way, so this is a trap for the builder rather than a
  blocker in the design; one sentence and one test close it.
- **Finding 2 — the position within a day.** The stored ordering value for a
  date-only entry is midnight UTC of its date. Among timed entries of the
  same day that puts it in a place that depends on the user's zone: for a
  user at UTC+7 it sits between workouts before and after 07:00 local time;
  at UTC−8 below all of them; at UTC+13 near the top. *Who:* a user, or a
  grader, with a date-only and a timed entry on the same day. *How often:*
  uncommon for one client, which usually sends one shape; plausible for a
  grader trying both shapes, and the graders are at UTC+7. *What they see:*
  an entry in the middle of the day for no reason they can find.
- **Position:** take both. The cursor codec reads the stored row, never the
  response object, and an integration test pages through mixed timed and
  date-only entries at page size one (≤ 0.25 h → **B-2**). The ordering value
  becomes the date at midnight UTC minus 14 hours — the earliest instant at
  which that date exists anywhere — so a date-only entry always sorts after
  the timed entries of its day; §8's "arbitrary but stable rule" becomes a
  stated rule with a README line (+0.1 h → **B-4**).

### 5.4 Time parsing

- **Raised by:** Opus O-6 (Minor), Astra (D-09 ruling and call 3).
- **Finding 1 — an offset silently dropped.** `Temporal.PlainDateTime.from`
  accepts a string with an offset and discards the offset. A parser that
  sends every input through it when a `timeZone` is present would store
  `2025-02-10T19:30:00-08:00` with `timeZone: Asia/Ho_Chi_Minh` as 19:30 in
  Vietnam, fifteen hours from the instant the client sent. I ran this on
  Node 26: the offset is dropped; a `Z` string throws; the correct path
  (`Instant.from(…).toZonedDateTimeISO(zone)`) gives 10:30 the next day at
  +07:00. *Who:* a mobile client that always attaches both an offset time
  and the device zone, with a user who is travelling, or a server-side
  import. *How often:* every such request, if built that way. *What they
  see:* a workout on the wrong day, with no error.
- **Finding 2 — fractional seconds.** `.123Z` and `.123456` must be accepted;
  Python's `isoformat()` emits microseconds. Node 26 accepts both.
- **Finding 3 — daylight-saving gaps and overlaps.** Astra would reject an
  offset-less wall time that does not exist or occurs twice. *Who:* someone
  logging at 01:30 on the night clocks go back, from a client that sends no
  offset. *How often:* two hours a year. *What they would see with a
  rejection:* a 400 for a workout that happened, and no way to log it
  without learning to send an offset. With the default they get the earlier
  of the two occurrences, at most one hour off and on the right date.
- **Position:** §8 gets a table of input shapes: an offset or `Z` goes
  through `Instant`, then to the zone for the local date; only an
  offset-less time goes through `PlainDateTime`, and then a zone is
  required. Tests: `-08:00` with an Asian zone, `.123Z`, `.123456`
  (+0.15 h → **B-3**). The default resolution for gaps and overlaps stays,
  and §8 says what it is instead of implying zone plus wall time always
  names one instant (→ **A-8**). The 400 for an offset-less time without a
  zone currently says the *day* is ambiguous; it is the *instant* that is
  unknown (→ **A-4**).

### 5.5 History with a partial name or muscle group: the fallback covers the wrong case

- **Raised by:** Opus O-1 (Major), Astra O-4 (Major), independently.
- **The finding:** if the partial-match scan misses its budget, the design
  falls back to a `user_exercises` table that resolves the term to keys
  first. That makes a term matching *nothing* return at once. It does not
  help the case that walks just as far: a term or group that matches a key
  the user rarely logs. Opus: "a coach types 'farmer' for a client who did
  farmer's walks 20 times in 10 years" — the scan reads the whole index to
  fill one page.
- **Real use:** *Who:* a coach reviewing accessory work for a long-standing
  client (forearms, calves). *How often:* routine for a coach, but only a
  user with tens of thousands of entries makes it measurable. *What they
  see:* probably nothing — Opus estimates 10–20 ms warm for the full walk,
  inside the 100 ms budget, and marks that as judgment.
- **Position:** nothing to build now; the *fallback text* changes. If the
  budget is missed: list the user's distinct exercise keys with a loose scan
  of the existing `(user_id, exercise_key, …)` index (about 150 probes for
  the heavy user), filter them in memory by the term or the catalog group,
  then take the newest `limit + 1` rows per matching key and merge. Work is
  bounded by matching keys × page size, it uses the index that already
  exists, and it needs no new table or write path. The benchmark already
  measures both cases (§11); it reports them as separate lines. §5's remark
  that this index "exists for PRs only" is reworded. 0 h now, about 1 h if
  triggered, against 1.5 h for the table → **B-11**, **A-9**.

### 5.6 The PR query: the test that guards it, and the index under it

- **Raised by:** Opus O-2 (Major), O-4 (Minor); Astra and Gemini on the plan.
- **Finding 1 — the cut list removes the guard.** PRs are computed in SQL and
  specified by a TypeScript `rank()` function; the only test that the two
  agree is among the property-based tests, second on the cut list. *Who:*
  the candidate at hour sixteen. *What happens:* the central design choice
  ships with nothing proving the SQL ranks like the specification.
  Astra adds the limit of such a test: it "can pass because both rank the
  same rounded inputs", which is why 5.1 needs its own fixture.
- **Finding 2 — the set side of the join reads the table.** Opus proposes
  `INCLUDE (reps, weight_kg)` on the sets primary key and extended
  statistics on `(user_id, exercise_key)`, so the join is index-only and the
  planner's row estimate is right. The index would then repeat most of every
  set row and is written on every insert.
- **Finding 3 — memory.** Gemini and Opus: the single-exercise user's 200 000
  rows exceed the default sort memory and spill to disk. Gemini would raise
  the setting inside the benchmark.
- **Position:** (1) a fixed, example-based ranking test in the PR slice that
  is never cut: `100 kg × 1` against `96 kg × 2`, equal scores on two dates,
  a kilogram set against a pound set, a zero-weight set; SQL and `rank()`
  must return the same entry and set for all three records (+0.25 h →
  **B-1**). (2) Not added up front, in line with "measure first": the
  benchmark reports the join type, loops and heap fetches on the set side,
  and the index plus statistics become the first rung of the PR fallback
  ladder, ahead of stored maxima (0 h → **B-13**). (3) The benchmark reports
  temporary-file use; raising the setting inside the harness would hide what
  the benchmark is there to show (→ **B-12**). §9.3's "one pass … three
  top-1 picks" is reworded: the join is evaluated once and each pick reads
  the materialised result (→ **A-6**).

### 5.7 PR comparison

- **Raised by:** Astra O-3 (Major), Gemini O-5 (Minor) and its missed
  requirements.
- **Finding 1 — the envelope.** §9.4 returns `{ current, previous, delta }`
  at the top level; §9.6 says every success body is `{ data, page?, message? }`.
- **Finding 2 — an empty period.** The design returns `null` deltas when a
  side has no record but says nothing in words. *Who:* a grader comparing
  against a month before any data, which the brief's "no data" edge case
  invites. *What they see:* nulls without an explanation.
- **Finding 3 — units.** State that the absolute delta is in the requested
  unit and the percentage has none.
- **Finding 4 — one snapshot.** Gemini and Astra want both periods read in
  one `REPEATABLE READ` read-only transaction; Astra adds a two-connection
  test. Round 1 withdrew this as unrealistic. Astra's sender: an offline
  sync whose batch spans a month boundary and commits between the two reads.
  *How often:* the window is the few milliseconds between two queries of one
  request. *What they see:* one comparison whose "previous" side includes
  entries its "current" side does not; a refresh corrects it. As a defect it
  still fails the realism test. As code it is about three lines.
- **Position:** findings 1–3 are corrections: the response moves inside
  `data`, `message` names the empty period or periods, populated records are
  still returned, deltas are `null`, and the unit rule is stated; one
  fixture with one empty side (+0.2 h → **A-3**). Finding 4 is the
  candidate's call → **C-3**.

### 5.8 A reviewer's first request, written from the brief

- **Raised by:** Opus O-3 (Major), O-10 (Minor), its missed requirements;
  Astra and Gemini on validation and the README.
- **Finding 1 — no content type.** `curl -d '{…}'` without a header is sent
  as form data; with the framework's default parsers the body arrives as one
  odd property and the validator answers that a property named like the
  whole JSON text "should not exist". *Who:* a grader typing the brief's
  example into a terminal. *How often:* a common first-minute mistake.
  *What they see:* an error that explains nothing. The framework behaviour
  is recalled by Opus and not verified by anyone.
- **Finding 2 — array shapes.** A bare array posted to `/bulk`, or an array
  posted to the single endpoint. *Who:* a grader who reads "bulk" and posts
  a list.
- **Finding 3 — one problem per round trip.** The body `userId` check needs
  the path, and the date rules live in the domain layer, so neither is
  reported together with the field errors. *Who:* a grader sending a bad
  request on purpose (error handling is graded), and any client developer.
- **Finding 4 — a short name on the PR endpoint.** History matches part of a
  name; PRs match the whole name. *Who:* a grader who searched history for
  `bench` and then asks for PRs with the same word. *What they see:* an
  empty 200.
- **Position:** (1) only JSON is parsed; anything else gets
  `415 UNSUPPORTED_MEDIA_TYPE` with "Send Content-Type: application/json",
  and §9.6 gains that row; the framework behaviour is confirmed in the
  logging slice before the handler is written. (2) Both array cases get a
  400 that shows the expected shape. Together +0.5 h → **B-6**. (3) All
  problems of a request come back in one `errors[]`, with one bulk test that
  has an unsupported unit in one item and an offset-less time without a zone
  in another, and inserts nothing (+0.2–0.3 h → **B-7**). (4) Opus proposes a
  message listing the user's exercises that contain the word (+0.3 h); a
  fixed message saying the filter matches the whole name costs almost
  nothing → **C-4**. README lines Gemini and Opus ask for → **A-14**.

### 5.9 Toolchain and the Docker image

- **Raised by:** Astra O-5 (Minor), Opus O-7 and O-8 (Minor), Gemini O-8
  (Minor).
- **Finding 1 — files that are not TypeScript.** The catalog JSON and the SQL
  migrations are not copied by the build unless it is told to, and a
  multi-stage image that takes only the compiled output starts without
  them. *Who:* the grader, on the first command. *What they see:* a service
  that does not start, or starts with no catalog. Nothing later in the
  review recovers from that.
- **Finding 2 — `uuid` 14 under Jest.** The package is ESM-only (checked in
  the registry metadata: `"type": "module"`, no `require` entry); Jest's
  CommonJS runtime needs a transform exception to load it. *Who:* the
  builder, at the first test that creates an id.
- **Finding 3 — the database's own zone.** The suite runs Node in a non-UTC
  zone; nothing shows that no query depends on the database session zone.
- **Finding 4 — zone data on Alpine.** Gemini asks for `apk add tzdata`.
  `Temporal` uses the zone data built into Node, not the system's; this is
  already open item U-7 with a container test and a fallback image.
- **Position:** (1) a clean-image check: build, start with no bind mount and
  no seed profile, wait for readiness, read one known exercise from the
  catalog (+0.2–0.3 h → **B-5**). (2) and Astra's "one real HTTP test
  early": the first slice imports `v7` in a Jest test and sends one HTTP
  request through to a migrated PostgreSQL, so the toolchain fails at hour
  one rather than hour ten (+0.1 h planned, removes a 0–0.5 h surprise →
  **B-8**). (3) The test database runs in `America/Los_Angeles`
  (+0.05 h → **B-9**). (4) Not followed.

### 5.10 Benchmark method

- **Raised by:** Astra (what to add), Opus (D-06 ruling, re-checks), Gemini
  O-4 (Major).
- **The findings:** state the warm-up count, the number of measured requests,
  the concurrency and the Docker resources next to every figure (Astra);
  insert the seed in chronological order across users so one user's rows are
  spread over the table as real logging would leave them (Astra); give main
  lifts six to ten sets including warm-ups rather than a flat four (Opus);
  report set-side heap fetches and temporary-file use (Opus, Astra).
  Gemini: the background data — about 550 000 entries and 2.2 million sets —
  takes minutes to load with multi-row inserts, so cut it to two or three
  times the heavy user.
- **Real use:** the benchmark's reader is the grader looking for evidence
  behind the "50 000 entries" requirement. A number without its method is
  the first thing a careful reviewer discounts. Seed time matters only to
  whoever runs the benchmark; the demo seed a grader may load is separate.
- **Position:** take the method items (+0.4–0.5 h → **B-12**). Do not shrink
  the background on a recalled insert rate: its purpose is that the heavy
  user is a small share of the table. Generate it inside the database or
  load it with `COPY`, give the seed a stated time budget, and shrink only
  if that budget is missed. Both speed claims — Gemini's and mine — are
  recalled, not measured.

### 5.11 Estimate and cut list

- **Raised by:** all three (D-26: Modify · Medium).
- **The findings:** Opus: "17–19 h is more likely". Astra: the core rows sum
  to 15.75 h including the buffer, so 15–17 h leaves little room. Cut order:
  Gemini keeps the design's first three cuts and says Swagger UI must never
  be cut; Opus cuts the non-blocking CI benchmark job and the optional
  schema drift check before any test; Astra cuts the key, then the CI job
  and Swagger UI, and says cutting the property tests should drop the
  generator library, not the paging walk or the equal-volume fixture. Opus also notes that cutting
  `GET {id}` removes the target of the `Location` header.
- **Position:** the cut order becomes: idempotency key → CI benchmark job
  (`npm run bench` stays) → schema drift check → `fast-check` generators
  (fixed fixtures stay) → `GET {id}` → Swagger UI. Never cut, in addition to
  today's list: the ranking fixture, the mixed paging walk, the clean-image
  check (→ **B-14**). Swagger UI stays last: it is the documentation a
  grader clicks, and its cost is spread through the slices. The number
  itself is the candidate's → **C-2**.

### 5.12 Smaller points

- **`set_count`** is declared in §5 and read by nothing, against the same
  section's "No derived columns" (Astra, Opus O-9). Dropped, −0.1 h → **A-2**.
- **Back-dated rows while paging** (Astra): §9.2 says such an entry "is
  skipped until the next load". Only a row that sorts into the part already
  read is missed; one that sorts below the cursor still appears → **A-5**.
- **"Verbatim" originals** (Astra): `lbs` comes back as `lb`. The promise is
  the original number and the canonical unit code → **A-7**.
- **OpenAPI for `unit`** (Astra): input documented as a case-insensitive
  string with the accepted spellings, output as an enum of canonical codes.
  +0.1 h → **B-10**.
- **Full-word aliases** (Gemini O-7): no sender named, and the 400 already
  lists the accepted spellings. Not followed.
- **Filter hash in the cursor** (Gemini O-2, Major): withdrawn in round 1;
  argued again without a new sender. Opus and Astra both leave it withdrawn.
  The README line stays. Not followed.
- **Extra `CHECK` constraints** (Gemini O-6): `CHECK (set_number >= 1)` is
  already in the schema; a non-blank check on `exercise_name` guards nothing
  the validator lets through. Not followed.
- **Idempotency key, only if it is built** (Opus, Astra O-6): the claim row
  carries the entry ids from the start; a replay returns the same ids in
  input order; a timed-out attempt rolls back and answers "busy, retry".
  +0.25–0.4 h on a 1.0 h slice that all three keep first on the cut list
  → **A-13**.
- **Builder notes:** the backslash in `ESCAPE '\'` must be doubled inside a
  JavaScript string (Gemini); the README says why `/bulk` returns no
  `Location` (Gemini) and what the single POST returns if `GET {id}` is cut
  (Opus) → **A-12**.

## 6. Where the reviewers disagree with each other

| Topic | Gemini | Opus | Astra | What decides it |
|---|---|---|---|---|
| Four-decimal kilograms | Safe | Safe; also accepts the withdrawal of its own round-1 point | Breaks true ties | Ordinary pound loads (5.1): Astra |
| Filter hash in the cursor | Add (Major) | Leave withdrawn | Leave withdrawn | No real sender named: stays out |
| Compare in one snapshot | Add (Minor) | Not raised | Add, with a two-connection test (Major) | Candidate's call C-3 |
| Wall time in a daylight-saving gap or overlap | — | Keep the default | Reject | A lifter with only a wall clock must still be able to log: default |
| Full-word unit aliases | Add | Do not add | Keep the list, document it | No sender: not added |
| Index-only set lookup (`INCLUDE`) | — | Add now | Measure; the plan is not fixed by the schema | Measure first |
| Background rows in the benchmark | Cut to 2–3× | — | Keep, and interleave by time | Keep; give the seed a time budget |
| History fallback | The table, as planned | Per-key lookup, no table | Per-key lookup for rare groups; a table only if misses fail | Opus and Astra (5.5) |
| Swagger UI on the cut list | Never cut | Not on its list | Cut early | Stays last |
| Round-1 claim of "three 50 000-row sorts" in the PR query | Its own claim | Wrong: each `ORDER BY … LIMIT 1` keeps one row in a single pass | — | Opus |

## 7. What was checked, and what was not

| Claim | Checked by | Result |
|---|---|---|
| `100 lb × 10` and `200 lb × 5` get different stored volumes | Author, exact decimal arithmetic | Holds: 453.5920 against 453.5925 |
| Share of true ties broken at four decimals | Author, survey in 5.1 | 76–77 % for volume, 95–96 % for estimated 1RM |
| A pound load and a kilogram load colliding under exact storage | Author, 0.25-lb grid to 1 000 lb | Three near-coincidences, all different nominal loads |
| `PlainDateTime.from` drops an offset and rejects `Z` | Opus (documentation); author (run on Node 26) | Holds |
| Offset time converted to a zone gives the right local date | Author (Node 26) | 19:30 −08:00 → 10:30 next day in Ho Chi Minh |
| Default handling of a gap and an overlap | Author (Node 26) | Gap 02:30 → 03:30; overlap → earlier occurrence; `reject` throws |
| Microsecond fractions accepted | Author (Node 26) | Holds |
| `uuid` 14 is ESM-only | Author (registry metadata). Opus found a report of version 12 needing a Jest transform and could not read version 14's metadata | Holds; the Jest fix is confirmed only by building |
| `v7()` generation order within one process | Astra (package source) | The no-options call keeps internal sequence state, so ids ascend in the order generated |
| A primary key accepts `INCLUDE` | Opus (PostgreSQL documentation) | Holds |
| `CHECK (set_number >= 1)` missing | Author, against §5 | It is there; Gemini misread |
| The cut list is "inverted" | Author, against §16 | Gemini's first three cuts are the design's first three |
| Autovacuum leaves 5 000 fresh rows unvacuumed in a table this size | Opus (recalled) | Plausible; the benchmark's second run will show it |

Not checked by anyone, so treated as open until the code exists: the
framework's handling of a form-encoded body (5.8); that the build leaves the
JSON and SQL files out of the image by default (5.9); bulk-load speed for the
seed (5.10); the 10–20 ms estimate for a full index walk (5.5); the planner
items U-3 and U-8.

## 8. Where the reviewers were wrong

| Reviewer | Claim | What is the case |
|---|---|---|
| Gemini, Opus | Four decimals cannot give a wrong answer for a real load | They break most true ties between pound sets (5.1) |
| Gemini | Add `CHECK (set_number >= 1)` | Already in the schema |
| Gemini | The cut list is inverted | It proposes the same first three cuts; only "never cut Swagger UI" is new |
| Gemini | Raise sort memory inside the benchmark | That hides the spill the benchmark should report |
| Gemini | Add `tzdata` to the image for `Temporal` | `Temporal` reads Node's built-in zone data |
| Gemini | The filter-hash cursor is a Major | Re-argues a withdrawn item with no sender, which the brief's round-2 rules exclude |
| Astra | The tie is a Blocker | Real, but nothing blocks: the value shown is right and only a tied record's date moves |
| Astra | Reject ambiguous wall times | Refuses a real workout to avoid a one-hour difference |
| Opus | Add the index-only set lookup before measuring | Contradicts the decision it otherwise keeps; kept as a fallback rung |

Gemini's five re-checks are all recalled; it had no web access. They are not
counted as verification.

## 9. The list to decide

### A. Corrections — errors in the documents, no decision needed

| # | Where | Correction | Found by | Hours |
|---|---|---|---|---|
| A-1 | §8, §12 | Bulk response is in request order; history returns same-day date-only entries newest first. Test both | Astra, Opus | +0.15 |
| A-2 | §5 | Drop `set_count` | Astra, Opus | −0.1 |
| A-3 | §9.4 | Response inside `data`; `message` names the empty period(s); absolute delta in the requested unit, percentage without one | Astra, Gemini | +0.2 |
| A-4 | §9.6 | The offset-less-time error says the instant is unknown, not the day | Astra | 0 |
| A-5 | §9.2 | Which back-dated rows a paging client misses | Astra | 0 |
| A-6 | §9.3, brief | "One pass" and "one probe per entry" describe one possible plan | Astra | 0 |
| A-7 | §6, §9.1 | "Verbatim" becomes: the original number and the canonical unit code | Astra | 0 |
| A-8 | §8 | Say how a wall time in a gap or overlap is resolved | Astra | 0 |
| A-9 | §5 | The exercise index is not "for PRs only" once B-11 is written | Opus | 0 |
| A-10 | Decision log D-03 | Drop "complicates compose"; the README's MongoDB section shows the document, the index and the pipeline | Opus | 0 |
| A-11 | D-12, README | The 1RM figure is called an estimate wherever it appears | Astra | 0 |
| A-12 | D-14, §16 | Why `/bulk` has no `Location`; what the single POST returns if `GET {id}` is cut | Gemini, Opus | 0 |
| A-13 | §9.5 | Only if the key is built: ids in the claim row, replay in input order, roll back on timeout | Opus, Astra | (+0.25–0.4) |
| A-14 | README plan | POST shows kilograms and originals, GET takes `?unit=`; where date-only entries sort; the database session zone is never used; a duplicate never changes a PR and delete is the first v2 endpoint | Gemini, Opus | 0 |

### B. Recommended changes

Ordered so the candidate can stop after any group.

| # | Change | From | Hours |
|---|---|---|---|
| | **Group 1 — a wrong result or a broken promise if left** | | |
| B-1 | Fixed ranking test, SQL against `rank()`, never cut | Opus O-2, Astra | +0.25 |
| B-2 | Cursor built from the stored row; mixed timed and date-only paging at page size one | Gemini O-1, Astra | +0.25 |
| B-3 | Parser chosen by input shape; tests for offset plus zone and for fractional seconds | Opus O-6 | +0.15 |
| B-4 | Date-only ordering value = the date at midnight UTC minus 14 hours | Opus O-5 | +0.1 |
| | **Group 2 — the reviewer's first five minutes** | | |
| B-5 | Clean-image check that the catalog and migrations are in the image | Astra O-5 | +0.2–0.3 |
| B-6 | 415 for a non-JSON body; clear 400s for array shapes | Opus O-3 | +0.5 |
| B-7 | Every problem of a request in one `errors[]`; one two-fault bulk test | Opus, Astra | +0.2–0.3 |
| B-8 | First slice proves the toolchain: `v7` under Jest, one HTTP request to a migrated database | Opus O-7, Astra | +0.1 |
| B-9 | Test database in a non-UTC zone | Opus O-8 | +0.05 |
| B-10 | OpenAPI: `unit` as a string with accepted spellings on input, an enum on output | Astra | +0.1 |
| | **Group 3 — evidence** | | |
| B-11 | History fallback rewritten: per-key lookup on the existing index, no table | Opus O-1, Astra O-4 | 0 now |
| B-12 | Benchmark method: stated run conditions, plan details, interleaved seed, heavier main lifts, seed time budget | Astra, Opus, Gemini | +0.4–0.5 |
| B-13 | PR fallback ladder gains a first rung: index-only set lookup and extended statistics | Opus O-4 | 0 now |
| B-14 | Cut order as in 5.11 | all three | 0 |

### C. The candidate's calls

| # | Question | Options | My recommendation |
|---|---|---|---|
| C-1 | Store kilograms exactly instead of rounded to four decimals? This reopens an item decided after round 1. | (a) exact, `numeric(17,11)`, +0.25 h · (b) keep four decimals and document that a tied record may show the later date | **(a).** The round-1 objection was to an invented load; this one uses 100, 135, 200 and 225 lb. It removes a rounding step rather than adding machinery. |
| C-2 | What estimate to state (D8)? | (a) take A, B and C-1 and state **17–19 h**, with the idempotency key out of the plan · (b) take group 1 and C-1 only, ≈ 17 h · (c) keep 15–17 h and pay for the additions from the cut list | **(a).** See E. |
| C-3 | Read both compare periods in one snapshot? | (a) the three-line transaction, no two-connection test, +0.1 h · (b) leave as is, one README line | **(a)**, as cheap insurance and a one-sentence interview answer — not because the race is realistic. |
| C-4 | What does the PR endpoint say for a name it does not match exactly? | (a) fixed message: the filter matches the whole name, +0.05 h · (b) message listing the user's exercises that contain the word, +0.3 h | **(a).** (b) comes almost free if the B-11 fallback is ever built. |

### D. Not followed

| Suggestion | From | Reason |
|---|---|---|
| Filter hash in the cursor | Gemini O-2 | No real sender; withdrawn in round 1; two reviewers leave it out |
| Full-word unit aliases | Gemini O-7 | No client named that sends them; the 400 lists the spellings |
| `apk add tzdata` | Gemini O-8 | Not what `Temporal` reads; already covered by U-7 |
| Extra `CHECK` constraints | Gemini O-6 | One exists already; the other guards nothing reachable |
| Cut the background data to 2–3× | Gemini O-4 | Decided on a recalled rate; a seed time budget answers the same worry |
| Raise sort memory in the benchmark | Gemini | Hides the measurement |
| Reject wall times in a gap or overlap | Astra | Refuses a real workout |
| Two-connection test for the compare snapshot | Astra O-3 | Tests PostgreSQL, not this code; costs more than the feature |
| Index-only set lookup up front | Opus O-4 | Kept as a fallback rung (B-13) |
| Never cut Swagger UI / cut it early | Gemini / Astra | It stays last on the cut list |

### E. Effect on the estimate

| | Hours |
|---|---|
| Core rows in §16 today, buffer included | 15.75 |
| Corrections (A-1, A-2, A-3) | +0.25 |
| Group 1 (B-1 to B-4) | +0.75 |
| Exact kilograms (C-1) | +0.25 |
| Group 2 (B-5 to B-10) | +1.15 to +1.35 |
| Group 3 (B-12) | +0.4 to +0.5 |
| Calls C-3 and C-4 as recommended | +0.15 |
| **Everything recommended** | **≈ 18.7 to 19.0** |
| Group 1, corrections and C-1 only | ≈ 17.0 |

The idempotency key (1.0 h, or about 1.3 h with A-13) is on top of every
line above. All three reviewers keep it first on the cut list; under option
C-2 (a) it leaves the plan and stays described in the README as the next
step. Opus's independent figure for the build was 17–19 h. The number is the
candidate's to state before the first line of code.

## 10. Interview questions the reviewers raised

Twenty-two questions from three reviews, merged. Each names where the answer
lives once the list above is applied.

1. Why does `100 lb × 10` keep its record date after `200 lb × 5`, and which
   test fails if SQL and TypeScript make the same rounding mistake? — 5.1.
2. Which is the source of truth for ranking, SQL or TypeScript, and what
   still guards them if the property tests are cut? — B-1.
3. Why compute PRs on read instead of storing running maxima, and at what
   volume would you reverse that? — D-06, the fallback ladder in §11.
4. I post `[squat, row]` with dates and no times. What order does the POST
   return, what does history return, and how do you prove each kept its own
   sets? — A-1.
5. An entry returns `performedAt: null`. What goes into the row comparison
   for the next page, and why is it not `NULL`? — B-2.
6. Where does a date-only entry appear next to a 06:30 workout on the same
   day, in Vietnam and in Los Angeles? — B-4.
7. A lifter in Vietnam logs at 05:45 with `toISOString()` and no `timeZone`.
   Which day is it stored under, and why not reject `Z`? — D-09.
8. The client sends `-08:00` and `timeZone: Asia/Ho_Chi_Minh`. Which instant
   and which date are stored, and which test proves it? — B-3.
9. How does the suite catch a SQL `date` being turned into a JavaScript
   `Date` at local midnight? — D-22, B-9.
10. A coach filters a 50 000-entry client by `forearms` and there are three
    matches. Show the plan. Why does a vocabulary table not help? — B-11.
11. A cursor issued for "bench" is reused for "squat". What happens? — an odd
    page, never wrong data; documented, not prevented (D).
12. A monthly comparison overlaps an offline sync. Can the response describe
    a state that never existed? What does it say if only one period has
    data? — C-3, A-3.
13. Two identical requests arrive at once with no key. Are there two rows?
    Does any PR change? What is the first thing you would add in v2? — D-15,
    A-14.
14. What does `curl -d '{…}'` without a content type return? — B-6.
15. Why generate UUIDv7 in Node rather than with PostgreSQL's `uuidv7()`, and
    what happens with two replicas in the same millisecond? — D-14: ids are
    needed before the insert to return entries in request order; ordering
    across replicas is not relied on.
16. A single-node replica set is two lines of compose. Why is PostgreSQL
    still the choice? — A-10.
17. Why Epley at one rep, when the formula is meant for more? — D-12.
18. Which check proves the catalog and migrations are in the image, and which
    failing test or query plan made you reject an AI-written
    implementation? — B-5, and `AI_WORKFLOW.md`.
