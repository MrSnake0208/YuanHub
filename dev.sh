#!/usr/bin/env bash
#
# 一键启动开发环境：同时运行后端 (backend) + 前端 (frontend)
#
# 用法:
#   ./dev.sh          # 同时启动后端 + 前端（本机 Mongo/Redis 与 API）
#   ./dev.sh beta     # 同时启动后端 + 前端（隔离的本地内测模式）
#   tunnel 模式需单独授权配置每树 ingress；当前默认拒绝复用旧 Tunnel
#   ./dev.sh backend  # 只启动后端
#   ./dev.sh frontend # 只启动前端
#
# 说明:
#   - 后端是 Gradle/Spring Boot 项目，用 ./gradlew bootRun 启动（注意：不是 npm run）
#   - 后端源码变化后会等待 2 秒，编译成功才自动重启；编译失败时保留当前后端
#   - 前端是 Vue3 + Vite 项目，用 npm run dev 启动
#   - 后端固定 local profile 与本树私有 Mongo/Redis；忽略继承的生产连接配置
#
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

# Ignore inherited live-service credentials; all local endpoints belong to this tree.
for name in $(compgen -e); do
    case "$name" in SPRING_*|SHARE_*|DEBUG_*|YUANHUB_BETA_*|JAVA_TOOL_OPTIONS|JDK_JAVA_OPTIONS) unset "$name" ;; esac
done
worktree_exports="$(cd "$ROOT_DIR" && python3 scripts/worktree_env.py)"
eval "$worktree_exports"
if [[ "${1:-}" == "--print-env" ]]; then
    printf 'Worktree: %s\nFrontend: http://127.0.0.1:%s\nBackend: %s\nCompose: %s\n' "$ROOT_DIR" "$YUANHUB_FRONTEND_PORT" "$YUANHUB_DEV_API_TARGET" "$COMPOSE_PROJECT_NAME"
    exit 0
fi

SERVICE_MODE="all"
BETA_LOCAL_TEST=0
TUNNEL_ENABLED=0
TUNNEL_NAME="${YUANHUB_TUNNEL_NAME:-yuanhub-preview}"
TUNNEL_HOST="${YUANHUB_TUNNEL_HOST:-hubf.maayuan.fun}"
TUNNEL_CONFIG="${YUANHUB_CLOUDFLARED_CONFIG:-$HOME/.cloudflared/config.yml}"
TUNNEL_API_TARGET="${YUANHUB_TUNNEL_API_TARGET:-http://127.0.0.1:8080}"


for arg in "$@"; do
    case "$arg" in
        all)
            SERVICE_MODE="all"
            ;;
        beta)
            BETA_LOCAL_TEST=1
            ;;
        tunnel|t)
            TUNNEL_ENABLED=1
            ;;
        backend|b)
            SERVICE_MODE="backend"
            ;;
        frontend|f)
            SERVICE_MODE="frontend"
            ;;
        *)
            echo "未知模式: $arg" >&2
            echo "可用参数: all, beta, tunnel, backend, frontend" >&2
            exit 1
            ;;
    esac
done

# ANSI 颜色
COLOR_BACKEND='\033[1;34m'   # 蓝
COLOR_FRONTEND='\033[1;32m'  # 绿
COLOR_RESET='\033[0m'

pids=()
BACKEND_DEBOUNCE_SECONDS=2

log() {
    local color="$1"
    local name="$2"
    local msg="$3"
    echo -e "${color}[$name]${COLOR_RESET} $msg"
}

backend_source_state() {
    # macOS stat: 用 mtime/ctime/大小/inode 生成轻量状态，避免持续读取源码内容。
    find "$BACKEND_DIR/src/main" -type f -exec stat -f '%m:%c:%z:%i:%N' {} + 2>/dev/null \
        | LC_ALL=C sort \
        | cksum
}

start_backend() {
    if [[ ! -f "$BACKEND_DIR/gradlew" ]]; then
        echo -e "${COLOR_BACKEND}错误: 未找到 $BACKEND_DIR/gradlew, 跳过后端${COLOR_RESET}" >&2
        return 1
    fi
    if [[ ! -d "$BACKEND_DIR/src/main" ]]; then
        echo -e "${COLOR_BACKEND}错误: 未找到 $BACKEND_DIR/src/main, 跳过后端${COLOR_RESET}" >&2
        return 1
    fi

    log "$COLOR_BACKEND" "后端" "启动中: ./gradlew bootRun (profile: ${SPRING_PROFILES_ACTIVE:-local}, 目录: $BACKEND_DIR)"
    if (( BETA_LOCAL_TEST == 1 )); then
        log "$COLOR_BACKEND" "后端" "本地内测模式：使用隔离活动 yuanhub-beta-local，不读写正式内测报名资格"
    fi
    log "$COLOR_BACKEND" "后端" "源码监听已启用：静默 ${BACKEND_DEBOUNCE_SECONDS}s 后编译，成功才重启"

    (
        cd "$BACKEND_DIR" || exit 1
        export SPRING_PROFILES_ACTIVE="${SPRING_PROFILES_ACTIVE:-local}"

        backend_pid=""

        launch_backend() {
            if (( BETA_LOCAL_TEST == 1 )); then
                YUANHUB_BETA_LOCAL_TEST=true \
                YUANHUB_BETA_CAMPAIGN_ID=yuanhub-beta-local \
                    ./gradlew bootRun &
            else
                ./gradlew bootRun &
            fi
            backend_pid=$!
        }

        stop_backend() {
            if [[ -n "$backend_pid" ]] && kill -0 "$backend_pid" 2>/dev/null; then
                kill -TERM "$backend_pid" 2>/dev/null || true
                wait "$backend_pid" 2>/dev/null || true
            fi
        }

        shutdown_backend_supervisor() {
            stop_backend
            exit 0
        }

        trap shutdown_backend_supervisor INT TERM

        launch_backend

        last_state="$(backend_source_state)"
        pending_restart=0
        last_change_at=$SECONDS

        while kill -0 "$backend_pid" 2>/dev/null; do
            sleep 0.5

            current_state="$(backend_source_state)"
            if [[ "$current_state" != "$last_state" ]]; then
                last_state="$current_state"
                pending_restart=1
                last_change_at=$SECONDS
            fi

            if (( pending_restart == 1 && SECONDS - last_change_at >= BACKEND_DEBOUNCE_SECONDS )); then
                pending_restart=0
                log "$COLOR_BACKEND" "后端" "检测到源码变化，正在编译..."

                if ./gradlew classes --console=plain; then
                    log "$COLOR_BACKEND" "后端" "编译成功，正在重启 Spring Boot..."
                    stop_backend
                    launch_backend
                    log "$COLOR_BACKEND" "后端" "重启完成 (pid: $backend_pid)"
                else
                    log "$COLOR_BACKEND" "后端" "编译失败，保留当前运行中的后端；下次源码变化后会再次尝试"
                fi
            fi
        done

        wait "$backend_pid" 2>/dev/null || true
    ) &
    pids+=($!)
}

start_frontend() {
    if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
        echo -e "${COLOR_FRONTEND}错误: 未找到 $FRONTEND_DIR/node_modules, 请先 npm install${COLOR_RESET}" >&2
        return 1
    fi
    log "$COLOR_FRONTEND" "前端" "启动中: npm run dev (目录: $FRONTEND_DIR)"
    (
        cd "$FRONTEND_DIR" || exit 1
        if (( TUNNEL_ENABLED == 1 )); then
            YUANHUB_TUNNEL_HOST="$TUNNEL_HOST" \
            YUANHUB_TUNNEL_API_TARGET="$TUNNEL_API_TARGET" \
                exec npm run dev:tunnel
        else
            exec npm run dev
        fi
    ) &
    pids+=($!)
}

require_tunnel() {
    if ! command -v cloudflared >/dev/null 2>&1; then
        echo "错误: 未安装 cloudflared。请先执行: brew install cloudflared" >&2
        exit 1
    fi
    if [[ ! -f "$TUNNEL_CONFIG" ]]; then
        echo "错误: 未找到 Cloudflare Tunnel 配置: $TUNNEL_CONFIG" >&2
        echo "请先按 docs/local-preview-cloudflare.md 完成一次性 Named Tunnel 配置。" >&2
        exit 1
    fi
}

start_tunnel() {
    log "$COLOR_FRONTEND" "Tunnel" "启动中: $TUNNEL_HOST -> http://127.0.0.1:5173 (tunnel: $TUNNEL_NAME)"
    (
        exec cloudflared tunnel --config "$TUNNEL_CONFIG" run "$TUNNEL_NAME"
    ) &
    pids+=($!)
}

cleanup() {
    local status=$?
    trap - EXIT INT TERM
    echo ""
    echo "正在关闭所有开发进程..."
    for pid in "${pids[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            # 杀掉整个进程组，确保子进程（gradle java / vite node）也退出
            kill -TERM -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
        fi
    done
    sleep 1
    for pid in "${pids[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            kill -KILL -"$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null
        fi
    done
    echo "已全部停止。"
    exit "$status"
}

if (( TUNNEL_ENABLED == 1 )); then
    echo "当前 Worktree 使用私有动态端口；请先按 docs/monorepo-operations.md 经授权配置独立 Tunnel，不复用主目录 Tunnel。" >&2
    exit 1
fi

# Vite/Boot must not silently use another task's port or kill its process.
python3 - "$SERVICE_MODE" <<'CHECK_PORTS'
import os, socket, sys
keys = ['YUANHUB_FRONTEND_PORT'] if sys.argv[1] == 'frontend' else ['SERVER_PORT'] if sys.argv[1] == 'backend' else ['SERVER_PORT','YUANHUB_FRONTEND_PORT']
for key in keys:
    with socket.socket() as sock:
        try:
            sock.bind(('127.0.0.1', int(os.environ[key])))
        except OSError:
            raise SystemExit(f"{key}={os.environ[key]} 已被占用；请复用本树服务或检查冲突，不终止其它任务")
CHECK_PORTS
if [[ "$SERVICE_MODE" != "frontend" ]]; then
    bash "$BACKEND_DIR/scripts/dev-up.sh"
fi

trap cleanup INT TERM EXIT

case "$SERVICE_MODE" in
    all)
        start_backend
        start_frontend
        ;;
    backend)
        start_backend
        ;;
    frontend)
        start_frontend
        ;;
esac

if (( TUNNEL_ENABLED == 1 )); then
    start_tunnel
fi

echo ""
echo "开发环境已启动，Ctrl+C 停止全部进程。"
echo "后端 pid(s): ${pids[*]}"

# 前台等待：任一子进程退出则整体结束
wait "${pids[@]}"
