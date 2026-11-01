# 切换清单（均未执行远程写入）

1. 审阅本地 migration/monorepo：前后端源码均被根 Git 跟踪，原两端历史可达，外层历史不可达；核对敏感信息审查、构建及契约证据。保留所有旧目录、工作树和私有备份。
2. 单独授权后，仅将 migration/monorepo 推到现有 MrSnake0208/YuanHub 的同名迁移分支。先重新核对远端 main 是否仍为 provenance 记录的基线、有无同名分支。禁止 force、--all、--mirror、--tags；不推独立功能分支或旧保护 refs。
3. 单独授权后创建迁移 PR，复核分支保护、required checks、Webhook、GitHub Environments、发布变量和服务器拉取路径。必须保留迁移提交祖先：使用 Create a merge commit，或另行批准的 main fast-forward；不得 squash/rebase merge，否则会丢失后端完整祖先。合入 main 才会改变默认克隆内容及生产流程定义；不要将“推到迁移分支”视为已启用生产。
4. 生产适配批准后分别配置 frontend-production、backend-production 和所需 Secrets/Variables；核对现有部署资产后再启用 YUANHUB_MONOREPO_DEPLOY_ENABLED。分别运行组件 CI、准备和发布。不迁移数据库，不修改 DNS/Cloudflare。
5. 主线合入完成后，在空目录正常 git clone 现有 YuanHub；GitHub URL 不变，clone 自动得到 frontend/backend。Orca 添加该根目录并确认基础分支 main，避免与旧同 URL 项目登记冲突；旧工作树先保留。重新创建一个验收任务并检查根/分支/双端文件，再开始业务开发。

隔离期回退只需继续使用未改动的旧工作区。正式切换后出现问题，先保留新工作树修改，使用各组件已记录的旧部署产物分别回滚；不要 reset/clean 用户目录或回滚 Mongo。迁移分支可一直保留供审阅，不需要覆盖或移动原目录。
