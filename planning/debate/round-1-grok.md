<!-- Reviewer: Grok 4.7, run through the Grok CLI with web search disabled. Output saved unedited apart from removing two lines of tool narration before the heading. -->

# Review by Grok 4.7

## Verdict
Not ready to build until three product decisions change. Apply the F3.3 formula at one rep as written; accept a body `userId` that equals the path `userId`; and store a client-supplied calendar day rather than inferring the workout day from an instant. With those fixed, drop the idempotency table, the catalog sync, and the per-entry maxima from the first slice so the 15-hour budget can cover history, PRs, a real benchmark, and the README. Conceded: append-only entries plus sets, on-read PRs for arbitrary ranges, keyset pagination with a total order, accepting unknown exercises, empty filters as HTTP 200, atomic bulk, the single unit registry, NUMERIC storage, and echoing the original unit are the right calls.

## Rulings on contested decisions
| # | Decision | Ruling (Keep / Change / Modify) | Confidence | Strongest argument |
|---|---|---|---|---|
| 1 | D-03 | Keep | High | V1 grades schema, indexing, aggregation efficiency, and normalization, and T2 asks for a justification of either database. PostgreSQL puts constraints, row-value keyset, and `EXPLAIN` on the page a reviewer actually reads. Multi-document atomic bulk plus the idempotency insert need a transaction; on MongoDB that means a replica set in compose (*recalled*). U-1 is unchecked and is not an evaluation row, so a Mongo design can pass and would not score higher on the written rubric. |
| 2 | D-06 / D-11 | Modify | Medium | Keep two tables, append-only, and compute PRs on read. F3.5 is an arbitrary range, and a maintained PR row brings back the read-modify-write race E5 is about. Drop `max_weight_kg`, `max_volume_kg`, and `max_e1rm_kg` until a benchmark misses the budget. One covering index is enough if those columns stay: the plan is one range read plus an in-memory top-1, and a per-metric index does not stop early for an arbitrary date window. |
| 3 | D-09 | Modify | Medium | Keep `performed_on` as the only filter key, keep the UTC instant beside it, and keep rejecting offset-less date-times. Stop deriving the calendar day from the instant. `date` should be a client-supplied `YYYY-MM-DD`. A `Z` instant does not contain the athlete's day, and `Date.prototype.toISOString` always emits `Z` (*recalled*). |
| 4 | D-12 | Change | High | F3.3 states `weight × (1 + reps/30)` with no exception. One rep is the first value a reviewer will calculate by hand. Ship the literal formula. Record the "source assumes more than one rep" note as a rejected alternative in the README and in `AI_WORKFLOW.md`. |
| 5 | D-15 / D-16 | Modify | Medium | Keep D-16: a per-user index walk with a residual `LIKE` is a fair reading of E6, and a warm scan of 50k index tuples is plausibly inside 100 ms (*judgment*, still U-3). Change the scope of D-15. E5, as written, is two key-less logs of the same exercise at the same time. An optional header does not handle that client. Insert-only transactions and atomic bulk already do. Cut the key from the first build. |
| 6 | D-04 | Modify | Medium | Keep a typed SQL layer. Make hand-written `.sql` the only migration source, and use `schema.ts` for query types only. D-04 currently says both "drizzle-kit-generated migrations" and "do not re-run drizzle-kit". Prisma or TypeORM would hide the keyset and PR queries that V1 grades. |
| 7 | D-07 | Modify | Medium | Keep free text, the normalised key, no foreign key, no aliases, and the `ExerciseCatalog` port. That is the right reading of F2.3 and X2. Load the JSON at boot and bind matching keys with `exercise_key = ANY($keys)`. The file is already deployed with the app, so the sync step adds a second source of truth and does not remove a deploy. |
| 8 | D-14 | Modify | Medium | Keep atomic commit, the 100-entry cap, and "every path, or nothing stored". Expose one `POST` whose body is `{ entries: [1..100] }`. F1.3 asks for multiple exercises in one request. A second route doubles validation, errors, and idempotency for a `Location` header the brief does not require. |
| 9 | D-17 | Modify | High | Keep the path segment, the opaque 1–64 character id, URI versioning, and HTTP 200 with an empty body for an unknown user (T4, no user store). F1 also lists `userId` as an entry field. If the body omits it, take the path. If it equals the path, accept it. If it differs, 400 with that path named. |
| 10 | D-05 / D-22 | Keep | High | V2, V3, and V6 grade boundary validation, dependency injection, and test design. The Nest 12 starter already wires Jest, and Swagger reads class-validator metadata. `nestjs-zod` does not declare Nest 12 (author V-1, not re-checked). A newer library would be fashion, which is not a rubric row. |
| 11 | D-08 / D-24 | Keep | Medium | NUMERIC and "return the stored original when the requested unit matches" are the real correctness: the athlete's `225` must not come back as a nearby value. `decimal.js` earns its keep at exact half-up boundaries, where binary rounding is wrong (*recalled*: values such as `1.005`). Inside the stated caps the pound factor itself rounds the same way in float64 (*judgment*). Say that, and no more, in the README. |
| 12 | D-26 | Modify | Medium | The slice order is the right build order. The hours are short: slices 8 and 9 (idempotency, keyset) and slice 11 (seed plus reading plans) are the ones that slip. State about 20 h, or keep 15 h only with the cut order in O-7 already decided. |

## Detailed objections
### O-1 Literal Epley, including one rep — Severity: Major
- **Target:** D-12, design §7, F3.3, A3
- **Problem:** The brief prescribes `weight × (1 + reps/30)` and does not mention a special case. A one-rep set is the obvious calculator check. Returning the weight itself will look like a bug to a reviewer who has the brief open. The Wikipedia "assumes r > 1" note (author V-6) is a reason to mention the trade-off, and it is a weak reason to ship a different function than the one being graded under V4.
- **Evidence:** F3.3 wording in `01-requirements.md`. V-6 not re-checked this session. *Judgment* on how a human grader checks the formula. *Recalled* that the commonly quoted Epley statement assumes more than one rep.
- **Proposed change:** One function: `round_half_up(weight_kg × (1 + reps/30), 4)` for every accepted rep count. Name the unit test for the literal one-rep result. In the README and `AI_WORKFLOW.md`, record "return the weight at one rep" as a suggestion that was rejected because F3.3 states the formula. That rejection is a free AI3 example.
- **Cost:** 0 h.

### O-2 Body `userId` that matches the path is a 400 — Severity: Major
- **Target:** D-17, design §9.1, F1, T4, A7
- **Problem:** F1 says a workout entry has `userId`, `date`, `exerciseName`, and `sets`. T4 says pass `userId` as a parameter. The first curl a reviewer copies from the brief puts `userId` in the JSON. `forbidNonWhitelisted` then rejects the payload before any workout logic runs. The path-only rule is defensible in an interview and hostile in the first two minutes of `docker compose up`.
- **Evidence:** *Judgment*, from the wording of F1 and T4. No extra source.
- **Proposed change:** Path remains authoritative. Validation: missing body `userId` is fine; body `userId` equal to the path is fine and is not persisted separately; body `userId` different from the path is `VALIDATION_ERROR` on path `userId` with a message that the path value wins. README shows one curl with the id only in the path, and one curl with both set to the same value.
- **Cost:** +0.5 h.

### O-3 Workout day must be supplied, and it must not be parsed with `Date` — Severity: Major
- **Target:** D-09, design §8 and §14, E4, A1
- **Problem:** `performed_on` is doing the work of every filter, PR date, and comparison, but it is inferred. For an offset date-time the wall date is already the `YYYY-MM-DD` prefix of the string. A `Z` suffix is defined as "that UTC day is the workout day". Typical JavaScript clients send `toISOString()`, which is always `Z` (*recalled*), so the second column silently stores the UTC day and does not do the job the design claims. §14 then allows "a strict regex + `Date`". `Date` converts to an instant first. UTC getters then show the UTC day, and local getters show the server's zone. Either one disagrees with the source prefix whenever the offset and UTC fall on different calendar days. Rejecting offset-less date-times is the right half of D-09. Keep it.
- **Evidence:** *Recalled* `Date.prototype.toISOString` and `Date` parse behaviour. *Judgment* that E4 is satisfied by a strategy the client cannot accidentally bypass.
- **Proposed change:** Schema stays `performed_at timestamptz` plus `performed_on date`. Contract: required `date` is only `YYYY-MM-DD` and is stored as `performed_on` with no transformation. Optional `performedAt` is an ISO instant that includes `Z` or a numeric offset, stored as `performed_at`; offset-less values stay a 400. If `performedAt` is omitted, store UTC midnight and document it as "time unknown", distinct from a real midnight workout. Delete the inference table in §8. Filters, PR dates, and compare keep using `performed_on` only.
- **Cost:** −0.5 h against the five-branch parser.

### O-4 Optional `Idempotency-Key` does not answer E5 — Severity: Major
- **Target:** D-15, design §9.5, E5, A5
- **Problem:** E5 is "same user logging same exercise at same time". The client in that sentence has no header. The design's own rule then stores two entries, which means the feature built for E5 does not run on the E5 scenario. What the key actually solves is client retries. That is a real production pattern (*recalled*: Stripe-style replay), and it is not one of V7's listed signals (Docker, logging, config, performance). A unique `(user, exercise, time)` constraint is the wrong patch: date-only rows share one sentinel instant, and two genuine sessions would collide. Silent content-hash dedupe is also wrong. The published §9.5 sequence itself is sound at READ COMMITTED if, and only if, the key insert, the entry inserts, and the `entry_ids` update commit in one transaction: `ON CONFLICT` waits for the in-flight owner of the same key (*recalled*). A commit that persisted an empty `entry_ids` would replay a false success. There is no scheduler for the 24 h purge, so retention is a comment.
- **Evidence:** *Judgment* on the wording of E5. *Recalled* PostgreSQL `INSERT … ON CONFLICT` waiting behaviour and READ COMMITTED visibility.
- **Proposed change:** README answer to E5: append-only inserts, PRs computed on read, bulk in one transaction, so two concurrent writers cannot lose a row, tear a batch, or race a PR update. Two identical key-less posts are two entries, because a second real session is legitimate. Move `idempotency_keys` to "at scale". If it is built later, hash the route plus a canonical body, stay on READ COMMITTED, and add the integration test the design already describes (20 parallel posts, one key, one row).
- **Cost:** −2 h from the first build.

### O-5 Per-entry maxima are a cache built before the measurement — Severity: Major
- **Target:** D-06, D-11, design §5 and §9.3, E6, V1
- **Problem:** The three `max_*` columns are a second source of truth for a formula that already lives in TypeScript. They are safe only while every writer stays in that one function and entries stay immutable. The stated reason is speed at 50k. The brief asks for "perform well", and the 50 ms figure is self-imposed. A top-1 over `entries ⋈ sets` for one user and one exercise reads on the order of 50k × a handful of sets. That is a small sort (*judgment*) and it removes the drift class. Maintaining a `personal_records` table on write is the worse option: F3.5 still has to scan a range, and the write path becomes the E5 race.
- **Evidence:** *Judgment* on a 200k-row top-N in local PostgreSQL. *Recalled*: `integer / integer` truncates in PostgreSQL, and `numeric * float8` leaves exact `numeric`.
- **Proposed change:** Delete the three columns and the `INCLUDE (max_*)` list. Keep `ix_entries_exercise (user_id, exercise_key, performed_on DESC, performed_at DESC, id DESC)` for the range. One query, three parenthesized branches, each `LIMIT 1`:

```sql
SELECT e.id, s.set_number
FROM workout_entries e
JOIN workout_sets s ON s.entry_id = e.id
WHERE e.user_id = $1
  AND e.exercise_key = $2
  AND ($3::date IS NULL OR e.performed_on >= $3)
  AND ($4::date IS NULL OR e.performed_on <= $4)
ORDER BY s.weight_kg DESC,
         e.performed_on, e.performed_at, e.id, s.set_number
LIMIT 1
```

Volume branch orders by `(s.reps::numeric * s.weight_kg)`. Literal Epley branch orders by `(s.weight_kg * (1 + s.reps::numeric / 30))`. Use `reps::numeric / 30`, so the division stays exact. Load the ≤ 3 winning sets and format in TypeScript. One integration fixture (one-rep set, a tie, a half-up boundary) asserts the SQL expression and the TS function name the same set. If that query misses the budget, add the three columns back as a measured fallback, written in the same transaction by the TS function.
- **Cost:** −0.5 h net now. +1.5 h only if the benchmark fails.

### O-6 The performance gate can fail for planner reasons, and the fallback list is in the wrong order — Severity: Major
- **Target:** D-16, design §5 and §11, E6, U-3
- **Problem:** Step 1 of history can be an index-only scan: every returned column sits in `ix_entries_history`, and a residual `LIKE` is legal on an `INCLUDE` column (*recalled*). That plan still depends on the visibility map, which the design already says. The seed does not protect the plan. Two users of 50k plus about 20 small users make the heavy user a large fraction of the table. PostgreSQL may then seq-scan, and the EXPLAIN you paste into the README will not be the index story V1 is grading. Separately, §11 applies "per-metric PR indexes" as the first fallback for any missed budget. Those indexes do nothing for a slow `LIKE`. A no-match history request really does walk every index tuple for that user; at 50k that can still be "performing well", and it is the case the bench must time. It is not a reason to add PR indexes.
- **Evidence:** *Recalled* planner choice between bitmap/seq scan and an index scan when the leading column is not selective; index-only scans and the visibility map. U-3 not re-checked. *Judgment* that 50k warm index tuples can land under 100 ms once the index plan is actually chosen.
- **Proposed change:** Seed background rows so each heavy user is a small slice of `workout_entries` (about 10× or more), which is also the multi-tenant shape. Record `EXPLAIN (ANALYZE, BUFFERS)` for three cases: common term (stops at `limit`), no-match term, and the single-exercise PR user. Split fallbacks. History over budget: a `user_exercises (user_id, exercise_key)` row written with `ON CONFLICT DO NOTHING`, resolve the `LIKE` there (tens of keys), then `exercise_key = ANY($keys)` on the date index. Trigram only after that, or if fuzzy match is ever required. PR over budget: then per-metric indexes, or the stored maxima from O-5. Quote numbers in the README only from a run of `npm run bench`.
- **Cost:** +0.5 h of seed and bench discipline. Saves the hours of building the wrong index first.

### O-7 The 15-hour total does not survive contact with slices 8, 9, and 11 — Severity: Major
- **Target:** D-26, design §15 and §16, D8
- **Problem:** The slice order matches the dependency order, including catalog-before-log so `muscleGroups` exists. The hours do not. A custom problem-details flattener, Testcontainers, keyset SQL, and reading `EXPLAIN` each overrun a 1–1.5 h slot the first time they fight back. AI shortens typing and does not shorten that. As written, the plan is about 20 h of focused work for someone already comfortable with Nest and PostgreSQL (*judgment*).
- **Evidence:** *Judgment*. The decision log already marks this entry Low confidence.
- **Proposed change:** Keep the order. Cut, in this order, until the sum fits the deadline: (1) idempotency, −2 h, O-4; (2) catalog tables and sync, −0.5 h, O-8; (3) stored maxima, −0.5 h, O-5; (4) `fast-check`, −1 h, keep table-driven unit tests; (5) Swagger UI, −1 h, README tables already required by D4; (6) `GET /workout-entries/{id}`, −0.5 h, not in the brief. Do not cut compare (F3.5), the benchmark (E6), Docker, the unit registry (X1), or the timezone write-up (E4). After cuts 1–3, re-state the estimate at about 16–17 h plus a 2 h buffer, or apply cuts 4–6 and keep "about 15 h" honestly.
- **Cost:** 0 h of coding. Avoids a late scramble that shows up as one giant commit (AI5).

### O-8 Catalog sync is a second source of truth X2 does not ask for — Severity: Minor
- **Target:** D-07, design §10, X2, F2.3
- **Problem:** "Not hardcoded in business logic" is met by a JSON file plus an `ExerciseCatalog` port. Syncing that file into two tables on every migrate means the mapping can drift from the file the reviewer is reading, and changing a muscle group still needs a deploy of the JSON. The semi-join looks like schema craft and does not touch the 50k problem: a muscle group resolves to a short key list.
- **Evidence:** *Judgment*.
- **Proposed change:** `catalog:sync` becomes "read `config/exercise-catalog.json` at boot, fail boot if it is invalid". Normalise names with the same function entries use. History adds `AND e.exercise_key = ANY($keys::text[])` when `muscleGroup` is set. Unknown exercises stay legal and simply have no groups. No aliases. Keep `GET /exercises` and `GET /units` if time allows; they are the easiest way to show X1 and X2 to a reviewer.
- **Cost:** −0.5 h.

### O-9 A cursor is a different query if the filters change — Severity: Minor
- **Target:** design §9.2 and §17, D-10, F2.5
- **Problem:** §17 says a cursor is not bound to the filters it was issued with, and that a client who changes filters mid-walk is on their own. The failure mode is silent missing rows, which is a bad demo if a reviewer edits `exercise` in the next request and reuses `nextCursor`. The keyset comparison itself is right: for an all-DESC key, `(performed_on, performed_at, id) < ($on, $at, $id)` matches `ORDER BY … DESC` (*recalled*, hand-checked against a three-column example). `id` makes the order total, so equal timestamps do not skip a row.
- **Evidence:** *Recalled* PostgreSQL row-value comparison. *Judgment* on the demo failure.
- **Proposed change:** Put a hash of the active filters (`exercise`, `muscleGroup`, `from`, `to`, `unit`) and `v` inside the opaque cursor. On mismatch, 400 `VALIDATION_ERROR` with a message to restart without `cursor`. Document that backdated inserts appear on a later page and are not duplicated, which is the keyset property D-10 wants.
- **Cost:** +0.5 h.

### O-10 Drizzle is described as two opposite migration regimes — Severity: Minor
- **Target:** D-04, design §13, U-2
- **Problem:** The decision says commit drizzle-kit output, and it also says hand-written SQL is the source of truth and drizzle-kit must not be run again once `INCLUDE`, `DESC`, or `uuidv7()` have been edited in. A builder following D-04 on day one will generate a migration, hand-edit it, and then fight schema drift. Reviewers will trust the `.sql` they can read. They will not award V1 for the query-builder brand.
- **Evidence:** Internal contradiction between D-04's "Decision" paragraph and its "Migration rule". U-2 not re-checked, and the design already says it does not depend on the DSL.
- **Proposed change:** Migrations are hand-written SQL only. The TypeScript schema is types for queries, kept honest because every integration test applies the real SQL. Pin the query library. If a one-hour spike shows it cannot express the keyset or the three-branch PR query cleanly, switch to Kysely plus the same SQL files, which is already the recorded fallback. Do not switch to Prisma to look familiar.
- **Cost:** 0 h now. Avoids about 2 h of kit drift in slice 3.

### O-11 Two write endpoints for one use case — Severity: Minor
- **Target:** D-14, design §9, F1.3, A4
- **Problem:** F1.3 is "multiple exercises in a single request". It does not ask for a second resource. Single-entry `POST` plus `/bulk` means two DTO stacks, two error paths, and two idempotency stories that can drift. Atomic all-or-nothing is still the right failure mode for "today's session". HTTP 207 is the import pattern, and nothing in the brief is an import of independent rows.
- **Evidence:** *Judgment*.
- **Proposed change:** `POST /v1/users/{userId}/workout-entries` accepts `{ "entries": [ … ] }` with 1–100 items, one transaction, two multi-row inserts (entries, then sets), 201 and `{ data: [ … ] }`. A one-item array is the single-entry case. Drop the `Location` header, or set it only when `entries.length === 1`. Invalid item: zero rows, `errors[].path` like `entries[2].sets[0].unit`.
- **Cost:** −0.5 h.

## Missed requirements or misreadings
- F1 lists `userId` on the entry. Treating it as an unknown property is the harsh reading of A7. O-2 is the fix. T4's "parameter" is satisfied by the path either way.
- F3.3 is misread as "the formula, plus a domain patch at one rep" (A3). O-1 reverses that.
- E5 is misread as "retries, if the client sends a key" (A5). The sentence in the brief has no client cooperation. O-4 is the fix. The rejection of a unique `(user, exercise, instant)` constraint, and of silent content dedupe, is the correct half of A5.
- E2 names negative reps. Rejecting `reps = 0` is stricter than the brief. Keep it if the README says a zero-rep attempt is not a set and cannot be a 1RM; otherwise a reviewer logging a failed attempt will call it a miss.
- No functional id is missing. F1–F3.5, E1, E3, E4, E6, X1, X2, T1–T4, and D1–D8 all have a designed answer. Auth, edit/delete, and a users table are correctly out of scope (A10, A11, §10).
- Conceded readings, so a later round can see agreement quickly: A2 (unknown exercises accepted, no FK), A4 (atomic bulk), A6 (caller-supplied ranges, no server "this month"), A8 (volume is one set), A10 (unknown user is an empty 200), A11 (append-only). Inclusive `from`/`to` is a fair filling of F2.2. Partial match as case-insensitive substring, rather than fuzzy match, is a fair filling of F2.1.

## Technical errors found
- D-12 says "no cap on reps". Design §9.1 and D-18 cap reps at 1–1000, and §17 says that cap was added to avoid overflow. The log is stale. The sanity cap can stay; the sentence "no cap" cannot.
- §9.3 always shows `performed_on BETWEEN $3 AND $4`. For an all-time PR the design's own response has null bounds. `BETWEEN NULL AND NULL` matches nothing (*recalled*). Omit the predicate, or write `($3::date IS NULL OR performed_on >= $3)` as in O-5.
- §9.2 compares `muscle_group = $5` as written. §17 says muscle groups are matched case-insensitively. Lowercase the parameter in the service, the same way the exercise term is pre-normalised, or the SQL contradicts §17.
- §8 says date-only rows of the same day come back newest-logged first because `id` is `uuidv7()`. *Recalled* from RFC 9562: the time portion is millisecond resolution and the rest is random unless the implementation adds a counter. PostgreSQL `now()` is the transaction timestamp, so every row of one bulk insert gets the same `created_at` too (*recalled*). Neither `uuidv7()` nor `created_at` orders rows inside one statement in one millisecond. Delete the "newest-logged first" sentence, or generate the sort key in the application in array order and add a test that inserts two date-only rows in one request.
- Compare requires four dates and §8 defines `from > to` as a 400. The same rule is not stated for `compareFrom` / `compareTo`, or for inverted ranges on the PR endpoint. Apply one helper to every pair.
- If Epley or volume ever moves into SQL, `reps / 30` is integer division and collapses small rep counts toward the weight itself, and `reps / 30.0` promotes the product to float8 (*recalled*). The expression that matches NUMERIC half-up is `weight_kg * (1 + reps::numeric / 30)`.
- Author V-3 checks that the `postgres:18` image tag exists. It does not check the data directory. *Recalled*, not re-checked: the official PostgreSQL 18 image changed `PGDATA` to a versioned path under `/var/lib/postgresql`, and a volume mounted at the old `/var/lib/postgresql/data` path fails persistence. Confirm the image README while writing compose, mount the path it documents, and smoke-test `compose down` then `up` without deleting the volume. That is D3.
- §9.5's wait-then-replay sequence has no hole if isolation stays READ COMMITTED and the key row is completed in the same transaction as the entries. A serialization failure mode appears only if the session is moved to SERIALIZABLE (*recalled*). Do not do that for this write.

## What I would cut / what I would add
- Cut: `idempotency_keys` and the header (O-4); catalog tables and `catalog:sync` (O-8); `max_*` columns until the bench fails (O-5); the single-entry-only route (O-11); `fast-check`; Swagger if slice 12 is slipping; `GET /workout-entries/{id}`.
- Add: the body-`userId` equality rule (O-2); the literal Epley test, plus the rejected-alternative note for AI3 (O-1); client-supplied `date` and optional `performedAt` (O-3); a filter hash inside the cursor (O-9); a seed where the heavy user is a small fraction of the table, and separate fallbacks for history and PRs (O-6). The SQL/TS agreement fixture in O-5 replaces the `max_*` consistency test.

## Claims I re-checked
| Claim (ID from 05-research-notes) | Result | Source |
|---|---|---|
| U-1 | Not re-checked. The D-03 ruling does not need it to be true or false. | No web search this session. |
| U-2 | Not re-checked. The design already stopped depending on the DSL. O-10 only removes the contradictory kit story. | No web search this session. |
| U-3 | Not re-checked. Judgment: a warm 50k-tuple index-only filter can land under 100 ms once the planner picks the index. It stays a hypothesis until `EXPLAIN`. | Recalled planner and index-only behaviour. |
| U-6 | Not re-checked. A human with F3.3 and a one-rep set is enough to change D-12. An auto-grader is not required for that ruling. | Judgment. |
| V-4 | Not re-checked. No dispute with built-in `uuidv7()`, exact `numeric`, or the cited `pg_trgm` limits. | Author cited PostgreSQL 18 docs. |
| V-6 | Not re-checked. Recalled that the Wikipedia one-rep-max article qualifies Epley with "assuming r > 1". That does not override F3.3. | Author cited Wikipedia; not re-fetched. |
| K-1 | Recalled; agrees. The international pound is an exact kilogram factor. | Recalled definition. |
| K-3 | Recalled; agrees for an all-DESC sort key. Row-wise `<` matches that order. Mixed ASC/DESC would not, and this design has no mixed key. | Recalled PostgreSQL row-value comparison. |
| K-6 | Recalled; agrees. `INCLUDE` feeds an index-only scan only while the visibility map marks the pages all-visible. | Recalled PostgreSQL index-only scan behaviour. |
| K-7 | Recalled; agrees, with a nuance. Since PostgreSQL 12 a CTE referenced more than once is materialized even without the keyword, so `MATERIALIZED` in §9.3 documents the intent and does not change the plan. | Recalled PostgreSQL CTE planning. |
| K-9 | Recalled; agrees. Multi-document transactions require a replica set or a sharded cluster. | Recalled MongoDB transaction requirement. |
| K-10 | Recalled; agrees. `ON CONFLICT DO NOTHING` waits until the in-flight inserter of the same key commits or rolls back. | Recalled PostgreSQL `INSERT ON CONFLICT`. |
| K-13 | Not used. High-rep inaccuracy is a reason to show `reps` in the payload, which the design already does, and it is not a reason to change the formula. | Recalled coaching folklore. |

## Questions the candidate should be ready for in the interview
1. The brief's entry includes `userId`. I posted it in the body and received 400. Which requirement did I violate, and what does the error tell me to change?
2. One rep at 100 kg. Walk the arithmetic you implemented against the arithmetic printed in F3.3. Where is the README sentence that says you refused the other behaviour, and why is that refusal safer than shipping it?
3. Two clients post the same user, the same exercise, and the same sets at the same moment, with no extra header. What does E5 require, which rows exist afterwards, and why did you refuse a unique constraint on `(user, exercise, time)`?
4. The client sends `toISOString()`. Which column is the workout's day, what happens for an athlete east or west of UTC, and which function is forbidden to compute `performed_on`?
5. Show `EXPLAIN (ANALYZE, BUFFERS)` for a no-match partial name on the 50k user. What changes if that user is half the table, and what changes if those pages are not all-visible yet?
6. Add stone. Which files change, which queries change, and which migrations must not appear? What fails in CI if the new factor no longer fits the column?
7. Why PostgreSQL, if you believe the company's production database is MongoDB? Which brief rows would get worse if this schema were one document per entry, and what would compose look like the moment a bulk write needs a transaction?
8. Two date-only entries inserted by one bulk request share a day and a sentinel instant. What is their order, why does `uuidv7()` not mean "later in the VALUES list", and what does the cursor contain so the next page neither skips nor repeats them?
