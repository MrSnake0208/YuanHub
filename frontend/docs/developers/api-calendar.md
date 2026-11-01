# 活动日历与每日历练 API

状态：所列 Token 能力正式支持。使用绑定账号，不接收 account_id 或 plan_id 来切换用户数据；成功响应为 `ApiResult`，私有快照使用 `Cache-Control: no-store`。

## 活动日历

| 方法与路径 | 认证 / Scope | 参数 | 成功 data |
|---|---|---|---|
| `GET /open-api/calendar/subscriptions` | Token / `calendar:read` | 可选 from、to、category、include_completed | `{account_id,generated_at,window:{from,to},items}` |
| `GET /open-api/calendar/events` | Token / `calendar:read` | 无 | `{account_id,game,generated_at,items}` |

subscriptions 默认从上海时区今天起至30天后，窗口最大180天；from/to 为 `YYYY-MM-DD`，`include_completed` 默认 false。category 使用服务端活动类别值，不用 UI 标签反推。没有匹配活动返回空 items，不返回404。events 返回绑定账号所属游戏的全部公开活动，包含未订阅项。

订阅 items 含 `event_id,title,category,game,start_date,end_date,start_time,end_time,time_zone,subscribed,completed`；events 的 items 是活动目录 DTO，并非同一拍平订阅结构。这里只读，不开放 Token 订阅或完成活动的写接口。

```bash
curl --fail-with-body -H "Authorization: Bearer $OPENAPI_TOKEN" \
  --get --data-urlencode 'from=2026-10-18' --data-urlencode 'to=2026-11-17' \
  --data-urlencode 'include_completed=false' "$BASE_URL/open-api/calendar/subscriptions"
curl --fail-with-body -H "Authorization: Bearer $OPENAPI_TOKEN" \
  "$BASE_URL/open-api/calendar/events"
```

401 无效 Token；403 缺少 Scope；404 账号不存在；400/422 日期、类别或窗口不合法。

## 每日历练读取

`GET /open-api/operator/daily-tasks?date=YYYY-MM-DD`，需 Token，`operator:read` 或 `operator:daily-tasks:write` 任意其一。date 默认上海时区今天；只读取绑定账号的当前方案，缺少 active 时选择第一方案，没有可用方案仍返回 HTTP200、空 tasks、`source_status=no_schedule`。

成功 data 含 `account_id,plan_id,plan_name,date,version,needs_update,source_status,tasks,schedule_revision,planned_tasks`。null 字段可能省略。tasks 是正式待办；planned_tasks 是规划候选，仅 `source_status=ready` 时有内容，不能把候选当成已保存待办。

tasks/planned_tasks 项含 `id,group_id,group_name,stage_level,count,completed_count,cost_per`。未知 group_name 允许为空，客户端以 group_id 兜底。

```bash
curl --fail-with-body -H "Authorization: Bearer $OPENAPI_TOKEN" \
  "$BASE_URL/open-api/operator/daily-tasks"
```

## 完成勾选

`PUT /open-api/operator/daily-tasks/{entryId}/completion`，需 Token 和 `operator:daily-tasks:write`。请求体必须恰好四个字段：

```json
{"date":"2026-10-18","expected_version":0,"expected_schedule_revision":0,"completed":true}
```

版本数字仅为结构示例；提交时用最近读取的 `version/schedule_revision`，entryId 用正式待办 ID。版本必须为非负安全整数；额外字段不被接受。

```bash
curl --fail-with-body -X PUT -H "Authorization: Bearer $OPENAPI_TOKEN" \
  -H 'Content-Type: application/json' --data-binary @daily-completion.json \
  "$BASE_URL/open-api/operator/daily-tasks/REPLACE_WITH_TASK_ENTRY_ID/completion"
```

成功返回与读取相同的完整快照，应直接用于刷新界面。401 无效 Token；403 Scope；409 版本或规划变更，重新读取后由用户确认；422 字段、日期、任务或无可用方案。不要忽略409或拿旧快照循环覆盖。
