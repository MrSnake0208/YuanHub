#!/usr/bin/env bash
set -euo pipefail

: "${BACKEND_ROOT:?BACKEND_ROOT is required}"
: "${RELEASE_VERSION:?RELEASE_VERSION is required}"
: "${RELEASE_COMMIT:?RELEASE_COMMIT is required}"
DEPLOY_PHASE="${DEPLOY_PHASE:-release}"
case "$DEPLOY_PHASE" in prepare|release) ;; *) echo "Invalid DEPLOY_PHASE" >&2; exit 1 ;; esac
if [ "$DEPLOY_PHASE" = release ]; then
  : "${PRODUCT_VERSION:?PRODUCT_VERSION is required}"
  : "${BACKEND_URL:?BACKEND_URL is required}"
fi
[[ "$RELEASE_COMMIT" =~ ^[0-9a-f]{40}$ ]] || { echo "RELEASE_COMMIT must be a full SHA" >&2; exit 1; }

KEEP_RELEASES="${KEEP_RELEASES:-5}"
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
case "$KEEP_RELEASES" in ''|*[!0-9]*) KEEP_RELEASES=5 ;; esac
case "$DRAIN_SECONDS" in ''|*[!0-9]*) DRAIN_SECONDS=45 ;; esac
case "$LEGACY_CAPTURE_DRAIN_SECONDS" in ''|*[!0-9]*) LEGACY_CAPTURE_DRAIN_SECONDS=2100 ;; esac

SOURCE_DIR="$BACKEND_ROOT/.source"
RELEASES_DIR="$BACKEND_ROOT/releases"
RELEASE_DIR="$RELEASES_DIR/$RELEASE_VERSION"
SLOTS_DIR="$BACKEND_ROOT/slots"
STATE_DIR="$BACKEND_ROOT/state"
ACTIVE_SLOT_FILE="$STATE_DIR/active-slot"
NGINX_ACTIVE_FILE="$BACKEND_ROOT/nginx/active.conf"

mkdir -p "$RELEASES_DIR"
[ -d "$SOURCE_DIR/.git" ] || { echo "Source cache is missing: $SOURCE_DIR" >&2; exit 1; }
for tool in git java javac python3; do
  command -v "$tool" >/dev/null 2>&1 || { echo "$tool is required on the deployment server" >&2; exit 1; }
done

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
    echo "Reusing server-built release $RELEASE_DIR"
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
  build_started="$(date +%s)"
  cd "$SOURCE_DIR"
  actual_commit="$(git rev-parse HEAD)"
  [ "$actual_commit" = "$RELEASE_COMMIT" ] || {
    echo "Source checkout mismatch: got $actual_commit, expected $RELEASE_COMMIT" >&2
    exit 1
  }

  java_major="$(java -version 2>&1 | sed -n 's/.*version "\([0-9][0-9]*\).*/\1/p' | head -n 1)"
  javac_major="$(javac -version 2>&1 | sed -n 's/^javac \([0-9][0-9]*\).*/\1/p' | head -n 1)"
  [ "$java_major" = "21" ] || {
    echo "Java 21 runtime is required on the deployment server; found $(java -version 2>&1 | head -n1)" >&2
    exit 1
  }
  [ "$javac_major" = "21" ] || {
    echo "Java 21 JDK compiler is required on the deployment server; found $(javac -version 2>&1 | head -n1)" >&2
    exit 1
  }

  chmod +x ./gradlew
  # The source/build cache is deliberately retained between releases. Remove the generated
  # Git metadata so this checkout always regenerates /version commit information for the tag.
  rm -f build/resources/main/git.properties
  ./gradlew --no-daemon --max-workers=2 bootJar -x test --build-cache --console=plain

  jar_path="$(find build/libs -maxdepth 1 -name '*.jar' ! -name '*-plain.jar' | head -n 1)"
  [ -n "$jar_path" ] && [ -f "$jar_path" ] || {
    echo "No Spring Boot jar was produced" >&2
    exit 1
  }

  stage_dir="$RELEASES_DIR/.$RELEASE_VERSION.tmp"
  rm -rf "$stage_dir"
  mkdir -p "$stage_dir"
  cp "$jar_path" "$stage_dir/app.jar"
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
  rm -rf "$RELEASE_DIR"
  mv "$stage_dir" "$RELEASE_DIR"
  echo "Backend build seconds: $(( $(date +%s) - build_started ))"
fi

if [ "$DEPLOY_PHASE" = prepare ]; then
  echo "Prepared $RELEASE_VERSION ($RELEASE_COMMIT); slots and upstream are unchanged."
  exit 0
fi

slot_env_tmp="$SLOTS_DIR/.$target_slot.env.tmp"
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
  local tmp="$BACKEND_ROOT/nginx/.active.rollback.tmp"
  printf '%s\n' "$old_upstream" > "$tmp"
  mv -f "$tmp" "$NGINX_ACTIVE_FILE"
}

new_upstream_tmp="$BACKEND_ROOT/nginx/.active.$target_slot.tmp"
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
    live_tmp="$BACKEND_ROOT/nginx/.active.rollback-failed.tmp"
    printf 'server 127.0.0.1:%s max_fails=1 fail_timeout=3s;\n' "$target_port" > "$live_tmp"
    mv -f "$live_tmp" "$NGINX_ACTIVE_FILE"
    state_tmp="$STATE_DIR/.active-slot.tmp"
    printf '%s\n' "$target_slot" > "$state_tmp"
    mv -f "$state_tmp" "$ACTIVE_SLOT_FILE"
    echo "CRITICAL: rollback reload failed; target slot was left running. Manual Nginx intervention is required." >&2
  fi
  exit 1
fi

state_tmp="$STATE_DIR/.active-slot.tmp"
printf '%s\n' "$target_slot" > "$state_tmp"
mv -f "$state_tmp" "$ACTIVE_SLOT_FILE"

echo "Traffic is now on $target_slot. Draining old slot for ${DRAIN_SECONDS}s."
sleep "$DRAIN_SECONDS"

case "$active_slot" in
  blue|green)
    old_service="yuanhub-backend@$active_slot.service"
    sudo -n "$SYSTEMCTL" stop "$old_service" || echo "Warning: could not stop $old_service" >&2
    ;;
  legacy)
    sudo -n "$SYSTEMCTL" stop "$LEGACY_SERVICE" || echo "Warning: could not stop legacy service $LEGACY_SERVICE" >&2
    ;;
esac

protect_release() {
  local slot="$1"
  local env_file="$SLOTS_DIR/$slot.env"
  [ -f "$env_file" ] || return 0
  sed -n 's#^YUANHUB_JAR=\(.*\)/app\.jar$#\1#p' "$env_file" | tail -n 1
}

blue_release="$(protect_release blue || true)"
green_release="$(protect_release green || true)"
if [ "$KEEP_RELEASES" -gt 0 ]; then
  kept=0
  while IFS= read -r release_path; do
    [ -n "$release_path" ] || continue
    kept=$((kept + 1))
    if [ "$kept" -le "$KEEP_RELEASES" ]; then
      continue
    fi
    if [ "$release_path" = "$blue_release" ] || [ "$release_path" = "$green_release" ] || [ "$release_path" = "$RELEASE_DIR" ]; then
      continue
    fi
    rm -rf -- "$release_path"
  done < <(find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -not -name '.*' -printf '%T@ %p\n' | sort -nr | cut -d' ' -f2-)
fi

echo "Blue/green release complete: $RELEASE_VERSION -> $target_slot"
