#!/usr/bin/env bash
set -euo pipefail
: "${COMPOSE_PROJECT_NAME:?Use root ./dev.sh to allocate worktree-local services}"
: "${YUANHUB_MONGO_PORT:?Use root ./dev.sh}"
: "${YUANHUB_REDIS_PORT:?Use root ./dev.sh}"
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
endpoint="${DOCKER_HOST:-$(docker context inspect "$(docker context show)" --format '{{.Endpoints.docker.Host}}')}"
case "$endpoint" in unix://*) ;; *) echo "Only local Unix Docker endpoints are allowed" >&2; exit 1 ;; esac
# Docker's context environment must not override the endpoint validated above.
unset DOCKER_CONTEXT
export DOCKER_HOST="$endpoint"
compose=(docker compose -p "$COMPOSE_PROJECT_NAME" -f compose.dev.yml)
"${compose[@]}" up -d
ready=0
for attempt in {1..45}; do
    if "${compose[@]}" exec -T mongodb mongosh --quiet --eval 'quit(db.adminCommand({ping:1}).ok ? 0 : 1)' >/dev/null 2>&1; then
        ready=1
        break
    fi
    sleep 2
done
[[ "$ready" == 1 ]] || { echo "Owned MongoDB did not start" >&2; exit 1; }
# The driver uses directConnection through its private mapped port.
"${compose[@]}" exec -T mongodb mongosh --quiet --eval '
try { rs.status() } catch (e) {
  if (e.code !== 94) throw e;
  rs.initiate({_id:"rs0",members:[{_id:0,host:"localhost:27017"}]});
}'
"${compose[@]}" up -d --wait --wait-timeout 90
printf 'Owned database services ready: %s\n' "$COMPOSE_PROJECT_NAME"
