# Plan review — Claude Fable 5.2 (Claude CLI, high effort, no tools)

The reply as received, unedited. Prompt: `plan-review-prompt.md`.

---

Model: Claude Fable 5.2

## 1. Verdict

**Ready after the fixes listed.** Order and coverage are mostly sound. Three things will stop an agent cold: the `dist/` layout (#1), the guard test with no mechanism (#4), and migrate/seed tests that cannot fail or cannot be written (#5). Two will ship a visible defect to a grader: `/health/ready` answering 500 (#2) and the date-only `from` advice (#8). Tasks 10 and 17 are too big for one review.

## 2. Findings

| # | Task, step | Problem | Who meets it, how often | Evidence | Fix |
|---|---|---|---|---|---|
| 1 | T1 S1–2; T3 S4; T12 | Root-level `jest.config.ts`, `drizzle.config.ts` and `scripts/*.ts` are compiled by `nest build`, because the template's `tsconfig.build.json` excludes only `test`, `dist`, specs. Output becomes `dist/src/main.js`, so `node dist/main.js`, `dist/cli/migrate.js` and the migrations asset path all break. | Task 4 agent, near-certain; found only at the clean-image check, three tasks late. | Recalled (tsc root inference; TS 6 default changes unverified). | T1 S1: `tsconfig.build.json` gets `"include": ["src/**/*"]` and `rootDir: "src"`. T1 S6 adds `npm run build && test -f dist/main.js`. |
| 2 | T2 S5 filter table | "Anything else → 500" swallows every Nest `HttpException` except `NotFoundException`. Terminus throws `ServiceUnavailableException`, so `/health/ready` answers 500 `INTERNAL_ERROR`, not the 503 of §9.6. No task tests the 503 or the pg-failure row. | Grader who stops postgres and curls readiness; orchestrator probes. Certain when the DB is down. | From the documents (T2 table; §9.6 "also `/health/ready`"). | Add row "other `HttpException` → its status, code by status". Tests: readiness with a rejecting pool → 503 problem+json; filter unit test for `ECONNREFUSED`, `08006`, `57P01`. |
| 3 | T10 S3.2–3.3 | The split between class-validator and the domain checks is not stated. `date: null`, a 101-char name or a numeric `unit` gets two errors on one path, and "N fields are invalid" miscounts. | Every Task 10 agent and reviewer; a grader sees doubled messages on E2 cases. | Judgment. | State: the DTO owns presence, type, numeric ranges, array sizes, unknown properties; domain checks run only on fields with no DTO error; one error per path. The three-fault test asserts `errors` with `toEqual`. |
| 4 | T17 S1, last test | "The guard on the real `CatalogAdminController`" has no mechanism. `TestOverrides` cannot add a guard; a guarded subclass double-registers routes; applying the decorator in the shared file 401s the other ten tests. `ADMIN_API_TOKEN` is read when `ConfigModule` is imported. | Task 17 agent, certain. | From the documents (T1 `TestOverrides`; §10.7). | Own file `test/admin-guard.int-spec.ts`: set `process.env.ADMIN_API_TOKEN` before importing the app, call `AdminOnly()(CatalogAdminController)`, then `createTestApp()`. |
| 5 | T3 S1; T8 S1 | Global setup already migrated the shared database, so "runs twice" and "two migrate steps at once" pass with the lock deleted. "A bad seed file fails migrate" cannot be written: `runMigrateStep(env)` takes no seed path, and "nothing written" is unprovable on a seeded DB. | Per-task reviewer (a test that cannot fail); Task 8 agent blocked. | From the documents (T3 and T8 Interfaces). | `runMigrateStep(env, opts?: { seedPath?: string })`. Add `createEmptyDatabase(): Promise<string>` to `test/support/database.ts`; these four tests run on a fresh database. |
| 6 | T16 (order); T13–14 Interfaces | The runner arrives after history, PRs and compare, so a history budget miss surfaces three tasks late. `bench.ts` must also re-type the SQL it explains, so `EXPLAIN` can drift from the shipped query. | Owner (rework); a grader reading plans that are not the running query. | From the documents (§11, quoted in section 4). | T13 produces `buildHistoryIdsQuery(q)` and adds the runner with history cases; T14 produces `buildRecordsQuery(…)` and adds PR cases; T15 adds compare. T16 becomes report and gate; each fallback is its own reviewed task. |
| 7 | T13 S3; T14 S3 | Two Drizzle traps. A JS array inside `sql` expands to a parameter list, so `= ANY(${keys})` fails. Rows from `db.execute(sql…)` return `timestamptz` as text in the session zone, because Drizzle overrides pg's parsers, so `performedAt: Date` and the cursor need explicit conversion. | Task 13 and 14 agents: the first near-certain, the second likely. Tests catch both, at the cost of time. | Recalled, medium confidence. | T3 produces `pgArray(values, 'text' \| 'uuid')` (`sql.param` plus cast) and `toDate(v)`, each with one assertion in `migrate.int-spec.ts`. |
| 8 | T6 S1, S3 | `parseReadBound(raw, path)` has one date-alone message, "send the start of the next day". On `from=2025-02-01` that advice silently drops a day. Separately, "`PlainDate.from` succeeding with no `T`" classifies `2025-02-10 06:30:00` (Python `str(datetime)`) as a date alone. | Grader's first ranged curl, `?from=2025-02-01&to=2025-02-28`: likely. | From the documents (T6 S1 comment; §8's example is for `to`). | `parseReadBound(raw, path, bound: 'from' \| 'to')`; the `from` message says "send the start of that day". Detect a date alone by shape, not by `T`. Add both as test rows. |
| 9 | T8 Files; T3 S4 | The seed file is outside `sourceRoot`, where a nest-cli asset is unreliable. Task 8 does not touch the Dockerfile and does not run the clean-image check, so Task 9 inherits the failure. T3 S4's "no development dependency installed" check cannot run before Docker exists. | CI at Task 8's commit; Task 9 agent. Likely. | Recalled (assets); from the documents (§14 allows a `COPY`). | T8: resolve the path from the repo root, add `COPY seed ./seed`, run `clean-image-check.sh` in S6. Move T3's confirmation to T4. |
| 10 | T1 S3 and every int spec | The printed toolchain test never closes its app. From Task 9 each open app holds a pool and a 300 s catalog timer, so Jest hangs. No step says who calls `resetDatabase()`. | CI and every agent from Task 9. Likely. | From the documents (T1 S3 code; T9 timer). | T1 Interfaces: `createTestApp` tracks apps and `closeTestApps()` runs in `afterAll`; every int spec calls `resetDatabase()` in `beforeAll`. |
| 11 | T10 S4; T5 S1 | §9.1 caps have no test: 4 decimals, 10 000.001, reps 1 001 or 5.5, 51 sets. `decimalPlaces` has none either; `String(1e-7)` is `"1e-7"`, so a naive count gives 0 and `numeric(9,3)` rounds it silently (anti-goal). | Reviewer; a client with float noise. Rare, but silent. | From the documents (§9.1, §6); recalled (`String`). | Add those rows to the Task 10 `it.each`. T5: `decimalPlaces(100.125) = 3`, `(1e-7) = 7`. |
| 12 | T1, T2 S5, T10 S3 | "`configureApp` holds every global setting (… body parsing …)" cannot hold: Nest's built-in parsers (100 kb JSON, urlencoded) are a creation option. `express.json` is then registered in Task 2 and again in Task 10; `BODY_LIMIT` is defined in Task 5 but used in Task 2. | Task 2 and Task 10 agents; `main.ts` and tests can diverge. Likely. | Recalled (Nest `bodyParser`); from the documents. | T1 produces `createApp(moduleRef?)` with `{ bodyParser: false, bufferLogs: true }` for both callers. Move `limits.ts` to Task 2. T10 says "replace the parser". |
| 13 | T13–14 Interfaces | Task 14 must load at most 3 entries with sets inside the compare transaction, but no method does it: `findEntry` has no `Executor`, and Task 13's loader is private. `test/support/fixtures.ts` has no Produces. `toRecordsResponse` claims "the §9.3 shape" but cannot produce `exercise` or `range`. | Task 14 and 15 agents; the hydration gets duplicated. Certain. | From the documents. | T13 produces `findEntriesByIds(ids, db?: Executor): Promise<StoredEntry[]>`. T10 lists the fixtures (`postEntry`, `uniqueUserId`). `toRecordsResponse` returns `records` only. |
| 14 | T12 S1 | Share assertions at scale 0.01 (25–40 of 500, sessions of 5–12) are flaky if generation is random. The command behind `bench:data` is unspecified. 1.0 h is underpriced. | CI, intermittently; Task 12 agent. | Judgment (binomial spread). | Generate deterministically (index arithmetic or `setseed`), state it, and name the runner command. |
| 15 | T18 S1 | Swagger is mounted only in `main.ts` at the last task. Handlers take `unknown` and raw queries, so query parameters and the input/output `unit` schemas (§6) appear only if hand-declared, and nothing checks them. Helmet's default CSP may blank the UI over plain HTTP. | Grader opening `/docs`: likely. Task 18 overruns. | Judgment; recalled, low confidence (CSP). | Mount in `configureApp` in Task 2, with a `GET /docs-json` smoke test. Each route task asserts its path and parameters. T18 S5 adds "open `/docs` in a browser, run one call". |

## 3. Answers

**1. Coverage gaps.**
- §17: "`GET …/workout-entries/{id}` accepts `unit` like the list" has no step or test in Task 10.
- §9.6: "503 `SERVICE_UNAVAILABLE` — database unreachable (also `/health/ready`)" is untested (#2).
- §9.1: the numeric caps (#11).
- §6: "`unit` on input is a case-insensitive string … on output it is an enum" has no step (#15).
- §10.4: "ordered by key" and `createdAt, updatedAt` are not asserted.
- §8: the compact `20250210T053000Z` and `:60` forms are missing from the Task 6 table.
- §12: "PRs correct" after the write burst never lands in Task 14.
- §13: "logged as host and database name only" has no assertion.

**2. Interface and ordering defects.** #5, #6, #12, #13. Also:
- The Task 7 Epley table expects strings (`'103.33'`), but `display()` returns `number`.
- The Task 5 X1 test passes `'st'` where `UnitCode` is required, so it needs a cast or `toKg(…, code: string)`.
- Task 10 modifies `schema.ts` with no reason given.

**3. Steps that will not work as written.** #1, #4, #5, #7, #9, plus the items in section 5.

**4. Tests.**
- Cannot fail: migrate "twice" and "at once" (#5).
- Cannot be written: the bad-seed test (#5) and the guard test (#4).
- Listed with no content: `records-response.spec.ts` in Task 14. Add `6 lb × 50` → volume 300 in lb, and `100.125 kg × 1` → weight 100.125, volume 100.13.
- Missing: `repairOffsetPlus('2025-02-01 07:00')` stays unchanged, since there is no time before the space; compare with both periods empty.
- The Task 10 `userId` cases `'u 1'` and `'ü'` must be sent percent-encoded, or the HTTP client decides the outcome.

**5. Sizing.**
- **Task 10:** split into 10a (`requireJson`, `UserIdPipe`, `readEntryInputs`, unit tests) and 10b (repository, response, routes, integration).
- **Task 17:** split into 17a (exercise routes, guard, tests seeding groups by SQL) and 17b (the two group routes). The second cut-list item is then one revertible commit, not threaded through never-cut code.
- **Most likely to overrun:** Tasks 1–4 against 2.95 h, Task 12 against 1.0 h, and Task 16 if a fallback fires.
- **Reordering:** only #6.

**6. Review Focus.**
- **1, numbers as strings:** keep.
- **2, empty query values:** keep, and fold 3 into it; agents write `limit` checks unprompted.
- **4, path `userId`:** keep, but use what people actually paste: `coach@everfit.io`, `user:1`.
- **5, missing PR/compare parameter:** keep.

Add:
- **A. A misnamed query parameter.** `?exerciseName=bench` (the body's field name), `?startDate=`, `?page=2` returns an unfiltered 200 today. The plan must fix one answer; I recommend a 400 naming the parameter and listing the accepted ones (Tasks 13–15). The design is silent, so this needs the owner's nod.
- **B. A body that is empty, `null` or the wrong JSON type.** `curl -X POST -H 'Content-Type: application/json'` with no `-d`, or `"sets": {}`, `"entries": [null]` → a 400 showing the shape, never a 500 (Tasks 10–11).
- **C. A repeated query parameter.** `unit=kg&unit=lb` arrives as an array → a 400 naming it, not a `trim is not a function` 500 (Task 13).

**7. What agents will get wrong anyway.**
- Using `new Date()` instead of `CLOCK` in the service.
- Building the cursor from the look-ahead row.
- Duplicated errors per path (#3).
- Copying SQL into `bench.ts` (#6).
- Leaving apps open (#10).
- Skipping the AI-log line when a correction happens mid-task.
- Committing implementation and tests as one commit, which hides the test-first order from the history D1 grades.

**Concessions.**
- One container, `--runInBand` and the zone set with `-c timezone=` are sound.
- `Instant.round` with `floor` and `ceil` is right.
- 100 entries × 50 sets × 6 columns is 30 000 parameters, under the 65 535 limit.
- `NO ACTION` → `23503` and the PostgreSQL 18 volume path match the design.
- The session lock around Drizzle's migrator is correct.

## 4. Contradictions between the plan and the design

1. **Benchmark timing.** Design §11: "The benchmark data is written **before** the history and PR slices (§15), so both are measured as they are built." Plan, Task 16: "Consumes: the data of Task 12, and the routes of Tasks 13–15."
2. **The PR message.** Design §9.3: "`GET /v1/users/{userId}/workout-entries?exercise=bench` lists the names that contain it." Plan, Task 14 S3: "fixed text with the key and the request's `userId` filled in … `?exercise=<key, percent-encoded>`", while its tests say "the fixed §9.3 message" and "the exact §9.4 message". The plan's reading is the better one; put the literal expected string in both tests.
3. **`unit` on one entry.** Design §17: "`GET …/workout-entries/{id}` accepts `unit` like the list." Plan, Task 10: "`GET /v1/users/:userId/workout-entries/:id` → 200, or 404", with no `unit`.
4. **Date-alone read bound.** Design §8: "to include all of 2025-02-28, send the start of the next day" (a `to` example). Plan, Task 6: one message for every bound (#8).
5. **Seed planner inputs.** Design §12: "file items × ledger × existing keys → inserts … an exercise an admin created first (no links written)". Plan, Task 8: `planSeed(file, ledger, existingGroups)`, with that case moved into SQL. This is acceptable; say so in the task so the reviewer does not flag it.

## 5. Technical errors

- **Scripts, Task 1.** `npm test -- src/units` expands to `jest --selectProjects unit src/units`. `--selectProjects` is a greedy array option, so the path is taken as a project name and the whole unit suite runs. `test:int` escapes only because `--runInBand` follows. Put a flag after it in `test` too. *Recalled, medium confidence.*
- **Task 1 S4.** "Expected: FAIL, because there is no health route" is not what happens: the file fails to compile because `createTestApp` does not exist yet, taking the `uuid` and zone tests with it. No step creates `test/support/app.ts`; add one before S3.
- **Task 1 S5, the `uuid` fallback.** If the template uses `module: nodenext`, TypeScript emits ESM for files in a `"type": "module"` package. `allowJs` plus `transformIgnorePatterns` can then leave `export` in place; the Jest tsconfig also needs `module: commonjs`. The template's `jest` key in `package.json` must be deleted too, or Jest refuses two configurations. *Recalled, medium confidence.*
- **Task 1 S1.** `nest new` runs `git init`. Add `--skip-git`, or the temporary-folder route brings a nested repository.
- **Task 3 Interfaces.** "Its migrations folder resolves next to the compiled file" is true only after #1.
- **Task 13 S3.** "`id = ANY($ids)`" is not expressible by interpolating an array into Drizzle's `sql` (#7).
- **Task 2 S5.** The filter table is false for terminus and for every built-in 4xx (#2).
