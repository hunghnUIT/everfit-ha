<!-- Reviewer: Grok 4.7 (model grok-4.7), run through the GitHub Copilot CLI with no tools and no web access. Round 3.
     Material: round-3-prompt.md, unedited, with files 01, 02, 03, 05, debate/resolution.md and section 9 of the round-2 summary, all inlined in the prompt.
     Effort: LOW reasoning effort. At high effort (two runs) and at medium effort (one run) the response stream was cut by a transport error about ten and a half minutes in, before the answer was complete; the low-effort run finished.
     This file holds two things, both unedited:
       1. the complete low-effort answer;
       2. below the marker at the end, the first page of the medium-effort answer, which is all that arrived before the cut. It stops mid-sentence. It is kept because it raises one point (B-4) the complete answer does not. -->

Model: Grok 4.7

## 1. Verdict

Not ready to build as written. Round-2 items are mostly applied; the catalog write path is not. A literal reading of §10.3 and §10.5 can 500, half-write an exercise, or attach the file's groups to an admin's row. Fix those rules in the design before coding. The 20–22 h figure does not survive the catalog slice slipping.

## 2. Part A — items applied wrongly or incompletely

| Item | Where | What is wrong | Fix |
|---|---|---|---|
| B-6 | §9.6, §13 | "Any content type other than `application/json`" rejects `application/json; charset=utf-8`. Postman and many HTTP clients send that. | Treat a type whose essence is `application/json` as JSON. Keep 415 for `curl -d` with no header. |
| A-1 | §8, §12 | The history assertion is "reverse order" / "newest id first" without saying the two date-only rows share `performed_on`. Different dates are ordered by date, not by id. | State same `date` in both test sentences. |
| B-5 | §10.2, §12 | The clean-image check waits on `/health/ready`, which "does not fail for a stale catalog" and is specified as a DB probe. Nothing says the process refuses connections until the first snapshot loads. CI can GET before the seed is visible, or pass readiness with tags still empty. | Do not listen until the first load succeeds. Ready means that load has happened. |

C-1, C-2, C-3, C-4, A-2–A-14, B-1–B-4, B-7–B-14: no wrong application found. *From the documents.*

What the catalog revision breaks that is not one A/B/C item: D-18 says an unknown `muscleGroup` is checked against **table** rows; §9.2 resolves the filter from the **snapshot**. On a second replica those disagree for up to 30 s (§10.2). One check, one pinned snapshot.

## 3. Part B — rulings

**D-07 (revised) — Keep with modification. Medium.** Database behind the same port is what O1 asks, and the history query stays the one the benchmark measures. The snapshot is only safe if a request pins one generation and a write does not depend on the refresh.

**D-27 — Keep with modification. Medium.** The six owner choices do not lose logged history or block F1. The author mechanisms do not yet match the route table: 409 and "admin's row stays" are promises, not rules a builder can implement from the text.

## 4. The ten calls

| # | Ruling | Confidence | Argument |
|---|---|---|---|
| 1 Snapshot | Keep | High | A few hundred rows, a few edits a day. A read per request changes the query §11 measures. Pin one object per request; drop a load that started before the snapshot it would replace. |
| 2 Boot / stale | Keep | High | Empty catalog is valid; a failed load is not. Exiting at boot is right for compose. Stale tags must not fail readiness. |
| 3 One key function | Keep | High | Two normalisers is how log keys and catalog keys diverge (X2, F2.3). |
| 4 Commented guard | Keep | High | O1.1 names this shape. A runtime switch can be off with no diff. |
| 5 Seed details | Change | High | See objection 2. Ledger a skipped or partial item, and child inserts after `ON CONFLICT DO NOTHING`, break §10.3's own table. |
| 6 Last write wins, no ETag | Keep with modification | High | One or two editors. No `ETag` is fine. "Last write wins" is false unless the replacement is one transaction. |
| 7 GETs read tables | Keep with modification | Medium | An admin must see the commit. History must not consult a second generation in the same response. Say that `GET /exercises` and history can disagree for 30 s on another replica. |
| 8 Field rules | Keep | Medium | 1–10 groups and a 40-char closed name fit a few hundred exercises. Apply the same character rule to the seed file. |
| 9 Five places | Keep | High | A grader reads the README warning and OpenAPI. Enough, not too many. |
| 10 Profile `bench` | Keep | High | "Seed" was about to mean two things. |

## 5. Answers

**1. Seed.** Two `migrate` steps: no lost rows and the deploy is not stuck, if the advisory lock is taken before the ledger read and both use one key (`pg_advisory_xact_lock`, K-17). An admin write during seed is not covered by that lock. `ON CONFLICT DO NOTHING` plus a ledger insert does not resurrect a ledgered delete, and it does not by itself keep the admin's groups — child inserts still run unless forbidden. A file exercise whose group was deleted is stored without that group and ledgered, so the tag is gone for good and the deploy continues. A later key-function change does not stop a deploy; it inserts a second exercise and leaves old rows on the old key. *From §10.3, §5; judgment on the race.*

**2. Snapshot.** Compose has one process: the writer refreshes before it responds, so that admin's next history read on that process sees the new groups. A second replica serves the old snapshot for up to 30 s — new exercise shows `muscleGroups: []` and misses the muscle-group filter, while `GET /exercises` on that replica already shows the row (§10.2, §10.4). One response mixes generations if it reads the global twice. Boot retry-then-exit is right for compose and for a real outage; do not listen before the first load. Two refreshes can overlap; nothing drops the older result. *From §10.2; judgment.*

**3. Admin races.** Two POSTs of the same name: one row, the loser is a unique violation. Unmapped, that is 500, not 409. PUT replacing groups while one group is deleted, and DELETE of the exercise during PUT: without one transaction the exercise can be left with no groups or a subset, and an FK error is 500. Smallest rule: one transaction per write; `UPDATE`/`DELETE` and replace links in that transaction; `23505` → 409; `23503` on a group → 400 listing known groups; `23503` on delete-group → 409. *From §5, §9.6, §10.5; recalled SQLSTATE; judgment.*

**4. Open routes.** Scoped to the five routes, the claim is almost honest: those routes cannot update a logged row. Read as a statement about an anonymous caller, it is false — T4 leaves every history and PR read open. The commented line is the right shape (O1.1). Five places are enough. *From §10.7, requirements §10.*

**5. Leftovers.** None that still prescribe a file-at-boot catalog, four-decimal kilograms, an idempotency key in the plan, `set_count`, `user_exercises`, midnight-UTC ordering, or one shared order. Closest, all marked as history: design §16 "then a file read at boot"; resolution §4 item 2 and §14. *From those sections.*

**6. Estimate.** 1.75 h is not believable for four tables, a ledgered seed, a snapshot, three GETs, and the tests in §12. 1.25 h for five writes, the guard, and the catalog integration group is tight. If it slips: cut-list order first (that saves well under an hour of graded surface). Slice 12 is the real valve, which §15 admits and §16 forbids. *Judgment; from §15, §16.*

**7. Exact kilograms.** `numeric(17,11)` holds every registered factor and the stone line at the 10 000 cap: six integer digits, product scale ≤ 11. *From §6, §9.1; recalled arithmetic.* No remaining disagreement between store, rank, display, and delta. Output still rounds once, half-up, to two decimals. Concede C-1.

## 6. Detailed objections

**1. Admin writes are not a transaction and do not map constraint errors.**  
Target: D-27, §10.5, §9.6.  
Problem: The route table promises 409. The text never says one transaction or `23505`/`23503` mapping. Check-then-insert races to 500. A PUT that deletes links then inserts them can commit a half-updated exercise.  
Who: a grader double-submitting POST, or the only editor deleting a group while a PUT is in flight. Uncommon, but it is the error path V5 grades, and no test in §12 fires it.  
Evidence: *from §10.5, §9.6; recalled* unique/FK violations become unhandled driver errors.  
Change: one transaction; map the two SQLSTATEs; add one concurrent-POST test (one 201, one 409, one row).  
Cost: 0.3 h.

**2. Seed procedure contradicts "the admin's row stays".**  
Target: D-27, §10.3.  
Problem: "Insert with `ON CONFLICT DO NOTHING`, then ledger" still inserts `exercise_muscle_groups` unless that is forbidden. That unions the file's groups onto an admin row. A missing group is dropped and ledgered, so a later file fix never retries.  
Who: rolling deploy while an admin creates the same new name the file gained; or an admin deletes a seed group and a later file names it. Rare. It is the case the table claims to handle.  
Evidence: *from §10.3; recalled* `ON CONFLICT` does not skip later statements.  
Change: if the exercise insert did not insert, write the ledger row and do not touch children. If a named group is absent, do not ledger that exercise; warn and retry next deploy.  
Cost: 0.25 h.

**3. The estimate cannot be defended.**  
Target: D-26, §15, §16, resolution §18.  
Problem: 21.75 h with a 2.0 h buffer is already the top of 20–22 h. Catalog read+admin at 3.0 h is the optimistic case. §15 says a slip leaves admin unfinished; §16 says exercise create/update/delete are never cut.  
Who: the candidate, in the interview, defending D8.  
Evidence: *from §15, §16; judgment.*  
Change: keep tables and seed on never-cut; move exercise CRUD to the cut list after Swagger, matching §15. Do not pretend 1.75+1.25 is comfortable.  
Cost: 0 h.

**4. Snapshot swap is not actually atomic across a request.**  
Target: D-07, §10.2.  
Problem: "Never a mixture" is only true if the handler holds one reference. Overlapping refreshes can install an older load. A write that 500s because refresh failed has already committed.  
Who: any in-flight history request when the 30 s timer fires; a second replica after an admin create.  
Evidence: *from §10.2; judgment.*  
Change: pin the snapshot for the request; single-flight the refresh; ignore a stale load; refresh failure does not fail a committed write.  
Cost: 0.25 h.

**5. 415 is specified too narrowly.**  
Target: B-6, §9.6.  
Problem: charset parameter becomes 415. The first successful client call is part of G9.  
Who: a grader in Postman, or a generated client. Common.  
Evidence: *from §9.6; recalled* media-type parameters.  
Change: accept `application/json` with optional parameters.  
Cost: 0.1 h.

**6. The honesty sentence overreaches.**  
Target: D-27, §10.7.  
Problem: "Cannot read a logged entry" is false of an anonymous caller. T4 leaves `GET /users/{userId}/workout-entries` open. What is true is that the five write routes do not read or change entries, and one catalog call changes every user's tags.  
Who: a reviewer reading §10.7 with the brief open. Once.  
Evidence: *from §10.7, requirements T4, §10.*  
Change: rewrite to that narrower claim.  
Cost: 0 h.

**7. Known-group check and filter use different copies.**  
Target: D-18, §9.2, §10.2.  
Problem: D-18 validates against the table. The filter uses the snapshot. A group `GET /muscle-groups` just listed can 400, or return the empty 200, on the other replica.  
Who: admin adds a group, then a coach filters history through the other process. Within 30 s. Not compose's one process.  
Evidence: *from D-18, §9.2, §10.4.*  
Change: both the 400 list and the key list come from the pinned snapshot.  
Cost: 0.1 h.

## 7. Contradictions

- §15: "if time runs out, what is unfinished is the newest requirement." §16: "Never cut: … exercise create / update / delete."
- §10.7: "What they cannot do: read, change or delete a logged entry." Requirements T4 and design §9: history and PRs are open to anyone with a `userId`.
- §10.3 table: "The admin's row stays as written." §10.3 steps: insert with `ON CONFLICT DO NOTHING`, then record the ledger — no ban on inserting links.
- D-18: known groups "are the rows of the `muscle_groups` table." §9.2: the filter's keys come from the snapshot.
- §10.2: a request "never" sees a mixture. §10.2 mechanism: replace a global; no pin.
- U-10: clean-image check "log one entry, read the catalog." §12: `GET /v1/exercises/bench%20press` only.

## 8. Technical errors

- §6: "a factor at most eight, so the product has at most eleven" is true for the decimal product. It is not true of a JSON number parsed into IEEE before `decimal.js`. Plate steps in K-14 are dyadic, so this will not show up in grading. Do not treat a JS `number` as evidence of three decimal places.
- §10.5 "last write wins" is not what PostgreSQL does with two unserialized read-modify-writes. That is lost updates and FK failures, not a defined winner.
- A commented `@UseGuards` line does not compare tokens in constant time; the guard does, only once uncommented. `timingSafeEqual` throws on different lengths — the unequal-length case must return 401, not 500. *Recalled* Node crypto.
- `/health/ready` reporting only the database does not prove the never-cut clean-image GET sees the seed. *From §10.2, §12.*

## 9. Cut / add

Add the transaction and SQLSTATE mapping, the seed "no child inserts on conflict" rule, and the snapshot pin. About 0.7 h, from the buffer.

Remove exercise create/update/delete from never-cut so the cut list matches §15. Do not add `ETag`, `LISTEN/NOTIFY`, or a runtime auth switch.

## 10. Interview questions

1. Two POSTs of "Bench Press" at once: what locks, what SQLSTATE, what status, how many rows?
2. Admin deletes "triceps", then a deploy's file still names it. What is stored, what is ledgered, and can a later file repair it?
3. Admin creates an exercise on replica A and immediately filters history on replica B. Which copy answers, and can one response show both?
4. Why is the guard a comment rather than `ADMIN_API_TOKEN` unset meaning open? What happens if someone uncomments it and the token is empty?
5. Where is `225 lb` still exact, and where is it `102.06`? Which number does the volume tie use?

---

<!-- END of the complete low-effort answer.
     BELOW: the medium-effort attempt, as far as it got before the transport error. Unedited; it ends mid-sentence. -->

Model: Grok 4.7 (grok-4.7)

## 1. Verdict

Not ready to build as written. Round 2 is applied; the catalog direction can stand. Literal reads of §10.3 and §10.5 still abort a deploy, return 500, or rewrite an admin’s row. Fix those, the PR tie-break, and the snapshot pin before coding. The 21.75 h total has no room for discovering them in slice 12.

## 2. Part A — items applied wrongly or incompletely

| Item | Where | What is wrong | Fix |
|---|---|---|---|
| B-4 | §5, §8 vs §7, §9.3 | The history-only instant (midnight UTC minus 14 h) is also the PR `ORDER BY` instant. On one day a date-only row always sorts before every timed row, so it takes an equal record. | History keeps that value. PR order: score, `performed_on`, `time_known DESC`, `performed_at`, `id`, `set_number`. One same-day mixed tie in the ranking fixture. |
| B-5 | §12 vs §15 slice 3 | The never-cut check is `GET /v1/exercises/bench%20press`. Slice 3 runs it before the catalog exists. | Slice 3: image starts, migrations applied. Slice 6: the seeded GET. |

No other A/B/C item is only half-applied. Exact kilograms, the two orders, the stored-row cursor, the idempotency key, `set_count`, and `user_exercises` match the list in the standing text.

What the catalog edit broke: §12’s “edited seeded row survives a re-run” contradicts §10.3 step 2 if that insert also writes links (below).

## 3. Part B — rulings

| Decision | Ruling | Confidence | Strongest argument |
|---|---|---|---|
| D-07 (revised) | Keep with modification | Medium | Database behind the same port meets O1 and X2 and leaves F2.3/F3 history unkeyed. The snapshot rules do not keep the promises in §10.2. |
| D-27 | Keep with modification | Medium | Fixed key, catalog-only delete, and a closed group list avoid rewriting or orphaning logged entries. The write and seed procedures, as sentences, do not do what their tables say. |

## 4. The ten calls

| # | Ruling | Confidence | Strongest argument |
|---|---|---|---|
| 1 Snapshot, 30 s + reload on the writer | Change | High | A few hundred rows do not justify `LISTEN`. Pin one object for the request, and do not apply a load that started before the snapshot it would replace. A failed post-write reload must still return the committed write. |
| 2 Boot exit / stale stays ready | Keep | Medium | One compose API process is already past migrate when it loads; exiting on no catalog is right. Thirty-second-old tags must not fail `/health/ready`. |
| 3 One TypeScript key function, no DB `CHECK` | Keep | High | A second `lower()` will diverge on names lifters actually type. Freeze the function in one sentence: changing it splits F3
