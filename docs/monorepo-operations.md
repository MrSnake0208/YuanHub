# Monorepo 开发与独立部署

## 一个任务一个 Worktree

在 Orca 添加正式 clone 的 Git 根目录，基础分支选择 main。一个任务创建一个 Worktree，启动一个 Codex；根 AGENTS.md 要求自动核对 Git 根、当前分支、状态，再同时读取两端规则。frontend/backend 是普通目录，不创建第二套仓库或跨树符号链接。

同 URL 的旧前端项目可能已在 Orca 登记。切换时先检查现有项目与工作树映射，再选择新 clone 路径；不要直接覆盖登记或移动有会话的旧目录。Git/CLI 验证不代表 Windows Orca/SSH 或新 Codex UI 已验收。

纯 Git 示例：在主 clone 运行 `git worktree add -b feature/example ../yuanhub-example main`。新树自动具有 frontend/、backend/ 和 AGENTS.md。依赖和环境在新树分别准备，不复制其它任务的 .dev。

## 本地服务与数据

使用当前树的 `./dev.sh --print-env` 生成私有 .dev 配置（目录0700、实例文件0600），查看本树地址。前端 `cd frontend && npm ci` 使用 Node22；后端使用 JDK21 和 backend/gradlew。`./dev.sh frontend`、`./dev.sh backend` 或 `./dev.sh` 按需启动；不重启或停止别人的服务。

每树分配独立 loopback 端口、Compose 项目、Mongo replica set/Redis 数据、媒体、日志和构建输出。启动器清除继承的生产连接配置，仅连接本树本地 Docker 服务；自动化数据库测试仍只使用 TestMongo/TestRedis 的自有可抛弃容器。不要指向 MaaBackend、HubBackend 或共享开发库。端口被占用时 fail-fast，不能杀掉占用者。

Docker 使用本机 Unix socket；Mongo 大型测试需要容器 nofile 至少65536。未运行 Docker 时可以构建和执行不需容器的检查，不能声称后端已启动。生产 env 不进入源码树；前端私有 env 由用户自行准备。共享 Cloudflare Tunnel 不支持多树自动复用，本启动器拒绝 tunnel 子命令。

## 独立 CI 与发布

根 .github/workflows 的 frontend-ci/backend-ci 分别构建两端，路径过滤覆盖所属源码、根脚本及共享配置；前端 CI 同时检查后端 API 契约。完整行为回归保留独立 schedule/manual 入口。子目录旧 workflows 作为源历史保留，GitHub 只执行根 workflows。

前端独立构建 `cd frontend && npm run build`，产品版本来自 frontend/VERSION，产物记录组件版本、Monorepo SHA 和资源信息。后端独立构建 `cd backend && ./gradlew assemble --console=plain`，JAR 记录后端版本与当前树 Git SHA。两端不统一包管理或发布节奏。

根 `./release.sh --dry-run --frontend auto` 或 `./release.sh --dry-run --backend VERSION` 仅预览。正式命令需要另行授权，要求 main 干净、远端同 SHA、对应组件 CI 成功。标签使用 frontend/vX.Y.Z、backend/vX.Y.Z；不会推旧 v* 标签，不自动提交版本文件或合并。两端同 SHA 也各自记录实际已部署版本。

生产及 promo jobs 默认禁用，需要显式仓库变量 YUANHUB_MONOREPO_DEPLOY_ENABLED=true，分别使用 frontend-production/backend-production 环境。既有 Secrets 不代表配置已适配；环境审批、Webhook、服务器只读拉取权限与构建路径必须单独审查。当前候选不操作线上。

服务器脚本从 `.monorepo-source` 缓存取对应子目录构建，保留旧 `.source` 与已有 releases/slots。接口需要兼容不同时刻部署的两端；有兼容性变化时先发布兼容后端，验 readiness、/version 和业务链路后才发布前端。数据库变更必须另做兼容方案。

## 独立回滚

前端选择已有完整 releases/VERSION，核对 deploy-meta.json、index.html、sw.js 后，经授权在实际 FRONTEND_ROOT 以临时 symlink + 原子替换切回 current；遵循原 Nginx 配置兼容要求。不需要后端发布或 Git 回退。

后端使用以前成功的 backend/v* Release 精确旧 SHA/metadata，启动非活动 slot，通过 readiness、公共 /version 和 HubBackend 链路后再切流；失败恢复旧 slot。旧多仓版本继续从保留的后端 Release 和原发布路径恢复，不重打旧标签、不回滚数据库。

本轮离线 fixture 验证不能替代生产演练。迁移历史、PR37 处理及正式 clone 顺序见 [迁移说明](migration/README.md) 与 [切换清单](migration/cutover.md)。
