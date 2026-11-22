# AI workflow

This project was planned and built with AI tools directing each other under the owner's rules, and the owner decided
everything that changed the design, the public API, the scope or the estimate. This file says which tools did what,
how they were prompted, and shows real cases where AI output was wrong, where a suggestion was rejected, and where
the review caught what the tests did not.

**Every example below is a real event, written into a log when it happened** (`planning/06-ai-workflow-seed.md`: the
planning and debate entries, then "Implementation log", one line per event, appended and never edited). Nothing was
reconstructed afterwards. Commit hashes name the commit where the event was fixed or settled; `git log` shows each
one. IDs such as W-2 and R-5 are the log's own. Evidence tags (`[V]` verified, `[J]` judgment) are those of
`planning/05-research-notes.md`.

## 1. Tools and what each was used for

| Tool and model | Role | Used for |
|---|---|---|
| Claude Code, Claude Fable 5.2, with the Superpowers "brainstorming" skill | Planning, then **controller** of the build | Reading the brief line by line, requirement traceability, the design, the decision log, the debate briefs, the implementation plan; then running the plan: writing each task's brief, ruling on small points, merging |
| A fresh Claude subagent as "builder reviewer" | Independent read of the first design | Contradictions and technical mistakes, with no access to the author's reasoning |
| Grok 4.7 (Grok CLI, then GitHub Copilot CLI), Gemini 3.8 Flash and GPT-OSS 120B (Antigravity CLI) | Round-1 adversarial design review | The same brief to each model, with no web access |
| Claude Opus 5.5, GPT-6.2 Astra (GitHub Copilot CLI, web access) | Design review, rounds 1 and 2 | Attacking the design; the web access found a fact the others had assumed |
| Gemini 4 Argon, Grok 4.7 (Copilot CLI), Claude Opus 5.5 and Claude Fable 5.2 (Claude CLI), without tools | Design review, rounds 3 and 4 | A prompt written for the scope of what had changed |
| Claude Opus (Claude Code subagent) | **Implementer**, and from the owner's instruction at a context compaction the controller session too | Code for the tasks with critical core logic (the write path, the read queries and their arithmetic, the admin guard and catalog writes); the first tasks too, before the split below |
| Claude Sonnet (Claude Code subagent) | **Implementer and reviewer** for normal tasks | Code and review of tasks without critical core logic |
| Claude Fable at extra effort, then Claude Opus, then Claude Sonnet / Opus | **First reviewer** | One full review of each task's diff: Fable at extra effort for the early tasks; later Opus for a normal task and Fable for a critical one; finally Sonnet for a normal task and Opus for a critical one, as the owner changed the split |
| Grok 4.7 (Copilot CLI) | Second reviewer, on the first two pull requests only | An independent read of the diff; dropped afterwards because both routes to it ran out of quota (see section 4) |

By activity:

- **Architecture and design:** Claude Fable 5.2 wrote the proposal; every other model attacked it over four rounds;
  the owner decided what changed.
- **Coding:** Claude Opus and Claude Sonnet subagents, one fresh subagent per task, test-first, each on its own branch.
- **Testing:** the implementers wrote the tests; the reviewers then **mutated the code** (changed an operator, deleted a
  line, moved a bound) to see which tests failed, and asked for a test wherever a mutation survived.
- **Debugging:** reviewers ran the built application against a real database and tried inputs; the implementers read
  library source and ran probes.
- **Documentation:** the README, `requests.http` and the OpenAPI declarations were written from the design and the
  implementer reports, then every request in `requests.http` was run against the running stack.

## 2. Prompting strategy

- **Full context first.** The whole brief was given and the model was told to trace every line to an ID before designing
  anything. Planning was kept separate from implementation ("no code in this session").
- **A rules file every agent reads.** `CLAUDE.md` at the repository root holds the authority order (the design, then the
  plan, then judgment), who decides what, how a task is run, the notes each role writes, and standing rules (English,
  no real calendar dates, evidence tags, "real use decides", honest reports). The first line of every brief says "Read
  `CLAUDE.md` at the repository root before anything else", so no agent depends on the automatic load. That sentence
  exists because of W-50: the documentation said a subagent loads the file, a fresh subagent did not have it (its
  session had been open before the file was written), and a new session did.
- **Every decision carries its reason and an evidence tag**, so a confident-sounding unchecked claim is visible.
- **Important decisions in one batch before any edit.** Public contract, cost to reverse, scope and time go to the owner
  together, recommended option first; minor ones are decided and listed (the controller's `Ruling:` lines).
- **"Who sends this input, and how often?"** After round 1 showed that "attack the design" invited correct but contrived
  examples (W-15), every objection, test and limit had to name a real sender: a real client, a real lifter, a grader with
  the brief open. Anchors: plates step by 0.5 kg or 2.5 lb, a set has 1 to 30 reps, a session 5 to 12 exercises.
- **A fresh agent per task, a different one to review**, with a brief that carries the facts earlier tasks learned
  ("For later tasks" in each report) and the plan's Global Constraints.
- **Run the code, do not trust the reading.** From Task 10b on, every re-review brief asks the reviewer to run the built app
  against a real database, not only the tests (see 3.12).
- **Failing output is reported as it is**, and "done" needs the command and its output.

## 3. Where AI output was wrong or suboptimal, and how it was corrected

Planning (the design's own drafts and reviews):

1. **An index claim PostgreSQL would not honour (W-2).** The first draft said an `INCLUDE (exercise_key)` column lets the
   name filter run "without touching the heap" while the query selected whole rows. The reviewing subagent pointed out that
   PostgreSQL does this only in an index-only scan, which needs every referenced column in the index; the draft query would
   have heap-fetched up to 50 000 rows. Fixed with a two-step query (an index-only page of ids, then the rows by primary key)
   and a `VACUUM` after loading benchmark data (design §9.2).
2. **A valid request that would have returned a 500 (W-3).** The draft allowed reps up to 10 000 and weights up to 10 000
   while storing the estimated 1RM in `numeric(10,4)`. The reviewer computed that Epley on accepted input overflows the
   column. Fixed by lowering the reps cap and adding a test that derives the maxima from the caps.
3. **The model's own mistakes while applying a reviewed list (W-17).** The revised design promised that entries logged in one
   request "keep the order of the request" in history, while history sorts by id descending and so returns them reversed, and
   it planned a test asserting the promise. It also left a `set_count` column nothing reads, put the comparison response outside
   the envelope the same document fixes for every success body, and called the day ambiguous in an error message when it is the
   instant that is unknown. Two reviewers caught them by reading the revised sections against each other.
4. **A finding withdrawn for a bad example that turned out right (W-15, W-18).** In round 1 a reviewer argued that kilograms
   rounded to four decimals could give a record to the wrong day, using `88.185 lb`, a load nobody enters. The owner, who
   knows lifting, rejected it for that reason, and the author model re-did the arithmetic and withdrew it. In round 2 another
   reviewer came back with `100 lb × 10` and `200 lb × 5`: the same volume, stored as 453.5920 and 453.5925, so the later
   set takes the record. Counting every equal-scoring pair from 45 to 500 lb showed about three quarters of true volume ties
   were pulled apart. Kilograms are now stored exactly (`numeric(17,11)`).
   Lesson recorded: rejecting an unrealistic example does not show that no realistic one exists, and two models agreeing is
   not a check.
5. **Rules that promised outcomes without the rules that produce them (W-26, W-28, W-29).** The catalog section, written in
   one pass with no review, said "the admin's row stays as written" and "409 when in use" without a transaction per write and
   the two mapped constraint errors. The parser converted an instant with the client's offset as the zone, which `Temporal`
   rejects for `Z`, so the first request any JavaScript client sends would have failed. The guard was specified as comparing
   "in constant time" with a Node function that throws when the two values differ in length, making a wrong token of another
   length a 500. Reviewers found each; each was confirmed by running it.
6. **The time model was wrong for a real traveller, and no reviewer noticed in three rounds (W-37).** The model stored the
   athlete's local calendar date next to the instant. An athlete who trains in Vietnam at 05:30 and in the US at 20:30 the
   same calendar day logs two workouts 29 hours apart that were both filed under one date. Eleven reviews argued how to fill
   in that local date and never asked whether it should exist. The owner found it by walking through one real trip. The model
   is now the instant alone, with the offset kept for display.

Implementation (the log's entries, with the commit):

7. **A framework error wrapped where the code assumed it was not (Task 2, `1f60ac6`).** The implementer (Claude Opus) read only
   the error's own `type`; Nest 12's Express adapter wraps body-parser errors in an `HttpException` and keeps the original as
   `cause`. The malformed-JSON integration test answered `VALIDATION_ERROR`. It now reads `cause.type` too, with a unit test of
   the wrapped form written first.
8. **A brief that contradicted the design (Task 5, `d272b46`).** The controller's brief told the implementer to configure a
   separate copy of the decimal library (`Decimal.clone`), while design §6 sets the precision on the library itself. The
   implementer followed the brief and reported the conflict; the controller read the design. Corrected in a new commit, with a
   test showing the library's own constructor now computes at 40 digits (it gave 20 before).
9. **A test that tested nothing it claimed (Task 3, `3d7706b`).** Typing the column `created_at` as not null with no default made
   Drizzle's insert type require a value the database fills in, yet the test ran, because ts-jest transpiles without type-checking.
   `npm run typecheck` failed with TS2769; later briefs say to run the type check before every commit (Task 10a repeated the
   mistake once, `0d3e09a`).
10. **The editing tool changed the bytes (Task 7, `325b5b1`).** A golden test for stored keys said its invisible and confusable
    characters were written as escapes, but on disk the tool had turned `\uXXXX` escapes into the characters themselves. The
    reviewer found it by reading the committed bytes, not the rendered text. Every such value is now a brace escape (`\u{…}`), and
    the fix was verified by listing the non-ASCII characters on disk.
11. **Tests that could not fail.** Reviewers broke the code on purpose and saw the suite stay green: the offset range (26
    mutations, four survived; `+13:00` is every client in New Zealand in daylight time; Task 6, `5aa1037`), the `ORDER BY` of the catalog
    reads (30 of 87 seeded exercises are not alphabetical; Task 9, `4ac1ebc`), the transaction, the injected clock, the unit check on the read route and
    `createdAt` (50 mutations, four survived; Task 10b, `6b8f106`), the atomicity of a bulk write (the implementer's report said the single-route
    trigger tests also covered it; they send one entry, so they cannot; Task 11, `31a373c`) and four ranking results in the records route
    (a record read in another unit, an exact pound tie under two-decimal rounding; Task 14, `3b886a5`). Each now has a test that fails under its mutation.
12. **A fix introduced a worse bug, three times.** (a) Task 10a: the fix for a slow validation path cut a prefix at every `.` or `[`
    of a client-chosen property name, so one unknown property named with a million dots, inside the 1 MB body limit, blocked the
    server for about 70 seconds where the code before had taken 0.1 ms (`14f7f99`). (b) Task 9: a new start handler set an exit code and never
    exited, so with the port taken the process logged the failure and stayed up (`da61e09`). (c) Task 10b: a listener added to
    every pool client also fired for idle clients, so one failure logged two lines, one saying "while in use" and carrying the wrong request
    id (`abc76e2`). Each was caught only by a re-review that ran the built code; the working rule became "a fix to behaviour gets a re-review
    that runs it, however small the diff".
13. **A connection lost mid-write ended the whole process (Task 10b, `4991443`).** The pool removes its error listener when it hands a
    client out; the idle-client listener from Task 3 did not cover transactions. The reviewer held an `INSERT` with a trigger and
    terminated its backend: the process exited with an unhandled error event. Every client the pool creates now has a listener, with an
    integration test that terminates a backend during a write.
14. **Library behaviour contradicting the documentation.** `drizzle-kit` wrote the real instant of generation into the migration journal, which
    the migrator orders migrations by, against the no-dates rule; the reviewer showed from Drizzle's source that the value cannot safely change once a database has
    been migrated, and the owner chose fixed 2025 values (Task 3, `c97e7b2`). Separately, `ON DELETE RESTRICT` answers `23001`, so the
    mapping for a group in use would have missed it and a documented 409 would have been a 500 (W-45); Drizzle 0.44 and later wraps driver errors, so the plan's
    `err.code` reads would have turned the documented 409 and 503 into 500s (W-48). Both were found by running the thing.
15. **A package-install flag the plan did not know (Task 4, `4eceb57`).** The plan's `npm ci --omit=dev` keeps `typescript`, an optional peer of
    `@nestjs/swagger`, so the plan's own check that the image holds no `typescript` could not pass. The implementer stopped and reported the
    contradiction rather than weakening the check; the controller ruled for `--omit=optional`.
16. **A health check that could pass too early (Task 4, `358adb8`).** `pg_isready` with no host asks over the unix socket, where the image's
    temporary first-boot server also answers. The reviewer found it by reading the image's entrypoint; a side-by-side probe showed the socket
    answering while TCP was refused. The check now asks over TCP.
17. **A report that described what it had not measured (Task 16, `94d65db`).** The benchmark runner's first report (Claude Sonnet) printed "heap
    fetches: n/a" with no reason and counted raw buffer lines as temporary files; the implementer caught both reading the generated report. Its reviewer
    then found the spill summary quoting a cumulative node figure (1 760 blocks) where the spill itself was 880; the README quotes 880.
18. **Documents that went beyond their sources (Task 18, `dce84ce`).** The README draft explained a heap-fetch figure with a guess, replaced by the
    plan's own figures before the commit. The reviewer (Claude Sonnet) then checked the README against the code and `bench/report.md` and found a figure
    quoted from the wrong plan (39 heap fetches where the first-page plan shows 21), two `[V]` tags the research notes do not support, and a sentence
    overstating what `/docs` declares; all were deferred to the final review and corrected in its fix round (`a41bba7`).
19. **What the final review of the whole branch found (Claude Fable, extra effort).** It ran the built image and every request in `requests.http`.
    Unknown routes outside `/v1` (`GET /`, `/favicon.ico`) answered Express's HTML 404, because Nest mounts its not-found handler under a global
    prefix only; each controller now names `/v1` itself (`8645cd4`). The README credited `ix_entries_exercise` with the PR join while every PR plan in
    the committed benchmark scanned `ix_entries_history` with a filter; the text now says what the plans show (`a41bba7`). The 500 log line of a failed
    statement carried every bound value, so a failed bulk wrote the request body into the log; it now logs the statement text and code only (`f091882`).
    This file had said the owner checked at nine stops, when the run stopped for the owner at two of them; section 5 now says what happened. The review also found
    events missing from the log, which the controller added (`9c31307`).

## 4. Suggestions rejected, and why

1. **"Latest" is not "compatible" (R-1 to R-3).** The assistant's defaults were checked against the npm registry and rejected: TypeScript 7
   (`@nestjs/swagger` 12 and `ts-jest` 29.4 declare ranges that stop at 6.x), Prisma from `npm i prisma` (the `latest` tag was a release
   candidate), and `nestjs-zod` (its peer range lists Nest 10 and 11 only).
2. **A trigram index for partial name search (R-5)**, the textbook answer. Rejected: every query is already scoped to one user and ordered by
   date, which a global trigram index does not help. At first kept as a measured fallback, it left the list after round 1.
3. **The one-rep exception to Epley (R-7).** The author model proposed that a one-rep set counts as its own weight, sound in the gym and backed by
   the formula's source. Four strong reviewers argued for the literal formula, and one showed the exception changes which workout holds the record.
   The owner chose the brief's formula, because it is the specification being graded. The domain point survives as a README note.
4. **The design every model had recommended (R-9, W-23).** After round 1 the catalog was a JSON file read at boot; all three round-2 reviewers kept it.
   The owner then said exercises are updated often and a developer cannot be needed each time, the exact condition the decision log had listed under
   "what would change my mind". The catalog went back into the database with admin endpoints. No model had asked how often the catalog changes.
5. **A second reviewer's "Critical" finding (Task 1, `053283c`).** Grok 4.7 said `actions/checkout@v4` and `actions/setup-node@v4` declare the Node 20
   runtime and that the steps "cannot start", so every pull request fails. The controller compared it with the CI run on that very head, which had
   passed with a deprecation warning, and read both actions' `action.yml`. The fix (to `@v5`) was accepted; the claim that CI cannot run was rejected.
6. **A reviewer's misreading (W-6).** GPT-OSS 120B said `numeric(9,3)` could overflow at 500 kg (it holds 999 999.999), that the bulk cap was not enforced
   (it is a validation rule) and that the `Z` rule was undocumented (it is in the design). None was acted on.
7. **Confident advice that would not have worked (W-7, W-13).** One reviewer advised removing `MATERIALIZED` from the PR query so the planner could push
   `LIMIT` into the scan; a CTE referenced three times is materialised regardless, and no index is ordered by those columns. Another point went the
   other way: the design's own fallback ("per-metric indexes") read from a materialised CTE that no index can serve, and three reviewers and the author
   all missed it until the fallback text was rewritten.
8. **Plan-mandated or rare-input findings from the task reviews**, each rejected with its reason: the `TZ=…` prefix of the test scripts does not run in
   Windows `cmd` (a grader on native Windows is uncommon, CI and Docker cover it, `cross-env` would be an unnamed dependency; Task 1); `strictPropertyInitialization:
   false` (the Nest template's setting, which DTO classes need; Task 1); the pool closing before the HTTP server so a request in flight at shutdown could get a
   500 (only a request in the milliseconds of a shutdown; Task 3); two inputs that pass validation but fail in the database, a cursor far below PostgreSQL's range
   and a name with U+0000 (only a fuzzer sends either; Task 7); a body nested 1 200 levels (only a hostile client; Task 10a). The Task 7 rejection did not
   last: the final review found the same two inputs still answering 500 on more routes, with a year past 9999 in a read bound and a blank search term
   beside them, and since each is one keystroke and a 500 is the worst answer the API can give, they became a 400 (a 404 on a catalog path) in its fix
   round (`d072a6e`). The nested body stays rejected.
9. **The owner's own corrections of AI process.** Waiting for the owner on every pull request kept stopping the run, so the owner changed the rule (work ahead; Task
   2); the second review was dropped after both routes to it ran out of quota (Task 4); the owner asked for `import get from 'lodash/get'` after reading a pull
   request that imported the whole library, and the controller then made lint refuse the bare import so the rule does not rest on memory (Task 2, `3037ec6`, `44dd074`).

## 5. How the work was reviewed

- **A fresh implementer, then a fresh reviewer, for every task** (CLAUDE.md §3); one working tree, one branch per task, merge commits only, never a squash
  or an amend, so every fix is a visible `fix:`, `refactor:` or `test:` commit and `git log` shows what a reviewer caught and how it was corrected.
- **Every task has an implementer's report** with two headings the rules add: "Corrections" (code it generated and had to change, what was wrong, how it noticed,
  the fix) and "For later tasks".
- **The reviewer reads the whole diff against the task and the Global Constraints, and breaks it.** Typical findings are in section 3: mutations that survive, inputs
  that crash the built app, a number in a report that does not match the code.
- **The controller rules on each finding with the real-use test** (who sends this input, how often) and records each ruling; deferred and rejected findings are in
  the log with their reasons.
- **What the owner reviewed.** The owner reviewed the first three pull requests on GitHub: approved the first and the third, and requested a change on the
  second (the lodash import, section 4.9). At the Task 4 checkpoint the owner told the controller to merge on an approving AI review and green CI, with no
  review by the owner until the owner said otherwise; the controller read that as lifting the wait at the later checkpoints too, so those after Tasks 7, 9,
  11 and 13 were reported to the owner and the run went on. Throughout, the owner answered the decisions put to them (fixed dates in the migration journal,
  which concurrency the benchmark budgets bind, the `withCatalogWrite` signature, which model does what) and, after Task 4, did not read every diff. During
  Task 14's pull request the owner went to sleep and said no confirmation was needed: Tasks 15 to 18, the final review and its fix round ran overnight,
  every decision a controller ruling that keeps the design as written, recorded for the owner. So 17 of the 20 task pull requests had an AI review and no
  human one. The owner corrected the process more than once (sections 2 and 4.9). The first commit carried a placeholder author address from the machine's
  git settings; the controller noticed before the first push and the owner chose a different address (Task 0).
- **`CLAUDE.md` is the rules file as written before the build.** It was not rewritten during the run, and the owner changed these rules as it went, each
  change in the log under its task: the repository is public, not private (Task 0); the run did not wait for an approved pull request before the next
  independent task started (Task 2); the second reviewer ran on the first two pull requests and was dropped when both routes to it ran out of quota, so the
  final review also had one reviewer, not two (Tasks 3 and 4); from Task 4 one AI review and green CI merged a pull request, and checkpoints reported instead
  of stopping (Task 4); the table names Fable as controller, Opus as implementer and Fable as first reviewer, while in practice Sonnet took over normal tasks
  as implementer, the first review moved from Fable to Opus and then to Sonnet or Opus by task, and the controller ran on Opus after a context compaction
  (Tasks 9, 10a, 10b and 12, section 1); and five pull requests were merged through the GitHub API, not `gh pr merge`, so the working tree an implementer
  was writing in was not touched (Task 15).
- **A fact is "verified" only if the author checked a primary source or ran it.** A research pass reported that subagents can invoke plugin skills through the Skill tool;
  that is true in general and false for the plugin in question (57 of its 58 skills are not invocable by the model), caught by reading the plugin at a fixed commit instead of its
  README (W-49). A reviewer's claim that `INCLUDE` on a primary key was checked was re-read in the `CREATE TABLE` page before being tagged `[V]` (W-25).

## 6. What AI was not trusted with

- Anything that changes the design, the public API, the scope or the estimate: the owner decided, in one batch, before any file was edited.
- Facts about how the product is run (W-23): no number of agreeing models settles a fact none of them has.
- The README's claims about performance: the figures are copied from the benchmark report and the method is printed beside them.
- The time estimate in `ESTIMATE.md`: it is the owner's and was committed before the first line of code.
