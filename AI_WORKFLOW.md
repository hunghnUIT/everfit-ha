# AI workflow

This project was planned and built with AI tools directing each other under the owner's rules, and the owner decided everything that changed the design, the public API, the scope or the estimate. This file says which tools did what, how they were prompted, and shows real cases where AI output was wrong, where a suggestion was rejected, and where the review caught what the tests did not.

**Every example below is a real event, written into a log** (`planning/06-ai-workflow-seed.md`: the planning and debate entries, then "Implementation log", one line per event, appended and never edited). Most entries were written when the event happened; the final review found events the log lacked, and those were added at its end from the ledger and the task reports, each marked as added then (`9c31307`). Nothing was invented. Commit hashes name the commit where the event was fixed or settled; `git log` shows each one. IDs such as W-2 and R-9 are the log's own. Evidence tags (`[V]` verified, `[J]` judgment) are those of `planning/05-research-notes.md`.

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
| Grok 4.7 (Copilot CLI) | Second reviewer, on the first two pull requests only | An independent read of the diff; dropped afterwards because both routes to it ran out of quota (see section 3, item 3) |

By activity:

- **Architecture and design:** Claude Fable 5.2 wrote the proposal; every other model attacked it over four rounds; the owner decided what changed.
- **Coding:** Claude Opus and Claude Sonnet subagents, one fresh subagent per task, test-first, each on its own branch.
- **Testing:** the implementers wrote the tests; the reviewers then **mutated the code** (changed an operator, deleted a line, moved a bound) to see which tests failed, and asked for a test wherever a mutation survived.
- **Debugging:** reviewers ran the built application against a real database and tried inputs; the implementers read library source and ran probes.
- **Documentation:** the README, `requests.http` and the OpenAPI declarations were written from the design and the implementer reports, then every request in `requests.http` was run against the running stack.

## 2. Prompting strategy

- **Full context first.** The whole brief was given and the model was told to trace every line to an ID before designing anything. Planning was kept separate from implementation ("no code in this session").
- **A rules file every agent reads.** `CLAUDE.md` at the repository root holds the authority order (the design, then the plan, then judgment), who decides what, how a task is run, the notes each role writes, and standing rules (English, no real calendar dates, evidence tags, "real use decides", honest reports). The first line of every brief says "Read `CLAUDE.md` at the repository root before anything else", so no agent depends on the automatic load. That sentence exists because of W-50: the documentation said a subagent loads the file, a fresh subagent did not have it (its session had been open before the file was written), and a new session did.
- **Every decision carries its reason and an evidence tag**, so a confident-sounding unchecked claim is visible.
- **Important decisions in one batch before any edit.** Public contract, cost to reverse, scope and time go to the owner together, recommended option first; minor ones are decided and listed (the controller's `Ruling:` lines).
- **"Who sends this input, and how often?"** After round 1 showed that "attack the design" invited correct but contrived examples (W-15), every objection, test and limit had to name a real sender: a real client, a real lifter, a grader with the brief open. Anchors: plates step by 0.5 kg or 2.5 lb, a set has 1 to 30 reps, a session 5 to 12 exercises.
- **A fresh agent per task, a different one to review**, with a brief that carries the facts earlier tasks learned ("For later tasks" in each report) and the plan's Global Constraints.
- **Run the code, do not trust the reading.** From Task 10b on, every re-review brief asks the reviewer to run the built app against a real database, not only the tests: three earlier fixes to behavior each introduced a worse bug that only a run of the built code caught.
- **Failing output is reported as it is**, and "done" needs the command and its output.

## 3. Where AI output was wrong or suboptimal, and how it was corrected

Each case has the same parts: what the AI got wrong, what is true in reality, and the fix.

1. **An index claim PostgreSQL would not honour (W-2)**
   - **AI was wrong:** the first design said an `INCLUDE (exercise_key)` index column lets the name filter run "without touching the table".
   - **In reality:** that only works for an index-only scan, and the query selected whole rows, so it would read up to 50 000 table rows. A reviewing AI subagent caught it.
   - **Fix:** a two-step query: an index-only page of ids first, then the rows by primary key (design §9.2).
2. **Two workouts 29 hours apart on the same training day (W-37, a schema change)**
   - **AI was wrong:** every workout stored two time values, the exact moment (`performed_at`, UTC) and the athlete's local calendar date (`performed_on`), to group workouts by training day.
   - **In reality:** an athlete who trains in Vietnam at 05:30 and in the US at 20:30 on the same calendar day logs two workouts 29 hours apart, and the AI's design puts both in one training day. A date range cannot tell them apart. Eleven AI reviews over three rounds only argued about how to compute the local date (`Z`, time zones, offsets, daylight saving). None asked whether the column should exist. The owner found the problem by walking through one real trip.
   - **Fix (the owner's):** drop `performed_on`. A workout is one UTC instant, reads take instant ranges (`from` included, `to` excluded), and the client's UTC offset is kept only for display (D-09). A fourth review round then checked the new model.
3. **The owner's corrections of the AI process (Tasks 2 and 4)**
   - **Waiting for approval:** the AI controller stopped the run to wait for the owner's approval of every pull request. The owner corrected it: while a review waits, the next task goes ahead if it does not depend on the code under review (Task 2).
   - **Second review:** when both routes to the second reviewer ran out of quota, the owner dropped it. One review plus green CI decides (Task 4).
   - **A whole-library import:** a pull request had `import { get } from 'lodash'`. The owner found it while reviewing, asked for `import get from 'lodash/get'` and for every other place to be checked, and made it a project rule. Lint now refuses the bare import, so the rule does not rest on memory (Task 2, `3037ec6`, `44dd074`).

## 4. Suggestions rejected, and why

1. **Exercise catalog: a JSON file or a database table (R-9, W-23)**
   - **AI recommended:** a JSON file read at boot. After round 1 the AI replaced its table design with the file, because reviewers called the admin side unnecessary. In round 2 all three reviewers kept the file, and every argument for it was sound on the documents.
   - **In reality:** the owner knew that exercises change often and that a developer should not be needed each time. With a file, every change means editing it and redeploying. With a table, one request does it. None of the models had asked how often the catalog changes.
   - **Decision (the owner's):** the catalog goes back into the database, with admin endpoints. It was built in Tasks 8, 9, 17a and 17b as three tables, a seed step, a catalog snapshot the API reloads every five minutes, and five `/v1/admin` routes.
   - **Lesson:** when a decision depends on how the product is used, ask the owner. Agreement between AI models does not settle a fact none of them has.

## 5. How the work was reviewed

- **A fresh implementer, then a fresh reviewer, for every task** (CLAUDE.md §3); one working tree, one branch per task, merge commits only, never a squash or an amend, so every fix is a visible `fix:`, `refactor:` or `test:` commit and `git log` shows what a reviewer caught and how it was corrected.
- **Every task has an implementer's report** with two headings the rules add: "Corrections" (code it generated and had to change, what was wrong, how it noticed, the fix) and "For later tasks".
- **The reviewer reads the whole diff against the task and the Global Constraints, and breaks it.** Typical findings: mutations that survive, inputs that crash the built app, a number in a report that does not match the code (each is in the log).
- **The controller rules on each finding with the real-use test** (who sends this input, how often) and records each ruling; deferred and rejected findings are in the log with their reasons.
- **What the owner reviewed.** The owner reviewed the first three pull requests on GitHub: approved the first and the third, and requested a change on the second (the lodash import, section 3, item 3). At the Task 4 checkpoint the owner told the controller to merge on an approving AI review and green CI, with no review by the owner until the owner said otherwise; the controller read that as lifting the wait at the later checkpoints too, so those after Tasks 7, 9, 11 and 13 were reported to the owner and the run went on. Throughout, the owner answered the decisions put to them (fixed dates in the migration journal, which concurrency the benchmark budgets bind, the `withCatalogWrite` signature, which model does what) and, after Task 4, did not read every diff. During Task 14's pull request the owner went to sleep and said no confirmation was needed: Tasks 15 to 18, the final review and its fix round ran overnight, every decision a controller ruling recorded for the owner. Each keeps the design as written except one: the fix round gave read bounds an upper limit, year 9999, which design §8 says they do not have, because a later instant answered 500; that ruling was made without the owner, and the owner's confirmation is open. So 17 of the 20 task pull requests had an AI review and no human one. The owner corrected the process more than once (sections 2 and 3). The first commit carried a placeholder author address from the machine's git settings; the controller noticed before the first push and the owner chose a different address (Task 0).
- **`CLAUDE.md` is the rules file as written before the build.** It was not rewritten during the run, and these rules changed as it went, by the owner's instruction or by a recorded ruling of the controller, each change in the log under its task: the repository is public, not private (Task 0); the run did not wait for an approved pull request before the next independent task started (Task 2); the second reviewer ran on the first two pull requests and was dropped when both routes to it ran out of quota, so the final review also had one reviewer, not two (Tasks 3 and 4); from Task 4 one AI review and green CI merged a pull request, and checkpoints reported instead of stopping (Task 4); the table names Fable as controller, Opus as implementer and Fable as first reviewer, while in practice Sonnet took over normal tasks as implementer, the first review moved from Fable to Opus and then to Sonnet or Opus by task, and the controller ran on Opus after a context compaction (Tasks 9, 10a, 10b and 12, section 1); and five pull requests were merged through the GitHub API, not `gh pr merge`, so the working tree an implementer was writing in was not touched (Task 15).
- **A fact is "verified" only if the author checked a primary source or ran it.** A research pass reported that subagents can invoke plugin skills through the Skill tool; that is true in general and false for the plugin in question (57 of its 58 skills are not invocable by the model), caught by reading the plugin at a fixed commit instead of its README (W-49). A reviewer's claim that `INCLUDE` on a primary key was checked was re-read in the `CREATE TABLE` page before being tagged `[V]` (W-25).

## 6. What AI was not trusted with

- Anything that changes the design, the public API, the scope or the estimate: the owner decided, in one batch, before any file was edited. One exception is in section 5: the year-9999 limit on read bounds, ruled by the controller while the owner was asleep.
- Facts about how the product is run (W-23): no number of agreeing models settles a fact none of them has.
- The README's claims about performance: the figures are copied from the benchmark report and the method is printed beside them.
- The time estimate in `ESTIMATE.md`: it is the owner's and was committed before the first line of code.
