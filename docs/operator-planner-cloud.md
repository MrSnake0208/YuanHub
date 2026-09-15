# 养成规划云端接入

本页说明当前实装，与早期规划文档有差异时以当前页面和接口实现为准。

## 保存边界

- `OperatorGrowthTracker.vue` 保留材料缺口、共享库存分配、逐日推荐、目标天数试算与历史展示算法。
- `useOperatorPlannerCloud.js` 管理按子账号隔离的工作区与每个清单的日程，负责本机迁移、加载与保存状态。
- `operatorPlannerRemote.js` 转换 API 字段，保留动态密探 ID、资源键与日期键。固定快照读取时不按新规则重算。
- `plannerSnapshotWriter.js` 串行提交 revision 更新并合并待发出的日程修改；失败草稿保留在本机，重试先核对响应丢失时可能已经提交的请求。版本冲突不自动覆盖云端。

保存预测不改写实际库存、奖励流水或密探练度。默认清单继续使用特别关注与云端 growth-targets；自建计划持有独立目标。

## 所需后端接口

以下接口使用普通登录 JWT，query 参数 `account_id` 指定子账号，响应为既有 ApiResult。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET / PUT | `/v1/operator/training-workspace` | 清单、独立目标、当前清单、通关层数 |
| GET / PUT | `/v1/operator/training-plans/{planId}/stamina-schedule` | 偏好、顺序、自定义安排及完整固定日程 |
| POST | `/v1/operator/training-plans/{planId}/members/{operatorId}/remove` | 原子移除与可选毕业，保留备注 |
| POST | `/v1/operator/training-workspace/import-local` | 工作区、日程与导入回执同事务提交 |
| GET | `/v1/inventory/records` | 读取近 30 个业务日的密探奖励流水，前端按 05:00 业务日聚合 |

工作区与日程分别维护 revision，PUT 携带 expected_revision。日程 schema_version=1、rules_version=13，并保留时区字段以兼容既有数据；当前 YuanHub 固定使用 `Asia/Shanghai`（北京/上海时间），每天 05:00 作为新一天的开始。历史日程日期键保持不变，跨设备旅行不会改变日期边界。

心纸统计从流水接口读取 `entity_type=agent` 在 `[业务日05:00, 次日05:00)` 内的记录，并在前端按 `Asia/Shanghai` 业务日聚合近 30 个业务日期内的正数 `reward_delta`；每位密探平均值为 `acquired / active_days`，保持页面当前口径。这样不依赖后端把日期聚合从自然日午夜切换到 05:00。

## 本机迁移与恢复

保留原 `operator-training-workspace:v1` 和 `cultivation-stamina-planner:v1` 本机数据。首次接入会展示导入预览；云端已有内容时，本机清单作为新增自建计划导入，默认特别关注在导入时转为固定成员快照。用户可选择只使用云端并保留本机备份。

迁移请求和 migration_id 在发送前完整保存在本机，失败重试复用相同回执。明确的版本冲突可重新比较。日程保存失败时可重试、导出待保存 JSON，或明确放弃草稿并读取云端；未完成保存会提示离开页面，账号切换不会应用旧账号请求的响应。

账号 SSE 的 `operator_training_workspace`、`operator_stamina_schedule`、`operator_annotation`、`operator_growth_target`、`operator_favorites` 以及重连会触发对应补读。有未保存草稿时先处理草稿，避免被事件刷新覆盖。

## 验证与发布

先部署对应后端，再部署前端。后端 MongoDB 需要支持事务。养成规划继续使用 `operatorGrowthTracking` 功能开关，生产默认关闭；上线开放按 [功能开关规则](standards/feature-flags.md) 执行。

```bash
node --test test/operatorPlannerCloud.test.js test/operatorGrowthApi.test.js test/operatorTraining.test.js test/cultivationPlanner.test.js test/fixedPlannerSchedule.test.js
npm run build
```

测试涵盖当前模拟器快照往返、独立清单迁移、动态资源键、连续保存、响应丢失、冲突与草稿恢复。浏览器验收还应检查账号切换、迁移预览、毕业并移除及已有历史日程的显式更新。
