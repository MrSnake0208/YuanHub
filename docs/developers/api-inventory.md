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
