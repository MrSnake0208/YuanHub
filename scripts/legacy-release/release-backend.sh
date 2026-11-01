#!/usr/bin/env bash
set -euo pipefail

# 独立后端发布：main → 同 SHA CI → 不可移动的 tag → 生产 Release。
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"
YES=0
DRY_RUN=0
TARGET_VERSION=""

die() { printf '✗ %s\n' "$*" >&2; exit 1; }
info() { printf '\n==> %s\n' "$*"; }
usage() {
  cat <<'EOF'
YuanHub 后端独立发布（请先自行提交业务代码）

用法：
  ./release-backend.sh [--yes] [--dry-run] <新版本号>

例：
  ./release-backend.sh --dry-run 0.1.13
  ./release-backend.sh 0.1.13

规则：
  - 后端版本来自 Git tag，明确指定新版本，可带 v 前缀；不支持 auto
  - 只接受干净的 main，仅允许 fast-forward 同步
  - main 的同 SHA push CI 成功后才创建并推送 tag，再等待 Release 完成
  - --yes 跳过交互确认；--dry-run 只读预览，不登录、同步、提交或推送
  - Release 失败后重跑原 tag 的 Release，不删除、移动或重打 tag
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --yes|-y) YES=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --help|-h) usage; exit 0 ;;
    -*) die "未知参数：$1" ;;
    *)
      [ -n "$1" ] || die "版本号不能为空"
      [ -z "$TARGET_VERSION" ] || die "只能指定一个版本号"
      TARGET_VERSION="${1#v}"
      ;;
  esac
  shift
done
[[ "$TARGET_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z]+(\.[0-9A-Za-z]+)*)?$ ]] ||
  die "请指定有效的新版本号，例如 0.1.13；后端不支持 auto"
TAG="v$TARGET_VERSION"

for tool in git gh; do
  command -v "$tool" >/dev/null 2>&1 || die "缺少命令：$tool"
done
[ "$(git rev-parse --show-toplevel)" = "$ROOT_DIR" ] || die "脚本必须位于独立后端 Git 仓库根目录"
check_repo() {
  [ "$(git branch --show-current)" = main ] || die "请先切换到 main 分支"
  [ -z "$(git status --porcelain)" ] || die "有未提交修改，请先自行提交或处理；不会自动提交业务代码"
}
check_tag() {
  if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
    die "$TAG 已存在，请换新版本；失败部署请重跑原 Release，不删除或移动 tag"
  fi
}
check_repo
check_tag
ORIGIN_URL="$(git remote get-url origin)"
GH_REPO="${ORIGIN_URL#https://github.com/}"
GH_REPO="${GH_REPO#git@github.com:}"
GH_REPO="${GH_REPO#ssh://git@github.com/}"
GH_REPO="${GH_REPO%.git}"
[[ "$GH_REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || die "origin 必须是 GitHub 仓库"

info "发布计划：$GH_REPO $TAG ($(git rev-parse --short HEAD))"
if [ "$DRY_RUN" -eq 1 ]; then
  info "只读预览；正式执行会重新同步并校验远端"
  exit 0
fi
gh auth status >/dev/null 2>&1 || die "GitHub CLI 尚未登录，请先执行 gh auth login"
if [ "$YES" -ne 1 ]; then
  printf '\n确认发布后端 %s？[y/N] ' "$TAG"
  read -r answer
  case "$answer" in y|Y|yes|YES) ;; *) echo "已取消。"; exit 0 ;; esac
fi

info "同步远端 main 与 tags"
git fetch --prune origin main --tags
read -r BEHIND AHEAD < <(git rev-list --left-right --count origin/main...HEAD)
[ "$BEHIND" -eq 0 ] || [ "$AHEAD" -eq 0 ] || die "main 与 origin/main 已分叉，请先手动处理"
[ "$BEHIND" -eq 0 ] || git merge --ff-only origin/main
[ "$AHEAD" -eq 0 ] || die "本地 main 尚未合并到远端；请通过 PR 合并并等待 main CI"
check_repo
check_tag
RELEASE_COMMIT="$(git rev-parse HEAD)"

wait_workflow() {
  local workflow="$1" ref="$2" run_id="" attempt
  for attempt in {1..30}; do
    run_id="$(gh run list --repo "$GH_REPO" --workflow "$workflow" \
      --branch "$ref" --commit "$RELEASE_COMMIT" --event push --limit 1 \
      --json databaseId --jq '.[0].databaseId // empty')" || return 1
    [ -z "$run_id" ] || break
    sleep 2
  done
  [ -n "$run_id" ] || { printf '没有找到 %s：%s\n' "${workflow}" "$RELEASE_COMMIT" >&2; return 1; }
  info "${workflow}：$run_id ($RELEASE_COMMIT)"
  gh run watch "$run_id" --repo "$GH_REPO" --exit-status
}

info "等待 main 同 SHA CI：$RELEASE_COMMIT"
wait_workflow ci.yml main || die "CI 未通过或查询失败，没有创建 ${TAG}；修复后可用相同未发布版本重试"

check_repo
[ "$(git rev-parse HEAD)" = "$RELEASE_COMMIT" ] || die "等待 CI 期间提交已变化，拒绝发布"
check_tag
info "创建并推送 $TAG"
git tag -a "$TAG" "$RELEASE_COMMIT" -m "Backend $TAG"
git push origin "$TAG" || die "tag 推送失败；先核对本地 $TAG 与远端状态，必要时推送原 tag，不删除或重打"
wait_workflow release.yml "$TAG" || die "Release 部署失败或查询失败；$TAG 已推送，请重跑原 Release，不删除或移动 tag"
info "后端发布完成：$TAG ($RELEASE_COMMIT)"
