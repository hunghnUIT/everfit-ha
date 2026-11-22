# Rules for every agent in this repository

Claude Code loads this file when a session starts, and into the subagents
that session starts, except its built-in Explore and Plan agents (V-24 in
`planning/05-research-notes.md`). A session that was open before the file
changed does not have the new text, so start a new session after an edit.
No agent depends on the automatic load: **every brief the controller writes
begins with the line "Read `CLAUDE.md` at the repository root before
anything else."** Other tools are sent here by `AGENTS.md`.

"The owner" is the candidate. "The controller" is the main session that runs
the plan. "A subagent" is any agent the controller starts.

## 1. What is authoritative

1. `planning/02-design.md` is the specification.
2. `planning/07-implementation-plan.md` is the plan. Its **Global Constraints**
   section holds the technical rules, and this file does not repeat them.
   Read that section, and the design sections your task names, before you
   write anything.
3. Your own judgment comes last.

Requirement IDs are in `planning/01-requirements.md`, the reason for a
decision in `planning/03-decision-log.md`, and the evidence in
`planning/05-research-notes.md`.

If your task, the plan and the design disagree, or a step cannot be done as
written, stop and report it. Do not pick a side.

## 2. Who decides what

- **The owner decides** any change to the design, to a task's content (its
  files, interfaces, tests or commit), to the public API, to the scope, to
  the estimate or the cut list, and any dependency the plan does not name.
  The controller collects these and puts them to the owner in one batch, the
  recommended option first with a one-line reason, **before any file is
  edited**. This overrides a skill that says to rule on a plan defect and
  keep going.
- **The controller decides** what is minor: reversible, inside one task, and
  changing no contract. It records each one as a `Ruling:` line in the ledger
  and lists them all at the next checkpoint.
- **A subagent decides** nothing outside its brief. It does not edit
  `planning/`, `CLAUDE.md`, `AGENTS.md` or `ESTIMATE.md`, and it does not
  start other agents. When it needs a decision, it reports `BLOCKED` or
  `NEEDS_CONTEXT`.

## 3. How the plan is run

- **Method.** `superpowers:subagent-driven-development`, as the plan's header
  says: a fresh implementer for each task, then a fresh reviewer.
- **Who does what.**

  | Role | Model | How it runs |
  |---|---|---|
  | Controller | Claude Fable | the main session; it writes no application code |
  | Implementer | Claude Opus | a fresh subagent per task, `model: "opus"` |
  | First reviewer | Claude Fable | a fresh subagent per task, `model: "fable"` |
  | Second reviewer | Grok | `copilot -p … --model grok-4.7 -s --no-ask-user`, on the pull request's diff |

- **Before Task 0.** The controller starts one subagent and asks it, with no
  tools, after which tasks the run stops. If it cannot answer from its
  context, the automatic load is not working in this session; the controller
  tells the owner, and the first-line rule above carries the rules alone.
- **Task 0** is committed to `main` as the plan says, and the run stops. The
  owner sends the estimate and creates the private GitHub repository. The
  controller adds it as `origin` and pushes `main` once. From Task 1 on,
  `main` changes only through a merged pull request.
- **Where.** One working tree and no worktrees. Each task has its own branch
  off the current `main`, named `task-<N>-<short-name>`.
- **Agents at once.** At most four agents work at the same time, and three
  is the usual ceiling. Only one of them writes files. The others only read:
  reviews and searches.
- **Per task, from Task 1:**
  1. The implementer builds test-first on the task's branch and commits.
  2. The first reviewer reads the whole diff against the task and the Global
     Constraints. This is one full review. Each fix is a new `fix:` or
     `refactor:` commit, so the correction stays visible, and a fix gets a
     re-review of the fix alone.
  3. When that review is clean, the controller pushes the branch and opens a
     pull request. Its body says what was built, which commands were run and
     what the first review found.
  4. CI is green on the pull request's head.
  5. The second reviewer reads the pull request's diff with the task's brief
     and the Global Constraints. It changes no file. The controller posts
     its review as a comment on the pull request, word for word, under the
     model's name. It runs once per pull request.
  6. The controller rules on each of its findings with the real-use test of
     §5 and answers on the pull request. An accepted finding goes back to
     the implementer as in step 2; a rejected one gets its reason.
  7. With CI green on the final head, the controller merges with a merge
     commit (`gh pr merge --merge --delete-branch`) and updates the local
     `main`. The next task starts only after that.
- **When the second reviewer cannot run** (no credits, an error, a reply cut
  off): retry once. Then run the same review on another model that is not
  Claude and that the Copilot CLI offers, and say which on the pull request
  and in the AI log. If none works, stop and tell the owner.
- **Three failed fixes.** When a test still fails after the code has been
  changed three times to make it pass, stop patching. The approach is now
  the suspect. Write down what the three attempts had in common, and
  consider a different approach before a fourth change.
  - An implementer inside its task reports `BLOCKED` with what it tried.
  - In the controller's fix rounds, round 4 goes to a fresh implementer on
    Claude Fable with that note and the question "is the approach wrong?",
    not with a request for a fourth patch.
  - Making the test weaker is not a change of approach.
  - A new approach that changes the task's files, interfaces or tests is the
    owner's decision (§2).
- **History.** Never squash, never merge by rebase, never amend a pushed
  commit and never force-push: the AI log names commits by hash, and the
  fixes must stay visible.
- **What the controller may do on GitHub** without asking: push a task's
  branch, open its pull request, comment on it, and merge it as above.
  Everything else there is the owner's: the repository's settings and
  visibility, who can see it, and anything outside this repository.
- **Owner checkpoints.** The run stops after Task 0 and after Tasks 4, 7, 9,
  11, 13, 16, 17b and 18, the groups of design §16. This overrides the
  skill's instruction to run without stopping. At each stop the controller
  reports the pull requests merged since the last stop, every ruling it
  made, the AI-log entries it added and what is still open. It continues
  when the owner has read the diffs. What the owner corrects goes into the
  AI log and into the next pull request.
- **The final review** of the whole branch, and its one round of fixes, go
  through a pull request of their own, with the same two reviewers.

## 4. Notes: what is written, by whom, where

| Note | Written by | Where | In git |
|---|---|---|---|
| Task report | the implementer | `.superpowers/sdd/<plan>/task-N-report.md` | no |
| Ledger: progress, rulings, parked findings | the controller | `.superpowers/sdd/<plan>/progress.md` | no |
| AI workflow log | the controller only | `planning/06-ai-workflow-seed.md`, under "To capture during implementation" | yes |

- **The task report** has two headings on top of the skill's format, each
  with content or the word "none":
  - `## Corrections`: code you generated and then had to change. Say what was
    wrong, how you noticed it (a failing test, the type checker, reading it)
    and the fix.
  - `## For later tasks`: a fact a later task needs and the plan does not
    state.
- **Reading.** The controller reads the ledger when it starts and after a
  context compaction. Before it briefs Task N it reads "For later tasks" in
  the earlier reports and carries the lines that apply. An implementer reads
  its brief and nothing of the session's history.
- **The AI workflow log** gets one entry per real event. A task's entries
  are the last commit on its branch before the merge, `docs: AI log, Task N`:

  `Task N · tool and model · what was wrong or suggested · how it was noticed · what was done · commit <short hash>`

  The events are: generated code that was corrected, whoever caught it; a
  finding of either reviewer that was rejected, with the reason; a ruling that
  departs from the plan; and a correction from the owner at a checkpoint.
- **Append only.** A wrong entry is not edited. A new entry replaces it and
  says so. Nothing is reconstructed later, and nothing is invented.
- **Before the ledger folder is deleted** at the end of the plan, every
  `Ruling:` line and every "Corrections" item is already in the AI log, and
  the owner has confirmed it.

## 5. Standing rules

- **Language.** Documents, comments and commit messages are in English.
- **No real calendar dates** in any file: documents, comments, test names or
  logs. Sample data uses 2025 values like the design's. Commit timestamps
  are the one exception. If a date seems needed, tell the owner.
- **Evidence tags.** A factual claim in a document carries a tag from
  `planning/05-research-notes.md`: `[V]` verified against a primary source or
  by running it, `[BP]` best practice, `[K]` recalled knowledge, `[J]`
  judgment, `[U]` unverified. A claim you only recall is never `[V]`.
- **Real use decides.** Before you add or accept a test, an edge case, a
  limit or a review finding that the plan does not name, say who sends that
  input (a real client, a real lifter, a grader with the brief open) and how
  often. Checking the arithmetic is not checking the premise. Anchors: plates
  step by 0.5 kg or 2.5 lb, 0.125 kg or 0.25 lb at the finest; a set has 1
  to 30 reps; a session has 5 to 12 exercises.
- **Honest reports.** Give a failing test's output as it is. Say what you did
  not run. "Done" needs the command and its output.
