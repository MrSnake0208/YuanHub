# 库存及物品 API

状态：正式支持。[库存 V2 协议](../exchange-specs/inventory-v2.md)用于物品、心纸和奖励；心纸数量不表示拥有或养成密探。

## 公共目录

| 方法与路径 | 认证 / Scope | 参数 | 成功 data |
|---|---|---|---|
| `GET /v1/inventory/catalog` | 公共 / 无 | 无 | `{format,version,catalog_version,entities}` |
| `GET /v1/operator/catalog` | 公共 / 无 | 无 | `{format,version,catalog_version,entries}` |

目录版本不是 API 版本。结构与用途见[公共目录](../exchange-specs/catalogs.md)。通常 HTTP 200；网络或服务错误保留缓存并提示稍后刷新，不伪造新目录项。

## Token 接口

所有请求使用 `Authorization: Bearer <OPENAPI_TOKEN>`，账号由 Token 决定。

| 方法与路径 | Scope | 参数 / 请求 | 成功响应 |
|---|---|---|---|
| `GET /open-api/inventory/account` | 有效 Token，无额外 Scope | 无 | `ApiResult.data` 绑定子账号 |
| `GET /open-api/inventory/current` | `inventory:read` | 可选 `entity_type=item|agent` | `ApiResult.data` 当前库存数组 |
| `POST /open-api/inventory/import` | `inventory:write` | JSON 原始库存 V2 | `ApiResult.data={accepted,duplicates,history_only,superseded,warnings}` |
| `GET /open-api/inventory/export` | `inventory:export` | `include=current` 或 `current,rewards`；可选 `from,to` | 原始 V2 JSON，无 data 包装 |

`current` 数组项含 `user_id,account_id,entity_type,full_baseline_at,entries,updated_at`；`entries` 以实体 ID 为键，值含 `count,listed_baseline_at`。空数组是合法结果，未知数量不从奖励历史猜测。

导出默认只含当前快照；`from/to` 是带时区 RFC3339，用于奖励区间 `[from,to)`。导入的 `records[].account_id` 必须严格等于绑定账号；原文档中的 `user_id` 不被接受为归属依据。

```bash
curl --fail-with-body \
  -H "Authorization: Bearer $OPENAPI_TOKEN" \
  "$BASE_URL/open-api/inventory/current?entity_type=item"

curl --fail-with-body \
  -H "Authorization: Bearer $OPENAPI_TOKEN" \
  -H 'Content-Type: application/json' \
  --data-binary @inventory-v2.json \
  "$BASE_URL/open-api/inventory/import"

curl --fail-with-body \
  -H "Authorization: Bearer $OPENAPI_TOKEN" \
  --get --data-urlencode 'include=current,rewards' \
  --data-urlencode 'from=2026-10-01T00:00:00+08:00' \
  --data-urlencode 'to=2026-10-02T00:00:00+08:00' \
  "$BASE_URL/open-api/inventory/export" -o inventory-backup.json
```

示例变量定义见[第三方接入指南](./guide.md)。导入前用下载示例构造自己的文件、替换账号及合法 ID，不直接把示例当作生产库存。

## JWT 备份接口

这些是站内接口，要求普通 JWT、账号所有权及当前 Beta 资格；不能使用 OpenAPI Token。

| 方法与路径 | 参数 / 请求 | 成功响应 |
|---|---|---|
| `POST /v1/inventory/import` | 原始库存 V2 JSON，所有目标归本人 | `ApiResult.data` 导入统计 |
| `GET /v1/inventory/export` | `account_id=<OWNED_ACCOUNT_ID>` 或 `scope=all`；include/from/to 同上 | 原始库存 V2 |

```bash
curl --fail-with-body -H 'Authorization: Bearer REPLACE_WITH_USER_JWT' \
  --get --data-urlencode 'account_id=REPLACE_WITH_OWNED_ACCOUNT_ID' \
  "$BASE_URL/v1/inventory/export" -o inventory-backup.json
```

## 错误与恢复

401 凭据错误；403 Scope、Beta 或账号不匹配；404 账号不存在；409 同一 `record_id` 不同正文；422 entity_type/include、目录 ID、时间或业务约束错误。领域错误使用 `error.code/message`，部分错误带 `record_id/entry_id`。

`duplicates` 是相同正文重试，`history_only` 是只保留历史而不改变当前库存，`superseded` 是被更新基线覆盖。HTTP 200 仍须检查这些统计和 warnings。奖励增量不能作为快照，全量快照未列出条目可归零；详见协议覆盖语义。

## 站内奖励补记（已计入库存）

仅本人 JWT 可调用以下端点，不对 OpenAPI 采集 token 暴露对应入口：

- `POST /v1/inventory/reward-annotations/preview`：正文为现有交换格式完整文档（当前实现 version=2），仅允许一个已拥有子账号的 `reward_delta`。响应 `{expected_inventory_revision, entries:[{record_id,entity_type,id,baseline_at,effective_at,history_only}], can_confirm}`，明细覆盖每个记录的每个条目。仅查询已持久化目录和库存，不触发目录惰性播种或任何库存写入；首次使用先正常加载公开目录。
- `POST /v1/inventory/reward-annotations`：正文 `{document, expected_inventory_revision}`，响应沿用导入回执 `{accepted,duplicates,history_only,superseded,warnings}`。归属来自认证；验证类型、数量、派遣体力、时间、目录与同键正文冲突。服务端不能核实游戏中的真实领取时间，玩家须如实填写，不自动改到基线前。

每个条目必须满足 `effective_at <= max(full_baseline_at, listed_baseline_at)`。预览只提示覆盖状态，不作为并发保证。确认在同一个 Hub Mongo 事务内重新校验归属/游戏、占用现有 inventory revision CAS，并逐条重新计算奖励效果；任何未覆盖项整批拒绝，回滚流水、revision 和账户写栅栏。成功仅保存标准奖励历史，不更改库存数量、更新时间或快照基线，但递增并发 revision，版本变化不等于资产变化。

错误 `annotation_baseline_missing` / `annotation_would_change_stock` 带 `record_id` / `entry_id` 定位；`inventory_state_stale` 表示预览后状态变化。玩家应回到盘点核对后重新预览，草稿保留，不强制 history_only。预览不可确认的响应仍包含所有条目，不能只检查一种碎片或账户整体基线。

并发写入尚未完成且结果无法确认时，返回 503 `annotation_result_unknown` 并保持原文档重试；不能把尚未提交的写冲突当作可以新建记录的明确拒绝。

同 record_id、同正文且现存记录为 history_only 的完整重试直接返回 duplicates，不要求旧 revision 再次匹配、不递增版本；同键异正文为 record_conflict，现存 applied 记录不能当作补记成功。部分重复只处理剩余新记录，并对整个提交保持事务一致性。网络/服务异常或回执不完整时冻结文档、record_id 与 revision 原样重试；只有明确拒绝后才能编辑并重建请求。

补记仍按普通交换格式保存/导出，不新增 stock_effect 输入或永久不入库的流水类型。删除或恢复旧盘点沿用现有按时间重放：先重放奖励时 stock_effect 可变为 applied，较晚盘点再校准数量；不能据此认为恢复后标记必回到 history_only。“只补记录”保证本次提交在覆盖基线下不重复入库，不排除日后历史重算。
