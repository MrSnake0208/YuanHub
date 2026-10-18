# 密探及养成 API

第一次接入？从[读取我的密探：新手引导](/developers/use-cases/operator-read)开始，按步骤创建只读连接码并复制 AI 接入说明。

状态：Token 受限扫描正式支持，旧 V2 兼容保留；完整 V5 备份使用站内 JWT。版本与字段说明见[密探 V5](../operator-growth-data-exchange-protocol-v5.md)及其继承的[V4](../operator-growth-data-exchange-protocol-v4.md)、[V3](../operator-growth-data-exchange-protocol-v3.md)。

## Token 读取和旧版兼容

使用 `Authorization: Bearer <OPENAPI_TOKEN>`，不传账号 query。

| 方法与路径 | Scope | 参数 / 请求 | 成功响应 |
|---|---|---|---|
| `GET /open-api/operator/account` | 有效 Token | 无 | `ApiResult.data` 绑定账号 |
| `GET /open-api/operator/current` | `operator:read` | 可选 `game` | `ApiResult.data` 当前密探档案数组 |
| `GET /open-api/operator/annotations` | `operator:read` | 无 | `ApiResult.data` 养成状态标注 |
| `POST /open-api/operator/import` | `operator:write` | 原始密探 V2 JSON | `ApiResult.data` 导入统计 |
| `GET /open-api/operator/export` | `operator:export` | 无版本参数 | 原始密探 V2，无 data 包装 |

`current` 是当前档案读取 DTO，不是可原样导入的完整交换备份。读取 annotation 不代表允许写 annotation。V2 export 的 `X-Operator-Exchange-Warning` 提醒独立化极与突破信息损失；给它追加 `version=5` 不会获得 V5。

```bash
curl --fail-with-body -H "Authorization: Bearer $OPENAPI_TOKEN" \
  "$BASE_URL/open-api/operator/current"
curl --fail-with-body -H "Authorization: Bearer $OPENAPI_TOKEN" \
  "$BASE_URL/open-api/operator/annotations"
curl --fail-with-body -H "Authorization: Bearer $OPENAPI_TOKEN" \
  "$BASE_URL/open-api/operator/export" -o operator-v2.json
```

## 公共密探目录

`GET /v1/operator/catalog` 无需 Token。当前 HTTP 响应使用 `ApiResult` 包装，密探列表位于 `data.operators` 数组，按每项 `id` / `name` 为当前档案补充名称；目录加载失败或 ID 未找到时保留原始 ID。当前目录 DTO 的列表字段是 `operators`，不要将旧交换规范示例中的 `entries` 直接当作 HTTP 目录字段，也不要与 `/open-api/operator/current` 的 `data[].entries` 映射混淆。

## Token 自动采集

| 方法与路径 | Scope | 请求 | 成功 data |
|---|---|---|---|
| `POST /open-api/operator/scan-import/preview` | `operator:scan:write` | 原始 V3/V4/V5 文档 | `myshare-operator-import-preview@1`，逐项差异、状态和 warnings |
| `POST /open-api/operator/scan-import/commit` | `operator:scan:write` | 相同原始文档 | 逐项提交统计、结果和 warnings |

只接受一个来源账号、`operator_snapshot`、`source_kind=scan`、`snapshot_scope=listed`。来源 ID 可以是本地引用，服务端强制映射到绑定账号。不能提交浏览器 `document/account_mapping/confirm_review` 包装体，不能通过扫描写主观 annotation、manual 攻生或展示偏好，不扣库存。

```bash
curl --fail-with-body -H "Authorization: Bearer $OPENAPI_TOKEN" \
  -H 'Content-Type: application/json' --data-binary @operator-scan-v5.json \
  "$BASE_URL/open-api/operator/scan-import/preview"
curl --fail-with-body -H "Authorization: Bearer $OPENAPI_TOKEN" \
  -H 'Content-Type: application/json' --data-binary @operator-scan-v5.json \
  "$BASE_URL/open-api/operator/scan-import/commit"
```

先检查 preview 的逐项结果，再提交原始文件；preview 不提供绕过后续校验的授权。`review/unavailable` 分区不等于可靠采集；一次请求成功不代表所有分区均写入。缺少突破或未知化极不能从等级或旧31猜测。

## JWT 完整备份与恢复

要求普通 JWT、账号归属和当前 Beta 资格。完整备份使用 V5，服务端 export 默认仍为 V2。

| 方法与路径 | 参数 / 请求 | 成功响应 |
|---|---|---|
| `GET /v1/operator/export` | `account_id` 或 `scope=all`；`version=2|3|4|5` | 原始所选版本 JSON |
| `POST /v1/operator/import/preview` | 原始 V3/V4/V5 或下述包装 | `ApiResult.data` 预览 |
| `POST /v1/operator/import` | 旧 V2，或原始/包装 V3/V4/V5 | `ApiResult.data` 提交结果 |

```json
{
  "document": "REPLACE_WITH_V5_DOCUMENT_OBJECT",
  "account_mapping": {"SOURCE_ACCOUNT_ID":"REPLACE_WITH_OWNED_ACCOUNT_ID"},
  "confirm_review": false
}
```

这是包装结构示意，`document` 实际必须是对象，不能直接发送占位字符串。映射目标必须归当前用户，复核后才使用 `confirm_review=true`。密探 preview/commit 不使用招募协议的 `preview_token`。

```bash
curl --fail-with-body -H 'Authorization: Bearer REPLACE_WITH_USER_JWT' \
  --get --data-urlencode 'account_id=REPLACE_WITH_OWNED_ACCOUNT_ID' \
  --data-urlencode 'version=5' "$BASE_URL/v1/operator/export" -o operator-v5.json
```

## 错误

401 凭据无效；403 Scope/Beta/账号边界；404 账号不存在；409 幂等或 revision 冲突；422 结构、目录、账号映射、化极/突破/分区语义错误。查看领域 `error.code`、`operator_id`、`field_path`，并检查返回项的 rejected/review/partial 状态。完整快照可能重置未列出客观或主观内容，绝不能用残缺采集伪装完整备份。
