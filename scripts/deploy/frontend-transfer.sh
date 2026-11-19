#!/usr/bin/env bash
set -euo pipefail

mode=${1:?expected probe, prepare or release}
port=${DEPLOY_PORT:-22}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
umask 077
printf '%s\n' "${DEPLOY_KEY:?}" > "$work/key"
unset DEPLOY_KEY
ssh-keygen -y -f "$work/key" >/dev/null
ssh-keyscan -T 10 -p "$port" "${DEPLOY_HOST:?}" > "$work/known_hosts" 2>/dev/null
test -s "$work/known_hosts"
opts=(-T -p "$port" -i "$work/key" -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=15
      -o ServerAliveInterval=10 -o ServerAliveCountMax=3 -o StrictHostKeyChecking=yes
      -o "UserKnownHostsFile=$work/known_hosts")
input=/dev/null
args=("$mode" "${FRONTEND_ROOT:?}" "${YUANHUB_VERSION:?}" "${REQUESTED_COMMIT:?}" "${API_BASE:?}")
if [[ "$mode" == prepare ]]; then
  input="$RUNNER_TEMP/frontend-dist.tar.gz"
  args+=("$(sha256sum "$input" | cut -d' ' -f1)")
fi
# ssh sends one shell command. Quote the receiver source and each argument for the remote shell.
command=$(python3 -c 'import pathlib, shlex, sys
print(shlex.join(["python3", "-c", pathlib.Path(sys.argv[1]).read_text(), *sys.argv[2:]]))' \
  "$(dirname "$0")/frontend-receiver.py" "${args[@]}")
start=$SECONDS
timeout -k 5s 300s ssh "${opts[@]}" "${DEPLOY_USER:?}@$DEPLOY_HOST" "$command" < "$input"
if [[ "$mode" == prepare ]]; then
  echo "Frontend upload and install: $(wc -c < "$input") bytes in $((SECONDS - start)) seconds" | tee -a "$GITHUB_STEP_SUMMARY"
fi
