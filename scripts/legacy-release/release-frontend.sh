#!/usr/bin/env bash
set -euo pipefail

# 候选分支准备 VERSION；main 发布已通过 CI 的提交。

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
  ./release-frontend.sh [--yes] [--dry-run] [--prepare-only] [版本号]

示例：
  ./release-frontend.sh
  ./release-frontend.sh 0.0.1-beta.4
  ./release-frontend.sh v0.0.1-beta.4
  ./release-frontend.sh --yes 0.0.1-beta.4

规则：
  - --prepare-only：在非 main 候选分支准备 VERSION；不提交、不推送
  - 准备时 auto 沿用未发布 VERSION，已发布 beta.N 自动递增
  - 正式发布只接受 main 中已准备的 VERSION；auto 沿用该版本
  - --dry-run：只读预览，不同步远端、不修改版本或 Git 引用
  - --expected-commit SHA：发布前核对冻结的完整提交
  - 同 SHA main push CI 成功后才创建 tag；失败部署重跑原 Release

EOF
}

YES=0
DRY_RUN=0
PREPARE_ONLY=0
EXPECTED_COMMIT=""
TARGET_VERSION=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    -y|--yes)
      YES=1
      ;;
    --dry-run)
      DRY_RUN=1
      ;;
    --prepare-only)
      PREPARE_ONLY=1
      ;;
    --expected-commit)
      [ "$#" -ge 2 ] || die "--expected-commit 缺少 SHA"
      EXPECTED_COMMIT="$2"
      [[ "$EXPECTED_COMMIT" =~ ^[0-9a-f]{40}$ ]] || die "expected-commit 必须是完整 SHA"
      shift
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
[ "$TARGET_VERSION" != auto ] || TARGET_VERSION=""

for command_name in git; do
  command -v "$command_name" >/dev/null 2>&1 || die "缺少命令：$command_name"
done

[ -f VERSION ] || die "当前目录不是 YuanHub 前端仓库：缺少 VERSION"

CURRENT_BRANCH="$(git branch --show-current)"
if [ "$PREPARE_ONLY" -eq 1 ]; then
  [ -n "$CURRENT_BRANCH" ] && [ "$CURRENT_BRANCH" != main ] || die "请在非 main 的候选分支准备 VERSION，再提交 PR"
  [ -z "$EXPECTED_COMMIT" ] || die "--prepare-only 不能与 --expected-commit 同用"
else
  [ "$CURRENT_BRANCH" = main ] || die "正式发布请先切换到 main 分支；当前分支：$CURRENT_BRANCH"
  command -v gh >/dev/null 2>&1 || die "缺少命令：gh"
fi

if [ -n "$(git status --porcelain)" ]; then
  printf '\n当前还有未提交修改：\n' >&2
  git status --short >&2
  die "发布脚本不会自动提交业务代码，请先提交或处理这些修改"
fi

ORIGIN_URL="$(git remote get-url origin)"
GH_REPO="${ORIGIN_URL#https://github.com/}"
GH_REPO="${GH_REPO#git@github.com:}"
GH_REPO="${GH_REPO#ssh://git@github.com/}"
GH_REPO="${GH_REPO%.git}"
[[ "$GH_REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || die "origin 必须是 GitHub 仓库"

if [ -n "$EXPECTED_COMMIT" ] && [ "$(git rev-parse HEAD)" != "$EXPECTED_COMMIT" ]; then
  die "提交已变化，拒绝发布；准备阶段 SHA：$EXPECTED_COMMIT"
fi

if [ "$DRY_RUN" -ne 1 ]; then
  if [ "$PREPARE_ONLY" -eq 1 ]; then
    git fetch origin --tags
  else
    gh auth status >/dev/null 2>&1 || die "GitHub CLI 尚未登录，请先执行 gh auth login"
    info "同步远端 main 与 tags"
    git fetch --prune origin main --tags
    read -r BEHIND AHEAD < <(git rev-list --left-right --count origin/main...HEAD)
    [ "$BEHIND" -eq 0 ] || [ "$AHEAD" -eq 0 ] || die "本地 main 与 origin/main 已分叉，请先手动处理"
    [ "$BEHIND" -eq 0 ] || git merge --ff-only origin/main
    [ "$AHEAD" -eq 0 ] || die "本地 main 尚未合并到远端；请通过 PR 合并并等待 main CI"
  fi
fi

if [ -n "$EXPECTED_COMMIT" ] && [ "$(git rev-parse HEAD)" != "$EXPECTED_COMMIT" ]; then
  die "提交已变化，拒绝发布；准备阶段 SHA：$EXPECTED_COMMIT"
fi

CURRENT_VERSION="$(tr -d '[:space:]' < VERSION)"
[ -n "$CURRENT_VERSION" ] || die "VERSION 为空"

tag_exists() {
  git rev-parse -q --verify "refs/tags/$1" >/dev/null 2>&1
}

if [ -z "$TARGET_VERSION" ]; then
  if ! tag_exists "v$CURRENT_VERSION"; then
    TARGET_VERSION="$CURRENT_VERSION"
  elif [ "$PREPARE_ONLY" -eq 1 ] && [[ "$CURRENT_VERSION" =~ ^([0-9]+\.[0-9]+\.[0-9]+-beta\.)([0-9]+)$ ]]; then
    TARGET_VERSION="${BASH_REMATCH[1]}$((BASH_REMATCH[2] + 1))"
  else
    die "当前 VERSION 已发布；请在候选分支使用 --prepare-only 准备新版本并提交 PR"
  fi
fi

if ! [[ "$TARGET_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z]+(\.[0-9A-Za-z]+)*)?$ ]]; then
  die "版本号格式无效：${TARGET_VERSION}（例如 0.0.1-beta.4）"
fi

TAG="v$TARGET_VERSION"

if tag_exists "$TAG"; then
  die "$TAG 已存在。已发布 tag 不应删除、移动或复用，请换一个新版本号"
fi

if [ "$PREPARE_ONLY" -ne 1 ] && [ "$CURRENT_VERSION" != "$TARGET_VERSION" ]; then
  die "VERSION 与目标版本不一致；请在候选分支使用 --prepare-only 准备版本并提交 PR"
fi

info "发布计划"
printf '当前 VERSION : %s\n' "$CURRENT_VERSION"
printf '目标 VERSION : %s\n' "$TARGET_VERSION"
printf '发布 tag      : %s\n' "$TAG"
printf '当前提交      : %s\n' "$(git rev-parse --short HEAD)"

if [ "$DRY_RUN" -eq 1 ]; then
  ok "仅预览本地计划；正式执行时会重新同步并校验远端"
  exit 0
fi

if [ "$YES" -ne 1 ]; then
  if [ "$PREPARE_ONLY" -eq 1 ]; then
    printf '\n确认准备候选版本？[y/N] '
  else
    printf '\n确认开始发布？[y/N] '
  fi
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

if [ "$PREPARE_ONLY" -eq 1 ]; then
  if [ "$CURRENT_VERSION" != "$TARGET_VERSION" ]; then
    printf '%s\n' "$TARGET_VERSION" > VERSION
  fi
  ok "候选版本已准备；请自行提交 VERSION 并创建 PR"
  exit 0
fi

RELEASE_COMMIT="$(git rev-parse HEAD)"

find_workflow_run() {
  local workflow="$1"
  local ref="$2"
  local commit="$3"
  local run_id=""
  local attempt=1

  while [ "$attempt" -le 30 ]; do
    run_id="$(
      gh run list --repo "$GH_REPO" --workflow "$workflow" --branch "$ref" \
        --commit "$commit" --event push --limit 1 --json databaseId \
        --jq '.[0].databaseId // empty'
    )" || return 1

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
CI_RUN_ID="$(find_workflow_run "ci.yml" "main" "$RELEASE_COMMIT")" || die "没有找到提交 $RELEASE_COMMIT 对应的 CI，请到 GitHub Actions 查看"

printf 'CI run: %s\n' "$CI_RUN_ID"
if ! gh run watch "$CI_RUN_ID" --repo "$GH_REPO" --exit-status; then
  die "CI 未通过，因此没有创建 ${TAG}。修复并推送后，可用同一版本号重新执行本脚本"
fi
ok "CI 已通过"

info "创建并推送 $TAG"
[ "$(git branch --show-current)" = "main" ] &&
  [ "$(git rev-parse HEAD)" = "$RELEASE_COMMIT" ] &&
  [ -z "$(git status --porcelain)" ] || die "等待 CI 期间工作区或提交已变化，拒绝打 tag"
git tag -a "$TAG" "$RELEASE_COMMIT" -m "YuanHub $TAG"
git push origin "$TAG" || die "tag 推送失败；先核对本地 $TAG 与远端状态，必要时推送原 tag，不删除或重打"
ok "$TAG 已推送"

info "等待生产 Release"
RELEASE_RUN_ID="$(find_workflow_run "release.yml" "$TAG" "$RELEASE_COMMIT")" || die "tag 已推送，但暂未找到 Release workflow；请到 GitHub Actions 查看 $TAG"

printf 'Release run: %s\n' "$RELEASE_RUN_ID"
if ! gh run watch "$RELEASE_RUN_ID" --repo "$GH_REPO" --exit-status; then
  die "Release 部署失败。$TAG 已存在，请不要删除或重打 tag；修复部署问题后重跑该 Release"
fi
ok "Release 已通过"

SITE_URL="$(gh variable get YUANHUB_FRONTEND_URL --repo "$GH_REPO" 2>/dev/null || true)"
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
