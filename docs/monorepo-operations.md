# Monorepo 开发与独立部署

## 一个任务一个 Worktree

所有者可在 main 直接开发，无需 PR；需要隔离时可选 Worktree。在 Orca 添加正式 clone 的 Git 根目录，基础分支选择 main；根 AGENTS.md 要求自动核对 Git 根、当前分支、状态，再同时读取两端规则。frontend/backend 是普通目录，不创建第二套仓库或跨树符号链接。

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

## 日常开发与外部贡献

所有者完成根 `AGENTS.md` 要求的最小自检后，可以直接 commit/push main，不强制 PR。Agent 仍须分别获得 commit、push 的明确授权。其他贡献者通过分支/PR，由所有者人工审核；不设置日常 required checks。Worktree 是可选的开发隔离方式，不是强制 PR 流程。

Push 到 main 和 PR 由 `.github/workflows/ci.yml` 按组件路径自动运行轻量 CI：后端 `./gradlew ktlintCheck test --console=plain`，前端 `npm ci`、`npm run test:static`、`npm run build`；修改 CI 文件或手动触发时两端都跑，不部署。frontend-ci、backend-ci、frontend-regression 和 pr-ci 保留手动入口；前两者同时是 reusable workflow，frontend-regression 仅供手动诊断，不在集中检查内。没有每日全量回归，也没有自动生产发布。缓存继续复用 npm lockfile 和 Gradle 现有缓存。根 workflows 才是活动入口；子目录和 scripts/legacy-release 是历史资产，不能用于当前 Monorepo。

可疑 PR 可手动诊断完整差异，例如 `gh workflow run pr-ci.yml --repo MrSnake0208/YuanHub --ref main -f commit=HEAD_SHA -f base=BASE_SHA`，或分别运行 frontend-ci/backend-ci 并传 `commit`。这里只产生诊断结果，不能替代集中发布准入。

## 准备发布：本地测试、GitHub JAR 与服务器预构建

从干净、已 push 且与 origin/main 一致的 main 执行：

```bash
./release.sh --prepare
./release.sh --status
```

prepare 读取当前生产前端 deploy-meta.json、后端 /version 的实际版本与完整 SHA，比较各自已部署提交至当前 main 的差异，选择需要发布的组件。默认在各组件实际已部署版本上递增 patch；不修改 VERSION、不提交、不创建正式标签。计划和候选保存于本树忽略的 `.dev/release/candidate.json`，包含完整 SHA、两端版本、线上基线、变更文件、request/run ID、本地测试结果及前端预构建 run。后续 main 的 Push 不改变这个候选。选中前端时提前通过工作流驱动服务器 A 构建，不切换线上，也不从 GitHub 上传前端产物。`--status` 显示本地测试结果、release-check 与前端预构建状态及 Actions 链接，只有完整成功且证据有效才报告可继续发布。

独立版本与范围可明确指定：

```bash
./release.sh --prepare --frontend 0.1.15
./release.sh --prepare --backend 0.1.42
./release.sh --prepare --frontend 0.1.15 --backend 0.1.42
./release.sh --prepare --stress
./release.sh --prepare --dry-run
```

显式选择一个组件不会顺带部署另一个，也不运行另一个组件的本地测试。`--frontend` / `--backend` 不带版本（或 `auto`）在 prepare 中从该组件线上版本递增。正式发版前需要人工判断接口兼容性；有相互依赖时选两端，先发布兼容后端。显式前端单发不能自动证明它与线上旧后端兼容。Git 历史缺失、生产元数据不可读、分支/远端不一致会停止，不猜测上次部署。离线旧式预览 `./release.sh --dry-run --frontend auto` 仍读取 VERSION 默认值；`--dry-run --frontend VERSION --backend VERSION` 只读本地 HEAD，不访问网络。`--prepare --dry-run` 会读取远端和生产元数据，但不跑测试、不触发 Actions。

prepare 并发推进本地测试、release-check 和前端预构建，并等待全部结束。本地只测试所选组件，前后端各组并行、组内命令顺序执行：前端仅 `npm run test:static`；后端 `./gradlew ktlintCheck test criticalTest --console=plain`、迁移 Node 测试与 beta npm test，beta 缺少 node_modules 时先 npm ci。criticalTest 由 `backend/build.gradle.kts` 中的 `criticalTestClasses` 清单决定，新增关键类时只需加入该清单；现有 8 类保留 integration 标签，在分配 fork 前按类文件过滤，覆盖账号隔离与数据安全，使用本机 MongoDB 副本集的 TestMongo 自有随机库。两个一次性修复脚本测试已移出，仅在再次执行对应迁移脚本时手动运行 `integrationTest --tests` 相应类，仍需要 mongosh，具体类名见 [测试说明](development/testing.md)。beta 脚本沿用自有随机测试库，不访问开发或生产数据。显式 `--stress` 仍加入 stressTest；criticalTest 默认 4 个 fork，可用 `-PcriticalForks=N` 调整（正整数），其它测试任务配置不变。GitHub release-check 绑定准确 main SHA，校验候选并保留 Release infrastructure regressions；选中后端时只 assemble、校验和保存 JAR，不运行组件业务测试。前端 prepare 取得此 run ID 后立即开始，不等 JAR 完成，仅检查 run 身份及未失败状态；发布阶段完整门禁不变。

本地各命令结果、SHA、组件及起止时间写入 state，日志位于 `.dev/release/logs/<sha>/`；全部结束后复核 HEAD 未变且工作区干净，失败不记录为通过。candidate 必须成功；选中后端时 backend 必须成功，否则必须 skipped。最终 candidate artifact 标记 `checks=artifact-only`，绑定 SHA、run ID、attempt、两个版本、stress 和 API 配置，最多有效 7 天；测试通过由本地记录证明。重跑必须有同 attempt 的最终凭据及 JAR，不能继承旧批次结果。后端 artifact 自带完整 SHA 和构建版本；缺失/过期时停止。前端保留低带宽服务器构建，从精确 SHA 注入同一版本并检查真实 build-info、资源和 SW，release 复用已准备产物。

## 失败修复与正式发布

先按日志判断是真实缺陷、过时断言、环境还是基础设施问题；按最终业务行为修复，禁止删除有效测试或无理由 skip。修复必须另行 commit/push，再执行 prepare 得到新候选；不自动提交。prepare 每次创建新检查，publish 复用冻结候选的成功结果。旧 SHA 的绿色结果不能放行新 SHA。已经存在的标签只有指向同一 SHA 才可复用；如果修复改变 SHA，需要选择尚未使用的新版本。调度找不到 run 时先检查 Actions，避免盲目重复调度。

用户要求发版后，Agent 运行 `./release.sh --prepare` 并等待本地测试、GitHub JAR 和服务器 A 前端预构建全部完成；通过后汇报候选 SHA、组件版本和变更内容，只询问一次是否部署到生产，取得用户明确确认后执行：

```bash
./release.sh --publish --dry-run
./release.sh --publish --yes
```

publish 首先要求本地测试记录 SHA 匹配、覆盖所选组件且各命令全部通过，选中前端时还须预构建成功；缺失或不符必须重新 prepare。随后重新核对 main、冻结 SHA、成功 run/attempt、版本、产物、证据有效期、API 配置、线上基线与部署开关；交互输入 `publish` 才创建/推送不可变 `frontend/vX.Y.Z` / `backend/vX.Y.Z` 标签并手动 dispatch。`--yes` 代表调用者明确授予正式发布授权，不是 prepare 的默认选项。发布工作流还要求所有者、main、准确提交及 `deploy TAG@SHA` 确认值；Tag Push 自身不部署。

两端同发时等待后端蓝绿、readiness、公开 /version 健康检查完成，并核对实际后端版本/SHA 后，再激活前端；手动绕过 CLI 运行前端工作流也检查所选后端是否就绪。失败立即停止，显示具体 Actions 链接；不继续前端，不移动标签。相同版本/SHA 已在线则安全跳过；未完成的步骤可重试，线上基线变化则要求重新准备候选。两端生产 Environment 不设人工 reviewer，发布授权由 CLI 流程的用户明确确认表达。

后端仍从 release-check 所在 run 下载 JAR，校验内置版本/SHA、传输摘要，再调用原蓝绿部署脚本。服务器不编译；后端 prepare phase 仅安装不切流，release 仍需完整门禁及授权。切流并记录 active slot 后，排空任务通过 Linux 的 nohup/setsid 脱离 SSH，以 flock 协调取消与停止，等待 DRAIN_SECONDS，日志和 PID 写入 state/drain.log、state/drain.pid；停止前再次核对 active slot。下一次 release 在启动新 slot 前取消待排空任务并同步停止旧 slot，prepare 不触碰排空或运行服务；DRAIN_SECONDS=0 仍同步停止，回滚路径不变。前端仍在服务器独立源码副本提前构建，版本通过 YUANHUB_VERSION 注入，release 复用产物；current 原子切换、SW 摘要、历史 releases、旧 slot 失败恢复及 GitHub Release 都保留。前后端版本不绑定。VERSION 只是日常本地构建默认值，不要求版本 PR。

## 远端切换边界

本地 YAML 不代表线上保护已经修改。实际规则状态、待批准 JSON、应用顺序和官方依据见 [远端切换配置](release-settings/README.md)。先建立仅所有者 PR bypass 的 Ruleset，再去掉叠加的经典 required PR/CI；禁止强推/删除仍保留。两端生产 Environment 已移除 required reviewer，保留 main 分支策略；按实际 workflow ref 选择 branch/tag 策略：当前新版只接受 main-ref dispatch；合法 tag-ref 发布须显式允许对应 tag，不能无条件限制为 main。旧提交中的 tag-triggered 发布入口须单独核验集中门禁与人工确认，不能仅靠新版 YAML 判定安全。

2026-11-07 经所有者授权，`YUANHUB_MONOREPO_DEPLOY_ENABLED=true`；2026-11-09 经所有者授权移除 `frontend-production`、`backend-production` 的 required reviewer，仍仅接受 main-ref dispatch，Secrets 和部署开关不变。`frontend/v*`、`backend/v*` 标签禁止更新和删除，无 bypass。独立的 `production` Environment 保持原状。实际 API 回读与发布证据见 [发布设置](release-settings/README.md)。旧 BackEndV3-Share 的 Actions 和 Tag Release 仍活跃且不受此开关约束；完成新通道生产发布及回滚验证前保留旧能力，最终停用另行授权，切换窗口须协调两仓发布。prepare 可在部署关闭时运行 CI；publish 在关闭时拒绝创建标签，启用也不代表授权后续发布或回滚。旧多仓脚本绝不能拿当前根仓运行。

## 独立回滚

前端选择已有完整 release 目录，核对 deploy-meta.json、index.html、sw.js 后，经授权在实际 FRONTEND_ROOT 以临时 symlink + 原子替换切回 current；遵循原 Nginx 配置兼容要求。不需要后端发布或 Git 回退。

后端使用保留的旧 JAR 与精确 SHA/metadata，启动非活动 slot，通过 readiness、公共 /version 和 HubBackend 链路后再切流；失败恢复旧 slot。自动发布需要对应集中检查 artifact（当前保留 7 天）；过期时先在 GitHub Runner 重建并验证，不能在生产服务器补编译。旧多仓版本继续从保留产物恢复，不重打旧标签、不回滚数据库。

本地 fixture 验证不能替代生产演练。迁移历史、PR37 处理及正式 clone 顺序见 [迁移说明](migration/README.md) 与 [切换清单](migration/cutover.md)。
