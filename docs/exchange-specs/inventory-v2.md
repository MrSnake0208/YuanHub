# 库存数据交换协议 v2

状态：当前正式版本  
格式：`myshare-inventory-exchange@2`  
Schema：[`schemas/inventory-exchange-v2.schema.json`](./schemas/inventory-exchange-v2.schema.json)

本协议交换物品库存、密探心纸数量和奖励流水。它不交换密探养成状态、特别关注或目标。

## 1. 顶层文档

| 字段 | 必填 | 约束 |
|---|---:|---|
| `format` | 是 | 固定 `myshare-inventory-exchange` |
| `version` | 是 | 固定 `2` |
| `exported_at` | 是 | RFC 3339 时间 |
| `producer` | 是 | 见[公共约定](./common-conventions.md) |
| `catalog_version` | 否 | 1..128 字符 |
| `accounts` | 否 | 1..1000 项；账号 ID 不得重复 |
| `records` | 是 | 1..1000 项 |

顶层不得出现 `user_id`。一个文档可以包含多个调用者拥有的账号，但 OpenAPI Token 调用时只能引用 Token 绑定账号。

## 2. Record

公共字段：

| 字段 | 必填 | 约束 |
|---|---:|---|
| `account_id` | 是 | 目标子账号 ID |
| `record_id` | 是 | 1..128 字符的稳定幂等 ID |
| `record_type` | 是 | `reward_delta` 或 `stock_snapshot` |
| `entity_type` | 是 | `item` 或 `agent` |
| `acquisition_channel` | 否 | 1..64 字符；如 `背包`、`据点情报`、`派遣-洛阳` |
| `stamina_cost` | 条件必填 | 仅派遣奖励允许，整数 0..2147483647 |
| `effective_at` | 是 | RFC 3339 业务时间 |
| `snapshot_scope` | 条件必填 | 快照使用 `full` 或 `listed`；奖励不得携带 |
| `entries` | 是 | 条目数组 |

### 2.1 奖励增量 `reward_delta`

- 表示一次实际获得量，`entries` 至少一项。
- 每个 `count` 是 1..2147483647 的整数。
- 不携带 `snapshot_scope`。
- 当 `acquisition_channel` 包含“派遣”时，`stamina_cost` 必填；其他情况下不得携带。
- 同一时间的记录先应用奖励，再应用库存快照。

示例：[`examples/inventory-reward-delta.json`](./examples/inventory-reward-delta.json)

### 2.2 库存快照 `stock_snapshot`

- `full` 替换该账号与 `entity_type` 的完整基线；允许空 `entries`。
- `listed` 只覆盖列出的条目；`entries` 至少一项。
- `count` 是 0..2147483647 的整数，0 表示明确记录为零。
- `entity_type=agent` 用于交换密探心纸数量，不表示拥有或养成密探。

示例：[物品全量快照](./examples/inventory-full-snapshot.json)、[心纸局部快照](./examples/inventory-listed-agent-snapshot.json)。

## 3. Entry

| 字段 | 必填 | 说明 |
|---|---:|---|
| `id` | 是 | 1..128 字符；必须存在于实体目录 |
| `name` | 否 | 1..256 字符的展示冗余 |
| `count` | 是 | 非负整数；奖励记录额外要求大于 0 |

同一 record 内 `id` 不得重复。`entity_type=item` 时 ID 必须是物品目录项；`entity_type=agent` 时必须是密探目录项。

## 4. 合并与历史语义

服务端按账号和 `effective_at` 排序应用记录：

- 新的 `full` 快照建立全量基线；早于已有全量基线的旧快照可记为 `superseded`。
- 新的 `listed` 快照只更新列出条目；早于该条目已有局部基线的记录不覆盖当前值。
- 奖励流水会保留为历史；如果已经有更新基线，旧奖励可能只进入历史而不改变 current。
- 导入成功结果为 `{accepted,duplicates,history_only,superseded,warnings}`。

`duplicates` 表示同正文幂等重试；同 ID 不同正文返回 409，而不是计入 duplicates。

## 5. 目录与传输

导入前通过 `GET /v1/inventory/catalog` 获取合法实体 ID。JWT 与 OpenAPI 端点、导出参数见 [传输与鉴权](./transport.md)。

