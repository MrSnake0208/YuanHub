# frontend 独立构建与部署

本目录是 Monorepo 的普通跟踪目录；部署仍独立，Git/分支/tag 由根仓管理。当前入口见 [Monorepo 运维手册](../../docs/monorepo-operations.md)。

- CI：根 `.github/workflows/frontend-ci.yml`，构建工作目录 `frontend/`。
- Release：根 `.github/workflows/frontend-release.yml`，仅 main-ref 手动 dispatch，集中检查通过后使用不可变标签 `frontend/vX.Y.Z`，独立环境 `frontend-production` 要求所有者审批。
- 版本及精确 SHA 分别记录到组件产物元数据。发布预览从根运行 `./release.sh --dry-run --frontend auto`。
- 保留原服务器目录、环境变量、数据库及旧版本回滚资产；新源码缓存是 `.monorepo-source`，构建进入 `frontend/`。独立回滚按根手册执行，须先获授权。
- 前端服务器通过 HTTPS 只读拉取公开的 Monorepo，无需 GitHub SSH 部署密钥。

原生产拓扑、变量表和历史多仓发布步骤完整保留在 [原部署资料](archive/deployment-polyrepo.md)，其中旧仓名、v* 触发与 .source 路径仅用于历史恢复，不是新版本入口。

从根运行 `./release.sh --prepare --frontend VERSION` → `./release.sh --status`，检查成功后另行授权 `./release.sh --publish`。Push/PR/tag 都不自动测试或部署。前端正式版本来自构建参数，后端 JAR 内置版本与完整 SHA；两端可以分别发布。2026-11-07 经所有者授权启用部署开关、配置前后端生产审批与不可变标签保护；后续发布仍逐次授权，实际状态见 [发布设置](../../docs/release-settings/README.md)。

## OCR CDN 首次切换

前端构建产出 `nginx/ocr-model-cdn.conf`，其中三个 ONNX 地址跳转到 ModelScope，WASM 地址跳转到 npmmirror。字典、ORT 加载器和 Worker 仍由本站提供。开发与 preview 由 Vite 提供相同跳转。

1. 完成前端 prepare 后，从该候选 release 目录取得 `nginx/ocr-model-cdn.conf`。旧版本此时仍在服务。
2. 经运维授权，将候选片段安装到独立于 `current` 的固定 Nginx 配置路径，在前端 `server` 中用该路径替换原 OCR include，避免重复 location。验证 `nginx -t` 成功后 reload。已有 CSP 如限制 `connect-src`，应同时允许这两个下载来源。
3. publish 在切换 `current` 前核对四个公网入口的 302 状态和准确目标。版本目录切换不会让 Nginx 自动重载。后续 CDN 地址不变时，直接沿用规则。
4. 回退本地分发时，先恢复带原文件的旧 release 或对应静态资源，再撤回相关跳转并 reload。已缓存的跳转最长可继续生效 300 秒。

资源清单、压缩范围见 [OCR 静态资源分发与压缩](./ocr-transport-compression.md)。
