#!/usr/bin/env bash
set -euo pipefail

legacy_git_root="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel 2>/dev/null || true)"
if [ -n "$legacy_git_root" ] && [ -d "$legacy_git_root/frontend" ] && [ -d "$legacy_git_root/backend" ]; then
  echo 'Historical polyrepo release is disabled in this Monorepo; use root ./release.sh --prepare' >&2
  exit 1
fi

# 已合并 main 的 CI 与服务器预构建并行；后端部署成功后才发前端。
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND="$ROOT_DIR/YuanHub"
BACKEND="$ROOT_DIR/BackEndV3-Share"
FRONTEND_VERSION=""
BACKEND_VERSION=""
YES=0
DRY_RUN=0

die() { printf '✗ %s\n' "$*" >&2; exit 1; }
info() { printf '\n==> %s\n' "$*"; }
usage() {
  cat <<'EOF'
YuanHub 统一发布（请先自行提交业务代码）

用法：
  ./release.sh [--yes] [--dry-run] --frontend <版本号|auto> --backend <版本号>
  ./release.sh [--yes] [--dry-run] --frontend <版本号|auto>
  ./release.sh [--yes] [--dry-run] --backend <版本号>

例：
  ./release.sh --dry-run --frontend auto --backend 0.1.13
  ./release.sh --frontend 0.0.1-beta.20 --backend 0.1.13

规则：
  - 仅发布显式选中的仓库；版本号可以带 v 前缀
  - 前端 auto 使用 main 已准备的 VERSION；后端明确指定版本
  - 并行等待 main 同 SHA push CI 和服务器预构建；任一失败，不创建发布 tag
  - 两仓都选中时先后端 Release 成功，再发布前端
  - --dry-run 仅预览本地状态，不 fetch/merge、更新版本、commit、push 或打 tag
  - Release 失败后重跑远端该 tag 的 Release，不删除或移动已有 tag
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --frontend|--backend)
      [ "$#" -ge 2 ] && [ -n "$2" ] && [[ "$2" != -* ]] || die "$1 缺少版本号"
      if [ "$1" = "--frontend" ]; then
        [ -z "$FRONTEND_VERSION" ] || die "--frontend 不能重复"
        FRONTEND_VERSION="${2#v}"
      else
        [ -z "$BACKEND_VERSION" ] || die "--backend 不能重复"
        BACKEND_VERSION="${2#v}"
      fi
      shift
      ;;
    --yes|-y) YES=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --help|-h) usage; exit 0 ;;
    *) die "未知参数：$1" ;;
  esac
  shift
done
[ -n "$FRONTEND_VERSION$BACKEND_VERSION" ] || die "至少指定 --frontend 或 --backend；用 --help 查看用法"

for tool in git gh; do
  command -v "$tool" >/dev/null 2>&1 || die "缺少命令：$tool"
done

check_repo() {
  local directory="$1"
  [ "$(git -C "$directory" rev-parse --show-toplevel)" = "$directory" ] || die "$directory 必须是独立 Git 仓库"
  [ "$(git -C "$directory" branch --show-current)" = "main" ] || die "$directory 请先切换到 main"
  [ -z "$(git -C "$directory" status --porcelain)" ] || die "$directory 有未提交修改，请先处理"
}

github_repo() {
  local origin
  origin="$(git -C "$1" remote get-url origin)"
  origin="${origin#https://github.com/}"
  origin="${origin#git@github.com:}"
  origin="${origin#ssh://git@github.com/}"
  origin="${origin%.git}"
  [[ "$origin" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || die "$1 的 origin 必须是 GitHub 仓库"
  printf '%s\n' "$origin"
}

check_backend_tag() {
  if git -C "$BACKEND" rev-parse -q --verify "refs/tags/v$BACKEND_VERSION" >/dev/null; then
    die "v$BACKEND_VERSION 已存在，请换新版本；失败部署请重跑原 Release"
  fi
}

# 所有选中仓库先检查，避免因另一个仓库明显不可发布而准备一半。
if [ -n "$FRONTEND_VERSION" ]; then
  check_repo "$FRONTEND"
  FRONTEND_REPO="$(github_repo "$FRONTEND")"
  bash "$FRONTEND/release-frontend.sh" --dry-run "$FRONTEND_VERSION"
fi
if [ -n "$BACKEND_VERSION" ]; then
  [[ "$BACKEND_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z]+(\.[0-9A-Za-z]+)*)?$ ]] || die "后端版本号格式无效：$BACKEND_VERSION"
  check_repo "$BACKEND"
  BACKEND_REPO="$(github_repo "$BACKEND")"
  check_backend_tag
  info "后端计划：v$BACKEND_VERSION ($(git -C "$BACKEND" rev-parse --short HEAD))"
fi
info "CI 和服务器预构建均通过后，按后端 → 前端顺序发布选中的仓库"
[ "$DRY_RUN" -ne 1 ] || exit 0

gh auth status >/dev/null 2>&1 || die "GitHub CLI 尚未登录，请先执行 gh auth login"
if [ "$YES" -ne 1 ]; then
  printf '\n确认准备并发布选中的仓库？[y/N] '
  read -r answer
  case "$answer" in y|Y|yes|YES) ;; *) echo "已取消。"; exit 0 ;; esac
fi

if [ -n "$BACKEND_VERSION" ]; then
  git -C "$BACKEND" fetch --prune origin main --tags
  read -r behind ahead < <(git -C "$BACKEND" rev-list --left-right --count origin/main...HEAD)
  [ "$behind" -eq 0 ] || [ "$ahead" -eq 0 ] || die "后端 main 已分叉，请先处理"
  [ "$behind" -eq 0 ] || git -C "$BACKEND" merge --ff-only origin/main
  [ "$ahead" -eq 0 ] || die "后端 main 尚未合并到远端；请通过 PR 合并并等待 main CI"
  check_backend_tag
  BACKEND_COMMIT="$(git -C "$BACKEND" rev-parse HEAD)"
fi
if [ -n "$FRONTEND_VERSION" ]; then
  git -C "$FRONTEND" fetch --prune origin main --tags
  read -r behind ahead < <(git -C "$FRONTEND" rev-list --left-right --count origin/main...HEAD)
  [ "$behind" -eq 0 ] || [ "$ahead" -eq 0 ] || die "前端 main 已分叉，请先处理"
  [ "$behind" -eq 0 ] || git -C "$FRONTEND" merge --ff-only origin/main
  [ "$ahead" -eq 0 ] || die "前端 main 尚未合并到远端；请通过 PR 合并并等待 main CI"
  bash "$FRONTEND/release-frontend.sh" --dry-run "$FRONTEND_VERSION"
  FRONTEND_COMMIT="$(git -C "$FRONTEND" rev-parse HEAD)"
  FRONTEND_VERSION="$(tr -d '[:space:]' < "$FRONTEND/VERSION")"
fi

wait_workflow() {
  local repo="$1" workflow="$2" ref="$3" commit="$4" run_id="" attempt
  for attempt in {1..30}; do
    run_id="$(gh run list --repo "$repo" --workflow "$workflow" \
      --branch "$ref" --commit "$commit" --event push --limit 1 \
      --json databaseId --jq '.[0].databaseId // empty')" || return 1
    [ -z "$run_id" ] || break
    sleep 2
  done
  [ -n "$run_id" ] || { printf '没有找到 %s %s：%s\n' "$repo" "$workflow" "$commit" >&2; return 1; }
  info "$repo ${workflow}：$run_id ($commit)"
  gh run watch "$run_id" --repo "$repo" --exit-status
}

PREPARE_REQUEST="$(date -u +%Y%m%dT%H%M%SZ)-$$-$RANDOM"
prepare_server() {
  local repo="$1" tag="$2" commit="$3" run_id="" attempt
  local title="Prepare $2 @ $3 [$PREPARE_REQUEST]"
  gh workflow run release.yml --repo "$repo" --ref main \
    -f phase=prepare -f tag="$tag" -f commit="$commit" -f request="$PREPARE_REQUEST" || return 1
  for attempt in {1..30}; do
    # dispatch 的 headSha 可能随 main 前进；按本次请求、目标版本和冻结 SHA 定位。
    run_id="$(gh run list --repo "$repo" --workflow release.yml \
      --branch main --event workflow_dispatch --limit 30 --json databaseId,displayTitle \
      --jq "map(select(.displayTitle == \"$title\")) | .[0].databaseId // empty")" || return 1
    [ -z "$run_id" ] || break
    sleep 2
  done
  [ -n "$run_id" ] || { printf '没有找到预构建：%s %s\n' "$repo" "$title" >&2; return 1; }
  info "$repo prepare：$run_id ($commit)"
  gh run watch "$run_id" --repo "$repo" --exit-status
}

info "并行等待同 SHA main push CI 与服务器预构建"
GATE_PIDS=()
if [ -n "$FRONTEND_VERSION" ]; then
  wait_workflow "$FRONTEND_REPO" ci.yml main "$FRONTEND_COMMIT" &
  GATE_PIDS+=("$!")
  prepare_server "$FRONTEND_REPO" "v$FRONTEND_VERSION" "$FRONTEND_COMMIT" &
  GATE_PIDS+=("$!")
fi
if [ -n "$BACKEND_VERSION" ]; then
  wait_workflow "$BACKEND_REPO" ci.yml main "$BACKEND_COMMIT" &
  GATE_PIDS+=("$!")
  prepare_server "$BACKEND_REPO" "v$BACKEND_VERSION" "$BACKEND_COMMIT" &
  GATE_PIDS+=("$!")
fi
GATES_OK=1
for pid in "${GATE_PIDS[@]}"; do
  wait "$pid" || GATES_OK=0
done
[ "$GATES_OK" -eq 1 ] || die "CI 或服务器预构建未通过/查询失败，没有创建发布 tag；修复后重试"

# 打第一个 tag 前再次检查所有仓库，冻结的 SHA 不随等待期间的新提交漂移。
if [ -n "$FRONTEND_VERSION" ]; then
  check_repo "$FRONTEND"
  [ "$(git -C "$FRONTEND" rev-parse HEAD)" = "$FRONTEND_COMMIT" ] || die "前端提交已变化，拒绝发布"
fi
if [ -n "$BACKEND_VERSION" ]; then
  check_repo "$BACKEND"
  [ "$(git -C "$BACKEND" rev-parse HEAD)" = "$BACKEND_COMMIT" ] || die "后端提交已变化，拒绝发布"
  info "发布后端 v$BACKEND_VERSION ($BACKEND_COMMIT)"
  git -C "$BACKEND" tag -a "v$BACKEND_VERSION" "$BACKEND_COMMIT" -m "Backend v$BACKEND_VERSION"
  git -C "$BACKEND" push origin "v$BACKEND_VERSION"
  wait_workflow "$BACKEND_REPO" release.yml "v$BACKEND_VERSION" "$BACKEND_COMMIT" ||
    die "后端 Release 失败，前端尚未发布；不要移动 tag，请重跑后端 Release"
fi
if [ -n "$FRONTEND_VERSION" ]; then
  bash "$FRONTEND/release-frontend.sh" --yes --expected-commit "$FRONTEND_COMMIT" "$FRONTEND_VERSION"
fi
info "选中的仓库发布完成"
