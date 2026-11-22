# Round 4 — Claude Fable 5.2 (Claude CLI, high effort, no tools)

The reply as received, unedited. Prompt: `round-4-prompt.md`.

---

Model: Claude Fable 5.2 (`claude-fable-5-2`)

## 1. Verdict

**Ready after the fixes listed.** Instant-only storage is right. The discarded offset (objection 1) is a real, irreversible loss and goes back to the owner. The rest is cheap: the noon advice collides with the future bound, the read-side 400 and the README recipe steer callers into wrong ranges or a refused format, and about ten sentences still assume the old model.

## 2. Rulings

| # | Decision / call | Ruling | Conf. | Strongest argument |
|---|---|---|---|---|
| 1 | Instant only | Keep | High | The traveller pair and every `toISOString()` client become correct with no server rule (docs §8, K-15) |
| 2 | One format; date alone → 400 | Keep with modification — owner question | Medium | The message invites wall time + `Z`; a grader's prepared date-only payloads all fail (obj. 5) |
| 3 | Half-open instants, no zone parameter | Keep | High | Adjacent periods partition exactly; the server needs no zone data |
| 4 | Order and indexes on `(performed_at, id)` | Keep | High | The range predicate now sits on the leading sort column |
| 5 | No settings table; no stored offset | Table: Keep. Offset: **Change — owner question** | Medium-High | One nullable `smallint` prevents permanent loss (obj. 1) |
| 6 | now + 15 min; 1900 floor | Keep with modification | High | The README's noon advice produces future instants every morning (obj. 2) |
| 7 | `date` as response field | Keep with modification | Medium | A 05:30+07:00 workout comes back with the previous day's date and no explanation (obj. 1) |
| a | Space read as `+` | Keep with modification | High | The repair is narrower than the parser (obj. 7) |
| b | Zone in brackets → 400 | Keep with modification | Medium | The README's own recipe and Java's `ZonedDateTime.toString()` emit brackets (obj. 3) |
| c | `from >= to` → 400 | Keep | High | Better than a silent empty page for a same-day picker; the message must say `to` is exclusive |
| d | One message for date-alone and no-offset | Change | Medium | The documents already show two texts (§5 below); read-side `to` needs a third |
| e | DST bounds test + recipe | Recipe: Keep. Test: Change | Medium | It tests the test's own `Temporal` arithmetic, not server code (obj. 8) |
| f | Two non-UTC test zones | Keep | Medium | Nearly free; guards `Date` local parsing and session-zone casts |

## 3. Answers

**Q1. Real use** (docs §8; judgment unless marked)

- **Coach and client in different zones.** Wrong only if the dashboard follows the documents literally ("in its viewer's zone"): a Los Angeles coach's week puts the Hanoi client's Monday 06:00 session in last week (V-17). The API itself allows athlete-zone bounds; the documents never say so (obj. 4).
- **Traveller.** Correct now; conceded.
- **Mover.** Every old 06:00 session shows as the previous afternoon, and a PR "achieved Feb 10" reads Feb 9. This is permanent because the offset was thrown away (obj. 1).
- **Back-fill, time unknown.** Noon local works for past days. For today's session logged before 11:45 it is a 400 (obj. 2).
- **Totals.** Correct if bounds come from zoned arithmetic. The examples in §9.2 and §9.4 use `Z` month bounds, so a Hanoi grader's workout on the 1st at 06:00 lands in the previous month.
- **Offline queue.** Correct, and better than before; conceded.
- **Grader's first curl.** `"date": "2025-02-10"` is a 400 and so is `from=2025-02-01&to=2025-02-28`, two refusals on the natural first tries of F1 and F2.2. A made-up "tonight 19:30" during a daytime session is a third.

**Q2. Lost against before**

- Athlete-day filters that need no knowledge of anyone's zone.
- An honest "time unknown": BEFORE D-09 called an invented time "a lie in the response", and the lie is now the client's and undetectable.
- Plain-date bounds that are easy to type in curl.
- An E4 evaluator will not mark down instant-only, which is the brief's own recommendation. They can mark down discarding a free-to-keep offset and a README that tells a coaching platform "days are the viewer's".

**Q3. Interactions**

- **PR tie-break, compare, keyset, both indexes, two-step query:** sound as written (§7, §9.2–9.4).
- **Same-instant entries** are the normal case, not an edge. History returns every bulk session in reverse exercise order, and §11 models ties as "a few percent" (obj. 6).
- **Exact boundaries.** No test puts an entry exactly at `from` or `to`, yet local-midnight imports land there (obj. 8).
- **`+` rule:** obj. 7. **Future bound:** obj. 2 and §5 below.
- **Milliseconds, non-UTC test zones, 1900 floor:** no break found.
- **Unstated behaviour.** `date` in a response can show a different calendar day than the one sent; overlapping compare periods are accepted.

**Q4. Input contract**

- Defensible, given a first-class message. The message is not there yet (obj. 5).
- Accepted but outside the stated format: `+07`, `+0700` and `20250210T053000Z` are ISO 8601 only, not RFC 3339 (recalled), while §8 says "one format".
- Refused but harmless: library-generated bracketed strings (obj. 3).

**Q5. Leftovers**

- §8: "A **timed** instant later than now + 15 minutes". There are no untimed entries.
- §9.1: "the cross-field rules — the body `userId` against the path, **and the date rules**". Date is a single-field rule now.
- §12, never-cut walk: "entries sharing one instant, **on the same days**".
- §12, Metrics: "ties → earliest **date**, then lowest set number". It should be instant, then id, then set number.
- §6: "the earliest **date** keeps the record".
- §12 intro: "a **date** that passes through any of them by accident".
- D-22: "the **date bugs of D-09**".
- D-09, last line: "the instant only, **the two input shapes**".
- §11: "a few percent share one **time of day**".
- 02-design status line: lists rounds 2, 3 and the catalog, "all applied", with no mention of the time model.

## 4. Detailed objections

**1. The offset is destroyed, not merely unused — question for the owner**
- **Target.** Decisions 5 and 7; §8, D-09.
- **Problem.** D-09 argues "a stored user zone would go stale exactly when the user travels". That argues against a settings table. A per-entry offset is the one zone fact that cannot go stale. Discarding it is irreversible, as §8 admits.
- **Who hits it.** A lifter who moves: once, but all history, forever. Every cross-zone coach asking "does this client train mornings?". Every Vietnam lifter training before 07:00, daily: POST `2025-02-10T05:30:00+07:00` returns `"date": "2025-02-09T22:30:00.000Z"`, the previous day, in a field named `date`. The §9.1 example uses 19:30 and hides this.
- **Evidence.** Docs §8, V-17; judgment on frequency.
- **Change.** Add `utc_offset_minutes smallint NULL`, with `NULL` for `Z` (K-18) and display only. Add `utcOffset: "+07:00" | null` to responses. Filters, sort, indexes and the traveller fix are untouched. If the owner still declines, add a 05:30+07:00 row to the §9.1 example and one README sentence.

**2. "Noon in the athlete's offset" collides with now + 15 minutes**
- **Target.** Decision 6; §8.
- **Problem.** A day-only client following the README sends today's noon. Before 11:45 local that is in the future and gets a 400, whose message blames a `Z` mistake the client did not make.
- **Who hits it.** Every morning session logged the same morning through a day-only client or a coach's spreadsheet tool; daily per such user.
- **Evidence.** Docs §8, both bullets; arithmetic.
- **Change.** README: "noon in the athlete's offset, or the current moment if that noon has not yet passed". Add one unit test. The future-bound message names both causes.

**3. The read-side 400 and the recipe lead to wrong or refused requests**
- **Target.** Call (b), decision 3; §8, §9.2, §9.4.
- **Problem (a).** A grader who is told to "send the instant form" turns `to=2025-02-28` into `to=2025-02-28T00:00:00Z` and silently loses the last day.
- **Problem (b).** The recipe's natural output, `ZonedDateTime.toString()`, is `…+07:00[Asia/Ho_Chi_Minh]`. It has brackets, which are refused, and a `+`.
- **Problem (c).** The examples use `Z` month bounds, contradicting "in its viewer's zone".
- **Who hits it.** Every grader testing F2.2 or F3.5 by hand; every caller following the recipe.
- **Evidence.** Docs §8; recalled for the `toString()` output of Temporal and Java.
- **Change.** The `to` message reads: "`to` is exclusive; to include all of 2025-02-28 send the start of the next day, e.g. 2025-03-01T00:00:00Z". The recipe ends with `.toInstant().toString()`, which is `Z` form with no `+` and no brackets. Examples show Hanoi's February as `from=2025-01-31T17:00:00Z&to=2025-02-28T17:00:00Z`. The bracket 400 says "remove the `[zone]` suffix".

**4. "Days are the viewer's" is the wrong sentence for a coaching platform**
- **Target.** §8 trade-offs, A6, D-09 costs (E4, V4).
- **Problem.** The server takes any bounds, so nothing forces the viewer's zone. The documents present the coach-sees-Sunday outcome as inherent, when it is a caller choice.
- **Who hits it.** Any coach in another zone, on every weekly view; any interviewer.
- **Evidence.** Docs §8, D-09; judgment.
- **Change.** Text only: "the caller chooses the zone a period is cut in — for an athlete's own view, theirs; for a coach's compliance view, normally the athlete's". State that knowing the athlete's zone needs a profile, which is out of scope under T4.

**5. The date-alone message teaches the mistake the future bound exists to catch — partly an owner question**
- **Target.** Decision 2, call (d); §8, §9.6.
- **Problem (a).** "…for example 2025-02-10T09:00:00+07:00, **or with Z**" invites the sender to append `Z` to a local time. For past dates that is silently seven hours wrong, and §8 concedes it is undetectable.
- **Problem (b).** The hard-coded `+07:00` is wrong for non-Vietnam senders.
- **Problem (c).** A grader running prepared date-only payloads gets a 400 on every write and cannot reach F2 or F3 without rewriting them.
- **Who hits it.** Any first-time hand typist; a scripted grader, once but decisively.
- **Evidence.** Docs §8, §9.6; judgment on likelihood.
- **Change.** Message: "…add the time and your UTC offset, e.g. 2025-02-10T09:00:00+07:00 (Vietnam). `Z` means UTC, not local time." Split the texts for date-alone, no-offset and read bounds. For the owner: is the scripted-grader risk accepted? I would keep the 400.

**6. Same-instant is the default shape, and the documents treat it as an edge**
- **Target.** Decision 4; §8 sort order, §11.
- **Problem.** By the brief's own fact, a session of 5–12 exercises is logged with one time. History therefore lists every such session last exercise first, and pages split sessions. The benchmark data barely contains ties.
- **Who hits it.** Every bulk-logged session, on every history view.
- **Evidence.** Docs §8, §11, review rule 7.
- **Change.** Keep `(performed_at DESC, id DESC)`: a mixed-direction keyset loses the row-value comparison and costs more than it earns. The README says "within one `date`, entries are in reverse order sent; reverse them to show a session". Benchmark data groups entries into sessions that share one `performed_at`.

**7. The `+` repair is narrower than the parser**
- **Target.** Call (a); §8.
- **Problem.** The regex needs `T` and `hh:mm`. Yet §8 accepts `+0700`, `+07` and a space for `T`, so `from=…T00:00:00+0700` arrives with a space and is a 400.
- **Who hits it.** Python `strftime('%z')` callers (`+0700`, recalled); occasional.
- **Evidence.** Docs §8, V-17.
- **Change.** Repair a trailing ` \d\d(:?\d\d)?$` after a time. Every unparseable-bound message ends "encode `+` as `%2B`".

**8. The daylight-saving integration test fails the design's own standard**
- **Target.** Call (e); §8, §12.
- **Problem.** §9.4 rejects a test because "it would test PostgreSQL, not this code". This one tests `ZonedDateTime.add` inside the test file. What the server owns, exact boundary behaviour, is untested, and importers do produce local-midnight instants.
- **Who hits it.** Imports and back-fills at `T00:00:00`.
- **Evidence.** Docs §8, §9.4, §12.
- **Change.** Move the recipe to a unit-level README example. Add an integration test with entries at `from − 1 ms`, `from`, `to − 1 ms` and `to` against two adjacent periods, where each entry appears in exactly one, on history, PRs and compare.

## 5. Contradictions between documents

- **One message or two.** §8: a no-offset date-time "gets the same message with its own text quoted", and that message reads "has no time or UTC offset". §9.6 example: "'2025-02-10T06:30:00' has no UTC offset". The §8 table gives two reasons: "a time and an offset are required" and "an offset is required".
- **Input shapes.** D-09, last line: "the two input shapes". D-09 decision: "`date` has one format".
- **How hard bounds are.** D-13: explicit ranges are "trivial for any client to compute". D-09 costs: "Every caller computes its own period bounds, daylight saving included", with a test showing how it goes wrong.
- **What the future bound catches.** D-18: "catch a local time sent with `Z` from UTC+1 eastward". §8: "lands an hour or more in the future". It is caught only when the offset minus the time since the workout exceeds 15 minutes. At UTC+1 an ordinary end-of-session log passes, and a back-fill from yesterday passes everywhere. §8 says only that the mistake is undetectable west of UTC.
- **Zone of the examples.** §8: periods are "computed in its viewer's zone". The §9.2 and §9.4 examples are UTC months.
- **Paging walk.** D-10: the walk "mixes entries on different instants with entries sharing one instant". §12 adds "on the same days".
- **Ties.** §8: "a whole session stamped with its start time". §11: only "a few percent share one time of day".

## 6. Technical errors

- **§8, "RFC 3339 / ISO-8601 … one format only".** `+07`, `+0700` and the compact form are not RFC 3339 (recalled). If OpenAPI declares `format: date-time`, the server accepts more than it advertises. Say "RFC 3339; some ISO 8601 variants are tolerated".
- **§8, future bound.** As written it overclaims; see §5 above.
- **§8, "What `date` accepts" table.** Three header cells over a four-column separator; it will not render.
- **V-17, "Monday 06:00 in Hanoi is Sunday 15:00 in Los Angeles".** True only on standard time; it is 16:00 in summer (arithmetic).
- **Nothing false found** in the statements on `timestamptz` rounding, node-postgres `Date` exactness at millisecond precision, the 167-hour week, the 743-hour month, or `+` decoding (recalled; consistent with V-17).

## 7. Interview questions

1. A client moved from Hanoi to Los Angeles. Show me their old 06:00 sessions. Why did you discard a two-byte offset you already had?
2. A coach in Los Angeles has a client in Hanoi. In which zone is "this week" cut, who decides, and how does that caller learn the zone with no users table?
3. Your field is called `date` and my first POST with `"2025-02-10"` was refused. Why is that better than accepting it, and what does your error message make me do next?
4. I logged eight exercises with one timestamp. In what order does history return them, and what happens when a page boundary falls inside the session?
5. Why 15 minutes? Give one mistake it catches and two it lets through.
