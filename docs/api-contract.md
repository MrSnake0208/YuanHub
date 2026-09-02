# BackEndV3-Share API 接口契约（前端接入参考）

> 后端源码基线：`BackEndV3-Share` commit `d5a4508`（2026-08-30），并包含当前工作区反馈附件与操作身份实现。
> 本文覆盖 YuanHub 当前使用的接口，以及同一后端已提供的账号事件、第三方 OpenAPI、密探管理和广陵账房接口。
> 后端继续演进后，以源码与 Swagger 为最终依据，并同步更新本文顶部 commit。

## 1. 基础约定

### 1.1 地址与调试

- 后端本地地址：`http://localhost:8080`，无 context-path。
- 前端通过 `YuanHub/.env` 中的 `VITE_API_BASE` 配置 API 地址；未配置时使用当前站点地址。
- Swagger UI：`http://localhost:8080/swagger-ui/index.html`。
- OpenAPI JSON：`http://localhost:8080/v3/api-docs`。
- CORS 当前为 `allowedOriginPatterns=*` 且允许 credentials；生产环境仍建议收敛来源。

### 1.2 JSON、时间与字段命名

- 普通请求使用 `Content-Type: application/json`；头像和反馈附件上传使用 `multipart/form-data`。
- Jackson 全局采用 `SNAKE_CASE`，普通请求和响应字段使用 `snake_case`。
- 时间字段为 ISO-8601/RFC 3339 字符串，例如 `2026-08-24T08:00:00Z`。
- `Instant` 响应通常为 UTC；查询参数 `from`、`to` 接受带时区的 RFC 3339 时间。
- 密探 v3 交换文档严格使用 [`operator-growth-exchange-v3.schema.json`](./schemas/operator-growth-exchange-v3.schema.json) 中的字段名。
- 少量历史 DTO 有显式字段名，不遵循全局转换：
  - 密探 v2 导入 entry 使用 `subProf`、`starLevel`、`starStones`；
  - 管理端目录写请求使用 `subProf`、`starStones`、`spOf`，`specialOddityName` 与 `special_oddity_name` 均可读取；
  - 对应响应仍按全局规则输出 `sub_prof`、`star_level`、`star_stones`、`sp_of`。

### 1.3 响应与错误

普通成功响应包装：

```json
{
  "status_code": 200,
  "message": null,
  "data": {}
}
```

普通业务失败包装：

```json
{
  "status_code": 400,
  "message": "错误提示"
}
```

库存、统一账号、密探及其 OpenAPI 的领域错误使用同一 envelope；库存/账号可带 `record_id`、`entry_id`，密探还可带 `operator_id`、`field_path`，无值字段可能省略：

```json
{
  "error": {
    "code": "schema_validation_failed",
    "message": "错误说明",
    "record_id": null,
    "entry_id": null,
    "operator_id": null,
    "field_path": null
  }
}
```

注意：

- 前端必须优先以 `status_code` 判断普通包装的业务成功，不能只看 `response.ok`。用户、帖子、账房等传统端点的业务失败可能仍是 HTTP 200，但响应体 `status_code != 200`。
- 库存、账号、密探和 OpenAPI Token 的专用异常处理通常会让 HTTP 状态与错误状态一致。
- 未认证访问 `/v1/inventory/**` 返回 HTTP 401 的库存错误包装；其他 JWT 端点通常返回 HTTP 401 的普通包装。
- 库存和密探导出直接返回交换文档，不套 `ApiResult`。
- SSE 返回 `text/event-stream`，不套 JSON 包装。

常见领域状态码：

| HTTP | 含义 |
|---|---|
| 400 | JSON 无效或传统端点参数/业务校验失败 |
| 401 | JWT/OpenAPI Token 缺失、无效或过期 |
| 403 | 权限不足、账号映射越权 |
| 404 | 账号、记录、密探、Token 或方案不存在；部分越权查询也统一返回 404 |
| 409 | 幂等键冲突、revision 冲突、重复记录内容冲突、资源上限 |
| 422 | 库存/密探 Schema、字段语义或查询参数校验失败 |
| 429 | OpenAPI Token 或账房方案数量达到上限等限额错误 |

### 1.4 认证类型

#### 登录 JWT

请求头：

```http
Authorization: Bearer <access-token>
```

- access token 有效期：21600 秒（6 小时）。
- refresh token 有效期：604800 秒（7 天）。
- refresh token 签发后 5 分钟内刷新会复用原 refresh token，否则签发新的 refresh token。
- `/user/login`、`/user/register`、`/user/sendRegistrationToken` 是 anonymous-only；已认证请求不应携带 JWT 调用它们。

#### 第三方 OpenAPI Token

请求头格式相同，但 token 来自 `POST /user/open-api/token`：

```http
Authorization: Bearer <open-api-token>
```

- OpenAPI Token 绑定一个统一子账号，由 scopes 控制能力。
- Token 当前无自动过期时间，删除 Token 或删除绑定账号时立即撤销。
- 每个子账号最多 5 个 OpenAPI Token。
- OpenAPI 数据接口不能使用普通 JWT 代替 OpenAPI Token。

### 1.5 公开接口

无需 JWT 的主要接口：

- `GET /`、`GET /version`
- 用户登录、注册、验证码、密码重置、刷新、公开信息和搜索
- `GET /hub/post/**`
- `GET /v1/inventory/catalog`
- `GET /v1/operator/catalog`
- `GET /avatar/**`
- `GET /user/open-api/permissions`
- `/open-api/**` 在 Spring Security 层公开，但控制器内部强制验证 OpenAPI Token

## 2. 用户接口（/user）

### 2.1 登录与注册

#### POST /user/login

匿名接口。

请求：

```json
{
  "email": "xx@example.com",
  "password": "password"
}
```

成功 `data`：

```json
{
  "token": "<access-token>",
  "valid_before": "2026-08-24T14:00:00Z",
  "valid_after": "2026-08-24T08:00:00Z",
  "refresh_token": "<refresh-token>",
  "refresh_token_valid_before": "2026-08-31T08:00:00Z",
  "refresh_token_valid_after": "2026-08-24T08:00:00Z",
  "user_info": {
    "id": "user-id",
    "user_name": "用户名",
    "activated": true,
    "following_count": 0,
    "fans_count": 0
  }
}
```

常见失败：401 `用户不存在或者密码错误`；401 `用户未启用`。

#### POST /user/sendRegistrationToken

匿名接口。请求：`{"email":"xx@example.com"}`。

- 邮件验证码有效期 600 秒。
- 重发间隔 60 秒；过快返回 403 `发送验证码的请求至少需要间隔 60 秒`。
- 用户已存在返回 400 `用户已存在`。
- 本地 `debug.email.no-send=true` 时验证码只写后端日志。

#### POST /user/register

匿名接口。

```json
{
  "email": "xx@example.com",
  "user_name": "用户名",
  "password": "password",
  "registration_token": "验证码"
}
```

- `user_name` 长度 4..24。
- `password` 长度 8..32。
- `registration_token` DTO 可空，但实际注册必须通过验证码校验，成功后验证码被消费。
- 成功 `data` 为 `MaaUserInfo`。

### 2.2 密码与 Token

| 方法与路径 | 认证 | 请求 | 成功 data |
|---|---|---|---|
| `POST /user/password/reset_request` | 公开 | `{email}` | 无业务数据 |
| `POST /user/password/reset` | 公开 | `{email,active_code,password}` | 无业务数据 |
| `POST /user/refresh` | 公开 | `{refresh_token}` | 与登录成功相同 |
| `POST /user/update/password` | JWT | `{original_password,new_password}` | 无业务数据 |

补充规则：

- 重置验证码错误返回 401 `验证码错误`；邮箱不存在返回 404 `找不到用户`。
- `new_password` 长度 8..32。
- 当前密码错误、缺少原密码或 10 分钟内修改过于频繁均返回业务错误。

### 2.3 用户信息

| 方法与路径 | 认证 | 参数/请求 | 成功 data |
|---|---|---|---|
| `GET /user/info` | 公开 | query `userId` | `MaaUserInfo` |
| `GET /user/search` | 公开 | query `userName,page=1,size=10` | `MaaUserInfo[]` |
| `POST /user/update/info` | JWT | `{user_name}` | 无业务数据 |

- 搜索只返回已激活用户，`size <= 50`。
- 用户名长度 4..24；重名返回 400 `用户名已存在,请重新取个名字吧`。

## 3. 统一子账号（/v1/accounts）

> 一个子账号代表一个游戏账号，库存、密探、特别关注、养成目标和 OpenAPI Token 共用。旧地址 `/v1/inventory/accounts`、`/v1/operator/accounts` 已删除。

所有 CRUD 与 SSE 均需 JWT。

| 方法与路径 | 请求 | 成功 data |
|---|---|---|
| `POST /v1/accounts` | `{name,game?}` | 账号对象 |
| `GET /v1/accounts` | 无 | 账号对象数组，按创建时间升序 |
| `PATCH /v1/accounts/{accountId}` | `{name?,game?}` | 更新后的账号对象 |
| `DELETE /v1/accounts/{accountId}` | 无 | `true` |
| `GET /v1/accounts/{accountId}/events` | `Accept: text/event-stream` | SSE 流 |

账号对象：

```json
{
  "id": "acc_0123456789abcdef0123456789abcdef",
  "name": "大号",
  "game": "代号鸢",
  "created_at": "2026-08-24T08:00:00Z",
  "updated_at": "2026-08-24T08:00:00Z"
}
```

规则：

- `name` 长度 1..64、不可为空白，同一用户内不可重名。
- `game` 只允许 `代号鸢`、`如鸢`；创建时缺省为 `代号鸢`。
- PATCH 至少提供一个字段。
- 每个用户最多 10 个子账号，超限为 409 `account_limit_reached`。
- 删除账号会级联删除库存、密探、特别关注、标注、目标及全部绑定 Token，不可恢复。
- 账号不存在或不属于当前用户统一返回 404 `account_not_found`。

### 3.1 账号 SSE

浏览器原生 `EventSource` 不能设置 Authorization，前端使用带 JWT header 的 `fetch` 读取流。连接不补发历史事件；服务端约每 15 秒发送 keepalive comment，并在首次连接建议 3000ms 重连。

当前事件名：

#### operator_scan_import

由 OpenAPI 密探自动采集 commit 产生：

```json
{
  "event_id": "uuid",
  "account_id": "acc_xxx",
  "operator_id": "char_001_yangxiu",
  "record_id": "scanner:record-id",
  "status": "accepted",
  "revision": 2,
  "stale": false,
  "observed_status": "valid",
  "warnings": [],
  "blocking_errors": [],
  "occurred_at": "2026-08-24T08:00:00Z"
}
```

#### inventory_import

由 OpenAPI 库存导入产生；`records[].acquisition_channel` 已包含在最新事件中：

```json
{
  "event_id": "uuid",
  "account_id": "acc_xxx",
  "accepted": 1,
  "duplicates": 0,
  "history_only": 0,
  "superseded": 0,
  "records": [{
    "record_id": "producer:record-id",
    "record_type": "reward_delta",
    "entity_type": "item",
    "acquisition_channel": "派遣-洛阳",
    "entries": [{"id":"baijinbi","count":20}]
  }],
  "occurred_at": "2026-08-24T08:00:00Z"
}
```

#### operator-upgrade

由快捷提升 execute 成功产生：

```json
{
  "account_id": "acc_xxx",
  "transaction_id": "transaction-id",
  "operator_id": "char_001_yangxiu",
  "dimension": "level",
  "from": 80,
  "to": 90,
  "consumed": [],
  "operator_revision": 3,
  "inventory_revision": 8,
  "occurred_at": "2026-08-24T08:00:00Z"
}
```

## 4. 库存接口（/v1/inventory，交换协议 v2）

> 面向第三方开发者的交换规范、Schema 和可复制示例统一见 [`exchange-specs/`](./exchange-specs/README.md)。

除 catalog 外均需 JWT；`user_id` 永远取自 JWT，私有查询必须传 `account_id`。

### 4.1 查询、导入与导出

| 方法与路径 | 参数/请求 | 成功 data/响应 |
|---|---|---|
| `GET /v1/inventory/catalog` | 无，公开 | `{format,version,catalog_version,entities}` |
| `POST /v1/inventory/import` | 完整库存交换文档 v2 | `{accepted,duplicates,history_only,superseded,warnings}` |
| `GET /v1/inventory/current` | `account_id` 必填；`entity_type=item\|agent` 可选 | 当前库存数组 |
| `GET /v1/inventory/acquired` | `account_id,entity_type,from,to` 均必填 | 时段获得量，区间 `[from,to)` |
| `GET /v1/inventory/records` | `account_id` 必填；`entity_type,from,to,cursor,limit` 可选 | `{items,next_cursor}` |
| `DELETE /v1/inventory/records/{recordId}` | query `account_id` | `true`，删除后重放剩余记录 |
| `GET /v1/inventory/export` | `account_id` 或 `scope=all`；`include,from,to` 可选 | 原始交换文档，无 ApiResult |

`current` 单项：

```json
{
  "user_id": "user-id",
  "account_id": "acc_xxx",
  "entity_type": "item",
  "full_baseline_at": "2026-08-24T08:00:00Z",
  "entries": {
    "baijinbi": {"count":100,"listed_baseline_at":null}
  },
  "updated_at": "2026-08-24T08:00:00Z"
}
```

`acquired` 响应：

```json
{
  "account_id": "acc_xxx",
  "entity_type": "item",
  "from": "2026-08-01T00:00:00Z",
  "to": "2026-09-01T00:00:00Z",
  "acquired": {"baijinbi":120}
}
```

`records.items[]` 包含：

```json
{
  "account_id": "acc_xxx",
  "record_id": "producer:record-id",
  "record_type": "reward_delta",
  "entity_type": "item",
  "acquisition_channel": "派遣-洛阳",
  "stamina_cost": 20,
  "effective_at": "2026-08-24T08:00:00Z",
  "received_at": "2026-08-24T08:00:01Z",
  "stock_effect": "applied",
  "transaction_id": null,
  "entries": [{"id":"baijinbi","name":"白金币","count":20}]
}
```

- `limit` 默认为 50，范围 1..100。
- 记录按 `effective_at` 倒序，使用不透明 `next_cursor` 翻页。
- `include` 默认为 `current`，也可为 `current,rewards`；附带 rewards 时可用 `from/to` 限制区间。

### 4.2 密探特别关注

| 方法与路径 | 参数 | 成功 data |
|---|---|---|
| `GET /v1/inventory/agent-favorites` | query `account_id` | `{account_id,agent_ids}` |
| `PUT /v1/inventory/agent-favorites/{agentId}` | query `account_id`，无 body | `{account_id,agent_id,favorite:true}` |
| `DELETE /v1/inventory/agent-favorites/{agentId}` | query `account_id`，无 body | `{account_id,agent_id,favorite:false}` |

- 三个接口只接受普通 JWT，不接受 OpenAPI Token，PUT/DELETE 幂等。
- `agent_ids` 去重并按完整 ID 升序返回，不代表发布顺序。
- 状态不进入库存的 current/acquired/records/export，也不进入库存交换档案；密探 v3 导出可另行包含 favorite。
- 常见错误：404 `account_not_found`；422 `invalid_agent_id`、`unknown_agent`。
- YuanHub 的库存页和密探页均已接入特别关注。

### 4.3 库存交换文档 v2

```json
{
  "format": "myshare-inventory-exchange",
  "version": 2,
  "exported_at": "2026-08-24T08:00:00Z",
  "catalog_version": "2026-08-24",
  "producer": {"platform":"myshare","version":"5"},
  "accounts": [{"id":"acc_xxx","name":"大号"}],
  "records": [{
    "account_id": "acc_xxx",
    "record_id": "producer:record-id",
    "record_type": "reward_delta",
    "entity_type": "item",
    "acquisition_channel": "派遣-洛阳",
    "stamina_cost": 20,
    "effective_at": "2026-08-24T08:00:00Z",
    "entries": [{"id":"baijinbi","name":"白金币","count":20}]
  }]
}
```

关键规则：

- 顶层不得携带 `user_id`；`records` 数量 1..1000。
- `record_type` 只允许 `reward_delta`、`stock_snapshot`。
- `entity_type` 只允许 `item`、`agent`。
- `stock_snapshot` 必须携带 `snapshot_scope=full|listed`；`reward_delta` 不携带该字段。
- `acquisition_channel` 可选，长度 1..64；推荐稳定值包括 `背包`、`据点情报`、`派遣` 及更细分的派遣渠道。
- 仅 `record_type=reward_delta` 且 `acquisition_channel` 包含“派遣”时 `stamina_cost` 必填；其他记录不得携带。
- `reward_delta` 的 count 必须大于 0；快照 count 可为 0。
- 心纸手动库存使用 `record_type=stock_snapshot`、`entity_type=agent`。YuanHub 已通过库存页接入手动编辑。
- `full` 替换该账号对应实体类型的完整库存；`listed` 只覆盖列出的条目。
- 业务只信任 `id` 与 `count`；`name` 是展示冗余，不能通过库存文档修改公共目录。

## 5. 密探接口（/v1/operator）

除 catalog 外均需 JWT；领域错误为 `{error:{code,message,record_id?,entry_id?,operator_id?,field_path?}}`。

### 5.1 公共图鉴

#### GET /v1/operator/catalog

公开接口。成功 `data`：

```json
{
  "format": "myshare-operator-catalog",
  "version": 1,
  "catalog_version": "2026-08-24",
  "operators": [{
    "id": "char_001_yangxiu",
    "name": "杨修",
    "alias": null,
    "rarity": 5,
    "special_oddity_name": "免伤值",
    "oddity_schema": {
      "attack": {"name":"攻击力","max":500},
      "hp": {"name":"生命值","max":2600},
      "special": {"name":"免伤值","max":15}
    },
    "incomplete_fields": [],
    "prof": ["阳"],
    "sub_prof": [],
    "games": ["代号鸢","如鸢"],
    "discs": [],
    "sp_of": null,
    "avatar": "/avatar/char_001_yangxiu.webp"
  }]
}
```

- 公共图鉴不返回用户养成，也不返回目录 `star_stones` 模板。
- `avatar` 是相对路径，前端需拼接 API base URL。
- `special_oddity_name` 可在存量迁移期为 null；此时 `incomplete_fields` 含 `special_oddity_name`。
- 奇闻稳定键始终为 `attack`、`hp`、`special`。上限：3 星 `300/1560/9`、4 星 `305/1820/11`、5 星 `500/2600/15`。

### 5.2 当前养成与记录

| 方法与路径 | 参数/请求 | 成功 data/响应 |
|---|---|---|
| `GET /v1/operator/current` | query `account_id` 必填，`game` 可选 | 当前养成数组 |
| `PATCH /v1/operator/current/{operatorId}` | query `account_id,game` 均必填；body 见下 | 更新后的 entry |
| `GET /v1/operator/records` | `account_id` 必填；`game,from,to,cursor,limit` 可选 | `{items,next_cursor}` |
| `DELETE /v1/operator/records/{recordId}` | query `account_id` | `true`，删除后重放重建 |

当前养成 entry 主要字段：

```json
{
  "elite": 17,
  "star_level": 31,
  "level": 100,
  "discs": [],
  "star_stones": [],
  "disc_loadouts": [],
  "combat_stats": null,
  "revision": 3,
  "listed_baseline_at": null,
  "updated_at": "2026-08-24T08:00:00Z"
}
```

PATCH 使用乐观锁，`expected_revision` 与 `reason` 必填：

```json
{
  "level": 100,
  "elite": 17,
  "star_level": 31,
  "disc_loadouts": [],
  "star_stones": [
    {"name":"攻击力","type":"main1","level":60}
  ],
  "combat_stats": {
    "manual_attack": 12000,
    "display_mode": {"attack":"manual"},
    "oddities": {"attack":{"current":500}}
  },
  "expected_revision": 2,
  "reason": "manual_correction"
}
```

- 可更新字段：`level`、`elite`、`star_level`、`disc_loadouts`、`star_stones`、`combat_stats`。
- `reason` 只允许 `manual_correction`、`local_migration`。
- `level` 范围 0..100，`elite` 范围 0..17。
- 普通密探 `star_level` 为 0..31；SP 密探为 0..5。
- `disc_loadouts` 最多两套；`star_stones` 是六槽完整替换，缺失保留，空数组清空。
- 六槽只允许 `main1..main3`、`assist1..assist3`。
- entry 不存在时只允许 `expected_revision=0` 创建。
- revision 冲突返回 HTTP 409 `operator_revision_conflict`。
- `records.limit` 默认为 50，范围 1..100。

### 5.3 主观标注与养成目标

| 方法与路径 | 参数/请求 | 成功 data |
|---|---|---|
| `GET /v1/operator/annotations` | query `account_id` | `{account_id,items}` |
| `PUT /v1/operator/annotations/{operatorId}` | query `account_id`；body `{growth_state?,note?,expected_revision}` | 标注对象 |
| `GET /v1/operator/growth-targets` | query `account_id` | `{account_id,items}` |
| `PUT /v1/operator/growth-targets/{operatorId}` | query `account_id`；body `{level?,elite?,star_level?,heart_paper?,targets?,expected_revision}` | 目标对象/删除结果 |
| `DELETE /v1/operator/growth-targets/{operatorId}` | query `account_id,expected_revision` | `true` |

标注对象：`{operator_id,growth_state,note,revision,updated_at}`。`growth_state` 只允许 `active`、`graduated`、`skip`；未返回的密探默认 `active`。`note=null` 明确清除备注，最长 1000 字符。

目标对象：`{operator_id,level,elite,star_level,heart_paper,revision,updated_at}`。字段缺失保留旧值；`targets=null` 明确删除整组目标并返回空 data，YuanHub 前端清除时应优先调用 DELETE。`level` 为 0..100，`elite` 为 0..17，`star_level` 为 0..31，`heart_paper` 为 0..1000000。所有写操作使用 `expected_revision` 乐观锁。

### 5.4 快捷提升

| 方法与路径 | 请求 | 成功 data |
|---|---|---|
| `POST /v1/operator/upgrades/preview` | 提升请求 | 预览对象，不写数据库 |
| `POST /v1/operator/upgrades/execute` | 执行请求 + `Idempotency-Key` header | 密探更新与库存扣减结果 |

preview 请求：

```json
{
  "account_id": "acc_xxx",
  "game": "代号鸢",
  "operator_id": "char_001_yangxiu",
  "dimension": "level",
  "target": 90,
  "expected_operator_revision": 2
}
```

`dimension` 只允许 `level`、`elite`、`huaji`。preview 返回：

```json
{
  "available": true,
  "dimension": "level",
  "from": 80,
  "to": 90,
  "requirements": [],
  "experience_required": 0,
  "experience_overflow": 0,
  "money_required": 0,
  "blocking_reasons": [],
  "operator_revision": 2,
  "inventory_revision": 7,
  "preview_token": "token",
  "expires_at": "2026-08-24T08:01:00Z"
}
```

execute body 在 preview 请求基础上增加 `expected_inventory_revision`、`preview_token`；header `Idempotency-Key` 长度 1..128。成功返回 `{transaction_id,operator,consumed,inventory_revision,created_at}`，并产生 `operator-upgrade` SSE。

常见 409：`operator_state_stale`、`inventory_state_stale`、`insufficient_inventory`、`idempotency_conflict`。过期或不匹配的预览返回 422 `preview_expired`。

### 5.5 导入与导出

| 方法与路径 | 请求/参数 | 成功 data/响应 |
|---|---|---|
| `POST /v1/operator/import` | v2 文档，或 v3 浏览器导入包装 | v2 或 v3 commit 结果 |
| `POST /v1/operator/import/preview` | v3 浏览器导入包装 | v3 preview 结果，不写数据 |
| `GET /v1/operator/export` | `account_id` 或 `scope=all`；`version=2|3` | 原始交换文档 |

v2 直接提交 `myshare-operator-exchange@2`；返回 `{accepted,duplicates,superseded,warnings}`。

v3 浏览器导入通常使用包装体：

```json
{
  "document": {"format":"myshare-operator-exchange","version":3,"accounts":[],"records":[]},
  "account_mapping": {"source-account":"acc_xxx"},
  "confirm_review": false
}
```

来源账号 id 已经是当前 JWT 用户所拥有的目标账号 id 时，也可直接提交原始 v3 文档；需要跨账号映射或确认 review 时使用上述包装体。

v3 preview 返回：

```json
{
  "format": "myshare-operator-import-preview",
  "version": 1,
  "accepted": 0,
  "partial": 0,
  "review": 0,
  "rejected": 0,
  "unchanged": 0,
  "items": []
}
```

v3 commit 计数和 `items` 结构相同，但不含 preview 顶层 format/version。`items[]` 包含 `account_id,operator_id,record_id,status,changes,warnings,blocking_errors,stale,target_revision,revision,observed_status`。

完整 v3 结构与语义以以下文件为准：

- [`operator-growth-data-exchange-protocol-v3.md`](./operator-growth-data-exchange-protocol-v3.md)
- [`operator-growth-exchange-v3.schema.json`](./schemas/operator-growth-exchange-v3.schema.json)
- [`examples/operator-growth-exchange-v3/`](./examples/operator-growth-exchange-v3/)

`version=3` 导出包含客观档案、annotation、favorite 与 targets；默认 `version=2`。

## 6. 反馈工单与权限管理（/v1/reports）

反馈工单接口需要登录 JWT。个人反馈页面固定使用 mine=true，反馈工作台固定使用 mine=false；后端会按归一化后的 category 校验管理范围，不能依赖前端隐藏筛选项提供安全保障。

| 方法与路径 | 认证 | 请求 | 成功 data |
|---|---|---|---|
| POST /v1/media/upload | JWT | multipart field `file` | `{id,kind,name,url,mime,size,created_at}` |
| POST /v1/reports | JWT | {type,category,content,media_ids?,client_info_consent?} | 新工单 |
| GET /v1/reports | JWT | page,pageSize,status,type,category,mine,q | {reports,total,page,page_size,mine,...} |
| GET /v1/reports/{id} | JWT | 无 | 工单详情，含 viewer_is_reporter/viewer_can_manage |
| POST /v1/reports/{id}/messages | JWT | {content,media_ids?,actor_mode?} | 更新后的工单 |
| GET /v1/reports/{id}/attachments/{mediaId} | JWT | 无 | 原始文件二进制 |
| PATCH /v1/reports/{id}/status | JWT | {status,actor_mode?} | 更新后的工单 |
| GET /v1/reports/access | JWT | 无 | 当前用户的接收/管理板块及超级管理员标识 |
| GET /v1/admin/feedback-access | 超级管理员 | 无 | 授权列表 |
| GET /v1/admin/feedback-access/users | 超级管理员 | q,page,size，q 非空，size 1..10 | 已激活用户候选 {id,user_name,email,activated}[] |
| PUT /v1/admin/feedback-access/{userId} | 超级管理员 | {receive_categories,manage_categories} | 授权结果 |
| DELETE /v1/admin/feedback-access/{userId} | 超级管理员 | 无 | 无业务数据 |

候选用户接口是反馈权限配置专用接口，不扩展公开 /user/search 或 MaaUserInfo。邮箱只用于超级管理员检索和确认页面，授权文档仍以 user_id 为主键；保存时后端会重新查询用户并拒绝不存在或未激活用户。搜索词按普通文本匹配，不作为原始正则表达式执行。

旧授权字段 receive_areas/manage_areas 和旧反馈字段 area 继续兼容读取；新前端优先使用 receive_categories/manage_categories 与 category。

消息追加和状态变更的 `actor_mode` 只允许 `REPORTER` 或 `ADMIN`，它表示本次操作意图而不是权限凭据。
后端会重新校验：`REPORTER` 必须是工单提交人，`ADMIN` 必须拥有归一化后 category 的管理权限，越权返回业务
`status_code=403`。兼容期允许省略该字段，但只在身份唯一时推断；同时是提交人和管理员时缺省返回业务
`status_code=400`，非法值同样返回 400。YuanHub 的个人入口固定使用 `appendMyFeedbackMessage` /
`updateMyFeedbackStatus`，管理工作台固定使用 `appendManagedFeedbackMessage` / `updateManagedFeedbackStatus`，
页面参数不能覆盖包装函数注入的身份。

详情中的 `quota.pending_count` 和 `quota.can_append` 始终表示提交人连续补充配额；管理工作台是否可回复应使用
`viewer_can_manage && status == OPEN`。`viewer_is_reporter` 与 `viewer_can_manage` 可以同时为 true。管理员模式更新
`sender_kind`、管理员摘要和处理字段，并在实际变化时通知提交人；管理员处理自己的工单保留管理员语义，但不生成
自我通知。前端归一化消息时以 `sender_kind` 为准，只有该 canonical 字段缺失时才回退旧 `is_admin`。

反馈上传支持 JPG/JPEG、PNG、WebP、TXT、LOG、JSON、PDF、ZIP，单个附件最大 10 MiB；
每条消息的截图与普通文件合计最多 3 个，创建和追加仍只提交一个 `media_ids` 数组。
新建反馈、用户追加和管理员回复均可通过选择、拖拽或在正文输入框粘贴来添加图片和普通文件；
纯文本粘贴不会被附件逻辑拦截。
ZIP 的 `application/x-zip-compressed` 会归一化为 `application/zip`；TXT/LOG 可接受浏览器未声明 MIME、
`text/plain`、`text/x-log` 或 `application/octet-stream`，并统一保存为 `text/plain`；
服务端仍会复核扩展名、MIME、文件头或文本前缀。

上传响应的 `kind` 为 `IMAGE` 或 `FILE`。图片 `url` 是原有绝对公开地址；普通文件 `url=null`。
工单详情中图片继续位于 `messages[].images`，普通文件位于 `messages[].files`：

```json
{
  "id": "med_log",
  "name": "error.log",
  "mime": "text/plain",
  "size": 2048,
  "download_url": "/v1/reports/rpt_xxx/attachments/med_log"
}
```

历史消息缺少 `files` 时按空数组处理。普通文件不映射到 `/media/**`，下载接口会同时校验工单查看权限、
消息文件引用、媒体元数据和磁盘文件；成功响应带 `Content-Disposition: attachment`、`nosniff` 与
`Cache-Control: private, no-store`，403/404 错误继续使用 JSON `ApiResult`。前端必须通过带 JWT 的 Blob 请求下载，
不能把 Bearer Token 放入 URL 或使用普通匿名链接。

### 6.1 站内通知（/v1/notifications）

通知端点需要登录 JWT。后端响应使用 `snake_case`；YuanHub 的 `src/api/notifications.js` 在边界处统一归一化为
`id`、`kind`、`title`、`body`、`refType`、`refId`、`readAt`、`createdAt`，页面不得再次读取 snake_case 字段。

| 方法与路径 | 请求 | 成功 data |
|---|---|---|
| GET /v1/notifications | page,pageSize,unreadOnly | `{notifications,total,unread_count}` |
| GET /v1/notifications/unread-count | 无 | `{count}` |
| PATCH /v1/notifications/{id}/read | 无 | 已读后的通知对象 |
| PATCH /v1/notifications/read-all | 无 | `{updated}` |

通知 `ref_type=FEEDBACK` 且存在 `ref_id` 时，前端可显示关联反馈编号。`FEEDBACK_REPLY` 和
`FEEDBACK_STATUS_UPDATED` 只跳转当前用户反馈；`FEEDBACK_ASSIGNED` 和 `FEEDBACK_MESSAGE_FROM_REPORTER` 只有具备 `manageAreas` 或超级管理员能力时才跳转
反馈管理页。仅具备 `receiveAreas` 的用户仍可查看自己的通知及关联编号，但不会获得反馈管理或详情访问权限。

反馈中心通过分页读取 `unreadOnly=true` 的通知，将去重后的 `ref_id` 映射到具体用户反馈行。打开反馈详情成功后，
前端只调用既有单条已读端点处理同一 `ref_id` 的通知；接口失败时保留该反馈的未读标识。通知未读总数以服务端返回值为准。

## 7. 密探公共图鉴管理（/v1/admin/operator-catalog）

全部接口需要 JWT 且用户 `status >= 2`；否则返回 403 `forbidden`。

| 方法与路径 | 请求 | 成功 data |
|---|---|---|
| `GET /v1/admin/operator-catalog` | 无 | 管理端目录数组 |
| `POST /v1/admin/operator-catalog` | 目录写对象 | 新目录对象 |
| `PUT /v1/admin/operator-catalog/{operatorId}` | 完整目录写对象 | 更新后的目录对象 |
| `DELETE /v1/admin/operator-catalog/{operatorId}` | 无 | `true` |
| `PUT /v1/admin/operator-catalog/{operatorId}/avatar` | multipart field `file` | 更新后的目录对象 |
| `DELETE /v1/admin/operator-catalog/{operatorId}/avatar` | 无 | 更新后的目录对象 |

目录写对象主要字段：

```json
{
  "id": "char_999_test",
  "name": "测试密探",
  "alias": null,
  "rarity": 4,
  "specialOddityName": "免伤值",
  "prof": ["阳"],
  "subProf": [],
  "games": ["代号鸢"],
  "discs": [{"ot_name":"命盘词条"}],
  "starStones": [{"name":"主星石","type":"main"}],
  "spOf": null
}
```

- `id` 必须匹配 `char_[A-Za-z0-9_]+`，PUT 时 path id 与 body id 必须一致。
- `rarity` 只允许 3..5。
- `specialOddityName` 新建必填，trim 后长度 1..32；更新时缺失或 null 表示保留旧值。
- `games` 必须来自 `代号鸢`、`如鸢`。
- 头像只接受非空 WebP，最大 500KB；上传同 id 会覆盖。
- 目录名称、稀有度等有效修改会刷新 `catalog_version` 和公共目录缓存。

## 8. OpenAPI Token 管理（/user/open-api）

| 方法与路径 | 认证 | 请求 | 成功 data |
|---|---|---|---|
| `GET /user/open-api/permissions` | 公开 | 无 | `[{scope,description}]` |
| `POST /user/open-api/token` | JWT | `{account_id,scopes,remark}` | 新 Token，明文仅返回一次 |
| `GET /user/open-api/tokens` | JWT | 无 | 当前用户 Token 列表，不含明文 |
| `DELETE /user/open-api/tokens/{tokenId}` | JWT | 无 | 无业务数据 |

当前 scope：

| scope | 用途 |
|---|---|
| `inventory:read` | 库存读取 |
| `inventory:write` | 库存写入 |
| `inventory:export` | 库存导出 |
| `operator:read` | 密探读取 |
| `operator:write` | 密探 v2 写入 |
| `operator:export` | 密探 v2 导出 |
| `operator:scan:write` | 密探 v3 自动采集 preview/commit |

生成结果：

```json
{
  "token_id": "uuid",
  "token": "仅本次返回的明文",
  "account_id": "acc_xxx",
  "account_name": "大号",
  "remark": "采集器",
  "scopes": ["operator:scan:write"],
  "created_at": "2026-08-24T08:00:00Z"
}
```

- `scopes` 至少一个、不得重复、不得包含未知 scope。
- Token 列表按创建时间倒序。
- 生成达到每账号 5 个上限返回 HTTP 429。
- 删除不存在或不属于当前用户的 Token 返回 HTTP 404。

## 9. 第三方 OpenAPI 数据接口（/open-api）

全部使用 OpenAPI Token，URL query 不传 `account_id`；服务端使用 Token 绑定账号。v2 交换文档内部仍必须携带 `account_id`，且所有记录必须严格属于 Token 绑定账号，否则返回 403 `account_scope_mismatch`。

### 8.1 库存 OpenAPI

| 方法与路径 | scope | 参数/请求 | 成功 data/响应 |
|---|---|---|---|
| `GET /open-api/inventory/account` | 仅需有效 Token | 无 | Token 绑定账号 |
| `GET /open-api/inventory/current` | `inventory:read` | query `entity_type` 可选 | 当前库存数组 |
| `POST /open-api/inventory/import` | `inventory:write` | 库存交换文档 v2 | 导入结果；产生 `inventory_import` SSE |
| `GET /open-api/inventory/export` | `inventory:export` | `include=current|current,rewards`，`from/to` 可选 | 原始库存 v2 文档 |

### 8.2 密探 OpenAPI

| 方法与路径 | scope | 参数/请求 | 成功 data/响应 |
|---|---|---|---|
| `GET /open-api/operator/account` | 仅需有效 Token | 无 | Token 绑定账号 |
| `GET /open-api/operator/current` | `operator:read` | query `game` 可选 | 当前养成数组 |
| `POST /open-api/operator/import` | `operator:write` | 密探 v2 文档 | v2 导入结果 |
| `GET /open-api/operator/export` | `operator:export` | 无 | 原始密探 v2 文档 |
| `POST /open-api/operator/scan-import/preview` | `operator:scan:write` | 原始密探 v3 文档 | v3 preview 结果 |
| `POST /open-api/operator/scan-import/commit` | `operator:scan:write` | 原始密探 v3 文档 | v3 commit 结果；产生 `operator_scan_import` SSE |

自动采集限制：

- 只允许单来源 `operator_snapshot`。
- `source_kind=scan`、`snapshot_scope=listed`。
- 来源账号始终强制映射到 Token 绑定账号。
- 不接受 annotation/full/manual，不扣减库存。

## 10. 广陵账房方案（/hub/ledger/plan）

全部需 JWT，方案归属从 JWT 获取；不存在与越权统一返回业务 404。

| 方法与路径 | 请求/参数 | 成功 data |
|---|---|---|
| `POST /hub/ledger/plan` | 完整方案 | 全量方案 |
| `PUT /hub/ledger/plan/{id}` | 完整方案，整体替换 | 全量方案 |
| `GET /hub/ledger/plan/{id}` | 无 | 全量方案 |
| `GET /hub/ledger/plan` | query `version=daihao|ru` 可选 | 轻量方案数组 |
| `DELETE /hub/ledger/plan/{id}` | 无 | `true` |

请求主要结构：

```json
{
  "name": "抽卡规划",
  "version": "daihao",
  "exchange_rate": 7.2,
  "initial_points": 0,
  "cart_items": [{
    "content_id": 1,
    "quantity": 1,
    "package_snapshot": {
      "name": "礼包",
      "points": 100,
      "draws": 1,
      "limit": 1,
      "price_usd": 4.99
    }
  }],
  "custom_packages": []
}
```

- `name` 最长 50；`version` 只允许 `daihao`、`ru`。
- `cart_items` 最多 200，`custom_packages` 最多 50。
- `daihao` 礼包必须提供 `price_usd`；`ru` 礼包必须提供 `price_cny`，另一版本价格会被清空。
- 自定义礼包 id 由服务端重新生成；同名重复保留首个并回写购物车引用。
- 每用户最多 50 个方案。
- 创建、更新、删除限流为每 60 秒 10 次。
- 列表按 `updated_at` 倒序，且不含 `cart_items`、`custom_packages` 大明细。
- 全量响应包含 `{id,user_id,name,version,exchange_rate,initial_points,cart_items,custom_packages,summary,created_at,updated_at}`。
- `summary={total_cny,total_points,total_draws}`；`total_points` 不含 `initial_points`。

## 11. 其他现有后端接口

这些端点当前没有对应 YuanHub API 模块，但属于后端已实现契约。

### 10.1 系统

- `GET /`：公开健康提示，返回普通包装，message 为 `Share Server is Running`，data 为 null。
- `GET /version`：公开，返回 `{title,description,version,git}`。
- `GET /ready`：仅 local profile 的 readiness 检查，不应作为生产公共契约依赖。

### 10.2 Hub Post 示例业务

| 方法与路径 | 认证 | 请求/响应 |
|---|---|---|
| `POST /hub/post` | JWT | body `{title,content}`，返回帖子对象 |
| `GET /hub/post/{id}` | 公开 | 帖子对象 |
| `GET /hub/post/user/{userId}` | 公开 | 该用户帖子数组 |
| `GET /hub/post` | 公开 | 最近 50 条帖子 |

帖子对象：`{id,user_id,user_name,title,content,created_at}`；标题最长 100，内容最长 5000。

`/demo/**` 是后端示例接口，不纳入前端业务契约。

## 12. YuanHub 前端对应关系

| 模块 | 作用 |
|---|---|
| `src/api/request.js` | baseURL、JSON/multipart、JWT、401 refresh、raw 导出、错误提取 |
| `src/api/user.js` | 用户公开接口与反馈权限候选搜索 |
| `src/api/accounts.js` | 统一子账号 CRUD |
| `src/api/accountEvents.js` | 带 JWT 的 SSE 客户端 |
| `src/api/inventory.js` | 库存、特别关注、库存 OpenAPI 导入 |
| `src/api/operator.js` | 密探目录、养成、标注、目标、提升、导入导出和管理端 |
| `src/api/openApi.js` | OpenAPI Token 管理 |
| `src/api/ledger.js` | 广陵账房方案 CRUD |
| `src/api/feedback.js` | 个人反馈、反馈工作台、反馈权限管理与工单操作 |
| `src/store/auth.js` | 登录态、持久化、刷新和退出 |
| `src/store/accountEvents.js` | SSE 订阅、事件去重、通知与页面刷新 |

实现注意：

- `request(path,{auth:true})` 才自动携带登录 JWT；OpenAPI Token 需调用方显式设置 Authorization。
- `raw:true` 用于库存/密探导出，否则会错误地按 ApiResult 解包。
- `multipart:true` 上传头像时不要手动设置 `Content-Type`，由浏览器写 boundary。
- `request()` 抛出的错误保留 `status`、`code`、`payload`，revision/idempotency 分支应使用 `code` 判断。
- 401 自动刷新只针对 `auth:true` 的 JWT 请求；OpenAPI Token 401 不应触发用户 refresh。
- 切换子账号时必须清空旧账号的库存、密探、关注和事件状态后重新加载。

## 13. 更新检查清单

后端接口变更时至少检查：

- [ ] 更新本文顶部后端 commit 与日期
- [ ] 对照所有 Controller mapping，确认方法、path、公开/JWT/OpenAPI/Admin 权限
- [ ] 对照 request/response DTO，确认字段名、必填性、枚举、范围和 raw/ApiResult/SSE 包装
- [ ] 对照异常处理器，确认 HTTP 状态与错误 envelope
- [ ] 对照 `OpenApiPermission`，同步新增/删除 scope
- [ ] 对照 `AccountEventService.publish` 调用点，更新 SSE 事件名和 payload
- [ ] 同步 `src/api/*` 封装、页面调用和相关测试
- [ ] v3 变更同步协议文档、JSON Schema 与 examples
