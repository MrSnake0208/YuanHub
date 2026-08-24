# 交换文档的传输与鉴权

本页只列交换相关 HTTP 端点。完整请求、账号管理和其他业务接口见 [`../api-contract.md`](../api-contract.md)。

## 1. 两种认证方式

| 场景 | Authorization | 账号来源 |
|---|---|---|
| YuanHub 浏览器/站内工具 | `Bearer <JWT>` | query、文档及 v3 `account_mapping`，但目标必须归当前用户 |
| 第三方工具/OpenAPI | `Bearer <OpenAPI Token>` | Token 绑定的单个子账号 |

OpenAPI 数据接口不能用普通 JWT，浏览器接口也不能用 OpenAPI Token 替代 JWT。

## 2. 浏览器 JWT 端点

| 方法与路径 | 请求/参数 | 成功响应 |
|---|---|---|
| `GET /v1/inventory/catalog` | 无，公开 | `myshare-entity-catalog@1`，通常位于 `data` |
| `POST /v1/inventory/import` | 原始库存 v2 文档 | `data={accepted,duplicates,history_only,superseded,warnings}` |
| `GET /v1/inventory/export` | `account_id` 或 `scope=all`；`include,from,to` 可选 | 原始库存 v2 文档 |
| `GET /v1/operator/catalog` | 无，公开 | `myshare-operator-catalog@1`，通常位于 `data` |
| `POST /v1/operator/import` | 原始密探 v2；或原始/包装密探 v3 | v2/v3 commit 结果 |
| `POST /v1/operator/import/preview` | 原始或包装密探 v3 | `myshare-operator-import-preview@1` |
| `GET /v1/operator/export` | `account_id` 或 `scope=all`；`version=2|3` | 原始密探交换文档 |

库存 `include` 默认为 `current`，也可为 `current,rewards`；`from/to` 用于限制奖励流水区间。密探导出默认 `version=2`，新工具应显式请求 `version=3`。

导出响应不套 `{success,code,message,data}`；前端请求层必须使用 raw 模式。

## 3. OpenAPI Token 与 scopes

Token 由用户在 `/user/open-api/token` 创建并绑定一个子账号，明文只返回一次。交换相关 scope：

| scope | 能力 |
|---|---|
| `inventory:read` | 读取当前库存 |
| `inventory:write` | 导入库存 v2 |
| `inventory:export` | 导出库存 v2 |
| `operator:read` | 读取当前密探养成 |
| `operator:write` | 导入密探 v2 |
| `operator:export` | 导出密探 v2 |
| `operator:scan:write` | 密探 v3 自动采集 preview/commit |

## 4. OpenAPI 数据端点

| 方法与路径 | scope | 请求/响应 |
|---|---|---|
| `GET /open-api/inventory/account` | 有效 Token | Token 绑定账号 |
| `POST /open-api/inventory/import` | `inventory:write` | 原始库存 v2 / 导入结果 |
| `GET /open-api/inventory/export` | `inventory:export` | `include,from,to` / 原始库存 v2 |
| `GET /open-api/operator/account` | 有效 Token | Token 绑定账号 |
| `POST /open-api/operator/import` | `operator:write` | 原始密探 v2 / 导入结果 |
| `GET /open-api/operator/export` | `operator:export` | 原始密探 v2 |
| `POST /open-api/operator/scan-import/preview` | `operator:scan:write` | 原始密探 v3 / preview |
| `POST /open-api/operator/scan-import/commit` | `operator:scan:write` | 原始密探 v3 / commit |

OpenAPI URL 不传 `account_id` query。v2 文档内仍需使用 Token 绑定账号 ID；v3 scan 文档的来源 ID 可为本地引用，但只能有一个来源，服务端会强制映射。

## 5. 密探 v3 包装体

浏览器 preview/commit 可提交：

```json
{
  "document": {"format":"myshare-operator-exchange","version":3,"accounts":[],"records":[]},
  "account_mapping": {"source-account":"acc_xxx"},
  "confirm_review": false
}
```

- `account_mapping` 把文档来源账号映射到用户拥有的目标账号。
- preview 阶段通常保持 `confirm_review=false`。
- 用户检查 review 项并明确确认后，commit 才使用 `confirm_review=true`。
- OpenAPI scan 端点接收原始 v3 文档，不接收此包装体。

## 6. HTTP 与重试

- 2xx：请求已按响应统计处理；仍应查看每项 status/warnings。
- 401：Token/JWT 缺失、无效或已撤销。
- 403：scope 不足或文档越过绑定账号。
- 409：同一 `record_id` 正文不一致；不能用新 ID 静默绕过。
- 422：Schema、目录、游戏、映射或业务约束不通过。
- 429：Token 等资源达到限额。

只有连接中断、超时或可重试的 5xx 才应原样重试。重试必须保留同一文档和 `record_id`。

