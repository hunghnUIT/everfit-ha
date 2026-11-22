<!-- Reviewer: Claude Opus 5.5 (model claude-opus-5-5, high effort), run through the Claude CLI with no tools and no web access. Round 3. Material: round-3-prompt.md, unedited, with files 01, 02, 03, 05, debate/resolution.md and section 9 of the round-2 summary, all inlined in the prompt. Output saved unedited. -->

Model: Claude Opus 5.5 (`claude-opus-5-5`)

## 1. Verdict

**Ready after the fixes listed.** None of them reverses a decision. Most are rules the design does not yet state:

- transactions and error mapping for the admin writes;
- what the seed does with group links when an insert conflicts;
- single-flight and per-request capture for the snapshot;
- a slice order that can actually be built;
- a guard whose activation is itself tested.

The catalog estimate is about 1 h low, and absorbing it uses half the buffer.

---

## 2. Part A — items applied wrongly or incompletely

| Item | Where | What is wrong | Fix |
|---|---|---|---|
| B-8 | §12 "Toolchain (slice 1)"; §15 slices 1 and 3 | Slice 1 must send "one HTTP request … through Nest to a migrated PostgreSQL". The database module and the first migration only arrive in slice 3 *(docs §15)*. As written, slice 1 cannot pass. | Move the database module and the first migration into slice 1, or reduce slice 1 to `GET /health/ready` against a Testcontainers database and move "migrated" to slice 3. 0 h. |
| B-5 | §12 "Clean image" row; §15 slice 3; 05 U-10 | The check asserts `GET /v1/exercises/bench%20press` returns the seeded exercise, but it is built in slice 3 and the catalog is slice 6. U-10 describes a different check: "start it against an empty database, log one entry, read the catalog". | Slice 3: readiness plus the migration table present. Slice 6: add the seeded exercise. Slice 7: log one entry. Make U-10 and §12 say the same thing. 0 h. |
| B-5 (consequence) | §4 layout (`scripts/seed-catalog.ts`); §13 "prune dev deps"; §14 | The migrate step now runs a TypeScript script inside a pruned production image. Two traps follow *(recalled)*. (1) With Nest's default `tsconfig`, a `.ts` file outside `src/` widens tsc's root, so output lands in `dist/src/main.js` and `node dist/main` breaks. (2) If migrations are applied with the `drizzle-kit` CLI, that is a dev dependency and is pruned. The clean-image check would catch both, after about an hour of debugging. | One compiled entry point, `src/cli/migrate.ts`: drizzle-orm's programmatic migrator, then the seed. The `migrate` service runs `node dist/cli/migrate.js`. `COPY config ./config` in the Dockerfile, and the file is read relative to `process.cwd()`. 0 h; saves the debugging. |
| C-4 | §9.4 | The whole-name hint was added to §9.3 only. A user who types `exercise=bench` on compare gets "No entries for … (both periods)" with no pointer to `?exercise=` on history. §9.3 also quotes the **input** (`'bench'`), while the §9.4 example quotes the **key** (`'bench press'`). | When both periods are empty, append the same fixed hint. Quote the same thing in both places. 0.05 h. |
| C-1 | §6, §7 | `decimal.js` rounds every result to `precision` significant digits, 20 by default *(recalled)*. The worst ranking product is 9 999.999 st → 63 502.925… kg × 1 030, which is 19 significant digits. It fits by one digit, by coincidence. The registry test checks the column width, not the arithmetic. | Set `Decimal.set({ precision: 40 })` in one module. Have the registry test also assert that the largest `rank()` product survives exactly. 0.05 h. |

**Broken by the revision, not tied to one item:**

- §15 says "if time runs out, what is unfinished is the newest requirement". §16 lists "exercise create / update / delete" under **Never cut**. Both cannot hold. In practice, the slice order makes the never-cut admin API the first casualty.
- `muscleGroup` is validated against the snapshot, but `GET /v1/muscle-groups` reads the tables (§10.2, §10.4). On a second replica, a just-added group can be a 400 "must be one of …" while the endpoint the message points to lists it. This happens only with more than one replica, for up to 30 s.

Everything else on the list was applied in every place I could find: A-1 to A-14, the other B items, C-2 and C-3.

---

## 3. Part B — rulings

| Decision | Ruling | Confidence | Strongest argument |
|---|---|---|---|
| D-07 (revised) | Keep with modification | High on direction, Medium on mechanism | Entries carry no FK to the catalog, so no catalog write can block, corrupt or orphan history, and the benchmarked history query is unchanged *(docs §5, §9.2)*. The modification is to the snapshot: one-statement load, single-flight refresh, one snapshot per request (objection 3). |
| D-27 | Keep with modification | Medium | The owner's six rules lose no data. But the write path as specified has no transaction rule and no constraint-error mapping, so ordinary double-submits end in 500s or merged group lists (objection 1). The guard's "constant time" comparison, written the obvious way, throws on a wrong-length token (objection 6). |

---

## 4. The ten calls (`debate/resolution.md` §17)

| # | Ruling | Confidence | Strongest argument / change |
|---|---|---|---|
| 1 | Keep with modification | High | A snapshot is right for a few hundred rows that change a few times a day. Change: serialize refreshes (single-flight); swap only if the load started after the one in place; load in one statement; take one snapshot per request. |
| 2 | Change (boot half); keep the stale half | Medium | Exit-after-10 s needs a compose `restart:` policy that §13 does not declare, and it crash-loops a replica during a database outage. Change: start, report `/health/ready` = 503 until the first load succeeds, answer catalog-dependent requests 503 until then. Same code, no magic 10 s. |
| 3 | Keep with modification | High | One function beats a `CHECK` that diverges. Add a golden test that pins `exerciseKey()` outputs. Add a written rule that changing it is a data migration (objection 7). |
| 4 | Keep with modification | Medium | A visible commented line is fine for v1. Three changes: use a length-safe constant-time compare; add a test that applies the decorator and proves the five routes return 401; handle the import that the commented line leaves unused (objection 6). |
| 5 | Keep with modification | Medium | Ledger, lock and fail-the-step are right. Missing: insert links only when the exercise row was inserted; take the lock before reading the ledger; make the ledger insert `ON CONFLICT DO NOTHING`; cover the migrations with the lock; define the zero-group case (objection 2). |
| 6 | Keep with modification | High | Last-write-wins is the right policy for one or two editors. As unspecified it is not LWW: two concurrent PUTs can merge their group lists. Change: `UPDATE exercises … RETURNING` first, which takes the row lock; then replace links; all in one transaction. |
| 7 | Keep | Medium | An admin verifying a change must see the database. Add one README line: entry tags and the history filter lag up to 30 s on other replicas, while the catalog routes do not. |
| 8 | Change (small) | Medium | Muscle-group names are normalised three different ways (objection 7). With writes open, also state the size bound (objection 9). |
| 9 | Keep, add a sixth | Medium | The five places are right for readers. Operators read logs: add one `WARN` line at boot, "catalog admin routes are unauthenticated". 0.05 h. |
| 10 | Keep with modification | High | The rename is good, but the script is still `npm run seed:bench` / `scripts/seed-bench.ts`, against "so that 'seed' means the catalog everywhere". Rename it to `bench:data`. |

---

## 5. Answers to the seven questions

### 1. Seed

**Two `migrate` steps at once.** The seed is safe only if `pg_advisory_xact_lock` is the **first** statement and the ledger is read after it. Under READ COMMITTED the second run then sees the first run's committed ledger *(recalled)*. The design says "under an advisory lock" but not where it is taken.

The migrations themselves are outside the lock. I believe drizzle's pg migrator takes no lock *(recalled, uncertain)*. A racing second run can then fail with "already exists". That stops one deploy and loses no data. Fix: take a session advisory lock around the whole `migrate` script.

**Admin write during the seed.** The seed's uncommitted insert of X makes an admin `POST X` block, then fail with 23505. Unless that is mapped, it is a 500 *(judgment)*. No data is lost.

**`ON CONFLICT DO NOTHING`, then the ledger.** The exercise row survives. The links do not, unless guarded. If the seed then inserts the file's links unconditionally, it either:
- merges the file's groups into the admin's row, breaking "the admin's row stays as written" *(docs §10.3)*; or
- hits the `(exercise_key, muscle_group)` PK on a shared group and aborts the whole seed, which stops the deploy.

Rule: insert links only for rows returned by `INSERT … ON CONFLICT DO NOTHING RETURNING exercise_key`.

**A file exercise naming a deleted group.** If that was its only group, the seed creates an exercise with zero groups. The admin API forbids that state (1–10 groups, §10.5). Either skip it with a warning or accept the zero-group row and say so.

If an admin deletes the group *during* the seed, the FK check aborts the transaction. That stops the deploy, and a retry passes.

**The key function changes later.** Ledger keys no longer match the file's new keys, so the seed **re-inserts exercises the admin deleted**, under new keys. It also duplicates surviving ones. Meanwhile new entries get new keys while old entries keep old ones, so PRs split silently. Nothing stops the deploy, which is the danger. Rule: the function is frozen by a golden test, and any change ships as one migration that rewrites `workout_entries`, `exercises`, `exercise_muscle_groups` and the ledger, failing on a key collision.

### 2. Snapshot

**Who sees what.** An admin creates X on replica A. A refreshes, so its history shows X's groups at once. On replica B, history shows `muscleGroups: []` and the filter excludes X for up to 30 s, while `GET /v1/exercises/x` on B already shows X (tables). A just-added group is a 400 on B's history filter *(docs §10.2, §10.4)*.

**Can one response mix two generations?** Yes, despite "never a mixture" (§10.2). History resolves the filter's keys from one snapshot, then awaits three queries, then reads `muscleGroupsFor()` per entry, possibly from the next snapshot. An entry returned under `muscleGroup=chest` can then show no `chest`. It is rare: it needs a changed catalog to swap in inside a ~10–30 ms request window. The fix is cheap: take `catalog.snapshot()` once per request.

The loader can also mix generations if it reads `exercises` and `exercise_muscle_groups` in separate autocommit statements. Use one query, or one read-only REPEATABLE READ transaction.

**Boot rule.** In compose it never fires: `api` waits for `migrate`. In a real outage, exit-then-restart works only with a restart policy, and it fights the existing design, which keeps serving 503s when the database drops. Gate readiness instead (call 2).

**Can two refreshes overlap?** Yes. A timer tick and a post-write refresh can run at once, and an older load finishing last swaps back the pre-write catalog. That breaks "shows at once on that replica". Two further rules:
- **Single-flight with a generation number.** Use a `setTimeout` chain, not `setInterval`.
- **Refresh after commit.** The post-write refresh must run after the write commits, never inside the write's transaction.

If that refresh fails, the write still answers success and the failure is logged.

### 3. Admin writes at the same time

| Case | As written | Smallest rule that closes it |
|---|---|---|
| Two POSTs of the same name | Check-then-insert → the second gets 23505 → **500** | Use `INSERT … ON CONFLICT DO NOTHING RETURNING` (no row → 409 `EXERCISE_EXISTS`), or map 23505 on `exercises_pkey` → 409. Same for groups → `MUSCLE_GROUP_EXISTS`. |
| PUT replacing groups while one group is deleted | PUT side: link insert → 23503 → **500**. DELETE side: the count says 0, the `RESTRICT` check fires → 23503 → **500** | 23503 on a link insert → 400 "unknown group" listing the known ones. 23503 on a group delete → 409 `MUSCLE_GROUP_IN_USE`. |
| DELETE during PUT | If PUT replaces links before touching the exercise row: FK 23503 → **500**. If the steps are separate statements: a **half-written** exercise with no links | One transaction per write. PUT starts with `UPDATE exercises SET name=$, updated_at=now() WHERE exercise_key=$ RETURNING`; 0 rows → 404 and roll back. That row lock also turns two concurrent PUTs into real last-write-wins instead of a union of both lists. |

These rules cost 0.3 h, including one mapping helper and its tests.

### 4. Open routes

The statement in §10.7 is honest but incomplete.

- **"Cannot read … a logged entry" is misleading.** It is true only *of these five routes*. Every entry is readable by anyone through `GET /users/{id}/workout-entries` (T4).
- **It omits that deleting groups makes clients' saved `?muscleGroup=` filters answer 400**, not an empty list.
- **It omits unbounded size.** Nothing bounds the catalog, so a script can make every replica reload an arbitrarily large catalog every 30 s, and `GET /v1/exercises` is unpaginated.
- **It omits arbitrary display text.** The exercise `name` allows any text up to 100 characters, which reaches any UI that renders the catalog.

**Shape of the guard.** A commented line is right over a run-time switch, but its activation is untested (objection 6).

**Five places.** Enough for readers. Add a boot `WARN` for operators.

### 5. Leftovers

None found for any of the seven assumptions:
- a catalog file read at boot;
- four-decimal kilograms;
- an idempotency key inside the plan;
- `set_count`;
- a `user_exercises` table;
- midnight UTC as the date-only ordering value;
- one order shared by the bulk response and history.

Every surviving mention is historical and carries its "changed later" note: resolution §4 item 3, §5, §9, §14; D-08's and D-26's round-1 lines.

The real leftovers are of a different kind:
- U-10's clean-image check ("start it against an empty database, log one entry, read the catalog") does not match §12.
- `npm run seed:bench` survives the rename.
- Design §17 lists **eleven** author calls (it adds "the buffer stays at 2.0 h"), while resolution §17 says **ten**.

### 6. Estimate

**Read side, 1.75 h — low.** The work in slice 6:

| Work | Hours |
|---|---|
| Second migration | 0.15 |
| Seed: file validation, ledger, lock, conditional links, planner as a pure function with tests | 0.75 |
| Packaging the migrate entry point into the image | 0.25 |
| Snapshot with single-flight, failure handling, tests | 0.4 |
| Three GET routes, DTOs and Swagger | 0.4 |
| `/units`, also in slice 6 | 0.15 |
| **Total** | **≈ 2.1–2.3** |

**Administration, 1.25 h — low.** Five routes, validation, the error mapping above, `Location`, the log line, the guard with two tests, and the ~15 catalog integration cases listed in §12. Realistically 1.6–1.9 h.

So the catalog is about 1 h over, plus about 1 h of fixes from this review. Both come out of a 2.0 h buffer. 21.75 h "inside 20–22" is believable only if the cut list is used.

**If it slips:**
1. CI benchmark job.
2. Drift check.
3. `fast-check` generators.
4. **The two muscle-group write routes, moved ahead of `GET …/{id}`.** That route backs the graded `Location` header (V2). The group routes are the owner's newest and least-used.
5. `GET …/{id}`.
6. Swagger UI.

Then trim the §12 catalog integration cases that repeat the seed planner's unit tests: keep "run twice" and "a deleted seeded row stays deleted".

### 7. Exact kilograms

`numeric(17,11)` is enough for every allowed input:
- the largest is 10 000 st = 63 502.9318 kg, five integer digits against six;
- three input decimals plus eight factor decimals give at most eleven.

Ranking is exact in SQL, and in TypeScript once the `decimal.js` precision is set explicitly (Part A). Volume and estimated 1RM shown back in a set's own unit are now exact.

One display inconsistency remains. A 0.125 kg micro-plate weight returned in its own unit shows three decimals (`102.125`). The same value converted shows two, and its delta shows two (`2.13` against a visible difference of `2.125`). Say "originals are returned as sent, up to three decimals; everything computed is two" in the README.

No tie-break or delta now disagrees with another place in the documents.

---

## 6. Detailed objections

**1. Admin writes have no transaction, lock or constraint-error rules.**
- *Target:* D-27, design §10.5.
- *Problem:* As in Q3, these end in 500s, or in a half-written or merged exercise:
  - a double POST;
  - a PUT racing a group delete;
  - a DELETE racing a PUT;
  - two PUTs at once.
- *Who hits this:* An admin double-clicking save, or a retrying client. Occasional, which matters because there are only a few writes a day. A grader running the same POST twice gets the sequential 409, so they would not see this unless they script it.
- *Evidence:* *docs* §10.5 states no transaction rule. *recalled*: PostgreSQL FK and unique semantics.
- *Proposed change:* §10.5 gains three lines:
  1. "Every catalog write is one transaction."
  2. "PUT updates the exercise row first, which locks it; 0 rows → 404."
  3. "23505 → the matching 409. 23503 on a link insert → 400 listing groups. 23503 on a group delete → 409 `MUSCLE_GROUP_IN_USE`."
- *Cost:* 0.3 h.

**2. The seed does not say what happens to links when an exercise insert conflicts.**
- *Target:* D-27 seed, design §10.3.
- *Problem:* Inserting the file's links after `ON CONFLICT DO NOTHING` either merges groups into the admin's row or aborts the seed. The lock position is unstated. A deleted only-group yields an exercise with zero groups.
- *Who hits this:* The case the table itself lists: "an admin created an exercise that a later file also adds". It happens once per such file change.
- *Evidence:* *docs* §10.3 table; *judgment*.
- *Proposed change:*
  - Link only rows returned by `RETURNING`.
  - Take `pg_advisory_xact_lock` as the first statement.
  - Make the ledger insert `ON CONFLICT DO NOTHING`.
  - Take a session lock around migrations and seed.
  - A file exercise left with no known group is skipped with a warning and recorded in the ledger.
- *Cost:* 0.15 h.

**3. The snapshot's "never a mixture" is false, and refreshes can run out of order.**
- *Target:* D-07, design §10.2.
- *Problem:* As in Q2. One request reads the snapshot before and after awaits. Overlapping loads can swap an older catalog over a newer one. A two-statement load can read half of a PUT.
- *Who hits this:* Rare; it needs a catalog change and a refresh inside a request window. The design makes an absolute claim, and an interviewer can break it with one question.
- *Evidence:* *judgment* (Node's event loop between awaits).
- *Proposed change:*
  - Add `snapshot()` to the port; services take it once per request.
  - Load in one SQL statement.
  - Refresh single-flight, swapping only for a newer generation.
  - Refresh after commit.
- *Cost:* 0.25 h.

**4. The slice order cannot be built as written.**
- *Target:* §15 slices 1 and 3; §12.
- *Problem:* Part A, rows 1–2.
- *Who hits this:* The candidate, in the first two hours. The git log the graders read would show red slices.
- *Evidence:* *docs* §12, §15.
- *Proposed change:* As in Part A.
- *Cost:* 0 h.

**5. The migrate step's packaging is unaddressed.**
- *Target:* §4, §13, D-23.
- *Problem:* Part A, row 3.
- *Who hits this:* Every grader. If it is wrong, `docker compose up` fails at `migrate`.
- *Evidence:* *recalled* (Nest tsc output layout; `drizzle-kit` is a dev dependency); *docs* U-10.
- *Proposed change:* A single `src/cli/migrate.ts`, compiled with the app.
- *Cost:* 0 h; saves debugging.

**6. The guard: the comparison can throw, and activation is untested.**
- *Target:* D-27, design §10.7.
- *Problem:*
  - `crypto.timingSafeEqual` throws on buffers of different length *(recalled)*, so a wrong-length token is a 500, not a 401. A "wrong token" unit test of the same length will not catch it.
  - No test proves that uncommenting the line protects exactly the five routes, or that the guard resolves its config in that module.
  - With the line commented, the import is unused and likely fails lint *(recalled)*. That makes it two lines.
- *Who hits this:* Whoever switches it on. The owner states this will happen.
- *Evidence:* *recalled*; *docs* §10.7.
- *Proposed change:*
  - Compare SHA-256 digests of both values.
  - Add a dedicated test file that calls `UseGuards(AdminTokenGuard)(CatalogAdminController)` before compiling the module, then asserts 401 on all five admin routes and 200 on a public route.
  - Comment the import alongside the decorator, and update the documents to say "two lines".
- *Cost:* 0.25 h.

**7. Two normalisation rules are unpinned or duplicated.**
- *Target:* §10.1, §10.5, §9.2.
- *Problem:*
  - `exerciseKey()` has no golden test, and no rule says how it may change (Q1).
  - Muscle-group names are normalised three ways:
    - "lower-cased, inner spaces collapsed" (group create);
    - "trimmed and lower-cased" (exercise writes);
    - "case-insensitive" (history filter).

    That is the very "two implementations of one rule" §10.1 warns against.
- *Who hits this:* An admin typing `"upper  back"` gets a 400 for a group that exists. A developer "improving" the key function in v2, for example to fold `Pull-up` and `Pull up`, splits history silently.
- *Evidence:* *docs* §10.1, §10.5, §9.2, design §17 "Settled as minor".
- *Proposed change:* `muscleGroupName()` beside `exerciseKey()`, used by all four callers (the three above plus the seed). A golden-output test for both.
- *Cost:* 0.1 h.

**8. The boot rule.**
- *Target:* §10.2, call 2.
- *Problem and fix:* As in call 2. The text also says "this is a restart on a real outage", which assumes a restart policy §13 does not declare.
- *Who hits this:* An operator restarting a replica during a database blip.
- *Evidence:* *docs* §10.2, §13.
- *Cost:* 0 h.

**9. The open-routes statement is incomplete.**
- *Target:* §10.7, D-27.
- *Problem:* As in Q4.
- *Who hits this:* An interviewer reading the honesty claim. Anyone who reaches a deployed instance.
- *Evidence:* *docs* §10.7, §10.4.
- *Proposed change:*
  - Reword "cannot" as "through these routes, cannot".
  - Add the three consequences: saved group filters turn into 400s, the catalog size is unbounded, the display names are arbitrary.
  - Optionally add a constant cap, for example 2 000 exercises and 100 groups, as a 409.
- *Cost:* 0.1 h for the text; +0.15 h for the cap.

**10. The estimate.**
- *Target:* D-26, §16.
- *Problem:* As in Q6. About 2 h of real overrun against a 2.0 h buffer. The stated range's lower bound is unreachable without cuts.
- *Evidence:* *judgment*.
- *Proposed change:* Keep 20–22 h, as the owner chose. Write in §16 that the plan relies on the first four cuts and on reordering the group write routes ahead of `GET …/{id}`.
- *Cost:* 0 h.

---

## 7. Contradictions between documents

1. §12: "one HTTP request goes through Nest to a migrated PostgreSQL" (slice 1). §15 slice 3: "Docker + compose + database module + first migration".
2. §12 clean image: "`GET /v1/exercises/bench%20press` returns the seeded exercise", built in slice 3. The catalog is slice 6. 05 U-10: "start it against an empty database, log one entry, read the catalog".
3. §15: "if time runs out, what is unfinished is the newest requirement". §16: "Never cut: … exercise create / update / delete".
4. Resolution §17: "**Calls the author made while applying it**", ten of them. Design §17 lists eleven, ending with "The buffer stays at 2.0 h".
5. Resolution §17 call 10: "so that 'seed' means the catalog everywhere". §11 / D-22: "`npm run seed:bench`".
6. §10.7: "What they cannot do: read … a logged entry". §9: `GET /users/{userId}/workout-entries`, open to anyone (T4).
7. §10.5 group name: "lower-cased, inner spaces collapsed". §10.5 `muscleGroups`: "each is trimmed and lower-cased". §9.2: "optional, case-insensitive".
8. §9.3 message: "No entries found for exercise 'bench'…" (the input). §9.4 message: "No entries for 'bench press'…" (the key).

## 8. Technical errors

- **§10.2 "a request sees one or the other, never a mixture".** False for any request that calls the synchronous port on both sides of an `await` (Q2).
- **§10.2 "this is a restart on a real outage".** Compose restarts nothing without a `restart:` policy *(recalled)*. None is declared in §13.
- **§5 "`ON DELETE RESTRICT` … is what makes 'in use' a 409".** The constraint raises SQLSTATE 23503. It becomes a 409 only through an explicit mapping, and without one the race in Q3 is a 500.
- **§10.7 "compares … in constant time, answers 401".** Not false, but `crypto.timingSafeEqual` throws on unequal lengths *(recalled)*, so the obvious implementation answers 500.
- **§6 "Arithmetic uses `decimal.js` … exact".** Exact only while results stay within 20 significant digits, the default precision *(recalled)*. The current worst case is 19.

## 9. Cut / add

**Add (≈ 1.1 h):**

| Item | Hours |
|---|---|
| Admin write transactions and error mapping | 0.3 |
| Seed link rule and lock order | 0.15 |
| Snapshot rules | 0.25 |
| Guard compare and activation test | 0.25 |
| Golden tests and the shared group normaliser | 0.1 |
| Boot `WARN` line and `Decimal` precision | 0.05 |

**Cut or reorder:**
- Move the two muscle-group write routes ahead of `GET …/{id}` on the cut list.
- Drop the catalog-seed integration cases that duplicate the planner's unit tests, keeping "run twice" and "a deleted seeded row stays deleted" (−0.3 h).
- Put the benchmark's concurrency-8 pass on the cut list, after `fast-check` (−0.2 h).

## 10. Interview questions the changes invite

1. Two admins PUT the same exercise with different group lists at the same instant. What is in `exercise_muscle_groups` afterwards, and what in your code guarantees it?
2. In v2 you make `exerciseKey()` fold hyphens. What happens to the seed ledger, the catalog, and three years of a lifter's PRs?
3. Why does a stale catalog keep a replica in rotation while a missing one kills the process? What does the client of a cold replica see?
4. With the admin routes open, what can a stranger do to every coach's view, and what stops them posting a million exercises?
5. Your core is 21.75 h inside 20–22 h with a 10 % buffer. Which slice overruns first, and what do you cut before you touch the admin API you called never-cut?
