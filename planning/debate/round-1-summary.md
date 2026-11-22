# Round 1 — Summary of external reviews, with the author's comments

Five models reviewed the planning set using `04-debate-brief.md` unchanged.
Their full replies are next to this file. This file lays the rulings side by
side, says which objections I (Claude, the design's author) accept, which I
reject and why, and which of the reviewers' claims are factually wrong.

**This file is the argument, kept as it was written. The outcome is in
`resolution.md`.** The candidate approved the list in section 11.6 — the ten
recommended items and the recommended option for each of A–F — and it has
been applied to `02-design.md` and `03-decision-log.md`. Sentences below that
say a change is "recommended", "pending" or "waiting" describe the state at
the time of writing.

**Read section 11 first.** It re-checks every finding in this file against
real use — who would actually send that input, and how often — withdraws
several findings that sections 9 and 10 accepted, and holds the current list
of decisions (11.6). Where an earlier section disagrees with section 11,
section 11 is the one that stands.

The sample dates in the design's examples were replaced with neutral ones
after the reviews were collected. The same substitution was made where the
reviewers quote those examples; nothing else in their text was changed.

## 1. Who reviewed, and how much weight each deserves

| Reviewer | File | How it ran | Weight |
|---|---|---|---|
| Grok 4.7 | `round-1-grok.md` | Grok CLI, web search disabled | **High.** Read all four documents closely, found real errors in them, conceded where the design is right, labelled its own recall honestly. |
| Gemini 3.8 Flash (High) | `round-1-gemini.md` | Antigravity CLI | **Medium.** Good product-level objections; several database claims are confident but wrong or unmeasured (section 5). |
| Claude Opus 5.5 | `round-1-opus.md` | GitHub Copilot CLI, high reasoning. **Had web access**, unlike the others | **High, with a caveat.** Checked its claims against sources and found errors nobody else saw — but of its five new technical findings, three depend on inputs no real client sends (section 11). Covered in section 9, added after the rest of this file was written. |
| GPT-6.2 Astra | `round-1-gpt-astra.md` | GitHub Copilot CLI, high reasoning. **Had web access.** Read the files after the earlier factual corrections | **High, with a caveat.** The most precise reviewer: every objection comes with a worked example or a source. A worked example is not a real scenario, though — one of them used a load no gym can build, and I accepted it (11.1). Covered in section 10. |
| GPT-OSS 120B (Medium) | `round-1-gpt-oss.md` | Antigravity CLI default model — an unintended run, kept for the record | **Low.** Several objections contradict the documents it was reviewing (section 5). Counted as a vote only where it agrees with a stronger reviewer. |

Limits that apply to Grok, Gemini and GPT-OSS: **none had web access**, so no [U] or [K]
claim was independently verified by a reviewer; everything they assert about
PostgreSQL behaviour is recall. I checked two of
Grok's recalled claims against primary sources myself (section 6).

## 2. Rulings side by side

K = Keep, M = Keep with modification, C = Change.

| # | Decision | Grok | Gemini | GPT-OSS | My position after reading them |
|---|---|---|---|---|---|
| 1 | D-03 PostgreSQL over MongoDB | K (high) | K (high) | C | **Keep.** Both strong reviewers agree. GPT-OSS's "Change" argues in the same sentence that PostgreSQL's problem-fit is stronger, so it is not a usable vote. |
| 2 | D-06/D-11 per-entry maxima, PRs on read | M — drop the `max_*` columns until a benchmark fails | M — keep columns, compute in one pass | M (asks for a trigram index, unrelated) | **Keep the columns.** All agree on PRs-on-read. See 4.1. |
| 3 | D-09 instant + local date | M — client must send the calendar date itself | M — also accept date-times with no offset | M (says the `Z` rule is undocumented; it is in §8) | **Keep with one change:** an optional explicit local date. See 3.4. |
| 4 | D-12 Epley, 1 rep → the weight | **C (high)** | **C** | K | **Change to the literal formula.** See 3.2. |
| 5 | D-15 idempotency key · D-16 no trigram | M — keep D-16, cut the key from the first build | C — resolve matching exercise keys first | M (trigram + content dedupe) | **D-16 keep, with a better fallback order (3.5). D-15 becomes a stretch slice (3.6).** |
| 6 | D-04 Drizzle + SQL migrations | M — hand-written SQL only | M — prefer Kysely | M | **Keep, wording fixed:** hand-written SQL is the only migration source (3.7). |
| 7 | D-07 catalog in DB tables | M — load the file in memory | C — load the file in memory | K | **Change to in-memory.** See 3.3. |
| 8 | D-14 separate `/bulk` | M — one endpoint taking `{entries:[…]}` | K (high) | K (high) | **Keep.** See 4.2. |
| 9 | D-17 `userId` in body rejected | **M (high)** | **C (high)** | M | **Change — unanimous.** See 3.1. |
| 10 | D-05/D-22 class-validator, Jest | K | K | K | Keep. Unanimous. |
| 11 | D-08/D-24 decimal.js + NUMERIC | K | K | K | Keep. Unanimous. |
| 12 | D-26 ≈ 15 h | M — really about 20 h | M — too tight | C | **Accept: the number is too low as scoped.** See 3.8. |

Everything else the reviewers conceded as right, without dissent from a strong
reviewer: append-only entries and sets, keyset pagination with a total order,
unknown exercises accepted with no foreign key, empty results as 200, atomic
bulk, one unit registry, originals echoed verbatim, caller-supplied compare
ranges, no content-hash dedupe, no unique constraint on (user, exercise, time).

## 3. Objections I accept — recommended changes

### 3.1 Accept `userId` in the body when it equals the path (D-17) — unanimous
Path stays authoritative. Body `userId` missing: fine. Equal to the path: fine,
not stored twice. Different: 400 naming the field. All three reviewers raised
it, the decision log already listed it as the thing that would change my mind,
and the cost is about half an hour. The brief lists `userId` among the entry's
fields, so a reviewer's first request is likely to include it.

### 3.2 Use the literal Epley formula at one rep (D-12) — Grok and Gemini
I proposed the deviation and I now think it was the wrong trade. Grok's
argument is the better one: no auto-grader is needed, a person with the brief
open and a one-rep set will calculate 103.33 and see 100. The literal formula
can never be marked wrong; the deviation can. The domain point is not lost —
it goes in the README as a considered and rejected alternative.
Gemini's supporting evidence ("automated grading harnesses commonly assert…")
is speculation presented as recall and should not be repeated in an interview;
the conclusion stands without it.
Cost: none. *This is the candidate's call, because it is a position they
defend out loud; my recommendation is literal.*
*Section 11.4: "can never be marked wrong" is true for a grader, not for a
lifter — a single at 100 kg is a one-rep max of 100. Still my recommendation;
no longer "settled".*

### 3.3 Load the exercise catalog from the file into memory (D-07) — Grok and Gemini
Drop the two catalog tables, `ix_emg_group`, the sync script and the compose
step. The service reads and validates `config/exercise-catalog.json` at boot
and fails to start if it is invalid; the muscle-group filter becomes
`exercise_key = ANY($keys)`. "Configurable, not hardcoded in business logic"
is still met, the `ExerciseCatalog` interface is unchanged, and the decision
log named this as the fallback. Grok's point that the sync creates a second
copy that can drift from the file the reviewer is reading is fair. Saves
0.5–1.5 h.

### 3.4 Time model: one weakness is real; I disagree with both proposed fixes (D-09)
- **Real (Grok):** JavaScript's `toISOString()` always emits `Z`, so a typical
  client would store the UTC day as the "local" day — the exact mistake this
  design was meant to avoid. I under-weighted how common that input is.
- **Real (Grok):** the design allowed parsing with `Date`. The local date must
  be taken from the text of the input, never from a parsed `Date`, or it
  silently becomes the UTC or server-zone day. This should become a rule, not
  a builder's choice.
- **Grok's fix** — `date` accepts only `YYYY-MM-DD`, with a separate optional
  `performedAt` — rejects a date-time in the field the brief calls `date`.
  That is the same first-request hostility as rejecting `userId`.
- **Gemini's fix** — accept date-times with no offset — keeps an ambiguous
  instant in the database. Its claim that accepting date-only while rejecting
  offset-less date-times is "contradictory" is wrong: a bare date has an
  unambiguous calendar day and no claimed instant; an offset-less date-time
  claims an instant it cannot identify.
- **My recommendation:** keep the §8 table and add an optional `localDate`
  (`YYYY-MM-DD`) that, when sent, is stored as `performed_on` unchanged.
  Clients that only have a `Z` instant can then state the athlete's day.
  About half an hour. *Worth a second-round question to the reviewers.*
- *Revised in 11.2 (C):* my reply to Gemini above answers its wording, not
  its scenario. Date-times with no offset are an ordinary input and should
  not get a bare rejection.

### 3.5 Benchmark discipline and fallback order (D-16) — Grok
- The planned seed makes each 50 000-entry user about half the table, so the
  planner may choose a sequential scan and the `EXPLAIN` in the README would
  not show the index plan the design describes. Seed roughly ten times more
  background rows.
- The fallback list is in the wrong order for history: per-metric PR indexes
  do nothing for a slow name filter. Split it — history over budget: a small
  `user_exercises (user_id, exercise_key)` table, resolve the term there, then
  filter by key list; PRs over budget: per-metric indexes.
- Gemini's proposal (resolve matching keys first) is this same fallback, and
  it has one real advantage worth stating: a term that matches nothing returns
  immediately instead of walking 50 000 index entries.

### 3.6 Make the idempotency key the first thing to cut (D-15) — Grok
Grok is right that the brief's concurrency case has no client header, and that
the design's actual answer to it is already there: inserts only, PRs computed
on read, bulk in one transaction. The key solves client retries, which the
brief does not ask about. I would not delete it — it is a genuine
production-readiness signal — but it moves to the last, optional slice
(about 2 h recovered if time is short). Gemini's pool-starvation concern is
real only in a burst of same-key requests and is covered by adding a
`lock_timeout` next to the `statement_timeout` already planned.

### 3.7 Say one thing about migrations (D-04) — Grok
The decision says "drizzle-kit-generated migrations" and the rule under it
says hand-written SQL is the source of truth. Make it: migrations are
hand-written SQL only; `schema.ts` exists for query types and is kept honest
by integration tests that run the real SQL. Kysely stays the fallback.

### 3.8 The estimate (D-26) — all three
With every slice as designed this is closer to 18–20 h than 15. With 3.3 and
3.6 applied, about 15–16 h plus buffer is defensible. Cut order if more must
go: idempotency → property-based tests → `GET …/{id}` → Swagger UI. Never
cut: compare, the benchmark, Docker, the unit registry, the timezone write-up.
The number stated to Everfit is the candidate's to own.

### 3.9 Small items accepted
- Keep rejecting `reps = 0`, and say in the README that a failed attempt is
  not a set (Grok).
- Clamp the upper date bound to the cursor's date in the history query, so the
  planner question Gemini raised cannot arise; confirm with `EXPLAIN`.
- Cursor bound to its filters (Grok, +0.5 h): reasonable but optional — reusing
  a cursor with different filters gives a different walk, not wrong data.
  *Section 11.2: not built; one README line.*

## 4. Objections I reject

### 4.1 Drop the `max_*` columns and compute PRs by joining sets (Grok)
Grok trades one duplication for a worse one. Today each formula exists once,
in TypeScript, and the stored value is its output, checked by an integration
test. Without the columns, the formulas must also be written in SQL (Grok
supplies the expressions), so volume and Epley are defined in two languages
and must be kept in agreement, including rounding. The join also reads about
200 000 set rows three times for the single-exercise worst case. Entries are
immutable, which is what makes the stored values safe. I would keep them; if
the candidate prefers the smaller schema, the benchmark can measure both.
Gemini's variant (one aggregate pass, then find the winners) is a legitimate
alternative way to write the same query and is left to the builder.

### 4.2 One write endpoint instead of two (Grok)
"Two DTO stacks, two error paths" overstates it: the single route is the bulk
route with one entry, sharing the DTO and the service. Two reviewers ruled
Keep with high confidence. The single-entry route keeps the plainest request
shape for the plainest use.

### 4.3 Trigram index now (GPT-OSS)
Already considered and gated on the benchmark. A global trigram index does not
help a query that is scoped to one user and ordered by date. Grok and Gemini
both prefer key resolution over trigram as well.

### 4.4 Content-hash dedupe when no key is sent (GPT-OSS; implied by Gemini)
Rejected again: it silently drops a real second identical session. Grok
independently reached the same conclusion.

### 4.5 "History partial match is a blocker" (Gemini)
Severity overstated. It is one index-only pass over at most 50 000 small index
entries for one user; Grok judges it plausibly inside 100 ms, and neither
number is measured. It stays what the design said it was — a benchmark gate
with a named fallback — now with the better fallback from 3.5.

### 4.6 Replace Drizzle with Kysely now (Gemini)
Not on the evidence offered: the claim about what Drizzle cannot express is
recall, and the design no longer depends on it. Kysely remains the fallback.

## 5. Reviewer claims that are factually wrong

Listed so they are not carried into the design or an interview answer.

**GPT-OSS 120B**
- "`numeric(9,3)` may overflow at 500 kg." It holds values up to 999 999.999.
- "The bulk cap is not enforced." It is a validation rule in §9.1.
- "The `Z` rule is undocumented." It is a row in the §8 table and a listed trade-off.
- "No benchmark script is provided." This is a design; §11 specifies it.
- UUIDv7 primary-key collision risk needing a retry: not a realistic concern.
- Its "Claims I re-checked" table is empty, while the text cites verified IDs
  for things those IDs do not say.

**Gemini 3.8 Flash**
- "Remove `MATERIALIZED` so PostgreSQL can push the limits into the scan."
  A CTE referenced more than once is materialised anyway (Grok says the same),
  and no index is ordered by the maxima, so nothing could be pushed down.
- "Three 50 000-row in-memory sorts." With `LIMIT 1` each is a single pass
  keeping one row, not a full sort.
- "`ix_entries_exercise` was abandoned." It serves the PR queries.
- "Search the in-memory catalog to resolve partial names." Unknown exercises
  are loggable, so the catalog does not contain every key; only the user's own
  distinct keys can resolve a term.
- "Automated grading harnesses commonly assert…" and "standard HTTP clients
  break on…" are offered as recalled facts with nothing behind them.
- The planner claim about `BETWEEN` combined with a row comparison is
  unverified; Grok recalls the opposite. Neutralised by 3.9 either way.

**Grok 4.7**
- "`uuidv7()` has millisecond resolution and the rest is random." The
  PostgreSQL 18 manual describes it as millisecond precision **plus a
  sub-millisecond timestamp** plus random. Grok's practical advice — do not
  rely on it for ordering inside one request without a test — is still sound
  and was adopted (section 6).
- Otherwise I found no wrong claim; its recalled items are labelled as recall.

## 6. Errors in my documents that the reviews found — already corrected

These are facts, not decisions, so they were fixed directly.

| Found by | Error | Fix |
|---|---|---|
| Grok | The decision log said "no cap on reps" while the design caps reps at 1 000 | D-12 text corrected |
| Grok | The PR query showed a fixed date predicate; with no dates it would match nothing | §9.3: predicate added only when dates are sent |
| Grok | PostgreSQL 18's Docker image moved its data directory; a volume at the old path would not persist. **Verified** against the image's own documentation | §13 and research note V-3 |
| Grok | The compare endpoint did not state the `from > to` rule for its second pair | §9.4 |
| Grok | The muscle-group parameter was compared as sent, though matching is case-insensitive | §9.2 |
| Grok | "Newest-logged first" was claimed for entries created in one request without a test | §8: integration test added to the plan |

## 7. What the candidate needs to decide

*Superseded: the current list is in section 11.6.*

1. **Epley at one rep** — literal (recommended) or keep the deviation.
2. **Body `userId`** — accept when equal to the path (recommended, unanimous).
3. **Catalog** — in-memory file (recommended) or keep the tables.
4. **`localDate`** — add the optional field (recommended), adopt Grok's
   stricter contract, or leave the time model as is.
5. **Idempotency key** — stretch slice (recommended), core, or cut.
6. **Estimate** — the figure to state before coding.

Decided since: the changes are in `02-design.md` and `03-decision-log.md`, and
the outcome is recorded in `resolution.md` as the debate brief describes.

## 8. Suggested second round

Give Grok and Gemini each other's file and this summary, and ask only about
the open disagreements: the `max_*` columns (4.1) and the time-model fix
(3.4 and 9.2). Opus's votes settled the rest.

*After section 11:* a second round is only worth running with the realism
rule now in the debate brief (rule 8) and with section 11 handed over, so the
reviewers can attack the audit itself.

## 9. Addendum — Claude Opus 5.5

Opus ran the same unedited brief through the GitHub Copilot CLI. Two things
make it different from the others: it had web access, so some of its claims
are checked rather than recalled; and it is the same model family as the
design's author, so agreement from it is weaker evidence than agreement from
Grok or Gemini. Its disagreements are the useful part.

### 9.1 Where its votes land

| # | Decision | Opus | Effect on my position |
|---|---|---|---|
| 1 | D-03 PostgreSQL | Keep (high) | Keep — now with evidence, see 9.4 |
| 2 | D-06/D-11 per-entry maxima | **Keep** | Confirms 4.1 against Grok. It adds the reason I missed: `workout_sets` has no `user_id`, so the join version needs ~50 000 key probes. |
| 3 | D-09 time model | Modify — optional IANA `timeZone` | **Changes my recommendation**, see 9.2 |
| 4 | D-12 Epley | Change → literal | Three strong reviewers now say literal |
| 5 | D-15 idempotency | Modify — keep it, answer 409 while in flight | **Changes my recommendation**, see 9.3 |
| 5 | D-16 no trigram | Keep | Keep |
| 6 | D-04 Drizzle | Modify — add a schema drift check | Accept the wording fix; the drift check is optional (+0.25 h) |
| 7 | D-07 catalog | Change → in memory | Three strong reviewers agree. Opus adds a technical reason: the `IN (subquery)` form can be planned as a hash join that loses index order (recalled, not verified). |
| 8 | D-14 `/bulk` | Keep | Confirms 4.2 against Grok |
| 9 | D-17 body `userId` | Modify — accept if equal | Now four out of four |
| 10 | D-05/D-22 | Keep | Keep |
| 11 | D-08/D-24 decimal + NUMERIC | **Modify — store kg exactly** | New; accepted in 9.5, **retracted in 11.1** |
| 12 | D-26 estimate | Modify — 17–19 h, commit a cut list | Consistent with 3.8 |

### 9.2 Time model — I now prefer Opus's fix to my own
All three strong reviewers agree the `Z` problem is real and each proposes a
different fix. Mine (3.4) was an optional `localDate`. Opus proposes an
optional `timeZone` (an IANA name such as `Asia/Ho_Chi_Minh`): when sent, the
local date is computed from the instant in that zone, and a date-time with no
offset becomes acceptable because the zone says what it means. That is the
better contract — a client already knows its zone and cannot get the
arithmetic wrong — and it answers Gemini's objection too. Opus also points out
that a date-only entry currently returns an invented midnight instant; it
should return `performedAt: null`.
**Recommended:** `timeZone` plus `performedAt: null` for date-only entries.
Skip Opus's two extra columns (stored offset and zone name) unless time
allows. About 0.75 h instead of 0.5 h.

### 9.3 Idempotency — if it is built, build it Opus's way
Grok says cut it; Opus says keep it and fix it. Opus's fix is correct on the
substance: the IETF draft says a retry that arrives while the original is
still running gets **409**, not a delayed replay, and my design made the
second request wait while holding a database connection. With a pool of 10
and the planned 20-parallel test, that can stall the first request too.
The fix is a short `lock_timeout` mapped to 409 with `Retry-After`, every
query in the transaction on the transaction's own connection, and the
response built after commit.
**Recommended:** unchanged on scope — still the last, optional slice — but the
design text changes to the 409 behaviour either way.
*Section 11.2: the stall needs my own 20-request test to happen; no real
client sends that. Reduced to "the second request waits, then replays", with
`lock_timeout` kept as a one-line guard.*

### 9.4 A checked fact that changes the top debate item
The planning set listed "Everfit runs on MongoDB" as unverified and as the
main risk in choosing PostgreSQL. Opus found Everfit's own Node.js backend
job posting; I opened the page and confirmed the line: "Experienced with
Express.js, MongoDB, Redis, and PostgreSQL". PostgreSQL is in their stack.
Two consequences: D-03 is much safer than the documents said, and the same
line names **Express, not NestJS** — worth one sentence in the README on why
NestJS was chosen. Opus's suggestion of a short README section, "the same
design in MongoDB", is cheap and answers the obvious interview question.

### 9.5 New technical findings — accepted when written; three since withdrawn
None of the other reviewers raised these. The last column was added by the
realism audit in section 11.

| Finding | Why it matters | Change | After section 11 |
|---|---|---|---|
| The bulk insert matched returned ids to input rows by position; PostgreSQL does not document that order | Sets could be attached to the wrong entry | Generate UUIDv7 ids in the application and insert with `unnest(...)` arrays | **Kept in part:** ids generated in the application. No `unnest` |
| One bind parameter per value: 100 entries × 50 sets × 6 columns = 30 000, against a protocol limit of 65 535 | Raising the configurable caps would turn valid requests into 500s | Same `unnest` change removes the limit | **Withdrawn.** Cannot happen at the design's caps; make the caps constants |
| `timestamptz(3)` rounds rather than truncates | An instant at `23:59:59.9996` is stored as the next day while the stored local date stays on the earlier one | Truncate to milliseconds in the application before deriving both | **Withdrawn.** About 1 entry in 170 million, and nothing visible changes |
| Rounding `weight_kg` to 4 decimals undermines "exact" | Factor (8 decimals) × input (3 decimals) is exact at 11 decimals; rounding introduces the drift the design claims to avoid | Store kg at 11 decimals; only e1RM needs rounding | **Retracted (11.1).** Four decimals stay |
| The benchmark ran only after `VACUUM` | That is the best case; freshly inserted rows are exactly what page one reads | Run it twice — after `VACUUM` and after 5 000 fresh inserts — and add a rare-muscle-group case | Kept |
| "Switching to literal Epley is a one-line change" | False once data exists, because the value is stored | Decision log corrected | Kept |

Smaller points accepted: accept `lbs`/`KG` style input through aliases and
case-insensitive matching (+0.25 h, optional — *raised to recommended in
11.2*); document that cursor paging
skips entries back-dated behind the cursor; a `requests.http` or demo script
that runs every README call; a README heading for the concurrency case; the
estimate committed before the first code commit.

### 9.6 Where I do not follow Opus
- **Storing offset and zone columns** (part of its time fix): more schema for
  a display feature nobody asked for. Optional.
- **`drizzle-kit pull` drift check in CI:** sound, but it is the first thing
  to drop if the setup slice runs long.
- **Its idempotency citation** is a secondary summary of the draft, not the
  draft itself. The 409 rule matches my own recall, but read the draft before
  quoting it in an interview.
- Two of its claims are recall, labelled as such: hash joins losing order, and
  `ON CONFLICT` waiting behaviour.

### 9.7 What I verified from Opus's review
- The Everfit job posting line (page opened directly; the posting has expired
  but is still readable).
- The Drizzle issue on `INCLUDE` columns (open feature request, read directly).
- Its two claims about my own documents (the "one-line change" sentence and
  the 4-decimal `weight_kg`).

### 9.8 Revised list of decisions for the candidate

*Superseded by section 11.6.*

1. **Epley at one rep** — literal. Grok, Gemini and Opus all say so.
2. **Body `userId`** — accept when equal to the path. Four of four.
3. **Catalog** — in-memory file. Grok, Gemini and Opus.
4. **Time model** — optional `timeZone`, and `performedAt: null` for
   date-only entries (replaces my `localDate` idea).
5. **Idempotency key** — last, optional slice, designed with the 409 rule.
6. **Bulk insert mechanics, millisecond truncation, exact kg, two-pass
   benchmark** — apply; they are corrections more than choices.
7. **Estimate** — with 3, 5 and the additions above, roughly 16–18 h. Commit
   the figure and the cut list before any code.

## 10. Addendum — GPT-6.2 Astra

Same unedited brief, through the GitHub Copilot CLI, with web access. It is
the only strong reviewer from a different model family than both the author
and Opus, so where it agrees with Opus the agreement is worth more.
Its verdict is the harshest: "not ready to build as written".

### 10.1 Where its votes land

| # | Decision | Astra | Tally of the four strong reviewers |
|---|---|---|---|
| 1 | D-03 PostgreSQL | Keep (high) | 4 Keep |
| 2 | D-06/D-11 per-entry maxima | **Modify — start with the join, add maxima only if it misses the budget** | **2–2**: Grok and Astra drop, Gemini and Opus keep. See 10.3 |
| 3 | D-09 time model | Modify — keep the rules, `performedAt: null` for date-only, no timezone database | Four different fixes. See 10.4 |
| 4 | D-12 Epley | Change → literal (high) | 4 Change. Back with the candidate all the same (11.4) |
| 5 | D-15/D-16 | Modify — specify what the losing writer does; no content dedupe; substring scan is a baseline, not a promise | Scope: optional. Behaviour: see 10.2 |
| 6 | D-04 Drizzle | Keep | Keep, with the wording fix |
| 7 | D-07 catalog | Change → in memory | 4 Change |
| 8 | D-14 `/bulk` | Keep (high) | 3 Keep, Grok merges |
| 9 | D-17 body `userId` | Modify — accept if equal, also on bulk items | 4 of 4 (5 of 5 with GPT-OSS) |
| 10 | D-05/D-22 | Keep | 4 Keep |
| 11 | D-08/D-24 | Modify — never round before ranking | Opus and Astra, independently. **Retracted in 11.1** — no real load is affected |
| 12 | D-26 estimate | Change — 15 h fits a reduced scope only | All say too low |

### 10.2 New findings — accepted when written; one retracted, two withdrawn

The last column was added by the realism audit in section 11.

| Finding | Why it matters | Change | After section 11 |
|---|---|---|---|
| **The Epley exception changes which workout wins, not just the number.** `100 kg × 1` on Monday vs `96 kg × 2` on Tuesday: the brief's formula gives 103.33 vs 102.40, Monday wins; my rule reported Tuesday | The best argument yet for the literal formula — no auto-grader needed, only arithmetic | Literal formula; test the winning entry and date for this pair | The arithmetic holds; whether it is a *bug* depends on which reader is served. Candidate's call (11.4) |
| **Four-decimal kg can award a PR to the wrong day.** `40 kg` on Monday and `88.185 lb` on Tuesday both store as `40.0000`; Tuesday really lifted `40.00004…`, but the earliest-date tie-break gives Monday the record. I re-did the arithmetic: correct | Turns Opus's "exact kg" point from tidiness into a correctness bug | Store kg at 11 decimals. Rank e1RM by `weight_kg × (30 + reps)`, which is exact, and divide by 30 only for display | **RETRACTED (11.1).** `88.185 lb` is 40 kg written in pounds, not a heavier lift. Accepting this was my error |
| **Compare can disagree with itself.** The two periods are read by two queries; a write between them makes a range compared with itself show a non-zero delta | Small, real, and an easy interview question | Run both reads in one short `REPEATABLE READ READ ONLY` transaction (+0.5 h) | **Withdrawn.** Nobody compares a period with itself; no transaction |
| **The losing idempotent writer gets no row back.** `ON CONFLICT DO NOTHING RETURNING` returns nothing to the loser, and at `READ COMMITTED` the winner's row may not be visible inside that same statement | The design did not say how the loser finds the original | A second statement on the same connection; retry the claim if the key was pruned in between. Combine with Opus's 409 rule (9.3) | Second statement kept — it is the ordinary retry. The "pruned in between" retry is dropped |
| **The per-metric index fallback would not work as written.** The three "top 1" branches read a materialised CTE, which has no indexes | The fallback named in the design and in 3.5 was wrong | If PRs miss the budget, the branches must query the base table directly with matching indexes | Kept |
| **`pg` returns a SQL `date` as a JavaScript `Date` in the process's zone** | The next page's cursor could carry the wrong day on a server not in UTC | Decode `date` as text; test paging with a positive-offset process timezone | Kept — and more likely than stated (11.2 B) |
| A lone `from` or lone `to` was only illustrated with `BETWEEN` | Three of four bound shapes unspecified | `>=` / `<=` individually; test all four | Kept |
| A unit test cannot protect limits that are set by environment variables | A deployment could configure caps the columns cannot hold | Validate configured limits at startup | **Withdrawn.** The caps become constants, so there is nothing to validate |

It also independently confirmed two of Opus's points: bulk inserts need an
explicit input-to-id mapping, and date-only entries should return
`performedAt: null`.

### 10.3 The per-entry maxima are now a genuine 2–2 split
My objection in 4.1 was that dropping the columns puts the formulas in both
SQL and TypeScript, rounding included. Astra's exact-score ranking removes
most of that: with no rounding before ranking, the SQL side is just
`weight_kg × reps` and `weight_kg × (30 + reps)`. So the duplication argument
is weaker than I claimed.
What remains is performance, and nobody has a number. Opus's point stands —
`workout_sets` has no `user_id`, so the join does tens of thousands of key
probes for the single-exercise user — but it is a prediction.
Astra's proposal is the honest one: seed early, run both shapes on the same
data, assert they pick identical winners, keep whichever passes.
**Recommended:** adopt that as the plan. Build the join first (it is the
smaller schema); add the columns only if the single-exercise user misses the
budget. Cost: 0.5–1 h of benchmarking, moved to the front; it may save the
columns, their index payload and their consistency test.
This reverses my position in 4.1.

### 10.4 Time model — no consensus; the cheapest safe version
Four strong reviewers, four fixes: date-only `date` (Grok), accept offset-less
times (Gemini), optional `timeZone` (Opus), keep the rules and stop inventing
midnight (Astra). The only point with two votes is `performedAt: null` for
date-only entries.
**Recommended:** do that now (+0.4 h) and state the `Z` caveat prominently.
Treat the optional `timeZone` field as a small extra the candidate may add
(+0.5 h) — I still think it is the right API, but only Opus and I do.

### 10.5 Where I do not follow Astra
- **Remove the "not before 1970 / not after tomorrow" date bounds.** I would
  keep the future bound: a workout logged for next year is a typo, and E4
  asks for invalid dates to be handled. Dropping the 1970 floor is harmless.
- **"Not ready to build."** Every blocker it names is fixed by changes already
  on the accepted list; none requires a different architecture.
- Its 10-hour budget is a useful cut plan, not the plan.

One remark of Astra's belongs in the AI workflow write-up, not the design:
several models voting on a proposal is not evidence that generated *code* was
reviewed. The implementation phase needs its own record.

### 10.6 Final list of decisions for the candidate

*Superseded by section 11.6. Withdrawn: items 4 and 6, the array-based insert
in item 5, and the millisecond truncation and startup check in item 7. Item 1
goes back to the candidate (11.4).*

Settled by the reviews (four strong reviewers agree, or a demonstrated bug):
1. **Epley** — literal formula.
2. **Body `userId`** — accept when equal to the path.
3. **Catalog** — in-memory file.
4. **Exact kg, rank before rounding** — 11-decimal storage.
5. **Bulk insert** — explicit id mapping, array-based insert.
6. **Compare** — both periods in one read-only snapshot.
7. **Millisecond truncation, `date` decoded as text, single-sided date
   bounds, startup check of limits** — corrections.
8. **`performedAt: null`** for date-only entries.

Still the candidate's call:
9. **Per-entry maxima** — benchmark the join first (recommended, reversed
   from 4.1) or keep the columns from the start.
10. **`timeZone` field** — add it (my preference) or document the `Z` caveat only.
11. **Idempotency key** — optional last slice (recommended), with the 409
    rule and the second-statement lookup if built.
12. **Estimate** — roughly 16–18 h with all of the above; commit the figure
    and a cut list before any code.

## 11. Realism audit — every finding re-checked against real use

Written after the candidate challenged one finding I had accepted: a load
such as `88.185 lb` does not exist in a gym. That is correct, and it showed a
gap in how sections 3, 9 and 10 were written. I had checked the reviewers'
claims for arithmetic and against the documents. I had not checked whether a
real client or a real lifter would ever produce the input.

This section applies one test to every item — accepted, rejected, and my own:
**who sends this, how often, and what do they see?** A finding with no
believable sender is contrived, however correct its sums.

### 11.1 Retracted — "four-decimal kg can award a PR to the wrong day"

Accepting this (10.2, with Opus's related point in 9.5) was my mistake.

- `88.185 lb` is not a second, heavier lift. It is `40 kg` written in pounds
  to three decimals (40 kg = 88.1849… lb). The 0.04 g "difference" is the
  rounding of that conversion, not iron on the bar.
- Real loads move in plate steps: 0.5 kg or 2.5 lb usually, 0.25 kg or
  0.5 lb with small plates, 0.125 kg or 0.25 lb with micro-plates.
  Competition plates are made to about ±10 g (recalled); ordinary gym plates
  are far looser. Four decimals of a kilogram is 0.1 g — a hundred times
  finer than the best plate.
- So in the reviewer's own example the two sets are the same lift, and
  leaving the record with the earlier day is the right answer. Eleven
  decimals would have made the product *worse*: a lifter who repeats 40 kg
  and logs it in pounds would be told they beat their record, by 0.04 g.

What I measured, instead of taking the example on trust:

| Check, using only loads a gym can build | Result |
|---|---|
| kg loads and lb loads up to 500 kg that truly differ but store as the same four-decimal kg | Micro-plate steps (0.125 kg, 0.25 lb): 3 pairs, each under 0.04 g apart. Usual steps (0.5 kg, 2.5 lb): none |
| Heaviest-weight ranking over 126 000 sets (kg in 0.25 steps to 500, lb in 0.5 steps to 1 100, 1–30 reps) | No pair out of order, no false tie |
| Volume ranking over the same sets | 218 pairs, out of about 8 billion, tie or swap. Largest true difference: 1.2 g of total volume |
| Estimated-1RM ranking over the same sets | 222 pairs tie or swap. Largest true difference: under 0.1 g |
| A pound set's volume shown back in pounds at two decimals | Exact for all 132 000 sets up to 30 reps. Between 31 and 50 reps about 1 set in 75 is off by 0.01 lb (first case: `6 lb × 50` shows 300.01) |

**Ruling.** `weight_kg` stays at four decimals, as designed. No "exact kg"
change. If the 0.01 lb case bothers the candidate, six decimals removes it
with the same code; eleven buys nothing. Ranking e1RM by
`weight_kg × (30 + reps)` remains a tidy way to avoid a division in SQL, not
a bug fix. Opus's supporting example needed a 1 000-rep set and falls with
the same argument.

### 11.2 Every other item, by verdict

**A. Contrived — withdrawn or reduced**

| Item (where accepted) | Why no real client or lifter produces it | What is left |
|---|---|---|
| `timestamptz(3)` rounds an instant across midnight (9.5) | Needs sub-millisecond input landing in the last half-millisecond of a day: about 1 entry in 170 million. The stored date comes from the text of the request, so nothing visible changes even then | Nothing required |
| 65 535 bind-parameter limit; `unnest` rewrite (9.5) | The largest request the design allows is about 31 000 parameters. A real session is 5–12 exercises of 3–6 sets — a few hundred. It only fails if someone raises the caps | Make the caps constants in code, not environment settings. Plain multi-row insert |
| Startup check of configured limits (10.2) | Exists only because I made the caps configurable, which nobody asked for | Gone with the row above |
| Compare "disagrees with itself" (10.2) | Needs a period compared with itself, or a write landing in the few milliseconds between two reads. Nothing wrong is stored and a refresh corrects it | No transaction. Free if both periods happen to be one SQL statement; otherwise skip |
| Connection-pool stall from same-key requests (3.6, 9.3) | The burst came from my own test: 20 identical requests at once. A real client sends a double-tap (two at once) or a retry after a timeout (one after the other) | The second request waits for the first, then replays its response. `lock_timeout` stays as a one-line guard; if it ever fires, answer 409 with `Retry-After` — Opus's rule, as the exception instead of the normal path. Test resized in 11.3 |
| "Retry the claim if the key was pruned in between" (10.2) | A key would have to expire in the same instant its own retry arrives | Dropped |
| Cursor tied to its filters (3.9; Opus) | Reusing a cursor under different filters is a client bug, and it produces an odd page, not wrong data | Not built. One README line |
| Entries back-dated behind a cursor are skipped (9.5) | Real but harmless: someone adds an old workout on one device while scrolling on another; it appears on the next load | README line, as already planned |

**B. Realistic — kept**

| Item | Who hits it, and how often |
|---|---|
| A `Z` instant files the workout under the wrong day (3.4, 9.2) | Every JavaScript client by default (`toISOString()`). In Vietnam (UTC+7) any workout before 07:00 goes to the previous day. On the US west coast (UTC−8) every workout from 16:00 on — the whole after-work crowd — goes to the next day. The most realistic finding of the round |
| `performedAt: null` for date-only entries (9.2, 10.4) | Anyone logging a past workout by date. An invented midnight displays as the previous afternoon across the Americas |
| Local date taken from the request text, never through a `Date` object (3.4) | Every request. One wrong helper shifts every date |
| A SQL `date` comes back as a JavaScript `Date` in the process's zone (10.2; recalled, to confirm when building) | Every response when the process is not in UTC. That is the candidate's own laptop outside Docker — and Docker, which runs in UTC, would hide it. Read `date` as text; run the tests with `TZ=Asia/Ho_Chi_Minh` |
| Body `userId` accepted when equal to the path (3.1) | A reviewer's first request, built from the brief's field list |
| Catalog loaded into memory (3.3) | Catalog changes arrive with a deploy; no admin screen is in scope |
| Ids generated in the application for bulk inserts (9.5) | I cannot show PostgreSQL returning rows out of order in practice. Kept for another reason: it is less code than matching by position, and the order of exercises inside a session is something lifters care about |
| Second lookup for the losing idempotent request (10.2) | This is the ordinary retry: the first request committed, its response was lost, the client sends again |
| Lone `from` or lone `to` (10.2) | "Everything since the start of the year" is an ordinary question |
| Benchmark after fresh inserts, with a rare muscle group and a term that matches nothing (9.5) | Page one always reads the newest rows; search-as-you-type sends typos all day |
| Corrected fallbacks (3.5, 10.2) | Not a scenario — a fallback named in the plan has to be one that works |
| Reject `reps = 0`; reject dates in the future (3.9, 10.5) | A mistyped year is common; a failed attempt is not a set |
| No content-hash dedupe (4.4) | Two identical entries in one session are normal — pull-ups 3 × 10 before and after the main lift. The server cannot tell a retry from a repeat. Rejection stands |
| Idempotency key, optional and last (3.6) | Retries after a timeout on a phone are where real duplicates come from; the brief does not require the key |
| README: why NestJS; "the same design in MongoDB" (9.4) | The first interview question from a team whose posting lists Express and MongoDB |

**C. Upgraded — I had these as optional, or had rejected them**

| Item | Who hits it | Now |
|---|---|---|
| Unit spelling: `lbs`, `KG`, `Kg`, `kgs` (9.5, "optional") | "lbs" is the everyday spelling. A first request with `"unit": "lbs"` answered by a 400 is the same mistake as rejecting body `userId` | **Recommended.** Case-insensitive, with aliases kept in the unit list — the same place `stone` / `st` would go |
| Date-times with no offset (Gemini; dismissed in 3.4) | Three ordinary senders: a hand-typed curl, Python's `isoformat()`, an HTML `datetime-local` field | **Recommended:** accept when `timeZone` is sent; otherwise a 400 that names the three ways to fix the request (add an offset, send `timeZone`, or send the date alone) |
| `timeZone` field (10.4, "small extra") | Follows from the first row of table B | **Recommended**, not an extra |

Items with no scenario to test are unchanged. Matters of taste: one write
endpoint (4.2), a trigram index before measuring (4.3), Kysely (4.6).
Wording and plan corrections: migrations (3.7), the date clamp in 3.9, the
document errors in section 6. Section 5 (reviewer claims that are factually
wrong) is unaffected. Gemini's "partial match is a blocker" (4.5) stays a
benchmark gate — a term that matches nothing walks all of a user's index
entries however their exercises are spread, so the realistic seed does not
make it go away.

### 11.3 Unrealistic assumptions in my own design

The same test, turned on the documents I wrote.

1. **The benchmark's heavy user.** "50 000 entries in five years across about
   60 exercises" is 27 entries a day, every day. A committed lifter logs
   1 000–2 500 a year (four to six sessions a week, five to eight exercises
   each). The brief's 50 000 therefore means decades of training or an
   imported history. Realistic seed: 50 000 entries over 20–25 years, about
   150 distinct exercises, skewed so the most-trained exercise has
   2 500–4 000 entries, about four sets each. Around that user, enough
   other users that the heavy one is a small share of the table, as it would
   be in production (Grok's point in 3.5 — realistic, kept).
2. **The single-exercise user.** 50 000 entries of one exercise is one
   exercise logged daily for 137 years. Not a lifter — but exactly what a
   reviewer's quick seed loop produces. Keep it as a "does not fall over"
   check with a looser budget; stop letting it drive the schema.
   Consequence for 10.3: with about 3 000 entries per exercise the join reads
   some 12 000 set rows, which makes "build the join first" the likely winner.
3. **Twenty identical parallel requests** as the idempotency test. Realistic
   shape: two at once (double-tap) plus one later (retry) → one entry, same
   response. For the brief's concurrency case (E5), a burst of *different*
   writes kept below the pool size. Parallelism in a test is there to provoke
   a race, not to imitate a client.
4. **Limits as environment settings.** Nobody asked for it, and it produced
   two reviewer findings on its own. Constants.
5. **Lowercase-only unit codes** and **a bare rejection of offset-less
   date-times** — both in table C.
6. **The debate brief** told reviewers to attack and never asked who would
   send the input. That invited correct-but-contrived examples. A rule was
   added to `04-debate-brief.md`, marked as added after round 1.
7. **Weight ≤ 10 000 and reps ≤ 1 000** are typo guards, not statements about
   lifting (the heaviest barbell lifts are around 500 kg). Three input
   decimals are needed and enough: 0.125 kg micro-plates exist.

What E5 ("same user logging same exercise at same time") looks like in real
use: a double-tap, two devices syncing one session, a coach and a client
both entering the workout — Everfit is a coach-and-client product. The
design's answer holds for all three: no write is lost or torn. A retry is
made safe by the optional key. Two people typing in the same set is a
product question; no server rule can tell it from a real second set.

### 11.4 Epley at one rep — the test cuts both ways

Sections 3.2, 9 and 10 call this settled: four reviewers say literal. Under
this section's test it is a choice between two real readers.

- **The grader** has the brief open, takes `100 kg × 1` and expects 103.33.
  Realistic; it happens once, at grading.
- **The lifter** who lifted 100 kg once has a one-rep max of 100 kg, not
  103.33, and the formula's own source states it for more than one rep
  (research note V-6). Realistic; it happens on every heavy single.
- The two rules crown different workouts. Astra's own pair (10.2),
  `100 kg × 1` against `96 kg × 2`: the literal formula gives 103.33 against
  102.40, so the single wins; with the exception it is 100 against 102.40, so
  the double wins. Astra read that as a bug in the exception. A lifter could
  as fairly read it as the formula flattering the single.

So this is not "settled by a demonstrated bug", and it moves back to the
candidate. My recommendation is still the literal formula, with the README
stating the one-rep overestimate and that the exception is one line: the
brief is the specification being graded, and the README carries the lifting
knowledge at no risk. The candidate knows lifting and will defend the choice
aloud, so it is theirs.

### 11.5 Effect on the estimate

Out: the exact-kg change, the array insert, the compare transaction, the
startup check, cursor binding — about an hour and a half. In: unit aliases
(+0.25 h) and the handling of date-times with no offset (+0.25 h). The
`timeZone` field itself was already inside the earlier figure. The 16–18 h in
10.6 becomes roughly **15–17 h**. Still the candidate's number to state.

### 11.6 Current list of decisions (replaces 7, 9.8 and 10.6)

**Recommended, each with a real sender behind it**
1. Body `userId` accepted when equal to the path, on single and bulk items.
2. Exercise catalog loaded into memory from the JSON file.
3. `weight_kg` stays at four decimals. *(Reverses 10.6 item 4.)*
4. Bulk insert: ids generated in the application in input order; plain
   multi-row insert; caps are constants.
5. Dates: `performedAt: null` for date-only entries; the local date is never
   derived through a `Date`; SQL `date` read as text; tests run in a non-UTC
   process zone.
6. Unit codes case-insensitive, with aliases.
7. `from` and `to` each usable alone.
8. Benchmark: the realistic seed from 11.3, run after `VACUUM` and again
   after fresh inserts, with a rare muscle group and a no-match term. The
   single-exercise user is a secondary check.
9. If the idempotency key is built: second lookup for the losing request,
   wait-then-replay, `lock_timeout` guard.
10. README notes: the one-rep Epley question, `reps = 0`, back-dated entries
    while paging, why NestJS, the same design in MongoDB.

**Withdrawn as contrived**
11-decimal kg · millisecond truncation · compare snapshot transaction ·
`unnest` and the bind-parameter limit · startup check of limits · the
"pruned key" retry · cursor bound to filters · the 20-request same-key test.

**The candidate's call**
- **A. Epley at one rep** — literal (recommended) or the one-rep exception (11.4).
- **B. `timeZone` field** — add it (recommended, more strongly than in 10.4)
  or only document the `Z` caveat.
- **C. Date-times with no offset** — accept with `timeZone`, helpful 400
  otherwise (recommended), or keep the bare rejection.
- **D. Per-entry maxima** — build the join first and measure on the realistic
  seed (recommended), or keep the columns from the start.
- **E. Idempotency key** — optional last slice (recommended).
- **F. Estimate** — about 15–17 h; commit the figure and a cut list before
  any code.

**Outcome.** The candidate approved items 1–10 and took the recommended
option on A–F. The list has been applied to `02-design.md` and
`03-decision-log.md`; the per-decision record is `resolution.md`.
