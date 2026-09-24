#!/usr/bin/env bash
set -euo pipefail

# YuanHub 前端安全发布脚本
#
# 用法：
#   ./release-frontend.sh
#   ./release-frontend.sh 0.0.1-beta.4
#   ./release-frontend.sh --yes 0.0.1-beta.4
#
# 流程：
#   1. 检查 main / 工作区 / GitHub CLI
#   2. 同步 origin/main 和 tags
#   3. 更新 VERSION（必要时提交）
#   4. push main
#   5. 等待 CI 成功
#   6. 创建并 push v* tag
#   7. 等待 Release 部署成功
#
# 不会自动 git add 业务改动；发布前请先自行提交代码。

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

info() {
  printf '\n==> %s\n' "$*"
}

ok() {
  printf '✓ %s\n' "$*"
}

die() {
  printf '✗ %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
YuanHub 前端发布

用法：
  ./release-frontend.sh [--yes] [版本号]

示例：
  ./release-frontend.sh
  ./release-frontend.sh 0.0.1-beta.4
  ./release-frontend.sh v0.0.1-beta.4
  ./release-frontend.sh --yes 0.0.1-beta.4

规则：
  - 不传版本号：
      * 当前 VERSION 尚未发布时，继续发布当前 VERSION
      * 当前 VERSION 已有 tag 且形如 x.y.z-beta.N 时，自动递增到 beta.N+1
  - 只有 CI 成功后才会创建并推送发布 tag
  - Release 失败时不会改写或复用已有 tag
EOF
}

YES=0
TARGET_VERSION=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    -y|--yes)
      YES=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      die "未知参数：$1"
      ;;
    *)
      [ -z "$TARGET_VERSION" ] || die "只能指定一个版本号"
      TARGET_VERSION="${1#v}"
      ;;
  esac
  shift
done

for command_name in git gh; do
  command -v "$command_name" >/dev/null 2>&1 || die "缺少命令：$command_name"
done

[ -f VERSION ] || die "当前目录不是 YuanHub 前端仓库：缺少 VERSION"

CURRENT_BRANCH="$(git branch --show-current)"
[ "$CURRENT_BRANCH" = "main" ] || die "请先切换到 main 分支；当前分支：$CURRENT_BRANCH"

if [ -n "$(git status --porcelain)" ]; then
  printf '\n当前还有未提交修改：\n' >&2
  git status --short >&2
  die "发布脚本不会自动提交业务代码，请先提交或处理这些修改"
fi

gh auth status >/dev/null 2>&1 || die "GitHub CLI 尚未登录，请先执行 gh auth login"

info "同步远端 main 与 tags"
git fetch --prune origin main --tags

read -r BEHIND AHEAD < <(git rev-list --left-right --count origin/main...HEAD)

if [ "$BEHIND" -gt 0 ] && [ "$AHEAD" -gt 0 ]; then
  die "本地 main 与 origin/main 已分叉，请先手动处理后再发布"
fi

if [ "$BEHIND" -gt 0 ]; then
  info "本地 main 落后远端，执行 fast-forward"
  git merge --ff-only origin/main
fi

CURRENT_VERSION="$(tr -d '[:space:]' < VERSION)"
[ -n "$CURRENT_VERSION" ] || die "VERSION 为空"

tag_exists() {
  git rev-parse -q --verify "refs/tags/$1" >/dev/null 2>&1
}

if [ -z "$TARGET_VERSION" ]; then
  if ! tag_exists "v$CURRENT_VERSION"; then
    TARGET_VERSION="$CURRENT_VERSION"
  elif [[ "$CURRENT_VERSION" =~ ^([0-9]+\.[0-9]+\.[0-9]+-beta\.)([0-9]+)$ ]]; then
    TARGET_VERSION="${BASH_REMATCH[1]}$((BASH_REMATCH[2] + 1))"
  else
    die "当前版本 v$CURRENT_VERSION 已发布，且无法安全推导下一版本；请显式指定版本号"
  fi
fi

if ! [[ "$TARGET_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z]+(\.[0-9A-Za-z]+)*)?$ ]]; then
  die "版本号格式无效：${TARGET_VERSION}（例如 0.0.1-beta.4）"
fi

TAG="v$TARGET_VERSION"

if tag_exists "$TAG"; then
  die "$TAG 已存在。已发布 tag 不应删除、移动或复用，请换一个新版本号"
fi

info "发布计划"
printf '当前 VERSION : %s\n' "$CURRENT_VERSION"
printf '目标 VERSION : %s\n' "$TARGET_VERSION"
printf '发布 tag      : %s\n' "$TAG"
printf '当前提交      : %s\n' "$(git rev-parse --short HEAD)"

if [ "$YES" -ne 1 ]; then
  printf '\n确认开始发布？[y/N] '
  read -r answer
  case "$answer" in
    y|Y|yes|YES)
      ;;
    *)
      echo "已取消。"
      exit 0
      ;;
  esac
fi

if [ "$CURRENT_VERSION" != "$TARGET_VERSION" ]; then
  info "更新 VERSION"
  printf '%s\n' "$TARGET_VERSION" > VERSION
  git add VERSION
  git commit -m "chore: bump version to $TARGET_VERSION"
else
  ok "VERSION 已是 ${TARGET_VERSION}，无需额外版本提交"
fi

RELEASE_COMMIT="$(git rev-parse HEAD)"

info "推送 main"
git push origin main
ok "main 已推送：$(git rev-parse --short HEAD)"

find_workflow_run() {
  local workflow="$1"
  local ref="$2"
  local commit="$3"
  local run_id=""
  local attempt=1

  while [ "$attempt" -le 30 ]; do
    run_id="$(
      gh run list         --workflow "$workflow"         --branch "$ref"         --commit "$commit"         --limit 1         --json databaseId         --jq '.[0].databaseId // empty' 2>/dev/null || true
    )"

    if [ -n "$run_id" ]; then
      printf '%s\n' "$run_id"
      return 0
    fi

    sleep 2
    attempt=$((attempt + 1))
  done

  return 1
}

info "等待 main CI"
CI_RUN_ID="$(find_workflow_run "CI" "main" "$RELEASE_COMMIT")" ||   die "没有找到提交 $RELEASE_COMMIT 对应的 CI，请到 GitHub Actions 查看"

printf 'CI run: %s\n' "$CI_RUN_ID"
if ! gh run watch "$CI_RUN_ID" --exit-status; then
  die "CI 未通过，因此没有创建 ${TAG}。修复并推送后，可用同一版本号重新执行本脚本"
fi
ok "CI 已通过"

info "创建并推送 $TAG"
git tag -a "$TAG" -m "YuanHub $TAG"
git push origin "$TAG"
ok "$TAG 已推送"

info "等待生产 Release"
RELEASE_RUN_ID="$(find_workflow_run "Release" "$TAG" "$RELEASE_COMMIT")" ||   die "tag 已推送，但暂未找到 Release workflow；请到 GitHub Actions 查看 $TAG"

printf 'Release run: %s\n' "$RELEASE_RUN_ID"
if ! gh run watch "$RELEASE_RUN_ID" --exit-status; then
  die "Release 部署失败。$TAG 已存在，请不要删除或重打 tag；修复部署问题后重跑该 Release"
fi
ok "Release 已通过"

SITE_URL="$(gh variable get YUANHUB_FRONTEND_URL 2>/dev/null || true)"
if [ -n "$SITE_URL" ] && command -v curl >/dev/null 2>&1; then
  info "核对线上 deploy-meta"
  DEPLOY_META="$(
    curl --fail --silent --show-error --location       -H 'Cache-Control: no-cache'       "${SITE_URL%/}/deploy-meta.json?release=$RELEASE_COMMIT" 2>/dev/null || true
  )"

  if printf '%s' "$DEPLOY_META" | grep -q "\"version\":\"$TARGET_VERSION\"" &&
     printf '%s' "$DEPLOY_META" | grep -q "\"commit\":\"$RELEASE_COMMIT\""; then
    ok "线上已切换到 $TARGET_VERSION ($(git rev-parse --short "$RELEASE_COMMIT"))"
  else
    printf '⚠ Release 已通过，但未能额外确认 deploy-meta；可手动访问：%s/deploy-meta.json\n' "${SITE_URL%/}"
  fi
fi

printf '\n发布完成：%s\n' "$TAG"
printf 'commit: %s\n' "$RELEASE_COMMIT"
[ -z "$SITE_URL" ] || printf 'site: %s\n' "$SITE_URL"
