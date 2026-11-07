# backend 独立构建与部署

本目录是 Monorepo 的普通跟踪目录；部署仍独立，Git/分支/tag 由根仓管理。当前入口见 [Monorepo 运维手册](../../docs/monorepo-operations.md)。

- CI：根 `.github/workflows/backend-ci.yml`，构建工作目录 `backend/`。
- Release：根 `.github/workflows/backend-release.yml`，仅 main-ref 手动 dispatch，集中检查通过后使用不可变标签 `backend/vX.Y.Z`，独立环境 `backend-production` 要求所有者审批；发布前检查仓库部署开关。
- 版本及精确 SHA 分别记录到组件产物元数据。发布预览从根运行 `./release.sh --dry-run --backend NEW_VERSION`。
- CI 构建 JAR，Release 从同 SHA、同 attempt 的成功集中检查 run 下载产物，经 `scripts/deploy/transfer-release.sh` 上传并校验归档摘要。服务器只安装预构建 JAR，产物缺失时直接失败，不执行编译。
- `prepare` 要求 CI 成功，只上传和安装候选目录，不改变槽位或服务。日志与 Actions Summary 记录归档字节数和上传秒数，上传上限 4 MiB/s。
- 保留服务器环境变量、数据库、旧源码缓存及回滚 JAR。`backend/deploy/blue-green-deploy.sh` 必须接收 `PREBUILT_JAR`；不再依赖服务器 Git/JDK 编译器。运行仍需 Java 21，蓝绿切换仍需双实例内存余量。独立回滚按根手册执行。

原生产拓扑、变量表和历史多仓发布步骤完整保留在 [原部署资料](archive/deployment-polyrepo.md)，其中旧仓名、v* 触发与 .source 路径仅用于历史恢复，不是新版本入口。

从根运行 `./release.sh --prepare --backend VERSION` → `./release.sh --status`，检查成功后另行授权 `./release.sh --publish`。Push/PR/tag 都不自动测试或部署。前端正式版本来自构建参数，后端 JAR 内置版本与完整 SHA；两端可以分别发布。2026-11-07 经所有者授权启用部署开关、配置前后端生产审批与不可变标签保护；后续发布仍逐次授权，实际状态见 [发布设置](../../docs/release-settings/README.md)。
