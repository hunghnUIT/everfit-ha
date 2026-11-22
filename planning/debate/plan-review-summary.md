# Plan review — summary: the implementation plan

**Status: applied.** The owner chose (a) for section 4: an unknown query
parameter is a 400. How the list was applied is in `resolution.md` §23; this
file is the record as written before the decision.

Two models reviewed `07-implementation-plan.md`. Each received the prompt in
`plan-review-prompt.md` together with the whole plan, design and
requirements. Neither had tools, so every outside fact they gave is a
recollection unless the author checked it (section 5).

| Reviewer | How it ran | File |
|---|---|---|
| Claude Fable 5.2 | Claude CLI, high effort | `plan-review-fable.md` |
| Grok 4.7 | GitHub Copilot CLI, high effort | `plan-review-grok.md` |

## 1. Verdict

- **Fable:** ready after its fixes.
- **Grok:** not ready until the same holes are written into the tasks.

The two found largely the same defects, and neither reopened a design
decision.

**Both keep:** the slice order, one commit per task, the never-cut fixtures,
one Testcontainers database run in band with its zone set by
`-c timezone=`, `Instant.round` with `floor` and `ceil`, and
`migrate` staying out of `api`.

**Combined verdict:** ready to carry out once the list in section 7 is
applied. Most items are a sentence or a test in an existing task. Two
tasks split (10 and 17), and the benchmark runner moves earlier.

## 2. Findings by topic

Who raised each point is in brackets. "Verified" means the author ran it
(section 5).

### 2.1 Test infrastructure (both)

- **Nothing ever resets the database.** `resetDatabase()` is defined but no
  step calls it, so later integration files would see earlier rows. Every
  task from Task 10 on would meet this.
- **No test app is ever closed.** From Task 9 each app holds a pool and a
  five-minute catalog timer, so Jest hangs [Fable].
- **Two tests cannot fail.** Global setup has already migrated the shared
  database, so "migrate twice" and "two migrate steps at once" pass even
  with the lock deleted.
- **One test cannot be written.** The bad-seed test has no way to pass
  another seed file, and "nothing written" cannot be shown on a database
  that is already seeded [Fable].
- **Running one file can run the whole suite.** In `npm test -- src/units`,
  the path is taken as a project name by the greedy `--selectProjects`
  option [Fable, recalled].
- **Task 1's test fails for the wrong reason.** No step creates
  `createTestApp` before the test that imports it, so the file fails to
  compile rather than failing on the missing route [Fable].

**Fix:**
- The integration project gets `setupFilesAfterEnv`, which calls
  `resetDatabase()` in `beforeAll` and `closeTestApps()` in `afterAll`.
- `createEmptyDatabase()` gives a fresh database for the migrate and seed
  tests, and `runMigrateStep(env, opts?: { seedPath?: string })` takes the
  seed path.
- Two Jest config files (`jest.unit.config.ts`, `jest.int.config.ts`)
  replace the two projects.
- Task 1 creates `test/support/app.ts` before writing its failing test.

### 2.2 Starting the app (both)

- **Nest's own body parsers stay on.** By default Nest parses JSON with a
  100 kb limit and also parses form bodies, so a later
  `express.json({ limit: '1mb' })` never sees the body. Task 2's "over 1 MB →
  413" test would still pass at 100 kb [both, recalled].
- **`BODY_LIMIT` is used before it exists.** Task 2 uses it; Task 5 defines
  it [Fable].
- **Root-level files break the build layout.** `nest build` would also
  compile `jest.config.ts`, `drizzle.config.ts` and the scripts, moving the
  output to `dist/src/main.js` and breaking every `dist/…` path [Fable,
  recalled].
- **`nest new` runs `git init`** [Fable].
- **A green Jest run doesn't prove `uuid` 14 loads.** Jest can pass while
  the compiled `node dist/main.js` cannot load the ESM-only package [Grok].

**Fix:**
- Task 1 produces `createApp()`, which creates the app with
  `{ bodyParser: false, bufferLogs: true }`; `main.ts` and the tests both use
  it.
- `configureApp` registers one `express.json({ limit: BODY_LIMIT, type: 'application/json' })`.
- `limits.ts` moves to Task 2. Task 2 tests that a 200 KB body is accepted
  and a body over 1 MB is a 413.
- `tsconfig.build.json` gets `include: ["src/**/*"]` and `rootDir: "src"`.
  Task 1 adds `npm run build && test -f dist/main.js` and a `node -e` import
  of `uuid`.
- The scaffold uses `nest new --skip-git`.
- The Jest tsconfig compiles to CommonJS, and the template's `jest` key in
  `package.json` is deleted.

### 2.3 The problem-details filter (both)

- **Every `HttpException` except 404 becomes a 500.** Terminus's
  `ServiceUnavailableException` would make `/health/ready` answer 500, not
  §9.6's 503. Nest's own 401s and pipe errors would become 500s too.
- **Two required outputs are never set.** No step sets
  `Content-Type: application/problem+json` or applies `ApiProblem.headers`
  (for example the 401's `WWW-Authenticate`).
- **No test covers the 503 or the pg-failure rows.**

**Fix:**
- Any `HttpException` gets its own status, with the code derived from the
  status.
- The filter always sets `application/problem+json` and applies the
  problem's headers.
- Tests: readiness with an unreachable database returns a 503 problem with
  `SERVICE_UNAVAILABLE`; a unit test covers `ECONNREFUSED`, `08006` and
  `57P01`.

Grok also said terminus writes its 503 itself and so skips the filter. The
author recalls that terminus throws an `HttpException`, which goes through
the filter. The new readiness test settles it either way.

### 2.4 Docker and Compose (both)

- **The seed file never reaches the image.** It lies outside `src/`, so
  Nest's assets will not copy it. Task 8's tests read it from the working
  folder and pass while the image lacks it, and Task 9 inherits the failure.
- **The `depends_on` shorthand in the plan is not valid Compose.** Grok
  notes it needs `condition:`.
- **The bench service can't target the build stage.** Task 12 points it at
  "the build stage", but Task 4 never names one.
- **A Task 3 check can't run there.** "Runs with no development dependency
  installed" cannot be confirmed before Task 4's pruned image exists
  [Fable].
- **The healthcheck's `wget` may not work.** Grok says the Alpine image's
  `wget` rejects `-qO-`. The author recalls that BusyBox's `wget` accepts it.
  A `node -e "fetch(…)"` healthcheck removes the question at no cost.

**Fix:**
- The `Dockerfile` names `FROM node:26-alpine AS build`, has a separate
  runtime stage, and adds `COPY seed ./seed`.
- The seed path resolves from the application root.
- Task 8 runs the clean-image check with an assertion that the file exists.
- The plan shows `depends_on` in its long form.
- Task 12 uses `build.target: build`.
- The healthcheck uses Node's `fetch`.
- The dev-dependency confirmation moves to Task 4.

### 2.5 Reading an entry (both)

- **One bad field can produce two errors.** The split between class-validator
  and the domain checks is not stated, so `date: null` or a 101-character
  name could carry two errors on one path, and "N fields are invalid" would
  miscount [Fable]. Rule: the DTO owns presence, type, numeric ranges,
  array sizes and unknown properties; the domain checks run only on fields
  with no DTO error; one error per path.
- **The §9.1 caps have no tests.** Add `10.1234`, `10 000.001`, reps
  `1 001` and `5.5`, and 51 sets, each a 400; and weight `0` → 201.
- **Counting decimals goes wrong on exponents.** `decimalPlaces` must handle
  exponent notation: `String(1e-7)` is `"1e-7"` (verified). Otherwise
  `numeric(9,3)` would round the value silently.
- **The own-unit test cannot fail.** It uses 225, which `display()` also
  returns as 225. Use §6's `100.125 kg`, read back as `100.125`, with volume
  `100.13` [Grok].
- **`GET …/workout-entries/{id}` must accept `unit`.** Design §17 says so
  (verified); the plan left it out [both].
- **The non-UUID id rule is untested.** A non-UUID id is a 404 without a
  query; add the test, since a cast error would surface as a 500 [Grok].
- **Only the workout routes check the path `userId`.** `UserIdPipe` belongs
  on every `:userId` route, PRs and compare included, each with a test
  [Grok].
- **Test the bad ids percent-encoded.** Otherwise the HTTP client decides
  the outcome [Fable].
- **`EntryResponse` is never defined.** It is the §9.1 JSON.
- **Task 10 does not need to modify `schema.ts`.**
- **Task 10 is too large for one review** [both]. It splits into:
  - 10a: `requireJson`, `UserIdPipe`, `readEntryInputs` and their unit tests;
  - 10b: the repository, the response, the routes and the integration tests.

### 2.6 Dates (Fable)

- **A date alone needs a different message for `from` and for `to`.** On
  `to` it says "send the start of the next day". On `from` that advice drops
  a day; it should say "send the start of that day". `parseReadBound` takes
  `bound: 'from' | 'to'`.
- **The date-alone check must use the text's shape.**
  `Temporal.PlainDate.from` accepts `"2025-02-10 06:30:00"`, which is
  Python's `str(datetime)` (verified). The check must not rely on the
  absence of `T`.
- **Add rows for the compact `20250210T053000Z` and leap-second `:60`
  forms** (both verified accepted).
- **Add `from > to` to the `checkRange` tests.**
- **`repairOffsetPlus` leaves `'2025-02-01 07:00'` unchanged**, because no
  time comes before the space.

### 2.7 Drizzle traps (Fable, recalled)

- **Arrays expand into parameter lists.** A JavaScript array inside a Drizzle
  `sql` template becomes `($1, $2, …)`, so `= ANY(${keys})` fails.
- **Raw queries may return text dates.** Rows from `db.execute(sql…)` may
  return `timestamptz` as text, because Drizzle overrides `pg`'s parsers.

**Fix:** Task 3 produces `pgArray(values, 'text' | 'uuid')` and
`toDate(value)`, each with one assertion, so the behaviour is pinned by a
test whichever way it turns out.

### 2.8 Catalog read routes (both)

- **The repository's return type is incomplete.** It must return
  `createdAt` and `updatedAt`, ordered by key (§10.4).
- **No test proves the routes read the tables.** Add one: a row inserted by
  SQL appears on `GET /v1/exercises` and `GET /v1/muscle-groups` without a
  `refresh()`.

### 2.9 PRs and compare (both)

- **Compare can't load its entries inside its transaction.** Task 13
  produces `findEntriesByIds(ids, db?: Executor)`, and Task 14 uses it.
- **`toRecordsResponse` can't produce the full §9.3 shape.** It returns the
  `records` object only, and the service adds `exercise`, `unit` and
  `range`.
- **The delta test needs exact inputs** [Grok]: current `101 kg × 1`,
  previous `100 kg × 1`. They show as 104.37 and 103.33, and the delta is
  1.03. Subtracting the shown values would give 1.04 (verified).
- **Missing tests:**
  - after the write burst, the PRs are correct (§12);
  - compare with both periods empty;
  - records-response: `6 lb × 50` gives a volume of 300 in lb, and
    `100.125 kg × 1` gives weight 100.125 and volume 100.13;
  - the empty-result messages are asserted as literal strings.
- **Task 14's Interfaces lists `Executor` under Produces.** It moves under
  Consumes.

### 2.10 Catalog administration and the guard (both)

- **The guard test has no way to apply the guard.** The fix: its own file,
  `test/admin-guard.int-spec.ts`, which sets `ADMIN_API_TOKEN`, calls
  `AdminOnly()(CatalogAdminController)`, then creates the app. The
  production file keeps the two lines commented out [Fable].
- **The 401 comes from an `ApiProblem` carrying `WWW-Authenticate: Bearer`.**
- **Nest answers DELETE with 200 by default** [Grok, recalled]. Both delete
  routes use `@HttpCode(204)`, and their tests assert 204 with an empty body.
- **Task 17 splits into 17a and 17b** [Fable]:
  - 17a: the exercise routes and the guard;
  - 17b: the two muscle-group routes, so the cut-list item is one commit
    that can be reverted.

### 2.11 Benchmark (both)

- **The runner arrives too late.** Design §11 says the data comes before the
  history and PR slices "so both are measured as they are built"; the plan's
  runner arrives after both. A history budget miss would surface three tasks
  late.
- **The benchmark could time a copy of the query.** Fable suggests the
  runner import the shipped SQL builders (`buildHistoryIdsQuery`,
  `buildRecordsQuery`), so `EXPLAIN` runs exactly what the API runs.
- **Generated data must be deterministic.** At scale 0.01, random generation
  makes the share assertions flaky [Fable].
- **The full-scale counts need a label.** "2 500–4 000" is the full-scale
  count; the 5–8 % share is what the scaled test asserts [Grok; partly a
  misreading, but worth stating].
- **The scripts need a named runner:** `tsx`.

**Fix:** the runner skeleton moves to Task 12. Task 13 adds the history
cases, Task 14 the PR cases, Task 15 compare. Task 16 becomes the full run,
the report and the budget gate.

### 2.12 Swagger and helmet (both, recalled)

- **Helmet may blank the Swagger page.** Its default Content Security Policy
  may leave `/docs` blank over plain HTTP.
- **The OpenAPI document is never checked.** Mounting Swagger only in the
  last task leaves it untested.

**Fix:** mount it in `configureApp` in Task 2, with a CSP that lets Swagger UI
load, and add a smoke test (`GET /docs-json` 200, `GET /docs` HTML). Task 18
opens `/docs` in a browser and runs one call.

### 2.13 Contradictions with the design

- **Benchmark timing** (2.11).
- **`unit` on one entry** (2.5).
- **Lock order in the seed step** [Grok]. Task 8 says the seed file is read
  and validated "before taking any lock", but §10.3 says "lock first, then
  read the ledger". The sentence narrows to validating the file; the ledger
  read stays inside the lock.
- **The PR message** [Fable]. The plan fills in the real `userId` where the
  design shows `{userId}`. Fable prefers the plan's reading; the tests get
  the literal string.
- **The seed planner's inputs** [Fable]. The case of an exercise an admin
  created first is handled in SQL, not in the planner. That is acceptable;
  the task says so, so the reviewer does not flag it.

### 2.14 Sizing

- **Splits:** Tasks 10 and 17 (above).
- **Most likely to overrun:**
  - Tasks 1–4, against 2.95 h;
  - Task 12, against 1.0 h, which both call underpriced;
  - Task 16, if a fallback fires;
  - Task 18, for the README.

The total estimate was out of scope and is not changed.

## 3. Review Focus, revised

| # | Input | Expected | Task |
|---|---|---|---|
| 1 | Numbers sent as strings (`"weight": "225"`, `"reps": "5"`) | 400 naming each field | 10a |
| 2 | Empty, malformed or repeated query values: `exercise=`, `limit=0` / `101` / `abc`, `unit=kg&unit=lb` | 400 naming the parameter, never a 500 | 13–15 |
| 3 | A body that is empty, `null` or the wrong JSON type: `POST` with no `-d`, `"sets": {}`, `"entries": [null]` | 400 showing the expected shape, never a 500 | 10a, 11 |
| 4 | A path `userId` people actually paste: `coach@example.com`, `user:1`, `u 1` (sent percent-encoded) on every user route | 400 naming `userId`; a well-formed unknown user gets 200 with no data | 10a, 13–15 |
| 5 | PRs or compare without a required parameter | one 400 listing every missing one | 14, 15 |

Old items 2 and 3 merged into the new 2. Item 4 now uses realistic values
and covers every route. Fable's point about query parameters with the wrong
name is the owner's call (section 4).

## 4. The owner's call

**PC-1. Unknown query parameters.** `?exerciseName=bench` (the body's field
name), `?startDate=…` or `?page=2` currently gives an unfiltered 200. A
caller would read that as "the filter matched everything" [Fable]. The
design is silent on query parameters. For bodies it rejects unknown
properties, because "rejecting unknown properties catches client typos"
(D-18).

- **(a) Recommended:** a 400 naming the parameter and listing the accepted
  ones, on history, PRs and compare.
- **(b)** Ignore unknown parameters, as now.

## 5. What the author checked by running it (Node 26.12)

- `Temporal.Instant.from('2025-02-10T06:30:00+07:00[Asia/Ho_Chi_Minh]')`
  is `2025-02-09T23:30:00Z`: the bracket is accepted, as V-18 recorded. Grok's
  finding 6 is wrong.
- `Temporal.PlainDate.from` accepts `"2025-02-10 06:30:00"`,
  `"2025-02-10T06:30:00"` and `"20250210"`.
- `Temporal.Instant.from` accepts `20250210T053000Z`, and reads
  `2016-12-31T23:59:60Z` as `…23:59:59Z`.
- `String(1e-7)` and `String(0.0000001)` are both `"1e-7"`;
  `JSON.parse("1e-7")` is `1e-7`.
- `101 kg × 1` and `100 kg × 1` show 104.37 and 103.33. The exact delta
  rounds to 1.03; the delta of the shown values is 1.04.
- Design §17 says `GET …/workout-entries/{id}` accepts `unit`, and the plan
  omitted it.

**Not checked; recalled by a reviewer:**
- the TypeScript `rootDir` layout;
- Drizzle's array expansion and type parsers;
- Jest's `--selectProjects` parsing;
- helmet versus Swagger UI;
- Nest's DELETE default and its body parser defaults;
- BusyBox `wget`;
- whether the compiled app can `require` `uuid` 14.

Each fix above is cheap, or is pinned by a test that settles it.

## 6. Reviewer mistakes

- **Grok 6:** `Instant.from` does not reject a bracket (verified).
- **Grok 8:** the plan already asserted 5–8 %. The 2 500–4 000 was a
  full-scale parenthetical, though the wording is clarified anyway.
- **Grok 12:** "no step says the public GETs read the tables" — Task 9's
  Interfaces said so. The test it asks for is still added.
- **Grok, answer 6:** replacing `ü` with `u_123` would test a valid id, not
  a failure. Item 4 takes Fable's realistic values instead.
- **Grok, technical errors:** that BusyBox `wget` rejects `-qO-`, and that
  terminus skips the filter, are recollections the author does not share.
  Both are made moot by the fixes in 2.3 and 2.4.

No Fable finding was shown wrong. Four rest on recollection (section 5).

## 7. The list

### PA — corrections (the plan is wrong or cannot be carried out as written)

1. The test set-up: `setupFilesAfterEnv` with `resetDatabase()` and
   `closeTestApps()`; `createEmptyDatabase()`; `runMigrateStep(env, { seedPath })`;
   two Jest configs; `createTestApp` created before Task 1's test (2.1).
2. `createApp()` with `bodyParser: false`; one JSON parser; `limits.ts` in
   Task 2; the 200 KB and 1 MB tests (2.2).
3. `tsconfig.build.json` includes only `src`; the build check; the `uuid`
   runtime check; `--skip-git`; the Jest module setting (2.2).
4. The filter maps every `HttpException` by status, sets
   `application/problem+json` and applies the headers; readiness 503 test
   (2.3).
5. `COPY seed ./seed`, a named build stage, long `depends_on`,
   `build.target`, a Node healthcheck, the dev-dependency check in Task 4,
   and the clean-image check in Task 8 (2.4).
6. One error per path, with the DTO and domain split stated (2.5).
7. `GET …/{id}` accepts `unit` (2.5).
8. `parseReadBound(raw, path, bound)` with separate messages for `from` and
   `to`; a date alone recognised by its shape (2.6).
9. `findEntriesByIds(…, db?)`; `toRecordsResponse` returns `records`;
   `Executor` under Consumes (2.9).
10. The guard test's mechanism; the 401 through `ApiProblem`; DELETE → 204
    (2.10).
11. The seed lock sentence narrowed to file validation (2.13).
12. Exact delta inputs in Task 15 (2.9).

### PB — recommended additions

1. The §9.1 cap tests, `decimalPlaces` with exponents, and the 100.125
   own-unit test (2.5).
2. A non-UUID id → 404; `UserIdPipe` on every `:userId` route;
   percent-encoded bad ids (2.5).
3. The date rows: compact, `:60`, `from > to`, and `repairOffsetPlus` with
   no time (2.6).
4. `pgArray` and `toDate`, each with an assertion (2.7).
5. Catalog GETs: `createdAt`/`updatedAt`, ordered by key, and the
   inserted-by-SQL test (2.8).
6. The burst → PRs correct, both-periods-empty, records-response and
   literal-message tests (2.9).
7. The benchmark runner in Task 12, extended by Tasks 13–15 through shared
   SQL builders; deterministic data; `tsx` (2.11).
8. Swagger mounted in Task 2 with a CSP that lets it load, plus smoke tests
   (2.12).
9. Split Task 10 into 10a and 10b, and Task 17 into 17a and 17b (2.5, 2.10).
10. The revised Review Focus (section 3).
11. "Agents will still get this wrong" notes in the relevant tasks:
    - `CLOCK`, never `new Date()`;
    - the cursor built from the last row returned;
    - `weight_kg` kept as a decimal string, never `parseFloat`;
    - history step 1 selects only indexed columns;
    - seed links carry `position`;
    - compare's follow-up load runs on the transaction;
    - `setNumber` is assigned by the server, never sent;
    - the database URL is never logged.

### PC — the owner's call

1. Unknown query parameters (section 4).

### PD — not followed

- Grok 6, and Grok's `u_123` example (section 6).
- Grok's suggestion of a guarded subclass for the guard test. It would
  register the routes twice; Fable's call on the controller class at run
  time is used instead.
- Re-pricing Task 12, or the estimate as a whole: out of scope. The overrun
  risks are noted in 2.14.
