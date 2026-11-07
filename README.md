# YuanHub Monorepo

一个 Git 根，所有者可直接开发 main，也可选择隔离 Worktree，同时开发 Vue 前端和 Kotlin 后端。两端继续独立安装、构建、部署及回滚。

```text
frontend/        Vue 3 / Vite / npm；VERSION 为本地版本默认值，正式版本在准备发布时注入
backend/         Kotlin / Spring Boot / Gradle / JDK 21
.github/workflows/  分别运行两端 CI、回归及受控发布
scripts/         test.sh 测试入口、工作树环境与发布工具
docs/            development/testing.md、跨端文档与迁移说明
```

1. 可直接在 main 开发；需要隔离时，在 Orca 添加本仓库根目录，选择经确认的集成基线，创建一个功能 Worktree 并启动 Codex。它会自动通过 Git 定位当前工作树和分支，并读取根及两端 AGENTS.md。
2. 安装前端依赖：`cd frontend && npm ci`（Node 22）；后端使用 `backend/gradlew` 和 JDK 21，不引入 JS Workspace 或额外构建框架。
3. 在当前 Worktree 根运行 `./dev.sh --print-env` 查看私有地址；`./dev.sh frontend` 启动前端，`./dev.sh backend` 或 `./dev.sh` 复用本机 MongoDB/Redis，再启动服务；只有显式 `./dev.sh containers` 才准备私有容器。
4. 独立构建：前端 `cd frontend && npm run build`；后端 `cd backend && ./gradlew assemble --console=plain`。验证入口与隔离要求见 [docs/development/testing.md](docs/development/testing.md)。前端为 JavaScript 项目，无 TypeScript typecheck 脚本，`test:static` 是源码编译检查。
5. 日常所有者 `git push`，贡献者 PR 人工审核；普通提交不跑 CI。发版 `./release.sh --prepare` → `./release.sh --status` → 获明确授权后 `./release.sh --publish`。独立版本、远端设置切换及回滚见 [运维与工作树手册](docs/monorepo-operations.md)。

当前仓库为公开 `MrSnake0208/YuanHub` Monorepo。2026-11-07 经所有者授权启用生产通道，前后端 Environment 仅接受 main 并要求所有者审批，组件标签禁止更新和删除；每次正式发布仍需明确授权。旧后端通道继续保留，回滚演练和旧通道退役另行授权。只保留原前端、后端的 Git 历史，不包含外层 YuanHub-All 的提交历史。配置证据见 [发布设置](docs/release-settings/README.md)，来源见 [迁移说明](docs/migration/README.md)。
