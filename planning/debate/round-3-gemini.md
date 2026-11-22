<!-- Reviewer: Gemini 4 Argon (model gemini-4-argon, high reasoning effort), run through the GitHub Copilot CLI with no tools and no web access. Round 3. Material: round-3-prompt.md, unedited, with files 01, 02, 03, 05, debate/resolution.md and section 9 of the round-2 summary, all inlined in the prompt. Output saved unedited. -->

Model: Gemini 4 Argon (gemini-4-argon)

### 1. Verdict

**Ready after the fixes listed.** Part A applied the round-2 list faithfully across the documents, with only small seams in how NestJS `ValidationPipe` and `Temporal` execute the new rules. Part B (moving the exercise catalog to PostgreSQL with open `/v1/admin` routes) fits `O1`/`O1.1` well at the architectural level, but introduces concrete concurrency, seed-corruption, and snapshot-consistency bugs in §10 that will produce 500s or corrupt catalog rows unless tightened before coding starts.

---

### 2. Part A — items applied wrongly or incompletely

| Item | Where | What is wrong | Fix |
|---|---|---|---|
| **B-3** | `02-design.md` §8 ("The parser is chosen by the shape of the input", shape 2) vs `03-decision-log.md` D-09 | §8 says: `instant.toZonedDateTimeISO(zone).toPlainDate()`, where `zone` is `"timeZone when sent, otherwise the offset the client wrote"`. For a `Z` input (`<date>T12:30:00Z`) with no `timeZone`, the offset token written is `"Z"`, and `instant.toZonedDateTimeISO("Z")` throws `RangeError` in Node's `Temporal`. Also, for shape 1 (`YYYY-MM-DD`), §8 says `"the date text is performed_on"` without mentioning `Temporal.PlainDate.from(text)` validation, so an impossible date like Feb 30 would bypass DTO validation and fail at SQL `INSERT` (`22008` → 500). | When `timeZone` is omitted on shape 2, take the `YYYY-MM-DD` prefix of the validated string (as D-09 already states) and validate both shape 1 and that prefix with `Temporal.PlainDate.from(dateText)`. (+0.05 h) |
| **B-5** | `02-design.md` §15 (Slice 3 vs Slice 6) and `05-research-notes.md` U-10 | Slice 3 includes `"the clean-image check in CI"`, which §12 defines as calling `GET /v1/exercises/bench%20press` to verify the catalog migration, seed script, and JSON file. None of those exist until Slice 6. Also, U-10 still says the check will `"log one entry"`, which §12 dropped. | Keep a container `/health/ready` smoke check in Slice 3 and add the `GET /v1/exercises/bench%20press` assertion in Slice 6; align U-10 with §12. (0 h) |
| **B-6** | `02-design.md` §9.1, §9.6 | (1) §9.6 says `"a body sent with any content type other than application/json"` is 415. Standard clients (`fetch`, Supertest, Swagger UI) send `application/json; charset=utf-8`, and `GET`/`DELETE` carry no `Content-Type`. (2) Under D-05, `ValidationPipe` runs `plainToInstance(DtoClass, body)` before validator decorators; if `body` is a JSON array `[{...}]`, `class-transformer` returns an array of DTOs and `class-validator` emits confusing property errors instead of the promised shape error. | Check media type essence (`req.is('application/json')`) only on methods with a body (`POST`, `PUT`), and reject `Array.isArray(body) \|\| typeof body !== 'object' \|\| body === null` in a pipe/guard before `ValidationPipe`. (+0.1 h) |
| **B-7** | `02-design.md` §9.1, `03-decision-log.md` D-05 | §9.1 promises: *"Field rules, the body-`userId` rule and the date rules all report into the same `errors[]`"*. In NestJS, global `ValidationPipe` on `@Body()` has no access to `req.params.userId` (`ArgumentMetadata` has no request object) and throws `BadRequestException` before the controller/service runs. A request with both an invalid unit and a mismatched `body.userId` (or a service-side date check) will return only the `ValidationPipe` error. | Put the `date`/`timeZone` rule in a custom `class-validator` decorator on the entry DTO, and run `body.userId === params.userId` inside an interceptor or controller helper that merges with `validateSync()` results before throwing. (+0.15 h) |
| **C-1 / A-3** | `02-design.md` §6, §9.1, §9.3, §9.4; `03-decision-log.md` D-24 | §9.1 allows **3 decimal places** on input `weight` (`0.125 kg` micro-plates). §6/D-24 return the original weight unchanged (3 decimals) when `unit` matches the set's unit, but round `volume`, `estimatedOneRepMax`, and `delta.absolute` to **2 decimals**. For `100.125 kg × 1`, `highestVolumeSet` returns `{ weight: 100.125, reps: 1, volume: 100.13 }`, and `/compare` against `100 kg` returns `delta.heaviestSet.absolute: 0.13`. | Concede as a 2-decimal display rule or round top-level `weight` to 2 decimals while keeping `original.weight` at the exact 3-decimal input (`100.125`). (+0.05 h) |

**What else the revision broke:**
- In `02-design.md` §11 (B-11 history fallback): the fallback says *"take the newest `limit + 1` rows of each matching key with a `LATERAL` lookup on the same index, merge, and cut the page."* It omits applying the caller's `from`, `to`, and `cursor` predicate `(performed_on, performed_at, id) < ($6, $7, $8)` inside each `LATERAL` branch; without them, page 2 of a filtered history walk returns page 1 rows again.

---

### 3. Part B — rulings

- **D-07 (revised — catalog in PostgreSQL, seeded from JSON, read via in-memory snapshot):** **Keep with modification** · Confidence: **High**.
  - *Single strongest argument:* Keeping `ExerciseCatalog` behind an in-memory snapshot satisfies `O1` and `X2` without adding a database join to `F2.3` history queries (`E6`), but `ExerciseCatalog` must expose an immutable snapshot object per request and guard `refresh()` against overlapping runs so a single request never mixes two catalog generations (§10.2) and a slow timer tick never overwrites a fresher post-write reload.
- **D-27 (open `/v1/admin` routes behind a one-line guard, closed muscle-group list, fixed keys, catalog-only delete, ledger seed):** **Keep with modification** · Confidence: **High**.
  - *Single strongest argument:* The seed rule in §10.3 (`INSERT ... ON CONFLICT DO NOTHING` on both tables) corrupts any admin-created exercise whose key is later added to the seed file by merging the file's muscle groups into `exercise_muscle_groups`, and concurrent admin writes lack the transaction + SQLSTATE mapping (`23505`/`23503`) needed to return `400`/`404`/`409` instead of `500`.

---

### 4. The ten calls (`debate/resolution.md` §17)

| # | Ruling | Confidence | Strongest argument (and change if requested) |
|---|---|---|---|
| **1** | **Change** | High | The 30s snapshot preserves the §9.2 query plan, but calling separate port methods (`keysForMuscleGroup`, then `muscleGroupsFor`) across async SQL `await`s lets a mid-request timer refresh mix two snapshots in one response, and overlapping `refresh()` calls can overwrite a post-write reload. **Change:** Add a single-flight/generation guard to `refresh()`, wrap the snapshot load in one `REPEATABLE READ` transaction (or single SQL query), and have services grab `const snap = this.catalog.getSnapshot()` once per request. |
| **2** | **Keep** | High | Failing closed after ~10s at boot prevents a replica from serving `muscleGroups: []` for every workout on cold-start failure, while retaining the last good snapshot on refresh failure avoids taking healthy workout endpoints down for 30s-stale metadata. |
| **3** | **Keep** | High | One pure TypeScript `exerciseKey(name)` function across logging, catalog routes, and seeding avoids V8 vs PostgreSQL `lower()`/Unicode whitespace divergence (`F2.3`, `F3`). |
| **4** | **Change** | High | `O1.1` requires the one-line commented guard, but Node's `crypto.timingSafeEqual` throws `RangeError` (a 500) when the bearer token and `ADMIN_API_TOKEN` differ in byte length, and a commented-out decorator leaves unused imports or an untested HTTP binding. **Change:** SHA-256 hash both inputs before `timingSafeEqual`, and mount `AdminTokenGuard` on a dummy controller in an integration test so its DI and `ProblemDetailsFilter` 401 output are verified. |
| **5** | **Change** | High | Two defects in §10.3: (a) if an admin created exercise `K` before the file adds `K`, `INSERT ... ON CONFLICT DO NOTHING` skips `exercises` but still inserts the file's `exercise_muscle_groups` rows into the admin's exercise; (b) if all muscle groups of a new file exercise were deleted by an admin, §10.3 inserts an exercise with 0 groups, violating §10.5 (`1–10 items`). **Change:** Only insert `exercise_muscle_groups` when `INSERT INTO exercises ... ON CONFLICT DO NOTHING RETURNING exercise_key` returns a row, and skip (with a warning) any file exercise that has 0 remaining valid groups in `muscle_groups`. |
| **6** | **Change** | High | Last-write-wins without `ETag` fits 1–2 editors, but in `READ COMMITTED` two concurrent `PUT`s or a `PUT` racing a `DELETE` on `exercise_muscle_groups` throw unhandled `23505`/`23503` (500). **Change:** Specify that `PUT` runs in one transaction starting with `UPDATE exercises SET name = $2, updated_at = now() WHERE exercise_key = $1` (taking the row lock and returning 404 if 0 rows) before replacing `exercise_muscle_groups`. |
| **7** | **Change** | Medium | Having `GET /v1/exercises` and `GET /v1/muscle-groups` read PostgreSQL directly while `GET /v1/users/{id}/workout-entries` reads the 30s snapshot means a client on Replica B can read `GET /v1/muscle-groups`, see a newly added group, pass `?muscleGroup=<group>` to `GET /workout-entries` on the same Replica B, and get `400 VALIDATION_ERROR`. **Change:** Either serve `GET /v1/exercises` and `GET /v1/muscle-groups` from the snapshot too (which is already refreshed immediately on the writing replica), or on an unknown `muscleGroup` in history, trigger a rate-limited `refresh()` once before returning 400. |
| **8** | **Change** | High | In §10.5, checking `muscleGroups` for `"no repeats"` before lower-casing/trimming lets `["Chest", "chest"]` pass DTO validation and throw `23505` (500) on `exercise_muscle_groups_pkey`; and an exercise `name` that trims to non-empty control characters but normalises to `exerciseKey === ""` hits the DB `CHECK` constraint (500). **Change:** Deduplicate/validate `muscleGroups` *after* normalisation, and validate `exerciseKey(name).length >= 1` in the DTO. |
| **9** | **Change** | Medium | The five places are enough (`O1.1`), but §10.7 and D-27 understate what an anonymous caller can do via `/v1/admin`: deleting all seeded exercises cannot be undone by redeploying (because `catalog_seed_ledger` prevents re-seeding), and deleting a muscle group turns existing client `?muscleGroup=` queries from `200` into `400`. **Change:** State those two impacts in §10.7 and clarify that *"Cannot: read, change or delete a logged entry or a PR"* means *through `/v1/admin`* (since `/v1/users/{userId}` is also unauthenticated per `T4`). |
| **10** | **Keep** | High | Renaming the compose profile `seed` → `bench` cleanly separates the mandatory catalog seed (`D3`, `O1`) from the opt-in 50k benchmark dataset (`E6`). |

---

### 5. Answers to the seven questions

1. **Seed (§5, §10.3, D-07, D-27):**
   - *Two `migrate` steps at once:* Safe **only if** `SELECT pg_advisory_xact_lock(...)` runs before reading `catalog_seed_ledger` under `READ COMMITTED` (and `INSERT INTO catalog_seed_ledger` also uses `ON CONFLICT DO NOTHING`).
   - *Admin write during seed:* Admin routes do not take the advisory lock. If an admin deletes a muscle group between the seed's read of `muscle_groups` and its `INSERT INTO exercise_muscle_groups`, the seed hits FK error `23503`, aborts the transaction, and **stops the deploy**.
   - *`ON CONFLICT DO NOTHING` + ledger:* **Corrupts data.** If an admin created exercise `K` first, `INSERT INTO exercises ... ON CONFLICT DO NOTHING` is a no-op, but `INSERT INTO exercise_muscle_groups ... ON CONFLICT DO NOTHING` adds the file's muscle groups into the admin's exercise (violating the table in §10.3: *"The admin's row stays as written"*).
   - *File exercise naming a deleted group:* If all groups of that exercise were deleted by an admin, §10.3 inserts the exercise with **zero muscle groups**, violating §10.5 (`1–10 items`), and records it in the ledger so it is never fixed even if the group is re-added.
   - *Key function changing later:* Any change to `exerciseKey(name)` produces new keys not in `catalog_seed_ledger`, **bringing deleted seeded exercises back** under the new key, duplicating existing catalog exercises, and splitting historical `workout_entries` PRs across old and new keys.

2. **Snapshot (§9.2, §10.2, §10.4, D-07):**
   - *Who sees what across replicas:* Because catalog GETs hit PostgreSQL directly (§10.4) while workout routes hit the 30s snapshot (§10.2), an admin or client who creates a muscle group or exercise on Replica 1 and hits Replica 2 within 30s sees the new group in `GET /v1/muscle-groups` and the new exercise in `GET /v1/exercises/{key}`, but gets **`400 VALIDATION_ERROR` (unknown muscle group)** on `GET /workout-entries?muscleGroup=...` and `"muscleGroups": []` on `POST /workout-entries`.
   - *Can one response mix two generations?* **Yes, contradicting §10.2.** `GET /workout-entries` calls `catalog.knownMuscleGroups()` / `keysForMuscleGroup()` before `await`-ing the SQL queries and calls `catalog.muscleGroupsFor()` for each row after the `await`. A timer refresh completing during the SQL `await` swaps `this.snapshot` mid-request; also, loading 3 tables in `refresh()` without a `REPEATABLE READ` transaction can build a torn snapshot.
   - *Boot rule:* Retrying ~10s then exiting non-zero is right for both compose (`depends_on: migrate`) and real DB outages.
   - *Can two refreshes overlap?* **Yes.** A slow timer `refresh()` that started just before an admin write can resolve *after* the admin write's `await refresh()` and overwrite the replica's fresh snapshot with stale pre-write data for up to 30s.

3. **Admin writes at the same time (§5, §10.5, D-27):**
   - *Two `POST`s of the same name:* Under `READ COMMITTED`, both pass any pre-check and the second hits PostgreSQL unique violation `23505` on `exercises_pkey` (or `muscle_groups_pkey`) → **500 `INTERNAL_ERROR`** unless `23505` is mapped to `409`.
   - *`PUT` replacing groups while one of those groups is deleted:* `PUT` validates the group list, `DELETE /admin/muscle-groups/{name}` commits, and `PUT`'s `INSERT INTO exercise_muscle_groups` hits FK violation `23503` → **500 `INTERNAL_ERROR`** instead of `400 VALIDATION_ERROR`.
   - *`DELETE` during a `PUT` (or two concurrent `PUT`s):* Without a transaction and a row lock on `exercises` first, `DELETE` removes the `exercises` row after `PUT`'s existence check, causing `PUT`'s `INSERT INTO exercise_muscle_groups` to hit `23503` (**500** instead of `404`), or two `PUT`s interleave deletes/inserts on `exercise_muscle_groups` and hit `23505` (**500**) or leave a corrupted union of groups.
   - *Smallest rule that closes all three:* Run each write in one transaction; start `PUT` with `UPDATE exercises SET name = $2, updated_at = now() WHERE exercise_key = $1` (locks the parent row; 0 rows → 404) before `DELETE`/`INSERT` on `exercise_muscle_groups`; and map `23505` → `409` (`EXERCISE_EXISTS` / `MUSCLE_GROUP_EXISTS`) and `23503` → `409 MUSCLE_GROUP_IN_USE` (on group delete) or `400 VALIDATION_ERROR` (on exercise write, re-reading known groups).

4. **Open routes (§10.7, D-27, `01-requirements.md` §10–11):**
   - *Honest and complete?* Incomplete in two ways: (a) D-27 says *"Cannot: read, change or delete a logged entry or a PR"*, which is only true *of the `/v1/admin` routes* — the `/v1/users/{userId}` routes have no auth either (`T4`), so an anonymous caller can read any user's entries/PRs and POST a heavier set that changes their PRs; (b) via `/v1/admin`, an anonymous caller can delete every seeded exercise (which **a redeploy will not restore** because of `catalog_seed_ledger`), delete muscle groups (turning valid client `?muscleGroup=` queries into `400`s), or insert thousands of junk exercises into every replica's in-memory snapshot.
   - *Guard shape:* Keeping `// @UseGuards(AdminTokenGuard)` matches `O1.1`, provided `timingSafeEqual` hashes both tokens first (so length mismatches return 401, not 500) and an integration test mounts `AdminTokenGuard` on a test route so the guard + `ProblemDetailsFilter` wiring is actually tested.
   - *Five places:* Five places are enough; no more should be added.

5. **Leftovers:**
   - *Catalog file / clean-image check:*
     - `02-design.md` §15, Slice 3: `"3. Docker + compose + database module + first migration (hand-written SQL) + the clean-image check in CI."` (The clean-image check in §12 calls `GET /v1/exercises/bench%20press`, which is not built until Slice 6.)
     - `05-research-notes.md`, U-10: `"The clean-image check in CI (design §12): build the image, start it against an empty database, log one entry, read the catalog."` (§12 no longer logs an entry.)
   - *Idempotency key:*
     - `03-decision-log.md`, D-22 ("Round 1"): `"the concurrency tests — two requests and a later retry instead of twenty identical ones"` ("and a later retry" was the cut idempotency-key test; §12 now tests only two identical requests).
   - *Kilograms at four decimals, `set_count`, `user_exercises`, date-only at midnight UTC, single shared order:* None remain as active assumptions in the design, slices, tests, estimate, or cut list.

6. **Estimate (§16, D-26, `debate/resolution.md` §18):**
   - **1.75 h for Slice 6** (second SQL migration with 4 tables, `seed-catalog.ts` with file validation + advisory lock + ledger, 6 pure seed-planner unit tests, in-memory snapshot with boot retry + 30s timer + graceful shutdown + failed-refresh unit test, 3 catalog GET routes + `/units`) and **1.25 h for Slice 12** (5 admin write routes, error mappings, `AdminTokenGuard` + 4 unit tests, and 12 Testcontainers integration cases in §12) are **under-estimated by ~1.5–2.0 h total** (realistic: ~2.75 h + ~2.0 h = 4.75 h instead of 3.0 h).
   - With core at `21.75 h` and only `2.0 h` buffer inside `20–22 h`, that overrun consumes the entire buffer.
   - *What goes first if it slips:* Follow the §16 cut list in order: (1) CI benchmark job (`npm run bench` stays locally), (2) `drizzle-kit pull` drift check, (3) `fast-check` generators (keep the fixed fixtures), (4) `GET /workout-entries/{id}` + `Location`, (5) the 6 pure unit tests for the seed planner in §12 (already covered by the real PostgreSQL seed integration tests in §12!). Keep the two muscle-group write routes if possible — they are ~20 lines of code and cutting them undercuts the closed-vocabulary story in §10.5.

7. **Exact kilograms (§5, §6, §7, §9.1, §9.3, §9.4, D-08, D-24):**
   - `numeric(17,11)` is sufficient for every registered unit (`kg`, `lb`, and commented `st`) up to `weight = 10,000` with 3 decimal places (`10,000 st = 63,502.9318 kg` uses 5 of the 6 integer digits and 4 of the 11 decimal digits), and the registry unit test in §6/§12 guards any future unit.
   - **Where outputs/deltas disagree:**
     1. In §9.1, input `weight` allows **3 decimals** (`0.125 kg` micro-plates). In §6/D-24, `weight` in the set's own unit is returned **unchanged** (3 decimals), whereas `volume`, `estimatedOneRepMax`, and `delta.absolute` are rounded to **2 decimals**. For `100.125 kg × 1`, `highestVolumeSet` returns `weight: 100.125, reps: 1, volume: 100.13`, and `/compare` against `100 kg` returns `delta.heaviestSet.absolute: 0.13` (`100.125 - 100 != 0.13`).
     2. In §9.4, `delta.bestEstimatedOneRepMax.absolute` is computed from unrounded values and rounded last, so it can differ by `±0.01` from the difference of the two rounded `estimatedOneRepMax` numbers shown in `current` and `previous` (e.g., `101 kg × 1` → `104.37` vs `100 kg × 1` → `103.33`, difference `1.04`, unrounded delta `31/30` → `1.03`).

---

### 6. Detailed objections

1. **Seed corrupts admin-created exercises and inserts zero-group exercises**
   - **Target:** D-07, D-27; `02-design.md` §10.3.
   - **Problem:** (a) When an admin creates an exercise (`"Zercher Squat"`, groups `["quads", "glutes"]`) and a later deploy's `config/exercise-catalog.json` includes `"Zercher Squat"` with `["quads", "back"]`, §10.3 step 2 runs `INSERT ... ON CONFLICT DO NOTHING` for items not in `catalog_seed_ledger`. The `exercises` insert does nothing, but the `exercise_muscle_groups` insert adds `"back"` (with a duplicate `position`) to the admin's row, contradicting §10.3's table (*"The admin's row stays as written"*). (b) If a new file exercise only lists muscle groups an admin has since deleted, §10.3 inserts the exercise with **zero** rows in `exercise_muscle_groups`, violating §10.5 (`muscleGroups` required 1–10 items).
   - **Who hits this, and how often:** An admin adding a common exercise before the repo's seed file catches up, or deleting a muscle group before a deploy; also directly tested by the catalog unit/integration suite in §12.
   - **Evidence:** *From the documents* (`02-design.md` §5, §10.3, §10.5, §12); *recalled* (PostgreSQL `INSERT ... ON CONFLICT DO NOTHING` per-table semantics).
   - **Proposed change:** In `scripts/seed-catalog.ts`, insert into `exercises ... ON CONFLICT (exercise_key) DO NOTHING RETURNING exercise_key`, and insert into `exercise_muscle_groups` **only if `RETURNING` returned a row**. If a file exercise has 0 remaining existing groups in `muscle_groups`, log a warning and skip inserting the exercise (and do not write it to `catalog_seed_ledger`).
   - **Cost in hours:** +0.1 h.

2. **Unhandled race conditions in `/v1/admin` writes produce 500s or corrupt `exercise_muscle_groups`**
   - **Target:** D-27; `02-design.md` §9.6, §10.5.
   - **Problem:** §10.5 specifies `409` (`EXERCISE_EXISTS`, `MUSCLE_GROUP_EXISTS`, `MUSCLE_GROUP_IN_USE`), `404`, and `400` (unknown muscle group), but does not specify transactional locking or PostgreSQL SQLSTATE error mapping. Under `READ COMMITTED`, two concurrent `POST`s of the same name throw `23505` (500); a `PUT` racing a `DELETE` on the same exercise throws `23503` on `exercise_muscle_groups` (500 instead of 404); two concurrent `PUT`s interleave `DELETE` and `INSERT` on `exercise_muscle_groups` and throw `23505` (500); and a `PUT`/`POST` racing `DELETE /admin/muscle-groups/{name}` throws `23503` (500 instead of 400).
   - **Who hits this, and how often:** Two admins or double-submitted requests editing the catalog (`O1`), or an interviewer probing error handling (`V5`).
   - **Evidence:** *From the documents* (`02-design.md` §5, §9.6, §10.5); *recalled* (PostgreSQL `READ COMMITTED` locking and SQLSTATEs `23503`/`23505`).
   - **Proposed change:** Run each admin write in one transaction; begin `PUT /admin/exercises/{key}` with `UPDATE exercises SET name = $2, updated_at = now() WHERE exercise_key = $1` (0 rows → 404; acquires the row lock before `DELETE`/`INSERT` on `exercise_muscle_groups`); catch `23505` → `409` and `23503` → `409 MUSCLE_GROUP_IN_USE` (on group delete) or `400 VALIDATION_ERROR` (on exercise write).
   - **Cost in hours:** +0.2 h.

3. **Snapshot races and mid-request swaps break `ExerciseCatalog` consistency**
   - **Target:** D-07; `02-design.md` §9.2, §10.1, §10.2, §10.4.
   - **Problem:** Three flaws in §10.2: (a) `refresh()` has no single-flight guard, so a slow timer refresh that started before an admin write can resolve after the write's `refresh()` and overwrite the replica's snapshot with pre-write data; (b) `GET /workout-entries` calls `catalog.knownMuscleGroups()`/`keysForMuscleGroup()` before awaiting SQL and `catalog.muscleGroupsFor()` after awaiting SQL, so a snapshot swap during the SQL `await` mixes two catalog generations in one response (violating §10.2); (c) `GET /v1/muscle-groups` reads the DB while `GET /workout-entries?muscleGroup=` reads the 30s snapshot, so a client on a second replica gets `400 VALIDATION_ERROR` for a muscle group that `GET /v1/muscle-groups` on that replica just returned.
   - **Who hits this, and how often:** Any client or admin reading workouts within 30s of a catalog edit, or during the 30s refresh tick.
   - **Evidence:** *From the documents* (`02-design.md` §9.2, §10.1, §10.2, §10.4); *judgment*.
   - **Proposed change:** Load the 3 catalog tables in one query (or `REPEATABLE READ` tx); serialize/coalesce concurrent `refresh()` calls; return an immutable `CatalogSnapshot` object once per request (`const snap = this.catalog.getSnapshot()`); and on an unknown `muscleGroup` in history, trigger at most one debounced `refresh()` before returning 400 (or serve `GET /v1/muscle-groups` and `GET /v1/exercises` from the snapshot).
   - **Cost in hours:** +0.2 h.

4. **NestJS `ValidationPipe` cannot merge `body.userId !== param.userId` with DTO errors or handle array bodies cleanly**
   - **Target:** D-05, D-14, D-17, D-18, D-19; `02-design.md` §9.1, §9.6.
   - **Problem:** (a) §9.1 promises that field rules, the `body.userId` rule, and the `date`/`timeZone` rules all report into one `errors[]` in a single round. Global `ValidationPipe` has no access to `req.params.userId` and short-circuits before the controller/service runs. (b) Sending a JSON array `[{...}]` to an object endpoint passes an `Array` to `plainToInstance(Dto, body)`, producing misleading `class-validator` property errors instead of the promised shape error. (c) Checking `Content-Type` without media-type parsing rejects `application/json; charset=utf-8` or bodyless `GET`/`DELETE` requests as 415.
   - **Who hits this, and how often:** A grader testing the API with `curl`, Supertest, or Swagger UI (`G9`, `V2`, `V5`), and the two-fault bulk integration test in §9.1/§12.
   - **Evidence:** *From the documents* (`02-design.md` §9.1, §9.6, §12; `03-decision-log.md` D-05); *recalled* (NestJS `ValidationPipe`, `class-transformer`, Express `req.is`).
   - **Proposed change:** Validate `date` + sibling `timeZone` via a custom `class-validator` decorator on the DTO; check `req.is('application/json')` only on `POST`/`PUT` and check `!Array.isArray(body)` before `plainToInstance`; and pass `req.params.userId` into validation (via a request-aware pipe/interceptor) so `userId` mismatches join the same `errors[]`.
   - **Cost in hours:** +0.2 h.

5. **`instant.toZonedDateTimeISO("Z")` throws `RangeError` and date-only strings bypass `Temporal.PlainDate` validation**
   - **Target:** D-09; `02-design.md` §8.
   - **Problem:** In §8's 3-shape parser specification, shape 2 says `instant.toZonedDateTimeISO(zone).toPlainDate()` where `zone` is `"timeZone when sent, otherwise the offset the client wrote"`. When a client sends `<date>T12:30:00Z` with no `timeZone`, passing `"Z"` to `toZonedDateTimeISO("Z")` throws `RangeError` in `Temporal`. And shape 1 says `"A date alone → the date text is performed_on"` without calling `Temporal.PlainDate.from(text)`, allowing invalid dates like `<year>-02-29` (non-leap) or `<year>-02-30` to pass a regex and fail with a database `22008` (500) on insert.
   - **Who hits this, and how often:** Every JavaScript client sending `new Date().toISOString()` (`Z`) without `timeZone`, and any test or caller sending a calendar-invalid date (`E2`).
   - **Evidence:** *From the documents* (`02-design.md` §8, `03-decision-log.md` D-09); *recalled* (ECMAScript `Temporal.Instant.prototype.toZonedDateTimeISO` and `Temporal.PlainDate.from`).
   - **Proposed change:** For shape 1, parse with `Temporal.PlainDate.from(text)` (rejecting invalid calendar dates in validation). For shape 2 without `timeZone`, extract the `YYYY-MM-DD` date prefix before `T` (which `Temporal.Instant.from(text)` has already validated as a legal calendar date).
   - **Cost in hours:** +0.05 h.

6. **Catalog DTO normalisation order allows duplicate muscle groups and empty exercise keys to 500**
   - **Target:** D-27; `02-design.md` §5, §10.5.
   - **Problem:** In §10.5, `muscleGroups` requires `"1–10 items, no repeats; each is trimmed and lower-cased"`. If `@ArrayUnique()` runs before `@Transform()` trims and lower-cases each element (or if elements are normalised in the service), `["Chest", " chest "]` passes validation and throws `23505` (500) on `exercise_muscle_groups_pkey`. Similarly, an exercise `name` of non-printable/format characters that has `trim().length >= 1` before NFKC but normalises to `exerciseKey(name) === ""` fails the DB `CHECK (char_length(exercise_key) BETWEEN 1 AND 100)` with `23514` (500).
   - **Who hits this, and how often:** An admin submitting mixed-case duplicate tags (`["Chest", "chest"]`) on `POST`/`PUT /v1/admin/exercises`.
   - **Evidence:** *From the documents* (`02-design.md` §5, §10.5); *recalled* (`class-transformer` / `class-validator` execution order and PostgreSQL constraints).
   - **Proposed change:** Normalise `muscleGroups` elements in `@Transform()` before `@ArrayUnique()` (or check uniqueness post-normalisation), and validate `exerciseKey(name).length BETWEEN 1 AND 100` in the DTO validator.
   - **Cost in hours:** +0.1 h.

7. **`AdminTokenGuard` `timingSafeEqual` throws a 500 on wrong-length tokens**
   - **Target:** D-27; `02-design.md` §10.7.
   - **Problem:** §10.7 specifies constant-time comparison of `Authorization: Bearer <token>` against `ADMIN_API_TOKEN`. Node's `crypto.timingSafeEqual(a, b)` throws `RangeError` if the two buffers differ in byte length, turning an invalid short/long token into a `500 INTERNAL_ERROR` instead of `401 UNAUTHORIZED`.
   - **Who hits this, and how often:** Any caller sending a wrong-length token once the guard is enabled, or a reviewer reading `src/common/admin-token.guard.ts`.
   - **Evidence:** *From the documents* (`02-design.md` §10.7); *recalled* (Node.js `crypto.timingSafeEqual` specification).
   - **Proposed change:** Hash both the provided token and `ADMIN_API_TOKEN` with `crypto.createHash('sha256').update(val).digest()` before calling `crypto.timingSafeEqual`, and add `"wrong-length token"` to the guard's unit test in §12.
   - **Cost in hours:** +0.05 h.

8. **History B-11 `LATERAL` fallback omits `cursor`, `from`, and `to` predicates**
   - **Target:** D-16; `02-design.md` §11.
   - **Problem:** §11 describes the history fallback as: *"take the newest `limit + 1` rows of each matching key with a `LATERAL` lookup on the same index, merge, and cut the page."* Without pushing `performed_on >= $from`, `performed_on <= least($to, cursor.on)`, and `(performed_on, performed_at, id) < ($cursor)` into each `LATERAL` subquery, any paginated or date-filtered query returns wrong rows.
   - **Who hits this, and how often:** Any client paging or date-filtering history if the benchmark triggers the B-11 fallback (`F2.2`, `F2.5`, `E6`).
   - **Evidence:** *From the documents* (`02-design.md` §9.2, §11; `03-decision-log.md` D-16); *recalled* (SQL keyset pagination over `LATERAL` index scans).
   - **Proposed change:** State in §11 and D-16 that each per-key `LATERAL` subquery applies the same `from`, `to`, and `cursor` predicates as §9.2 Step 1 before `ORDER BY performed_on DESC, performed_at DESC, id DESC LIMIT $limit + 1`.
   - **Cost in hours:** 0 h now (+0.05 h if fallback is triggered).

---

### 7. Contradictions between documents

1. **Clean-image CI check actions (`02-design.md` §12 vs `05-research-notes.md` U-10):**
   - `02-design.md` §12: *"build the image; start it with no bind mount and without the `bench` profile; wait for readiness; `GET /v1/exercises/bench%20press` returns the seeded exercise — which proves the migrations, the seed step and the JSON file are all inside the image"*
   - `05-research-notes.md` U-10: *"The clean-image check in CI (design §12): build the image, start it against an empty database, log one entry, read the catalog."*

2. **Clean-image CI check slice placement (`02-design.md` §15 Slice 3 vs `02-design.md` §12 & §15 Slice 6):**
   - `02-design.md` §15 Slice 3: *"3. Docker + compose + database module + first migration (hand-written SQL) + the clean-image check in CI."*
   - `02-design.md` §15 Slice 6: *"6. Catalog, read side: second migration (the four tables), the seed step inside `migrate`, the database adapter with its snapshot and refresh, `GET /exercises`, `GET /exercises/{exerciseKey}`..."* (Slice 3 cannot run a check that calls `GET /v1/exercises/bench%20press` and verifies the catalog seed before Slice 6 builds them.)

3. **How `performed_on` is derived for an offset/`Z` timestamp without `timeZone` (`02-design.md` §8 vs `03-decision-log.md` D-09):**
   - `02-design.md` §8: *"2. A date-time with an offset or `Z` → `Temporal.Instant.from(text)` gives the instant; the local date is `instant.toZonedDateTimeISO(zone).toPlainDate()`, where `zone` is `timeZone` when sent, otherwise the offset the client wrote."*
   - `03-decision-log.md` D-09: *"`timeZone` is optional, an IANA name (`Asia/Ho_Chi_Minh`). When present it decides the local date; otherwise the local date is the date text of the input (the wall date of the offset sent)."*

4. **Admin-created exercise vs later seed file (`02-design.md` §10.3 table vs `02-design.md` §10.3 step 2):**
   - `02-design.md` §10.3 table: *"An admin created an exercise that a later file also adds | The admin's row stays as written; the ledger records the item"*
   - `02-design.md` §10.3 step 2: *"For each group and exercise in the file whose key is not in `catalog_seed_ledger`: insert it with `ON CONFLICT DO NOTHING`, and record it in the ledger."* (Inserting into `exercise_muscle_groups` with `ON CONFLICT DO NOTHING` modifies the admin's exercise by adding the seed file's muscle groups.)

5. **Seeded exercise with deleted muscle group vs required muscle-group count (`02-design.md` §10.3 vs `02-design.md` §10.5):**
   - `02-design.md` §10.3: *"One edge: a new exercise in the file that names a group an admin has since deleted is inserted without that group, and the step logs a warning."*
   - `02-design.md` §10.5: *"`muscleGroups` | required array, 1–10 items, no repeats"* (An exercise whose only muscle group was deleted by an admin is inserted with 0 muscle groups.)

6. **Whole-snapshot guarantee vs port method granularity (`02-design.md` §10.2 vs `02-design.md` §10.1 & §9.2):**
   - `02-design.md` §10.2: *"The swap is whole. A new snapshot is built completely and then replaces the old one; a request sees one or the other, never a mixture."*
   - `02-design.md` §10.1: *"Business logic still sees only the `ExerciseCatalog` port (`muscleGroupsFor(key)`, `keysForMuscleGroup(group)`, `knownMuscleGroups()`, `list()`)"* (Calling `keysForMuscleGroup` before async SQL in §9.2 and `muscleGroupsFor` after async SQL reads two different snapshots if a refresh completes in between.)

7. **What an anonymous caller cannot do (`03-decision-log.md` D-27 vs `01-requirements.md` T4 & `02-design.md` §9):**
   - `03-decision-log.md` D-27: *"What an anonymous caller can and cannot do. Can: change which muscle groups entries show and what the muscle-group filter matches — for every user. Cannot: read, change or delete a logged entry or a PR."*
   - `01-requirements.md` T4: *"No authentication required — pass `userId` as a parameter"* (Through `/v1/users/{userId}/...`, an anonymous caller *can* read any user's logged entries and PRs and log new entries that change their PRs.)

---

### 8. Technical errors

1. **`Temporal.Instant.prototype.toZonedDateTimeISO("Z")` throws `RangeError` (`02-design.md` §8):**
   In Node's `Temporal`, `"Z"` is valid in an ISO timestamp string passed to `Temporal.Instant.from()`, but it is **not** a valid time zone identifier for `instant.toZonedDateTimeISO(zone)` (which requires `"UTC"`, an IANA name, or a `±HH:MM` offset). Passing `"Z"` throws `RangeError: Invalid time zone specified: Z`.
2. **NestJS `ValidationPipe` cannot access `req.params.userId` or combine service-level checks into one `errors[]` (`02-design.md` §9.1, `03-decision-log.md` D-05):**
   `PipeTransform.transform(value, metadata)` receives only the bound parameter and `ArgumentMetadata` (`type`, `metatype`, `data`), not the Express `Request` object. When `ValidationPipe` fails on `@Body()`, it throws `BadRequestException` before any controller/service check on `req.params.userId` can run.
3. **`class-transformer` `plainToInstance` on a JSON array (`02-design.md` §9.1, `03-decision-log.md` D-05):**
   When `express.json()` parses a top-level JSON array `[{...}]` and `ValidationPipe` calls `plainToInstance(DtoClass, body)`, `class-transformer` returns an `Array` of `DtoClass` instances; `class-validator` then validates the `Array` object against `DtoClass` property decorators rather than producing a top-level shape error unless `Array.isArray(body)` is checked prior to `plainToInstance`.
4. **HTTP `Content-Type` header matching (`02-design.md` §9.6):**
   §9.6 states that *"a body sent with any content type other than `application/json`"* returns `415`. Under RFC 9110, `Content-Type` headers include media-type parameters such as `application/json; charset=utf-8` and are case-insensitive; literal string inequality rejects compliant JSON requests.
5. **Node `crypto.timingSafeEqual` throws `RangeError` on unequal buffer lengths (`02-design.md` §10.7):**
   Calling `crypto.timingSafeEqual(Buffer.from(input), Buffer.from(secret))` throws `RangeError [ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH]` whenever `input` and `secret` have different byte lengths, causing `AdminTokenGuard` to throw a `500` instead of returning `401 UNAUTHORIZED` unless both values are hashed to a fixed length (e.g., SHA-256) first.

---

### 9. Cut / add

- **Cut (saves ~0.75 h to restore buffer for Slices 6 and 12):**
  1. **Cut the 6 pure unit tests for the "seed planner" in §12 (~0.4 h):** The integration suite in §12 already tests the real `scripts/seed-catalog.ts` against real PostgreSQL for idempotency, added items, admin edits, and admin deletions. Extracting a separate pure "seed planner" layer that takes `(file items × ledger × existing keys)` just to unit-test it in memory duplicates SQL logic (`INSERT ... ON CONFLICT DO NOTHING RETURNING`) and creates the exact TOCTOU gap noted in Question 1.
  2. **Cut the CI benchmark job and the `drizzle-kit pull` schema drift check up front (~0.35 h):** Keep `npm run bench` locally; the real-PostgreSQL integration suite already verifies `schema.ts` against the hand-written SQL migrations.
- **Add (costs ~0.5 h total, prevents 500s and broken invariants):**
  1. **Single-flight `refresh()` + request-scoped `catalog.getSnapshot()` (+0.15 h):** Prevents overlapping refreshes from reverting post-write snapshots and prevents mid-request snapshot swaps in `GET /workout-entries`.
  2. **Transactional row lock on `PUT /admin/exercises/{key}` + SQLSTATE `23505`/`23503` mapping in the catalog repository (+0.2 h):** Prevents 500s on concurrent catalog writes.
  3. **Fix `seed-catalog.ts` to only insert `exercise_muscle_groups` when `exercises` `RETURNING` yields a row, and skip exercises with 0 valid groups (+0.1 h).**
  4. **SHA-256 hash both tokens before `timingSafeEqual` in `AdminTokenGuard` (+0.05 h).**

---

### 10. Interview questions

1. *"On a 2-replica deployment, an admin creates a new muscle group and exercise on Replica A, then a user immediately queries `GET /v1/muscle-groups` on Replica B (which reads PostgreSQL directly and shows the new group) and filters `GET /v1/users/u1/workout-entries?muscleGroup=...` on Replica B (which reads the 30-second snapshot). Why does Replica B tell the user that a muscle group it just returned is invalid, and how would you fix that without querying PostgreSQL on every workout request?"*
2. *"Walk me through what happens in `scripts/seed-catalog.ts` when an admin creates `'Zercher Squat'` via `POST /v1/admin/exercises` with `['quads']`, and the next release adds `'Zercher Squat'` to `config/exercise-catalog.json` with `['quads', 'back', 'glutes']`. Why does `INSERT ... ON CONFLICT DO NOTHING` on `exercises` and `exercise_muscle_groups` mutate the admin's exercise?"*
3. *"Because `workout_entries` has no foreign key to `exercises` and `/v1/admin` is unauthenticated in v1, what happens if someone calls `DELETE /v1/admin/exercises/{key}` for every seeded exercise and then you redeploy the containers? Why doesn't `migrate` restore the catalog, and how would an operator recover?"*
4. *"You allow 3 decimal places on input weights for `0.125 kg` micro-plates and return the original weight unchanged when `unit=kg`, but you round `volume` and `delta.absolute` to 2 decimal places. If I log `100.125 kg × 1`, why does `highestVolumeSet` say `weight: 100.125, reps: 1, volume: 100.13`?"*
5. *"In `GET /v1/users/{userId}/workout-entries`, you validate `muscleGroup` and resolve its exercise keys from the catalog snapshot before awaiting two SQL queries, then resolve each entry's `muscleGroups` array after the SQL returns. If the 30-second refresh timer fires while PostgreSQL is executing the query, can a response under `?muscleGroup=chest` return an entry whose `muscleGroups` array does not contain `'chest'`?"*
