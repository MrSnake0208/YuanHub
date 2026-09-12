# 可交给后端开发代理的适配 Prompt

请为 YuanHub「养成追踪 / 培养计划」实现云端 workspace 存储，并提供可供前端联调的契约与测试结果。当前前端已有按子账号隔离的本地 v1 实现；不要把本地 revision 当作服务端 revision，也不要假定本文的新 API 已存在。

首先阅读当前仓库中的以下文件；若你位于独立后端仓库，请先取得这些文件的实际内容再开始编码，不依赖开发者个人绝对路径：

1. `docs/operator-training-plans.md`：完整行为、数据模型、拟新增 API、校验、迁移及验收，是本任务的主要契约。
2. `docs/api-contract.md` §5.3–5.4：现有云端 targets、annotations、快捷提升约定。
3. `docs/standards/feature-flags.md`：该功能生产前端默认关闭，开关不是后端权限边界。
4. `src/data/operatorTrainingPlans.js`、`src/data/operatorTraining.js`：本地模型、修订检查、历练表与换算实现。
5. `src/components/operator/OperatorGrowthTracker.vue`、`src/components/operator/OperatorTrainingPlanPicker.vue`：默认和自建计划语义。
6. `test/operatorTraining.test.js`：关键计算和本地行为用例。

请直接完成实现，不只输出设计建议。遵循后端仓库现有认证、事务、数据库迁移、命名及 ApiResult 风格。

必须实现：

- `GET /v1/operator/training-workspace?account_id=...`：不存在时返回默认 workspace、revision 0。
- `PUT /v1/operator/training-workspace?account_id=...`：完整快照原子更新，使用 expected_revision 防止覆盖。
- `POST /v1/operator/training-workspace/import-local?account_id=...`：接收已转换/确认的本地 v1 快照，保留 UUID，按 migration_id 幂等导入，workspace 与 receipt 同事务提交。
- 全部接口验证登录用户对子账号的访问权。账号级隔离，不信任请求提供的用户归属。保留现有默认每密探目标接口；禁止任何清单操作修改星标、档案、库存或养成状态。
- 严格按主要契约校验默认 favorites 计划、自建 UUID/成员/目标、active_plan_id、层数、版本；不得静默截断或纠正导致用户数据丢失。请求成功后返回实际保存的完整 workspace。
- 历练计算和完成态当前在前端派生，无须存储 ETA、材料缺口或 completed；如后端也计算，复用同一表格与测试口径，明确仅为保守估算。

默认计划成员是动态星标集合加手工添加、减手工排除。不要把当前星标快照写成固定成员，也不要将「从清单移出」实现成取消特别关注。自建目标按 `(account_id,plan_id,operator_id)` 隔离；默认目标继续使用旧 `(account_id,operator_id)` 存储。旧 `heart_paper` 不参与新追踪，不需要破坏性迁移。

迁移时客户端负责提供已处理冲突的完整快照；服务器不做静默覆盖或隐式合并。版本冲突返回 409。相同 migration_id 和内容的超时重试返回原结果；相同 migration_id 不同内容拒绝。仅在成功提交事务后记录 receipt。

必须添加数据库迁移（含回滚/兼容说明）、服务与请求校验、API 集成测试，并覆盖：

- 首次读取/创建、更新修订、过期写入冲突；两个客户端同时更新同一账号只能一个成功。
- 不同子账号隔离、越权读写/导入拒绝；默认计划不可删除，自建同密探不同目标不互相覆盖。
- 非法 ID/层数/目标组合/schema/active_plan_id 拒绝，不触发半写入。
- 同迁移 ID 重试不重复创建；内容改变冲突；模拟中途失败无半份 workspace 或 receipt。
- 不修改现有 favorites、annotations、密探客观档案、inventory、v2/v3 导入导出或默认 targets 接口行为。

交付请提供代码与迁移文件、实际端点示例（包括成功和 409）、运行测试命令与结果、前端 camelCase ↔ API snake_case 映射说明，以及前端 repository 的接入步骤。更新已落地的 API 契约状态；不得把未测试或未实现部分标成已完成。若主要契约与当前后端有不可兼容之处，列出具体冲突及兼容方案，保持旧 API 可用。
