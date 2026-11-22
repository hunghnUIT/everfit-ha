# Round 4 — review of the time-model change

This is the text given to every round-4 reviewer. The files it lists follow
it in the same message, each under a line `===== FILE: <name> =====`.

It is kept as given, so the three round-4 answers stay comparable. Round
4's outcome is applied since (`round-4-summary.md`, `resolution.md` §22):
the offset is now stored for display (`utc_offset_minutes`, returned as
`utcOffset`), a zone in brackets is accepted and ignored, and the
daylight-saving test became a boundary test. The tables below describe the
design as the reviewers saw it.

## Your role

You are a senior backend engineer reviewing **one change to a design
proposal** for a take-home assignment, before any code is written. Find what
is wrong, risky, contradictory, or weaker than an available alternative. Do
not approve, summarise or praise.

## Context

- The assignment is a "Workout Logging API" for a Backend Engineer role at
  Everfit (a coaching platform: coaches follow their clients' training). The
  brief is restated line by line, with IDs, in `01-requirements.md`.
- It is graded on system design, API design, code architecture,
  problem-solving, error handling, testing, production readiness, and how
  well the candidate directs AI tools.
- Brief items that matter here: F1 (an entry has a field called `date`),
  F2.2 (filter history by date range), F3.5 (compare PRs across a time
  range, e.g. "this month vs last month"), E4 (timezone handling: document
  the strategy; UTC storage recommended; explain trade-offs), E6 (50 000+
  entries per user), T4 (no authentication; `userId` is a path parameter).
- Human reviewers will run it with `docker compose up`, try it with curl or
  Postman, read the README, and probably discuss it in an interview. The
  candidate must be able to defend every choice out loud.
- The design has been through three review rounds. This round does not
  repeat them. "The owner" and "the candidate" are the same person.

## What changed — the only thing under review

Until round 3 the design stored **two** values per entry: the UTC instant
(`performed_at`) and the athlete's local calendar date (`performed_on`),
derived from the offset in the input or from an optional `timeZone` field.
Every filter, PR date, comparison, sort and index led with the local date.
A date sent alone was accepted, with a made-up ordering instant and
`performedAt: null`. That version is in the file `BEFORE.md` below.

The owner then found a case it handled badly. An athlete logs
`2025-02-10T05:30:00+07:00` in Vietnam and `2025-02-10T20:30:00-07:00` in
the US. The two workouts are 29 hours apart, yet both were filed under
Feb 10: no date range could separate them, and no viewer's timeline matched
the stored days.

The design now stores **only the UTC instant**. In short (full text in
`02-design.md` §8 and `03-decision-log.md` D-09):

| Point | Now |
|---|---|
| Storage | `performed_at timestamptz(3)` only. No local date, no flag, no zone, no offset |
| Write | `date` has one format: an ISO-8601 / RFC 3339 date-time with `Z` or an offset; the offset finds the instant and is discarded. A date alone, or a date-time with no offset, is a 400 whose message shows a full date-time to send. A zone in brackets is a 400. A client that knows only the day chooses the time; the README recommends noon in the athlete's own offset |
| Write bounds | No later than now + 15 minutes; nothing before 1900-01-01 |
| Read | `from` / `to` on history and PRs, and the four bounds of compare, are instants forming a half-open range `[from, to)`. No zone parameter. The caller computes "this month" in its viewer's zone. A space where a query string turned `+` into one is read back as `+` |
| Order | Sort, keyset cursor and both indexes on `(performed_at, id)`; PR ties go to the earliest instant, then id, then set number |
| Response | `date` is the stored instant (`…000Z`); `performedAt` is gone |
| Not stored, by decision | A user-settings table (a stored zone goes stale when the user travels); the original offset (every workout is shown in the viewer's zone; storing the offset is the README's next step) |
| Tests | The process runs in `Asia/Ho_Chi_Minh` and the test database's session zone is `America/Los_Angeles`; a test computes Los Angeles week bounds across a daylight-saving change |

**No model has reviewed this change.** `debate/resolution.md` §21 records
how it was made, including one rule that was applied and then reversed
(accepting a date alone as 12:00 UTC).

## What is not under review

- The time estimate, the delivery slices and the cut list. Do not comment on
  hours.
- Anything the change did not touch: units, the exercise catalog, the admin
  routes, Epley, PostgreSQL vs MongoDB, Drizzle, and so on.
- Version numbers. They were read from the live registries and may be newer
  than your training data.

## The owner's decisions

Treat these as given unless you can show a **real case** in which one loses
data, breaks a requirement of the brief, or misleads its user — then say so
plainly and mark it as a question for the owner:

1. Store only the UTC instant.
2. One input format for `date`; a date alone is a 400.
3. Half-open instant ranges on reads, with no zone parameter.
4. Order and indexes on `(performed_at, id)`.
5. No user-settings table and no stored offset in v1.
6. Write bounds of now + 15 minutes and 1900-01-01.
7. `date` as the response field.

The author's own calls, which you may overturn freely: reading a space back
as `+` in a query bound; refusing a zone in brackets; `from >= to` as a 400;
one error message for a date alone and for a missing offset; the
daylight-saving bounds test and a README recipe for period bounds; keeping
the two non-UTC test zones.

## Rules

1. **Attack, do not summarise.** No praise, no restatement of the design.
2. **Judge against the brief**, citing requirement IDs (`F2.2`, `E4` …),
   not against general preference.
3. **Be concrete.** "Use X instead" comes with what changes in the schema,
   query, API or text.
4. **Say how you know.** Mark each factual claim *from the documents* (give
   the section), *recalled* or *judgment*. You have no tools in this run.
5. **Respect the scope.** This is a take-home, not a platform. An objection
   that adds machinery must show it earns marks in the brief or prevents a
   failure a reviewer or a real user will actually meet.
6. **Concede in one line** where the change is right, so that disagreement
   between reviewers is easy to see.
7. **Ground every objection in real use.** Name who sends that input or
   reaches that state — a grader with curl and the brief open, a mobile
   client, a coach in another zone, a lifter who travels or moves, a client
   back-filling last week from a notebook, an importer of years of history —
   and roughly how often. An example built from values or timings nobody
   produces is not a finding, however correct its arithmetic. Facts to hold
   examples against: a lifter trains once or twice a day, rarely in the
   small hours; a session is 5–12 exercises, often logged together at the
   end with one time; a committed lifter logs 1 000–2 500 entries a year;
   phone clocks are set by the network.
8. Do not write calendar dates in your answer other than sample dates of the
   kind the documents use. Do not create or edit files; answer in Markdown
   only.

## Questions to answer

Answer each in a few lines, with the section you relied on.

1. **Real use.** Walk through: a coach and a client in different zones; an
   athlete who travels, and one who moves; a client back-filling a session
   whose time they do not remember; weekly or monthly totals on a coach's
   dashboard; a mobile app that queues entries offline; a grader's first
   curl request. Where does the new model give an answer its user would
   call wrong?
2. **Lost against before.** What could the old model answer that this one
   cannot? Is anything lost that an evaluator reading E4 would mark down?
3. **Interactions.** PR tie-break and compare semantics; keyset pagination
   and the two indexes; the two-step history query and the benchmark plan
   (§11); bulk logging and its response order; entries sharing one instant;
   millisecond precision; the tests under non-UTC zones; daylight saving;
   `[from, to)` against the inclusive dates a caller may expect; the `+` in
   a query string; the future and past bounds. Does any of these break, or
   behave in a way the documents do not state?
4. **The input contract.** Is one format with a 400 for a date alone the
   right call for a graded API whose field is literally called `date`? Is
   the error message enough? Is anything accepted that should not be, or
   refused that should not be?
5. **Leftovers.** Quote any sentence, table row, test or example in the
   files below that still assumes the old model: a local date column,
   `timeZone`, `performedAt`, `time_known` / `timeKnown`, inclusive
   `YYYY-MM-DD` filters, a date-only entry, or a ordering value made up by
   the server. Historical round records that say they are history do not
   count.

## Response format

Start with one line: `Model: <the model you are>`. Then:

1. **Verdict** — at most five lines: ready to build / ready after the fixes
   listed / not ready.
2. **Rulings** — a table: the seven owner's decisions and the six author's
   calls · Keep / Change / Keep with modification · confidence (High /
   Medium / Low) · the single strongest argument.
3. **Answers to the five questions.**
4. **Detailed objections** — at most eight, most serious first. Each with:
   Target (decision and section) · Problem · Who hits this, and how often ·
   Evidence (from the documents / recalled / judgment) · Proposed change.
5. **Contradictions between documents** — quote both places.
6. **Technical errors** — statements about PostgreSQL, node-postgres,
   NestJS, Express, HTTP, RFC 3339 or `Temporal` that are false as written.
7. **Interview questions** the change invites — at most five.

Keep the whole answer under about 2 500 words.

## Files that follow

1. `BEFORE.md` — design §8 and decision D-09 as they were before the change.
2. `01-requirements.md` — whole.
3. `02-design.md` — whole.
4. `03-decision-log.md` — excerpt: D-09, D-10, D-11, D-13, D-14, D-18,
   D-19, D-22.
5. `05-research-notes.md` — excerpt: V-13, V-17, K-15, K-18, U-22 to U-24.
6. `debate/resolution.md` — excerpt: §21.
