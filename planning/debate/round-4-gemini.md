# Round 4 — Gemini 4 Argon (GitHub Copilot CLI, high effort, no tools)

The reply as received, unedited. Prompt: `round-4-prompt.md`.

---

Model: Gemini 4 Argon (gemini-4-argon)

### 1. Verdict

**Ready after the fixes listed.**
Concession: replacing `performed_on`, `time_known`, and the `UTC-14` synthetic ordering timestamp with `performed_at timestamptz(3)` and half-open `[from, to)` instant bounds is the right core fix for timeline ordering and the 29-hour traveller collision (*judgment*).
However, the revision introduces a morning-logging trap where the README's own "noon local" advice fails the `now + 15 minutes` write bound, bans `[TimeZone]` brackets that `Temporal.ZonedDateTime.prototype.toString()` emits by default, leaves read bounds (`from`/`to`) open to PostgreSQL `22008` 500 errors on years `<= 0`, permanently discards the input offset on write, and leaves several contradictions and leftovers across the documents.

---

### 2. Rulings

| # | Item | Ruling | Confidence | Single strongest argument |
|---|---|---|---|---|
| **Owner 1** | Store only the UTC instant (`performed_at timestamptz(3)`) | **Keep** (for indexing/sorting/filtering; see Owner 5 for offset) | High | A single timeline column eliminates the 29-hour traveller collision where two distinct days of training collapsed into one `performed_on` date (*from the documents*, `02-design.md` §8). |
| **Owner 2** | One input format for `date`; a date alone is a 400 | **Keep with modification** (Question for owner) | High | One wire format prevents server-invented timestamps, **but** the accompanying README rule ("choose noon in the athlete's offset") causes a 400 (`> now + 15m`) whenever a user logs *today's* date before 11:45 AM local time (*judgment* from `02-design.md` §8). |
| **Owner 3** | Half-open instant ranges `[from, to)` on reads, no zone param | **Keep with modification** | High | Half-open instant bounds prevent boundary double-counting in `F3.5` (`compareTo = from`), provided read bounds also enforce year bounds (`1900`–`9999`) so `Temporal`-valid years `<= 0` cannot trigger a PostgreSQL `22008` 500 (*recalled*). |
| **Owner 4** | Order and indexes on `(performed_at, id)` | **Keep** | High | Drops `performed_on` from both indexes and aligns the keyset predicate `(performed_at, id) < ($6, $7)` directly with the leading columns of `ix_entries_history` (*from the documents*, `02-design.md` §5, §9.2). |
| **Owner 5** | No user-settings table and no stored offset in v1 | **Change** (Question for owner: keep no settings table; store `utc_offset_minutes smallint NULL`) | High | The client *already sends* the offset in `date`; throwing it away is irreversible data loss (`03-decision-log.md` D-09) that shifts a traveller's or mover's own history and makes a remote coach see different monthly PRs (`F3.5`) and training days than the athlete (*judgment*). |
| **Owner 6** | Write bounds of `now + 15 minutes` and `1900-01-01` | **Keep with modification** | Medium | Catches local time mistakenly sent with `Z` east of UTC and far-past typos, but `1900-01-01` must be stated as the exact UTC instant `1900-01-01T00:00:00.000Z` and a year bound must also guard read parameters (`from`/`to`) (*judgment*). |
| **Owner 7** | `date` as the response field | **Keep** | High | Matches `F1` ("date") and `F3.4` ("date each PR was achieved") without repeating the same value in a second `performedAt` field (*from the documents*, `01-requirements.md` §2). |
| **Author 1** | Reading a space back as `+` in a query bound | **Keep with modification** | High | Prevents a 400 on unencoded `+` in `curl`, **but** the regex in `02-design.md` §8 (`T\d\d:\d\d(:\d\d(\.\d+)?)? \d\d:\d\d$`) rejects lowercase `t`, space separators, and `+07`/`+0700` offsets that §8 promises to keep (*from the documents*, `02-design.md` §8). |
| **Author 2** | Refusing a zone in brackets (`[Asia/Ho_Chi_Minh]`) | **Change** | High | `Temporal.ZonedDateTime.prototype.toString()` and `.toJSON()` always append `[TimeZone]` by default (*recalled*), so banning brackets causes 400s for callers following §8's own `Temporal.ZonedDateTime` recipe; use `Temporal.ZonedDateTime.from(text, { offset: 'reject' })` instead. |
| **Author 3** | `from >= to` as a 400 | **Keep with modification** | High | An empty `[from, to)` range is always caller error, **provided** `from >= to` is checked *after* truncating both bounds to milliseconds so `[.123100Z, .123900Z)` does not slip through as `[.123Z, .123Z)` (*judgment*). |
| **Author 4** | One error message for a date alone and for a missing offset | **Change** | High | Telling a caller who sent `'2025-02-10T06:30:00'` that it *"has no time or UTC offset"* is false because `06:30:00` is a time, and `02-design.md` §8 already contradicts §9.6 on this wording (*from the documents*, `02-design.md` §8 vs §9.6). |
| **Author 5** | Daylight-saving bounds test and README recipe for period bounds | **Keep with modification** | High | Keep the README recipe (adding `.toInstant().toString()`), but reframe the test: calling `ZonedDateTime.add({ weeks: 1 })` inside the test file tests Node 26's `Temporal`, not server code (`02-design.md` §8, §12; *judgment*). |
| **Author 6** | Keeping the two non-UTC test zones (`Asia/Ho_Chi_Minh`, `America/Los_Angeles`) | **Keep** | High | Zero runtime cost and catches accidental local-zone formatting in JS or implicit session-zone casts in SQL (*from the documents*, `02-design.md` §8, §12). |

---

### 3. Answers to the Five Questions

1. **Real use (`02-design.md` §8, §9.1–§9.4; `03-decision-log.md` D-09).**
   - *Coach and client in different zones / weekly & monthly totals (`F2.2`, `F3.5`):* An athlete in Los Angeles (`-08:00`) logs a PR on `2025-02-28T18:00:00-08:00` (`2025-03-01T02:00:00.000Z`). Their coach in Hanoi (`+07:00`) or London (`+00:00`) opens "PR this month vs last month" (`F3.5`, February vs January). Because the coach's app computes February in the viewer's zone, that Feb 28 workout falls into **March** for the coach and **February** for the athlete — they disagree on whether the athlete hit a February PR (*judgment*).
   - *Athlete who travels or moves:* In the owner's traveller case (`2025-02-10T05:30:00+07:00` = `2025-02-09T22:30:00.000Z`), the moment the athlete lands in the US (`-07:00`) or moves there permanently, their phone's viewer zone becomes `-07:00` and shifts that Monday 05:30 Hanoi workout to **Sunday Feb 9 at 15:30**; a `2025-02-01T06:00:00+07:00` workout shifts into **January** (*from the documents*, `02-design.md` §8; *judgment*).
   - *Back-filling without a known time:* If a user logs *today's* workout at 09:30 AM local time using a date-only picker that follows §8's recommendation ("noon in the athlete's own offset", `12:00:00+07:00`), the timestamp is 2.5 hours ahead of `now` and fails the `now + 15 minutes` bound with a 400 (*judgment* from `02-design.md` §8). And for a coach in LA (`-08:00`, 15 hours behind Hanoi `+07:00`), Hanoi noon (`05:00Z`) still lands on the **previous calendar day (21:00)**, refuting §8's "within twelve hours" reassurance.
   - *Offline mobile queue:* Works if the app stamps the time when each set was performed (`performed_at <= now`); fails if an athlete pre-logs a session 30 minutes before its scheduled start time (*judgment*).
   - *Grader's first curl:* Sending `"date": "2025-02-10"` on `POST` (`F1`) or `?from=2025-02-01&to=2025-02-28` on `GET` (`F2.2`) fails with 400 on the first attempt (*from the documents*, `02-design.md` §8).

2. **Lost against before (`BEFORE.md` §8 vs `02-design.md` §8; `01-requirements.md` E4, F1.2, F3.4, F3.5).**
   - The old model could answer *"Which workouts and PRs happened on the athlete's calendar day/month, regardless of where the viewer is today?"* and *"Was the time of day actually known or only the date (`performedAt: null`)?"* (*from the documents*, `BEFORE.md` §8).
   - Under `E4` ("Timezone handling: document your strategy (UTC storage recommended, explain trade-offs)"), an evaluator comparing `F1.2` (where original weight and unit are preserved alongside normalized `kg`) with `E4` can mark down the decision to **discard the input UTC offset** on write: `POST`ing `"date": "2025-02-10T05:30:00+07:00"` immediately returns `"date": "2025-02-09T22:30:00.000Z"` (changing the date the user just sent), and permanently destroys the offset needed to ever render or group workouts in the zone where they occurred (*judgment*).

3. **Interactions (`02-design.md` §5, §7, §8, §9.1–§9.4, §11, §12; `05-research-notes.md` V-17, U-22–U-24).**
   - *PR tie-break & bulk/shared instants (§7, §8, §9.1, §9.3):* In a bulk request where all entries share one session timestamp, UUIDv7 `id`s are assigned in input order (`entries[0].id < entries[1].id`). History (`ORDER BY performed_at DESC, id DESC`) returns them in reverse input order (`entries[1]` first), while PR tie-break (`ORDER BY score DESC, performed_at ASC, id ASC, set_number ASC`) crowns `entries[0]`. This is consistent (`entries[0]` was logged first), though `02-design.md` §7 does not explicitly note the `id ASC` vs `id DESC` inversion for same-instant sets of the same exercise (*from the documents*, `02-design.md` §7, §8).
   - *Millisecond truncation vs `[from, to)` and `from >= to` (§8, §9.2):* If `from=2025-02-10T12:00:00.123100Z` and `to=2025-02-10T12:00:00.123900Z` are compared *before* cutting to milliseconds, `from < to` passes validation, then both are cut to `.123Z`, running an impossible `performed_at >= .123Z AND performed_at < .123Z` query. Also, cutting `to=2025-02-10T12:30:00.123456Z` down to `.123Z` excludes a row at `.123Z` under `< to` (*judgment*).
   - *`+` in query strings (§8):* The regex `T\d\d:\d\d(:\d\d(\.\d+)?)? \d\d:\d\d$` fails on `+07`, `+0700`, lowercase `t`, and space separators that §8 says `Temporal` accepts (*from the documents*, `02-design.md` §8).
   - *Past/future bounds (§8, D-18, U-24):* Write bounds are not applied to read bounds (`from`, `to`, `compareFrom`, `compareTo`), so `from=0000-01-01T00:00:00Z` passes `Temporal.Instant.from` and causes a PostgreSQL `22008` 500 error (*recalled*).

4. **The input contract (`02-design.md` §8, §9.1, §9.6; `01-requirements.md` F1, E2).**
   - Requiring an RFC 3339 date-time with offset/`Z` on `date` is defensible for a take-home **if** every example in Swagger, `requests.http`, and the README uses it and the 400 message gives a copy-pasteable fix (*judgment*).
   - **What is refused that should not be:** `2025-02-10T06:30:00+07:00[Asia/Ho_Chi_Minh]` — the default `.toString()` / `.toJSON()` output of `Temporal.ZonedDateTime` when a matching zone is in brackets (*recalled*; `02-design.md` §8).
   - **What is accepted that should not be:** On reads (`from`, `to`, `compareFrom`, `compareTo`), years outside `1900`–`9999` (such as `0000-01-01T00:00:00Z` or `-000500-01-01T00:00:00Z`) and non-timezone RFC 9557 bracket annotations (`2025-02-10T06:30:00Z[u-ca=iso8601]`) if the bracket check only looks for IANA zones (*recalled*; `02-design.md` §8).
   - **Error message:** Using the "has no time or UTC offset" message for `'2025-02-10T06:30:00'` is inaccurate because the input has a time; split the message as §9.6 already does (*from the documents*, `02-design.md` §8 vs §9.6).

5. **Leftovers (`01-requirements.md`, `02-design.md`, `03-decision-log.md`).**
   - `02-design.md` §12 (Unit — Dates): *"every row of the §8 table; `.123Z` and `.123456` are accepted and cut to milliseconds"* — `.123456` (no offset or `Z`) was accepted in `BEFORE.md` §8 with `timeZone`, and is now a 400.
   - `02-design.md` §12 (Integration — Mixed paging walk): *"entries on different instants and entries sharing one instant, on the same days, walked at page size one"* — *"on the same days"* is a leftover from when `performed_on` was the leading sort key.
   - `02-design.md` §12 (Unit — Metrics): *"ties → earliest date, then lowest set number"* — missing `id` and still saying "earliest date" instead of "earliest instant, then lowest id, then lowest set number" (`02-design.md` §7).
   - `03-decision-log.md` D-09 ("After round 3 — the owner's time model"): *"the instant only, the two input shapes, half-open instant ranges with no zone"* — *"the two input shapes"* is a leftover from the reverted intermediate draft that accepted date-alone at 12:00 UTC alongside date-time.
   - `03-decision-log.md` D-22 ("After round 3 — the owner's time model"): *"they now guard the instant path (no session-zone cast, no Date at local midnight)"* — *"no Date at local midnight"* was the `node-postgres` `date`-column bug (`V-9` in `BEFORE.md`), which does not exist for `timestamptz(3)`.
   - `03-decision-log.md` D-14 ("Round 3"): ends with *"3A-13: the ordering test's two date-only entries share a date"* with no "After round 3" note, even though D-14's Decision paragraph above it was updated to *"entries with the same instant"*.
   - `01-requirements.md` §9 intro: *"A1, A3, A5 and A7 changed in round 1; A5 changed again in round 2; A2 changed with the owner's requirement"* — omits that `A1` and `A6` changed after round 3.

---

### 4. Detailed Objections

#### 1. [Question for the Owner] Discarding the input UTC offset causes permanent data loss and misleads coaches and travelling athletes (`F1`, `F3.5`, `E4`)
- **Target:** Owner Decision 5 & 7 (`02-design.md` §5, §8; `03-decision-log.md` D-09).
- **Problem:** Every write requires an explicit offset or `Z`, yet the server throws the offset away. In the owner's own traveller example (`2025-02-10T05:30:00+07:00`), as soon as the athlete lands in the US (`-07:00`) or moves there, their phone's viewer zone becomes `-07:00` and displays their Monday 05:30 Hanoi workout as **Sunday Feb 9 at 15:30**. A workout logged at `2025-02-01T06:00:00+07:00` (`2025-01-31T23:00:00.000Z`) shifts into **January** when the athlete in the US or a US-based coach views "PR this month vs last month" (`F3.5`). Worse, `02-design.md` §8 admits that *"entries logged before it [storing the offset] cannot get theirs back"* — irreversible loss of data the client already sent.
- **Who hits this, and how often:** Every coach in a different timezone from their client on weekly/monthly check-ins; every athlete who travels or relocates; every caller inspecting the `201 Created` body where `"2025-02-10T05:30:00+07:00"` immediately returns `"date": "2025-02-09T22:30:00.000Z"`.
- **Evidence:** *From the documents* (`02-design.md` §8 table and trade-offs; `03-decision-log.md` D-09 Costs; `05-research-notes.md` V-17) and *judgment*.
- **Proposed change:** Keep `performed_at timestamptz(3)` as the sole sort/filter/index column, and add `utc_offset_minutes smallint NULL` to `workout_entries` (`NULL` for `Z` or `-00:00`; signed minutes e.g. `420` for `+07:00`, `-420` for `-07:00`). Return `utcOffsetMinutes` in entry and PR responses (or format `date` using the stored offset when non-null). No index, cursor, or query changes.

#### 2. [Question for the Owner] The README's "noon in the athlete's offset" recommendation fails the `now + 15 minutes` write bound every morning (`F1`, `E2`, `E4`)
- **Target:** Owner Decision 2 & 6 (`02-design.md` §8, §9.1; `03-decision-log.md` D-09, D-18).
- **Problem:** `02-design.md` §8 instructs any client that knows only the calendar day to send **noon in the athlete's own offset** (`2025-02-10T12:00:00+07:00`), while rejecting any write after `now + 15 minutes` with a 400 that blames the caller for sending local time with `Z`. Any user logging *today's* workout before 11:45 AM local time via a date-only picker that follows the README's noon recommendation sends a timestamp up to 12 hours in the future and gets a **400 error**. Furthermore, §8 states noon is the stated day *"for any viewer within twelve hours of them"*, but Hanoi (`+07:00`) and Los Angeles (`-08:00`, the two zones in §12) are **15 hours apart**, so Hanoi noon (`05:00Z`) is still **21:00 on the previous day** in Los Angeles.
- **Who hits this, and how often:** Any morning lifter (one of the two daily training peaks noted in `02-design.md` §11) or coach logging today's session via a date-only UI that follows the README's rule.
- **Evidence:** *From the documents* (`02-design.md` §8, §11, §12) and arithmetic (*judgment*).
- **Proposed change:** Change the README advice and `02-design.md` §8: when a client knows only the date, use noon in the athlete's offset for past dates, and `min(noon local, now)` when the date is today in the athlete's zone. Correct the "within twelve hours" note in §8 to acknowledge that US West Coast viewers (`-07:00`/`-08:00`) are 14–15 hours behind `+07:00`.

#### 3. Banning bracketed time zones rejects the default output of `Temporal.ZonedDateTime.prototype.toString()` (`F1`, `F2.2`, `F3.5`)
- **Target:** Author's Call 2 & 5 (`02-design.md` §8; `03-decision-log.md` D-09; `05-research-notes.md` V-17).
- **Problem:** `02-design.md` §8 refuses any timestamp containing a zone in brackets (`2025-02-10T06:30:00+07:00[Asia/Ho_Chi_Minh]`) with 400 because `Temporal.Instant.from` ignores a contradicting bracketed zone (`+07:00[America/Denver]`). In the same section, §8 recommends that callers compute `from`/`to` period bounds using `Temporal.ZonedDateTime` and `.add({ months: 1 })` / `.add({ weeks: 1 })`. In Node 26's `Temporal`, `ZonedDateTime.prototype.toString()` and `.toJSON()` default to `timeZoneName: 'auto'`, which **always appends `[TimeZone]`**. Callers following the README's `Temporal.ZonedDateTime` recipe will pass `2025-03-09T00:00:00-08:00[America/Los_Angeles]` and receive a 400.
- **Who hits this, and how often:** Any JS/TS client or grader who copies the README's `Temporal.ZonedDateTime` recipe and serializes the result with `.toString()`, template strings, or `JSON.stringify()`.
- **Evidence:** *Recalled* (ECMAScript `Temporal.ZonedDateTime.prototype.toString` specification) and *from the documents* (`02-design.md` §8; `05-research-notes.md` V-17).
- **Proposed change:** Instead of rejecting `[`, parse strings containing `[` with `Temporal.ZonedDateTime.from(text, { offset: 'reject' }).toInstant()` (and reject non-timezone bracket annotations if desired). With `offset: 'reject'` (the `Temporal` default), matching `[Asia/Ho_Chi_Minh]` succeeds while contradicting `+07:00[America/Denver]` or unknown zones throw a `RangeError` → 400. Also show `.toInstant().toString()` in the README recipe.

#### 4. Missing year bounds on read parameters (`from`, `to`, `compareFrom`, `compareTo`) allow PostgreSQL `22008` 500 errors (`F2.2`, `F3.5`, `E2`, `V5`)
- **Target:** Owner Decision 3 & 6 (`02-design.md` §8, §9.2–§9.4; `03-decision-log.md` D-18; `05-research-notes.md` U-24).
- **Problem:** `03-decision-log.md` D-18 and `05-research-notes.md` U-24 state that the `1900-01-01` floor prevents `Temporal.Instant.from` from passing out-of-range years (`-271821` to `+275760`) to PostgreSQL and causing a 500. However, `02-design.md` §8 applies the floor and ceiling **only to writes**, and explicitly puts no lower or upper limit on read bounds (`from`, `to`, `compareFrom`, `compareTo`). Because ISO 8601 / `Temporal` uses astronomical years (`0000` = 1 BC, `-000001` = 2 BC) while PostgreSQL has no year 0 and rejects leading-minus years without `BC` (`SQLSTATE 22008: date/time field value out of range`), passing `from=0000-01-01T00:00:00Z` on `GET /workout-entries` or `GET /personal-records` passes `Temporal.Instant.from` and crashes with a **500**. Also, `1900-01-01` in §8 is written as a calendar date rather than an instant.
- **Who hits this, and how often:** A grader testing edge-case query dates (`from=0000-01-01T00:00:00Z`) or a caller with a mistyped year on `GET`.
- **Evidence:** *Recalled* (PostgreSQL `timestamptz` input rules vs `Temporal` extended years) and *from the documents* (`02-design.md` §8; `03-decision-log.md` D-18; `05-research-notes.md` V-17, U-24).
- **Proposed change:** Specify the write floor as `1900-01-01T00:00:00.000Z`, and enforce `1900-01-01T00:00:00.000Z <= bound <= 9999-12-31T23:59:59.999Z` on all four read bounds (`from`, `to`, `compareFrom`, `compareTo`), returning 400 `VALIDATION_ERROR`.

#### 5. The query-string `+`-to-space regex rejects valid `Temporal` offset and separator formats promised in §8 (`F2.2`, `F3.5`)
- **Target:** Author's Call 1 (`02-design.md` §8; `05-research-notes.md` V-17, U-22).
- **Problem:** `02-design.md` §8 states that `Temporal.Instant.from` accepts *"a space instead of `T`, lower-case `t` and `z`, an offset written `+07` or `+0700`"* and that *"all are kept"*. In the next paragraph, the query-string `+` recovery rule uses the regex `T\d\d:\d\d(:\d\d(\.\d+)?)? \d\d:\d\d$`, which requires an uppercase `T` and a colon-separated `\d\d:\d\d$` offset. A hand-typed curl query such as `?from=2025-02-01T00:00:00+07` or `?from=2025-02-01t00:00:00+0700` has its `+` decoded to a space, misses the regex, and fails with 400 on `GET` despite succeeding on `POST`.
- **Who hits this, and how often:** A grader in Vietnam (`+07`) or elsewhere typing `?from=2025-02-01T00:00:00+07` in `curl` without `%2B`.
- **Evidence:** *From the documents* (`02-design.md` §8) and regex evaluation (*judgment*).
- **Proposed change:** Change the replacement pattern in `02-design.md` §8 to `text.replace(/([Tt ]\d\d:\d\d(?::\d\d(?:\.\d+)?)?) (\d\d(?::?\d\d(?::?\d\d(?:\.\d+)?)?)?)$/, '$1+$2')`.

#### 6. Using one error message for date-only and offset-less date-times contradicts §9.6 and gives a false reason (`E2`, `V5`)
- **Target:** Author's Call 4 (`02-design.md` §8, §9.6, §12; `03-decision-log.md` D-19).
- **Problem:** `02-design.md` §8 and §12 state that `'2025-02-10T06:30:00'` gets the same message as `'2025-02-10'`: *"'2025-02-10T06:30:00' has no time or UTC offset..."*. Telling a caller who sent `T06:30:00` that their input "has no time" looks buggy and contradicts `02-design.md` §9.6, which shows *"'2025-02-10T06:30:00' has no UTC offset..."*.
- **Who hits this, and how often:** Every caller sending a naive date-time from Python `isoformat()`, HTML `datetime-local`, or `curl` (`05-research-notes.md` K-15).
- **Evidence:** *From the documents* (`02-design.md` §8 vs §9.6; `05-research-notes.md` K-15).
- **Proposed change:** Keep both messages: if `/^\d{4}-\d{2}-\d{2}$/.test(text)` say `"has no time or UTC offset"`; otherwise say `"has no UTC offset"` as written in §9.6.

#### 7. Sub-millisecond truncation order against `from >= to` is unspecified (`F2.2`, `F3.5`)
- **Target:** Author's Call 3 & Owner Decision 3 (`02-design.md` §8, §9.2–§9.4).
- **Problem:** `02-design.md` §8 cuts read bounds to the millisecond and rejects `from >= to` with 400, but does not state the order of those two steps. If `from=2025-02-10T12:00:00.123100Z` and `to=2025-02-10T12:00:00.123900Z` are compared before truncation, `from < to` passes and the query searches `[.123Z, .123Z)` — an empty range that §8 promised to reject as 400.
- **Who hits this, and how often:** Automated clients or tests passing microsecond/nanosecond timestamps (`Temporal.Now.instant()` or Python `isoformat()`).
- **Evidence:** *From the documents* (`02-design.md` §8, §9.2) and arithmetic (*judgment*).
- **Proposed change:** State in `02-design.md` §8 that `from >= to` (and `compareFrom >= compareTo`) is evaluated **after** both bounds are cut to the millisecond.

#### 8. The Los Angeles daylight-saving integration test in §12 tests Node's `Temporal`, not the server (`V6`)
- **Target:** Author's Call 5 (`02-design.md` §8, §12; `03-decision-log.md` D-22).
- **Problem:** Because the server takes no timezone and only compares UTC instants, computing `ZonedDateTime.add({ weeks: 1 })` across `2025-03-09` in the integration test runs entirely inside the test client; the server just receives `from=2025-03-09T00:00:00-08:00` and `to=2025-03-16T00:00:00-07:00`. Presenting this as an API DST test violates §2's anti-goal against testing framework/runtime internals (`V6`).
- **Who hits this, and how often:** Reviewers grading test design (`V6`) and interviewing the candidate.
- **Evidence:** *From the documents* (`02-design.md` §2, §8, §12) and *judgment*.
- **Proposed change:** Keep the recipe in the README (`E4`), and describe the §12 test accurately as verifying that `from` and `to` accept different UTC offsets (`-08:00` and `-07:00`) in one request and filter the half-open UTC range accurately.

---

### 5. Contradictions Between Documents

1. **Error message for an offset-less date-time (`02-design.md` §8 vs `02-design.md` §9.6):**
   - `02-design.md` §8:
     > Its message reads: "'2025-02-10' has no time or UTC offset, so the moment it names is unknown. Send a date and time with an offset, for example 2025-02-10T09:00:00+07:00, or with Z." A date-time with no offset (a hand-typed curl, Python's `isoformat()` on a naive value, an HTML `datetime-local` field) gets the same message with its own text quoted.
   - `02-design.md` §9.6:
     > `{ "path": "date", "message": "'2025-02-10T06:30:00' has no UTC offset, so the moment it names is unknown. Send a date and time with an offset, for example 2025-02-10T06:30:00+07:00, or with Z." }`

2. **One input format vs "the two input shapes" (`02-design.md` §8 vs `03-decision-log.md` D-09):**
   - `02-design.md` §8:
     > **What `date` accepts** on a write: one format only — an RFC 3339 / ISO-8601 date-time with `Z` or an offset.
   - `03-decision-log.md` D-09 ("After round 3 — the owner's time model"):
     > The owner found the traveller case above, which no reviewer of rounds 1–3 raised, and decided the points listed in design §17 ("After round 3"): the instant only, the two input shapes, half-open instant ranges with no zone, order on `(performed_at, id)`, and no settings table.

3. **Whether `.123456` without an offset is accepted (`02-design.md` §8 vs `02-design.md` §12):**
   - `02-design.md` §8:
     > `2025-02-10T06:30:00` (no offset) | — | **400**: an offset is required
   - `02-design.md` §12 (Unit — Dates):
     > every row of the §8 table; `.123Z` and `.123456` are accepted and cut to milliseconds;

4. **Whether `1900-01-01` bounds every accepted value sent to PostgreSQL (`05-research-notes.md` U-24 vs `02-design.md` §8):**
   - `05-research-notes.md` U-24:
     > PostgreSQL's `timestamptz` starts at 4713 BC, while `Temporal` accepts years down to −271821 (V-17). ... The 1900-01-01 floor keeps every accepted value inside the range either way.
   - `02-design.md` §8:
     > **Bounds on a write.** ... **Lower bound: 1900-01-01.** ... **Reads take instants.** `from` / `to` on history and PRs, and the four bounds of compare, are ISO-8601 date-times with `Z` or an offset forming a half-open range `[from, to)` ... There is no `timeZone` parameter and no upper limit on `to`.

5. **Accepted offset variants vs the query-string `+` regex (`02-design.md` §8):**
   - `02-design.md` §8 (paragraph 5):
     > `Temporal` also accepts a space instead of `T`, lower-case `t` and `z`, an offset written `+07` or `+0700`, the compact `20250210T053000Z`, and reads a leap second `:60` as `:59` (V-17); all are kept, since each names one instant without doubt.
   - `02-design.md` §8 (paragraph 8):
     > A space in exactly that place (`T\d\d:\d\d(:\d\d(\.\d+)?)? \d\d:\d\d$`) has no other meaning, so it is read as `+`;

6. **Document status and ambiguity changelog (`01-requirements.md` §9 & `02-design.md` header vs `debate/resolution.md` §21):**
   - `01-requirements.md` §9:
     > The readings below are the ones standing after both debate rounds and the owner's catalog requirement. A1, A3, A5 and A7 changed in round 1; A5 changed again in round 2; A2 changed with the owner's requirement.
   - `debate/resolution.md` §21:
     > **Applied** to design §3, §5, §7, §8 (rewritten) ... requirements A1 and A6

---

### 6. Technical Errors

1. **RFC 3339 grammar (`02-design.md` §8):** §8 calls the input format *"an RFC 3339 / ISO-8601 date-time with `Z` or an offset"* and notes that `+07`, `+0700`, and compact `20250210T053000Z` are accepted. In **RFC 3339** (§5.6), colons in numeric offsets (`±HH:MM`) and hyphens/colons in `YYYY-MM-DDTHH:MM:SS` are mandatory; `+07`, `+0700`, and `20250210T053000Z` are ISO 8601 extensions that violate RFC 3339 (*recalled*).
2. **`Temporal.ZonedDateTime` serialization (`02-design.md` §8):** §8 recommends `Temporal.ZonedDateTime` with `.add({ months: 1 })` / `.add({ weeks: 1 })` to produce query bounds while banning bracketed zones (`[America/Los_Angeles]`). In ECMAScript `Temporal`, `ZonedDateTime.prototype.toString()` and `.toJSON()` include `[TimeZone]` by default (`timeZoneName: 'auto'`) per RFC 9557 (*recalled*).
3. **PostgreSQL `timestamptz` acceptance of `Temporal` years `<= 0` (`05-research-notes.md` U-24; `03-decision-log.md` D-18):** U-24 implies `Temporal` years after `4713 BC` are valid in PostgreSQL `timestamptz`. In fact, `Temporal` uses ISO 8601 proleptic astronomical numbering (`0000-01-01T00:00:00Z` for 1 BC, `-000001-01-01T00:00:00Z` for 2 BC), whereas PostgreSQL rejects year `0000` and leading-minus ISO timestamps with SQLSTATE `22008` (`date/time field value out of range`), requiring `BC` notation (*recalled*). Without bounds on `from`/`to`, those inputs pass `Temporal.Instant.from` and fail in PostgreSQL.
4. **Why millisecond truncation is needed before write (`02-design.md` §8; `05-research-notes.md` U-23):** §8 claims values must be truncated to milliseconds before `INSERT` because *"PostgreSQL rounds extra digits rather than cutting them (U-23), and a cursor built from a different value than the stored one would skip or repeat a row."* In §9.2, cursors are built on `GET` from the `timestamptz(3)` column **already stored in PostgreSQL**, which has already been rounded/truncated to 3 digits and matches the index value identically (*from the documents*, `02-design.md` §9.2; *recalled*). Pre-write truncation actually prevents a mismatch between the in-memory `201 Created` response and the stored row, or between a sub-millisecond `from`/`to` filter and the stored row.
5. **`node-postgres` "Date at local midnight" on the instant path (`03-decision-log.md` D-22):** D-22 states that the non-UTC test zones *"now guard the instant path (no session-zone cast, no Date at local midnight)."* `node-postgres` (`pg-types`) only constructs a local-midnight `Date` for SQL `date` (OID 1082), which was removed; `timestamptz` (OID 1184) always carries an explicit UTC offset on the wire and is parsed into an exact UTC epoch millisecond (*recalled*).

---

### 7. Interview Questions the Change Invites

1. *"In Everfit, a coach in New York reviews a California client's 'PR this month vs last month' (`F3.5`). The client hit a Squat PR at 9:30 PM PST on Feb 28 (`2025-03-01T05:30:00Z`). Under your design, why does the client's app show that PR in February while the coach's app puts it in March — and why did you discard the `-08:00` offset that the client sent on write?"*
2. *"Your README tells a client with a date-only picker to send noon in the athlete's offset (`12:00:00+07:00`), and your validator rejects any timestamp more than 15 minutes in the future. What happens when a user logs today's morning workout at 8:00 AM using that date picker?"*
3. *"Your README tells callers to compute week/month bounds with `Temporal.ZonedDateTime` and `.add({ weeks: 1 })`, yet your validator rejects bracketed time zones like `2025-03-09T00:00:00-08:00[America/Los_Angeles]`. What does `zdt.toString()` return by default in Node 26, and why did you ban it instead of using `offset: 'reject'`?"*
4. *"Why did you enforce a `1900-01-01` floor on `POST` to prevent out-of-range `Temporal` years from hitting PostgreSQL, but leave `from` and `to` unbounded on `GET` where `from=0000-01-01T00:00:00Z` triggers a PostgreSQL `22008` 500 error?"*
5. *"In your Los Angeles daylight-saving integration test (§12), all the `ZonedDateTime.add({ weeks: 1 })` logic runs in the test file and the server just compares two UTC timestamps. What server code is that test actually testing?"*

