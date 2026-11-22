# Round 3 — review of the changes since round 2

This is the text given to every round-3 reviewer. The files it lists follow
it in the same message, each under a line `===== FILE: <name> =====`.

## Your role

You are a senior backend engineer reviewing **changes to a design proposal**
for a take-home assignment, before any code is written. Find what is wrong,
risky, contradictory, or weaker than an available alternative. Do not
approve, summarise or praise.

## Context

- The assignment is a "Workout Logging API" for a Backend Engineer role at
  Everfit (a coaching platform). The brief is restated line by line, with
  IDs, in `01-requirements.md`.
- It is graded on system design, API design, code architecture,
  problem-solving, error handling, testing, production readiness, and —
  marked "Critical" — how well the candidate directs AI tools.
- Human reviewers will run it with `docker compose up`, read the README and
  the git log, and probably discuss it in an interview. The candidate must
  be able to defend every choice out loud.
- Stated effort: 20–22 hours of implementation. Nothing is built yet.
- The design has been through two review rounds by several models. This
  round does not repeat them.
- The documents say "the owner" where the candidate's own added requirement
  is meant and "the candidate" elsewhere. They are the same person.

## What this round reviews

Only what changed after the round-2 reviews were written. Two things did.

### Part A — the round-2 list, as applied

Round 2 ended in one list: fourteen corrections (A-1 … A-14), fourteen
recommended changes (B-1 … B-14) and four calls for the candidate
(C-1 … C-4). The candidate approved the list and took the recommended option
on every call. The documents now claim that every item is applied. **No
reviewer has seen the result.**

The list is the file `round-2-list.md` below (the columns naming which
reviewer raised each item are removed). `debate/resolution.md` §12–§15 says
which decision each item changed. The largest edits:

| Change | Decisions | Design |
|---|---|---|
| Kilograms stored exactly, `numeric(17,11)`, never rounded on write | D-08, D-24 | §5, §6 |
| Two orders, each stated and tested: the bulk response in request order; history lists one day's date-only entries newest id first | D-14, D-20 | §9.1, §9.2, §12 |
| A date-only entry's ordering value is midnight UTC of its date minus 14 hours | D-09 | §5, §8 |
| Cursor built from the stored row; a mixed timed / date-only paging walk at page size one | D-10 | §9.2, §12 |
| Time parser chosen by input shape; the gap and overlap rule; the offset-less error names the instant, not the day | D-09 | §8, §9.6 |
| Both compare periods read in one read-only snapshot; the response inside `data`; `message` names the empty period | D-13 | §9.4 |
| The idempotency key is out of the plan; the README describes it as the next step | D-15 | §9.5 |
| History fallback: a per-key lookup on the existing index, no `user_exercises` table | D-16 | §11 |
| PR query: no "one pass" claim; a fixed ranking test that is never cut; the fallback ladder gains a first rung | D-11 | §9.3, §11, §12 |
| 415 for a non-JSON body; clear 400s for wrong body shapes; one `errors[]` per request | D-18, D-19 | §9.1, §9.6 |
| `set_count` dropped | D-06 | §5 |
| Toolchain proved in the first slice; test database in a non-UTC zone; clean-image check in CI | D-22, D-23 | §12, §13, §15 |
| Benchmark method | D-22 | §11 |
| Estimate and cut order | D-26 | §16 |

For Part A the question is not whether the list was right — round 2 argued
that. It is: **was each item applied correctly and in every place it
touches, and did applying it break something else?**

### Part B — the exercise catalog moved into the database

After round 2 the candidate added a requirement of their own (`O1`, `O1.1`
in `01-requirements.md` §11): the exercise catalog must be changeable
without a developer or a deploy; authorization is off for now; the guard
must be easy to enable later; the documents must say openly that the write
endpoints are unauthenticated. This reversed the catalog design that both
earlier rounds had approved (a JSON file read at boot). **No model has
reviewed any of it.** Where it is:

- `03-decision-log.md`: D-07 (revised) and D-27 (new).
- `02-design.md`: §5 "Catalog tables"; all of §10; and wherever the catalog
  touches §2, §4, §9, §11, §12, §13, §14, §15 and §16.
- `01-requirements.md`: the last paragraph of §10, and §11.
- `debate/resolution.md`: §17 (the owner's six decisions and the ten calls
  the author made while applying them) and §18 (the estimate).

## What is not under review

- Anything unchanged since round 2. Do not reopen PostgreSQL vs MongoDB,
  Drizzle, Epley, keyset pagination, the time model as a whole, and so on,
  unless a change above broke it.
- The requirement itself (`O1`, `O1.1`). Treat it as given.
- The owner's six catalog decisions (`debate/resolution.md` §17, first
  table): the key is fixed on rename; delete removes the catalog row only;
  a closed muscle-group list held as data; each seed item given to a
  database once; write routes under `/v1/admin/…`; the catalog is core
  scope at 20–22 h. Object to one only if you can show a real case in which
  it loses data, breaks a requirement of the brief, or cannot be built as
  written.
- Version numbers. They may be newer than your training data and were read
  from the live registries. Do not correct them from memory.

## Rules

1. **Attack, do not summarise.** No praise, no restatement of the design.
2. **Judge against the brief**, citing requirement IDs (`F2.1`, `E5`, `X2`,
   `O1` …), not against general preference.
3. **Be concrete.** "Use X instead" comes with what changes in the schema,
   query, API or text, and what it costs in hours.
4. **Say how you know.** Mark each factual claim *from the documents* (give
   the section), *recalled* or *judgment*. You have no tools in this run.
5. **Respect the scope.** This is a 20–22-hour take-home, not a platform.
   An objection that adds machinery must show it earns marks in the brief
   or prevents a failure a reviewer will actually meet.
6. **Concede in one line** where a change is right, so that disagreement
   between reviewers is easy to see.
7. **Ground every objection in real use.** Name who sends that input or
   reaches that state — a grader running `docker compose up` with the brief
   open, a real client application, a real lifter, an admin maintaining the
   catalog, a second replica — and roughly how often. An example built from
   values or timings nobody produces is not a finding, however correct its
   arithmetic. Facts to hold examples against: plates step by 0.5 kg or
   2.5 lb as a rule, by 0.25 kg or 0.5 lb with small plates, by 0.125 kg or
   0.25 lb at the finest; lifters who train in pounds mostly load round
   numbers, in 5-lb steps; a set is 1–30 reps; a session is 5–12 exercises
   of 3–6 sets, and a main lift runs to six to ten sets once warm-ups are
   logged; a committed lifter logs 1 000–2 500 entries a year. A catalog
   holds a few hundred exercises, has one or two editors, and changes a few
   times a day at most.
8. Do not write calendar dates in your answer. Do not create or edit files;
   answer in Markdown only.

## Questions to answer

Answer each in a few lines, with the section you relied on.

1. **Seed.** Walk through: two `migrate` steps running at once; an admin
   write arriving while the seed runs; an item whose insert hits
   `ON CONFLICT DO NOTHING` and is still recorded in the ledger; a file
   exercise that names a group an admin has deleted; the key function
   changing in a later release, with ledger keys already written. Does any
   of these lose data, bring deleted data back, or stop a deploy?
2. **Snapshot.** A replica can serve a catalog up to 30 seconds old. Who
   sees what — for example an admin who creates an exercise on one replica
   and reads history through another? Can one response mix two generations
   of the catalog? Is the boot rule (retry about ten seconds, then exit)
   right for compose and for a real outage? Can two refreshes overlap?
3. **Admin writes at the same time.** Two POSTs of the same name; a PUT
   replacing an exercise's groups while one of those groups is deleted; a
   DELETE during a PUT. Which of these ends in a 500 or a half-written
   exercise as the design is written, and what is the smallest rule
   (transaction, lock, error mapping) that closes it?
4. **Open routes.** Is the statement of what an anonymous caller can and
   cannot do complete and honest? Is a tested guard left off by one
   commented-out line the right shape, against a run-time switch or no
   guard code at all? Are the five places enough, or too many?
5. **Leftovers.** Quote any sentence, table row, test, slice, estimate row
   or cut-list item that still assumes: a catalog file read at boot;
   kilograms at four decimals; an idempotency key inside the plan;
   `set_count`; a `user_exercises` table; a date-only ordering value at
   midnight UTC; one order shared by the bulk response and history.
6. **Estimate.** Are 1.75 h for the catalog's read side (four tables, the
   seed with its ledger, the snapshot, three GET routes) and 1.25 h for
   administration (five write routes, the guard, their tests) believable?
   The core is 21.75 h with a 2.0 h buffer inside a stated 20–22 h. What
   goes first if it slips?
7. **Exact kilograms.** Is `numeric(17,11)` enough for every unit in the
   registry and every weight the validation allows? Does any output,
   comparison, tie-break or delta now disagree with another place in the
   documents?

## Response format

Start with one line: `Model: <the model you are>`. Then:

1. **Verdict** — at most five lines: ready to build / ready after the fixes
   listed / not ready.
2. **Part A — items applied wrongly or incompletely.** A table:
   item (A-n / B-n / C-n) · where · what is wrong · fix. Then anything the
   revision broke that is not tied to one item. Write "none found" if so.
3. **Part B — rulings.** For D-07 (revised) and D-27: Keep / Change / Keep
   with modification, confidence (High / Medium / Low), the single strongest
   argument.
4. **The ten calls** (`debate/resolution.md` §17, "Calls the author made"):
   a table — # · Keep / Change · confidence · the strongest argument, and
   the change if you ask for one.
5. **Answers to the seven questions.**
6. **Detailed objections** — at most ten, most serious first. Each with:
   Target (decision and section) · Problem · Who hits this, and how often ·
   Evidence (from the documents / recalled / judgment) · Proposed change ·
   Cost in hours.
7. **Contradictions between documents** — quote both places.
8. **Technical errors** — statements about PostgreSQL, NestJS, Node, HTTP
   or `Temporal` that are false as written.
9. **Cut / add** — what you would remove or add inside 20–22 h.
10. **Interview questions** the changes invite — at most five.

## Files that follow

1. `01-requirements.md`
2. `02-design.md`
3. `03-decision-log.md`
4. `05-research-notes.md`
5. `debate/resolution.md`
6. `round-2-list.md` — section 9 of the round-2 summary
