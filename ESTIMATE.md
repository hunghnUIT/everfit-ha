# Time estimate

Deliverable D8 asks for the time estimate before coding starts. This file,
with the cut list below, is committed before the first line of code. Every
figure below comes from `planning/02-design.md` §16 and is the candidate's
judgment [J].

## Range

**23–25 h of focused work, spread over 3 days.**

| Slice | Hours |
|---|---|
| 1–3 Foundation, Docker, DB, toolchain test, `migrate` entry point, clean-image check | 2.95 |
| 4–5 Units + domain, including date parsing and bounds and the key functions' golden test | 2.85 |
| 6 Catalog, read side: tables, seed step, snapshot and its refresh rules, read endpoints | 2.7 |
| 7–8 Logging, bulk, body rules, concurrency tests | 3.05 |
| 9 Benchmark data | 1.0 |
| 10 History | 1.75 |
| 11 PRs + compare, ranking fixture, benchmark runs | 3.4 |
| 12 Catalog administration (of which the two muscle-group write routes ≈ 0.3) | 2.25 |
| 13 README, `requests.http`, AI_WORKFLOW, review | 2.4 |
| Buffer (~8%) | 2.0 |
| **Core total** | **≈ 24.35 h** |

Planning and the multi-agent debate (the `planning/` folder) are extra and
are not in the figure above.

## Cut from the start

Cut when the figure is stated: the CI benchmark job (`npm run bench` stays)
and the schema drift check. Neither was priced on a line of its own, so the
figure does not fall with them.

## Cut list, in order, if time runs short

1. The `fast-check` generators (the fixed fixtures stay; ≈ 0.5 h).
2. The two muscle-group write routes (a new group is then one SQL insert, and
   the README says so; ≈ 0.3 h).
3. `GET …/workout-entries/{id}` (and with it the entry's `Location` header;
   the single POST still returns the whole entry; ≈ 0.25 h).
4. Swagger UI (≈ 0.1 h).

The muscle-group routes go before `GET …/{id}` because a `Location` that
points at a working route is part of the graded API design, while groups
change a few times a year.

## Never cut

PR comparison, the benchmark, Docker, the unit registry, the timezone
write-up, the ranking fixture, the mixed paging walk, the clean-image check,
the catalog tables, the catalog seed, and exercise create / update / delete.
