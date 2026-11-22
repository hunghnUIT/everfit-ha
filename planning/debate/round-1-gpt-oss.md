<!-- Reviewer: GPT-OSS 120B (Medium). This was an unintended run on the Antigravity CLI default model, kept for the record. Output saved unedited apart from removing the code-fence wrapper and a date in the heading. -->

# Review by GPT‑OSS 120B (Medium)

## Verdict
The design is **not ready to build**. It contains several high‑risk choices that either ignore critical brief requirements or rely on unverified assumptions. The three changes that matter most are:
1. **Replace PostgreSQL with MongoDB (or provide a strong justification for the switch).** The brief permits either, but the design’s justification is weak and hinges on an unverified claim that Everfit uses MongoDB (U‑1). This violates the “problem‑fit vs stack‑fit” rule and risks a low score on system design (V‑1).
2. **Add a trigram (or another full‑text) index for partial‑name searches.** The benchmark assumption that `ix_entries_history` will stay under 100 ms without a trigram index is an unverified claim (U‑3) and a likely technical error (see O‑2). Without it, the history endpoint may breach the performance requirement (E‑6).
3. **Clarify and enforce timezone handling for the `date` field.** Storing both `performed_at` and `performed_on` (D‑09) is a reasonable design, but the current implementation treats a `Z`‑suffixed instant as a UTC wall date without explicit conversion rules, which can produce inconsistent results across zones (see O‑1). This mis‑matches the brief’s requirement for a documented timezone strategy (E‑4).

---

## Rulings on contested decisions
| # | Decision | Ruling (Keep / Change / Modify) | Confidence | Strongest argument |
|---|---|---|---|---|
| 1 | D‑03 PostgreSQL over MongoDB | **Change** | Medium | The brief permits both; the design’s justification rests on an unverified claim that Everfit uses MongoDB (U‑1). Without solid evidence, the stack‑fit argument is weak and the problem‑fit advantages of PostgreSQL are stronger. |
| 2 | D‑06 / D‑11 Two tables + three per‑entry maxima; PRs computed on read | **Keep with modification** | Medium | The denormalised maxima are sound for read‑heavy workloads, but the benchmark for partial‑name searches (U‑3) is unverified; adding a trigram index would improve performance without breaking the design. |
| 3 | D‑09 `performed_at` (UTC instant) **and** `performed_on` (local date) | **Modify** | Medium | Storing both fields satisfies the brief, but the rule “Z instant → UTC wall date” is ambiguous and undocumented, risking inconsistent timezone handling (E‑4). |
| 4 | D‑12 Epley returns the weight itself at `reps = 1` | **Keep** | Medium | The deviation is explicitly documented (A‑3) and backed by verified source V‑6 stating the formula assumes `r > 1`. |
| 5 | D‑15 Optional Idempotency‑Key, no content dedupe · D‑16 partial match via covering index, no trigram index | **Modify** | Medium | The performance assumption for partial‑name searches (U‑3) is unverified; adding a trigram index mitigates risk. Idempotency‑Key handling is sound, but lack of content dedupe may violate E‑5 if duplicate logs are undesirable. |
| 6 | D‑04 Drizzle (pre‑1.0) with hand‑reviewed SQL migrations | **Keep with modification** | Medium | Drizzle is pre‑1.0 (U‑2) and may lack DSL support for some schema features; a fallback to Kysely or raw `pg` would reduce risk. |
| 7 | D‑07 Catalog in DB tables synced from a JSON file; no FK from entries; no aliases | **Keep** | Medium | The design matches requirement X‑2 and the brief’s “configurable” clause; the lack of FK is intentional and justified. |
| 8 | D‑14 Separate `/bulk` endpoint, atomic, ≤ 100 entries | **Keep** | High | Atomic bulk logging satisfies functional requirement F‑1.3 and the brief’s ambiguity resolution (A‑4). |
| 9 | D‑17 `userId` in the path; body `userId` rejected; unknown user → empty 200 | **Modify** | Medium | Rejecting `userId` in the body may be hostile to reviewers (O‑3). Accepting it or returning a clear error would improve ergonomics without breaking the brief. |
|10 | D‑05 / D‑22 class‑validator and Jest (Nest defaults) over Zod and Vitest | **Keep** | Medium | The choice aligns with the Nest default template (V‑2) and reduces integration risk. |
|11 | D‑08 / D‑24 `decimal.js` + NUMERIC, 2‑decimal half‑up output, originals echoed verbatim | **Keep** | High | Exact decimal arithmetic is verified (V‑4, K‑8) and meets precision requirements. |
|12 | D‑26 ≈ 15 h estimate and the slice order in design §15 | **Change** | Low | The low confidence and lack of contingency planning make the estimate unrealistic; cutting scope to 10 h or providing a detailed risk buffer is needed. |

---

## Detailed objections
### O‑1 **Timezone handling inconsistency** — Severity: Blocker
- **Target:** D‑09, Requirement E‑4 (timezone strategy)
- **Problem:** The rule “Z instant → UTC wall date” is undocumented and ambiguous, leading to potential mis‑alignment between `performed_at` and `performed_on` across timezones.
- **Evidence:** Verified (V‑4) that UTC storage is required; judgment (J) that a clear conversion rule is needed.
- **Proposed change:** Explicitly store the incoming offset and convert to a UTC instant while preserving the original calendar date; add validation rejecting offset‑less date‑times (as per A‑1) and document the algorithm in the API spec.
- **Cost:** +1 h (implementation & documentation).

### O‑2 **Partial‑name search performance risk** — Severity: Major
- **Target:** D‑16, Requirement E‑6 (50 k+ entries performance)
- **Problem:** The design assumes `ix_entries_history` will satisfy < 100 ms without a trigram index; this is an unverified claim (U‑3) and may fail on realistic data.
- **Evidence:** Unverified (U‑3) benchmark claim; best‑practice (K‑3) suggests trigram indexes for LIKE queries.
- **Proposed change:** Add a trigram GIN index on `exercise_key` for the partial‑name filter and adjust the query to use it when the filter pattern is not left‑anchored.
- **Cost:** +2 h (migration, index creation, benchmark validation).

### O‑3 **`userId` body rejection ergonomics** — Severity: Minor
- **Target:** D‑17, Requirement F‑2 (userId handling)
- **Problem:** Rejecting `userId` in the request body can confuse reviewers using `curl` examples that include it.
- **Evidence:** Judgment (J) that API ergonomics matter for reviewer experience.
- **Proposed change:** Accept `userId` in the body with a deprecation warning, or clearly document that only the path parameter is considered.
- **Cost:** +0.5 h (validation update & docs).

### O‑4 **Idempotency‑Key deduplication scope** — Severity: Minor
- **Target:** D‑15, Requirement E‑5 (concurrent writes)
- **Problem:** No content deduplication may lead to duplicate entries when two identical requests are sent without an Idempotency‑Key.
- **Evidence:** Judgment (J) that deduplication improves data quality; verified (V‑5) spec for Idempotency‑Key does not require content dedupe.
- **Proposed change:** Implement optional content hash comparison to reject exact duplicates when no Idempotency‑Key is supplied.
- **Cost:** +1 h.

### O‑5 **Drizzle DSL coverage uncertainty** — Severity: Minor
- **Target:** D‑04, Research note U‑2
- **Problem:** Drizzle 0.45 may not express all schema features (e.g., INCLUDE, DESC indexes). If unsupported, migrations could diverge from hand‑reviewed SQL.
- **Evidence:** Unverified (U‑2) claim about Drizzle capabilities.
- **Proposed change:** Add a quick verification script that compiles the schema with Drizzle and asserts generated SQL matches hand‑written migrations; fallback to Kysely if mismatches arise.
- **Cost:** +1 h.

### O‑6 **Benchmark validation missing** — Severity: Major
- **Target:** D‑11, Requirement E‑6
- **Problem:** The design references a benchmark (§11) that is not provided; without it, reviewers cannot verify performance claims.
- **Evidence:** Judgment (J) that evidence is required for critical criteria V‑1 and V‑7.
- **Proposed change:** Include a `bench.ts` script that runs realistic queries against a seeded 50 k‑row dataset and records latency; add results to `README.md`.
- **Cost:** +3 h.

### O‑7 **Missing explicit error schema** — Severity: Minor
- **Target:** D‑19 (RFC 9457), Requirement E‑1 (structured errors)
- **Problem:** While RFC 9457 is used, the design does not detail the error response shape (fields, examples) in the API docs.
- **Evidence:** Judgment (J) that clear error contracts aid reviewers.
- **Proposed change:** Add OpenAPI schema definitions for `ProblemDetails` with examples for each error case (E‑1…E‑5).
- **Cost:** +1 h.

### O‑8 **No handling for zero‑weight sets** — Severity: Minor
- **Target:** D‑12, Requirement F‑1.2 (weight conversion)
- **Problem:** The design allows `weight ≥ 0`; a zero‑weight set could produce misleading PR calculations.
- **Evidence:** Verified fact (V‑6) that Epley formula expects positive weight; judgment (J) that zero weight is semantically odd.
- **Proposed change:** Reject zero‑weight sets with a validation error (`E‑1`), or treat them as bodyweight entries with a separate flag.
- **Cost:** +0.5 h.

### O‑9 **Cursor versioning not specified** — Severity: Minor
- **Target:** D‑10, Requirement F‑2.5 (pagination)
- **Problem:** The cursor format includes a “version” field, but the design does not state how version bumps affect compatibility.
- **Evidence:** Judgment (J) that forward compatibility matters for long‑term maintenance.
- **Proposed change:** Document cursor version semantics and add a migration path for future changes.
- **Cost:** +0.5 h.

### O‑10 **No explicit limit on bulk entry size** — Severity: Minor
- **Target:** D‑14, Requirement F‑1.3 (bulk logging)
- **Problem:** The design caps bulk at ≤ 100 entries but does not enforce it at the controller level.
- **Evidence:** Judgment (J) that unchecked bulk sizes could cause OOM in tests.
- **Proposed change:** Add validation rejecting payloads > 100 entries with a clear error.
- **Cost:** +0.5 h.

### O‑11 **Potential UUID collision risk** — Severity: Minor
- **Target:** D‑20 (UUIDv7), Requirement V‑1 (schema design)
- **Problem:** UUIDv7 is time‑ordered but still relies on sufficient entropy; high‑throughput inserts could cause collisions if the server clock is not monotonic.
- **Evidence:** Verified (V‑4) that `uuidv7()` is built‑in, but best‑practice recommends a fallback.
- **Proposed change:** Add a safeguard to retry on primary‑key conflict (e.g., catch `unique_violation` and regenerate).
- **Cost:** +0.5 h.

### O‑12 **Missing explicit `unit` enum validation** — Severity: Minor
- **Target:** D‑08, Requirement F‑1.2
- **Problem:** The `unit` column is plain text with no DB enum; while allowed, it risks storing misspelled units if validation is bypassed.
- **Evidence:** Best‑practice (K‑8) advises against DB enums for extensibility, but a lightweight check can be added.
- **Proposed change:** Add a CHECK constraint referencing a generated enum of supported units, or enforce via application layer only.
- **Cost:** +0.5 h.

---

## Missed requirements or misreadings
- **F‑2.5 Pagination choice** – The design selects keyset pagination (D‑10) but does not justify why offset pagination is disallowed, despite the brief allowing either choice.
- **E‑5 Concurrent writes** – The idempotency design (D‑15) handles retries but does not prevent duplicate entries when no `Idempotency‑Key` is provided, contrary to the brief’s ambiguity (A‑5) that could be interpreted as “no duplicates”.
- **F‑3.5 PR comparison range definition** – The design requires explicit ranges (D‑13) but does not provide a helper utility to compute “this month”/“last month”, leaving it to the client; the brief’s example suggests a convenience might be expected.

---

## Technical errors found
- **Index `ix_entries_history` lacks trigram support** – may cause full scans for partial‑name filters (see O‑2).
- **`workout_entries.set_count` CHECK `>= 1`** – contradicts requirement that an entry must have at least one set; however, the schema enforces it correctly, no error.
- **`weight` column in `workout_sets` is `numeric(9,3)`** – may truncate large weights (e.g., 500 kg) leading to overflow; the brief does not state a max weight, so this could be a hidden bug.

---

## What I would cut / what I would add
- **Cut:**  
  - The optional `Idempotency‑Key` mechanism (D‑15) without content dedupe; replace with a simpler “reject duplicate exact payloads” approach to satisfy E‑5 directly.  
  - The dual storage of `performed_at` and `performed_on` (D‑09) could be simplified to a single UTC timestamp plus a client‑provided timezone offset, reducing schema complexity.
- **Add:**  
  - Full benchmark script (`bench.ts`) with sample data and latency reports.  
  - Detailed error response schema (RFC 9457) with examples for each error case.  
  - Utility endpoints or client‑side helpers for common date‑range calculations (e.g., “this month”).

---

## Claims I re‑checked
| Claim (ID from 05‑research‑notes) | Result | Source |
|---|---|---|
| — | — | — |

*No unverified claims were re‑checked due to lack of web‑search capability in this session.*

---

## Questions the candidate should be ready for in the interview
1. **Why choose PostgreSQL over MongoDB when the brief allows either?** Be ready to discuss the verified performance and relational requirements versus the unverified stack‑fit claim.
2. **How does the partial‑name search stay under 100 ms without a trigram index?** Explain benchmark methodology and fallback plans.
3. **What is the exact timezone conversion algorithm for `performed_at` and `performed_on`?** Show how offsets are handled and why the current rule may be ambiguous.
4. **How does the idempotency‑key logic prevent duplicate entries when the key is omitted?** Clarify the trade‑off and any additional safeguards.
5. **Can you walk through the PR aggregation query and illustrate why a single covering index suffices?** Demonstrate understanding of index‑only scans and the cost model.
6. **What would you change if the time estimate needed to be cut to 10 h?** Prioritise which slices you would drop or simplify.
7. **How would you extend the design to support additional units (e.g., stone) without migrations?** Point to the `WEIGHT_UNITS` array and registry.
8. **Explain how you would test the bulk logging atomicity guarantee.** Reference transaction usage and Testcontainers setup.
9. **If reviewers request a “this month” shortcut, how would you add it without breaking the existing API contract?** Suggest a sugar endpoint or parameter.
10. **What monitoring or alerting would you add for production readiness (V‑7)?** Discuss structured logging, health checks, and resource limits.
