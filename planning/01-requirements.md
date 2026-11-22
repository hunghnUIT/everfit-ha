# 01 — Requirements

Source: `Everfit_Test for Backend Engineer.pdf` (3 pages), read in full.
Every line of the brief is given an ID here so the design, the decision log and
the debate can refer to it. Wording in the "Brief says" column is the brief's
own; the "Reading" column is our interpretation and is open to challenge.

One requirement does not come from the brief. It comes from the owner of
this project — the candidate — and is in §11.

## 1. What is being built

A **Workout Logging API**: coaches track client workout metrics over time —
logging exercises and tracking personal records (PRs).

The brief says the test evaluates: system design, technical depth,
problem-solving, production readiness, code quality, and **AI-first workflow**
(the last one is marked "Critical").

## 2. Functional requirements

| ID | Brief says | Reading |
|---|---|---|
| F1 | Log a workout entry with `userId`, `date`, `exerciseName`, `sets` (array of `{ reps, weight, unit }`) | One entry = one exercise on one date with 1..n sets. |
| F1.1 | Weight units: kg, lb | Unit is per set, so one entry may mix units. |
| F1.2 | Auto-convert and store a normalized value (kg) alongside the original | Both the original `(weight, unit)` and `weight_kg` are persisted. The kilogram value is the exact product, not a rounded one. |
| F1.3 | Support bulk logging: multiple exercises in a single request | One request creates several entries. Atomicity is not specified. |
| F2 | Get workout history — list all entries for a user | Read endpoint scoped to one user. |
| F2.1 | Filter by exercise name (partial match supported) | Case-insensitive substring match. |
| F2.2 | Filter by date range | Bounds semantics (inclusive? timezone?) not specified. |
| F2.3 | Filter by muscle group (if exercise metadata is available) | Implies a catalog exists and that entries may reference exercises that are *not* in it. |
| F2.4 | Return in the unit the user specifies (convert if needed) | A `unit` query parameter; rounding not specified. |
| F2.5 | Paginated with cursor-based or offset pagination | Our choice; must be justified. |
| F3 | Get PRs for a given user **and exercise** | Exercise is required; exact (not partial) match. |
| F3.1 | Heaviest single set (max weight) | Max `weight_kg` over all sets. |
| F3.2 | Highest volume set (reps × weight) | Max per-set `reps × weight_kg` (a single set, not a session total). |
| F3.3 | Best estimated 1RM (Epley: `weight × (1 + reps/30)`) | Formula is prescribed. Behaviour at `reps = 1` is not (see A3). |
| F3.4 | Include the date each PR was achieved | Tie-breaking not specified. |
| F3.5 | Support comparing PRs across a time range (e.g. "PR this month vs last month") | Two date ranges → two PR sets (+ a delta). Who defines "month" is not specified. |

## 3. Edge cases and error handling

| ID | Brief says | Reading |
|---|---|---|
| E1 | Invalid or unsupported weight units | 4xx with a structured, specific message naming the supported units. |
| E2 | Missing or malformed fields (null date, negative weight/reps, empty sets array) | Validation at the boundary; report every problem, with a path to the field. |
| E3 | Date ranges with no data → empty result with appropriate message, **not an error** | HTTP 200, empty payload, human-readable `message`. |
| E4 | Timezone handling: document your strategy (UTC storage recommended, explain trade-offs) | A written strategy is a deliverable, not just behaviour. |
| E5 | Concurrent writes: same user logging same exercise at same time | Ambiguous: could mean "no corruption" or "no duplicates" (see A5). |
| E6 | Large datasets: endpoints must perform well with 50,000+ entries per user | Needs indexes designed for the queries **and** evidence (a seeded benchmark). |

## 4. Architecture and extensibility

| ID | Brief says | Reading |
|---|---|---|
| X1 | Adding a new unit type (e.g. stone) should require minimal code changes | One place to add a unit; nothing else changes (no migration, no validator edits). |
| X2 | Exercise → muscle group mapping should be configurable (not hardcoded in business logic) | Mapping is data. Business logic depends on an abstraction. The brief is met by any data source; the owner asks for more — data that is edited through the API with no deploy (§11). |

## 5. Technical constraints

| ID | Brief says |
|---|---|
| T1 | NodeJS (NestJS recommended — justify if you choose otherwise) |
| T2 | Database: MongoDB or PostgreSQL (justify your choice, explain schema design and indexing strategy) |
| T3 | Any AI coding tools are encouraged |
| T4 | No authentication required — pass `userId` as a parameter |

## 6. Evaluation criteria (verbatim from the brief's table)

| ID | Criteria | What they look for |
|---|---|---|
| V1 | System design | Schema design, indexing strategy, query efficiency for aggregations, normalization approach |
| V2 | API design | RESTful conventions, consistent error responses, pagination, filtering, input validation |
| V3 | Code architecture | Separation of concerns, extensibility (unit conversion abstraction, configurable muscle group mapping), dependency injection |
| V4 | Problem-solving | PR aggregation logic, 1RM calculation, timezone handling, bulk operations |
| V5 | Error handling | Graceful failures, structured error responses, validation at boundaries, meaningful messages |
| V6 | Testing | Unit tests for calculations, integration tests for API endpoints, edge case coverage. "We value test design over coverage %" |
| V7 | Production readiness | Docker setup, structured logging, configuration management, performance awareness |
| V8 | AI adoption (Critical) | See §7 |

## 7. AI adoption (Critical)

| ID | Required |
|---|---|
| AI1 | `AI_WORKFLOW.md`: which AI tools were used and for what (architecture, coding, testing, debugging, documentation) |
| AI2 | `AI_WORKFLOW.md`: **at least 2** examples where AI output was wrong or suboptimal and how it was corrected |
| AI3 | `AI_WORKFLOW.md`: **at least 1** example where an AI suggestion was rejected, and why |
| AI4 | `AI_WORKFLOW.md`: prompting strategy (full context? small prompts? system prompts / rules files?) |
| AI5 | Git log shows iterative development (not one giant commit) |
| AI6 | Meaningful commit messages |
| AI7 | Evidence that AI-generated code was reviewed and refined (not blind copy-paste) |

What they say they are looking for: can you **direct** AI to production-quality
code, **identify** when it is wrong, **debug** AI-generated code, and
**explain and extend** it. 90% AI-generated code is explicitly fine.

## 8. Deliverables

| ID | Deliverable |
|---|---|
| D1 | GitHub repository with clean commit history |
| D2 | `README.md`: architecture overview (diagram is a plus) |
| D3 | `README.md`: setup instructions (must work with `docker compose up` or clear step-by-step) |
| D4 | `README.md`: API documentation (endpoints, request/response format, error codes) |
| D5 | `README.md`: database schema explanation and design decisions |
| D6 | `README.md`: trade-offs and what you would change at scale |
| D7 | `AI_WORKFLOW.md` |
| D8 | Estimation: provide your time estimate **before starting** |

## 9. Ambiguities and how we read them

Each of these is a place where the brief does not decide and a wrong guess
changes what gets built. The chosen reading is recorded in the decision log
(`03-decision-log.md`) under the ID in the last column. The readings below
are the ones standing after the debate rounds, the owner's catalog
requirement and the owner's time-model change. A1, A3, A5 and A7 changed in
round 1; A5 changed again in round 2; A2 changed with the owner's
requirement; A1 and A6 changed with the time-model change after round 3,
and A1 again in round 4.

| # | Ambiguity | Chosen reading | Decision |
|---|---|---|---|
| A1 | Is `date` a calendar date or an instant? The field is called "date", yet the brief asks for a timezone strategy. | `date` is a field name, not a type. One format: an ISO-8601 / RFC 3339 date-time with `Z` or an offset; a date alone is a 400 that shows the fix. Store the UTC instant as the only time key, and the offset the client sent for display only. A client that knows only the day chooses the time. Periods are cut by the caller, in whatever zone it chooses: filters take half-open instant ranges. | D-09 |
| A2 | Are exercises free text or references to a catalog? | Free text, normalised to a key. A catalog adds muscle groups when it knows the key. The catalog is data in the database, seeded from a JSON file (each item once) and maintained through admin endpoints (§11). Entries hold no reference to it, so unknown exercises are accepted and a catalog change never touches logged history. | D-07, D-27 |
| A3 | Epley at `reps = 1` gives `weight × 1.033`, which over-states a lift the athlete actually performed. | The brief's formula for every rep count, `reps = 1` included (100 kg × 1 → 103.33). The README notes the 3.3 % overestimate. *The first proposal — a one-rep set counts as its own weight — was rejected after the debate: the brief is the specification being graded.* | D-12 |
| A4 | Is bulk logging atomic? | Yes: all entries are stored or none. | D-14 |
| A5 | What does "handle concurrent writes" mean for two simultaneous logs of the same exercise? | No lost writes, no partial batches, no PR races: writes are inserts only and PRs are computed on read. Two identical requests are stored as two entries, and the README says so. An `Idempotency-Key` for client retries is not in the plan; the README describes it as the next step. | D-15 |
| A6 | Who defines "this month"? | The caller, by passing two explicit ranges of instants (half-open, `[from, to)`) cut in a zone the caller chooses (its viewer's, or a client's when it knows it). No server-side notion of the user's zone on reads; "now" is used only to refuse a workout logged in the future. | D-13 |
| A7 | Is `userId` in the path, the query or the body? What type is it? | Path segment (`/users/{userId}/…`), opaque string ≤ 64 chars. A `userId` in the body is accepted when it equals the path value; a different value is a 400. | D-17 |
| A8 | "Highest volume set" — per set or per session? | Per single set, as the words "single"/"set" suggest. | D-11 |
| A9 | Is zero weight valid (bodyweight exercises)? Zero reps? | Weight `≥ 0` allowed; reps must be `≥ 1`. | D-18 |
| A10 | Is an unknown user an error? | No. There is no user store (T4); an unknown user simply has no entries → 200, empty. | D-17 |
| A11 | Are update/delete of entries required? | No. Not in the brief; the log is append-only in v1. | D-06 |

## 10. Explicitly out of scope (v1)

Authentication/authorisation, editing or deleting entries, a users table,
coach↔client relationships, rate limiting (gateway concern), metrics/tracing,
a frontend or admin screen, multi-region deployment. Each is mentioned in
"what changes at scale" rather than built.

**What "no authentication" means for the catalog.** T4 covers the whole API,
and §11 adds write endpoints for the catalog. Those endpoints are therefore
**open to anyone who can reach the API** in v1. A guard is written and
tested and is two commented-out lines away from closing them; the design
(§10.7), the README and the OpenAPI document all say so.

## 11. Added by the owner, beyond the brief

| ID | Requirement | Reading |
|---|---|---|
| O1 | The exercise catalog is maintained without a developer. Exercises are updated often; adding or changing one must not need a code change or a deploy | The catalog lives in the database behind the existing `ExerciseCatalog` abstraction. Admin endpoints add, update and remove exercises. The JSON file becomes the initial seed, applied by a step that a fresh `docker compose up` runs. |
| O1.1 | Authorization is off for now; the guard must be easy to enable later; the documents must say openly that the write endpoints are unauthenticated | A written and tested guard, applied by uncommenting two lines (an import and a decorator). The open endpoints are stated in five places (design §10.7). |

The brief asks only that the mapping be "configurable (not hardcoded in
business logic)" (X2), and a file met that. O1 was added after debate round
2, when the file design's own trigger — "a need to edit the mapping without
a deploy" — was reported as already true. The decisions it led to are D-07
(revised) and D-27; the owner's six choices are listed in design §17 and in
`debate/resolution.md` §17.
