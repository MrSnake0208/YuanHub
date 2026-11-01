# 当前养成主观数据与快捷提升 API

等级突破、采集快照与当前推荐完整备份见[operator v5](./operator-level-breakthrough-v5.md)；旧版本继续兼容。
私人置顶、分组排序和自定义标签使用 [独立分类 API](./operator-organization-api.md)，不扩展本文养成标注或 MaaYuan 交换协议。

实现版本：2026-10-05（SP 一致性修复）。所有接口均使用浏览器 JWT，`userId` 只从 JWT 获取；请求中的 `account_id` 必须属于当前用户。JSON 由全局 Jackson `SNAKE_CASE` 策略序列化。

## 数据集合与索引

| collection | 用途 | 唯一索引 |
|---|---|---|
| `operator_annotation` | `growth_state` 与备注 | `(userId, accountId, operatorId)` |
| `operator_growth_target` | 等级、修为、化极、心纸目标 | `(userId, accountId, operatorId)` |
| `inventory_revision` | 子账号库存 CAS 版本 | `(userId, accountId)` |
| `operator_upgrade_transaction` | 升级审计和 HTTP 幂等结果 | `(userId, accountId, idempotencyKey)` |

`inventory_records` 新增可选 `transactionId` 字段；升级写入 `recordType=consumption_delta`，`entries[].count` 仍为正数，方向由记录类型表达。`stockEffect` 继续只使用 `applied | history_only | superseded`。

Spring Data 自动索引已启用。既有集合无需数据迁移：无 annotation 等价于 `active/null`，无 target 等价于未设置，无库存版本等价于 revision `0`。旧 inventory v2 客户端仍只导入 `reward_delta` 和 `stock_snapshot`；导出以 full snapshot 恢复最终库存，避免旧客户端把 consumption 当奖励。

删除子账号会在同一事务中清理上述四个集合以及既有 current、records、favorites 和 v3 audit。删除或重放客观 operator record 不触碰 annotation、target 或 favorite。

## 主观标注

```http
GET /v1/operator/annotations?account_id=acc_xxx
```

```json
{
  "code": 200,
  "data": {
    "account_id": "acc_xxx",
    "items": [{
      "operator_id": "char_001_yangxiu",
      "growth_state": "graduated",
      "note": "等级修为完成，继续收集心纸",
      "revision": 3,
      "updated_at": "2026-08-23T04:00:00Z"
    }]
  }
}
```

未列出的密探按 `growth_state=active`、`note=null` 解释，不会为公共目录全量预生成文档。

```http
PUT /v1/operator/annotations/char_001_yangxiu?account_id=acc_xxx
Content-Type: application/json

{
  "growth_state": "graduated",
  "note": "等级修为完成，继续收集心纸",
  "expected_revision": 2
}
```

`growth_state` 与 `note` 字段级合并；缺失保留，`note:null` 清除。创建使用 `expected_revision:0`。相同最终内容重复提交直接返回已有结果，不增加 revision。枚举为 `active | graduated | skip | discarded`；前端映射为 `growing ↔ active`、`graduated ↔ graduated`、`inactive ↔ skip`、`discarded ↔ discarded`。

## 养成目标

```http
GET /v1/operator/growth-targets?account_id=acc_xxx
```

```http
PUT /v1/operator/growth-targets/char_001_yangxiu?account_id=acc_xxx
Content-Type: application/json

{
  "level": 100,
  "elite": 17,
  "star_level": 31,
  "heart_paper": 180,
  "expected_revision": 2
}
```

缺失目标字段保留旧值。范围为 `level 0..100`、`elite 0..17`、兼容旧`star_level 普通0..31 / SP0..5`，新`huaji.stage 普通0..25 / 隐密0..24 / SP0,1,7,13,19,25`（可null未知），独立`huaji.awakened`、`heart_paper 0..1000000`。目标只表示计划，不改变 current，也不要求 favorite。

以下两种调用都明确删除整组目标：

```http
PUT /v1/operator/growth-targets/char_001_yangxiu?account_id=acc_xxx
Content-Type: application/json

{"targets":null,"expected_revision":3}
```

```http
DELETE /v1/operator/growth-targets/char_001_yangxiu?account_id=acc_xxx&expected_revision=3
```

## v3 主观记录与备份

浏览器 JWT 的 `POST /v1/operator/import/preview` 和 `POST /v1/operator/import` 接受 `operator_annotation_snapshot`：

- `listed` 只处理列出的密探以及 entry 中实际出现的字段；
- `full` entry 必须包含 `growth_state/favorite/note/targets`，事务开始后先把文档外主观状态恢复为 `active/false/null/null`，再写入 entries；
- 一条 annotation record 的 annotation、现有 `inventory_agent_favorites` 和 target 共用一个 `hubTransactionTemplate` 事务；任一 entry 失败时整条 record 不写；
- 没有 annotation record 时主观数据完全不变；
- OpenAPI scan 继续只接受 `operator_snapshot + source_kind=scan + snapshot_scope=listed`，annotation 返回 `scan_scope_not_allowed`；
- 幂等键仍为 `(userId, targetAccountId, recordId)`。

完整 v3 备份使用：

```http
GET /v1/operator/export?account_id=acc_xxx&version=3
GET /v1/operator/export?scope=all&version=3
```

兼容策略：未传 `version` 时仍导出原 v2 客观档案；`version=3` 同时生成 full `operator_snapshot` 和 full `operator_annotation_snapshot`，可恢复状态、favorite、备注和目标。

## 快捷提升预览

```http
POST /v1/operator/upgrades/preview
Content-Type: application/json

{
  "account_id": "acc_xxx",
  "game": "如鸢",
  "operator_id": "char_001_yangxiu",
  "dimension": "huaji",
  "target": 22,
  "expected_operator_revision": 7
}
```

```json
{
  "code": 200,
  "data": {
    "available": true,
    "dimension": "huaji",
    "from": 21,
    "to": 22,
    "requirements": [{
      "entity_type": "agent",
      "id": "char_001_yangxiu",
      "required": 40,
      "owned": 52,
      "balance_after": 12
    }],
    "experience_required": null,
    "experience_overflow": null,
    "money_required": 80000,
    "blocking_reasons": [],
    "operator_revision": 7,
    "inventory_revision": 42,
    "preview_token": "upgrade_preview_xxx",
    "expires_at": "2026-08-23T04:01:00Z"
  }
}
```

预览只读取数据，token 在服务实例内保存 60 秒并绑定 JWT 用户、子账号、game、密探、维度、目标、operator revision 和 inventory revision。材料按 `YuanHub/src/data/operatorRequirements.js` revision 93628 计算：

- `level`：经验、突破材料和按从属选择的 70/80 级材料；服务端从六韬兵书/兵书全卷/兵书残卷中选择最小溢出且稳定的组合；
- `elite`：按密探属性分为风火、水地、阴阳/其他三组；
- `huaji`：只提升化极阶段，扣该密探自己的 agent 心纸；普通终点25、隐密24，24→25为80心纸，不扣装金玻璃。觉醒使用独立维度，不作为第26或31阶段；SP preview/execute 均返回422 `sp_huaji_upgrade_not_supported`，不得使用普通心纸表；
- `awakening`：`target=1`，preview `from=0,to=1`；仅普通紫/金（rarity=4/5）、已拥有、stage25且未确认已觉醒可执行，否则422 `awakening_not_available`。扣该密探心纸100与装金玻璃1；铜钱300000仅估算。保留stage25、设置awakened=true，观测面板标记stale；与库存、revision、correction和consumption_delta同一事务提交。catalog明确开放awakening_upgrade_supported=true；SP/隐密不开放。
- `money_required` 仅展示五铢钱估算，绝不进入 requirements、库存校验或扣减。

## 原子执行

```http
POST /v1/operator/upgrades/execute
Idempotency-Key: 2ceca973-807f-4eb5-a7d8-8eae03419785
Content-Type: application/json

{
  "account_id": "acc_xxx",
  "game": "如鸢",
  "operator_id": "char_001_yangxiu",
  "dimension": "huaji",
  "target": 22,
  "expected_operator_revision": 7,
  "expected_inventory_revision": 42,
  "preview_token": "upgrade_preview_xxx"
}
```

```json
{
  "code": 200,
  "data": {
    "transaction_id": "upgrade_xxx",
    "operator": {
      "id": "char_001_yangxiu",
      "level": 90,
      "elite": 16,
      "star_level": 22,
      "revision": 8
    },
    "consumed": [{
      "entity_type": "agent",
      "id": "char_001_yangxiu",
      "count": 40,
      "balance_after": 12
    }],
    "inventory_revision": 43,
    "created_at": "2026-08-23T04:00:30Z"
  }
}
```

服务端在一个 Hub Mongo transaction 内重新计算材料，校验两类 revision，扣 item/agent，CAS 更新整组 operator current，写 consumption records、升级审计、可重放成长校正和 inventory revision。相同 key+相同请求返回首次结果；相同 key+不同请求返回冲突。`PATCH /v1/operator/current/{operatorId}` 的 `reason=manual_correction` 没有接入此服务，继续不扣库存。

成功提交后只发布一个 `operator-upgrade` 子账号事件，字段为 `account_id/transaction_id/operator_id/dimension/from/to/consumed/operator_revision/inventory_revision/occurred_at`。item 与 agent 两条内部流水共享 `transaction_id`，前端应合并成一次提示。

## 错误码

| HTTP | code | 含义 |
|---:|---|---|
| 404 | `account_not_found` | 子账号不存在或不属于 JWT 用户 |
| 404 | `operator_not_found` | 公共目录或当前投影中没有密探 |
| 409 | `annotation_revision_conflict` | annotation revision 冲突 |
| 409 | `growth_target_revision_conflict` | target revision 冲突 |
| 409 | `operator_state_stale` | 快捷提升的 operator revision 已变化 |
| 409 | `inventory_state_stale` | 快捷提升的 inventory revision 已变化 |
| 409 | `insufficient_inventory` | 权威重算后材料不足 |
| 409 | `idempotency_conflict` | 同一 Idempotency-Key 对应不同请求 |
| 409 | `consumption_record_delete_forbidden` | 禁止单独删除升级消耗流水 |
| 422 | `invalid_growth_state` | growth_state 枚举非法 |
| 422 | `invalid_growth_target` | 目标值或目标形状非法 |
| 422 | `sp_huaji_upgrade_not_supported` | SP 化极专属材料规则尚未接入，拒绝扣库 |
| 422 | `shared_growth_conflict` | 关联形态等级/修为不一致，需手动校正后再提升 |
| 422 | `invalid_upgrade_target` | 维度、目标、game 或阶段约束非法 |
| 422 | `invalid_star_level` | 化极目标超过该密探类型范围 |
| 422 | `preview_expired` | token 过期或与 execute 请求不匹配 |
| 422 | `scan_scope_not_allowed` | OpenAPI 扫描包含 annotation/full/非 scan 数据 |

## 前端接入要点

- 工作台本地状态 `growing/graduated/inactive/discarded` 分别映射到 API 的 `active/graduated/skip/discarded`。
- 用 GET annotations/targets 的结果覆盖本地缓存；响应中没有的密探采用默认值。`yuanhub:operator-targets:{accountId}` 只可作为一次性迁移来源，成功 PUT 后不再作为真相源。
- favorite 仍只读写 `/v1/inventory/agent-favorites`；不要通过 annotation CRUD 修改 favorite。
- 快捷按钮先 preview，展示 `requirements` 和 `blocking_reasons`；execute 必须原样携带两个 revision 与 token，并设置 UUID Idempotency-Key。
- 执行成功可先用响应刷新当前行，再重新获取当前养成整组与账号库存，以更新关联形态；收到 `operator-upgrade` SSE 时按 `transaction_id` 去重/合并。
- current 超过旧 target 不是错误；显示层可自行把建议目标上调。

## 已弃置（2026-10-03）

新增 discarded，语义为退出日常养成、保留练度，可恢复到 active/graduated/skip。复用 annotation 的用户/子账号键和 revision；仅修改状态时备注、目标、favorite、清单及客观数据保持不变，skip 历史值不迁移。CAS 冲突继续为 annotation_revision_conflict，非法非空值继续为 invalid_growth_state，缺失字段保留原值（未有标注才默认 active）。

v3 两份 schema 同步接受第四值，listed/full 导入导出和分享/OpenAPI 透传。普通客观导入和 scan 不修改主观状态。旧客户端校验器会拒绝新值；先升级读取界面和 MaaYuan 再开放写入。已有数据后后端回滚须保留四值读写兼容，不重解释为其它值。

## SP 共享成长（2026-10-05）

`spOf` 指向普通本体。整个关联组镜像同步 `level/elite`，星级、命盘、奇闻与观测面板仍属于各形态；是否拥有只由各自 `star_level > 0` 决定。缺失关联形态建立零星占位，不自动解锁。关联成长变化增加该条目 revision，并将已有有效观测标记 stale。

手动 PATCH 与快捷提升都在事务中同步本体及其全部 SP；CAS 校验被修改关联项的旧 revision。首次从旧通用游戏档案物化时保留关联形态的独立字段。SP 等级/修为按**本体养成路径**计算材料，与培养计划口径一致；这不推断 SP 自身专属材料表。已有组内成长冲突会阻止快捷扣库，用户确认正确值后可手动 PATCH 统一。

每次成功快捷提升写入 `reason=quick_upgrade` 的成长校正快照，重放时恢复成长并同步关联组，不再次扣库存；删除最后一条 v2 导入记录也不会丢失此后已扣库提升。SP 化极 execute 会重新检查目录，旧 preview token 不能绕过限制。成功幂等重试仍返回原交易结果，不再次执行。

本次不迁移数据库，不自动修正历史冲突导入或回填旧升级事务。已有冲突须先核对来源和正确练度，再另行修复；新写入约束不能替代存量审计。

## 独立化极（本次兼容更新）

新Current/PATCH/目标使用huaji owned/stage/awakened；普通终点25、隐密24、SP稀疏stage且材料422保护。level/elite共享只计一次，stage/awake目标独立。旧25..30永久适配五星，31仅确认觉醒且stage可未知，历史异常不批量清理。无损交换使用operator-only v4；旧v2 camelCase/v3字段及幂等契约保留，旧观测不伪造新验证。详情见[化极兼容规范](./operator-huaji-compatibility.md)。
