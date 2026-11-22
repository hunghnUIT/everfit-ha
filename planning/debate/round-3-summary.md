# Round 3 — Summary of external reviews, with the author's comments

Three models reviewed what changed after round 2: the round-2 list as it was
applied, and the exercise catalog moved into the database (D-07 revised,
D-27 new, design §5 and §10). Their full replies are next to this file. This
file lays their rulings side by side, groups their findings by topic, tests
each finding against real use, and says what I (Claude, the design's author)
would change, what I would not, and what is the candidate's to decide.

**Status: applied.** The candidate took the recommended option on both calls
(3C-1 (a), 3C-2 (a)), and every item of section 9 A and B is applied to
`02-design.md`, `03-decision-log.md` and `resolution.md` (its section 20).
The text below is the round as it was argued, before anything was applied.

The test applied to every finding is the one the candidate set after round 1:
*who sends this, how often, and what do they see?* A finding that is correct
arithmetic about an input nobody produces is not accepted.

## 1. Who reviewed, and how

| Reviewer | File | How it ran | What it could verify |
|---|---|---|---|
| Claude Opus 5.5 | `round-3-opus.md` | Claude CLI, high reasoning effort, no tools, no web | Nothing outside the documents; it marks its outside facts as recalled |
| Gemini 4 Argon | `round-3-gemini.md` | GitHub Copilot CLI, high reasoning effort, no tools, no web | The same |
| Grok 4.7 | `round-3-grok.md` | GitHub Copilot CLI, **low** reasoning effort, no tools, no web | The same |

Each received `round-3-prompt.md` followed by `01-requirements.md`,
`02-design.md`, `03-decision-log.md`, `05-research-notes.md`,
`debate/resolution.md` and the round-2 list with the reviewer names removed.

**Grok ran at low effort, and that should be weighed.** At high effort (two
runs) and at medium effort (one run) its reply was cut by a transport error
about ten and a half minutes into the stream. The low-effort run finished and
is complete. Its file also keeps the first page of the medium-effort reply,
below a marker, because that page raises one point the complete answer does
not (5.13).

Not in this round: GPT-6.2 Astra (the request named three reviewers).

What became of each reviewer's numbered objections:

| Reviewer | Objections | Followed | Followed in part | Candidate's call | Not followed |
|---|---|---|---|---|---|
| Opus | 10 | 6 | 3 | 1 | 0 |
| Gemini | 8 | 6 | 2 | 0 | 0 |
| Grok | 7 | 5 | 1 | 1 | 0 |

No objection is rejected outright. That is a statement about the design, not
about the reviewers: the catalog section was written in one pass with no
review, and it shows.

## 2. Verdicts, and what the round comes to

| Reviewer | Verdict | The three changes it puts first |
|---|---|---|
| Opus | "Ready after the fixes listed. None of them reverses a decision." | One transaction and an error mapping for admin writes · the seed must not touch an admin's exercise · rules for the snapshot refresh |
| Gemini | "Ready after the fixes listed." | The seed must not touch an admin's exercise · admin write races · snapshot rules |
| Grok | "Not ready to build as written." The catalog write path can answer 500, half-write an exercise, or add the file's groups to an admin's row | Admin writes · the seed · the estimate, which it says cannot be defended |

All three keep the direction: the catalog in tables behind the existing
port, an in-memory snapshot, a seed with a ledger, a guard that is written
and left off. All three rule "keep with modification" on both decisions.
Grok's "not ready" and the others' "ready after the fixes" describe the same
list; none of the three asks for a decision to be reversed, with one
exception (5.15).

What the round comes to:

- **The catalog section states outcomes where it needs rules.** "The admin's
  row stays as written", "last write wins", "never a mixture", "409 when in
  use" are promises. A builder following the steps literally breaks each of
  them. The fixes are rules of a sentence or two each: one transaction per
  admin write with the two constraint errors mapped (5.1); the seed adds
  muscle-group links only to an exercise it inserted itself (5.2); a request
  reads one snapshot, and one refresh runs at a time (5.3).
- **Three items of the round-2 list were applied with the slices out of
  order.** Slice 1 asks for a migrated database that does not exist until
  slice 3; the clean-image check in slice 3 asserts a seeded exercise that
  does not exist until slice 6; and nothing says how the `migrate` step runs
  inside the runtime image (5.9).
- **Two small errors in the time section** would have surfaced on the first
  test run: a `Z` instant passed to a `Temporal` call that does not accept
  `Z` as a zone, and a date-only value that is never checked to be a real
  date (5.10).
- **The guard has one real bug in waiting**: the comparison it names throws
  on a token of a different length (5.7).
- **The open-routes statement overreaches.** "Cannot read … a logged entry"
  is true of the five admin routes and false of the API, which has no
  authentication anywhere (5.8).
- **The estimate does not hold.** All three say the two catalog slices are
  priced too low, by 1.0 to 1.75 h, before any of this round's fixes
  (about 1.6 h net). The stated 20–22 h has a 2.0 h buffer. This is the one
  decision of the round that is the candidate's (5.15, 3C-1).
- **Nothing in round 2's larger changes was found wrong**: exact kilograms,
  the two orders, the date-only ordering value, the cursor, the compare
  snapshot, the fallback ladder.

## 3. Rulings on the two catalog decisions

| Decision | Opus | Gemini | Grok | Where they differ, and my position |
|---|---|---|---|---|
| D-07 (revised) — the catalog is data in the database, read from a snapshot | Keep with modification · High on the direction, Medium on the mechanism | Keep with modification · High | Keep with modification · Medium | No disagreement on substance. Grok's sentence is the shortest statement of the fix: "The snapshot is only safe if a request pins one generation and a write does not depend on the refresh." **Keep, with 3B-3 and 3B-4.** |
| D-27 (new) — five admin routes, the seed ledger, the guard left off | Keep with modification · Medium | Keep with modification · High | Keep with modification · Medium | The same. Grok: "409 and 'admin's row stays' are promises, not rules a builder can implement from the text". **Keep, with 3B-1, 3B-2, 3B-5, 3B-6, 3B-7.** |

## 4. The author's ten calls

These are the calls I made while applying the owner's catalog requirement
(`resolution.md` §17). No reviewer had seen them.

| # | Call | Opus | Gemini | Grok | Position |
|---|---|---|---|---|---|
| 1 | Snapshot refreshed every 30 s and after a write | Keep with modification · High | Change · High | Keep · High | **Keep, with rules added** (3B-3): one snapshot object per request; one refresh at a time, and an older load never replaces a newer one; the load is one statement; the refresh after a write runs after the commit and never fails the write. "Change" and "keep with modification" ask for the same four rules |
| 2 | No catalog at boot → retry, then exit; a failed refresh → keep the last good copy | Change the boot half · Medium | Keep · High | Keep · High | **Keep, and fix the sentence** (3A-9). Say that the process does not listen until the first load has succeeded, and give `api` a `restart: on-failure` policy so that "a restart on a real outage" is true. Opus's alternative (start anyway, report not-ready) is not followed: 5.5 |
| 3 | One key function, no `CHECK` constraint | Keep with modification · High | Keep · High | Keep · High | **Keep, with a golden test** (3B-5) that pins the function's output, and one sentence: changing this function is a data migration |
| 4 | `AdminTokenGuard`, off by one commented-out line | Keep with modification · Medium | Change · High | Keep · High | **Keep the shape; fix the guard** (3B-6). Compare SHA-256 digests; add a wrong-length token to the unit test; add a test that applies the guard and sees 401. The documents say **two** lines, the import and the decorator |
| 5 | The seed runs inside `migrate`; the admin's row wins | Keep with modification · Medium | Change · High | Change · High | **Keep, with the rule that makes it true** (3B-2): links are inserted only for an exercise this run inserted; the lock is taken before the ledger is read |
| 6 | PUT replaces; last write wins; no group rename | Keep with modification · High | Change · High | Keep with modification · High | **Keep, inside one transaction** (3B-1), starting with `UPDATE … RETURNING` so a deleted exercise is a 404 and not a half-written row |
| 7 | The catalog's GET routes read the tables | Keep · Medium | Change · Medium | Keep with modification · Medium | **Keep** (3B-4). The filter's "unknown group" check and its key list both come from the request's snapshot; the README says what another replica shows for up to 30 s. Gemini's change is not followed: 5.4 |
| 8 | Field rules for names and groups | Change (small) · Medium | Change · High | Keep · Medium | **Change, small** (3B-5): one `muscleGroupName()` function used by the admin API, the seed file and the filter; repeats removed after normalising, not before |
| 9 | The open-routes statement in five places | Keep, add a sixth · Medium | Change the content · Medium | Keep · High | **Keep five; fix the content** (3B-7). No sixth place: 5.8 |
| 10 | Compose profile `seed` renamed `bench` | Keep with modification · High | Keep · High | Keep · High | **Keep, and finish it** (3A-15): `npm run seed:bench` and `scripts/seed-bench.ts` still carry the old word |

## 5. Findings by topic

Each topic gives who raised it, what it is, the real-use test, and my
position. Codes such as 3A-1 or 3B-4 point to the list in section 9. Codes
without the `3` (B-5, C-4) are items of the round-2 list.

### 5.1 Two admin writes at the same time

- **Raised by:** all three (Opus O-1, Gemini O-2, Grok 1).
- **The finding:** §10.5 gives each route its result and no mechanism. Three
  cases break as written. Two POSTs of the same name both pass a "does it
  exist" check; the second insert fails on the primary key and the client
  gets a 500 instead of the promised 409. A PUT that replaces an exercise's
  groups while one of those groups is being deleted fails on the foreign key
  after the old links are already gone — a 500, and without a transaction an
  exercise left with no groups. A DELETE during a PUT can leave links
  pointing at nothing, or bring back a row that was just deleted.
- **Real use:** *Who:* one editor with two browser tabs, or a client that
  retries a POST after a timeout. Two editors is the stated maximum. *How
  often:* a few times a year at most. *What they see:* a 500 with no
  explanation, and in the middle case an exercise whose tags are gone until
  someone notices.
- **Position:** follow. Rare, but the fix is the ordinary way to write these
  five handlers and costs less than explaining why it was left out. Each
  write is one transaction. POST is `INSERT … ON CONFLICT DO NOTHING
  RETURNING`: no row back means 409. PUT starts with `UPDATE … RETURNING`:
  no row back means 404, then the links are replaced. A foreign-key error on
  an exercise write is a 400 that lists the known groups; on a group delete
  it is 409 `MUSCLE_GROUP_IN_USE`. One test fires two POSTs of one name at
  once and expects one 201, one 409 and one row. → **3B-1**.

### 5.2 The seed and an exercise an admin created

- **Raised by:** all three (Opus O-2, Gemini O-1, Grok 2).
- **The finding:** §10.3's table says of an exercise that an admin created
  and a later file also adds: "The admin's row stays as written". Step 2
  says to insert each item "with `ON CONFLICT DO NOTHING`". The exercise
  insert does nothing, as intended. The inserts into the link table are a
  separate statement, and nothing stops them. Gemini's example: an admin
  creates "Zercher Squat" with quads and glutes; a later file lists it with
  quads and back; after the deploy the exercise has three groups, one of
  which nobody with authority chose.
- **Real use:** *Who:* the developer who adds popular exercises to the seed
  file, some of which an admin has already added by hand — the exact case
  the table was written for. *How often:* a few exercises per release that
  touches the file. *What they see:* an extra muscle group on an exercise,
  on every entry of every user that logged it, with nothing in any log.
- **Position:** follow. The rule: muscle-group links are inserted only for
  an exercise whose own insert returned a row. Three smaller rules go with
  it. The advisory lock is the first statement of the transaction and the
  ledger is read after it; as written, the order is not stated. The ledger
  insert is itself `ON CONFLICT DO NOTHING`. One session lock covers the
  whole `migrate` entry, migrations included (Opus: the migrator takes no
  lock of its own — recalled, not verified). A sixth integration case is
  added: an admin-created exercise keeps its groups when the file later adds
  it. → **3B-2**.
- **The missing-group edge got three different answers.** The design says: a
  file exercise naming a group an admin has deleted is inserted without that
  group, with a warning. Nobody objects to that when other groups remain.
  When *no* group remains, the result would break the rule that an exercise
  has one to ten groups. Opus: skip it, warn, and record it in the ledger.
  Gemini: skip it, warn, and do not record it. Grok: if any named group is
  absent, do not insert or record the exercise at all. My call (author's,
  listed in 9 F): keep the design's rule when at least one group remains;
  when none remains, skip, warn, and do **not** record it. The deploy then
  warns each time until the group exists or the file is corrected, which is
  the honest state of things — the file asks for something the database
  refuses. Recording it would hide the conflict for good.

### 5.3 The snapshot: one per request, one refresh at a time

- **Raised by:** all three (Opus O-3, Gemini O-3, Grok 4).
- **The finding:** "A request sees one or the other, never a mixture" is not
  made true by anything in §10.2. A history request reads the catalog twice
  — once for the filter's key list, once to tag the entries of the page —
  and a swap can land between the two reads. Two refreshes can also overlap
  (the timer and a write), and the slower, older load can finish last and
  replace the newer one. A load made of several queries can see half of an
  admin's write. And if the refresh after a write fails, the write has
  already committed but the request would answer with an error.
- **Real use:** *Who:* any client reading history in the same fraction of a
  second as a catalog change. *How often:* a catalog changes a few times a
  day at most and a request lasts milliseconds — a handful of responses a
  year for the mixed read, about one write in several thousand for the
  overlap. *What they see:* one page whose filter and tags disagree; or, in
  the overlap case, an admin's change that disappears for up to 30 seconds
  on the replica that made it.
- **Position:** follow. The exposure is small and so is the fix, and "never
  a mixture" is a sentence an interviewer will test. Four rules: a request
  takes `catalog.snapshot()` once and uses that object throughout; refreshes
  are single-flight, each load carries a number, and a load never replaces a
  snapshot with a higher number; the load is one statement (or one
  repeatable-read transaction); the refresh after a write runs after the
  commit, and its failure is logged and does not change the response.
  → **3B-3**, and the sentence itself → **3A-8**.

### 5.4 Which copy answers the muscle-group filter

- **Raised by:** all three, from different sides (Opus, Gemini O-3 and call
  7, Grok 7).
- **The finding:** D-18 and §10.4 say an unknown `muscleGroup` is checked
  against "the rows of `muscle_groups`". §9.2 resolves the filter from the
  snapshot. `GET /v1/muscle-groups` reads the tables. So on a second
  replica, for up to 30 seconds after a group is created, the list endpoint
  shows the group and the filter answers 400 for it — or, if the check reads
  the table and the key list reads the snapshot, 200 with nothing in it.
- **Real use:** *Who:* an admin or client on a deployment with more than one
  replica; the submission runs one process, where this cannot happen. *How
  often:* groups are added a few times a year. *What they see:* a 400 that
  is gone half a minute later.
- **Position:** make it one copy and say so. The 400 check and the key list
  both come from the request's snapshot; D-18's wording is corrected. The
  README sentence about 30 seconds gains what it means in practice: on
  another replica a new exercise shows no tags and a new group is not yet a
  valid filter. → **3B-4**.
- **Not followed — Gemini's change to call 7:** serve the catalog's GET
  routes from the snapshot too, or refresh once when an unknown group
  arrives. The first would make an admin's read-after-write through another
  replica answer 404 for up to 30 seconds, which is worse than what it
  cures. The second adds a rate-limited refresh path for a case that needs a
  second replica and a new group in the same half minute.

### 5.5 Boot, listening and restart

- **Raised by:** Opus (O-8, call 2), Grok (B-5); Gemini keeps the rule.
- **The finding:** two gaps in one paragraph. §10.2 says a failed first load
  ends in "a restart on a real outage", but the compose file gives `api` no
  restart policy, so the process exits and stays down. And nothing says
  whether the HTTP listener is up while the first load is still retrying;
  Grok reads that as a window in which a request is served with no catalog.
- **Real use:** *Who:* a grader whose database container is slow or
  restarts; an operator in a real outage. *How often:* rare under compose,
  where `api` starts only after `migrate` has finished. *What they see:* as
  written, a stopped container and no explanation in the README.
- **Position:** keep fail-fast, fix the text (author's call, 9 F). The
  process does not listen until the first load succeeds — in NestJS that is
  what awaiting the load in `onModuleInit` gives (recalled; to be confirmed
  in slice 6). `api` gets `restart: on-failure`. Opus's alternative, start
  anyway and report not-ready until the catalog arrives, would need the
  readiness probe to know about the catalog, which §10.2 deliberately avoids
  for the stale case; two answers to "is the catalog there" is more to
  explain than one. → **3A-9**.
- **Where Grok is wrong:** "CI can GET before the seed is visible". The
  seed runs in `migrate`, `api` depends on `migrate` completing (§13), and
  the catalog GET reads the tables. The check cannot run before the seed.

### 5.6 The key function and muscle-group names

- **Raised by:** Opus (O-7, call 3), Gemini (O-6, call 8), Grok (call 8).
- **The finding:** three things. (1) `exerciseKey()` decides which logged
  entries count as the same exercise, and the ledger stores its output. If a
  later release changes it — folding hyphens, say — exercises an admin
  deleted come back through the seed and one lifter's records split across
  two keys. Nothing pins the function. (2) Group names are normalised three
  ways: the admin body by its field rules, the seed file by "lowercase and
  unique", the filter by its own lower-casing. Opus's case: an admin types
  `"upper  back"` with two spaces and gets "unknown group" for a group that
  exists. (3) "No repeats" is checked before normalising, so
  `["Chest", "chest"]` passes validation and fails on the link table's
  primary key — a 500 (Gemini).
- **Real use:** *Who:* (1) the developer of the next release; (2) and (3) an
  admin typing by hand, or a script that builds the body from two sources.
  *How often:* (1) once, and expensively; (2) and (3) occasionally. *What
  they see:* (1) duplicate exercises and broken PR history; (2) a 400 that
  looks like a bug; (3) a 500.
- **Position:** follow. A golden test pins `exerciseKey()` on about twenty
  inputs, with one sentence in the design and the README: changing this
  function is a data migration. One `muscleGroupName()` function sits beside
  it and is used by the admin API, the seed-file validation and the filter;
  the same test pins it. Repeats are removed after normalising. → **3B-5**.
- **Not followed:** Gemini's `exerciseKey(name).length >= 1`. A name must be
  non-empty after trimming, and the function only trims, collapses spaces
  and lower-cases, so a non-empty name cannot produce an empty key
  (that NFKC never maps a visible character to nothing is recalled).

### 5.7 The guard

- **Raised by:** all three (Opus O-6, Gemini O-7, Grok technical error 3).
- **The finding:** §10.7 says the guard compares the token "in constant
  time". The Node function for that throws when the two inputs differ in
  length, so a wrong token of a different length — the usual kind — is a 500
  and not a 401. Checked: it throws `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH`.
  Second, the guard's unit test never runs it on the controller, so
  uncommenting the line is untested. Third, the line needs an import; left
  in, an unused import can fail the lint step, and left out, "one line" is
  not true.
- **Real use:** *Who:* whoever turns the guard on, and after that anyone
  with a wrong token. *How often:* every wrong token. *What they see:* a 500
  from the one piece of security code in the submission.
- **Position:** follow. Compare the SHA-256 digests of the two values, which
  are always the same length. Add a wrong-length token to the unit test. Add
  one test that applies the guard to the real controller and expects 401 on
  all five routes without the token, success with it, and no effect on a
  public route. A 401 carries `WWW-Authenticate: Bearer` (my addition; HTTP
  asks for it — recalled). The documents say two lines, the import and the
  decorator, both commented out; that is true under any lint setting
  (author's call, 9 F). → **3B-6**.
- **A difference between reviewers:** Opus applies the guard to the real
  controller in the test; Gemini mounts it on a dummy controller. The real
  one is followed: the claim under test is "these five routes".
- **Grok's defence of the shape is worth keeping** for the interview: "O1.1
  names this shape. A runtime switch can be off with no diff."

### 5.8 What the open-routes statement says

- **Raised by:** all three (Opus O-9, Gemini call 9, Grok 6).
- **The finding:** §10.7 says an anonymous caller "cannot … read, change or
  delete a logged entry or a PR". That is true of the five admin routes. Of
  the caller it is false: the brief has no authentication (T4), so anyone
  can read any user's history by putting their id in the path. Three
  consequences of the open routes are also missing: a seeded exercise that
  someone deletes is not restored by a redeploy (each item is seeded once);
  deleting a group turns a saved `?muscleGroup=` filter from a 200 into a
  400; and nothing limits how many exercises can be created.
- **Real use:** *Who:* the grader reading the README's security paragraph,
  and the interviewer. *How often:* every reading. *What they see:* a
  sentence that is wrong on its face, in the paragraph written to show
  honesty.
- **Position:** follow. The sentence becomes "through these routes", next to
  a plain statement that the rest of the API has no authentication either,
  as the brief specifies. The three consequences are added, with the
  recovery for the first (delete the item's ledger row and run the migrate
  step again). → **3B-7**.
- **Not followed:** a cap of 2 000 exercises and 100 groups (Opus, optional).
  Entry POSTs are unlimited too; request limits belong to the gateway, as
  requirements §10 already says. And a boot-time `WARN` as a sixth place
  (Opus): Gemini and Grok both say five is enough, and a log line nobody is
  watching adds no disclosure.

### 5.9 Slice order, the clean-image check, and how `migrate` runs

- **Raised by:** Opus (B-8, B-5, O-4, O-5), Gemini (B-5), Grok (B-5,
  contradictions).
- **The finding:** three misapplications of round-2 items.
  B-8: slice 1 must send "one HTTP request … to a migrated PostgreSQL", but
  the database module and the first migration are slice 3.
  B-5: the clean-image check, placed in slice 3, asserts that
  `GET /v1/exercises/bench%20press` returns the seeded exercise; the catalog
  is slice 6. Research note U-10 describes a third version of the same check
  ("log one entry, read the catalog").
  And nothing says how the `migrate` step runs in the runtime image:
  `scripts/seed-catalog.ts` sits outside `src/`, and the migration tool is a
  development dependency that the image prunes (Opus; both points recalled).
- **Real use:** *Who:* the candidate, on the first morning of the build.
  *How often:* once each. *What they see:* a slice that cannot be finished
  as written, and later an image whose migrate step fails on a missing
  module — in CI if the check is built, in front of the grader if it is cut.
- **Position:** follow, all at no cost. Slice 1 reaches a Testcontainers
  PostgreSQL that answers `SELECT 1`; "migrated" moves to slice 3. The
  clean-image check asserts readiness and applied migrations in slice 3 and
  gains the seeded exercise in slice 6. U-10 is aligned with §12. The
  migrate step is one compiled entry point that runs the migrations through
  the library and then the seed; nothing in the runtime image needs a
  development dependency, and the clean-image check is what proves it.
  → **3A-1, 3A-2, 3A-3, 3A-11**.

### 5.10 Time and dates

- **Raised by:** Gemini (B-3, O-5), Grok (A-1).
- **The finding:** (1) §8, shape 2, converts the instant with
  `toZonedDateTimeISO(zone)` where `zone` is "the offset the client wrote".
  For a `Z` instant that value is `Z`, which is not a zone name. Checked:
  `'Z'` throws `RangeError`; `'UTC'`, `'+07:00'` and `'-05:00'` work.
  (2) Shape 1 takes the date text as it is. `2025-02-30` would reach the
  database and come back as a 500. Checked: `Temporal.PlainDate.from`
  rejects it. (3) The test sentences for date-only ordering in §8 and §12 do
  not say that the two entries share a date, which is the only case in which
  the order is decided by id.
- **Real use:** *Who:* (1) every JavaScript client — `toISOString()` always
  ends in `Z`; (2) anyone who mistypes a date; (3) the builder writing the
  test. *How often:* (1) the first request of the first test; it could not
  have shipped, but it is a wrong line in the design. (2) Occasionally.
  *What they see:* (1) a failing test; (2) a 500 for a typo.
- **Position:** follow. `Z` is converted with `UTC`; a date alone is parsed
  with `Temporal.PlainDate.from` and a non-existent date is a 400 with its
  path; the two test sentences say "the same date". → **3A-5, 3A-13**.

### 5.11 Request handling: 415, and one `errors[]`

- **Raised by:** Gemini (B-6, B-7, O-4), Grok (B-6, 5).
- **The finding:** (1) §9.6 answers 415 for "a body sent with any content
  type other than `application/json`". Read literally that rejects
  `application/json; charset=utf-8`, which Grok notes "Postman and many HTTP
  clients send". (2) §9.1 promises that field rules, the body-`userId` rule
  and the date rules all report into one `errors[]`, and names no mechanism.
  Gemini: the validation pipe sees the body and not the path, so the
  `userId` comparison happens somewhere else, and by default that means a
  second response (recalled).
- **Real use:** *Who:* (1) the grader with Postman; (2) a client with two
  faults in one request, one of them the user id. *How often:* (1) possibly
  the first request; (2) uncommon. *What they see:* (1) a 415 for valid
  JSON; (2) two round trips where one was promised.
- **Position:** follow. The rule compares the media type and ignores
  parameters such as `charset`, and the first-request test gains a
  `charset=utf-8` case. For `errors[]` the design states the result, not the
  framework call: the DTO errors and the cross-field errors are collected
  and returned together; the bulk test gains a body `userId` that differs
  from the path. → **3A-6, 3B-9**.
- **Where Gemini is wrong:** that the 415 rule hits `GET` and `DELETE`
  requests with no body. §9.6 limits it to "a body sent".

### 5.12 Numbers: precision, parsing, and what is displayed

- **Raised by:** Opus (C-1), Gemini (C-1 / A-3, Q7), Grok (technical
  error 1).
- **The finding:** (1) `decimal.js` works to 20 significant digits unless
  told otherwise (Opus, recalled). (2) Grok: "at most eleven decimals" is
  not true of a JSON number that has already been parsed into a binary
  float. (3) Two things a careful reader of the output will notice: a
  weight is returned as sent (`100.125`) next to a volume rounded to two
  decimals (`100.13`); and a delta is computed from unrounded values, so it
  can differ by 0.01 from the difference of the two numbers shown.
- **Real use, and what was checked:** (1) The largest product the ranking
  can form — the heaviest accepted weight in the unit with the largest
  factor, times thirty reps plus one — has 18 significant digits, so nothing
  fails at 20. Opus said 19; the count is 18. (2) All 10 000 001 accepted
  weights, 0.000 to 10 000.000 in steps of 0.001, were passed through
  `JSON.parse` and back to text: every one came back exactly as typed. No
  wrong value exists in the accepted range. (3) The delta case is real and
  ordinary: estimated maxima shown as 104.37 and 103.33 differ by 1.04 on
  screen while the delta says 1.03.
- **Position:** (1) follow as insurance: set the precision to 40 and let the
  existing registry test assert it. (2) No defect, but the design should say
  the rule that makes it so: a decimal is built from the number's shortest
  text form, and the three-decimal check is made on that text. (3) Two
  README sentences: originals are returned as sent, up to three decimals,
  and everything computed has two; a delta is computed from exact values and
  can differ by 0.01 from the difference of the two rounded numbers.
  → **3B-10, 3B-11**.
- **All three agree** that `numeric(17,11)` is enough for every unit and
  every accepted weight, and that store, rank, display and delta now agree.
  Grok: "Concede C-1."
- **Not followed:** rounding the top-level `weight` to two decimals
  (Gemini's alternative). D-24 returns the number the client sent.

### 5.13 PR messages, and a same-day tie

- **Raised by:** Opus (C-4), Grok (the medium-effort page, B-4).
- **The finding:** (1) Round 2's C-4 put the "this filter matches the whole
  exercise name" hint into the PR endpoint's empty message (§9.3) and not
  into compare's (§9.4). The two also quote different things: §9.3 the text
  the client typed, §9.4 the key. (2) Grok: the PR tie-break orders by the
  stored instant, and a date-only entry's instant is the earliest possible
  for its day. So if a date-only entry and a timed entry of the same day tie
  on a record, the date-only one always takes it.
- **Real use:** (1) *Who:* a client that sends half a name to compare. *How
  often:* as often as to the PR endpoint. *What they see:* an empty result
  with no reason. (2) *Who:* a lifter who logs the same exercise twice in
  one day, once with a time and once without, with the same best set. *How
  often:* almost never. *What they see:* the same record, the same date; the
  only visible difference is `performedAt: null` where a time could have
  been shown.
- **Position:** (1) follow: the same hint in both, both quoting the key.
  → **3B-8**. (2) No change to the order — adding `time_known` to the PR
  tie-break buys nothing a user can see. One sentence in §7 says what
  happens, so the answer exists if asked. → **3A-12**. The point is from the
  cut-off medium-effort reply and Grok's complete answer does not repeat it.

### 5.14 The history fallback

- **Raised by:** Gemini (O-8).
- **The finding:** the fallback query in §11 (written, not built) looks up
  each exercise key with a `LATERAL` branch, and the branches omit the
  `from` / `to` and cursor conditions. Each branch would then read from the
  newest row of its key instead of from the cursor.
- **Real use:** nobody until the fallback is built; then every page after
  the first.
- **Position:** follow, in the text only. → **3A-7**.

### 5.15 The estimate, and what is cut first

- **Raised by:** all three (Opus O-10 and Q6, Gemini Q6, Grok 3).
- **The finding:** slice 6 (the catalog's read side: four tables, the seed
  with its ledger, the snapshot, three GET routes) is priced at 1.75 h and
  slice 12 (five write routes, the guard, their tests) at 1.25 h. Opus puts
  them at 2.1–2.3 h and 1.6–1.9 h — about 1 h over. Gemini puts the two at
  about 4.75 h against 3.0 h — 1.5 to 2.0 h over. Grok gives no figure:
  "1.75 h is not believable", 1.25 h "is tight". This round's fixes add
  about 1.6 h net. Against that stands a 2.0 h buffer inside a 21.75 h core,
  stated as 20–22 h.
  All three also quote the same contradiction: §15 says that if time runs
  out "what is unfinished is the newest requirement and not a graded one",
  and §16 puts exercise create, update and delete on the never-cut list. As
  Grok has it: "Slice 12 is the real valve, which §15 admits and §16
  forbids."
- **Real use:** *Who:* the candidate, who states this number to Everfit
  before starting (D8) and is asked about it afterwards. *How often:* once.
  *What they see:* a stated range missed by two to three hours, or a
  never-cut item cut on the last evening.
- **Position:** this is the candidate's. D-26 already records that the
  number is theirs, and that keeping exercise create, update and delete off
  the cut list was the owner's choice. The reviewers do not agree on the way
  out. Opus and Gemini keep the scope and cut elsewhere; Grok moves exercise
  create, update and delete onto the cut list, which reopens the owner's
  decision. My recommendation is to restate the range and keep the decision.
  → **3C-1**, and the §15 sentence follows whichever option is taken
  → **3A-4**.
- **Cut order.** Opus moves the two muscle-group write routes ahead of
  `GET …/workout-entries/{id}`: that route is the target of the `Location`
  header, which is graded API design (V2), while a new group is one SQL
  insert and groups change a few times a year. Gemini wants the opposite:
  keep the two routes, which are about twenty lines and carry the "closed
  list held as data" story, and cut the route and the seed planner's unit
  tests first. I side with Opus on the order. → **3C-2**.
- **Test trimming.** Opus would drop the catalog integration cases that
  repeat the seed planner's unit tests; Gemini would drop the unit tests.
  My call (9 F): keep the unit tests as the case matrix, and keep the
  integration cases that exercise SQL the unit tests cannot — run twice, a
  deleted seeded row stays deleted, and the new case of 5.2. The two
  integration cases that only repeat the matrix go. → **3A-16**.

### 5.16 Found by the author while checking

- **Exercise keys in URL paths.** No reviewer raised it. A key is a
  normalised name and can contain `/`, `?`, `#` or `%` — "90/90 Hip
  Stretch", "Hip Abduction/Adduction". §10.5 shows
  `Location: /v1/exercises/bench%20press` and does not say how the key is
  encoded. *Who:* an admin adding such an exercise. *How often:* a few
  entries in any real catalog. *What they see:* a `Location` that answers
  404, and an exercise that cannot be changed or deleted through its URL.
  The rule: `Location` is built with `encodeURIComponent(key)`; one test
  creates an exercise with a slash in its name, follows `Location`, then
  PUTs and DELETEs it; the README notes that a proxy which rewrites `%2F`
  needs configuring. That the framework decodes `%2F` inside one path
  parameter is recalled and is what the test confirms. → **3B-12**.
- **`WWW-Authenticate` on the guard's 401** — in 5.7.

### 5.17 Leftovers of the old design

Question 5 asked each reviewer to quote anything that still assumes a
catalog file read at boot, four-decimal kilograms, an idempotency key in the
plan, `set_count`, a `user_exercises` table, a date-only value at midnight
UTC, or one order for the bulk response and history.

- **None of the seven was found in a live sentence.** Grok: none; the
  closest are marked as history. That part of the sweep after round 2 held.
- **Real leftovers of this revision** (Opus): `npm run seed:bench` and
  `scripts/seed-bench.ts`, after call 10 renamed the profile; design §17
  listing eleven author's calls where `resolution.md` §17 lists ten; U-10
  against §12 (5.9). → **3A-14, 3A-15, 3A-3**.
- **Not a leftover:** Gemini quotes D-22's "two requests and a later retry
  instead of twenty identical ones" as an idempotency-key remnant. It is in
  the decision's round-1 history and labelled as such.
- **Now out of date because of this round:** every sentence that says the
  catalog change has been reviewed by nobody. → **3A-17**.

## 6. Where the reviewers disagree with each other

| Topic | Positions | Mine |
|---|---|---|
| Verdict | Opus, Gemini: ready after the fixes. Grok: not ready as written | The same list either way; "not ready" overstates a set of rules of a sentence or two each |
| Boot rule (call 2) | Opus: start, and report not-ready until the catalog loads. Gemini, Grok: keep the exit | Keep the exit; add the restart policy and the "does not listen" sentence (5.5) |
| Catalog GET routes (call 7) | Gemini: serve them from the snapshot, or refresh on an unknown group. Opus, Grok: keep reading the tables | Keep (5.4) |
| A file exercise whose groups are missing | Opus: skip and record. Gemini: skip, do not record. Grok: any missing group → do not insert or record | Insert with the remaining groups; if none remains, skip and do not record (5.2) |
| Guard activation test | Opus: on the real controller. Gemini: on a dummy controller | The real one (5.7) |
| "One line" | Opus: it is two, with the import. Grok: the commented line is the shape O1.1 names | Say two lines |
| A sixth place for the warning | Opus: a boot `WARN`. Gemini, Grok: five is enough | Five |
| Size of the overrun | Opus: about 1 h. Gemini: 1.5–2.0 h. Grok: no figure | Between the two; see 9 E |
| What to cut | Opus: muscle-group routes before `GET …/{id}`. Gemini: keep those routes; cut `GET …/{id}` and the seed unit tests. Grok: make exercise create, update and delete cuttable | Opus's order; Grok's is the candidate's to accept or not (3C-1, 3C-2) |
| Which seed tests to trim | Opus: the repeated integration cases. Gemini: the unit tests | Opus's |
| Call 10's rename | Opus: finish it in the script names. Gemini, Grok: nothing to do | Finish it |
| Same-day PR tie | Grok (cut-off reply): add `time_known` to the order. The others: not raised | One sentence, no change |

## 7. What was checked, and what was not

**Run on this machine (Node 26, `Temporal` built in; exact decimal
arithmetic):**

| Claim | Result |
|---|---|
| `instant.toZonedDateTimeISO('Z')` fails | Confirmed: `RangeError`. `'UTC'`, `'+07:00'`, `'-05:00'` work |
| A non-existent date is rejected by `Temporal` | Confirmed for `PlainDate.from('2025-02-30')` and for an instant with that date |
| The constant-time comparison throws on unequal lengths | Confirmed: `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH` (Gemini's "`RangeError`" names the wrong error; the effect is the same) |
| The largest ranking product needs more than 20 digits | No: 18 significant digits (Opus: 19) |
| A JSON number can arrive different from what was typed | No: 10 000 001 accepted weights, 0 mismatches |
| A delta can differ from the visible difference | Confirmed: 104.37 and 103.33 shown, difference 1.04, delta 1.03 |
| `100.125 kg × 1` shows `weight: 100.125` and `volume: 100.13` | Confirmed |

**Confirmed by reading the documents:** every contradiction and omission in
5.1–5.11, 5.13–5.15 and 5.17 — the sentences are quoted in the reviewers'
files and are in the design as they say.

**Not checked — recalled by a reviewer or by me, and marked so above:**

- `decimal.js`: default precision of 20; that it converts a number through
  its text form.
- That the migration library takes no lock of its own.
- What a TypeScript file outside `src/` does to the build output, and
  whether the image prunes the migration tool.
- That compose leaves an exited `api` down without a `restart:` policy.
- That an unused import fails the lint step as configured.
- What the validation pipe does with an array body, and that a pipe cannot
  see path parameters.
- That NestJS finishes `onModuleInit` before it listens.
- That the framework decodes `%2F` inside one path parameter.
- That HTTP requires `WWW-Authenticate` on a 401.

Each of these is settled by a test the list already contains, in the slice
where it first matters. None is a reason to wait.

## 8. Where the reviewers were wrong, or only partly right

| Reviewer | Claim | What is the case |
|---|---|---|
| Gemini | The 415 rule rejects `GET` and `DELETE` requests without a body | §9.6 applies it to "a body sent" |
| Gemini | A name can produce an empty key | Not reachable: a name is non-empty after trimming, and the function removes nothing else |
| Gemini | D-22 still assumes an idempotency key | The sentence is in the decision's round-1 history |
| Gemini | The guard's comparison throws `RangeError` | It throws `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH`; the finding stands |
| Opus | The largest product has 19 significant digits | 18; the recommendation (raise the precision) is still cheap insurance |
| Grok | CI can read the catalog before the seed is visible | `api` starts after `migrate` completes, and the route reads the tables |
| Grok | A JSON number parsed as a float breaks the eleven-decimal bound | No accepted weight changes (checked). Grok itself adds that it "will not show up in grading" |
| Grok | "Not ready to build as written" | Every item is a rule to write down, plus the estimate |
| Grok | Move exercise create, update and delete to the cut list | Reopens the owner's decision; offered to the candidate as an option, not adopted (3C-1) |
| Grok (cut-off reply) | §12's "an edited seeded row survives a re-run" contradicts step 2 of the seed | A seeded item is in the ledger and is skipped whole. The exposed case is the admin-*created* exercise (5.2) |
| Grok (cut-off reply) | A date-only entry wrongly takes a tied record from a timed entry of the same day | True of the order, invisible in the result (5.13) |

Rates: the overlap of two refreshes is about one admin write in several
thousand; a response mixing two snapshots, a handful a year. Both are
accepted for the written rule, not for the frequency.

## 9. The list to decide

Codes carry a `3` so that they cannot be confused with the round-2 list.

### A. Corrections

Sentences and rows that are wrong or out of step. No design choice in any of
them.

| # | Where | Correction | Found by | Hours |
|---|---|---|---|---|
| 3A-1 | Design §12 (toolchain), §15 slice 1 | Slice 1 reaches a Testcontainers PostgreSQL that answers `SELECT 1`; "migrated" belongs to slice 3 | Opus | 0 |
| 3A-2 | Design §12, §15 | The clean-image check asserts readiness and applied migrations in slice 3, and the seeded exercise from slice 6 | Opus, Gemini, Grok | 0 |
| 3A-3 | Research notes U-10 | Describe the same check as §12 | Opus, Gemini, Grok | 0 |
| 3A-4 | Design §15 | The "newest requirement" sentence is rewritten to agree with §16, whichever option of 3C-1 is taken | all three | 0 |
| 3A-5 | Design §8, shapes 1 and 2 | A `Z` instant is converted with `UTC`; a date alone is parsed with `Temporal.PlainDate.from`, and a non-existent date is a 400 | Gemini | +0.05 |
| 3A-6 | Design §9.6, §13 | 415 compares the media type and ignores parameters such as `charset`; one `charset=utf-8` case in the first-request test | Gemini, Grok | +0.05 |
| 3A-7 | Design §11, history fallback | Each `LATERAL` branch carries the `from` / `to` and cursor conditions | Gemini | 0 |
| 3A-8 | Design §10.2 | "Never a mixture" is stated as the result of the per-request rule of 3B-3 | all three | 0 |
| 3A-9 | Design §10.2, §13 | The process does not listen until the first load succeeds; `api` has `restart: on-failure`; the "restart on a real outage" sentence follows from that | Opus, Grok | 0 |
| 3A-10 | Design §5 | `ON DELETE RESTRICT` gives a 409 through the error mapping of 3B-1, not by itself | Opus | 0 |
| 3A-11 | Design §4, §10.3, §13 | The migrate step is one compiled entry point: migrations through the library, then the seed; nothing in the runtime image needs a development dependency | Opus | 0 |
| 3A-12 | Design §7 | One sentence: on a tie within one day, a date-only entry comes before a timed one | Grok | 0 |
| 3A-13 | Design §8, §12 | The date-only ordering tests say that the two entries share a date | Grok | 0 |
| 3A-14 | Design §17, `resolution.md` §17 | One count of the author's calls in both places | Opus | 0 |
| 3A-15 | Design §4, §11; README | `seed:bench` → `bench:data`, `scripts/seed-bench.ts` → `scripts/bench-data.ts` | Opus | 0 |
| 3A-16 | Design §12 | Catalog seed tests: the unit tests are the case matrix; integration keeps "run twice", "a deleted seeded row stays deleted" and "an admin-created exercise keeps its groups"; the two cases that repeat the matrix go | Opus | −0.15 |
| 3A-17 | Design §17; decision log header and D-27 status; research notes; `04-debate-brief.md`; `resolution.md` §17 and §19 | "No reviewer has seen this" becomes "reviewed in round 3" with a pointer to this file | author | 0 |

### B. Recommended changes

Ordered so the candidate can stop after any group.

| # | Change | Found by | Hours |
|---|---|---|---|
| | **Group 1 — a wrong result or a broken promise if left** | | |
| 3B-1 | Admin writes: one transaction each; POST by `INSERT … ON CONFLICT DO NOTHING RETURNING` (no row → 409); PUT starts with `UPDATE … RETURNING` (no row → 404); a foreign-key error is a 400 listing the known groups on an exercise write and 409 `MUSCLE_GROUP_IN_USE` on a group delete; one two-POSTs-at-once test | Opus O-1, Gemini O-2, Grok 1 | +0.3 |
| 3B-2 | Seed: links only for an exercise this run inserted; the lock first, the ledger read after it; the ledger insert `ON CONFLICT DO NOTHING`; one lock around the whole migrate entry; the missing-group rule of 5.2 | Opus O-2, Gemini O-1, Grok 2 | +0.15 |
| 3B-3 | Snapshot: one object per request; single-flight refresh with a load number; a one-statement load; refresh after the commit, never failing the write | Opus O-3, Gemini O-3, Grok 4 | +0.25 |
| 3B-4 | The filter's unknown-group check and its key list both use the request's snapshot; D-18 reworded; the README says what another replica shows for up to 30 s | Opus, Gemini, Grok 7 | +0.05 |
| | **Group 2 — what the grader reads and tries first** | | |
| 3B-5 | A golden test pinning `exerciseKey()`; one `muscleGroupName()` used by the admin API, the seed file and the filter; repeats removed after normalising | Opus O-7, Gemini O-6 | +0.15 |
| 3B-6 | Guard: digest comparison; a wrong-length token in the unit test; a test that applies the guard to the real controller; `WWW-Authenticate: Bearer`; the documents say two lines | Opus O-6, Gemini O-7, Grok | +0.25 |
| 3B-7 | Open-routes statement: "through these routes"; the rest of the API has no authentication either (T4); a deleted seeded exercise is not restored by a redeploy, and how to restore it; deleting a group makes its filter a 400; catalog size is not limited | Opus O-9, Gemini, Grok 6 | +0.1 |
| 3B-8 | The whole-name hint in compare's empty message too; both messages quote the key | Opus | +0.05 |
| 3B-9 | One `errors[]`: stated as the result; the bulk test gains a body `userId` that differs from the path | Gemini O-4 | +0.15 |
| | **Group 3 — numbers and paths** | | |
| 3B-10 | Decimal precision set to 40 and asserted by the registry test; decimals built from the number's shortest text | Opus; Grok's point, as checked | +0.05 |
| 3B-11 | Two README sentences: originals up to three decimals, computed values two; a delta comes from exact values and can differ by 0.01 from the visible difference | Opus, Gemini | +0.05 |
| 3B-12 | `Location` built with `encodeURIComponent(key)`; one test with a slash in an exercise name through create, read, update and delete; a README note on proxies and `%2F` | author | +0.1 |

### C. The candidate's calls

| # | Question | Options | My recommendation |
|---|---|---|---|
| 3C-1 | What estimate to state (D8), now that three reviewers say the catalog slices are 1.0–1.75 h under and this round adds about 1.6 h? | (a) restate the range at about **23–25 h**, keep the 2.0 h buffer, take the CI benchmark job and the schema drift check as cuts from the start, cut nothing graded · (b) hold **20–22 h** by moving exercise create, update and delete from "never cut" to the end of the cut list — this reopens the owner's catalog decision 6, and frees at most about 1 h · (c) change nothing and record the reviewers' doubt as a known risk | **(a).** It is the only option that keeps both the owner's decision and a number that can be defended in the interview. (b) is Grok's and is consistent, but it makes the owner's own requirement the first thing to go. (c) states a range three reviewers and the author expect to miss. |
| 3C-2 | Which is cut first: the two muscle-group write routes, or `GET …/workout-entries/{id}` with the `Location` header? | (a) the two muscle-group routes first (Opus) · (b) the current order, `GET …/{id}` first (Gemini) | **(a).** `Location` pointing at a working route is graded API design (V2). A new muscle group is one SQL insert, already documented as the fallback, and groups change a few times a year. |

### D. Not followed

| Suggestion | From | Reason |
|---|---|---|
| A cap on catalog size (2 000 exercises, 100 groups) | Opus O-9 | The same exposure as unlimited entry POSTs; a gateway's job, as requirements §10 says |
| Start without a catalog and report not-ready | Opus O-8 | Makes readiness depend on the catalog, which §10.2 avoids on purpose; one rule is easier to defend than two |
| A boot `WARN` as a sixth place | Opus | Two reviewers say five is enough; nobody reads the log of a take-home |
| Serve the catalog GET routes from the snapshot, or refresh once on an unknown group | Gemini call 7 | An admin's read-after-write through another replica would 404 for up to 30 s |
| `exerciseKey(name).length >= 1` | Gemini O-6 | Not reachable |
| Round the top-level `weight` to two decimals | Gemini | D-24 returns the number as sent |
| Mount the guard on a dummy controller in the test | Gemini | The claim under test is about the real five routes |
| `time_known` in the PR tie-break | Grok (cut-off reply) | No visible difference; one sentence instead (3A-12) |
| Do not insert a file exercise if any of its groups is missing | Grok 2 | Withholds a usable exercise over one tag; the warning already reports it |
| Treat D-22's round-1 sentence as a leftover | Gemini | It is labelled history |

### E. Effect on the estimate

| | Hours |
|---|---|
| Core rows in §16 today, buffer of 2.0 included | 21.75 |
| Corrections with a cost (3A-5, 3A-6) | +0.1 |
| Group 1 (3B-1 to 3B-4) | +0.75 |
| Group 2 (3B-5 to 3B-9) | +0.7 |
| Group 3 (3B-10 to 3B-12) | +0.2 |
| Test trimming (3A-16) | −0.15 |
| **Everything recommended** | **≈ 23.35** |
| The reviewers' doubt about slices 6 and 12 as priced | +1.0 (Opus) to +1.75 (Gemini) |
| **With that doubt priced in** | **≈ 24.35 to 25.1** |

Gemini's figure may already contain some of its own fixes, so the top of
that range may count them twice. The cut list in §16 carries hours only for
the two muscle-group routes (about 0.3 h); pricing the other items belongs
to the apply step if option 3C-1 (a) or (b) is taken. Under (a) the stated
range becomes about 23–25 h. Under (b), cutting slice 12 down to nothing
frees at most 1.25 h, which brings "everything recommended" to about 22.1 h
and leaves the reviewers' doubt unanswered. The number is the candidate's to
state before the first line of code.

### F. Decided by the author

Minor calls made while reading the reviews. Each can be redirected.

| Call | Why |
|---|---|
| A file exercise with a missing group is inserted with the groups that remain; with none left it is skipped, warned about and not recorded in the ledger | Keeps the 1–10 groups rule; keeps the conflict visible on each deploy until someone resolves it |
| The guard is switched on by two lines, the import and the decorator | True under any lint or compiler setting; no rule needs disabling |
| The boot rule stays fail-fast, with `restart: on-failure` | One rule for "no catalog"; the stale case keeps serving |
| Catalog GET routes keep reading the tables | An admin checking a change must see the database |
| The benchmark data command is `bench:data` | Finishes call 10; "seed" then means one thing in the repository |
| Both PR messages quote the key | The key is what was searched for |
| The PR tie-break is unchanged; §7 gains one sentence | No user-visible difference |
| Seed tests: unit tests are the matrix, three integration cases stay | The integration cases kept are the ones that need real SQL |
| The guard's 401 carries `WWW-Authenticate: Bearer` | Standard for a Bearer scheme; one line |
| Exercise keys are percent-encoded in `Location`, with one slash-name test | Real catalogs contain names with a slash |

## 10. Interview questions the reviewers raised

Fifteen questions from three reviews, merged to thirteen. Each names where
the answer lives once the list above is applied.

1. Two POSTs of "Bench Press" arrive at once. What locks, which database
   error occurs, what status does each caller get, and how many rows exist?
   — 3B-1.
2. Two admins PUT the same exercise at the same moment. What is stored, and
   can either see a half-written exercise? — 3B-1; last write wins, inside
   one transaction.
3. An admin creates "Zercher Squat" with two groups; the next release's file
   lists it with different ones. Walk through the seed. — 3B-2.
4. An admin deletes "triceps"; a later file still names it on a new
   exercise. What is stored, what goes into the ledger, and can a later file
   repair it? — 5.2 and 9 F.
5. Every seeded exercise is deleted through the open routes. Why does a
   redeploy not bring them back, and how do you restore them? — 3B-7; each
   item is seeded once, by the owner's decision.
6. An admin creates an exercise on replica A and filters history on replica
   B. Which copy answers, and can one response show both the old and the new
   catalog? — 3B-3, 3B-4.
7. Replica B lists a new muscle group and then answers 400 when it is used
   as a filter. Is that a bug? — 3B-4; the stated 30-second window.
8. Can a `?muscleGroup=chest` response contain an entry that is not tagged
   `chest`? — 3B-3; not when the request reads one snapshot.
9. A stale catalog keeps a replica in rotation, yet a missing one stops the
   process. Why two rules? — 5.5; stale tags are usable, no catalog is not.
10. `exerciseKey()` folds hyphens in version 2. What happens to the ledger,
    to deleted exercises, and to a lifter's records? — 3B-5; it is a data
    migration, and the golden test is what makes the change visible.
11. Why is the guard a commented-out line and not "open when
    `ADMIN_API_TOKEN` is unset"? What happens if it is uncommented with an
    empty token? What can a stranger do today, including with a million
    exercises? — D-27, §10.7 (it fails closed), 3B-7.
12. Where is `225 lb` still exact and where is it `102.06`? Which number
    breaks a volume tie, and why does `100.125 kg × 1` show a volume of
    `100.13`? — D-24, 3B-11; exact kilograms are stored and ranked, two
    decimals are displayed.
13. Which slice overruns first, and what do you cut? — 3C-1, 3C-2.
