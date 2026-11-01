#!/usr/bin/env bash
# Read-only checks: the shared local services are managed by the user.
set -euo pipefail
command -v mongosh >/dev/null || { echo 'Install mongosh to check local MongoDB' >&2; exit 1; }
command -v redis-cli >/dev/null || { echo 'Install redis-cli to check local Redis' >&2; exit 1; }
mongosh 'mongodb://127.0.0.1:27017/?directConnection=true&serverSelectionTimeoutMS=3000&connectTimeoutMS=3000' \
    --quiet --eval 'const h=db.hello(); if (!h.setName || !h.isWritablePrimary) { print("Local MongoDB must be a writable replica set"); quit(1); }'
[[ "$(redis-cli -h 127.0.0.1 -p 6379 -t 3 PING)" == PONG ]] || { echo 'Local Redis is unavailable' >&2; exit 1; }
echo 'Shared local MongoDB and Redis are ready'
