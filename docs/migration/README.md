# 公开 Monorepo 迁移

目标仓库继续使用公开的 `MrSnake0208/YuanHub`，默认分支仍为 main。此候选先在本地 `migration/monorepo` 准备；推送、创建 PR、合入 main 和生产启用均须分别获得授权。

## 历史边界

前端以原 main 为祖先，使用普通移动提交将源码放入 frontend/；后端通过不 squash 的 subtree 合并完整导入 backend/。原提交 ID、作者和日期不变。精确来源见 [provenance.json](provenance.json)。

没有从旧综合候选导入 Git 对象或提交祖先，也不导入外层 YuanHub-All 历史。根开发脚本、测试工具、规范和 CI 是新的迁移适配文件。外层旧任务、会话日志、备份、数据库归档及无关资产不在公开导出范围内。

`.dev/` 和 `.trellis/` 仅供本地使用，不在当前源码或待发布历史中。个人 Trellis 工作流由本机私有副本保留，正常 clone/Worktree 不依赖它。公开测试入口为 `scripts/test.sh`，说明在 [开发测试文档](../development/testing.md)。

PR37 的业务增量保持在独立 `feature/star-rebuild-recovery` 本地分支，不进入迁移基线。原 PR 不自动合并、关闭或改写；合入迁移后须另行决定如何替换其旧路径补丁。chore/feedback 的原两端源码与各自 main 一致，无额外业务增量。

其它旧分支、工作树及未提交内容仍由私有迁移备份和引用映射保护，不自动发布所有 refs、tags 或工作树快照。恢复时先确认业务增量，再按 frontend/backend 路径逐项移植。

## 验证与切换

源码、构建及离线测试证据保存在私有迁移报告中，不能把旧候选的 Orca 验收等同于本候选已经完成 UI 验收。生产部署未执行。

下一阶段按 [切换清单](cutover.md) 操作。合入时必须保留迁移分支祖先，使用 merge commit 或经批准的 fast-forward，不能 squash/rebase merge。日常开发、独立发布及回滚见 [操作手册](../monorepo-operations.md)。
