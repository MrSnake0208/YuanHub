#!/usr/bin/env bash
set -euo pipefail

: "${BACKEND_ROOT:?BACKEND_ROOT is required}"
: "${RELEASE_VERSION:?RELEASE_VERSION is required}"
: "${RELEASE_COMMIT:?RELEASE_COMMIT is required}"
: "${PREBUILT_JAR:?PREBUILT_JAR from successful CI is required}"
[ -s "$PREBUILT_JAR" ] || { echo "CI jar is missing; server builds are disabled" >&2; exit 1; }
DEPLOY_PHASE="${DEPLOY_PHASE:-release}"
case "$DEPLOY_PHASE" in prepare|release) ;; *) echo "Invalid DEPLOY_PHASE" >&2; exit 1 ;; esac
if [ "$DEPLOY_PHASE" = release ]; then
  : "${PRODUCT_VERSION:?PRODUCT_VERSION is required}"
  : "${BACKEND_URL:?BACKEND_URL is required}"
fi
[[ "$RELEASE_COMMIT" =~ ^[0-9a-f]{40}$ ]] || { echo "RELEASE_COMMIT must be a full SHA" >&2; exit 1; }

DRAIN_SECONDS="${DRAIN_SECONDS:-45}"
LEGACY_SERVICE="${LEGACY_SERVICE:-yuanhub-backend}"
LEGACY_CAPTURE_DRAIN_SECONDS="${LEGACY_CAPTURE_DRAIN_SECONDS:-2100}"
SYSTEMCTL="${SYSTEMCTL:-$(command -v systemctl 2>/dev/null || true)}"
NGINX="${NGINX:-$(command -v nginx 2>/dev/null || true)}"
SYSTEMCTL="${SYSTEMCTL:-/usr/bin/systemctl}"
NGINX="${NGINX:-/usr/sbin/nginx}"

[[ "$RELEASE_VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z]+(\.[0-9A-Za-z]+)*)?$ ]] || {
  echo "RELEASE_VERSION must be a v-prefixed semantic version" >&2; exit 1;
}
case "$DRAIN_SECONDS" in ''|*[!0-9]*) DRAIN_SECONDS=45 ;; esac
case "$LEGACY_CAPTURE_DRAIN_SECONDS" in ''|*[!0-9]*) LEGACY_CAPTURE_DRAIN_SECONDS=2100 ;; esac

RELEASES_DIR="$BACKEND_ROOT/releases"
RELEASE_DIR="$RELEASES_DIR/$RELEASE_VERSION"
SLOTS_DIR="$BACKEND_ROOT/slots"
STATE_DIR="$BACKEND_ROOT/state"
ACTIVE_SLOT_FILE="$STATE_DIR/active-slot"
DRAIN_PID_FILE="$STATE_DIR/drain.pid"
DRAIN_LOG_FILE="$STATE_DIR/drain.log"
NGINX_ACTIVE_FILE="$BACKEND_ROOT/nginx/active.conf"

stop_old_slot() {
  local old_service
  case "$1" in
    blue|green) old_service="yuanhub-backend@$1.service" ;;
    legacy) old_service="$LEGACY_SERVICE" ;;
    *) return 1 ;;
  esac
  sudo -n "$SYSTEMCTL" stop "$old_service" || echo "Warning: could not stop $old_service" >&2
}

mkdir -p "$RELEASES_DIR"
for tool in java python3; do
  command -v "$tool" >/dev/null 2>&1 || { echo "$tool is required on the deployment server" >&2; exit 1; }
done
java_major="$(java -version 2>&1 | sed -n 's/.*version "\([0-9][0-9]*\).*/\1/p' | head -n 1)"
[ "$java_major" = "21" ] || { echo "Java 21 runtime is required" >&2; exit 1; }

if [ "$DEPLOY_PHASE" = release ]; then
  mkdir -p "$SLOTS_DIR" "$STATE_DIR" "$BACKEND_ROOT/nginx" "$BACKEND_ROOT/logs"

  command -v curl >/dev/null 2>&1 || { echo "curl is required on the deployment server" >&2; exit 1; }
  [ -x "$SYSTEMCTL" ] || { echo "systemctl not found at $SYSTEMCTL" >&2; exit 1; }
  [ -x "$NGINX" ] || { echo "nginx not found at $NGINX" >&2; exit 1; }
  [ -f "$BACKEND_ROOT/shared/backend.env" ] || {
    echo "Missing $BACKEND_ROOT/shared/backend.env" >&2
    exit 1
  }
  [ -f "$NGINX_ACTIVE_FILE" ] || {
    echo "Blue/green bootstrap has not created $NGINX_ACTIVE_FILE" >&2
    exit 1
  }

  active_slot="$(tr -d '[:space:]' < "$ACTIVE_SLOT_FILE" 2>/dev/null || true)"
  case "$active_slot" in
    blue|green|legacy) ;;
    '') active_slot=legacy ;;
    *) echo "Invalid active slot: $active_slot" >&2; exit 1 ;;
  esac

  # Serialize cancellation with the delayed stop, so it cannot outlive the next slot start.
  (
    flock -x 9
    if [ -s "$DRAIN_PID_FILE" ]; then
      read -r pending_pid pending_slot pending_target < "$DRAIN_PID_FILE"
      if kill -0 "$pending_pid" 2>/dev/null; then
        kill -- "-$pending_pid"
        if [ "$active_slot" = "$pending_target" ]; then
          stop_old_slot "$pending_slot" >> "$DRAIN_LOG_FILE" 2>&1
        fi
      fi
      rm -f "$DRAIN_PID_FILE"
    fi
  ) 9>"$STATE_DIR/drain.lock"

  slot_port() {
    case "$1" in
      blue) echo 8080 ;;
      green) echo 8081 ;;
      *) return 1 ;;
    esac
  }

  slot_management_port() {
    case "$1" in
      blue) echo 18080 ;;
      green) echo 18081 ;;
      *) return 1 ;;
    esac
  }

  read_version() {
    python3 -c 'import json,sys; data=json.load(sys.stdin).get("data") or {}; print((data.get("backend_version") or "") + " " + (data.get("backend_commit") or ""))'
  }

  version_payload_matches() {
    local payload="$1"
    local reported_version reported_commit
    read -r reported_version reported_commit <<<"$(printf '%s' "$payload" | read_version 2>/dev/null || true)"
    [ "$reported_version" = "$RELEASE_VERSION" ] || return 1
    [ -n "$reported_commit" ] || return 1
    case "$RELEASE_COMMIT" in
      "$reported_commit"*) return 0 ;;
      *) return 1 ;;
    esac
  }

  if [ "$active_slot" = "blue" ] || [ "$active_slot" = "green" ]; then
    active_port="$(slot_port "$active_slot")"
    active_payload="$(curl -fsS --max-time 5 "http://127.0.0.1:$active_port/version" 2>/dev/null || true)"
    if [ -n "$active_payload" ] && version_payload_matches "$active_payload"; then
      public_payload="$(curl -fsS --max-time 10 -H 'Cache-Control: no-cache' "${BACKEND_URL%/}/version?deploy=$RELEASE_COMMIT" 2>/dev/null || true)"
      if [ -n "$public_payload" ] && version_payload_matches "$public_payload"; then
        echo "$RELEASE_VERSION is already active on $active_slot; nothing to deploy."
        exit 0
      fi
    fi
  fi

  if [ "$active_slot" = "blue" ]; then
    target_slot=green
  else
    target_slot=blue
    if [ "$active_slot" = "legacy" ]; then
      # The legacy service already occupies 8080; first migration always stages Green on 8081.
      target_slot=green
    fi
  fi

  target_port="$(slot_port "$target_slot")"
  target_management_port="$(slot_management_port "$target_slot")"
  echo "Active slot: $active_slot"
  echo "Target slot: $target_slot (app=$target_port management=$target_management_port)"
fi

meta_file="$RELEASE_DIR/deploy-meta.json"
reuse_release=0
if [ -f "$meta_file" ] && [ -f "$RELEASE_DIR/app.jar" ]; then
  meta_commit="$(python3 -c 'import json,sys; print((json.load(open(sys.argv[1])).get("commit") or ""))' "$meta_file" 2>/dev/null || true)"
  meta_version="$(python3 -c 'import json,sys; print((json.load(open(sys.argv[1])).get("version") or ""))' "$meta_file" 2>/dev/null || true)"
  if [ "$meta_commit" = "$RELEASE_COMMIT" ] && [ "$meta_version" = "$RELEASE_VERSION" ]; then
    reuse_release=1
    echo "Reusing CI release $RELEASE_DIR"
  fi
fi

if [ "$reuse_release" -ne 1 ]; then
  # Both slots may reference rollback artifacts, including the stopped slot.
  for slot in blue green; do
    if [ -f "$SLOTS_DIR/$slot.env" ] && grep -qFx "YUANHUB_JAR=$RELEASE_DIR/app.jar" "$SLOTS_DIR/$slot.env"; then
      echo "Refusing to replace release referenced by $slot: $RELEASE_DIR" >&2
      exit 1
    fi
  done
  [ ! -e "$RELEASE_DIR" ] && [ ! -L "$RELEASE_DIR" ] || {
    echo "Refusing to replace existing release: $RELEASE_DIR" >&2; exit 1;
  }
  stage_dir="$(mktemp -d "$RELEASES_DIR/.$RELEASE_VERSION.XXXXXXXX")"
  cp "$PREBUILT_JAR" "$stage_dir/app.jar"
  python3 - "$stage_dir/deploy-meta.json" "$RELEASE_VERSION" "$RELEASE_COMMIT" <<'PY'
import json, sys
from datetime import datetime, timezone
path, version, commit = sys.argv[1:]
with open(path, "w", encoding="utf-8") as fh:
    json.dump(
        {"version": version, "commit": commit, "builtAt": datetime.now(timezone.utc).isoformat()},
        fh,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    fh.write("\n")
PY
  mv -T -n "$stage_dir" "$RELEASE_DIR"
  [ ! -d "$stage_dir" ] || { echo "Release appeared concurrently: $RELEASE_DIR" >&2; exit 1; }
  echo "Installed CI jar: $RELEASE_DIR"
fi

if [ "$DEPLOY_PHASE" = prepare ]; then
  echo "Prepared $RELEASE_VERSION ($RELEASE_COMMIT); slots and upstream are unchanged."
  exit 0
fi

history_dir="$(mktemp -d "$BACKEND_ROOT/.deploy-history.XXXXXXXX")"
for path in "$SLOTS_DIR/$target_slot.env" "$ACTIVE_SLOT_FILE" "$NGINX_ACTIVE_FILE"; do
  if [ -f "$path" ]; then cp -p "$path" "$history_dir/$(basename "$path")"; fi
done
slot_env_tmp="$(mktemp "$SLOTS_DIR/.$target_slot.env.XXXXXXXX")"
cat > "$slot_env_tmp" <<EOF
SERVER_PORT=$target_port
MANAGEMENT_SERVER_PORT=$target_management_port
MANAGEMENT_SERVER_ADDRESS=127.0.0.1
YUANHUB_JAR=$RELEASE_DIR/app.jar
YUANHUB_BACKEND_VERSION=$RELEASE_VERSION
YUANHUB_PRODUCT_VERSION=$PRODUCT_VERSION
LOGGING_FILE_NAME=$BACKEND_ROOT/logs/$target_slot.log
EOF
chmod 0640 "$slot_env_tmp"
mv -f "$slot_env_tmp" "$SLOTS_DIR/$target_slot.env"

if [ "$active_slot" = "legacy" ]; then
  legacy_capture_dir="$BACKEND_ROOT/data/star-captures"
  configured_capture_dir="$(sed -n 's/^SHARE_STAR_CAPTURE_DIR=//p' "$BACKEND_ROOT/shared/backend.env" | tail -n 1)"
  if [ -n "$configured_capture_dir" ]; then
    legacy_capture_dir="$configured_capture_dir"
    legacy_capture_dir="${legacy_capture_dir#\"}"
    legacy_capture_dir="${legacy_capture_dir%\"}"
  fi

  if [ -d "$legacy_capture_dir" ]; then
    echo "First blue/green migration: waiting for legacy in-memory star captures to finish before cutover."
    legacy_capture_deadline=$(( $(date +%s) + LEGACY_CAPTURE_DRAIN_SECONDS ))
    while find "$legacy_capture_dir" -mindepth 1 -maxdepth 1 -type d -name 'capture-*' -print -quit | grep -q .; do
      if [ "$(date +%s)" -ge "$legacy_capture_deadline" ]; then
        echo "Legacy star-capture drain timed out after ${LEGACY_CAPTURE_DRAIN_SECONDS}s; keeping legacy online." >&2
        echo "Retry the release after pending captures are consumed/expired, or inspect: $legacy_capture_dir" >&2
        exit 1
      fi
      sleep 10
    done
    echo "Legacy star-capture directory is clear; first cutover can proceed without dropping pre-Redis pending captures."
  fi
fi

target_service="yuanhub-backend@$target_slot.service"
echo "Starting $target_service"
sudo -n "$SYSTEMCTL" restart "$target_service"

local_ready=0
for attempt in $(seq 1 40); do
  if sudo -n "$SYSTEMCTL" is-active --quiet "$target_service"; then
    health="$(curl -fsS --max-time 4 "http://127.0.0.1:$target_management_port/actuator/health/readiness" 2>/dev/null || true)"
    version="$(curl -fsS --max-time 4 "http://127.0.0.1:$target_port/version" 2>/dev/null || true)"
    beta="$(curl -fsS --max-time 4 "http://127.0.0.1:$target_port/v1/beta/status" 2>/dev/null || true)"
    if printf '%s' "$health" | grep -q '"status":"UP"' &&
       [ -n "$version" ] && version_payload_matches "$version" &&
       [ -n "$beta" ]; then
      local_ready=1
      echo "Target slot passed local readiness on attempt $attempt."
      break
    fi
  fi
  sleep 3
done

if [ "$local_ready" -ne 1 ]; then
  echo "Target slot failed readiness; keeping $active_slot online." >&2
  sudo -n "$SYSTEMCTL" stop "$target_service" || true
  exit 1
fi

old_upstream="$(cat "$NGINX_ACTIVE_FILE")"
restore_upstream() {
  local tmp
  tmp="$(mktemp "$BACKEND_ROOT/nginx/.active.rollback.XXXXXXXX")"
  printf '%s\n' "$old_upstream" > "$tmp"
  mv -f "$tmp" "$NGINX_ACTIVE_FILE"
}

new_upstream_tmp="$(mktemp "$BACKEND_ROOT/nginx/.active.$target_slot.XXXXXXXX")"
printf 'server 127.0.0.1:%s max_fails=1 fail_timeout=3s;\n' "$target_port" > "$new_upstream_tmp"
mv -f "$new_upstream_tmp" "$NGINX_ACTIVE_FILE"

if ! sudo -n "$NGINX" -t; then
  echo "Nginx validation failed; rolling back upstream file." >&2
  restore_upstream
  sudo -n "$NGINX" -t || true
  sudo -n "$SYSTEMCTL" stop "$target_service" || true
  exit 1
fi

if ! sudo -n "$SYSTEMCTL" reload nginx; then
  echo "Nginx reload failed; restoring previous upstream." >&2
  restore_upstream
  sudo -n "$NGINX" -t || true
  sudo -n "$SYSTEMCTL" reload nginx || true
  sudo -n "$SYSTEMCTL" stop "$target_service" || true
  exit 1
fi

public_ready=0
for attempt in $(seq 1 20); do
  payload="$(curl -fsS --max-time 10 -H 'Cache-Control: no-cache' "${BACKEND_URL%/}/version?deploy=$RELEASE_COMMIT" 2>/dev/null || true)"
  if [ -n "$payload" ] && version_payload_matches "$payload"; then
    public_ready=1
    echo "Public cutover verified on attempt $attempt."
    break
  fi
  sleep 3
done

if [ "$public_ready" -ne 1 ]; then
  echo "Public verification failed; automatically switching traffic back to $active_slot." >&2
  restore_upstream
  rollback_ok=0
  if sudo -n "$NGINX" -t && sudo -n "$SYSTEMCTL" reload nginx; then
    rollback_ok=1
  fi
  if [ "$rollback_ok" -eq 1 ]; then
    sudo -n "$SYSTEMCTL" stop "$target_service" || true
  else
    # The live Nginx master may still be serving the target configuration.
    # Keep the target JVM alive and keep the on-disk upstream aligned with that live state.
    live_tmp="$(mktemp "$BACKEND_ROOT/nginx/.active.rollback-failed.XXXXXXXX")"
    printf 'server 127.0.0.1:%s max_fails=1 fail_timeout=3s;\n' "$target_port" > "$live_tmp"
    mv -f "$live_tmp" "$NGINX_ACTIVE_FILE"
    state_tmp="$(mktemp "$STATE_DIR/.active-slot.XXXXXXXX")"
    printf '%s\n' "$target_slot" > "$state_tmp"
    mv -f "$state_tmp" "$ACTIVE_SLOT_FILE"
    echo "CRITICAL: rollback reload failed; target slot was left running. Manual Nginx intervention is required." >&2
  fi
  exit 1
fi

state_tmp="$(mktemp "$STATE_DIR/.active-slot.XXXXXXXX")"
printf '%s\n' "$target_slot" > "$state_tmp"
mv -f "$state_tmp" "$ACTIVE_SLOT_FILE"

echo "Traffic is now on $target_slot. Draining old slot for ${DRAIN_SECONDS}s."
if [ "$DRAIN_SECONDS" -eq 0 ]; then
  stop_old_slot "$active_slot" >> "$DRAIN_LOG_FILE" 2>&1
else
  export -f stop_old_slot
  nohup setsid bash -c '
    set -euo pipefail
    DRAIN_SECONDS=$1 active_slot=$2 target_slot=$3 STATE_DIR=$4
    ACTIVE_SLOT_FILE=$5 SYSTEMCTL=$6 LEGACY_SERVICE=$7
    DRAIN_PID_FILE="$STATE_DIR/drain.pid"
    printf "%s %s %s\n" "$$" "$active_slot" "$target_slot" > "$DRAIN_PID_FILE"
    sleep "$DRAIN_SECONDS"
    (
      flock -x 9
      current_slot="$(tr -d "[:space:]" < "$ACTIVE_SLOT_FILE")"
      if [ "$current_slot" = "$target_slot" ]; then
        stop_old_slot "$active_slot"
      else
        echo "Drain abandoned: active slot changed from $target_slot to $current_slot"
      fi
      rm -f "$DRAIN_PID_FILE"
    ) 9>"$STATE_DIR/drain.lock"
  ' _ "$DRAIN_SECONDS" "$active_slot" "$target_slot" "$STATE_DIR" \
    "$ACTIVE_SLOT_FILE" "$SYSTEMCTL" "$LEGACY_SERVICE" \
    </dev/null >>"$DRAIN_LOG_FILE" 2>&1 &
  drain_launcher=$!
  # Wait only for PID registration; the drain itself must not hold the SSH channel open.
  while [ ! -s "$DRAIN_PID_FILE" ]; do
    if ! kill -0 "$drain_launcher" 2>/dev/null; then
      wait "$drain_launcher" || { echo "Drain task failed; see $DRAIN_LOG_FILE" >&2; exit 1; }
      break
    fi
    sleep 0.05
  done
fi

echo "Blue/green release complete: $RELEASE_VERSION -> $target_slot"
