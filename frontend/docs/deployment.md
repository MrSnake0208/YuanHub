# frontend 独立构建与部署

本目录是 Monorepo 的普通跟踪目录；部署仍独立，Git/分支/tag 由根仓管理。当前入口见 [Monorepo 运维手册](../../docs/monorepo-operations.md)。

- CI：根 `.github/workflows/frontend-ci.yml`，构建工作目录 `frontend/`。
- Release：根 `.github/workflows/frontend-release.yml`，仅手动 dispatch，集中检查通过后使用标签 `frontend/vX.Y.Z`，独立环境 `frontend-production`。默认 gate 未启用，本次没有生产部署。
- 版本及精确 SHA 分别记录到组件产物元数据。发布预览从根运行 `./release.sh --dry-run --frontend auto`。
- 保留原服务器目录、环境变量、数据库及旧版本回滚资产；新源码缓存是 `.monorepo-source`，构建进入 `frontend/`。独立回滚按根手册执行，须先获授权。
- 前端服务器通过 HTTPS 只读拉取公开的 Monorepo，无需 GitHub SSH 部署密钥。

原生产拓扑、变量表和历史多仓发布步骤完整保留在 [原部署资料](archive/deployment-polyrepo.md)，其中旧仓名、v* 触发与 .source 路径仅用于历史恢复，不是新版本入口。

从根运行 `./release.sh --prepare --frontend VERSION` → `./release.sh --status`，检查成功后另行授权 `./release.sh --publish`。Push/PR/tag 都不自动测试或部署。前端正式版本来自构建参数，后端 JAR 内置版本与完整 SHA；两端可以分别发布。main 规则已切换，生产 Environment 等配置仍待授权，部署开关保持 false。
