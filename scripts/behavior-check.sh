#!/usr/bin/env bash
# Behavior check for the Workout Logging API, by hand-sent HTTP calls only.
#
# It needs bash and curl, nothing else (the README's "Docker and nothing else").
# Each line is one behavior from the brief or the README, sent to a running API;
# PASS means the status and the body fragments are as the README says.
#
#   bash scripts/behavior-check.sh              # API already running on :3000
#   bash scripts/behavior-check.sh --up         # start the stack first, as the README does
#   bash scripts/behavior-check.sh -v           # show every request's answer
#   bash scripts/behavior-check.sh --chaos      # also stop PostgreSQL and bring it back
#   BASE_URL=http://localhost:3100 bash scripts/behavior-check.sh
#   ADMIN_API_TOKEN=... bash scripts/behavior-check.sh   # if the admin guard is on
#
# Each run uses its own two user ids and its own catalog names, so a run does
# not disturb the next one. Exit code: 0 all passed, 1 a check failed, 2 the
# API is not reachable (or the script was not started with bash).
#
# What a run leaves behind: its workout entries (about 30, under two new
# u_check..._<run> users). The API has no route that deletes an entry, so they
# stay until `docker compose down -v`. The catalog items a run creates are
# deleted by the run; a run that is stopped inside section 8 can leave a
# "Check ... <run>" exercise or a "grp<run>" muscle group in the catalog, and
# the seeded counts of the README (12, 87, 183) are then off by those.
#
# --up and --chaos run `docker compose` in this repository with the
# environment of your shell, so they act on that compose project: use them
# only when BASE_URL is the API of that same project. With another BASE_URL,
# --chaos would stop one database and check another API.

if [ -z "${BASH_VERSION:-}" ]; then echo "Run this script with bash: bash scripts/behavior-check.sh"; exit 2; fi
case ":${SHELLOPTS:-}:" in *:posix:*) echo "Run this script with bash, not sh: bash scripts/behavior-check.sh"; exit 2 ;; esac

BASE_URL=${BASE_URL:-http://localhost:3000}
ADMIN_API_TOKEN=${ADMIN_API_TOKEN:-}
VERBOSE=0
DO_UP=0
DO_CHAOS=0
for arg in "$@"; do
  case $arg in
    -v|--verbose) VERBOSE=1 ;;
    --up) DO_UP=1 ;;
    --chaos) DO_CHAOS=1 ;;
    -h|--help) sed -n '2,/^$/{/^#/p;}' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg (try --help)"; exit 2 ;;
  esac
done

ROOT=$(cd "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d)
BODY=$TMP/body
HEAD=$TMP/head
trap 'rm -rf "$TMP"' EXIT

if [ -t 1 ]; then G=$'\033[32m'; R=$'\033[31m'; Y=$'\033[33m'; B=$'\033[1m'; Z=$'\033[0m'; else G=; R=; Y=; B=; Z=; fi
PASS=0; FAIL=0; SKIP=0
STATUS=000; LAST_REQ=

# call METHOD PATH [json-body]
#   CT=<type> overrides the Content-Type; DATAFILE=<file> sends a file as the body.
call() {
  local method=$1 path=$2 body=${3-} ct=${CT:-application/json}
  LAST_REQ="$method $path"
  local args=(-sS -m 30 -X "$method" -o "$BODY" -D "$HEAD" -w '%{http_code}')
  case $path in
    /v1/admin/*) if [ -n "$ADMIN_API_TOKEN" ]; then args+=(-H "Authorization: Bearer $ADMIN_API_TOKEN"); fi ;;
  esac
  if [ -n "${DATAFILE-}" ]; then
    args+=(-H "Content-Type: $ct" --data-binary "@$DATAFILE")
  elif [ -n "$body" ]; then
    args+=(-H "Content-Type: $ct" --data-binary "$body")
  fi
  : > "$BODY"; : > "$HEAD"
  STATUS=$(curl "${args[@]}" "$BASE_URL$path" 2>"$TMP/curl.err") || STATUS=000
}

# expect "behavior" STATUS [needle ...]
#   needle        the body must contain it (fixed text)
#   !needle       the body must not contain it
#   h:needle      a response header line must contain it (any case)
#   !h:needle     no response header line may contain it (any case)
#   re:pattern    the body must match it (a basic regular expression; the body
#                 is one line, so "A.*B" says that A comes before B)
#   =empty        the body must be empty
expect() {
  local desc=$1 want=$2 why= n
  shift 2
  [ "$STATUS" = "$want" ] || why="status is $STATUS, expected $want"
  for n in "$@"; do
    case $n in
      '!h:'*) if grep -qiF -- "${n#!h:}" "$HEAD"; then why="$why; header should not be there: ${n#!h:}"; fi ;;
      '!'*)   if grep -qF -- "${n#!}" "$BODY"; then why="$why; body should not contain: ${n#!}"; fi ;;
      h:*)    grep -qiF -- "${n#h:}" "$HEAD" || why="$why; header lacks: ${n#h:}" ;;
      re:*)   grep -q -- "${n#re:}" "$BODY" || why="$why; body does not match: ${n#re:}" ;;
      =empty) if [ -s "$BODY" ]; then why="$why; body is not empty"; fi ;;
      *)      grep -qF -- "$n" "$BODY" || why="$why; body lacks: $n" ;;
    esac
  done
  why=${why#; }
  if [ -z "$why" ]; then
    PASS=$((PASS + 1)); printf '  %sPASS%s  %s\n' "$G" "$Z" "$desc"
    [ "$VERBOSE" = 1 ] && show
  else
    FAIL=$((FAIL + 1)); printf '  %sFAIL%s  %s\n' "$R" "$Z" "$desc"
    printf '          %s\n' "$why"
    show
  fi
  return 0
}

show() {
  printf '          %s -> %s\n' "$LAST_REQ" "$STATUS"
  if [ "$STATUS" = 000 ]; then printf '          curl: %s\n' "$(cat "$TMP/curl.err")"; fi
  printf '          %s\n' "$(head -c 700 "$BODY" | tr '\n' ' ')"
}

skip() { SKIP=$((SKIP + 1)); printf '  %sSKIP%s  %s\n' "$Y" "$Z" "$1"; }
section() { printf '\n%s%s%s\n' "$B" "$1" "$Z"; }
field() { sed -n "s/.*\"$1\":\"\\([^\"]*\\)\".*/\\1/p" "$BODY" | head -1; }
# A catalog key as a path segment, the way encodeURIComponent writes it.
enc() { printf '%s' "$1" | sed -e 's/ /%20/g' -e 's|/|%2F|g'; }
lower() { printf '%s' "$1" | tr 'A-Z' 'a-z'; }

# --- Start the stack, as the README says -----------------------------------
if [ "$DO_UP" = 1 ]; then
  echo "Starting the stack (docker compose up -d --build --wait) in $ROOT ..."
  (cd "$ROOT" && docker compose up -d --build --wait --wait-timeout 420) || { echo "docker compose up failed"; exit 2; }
fi

call GET /health/ready
if [ "$STATUS" = 000 ]; then
  echo "The API does not answer at $BASE_URL."
  echo "Start it first, from the repository root: docker compose up --build"
  echo "(see README, \"Running it\"), or run this script with --up."
  exit 2
fi

# $U holds the entries that sections 3, 5 and 6 count on: no other check adds
# an entry to it before section 7. Every other entry goes to $U2.
RUN=$(date +%s)$RANDOM
U=u_check_$RUN
E=/v1/users/$U/workout-entries
U2=u_check2_$RUN
E2=/v1/users/$U2/workout-entries
echo "API: $BASE_URL    users: $U, $U2"

# --- 1. Health and documentation -------------------------------------------
section "1. Health and documentation"
call GET /health/live;   expect "liveness answers 200" 200 '"status":"ok"'
call GET /health/ready;  expect "readiness reports the database up" 200 '"status":"ok"' '"database":{"status":"up"}'
call GET /docs;          expect "Swagger UI is served at /docs" 200 'Swagger UI'
call GET /docs-json;     expect "the OpenAPI document is served at /docs-json" 200 '"openapi"'

# --- 2. Catalog and reference data ------------------------------------------
section "2. Catalog and reference data (seeded by the migrate step)"
call GET /v1/units;                 expect "units list kg and lb with aliases" 200 '"kg"' '"lb"' 'lbs'
call GET /v1/muscle-groups;         expect "muscle groups are listed with exercise counts" 200 '"name":"chest"' '"exerciseCount"'
call GET /v1/exercises/bench%20press; expect "one catalog exercise by key" 200 '"key":"bench press"' '"muscleGroups":["chest","shoulders","triceps"]'
call GET /v1/exercises/Bench%20Press; expect "any spelling of the key reaches the same exercise" 200 '"key":"bench press"'
call GET /v1/exercises/no%20such%20lift; expect "an unknown exercise is a 404 problem" 404 '"code":"NOT_FOUND"' 'h:application/problem+json'

# --- 3. Logging workouts -----------------------------------------------------
section "3. Logging workouts"
call POST "$E" '{"date":"2025-02-10T05:30:00+07:00","exerciseName":"Bench Press","sets":[{"reps":5,"weight":225,"unit":"lbs"},{"reps":3,"weight":105,"unit":"kg"}]}'
expect "single entry: 201 with Location" 201 "h:location: /v1/users/$U/workout-entries/" '"exerciseKey":"bench press"' '"muscleGroups":["chest","shoulders","triceps"]'
expect "  ... stored in kg, original kept, alias lbs became lb" 201 '"weight":102.06' '"original":{"weight":225,"unit":"lb"}'
expect "  ... 05:30 at +07:00 is the previous UTC day, offset kept" 201 '"date":"2025-02-09T22:30:00.000Z"' '"utcOffset":"+07:00"'
ID1=$(field id)
call GET "$E/$ID1?unit=lb"; expect "one entry by id, shown in pounds" 200 '"weight":231.49' '!"weight":102.06' '"original":{"weight":225,"unit":"lb"}'
call POST "$E" '{"date":"2025-02-12T12:30:00Z","exerciseName":"Bench Press","sets":[{"reps":10,"weight":100,"unit":"kg"},{"reps":2,"weight":120,"unit":"kg"}]}'
expect "a client that sends UTC gets utcOffset null" 201 '"utcOffset":null'
call POST "$E" '{"date":"2025-01-15T18:00:00+07:00","exerciseName":"Bench Press","sets":[{"reps":10,"weight":95,"unit":"kg"},{"reps":4,"weight":112.5,"unit":"kg"},{"reps":2,"weight":115,"unit":"kg"}]}'
expect "a January session, for the comparison below" 201 '"date":"2025-01-15T11:00:00.000Z"'
call POST "$E/bulk" '{"entries":[{"date":"2025-02-14T12:00:00+07:00","exerciseName":"Back Squat","sets":[{"reps":5,"weight":140,"unit":"kg"},{"reps":5,"weight":150,"unit":"kg"}]},{"date":"2025-02-14T12:00:00+07:00","exerciseName":"Pull-Up","sets":[{"reps":10,"weight":0,"unit":"kg"}]}]}'
expect "bulk: two entries in one 201, in the order sent, no Location" 201 're:"exerciseName":"Back Squat".*"exerciseName":"Pull-Up"' '!h:location:'
call POST "$E/bulk" '{"entries":[{"date":"2025-02-15T12:00:00+07:00","exerciseName":"Atomic Probe","sets":[{"reps":5,"weight":50,"unit":"kg"}]},{"date":"2025-02-15T12:00:00+07:00","exerciseName":"Atomic Probe","sets":[{"reps":5,"weight":50,"unit":"stone"}]}]}'
expect "bulk with one bad entry: 400 naming the path" 400 '"code":"VALIDATION_ERROR"' 'entries[1].sets[0].unit'
call GET "$E?exercise=atomic%20probe"; expect "  ... and the batch was refused as a whole: its good entry is not stored" 200 '"data":[]'
call GET "/v1/users/nobody_$RUN/workout-entries"; expect "a well-formed user with no entries is a 200, not a 404" 200 '"data":[]'
call POST "$E2" "{\"userId\":\"$U2\",\"date\":\"2025-02-10T05:30:00+07:00\",\"exerciseName\":\"Bench Press\",\"sets\":[{\"reps\":5,\"weight\":100,\"unit\":\"kg\"}]}"
expect "a body userId equal to the path is accepted (the brief lists userId as a field)" 201 "\"userId\":\"$U2\"" '"exerciseKey":"bench press"'
call POST "$E2" "{\"date\":\"2025-02-11T12:00:00+07:00\",\"exerciseName\":\"Probe Lift $RUN\",\"sets\":[{\"reps\":8,\"weight\":40,\"unit\":\"kg\"}]}"
expect "an exercise the catalog does not know is accepted, with no muscle groups" 201 "\"exerciseKey\":\"probe lift $RUN\"" '"muscleGroups":[]'
call GET "$E2?muscleGroup=chest"; expect "  ... and no muscle-group filter matches it" 200 '"exerciseName":"Bench Press"' "!\"exerciseName\":\"Probe Lift $RUN\""

# --- 4. Mistakes the API explains --------------------------------------------
section "4. Mistakes the API explains (every one is application/problem+json)"
call POST "$E" '{"date":"2025-02-10","exerciseName":"Bench Press","sets":[{"reps":5,"weight":100,"unit":"kg"}]}'
expect "a date alone is a 400 on date that shows the fix" 400 '"path":"date"' 'has no time or UTC offset' 'h:application/problem+json'
call POST "$E" '{"date":"2025-02-10T06:30:00","exerciseName":"Bench Press","sets":[{"reps":5,"weight":100,"unit":"stone"}]}'
expect "no offset and an unknown unit: both errors in one answer" 400 '"path":"date"' '"path":"sets[0].unit"' 'Supported units'
call POST "$E" '{"date":null,"exerciseName":"Bench Press","sets":[{"reps":5,"weight":100,"unit":"kg"}]}'
expect "a null date is a 400 on date" 400 '"code":"VALIDATION_ERROR"' '"path":"date"'
call POST "$E" '{"date":"2025-02-10T05:30:00+07:00","exerciseName":"Bench Press","sets":[{"reps":-5,"weight":-100,"unit":"kg"}]}'
expect "negative reps and a negative weight: both named in one answer" 400 '"path":"sets[0].reps"' '"path":"sets[0].weight"'
call POST "$E" '{"date":"2025-02-10T05:30:00+07:00","exerciseName":"Bench Press","sets":[]}'
expect "an empty sets array is a 400 on sets" 400 '"code":"VALIDATION_ERROR"' '"path":"sets"'
call POST "$E" '{"exerciseName":"Bench Press"}'
expect "missing fields: each one named in one answer" 400 '"path":"date"' '"path":"sets"' '!"path":"exerciseName"'
call POST "$E" '{}'
expect "an empty object is a 400 that shows the shape of an entry" 400 '"code":"VALIDATION_ERROR"' '"path":""' 'The body must be one entry object'
CT=application/x-www-form-urlencoded call POST "$E" 'date=2025-02-10T05:30:00%2B07:00&exerciseName=Bench%20Press'
expect "a body that is not JSON (curl -d with no -H) is a 415 that says what to send" 415 '"code":"UNSUPPORTED_MEDIA_TYPE"' 'Send Content-Type: application/json'
call POST "$E" '{"date": '
expect "unparseable JSON is MALFORMED_JSON" 400 '"code":"MALFORMED_JSON"'
call POST "$E" '{"date":"2025-02-10T05:30:00+07:00","exerciseName":"Bench Press","sets":[{"reps":"5","weight":100,"unit":"kg"}]}'
expect "a number sent as a string is refused, not converted" 400 '"path":"sets[0].reps"'
call POST "$E" '{"userId":"someone_else","date":"2025-02-10T05:30:00+07:00","exerciseName":"Bench Press","sets":[{"reps":5,"weight":100,"unit":"kg"}]}'
expect "a body userId that differs from the path is a 400" 400 '"path":"userId"'
call POST "$E" '{"date":"2099-01-01T00:00:00Z","exerciseName":"Bench Press","sets":[{"reps":5,"weight":100,"unit":"kg"}]}'
expect "a date in the future is a 400" 400 '"path":"date"'
call POST "$E" '{"date":"2025-02-10T05:30:00+07:00","exerciseName":"Bench Press","sets":[{"reps":0,"weight":100,"unit":"kg"}]}'
expect "reps = 0 is refused" 400 '"path":"sets[0].reps"'
sets=; i=0; while [ $i -lt 51 ]; do sets="$sets{\"reps\":5,\"weight\":50,\"unit\":\"kg\"},"; i=$((i + 1)); done
call POST "$E" "{\"date\":\"2025-02-10T05:30:00+07:00\",\"exerciseName\":\"Bench Press\",\"sets\":[${sets%,}]}"
expect "51 sets in one entry is a 400 (the limit is 50)" 400 '"path":"sets"'
call GET "$E?exerciseName=bench"; expect "an unknown query parameter is a 400 that lists the accepted ones" 400 '"path":"exerciseName"' 'Accepted parameters' 'muscleGroup'
call GET "$E?exercise=%20";       expect "a blank exercise filter is a 400, not 'no filter'" 400 '"path":"exercise"'
call GET "$E?from=2025-02-01";    expect "a date alone as a bound is a 400" 400 '"path":"from"'
{ printf '{"pad":"'; head -c 1100000 /dev/zero | tr '\0' 'a'; printf '"}'; } > "$TMP/big.json"
DATAFILE=$TMP/big.json call POST "$E" ''
expect "a body over 1 MB is a 413" 413 '"code":"PAYLOAD_TOO_LARGE"'
call GET /nope;   expect "an unknown route is a 404 problem" 404 '"code":"NOT_FOUND"' 'h:application/problem+json'
call GET /;       expect "even the root path answers problem details, not HTML" 404 '"code":"NOT_FOUND"' 'h:application/problem+json'
RID=$(sed -n 's/^[Xx]-[Rr]equest-[Ii]d: *\([^[:space:]]*\).*/\1/p' "$HEAD" | head -1)
if [ -n "$RID" ]; then expect "the x-request-id header is the body's requestId" 404 "\"requestId\":\"$RID\""; else skip "x-request-id header missing"; fi

# --- 5. History ---------------------------------------------------------------
section "5. History: order, paging, filters, half-open ranges"
call GET "$E?limit=2"
expect "newest first, a page of 2, more to come" 200 '"hasMore":true' '"exerciseName":"Back Squat"' '"exerciseName":"Pull-Up"' '!"date":"2025-02-12'
CURSOR=$(field nextCursor)
call GET "$E?limit=2&cursor=$CURSOR"
expect "the cursor gives the next page" 200 '"date":"2025-02-12T12:30:00.000Z"' '"date":"2025-02-09T22:30:00.000Z"' '!"exerciseName":"Back Squat"'
call GET "$E?limit=1"
expect "entries of one instant: the one sent last comes first" 200 '"exerciseName":"Pull-Up"' '!"exerciseName":"Back Squat"'
call GET "$E?limit=2&cursor=not-a-cursor"; expect "a malformed cursor is a 400" 400 '"path":"cursor"'
call GET "$E?exercise=squat";             expect "exercise filters by part of the name" 200 '"exerciseName":"Back Squat"' '!"exerciseName":"Bench Press"'
call GET "$E?muscleGroup=chest";          expect "muscleGroup filters through the catalog" 200 '"exerciseName":"Bench Press"' '!"exerciseName":"Back Squat"'
call GET "$E?muscleGroup=not-a-group";    expect "an unknown muscle group is a 400 listing the known ones" 400 '"path":"muscleGroup"' 'Known muscle groups' 'chest'
call GET "$E?from=2025-02-09T22:30:00Z&to=2025-02-09T22:30:01Z"
expect "range: 'from' is included" 200 '"date":"2025-02-09T22:30:00.000Z"'
call GET "$E?from=2025-02-09T22:29:00Z&to=2025-02-09T22:30:00Z"
expect "range: 'to' is excluded" 200 '"data":[]'
call GET "$E?from=2025-02-10T05:30:00+07:00&to=2025-02-10T05:30:01+07:00"
expect "an offset written with a plain + (it arrives as a space) is read as +" 200 '"date":"2025-02-09T22:30:00.000Z"' '!"date":"2025-02-12'
call GET "$E?from=2025-02-10T05:30:00%2B07:00&to=2025-02-10T05:30:01%2B07:00"
expect "  ... and the same bounds with %2B give the same entry" 200 '"date":"2025-02-09T22:30:00.000Z"' '!"date":"2025-02-12'
call GET "$E?from=2025-02-09T22:30:00Z&to=2025-02-09T22:30:01Z&unit=lb"
expect "unit=lb shows weights in pounds (105 kg is 231.49)" 200 '"weight":231.49' '!"weight":102.06'
call GET "$E?exercise=nothing-like-this"; expect "no match is a 200 with a message" 200 '"data":[]' 'No workout entries found'
call GET "$E?limit=101";                  expect "limit above 100 is a 400" 400 '"path":"limit"'

# --- 6. Personal records -------------------------------------------------------
section "6. Personal records and comparison"
call GET "/v1/users/$U/personal-records?exercise=Bench%20Press"
expect "heaviest set: 120 kg x 2" 200 '"heaviestSet":{"weight":120,"reps":2,"unit":"kg"'
expect "  ... with the date it was achieved and its set number" 200 're:"heaviestSet":{[^}]*},"date":"2025-02-12T12:30:00.000Z","utcOffset":null,"entryId":"[^"]*","setNumber":2}'
expect "highest volume: 100 kg x 10 = 1000" 200 '"highestVolumeSet":{"volume":1000,"weight":100,"reps":10'
expect "best estimated 1RM: 133.33" 200 '"estimatedOneRepMax":133.33'
call GET "/v1/users/$U/personal-records?exercise=Bench%20Press&from=2025-02-01T00:00:00Z&to=2025-03-01T00:00:00Z&unit=lb"
expect "records in a range, in pounds (120 kg = 264.55 lb)" 200 '"unit":"lb"' '"weight":264.55'
call GET "/v1/users/$U/personal-records?exercise=Pull-Up"
expect "a bodyweight set (weight 0) is a record with weight 0" 200 '"heaviestSet":{"weight":0,"reps":10'
call GET "/v1/users/$U/personal-records?exercise=bench"
expect "part of a name finds nothing here: null records and a hint" 200 '"heaviestSet":null' 'whole exercise name'
call GET "/v1/users/$U/personal-records"; expect "exercise is required" 400 '"path":"exercise"'
C="/v1/users/$U/personal-records/compare?exercise=Bench%20Press"
call GET "$C&from=2025-02-01T00:00:00Z&to=2025-03-01T00:00:00Z&compareFrom=2025-01-01T00:00:00Z&compareTo=2025-02-01T00:00:00Z&unit=kg"
expect "compare Feb with Jan: heaviest +5 (4.35%)" 200 '"heaviestSet":{"absolute":5,"percent":4.35}'
expect "  ... volume +50 (5.26%), estimated 1RM +5.83 (4.58%)" 200 '"highestVolumeSet":{"absolute":50,"percent":5.26}' '"bestEstimatedOneRepMax":{"absolute":5.83,"percent":4.58}'
expect "  ... each period's records carry their own date" 200 '"date":"2025-02-12T12:30:00.000Z"' '"date":"2025-01-15T11:00:00.000Z"'
call GET "$C&from=2025-03-01T00:00:00Z&to=2025-04-01T00:00:00Z&compareFrom=2025-02-01T00:00:00Z&compareTo=2025-03-01T00:00:00Z&unit=kg"
expect "an empty period is still a 200: every delta null, message names it" 200 '"delta":{"heaviestSet":null' 'the current period' '"heaviestSet":{"weight":120'
call GET "$C&from=2025-02-01T00:00:00Z"
expect "missing bounds: one 400 listing every missing parameter" 400 '"path":"compareFrom"' '"path":"compareTo"' '"path":"to"'

# The rules below need entries of their own; they go to $U2.
P2="/v1/users/$U2/personal-records"
call POST "$E2" '{"date":"2025-02-13T12:00:00+07:00","exerciseName":"Deadlift","sets":[{"reps":1,"weight":100,"unit":"kg"}]}'
expect "a single: 100 kg x 1 is logged" 201 '"reps":1'
call GET "$P2?exercise=Deadlift"
expect "  ... Epley at one rep: estimated 1RM 103.33, as the brief's formula gives" 200 '"estimatedOneRepMax":103.33' '"heaviestSet":{"weight":100,"reps":1'
call POST "$E2/bulk" '{"entries":[{"date":"2025-02-03T12:00:00Z","exerciseName":"Overhead Press","sets":[{"reps":5,"weight":60,"unit":"kg"}]},{"date":"2025-02-17T12:00:00Z","exerciseName":"Overhead Press","sets":[{"reps":5,"weight":60,"unit":"kg"}]}]}'
expect "the same lift (60 kg x 5) on two days, two weeks apart" 201
call GET "$P2?exercise=Overhead%20Press"
expect "  ... a later lift that equals the record does not move its date" 200 '"heaviestSet":{"weight":60,"reps":5' '"date":"2025-02-03T12:00:00.000Z"' '!"date":"2025-02-17'
call POST "$E2/bulk" '{"entries":[{"date":"2025-02-04T12:00:00Z","exerciseName":"Pull-Up","sets":[{"reps":5,"weight":0,"unit":"kg"}]},{"date":"2025-02-18T12:00:00Z","exerciseName":"Pull-Up","sets":[{"reps":20,"weight":0,"unit":"kg"}]}]}'
expect "bodyweight pull-ups: 5 reps, then 20 reps two weeks later" 201
call GET "$P2?exercise=Pull-Up"
expect "  ... every record is the first set: 20 reps do not beat the earlier 5" 200 '"heaviestSet":{"weight":0,"reps":5' '"highestVolumeSet":{"volume":0,"weight":0,"reps":5' '"bestEstimatedOneRepMax":{"estimatedOneRepMax":0,"weight":0,"reps":5' '!"reps":20'

# --- 7. Concurrent writes --------------------------------------------------------
section "7. Concurrent writes: 10 identical requests at once"
PAR='{"date":"2025-02-16T12:00:00+07:00","exerciseName":"Concurrency Probe","sets":[{"reps":5,"weight":60,"unit":"kg"}]}'
i=0; while [ $i -lt 10 ]; do
  curl -sS -m 30 -o /dev/null -w '%{http_code}\n' -X POST -H 'Content-Type: application/json' --data-binary "$PAR" "$BASE_URL$E" > "$TMP/par.$i" 2>/dev/null &
  i=$((i + 1))
done
wait
CREATED=$(cat "$TMP"/par.* | grep -c '^201$')
call GET "$E?exercise=concurrency%20probe&limit=100"
STORED=$(grep -o '"exerciseName":"Concurrency Probe"' "$BODY" | wc -l | tr -d ' ')
if [ "$CREATED" = 10 ] && [ "$STORED" = 10 ]; then
  PASS=$((PASS + 1)); printf '  %sPASS%s  10 identical requests: ten 201s and ten stored entries (none merged, none lost)\n' "$G" "$Z"
else
  FAIL=$((FAIL + 1)); printf '  %sFAIL%s  10 identical requests: %s answered 201, %s entries stored (expected 10 and 10)\n' "$R" "$Z" "$CREATED" "$STORED"
fi

# --- 8. Catalog administration (open routes unless the guard is switched on) -----
# Every name here is this run's own, so the run changes and deletes only what
# it created: no seeded item, and no item a developer added by hand.
section "8. Catalog administration"
NAME="Check Lift $RUN"
KEY=$(lower "$NAME")
ENC=$(enc "$KEY")
SLASH_NAME="90/90 Check $RUN"
SLASH_KEY=$(lower "$SLASH_NAME")
SLASH_ENC=$(enc "$SLASH_KEY")
GRP="grp$RUN"
GRP_NAME="Check Group Lift $RUN"
GRP_ENC=$(enc "$(lower "$GRP_NAME")")
call POST /v1/admin/exercises "{\"name\":\"$NAME\",\"muscleGroups\":[\"quads\",\"glutes\"]}"
if [ "$STATUS" = 401 ]; then
  skip "the admin guard is on (401): send ADMIN_API_TOKEN=<token> to test these routes"
else
  expect "create an exercise: 201 with Location to its key" 201 "h:location: /v1/exercises/$ENC" '"muscleGroups":["quads","glutes"]'
  call POST /v1/admin/exercises "{\"name\":\"$NAME\",\"muscleGroups\":[\"quads\"]}"
  expect "the same name again is a 409 EXERCISE_EXISTS" 409 '"code":"EXERCISE_EXISTS"'
  call POST /v1/admin/exercises "{\"name\":\"Check Bad $RUN\",\"muscleGroups\":[\"not-a-group\"]}"
  expect "an unknown muscle group is a 400 listing the known ones" 400 '"path":"muscleGroups[0]"' 'Known muscle groups' 'chest'
  call GET "/v1/exercises/$ENC"; expect "the new exercise is readable at once" 200 "\"key\":\"$KEY\""
  call POST "$E2" "{\"date\":\"2025-02-17T12:00:00+07:00\",\"exerciseName\":\"$NAME\",\"sets\":[{\"reps\":5,\"weight\":60,\"unit\":\"kg\"}]}"
  expect "an entry logged for it shows the catalog's muscle groups" 201 '"muscleGroups":["quads","glutes"]'
  call GET "$E2?muscleGroup=quads"; expect "  ... and the muscle-group filter finds that entry" 200 "\"exerciseName\":\"$NAME\""
  call PUT "/v1/admin/exercises/$ENC" "{\"name\":\"$NAME\",\"muscleGroups\":[\"quads\",\"glutes\",\"back\"]}"
  expect "replace its muscle groups" 200 '"muscleGroups":["quads","glutes","back"]'
  call GET "$E2?exercise=$ENC"; expect "  ... the entry already logged shows the new groups, with no deploy" 200 "\"exerciseName\":\"$NAME\"" '"muscleGroups":["quads","glutes","back"]'
  call GET "$E2?muscleGroup=back"; expect "  ... and the filter on the added group finds it" 200 "\"exerciseName\":\"$NAME\""
  call PUT "/v1/admin/exercises/$ENC" '{"name":"A Different Name","muscleGroups":["quads"]}'
  expect "a name whose key differs from the path is a 400" 400 '"path":"name"'
  call DELETE "/v1/admin/exercises/$ENC"; expect "delete: 204 with an empty body" 204 =empty
  call GET "/v1/exercises/$ENC";          expect "  ... and it is gone from the catalog" 404 '"code":"NOT_FOUND"'
  call GET "$E2?exercise=$ENC";           expect "  ... its logged entry stays in history, now with no muscle groups" 200 "\"exerciseName\":\"$NAME\"" '"muscleGroups":[]'
  call GET "$E2?muscleGroup=quads";       expect "  ... and the muscle-group filter no longer matches it" 200 "!\"exerciseName\":\"$NAME\""
  call POST /v1/admin/exercises "{\"name\":\"$SLASH_NAME\",\"muscleGroups\":[\"glutes\"]}"
  expect "a key with a slash: Location is percent-encoded" 201 "h:location: /v1/exercises/$SLASH_ENC"
  call GET "/v1/exercises/$SLASH_ENC"; expect "  ... and following it works" 200 "\"key\":\"$SLASH_KEY\""
  call DELETE "/v1/admin/exercises/$SLASH_ENC"; expect "  ... cleaned up" 204 =empty
  call POST /v1/admin/muscle-groups "{\"name\":\"$GRP\"}"; expect "add a muscle group: 201 with the group" 201 "\"name\":\"$GRP\""
  call POST /v1/admin/muscle-groups "{\"name\":\"$GRP\"}"; expect "the same group again is a 409 MUSCLE_GROUP_EXISTS" 409 '"code":"MUSCLE_GROUP_EXISTS"'
  call POST /v1/admin/exercises "{\"name\":\"$GRP_NAME\",\"muscleGroups\":[\"$GRP\"]}"
  expect "an exercise can list the new group at once" 201 "\"muscleGroups\":[\"$GRP\"]"
  call DELETE "/v1/admin/muscle-groups/$GRP";             expect "a group in use cannot be deleted: 409 MUSCLE_GROUP_IN_USE" 409 '"code":"MUSCLE_GROUP_IN_USE"'
  call GET /v1/muscle-groups;                             expect "  ... and it is still listed, with its one exercise" 200 "{\"name\":\"$GRP\",\"exerciseCount\":1}"
  call DELETE "/v1/admin/exercises/$GRP_ENC";             expect "  ... its exercise deleted" 204 =empty
  call DELETE "/v1/admin/muscle-groups/$GRP";             expect "delete the group, now unused: 204" 204 =empty
fi

# --- 9. The database goes away and comes back (opt-in) -----------------------------
if [ "$DO_CHAOS" = 1 ]; then
  section "9. PostgreSQL stopped, then started again"
  (cd "$ROOT" && docker compose stop postgres >/dev/null 2>&1)
  sleep 2
  call GET /v1/exercises;   expect "database down: a data route answers 503 problem" 503 '"code":"SERVICE_UNAVAILABLE"' 'h:application/problem+json'
  call GET /health/live;    expect "database down: liveness stays 200" 200 '"status":"ok"'
  call GET /health/ready;   expect "database down: readiness is 503" 503 '"code":"SERVICE_UNAVAILABLE"'
  (cd "$ROOT" && docker compose start postgres >/dev/null 2>&1)
  i=0; while [ $i -lt 40 ]; do call GET /health/ready; [ "$STATUS" = 200 ] && break; sleep 2; i=$((i + 1)); done
  expect "database back: readiness recovers by itself" 200 '"database":{"status":"up"}'
  call GET /v1/exercises/bench%20press; expect "database back: data routes answer again" 200 '"key":"bench press"'
fi

printf '\n%s%d passed%s, ' "$G" "$PASS" "$Z"
if [ "$FAIL" -gt 0 ]; then printf '%s%d failed%s, ' "$R" "$FAIL" "$Z"; else printf '0 failed, '; fi
printf '%d skipped.\n' "$SKIP"
[ "$FAIL" -eq 0 ]
