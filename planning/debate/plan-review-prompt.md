# Plan review — the implementation plan

This is the text given to every reviewer of the plan. The files it lists
follow it in the same message, each under a line `===== FILE: <name> =====`.

## Your role

You are a senior backend engineer reviewing an **implementation plan** before
anyone builds from it. The plan turns a reviewed design into tasks that
coding agents will carry out one at a time. Find what is wrong, missing,
contradictory, unworkable or weaker than an available alternative. Do not
approve, summarise or praise.

## Context

- The assignment is a "Workout Logging API" for a Backend Engineer role at
  Everfit (a coaching platform: coaches follow their clients' training). The
  brief is restated line by line, with IDs, in `01-requirements.md`.
- It is graded on system design, API design, code architecture,
  problem-solving, error handling, testing, production readiness, and how
  well the candidate directs AI tools. Human reviewers run
  `docker compose up`, try the API with curl or Postman, read the README,
  `AI_WORKFLOW.md` and the git history (D1 asks for a clean, iterative one).
- The design, `02-design.md`, is the specification. It has been through four
  review rounds and several reviews by its owner. The plan,
  `07-implementation-plan.md`, is new, and no model has reviewed it.
- How the plan will be carried out: each task by a fresh coding agent that
  reads the plan's Global Constraints and Review Focus, its own task, and the
  design sections the task names. The Interfaces block of a task is how that
  agent learns the names and types other tasks use. A fresh reviewer checks
  each task before the next one starts. Tests come first, and each task ends
  in a commit.
- The stated estimate for the whole build is 23–25 hours (design §16).

## What is under review — the plan only

1. **Coverage.** Every requirement of the design, and the brief items it
   serves, maps to a step or a test of some task.
2. **Executability.** Each task can be done with only what earlier tasks
   produce. The Interfaces blocks agree with each other on names,
   signatures, types and files; nothing is used before a task defines it.
3. **Tests.** Each failing test proves the task's deliverable and fails for
   the right reason; its values match the design; no test only exercises the
   framework or cannot fail. The integration-test set-up (one Testcontainers
   database, reset between files, run in band) is sound.
4. **Technical correctness of the steps.** Statements about NestJS 12,
   Express, Drizzle 0.45, `node-postgres`, PostgreSQL 18, `Temporal`, the
   ESM-only `uuid` 14 under Jest and ts-jest, class-validator, Testcontainers,
   Docker Compose or GitHub Actions that are false or will not work as
   written.
5. **Sizing and order.** Tasks too large for one reviewed commit, splits that
   should not be there, ordering risks, and the tasks most likely to overrun
   their share of design §16.
6. **Review Focus.** Whether its five inputs are the ones most likely to
   bite a real user, and which more likely ones are missing.
7. **Proportion.** Steps that dictate code an agent would write anyway, and
   steps that leave open a decision the design already fixed.

## Not under review

- The design's decisions: the time model, the catalog, units, Epley,
  PostgreSQL over MongoDB, Drizzle, and so on. They are settled. Raise one
  only if the plan cannot carry it out as written, or contradicts it — then
  quote both places.
- Version numbers. They were read from the live registries and may be newer
  than your training data.
- The total estimate. Sizing of individual tasks against it is in scope.

## The owner's decisions about the plan

Treat these as given:

1. One plan for the whole build, in the slice order of design §15.
2. Test-first tasks, each ending in a commit; Task 0 commits the estimate
   before any code (D8).
3. The plan lives in `planning/07-implementation-plan.md`, and no document
   states a real calendar date.
4. Each task is carried out by a fresh agent and reviewed before the next.

## Rules

1. **Attack, do not summarise.** No praise, no restatement of the plan.
2. **Cite** the task and step (`Task 6, Step 3`), the design section (`§8`)
   or the requirement ID.
3. **Be concrete.** Every objection comes with the change to the plan: which
   task, which step, what text.
4. **Say how you know.** Mark each factual claim *from the documents* (give
   the section), *recalled* or *judgment*. You have no tools in this run.
5. **Respect the scope.** This is a take-home. An objection that adds work
   must name the failure it prevents.
6. **Concede in one line** where the plan is right, so that disagreement
   between reviewers is easy to see.
7. **Ground every objection in real use.** Name who meets the failure — the
   agent carrying out the task, the per-task reviewer, CI, a grader running
   `docker compose up` — and how likely it is.
8. Do not write calendar dates other than sample dates of the kind the
   documents use. Do not create or edit files; answer in Markdown only.

## Questions to answer

1. **Coverage gaps.** Which requirements of the design have no task or test?
   Quote the design line.
2. **Interface and ordering defects.** Which names, types or files are used
   inconsistently, or before a task defines them?
3. **Steps that will not work as written**, with the fix.
4. **Tests** that prove the wrong thing, cannot fail, or are missing for a
   behaviour the plan states.
5. **Sizing.** Which tasks will overrun, or are too big for one review? Any
   reordering?
6. **Review Focus.** Keep or replace each of the five; propose up to three
   better ones.
7. **What an agent carrying out this plan is most likely to get wrong**
   despite it.

## Response format

Start with one line: `Model: <the model you are>`. Then:

1. **Verdict** — at most five lines: ready to execute / ready after the fixes
   listed / not ready.
2. **Findings** — a table, most serious first, at most fifteen rows:
   # · Task and step · Problem · Who meets it, and how often · Evidence (from
   the documents / recalled / judgment) · Fix.
3. **Answers to the seven questions** — short; refer to findings by number.
4. **Contradictions between the plan and the design** — quote both.
5. **Technical errors** — statements that are false as written.

Keep the whole answer under about 2 500 words.

## Files that follow

1. `07-implementation-plan.md` — whole.
2. `02-design.md` — whole (the specification).
3. `01-requirements.md` — whole.
