# 06 — AI Workflow Log (seed for `AI_WORKFLOW.md`)

The brief requires an `AI_WORKFLOW.md` with real examples of AI being wrong and
of AI suggestions being rejected (AI1–AI4). This file is the running log those
examples will come from. **Rule: only things that actually happened go here,
written at the time they happen.** Nothing below is reconstructed or invented.

Entry format: phase · tool · what happened · how it was caught · what was done.

## Tools used so far

| Tool | Used for |
|---|---|
| Claude Code (Claude Fable 5.2), with the Superpowers "brainstorming" skill | Reading the brief, requirement traceability, design proposal, decision log, debate brief |
| A second, fresh Claude sub-agent as "builder reviewer" | Independent read of the design for contradictions and technical mistakes |
| Grok 4.7 (Grok CLI), Gemini 3.8 Flash and GPT-OSS 120B (Antigravity CLI) | Round-1 adversarial design review using `04-debate-brief.md`, no web access |
| Claude Opus 5.5 (GitHub Copilot CLI) | Same brief, with web access |
| GPT-6.2 Astra (GitHub Copilot CLI) | Same brief, with web access |
| Gemini 3.8 Flash (Antigravity CLI, no web access), Claude Opus 5.5 and GPT-6.2 Astra (GitHub Copilot CLI, web access) | Round-2 review of the revised design: the same brief, plus the round-1 outcome and the round-1 reviews. Grok was not run in round 2 because its CLI account had no credits left |
| Gemini 4 Argon and Grok 4.7 (GitHub Copilot CLI), Claude Opus 5.5 (Claude CLI) — all three without tools or web access | Round-3 review of what changed after round 2: a prompt written for that scope (`debate/round-3-prompt.md`) with the requirements, design, decision log, research notes, resolution and the round-2 list. Gemini and Opus ran at high reasoning effort; Grok at low, because its longer replies were cut in transit (W-33) |
| Claude Fable 5.2 (Claude CLI), Gemini 4 Argon and Grok 4.7 (GitHub Copilot CLI) — all three without tools, high effort | Round-4 review of the time-model change only: a prompt written for that scope (`debate/round-4-prompt.md`) with the old model as `BEFORE.md`, the whole requirements and design, and the time-related parts of the decision log, research notes and resolution |

## Prompting strategy so far

- Full context first: the whole brief was given, and the model was told to
  trace every line to an ID before designing anything.
- Decisions were required to carry their reasoning and an evidence tag
  (verified / best practice / knowledge / judgment / unverified), so that
  confident-sounding but unchecked claims are visible.
- Planning was kept strictly separate from implementation ("no code in this
  session").
- A reviewer with no access to the author's reasoning read the design cold.
- The same brief was given to several different models, which were asked to
  attack rather than approve.
- After round 1: "attack" alone invited correct-but-contrived examples, so
  the brief now requires each objection to name who would really send that
  input and how often (W-15).
- For the catalog change the owner (the candidate, adding a requirement of
  their own to Everfit's) wrote the request as a brief of its own:
  the problem, the direction, five fixed points, a list of things to think
  through, and a rule for which decisions to bring back — "important" ones
  (public contract, costly to reverse, scope or time) in one batch before any
  document is edited, minor ones decided and listed in a final report.

## Log

### Planning · AI output was wrong or suboptimal

**W-1. The earlier plan pinned date-only input to midnight UTC and filtered by instant.**
*(Confirm before using: this counts as an "AI was wrong" example only if that earlier plan was AI-drafted — its authorship is not known to this session.)*
The previous design interpreted `2025-02-10` as `00:00Z`
and made every range filter a UTC instant range. Working through examples
showed this files a workout logged in a UTC−8 evening under the wrong calendar
day, and no fixed convention fixes it for every zone. Corrected by storing the
local calendar date next to the UTC instant and filtering on the date (D-09).

**W-2. Index claim that PostgreSQL would not honour.**
The first draft of this design said an `INCLUDE (exercise_key)` column would
let the name filter run "without touching the heap" while the query selected
whole rows. The reviewing sub-agent pointed out that PostgreSQL only does this
in an index-only scan, which needs every referenced column in the index — the
draft query would have heap-fetched up to 50,000 rows. Corrected with a
two-step query (index-only id page, then rows by primary key) and a `VACUUM`
after seeding (design §9.2, §17).

**W-3. A valid request that would have returned a 500.**
The draft allowed reps up to 10,000 and weight up to 10,000 while storing the
estimated 1RM in `numeric(10,4)`. The reviewer computed that Epley on accepted
input overflows the column. Corrected by lowering the reps cap, widening the
column, and adding a test that derives the maxima from the configured caps
(design §9.1, §17).

**W-4. Draft contradictions caught in review.**
The draft promised a "seeded" API on plain `docker compose up` while putting
the seed behind a profile; described an index as serving a filter the API did
not have; and scheduled the catalog after an endpoint that needed it. All
three fixed (design §17).

### Planning · "latest" is not "compatible" (defaults an assistant reaches for, rejected after checking)

These were checked against the npm registry rather than accepted:

**R-1. TypeScript 7.** `typescript@latest` is 7.0.2, but `@nestjs/swagger` 12
and `ts-jest` 29.4 declare peer ranges that stop at 6.x. Pinned to 6.0.x (D-01).

**R-2. Prisma via `npm i prisma`.** The `latest` dist-tag currently points at
8.0.0-rc.34, a release candidate. Not used (D-04).

**R-3. Zod via `nestjs-zod`.** Its peer range lists NestJS 10 and 11 only, not
12. Stayed with `class-validator` (D-05).

### Planning · suggestions rejected on judgment

**R-4. Content-hash deduplication of "duplicate" entries** (from the earlier
MongoDB-based plan; same authorship caveat as W-1). Rejected: it silently
drops a genuine second identical session and guesses the user's intent. Replaced by an optional client
`Idempotency-Key` (D-15).

**R-5. A trigram (`pg_trgm`) index for partial name search** — the textbook
answer. Rejected for now: every query is already scoped to one user and
ordered by date, which a global trigram index does not help. At first kept as
a measured fallback. After debate round 1 it left the list altogether: if the
benchmark fails, the fix is to resolve the search term against the user's own
exercise names first, after which a trigram index has nothing left to speed
up (D-16).

### Debate round 1 · what the reviewing models got wrong, and what they caught

Full record: `debate/round-1-summary.md`.

**W-5. Errors in the author model's own documents, caught by Grok.** A stale
sentence ("no cap on reps") contradicting the validation table; a PR query
that would match nothing when no dates were sent; a Docker volume path that
does not persist data on the PostgreSQL 18 image (confirmed against the
image's documentation); a missing range check on the compare endpoint. All
corrected.

**W-6. A reviewer misread the documents it was reviewing.** GPT-OSS 120B
stated that `numeric(9,3)` could overflow at 500 kg (it holds 999 999.999),
that the bulk cap was not enforced (it is a validation rule) and that the
`Z` rule was undocumented (it is in the design). None was acted on.

**W-7. Confident database advice that would not have worked.** Gemini advised
removing `MATERIALIZED` so the planner could push `LIMIT` into the scan; a CTE
referenced three times is materialised regardless and no index is ordered by
those columns. Checked by reasoning and by a second reviewer, not applied.

**W-8. A recalled fact that the manual contradicts.** Grok described
PostgreSQL's `uuidv7()` as millisecond-only; the PostgreSQL 18 manual says it
also carries a sub-millisecond timestamp. Its practical advice (test ordering
inside one request) was kept.

**W-9. The wrong model answered.** The first Antigravity run silently used
the CLI's default model instead of Gemini. Noticed from the reply's heading;
rerun with the model named explicitly.

**W-10. Points only the fourth reviewer raised — and how many were real.**
Opus raised five points the three earlier reviews had missed: the bulk insert
relied on an undocumented row order; the insert could exceed the protocol's
bind-parameter limit if the caps were raised; `timestamptz(3)` rounds an
instant across midnight; rounding kg to four decimals contradicted the
design's own "exact" claim; the benchmark measured only the best case.
Checked later against real use (W-15), two held — the row order and the
benchmark. The other three needed inputs no client sends and were withdrawn.
A further reviewer found more, and more that had to be filtered.

**W-11. An assumption nobody checked until a reviewer had web access.** The
plan treated "Everfit runs on MongoDB" as the main risk of choosing
PostgreSQL. Opus found Everfit's own job posting listing both; confirmed by
opening the page.

**W-12. The author model's own argument, challenged by a worked example.**
The author defended returning the weight itself at one rep as a display
nuance. GPT-6.2 Astra showed with two sets (`100 kg × 1`, `96 kg × 2`) that
it changes which workout holds the record. The arithmetic is right. Whether
that makes the exception a bug, or the literal formula flattering to a
single, depends on who is reading — a grader with the brief or a lifter — so
the choice went back to the candidate. Astra's second example (`40 kg`
against `88.185 lb`) is the subject of W-15.

**W-13. A fallback that could not work.** The design named "per-metric
indexes" as the fix if PR queries were slow, but its query read from a
materialised CTE, which no index can serve. Three reviewers and the author
missed it.

**W-14. A position the author reversed.** After rejecting Grok's proposal to
drop the stored per-entry maxima, the author accepted it in modified form
once Astra removed the main objection (exact ranking makes the SQL trivial)
and proposed measuring both shapes on the same data.

**W-15. The author model accepted a finding built on a weight that does not
exist.** Astra argued that storing kg to four decimals could give a personal
record to the wrong day, using `40 kg` against `88.185 lb`. The author re-did
the arithmetic, found it correct, and accepted the finding as a correctness
bug. The candidate, who knows lifting, pointed out that no such load exists.
Checked: `88.185 lb` is 40 kg written in pounds. Over every load a gym can
build (plate steps down to 0.125 kg and 0.25 lb, 1–30 reps), the worst four
decimals can do is mis-order two sets about a gram of total volume apart —
less than any plate is accurate to. The proposed fix, eleven decimals, would
have announced a new record to someone repeating the same 40 kg in pounds.
The finding was withdrawn. Every other finding was then re-tested with one
question — who sends this, how often, and what do they see — and seven more
were withdrawn or reduced, three were raised in priority, and several of the
author's own assumptions (the benchmark's heavy user, a 20-request test)
proved just as unrealistic. Lesson: checking a reviewer's arithmetic is not
checking its premise. The debate brief now asks every objection to name a
real sender. Full record: section 11 of the summary.

**Note for the implementation phase** (from Astra): several models voting on
a design is not evidence that generated code was reviewed. Record, for code,
the suggestion, the failing test or plan, and the commit that fixed it.

**W-16. Applying an approved list still needed judgment.** The candidate
approved the round's list in one go. Three things surfaced only while writing
it into the design. (a) The list said "`performedAt: null` for date-only
entries"; as a nullable column that would have broken cursor paging, which
compares `(date, instant, id)`. The design keeps the column non-null as an
ordering key, adds a `time_known` flag and returns `null` in the API — the
shape two reviewers had proposed. (b) Two facts the plan leaned on were only
recalled: that the PostgreSQL driver turns a SQL `date` into a JavaScript
`Date` in the process's zone, and that the `uuid` package keeps ids in order
within one millisecond. Both were read in the primary source before being
written down as decisions. (c) The design had "confirm that TypeScript 6.0
ships `Temporal` typings" as an open item; it was checked in the package
itself, and the check also showed the Nest template's default `lib` setting
would not have included them.

**R-6. Suggestions rejected after the round** (reasons in
`debate/resolution.md`, section 6): merging the two write endpoints; adding a
trigram index before measuring; replacing Drizzle with Kysely on a recalled
claim; content-hash dedupe (proposed a second time, rejected a second time);
restricting `date` to a calendar date with a separate time field. Grok's
proposal to drop the stored per-entry maxima was rejected at first and then
adopted in modified form (W-14).

**R-7. The author model's own domain "improvement", rejected.** The plan
proposed that a one-rep set should count as its own weight instead of the
brief's `weight × (1 + reps/30)` — sound in the gym, and backed by the
formula's own source ("assuming r > 1"). All four strong reviewers argued for
the literal formula, and one showed the exception changes which workout holds
the record. The re-check in W-15 found a real reader on each side, so the
choice went to the candidate, who chose the brief's formula: it is the
specification being graded, and anyone checking a one-rep set with the brief
open computes 103.33, not 100. The domain point survives as a README note.

### Debate round 2 · what the revision got wrong, and how the reviewers did

Full record: `debate/round-2-summary.md`. Three models reviewed the revised
design: Gemini 3.8 Flash, Claude Opus 5.5 and GPT-6.2 Astra. Grok was not run
(no credits left on its CLI account) and GPT-OSS was not asked again after
W-6. The entries in this section were written before the candidate decided on
the round's list; what was decided is in the next section.

**W-17. Mistakes the author model introduced while applying round 1.** The
revision promised that entries logged in one request "keep the order of the
request" in history, while history sorts by id descending and so returns them
reversed — and it planned a test asserting the promise. It left a `set_count`
column that no query reads, in a schema described as storing nothing derived.
It put the comparison response outside the envelope the same document fixes
for every success body. And it wrote an error message calling the *day*
ambiguous when it is the *instant* that is unknown. Astra caught all four and
Opus two of them, by reading the revised sections against each other. Lesson:
applying an approved list still produces new text, and new text needs its own
review.

**W-18. A finding withdrawn for a bad example turned out to be right.** In
round 1 a reviewer argued that kilograms rounded to four decimals could give
a record to the wrong day, using a load nobody enters (`88.185 lb`). The
candidate rejected it for that reason (W-15). The author model's re-check
then asked how far apart two sets must be before rounding puts them in the
wrong order — about a gram of total volume — and closed the item. In round 2
Astra came back with `100 lb × 10` and `200 lb × 5`: the same volume, stored
as 453.5920 and 453.5925, so the later set takes the record. In the same
round Gemini and Opus both ruled that no real load is affected. The author
model confirmed the arithmetic, then counted every pair of equal-scoring sets
from 45 to 500 lb and 1 to 15 reps: about three quarters of true volume ties
and nearly all estimated-1RM ties are pulled apart, among them `225 × 8`
against `200 × 9`. It also found that its own reason for rounding ("a lifter
repeating 40 kg in pounds") rested on the same non-existent load. Lessons:
rejecting an unrealistic example does not show that no realistic one exists;
the re-check measured distance when the property at stake was equality; and
two models agreeing is not a check. Proposed fix: store the exact product. It
reopens a decided item, so it is with the candidate.

**W-19. A fallback aimed at the wrong case.** For a slow partial-name search
the design's fallback was a table of each user's exercise names. Opus and
Astra showed independently that it speeds up only a term that matches
nothing; a term matching an exercise the user rarely logs walks the same
index and gains nothing. Both proposed a per-exercise lookup on the index
that already exists. The fallback text is to be replaced; nothing is built
unless the benchmark asks for it.

**W-20. The cut list would have removed the test a decision rests on.** PRs
are computed in SQL and specified by a TypeScript function. The only test
that the two agree sat among the property-based tests, second on the list of
things to drop under time pressure. Opus caught it. A small fixed test is to
move into the PR slice and off the cut list.

**W-21. Library behaviour settled by running it.** Opus reported that
`Temporal.PlainDateTime.from` silently discards a UTC offset, so a parser
that sends every input through it would store a travelling user's workout
fifteen hours off. The author model ran it on Node 26 and confirmed it, along
with the correct path and the default handling of daylight-saving gaps. Opus
also suspected the `uuid` package would not load under Jest but could not
read the package's metadata; the author model read it from the registry —
version 14 is ESM-only. Both become tests in the first build slice.

**W-22. Reviewer mistakes in round 2.** Gemini asked for a `CHECK` that is
already in the schema, called the cut list "inverted" while proposing the
same first three cuts, asked for system zone data that `Temporal` does not
read, and argued a withdrawn item again without saying who would send the
input, which the brief asks for. It had no web access, and all five of its
"re-checked" claims are recalled. Astra rated the tie in W-18 a Blocker,
though nothing fails and every number shown is right, and proposed rejecting
wall-clock times that fall in a daylight-saving overlap — refusing a real
workout to avoid a one-hour difference. Opus proposed adding an index before
the measurement its own ruling says to wait for.

**R-8. Suggestions not followed in round 2** (reasons in
`debate/round-2-summary.md`, section 9.D): a filter hash inside the paging
cursor; full-word unit aliases; installing system zone data; rejecting
ambiguous wall-clock times; shrinking the benchmark's background data on a
recalled insert rate; raising sort memory inside the benchmark, which would
hide what it measures; a two-connection test for a three-line transaction;
an index-only set lookup before measuring (kept as a fallback rung).

### After round 2 · the list applied, and a requirement no reviewer could have known

**The round-2 list.** The candidate approved it and took the recommended
option on all four open calls: exact kilograms (W-18), the idempotency key
out of the plan, both compare periods read in one snapshot, and a fixed
message for a PR name that is not matched. W-19 and W-20 were applied as
proposed. Outcome per decision: `debate/resolution.md`, sections 11–15.

**W-23. Seven reviews and the author agreed on a catalog design the owner
then overturned.** The first design kept the exercise catalog in database
tables. In round 1 four reviewers called that an admin workflow nobody had
asked for, and the author model replaced it with a JSON file read at boot.
In round 2 all three reviewers kept the file. Then the owner said that
exercises are updated often and that a developer cannot be needed each time
— the exact condition the decision log had listed under "what would change
my mind". The catalog went back into the database, now with admin endpoints.
Every argument for the file was sound on what the documents said. What none
of the models did was ask the one person who knows how the product is run
how often the catalog changes. Lesson: when a decision turns on a fact about
operations, put the question to the owner; agreement between models settles
nothing about facts none of them has. What did work: the trigger had been
written down, so the reversal was recognised at once and not argued.

**W-24. The author model's first plan broke the order the owner had set.**
The request had two parts: apply the round-2 list, and redesign the catalog
— with the important decisions to be asked "before editing any document".
The author model announced it would apply the list first and ask afterwards.
Applying the list edits documents, and several of its items (the estimate,
the cut list, the compose steps, the catalog decision itself) depend on the
catalog answers. The order was corrected before any file was changed: the
design was thought through, six questions went to the owner in one batch,
and editing started only after the answers.

**W-25. A claim was about to be logged as verified on a reviewer's word.**
Round 2's fallback for slow PR queries relies on a primary key that carries
`INCLUDE` columns. A reviewer with web access had reported it as checked,
and the author model's notes carried it as a verified fact. Before writing
it into the research notes under the "verified" tag, the author model read
the PostgreSQL `CREATE TABLE` page itself; the same was done for the `uuid`
package's metadata, and the tie survey of W-18 and the `Temporal` cases of
W-21 were run again. All four held. The tag means "checked by the author
against a primary source", and it is only worth something if that stays true.

**R-9. The owner rejected the design every model had recommended.** The
JSON-file catalog was the author model's proposal after round 1 and was
endorsed by every reviewer who ruled on it. The owner rejected it on a fact
about real use (W-23). This is the clearest case in the project of a human
overruling an AI consensus, and the reason was not an error in the reasoning
but a missing input.

**R-10. Options the author model put forward for the catalog and the owner
did not take.** Six decisions went to the owner with a recommended option
and the alternatives; the owner took the recommended one each time. Not
taken: a rename that rewrites logged entries, and one that leaves them
behind; refusing a delete while entries exist, a soft delete, and deleting
the entries too; an open muscle-group vocabulary, where a typo becomes a
group; a seed that upserts on every deploy and so overwrites an admin's
edit; write routes on the public paths; the admin routes as an optional
slice.

**R-11. Mechanisms the author model considered for the catalog and dropped
itself** (design §17; listed before round 3 reviewed the catalog): reading the catalog tables on every
request, which changes the query the benchmark measures; `LISTEN` / `NOTIFY`
to push changes between replicas, which needs a dedicated connection and
still needs a timer behind it; a database `CHECK` repeating the key rule,
which is a second implementation of one rule; a runtime switch for the
guard, which a missing variable would leave open.

### Debate round 3 · what the catalog revision got wrong, and how the reviewers did

Three models reviewed only what had changed since round 2: the round-2 list
as applied, and the catalog moved into the database. Full record:
`debate/round-3-summary.md`. What was applied afterwards is W-36.

**W-26. The catalog section promised outcomes and did not state the rules
that produce them.** Written by the author model in one pass after the
owner's requirement, with no review. "The admin's row stays as written",
"last write wins", "a request sees one or the other, never a mixture" and
"409 when in use" are each true only with a rule the text does not contain:
a transaction per admin write with the two constraint errors mapped; seed
links inserted only for an exercise the seed itself inserted; one snapshot
per request and one refresh at a time. All three reviewers found all three.
A builder following the steps literally would have produced a 500, an
exercise with a muscle group nobody chose, and a page whose filter and tags
disagree.

**W-27. Three round-2 items were applied with the delivery slices out of
order.** The toolchain test of slice 1 needs a migrated database that
arrives in slice 3. The clean-image check in slice 3 asserts a seeded
exercise that arrives in slice 6, and a research note describes a third
version of the same check. Nothing said how the migrate step runs inside
the runtime image. Each edit was correct where it was made; nobody read the
slices in order afterwards.

**W-28. Two wrong lines in the time section survived two review rounds.**
The parser converts an instant with the client's offset as the zone, and for
a `Z` instant that value is `Z`, which `Temporal` rejects as a zone. A date
sent alone was stored as text without checking that the date exists. One
reviewer found both in round 3; both were confirmed by running them. The
first would have failed on the first request any JavaScript client sends.

**W-29. The one piece of security code in the design had a crash in it.**
The guard was specified as "compares … in constant time". The Node function
for that throws when the two values differ in length, so a wrong token of
another length would be a 500. All three reviewers caught it; it was
confirmed by running it. The guard's test also never applied it to the
controller, and "one commented-out line" is two with the import.

**W-30. The sentence written to be honest about the open routes was too
generous.** "What they cannot do: read, change or delete a logged entry" is
true of the five admin routes and false of the API, which has no
authentication anywhere, as the brief specifies. All three reviewers said
so. The same paragraph left out that a deleted seeded exercise does not
come back on a redeploy — a direct result of the seed-once rule the owner
chose.

**W-31. The author model priced the catalog too low.** 1.75 h for four
tables, a seed with a ledger, a snapshot and three routes, and 1.25 h for
five write routes, a guard and their tests. Three reviewers, separately,
say 1.0 to 1.75 h under. The estimate had been raised to 20–22 h for the
catalog and the buffer left at 2 h; this round's fixes alone use most of
it. The number goes back to the candidate.

**W-32. Reviewer mistakes in round 3.** One reviewer said the 415 rule
rejects GET and DELETE requests without a body (the design limits it to a
body that is sent), that a name can produce an empty key (it cannot), and
that a labelled history line is a leftover of the old design. One counted
19 significant digits where the exact product has 18. One said the
clean-image check can read the catalog before the seed has run (the compose
order prevents it), that a JSON number parsed as a float breaks the decimal
bound (10 000 001 accepted weights were run through the parser; none
changed), and gave "not ready to build" as its verdict for a list of
one-sentence rules. The same reviewer proposed making exercise create,
update and delete cuttable, which reopens a decision the owner had made; it
went to the candidate as an option and was not adopted.

**W-33. A reviewer CLI cut every long reply, and the effort had to be
lowered to get one.** Grok through the Copilot CLI was stopped by a
transport error about ten and a half minutes into the stream — twice at high
reasoning effort and once at medium. The run at low effort completed. Its
review is therefore the shallowest of the three, and its file and the
summary both say so. The first page of the medium-effort reply was kept in
the file because it raises one point the complete answer does not. A second
tool quirk: the `opus` alias of the Claude CLI was remapped in this shell to
another model, and the run was made with the full model name instead.

**W-34. Without tools, every reviewer's outside fact was a recollection, and
checking changed two of them.** None of the three could run code or search.
The author model ran seven of their claims on Node 26: five held as stated,
one was off by a digit, and one described a risk that produces no wrong
value anywhere in the accepted range. Nine more claims could not be checked
without building; they are listed as unchecked in the summary, each tied to
the test that will settle it.

**W-35. A defect in a URL that no reviewer raised.** While checking the
`Location` header example, the author model noticed that an exercise key is
a normalised name and real names contain a slash ("90/90 Hip Stretch").
The design does not say how the key is encoded in a path, so such an
exercise could be created and then not reached. Three reviews of the same
section passed over it; it was found by asking what a real catalog contains.

**R-12. Suggestions not followed in round 3** (reasons in
`debate/round-3-summary.md`, section 9.D): a cap on catalog size; starting
without a catalog and reporting not-ready; a boot warning as a sixth place
for the open-routes statement; serving the catalog's GET routes from the
snapshot, or refreshing once on an unknown muscle group; a minimum-length
check on the key; rounding the returned weight to two decimals; testing the
guard on a dummy controller; adding "time known" to the PR tie-break;
withholding a seed exercise when any one of its groups is missing.

### After round 3 · the list applied

**W-36. The candidate took both recommended options, and the estimate went
up rather than the scope down.** On the estimate (3C-1) the candidate chose
to restate it at 23–25 h with the 2 h buffer kept, to cut the CI benchmark
job and the schema drift check from the start, and to cut nothing graded.
On the cut order (3C-2) the two muscle-group write routes now go before
`GET …/workout-entries/{id}`. Every correction and recommended change in
the round-3 list was then applied: the rules behind the catalog's outcomes
(a transaction per admin write, seed links only for exercises the seed
inserted, one snapshot per request, one refresh at a time), the slice
order, the two time-parsing fixes, the guard (digests compared, a
`WWW-Authenticate` header, a test on the real controller, two lines to
uncomment), the open-routes sentence, the encoded `Location` header, and
nine recalled claims written down as unchecked with the test that settles
each (U-13 to U-21). The author model settled the smaller points itself and
listed them in `debate/resolution.md`, section 20. One thing the change
shows: the two items cut from the start had never been priced on their
own, so cutting them lowers the risk to the deadline but not the number.

### After round 3 · a traveller case that three rounds missed

**W-37. The time model was wrong for a real traveller, and no reviewer
noticed in three rounds.** The model stored a local calendar date next to
the instant. An athlete who trains in Vietnam at 05:30 and in the US at
20:30 the same calendar day logs two workouts 29 hours apart, and both were
filed under Feb 10: a date range could not separate them and no viewer's
timeline matched. Eleven reviews over three rounds and the author model
argued about how to fill in that local date (`Z`, `timeZone`, offsets,
daylight saving) and never asked whether it should exist. The owner found
it by walking through one real trip. The model is now the instant alone
(D-09).

**W-38. The author model's first recommendation was bigger than the need.**
Asked to test the new direction, it recommended storing each entry's
original offset and ranked the lost "athlete's day" as the most serious
finding. When the owner asked what the offset was for, the honest answer
was that it serves only a view in the zone a workout happened, which the
owner's own example had already ruled out. The recommendation was
withdrawn to "optional", and the owner declined it.

**W-39. Testing against real use found what checking the logic did not.**
The same review ran each claim on Node 26 before stating it (V-17). Doing so
showed that a date-only `date` — the most natural first request, given the
field's name — would be a 400; that importers that invent midnight UTC move
entries to the previous day for the whole of the Americas; that a `+` in a
query string arrives as a space; that `Temporal` silently ignores a
contradicting zone in brackets; and that a caller adding 168 hours for a
week misplaces a workout across daylight saving. While applying, the author
found one more: a date alone stored at noon UTC can be 26 hours ahead of
now at UTC+14, so it needed its own bound.

**W-40. The author model argued the server into a guess, and the owner
argued it back out.** The review recommended accepting a date alone as
12:00 UTC with a `time_known` flag, mainly to keep a reviewer's first
request working; it was applied across the documents. The owner then asked
for one format only. Weighed again, the owner's rule was better: the client
knows the athlete's zone and the server does not, so a missing time is the
client's to choose (noon in the athlete's offset), and with every stored
value a real instant the flag and two special rules disappear. The
recommendation was reversed and the documents changed back.

**R-13. Not followed after round 3:** storing the original UTC offset for
display (the owner: every workout is shown in the viewer's zone; named as
the next step; reversed after round 4, W-42); a `timeZone` parameter on reads (the caller knows its
viewer's zone); a user-settings table (it goes stale when the user
travels); accepting a date alone as 12:00 UTC (applied, then reversed in
favour of one format — W-40).

### Debate round 4 · the time-model change

Three models reviewed only the time-model change: Claude Fable 5.2 through
the Claude CLI, Gemini 4 Argon and Grok 4.7 through the Copilot CLI, all at
high effort and without tools (`debate/round-4-summary.md`). Grok completed
at high effort this time; the prompt was a quarter of round 3's size.

**W-41. The author model wrote two rules in one section that defeat each
other.** §8 told a client that knows only the day to send noon in the
athlete's offset, and also refused anything later than now + 15 minutes.
Logging today's session before noon breaks the first rule on the second.
All three reviewers found it; the author had written both bullets in the
same pass and checked each on its own. The same pass left a table that does
not render, two error messages that contradict each other, a `+` repair
narrower than the parser it serves, and about a dozen sentences from the
old model.

**W-42. All three reviewers put the discarded offset first, after the owner
had declined it.** Each argued it independently, with a case the owner had
not been shown: a morning workout in Vietnam comes back in the 201 body as
the previous day. It goes back to the owner as 4C-1 rather than being
applied or dropped by the author.

### After round 4 · the list applied

**W-43. The owner took the reviewers' first point, and asked the question
behind it.** The owner chose to store the offset (4C-1) and to accept a zone
in brackets and ignore it, after asking what a bracketed zone is for and
whether it would be stored. Before applying, the owner also asked why
`performed_at` is a `timestamptz` and not a `timestamp`: the documents had
used the right type since round 1 without ever saying why the other was
rejected. The reason — `timestamp` silently drops an offset and reads back
in the process's zone — is now in design §8 and D-09.

**W-44. Recalled database facts were checked, not carried, and one detail
was wrong.** The author's report after round 4 listed four recalled
PostgreSQL details (U-23 to U-26) as open, because no database ran in the
session. When the owner asked to resolve them, the author proposed PGlite
(the PostgreSQL 18.7 engine compiled to WebAssembly, a 26 MB npm package
run from a scratch folder) over starting Docker, and the owner approved the
download. All four held in substance, but a minus-sign year is refused as
invalid syntax (`22007`), not as out of range (`22008`) as U-26 had it
(V-19). The design did not change; three citations moved from [U] to [V].

### After round 4 · the catalog refresh

**W-45. The owner questioned a number the author model had chosen, and
the check found an unrelated bug.** The 30-second refresh had no
derivation, and the owner asked for a critical review rather than an edit.
Measured, a load cost 2.6 ms: the owner's cost argument was right in
direction and immaterial in size, and the real reason to change the number
was that it should come from how stale tags may be. Checking the
version-counter idea on PostgreSQL 18.7 then turned up a fault no review
round had caught: the design mapped `23503` for a group still in use, but
its `ON DELETE RESTRICT` answers `23001`, so a documented 409 would have
been a 500 (V-20). The owner chose 300 seconds and kept both faster
mechanisms for the scale plan.

**R-14. Not built in v1 after the catalog review:** the polled version row
and the reload on an unknown filter group, both now steps at scale in
design §10.8 (with one `api`, neither reacts to anything but SQL typed by
hand); a two-connection check of the deadlock (the owner: not needed, since
the lock makes it moot).

### After round 4 · configuration and key lengths

**W-46. A verified edge case grew into three findings once each path was
run.** The author had found by running Node 26 that NFKC can make a key
longer than its name. Running every path then showed that the paths
disagreed: the entry write stored the 1 800-character key (201), the
catalog create failed on its `CHECK` (a 500), and the seed had no length
checks at all, so even a plain 101-character name would pass its
validation and fail at the insert (V-21). The obvious fix, measuring the
normalised name, was refuted by one character, `İ`. In the configuration
review the author model's own list called the code switch for admin
authentication an exception to "configuration only"; it is the rule
applied, since which routes are protected is behaviour. The list also
missed that the default logger would print the token's header (K-20).

### The implementation plan's review

**W-47. The author model's plan had tests that could not fail, and two
reviewers found the same ones.** The author model wrote
`07-implementation-plan.md` from the design and checked it against its own
checklist. Fable and Grok, given only the plan, the design and the
requirements, found what that check missed. Two migrate tests would have
passed with the lock deleted, because global setup had already migrated the
shared database. A "body over 1 MB → 413" test would have passed at Nest's
own 100 kb limit. An own-unit test used 225, a value that rounding leaves
unchanged. And a filter table sent every Nest exception except 404 to 500,
including the readiness 503. Grok also claimed that `Temporal` rejects a
zone in brackets; running it showed it accepts one, as V-18 had recorded
(V-22). While applying the list, the author model noticed that
class-validator's decimal-places check likely reads `String(n)`, which is
`"1e-7"` for a small weight, and moved the rule to the domain check with a
test that settles it.

**R-15. Not followed in the plan review:** Grok's bracket claim (wrong, V-22);
its `u_123` example for a bad `userId`, which is a valid id; a guarded
subclass for the guard test, which would register the routes twice;
re-pricing Task 12 or the estimate (out of scope).

### The owner's library convention

**W-48. A convention from the owner, checked against the plan, found a
fault no review had.** The owner ruled that the code uses existing
libraries before hand-written functions, with stability and error handling
deciding, and gave lodash's `get` as the example of a safer choice than a
built-in. Going through the plan for hand-written helpers replaced six of
them (query validation, the non-UUID 404, the 415 check, body-shape checks,
the seed file's shape, a polling loop). Checking a library fact for one of
them turned up that Drizzle 0.44 and later wraps every driver error, so the
plan's `err.code` reads would have made the documented 409 and 503 into
500s; two plan reviewers and the author model had missed it (V-23). The
author model also pointed out, rather than silently following the example,
that optional chaining is the built-in that does not throw on `null` and is
type-checked, so `get` is kept for values typed `unknown`. On the benchmark
the owner kept the hand-written request loop: autocannon reports no p95.

**R-16. Not followed under the convention:** autocannon (no p95; the owner's
call); a Passport strategy for the admin guard (two packages around one
constant-time comparison); a scheduling or retry package for the catalog
refresh (none models its four rules together); a problem-details package
(the filter is Nest's own hook); `docker compose up --wait` in the
clean-image check (it waits on every service, and `migrate` exits by
design).

### Before implementation · keeping every agent on the same rules

**W-49. A research pass reported a general fact that did not hold for the
plugin in question, and the rules had been somewhere subagents never
look.** The owner wanted every agent on the same page and proposed
installing the pstack plugin once, expecting each subagent to follow it. An
AI research pass, which marked its own findings as unverified, reported
that subagents can invoke plugin skills through the Skill tool. That is
true in general and false for pstack: 57 of its 58 skills are marked as
not invocable by the model, and its own Claude Code adapter says the Skill
tool refuses most of them (V-25). It was caught by reading the plugin at a
fixed commit instead of its README. The same reading showed that the
plugin's rule file for delegates forbids asking a person a question and
forbids a review round above the brief, both against the owner's working
rules. Two more things came out of the check. The owner's working rules
(decisions in one batch before any edit, no calendar dates, the real-use
test) lived only in the main session's private memory. And the
orchestration skill the plan already names tells its controller to rule on
plan defects and never to stop between tasks, which conflicts with the
first of those rules; two plan reviews had read the plan's content and not
its method. The fix is a rules file at the repository root, with the two
overrides written out (D-25).

**W-50. The author model took two facts from the documentation, and
running them showed one wrong here and one incomplete.** Claude Code's
documentation says a subagent loads the project's `CLAUDE.md` and does not
load the main session's memory. The author model wrote both into the
decision log, then asked a fresh subagent what it had in context. The
subagent had the memory index and did not have the rules file (V-24). A
second test, in a scratch folder, also found no rules file, and a control
showed why that test proved nothing: the main session there had not loaded
the file either. A third test, a new session in the repository itself,
settled it. A subagent of a new session has the rules file, and also the
one-line memory index, against the documentation. The first subagent
lacked the file because its session was open before the file was written.
Three things changed: the decision log's sentence was corrected; every
brief now begins with "Read `CLAUDE.md`…", so no agent depends on the
automatic load; and the run begins with the same question to one subagent.

**R-17. Not followed:** the pstack plugin (the owner's call, after the
reading above; also a second orchestration method beside the one the plan
names, and playbooks that squash-merge, which would erase the iterative
history AI5 grades); its decision log in TSV, whose first column is a
timestamp, against the no-dates rule, and whose columns do not hold what
`AI_WORKFLOW.md` needs; agent teams for shared notes (experimental and off
by default, V-26; the plan's tasks run one after another, so there is no
second writer to coordinate); messages between agents as the record (they
do not outlive the session and are not evidence). Three ideas were kept
from pstack without the plugin: the first line of every brief sends the
agent to the rules file; log entries are append-only; and the evidence is
a pointer (a commit hash), not a paragraph.

### Process observation

The session's web-search tool failed on every call until after round 3,
when it worked for one lookup (K-18). Instead of trusting
recalled version numbers, facts were checked directly against registries and
official documentation, and everything not checked was labelled as such
(`05-research-notes.md`).

## To capture during implementation

- Every time generated code is changed before commit: what was wrong, how it
  was noticed (test, review, reading), the fix — and the commit hash.
- Every suggestion declined, with the reason.
- Each debate objection: accepted or rejected, and why.
- Prompts or rules-file entries that measurably improved output.

### Implementation log

One entry per real event, in the form
`Task N · tool and model · what was wrong or suggested · how it was noticed · what was done · commit <short hash>`.
Entries are only added, never edited.

- Task 0 · Claude Code, Claude Fable (controller) · the plan has the task's implementer run `git init`; the controller ran `git init -b main` itself · noticed when the method's brief script refused to run outside a repository · the implementer did the rest of the task · commit 9ba66c7
- Task 0 · Claude Code, Claude Fable (controller) · `CLAUDE.md` §2 says a subagent does not edit `ESTIMATE.md`, yet Task 0 has one create it · noticed reading the rules against the task before writing the brief · ruled that creating the file is the task's brief and that the rule guards the estimate once stated; the brief said so · commit 9ba66c7
- Task 0 · Claude Code, Claude Fable (controller) · the plan tells an implementer to "record it in the AI log" (Global Constraints; Tasks 1, 2 and 10a), while `CLAUDE.md` §4 lets only the controller write this log · noticed in the scan of the plan before Task 1 · ruled that the implementer writes the event in its task report and the controller writes the entry here · commit 9ba66c7
- Task 0 · Claude Code, Claude Fable (controller) · the method's review-package script needs a base commit, and a root commit has none · the script's own checks, read before running it · built the package by hand: the commit list, the file list and the two new files in full · commit 9ba66c7
- Task 0 · Claude Code, Claude Opus (implementer) · kept §16's sentence that planning and the debate are outside the figure, which the task's list does not name · reported by the implementer, then listed as Minor by the first reviewer (Claude Fable) · kept: it is the design's own sentence and says what the range covers · commit 9ba66c7
- Task 0 · Claude Code, Claude Opus (implementer) · added a `Co-Authored-By` trailer that the task's commit command does not have · reported by the implementer, then listed as Minor by the first reviewer · kept: the subject is exact and the trailer says openly which model wrote the commit · commit 9ba66c7
- Task 0 · Claude Code, Claude Fable (first reviewer) · `ESTIMATE.md` had no evidence tag, and its first sentence read as if the cut list were another file · raised as two Minor findings in the task review · a change to the estimate is the owner's, so the controller put both to the owner, who chose to apply them; no figure changed · commit 3b0d6ed
- Task 0 · the owner, at the checkpoint · the first commit carried the placeholder author `you@example.com` from the machine's global git settings · noticed by the controller, which checked the author before the first push · the owner chose the GitHub no-reply address for this repository; the one commit, not yet pushed, was re-authored, so its hash changed · commit 9ba66c7
- Task 0 · the owner, at the checkpoint · the GitHub repository was public, while `CLAUDE.md` §3 says the owner creates a private one · noticed by the controller with `gh repo view` before the first push, so nothing was pushed · the owner chose to push to the public repository · commit 9ba66c7
- Task 1 · Claude Code, Claude Opus (implementer) · the plan's `test` and `test:int` scripts, `jest -c …`, could not load Nest 12 under Jest: "Must use import to load ES Module: @nestjs/testing" · the first test run failed · the scripts run Jest through `node --experimental-vm-modules`, as the Nest template's own scripts do; the plan's fallback, a Jest transform entry for `uuid`, was not needed. The controller accepted the changed text because the script names, `TZ`, config files and narrowing with `--` are unchanged · commit 5f535ab
- Task 1 · Claude Code, Claude Opus (implementer) · wrote `test/support/globals.d.ts`, a file the task does not list, to type the test container on `globalThis` · noticed by the implementer reading its own work before running it · removed; the handoff is typed with an exported `ContainerHolder` · commit 5f535ab
- Task 1 · Nest CLI 12.0.15 · plain `nest new` no longer gives the Jest template the plan assumes; it gives ESM with Vitest, a telemetry module (`@nestjs/observe`) and agent skill files · the implementer scaffolded in a temporary folder first and stopped before editing the repository · the controller ruled for `--type cjs --no-observe --skip-skills --no-interactive`, which gives the non-ESM Jest template that decision D-02 chose · commit 5f535ab
- Task 1 · Nest CLI 12.0.15 · its output told coding agents to run `npx @nestjs/observe link` · the implementer read it as tool output, not as an instruction · not run, and reported to the controller · commit 5f535ab
- Task 1 · the owner · the plan's file list says "ESLint config", but the template ships oxlint · reported by the implementer before any file was written, and put to the owner by the controller · the owner chose to keep oxlint · commit 5f535ab
- Task 1 · Claude Code, Claude Fable (controller) · the template also ships `@nestjs/mau` with a `deploy` script, a `.gitattributes` and `@types/node` for Node 24 · listed by the implementer with the template's other differences · ruled: the deploy package and script left out, since nothing in the design deploys with them; `.gitattributes` left out; the `@types/node` range kept · commit 5f535ab
- Task 1 · Claude Code, Claude Fable (controller) · with the template's oxlint settings an unused import only warns and lint exits 0, while design §10.7 relies on it failing (U-17) · the controller asked the implementer to try it, and the run showed the warning · `lint` now runs with `--deny-warnings`; a throwaway unused import then exits 1. U-17 is settled here, not at Task 17a · commit 0167127
- Task 1 · Claude Code, Claude Opus (implementer) · added `passWithNoTests` to `jest.unit.json`, which the task does not name, because no unit spec exists yet and `npm test` would fail CI · reported as a concern · kept for this task; Task 2 removes it when the first unit specs land · commit 5f535ab
- Task 1 · Claude Code, Claude Fable (controller) · `nest build` leaves `tsconfig.build.tsbuildinfo` untracked, and Task 0's `.gitignore` lists six entries · reported by the implementer after the build · `*.tsbuildinfo` added as a seventh · commit f28f4d7
- Task 1 · Claude Code, Claude Fable (controller) · the template's `ts-loader`, `ts-node`, `tsconfig-paths` and `source-map-support` are unused · raised by the implementer and again as Minor by the first reviewer · kept as the template ships them; no one is affected and they can go at any time · commit 5f535ab
- Task 1 · Claude Code, Claude Fable (first reviewer) · `"strictPropertyInitialization": false` sits beside the `"strict": true` the plan requires · Minor finding of the task review · rejected: it is the Nest template's setting, and the class-validator DTOs of later tasks declare fields without initialisers; without it every DTO field needs `!` · commit 5f535ab
- Task 1 · Claude Code, Claude Fable (first reviewer) · the `TZ=…` prefix of the test scripts does not run in Windows `cmd` or PowerShell · Minor finding, labelled plan-mandated · rejected: a grader running the tests natively on Windows is uncommon, CI and Docker cover it, and `cross-env` would be a dependency the plan does not name · commit 5f535ab
- Task 1 · Claude Code, Claude Fable (first reviewer) · `ci.yml` has no `timeout-minutes`, so a hung container start would hold a runner for hours · Minor finding of the task review · accepted for Task 4, which edits that file · commit 5f535ab
- Task 1 · GitHub Copilot CLI · the second reviewer's model, `grok-4.7`, was "not available", as was every other named model, once `gh` was on the account that can push · the controller probed it before Task 1 and found that the other logged-in account has the models · the owner approved running Copilot with that account's token for the review command only; the review ran on `grok-4.7` · commit 5f535ab
- Task 1 · Claude Code, Claude Fable (controller) · `CLAUDE.md` §3 puts the second review after a green CI; the controller started it while CI was still running on the same head · the controller's own choice: it may not poll CI, and the task's full check had passed locally on that head · CI then passed on that head, so the review read the diff CI had checked · commit f28f4d7
- Task 1 · GitHub Copilot CLI, Grok 4.7 (second reviewer) · said `actions/checkout@v4` and `actions/setup-node@v4` declare the Node 20 runtime, rated it Critical, and said the steps "cannot start" so every pull request fails · the controller compared it with the CI run on that same head, which had passed with a deprecation warning, and read both actions' `action.yml` · the fix was accepted (both to `@v5`, which declares Node 24) and the claim that CI cannot run was rejected; the first reviewer re-reviewed the fix alone and found it addressed · commit 053283c
- Task 1 · the owner · a ruleset the owner added on `main` requires one approving review, and the pull request's author account cannot approve its own, so the controller could not merge as `CLAUDE.md` §3 step 7 says · the controller read the merge state and the ruleset before trying, and did not use an admin override · the owner chose to review and approve every pull request personally; the owner approved and merged pull request 1 with a merge commit · commit 8602530
- Task 2 · the owner · the controller stopped the run to wait for that approval · the owner's correction · new rule: while a review or a pull request is waiting, the next task goes ahead if it does not depend on the code under review. It relaxes `CLAUDE.md` §3 "the next task starts only after that" · commit 8602530
- Task 2 · Claude Code, Claude Opus (implementer) · `toApiProblem` read only the error's own `type`, assuming body-parser errors reach the filter as they are; Nest 12's Express adapter wraps them in an `HttpException` and keeps the original as `cause` · the integration test for malformed JSON answered `VALIDATION_ERROR` · it reads `cause.type` as well, with a unit test of the wrapped form written first. The plan's fallback, a four-argument Express error handler, was not needed: these errors do reach the Nest filter · commit 1f60ac6
- Task 2 · Claude Code, Claude Opus (implementer) · the test-only probe route answered 201, Nest's default for `@Post`, where the task says 200; and a decorator helper used an `as never as PropertyDecorator` cast · both noticed by the implementer reading its own work against the brief before any run · `@HttpCode(200)` added; the cast replaced by Nest's `applyDecorators` · commit 1f60ac6
- Task 2 · Claude Code, Claude Opus (implementer) · registered the JSON parser with Nest's `app.useBodyParser('json', …)`, not the plan's `express.json(…)`, which makes `configureApp` take `NestExpressApplication` where Task 1 declared `INestApplication` · reported as a concern · accepted by the controller: the same parser and options through Nest's own API, and `express` is not a declared dependency · commit 1f60ac6
- Task 2 · Claude Code, Claude Fable (controller) · small departures from the task's text: the health pool is built from the configuration in `health.module.ts`, not `health.controller.ts`; the test harness sets `LOG_LEVEL=fatal` in a file the task does not list · reported by the implementer · both kept: Task 1 put the pool there, and test output must carry no log lines · commit 1f60ac6
- Task 2 · Claude Code, Claude Opus (implementer) · treated an empty `ADMIN_API_TOKEN` as unset, with no test · reported as a concern · kept, and the controller asked for a test, because compose passes the empty value from `.env.example` on every default start; the test fails when the branch is removed · commit b304b5d
- Task 2 · Claude Code, Claude Fable (first reviewer) · with the plan's order (JSON parser, then helmet) a malformed or oversized body was answered without helmet's headers, with `X-Powered-By`, and with no request line in the log · found by starting the built app and sending malformed JSON · the controller ruled against the plan's order: helmet goes first, and the filter writes one line (method, path, status, request id) when the request logger did not run · commit c7b079d
- Task 2 · Claude Code, Claude Fable (first reviewer) · the plan's list of database failures that answer 503 (`ECONNREFUSED`, SQLSTATE class `08`, `57P01`) leaves an unresolvable host (`ENOTFOUND`) and a connect timeout answering 500, while design §9.6 says 503 means "database unreachable" · found by running a real `pg` pool against an unresolvable host · accepted in part: `ENOTFOUND`, `EAI_AGAIN` and `57P03` added. Rejected: `ETIMEDOUT`, `ECONNRESET`, `EHOSTUNREACH` and the timeout with no code, because nobody meets a network partition in this project's use and the pool has no connect timeout yet · commit 720c243
- Task 2 · Claude Code, Claude Fable (first reviewer) · a 503 that comes from the database driver was not logged, and nothing asserted that a 500 is logged with its `requestId` · two Minor findings of the task review · both accepted: one `warn` line with the driver's code and the request id, never the driver's message, and an assertion in the 500 test · commit c7b079d
- Task 2 · the owner, reviewing pull request 2 · `import { get } from 'lodash'` loads the whole library to use one function; the owner asked for `import get from 'lodash/get'`, asked to check the other places, and made it a rule for the project · the owner's review comment on `src/common/problem.ts`; neither reviewer had raised it · all three imports changed (`problem.ts`, `problem-details.filter.ts`, `test/errors.int-spec.ts`); the first reviewer re-reviewed the fix and found no bare import left · commit 3037ec6
- Task 2 · Claude Code, Claude Fable (controller) · a rule the owner wants followed in future would otherwise rest on each agent remembering it · the controller's ruling while handling the owner's review · `.oxlintrc.json` now refuses any import of the bare `lodash` module with a message that says what to write; a throwaway bare import made lint exit 1. Known gaps, left: a CommonJS `require('lodash')` is not caught, and a type-only import is refused too · commit 44dd074
- Task 3 · Claude Code, Claude Opus (implementer) · `schema.ts` declared `created_at` as not null with no default, so Drizzle's insert type required a value the database fills in itself; the test still ran, because ts-jest transpiles without type-checking · `npm run typecheck` failed with TS2769 · the column is marked `.defaultNow()`, with a comment saying why · commit 3d7706b
- Task 3 · Claude Code, Claude Opus (implementer) · the startup line called nestjs-pino's `Logger.log({…}, 'Listening')`, which takes the last argument as the context, so the line had `"context":"Listening"` and no message · noticed reading the real output of `node dist/main.js` · it uses Nest's `new Logger('Bootstrap')`, as the problem filter does · commit 3d7706b
- Task 3 · Claude Code, Claude Opus (implementer) · design §14 left open whether Drizzle's migrator locks on its own · settled by reading `drizzle-orm`'s `migrate()` and by a run: with the advisory lock taken out, the test of two migrate steps at once failed three times out of three · the lock stays, taken on the same connection that migrates · commit 3d7706b
- Task 3 · Claude Code, Claude Fable (controller) · the plan gives the pool no `'error'` listener, and `pg` crashes the process when an idle connection drops, as when the database restarts under compose · recorded by Task 1's implementer as a note for this task · the controller added it to the brief: one `warn` line with the driver's code only, and a test. It also carried Task 2's review note that `main.ts` should take the port from the validated configuration · commit 3d7706b
- Task 3 · drizzle-kit 0.31.11 · wrote the real instant of generation into the migration journal (`"when"`), which the migrator orders migrations by; `CLAUDE.md` §5 allows no real date in any file · raised by the implementer as a concern, then rated Important by the first reviewer (Claude Fable), who showed from Drizzle's source that the value cannot safely change once a database has been migrated with it · the owner chose fixed 2025 values, one day apart per migration; a test fails if a generated value is ever committed · commit c97e7b2
- Task 3 · Claude Code, Claude Fable (controller) · the controller's own instruction for that test put a date outside 2025 into a code comment · noticed by the controller reading the fix's diff before the re-review · the comment now gives the bound in words · commit f23657b
- Task 3 · Claude Code, Claude Fable (first reviewer) · the test container's handle was stored after the migrate step, so a failing migration left the teardown unable to stop it · Minor finding of the task review · accepted and fixed with the journal change · commit 806f8b1
- Task 3 · Claude Code, Claude Fable (first reviewer) · the pool ends in `onModuleDestroy`, which Nest runs before the HTTP server closes, so a request in flight at shutdown could get a 500; labelled plan-mandated · Minor finding of the task review · rejected: only a request in flight during the milliseconds of a shutdown meets it, and a grader running `docker compose down` does not · commit 3d7706b
- Task 3 · Claude Code, Claude Fable (first reviewer) · a connection lost in the middle of the migrate step crashes with a stack trace, not the one failure line; and a failure without an error code prints no cause · two Minor findings · the first left as it is: a one-shot step that exits non-zero stops compose either way. The second goes into Task 8, which adds the seed and its errors · commit 3d7706b
- Task 3 · GitHub Copilot CLI, then the grok CLI · the second review could not run: Copilot answered "You have exceeded your monthly quota" for every model, twice; the owner said to use the grok CLI, which read the pull request and then stopped with "You have run out of credits", twice · the controller read each tool's error output · no second review exists for pull request 3 yet; the controller stopped and asked the owner, who had said a further model would be named · commit f23657b
- Task 3 · the owner · with both routes to the second reviewer out of quota, pull request 3 had one full review and no second one · the controller's stop and question · the owner chose to skip the second review for pull request 3 only. `CLAUDE.md` §3 step 5 was therefore not done for this task; the first review, its re-review and CI stand alone · commit f23657b
- Task 4 · the plan (Task 4, Steps 1 and 3) · the plan's production install, `npm ci --omit=dev`, keeps `typescript`, which the lockfile marks as an optional peer of `@nestjs/swagger`, so the plan's own check that the image holds no `typescript` cannot pass · the clean-image check failed at that step on the implementer's first build · the implementer (Claude Opus) stopped and reported the contradiction, not deleting the folder or weakening the check; the controller ruled for `npm ci --omit=dev --omit=optional`, after a full run of the check with it, and asked for proof that Swagger, health and the error format still work in that image · commit 4eceb57
- Task 4 · Claude Code, Claude Fable (controller) · additions to the task's text: `.dockerignore` also lists `*.tsbuildinfo`, and each CI job has `timeout-minutes` · the first from Task 1's note about the build's leftover file, the second from Task 1's review · both in the brief from the start · commit 4eceb57
- Task 4 · Claude Code, Claude Fable (first reviewer) · the postgres health check, `pg_isready` with no host, asks over the unix socket, where the image's temporary first-boot server also answers, so the check can turn healthy before the real server listens and the migrate step can fail on a first `docker compose up` · found by reading the image's entrypoint, without running a container · accepted. Before the fix the race did not occur on this machine (the first boot takes about one second and the first probe comes after two), but a side-by-side probe showed the socket answering while TCP was refused. The check now asks over TCP (`-h 127.0.0.1`); three runs of the clean-image check from an empty volume passed · commit 358adb8
- Task 4 · Claude Code, Claude Fable (first reviewer) · the comment on `DATABASE_URL` in `.env.example` said both processes read `.env`; only `api` does, and `migrate` reads the process environment alone · Minor finding of the task review · accepted and reworded · commit 1ac0a68
- Task 4 · Claude Code, Claude Fable (first reviewer) · the image's health check keeps Docker's default 30 s interval, so `api` shows `health: starting` for that long; labelled plan-mandated · Minor finding of the task review · rejected: nothing waits on the api's health, since compose gates `api` on the migrate step only · commit 4eceb57
- Task 4 · the owner, at the Task 4 checkpoint · both routes to the second reviewer were out of quota, and waiting for the owner's approval kept stopping the run · the controller's stop and its list of open decisions · the owner changed the process: the second review is dropped; one review by Claude Fable at extra effort decides; when it approves and CI is green the controller merges, with no review by the owner until the owner says otherwise. `CLAUDE.md` §3 still describes the earlier process · commit 933b364
- Task 4 · the owner · pull request 4 had been reviewed by Claude Fable at normal effort, before the change above · the controller was about to run a second, extra-effort review of it · the owner said to merge it on the review it had; the controller merged it with a merge commit once CI, with the first run of the clean-image job, was green · commit 933b364
- Task 5 · Claude Code, Claude Fable (controller) · the controller's brief told the implementer to configure a separate copy of the decimal library (`Decimal.clone`), while design §6 says the precision is set on the library itself (`Decimal.set({ precision: 40 })`) so that no value can be computed at another precision · the implementer (Claude Opus) followed the brief and reported the conflict as a concern; the controller then read the design's paragraph · corrected in a new commit: `D` is the library's own constructor, and a test shows the library's constructor also computes at 40 digits (it gave 20 before) · commit d272b46
- Task 5 · Claude Code, Claude Opus (implementer) · the plan words the property test as "stays within display rounding"; a mutation run showed that bound alone misses rounding inside `fromKg` (counterexample 0.251 kg) · the implementer mutated its own code to see whether the test would fail · the property also asserts that unit → kg → unit returns the three decimals sent; the reviewer later ran it over every accepted weight in both units · commit 0dc483a
- Task 5 · Claude Code, Claude Opus (implementer) · the integration test for `GET /v1/units` was written after the route, so its failing run was not captured first · reported by the implementer · shown afterwards: with the module's import taken out the route answers 404 · commit 0dc483a
- Task 5 · Claude Code, Claude Fable (controller) · with one working tree, a review and the next task's implementation cannot both use it · the owner's rule to work ahead while a review runs · the reviewer gets a read-only export of the commit under review (`git archive` into a scratch folder, not a git worktree) to read and run focused checks in, and the tree moves to the next task's branch; fixes wait until the other writer has committed · commit 0dc483a
- Task 5 · Claude Code, Claude Fable (reviewer, extra effort) · `UnitRegistry.resolve` threw on a non-string, which a later task's validator would hand to it before the string check runs (checked on class-validator 0.15.1), a 500 for `"unit": 5`; and `display()` returned `-0` for a small negative value · two Minor findings of an approving review · both accepted before the merge: `resolve` returns `null`, `display` returns `0`; each test was seen failing first · commit d127a15
- Task 5 · Claude Code, Claude Fable (reviewer, extra effort) · the test for "no factor with more than eight decimals" asserted a fixed list, not the rule; both `display` cases rounded upward, so a round-up mode passed; nothing pinned the kilogram factor, because a round trip cancels it · found by mutating the values, not by reading alone · accepted: the rule is asserted and fails for a 12-decimal factor, a round-down case and a fixed kilogram value were added, and a leftover `new D(kg)` was removed · commit d127a15
