# 每日历练待办 API

需要 YuanHub JWT，用户身份只来自 `AuthenticationHelper.requireUserId()`。所有路由携带 `account_id` 与 `date=YYYY-MM-DD`，成功响应沿用 `ApiResult` 的 `data` 包装及全局 snake_case 序列化，`Cache-Control: no-store`。GET 校验账号归属及清单存在，缺失或无权限返回 404；没有待办记录返回版本 0，不创建数据。

| 方法 | 路径 | 请求 JSON |
| --- | --- | --- |
| GET | `/v1/operator/training-plans/{planId}/daily-tasks` | 无 |
| PUT | 同上 | `{"expected_version":0,"expected_schedule_revision":3}` |
| PUT | 上述路径加 `/{entryId}` | `{"expected_version":1,"completed":true}` |

写入仅允许北京时间 05:00 划分的当天及当前清单。严格拒绝多余/缺失字段、非法版本和非布尔完成值；客户端不能指定任务内容、完成次数、用户身份或来源。GET 返回当前保存的日程投影，不在服务器或首页重新规划。

响应 `data` 示例（日期、版本及任务均为演示）：

```json
{
  "account_id":"a", "plan_id":"p", "date":"2026-10-16", "version":1,
  "source":{
    "status":"ready", "revision":3,
    "items":[{"id":"ds-10","group_id":"ds","stage_level":10,"count":1,"cost_per":20,"completed_count":0}]
  },
  "tasks":[{"id":"ds-10","group_id":"ds","stage_level":10,"count":1,"cost_per":20,"completed_count":1}],
  "needs_update":false
}
```

`source.status`：`ready` 为可采用；`no_schedule` 未保存；`no_day` 无当日记录或早于当前阶段起点；`invalid` 暂停、日程错误或非法刷取配置；`needs_recalculation` 待重算；`unsupported` schema/rules 不受支持；`daily_limit` 新安排与已完成次数合并后超过同类每日 6 次。`ready` 的空数组表示今日确实无历练。来源只提取 `planned.spends` 中 `kind=training`，合并同类型/层数；忽略派遣、6-24 及自定义支出。支持 schema 1 / rules 13，风火、地水、阴阳 1–12 层，经验 1–8 档，每次 20 体力、同类最多 6 次。

`count` 为最近明确采用的计划次数，`completed_count` 为用户确认的完成次数。显式更新按稳定 `group-level` ID 保留完成次数；删除或减少目标不抹去历史完成，删除的已完成行以 `count=0` 保留。取消完成清零，零目标且零完成行移除。剩余次数为 `max(0, count-completed_count)`；勾选完成全部剩余次数，不影响库存、规划或自动执行。

导入校验来源修订和待办版本；相同任务内容的重试不重复写入或清零完成。首次零安排不能创建空待办，已有待办允许明确采用零安排以移除未完成项。`needs_update` 比较当前来源和最近采用的目标，不由普通 GET 隐式同步。已加入记录在来源不可采用时仍可勾选或取消；更新必须先修正来源。超限判断按每类 `sum(max(count, completed_count))`，覆盖更换层数后保留旧完成记录的情况。

错误沿用 operator 契约：未登录 401、账号/清单不可见 404、版本冲突/跨日/切换清单 409 `training_tasks_conflict`、字段或来源非法 422 `schema_validation_failed`。写入失败后客户端必须重新读取并让用户核对，不自动重试。

## 存储与并发

Hub 集合 `operator_daily_tasks`：`userId/accountId/planId/date/tasks/version/updatedAt`。确定性 `_id` 为四个范围字段分别做 UTF-8 URL-safe Base64 后用冒号连接，首次创建由 `_id` 唯一性保证；后续按全范围及 `version` 原子 CAS。实体另声明同范围唯一复合索引，正确性不依赖预先创建该索引。

变更使用 `hubTransactionTemplate`，先校验账号并调用已有账号写栅栏，与子账号删除串行；子账号删除在其事务中清理本集合。写入冲突或重复创建转换为 409。事务提交后通过现有账号 SSE 发布 `operator_training_tasks`，data 包含 `account_id/plan_id/date`；事件只提示重新读取，不携带任务内容。

按清单/日期保存记录，切换清单不复制任务，换日不顺延，也不自动新增记录。回滚前端不删除云端记录。部署后端在前、前端在后；不需要迁移旧规划、库存或用户偏好。

## 定向验证

```bash
./gradlew test --tests '*OperatorDailyTasksServiceTest' --tests '*OperatorDailyTasksControllerContractTest' --tests '*SubAccountServiceTest' --console=plain
./gradlew integrationTest --tests '*OperatorDailyTasksMongoTest' --console=plain
```

第二条由用户执行，使用自有 `TestMongo` 可抛弃容器，覆盖首次创建竞争、CAS、所有者/子账号/清单/日期隔离、账号范围删除和事务回滚；不得改接现有开发/生产服务。真实服务器事件同步与前端手机布局另由用户人工验收。
