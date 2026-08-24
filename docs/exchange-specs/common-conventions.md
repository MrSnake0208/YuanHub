# 数据交换公共约定

本文适用于库存 v2、密探 v2/v3 和公共目录 v1。单项协议另有更严格规定时，以单项协议为准。

## 1. JSON 与字段命名

- 文档编码为 UTF-8，媒体类型使用 `application/json`。
- 协议字段原则上使用 `snake_case`。
- 密探 v2 导入中的 `subProf`、`starLevel`、`starStones` 是历史兼容字段，必须保留该拼写；详见 [密探交换 v2](./operator-v2.md)。
- 不要发送 `null` 代替省略可选字段。只有密探 v3 Schema 明确允许的 `null` 才具有清除含义。
- 生产者不要依赖服务端忽略未知字段。密探 v3 与本目录 Schema 均按严格字段集合校验。

## 2. 顶层标识

交换文档以以下二元组判定协议：

```text
(format, version)
```

当前值：

| 文档 | `format` | `version` |
|---|---|---:|
| 库存交换 | `myshare-inventory-exchange` | 2 |
| 密探交换（兼容） | `myshare-operator-exchange` | 2 |
| 密探交换（推荐） | `myshare-operator-exchange` | 3 |
| 实体目录 | `myshare-entity-catalog` | 1 |
| 密探目录 | `myshare-operator-catalog` | 1 |
| 密探导入预览响应 | `myshare-operator-import-preview` | 1 |

不支持的版本必须失败，不能猜测字段含义后继续导入。

## 3. 时间

- `exported_at` 与 `effective_at` 使用 RFC 3339 / ISO-8601，必须带 `Z` 或 UTC 偏移。
- `exported_at` 表示文档生成时间；`effective_at` 表示业务记录生效时间。
- 合并顺序由 `effective_at` 决定，不由请求数组顺序或 `exported_at` 决定。
- 生产者应使用稳定、准确的业务时间；不要在重试时重写同一 `record_id` 的 `effective_at`。

## 4. 生产者

```json
{
  "producer": {
    "platform": "example-scanner",
    "version": "1.0.0"
  }
}
```

- `platform` 必填，匹配 `^[a-z0-9][a-z0-9._-]{0,63}$`。
- `version` 可选；出现时长度为 1..128。
- `platform` 应长期稳定并标识生产程序，不要填写用户名或设备密钥。

## 5. 账号与权限边界

- 文档中不携带 `user_id`；数据归属从 JWT 或 OpenAPI Token 决定。
- v2 文档的 `account_id` 必须是调用者拥有的 YuanHub 子账号 ID。
- 密探 v3 允许用本地来源 ID，但浏览器导入时必须通过 `account_mapping` 映射到调用者拥有的目标账号。
- OpenAPI Token 永远绑定一个子账号，文档不能越过该账号。越权文档返回 403 `account_scope_mismatch`。
- `accounts[].name` 仅供展示，不能创建、重命名或取得目标账号权限。

账号 ID 使用 `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`。

## 6. 记录 ID 与幂等

- `record_id` 由生产者生成，长度 1..128，并应在生产者命名空间内稳定唯一。
- 推荐形式：`<platform>:<业务类型>:<稳定事件或批次 ID>`。
- 对同一账号重复提交相同 `record_id` 与相同正文，服务端按重复记录处理，不重复应用。
- 同一账号、同一 `record_id` 的正文不同，返回 HTTP 409 冲突。
- 网络超时后应原样重试；不要只为重试生成新 `record_id`。

## 7. 公共目录与冗余名称

- 交换条目的 `id` 是业务主键，必须存在于对应公共目录，并适用于目标游戏。
- `name`、稀有度、职业等目录属性只是展示冗余，不能通过交换文档修改公共目录。
- 生产文档前应获取最新目录并记录 `catalog_version`；服务端仍会用导入时的当前目录重新验证。

## 8. 快照边界

- `listed`：只修改 `entries` 中列出的对象，未列出对象保持不变。
- `full`：表示该领域的完整基线，可能删除或恢复未列出的对象，因此只能在生产者确实完整遍历时使用。
- 空 `full` 快照表示“该领域当前为空”，具有清空语义。
- `listed` 快照必须至少有一条 entry。
- 密探 v3 的客观记录与主观标注记录是两个独立覆盖领域，不能互相清空。

## 9. 响应与错误

普通业务接口通常返回：

```json
{"success": true, "code": 200, "message": "success", "data": {}}
```

库存和密探导出是例外，直接返回原始交换文档。领域错误通常为：

```json
{
  "error": {
    "code": "schema_validation_failed",
    "message": "record_id length must be 1..128",
    "record_id": "bad-record"
  }
}
```

调用方必须同时处理 HTTP 状态和 `error.code`。常见状态：401 认证失败、403 scope/账号边界错误、409 幂等冲突、422 格式或业务校验失败、429 限额。

