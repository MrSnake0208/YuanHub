# Monorepo 开发与独立部署

## 一个任务一个 Worktree

在 Orca 添加正式 clone 的 Git 根目录，基础分支选择 main。一个任务创建一个 Worktree，启动一个 Codex；根 AGENTS.md 要求自动核对 Git 根、当前分支、状态，再同时读取两端规则。frontend/backend 是普通目录，不创建第二套仓库或跨树符号链接。

同 URL 的旧前端项目可能已在 Orca 登记。切换时先检查现有项目与工作树映射，再选择新 clone 路径；不要直接覆盖登记或移动有会话的旧目录。Git/CLI 验证不代表 Windows Orca/SSH 或新 Codex UI 已验收。

纯 Git 示例：在主 clone 运行 `git worktree add -b feature/example ../yuanhub-example main`。新树自动具有 frontend/、backend/ 和 AGENTS.md。依赖和环境在新树分别准备，不复制其它任务的 .dev。

## 本地服务与数据

使用当前树的 `./dev.sh --print-env` 生成私有 .dev 配置（目录0700、实例文件0600），查看本树地址。前端使用 Node22，后端使用 JDK21 和 backend/gradlew。`./dev.sh frontend`、`./dev.sh backend` 或 `./dev.sh` 按需启动；不重启或停止别人的服务。

每树分配独立应用端口、媒体和构建输出；普通开发前端监听所有网卡，后端仅监听 127.0.0.1，API 由 Vite 代理转发。MongoDB 共用 127.0.0.1:27017 的 MaaBackend/HubBackend，Redis 共用 127.0.0.1:6379（默认 DB 0）。启动器清除继承的生产连接配置。共享开发数据意味着不同工作树的写入互相可见；不要用开发库运行破坏性测试。端口被占用时 fail-fast，不能杀掉占用者。

局域网访问：运行 `./dev.sh` 后，在同一网络的设备打开 `http://<电脑局域网 IP>:<前端端口>`；端口可通过 `./dev.sh --print-env` 查看，将输出中的 127.0.0.1 替换为电脑局域网 IP。若无法连接，检查系统防火墙及 Wi-Fi 客户端隔离。开发前端及其 API 代理会向可达该端口的设备开放，仅在可信网络使用；Tunnel 和 Agent 测试模式仍仅监听本机。

本机需要 JDK21、MongoDB 副本集、Redis、mongosh 和 redis-cli。默认启动器只检查现有数据库服务，不安装、启动或重配它们，不执行 Compose；`./dev.sh containers` 显式通过本树的 Compose 项目启动私有 MongoDB/Redis，并等待副本集和服务就绪。后端先执行 bootJar，再复制至本树 .dev/backend-running.jar 并 java -jar 启动；源码变化后重建，构建失败保留当前进程。build/libs 中必须只有一个非 plain JAR；若存在旧版本产物，先人工确认清理。

集成测试不依赖 Docker/Testcontainers。TestMongo 仅访问自己注册的随机 yuanhub_test_ 数据库；TestRedis 使用本机 Redis DB 15，并给所有键及清理模式加进程专属前缀。退出时尽力清理自有数据；强制终止 JVM 可能留下测试数据，不得因此清空共享 Redis 或批量删除其他会话测试库。普通单元测试仍使用不可连接的占位地址。详见 [测试说明](development/testing.md)。

生产 env 不进入源码树；前端私有 env 由用户自行准备。共享 Cloudflare Tunnel 不支持多树自动复用，本启动器拒绝 tunnel 子命令。

## Orca 自动预览（Mac 执行、Windows 访问）

根目录 `orca.yaml` 为新工作树添加「开发预览」终端，自动运行 `./dev.sh preview`；第一个终端留给 Agent。Orca 项目设置需允许运行共享 YAML 命令（本项目目前为 run-by-default，且无本地 setup 覆盖）。配置必须进入新工作树所基于的版本才会自动生效；不会同步已有工作树，也不自动提交、合并或修改主工作区。现有工作树可由 Agent 创建一次预览终端，无需 Windows 手动 SSH 转发。

预览会在缺少 node_modules 时安装本树前端依赖，通过 `dev.sh` 启动前后端。前端监听 `0.0.0.0`，后端和数据库仍只监听 loopback；Windows 可直接打开 `http://<本机 Tailscale IPv4>:<本树前端端口>/inventory`，API 由 Vite 同源代理至本树后端。启动器不执行 Tailscale 命令，也不修改 Serve/Funnel 配置。监听所有网卡也允许同一局域网访问该预览，使用共享开发数据时，预览中的保存和删除会影响这些数据。

启动过程分别报告「前端已就绪」和「前后端均已就绪」。首次后端启动需要下载依赖并编译；失败时保留前端，登录和保存不可用，查看同一终端错误。重复运行预览由本树文件锁阻止；已有非预览服务占用端口时提示复用，不接管或重启。关闭预览终端或 Ctrl+C 停止它创建的前后端服务，不停止共享 MongoDB/Redis，也不删除数据。每个运行中的工作树仍需要自己的 Vite 和 JVM 进程；用完后关闭对应预览终端释放资源。

预览的 Gradle 缓存保存在本树 `.gradle-user-home`；启动器使用 Kotlin in-process 编译，避免 Kotlin 2.2 daemon 参数文件破坏中文工作树路径。定向启动配置检查：`python3 scripts/testing/test_worktree_env.py`、`python3 scripts/testing/test_dev_preview.py`。这些检查使用临时 fixture，不对共享本机数据库进行语义测试。

## 独立 CI 与发布

根 .github/workflows/pr-ci.yml 对所有 PR 运行，以待测 merge commit 相对第一父提交的完整 Git diff 选择两端检查（包括删除和重命名两端，不受 API 文件列表截断影响）。frontend/** 运行前端，backend/** 运行后端，backend/src/** 同时运行前端契约检查；仅后端改动通过 contract-only 输入跳过前端 npm ci、静态/仓库测试和构建，前端/共享配置改动保留完整前端流程；普通根 docs/** 不运行两端构建，docs/development/testing.md、共享配置及未知根路径保守运行两端。选择器自身失败、必要检查失败/取消/意外跳过，都使统一 `PR merge gate` 失败；只有明确不涉及的模块允许跳过。

frontend-ci/backend-ci 通过 workflow_call 供 PR 入口复用；main/master push 的路径过滤、手动入口、工作流文件名及构建步骤保留，发布脚本仍查对应组件的 push CI。后端 CI 将 ktlintCheck、test、assemble 合为一次 Gradle 调用，任务覆盖不变。完整行为回归保留独立 schedule/manual 入口。子目录旧 workflows 作为源历史保留，GitHub 只执行根 workflows。

分支保护切换必须与工作流交付分开：先推送包含新门禁的 PR，确认 GitHub Actions 的 `PR merge gate` 在最新 SHA 成功，再把 main 必需检查从 `Frontend checks and build` 替换为 `PR merge gate`，绑定 GitHub Actions 来源，保留 strict/up-to-date、管理员约束、禁止强推/删除等既有规则，随后合并该 PR。不要保留旧检查名：复用工作流下的检查名称会变化，旧名称会一直等待。其余旧 PR 必须更新到包含新入口的 main 后重新检查。切换前暂停无人值守合并；未提交/推送的本地配置不代表线上门禁已生效。

CI 门禁回归：`python3 scripts/testing/test_monorepo_ci.py`，覆盖模块选择、失败/取消/跳过以及发布开关；不能代替 GitHub 上的实际工作流运行。CI/门禁文件变更属于 L4，自动化不得自行批准或合并这类 PR。本入口不创建发布标签、不触发部署，也不修改仓库部署开关。

前端独立构建 `cd frontend && npm run build`，产品版本来自 frontend/VERSION，产物记录组件版本、Monorepo SHA 和资源信息。后端独立构建 `cd backend && ./gradlew assemble --console=plain`，JAR 记录后端版本与当前树 Git SHA。两端不统一包管理或发布节奏。

根 `./release.sh --dry-run --frontend auto` 或 `./release.sh --dry-run --backend VERSION` 仅预览。正式命令需要另行授权，要求 main 干净、远端同 SHA、对应组件 CI 成功。标签使用 frontend/vX.Y.Z、backend/vX.Y.Z；不会推旧 v* 标签，不自动提交版本文件或合并。两端同 SHA 也各自记录实际已部署版本。

生产及 promo jobs 默认禁用，需要显式仓库变量 YUANHUB_MONOREPO_DEPLOY_ENABLED=true，分别使用 frontend-production/backend-production 环境。既有 Secrets 不代表配置已适配；环境审批、Webhook、服务器只读拉取权限与构建路径必须单独审查。当前候选不操作线上。

后端只接收指定提交的成功 Backend CI 产物：Runner 下载 JAR、打包并经 SSH 上传，服务器校验归档摘要后安装，不执行 Git/Gradle/Kotlin 编译；产物缺失或过期时停止，在 CI 重建，禁止回退到服务器构建。`prepare` 同样要求对应 CI 成功，只上传安装，不启动实例或切流。上传限制为 4 MiB/s，工作流日志与 Summary 记录归档字节数和上传秒数（不含下载、打包及安装）。蓝绿双实例仍需足够运行内存，移除编译不能替代容量检查。

前端服务器带宽有限，使用现有 `.monorepo-source` 作为 Git 对象参考，在独立源码副本中构建，不传输 CI dist。前端目录为 `releases/VERSION-COMMIT`；保留旧源码、构建目录、发布包、传输包和槽位配置的历史副本，不自动清理。同名发布目录不完整或内容不符时停止并保留原目录。接口需要兼容不同时刻部署的两端；有兼容性变化时先发布兼容后端，验 readiness、/version 和业务链路后才发布前端。数据库变更必须另做兼容方案。

## 独立回滚

前端选择已有完整 release 目录，核对 deploy-meta.json、index.html、sw.js 后，经授权在实际 FRONTEND_ROOT 以临时 symlink + 原子替换切回 current；遵循原 Nginx 配置兼容要求。不需要后端发布或 Git 回退。

后端使用保留的旧 JAR 与精确 SHA/metadata，启动非活动 slot，通过 readiness、公共 /version 和 HubBackend 链路后再切流；失败恢复旧 slot。自动发布需要对应 CI artifact（当前保留 7 天）；过期时先在 GitHub Runner 重建并验证，不能在生产服务器补编译。旧多仓版本继续从保留产物恢复，不重打旧标签、不回滚数据库。

本轮离线 fixture 验证不能替代生产演练。迁移历史、PR37 处理及正式 clone 顺序见 [迁移说明](migration/README.md) 与 [切换清单](migration/cutover.md)。
