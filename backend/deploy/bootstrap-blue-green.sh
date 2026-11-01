#!/usr/bin/env bash
set -euo pipefail

if [ "${EUID}" -ne 0 ]; then
  echo "Please run as root, e.g. sudo bash deploy/bootstrap-blue-green.sh /etc/nginx/sites-available/yuanhub-api-origin" >&2
  exit 1
fi

NGINX_SITE_FILE="${1:-}"
if [ -z "$NGINX_SITE_FILE" ] || [ ! -f "$NGINX_SITE_FILE" ]; then
  echo "Usage: sudo bash deploy/bootstrap-blue-green.sh <nginx-site-file>" >&2
  exit 1
fi

BACKEND_ROOT="${BACKEND_ROOT:-/var/lib/yuanhub-backend}"
DEPLOY_USER="${DEPLOY_USER:-${SUDO_USER:-}}"
RUN_USER="${RUN_USER:-$DEPLOY_USER}"
LEGACY_SERVICE="${LEGACY_SERVICE:-yuanhub-backend}"

if [ -z "$DEPLOY_USER" ] || ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  echo "DEPLOY_USER must name the SSH/deployment user." >&2
  exit 1
fi
if [ -z "$RUN_USER" ] || ! id "$RUN_USER" >/dev/null 2>&1; then
  echo "RUN_USER must name the backend runtime user." >&2
  exit 1
fi

SYSTEMCTL="$(command -v systemctl)"
NGINX="$(command -v nginx)"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

mkdir -p "$BACKEND_ROOT"/{releases,shared,slots,state,nginx,logs,data}
chown "$DEPLOY_USER":"$DEPLOY_USER" "$BACKEND_ROOT"
chown -R "$DEPLOY_USER":"$DEPLOY_USER" "$BACKEND_ROOT/releases" "$BACKEND_ROOT/slots" "$BACKEND_ROOT/state" "$BACKEND_ROOT/nginx"
chown "$RUN_USER":"$RUN_USER" "$BACKEND_ROOT/logs" "$BACKEND_ROOT/data" 2>/dev/null || true

if [ ! -f "$BACKEND_ROOT/shared/backend.env" ]; then
  echo "Missing $BACKEND_ROOT/shared/backend.env. Create the production environment file before the first blue/green release." >&2
  exit 1
fi

unit_tmp="$(mktemp)"
trap 'rm -f "$unit_tmp"' EXIT
sed   -e "s#__BACKEND_PATH__#$BACKEND_ROOT#g"   -e "s#__RUN_USER__#$RUN_USER#g"   "$repo_root/deploy/yuanhub-backend@.service" > "$unit_tmp"
install -m 0644 "$unit_tmp" /etc/systemd/system/yuanhub-backend@.service
"$SYSTEMCTL" daemon-reload

active_conf="$BACKEND_ROOT/nginx/active.conf"
if [ ! -f "$active_conf" ]; then
  printf 'server 127.0.0.1:8080 max_fails=1 fail_timeout=3s;\n' > "$active_conf"
fi
chown "$DEPLOY_USER":"$DEPLOY_USER" "$active_conf"
chmod 0644 "$active_conf"

active_slot="$BACKEND_ROOT/state/active-slot"
if [ ! -s "$active_slot" ]; then
  printf 'legacy\n' > "$active_slot"
fi
chown "$DEPLOY_USER":"$DEPLOY_USER" "$active_slot"
chmod 0644 "$active_slot"

upstream_conf=/etc/nginx/conf.d/yuanhub-backend-upstream.conf
upstream_backup="$(mktemp)"
upstream_existed=0
if [ -f "$upstream_conf" ]; then
  cp -a "$upstream_conf" "$upstream_backup"
  upstream_existed=1
fi

site_changed=0
site_backup=""
if grep -qF 'proxy_pass http://yuanhub_backend;' "$NGINX_SITE_FILE"; then
  echo "Nginx site already uses yuanhub_backend upstream."
else
  count="$(grep -cF 'proxy_pass http://127.0.0.1:8080;' "$NGINX_SITE_FILE" || true)"
  if [ "$count" -ne 1 ]; then
    echo "Expected exactly one 'proxy_pass http://127.0.0.1:8080;' in $NGINX_SITE_FILE; found $count." >&2
    echo "Edit the site manually to use: proxy_pass http://yuanhub_backend;" >&2
    exit 1
  fi
  site_backup="$NGINX_SITE_FILE.before-yuanhub-blue-green-$(date +%Y%m%d%H%M%S)"
  cp -a "$NGINX_SITE_FILE" "$site_backup"
  sed -i 's#proxy_pass http://127\.0\.0\.1:8080;#proxy_pass http://yuanhub_backend;#' "$NGINX_SITE_FILE"
  site_changed=1
  echo "Backed up Nginx site to $site_backup"
fi

cat > "$upstream_conf" <<EOF
# Managed by YuanHub backend blue/green deployment.
upstream yuanhub_backend {
    include $active_conf;
    keepalive 32;
}
EOF
chmod 0644 "$upstream_conf"

restore_nginx_files() {
  if [ "$site_changed" -eq 1 ] && [ -n "$site_backup" ]; then
    cp -a "$site_backup" "$NGINX_SITE_FILE"
  fi
  if [ "$upstream_existed" -eq 1 ]; then
    cp -a "$upstream_backup" "$upstream_conf"
  else
    rm -f "$upstream_conf"
  fi
}

if ! "$NGINX" -t; then
  echo "Nginx validation failed; restoring the pre-bootstrap files." >&2
  restore_nginx_files
  "$NGINX" -t || true
  exit 1
fi

if ! "$SYSTEMCTL" reload nginx; then
  echo "Nginx reload failed; restoring the pre-bootstrap files." >&2
  restore_nginx_files
  if "$NGINX" -t; then
    "$SYSTEMCTL" reload nginx || true
  fi
  exit 1
fi
rm -f "$upstream_backup"

sudoers=/etc/sudoers.d/yuanhub-backend-blue-green
cat > "$sudoers" <<EOF
$DEPLOY_USER ALL=(root) NOPASSWD: $SYSTEMCTL start yuanhub-backend@blue.service
$DEPLOY_USER ALL=(root) NOPASSWD: $SYSTEMCTL start yuanhub-backend@green.service
$DEPLOY_USER ALL=(root) NOPASSWD: $SYSTEMCTL stop yuanhub-backend@blue.service
$DEPLOY_USER ALL=(root) NOPASSWD: $SYSTEMCTL stop yuanhub-backend@green.service
$DEPLOY_USER ALL=(root) NOPASSWD: $SYSTEMCTL restart yuanhub-backend@blue.service
$DEPLOY_USER ALL=(root) NOPASSWD: $SYSTEMCTL restart yuanhub-backend@green.service
$DEPLOY_USER ALL=(root) NOPASSWD: $SYSTEMCTL is-active --quiet yuanhub-backend@blue.service
$DEPLOY_USER ALL=(root) NOPASSWD: $SYSTEMCTL is-active --quiet yuanhub-backend@green.service
$DEPLOY_USER ALL=(root) NOPASSWD: $SYSTEMCTL stop $LEGACY_SERVICE
$DEPLOY_USER ALL=(root) NOPASSWD: $NGINX -t
$DEPLOY_USER ALL=(root) NOPASSWD: $SYSTEMCTL reload nginx
EOF
chmod 0440 "$sudoers"
visudo -cf "$sudoers" >/dev/null

echo
echo "Blue/green bootstrap complete."
echo "Current traffic still points to 127.0.0.1:8080 through yuanhub_backend."
echo "active-slot: $(cat "$active_slot")"
echo "Do not stop $LEGACY_SERVICE yet; the first automated release will deploy green:8081, switch traffic, then drain and stop legacy."
