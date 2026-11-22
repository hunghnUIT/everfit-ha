# 04 — Debate Brief (for Grok, Gemini, Opus or any reviewing model)

Paste this file, followed by `01-requirements.md`, `02-design.md`,
`03-decision-log.md`, `05-research-notes.md`, `debate/resolution.md` and the
two round summaries (`debate/round-1-summary.md`, `debate/round-2-summary.md`),
into the reviewing model. If it can read files, give it the folder instead. Use the
same brief, unedited, for every model so the answers are comparable.

This is the brief as round 3 used it, kept unedited so the three round-3
answers stay comparable. Rounds 1 and 2 used earlier versions of it and
ruled on earlier designs: round 1 without rule 8, the "Who hits this" line
or the round-specific questions; round 2 before the exercise catalog moved
into the database. The "Contested decisions" table below describes the
design as it stood before round 3 — the figure of 20–22 h, the guard of one
commented-out line and the calls marked unreviewed are as round 3 saw them.
Round 3's outcome is applied: the design now states 23–25 h and a guard of
two lines, and every call it names has been reviewed
(`debate/round-3-summary.md`, `debate/resolution.md` §20). After round 3
the time model changed as well — only the UTC instant is stored and reads
take instant ranges (`debate/resolution.md` §21) — so the D-09 row below
describes the old model. Round 4 did not use this brief: it reviewed only
that change, with its own prompt (`debate/round-4-prompt.md`), and its
outcome is applied (`debate/resolution.md` §22): the client's offset is now
stored for display and a zone in brackets is accepted. A fifth round would
need this file brought up to date first.

---

## Your role

You are a senior backend engineer reviewing a **design proposal** for a
take-home assignment before any code is written. Your job is to find what is
wrong, risky or weaker than an available alternative — not to approve it.

## Context

- The assignment is a "Workout Logging API" for a Backend Engineer role at
  Everfit (a coaching platform). The full brief is restated, line by line with
  IDs, in `01-requirements.md`.
- It is graded on system design, API design, code architecture,
  problem-solving, error handling, testing, production readiness, and —
  marked "Critical" — how well the candidate directs AI tools.
- Human reviewers will run it with `docker compose up`, read the README and
  the git log, and probably discuss it in an interview. The candidate must be
  able to defend every choice out loud.
- Expected effort: 20–22 hours of implementation.
- `02-design.md` is the proposal. `03-decision-log.md` gives, for each of 27
  decisions, the options, the reasoning, the evidence type, what would
  overturn it and what each debate round did to it.
  `05-research-notes.md` lists what was verified and what was not.
- One requirement does not come from Everfit's brief. The candidate, who owns
  this submission, requires that the exercise catalog can be changed without
  a developer or a deploy, with authorization off for now (`O1`, `O1.1` in
  `01-requirements.md` §11). Treat it as given. The documents say "the
  owner" where that requirement is meant and "the candidate" elsewhere; they
  are the same person.

## Reading order

1. `01-requirements.md` — the brief and its ambiguities (§9), and the
   requirement the owner added (§11).
2. `02-design.md` — the design; §17 lists what earlier reviews changed and
   which calls nobody has reviewed.
3. `03-decision-log.md` — start with the index table; each entry ends with
   "Round 1" and "Round 2" lines saying what was argued and what was
   decided. D-07 and D-27 also say what the owner's requirement did.
4. `05-research-notes.md` — evidence. Note the tags: [V] verified,
   [BP]/[K] recalled, [J] judgment, [U] unverified.
5. `debate/resolution.md` — what the two rounds changed, what the candidate
   decided, what was withdrawn or not followed, and (§17) the owner's six
   catalog decisions with ten calls the author made that nobody reviewed.
6. `debate/round-1-summary.md` and `debate/round-2-summary.md`, with the
   reviews behind them — for the arguments only. They rule on designs that
   no longer exist (round 1: catalog tables synced from a file at every
   deploy, stored maxima, a one-rep exception; round 2: a catalog file read
   at boot, four-decimal kilograms, an optional idempotency slice); do not
   review those designs.

## Rules of engagement

1. **Attack, do not summarise.** Skip praise and restatement.
2. **Judge against the brief**, citing requirement IDs (`F2.1`, `E5`, `V1`…),
   not against your general preferences.
3. **Be concrete.** "Use X instead" must come with what changes in the
   schema, query or API, and what it costs in hours.
4. **Say how you know.** Mark each factual claim as *verified* (give the
   source/URL), *recalled*, or *judgment*. If you can search the
   web, re-check the items tagged [U], [BP] and [K] that your argument
   relies on. The author's session had **no working web search**; version
   facts were checked against package registries and official docs only.
5. **Respect the scope.** This is a 20–22-hour take-home, not a platform. An
   objection that adds infrastructure must show it earns marks in the brief.
6. **Concede where the design is right** — in one line — so disagreement
   between models is easy to see.
7. Version numbers here may be newer than your training data. Do not "correct"
   versions from memory; they were read from the live registries when the design was written.
8. **Ground every objection in real use.** *(Added after round 1; the round-1
   reviews were written without this rule.)* Name who would send that input
   or reach that state — a real client, a real lifter, a grader with the
   brief open — and roughly how often. An example built from values nobody
   produces (a load of `88.185 lb`, twenty identical requests in the same
   millisecond) is not a finding, however correct its arithmetic. Facts to
   hold examples against: plates step by 0.5 kg or 2.5 lb as a rule, by
   0.25 kg or 0.5 lb with small plates, by 0.125 kg or 0.25 lb at the finest;
   lifters who train in pounds mostly load round numbers, in 5-lb steps;
   a set is 1–30 reps; a session is 5–12 exercises of 3–6 sets, and a main
   lift runs to six to ten sets once warm-ups are logged; a committed
   lifter logs 1 000–2 500 entries a year.

## Contested decisions — rule on each

For each item answer: **Keep / Change / Keep with modification**, your
confidence (High/Medium/Low), and the single strongest argument.

| # | Decision | The question to rule on |
|---|---|---|
| 1 | **D-03** PostgreSQL over MongoDB | The brief allows both, and Everfit's backend posting lists both (U-1, checked). Does problem-fit (exact decimals, transactions, constraints, keyset, `EXPLAIN` evidence) carry the choice? Is a README section that shows the same design in MongoDB — the document, the indexes, the PR pipeline — enough to show both were understood? |
| 2 | **D-06 / D-11** Two tables for the log, nothing derived stored; PRs computed on read by joining entries to sets | Round 1 split 2–2 on storing three per-entry maxima; round 2 kept "measure first". Sets carry no `user_id`, so a PR request joins the user's entries for the exercise to their sets; the benchmark prints the plan PostgreSQL picks, and the design assumes none. Is the fallback ladder in the right order — a covering primary key on `workout_sets` with extended statistics, then the maxima as index payload, then per-metric indexes? Is the benchmark's heavy user (design §11) what a real heavy user looks like? |
| 3 | **D-09** UTC instant **and** local date; optional IANA `timeZone`; `performedAt: null` for date-only input | Is an optional `timeZone` the right fix for `Z` input being filed under its UTC date, or should `Z` without a zone be refused? A date-only entry is ordered at midnight UTC minus 14 hours, so it sorts below every timed entry of its day in any zone: sound, or is there a simpler shape that keeps keyset paging correct? A wall time in a daylight-saving gap or overlap is resolved the way `Temporal` does by default, not refused: right? |
| 4 | **D-12** Epley exactly as the brief writes it, for every rep count | The first proposal — a one-rep set counts as its own weight — was rejected after round 1. Is the literal formula, a figure that is called an estimate wherever it appears, and a README note the right balance, or does it read as ignoring the domain? |
| 5 | **D-15** Append-only, no content dedupe, no `Idempotency-Key` in v1 (the README describes it as the next step) · **D-16** partial match via the per-user covering index, no trigram index | Does "concurrent writes: same user logging same exercise at same time" (E5) demand duplicate protection *without* client cooperation? Is leaving the key out of a 20–22-hour plan defensible, or is it the one thing a production-minded grader looks for? Will the two-step index-only `LIKE` scan meet < 100 ms in its two worst cases — a term that matches nothing, and a term that matches a rarely logged exercise? Is the fallback right: no new table, the user's distinct keys read from `ix_entries_exercise`, then the newest rows per matching key? |
| 6 | **D-04** Drizzle (pre-1.0) for queries; migrations written by hand in SQL | Versus Prisma 7, TypeORM, Kysely or MikroORM for a Nest take-home. Which will reviewers trust most? Is a typing-only `schema.ts` beside hand-written migrations a drift risk that deserves a check? |
| 7 | **D-07** Catalog in the database (four small tables), seeded from a JSON file, read through an in-memory snapshot; no reference from entries; no aliases | Both rounds ruled for a file read at boot; the owner then required changes without a deploy (O1), which a file cannot give. Given O1, is this the smallest design that meets it? A catalog change is visible at once on the replica that took the write and within 30 seconds on the others: is a timed snapshot the right read path, against a query per request? Should unknown exercises still be accepted? |
| 8 | **D-14** Separate `/bulk` endpoint, atomic, ≤ 100 entries, ids generated by the application in input order | Atomic vs per-item results (207-style). One endpoint accepting an array vs two endpoints. |
| 9 | **D-17** `userId` in the path; a matching body `userId` accepted, a different one refused; unknown user → empty 200 | Is anything left that fails a reviewer's first request written straight from the brief? |
| 10 | **D-05 / D-22** class-validator and Jest (Nest defaults) over Zod and Vitest; tests on a real PostgreSQL under a non-UTC zone | Is "follow the framework default" the right call, or does it read as dated today? |
| 11 | **D-08 / D-24** `decimal.js` + exact kilograms in `numeric(17,11)`, unit aliases, 2-decimal half-up output, the original returned as the number sent with the canonical unit code | Round 1 kept four decimals; round 2 reversed that on a tie ordinary pound plates produce (`100 lb × 10` against `200 lb × 5`; the survey is V-12). Is exact storage the right answer to it, or is there a cheaper one? Would floats with rounding pass every realistic test, ties included? |
| 12 | **D-26** 20–22 h estimate, the cut list, and the slice order in design §15 | Is the estimate credible with the core total at the top of the range and a buffer of about 10 %? Is the cut order right? Is anything on the never-cut list that should be cuttable? |
| 13 | **D-27** Catalog administration: write routes under `/v1/admin`, open in v1, behind a guard that is written, tested and commented out; fixed keys; a delete that removes the catalog row only; a closed muscle-group list held as data; a seed that gives each file item to a database once | No model has reviewed this. The owner made the six decisions in resolution §17 and fixed that authorization is off in v1; rule on the mechanisms, and on any of the six that a real case breaks. Is a tested guard left off by one commented-out line the right way to ship "off for now", and can a reader miss that the routes are open? Do the rename and delete rules leave logged history in a state its user can understand? Can the seed ever overwrite or bring back something an admin changed? Is last-write-wins on PUT enough for the people who would really edit a catalog? |

## Also look for

- **Requirements missed or misread** in `01-requirements.md` (especially §9).
- **Internal contradictions** between the design, the decision log and the
  requirements.
- **Technical errors**: SQL that will not behave as described, PostgreSQL 18
  planner behaviour, NestJS 12 / TypeScript 6 / Drizzle 0.45 specifics,
  concurrency holes in the catalog seed, the snapshot refresh and the admin
  writes (§10), numeric overflow,
  pagination edge cases (ties, date-only entries, cursor reuse across filters).
- **What a strong candidate would include that is absent** — and what is
  present that a strong candidate would cut.
- **Interview traps**: questions a reviewer is likely to ask that this design
  answers badly.

## This round — also answer these

1. **The author's ten catalog calls** (resolution §17, numbered there; design
   §10 and §17). They follow from the owner's requirement but nobody has
   reviewed them. Rule on each: Keep, Change or Modify, with the reason.
2. **What did the revisions break?** The documents have been rewritten twice
   since round 1: for the round-2 list, and for the catalog. A rewrite
   brings its own mistakes. Look for places where the design, the decision
   log, the requirements table and the resolution now disagree with each
   other, and for SQL, index or API details that no longer fit — above all
   anything that still assumes a catalog file read at boot, kilograms
   rounded to four decimals, or an idempotency key.
3. **What round 2 reversed** (resolution §14). Was any outcome of round 1
   reversed wrongly? Only with a real sender, as rule 8 asks.
4. **Where you still disagree** with the resolution or with an earlier
   reviewer's argument. Name the argument (the review file and its objection
   number), and the real case that decides it.
5. Do not re-argue what the candidate has decided (resolution §3 and §13,
   and the six catalog decisions in §17) unless you bring a fact or a real
   case that the earlier rounds did not have. "I still prefer X" is not a
   finding. The owner's requirement itself (`O1`, `O1.1`) is not under
   review.

## Required response format

Reply in Markdown using exactly this structure, so responses from different
models can be laid side by side.

```markdown
# Review by <model name and version>

## Verdict
<One paragraph: is this design ready to build? The 3 changes that matter most.>

## Rulings on contested decisions
| # | Decision | Ruling (Keep / Change / Modify) | Confidence | Strongest argument |
|---|---|---|---|---|
| 1 | D-03 | … | … | … |
… all 13 rows …

## The author's ten catalog calls
| # | Call | Ruling (Keep / Change / Modify) | Why |
|---|---|---|---|
| 1 | In-memory snapshot, reloaded every 30 s and on a write | … | … |
| 2 | Failure at boot and at refresh; readiness | … | … |
| 3 | One key function, no database `CHECK` | … | … |
| 4 | `AdminTokenGuard`, one commented-out line | … | … |
| 5 | Seed inside `migrate`; an admin's row wins | … | … |
| 6 | PUT replaces, last write wins; no group rename | … | … |
| 7 | Catalog GET routes read the tables; no paging | … | … |
| 8 | Field rules for names and groups | … | … |
| 9 | The five places that say the routes are open | … | … |
| 10 | Compose profile `seed` → `bench` | … | … |

## Where I still disagree with the resolution or an earlier reviewer
- <whose argument · what I hold instead · the real case that decides it>
(or "Nothing.")

## Detailed objections
### O-1 <short title> — Severity: Blocker | Major | Minor
- **Target:** <decision ID / design section / requirement ID>
- **Problem:** <what is wrong, concretely>
- **Who hits this:** <the real sender or user, and roughly how often — rule 8>
- **Evidence:** <verified (source) | recalled | judgment>
- **Proposed change:** <exact change to schema / query / API / plan>
- **Cost:** <hours added or saved>
(repeat; most severe first; no more than 12)

## Missed requirements or misreadings
- …

## Technical errors found
- …

## What I would cut / what I would add
- Cut: …
- Add: …

## Claims I re-checked
| Claim (ID from 05-research-notes) | Result | Source |
|---|---|---|

## Questions the candidate should be ready for in the interview
1. …
```

## Where responses go

Save each response as `planning/debate/round-<n>-<model>.md`, and the
author's side-by-side summary as `round-<n>-summary.md`.

Every model gets the same material: this brief, files 01, 02, 03 and 05,
`resolution.md`, and the two round summaries.

Earlier rounds. Round 1 was reviewed by Grok, Gemini, Opus, GPT-6.2 Astra
and GPT-OSS. Round 2 was reviewed by Gemini, Opus and GPT-6.2 Astra
(`round-2-gemini.md`, `round-2-opus.md`, `round-2-gpt-astra.md`). GPT-OSS
was not asked again: none of its round-1 findings survived a check against
the documents. Grok did not take part in round 2: its CLI account had no
credits left when the round was run.

After each round, the author folds accepted objections into `02-design.md` and
`03-decision-log.md`, sets each decision's status to *accepted*, *revised* or
*rejected (with reason)*, and records the outcome in
`planning/debate/resolution.md`. Rejected suggestions and corrected mistakes
also go into `06-ai-workflow-seed.md` — they are exactly what the brief's
`AI_WORKFLOW.md` asks for. This has been done for rounds 1, 2 and 3.
Round 3 reviewed the catalog change that followed round 2.
