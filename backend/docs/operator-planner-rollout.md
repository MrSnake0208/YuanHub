# 当前养成规划接入与发布

行为依据是 YuanHub 当前养成规划页面，不沿用早期规划文档。完整 API 见 [operator-planner-api.md](operator-planner-api.md)。

## 批次与现状

1. 工作区、完整日程、revision、原子移除与毕业、幂等本机迁移及账号删除清理。
2. 前端云端保存、每个清单独立日程、迁移预览、待保存草稿与冲突恢复。
3. 心纸历史聚合、账号事件、跨端刷新与验证。

推荐与目标天数试算仍在前端运行，后端保存完整预测快照；真实库存与升级事务保持各自业务边界。规则版本为 13，未来规则升级需要同时升级校验与前端，不得在读取旧日程时隐式重算。

## 新增心纸统计

`GET /v1/inventory/acquired-summary?account_id=...&entity_type=agent&from_date=2026-08-15&to_date=2026-09-14&timezone=Asia%2FShanghai`

使用 JWT 和既有子账号归属校验。日期区间左闭右开，按给定 IANA 时区转换为真实时间边界，支持夏令时。ApiResult.data 返回 `account_id,entity_type,from,to,timezone,items`；items 为密探 ID → `{acquired,active_days}`。

仅统计正数 reward_delta，不计库存快照和升级消费；同一密探在同一当地日期获得多次，只增加一个 active_days。无分页截断。前端近 30 日平均为 acquired / active_days，保留页面现有“有获取记录的天数”口径，未除以 30。库存读取和心纸统计独立失败时，前端仍可展示另一项可用结果。

## 前端迁移和保存

- 新浏览器先读取云端。旧浏览器发现旧 localStorage 工作区或体力日程时，展示预览后一次性导入。云端已有计划时，将本机清单转成新的独立计划；本机特别关注清单在导入时解析为成员快照，不覆盖云端特别关注。
- 全程保留旧本机键。导入前保存完整 request 与 migration_id，响应丢失后复用同一回执；明确的版本冲突可重新比较。用户可选择使用云端并保留本机备份。
- 日程连续编辑按 revision 顺序提交并合并未发出的修改。待保存草稿按账号与计划隔离，保留到服务端确认后才删除。保存失败或恢复浏览器后，用户可重试、导出 JSON，或明确放弃草稿并重新读取云端。
- 重试先 GET 核对上次请求是否已经生效，不在 409 后自动覆盖其他设备的修改。切换清单会等待当前保存；切换账号不会让旧请求结果写入新账号页面。离开页面时，未完成保存会触发浏览器提示。
- 固定日程使用保存的 timezone 判定今天；库存更新、目标更新只提示差异，历史日期保持原快照。移动到其他时区不改写旧日程的日期边界。
- “毕业并移除”调用单个事务接口，并将返回 annotation 应用到父页面；撤销只恢复清单成员。

## 账号事件

`operator_annotation`、`operator_growth_target`、`operator_favorites` 在写入提交后发出，包括 v3 主观数据导入。事务回滚不发布这些事件。工作区和日程事件同样在提交后发出。前端收到事件或重新连上账号流时重新读取；有未保存修改时先保留草稿，待保存结束再补读。

沿用现有内存 AccountEventService，事件不是持久日志。多实例部署时仍受现有事件总线的实例范围限制；GET 与 revision 校验负责最终状态与冲突检测，重连/刷新补读。

## 部署顺序和验证

先部署后端，再部署前端。MongoDB 必须支持事务（项目现有库存导入与升级也依赖此条件）；现有 auto-index-creation 配置负责新集合索引。不需要改写已有记录。前端 `operatorGrowthTracking` 的生产功能开关保持默认关闭，验收后再按仓库功能开关规范开放。

测试包含真实 MongoDB 的并发首写/更新、跨集合回滚、超过 5000 条奖励的完整聚合、时区边界及夏令时，以及事务提交前不发事件。`browser-fixed-schedule.json` 来自实际 Vue 页面编辑后的请求，用于后端完整快照往返验证。

```bash
PLANNER_TEST_MONGO_URI='mongodb://127.0.0.1:27017/?replicaSet=rs0&serverSelectionTimeoutMS=3000' \
  ./gradlew test --tests '*Operator*Test' --tests '*Inventory*Test' --tests '*AccountEventServiceTest' --tests '*SubAccountServiceTest'
```

此改造不自动启动或部署运行中的后端，也不向真实用户账号写入测试数据。
