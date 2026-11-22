# Planning — Everfit Backend Take-Home (Workout Logging API)

> This folder is the record as written before implementation. The result is described in the repository's
> `README.md`; what happened during the build is in `AI_WORKFLOW.md` and in the implementation log of
> `06-ai-workflow-seed.md`.

Status: **design revised after debate rounds 1 and 2, again for the
owner's catalog requirement (the exercise catalog is in the database, with
admin endpoints), and again after debate round 3, which reviewed the catalog
change and the round-2 list as applied. All four are applied to these
documents. After round 3 the owner also changed the time model — only the
UTC instant is the only time key, and reads take instant ranges. A fourth
debate round reviewed that change and its list is applied: the client's
offset is now kept for display. A review of the catalog refresh followed:
every five minutes, with the faster mechanisms kept for scale. The
implementation plan is written; Fable and Grok reviewed it, and its list is
applied. The owner then set a library convention for the code (D-28), and
the plan follows it. Before implementation the owner settled how the
agents are run: the rules for every agent are in `CLAUDE.md` at the
repository root (D-25). No code written, nothing committed.**

"The owner" and "the candidate" are the same person. "The owner" is used
where the catalog requirement or the time-model change is meant: both are
the candidate's own, not Everfit's.

## Files

| File | What it is | Read it when |
|---|---|---|
| `01-requirements.md` | The brief, line by line with IDs, plus 11 ambiguities and how each was read, and the one requirement the owner added (its §11) | First |
| `02-design.md` | The design as it stands: stack, schema, indexes, API, time model, exercise catalog, tests, delivery slices, time estimate and cut list | Second |
| `03-decision-log.md` | 28 decisions — options, choice, why, evidence type, confidence, what would overturn it, and what each debate round and the owner's requirement did to it (accepted / revised / rejected / new) | When you want the reason for anything |
| `debate/resolution.md` | What the three rounds and the catalog requirement changed: outcome per decision, the candidate's calls, what was withdrawn or not followed, what is still unverified, (its §17) the owner's six catalog decisions with the author's ten calls, (its §20) how round 3 was resolved and the estimate as it stands, (its §21) the owner's time-model change after round 3, (its §22) how round 4 was resolved, and (its §23) how the plan review was resolved | Before approving the design |
| `debate/round-1-*.md` | Reviews by Grok, Gemini, Opus, GPT-6.2 Astra and GPT-OSS, and `round-1-summary.md`: rulings side by side with the author's comments. Its section 11 re-checks every finding against real use | When you want the argument behind an outcome |
| `debate/round-2-*.md` | Reviews of the revised design by Gemini, Opus and GPT-6.2 Astra, and `round-2-summary.md`: one document with the rulings side by side, the findings grouped by topic and tested against real use, and the list that was decided (its section 9). Applied to the design; the file is the record as written before the decision | When you want the argument behind an outcome |
| `debate/round-3-*.md` | Reviews by Gemini, Grok and Opus of what changed after round 2 — the round-2 list as applied and the catalog moved into the database — with the prompt they were given (`round-3-prompt.md`) and `round-3-summary.md`: the rulings on D-07 and D-27 and on the author's ten calls, the findings by topic tested against real use, what was checked by running it, and the list that was decided (its section 9). Applied to the design; the file is the record as written before the decision | When you want the argument behind an outcome |
| `debate/round-4-*.md` | Reviews by Fable, Gemini and Grok of the time-model change only, with the prompt (`round-4-prompt.md`) and `round-4-summary.md`: the rulings side by side, the findings checked by running them, and the list that was decided (its section 8). Applied to the design; the file is the record as written before the decision | When you want the argument behind an outcome |
| `04-debate-brief.md` | The prompt for the reviewing models, with a fixed response format, as round 3 used it; its questions describe the design before round 3, with a thirteenth for catalog administration | When starting another round (bring it up to date first) |
| `05-research-notes.md` | What was verified (and where), what is recalled, what is unverified | When a claim is challenged |
| `06-ai-workflow-seed.md` | Running log of real AI mistakes and rejected suggestions — raw material for `AI_WORKFLOW.md` | Keep appending throughout |
| `07-implementation-plan.md` | The build plan: 21 test-first tasks in the order of design §15, each with its files, interfaces, tests and commit, revised after one review | Before and during implementation |
| `debate/plan-review-*.md` | Reviews of the plan by Fable and Grok, with the prompt (`plan-review-prompt.md`) and `plan-review-summary.md`: the findings by topic, what was checked by running it, and the list that was decided (its section 7). Applied to the plan; the file is the record as written before the decision | When you want the reason for a step in the plan |

An earlier MongoDB-based plan was read for context and not carried forward;
this folder supersedes it.

## The design in ten lines

- NestJS 12 on Node 26 LTS, TypeScript 6.0, PostgreSQL 18, Drizzle for queries, hand-written SQL migrations.
- Two tables hold the log: `workout_entries` and `workout_sets`. Append-only; nothing derived is stored.
- Every set stores the weight as sent with its unit code, and the exact kilogram value (decimal math, `numeric(17,11)`). Units live in one code list with aliases (adding stone = one line).
- Each entry stores one UTC instant (`timestamptz`) as its only time key, plus the offset the client sent, for display. `date` has one format, a date-time with `Z` or an offset (a date alone is a 400 that shows the fix). Filters take half-open instant ranges — `to` excluded — cut in whatever zone the caller chooses; the server takes no zone.
- History: keyset (cursor) pagination; partial-name and muscle-group filters served from one covering index.
- PRs are computed on read by joining entries to sets — correct for any date range, no write-time races. A benchmark on realistic data decides whether anything more is needed, and the fallbacks are written down in order.
- Epley 1RM exactly as the brief writes it, for every rep count.
- Bulk logging is atomic. Two identical requests are two entries; an `Idempotency-Key` is not in the plan, and the submission's README names it as the next step.
- The exercise → muscle group catalog is data in the database: four small tables, seeded from a JSON file (each item once, so an admin's change is never overwritten), changed through admin endpoints with no deploy, read from an in-memory snapshot. **The admin write endpoints are unauthenticated in v1**; a tested guard is two commented-out lines away.
- Errors are RFC 9457 problem details; empty results are 200 with a message.

## Known limits of this planning pass

- **Web search was unavailable to the author** until after round 3, when it
  worked for one lookup (K-18). Versions and standards were verified
  directly against package registries and official docs; ecosystem-opinion
  claims are tagged as judgment or unverified. Reviewers with web access
  re-checked three items in the debate round.
- **The time model changed after round 3; round 4 reviewed it and its list
  is applied; the fixes have not been reviewed again.** The
  owner found a traveller case the old model got wrong (two workouts 29
  hours apart filed under one date) and chose to store only the UTC
  instant, with reads taking instants computed in the viewer's zone
  (design §8, D-09). The trade-off is stated, not hidden: a coach in another
  zone sees a workout on the day it fell in the coach's zone, because v1 has
  no athlete profile to cut periods in the athlete's zone; the stored offset
  lets a client show the athlete's own clock when the client sends its
  local offset rather than `Z` (with `Z` it is `null`).
- **Everfit's stack:** their backend job posting lists Express, MongoDB,
  Redis and PostgreSQL (checked during the debate round).
- **Performance figures are targets, not measurements.** The benchmark in
  design §11 is a gate with pre-agreed fallbacks. Two decisions wait on it:
  the name filter (U-3) and the PR join (U-8). The time to load the
  benchmark data is also a target (U-11).
- **Two things are unconfirmed on this machine:** that the Docker daemon
  runs, and that the Alpine Node image resolves time-zone names (U-7).
  Three more claims are unchecked and each has a named check in
  `05-research-notes.md`: what NestJS does with a non-JSON body (U-9),
  whether the build copies the seed file and the migrations (U-10), and a
  MongoDB detail nothing is built on (U-12). Round 3 left nine recalled
  framework and library details (U-13 to U-21); the design relies on none
  of them without a test that settles it. The four PostgreSQL details
  behind the time model (U-23 to U-26) were checked after round 4 on the
  PostgreSQL 18.7 engine compiled to WebAssembly (V-19).
- **The catalog change has been reviewed once (round 3), and its findings
  are applied.** The owner made six decisions; the author settled the
  mechanisms around them (`debate/resolution.md`, §17). Round 3 kept the
  direction; of the ten mechanisms it kept eight and fixed two (the boot
  rule and the guard), and it wrote down the rules several outcomes rested
  on: admin writes at the same time, the seed against an exercise an admin
  created, and one catalog snapshot per request (design §10). The fixes
  have not been reviewed by another round. A later review of the refresh
  set it to every five minutes, kept a version row and a reload on an
  unknown filter group for scale (design §10.8), and fixed a group delete
  that would have answered 500 instead of 409 (V-20).
- **The catalog's write endpoints are open in v1.** That is the owner's
  requirement (O1.1), and the design says so in five places. Anyone who can
  reach the API can change, through these routes, which muscle groups
  entries show and what the muscle-group filter matches, for every user;
  nobody can read, change or delete a logged entry or a PR through them.
  The rest of the API has no authentication either (T4): any caller can
  read or write any user's log by putting that `userId` in the path
  (design §10.7).
- **The implementation plan was reviewed once** (Fable, Grok), and its list
  is applied; the revised plan has not been reviewed again. It splits two
  tasks, moves the benchmark runner forward, and pins with a test each of
  the framework details a reviewer only recalled (U-28). The review changed
  the design in two small places (design §17).
- The **time estimate (23–25 h)** is the least certain number here and is the
  candidate's to own before starting. It was restated from 20–22 h after
  round 3 (3C-1): that round's fixes add about 1.6 h, and its three
  reviewers put the two catalog slices 1.0–1.75 h under, of which half an
  hour on each is now priced in. The core adds up to about 24.35 h; the
  buffer inside it is 2 h — about 8 %, not the 15 % it started as
  (design §16). The CI benchmark job and the schema drift check are cut
  from the start; nothing graded is.

## Next steps

1. **State the time estimate (23–25 h) and the cut list** to Everfit
   (deliverable D8) — before coding. Both are in design §16.
2. **Carry out `07-implementation-plan.md`** task by task. Task 0 runs
   `git init` and commits this folder first, with the estimate and the
   agents' rules file (`CLAUDE.md`): the planning and debate trail is
   evidence for the "AI adoption" criterion. From Task 1 each task is a
   branch and a pull request: Claude Opus implements, Claude Fable reviews,
   Grok reviews the pull request, and the controlling session merges. The
   run stops for the owner after Task 0, to send the estimate and create
   the GitHub repository, and after Tasks 4, 7, 9, 11, 13, 16, 17b and 18
   (`CLAUDE.md` §3).
3. Append to the AI workflow log as you go.
