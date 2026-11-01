# YuanHub Monorepo

一个 Git 根、一个任务分支、一个 Worktree，同时开发 Vue 前端和 Kotlin 后端。两端继续独立安装、构建、部署及回滚。

```text
frontend/        Vue 3 / Vite / npm；VERSION 记录前端版本
backend/         Kotlin / Spring Boot / Gradle / JDK 21
.github/workflows/  分别运行两端 CI、回归及受控发布
scripts/         test.sh 测试入口、工作树环境与发布工具
docs/            development/testing.md、跨端文档与迁移说明
```

1. 在 Orca 中添加本仓库的根目录，基础分支选择经确认的集成基线；创建一个功能 Worktree，启动一个 Codex。它会自动通过 Git 定位当前工作树和分支，并读取根及两端 AGENTS.md。
2. 安装前端依赖：`cd frontend && npm ci`（Node 22）；后端使用 `backend/gradlew` 和 JDK 21，不引入 JS Workspace 或额外构建框架。
3. 在当前 Worktree 根运行 `./dev.sh --print-env` 查看私有地址；`./dev.sh frontend` 启动前端，`./dev.sh backend` 或 `./dev.sh` 先准备本树独占 Mongo replica set / Redis，再启动服务。需要可用的本地 Docker；不接入已有开发数据库。
4. 独立构建：前端 `cd frontend && npm run build`；后端 `cd backend && ./gradlew assemble --console=plain`。验证入口与隔离要求见 [docs/development/testing.md](docs/development/testing.md)。前端为 JavaScript 项目，无 TypeScript typecheck 脚本，`test:static` 是源码编译检查。
5. 发布预览：`./release.sh --dry-run --frontend auto` 或 `./release.sh --dry-run --backend VERSION`。正式发布、分支恢复、Orca 接入、切换及回滚见 [运维与工作树手册](docs/monorepo-operations.md)。

这是面向现有公开 `MrSnake0208/YuanHub` 的隔离迁移候选，不代表远端或生产已切换。只保留原前端、后端的 Git 历史，不包含外层 YuanHub-All 的提交历史。来源及待授权切换步骤见 [迁移说明](docs/migration/README.md)。
