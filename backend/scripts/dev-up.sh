#!/usr/bin/env bash

set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
compose=(docker compose -f "$repo_dir/compose.dev.yml")

if ! command -v docker >/dev/null 2>&1; then
    echo "docker is required" >&2
    exit 1
fi

"${compose[@]}" up -d

echo "Waiting for MongoDB to accept commands..."
mongo_ready=false
for _ in $(seq 1 60); do
    if "${compose[@]}" exec -T mongodb mongosh --quiet --host 127.0.0.1 --port 27017 \
        --eval 'quit(db.adminCommand({ ping: 1 }).ok === 1 ? 0 : 1)' >/dev/null 2>&1; then
        mongo_ready=true
        break
    fi
    sleep 1
done
if [[ "$mongo_ready" != true ]]; then
    echo "MongoDB did not become responsive within 60 seconds" >&2
    exit 1
fi

rs_state="$(
    "${compose[@]}" exec -T mongodb mongosh --quiet --host 127.0.0.1 --port 27017 --eval '
        try {
            const status = rs.status();
            print(status.set === "rs0" ? "INITIALIZED" : "WRONG_SET:" + status.set);
        } catch (error) {
            if (error.code === 94 || error.codeName === "NotYetInitialized") {
                print("NOT_INITIALIZED");
            } else {
                print("ERROR:" + error);
            }
        }
    ' | tr -d '\r' | tail -n 1
)"

case "$rs_state" in
    NOT_INITIALIZED)
        echo "Initializing MongoDB replica set rs0..."
        "${compose[@]}" exec -T mongodb mongosh --quiet --host 127.0.0.1 --port 27017 --eval '
            const result = rs.initiate({
                _id: "rs0",
                members: [{ _id: 0, host: "localhost:27017" }]
            });
            quit(result.ok === 1 ? 0 : 1);
        ' >/dev/null
        ;;
    INITIALIZED)
        echo "MongoDB replica set rs0 is already initialized."
        ;;
    WRONG_SET:* | ERROR:*)
        echo "Cannot use the existing MongoDB replica set state: $rs_state" >&2
        exit 1
        ;;
    *)
        echo "Unexpected MongoDB replica set state: $rs_state" >&2
        exit 1
        ;;
esac

echo "Waiting for MongoDB replica set PRIMARY..."
primary_ready=false
for _ in $(seq 1 60); do
    if "${compose[@]}" exec -T mongodb mongosh --quiet \
        'mongodb://localhost:27017/admin?replicaSet=rs0&serverSelectionTimeoutMS=2000' --eval '
            const hello = db.adminCommand({ hello: 1 });
            quit(hello.setName === "rs0" && hello.isWritablePrimary ? 0 : 1);
        ' >/dev/null 2>&1; then
        primary_ready=true
        break
    fi
    sleep 1
done
if [[ "$primary_ready" != true ]]; then
    echo "MongoDB replica set rs0 did not elect a PRIMARY within 60 seconds" >&2
    exit 1
fi

member_host="$(
    "${compose[@]}" exec -T mongodb mongosh --quiet \
        'mongodb://localhost:27017/admin?replicaSet=rs0&serverSelectionTimeoutMS=5000' \
        --eval 'print(rs.conf().members[0].host)' | tr -d '\r' | tail -n 1
)"
if [[ "$member_host" != "localhost:27017" ]]; then
    echo "Replica set advertises '$member_host'; expected the WSL-reachable address localhost:27017" >&2
    exit 1
fi

redis_ping="$("${compose[@]}" exec -T redis redis-cli ping | tr -d '\r')"
if [[ "$redis_ping" != "PONG" ]]; then
    echo "Redis PING failed: $redis_ping" >&2
    exit 1
fi

echo "MongoDB rs0 PRIMARY is ready and replica set discovery succeeded."
echo "Redis replied PONG."
echo "Backend MongoDB: mongodb://127.0.0.1:27017/MaaBackend?replicaSet=rs0"
echo "Backend Hub MongoDB: mongodb://127.0.0.1:27017/HubBackend?replicaSet=rs0"
echo "Backend Redis: 127.0.0.1:6379"
