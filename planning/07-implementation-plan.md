# Workout Logging API — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Workout Logging API that `planning/02-design.md` specifies, in the slice order of design §15, test-first, with one reviewed commit per task.

**Architecture:** A layered NestJS 12 application (controller → service → pure domain, repository, catalog snapshot) over PostgreSQL 18. Migrations are hand-written SQL and queries go through Drizzle and `pg`. A one-shot `migrate` step runs the migrations and the catalog seed; `api` never does. Every error is `application/problem+json`.

**Tech Stack:** Node.js 26, TypeScript 6.0.3, NestJS 12 (Express), PostgreSQL 18, Drizzle ORM 0.45.4 + `pg`, class-validator, decimal.js, `Temporal`, uuid 14, nestjs-pino, Jest 30 + ts-jest, Supertest, Testcontainers, fast-check, lodash, `tsx` and `simple-statistics` for scripts, Docker Compose.

**Spec:** `planning/02-design.md` (§ numbers below refer to it). The requirement IDs are in `planning/01-requirements.md`, the reasons in `planning/03-decision-log.md` and the evidence in `planning/05-research-notes.md`. Read the design section a task names before starting the task.

**Reviewed:** Claude Fable 5.2 and Grok 4.7 reviewed this plan, and their list is applied (`planning/debate/plan-review-summary.md`, `planning/debate/resolution.md` §23).

## Global Constraints

- Node.js 26 LTS. TypeScript **6.0.3, not 7.x**: `@nestjs/swagger` 12.1.2 declares `typescript ^5.5.0 || ^6.0.0`. `tsconfig` has `"strict": true` and `lib` includes `esnext.temporal` (V-8).
- `@nestjs/core` 12.5.1 with the Express adapter; `@nestjs/config` 12.1.1, `@nestjs/terminus` 12.2.0, `@nestjs/swagger` 12.1.2, `nestjs-pino` 5.3.2 with `pino` 10.4.0, `class-validator` 0.15.1 with `class-transformer`, `helmet` 8.3.0.
- PostgreSQL 18 (`postgres:18-alpine`, volume at `/var/lib/postgresql`). `drizzle-orm` 0.45.4 and `pg` 8.23.1. `drizzle-kit` 0.31.11 is used only for `generate --custom`, which makes empty files for hand-written SQL. Never generate a migration from `schema.ts`, and never `push`.
- `decimal.js` 10.6.0 set to `precision: 40`; `uuid` 14 `v7()`, generated in the application; `Temporal` (built in) for all date parsing, and no date library.
- `lodash` 4.18.1 with `@types/lodash` 4.17.27 (CommonJS, so Jest needs no transform for it); `simple-statistics` 8.0.0, for the benchmark only (V-23).
- **Libraries before hand-written code (D-28).** Stable, clean code and sound error handling decide. Before writing a function, use what exists: a Node built-in or a library already in the stack (Nest's pipes, class-validator, decimal.js, `Temporal`, `uuid`), or a well-kept dependency added for it. Where a built-in is easier to get wrong, use lodash: `isPlainObject` for "is this a JSON object" (`typeof null` is `'object'`), `get` for a field of a value typed `unknown`, such as a caught error. For typed values, optional chaining (`a?.b`) is the safe built-in: it does not throw on `null`, and the compiler checks the path. Write your own only for domain logic, a framework hook (the filter, the guard) or a one- or two-line helper, and say why in a comment. Prefer CommonJS or dual packages: an ESM-only one needs a Jest transform entry, as `uuid` does. The one exception the owner set: the benchmark's request loop (Task 12).
- Jest 30.5.2 + ts-jest 29.4.15, Supertest 7.3.2, `testcontainers` and `@testcontainers/postgresql` 12.2.1, `fast-check` 4.10.3. **No mocked database.**
- Integration tests share one Testcontainers database and run in band. Every file starts on a reset database, and every app a test creates is closed after the file (Tasks 1 and 3). A test that must start from nothing uses `createEmptyDatabase()`.
- Every test command runs with `TZ=Asia/Ho_Chi_Minh`, and the test database's session zone is `America/Los_Angeles` (§12).
- Base path `/v1`, except `/health/live`, `/health/ready`, `/docs` and `/docs-json`.
- Success bodies are `{ data, page?, message? }`. Every non-2xx is problem details with `code` and `requestId`, plus `errors[]` of `{ path, message }` for validation failures, one entry per path (§9.6).
- On a route that reads query parameters, a parameter it does not accept is a 400 that names it and lists the accepted ones, and a parameter sent twice is a 400 (§9).
- Input caps are constants in `src/common/limits.ts`, never environment settings (D-18).
- No query uses the database session's zone: no cast of a `timestamptz` to `date`, no `date_trunc`, no `current_date` (§8). SQL is parameterised only (§13).
- The current time comes from the injected `CLOCK`. Nothing in `src/` calls `new Date()` or `Date.now()` to learn what time it is (§8).
- Weights stay `Decimal`, or exact decimal strings from the database, until `display()`. Never `parseFloat` or `Number` on `weight_kg` (§6).
- The database URL and the admin token are never logged. The startup line names the database host and database only (§13).
- Neither the migrations nor the seed ever run inside `api` (§13).
- Every example in the README, `requests.http` and OpenAPI uses a full date-time with an offset. Sample dates are 2025 values like the design's, and no document states a real calendar date.
- One commit per task at least (D1 grades the history). AI output is never committed unread (§2).
- When AI-generated code is corrected before a commit, add a line under "To capture during implementation" in `planning/06-ai-workflow-seed.md`: what was wrong, how it was noticed, the fix and the commit hash. `AI_WORKFLOW.md` is written from it (Task 18).

## Review Focus

Inputs the design implies but no design test names, most likely first. Each line's test is in the task shown.

1. **Numbers sent as strings** — `"weight": "225"`, `"reps": "5"`, as form-driven clients send them → a 400 naming each field, never converted silently (Task 10a).
2. **Empty, malformed or repeated query values** — `exercise=`, `limit=0` / `101` / `abc`, `unit=kg&unit=lb` → a 400 naming the parameter, never a 500 or a silent "no filter" (Tasks 13–15).
3. **A body that is empty, `null` or the wrong JSON type** — a `POST` with the JSON header and no body, `"sets": {}`, `"entries": [null]` → a 400 showing the expected shape. A bare `null` is a 400 `MALFORMED_JSON`, because the JSON parser accepts only an object or an array. Never a 500 (Tasks 10a, 10b and 11).
4. **A path `userId` people actually paste** — `coach@example.com`, `user:1`, `u 1`, sent percent-encoded, on every user route → a 400 naming `userId`. A well-formed unknown user gets 200 with no data (A10) (Tasks 10a, 10b and 13–15).
5. **PRs or compare without a required parameter** — no `exercise`, or a missing compare bound → one 400 listing every missing parameter (Tasks 14 and 15).

## Sizing

The tasks most likely to overrun their share of §16 are Tasks 1–4 (against 2.95 h), Task 12 (1.0 h, which now also holds the benchmark runner's skeleton), Task 16 if a fallback fires, and Task 18 (the README). An overrun in Tasks 1–4 is the signal to revisit the buffer (§16).

---

### Task 0: Repository, estimate and cut list

Deliverable D8 asks for the estimate before any code, so it is committed first (§15, §16).

**Files:**
- Create: `.gitignore`, `ESTIMATE.md`
- Commit as they are: `CLAUDE.md`, the rules for every AI agent (D-25), and `AGENTS.md`, which points other tools to it

- [ ] **Step 1:** `git init` in the repository root, the folder that holds `planning/`. `.gitignore` lists `node_modules/`, `dist/`, `coverage/`, `.env`, `.DS_Store` and `bench/out/`.
- [ ] **Step 2:** Write `ESTIMATE.md` from §16:
  - the range, 23–25 h of focused work over 3 days, with the per-slice table;
  - "cut from the start" (the CI benchmark job and the schema drift check);
  - the cut list, in its order: `fast-check` generators → the two muscle-group write routes → `GET …/workout-entries/{id}` → Swagger UI;
  - the "never cut" list.

  The file contains no dates.
- [ ] **Step 3:** Run `git add planning ESTIMATE.md .gitignore CLAUDE.md AGENTS.md && git commit -m "docs: planning, estimate and cut list"`. Expected: `git status` is clean and `git log --oneline` shows one commit.

### Task 1: Scaffold, toolchain test, health and CI (slice 1 · §16 "1–3": 2.95 h with Tasks 2–4)

**Files:**
- Create (Nest CLI, default `ts` template): `package.json`, `tsconfig.json`, `tsconfig.build.json`, `nest-cli.json`, ESLint config, `src/main.ts`, `src/app.module.ts`
- Create: `src/app.setup.ts`, `src/health/health.module.ts`, `src/health/health.controller.ts`, `jest.unit.json`, `jest.int.json`, `test/support/global-setup.ts`, `test/support/global-teardown.ts`, `test/support/setup-int.ts`, `test/support/app.ts`, `.github/workflows/ci.yml`
- Test: `test/toolchain.int-spec.ts`

**Interfaces:**
- Produces:
  - In `src/app.setup.ts`:
    - `APP_OPTIONS: NestApplicationOptions = { bodyParser: false }`. Nest's own parsers stay off: their 100 kb JSON limit and their form parser would run before any parser `configureApp` adds. Task 2 adds the one JSON parser, and `bufferLogs: true` with the logger.
    - `configureApp(app: INestApplication): void`. It holds every global setting (prefix, body parser, pipes, filter, helmet, Swagger).
    - `main.ts` runs `configureApp(await NestFactory.create(AppModule, APP_OPTIONS))`, then listens. Nothing in `src/` imports `@nestjs/testing`, a development dependency that the runtime image lacks.
  - In `test/support/app.ts`:
    - `createTestApp(overrides?: TestOverrides): Promise<INestApplication>`, where `TestOverrides = { providers?: { provide: unknown; useValue: unknown }[]; controllers?: Type[] }`. It compiles `AppModule` with the overrides, runs `configureApp(moduleRef.createNestApplication(APP_OPTIONS))` and `init()`, and records the app. The tests and `main.ts` thus build the app the same way.
    - `closeTestApps(): Promise<void>` closes every recorded app.
  - `test/support/setup-int.ts`, the integration `setupFilesAfterEnv`: `afterAll(closeTestApps)`. Task 3 adds `beforeAll(resetDatabase)`.
  - npm scripts:
    - `test`: `TZ=Asia/Ho_Chi_Minh jest -c jest.unit.json`;
    - `test:int`: `TZ=Asia/Ho_Chi_Minh jest -c jest.int.json --runInBand`;
    - `lint`, `typecheck` (`tsc --noEmit`) and `build`.

    A path after `--` narrows either run, as in `npm test -- src/units`.
  - The integration global setup exports `process.env.DATABASE_URL`.

- [ ] **Step 1:** Scaffold with `npx @nestjs/cli@12 new --skip-git` (npm, strict). If the CLI refuses the non-empty root, generate into a temporary folder and move the files. Then:
  - Delete the sample controller, service and spec, the template's `test/jest-e2e.json`, and the `jest` key in `package.json`, so one place configures Jest.
  - Pin the versions of the Global Constraints, and add `esnext.temporal` to `lib`.
  - Leave `"type": "module"` out of `package.json`. With the template's `nodenext` setting, TypeScript then emits CommonJS for both the build and ts-jest.
  - Give `tsconfig.build.json` `"include": ["src/**/*"]` and `"rootDir": "src"`. Otherwise root-level files (`drizzle.config.ts`, `scripts/`) move the output to `dist/src/`, and every `dist/…` path breaks.
- [ ] **Step 2:** Write the two Jest configs as JSON, so Jest needs no TypeScript loader to read them:
  - `jest.unit.json` runs `src/**/*.spec.ts`;
  - `jest.int.json` runs `test/**/*.int-spec.ts`, with the global setup and teardown and `setupFilesAfterEnv: ["<rootDir>/test/support/setup-int.ts"]`.

  The global setup starts `new PostgreSqlContainer('postgres:18-alpine').withCommand(['postgres', '-c', 'timezone=America/Los_Angeles'])` and sets `DATABASE_URL`. Write `src/app.setup.ts` (with an empty `configureApp`), `test/support/app.ts` and `setup-int.ts` as the Interfaces say, so the test below fails on its missing route, not on a missing import.
- [ ] **Step 3: Write the failing tests** in `test/toolchain.int-spec.ts`:

```ts
it('imports v7 from the ESM-only uuid 14', () => expect(v7()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/));
it('answers /health/ready through Nest from the Testcontainers database', async () =>
  request((await createTestApp()).getHttpServer()).get('/health/ready').expect(200));
it('answers /health/live without the database', ...);           // 200
it('runs in the non-UTC process zone', () =>                     // Node reports Asia/Saigon for this TZ
  expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toMatch(/Asia\/(Ho_Chi_Minh|Saigon)/));
```

- [ ] **Step 4:** Run `npm run test:int -- test/toolchain.int-spec.ts`. Expected: the two health tests FAIL with 404, because there is no health route.
- [ ] **Step 5:** Add `HealthModule` (terminus):
  - `GET /health/live` answers 200.
  - `GET /health/ready` runs `SELECT 1` on a `pg.Pool` built from `DATABASE_URL`, and answers 503 when that fails. Task 3 swaps this pool for the database module's.
  - `configureApp` sets `setGlobalPrefix('v1', { exclude: ['health/live', 'health/ready', 'docs', 'docs-json'] })`.

  If `v7` fails to import under ts-jest, let ts-jest transform `uuid` (`transformIgnorePatterns: ['/node_modules/(?!uuid)']`, with `allowJs`), and record it in the AI log (§14).
- [ ] **Step 6:** Run `npm run test:int -- test/toolchain.int-spec.ts && npm run lint && npm run typecheck && npm run build && test -f dist/main.js && node -e "console.log(require('uuid').v7())"`. Expected: PASS, and a v7 id printed. The last command shows that the compiled CommonJS app can load the ESM-only `uuid` 14 through Node's `require` of ES modules, which a green Jest run does not prove.
- [ ] **Step 7:** Add `.github/workflows/ci.yml`: Node 26, `npm ci`, then lint → typecheck → build → `npm test` → `npm run test:int`, on `ubuntu-latest`, which has Docker for Testcontainers.
- [ ] **Step 8:** Commit: `chore: scaffold, toolchain test, health, CI`.

### Task 2: Configuration, limits, logging, problem details and Swagger (slice 2)

**Files:**
- Create: `src/config/env.ts`, `src/common/limits.ts`, `src/common/logger.ts`, `src/common/problem.ts`, `src/common/validation.ts`, `src/common/problem-details.filter.ts`, `test/support/probe.controller.ts`
- Modify: `src/app.module.ts`, `src/app.setup.ts`, `src/health/health.controller.ts` (the pool URL comes from config)
- Test: `src/config/env.spec.ts`, `src/common/logger.spec.ts`, `src/common/validation.spec.ts`, `src/common/problem-details.filter.spec.ts`, `test/errors.int-spec.ts`, `test/docs.int-spec.ts`

**Interfaces:**
- Produces:
  - Environment:
    - `ApiEnv = { DATABASE_URL: string; PORT: number; LOG_LEVEL: 'fatal'|'error'|'warn'|'info'|'debug'|'trace'; DB_POOL_MAX: number; DB_STATEMENT_TIMEOUT_MS: number; CATALOG_REFRESH_SECONDS: number; ADMIN_API_TOKEN?: string }`;
    - `MigrateEnv = Pick<ApiEnv, 'DATABASE_URL' | 'LOG_LEVEL'>`;
    - `validateApiEnv(raw: Record<string, string | undefined>): ApiEnv` and `validateMigrateEnv(raw): MigrateEnv`;
    - both throw `ConfigError`, whose message lists `NAME: rule` per bad variable and never a value.
  - `src/common/limits.ts` constants:
    - weights and sets: `MAX_WEIGHT = 10_000`, `MAX_WEIGHT_DECIMALS = 3`, `MAX_REPS = 1_000`, `MAX_SETS = 50`, `MAX_BULK = 100`;
    - names: `MAX_NAME_LENGTH = 100`, `MAX_KEY_LENGTH = 100`, `MAX_GROUP_NAME_LENGTH = 40`, `MAX_GROUPS_PER_EXERCISE = 10`;
    - paging: `MAX_PAGE_SIZE = 100`, `DEFAULT_PAGE_SIZE = 20`;
    - requests: `USER_ID_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/`, `BODY_LIMIT = '1mb'`;
    - time: `FUTURE_TOLERANCE_MS = 15 * 60_000`, `EARLIEST_INSTANT = '1900-01-01T00:00:00Z'`;
    - storage: `WEIGHT_KG_INTEGER_DIGITS = 6`.
  - `loggerParams(env: Pick<ApiEnv, 'LOG_LEVEL'>): Params` for `nestjs-pino`.
  - Problems and validation:
    - `type FieldError = { path: string; message: string }`;
    - `type Check<T> = { ok: true; value: T } | { ok: false; errors: FieldError[] }`;
    - `class ApiProblem extends Error`, with constructor `(status: number, code: ProblemCode, detail: string, errors?: FieldError[], headers?: Record<string, string>)`;
    - `type ProblemCode` is the codes of §9.6;
    - `validationProblem(errors: FieldError[]): ApiProblem`;
    - `toFieldErrors(errors: ValidationError[], prefix?: string): FieldError[]`, one entry per path.
  - `driverErrorCode(error: unknown): string | undefined` in `src/common/problem.ts`: the `code` of a database error, read with lodash `get` from the error or from its `cause`. Drizzle 0.44 and later wraps every driver error in a `DrizzleQueryError` (V-23), so `err.code` alone misses it; which property holds the original is recalled as `cause` (U-29), and the tests here and in Task 17b settle it. Tasks 17a and 17b use it for `23503`.
  - `toApiProblem(exception: unknown): ApiProblem`, the filter's mapping as a pure function, and `ProblemDetailsFilter`, registered in `configureApp`.
  - `/docs` (Swagger UI) and `/docs-json` (the OpenAPI document).

- [ ] **Step 1: Write the failing unit tests:**

```ts
// env.spec.ts
it('applies the §13 defaults', () => expect(validateApiEnv({ DATABASE_URL: url })).toEqual(
  { DATABASE_URL: url, PORT: 3000, LOG_LEVEL: 'info', DB_POOL_MAX: 10, DB_STATEMENT_TIMEOUT_MS: 5000, CATALOG_REFRESH_SECONDS: 300 }));
it('refuses a missing DATABASE_URL, naming it', ...);                       // toThrow(/DATABASE_URL/)
it.each(['abc', '5', '3601'])('refuses CATALOG_REFRESH_SECONDS=%s', ...);   // range 10–3600
it('refuses an ADMIN_API_TOKEN under 32 characters without printing it', ...); // message has the name, not the value
it('validates migrate with only DATABASE_URL set', ...);
// logger.spec.ts
it('redacts authorization and cookie from a request line', ...);  // pino-http options to a memory stream
// validation.spec.ts
it('builds the path entries[2].sets[0].unit from nested ValidationErrors', ...);
it('gives one entry per path when a property fails two constraints', ...);
// problem-details.filter.spec.ts — toApiProblem
it.each(['ECONNREFUSED', '08006', '57P01'])('a pg failure with code %s → 503 SERVICE_UNAVAILABLE', ...);
it('the same failure wrapped as Drizzle wraps it, with the pg error as cause → 503', ...);
it('a ServiceUnavailableException (as terminus throws) → 503 SERVICE_UNAVAILABLE', ...);
it('an UnauthorizedException → 401 UNAUTHORIZED; a NotFoundException → 404 NOT_FOUND', ...);
it('entity.parse.failed → 400 MALFORMED_JSON; entity.too.large → 413 PAYLOAD_TOO_LARGE', ...);
it('a TypeError → 500 INTERNAL_ERROR whose detail names nothing internal', ...);
```

- [ ] **Step 2:** Run `npm test -- src/config src/common`. Expected: FAIL (the modules are missing).
- [ ] **Step 3:** Implement the schema with the §13 table's types, ranges and defaults:
  - `PORT` 1–65 535;
  - `DB_POOL_MAX` 1–100;
  - `DB_STATEMENT_TIMEOUT_MS` 100–60 000;
  - `CATALOG_REFRESH_SECONDS` 10–3 600;
  - `ADMIN_API_TOKEN` at least 32 characters when set.

  Wire it with `ConfigModule.forRoot({ validate: validateApiEnv })`. Write `limits.ts`. Add `lodash` and `@types/lodash` (Global Constraints).
- [ ] **Step 4:** Implement `loggerParams`:
  - `redact: ['req.headers.authorization', 'req.headers.cookie']`;
  - the request id is taken from `x-request-id`, or generated with `v7()`, and echoed in the response header;
  - no bodies are logged.

  `APP_OPTIONS` gains `bufferLogs: true`, and `configureApp` calls `app.useLogger(app.get(Logger))`.
- [ ] **Step 5:** Implement `toApiProblem` and the filter. `type` is `https://errors.workout-api.local/<code in kebab case>`, `instance` is the request path, and every body carries `requestId`. The filter always sets `Content-Type: application/problem+json` and sets the problem's `headers` on the response.

  | What happened | Answer |
  |---|---|
  | `ApiProblem` | its own status, code and headers |
  | body-parser `entity.parse.failed` | 400 `MALFORMED_JSON` |
  | body-parser `entity.too.large` | 413 `PAYLOAD_TOO_LARGE` |
  | pg connection failure (`ECONNREFUSED`, SQLSTATE class `08`, `57P01`), read through `driverErrorCode` | 503 `SERVICE_UNAVAILABLE` |
  | any other Nest `HttpException` (terminus's 503, the 404 of an unknown route, Nest's own 401) | its own status, with the §9.6 code for that status: 400 `VALIDATION_ERROR`, 401 `UNAUTHORIZED`, 404 `NOT_FOUND`, 413 `PAYLOAD_TOO_LARGE`, 415 `UNSUPPORTED_MEDIA_TYPE`, 503 `SERVICE_UNAVAILABLE`. A status with no §9.6 code is logged and answered as 500 `INTERNAL_ERROR` |
  | anything else | 500 `INTERNAL_ERROR`, logged with `requestId`, with no internals in the body |

  `configureApp` adds, in this order:
  - `express.json({ limit: BODY_LIMIT, type: 'application/json' })`, the only body parser (Task 10a adds the 415 for other media types). If an error from this parser does not reach the Nest filter, add a four-argument Express error handler right after it that answers with `toApiProblem`, and record it in the AI log;
  - `helmet()`, with `upgrade-insecure-requests` removed from its Content Security Policy, because compose serves plain HTTP and the Swagger UI must load from `http://127.0.0.1` or a LAN address;
  - `new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, stopAtFirstError: true, transform: true, transformOptions: { enableImplicitConversion: false }, exceptionFactory: e => validationProblem(toFieldErrors(e)) })`;
  - the filter;
  - Swagger: a `DocumentBuilder` document mounted with `SwaggerModule.setup('docs', app, document)`. It is the last item on the cut list, but mounting it here costs minutes and lets Task 18 check every route in it.
- [ ] **Step 6: Write the failing integration tests** in `test/errors.int-spec.ts` and `test/docs.int-spec.ts`. They use `probe.controller.ts`, a test-only `POST /v1/probe` with a DTO `{ n: number; note?: string }` (`n` is `@IsInt() @Min(1)`) that echoes the body, and a `GET /v1/probe/boom` that throws a `TypeError`:

```ts
it('unknown route → 404 application/problem+json, code NOT_FOUND, requestId', ...);
it('malformed JSON → 400 MALFORMED_JSON', ...);
it('a 200 KB body is accepted', ...);                 // { n: 1, note: 'x'.repeat(200_000) } → 200: Nest's 100 kb parser is off
it('a body over 1 MB → 413 PAYLOAD_TOO_LARGE', ...);
it('{ "n": "x" } → 400 VALIDATION_ERROR with exactly one error, path "n"', ...);   // fails IsInt and Min
it('an unexpected throw → 500 INTERNAL_ERROR with no stack in the body', ...);
it('echoes x-request-id and reports it as requestId', ...);
// docs.int-spec.ts
it('GET /docs-json → 200 with an openapi version; GET /docs → 200 text/html', ...);
```

- [ ] **Step 7:** Run `npm test && npm run test:int -- test/errors.int-spec.ts test/docs.int-spec.ts`. Expected: PASS.
- [ ] **Step 8:** Commit: `feat: config schema, limits, logger redaction, problem details, OpenAPI`.

### Task 3: Database module, first migration, `migrate` step (slice 3a)

**Files:**
- Create: `src/database/tokens.ts`, `src/database/database.module.ts`, `src/database/schema.ts`, `src/database/sql.ts`, `src/database/describe-url.ts`, `drizzle.config.ts`, `src/database/migrator.ts`, `src/database/locks.ts`, `src/cli/migrate.ts`, `test/support/database.ts`
- Create with `npx drizzle-kit generate --custom --name=workouts`: `src/database/migrations/0000_workouts.sql`, plus its meta journal
- Modify: `src/health/health.controller.ts` (uses `PG_POOL`), `test/support/global-setup.ts` (runs the migrations), `test/support/setup-int.ts` (adds `beforeAll(resetDatabase)`), `nest-cli.json` (assets: `database/migrations/**/*`)
- Test: `src/database/describe-url.spec.ts`, `test/migrate.int-spec.ts`, `test/database.int-spec.ts`, `test/health.int-spec.ts`

**Interfaces:**
- Consumes: `MigrateEnv`, `validateMigrateEnv` (Task 2).
- Produces:
  - Tokens: `PG_POOL`, a `pg.Pool` with `max: DB_POOL_MAX` and `statement_timeout: DB_STATEMENT_TIMEOUT_MS`; and `DB`, a `NodePgDatabase<typeof schema>`.
  - `type Executor`, in `src/database/tokens.ts`: the database or a transaction, so a repository method can run inside either.
  - `runMigrations(client: PoolClient): Promise<void>`. Its migrations folder resolves next to the compiled file: `dist/database/migrations` in the build, `src/database/migrations` under ts-jest.
  - `runMigrateStep(env: MigrateEnv, opts?: { seedPath?: string }): Promise<void>`: one client, `pg_advisory_lock(MIGRATE_LOCK)`, then the migrations, then (from Task 8) the seed, unlocking in `finally`. It runs without a statement timeout.
  - `main()` exits 1 with one log line on failure.
  - `MIGRATE_LOCK = 4242001` and `CATALOG_WRITE_LOCK = 4242002`, in `src/database/locks.ts`.
  - In `src/database/sql.ts`:
    - `pgArray(values: readonly string[], type: 'text' | 'uuid'): SQL`, the whole array as one bound parameter with a cast, for `= ANY(…)`. A JavaScript array put straight into a Drizzle `sql` template becomes a list of parameters, `($1, $2, …)`;
    - `toDate(value: Date | string): Date`, for a `timestamptz` read through `db.execute(sql…)`, which may arrive as text.
  - `describeDatabaseUrl(url: string): string`, which gives `host:port/database`, for the startup line. It reads the URL with the built-in `URL` class.
  - In `test/support/database.ts`:
    - `resetDatabase(): Promise<void>` truncates `workout_sets` and `workout_entries`. `setup-int.ts` calls it in `beforeAll`, so every integration file starts clean;
    - `createEmptyDatabase(): Promise<string>` runs `CREATE DATABASE` with a new name on the test container and returns its URL.

- [ ] **Step 1: Write the failing tests:**

```ts
// migrate.int-spec.ts — the two step tests run on createEmptyDatabase(), never on the shared database
it('creates workout_entries with the §5 checks', ...);   // utc_offset_minutes 841, a 101-character exercise_key, user_id '' → each 23514
it('creates both indexes as §5 defines them', ...);      // pg_indexes.indexdef: 'INCLUDE (exercise_key)' and '(user_id, exercise_key, performed_at DESC, id DESC)'
it('runs twice on an empty database without error', ...);
it('two migrate steps at once on an empty database both succeed', ...);   // Promise.all([runMigrateStep(env), runMigrateStep(env)]); fails without the lock
it('the test database session zone is America/Los_Angeles', ...);  // SHOW timezone
// database.int-spec.ts
it('pgArray binds one array parameter', ...);            // 'b' = ANY(pgArray(['a', 'b'], 'text')) is true; a uuid[] case too
it('toDate reads a timestamptz from db.execute as the stored instant', ...);   // under the America/Los_Angeles session zone
// health.int-spec.ts
it('/health/ready with an unreachable database → 503 application/problem+json, SERVICE_UNAVAILABLE', ...);   // PG_POOL overridden with a pool to 127.0.0.1:1
// describe-url.spec.ts
it("describes 'postgres://workout:secret@postgres:5432/workout' as 'postgres:5432/workout'", ...);
```

- [ ] **Step 2:** Run `npm run test:int -- test/migrate.int-spec.ts test/database.int-spec.ts test/health.int-spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Write `0000_workouts.sql`: `workout_entries`, `workout_sets` and the two indexes, exactly as in §5, including the `exercise_key` `CHECK (char_length(exercise_key) BETWEEN 1 AND 100)` and the `uuidv7()` default. Mirror the columns in `schema.ts`, for types only.
- [ ] **Step 4:** Implement `runMigrations` (Drizzle's programmatic migrator, on a `drizzle(client)` over the client holding the lock), `runMigrateStep`, `main()`, the two helpers and the module. Lifecycle (§13):
  - `main.ts` calls `app.enableShutdownHooks()`;
  - the module ends the pool in `onModuleDestroy`;
  - the startup line prints `describeDatabaseUrl`, never the URL.
- [ ] **Step 5:** Run `npm test && npm run test:int`. Expected: PASS.
- [ ] **Step 6:** Commit: `feat: database module, first migration, migrate step`.

### Task 4: Docker, Compose, clean-image check (slice 3b)

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `.env.example`, `scripts/clean-image-check.sh`
- Modify: `.github/workflows/ci.yml` (a `clean-image` job after `test:int`)

**Interfaces:**
- Produces:
  - Dockerfile stages `build` (all dependencies, `npm run build`; Task 12's `bench` service targets it), `deps` (production dependencies only) and `runtime`.
  - Compose services `postgres`, `migrate` and `api` (Task 12 adds `bench`), and a YAML anchor `x-db-env` that holds `DATABASE_URL: postgres://${POSTGRES_USER:-workout}:${POSTGRES_PASSWORD:-workout}@postgres:5432/${POSTGRES_DB:-workout}`.

- [ ] **Step 1:** Write `scripts/clean-image-check.sh`:
  1. `docker compose down -v`, then `docker compose up -d --build`, with no bind mounts and no `bench` profile.
  2. Wait for `http://127.0.0.1:${API_PORT:-3000}/health/ready` to answer 200 with curl's own retry, not a hand-written loop: `curl -fsS --retry 30 --retry-delay 3 --retry-all-errors …` (about 90 s).
  3. Assert `docker compose run --rm --no-deps api sh -c 'test ! -e .env'`.
  4. Assert `docker compose run --rm --no-deps api sh -c 'test ! -e node_modules/typescript'`: the image holds no development dependency, so the `migrate` step that just ran used none (§14, slice 3).
  5. `docker compose down -v`.

  Exit non-zero on any failure.
- [ ] **Step 2:** Run `bash scripts/clean-image-check.sh`. Expected: FAIL (no Dockerfile).
- [ ] **Step 3:** Write the `Dockerfile` (§13):
  - `FROM node:26-alpine AS build`: `npm ci`, then `npm run build`;
  - `FROM node:26-alpine AS deps`: `npm ci --omit=dev`;
  - `FROM node:26-alpine AS runtime`: `package.json`, `node_modules` from `deps` and `dist` from `build`; `USER node`; `HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:3000/health/live').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"`; `CMD ["node", "dist/main.js"]`.

  No `ENV` line carries a secret.
- [ ] **Step 4:** Write `.dockerignore`: `node_modules`, `dist`, `.git`, `.env`, `coverage`, `planning`, `bench/out`.
- [ ] **Step 5:** Write `docker-compose.yml`:
  - `postgres` (`postgres:18-alpine`): `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` default to `workout`, with a `pg_isready` healthcheck, volume `pgdata:/var/lib/postgresql`, and port `127.0.0.1:${DB_HOST_PORT:-55432}:5432`.
  - `migrate`: the runtime image, `command: ["node", "dist/cli/migrate.js"]`.
  - `api`: `restart: on-failure`, ports `${API_PORT:-3000}:3000`.

  The dependencies use the long form, which is the one that takes a condition:

```yaml
  migrate:
    depends_on:
      postgres:
        condition: service_healthy
  api:
    depends_on:
      migrate:
        condition: service_completed_successfully
```

  `.env.example` lists every variable of the §13 table with its default and a comment, and leaves `ADMIN_API_TOKEN` empty.
- [ ] **Step 6:** Run `bash scripts/clean-image-check.sh`. Expected: PASS. Add it to CI as the `clean-image` job.
- [ ] **Step 7:** Commit: `build: Dockerfile, compose, clean-image check`.

### Task 5: Units (slice 4 · §16 "4–5": 2.85 h with Tasks 6–7)

**Files:**
- Create: `src/units/weight-units.ts`, `src/units/unit-registry.ts`, `src/units/units.module.ts`, `src/units/units.controller.ts`, `src/common/decimal.ts`
- Test: `src/units/unit-registry.spec.ts`, `src/common/decimal.spec.ts`, `test/units.int-spec.ts`

**Interfaces:**
- Consumes: `MAX_WEIGHT`, `WEIGHT_KG_INTEGER_DIGITS` (Task 2).
- Produces:
  - Units:
    - `WEIGHT_UNITS`, verbatim from §6 (stone stays commented out);
    - `type UnitCode` derived from it;
    - `type WeightUnit = { code: string; label: string; kgPerUnit: string; aliases: readonly string[] }`;
    - token `UNIT_REGISTRY`.
  - `class UnitRegistry`, with `constructor(units: readonly WeightUnit[] = WEIGHT_UNITS)` and:
    - `resolve(input: string): UnitCode | null`: trim, lower-case, then match the code or an alias;
    - `codes(): UnitCode[]`;
    - `toKg(weight: Decimal, code: UnitCode): Decimal`, exact;
    - `fromKg(kg: Decimal, code: UnitCode): Decimal`;
    - `describe(): string`, which gives `"kg (kgs), lb (lbs)"`;
    - `list(): { code: UnitCode; label: string; aliases: readonly string[] }[]`.
  - In `src/common/decimal.ts`:
    - `D`, a Decimal configured with `precision: 40`;
    - `decimalFromNumber(n: number): Decimal`, which is `new D(String(n))`;
    - `decimalPlaces(n: number): number`, read on the number's shortest text, exponent notation included (`String(1e-7)` is `"1e-7"`), for example with `new D(String(n)).decimalPlaces()`;
    - `display(d: Decimal): number`, half-up to 2 decimals.

- [ ] **Step 1: Write the failing tests** (§12, the Units row):

```ts
it('converts 225 lb to exactly 102.05828325 kg', () =>
  expect(reg.toKg(decimalFromNumber(225), 'lb').toString()).toBe('102.05828325'));
it.each([['lbs','lb'], ['LB','lb'], ['Kg','kg'], ['kgs','kg']])('resolves %s to %s', ...);
it('returns null for stone', ...);
it('round-trips a unit registered only in the test (X1)', ...);  // add { code:'st', kgPerUnit:'6.35029318', aliases:['stone'] }; its code comes from resolve('stone'), so no cast: 10 st → kg → st is '10'
it('has no factor with more than eight decimals', ...);
it('fits MAX_WEIGHT in every unit into numeric(17,11)', ...);    // integer digits of 10 000 × factor ≤ WEIGHT_KG_INTEGER_DIGITS
it('displays 100.125 as 100.13 (half-up)', ...);
it.each([[100.125, 3], [10.1234, 4], [1e-7, 7], [225, 0]])('decimalPlaces(%p) is %i', ...);
it('uses decimal precision 40', () => expect(D.precision).toBe(40));
// test/units.int-spec.ts
it('GET /v1/units lists kg and lb with their aliases', ...);     // { data: [{ code:'kg', label:'Kilogram', aliases:['kgs'] }, { code:'lb', label:'Pound', aliases:['lbs'] }] }
```

- [ ] **Step 2:** Run `npm test -- src/units src/common/decimal.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the registry, the decimal helpers and `GET /v1/units`.
- [ ] **Step 4:** Run `npm test && npm run test:int -- test/units.int-spec.ts`. Expected: PASS.
- [ ] **Step 5 (fast-check, the first item on the cut list):** Add `it('kg → unit → kg stays within display rounding for generated weights')`. Use weights 0–10 000 with at most 3 decimals, in every registered unit.
- [ ] **Step 6:** Commit: `feat: unit registry with exact kilograms`.

### Task 6: Dates and the clock (slice 5a)

**Files:**
- Create: `src/common/clock.ts`, `src/workouts/domain/dates.ts`
- Test: `src/workouts/domain/dates.spec.ts`

**Interfaces:**
- Consumes: `Check`, `FieldError`, `FUTURE_TOLERANCE_MS`, `EARLIEST_INSTANT` (Task 2).
- Produces:
  - The clock: `interface Clock { now(): Temporal.Instant }`, token `CLOCK`, `systemClock`, and `fixedClock(iso: string): Clock`.
  - Parsing:
    - `parseWriteDate(raw: unknown, path: string, now: Temporal.Instant): Check<{ performedAt: Date; utcOffsetMinutes: number | null }>`;
    - `parseReadBound(raw: unknown, path: string, bound: 'from' | 'to'): Check<Date>`. `bound` picks the date-alone message: a `from` bound and a `to` bound need different advice (§8);
    - `repairOffsetPlus(raw: string): string`;
    - `checkRange(from: Date | undefined, to: Date | undefined, fromPath: string, toPath: string): FieldError[]`.
  - Offsets:
    - `readOffsetMinutes(text: string): number | null` (`Z` and `-00:00` give `null`);
    - `formatUtcOffset(minutes: number | null): string | null`.

- [ ] **Step 1: Write the failing tests** (§12, the Dates row). Each row is one case of an `it.each` table. Use `const now = Temporal.Instant.from('2025-02-11T03:00:00Z')`.

```ts
// every row of the §8 table:
['2025-02-10T05:30:00+07:00', '2025-02-09T22:30:00.000Z', 420],
['2025-02-10T12:30:00Z', '2025-02-10T12:30:00.000Z', null],
['2025-02-10T12:30:00+00:00', '2025-02-10T12:30:00.000Z', 0],
['2025-02-10T12:30:00.123456Z', '2025-02-10T12:30:00.123Z', null],
['2025-02-10T06:30:00+07:00[Asia/Ho_Chi_Minh]', '2025-02-09T23:30:00.000Z', 420],
['1950-06-01T10:00:00.1239Z', '1950-06-01T10:00:00.123Z', null],       // cut toward the past before 1970 too
// offsets read from the text: -07:00 → -420, +05:45 → 345, -00:00 → null
// accepted variants: '2025-02-10 05:30:00+07:00', '2025-02-10t05:30:00z', '…+07', '…+0700',
//   and the compact '20250210T053000Z' → '2025-02-10T05:30:00.000Z'
// a leap second, '2016-12-31T23:59:60Z', is read as '2016-12-31T23:59:59.000Z'
// 400s, each with its path:
//   '2025-02-10' → exactly the date-alone message of §8
//   '2025-02-10T06:30:00' and '2025-02-10 06:30:00' (Python's str(datetime)) → exactly the no-offset message of §8, not the date-alone one
//   '+15:00', '+07:00:30', '2025-02-30T09:00:00Z', '2025-02-29T09:00:00Z', 1739165400000 (a number)
// '2024-02-29T09:00:00Z' is accepted
// bounds: now + 15 min passes, + 15 min 1 ms fails (the message shows the server time and names a local time sent with Z);
//         '1900-01-01T00:00:00Z' passes, one millisecond earlier fails
// read bounds: '…00:00:00.1231Z' rounds up to '.124Z';
//   '2025-02-28' as a to bound → exactly the §8 to message ("…send the start of the next day, for example 2025-03-01T00:00:00+07:00");
//   '2025-02-01' as a from bound → exactly the §8 from message ("…send the start of that day, for example 2025-02-01T00:00:00+07:00")
// checkRange: from equal to to after rounding → one error on fromPath; from after to → one error on fromPath
// repairOffsetPlus: '2025-02-01T00:00:00 07:00', '… 0700', '… 07', '2025-02-01 00:00:00 07:00' → '+' restored;
//   '…Z' and '2025-02-01 07:00' (a space for T and no offset) unchanged
// formatUtcOffset: 420 → '+07:00', -420 → '-07:00', 345 → '+05:45', 0 → '+00:00', null → null
```

- [ ] **Step 2:** Run `npm test -- src/workouts/domain/dates.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement with one parser, `Temporal.Instant.from` (§8):
  - When it throws, tell the cases apart by the text, in order:
    1. A text shaped like a date alone (after trimming, `^\d{4}-\d{2}-\d{2}$` or `^\d{8}$`) is a date alone.
    2. `Temporal.PlainDateTime.from` succeeding means no offset.
    3. Anything else is "not an RFC 3339 date-time".

    Do not use `Temporal.PlainDate.from` to find a date alone: it also accepts `2025-02-10 06:30:00`.
  - Read the offset from the text with an anchored pattern of `[zZ]` or `[+-]hh(:?mm)?`, optionally followed by `[…]` brackets. Refuse anything outside −720…840 minutes, or with seconds.
  - Writes cut with `instant.round({ smallestUnit: 'millisecond', roundingMode: 'floor' })`, and read bounds round with `'ceil'`. Never divide `epochNanoseconds`: that rounds toward zero, which goes the wrong way before 1970.
- [ ] **Step 4:** Run `npm test -- src/workouts/domain/dates.spec.ts`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: date parsing, bounds and offsets`.

### Task 7: Metrics, key functions, name rules, cursor codec (slice 5b)

**Files:**
- Create: `src/workouts/domain/metrics.ts`, `src/exercises/exercise-key.ts`, `src/exercises/name-rules.ts`, `src/common/cursor.ts`
- Test: `src/workouts/domain/metrics.spec.ts`, `src/exercises/exercise-key.golden.spec.ts`, `src/exercises/name-rules.spec.ts`, `src/common/cursor.spec.ts`

**Interfaces:**
- Consumes: `UnitRegistry`, `D`, `display`, `decimalFromNumber` (Task 5); `Check` (Task 2).
- Produces:
  - Metrics:
    - `type KgSet = { reps: number; weightKg: Decimal }`;
    - `type CandidateSet = KgSet & { entryId: string; performedAt: Date; setNumber: number }`;
    - `type PrMetric = 'weight' | 'volume' | 'e1rm'`;
    - `volumeKg(s: KgSet): Decimal` and `e1rmKg(s: KgSet): Decimal`, which is `weightKg × (30 + reps) / 30`;
    - `rank(m: PrMetric, s: KgSet): Decimal`, which is `weightKg`, `weightKg × reps` or `weightKg × (30 + reps)`;
    - `pickRecord(m: PrMetric, sets: CandidateSet[]): CandidateSet | null`: highest rank, then earliest `performedAt`, then lowest `entryId` (string order, UUIDv7), then lowest `setNumber`.
  - Keys:
    - `exerciseKey(name: string): string` and `muscleGroupName(name: string): string`: NFKC → trim → collapse `/\s+/` to one space → lower-case;
    - `codePointLength(s: string): number`;
    - `collapseWhitespace(s: string): string`.
  - Name rules:
    - `checkExerciseName(raw: unknown, path: string): Check<{ name: string; key: string }>`. `name` is the trimmed input. The trimmed name must be 1–100 code points and its key 1–100 code points; a long key's message says how long the name becomes once normalised (§10.1).
    - `checkMuscleGroupName(raw: unknown, path: string): Check<string>`: normalised, then 1–40 code points matching `/^[\p{L}\p{N} -]+$/u`.
  - Cursors:
    - `encodeCursor(c: { at: Date; id: string }): string`, base64url of `{"v":1,"at":"<ISO with milliseconds>","id":"<uuid>"}`;
    - `decodeCursor(raw: string): { at: Date; id: string } | null`. It decodes with `Buffer.from(raw, 'base64url')`, checks the parsed value with lodash `isPlainObject`, the id with `uuid`'s `validate` and the date with `Temporal.Instant.from`.

- [ ] **Step 1: Write the failing tests:**

```ts
// metrics.spec.ts (§12, the Metrics row; §7)
it.each([[1, 103.33], [2, 106.67], [10, 133.33], [30, 200]])('Epley 100 kg × %i → %p', ...);  // display(e1rmKg) returns a number
it('100 kg × 1 beats 96 kg × 2 (103.33 vs 102.40)', ...);
it('a zero-weight set ranks 0 and can still be the record', ...);
it('ties go to the earliest instant, then the lowest id, then the lowest set number', ...);
it('100 lb × 10, then 200 lb × 5 later: the first keeps the volume record', ...);   // exact kg through UnitRegistry
it('200 lb × 5, then 175 lb × 10 later: the first keeps the estimated-1RM record', ...);
// exercise-key.golden.spec.ts: header comment "Changing an expected value needs a migration of stored keys (§10.1)."
// about twenty pinned pairs, including:
['  ZERCHER   squat ', 'zercher squat'], ['Bench Press', 'bench press'], ['Dumbbell ﬂy', 'dumbbell fly'],
['Ｂｅｎｃｈ', 'bench'], ['Développé couché', 'développé couché'],
['Leg Press\t', 'leg press'], ['90/90 Hip Stretch', '90/90 hip stretch'],
// plus the same kind of table for muscleGroupName
// name-rules.spec.ts (§10.1; V-21)
it('refuses 100 × U+FDFA (a key of 1 800) with the field named', ...);
it('refuses 100 × İ (a key of 200)', ...);
it('accepts a 100-character ASCII name; refuses 101 characters and "   "', ...);
it('refuses a group of three U+FDFA (54 once normalised) and "chest!"; accepts "Rear-Delts 2" as "rear-delts 2"', ...);
// cursor.spec.ts
it('round-trips { at, id }; garbage, bad JSON, v:2, a bad date or a non-uuid id → null', ...);
```

- [ ] **Step 2:** Run `npm test -- src/workouts/domain src/exercises src/common/cursor.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the four modules with the signatures above.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: metrics, key functions, name rules, cursor codec`.

### Task 8: Catalog tables and the seed step (slice 6a · §16 "6": 2.7 h with Task 9)

**Files:**
- Create with `drizzle-kit generate --custom --name=catalog`: `src/database/migrations/0001_catalog.sql`
- Create: `seed/exercise-catalog.seed.json`, `src/exercises/catalog-seed.ts`, `src/exercises/dto/seed-file.dto.ts`
- Modify: `src/database/schema.ts`, `src/cli/migrate.ts`, `Dockerfile` (`COPY seed ./seed` in the `runtime` stage), `scripts/clean-image-check.sh`, `test/support/database.ts`
- Test: `src/exercises/catalog-seed.spec.ts`, `test/seed.int-spec.ts`

**Interfaces:**
- Consumes: `checkExerciseName`, `checkMuscleGroupName` (Task 7); `CATALOG_WRITE_LOCK`, `runMigrateStep`, `createEmptyDatabase` (Task 3).
- Produces:
  - `DEFAULT_SEED_PATH`, resolved two folders above the compiled `catalog-seed` file, which is the application root from both `src/exercises` and `dist/exercises`. The seed is not a Nest asset: it lies outside `src/`, and the image gets it from the `COPY`.
  - `type SeedFile = { muscleGroups: string[]; exercises: { name: string; key: string; muscleGroups: string[] }[] }`, holding normalised values.
  - `validateSeedFile(json: unknown): Check<SeedFile>`. class-validator checks the file's shape against `SeedFileDto` (nested item DTOs, paths through `toFieldErrors`); then the function applies the admin routes' field rules, refuses duplicate keys, a group that isn't in the file's list and more than `MAX_GROUPS_PER_EXERCISE` groups, and names the item (`exercises[3].name`).
  - `planSeed(file: SeedFile, ledger: { exercises: ReadonlySet<string>; groups: ReadonlySet<string> }, existingGroups: ReadonlySet<string>): SeedPlan`, a pure function, where `SeedPlan = { groups: string[]; exercises: SeedFile['exercises']; warnings: string[] }`.
  - `runSeed(client: PoolClient, file: SeedFile, log: (line: string) => void): Promise<void>`.
  - `runMigrateStep(env, opts)` now seeds from `opts.seedPath ?? DEFAULT_SEED_PATH`.
  - `resetDatabase()` now also truncates the catalog tables and the ledger, then calls `runSeed` with the real file.

- [ ] **Step 1: Write the failing tests:**

```ts
// catalog-seed.spec.ts (§12, the Catalog unit row; §10.3 table)
it('first run: every group and exercise', ...);
it('re-run with a full ledger: an empty plan', ...);
it('a new file item: only that item', ...);
it('an item in the ledger that no longer exists (deleted by an admin) is not planned', ...);
it('an exercise whose group was deleted: inserted with the rest, with a warning; with no group left, skipped and not recorded', ...);
it.each(['duplicate keys', 'a group not in muscleGroups', 'a malformed item', 'a 101-character name', 'a group of three U+FDFA'])(
  'validateSeedFile refuses %s, naming the item', ...);
// test/seed.int-spec.ts
it('the seed run twice leaves no duplicates', ...);
it('a deleted seeded exercise stays deleted on the next run', ...);
it('an exercise an admin created before the file added it keeps the admin\'s groups', ...);
it('a seed file with a 101-character name fails the migrate step on an empty database, naming exercises[0].name, and leaves it empty', ...);
// runMigrateStep(env for createEmptyDatabase(), { seedPath: badFile }) rejects; to_regclass('workout_entries') is null
```

- [ ] **Step 2:** Run `npm test -- src/exercises/catalog-seed.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Write `0001_catalog.sql` exactly as the §5 catalog tables. The group's foreign key has no `ON DELETE` clause, so it gets the default `NO ACTION` and answers `23503` (V-20). Mirror the tables in `schema.ts`.
- [ ] **Step 4:** Implement `validateSeedFile`, `planSeed` and `runSeed`. `runSeed` is one transaction:
  1. `SELECT pg_advisory_xact_lock(CATALOG_WRITE_LOCK)`;
  2. read the ledger and the existing groups, and plan;
  3. insert groups `ON CONFLICT DO NOTHING`, with their ledger rows;
  4. insert each exercise with `INSERT … ON CONFLICT DO NOTHING RETURNING`, writing its links only when a row came back. Each link carries `position`, the group's index in the item's list;
  5. write a ledger row for every planned item;
  6. log one line per warning.

  `runMigrateStep` reads and validates the seed **file** before it takes any lock or runs a migration, so an invalid file fails with the item paths and nothing written. Reading the ledger and planning happen inside the seed's transaction, after its lock (§10.3).

  `planSeed` does not see the existing exercise keys. An exercise an admin created before the file added it is handled by step 4: no row comes back, so no links are written. That is how §12's "an exercise an admin created first (no links written)" is met.
- [ ] **Step 5:** Write the seed file: the groups, and a realistic set of about 60–100 common lifts, including `{ "name": "Bench Press", "muscleGroups": ["chest", "shoulders", "triceps"] }` and `{ "name": "Deadlift", "muscleGroups": ["back", "glutes", "hamstrings"] }`. The examples and the clean-image check rely on those two. Add `COPY seed ./seed` to the `runtime` stage, and add `docker compose run --rm --no-deps api test -f seed/exercise-catalog.seed.json` to the clean-image check.
- [ ] **Step 6:** Run `npm test && npm run test:int && bash scripts/clean-image-check.sh`. Expected: PASS.
- [ ] **Step 7:** Commit: `feat: catalog tables and the once-per-item seed`.

### Task 9: Catalog snapshot, refresh, public read routes (slice 6b)

**Files:**
- Create: `src/exercises/catalog-snapshot.ts`, `src/exercises/exercise-catalog.ts`, `src/exercises/catalog-loader.ts`, `src/exercises/database-catalog.ts`, `src/exercises/catalog.repository.ts`, `src/exercises/exercises.controller.ts`, `src/exercises/exercises.module.ts`
- Modify: `src/app.module.ts`, `scripts/clean-image-check.sh`
- Test: `src/exercises/catalog-snapshot.spec.ts`, `src/exercises/database-catalog.spec.ts`, `test/catalog-read.int-spec.ts`

**Interfaces:**
- Consumes: `exerciseKey`, `muscleGroupName` (Task 7); `ApiEnv.CATALOG_REFRESH_SECONDS` (Task 2).
- Produces:
  - Types:
    - `type CatalogExercise = { key: string; name: string; muscleGroups: readonly string[] }`;
    - `type CatalogRows = { exercises: CatalogExercise[]; groups: string[] }`.
  - `class CatalogSnapshot`, with constructor `(rows: CatalogRows, readonly loadNumber: number)` and:
    - `muscleGroupsFor(key: string): readonly string[]`, which is `[]` for an unknown key;
    - `keysForMuscleGroup(group: string): readonly string[]`;
    - `knownMuscleGroups(): readonly string[]`, sorted;
    - `hasMuscleGroup(group: string): boolean`;
    - `list(): readonly CatalogExercise[]`.
  - The port: `interface ExerciseCatalog { snapshot(): CatalogSnapshot; refresh(): Promise<void> }` and token `EXERCISE_CATALOG`.
  - `interface CatalogLoader { load(): Promise<CatalogRows> }`. `PgCatalogLoader` loads in one statement (the V-20 shape: groups in `position` order, every group listed).
  - `class DatabaseExerciseCatalog implements ExerciseCatalog, OnModuleInit, OnModuleDestroy`:
    - constructor `(loader: CatalogLoader, options: { refreshMs: number; retryAfterFailureMs: number; bootDeadlineMs: number }, logger: Logger)`;
    - Nest wiring passes `refreshMs = CATALOG_REFRESH_SECONDS × 1000`, `retryAfterFailureMs = 10_000` and `bootDeadlineMs = 10_000`.
  - `CatalogRepository`, which reads the tables on every request, never the snapshot (§10.4):
    - `type CatalogExerciseRow = CatalogExercise & { createdAt: Date; updatedAt: Date }`;
    - `listExercises(): Promise<CatalogExerciseRow[]>`, ordered by key;
    - `findExercise(key: string): Promise<CatalogExerciseRow | null>`;
    - `listMuscleGroups(): Promise<{ name: string; exerciseCount: number }[]>`, ordered by name.

- [ ] **Step 1: Write the failing unit tests:**

```ts
// catalog-snapshot.spec.ts
it('an unknown key has no groups; a group no exercise uses is still known', ...);
// database-catalog.spec.ts (fake timers, fake loader)
it('a failing refresh keeps the last snapshot, retries once after 10 s, then waits the interval', ...);
it('a refresh asked for during a load runs after it', ...);
it('an older load never replaces a newer snapshot', ...);
it('boot gives up after the deadline and throws', ...);
it('onModuleDestroy stops the timer', ...);
```

- [ ] **Step 2:** Run `npm test -- src/exercises`. Expected: FAIL.
- [ ] **Step 3:** Implement the snapshot, the loader and the adapter (§10.2):
  - `onModuleInit` keeps loading until it succeeds or the boot deadline passes, then schedules a `setTimeout` chain, each next load scheduled when the last one ends.
  - Refreshes run one at a time. A refresh asked for during a load waits for it, then starts its own.
  - Loads are numbered, and a finished load replaces the snapshot only if its number is higher.
  - On failure the adapter keeps serving, logs a warning with the snapshot's age, retries once after `retryAfterFailureMs`, then goes back to the interval.

  The adapter is written by hand (D-28): no scheduling or retry package models these four rules together, and the fake-timer tests pin them.
- [ ] **Step 4: Write the failing integration tests:**

```ts
it('GET /v1/exercises lists bench press with chest, shoulders, triceps in that order, with createdAt and updatedAt, ordered by key', ...);
it('/v1/exercises/Bench%20Press and /v1/exercises/bench%20press are the same resource; unknown → 404', ...);
it('GET /v1/muscle-groups returns { name, exerciseCount }, ordered by name', ...);
it('an exercise and a group inserted by SQL appear on both list routes without a refresh()', ...);
it('init resolves only after the first load (U-19)', ...);   // slow loader: snapshot() is usable as soon as init resolves
it('a second catalog instance sees a group inserted by SQL after refresh()', ...);
```

- [ ] **Step 5:** Implement the repository and the three routes. Add `curl -fsS http://127.0.0.1:${API_PORT:-3000}/v1/exercises/bench%20press` to the clean-image check.
- [ ] **Step 6:** Run `npm test && npm run test:int && bash scripts/clean-image-check.sh`. Expected: PASS.
- [ ] **Step 7:** Commit: `feat: catalog snapshot with refresh, public catalog routes`.

### Task 10a: Request rules and reading an entry (slice 7 · §16 "7–8": 3.05 h with Tasks 10b and 11)

Before writing the middleware, find out what Nest 12 does by default (its own parsers on) with a form-encoded body and with an array where an object is expected, and record it in the AI log (§14, slice 7; U-9). `bodyParser: false` (Task 1) already keeps Nest's form parser off.

**Files:**
- Create: `src/common/json-only.middleware.ts`, `src/common/user-id.pipe.ts`, `src/common/query-dto.ts`, `src/units/is-supported-unit.ts`, `src/workouts/dto/entry-input.dto.ts`, `src/workouts/entry-input.ts`
- Modify: `src/app.setup.ts` (registers `requireJson`), `src/common/validation.ts` (the two query messages)
- Test: `src/common/user-id.pipe.spec.ts`, `src/common/query-dto.spec.ts`, `src/workouts/entry-input.spec.ts`, `test/errors.int-spec.ts`

**Interfaces:**
- Consumes: `parseWriteDate` (Task 6); `checkExerciseName` (Task 7); `UnitRegistry`, `decimalPlaces` (Task 5); `toFieldErrors`, `validationProblem`, `ApiProblem`, `Check`, `FieldError` and the limits (Task 2).
- Produces:
  - `requireJson`: a POST, PUT or PATCH whose body is not JSON gets 415 `UNSUPPORTED_MEDIA_TYPE` with detail "Send Content-Type: application/json". It asks Express with `req.is('application/json')`, which ignores parameters such as `charset` and answers `null` when there is no body; a request with no body passes on to the shape check. It is registered before the JSON parser.
  - `UserIdPipe`: a path `userId` that fails `USER_ID_PATTERN` is a 400 on path `userId`. Every `:userId` route uses it (Tasks 10b, 11 and 13–15).
  - Query parameters are DTOs, checked by the global `ValidationPipe` as bodies are (D-05, D-28):
    - `abstract class QueryDto` in `src/common/query-dto.ts`. Every query DTO extends it: `EntryQueryDto` (Task 10b), `HistoryQueryDto` (Task 13), `RecordsQueryDto` (Task 14) and `CompareQueryDto` (Task 15).
    - class-validator owns the rules: an unknown parameter (`forbidNonWhitelisted`), a parameter sent twice (it arrives as an array and fails `@IsString()`), an empty value (`@IsNotEmpty()`), numbers (`@Type(() => Number)` with `@IsInt()`, `@Min()` and `@Max()`), a required one (`@IsDefined()`) and `unit` (`@IsSupportedUnit()`).
    - `toFieldErrors` words two of them as §9 says, when the target is a `QueryDto`. An unknown parameter: `Unknown query parameter '<name>'. Accepted parameters: <the DTO's properties, comma-separated>.`, with the names read from class-validator's metadata for the DTO class (`getMetadataStorage()`), so the list cannot drift from the decorators. An array where a string is expected: `'<name>' was sent more than once; send it once.`
    - `IsSupportedUnit()`, a class-validator decorator backed by the shared `UnitRegistry` instance that `UNIT_REGISTRY` provides; its message is the unknown-unit message below.
  - DTO classes, used for class-validator rules and OpenAPI: `SetInputDto`, `EntryInputDto`, `BulkInputDto` (§9.1 rules).
  - The `date` OpenAPI text says the value is an instant (RFC 3339, some ISO 8601 variants tolerated) whose first ten characters are not a local date. The `utcOffset` text says it is for display only and `null` when the client sent `Z` (§9.1).
  - `readEntryInputs(body: unknown, shape: 'single' | 'bulk', pathUserId: string, deps: { units: UnitRegistry; now: Temporal.Instant }): Check<NewEntry[]>`.
  - Types:
    - `NewEntry = { id: string; userId: string; exerciseName: string; exerciseKey: string; performedAt: Date; utcOffsetMinutes: number | null; sets: NewSet[] }`;
    - `NewSet = { setNumber: number; reps: number; weight: string; unit: UnitCode; weightKg: string }`, with exact decimal strings. `setNumber` is assigned by the server, from 1 in the order sent; the request never carries it.

- [ ] **Step 1: Write the failing tests:**

```ts
// entry-input.spec.ts
it('collects every fault of one entry in one result', ...);              // bad unit + no-offset date + mismatched userId → three paths
it('runs a cross-field rule unless a field it reads failed', ...);       // §9.1
it('gives one error per path: "date": null and a 101-character name each give exactly one', ...);
it('refuses "weight": "225" and "reps": "5" at sets[0].weight and sets[0].reps', ...);   // Review Focus 1
it.each([
  ['weight 10.1234', 'sets[0].weight'], ['weight 10 000.001', 'sets[0].weight'], ['weight 1e-7', 'sets[0].weight'],
  ['reps 1 001', 'sets[0].reps'], ['reps 5.5', 'sets[0].reps'], ['51 sets', 'sets'],
])('%s → one error at %s', ...);                                          // the §9.1 caps
it('accepts weight 0 (a bodyweight set)', ...);
it.each([
  ['no body', 'single', ''], ['an array', 'single', ''], ['null', 'single', ''], ['"sets": {}', 'single', 'sets'],
  ['{ "entries": [null] }', 'bulk', 'entries[0]'], ['a bare array', 'bulk', ''],
])('%s on %s → one error at %p showing the expected shape', ...);         // Review Focus 3
it('assigns v7 ids that increase in input order', ...);
// query-dto.spec.ts — a test-only ProbeQueryDto extends QueryDto { exercise?, limit?, unit? },
// run through validate(plainToInstance(ProbeQueryDto, raw)) and toFieldErrors
it('?exerciseName=bench → one error on exerciseName listing exercise, limit, unit', ...);
it('exercise sent twice (an array) → "sent more than once" on exercise', ...);
it('exercise= → one error on exercise; limit=abc, 0 or 101 → one error on limit', ...);
it('unit=LBS passes; unit=stone → the unknown-unit message on unit', ...);
it('an unknown property on a body DTO keeps class-validator\'s own message', ...);
// user-id.pipe.spec.ts
it.each(['coach@example.com', 'user:1', 'u 1', 'x'.repeat(65), 'ü'])('refuses %p on path userId', ...);
it.each(['u_123', 'client-42.a', 'x'.repeat(64)])('accepts %p', ...);
// errors.int-spec.ts (requireJson, on the probe route)
it('a form-encoded body → 415 UNSUPPORTED_MEDIA_TYPE, detail "Send Content-Type: application/json"', ...);
it('Content-Type application/json; charset=utf-8 → accepted', ...);
```

- [ ] **Step 2:** Run `npm test -- src/workouts src/common src/units && npm run test:int -- test/errors.int-spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `readEntryInputs`:
  1. Check the body shape first, with lodash `isPlainObject` (D-28): an object for `'single'`; for `'bulk'`, an object whose `entries` is an array, and each item an object, or an error at `entries[i]`.
  2. Run class-validator on `plainToInstance` with `whitelist`, `forbidNonWhitelisted` and `stopAtFirstError`, prefixing paths with `entries[i].`.
  3. Per item, run `parseWriteDate`, `checkExerciseName`, the decimal places through `decimalPlaces`, `units.resolve` for every set and the `userId` match. The messages are:
     - an unknown unit: `Unsupported unit '<u>'. Supported units: ${units.describe()}.`;
     - a `userId` mismatch: `'<x>' does not match the userId in the path, '<path>'.`

  **Who owns which error.** The DTO owns presence, type, numeric ranges, array sizes and unknown properties. The domain checks of step 3 run only on fields with no DTO error. One error per path, so the count in `detail` is the number of fields at fault. The decimal places are a domain check: class-validator's `maxDecimalPlaces` reads `String(n)` and is not trusted with exponent notation (recalled; the `1e-7` row settles it).

  Implement `requireJson`, `UserIdPipe`, `QueryDto`, `IsSupportedUnit` and the two query messages in `toFieldErrors`, and register `requireJson` in `configureApp`.
- [ ] **Step 4:** Run `npm test && npm run test:int -- test/errors.int-spec.ts`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: request rules and reading entry input`.

### Task 10b: Log one entry (slice 7)

**Files:**
- Create: `src/workouts/dto/entry-query.dto.ts`, `src/workouts/entry-response.ts`, `src/workouts/workouts.repository.ts`, `src/workouts/workouts.service.ts`, `src/workouts/workouts.controller.ts`, `src/workouts/workouts.module.ts`, `test/support/fixtures.ts`
- Modify: `src/app.module.ts`
- Test: `src/workouts/entry-response.spec.ts`, `test/entries.int-spec.ts`, `test/first-request.int-spec.ts`

**Interfaces:**
- Consumes: `readEntryInputs`, `NewEntry`, `NewSet`, `UserIdPipe`, `QueryDto`, `IsSupportedUnit` (Task 10a); `formatUtcOffset`, `Clock`, `CLOCK` (Task 6); `UnitRegistry`, `display` (Task 5); `ExerciseCatalog`, `CatalogSnapshot` (Task 9); `DB`, `Executor` (Task 3).
- Produces:
  - `StoredEntry = Omit<NewEntry, 'sets'> & { createdAt: Date; sets: NewSet[] }`.
  - `EntryQueryDto extends QueryDto`: `unit?`, with `@IsOptional() @IsString() @IsNotEmpty() @IsSupportedUnit()`.
  - `EntryResponse`, the §9.1 `data` object: `{ id: string; userId: string; exerciseName: string; exerciseKey: string; muscleGroups: string[]; date: string; utcOffset: string | null; sets: { setNumber: number; reps: number; weight: number; unit: UnitCode; original: { weight: number; unit: UnitCode } }[]; createdAt: string }`.
  - `WorkoutsRepository`:
    - `insertEntries(entries: NewEntry[]): Promise<void>`: one transaction, two multi-row `INSERT`s;
    - `findEntry(userId: string, id: string): Promise<StoredEntry | null>`.
  - `toEntryResponse(e: StoredEntry, unit: UnitCode, snapshot: CatalogSnapshot, units: UnitRegistry): EntryResponse`. `weight` is the original number when the requested unit is the set's own unit; otherwise it is `display(fromKg)`.
  - Fixtures in `test/support/fixtures.ts`: `uniqueUserId(prefix?: string): string`, `entryBody(overrides?: Record<string, unknown>): Record<string, unknown>` (the §9.1 request), and `postEntry(app: INestApplication, userId: string, body?: unknown): Promise<request.Response>`.
  - Routes, each with `:userId` through `UserIdPipe`:
    - `POST /v1/users/:userId/workout-entries` → 201 with `Location: /v1/users/{userId}/workout-entries/{id}`;
    - `GET /v1/users/:userId/workout-entries/:id` → 200 in the unit asked for with `?unit=`, as on history (§17), or 404 `NOT_FOUND`. Its query is `EntryQueryDto`. A non-UUID id is a 404 without a query, through Nest's `new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND })`.
    - The GET route is the third item on the cut list. If it is cut, the POST returns 201 with no `Location` (§9.1).

- [ ] **Step 1: Write the failing unit tests:**

```ts
// entry-response.spec.ts
it('225 lb read in kg shows 102.06 with original { weight: 225, unit: "lb" }', ...);
it('100.125 kg read in kg shows 100.125, the number as sent, not 100.13', ...);
it('100.125 kg read in lb shows display(fromKg) and keeps original { weight: 100.125, unit: "kg" }', ...);
```

- [ ] **Step 2:** Run `npm test -- src/workouts/entry-response.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `toEntryResponse`, the repository, the service and the two routes:
  - The service takes one `snapshot()` and one `clock.now()` per request.
  - The controller takes the body as `unknown`, with `@ApiBody({ type: EntryInputDto })`, and declares `unit` with `@ApiQuery`.

  **Watch for:** `new Date()` instead of `CLOCK`; `weight_kg` read back through `parseFloat`; `setNumber` taken from the request.
- [ ] **Step 4: Write the failing integration tests:**

```ts
// entries.int-spec.ts (§12, each E-case)
it('the §9.1 request → 201 with the §9.1 body (ids and createdAt aside), and Location returns the same entry', ...);
it('GET …/{id}?unit=lb shows the sets in lb; ?units=lb → 400 naming units and listing unit', ...);
it.each(['invalid unit', 'null date', 'negative weight', 'negative reps', 'reps 0', 'empty sets'])('%s → 400 with its path, nothing written', ...);
it.each(['coach%40example.com', 'user%3A1', 'u%201', 'x'.repeat(65), '%C3%BC'])('path userId %s, as sent → 400 naming userId', ...);   // Review Focus 4
it('an entry id that does not exist → 404; a non-UUID id → 404 NOT_FOUND, not a 500', ...);
// first-request.int-spec.ts (§12, the first-request row)
it('body userId equal to the path → 201; different → 400 naming userId', ...);
it('"unit": "lbs" → 201; Content-Type application/json; charset=utf-8 → 201', ...);
it('a form-encoded body (curl -d, no header) → 415 naming the header to send', ...);
it('an array on the single route → 400 showing the expected shape', ...);
it('a POST with the JSON header and no body → 400 showing the expected object; a bare null → 400 MALFORMED_JSON', ...);   // Review Focus 3
it('"date": "2025-02-10" → 400 with the fix in its message, nothing written', ...);
```

- [ ] **Step 5:** Run `npm test && npm run test:int`. Expected: PASS.
- [ ] **Step 6:** Commit: `feat: log one entry`.

### Task 11: Bulk logging and concurrency (slice 8)

**Files:**
- Modify: `src/workouts/workouts.controller.ts`, `src/workouts/workouts.service.ts`
- Test: `test/bulk.int-spec.ts`, `test/first-request.int-spec.ts`

**Interfaces:**
- Consumes: `readEntryInputs(body, 'bulk', …)`, `UserIdPipe` (Task 10a); `insertEntries`, `toEntryResponse` (Task 10b).
- Produces: `POST /v1/users/:userId/workout-entries/bulk` → 201 `{ data: EntryResponse[] }` in the order sent, with no `Location`.

- [ ] **Step 1: Write the failing tests** (§12, the bulk and concurrency row):

```ts
it('one bad entry → 400 and 0 rows', ...);
it('three faults in three items → one 400 with entries[0].sets[0].unit, entries[1].date, entries[2].userId; 0 rows', ...);   // errors asserted with toEqual
it('returns entries in the order sent', ...);
it('8 different concurrent writes for one user and exercise (below the pool size) → all stored, sets intact', ...);
it('two identical requests → two entries', ...);
it('101 entries → 400 on entries; a bulk item userId equal to the path → 201', ...);
// first-request.int-spec.ts
it('a bare array on /bulk → 400 showing { "entries": [ … ] }', ...);
it('{ "entries": [null] } → 400 at entries[0] showing the entry shape', ...);   // Review Focus 3
```

- [ ] **Step 2:** Run `npm run test:int -- test/bulk.int-spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Add the bulk route and service method: `insertEntries` with every entry in one transaction, responses formatted from one snapshot.
- [ ] **Step 4:** Run `npm run test:int`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: atomic bulk logging`.

### Task 12: Benchmark data and the runner skeleton (slice 9 · §16: 1.0 h)

The runner starts here, before the read routes, so each of Tasks 13–15 measures its own route as it is built (§11, §15).

**Files:**
- Create: `scripts/bench-data.ts`, `scripts/bench.ts`, `scripts/bench-cases.ts`
- Modify: `package.json` (scripts `bench:data`: `tsx scripts/bench-data.ts` and `bench`: `tsx scripts/bench.ts`; `tsx` and `simple-statistics` as development dependencies), `docker-compose.yml` (service `bench`: `profiles: [bench]`, `build: { context: ., target: build }`, `command: ["npm", "run", "bench:data"]`, and `depends_on: { migrate: { condition: service_completed_successfully } }`)
- Test: `test/bench-data.int-spec.ts`, `test/bench-runner.int-spec.ts`

**Interfaces:**
- Produces:
  - `npm run bench:data`, which reads `DATABASE_URL` and `BENCH_SCALE` (default `1`), writes the users `bench-heavy`, `bench-single` and `bench-bg-0001…`, and prints the row counts and the elapsed time.
  - In `scripts/bench.ts`:
    - `type BenchContext = { topKey: string; rareKey: string; rareGroup: string }`, read from the data once at start;
    - `type BenchCase = { name: string; path: (ctx: BenchContext) => string; sql?: (ctx: BenchContext) => SQL; budgetP95Ms?: number }`. A case's `sql` comes from the API's own query builder (Tasks 13 and 14), never typed again, so `EXPLAIN` runs exactly what the API runs;
    - `runCase(c: BenchCase, ctx: BenchContext, opts: { baseUrl: string; warmup: number; measured: number; concurrency: number }): Promise<{ p50: number; p95: number; max: number; plan: string | null }>`: warm-up requests discarded, then the measured ones at the given concurrency, each timed with `performance.now()` around `fetch`; p50 and p95 from `simple-statistics`' `quantile`; `EXPLAIN (ANALYZE, BUFFERS)` when the case has `sql`.

    The request loop is the one hand-written part the owner kept (D-28): autocannon, the usual Node load tool, reports p90 and p97.5 but not the p95 that §11 budgets on.
  - `BENCH_CASES: BenchCase[]` in `scripts/bench-cases.ts`, empty here; Tasks 13–15 add theirs. `npm run bench` runs every case and prints a table.

- [ ] **Step 1: Write the failing tests.** In `test/bench-data.int-spec.ts`, run `BENCH_SCALE=0.01` against the test database and assert the §11 shape at that scale:
  - `bench-heavy` has 500 entries;
  - its most-trained exercise holds 5–8 % of its entries (at full scale, 2 500–4 000 of 50 000);
  - sessions have 5–12 entries sharing one instant;
  - main lifts have 6–10 sets and accessories 3–4;
  - every entry has a non-null `utc_offset_minutes`, and its local hour is a morning or an evening;
  - `bench-single` has one exercise;
  - background rows are about 10× `bench-heavy`'s;
  - two runs give the same counts per user and exercise.

  In `test/bench-runner.int-spec.ts`, run `runCase` with 5 warm-up and 20 measured requests on `GET /health/ready` of a test app listening on a free port, and assert `p50 ≤ p95 ≤ max`.
- [ ] **Step 2:** Run `npm run test:int -- test/bench-data.int-spec.ts test/bench-runner.int-spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement generation inside the database (`generate_series`, one `INSERT … SELECT … ORDER BY performed_at` per table) or with `COPY`, never row by row. Rows go in date order across all users. Finish with `VACUUM (ANALYZE)`. Generation is deterministic: modular arithmetic on the series index, or `random()` after `SELECT setseed(…)` in the same session, so the shape assertions hold on every run.
- [ ] **Step 4:** Implement `runCase` and the `bench` entry point.
- [ ] **Step 5:** Run the tests. Expected: PASS. Then time `docker compose --profile bench up bench` at full scale. If it takes more than 3 minutes, reduce the background, never the heavy user, and note it for the README (§11).
- [ ] **Step 6:** Commit: `perf: benchmark data in the realistic shape, runner skeleton`.

### Task 13: History (slice 10 · §16: 1.75 h)

**Files:**
- Create: `src/workouts/dto/history-query.dto.ts`, `src/workouts/history-query.ts`
- Modify: `src/workouts/workouts.repository.ts`, `src/workouts/workouts.service.ts`, `src/workouts/workouts.controller.ts`, `scripts/bench-cases.ts`
- Test: `src/workouts/history-query.spec.ts`, `test/history.int-spec.ts`, `test/paging-walk.int-spec.ts`, `test/time.int-spec.ts`

**Interfaces:**
- Consumes: `parseReadBound`, `repairOffsetPlus`, `checkRange` (Task 6); `exerciseKey`, `muscleGroupName`, `encodeCursor`, `decodeCursor` (Task 7); `CatalogSnapshot` (Task 9); `UserIdPipe`, `QueryDto`, `IsSupportedUnit` (Task 10a); `toEntryResponse`, `StoredEntry` (Task 10b); `pgArray`, `toDate`, `Executor` (Task 3); `BENCH_CASES` (Task 12).
- Produces:
  - `HistoryQueryDto extends QueryDto`: `exercise`, `muscleGroup`, `from`, `to`, `unit`, `limit` and `cursor`, each optional; strings are `@IsString() @IsNotEmpty()`, `exercise` at most 100 characters, `limit` `@Type(() => Number) @IsInt() @Min(1) @Max(100)`, `unit` `@IsSupportedUnit()`.
  - `readHistoryQuery(q: HistoryQueryDto, userId: string, snapshot: CatalogSnapshot, units: UnitRegistry): Check<HistoryQuery>`, for what class-validator cannot check: the dates, the cursor, the muscle group against the snapshot, and the normalised term.
  - `HistoryQuery = { userId: string; from?: Date; to?: Date; term?: string; keys?: readonly string[]; cursor?: { at: Date; id: string }; limit: number; unit: UnitCode }`. `term` is the normalised, LIKE-escaped search text; `keys` comes from `snapshot.keysForMuscleGroup`.
  - `buildHistoryIdsQuery(q: HistoryQuery): SQL`, step 1 of §9.2, used by `findHistoryPage` and by the benchmark.
  - `WorkoutsRepository.findEntriesByIds(ids: readonly string[], db?: Executor): Promise<StoredEntry[]>`: the full rows and their sets, in the order of `ids`, run on `db` when it is given (Task 15 runs it inside its transaction).
  - `WorkoutsRepository.findHistoryPage(q: HistoryQuery): Promise<{ entries: StoredEntry[]; hasMore: boolean }>`.
  - Route `GET /v1/users/:userId/workout-entries` → `{ data, page: { limit, hasMore, nextCursor }, message? }`.

- [ ] **Step 1: Write the failing unit tests:**

```ts
// history-query.spec.ts — the first four rows run HistoryQueryDto through validate(plainToInstance(…)) and toFieldErrors; the rest call readHistoryQuery
it.each([['exercise', ''], ['muscleGroup', ''], ['unit', ''], ['cursor', '']])('an empty %s= → 400 naming it', ...);   // Review Focus 2
it.each(['0', '101', 'abc'])('limit=%s → 400 naming limit', ...);                                                    // Review Focus 2
it('unit=kg&unit=lb (an array) → 400 on unit, "sent more than once"', ...);                                           // Review Focus 2
it.each(['exerciseName', 'startDate', 'page'])('?%s=… → 400 naming it and listing the accepted parameters', ...);    // §9
it('an unknown muscle group → 400 listing knownMuscleGroups()', ...);
it('escapes %, _ and \\ in the term after exerciseKey()', ...);
it('repairs a + that arrived as a space before parsing from and to', ...);
it('a date alone on from and on to → each its own §8 message', ...);
it('a malformed cursor → 400; from >= to → 400', ...);
```

- [ ] **Step 2:** Run `npm test -- src/workouts/history-query.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `readHistoryQuery` (§9.2 rules: `limit` 1–100 default 20, `unit` default `kg`), `buildHistoryIdsQuery`, `findEntriesByIds` and `findHistoryPage`:
  - Step 1 is the §9.2 SQL, with only the predicates that were requested and `ESCAPE '\'` written as `'\\'` inside the JavaScript string (§14, slice 10). Its select list is exactly `id, performed_at, exercise_key`: any other column turns the index-only scan into heap fetches (§9.2).
  - The muscle-group predicate binds `pgArray(keys, 'text')`; step 2 loads the full rows with `id = ANY(pgArray(ids, 'uuid'))`, re-sorted, then the sets in one query. A `timestamptz` read through `db.execute` goes through `toDate`.
  - An empty `keys` returns an empty page without a query.
  - `nextCursor` is built from the last stored row returned, not the look-ahead row.
  - An empty page carries `message: "No workout entries found for the given filters."`.
- [ ] **Step 4: Write the failing integration tests:**

```ts
// history.int-spec.ts (§12, the endpoint E-cases)
it.each(['from alone', 'to alone', 'both', 'neither'])('%s', ...);
it('converts units on read; a set read in its own unit returns the number as sent', ...);
it('the muscle-group filter, including an exercise not in the catalog', ...);
it('a known group with no exercises → empty 200 with the message', ...);
it('a partial term containing % or _ matches literally', ...);
it('an empty range → 200 with the message; a well-formed unknown user → 200 empty', ...);   // Review Focus 4
it.each(['coach%40example.com', 'user%3A1', 'u%201'])('path userId %s → 400 naming userId', ...);   // Review Focus 4
it('?exerciseName=bench → 400 naming exerciseName', ...);
it('?from=2025-02-01T00:00:00+07:00 with the + unencoded → 200', ...);                       // the first-request row
it('two entries with one date in one bulk come back newest id first over two pages of size one, each with its own sets', ...);
// paging-walk.int-spec.ts — never cut
it('entries on different instants and sharing one instant, walked at page size one: each exactly once, in order', ...);
it('each nextCursor decodes to the stored performed_at and id of the last row returned', ...);
// time.int-spec.ts (§12, the Time row; PRs and compare join it in Tasks 14–15)
it('the traveller pair falls in the right half-open ranges for a viewer in Hanoi and one at UTC−7, each with its own utcOffset', ...);
it('entries at from − 1 ms, from, to − 1 ms and to across two adjacent periods each appear in exactly one (history)', ...);
it('a read bound before 1900 → 400', ...);
it('instants in responses and cursors are right under the non-UTC process and database zones', ...);
```

- [ ] **Step 5:** Run `npm test && npm run test:int`. Expected: PASS. The service takes one catalog snapshot per request, and uses it for the muscle-group check, the key list and every entry's groups (§10.2).
- [ ] **Step 6:** Add the history cases to `BENCH_CASES`, each with `buildHistoryIdsQuery`'s SQL: the first page, a deep page, a common partial term, a term that matches nothing, and a rarely logged exercise by term and by muscle group. Load the full-scale data, start `api` and run `npm run bench`. Put the p95 figures in the commit message. A budget miss (§11) is raised with the owner before Task 14, and its fallback becomes a task of its own.
- [ ] **Step 7 (fast-check, the first item on the cut list):** Add `it('a pagination walk over generated entries returns every row exactly once, in order')` to `test/paging-walk.int-spec.ts`.
- [ ] **Step 8:** Commit: `feat: history with filters and keyset pagination`.

### Task 14: Personal records (slice 11a · §16 "11": 3.4 h with Tasks 15–16)

**Files:**
- Create: `src/personal-records/dto/records-query.dto.ts`, `src/personal-records/records-query.ts`, `src/personal-records/records-response.ts`, `src/personal-records/personal-records.repository.ts`, `src/personal-records/personal-records.service.ts`, `src/personal-records/personal-records.controller.ts`, `src/personal-records/personal-records.module.ts`
- Modify: `scripts/bench-cases.ts`
- Test: `src/personal-records/records-response.spec.ts`, `test/records.int-spec.ts`, `test/ranking-fixture.int-spec.ts`, `test/time.int-spec.ts`

**Interfaces:**
- Consumes: `pickRecord`, `rank`, `e1rmKg`, `volumeKg` (Task 7); `parseReadBound`, `repairOffsetPlus`, `checkRange` (Task 6); `Executor` (Task 3); `UserIdPipe`, `QueryDto`, `IsSupportedUnit` (Task 10a); `StoredEntry` (Task 10b); `findEntriesByIds` (Task 13); `BENCH_CASES` (Task 12).
- Produces:
  - `RecordsQueryDto extends QueryDto`: `exercise` (`@IsDefined()`), `from`, `to` and `unit`.
  - `readRecordsQuery(q: RecordsQueryDto, units: UnitRegistry): Check<{ key: string; from?: Date; to?: Date; unit: UnitCode }>`. `exercise` is matched as the whole name after `exerciseKey()`.
  - `buildRecordsQuery(userId: string, key: string, range: { from?: Date; to?: Date }): SQL`, the §9.3 statement, used by `findRecords` and by the benchmark.
  - `PersonalRecordsRepository.findRecords(userId: string, key: string, range: { from?: Date; to?: Date }, db?: Executor): Promise<RecordSet>`, where:
    - `RecordSet = { weight: RecordRow | null; volume: RecordRow | null; e1rm: RecordRow | null }`;
    - `RecordRow = { entry: StoredEntry; setNumber: number }`.

    It loads the at most three winners with `findEntriesByIds(ids, db)`.
  - `toRecordsResponse(set: RecordSet, unit: UnitCode, units: UnitRegistry): RecordsJson`, the `records` object of §9.3: `{ heaviestSet, highestVolumeSet, bestEstimatedOneRepMax }`, each `null` when empty. The service adds `exercise`, `unit` and `range`.
  - Route `GET /v1/users/:userId/personal-records`, with `:userId` through `UserIdPipe`.

- [ ] **Step 1: Write the failing tests:**

```ts
// ranking-fixture.int-spec.ts — never cut (§12)
it('SQL and pickRecord pick the same entry and set for all three records', ...);
// fixture: 100 kg × 1 vs 96 kg × 2; equal scores on two dates; a kg set vs a lb set; a zero-weight set
// records-response.spec.ts
it('6 lb × 50 read in lb → highestVolumeSet.volume 300', ...);
it('100.125 kg × 1 read in kg → weight 100.125 as sent, volume 100.13', ...);
// records.int-spec.ts
it('a name that matches no whole exercise name → 200, three null records, and exactly this message', ...);
// user u_pr, ?exercise=bench: "No entries found for exercise 'bench' in this range. This filter matches the whole exercise name;
//   GET /v1/users/u_pr/workout-entries?exercise=bench lists the names that contain it."
it('a ranged request returns records from the range only', ...);
it('two identical entries do not change any record', ...);
it('after 8 concurrent writes for one user and exercise, the records equal pickRecord over the stored sets (§12)', ...);
it('no exercise parameter → 400 naming exercise', ...);   // Review Focus 5
it('?exerciseName=bench → 400 naming exerciseName; unit=kg&unit=lb → 400 on unit', ...);   // §9; Review Focus 2
it('path userId coach%40example.com → 400 naming userId', ...);   // Review Focus 4
// time.int-spec.ts
it('the four boundary entries each appear in exactly one period (PRs)', ...);
```

- [ ] **Step 2:** Run `npm test -- src/personal-records && npm run test:int -- test/ranking-fixture.int-spec.ts test/records.int-spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the §9.3 SQL verbatim in `buildRecordsQuery`: `WITH scoped AS MATERIALIZED`, three `ORDER BY <score> DESC, performed_at, id, set_number LIMIT 1` branches, date predicates only when sent. Then load at most 3 entries and their sets with `findEntriesByIds`.

  The empty message is fixed text with the key and the request's `userId` filled in: `No entries found for exercise '<key>' in this range. This filter matches the whole exercise name; GET /v1/users/<userId>/workout-entries?exercise=<key, percent-encoded> lists the names that contain it.`
- [ ] **Step 4:** Run `npm test && npm run test:int`. Expected: PASS.
- [ ] **Step 5:** Add the PR cases to `BENCH_CASES` with `buildRecordsQuery`'s SQL: the most-trained exercise, all-time and ranged. Run them as in Task 13, Step 6.
- [ ] **Step 6 (fast-check, the first item on the cut list):** Add two properties:
  - `it('a PR over a range never beats the all-time PR')`;
  - `it('the SQL ranking and pickRecord pick the same winner for generated sets')`.
- [ ] **Step 7:** Commit: `feat: personal records by the materialised join`.

### Task 15: PR comparison (slice 11b)

**Files:**
- Create: `src/personal-records/domain/delta.ts`, `src/personal-records/dto/compare-query.dto.ts`, `src/personal-records/compare-query.ts`
- Modify: `src/personal-records/personal-records.service.ts`, `src/personal-records/personal-records.controller.ts`, `scripts/bench-cases.ts`
- Test: `src/personal-records/domain/delta.spec.ts`, `test/compare.int-spec.ts`, `test/time.int-spec.ts`

**Interfaces:**
- Consumes: `findRecords`, `toRecordsResponse`, `buildRecordsQuery` (Task 14); `DB` (Task 3); `UserIdPipe`, `QueryDto`, `IsSupportedUnit` (Task 10a); `BENCH_CASES` (Task 12).
- Produces:
  - `computeDelta(current: Decimal | null, previous: Decimal | null, unit: UnitCode, units: UnitRegistry): { absolute: number; percent: number | null } | null`:
    - `null` when either side is `null`;
    - `percent` is `null` when `previous` is 0;
    - both are computed from exact kilograms and rounded last.
  - `CompareQueryDto extends QueryDto`: `exercise`, `from`, `to`, `compareFrom` and `compareTo`, each `@IsDefined()`, and `unit`. Each missing one gets its own error.
  - `readCompareQuery(q: CompareQueryDto, units): Check<{ key: string; current: { from: Date; to: Date }; previous: { from: Date; to: Date }; unit: UnitCode }>`. Each pair goes through `checkRange` after rounding.
  - Route `GET /v1/users/:userId/personal-records/compare`, which returns the §9.4 shape, with `:userId` through `UserIdPipe`.

- [ ] **Step 1: Write the failing tests:**

```ts
// delta.spec.ts
it('current 101 kg × 1 vs previous 100 kg × 1: estimated maxima shown as 104.37 and 103.33 give { absolute: 1.03, percent: 1 }', ...);
// from exact values; subtracting the shown values would give 1.04
it('previous 0 → percent null; either side null → null', ...);
// compare.int-spec.ts (§12, the PRs and compare row; §9.4)
it('one empty period → 200, the populated side, deltas null, and the exact §9.4 message naming the empty period', ...);
it('both periods empty → 200, every record and delta null, and the exact message naming both periods', ...);
it('absolute deltas are in the requested unit (lb)', ...);
it('overlapping periods are accepted', ...);
it('missing compareFrom and to → one 400 listing both', ...);   // Review Focus 5
it('?period=month → 400 naming period; path userId user%3A1 → 400 naming userId', ...);   // §9; Review Focus 4
// time.int-spec.ts
it('the four boundary entries each appear in exactly one period (compare)', ...);
```

- [ ] **Step 2:** Run `npm test -- src/personal-records && npm run test:int -- test/compare.int-spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Both `findRecords` calls run inside `db.transaction(fn, { isolationLevel: 'repeatable read', accessMode: 'read only' })` (§9.4), and each passes the transaction on, so the load of the winners runs in it too. The messages:
  - One empty period, as §9.4 shows it: `No entries for '<key>' from <from> (included) to <to> (excluded), the comparison period. This filter matches the whole exercise name; GET /v1/users/<userId>/workout-entries?exercise=<key, percent-encoded> lists the names that contain it.` For the current period, the period name is "the current period".
  - Both empty: `No entries for '<key>' from <from> (included) to <to> (excluded), the current period, nor from <compareFrom> (included) to <compareTo> (excluded), the comparison period.` followed by the same hint.

  Bounds are printed as `toISOString()`.
- [ ] **Step 4:** Run `npm test && npm run test:int`. Expected: PASS.
- [ ] **Step 5:** Add the compare case to `BENCH_CASES` (the most-trained exercise, two adjacent months), and run it as in Task 13, Step 6.
- [ ] **Step 6:** Commit: `feat: PR comparison in one snapshot`.

### Task 16: Benchmark full run and the budget gate (slice 11c)

**Files:**
- Create: `bench/report.md` (committed results; raw output goes to `bench/out/`)
- Modify: `scripts/bench.ts`

**Interfaces:**
- Consumes: the data and runner of Task 12, and the cases of Tasks 13–15.
- Produces: `npm run bench` reads `DATABASE_URL` and `BENCH_BASE_URL` (default `http://127.0.0.1:3000`), writes `bench/report.md`, and exits 1 if a budget is missed.

- [ ] **Step 1:** Extend `scripts/bench.ts` to the full method (§11):
  - **For each case:** 50 warm-up requests discarded and 500 measured, at concurrency 1 and again at 8. Report p50, p95 and max, with the `EXPLAIN (ANALYZE, BUFFERS)` output.
  - **Run everything twice:** after `VACUUM (ANALYZE)`, and after 5 000 fresh inserts for `bench-heavy` with no vacuum.
  - **Print with every figure:** the method, and the CPUs and memory given to Docker. For PRs, also the join type, the loop count, the heap fetches on the set side and any temporary files.
- [ ] **Step 2:** Run it with the bench data loaded and `api` running. Check the p95 budgets (local Docker, warm cache, `bench-heavy`):

  | Case | p95 budget |
  |---|---|
  | history, first and deep page | < 30 ms |
  | no-match term, rarely logged exercise | < 100 ms |
  | PRs and compare | < 50 ms |
  | `bench-single`, every endpoint | inside the statement timeout |
  | `bench-single`, PRs | < 500 ms |
- [ ] **Step 3:** If a budget fails, apply the §11 fallbacks in their order, each as its own reviewed task and commit with before and after numbers. For PR step 2, add the test that both query shapes pick identical winners before the join is replaced. If every budget passes, apply nothing.
- [ ] **Step 4:** Commit: `perf: benchmark runs and results`.

### Task 17a: Catalog administration — exercises and the guard (slice 12 · §16: 2.25 h with Task 17b)

**Files:**
- Create: `src/exercises/dto/exercise-write.dto.ts`, `src/exercises/catalog.service.ts`, `src/exercises/catalog-admin.controller.ts`, `src/common/admin-token.guard.ts`
- Modify: `src/exercises/exercises.module.ts`
- Test: `src/common/admin-token.guard.spec.ts`, `test/catalog-admin.int-spec.ts`, `test/admin-guard.int-spec.ts`

**Interfaces:**
- Consumes: `checkExerciseName`, `collapseWhitespace`, `checkMuscleGroupName` (Task 7); `CATALOG_WRITE_LOCK`, `Executor` (Task 3); `ExerciseCatalog.refresh` (Task 9); `ApiProblem`, `driverErrorCode` (Task 2).
- Exercise create, update and delete are never cut (§16).
- Produces:
  - `CatalogService.withCatalogWrite<T>(fn: (tx: Executor) => Promise<T>): Promise<T>`. Its first statement is `SELECT pg_advisory_xact_lock(CATALOG_WRITE_LOCK)`. After the commit it awaits `catalog.refresh()`, logging a failure without changing the response, and it logs one line per write: route, key, outcome.
  - `createExercise`, `replaceExercise`, `deleteExercise`, covering the exercise rows of the §10.5 table.
  - `AdminTokenGuard`, plus `AdminOnly = () => UseGuards(AdminTokenGuard)`. Its 401 is an `ApiProblem` with code `UNAUTHORIZED` and the header `WWW-Authenticate: Bearer`.

- [ ] **Step 1: Write the failing tests:**

```ts
// admin-token.guard.spec.ts
it.each(['the right token', 'a wrong one of the same length', 'one of another length', 'no header', 'the variable unset'])('%s', ...);
// only the first passes; the others are 401 UNAUTHORIZED with WWW-Authenticate: Bearer
// catalog-admin.int-spec.ts (§12, the Catalog integration row) — the exercise routes
it('create → 201 + Location /v1/exercises/<encodeURIComponent(key)>; the same name again → 409 EXERCISE_EXISTS', ...);
it('two identical POSTs at once → one 201, one 409', ...);
it('an unknown group → 400 listing the groups read from the table', ...);
it('PUT with a name whose key differs from the path → 400; PUT of an unknown key → 404', ...);
it('90/90 Hip Stretch: created, Location followed, then PUT and DELETE by that path', ...);
it('the key rule: log "  ZERCHER   squat ", create "Zercher Squat", the entry shows its groups', ...);
it('delete an exercise → 204 with an empty body; its entries stay listed with PRs intact and muscleGroups [], the filter no longer matches; POST it again restores the mapping', ...);
it('a group inserted by SQL after this app\'s last refresh is accepted at once by an exercise write', ...);
// admin-guard.int-spec.ts — its own file, so the guard applied here never reaches another test
it('with AdminOnly applied to the real CatalogAdminController: each route 401 with WWW-Authenticate: Bearer without the token, success with it; GET /v1/exercises unaffected', ...);
```

- [ ] **Step 2:** Run `npm test -- src/common/admin-token.guard.spec.ts && npm run test:int -- test/catalog-admin.int-spec.ts test/admin-guard.int-spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the guard (§10.7): SHA-256 both tokens and compare with `crypto.timingSafeEqual`; fail closed when `ADMIN_API_TOKEN` is unset or empty. It is written by hand (D-28): a guard is Nest's own hook, and the check is one constant-time comparison that a Passport strategy would wrap in two more packages.

  How `admin-guard.int-spec.ts` applies it: the file sets `process.env.ADMIN_API_TOKEN` (32 characters or more), then in `beforeAll` loads the controller and `test/support/app` with `await import(…)`, because static imports are hoisted above the assignment. It calls `AdminOnly()(CatalogAdminController)`, and only then `createTestApp()`. Jest gives each test file its own module registry, so the decorator stays in this file.
- [ ] **Step 4:** Implement the service and the controller for exercises (§10.5):
  - **Field rules:** the display name is `collapseWhitespace` of the trimmed name; groups are 1–10, normalised, de-duplicated, in the order sent.
  - **Group check:** against `muscle_groups` inside the transaction. A `23503` on an exercise write, read with `driverErrorCode`, is the same 400.
  - **Delete:** `@HttpCode(204)`, since Nest answers 200 by default.
  - **Controller:** carries the tag "Admin — catalog (UNAUTHENTICATED)" and the two commented lines exactly as §10.7 shows them.
- [ ] **Step 5:** Run `npm test && npm run test:int`. Expected: PASS.
- [ ] **Step 6:** Commit: `feat: catalog exercise administration, guard written and not applied`.

### Task 17b: The two muscle-group write routes (slice 12; the second item on the cut list, ≈ 0.3 h of 2.25 h)

If this task is cut, a new group is one SQL insert, and the README says so (§16).

**Files:**
- Create: `src/exercises/dto/muscle-group-write.dto.ts`
- Modify: `src/exercises/catalog.service.ts`, `src/exercises/catalog-admin.controller.ts`
- Test: `test/catalog-admin.int-spec.ts`, `test/admin-guard.int-spec.ts`

**Interfaces:**
- Consumes: `withCatalogWrite`, `AdminOnly` (Task 17a); `checkMuscleGroupName` (Task 7); `driverErrorCode` (Task 2).
- Produces: `createMuscleGroup` and `deleteMuscleGroup`, with the routes `POST /v1/admin/muscle-groups` → 201 / 409 and `DELETE /v1/admin/muscle-groups/:name` → 204 / 404 / 409.

- [ ] **Step 1: Write the failing tests:**

```ts
// catalog-admin.int-spec.ts
it('a new group → 201; again → 409 MUSCLE_GROUP_EXISTS', ...);
it('deleting a group in use → 409 MUSCLE_GROUP_IN_USE (the 23503 of NO ACTION), saying how many exercises list it; unknown → 404', ...);
it('deleting an unused group → 204 with an empty body', ...);
it('a group created through a second app instance is accepted at once by an exercise write on the first', ...);
// admin-guard.int-spec.ts
it('all five routes 401 without the token, success with it', ...);
```

- [ ] **Step 2:** Run `npm run test:int -- test/catalog-admin.int-spec.ts test/admin-guard.int-spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement both through `withCatalogWrite`. On delete, a `23503`, read with `driverErrorCode`, is a 409 that says how many exercises still list the group. The in-use test runs through Drizzle, so it settles where the wrapped error keeps the code (U-29). The delete route has `@HttpCode(204)`.
- [ ] **Step 4:** Run `npm test && npm run test:int`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: muscle-group write routes`.

### Task 18: README, `requests.http`, `AI_WORKFLOW.md`, final pass (slice 13 · §16: 2.4 h)

**Files:**
- Create: `README.md`, `requests.http`, `AI_WORKFLOW.md`
- Test: `test/docs.int-spec.ts`

- [ ] **Step 1:** Extend `test/docs.int-spec.ts`: `/docs-json` lists every route of §9 with its path and query parameters, and `unit` is a free string on input and an enum on output (§6). Add the missing `@ApiQuery` and `@ApiProperty` declarations until it passes. Every example uses a full date-time with an offset.
- [ ] **Step 2:** Write `README.md`:
  - **The brief's sections:** architecture with the §4 diagram (D2); setup with `docker compose up` (D3); endpoints and errors (D4); schema and decisions (D5); trade-offs and what changes at scale (D6).
  - **Placement:** the unauthenticated-routes warning block near the top.
  - **The §15 notes:** every one, in its order.
  - **Performance:** the benchmark results and method from `bench/report.md`.
  - **Configuration:** the configuration section of §13.
- [ ] **Step 3:** Write `requests.http` with every call the README shows. The admin calls go under a comment saying they are open.
- [ ] **Step 4:** Write `AI_WORKFLOW.md` from `planning/06-ai-workflow-seed.md` and the implementation log. Use only real events. Settle W-1's "confirm before using" note with the owner, or drop it.
- [ ] **Step 5:** Verify:
  1. Run `docker compose down -v && docker compose up --build`.
  2. Run every request in `requests.http` and check each response against the README.
  3. Open `/docs` in a browser and run one call from it.
  4. Run `npm run lint && npm run typecheck && npm test && npm run test:int && bash scripts/clean-image-check.sh`.
  5. Check that no document states a real calendar date.

  Expected: all pass.
- [ ] **Step 6:** Commit: `docs: README, requests.http, AI_WORKFLOW`.
