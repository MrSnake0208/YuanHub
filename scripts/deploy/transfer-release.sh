#!/usr/bin/env bash
# Runs on the GitHub runner. Servers only receive and install the finished bundle.
set -euo pipefail

: "${DEPLOY_HOST:?}" "${DEPLOY_USER:?}" "${DEPLOY_PORT:?}" "${DEPLOY_KEY:?}"
: "${RELEASE_ROOT:?}" "${RELEASE_COMMIT:?}" "${BUNDLE_DIR:?}"
[[ "$DEPLOY_PORT" =~ ^[0-9]+$ ]] || exit 1
[[ "$RELEASE_COMMIT" =~ ^[0-9a-f]{40}$ ]] || exit 1
[[ "$RELEASE_ROOT" =~ ^/[A-Za-z0-9_./-]+$ && "$RELEASE_ROOT" != / ]] || exit 1

work="$(mktemp -d)"
chmod 700 "$work"
printf '%s\n' "$DEPLOY_KEY" > "$work/key"
chmod 600 "$work/key"
ssh-keygen -y -f "$work/key" >/dev/null
ssh-keyscan -T 10 -p "$DEPLOY_PORT" "$DEPLOY_HOST" > "$work/known_hosts" 2>/dev/null
test -s "$work/known_hosts"
ssh_opts=(-i "$work/key" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=10
  -o ServerAliveInterval=10 -o ServerAliveCountMax=3 -o StrictHostKeyChecking=yes
  -o "UserKnownHostsFile=$work/known_hosts")
target="$DEPLOY_USER@$DEPLOY_HOST"
incoming="$RELEASE_ROOT/.incoming/${GITHUB_RUN_ID:?}-${GITHUB_RUN_ATTEMPT:?}"
printf -v command 'umask 077; mkdir -p %q; mkdir %q' "$RELEASE_ROOT/.incoming" "$incoming"
ssh "${ssh_opts[@]}" -p "$DEPLOY_PORT" "$target" "$command"

tar -czf "$work/bundle.tar.gz" -C "$BUNDLE_DIR" .
digest="$(sha256sum "$work/bundle.tar.gz" | awk '{print $1}')"
bytes="$(wc -c < "$work/bundle.tar.gz")"
started="$(date +%s)"
# Bound upload bandwidth to 4 MiB/s while the production server serves requests.
scp "${ssh_opts[@]}" -P "$DEPLOY_PORT" -l 32768 "$work/bundle.tar.gz" "$target:$incoming/bundle.tar.gz"
elapsed=$(( $(date +%s) - started ))
printf 'CI transfer: bytes=%s seconds=%s limit=4MiB/s\n' "$bytes" "$elapsed"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  printf '### %s transfer\n\n- Archive: %s bytes\n- Upload: %s seconds (4 MiB/s limit)\n- Commit: `%s`\n' \
    "${COMPONENT:?}" "$bytes" "$elapsed" "$RELEASE_COMMIT" >> "$GITHUB_STEP_SUMMARY"
fi

printf -v command 'env INCOMING=%q ARCHIVE_SHA256=%q ' "$incoming" "$digest"
for name in BACKEND_ROOT RELEASE_VERSION RELEASE_COMMIT PRODUCT_VERSION BACKEND_URL \
  DEPLOY_PHASE KEEP_RELEASES DRAIN_SECONDS LEGACY_SERVICE; do
  printf -v assignment '%s=%q ' "$name" "${!name:-}"
  command+="$assignment"
done
command+='bash -s'
ssh "${ssh_opts[@]}" -p "$DEPLOY_PORT" "$target" "$command" <<'REMOTE'
set -euo pipefail
cd "$INCOMING"
printf '%s  bundle.tar.gz\n' "$ARCHIVE_SHA256" | sha256sum -c -
mkdir content
tar -xzf bundle.tar.gz -C content
export PREBUILT_JAR="$INCOMING/content/payload/app.jar"
bash "$INCOMING/content/deploy.sh"
REMOTE
