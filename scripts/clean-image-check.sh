#!/usr/bin/env bash
# The clean-image check (design §12, §13): `docker compose up` from nothing
# gives a ready api, and the runtime image holds no .env and no development
# dependency, so the migrate step that just ran used none (§14, slice 3);
# and the api serves the seeded catalog (§12, from slice 6).
# Exits non-zero on any failed step, and removes this project's containers
# and volume whatever happens.
set -euo pipefail

cd "$(dirname "$0")/.."

api_port="${API_PORT:-3000}"

cleanup() {
  local status=$?
  if [ "$status" -ne 0 ]; then
    echo "clean-image check: FAILED (exit $status); compose logs follow" >&2
    docker compose logs --no-color >&2 || true
  fi
  docker compose down -v || true
  exit "$status"
}
trap cleanup EXIT

echo "== 1. Start from nothing: postgres, migrate, api"
docker compose down -v
docker compose up -d --build

echo "== 2. Wait for /health/ready to answer 200"
curl -fsS --retry 30 --retry-delay 3 --retry-all-errors --max-time 5 \
  "http://127.0.0.1:${api_port}/health/ready"
echo

echo "== 3. The seeded catalog is served: GET /v1/exercises/bench%20press"
curl -fsS "http://127.0.0.1:${API_PORT:-3000}/v1/exercises/bench%20press"
echo

echo "== 4. The image holds no .env"
docker compose run --rm --no-deps api sh -c 'test ! -e .env'

echo "== 5. The image holds no development dependency"
docker compose run --rm --no-deps api sh -c 'test ! -e node_modules/typescript'

echo "== 6. The image holds the catalog seed file"
docker compose run --rm --no-deps api test -f seed/exercise-catalog.seed.json

echo "== 7. Clean up"
docker compose down -v
trap - EXIT

echo "clean-image check: PASSED"
