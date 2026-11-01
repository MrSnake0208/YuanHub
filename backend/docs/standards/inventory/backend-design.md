# 库存与奖励数据后端设计

本文供后端开发人员参考。跨平台 JSON 的字段定义、示例和兼容规则见 [库存数据交换协议 v1](./exchange-protocol-v1.md)。

## 1. 设计结论

系统只维护两类事实：

- `current_stock`：用户当前库存，是可被完整背包快照覆盖的状态。
- `reward_delta`：一次奖励带来的增量流水，仅用于幂等上报、延迟上报处理和历史统计。

不要在库存文档中维护 `acquired` 或 `total_acquired`。周、月、任意时间段的获得量均按需聚合 `reward_delta`；历史流水也不得在每次读取库存时重新累加。

```text
奖励上报 ──保存流水──> inventory_records ──按需聚合──> 时段获得量
    │
    └──晚于相应库存基线──> current_stock += count

背包快照 ───────────────────────────────> 覆盖或更新 current_stock
```

新后端可以复用现有 MongoDB 与用户系统，并使用自己的 collections。Redis 不是事实来源，初期也不是必需组件。

## 2. 术语

| 术语             | 含义                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------ |
| `item`           | 普通道具。                                                                           |
| `agent`          | 角色关联物品。                                                                       |
| `reward_delta`   | 奖励增量；`count` 必须大于 0。                                                       |
| `stock_snapshot` | 某时刻读取到的绝对库存；`count` 可以为 0。                                           |
| `full` 快照      | 覆盖该用户、该 `entity_type` 的完整库存；未列出的对象视为 0。                        |
| `listed` 快照    | 只覆盖列出的对象；未列出的对象保持不变。                                             |
| 库存基线         | 最近一次对某个对象具有权威性的快照时间。延迟到达且不晚于基线的奖励不再增加当前库存。 |

## 3. 用户身份边界

- 在线 API 从现有登录态或访问令牌取得内部 `user_id`，不接受客户端在正文中声明内部用户 ID。
- 用户手动导入文件时，文件中的所有记录归属于当前登录用户。
- 合作平台的外部账号映射由认证/绑定层维护，交换协议本身不携带 MyShare 内部用户 ID。
- 新后端只需读取用户身份，并读写自己的库存 collections；不应修改原有用户资料。

## 4. MongoDB collections

下面是推荐结构，不要求字段顺序完全一致。

### 4.1 `inventory_current`

每个用户、每种 `entity_type` 一个文档：

```javascript
{
  _id: "<user-id>:item",
  user_id: ObjectId("..."),
  entity_type: "item",
  full_baseline_at: ISODate("2026-08-16T02:30:00Z"),
  entries: {
    baijinbi: {
      count: NumberLong(103),
      listed_baseline_at: null
    },
    baimozhijiu: {
      count: NumberLong(25),
      listed_baseline_at: ISODate("2026-08-16T03:00:00Z")
    }
  },
  updated_at: ISODate("2026-08-16T03:00:01Z")
}
```

约定：

- 对象的有效基线为 `max(full_baseline_at, listed_baseline_at)`。
- 完整快照替换 `entries` 并更新 `full_baseline_at`；未列出的对象归零，可直接不保留其键。
- `listed` 快照只替换正文列出的对象，并更新这些对象的 `listed_baseline_at`。
- 奖励增量使用 `$inc` 修改 `entries.<entity_id>.count`，但不改变快照基线。
- 对象名称不必复制到该文档；展示名称来自统一对象目录。

当前数量和 ID 都很有限，一个用户一种类型一个文档可获得简单的读取和单文档原子更新。若未来单个用户的对象数量接近 MongoDB 文档大小限制，再改为每个对象一个文档；当前没有必要预先拆分。

### 4.2 `inventory_records`

保存已接收的交换记录：

```javascript
{
  _id: ObjectId("..."),
  record_id: "myshare:7f75b99e98834590a0aca3634e8fab5d",
  user_id: ObjectId("..."),
  record_type: "reward_delta",
  entity_type: "agent",
  acquisition_channel: "派遣",
  effective_at: ISODate("2026-08-16T02:10:00Z"),
  received_at: ISODate("2026-08-16T02:10:03Z"),
  producer: {
    platform: "myshare",
    version: "5"
  },
  entries: [
    { id: "char_105_simahui", count: NumberLong(2) },
    { id: "char_029_xiuqiu", count: NumberLong(1) }
  ],
  stock_effect: "applied"
}
```

`stock_effect` 推荐值：

- `applied`：奖励已经增加当前库存，或快照已经更新当前库存。
- `history_only`：记录已保存，但奖励不晚于库存基线，或 `listed` 快照的跨游戏补零过滤后为空，未改变当前库存。
- `superseded`：旧快照已保存，但比当前快照更早，未覆盖当前库存。

这些状态用于排查导入结果，不参与业务计算。

索引：

```javascript
db.inventory_records.createIndex(
  { user_id: 1, record_id: 1 },
  { unique: true },
);
db.inventory_records.createIndex({ user_id: 1, effective_at: 1 });
db.inventory_records.createIndex({
  user_id: 1,
  record_type: 1,
  effective_at: 1,
});
```

周/月统计只查询 `record_type: "reward_delta"`，再 `$unwind` 和 `$group`。普通 collection 已足够；无需为当前规模引入 MongoDB time series collection。

### 4.3 对象目录

跨平台主键为 `(entity_type, entity_id)`：

- `item` 的 ID 和中文名来自 `agent/items.json` 的 `id` / `name`。
- `agent` 的跨平台 ID 使用 `agent/operators.json` 的正式 `id`，例如司马徽为 `char_105_simahui`。识别模板使用的拼音 `item_id` 只用于本地匹配，不作为角色跨平台主键。

后端可以建立 `entity_catalog` collection，也可以在部署时将这两个文件转换后载入。中文名是展示信息，不得用中文名代替稳定 ID 做数据库主键。

建议提供只读接口：

```http
GET /v1/inventory/catalog
```

返回目录版本以及所有 `{ entity_type, id, name }`，供合作平台建立映射。目录版本使用发布版本或日期即可，不需要计算内容哈希。

## 5. 写入规则

### 5.1 通用校验

收到一份交换文档后：

1. 验证 JSON Schema 和协议版本。
2. 通过认证上下文确定 `user_id`。
3. 验证 `(entity_type, id)` 存在于对象目录。
   对新导入的 `agent` 条目，还需确认公共密探图鉴的 `games` 包含绑定子账号的游戏版本。仅对已知密探的 `stock_snapshot` 零值补齐允许跨游戏：完整保存原始正文，并在 `warnings` 提示忽略；库存计算过滤该条目。未知 ID、不支持的非零密探及 `reward_delta` 仍严格校验，整份预检通过后才写入。已接收的相同记录仍按幂等规则处理，不依赖当前目录。
4. 验证同一 record 的 `entries` 中没有重复 ID。
5. 同一批记录按 `effective_at` 升序处理；相同时间先处理 `reward_delta`，后处理 `stock_snapshot`，让快照成为最终权威值。
6. 同一用户的 `record_id` 已存在时按重复记录返回成功，不再更新库存。
7. 同一用户的 `record_id` 已存在但正文不同，返回 `record_conflict`，不得覆盖原记录。不同用户的相同 `record_id` 互不影响。

同一份本地文件可以安全地重复导入。

### 5.2 奖励增量

对每个 entry 计算相应对象的有效库存基线：

```text
baseline = max(full_baseline_at, entries[id].listed_baseline_at)
```

- 没有基线，或 `effective_at > baseline`：保存流水并 `$inc` 当前库存。
- `effective_at <= baseline`：保存流水用于统计，但设置 `stock_effect: history_only`，不修改当前库存。

例：10:10 获得 `+5`，10:30 背包快照已经包含这 5 个，但奖励文件 11:00 才导入。该奖励仍属于历史统计，但不得再次增加当前库存。

同一记录含多个 entry 时，`inventory_records` 插入和 `inventory_current` 更新应放在同一个 MongoDB transaction 中。MongoDB 单文档更新本身是原子的；跨 collection 保持一致时才需要 transaction。

### 5.3 库存快照

- `full`：当快照不早于当前完整快照时，更新 `full_baseline_at`。对于 `listed_baseline_at` 不晚于本快照的对象，使用完整快照值（未列出则归零）；对于拥有更晚 `listed_baseline_at` 的对象，保留其更新值，避免较旧的完整快照覆盖较新的局部读取。
- `listed`：只设置列出的绝对数量，并更新对应 `listed_baseline_at`。
- 已知但当前游戏不支持的零值密探只从库存计算中排除，不能删除原始 `entries`；幂等比较、记录查询和删除备份仍使用原正文。删除/恢复重放必须复用相同过滤规则。当前游戏支持的零值仍正常清空旧库存。
- 补零过滤后为空的 `listed` 只存档为 `history_only`，不写当前库存、不更新任何基线或库存 revision；`full` 即使过滤后为空也继续执行完整快照语义，不能整条跳过。
- 比现有相应基线更早的快照只存档，设置 `stock_effect: superseded`。
- 生产者必须给出截图实际完成或数据实际读取的时间，不能用之后的文件导入时间代替。

批量导入会先按时间排序，因此“历史奖励 + 最新库存快照”能够得到正确的最终库存。跨多个独立请求发送时，合作平台应先发送较早记录；后端仍需按照基线规则处理延迟到达的记录。

### 5.4 幂等与事务

`record_id` 是幂等键。推荐一次 transaction 完成：

1. 插入 `inventory_records`。
2. 更新 `inventory_current`。
3. 提交。

同一用户的重复 `record_id` 不算失败，响应中计入 `duplicates`。MongoDB transaction 需要 replica set 或 sharded cluster；若当前实例是 standalone，应先确认部署条件，而不是使用 Redis 代替持久幂等。

## 6. 查询与统计

当前库存直接读取 `inventory_current`，不扫描历史流水。

任意时段获得量：

```javascript
db.inventory_records.aggregate([
  {
    $match: {
      user_id: userId,
      record_type: "reward_delta",
      effective_at: { $gte: start, $lt: end },
    },
  },
  { $unwind: "$entries" },
  {
    $group: {
      _id: {
        entity_type: "$entity_type",
        entity_id: "$entries.id",
      },
      acquired_count: { $sum: "$entries.count" },
    },
  },
]);
```

所有区间使用 `[start, end)`，服务端根据用户时区把“本周/本月”转换为 UTC 边界。`acquired_count` 只出现在统计响应里，不写回库存文档。

## 7. Redis 的职责

第一版可以完全不使用 Redis。MongoDB 中每个用户的当前库存只有一两个文档，直接读取已经很轻。

确实出现热点后，Redis 只用于：

- 缓存 `current_stock` 查询结果；库存变更后删除对应 key。
- 缓存指定时间范围的统计结果；新增奖励流水后删除该用户的统计缓存。

不要把 Redis 作为唯一的幂等记录、库存源或奖励流水源。Redis Streams 也不是当前同步写入流程的必要组件。

## 8. 推荐 HTTP 接口

```text
POST /v1/inventory/import
GET  /v1/inventory/export?include=current,rewards&from=...&to=...
GET  /v1/inventory/current?entity_type=item
GET  /v1/inventory/acquired?entity_type=item&from=...&to=...
GET  /v1/inventory/catalog
DELETE /v1/inventory/records/{recordId}?account_id=...
POST /v1/inventory/records/{recordId}/restore?account_id=...
```

删除库存记录时，服务端在同一 Hub Mongo transaction 中把原记录保存到
`inventory_deleted_records`，删除流水并重放当前库存。恢复接口只接受 JWT 所属用户和
`account_id` 下存在的删除备份；若相同 `recordId` 已重新导入，返回 409 且不覆盖现有记录。
恢复原始流水、清除备份与库存重放也在同一 transaction 中完成。删除子账号时一并清除备份。

`POST /import` 与本地文件导入必须调用同一套校验和写入逻辑。建议响应：

```json
{
  "accepted": 2,
  "duplicates": 1,
  "history_only": 1,
  "superseded": 0
}
```

推荐错误：

| HTTP    | code                         | 含义                                  |
| ------- | ---------------------------- | ------------------------------------- |
| 400     | `invalid_json`               | JSON 无法解析。                       |
| 401/403 | `unauthorized` / `forbidden` | 未登录或无权为目标账号导入。          |
| 409     | `record_conflict`            | 相同 `record_id` 已存在，但内容不同。 |
| 422     | `schema_validation_failed`   | 字段或类型不符合协议。                |
| 422     | `unknown_entity_id`          | 对象目录中不存在该 ID。               |
| 422     | `agent_game_mismatch`        | 密探不属于目标子账号的游戏版本（已知密探快照零值补齐除外）。 |
| 422     | `unsupported_version`        | 不支持该协议 major version。          |

建议先完整校验一份导入文档，再开始写入；格式错误时整份拒绝，避免用户不知道哪些条目已经生效。

## 9. MaaYuan/MyShare 识别报告映射

`AgentItemRecognition` 和 `PagedItemRecognition` 已输出协议所需字段：

| 识别报告                      | 协议字段                                       |
| ----------------------------- | ---------------------------------------------- |
| `invocation_id`               | `record_id`，建议加 `myshare:` 前缀。          |
| `timestamp`                   | `effective_at`。                               |
| `entity_type`                 | `entity_type`。                                |
| `item_id`                     | 当 `entity_type=item` 时写入 `entries[].id`。  |
| `operator_id`                 | 当 `entity_type=agent` 时写入 `entries[].id`。 |
| `item_name` / `operator_name` | `entries[].name`。                             |
| `count`                       | `entries[].count`。                            |
| `acquisition_channel`         | record 级 `acquisition_channel`。              |

同一次 `invocation_id` 的行先转换为规范 ID：普通道具取 `item_id`，角色取 `operator_id`；再按 `(entity_type, 规范 ID)` 分组求和并生成 `reward_delta`。识别分数、ROI、行列和模板路径是本地诊断数据，不进入跨平台协议。

背包扫描只有在确认覆盖范围后才能生成快照：完整扫描生成 `snapshot_scope: full`；仅识别局部页面时生成 `snapshot_scope: listed`。

## 10. 验收用例

后端至少应验证以下行为：

1. 同一 `record_id` 导入两次，只增加一次库存。
2. 同一 ID、不同正文返回冲突。
3. 奖励晚于快照时增加库存。
4. 奖励早于或等于快照时只进入历史统计。
5. `full` 快照使未列出的旧库存归零。
6. `listed` 快照不影响未列出的库存。
7. 最新快照覆盖此前已经应用的奖励，历史统计仍能查到这些奖励。
8. `item` 与 `agent` 的相同 ID 互不冲突。
9. 同一文件重复导入的响应可解释且最终库存不变。
10. 月/周查询只聚合 `reward_delta`，不聚合快照。

## 连接来源与首次同步验证

`inventory_records.sourceConnectionId` 是可空的服务端连接编号，取自已通过 `inventory:write` 验证的 Open API 连接，随真实流水在原库存事务内落库。交换正文不能声明该字段；JWT 导入及旧记录默认无来源。幂等重传不更新来源，不改变库存基线、数量或 revision 语义。

本人 JWT `GET /user/open-api/tokens/{tokenId}/first-sync` 先校验 token 归属，再按 userId/accountId/sourceConnectionId/stockEffect=applied 查询已有流水。只返回记录编号与服务端接收时间等证据，不返回库存全量或 token 明文；无缓存、无写入。history_only/superseded、手工记录与普通更新时间均不是成功证据。删除记录或撤销连接后，以重新查询结果为准，不信任客户端历史完成标记。

## 符传快捷记账（站内命令）

密探重置及撤销也使用内部 `resource_delta`，由独立密探事务控制，关联流水不可单独删除或恢复，不计入奖励获得量；不统计鞭子，不扩展交换协议。接口、返还与撤销边界见 [密探重置](../../operator-reset.md)。

JWT专用 `GET /v1/inventory/draw-resources?account_id=...` 返回 `{account_id,game,inventory_revision,balances:{baijinbi,fuchuan,tianjifuchuan}}`。每项余额须有 full/listed 快照基准；无基准返回null，不把奖励合计视为已盘点库存。读取不写入且禁止缓存。

`POST /v1/inventory/draw-resources` 正文严格为 `{account_id,game,operation_id,expected_inventory_revision,action,ticket_id,quantity,channel}`；action为gain/use/exchange，ticket_id仅fuchuan/tianjifuchuan，quantity为正整数张数。gain的channel为1–64字符奖励来源（不含派遣），use固定use；exchange的channel仅standard（200白金币/张）或monthly-shop（仅普通符传，数量须为10的倍数，每10张1600白金币）。禁止客户端价格、user_id、发生时间和其他扩展字段。成功返回 `ApiResult<InventoryRecordListItemDto>`；错误沿用库存错误契约。

整笔命令在Hub事务内校验账号生命周期fence、游戏版本、inventory revision CAS和各资源余额，所有结果限制在0..Int.MAX_VALUE。使用服务端毫秒时间；不允许尚未过去的快照覆盖本次操作。gain写reward_delta，use/exchange写内部resource_delta（有符号entries），兑换两边为同一条记录，不计入获得量。无需新集合/索引。库存读仍直接读取current。

记录ID为yuanhub:draw:<operation_id>，记录保存resourceRequestIdentity（规范类型请求JSON）和resourceRevision（该命令提交的库存版本）；同ID同正文返回原记录，不再扣款；异文409。已删除操作不允许原样重试复活，只能显式restore。身份字段不通过记录列表DTO或交换档案返回。

resource_delta在删除/恢复时按每项基准应用有符号变动，同毫秒命令按resourceRevision排序且快照最终权威；缺基准、负余额或溢出返回409 resource_replay_conflict并回滚整笔删除/恢复。既有consumption_delta仍禁止单条删除。操作历史列表附带可空resource_revision用于前端同序重建。v2交换导入仍仅接受reward_delta/stock_snapshot，导出以当前快照迁移状态，使用/兑换的内部流水不导出。

## 邮箱月卡储备（独立于库存事实）

本人 JWT `GET/PUT /v1/inventory/mailbox-reserve?account_id=...`，沿用 ApiResult 成功封装和库存错误响应，禁止缓存。PUT：`{expected_version, white_coin_mails:[{count,coins_per_mail}], fu_chuan_mail_count}`；响应：`{account_id,white_coin_mails,fu_chuan_mail_count,version,updated_at}`。普通符传按每封3个折算；白金币按行相乘求和，不含体力/购买赠送。

`SubAccount.mailboxReserve` 是可空嵌入文档，旧账号只读返回版本0/空数组/0封/null时间。当前值定向 CAS 只更新该字段，过滤 userId+accountId+版本，不 upsert；删除账号同时清理储备历史，且并发写入不会复活账号。版本冲突409、账号归属不存在404、字段/数量错误422。每项数量0..1000000，最多20行，expected_version 0..9007199254740990；保存覆盖而不累加。保留用户记录的单封数值，当前月卡档位变化不改写历史邮件。

不写 `inventory_current` / `inventory_records`，不改变库存revision，不计入奖励统计，不包含在库存交换导入导出中。历史保存与新索引见下文；无全量数据迁移。定向证据：`MailboxReserveControllerContractTest` 和使用 TestMongo 自有可抛弃容器的 `MailboxReserveMongoTest`。

### 邮件领取命令

本人 JWT `POST /v1/inventory/mailbox-reserve/claim?account_id=...`，正文为 `{expected_version,operation_id,selection?}`。selection 严格为 `{white_coin_mail_counts:[整数...],fu_chuan_mail_count:整数}`，数组与该版本白金币邮件组顺序和长度一致，最多20组，各值为0至1000000且不得超过已保存封数。省略 selection 兼容旧版全部领取。版本范围同储备保存；操作编号为 1–64 位字母、数字、点、下划线或短横线。只记录当前刚领取的选定邮件，金额由服务端储备计算，不接受客户端身份、金额和发生时间。

`MailboxClaimService` 在同一 Hub Mongo 事务中执行储备 CAS 扣减与既有 `InventoryService.import`；奖励使用服务端毫秒时间、原 reward_delta 和 full/listed 基准规则，库存 revision 随原导入更新。保留单封白金币配置和未领取的剩余封数。空奖励、超协议上限、非法正文为 422；账号不属于本人为 404；旧版本或已删除领取为 409。记录 ID 为 `yuanhub:mail:<expected_version>:<operation_id>`；存在 selection 时附加规范化选择（白金币封数以逗号连接、冒号、符传封数）的 SHA-256 前16字节十六进制摘要，使异文请求被旧版本校验拒绝。相同正文和编号重试返回当前储备，不重复扣邮件或增加库存，也不清除之后新增的储备。删除记录后必须显式 restore，不通过重试复活。

原 GET/PUT 仍只维护储备；联合领取响应继续为 `MailboxReserveResponse`，禁止缓存。联合事务同时写入下述邮箱历史，不新增交换协议枚举。定向证据为 `MailboxClaimControllerContractTest` 与隔离容器 `MailboxClaimMongoTest`（回滚、重复、并发、归属、基准及删除/恢复）。

## 站内奖励补记（已计入库存）

仅本人 JWT 可调用以下端点，不对 OpenAPI 采集 token 暴露对应入口：

- `POST /v1/inventory/reward-annotations/preview`：正文为现有交换格式完整文档（当前实现 version=2），仅允许一个已拥有子账号的 `reward_delta`。响应 `{expected_inventory_revision, entries:[{record_id,entity_type,id,baseline_at,effective_at,history_only}], can_confirm}`，明细覆盖每个记录的每个条目。仅查询已持久化目录和库存，不触发目录惰性播种或任何库存写入；首次使用先正常加载公开目录。
- `POST /v1/inventory/reward-annotations`：正文 `{document, expected_inventory_revision}`，响应沿用导入回执 `{accepted,duplicates,history_only,superseded,warnings}`。归属来自认证；验证类型、数量、派遣体力、时间、目录与同键正文冲突。服务端不能核实游戏中的真实领取时间，玩家须如实填写，不自动改到基线前。

每个条目必须满足 `effective_at <= max(full_baseline_at, listed_baseline_at)`。预览只提示覆盖状态，不作为并发保证。确认在同一个 Hub Mongo 事务内重新校验归属/游戏、占用现有 inventory revision CAS，并逐条重新计算奖励效果；任何未覆盖项整批拒绝，回滚流水、revision 和账户写栅栏。成功仅保存标准奖励历史，不更改库存数量、更新时间或快照基线，但递增并发 revision，版本变化不等于资产变化。

错误 `annotation_baseline_missing` / `annotation_would_change_stock` 带 `record_id` / `entry_id` 定位；`inventory_state_stale` 表示预览后状态变化。玩家应回到盘点核对后重新预览，草稿保留，不强制 history_only。预览不可确认的响应仍包含所有条目，不能只检查一种碎片或账户整体基线。

并发写入尚未完成且结果无法确认时，返回 503 `annotation_result_unknown` 并保持原文档重试；不能把尚未提交的写冲突当作可以新建记录的明确拒绝。

同 record_id、同正文且现存记录为 history_only 的完整重试直接返回 duplicates，不要求旧 revision 再次匹配、不递增版本；同键异正文为 record_conflict，现存 applied 记录不能当作补记成功。部分重复只处理剩余新记录，并对整个提交保持事务一致性。网络/服务异常或回执不完整时冻结文档、record_id 与 revision 原样重试；只有明确拒绝后才能编辑并重建请求。

补记仍按普通交换格式保存/导出，不新增 stock_effect 输入或永久不入库的流水类型。删除或恢复旧盘点沿用现有按时间重放：先重放奖励时 stock_effect 可变为 applied，较晚盘点再校准数量；不能据此认为恢复后标记必回到 history_only。“只补记录”保证本次提交在覆盖基线下不重复入库，不排除日后历史重算。

## 邮箱储备历史与统计读取（2026-10-29）

`mailbox_reserve_history` 独立保存服务端归属、version、effectiveAt、kind（baseline/adjustment/claim）、完整邮件分组、符传封数及可选领取 recordId。唯一索引 `(userId, accountId, version)`，时段索引 `(userId, accountId, effectiveAt, version)`，均按现有实体索引配置创建。金额折算使用 Long；不混入库存交换记录、导出或奖励获得量。

储备 PUT 将旧观测保留、version CAS、新历史快照放在同一 Hub Mongo 事务；首次确认零封可建立基准，已有基准的无变化保存不新增历史。claim 在现有扣储备与奖励导入事务内追加历史，奖励与历史同时间、同 recordId；重试不会重复历史。没有可靠时间的旧值不回填；有 updatedAt 的旧值仅作该时刻的最后已知观测，GET 可虚拟返回而不写库，首次新写入时保存旧观测。

本人 JWT `GET /v1/inventory/mailbox-reserve/history?account_id=...&from=...&to=...&limit=100&cursor=...`，时间为 RFC3339、范围 `[from,to)`，limit 为 1–100。按 effectiveAt/version 升序分页，游标绑定用户、账号和范围；响应 `{account_id, entries, next_cursor, version, inventory_revision, inventory_record_count}`。entries 包含 version、effective_at、kind、white_coin_mails、fu_chuan_mail_count、record_id、claim_deleted；不暴露内部用户 ID。响应禁止缓存，读取不创建文档／基准。

当前储备 GET 追加 inventory_revision、inventory_record_count。历史与当前标记均在事务内一致读取。含邮箱报告比较全量读取前后的邮箱 version、库存 revision、库存流水条数；历史补录不一定改变库存 revision，条数用于覆盖这种追加。删除／恢复会递增 revision。任一变化最多整批重试一次，分页失败、超过上限或仍不稳定不能当成完整统计。旧 PUT/claim 字段保持兼容，写响应的读取标记可为 null，前端必须用 GET 取得统计标记。

删除／恢复领取奖励维持现有语义：修正背包、不退还／再次扣邮箱。历史按关联已删除记录批量标注 claim_deleted，避免 N+1 查询。子账号删除在原事务内清理新集合；当前无单独的用户注销业务入口。前端先部署需新接口可用，建议后端先发布；回退旧后端将中断历史，不能删除新集合或宣称中断期间数据完整。


## 邮件自动累计与日常领取联动（2026-10-31）

`MailboxReserve`新增可空`whiteCoinSchedule`/`fuChuanSchedule`，默认null保持旧数据。配置`startDate`/`endDate`为YYYY-MM-DD，白金币配置`coinsPerMail`为正整数；`throughDate`仅服务端持有。站内业务日固定Asia/Shanghai 05:00。首次日期不能回溯，结束包含当天，最多未来10年。修改金额不重写已有邮件分组；开启或续期按每天收到估算，无游戏登录判断。到期后延长先补齐原有效期，再从当前业务日继续，不补停发期间。

本人JWT新增`POST /v1/inventory/mailbox-reserve/sync?account_id=...`。显式访问补算，无定时任务；原储备GET和历史GET保持只读。POST、PUT、claim均禁止缓存，账号来自认证归属检查。PUT可选`white_coin_schedule`/`fu_chuan_schedule`，省略保留、null关闭，非null仅允许起止日期和白金币单封金额，客户端提交through_date拒绝。开始默认明天由UI提供；当天开始会额外累计，UI提示核对。

新增`mailbox_deliveries`，唯一键`(userId,accountId,type,day)`，记录单封金额与pending/claimed/adjusted状态。该凭据用于幂等和来源日期归属，不属于库存交换/奖励获得量。累计进度、储备CAS、逐日历史和凭据同Hub Mongo事务写入。关闭/到期/校正不删除凭据；账户删除在原事务内清理。补算不修改背包。历史kind增加accrual，时间按应发业务日05:00（不早于已有观测），前端注明估算。

领取仍以现有领取凭据和库存协议保证原子性。批量领取先扣未跟踪历史基数，再按日期扣跟踪邮件；校正减少同序标记adjusted。标准`yuanhub:daily-whitecoin:monthly-card:YYYY-MM-DD`新记录在库存导入事务内检查对应发信凭据、金额和业务日期，扣除对应邮件，再进行正常库存处理；已claimed/adjusted拒绝重复新增。已有库存record_id重试走原duplicates，不再次扣邮件。开启当天若已存在标准日常记录或删除备份，发信凭据直接标claimed，不加待领。任意外部来源或非标准ID不靠金额推断重复。

`GET /v1/inventory/mailbox-reserve/daily-status?account_id=...&day=...`返回`monthly_claimed`和`monthly_coins`，只读、有归属检查，辅助日常UI；真正去重与扣减仍在后端事务内。历史日常补记沿用库存有效时间及基线规则，邮箱扣减为本次操作观测，不倒改旧邮箱快照。删除/恢复领取流水不恢复/重扣邮件。

新前端须在读取邮件/报表前调用sync，再使用现有version/inventory_revision/inventory_record_count栅栏。后端先发布；旧客户端GET不触发补算，其修改若遇到待补算版本变化会被拒绝，需新版客户端重新读取。不得删除凭据集合来回退功能。

验证：`MailboxAccrualServiceTest`覆盖日期/配置/补算/校正；`MailboxAccrualMongoTest`覆盖独立Mongo事务、重复/并发、双入口领取、隔离、失败回滚；原邮件契约与领取集成测试保留。Mongo测试只能使用TestMongo拥有的可抛弃容器，不能指向开发/生产库。
