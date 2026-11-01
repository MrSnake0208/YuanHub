# 密探数据后端（多子账号）实现规划

> 本文是《密探数据后端设计 6.0 / 密探数据交换协议 6.1》在 **BackEndV3-Share**
> 仓库中的落地实现方案。结论在 `docs/operator-subaccounts-feasibility.md` 中论证过：
> **多子账号可以实现，且密探模块尚未存在，无存量数据，直接按带 `account_id` 的
> 协议 v2 落地，不需要数据库迁移。**
>
> 与前文可行性研究的关键差异（用户已定）：**密探子账号与库存子账号不共用账号表**，
> 各自独立集合；token 基础设施复用同一张 `open_api_token` 表，通过新增域标记区分。
>
> 本文以"实现者可直接开工"为目标：给出逐文件清单、协议完整形态、业务规则、测试与验收清单。
> 实现时以仓库内库存模块（inventory）为镜像，逐文件对位。

---

## 1. 目标与范围

### 1.1 目标

1. 在 HubBackend 新增密探（operator）数据模块，提供协议 v2 的导入/导出/当前状态/记录查询。
2. 支持"一个用户多个密探子账号"：每个子账号拥有独立的 `(game × 密探养成状态)` 数据空间，
   幂等、基线、快照语义全部按子账号隔离。
3. 密探子账号与库存子账号**完全独立**：各自的账号表、各自的上限、各自的 CRUD；
   用户在前端分别维护。
4. 第三方 OpenAPI Token 可绑定密探子账号，限定范围读写该账号的密探数据。

### 1.2 非目标（不做）

- 不做奖励增量 / 时段获得量统计（密探是纯快照系统，见 6.0 §1）。
- 不做与库存账号的打通/合并。
- 不为密探做 Redis 缓存层（6.0 §7；第一版可不用 Redis 作为事实源）。
- 不做协议 v1 兼容读取（尚未实现 v1，无包袱）。

### 1.3 约定与术语

沿用 6.0/6.1 术语：`operator`（密探，`char_xxx` 稳定 ID）、`build`（养成状态）、
`game`（如鸢/代号鸢/空）、`operator_snapshot`、`full`/`listed`、养成基线。

**约定（后续扩展不得违反）**：
- **SP 形态关系（`spOf`）属于服务端目录字典，不属于交换协议**。客户端
  `entries` 载荷中**不得**上报 `spOf`，本协议（v2）也不承载该字段；SP→本体 的
  判定只依据服务端 `operator_catalog`（与公共图鉴 `GET /v1/operator/catalog`）。
  该字段只属于目录与公共图鉴层，见 §3.3 与 §5。

---

## 2. 关键设计决策

| # | 决策 | 内容 |
|---|------|------|
| D1 | 账号表独立 | 新建 `operator_accounts` 集合，**不读不写 `inventory_accounts`**。每用户上限 10（与库存一致）。`accountId` 沿用 `acc_<uuid32>` 格式。 |
| D2 | token 复用 | 复用 `open_api_token` 集合与 `OpenApiTokenService`。新增 `kind` 字段（`INVENTORY`/`OPERATOR`，历史行无值视为 `INVENTORY`），token 列表展示时按 kind 解析账号名。 |
| D3 | 协议直接 v2 | 6.1 升版为 v2：record 级必填 `account_id`，顶层可选 `accounts`。完全不实现 v1。 |
| D4 | 目录独立 | 新建 `operator_catalog` 集合 + 资源文件 `src/main/resources/operator/operators.json`（**需要比库存版更全的字段**：id/name/alias/rarity/prof/subProf/games/discs/starStones，见 §5）。 |
| D5 | 事务 | 导入、删除账号、删除单条记录重放，均使用 Hub MongoDB transaction（replica set 前提，与库存一致）。 |
| D6 | 幂等键 | `(userId, accountId, recordId)` 唯一；不同子账号相同 `record_id` 互不影响。 |
| D7 | 排序 | 导入按 `(accountId, effectiveAt)` 升序处理；同时间按文档内顺序（先到先处理）。无 reward/快照平手规则（密探全为快照）。 |
| D8 | 权限枚举 | `OpenApiPermission` 新增 `operator:read` / `operator:write` / `operator:export`（code 20001/20002/20003）。 |

---

## 3. 交换协议 v2：`myshare-operator-exchange`

### 3.1 顶层

| 字段 | 必填 | 类型 | 说明 |
| ---- | ---- | ---- | ---- |
| `format` | 是 | string | 固定 `myshare-operator-exchange` |
| `version` | 是 | integer | 固定 `2` |
| `exported_at` | 是 | RFC 3339 | 文档生成时间，不参与状态计算 |
| `producer` | 是 | object | `{platform, version?}`，复用 `ProducerDto` |
| `catalog_version` | 否 | string | 生成方使用的密探目录版本 |
| `accounts` | 否 | array<{id, name?}> | 账号声明（导出必带；导入可选，仅展示/校验用） |
| `records` | 是 | array<record> | 1..1000 条 |

### 3.2 Record（`operator_snapshot`）

| 字段 | 必填 | 类型 | 说明 |
| ---- | ---- | ---- | ---- |
| `account_id` | 是 | string | 目标子账号（`^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`，1..64） |
| `record_id` | 是 | string | 1..128；幂等键（用户×账号内唯一） |
| `record_type` | 是 | enum | 固定 `operator_snapshot` |
| `game` | 否 | string | `如鸢`/`代号鸢`/空（通用）。非空时每个 entry 须 `game ∈ games` |
| `effective_at` | 是 | RFC 3339 | 养成数据实际读取/截图时间，须带时区 |
| `snapshot_scope` | 是 | enum | `full` 或 `listed` |
| `entries` | 是 | array<entry> | `full` 可为空；`listed` 至少 1 条；同 record 内 `id` 唯一 |

### 3.3 Entry（密探养成对象）

| 字段 | 必填 | 类型 | 说明 |
| ---- | ---- | ---- | ---- |
| `id` | 是 | string | `char_xxx`，跨平台主键 |
| `name` / `alias` | 否 | string | 展示/搜索用，不作为主键 |
| `rarity` | 否 | integer | 3..5；目录属性，冲突以目录为准 + warning |
| `prof` / `subProf` | 否 | array<enum> | 目录属性，冲突以目录为准 + warning |
| `games` | 否 | array | 目录属性，用于校验 `game` |
| `elite` | 是 | integer | 修为 ≥0（SP 与本体自动同步） |
| `starLevel` | 是 | integer | 星级 0..31（0 = 未拥有；1..30 = 1星·0..5星·5；31 = 觉醒；SP 独立） |
| `level` | 是 | integer | 等级 ≥0（SP 与本体自动同步） |
| `discs` | 否 | array<disc> | 已装备命盘；空数组=未装备 |
| `starStones` | 否 | array<starStone> | 已装备星石；空数组=未装备 |

**disc**：`ot_name`（必填，目录主键）、`abbreviation`/`color`（金/紫/蓝）/`desp`（可选，冲突以目录为准 + warning）。
同一密探 `discs` 内 `ot_name` 不得重复；`ot_name` 不在该密探目录 → `invalid_disc`。

**starStone**：`name`（可选）、`type`（必填 `main`/`assist`）、`level`（必填 ≥0）。
同一密探内 `type` 不得重复；`type` 非法 → `invalid_star_stone`。

**星级（`starLevel`）映射**：节点整体后移 1 位，`starLevel = 6 × (星级 − 1) + 节点 + 1`
（每星节点 0~5，共 6 档）。**0 = 未拥有**；1..6 = 1星·0~5，7..12 = 2星·0~5，
13..18 = 3星·0~5，19..24 = 4星·0~5，25..30 = 5星·0~5（**5星·5 = 30**）；**31 = 觉醒**（仅一档）。

> ⚠️ **`spOf` 不在本协议中（约定写死）**：SP 形态 → 本体的关系（如 史子眇·赴烛
> → 史子眇）是游戏静态属性，属于服务端目录字典 `operator_catalog` 与公共图鉴
> `GET /v1/operator/catalog`，**不在 entry/record 载荷里**。本协议 v2 的
> `entries` 只含养成字段（`id/name/alias/rarity/prof/subProf/games/
> elite/starLevel/level/discs/starStones`），**客户端不得上传 `spOf`**；接收方
> 也一律以自身目录判定 SP，并在落库时进行**本体/SP 成对归一化**：二者恒成对出现，
> `level`（等级）与 `elite`（修为）双向共享，其余字段独立（见 §3.5）。
> 后续新增 SP 只扩目录，不升级协议载荷；若确需让载荷携带该关系，属 v2 → v3 的
> major 升级，且必须同步明确定义"载荷声明与目录冲突时以谁为准"。

### 3.4 完整示例

```json
{
  "format": "myshare-operator-exchange",
  "version": 2,
  "exported_at": "2026-08-17T11:30:00+08:00",
  "catalog_version": "2026-08-17",
  "producer": { "platform": "myshare", "version": "5" },
  "accounts": [
    { "id": "acc_0123456789abcdef0123456789abcdef", "name": "大号" }
  ],
  "records": [
    {
      "account_id": "acc_0123456789abcdef0123456789abcdef",
      "record_id": "myshare:op:2f38fa436d204449bcbf3ac395a6e275",
      "record_type": "operator_snapshot",
      "game": "如鸢",
      "effective_at": "2026-08-17T10:00:00+08:00",
      "snapshot_scope": "full",
      "entries": [
        {
          "id": "char_001_yangxiu",
          "name": "杨修",
          "elite": 17,
          "starLevel": 7,
          "level": 100,
          "discs": [
            { "ot_name": "初始能量+2", "abbreviation": "初始+2", "color": "金", "desp": "初始能量+2" }
          ],
          "starStones": [
            { "name": "主星石", "type": "main", "level": 60 }
          ]
        }
      ]
    }
  ]
}
```

### 3.5 校验规则清单（导入时，全部通过才写入）

1. `format` / `version`（否则 `unsupported_version` / `schema_validation_failed`）。
2. `exported_at`/`effective_at` 为合法 RFC 3339（复用库存 `parseInstant` 做法：OffsetDateTime.parse → Instant）。
3. `producer` 格式（`platform` 正则、`version` 非空）。
4. 顶层 `accounts`（若出现）：id 唯一、格式合法；仅作声明，不强制与 records 对齐。
5. 每条 record：`account_id` 格式合法且**属于当前用户**（`unknown_account_id`，422）。
   OpenAPI token 绑定时：文档所有 record 的 `account_id` 必须等于 token 绑定账号（否则 `account_scope_mismatch`，403）。
6. record 枚举：`record_type == operator_snapshot`、`snapshot_scope ∈ {full, listed}`。
7. `listed` 至少 1 entry；`full` 可为空。
8. `game` 合法（`如鸢`/`代号鸢`/空）；非空时每个 entry 满足 `game ∈ games`（`invalid_game`，422）。
9. entries：`id` 唯一；`id` 在 `operator_catalog` 中存在（`unknown_operator_id`，422）。
    `elite`/`starLevel`/`level` ≥0。
10. `rarity`/`prof`/`subProf`/`games`：省略→以目录为准；冲突→以目录为准并记 warning（不拒绝）。
11. discs：`ot_name` 在该密探目录（`invalid_disc`）、不重复、可选字段冲突→warning。
12. starStones：`type` 枚举（`invalid_star_stone`）、不重复。
13. 幂等：`(userId, accountId, recordId)` 已存在且正文相同 → 计入 `duplicates`（成功）；
    已存在但正文不同 → `record_conflict`（409）。
14. **本体/SP 形态归一化**（目录 `spOf` 非空的密探成对，如 史子眇·赴烛 ⟷ 史子眇）：
    **二者恒成对出现**：只要本体或 SP 任一落在该 `(account, game)` 的有效状态，
    另一端自动补齐（缺 SP → 以本体生成；缺本体 → 以 SP 生成），**不再因缺本体而拒绝**。
    **`level`（等级）与 `elite`（修为）双向共享**：本次快照写了本体或 SP 的哪一个，
    就以它为准覆盖另一个；`starLevel`（星级）、命盘、星石**各自独立、互不同步**。
    自动补齐的一方星级/命盘/星石默认 0/空，可随后独立编辑。
15. 整份校验失败 → 整份拒绝，不做部分写入（与库存一致）。

> "正文相同"判定：直接比较协议业务字段（record_type / game / snapshot_scope /
> effective_at / entries 的 id、养成字段、discs、starStones，name/alias 计入比较）。
> 不要求生产者提供哈希（6.1 §4）。

### 3.6 幂等范围与顺序

- 幂等范围：`(userId, accountId, recordId)`，不同子账号、不同用户互不影响。
- 导入先按 `accountId` 分组，组内按 `effective_at` 升序；同时间保持文档内相对顺序。
- 快照基线规则（6.0 §5.2）：
  - `full`：不早于该 `(account, game)` 当前 full 基线时替换 entries 并更新 `full_baseline_at`；
    对拥有更晚 `listed_baseline_at` 的密探保留其值（避免旧 full 覆盖新局部读取）；
    未列出且无更晚 listed 覆盖 → 视为未拥有，删除键。
  - `listed`：只覆盖列出的密探并更新其 `listed_baseline_at`。
  - 早于相应基线的快照只存档，`snapshot_effect: superseded`，不覆盖当前状态。

### 3.7 错误码

| HTTP | code | 含义 |
| ---- | ---- | ---- |
| 400 | `invalid_json` | JSON 无法解析 |
| 401 | `unauthorized` | 未登录/token 缺失或无效 |
| 403 | `forbidden` / `account_scope_mismatch` | 无权限 / token 账号与文档账号不符 |
| 404 | `account_not_found` / `record_not_found` | 账号/记录不存在（越权统一 404） |
| 409 | `record_conflict` | 同 (user,account,record_id) 已存在但正文不同 |
| 422 | `schema_validation_failed` | 字段/类型/枚举/时间/格式不合法 |
| 422 | `unknown_operator_id` | 目录不存在该 char_xxx |
| 422 | `unknown_account_id` | account_id 不属于当前用户 |
| 422 | `invalid_game` | game 不支持或 entry.games 不含该版本 |
| 422 | `invalid_disc` / `invalid_star_stone` | 命盘/星石字段非法 |
| 422 | `unsupported_version` | 协议版本不支持 |
| 429 | `account_limit_reached` | 子账号数量达上限 |

---

## 4. MongoDB 数据模型（HubBackend）

### 4.1 `operator_accounts`

```kotlin
@Document("operator_accounts")
@CompoundIndexes(
    CompoundIndex(name = "idx_op_user_account_unique", def = "{'userId': 1, 'accountId': 1}", unique = true),
    CompoundIndex(name = "idx_op_user_account_name_unique", def = "{'userId': 1, 'name': 1}", unique = true),
)
data class OperatorAccount(
    @Id val id: String? = null,
    val userId: String,
    val accountId: String,   // "acc_" + uuid 去连字符
    val name: String,        // 用户内唯一
    val createdAt: Instant = Instant.now(),
    val updatedAt: Instant = Instant.now(),
)
```

每用户上限 `MAX_ACCOUNTS_PER_USER = 10`（与 `InventoryAccountService` 一致）。

### 4.2 `operator_current`

```kotlin
@Document("operator_current")
@CompoundIndex(
    name = "idx_op_user_account_game",
    def = "{'userId': 1, 'accountId': 1, 'game': 1}",
    unique = true,
)
data class OperatorCurrent(
    @Id val id: String? = null,          // "<userId>:<accountId>:<game>"，game 空为 "*"
    @Indexed val userId: String,
    val accountId: String,
    val game: String,                    // 如鸢 / 代号鸢 / "*"（通用）
    val fullBaselineAt: Instant? = null,
    val entries: Map<String, OperatorEntry> = emptyMap(),  // key = char_xxx
    val updatedAt: Instant = Instant.now(),
)

data class OperatorEntry(
    val elite: Int,
    val starLevel: Int,
    val level: Int,
    val discs: List<OperatorDisc> = emptyList(),        // 已装备选择
    val starStones: List<OperatorStarStone> = emptyList(),
    val listedBaselineAt: Instant? = null,
)

data class OperatorDisc(val otName: String, val abbreviation: String? = null, val color: String? = null, val desp: String? = null)
data class OperatorStarStone(val name: String? = null, val type: String, val level: Int)
```

约定（6.0 §4.1）：静态属性（name/alias/rarity/prof/subProf/games）与命盘/星石目录**不复制到本文档**；
`discs`/`starStones` 只存用户的已装备选择与等级，展示信息由 `operator_catalog` 补齐。

### 4.3 `operator_records`

```kotlin
@Document("operator_records")
@CompoundIndex(
    name = "idx_op_user_account_record_unique",
    def = "{'userId': 1, 'accountId': 1, 'recordId': 1}",
    unique = true,
)
@CompoundIndex(name = "idx_op_user_account_effective", def = "{'userId': 1, 'accountId': 1, 'effectiveAt': 1}")
@CompoundIndex(name = "idx_op_user_account_game_effective", def = "{'userId': 1, 'accountId': 1, 'game': 1, 'effectiveAt': 1}")
data class OperatorRecord(
    @Id val id: String? = null,
    val recordId: String,
    @Indexed val userId: String,
    val accountId: String,
    val recordType: String,          // 恒 "operator_snapshot"
    val game: String? = null,        // 如鸢 / 代号鸢 / null（通用）
    val snapshotScope: String,       // full | listed
    val effectiveAt: Instant,
    val receivedAt: Instant = Instant.now(),
    val producer: ProducerInfo,      // 复用库存的 ProducerInfo
    val entries: List<OperatorRecordEntry>,
    val snapshotEffect: String = "applied",   // applied | superseded
)

@Field("id") data class OperatorRecordEntry(
    val id: String,
    val name: String? = null,
    val alias: String? = null,
    val rarity: Int? = null,
    val prof: List<String>? = null,
    val subProf: List<String>? = null,
    val games: List<String>? = null,
    val elite: Int,
    val starLevel: Int,
    val level: Int,
    val discs: List<OperatorDisc> = emptyList(),
    val starStones: List<OperatorStarStone> = emptyList(),
)
```

### 4.4 `operator_catalog`

```kotlin
@Document("operator_catalog")
@CompoundIndex(name = "idx_op_catalog_id_unique", def = "{'operatorId': 1}", unique = true)
data class OperatorCatalogEntity(
    @Id val id: String? = null,
    val operatorId: String,          // char_xxx
    val name: String,
    val alias: String? = null,
    val rarity: Int,
    val prof: List<String>,
    val subProf: List<String>,
    val games: List<String>,
    val discs: List<OperatorDiscCatalog>,        // 该密探全部可用命盘
    val starStones: List<OperatorStarStoneCatalog>, // 星石槽位配置
    val spOf: String? = null,                    // SP 形态的本体密探 id（如 史子眇·赴烛 -> 史子眇）
    val catalogVersion: String,
    val createdAt: Instant = Instant.now(),
)
data class OperatorDiscCatalog(val otName: String, val abbreviation: String?, val color: String?, val desp: String?)
data class OperatorStarStoneCatalog(val name: String, val type: String)   // type: main | assist
```

索引由 `spring.data.mongodb.auto-index-creation: true` 自动创建（application.yml 已开启）。

---

## 5. 目录资源 `operator/operators.json`

现有 `src/main/resources/inventory/operators.json` 只有 `{id, name}`，**不满足密探需求**。
需新建 `src/main/resources/operator/operators.json`，每条含：

```json
{
  "id": "char_001_yangxiu",
  "name": "杨修",
  "alias": "yangxiu yx 杨修",
  "rarity": 5,
  "prof": ["阳"],
  "subProf": ["shenji"],
  "games": ["如鸢", "代号鸢"],
  "discs": [
    { "ot_name": "初始能量+2", "abbreviation": "初始+2", "color": "金", "desp": "初始能量+2" }
  ],
  "starStones": [
    { "name": "主星石", "type": "main" },
    { "name": "辅星石", "type": "assist" }
  ],
  "spOf": "char_023_shizimiao"
}
```

> `spOf`（可选）：SP 形态密探指向其"本体"密探 id。普通密探省略或为 null。
> 目前目录中 `char_085_shizimiaosp`（史子眇·赴烛 -> `char_023_shizimiao`）与
> `char_084_chendengsp`（陈登·黍王 -> `char_013_chendeng`）为此形态。
> **该字段只存在于目录（并暴露于公共图鉴）层，不属于交换协议 v2 的载荷**，详见 §1.3 与 §3.3。

> ⚠️ **前置依赖**：此资源需要从 MaaYuan 仓库的 `agent/operators.json` 完整版获取
> （协议 6.0 §4.3 明确目录来源）。若实现时拿不到完整版，可用 `inventory/operators.json`
> 的 id/name 打底 + 枚举字段占位，但**必须**在文档注明：`invalid_disc`/`invalid_star_stone`
> 校验依赖真实的 discs/starStones 目录数据，占位目录会令这两个校验形同虚设（空目录时任何 ot_name 都 invalid）。
> 这是本模块唯一的外部数据依赖，建议实现第一步就确认。

`OperatorCatalogService` 仿照 `EntityCatalogService`：首次访问惰性执行一次（`ensureSeeded` 单例）——
**全新库整体播种；已播种过的老库自动回填新增字段（如 `spOf`）**，回填只补 `spOf=null` 的
行、不覆盖管理员改动、不重插被删除的行（约 121 行，仅首次访问执行一次）。
`catalogVersion` 默认取播种日期、`exists(id)` / `get(id)` / `catalog()` 只读。
命盘/星石校验需要按密探精准查询：提供 `getOperator(id): OperatorCatalogEntity?`。

---

## 6. API 设计

### 6.0 两种 API 类型（核心划分）

密探模块只对外暴露两类 API，数据边界严格分离：

| | 公共开放 API（图鉴） | 个人数据 API |
| --- | --- | --- |
| 本质 | 全局只读密探目录（"有哪些 operator"） | 个人子账号的密探养成档案 |
| 端点 | `GET /v1/operator/catalog` | `/v1/operator/**`（除 catalog）+ `/open-api/operator/**` |
| 认证 | **无需登录**（`SecurityConfig.URL_PERMIT_ALL`） | 登录 JWT，或绑定子账号的 OpenAPI token |
| 数据来源 | `operator_catalog` 集合（全局字典） | `operator_current` / `operator_records`（用户数据） |
| 包含的信息 | 密探静态属性：`id/name/alias/rarity/prof/subProf/games` + `discs`（该密探**全部可用**命盘目录）+ `spOf`（SP 形态的本体 id，普通密探为 null）。**无 starStones** —— 星石属于用户养成档案，不进公共图鉴 | 用户编辑的养成状态：`elite/starLevel/level` + **已装备的** `discs`（装备选择） + **已装备的** `starStones`（含等级 `level`） |
| 明确不含 | **任何用户数据**：不返回用户装备的星石等级、命盘装备、养成数值、`account_id`、基线时间 | 公开目录（不返回其他用户数据） |

要点：

- 公共 API 回答"**有哪些 operator、长什么样**"（图鉴/字典）；个人 API 回答"**我的密探练到多少**"。
- 星石槽位与等级全是用户档案信息（目录里每个密探都是同一份 `主星石/辅星石` 模板，放了只会诱导前端当养成数据展示）→ 只进个人 API。
- 命盘同理：该密探命盘库里**有哪些**命盘（ot_name/颜色/描述）→ 公共；"我装备了初始能量+2" → 个人。
- `GET /v1/operator/catalog` 无须也不接受 `account_id`/token，返回的就是 6.0 §4.3 的只读目录接口。
- OpenAPI token 接口（`/open-api/operator/**`）也属于个人数据 API，绑定子账号后只能访问该账号数据。

### 6.1 JWT 登录接口（`/v1/operator/**`）

| 方法 | 路径 | 说明 | 认证 |
| ---- | ---- | ---- | ---- |
| POST | `/v1/operator/accounts` | 创建子账号（`{name}`） | JWT |
| GET | `/v1/operator/accounts` | 子账号列表 | JWT |
| PATCH | `/v1/operator/accounts/{accountId}` | 改名 | JWT |
| DELETE | `/v1/operator/accounts/{accountId}` | 删除（级联 current+records+token） | JWT |
| POST | `/v1/operator/import` | 导入 v2 文档（record 自带 account_id） | JWT |
| GET | `/v1/operator/current?account_id=&game=` | 当前养成状态 | JWT |
| GET | `/v1/operator/records?account_id=&game=&from=&to=&cursor=&limit=` | 导入记录分页 | JWT |
| DELETE | `/v1/operator/records/{recordId}?account_id=` | 删除单条记录并重放 | JWT |
| GET | `/v1/operator/export?account_id= 或 scope=all` | 导出 v2 文档 | JWT |
| GET | `/v1/operator/catalog` | 密探目录（**公开**） | 无需登录 |

- `/v1/operator/catalog` 加入 `SecurityConfig.URL_PERMIT_ALL`。
- 写入接口加 `@RequireJwt` + `@AccessLimit(times = 10, second = 60)`（与库存一致）。
- `current` 的 `game` 可选：缺省返回该账号全部 game（含通用）的文档；
  指定 game 时先读 `<account>:<game>`，缺失密探回退 `<account>:*`（6.0 §6 读取回退，只读不写）。
- `records` 的默认 `limit=50`（1..100），游标复用库存的 `(effectiveAt, recordId)` URL-safe Base64 方案。
- `export` 参数约束与库存一致：要么 `account_id`（无 scope），要么 `scope=all`（无 account_id），
  否则 `schema_validation_failed`。

### 6.2 响应形态

- `OperatorAccountResponse`：`{id, name, created_at, updated_at}`（`of()` 从实体映射，`id = accountId`）。
- `OperatorCurrentResponse`：`{user_id, account_id, game, full_baseline_at, entries, updated_at}`，
  entry 含 `{elite, star_level, level, discs, star_stones, listed_baseline_at}`。
- `OperatorImportResult`：`{accepted, duplicates, superseded, warnings}`（无 history_only；密探无增量）。
- `OperatorExportResponse`：顶层 `{format, version=2, exported_at, catalog_version, producer, accounts, records}`，
  record 即协议 record（含 account_id）。
- `OperatorCatalogResponse`（**公共开放 API 的唯一响应**）：`{format: "myshare-operator-catalog", version: 1, catalog_version, operators: [...]}`。
  每项字段（全部来自 `operator_catalog`，无用户数据）：

  | 字段 | 说明 |
  | ---- | ---- |
  | `id` | `char_xxx` 跨平台主键 |
  | `name` / `alias` | 展示名 / 搜索别名 |
  | `rarity` / `prof` / `subProf` | 稀有度 / 属性列表 / 职业列表 |
  | `games` | 该密探存在哪些版本 |
  | `discs` | **目录**命盘：`{ot_name, abbreviation?, color?, desp?}`（该密探全部可用命盘，非用户装备） |

  响应条目**不含 `starStones`**（星石属用户养成字段，见 6.0）。

  响应示例：

  ```json
  {
    "format": "myshare-operator-catalog",
    "version": 1,
    "catalog_version": "2026-08-17",
    "operators": [
      {
        "id": "char_001_yangxiu",
        "name": "杨修",
        "alias": "yangxiu yx 杨修",
        "rarity": 5,
        "prof": ["阳"],
        "subProf": ["shenji"],
        "games": ["如鸢", "代号鸢"],
        "discs": [
          { "ot_name": "初始能量+2", "abbreviation": "初始+2", "color": "金", "desp": "初始能量+2" }
        ]
      }
    ]
  }
  ```
- `OperatorRecordPageResponse`：`{items, next_cursor}`；item 含 `{account_id, record_id, record_type,
  game, snapshot_scope, effective_at, received_at, snapshot_effect, entries}`。
- `OperatorErrorResponse`：`{error: {code, message, record_id?, entry_id?}}`，与库存一致。

### 6.3 OpenAPI Token 接口（`/open-api/operator/**`）

| 方法 | 路径 | scope | 说明 |
| ---- | ---- | ---- | ---- |
| GET | `/open-api/operator/account` | 无（仅认证） | 返回 token 绑定的密探子账号 |
| GET | `/open-api/operator/current?game=` | `operator:read` | 当前状态（账号来自 token） |
| POST | `/open-api/operator/import` | `operator:write` | 导入（`restrictedAccountId = token.accountId`，越界 403） |
| GET | `/open-api/operator/export` | `operator:export` | 导出（仅该账号） |

### 6.4 权限枚举与 token 扩展

`OpenApiPermission` 新增：

```kotlin
OPERATOR_READ(code = 20001, key = "operator:read", desc = "密探数据读取"),
OPERATOR_WRITE(code = 20002, key = "operator:write", desc = "密探数据写入"),
OPERATOR_EXPORT(code = 20003, key = "operator:export", desc = "密探数据导出"),
```

`OpenApiTokenGenerateRequest.scopes` 的 `allowableValues` 扩展为 6 个 key。
`OpenApiTokenService.generate` 改造：

1. 依 scope 判定域：全部 ∈ `inventory:*` → `INVENTORY`；全部 ∈ `operator:*` → `OPERATOR`；
   混合 → 400（"scopes 不能同时包含库存与密探权限"）。
2. 按域解析账号存在性：`InventoryAccountRepository` 或 `OperatorAccountRepository`。
3. `OpenApiToken` 实体新增 `val kind: String? = null`（null 视为 `INVENTORY`，兼容已有行）。
4. `list()` 按 kind 解析账号名（kind 为 null/INVENTORY → 库存表；OPERATOR → 密探表）。
5. `revokeByAccount`：按 `(userId, accountId)` 删除不变（账号 id 唯一，密探与库存 id 命名空间
   同为 `acc_*`，删除时按业务调用方传入的域，各自删除自己的 token；两端 id 理论上不会碰撞，
   但若出现同名 id 属于不同域，删除操作只影响本域调用的账号删除场景，属可接受边界）。
6. OpenAPI 校验：`validateAuthorization` 返回 `OpenApiPrincipal(userId, accountId)` 不变，
   域识别交由控制器按权限枚举约束（operator 接口只用 operator scope）。

> ⚠️ 修改既有文件 `OpenApiToken.kt` / `OpenApiTokenService.kt` / `OpenApiTokenGenerateRequest.kt` /
> `OpenApiPermission.kt` / `OpenApiTokenController.kt`（如 scheme 文档）时，
> **不得破坏现有库存 token 流程**；库存相关测试（OpenApiTokenServiceTest 等）必须保持通过。

### 6.5 管理员管理密探公共图鉴（公共 API 的数据面）

> 公共开放 API（`GET /v1/operator/catalog`）回答"有哪些密探、长什么样"，是**全局只读图鉴**。
> "管理员管理密探公共 API" = 管理员对支撑这份公共数据的 `operator_catalog` 字典做增删改查，
> **不是**管理任何个人子账号的密探养成档案（`/v1/operator/**` 与 `/open-api/operator/**` 属个人数据 API）。

管理员端点独立命名空间 `/v1/admin/operator-catalog/**`（与个人/公共 API 严格分离）：

| 方法 | 路径 | 说明 | 认证 |
| ---- | ---- | ---- | ---- |
| GET | `/v1/admin/operator-catalog` | 管理端全量列表（**含内部字段** starStones / catalogVersion / createdAt，供管理端编辑） | JWT + 管理员 |
| POST | `/v1/admin/operator-catalog` | 新增密探目录（body = `OperatorCatalogWriteRequest`） | JWT + 管理员 |
| PUT | `/v1/admin/operator-catalog/{operatorId}` | 更新（path id 与 body id 必须一致） | JWT + 管理员 |
| DELETE | `/v1/admin/operator-catalog/{operatorId}` | 删除 | JWT + 管理员 |

要点：

- **管理员判定**：用户 `status >= 2`（`UserService.hasAdminPrivileges` / `ADMIN_STATUS`），
  与权限模型一致；非管理员统一 403 `forbidden`（OperatorErrorResponse）。
- **即时生效**：目录写操作直接改 `operator_catalog`，公共图鉴 `GET /v1/operator/catalog`、
  导入校验（`unknown_operator_id` / `invalid_disc` / `spOf` 校验）与 SP 判定随即使用新目录，
  无需刷新/重启。
- **写接口校验复用**：`OperatorCatalogService.create/update/delete` 复用公共导入的目录规则
  （id 格式、rarity 3..5、games 枚举、命盘/星石唯一、`spOf` 必须指向已存在且非自身）。
- **版本号语义**：每次增删改都会更新 `catalogVersion`（`Instant.now()` 字符串）；
  delete 由 `bumpCatalogVersion()` 挑一条剩余行回写，保证 `currentCatalogVersion()` 感知变更。
- 新增/删除不影响既有密探子账号数据（current/records 与目录解耦，按 id 关联展示）。

错误码沿用密探模块：`operator_conflict`(409)、`operator_not_found`(404)、
`schema_validation_failed`/`invalid_game`/`invalid_disc`/`invalid_star_stone`/`unknown_operator_id`(422)、
403 `forbidden`（非管理员）。

实现落点：`AdminOperatorCatalogController`（原混在 `OperatorController` 里的
`POST/PUT/DELETE /v1/operator/catalog/operators` 三个管理员端点迁移至此）、
`OperatorCatalogService.listForAdmin()`、`config/doc/OperatorApiResponses.kt`；
`OperatorExceptionHandler` 的 `assignableTypes` 覆盖新控制器。

---

## 7. 业务逻辑细则

### 7.1 导入流程（`OperatorService.import`）

镜像 `InventoryService.import`（replica set 事务 + 并发重试 `MAX_TRANSACTION_ATTEMPTS`）：

1. 整份校验（§3.5 清单）→ `validateAndSort`。
2. 预检幂等（preflight）：
   - 文档内同 `(accountId, recordId)` 重复且正文相同 → 计 duplicate；
     不同 → `record_conflict`。
   - 与库内 `(userId, accountId, recordId)` 重复且正文相同 → duplicate；不同 → `record_conflict`。
3. 事务内逐条 `applyRecord`：插入 `operator_records`；按 `snapshot_scope` 应用快照更新
   `operator_current`；统计 `accepted`/`duplicates`/`superseded`；收集 warnings。
4. 并发 `DuplicateKeyException` → 回滚重试（与库存一致）。

### 7.2 快照应用

- `applyFullSnapshot(userId, accountId, game, record)`：
  - 读 `operator_current`（`(user, account, game)`，不存在则新建，`_id = user:account:game`）。
  - 快照 entry → 新 entries（listed_baseline_at = null）。
  - 现有 entries 中 `listedBaselineAt > effective_at` 的密探保留其值（避免旧 full 覆盖新 listed）。
  - 更新 `fullBaselineAt = effective_at`。
- `applyListedSnapshot`：只写列出的密探，`listedBaselineAt = effective_at`，其余不变。
- 早于相应基线的快照只存档并 `snapshot_effect = superseded`；`full` 早于 `fullBaselineAt`、
  `listed` 全部早于各自基线时整条 superseded（对单密探粒度：`full` 以 full 基线判定，
  `listed` 逐 entry 判定，无 entry 生效则整条 superseded）。

### 7.3 导出（`OperatorService.export`）

- 每个 `(account, game)` 生成一条 `full` `operator_snapshot`（entries 覆盖该文档全部密探）。
- `record_id = "myshare:export:<exportUuid>:<accountId>:<game>"`（game 空用 `generic` 占位避免冒号歧义——
  与库存 `myshare:export:<uuid>:<account>:<type>` 的形态保持一致）。
- `accounts` 顶层携带全部导出账号 `{id, name}`。
- `scope=all`：遍历账号 × 其存在的 game；`account_id`：单账号 × 其存在的 game。
- 导出基于 `operator_current` 绝对状态，不用历史快照重算（6.1 §10）。

### 7.4 删除子账号（`OperatorAccountService.delete`）

事务内：`deleteAllByUserIdAndAccountId`（current、records）→ `tokenService.revokeByAccount(userId, accountId, kind=OPERATOR)` → 删账号。
**密探与库存账号删除互不影响**（各自的表，各自的数据）。

### 7.5 删除单条记录并重放（`OperatorService.deleteRecord`）

镜像库存：事务内删除记录 → 删除该 `(account, game)` 的 current 文档 → 将剩余记录按
`(game, effectiveAt)` 升序重放重建 current，回写每条 `snapshot_effect`。

### 7.6 当前状态查询（`OperatorService.current`）

- `game` 指定：读 `(account, game)`，缺失密探回退 `(account, *)`（读取层合并，不落库）。
- `game` 缺省：返回该账号全部 game 文档。

---

## 8. 文件清单（新增 / 修改）

### 8.1 新增（镜像库存目录结构）

`src/main/kotlin/com/lhs/share/`

| 文件 | 职责（镜像自） |
| ---- | ---- |
| `hub/repository/entity/OperatorAccount.kt` | 账号实体（InventoryAccount） |
| `hub/repository/entity/OperatorCurrent.kt` | 当前状态实体 + OperatorEntry/Disc/StarStone（InventoryCurrent/StockEntry） |
| `hub/repository/entity/OperatorRecord.kt` | 记录实体（InventoryRecord + RecordEntry/ProducerInfo 复用） |
| `hub/repository/entity/OperatorCatalogEntity.kt` | 目录实体（EntityCatalogEntity 的密探增强版） |
| `hub/repository/OperatorAccountRepository.kt` | 账号仓储（InventoryAccountRepository） |
| `hub/repository/OperatorCurrentRepository.kt` | 当前状态仓储（InventoryCurrentRepository） |
| `hub/repository/OperatorRecordRepository.kt` | 记录仓储（InventoryRecordRepository） |
| `hub/repository/OperatorCatalogRepository.kt` | 目录仓储（EntityCatalogRepository） |
| `hub/service/operator/OperatorAccountService.kt` | 账号 CRUD + 上限（InventoryAccountService） |
| `hub/service/operator/OperatorCatalogService.kt` | 目录播种/校验/查询（EntityCatalogService 增强） |
| `hub/service/operator/OperatorService.kt` | 导入/导出/查询/删除重放（InventoryService，去掉 reward 分支） |
| `hub/service/operator/OperatorApiException.kt` | 模块异常（InventoryApiException） |
| `hub/controller/operator/OperatorController.kt` | JWT 接口（InventoryController） |
| `hub/controller/operator/request/OperatorAccountRequest.kt` | 账号请求（InventoryAccountRequest） |
| `hub/controller/operator/request/OperatorImportRequest.kt` | 导入请求 + OperatorRecordRequest/EntryRequest（InventoryImportRequest 族） |
| `hub/controller/operator/request/OperatorExchangeOpenApiSchemas.kt` | OpenAPI 条件 schema（InventoryExchangeOpenApiSchemas，去掉 reward 变体） |
| `hub/controller/operator/response/OperatorAccountResponse.kt` | 账号响应 |
| `hub/controller/operator/response/OperatorCurrentResponse.kt` | 当前状态响应 |
| `hub/controller/operator/response/OperatorImportResult.kt` | 导入结果（无 history_only） |
| `hub/controller/operator/response/OperatorExportResponse.kt` | 导出响应 |
| `hub/controller/operator/response/OperatorCatalogResponse.kt` | 目录响应 |
| `hub/controller/operator/response/OperatorRecordPageResponse.kt` + `OperatorRecordListItemDto.kt` | 记录分页 |
| `hub/controller/operator/response/OperatorErrorResponse.kt` | 错误响应 |
| `handler/OperatorExceptionHandler.kt` | 模块异常处理（InventoryExceptionHandler，assignableTypes 指向 Operator 控制器） |
| `config/doc/OperatorApiResponses.kt` | @OperatorReadResponses/@OperatorWriteResponses/@OperatorDeleteResponses/@OperatorPublicResponses（InventoryApiResponses） |
| `openapi/OpenApiOperatorController.kt` | 第三方接口（OpenApiInventoryController） |

资源 / 测试 / 脚本：

| 路径 | 说明 |
| ---- | ---- |
| `src/main/resources/operator/operators.json` | 完整密探目录（§5，外部依赖） |
| `src/test/resources/operator-exchange-v2.schema.json` | 协议 v2 JSON Schema（对照 inventory-exchange-v2.schema.json 改写） |
| `src/test/kotlin/com/lhs/share/hub/service/operator/OperatorAccountServiceTest.kt` | 账号服务单测 |
| `src/test/kotlin/com/lhs/share/hub/service/operator/OperatorCatalogServiceTest.kt` | 目录服务单测 |
| `src/test/kotlin/com/lhs/share/hub/service/operator/OperatorServiceTest.kt` | 导入/导出/重放单测（镜像 InventoryServiceTest 的 mock 手法） |
| `src/test/kotlin/com/lhs/share/openapi/OperatorControllerContractTest.kt` | 控制器契约测试 |
| `src/test/kotlin/com/lhs/share/openapi/OperatorOpenApiContractTest.kt` | OpenAPI 文档契约测试（镜像 InventoryOpenApiContractTest） |
| `src/test/kotlin/com/lhs/share/openapi/OpenApiOperatorTokenServiceTest.kt` | token 域扩展测试 |
| `scripts/operator-smoke.sh` | 联调冒烟（镜像 inventory-smoke.sh） |

### 8.2 修改（现有文件，谨慎改动）

| 文件 | 改动 |
| ---- | ---- |
| `src/main/kotlin/com/lhs/share/openapi/OpenApiPermission.kt` | 新增 OPERATOR_READ/WRITE/EXPORT |
| `src/main/kotlin/com/lhs/share/openapi/OpenApiTokenService.kt` | generate 按 scopes 分域；list 按 kind 解析账号名 |
| `src/main/kotlin/com/lhs/share/openapi/OpenApiTokenController.kt` | 无逻辑改动（可能仅文档注解） |
| `src/main/kotlin/com/lhs/share/hub/repository/entity/OpenApiToken.kt` | 新增 `val kind: String? = null`（null=INVENTORY 兼容） |
| `src/main/kotlin/com/lhs/share/controller/request/openapi/OpenApiTokenGenerateRequest.kt` | scopes allowableValues 增加 operator 三键 |
| `src/main/kotlin/com/lhs/share/config/security/SecurityConfig.kt` | `URL_PERMIT_ALL` 增加 `/v1/operator/catalog` |
| `src/main/kotlin/com/lhs/share/config/doc/SpringDocConfig.kt` | 如需 operator 条件 schema 定制器（若照搬库存的 snapshot_scope 条件，则新增 OperatorSchema 定制器） |
| `README.md` | 增加"密探联调 Smoke Test"小节（镜像库存小节） |

---

## 9. 测试计划

### 9.1 单元测试（镜像库存测试写法）

- **OperatorAccountServiceTest**：创建（含重名 409、超限 429/409）、列表、改名、删除级联（mock 仓储+tokenService 验证调用顺序）。
- **OperatorCatalogServiceTest**：播种幂等、exists/get/catalog 只读、目录版本。
- **OperatorServiceTest**（核心，覆盖 6.0 §10 验收用例 + 子账号用例）：
  1. 同 (user,account,record_id) 导入两次 → 只更新一次，第二次 duplicates。
  2. 同 (user,account,record_id) 不同正文 → record_conflict。
  3. 不同账号相同 record_id → 互不影响，各自处理。
  4. `full` 未列出密探从当前表中移除；`listed` 不影响未列出。
  5. 最新快照覆盖旧快照；旧快照 superseded。
  6. `game: 如鸢` 不影响 `代号鸢` 状态。
  7. `game ∈ games` 校验 → invalid_game。
  8. rarity/prof/subProf 冲突以目录为准 + warning。
  9. ot_name 不在目录 → invalid_disc；type 非法 → invalid_star_stone。
  10. 通用记录（game 空）在具体版本缺失时回退读取。
  11. `unknown_account_id`；restrictedAccountId 下跨账号记录 → account_scope_mismatch。
  12. 删除子账号级联清除 current+records；删除单条记录重放后状态等价于该记录从未导入。
  13. 导出：scope=all 含多账号多 game；单账号导出可整份回传导入并还原。

### 9.2 契约测试

- **OperatorControllerContractTest**：MVC 级别，含 JWT 认证模拟，账号 CRUD + 导入/导出/当前/记录路径与错误状态码。
- **OperatorOpenApiContractTest**：断言 /v3/api-docs 里 operator 路径存在、security scheme、
  import request version=2 且 records required 含 account_id、开单账号 schema 枚举、错误响应存在、
  `/v1/operator/catalog` 无 security、export response 非 ApiResult 包装（镜像
  InventoryOpenApiContractTest 的断言手法），并跑 `assertLocalReferencesResolve`。
- **OpenApiOperatorTokenServiceTest**：operator scope 生成 token、kind 落库、list 解析 operator 账号名、
  混合 scope 拒绝、旧 token（kind=null）按 inventory 解析（回归）。

### 9.3 既有测试回归

- 全量运行 `./gradlew test` 与 `./gradlew ktlintCheck`；
- 特别回归 `OpenApiTokenServiceTest`、`InventoryOpenApiContractTest`（token 枚举与 scopes 断言可能受影响，
  若 `allowableValues` 断言写死 3 个 key，需同步更新断言为 6 个）。

---

## 10. 冒烟脚本 `scripts/operator-smoke.sh`

镜像 `inventory-smoke.sh`：

1. 环境变量 `OPERATOR_API_TOKEN`（必填）。
2. GET `/open-api/operator/account` 取绑定账号。
3. GET `/v1/operator/catalog` 取首个密探 id/name/catalog_version。
4. 构造 v2 文档（version=2，record 带 account_id，snapshot_scope=listed，一条 entry）导入。
5. 断言：首导 accepted=1；重复导 duplicates=1；改正文 → 409 record_conflict。
6. GET `/open-api/operator/current?game=如鸢` 断言养成字段生效。
7. GET `/open-api/operator/export` 断言 format/version/accounts/records。
8. 导出文档整份回传导入：accepted ≥1。
9. 不打印 token。

---

## 11. 验收清单（合入前）

- [ ] 全部新增/修改文件按 §8 落地，包结构、命名、注释风格与库存一致（Kotlin + KDoc 中文注释）。
- [ ] 仓储位于 `com.lhs.share.hub.repository` 顶层包（HubMongoConfig 扫描铁律）。
- [ ] `./gradlew test` 全绿（含既有库存回归）。
- [ ] `./gradlew ktlintCheck` 通过。
- [ ] local profile 起服务后 `scripts/operator-smoke.sh` 通过。
- [ ] `/v3/api-docs` 中 operator 路径齐全、契约测试通过。
- [ ] `/v1/operator/catalog` 匿名可访问；其余 operator 路径需 JWT/Token。
- [ ] 删除子账号后：`operator_current`/`operator_records` 清空、绑定 token 吊销、其他账号数据不受影响。
- [ ] 库存模块行为与测试**全部保持不变**（token 改造兼容旧行）。

## 12. 建议实施顺序

1. **目录**：确认 `operator/operators.json` 完整数据来源（外部依赖，最先阻塞项）→ OperatorCatalogEntity/Repository/Service + 资源。
2. **账号**：OperatorAccount 实体/仓储/服务/Controller CRUD + SecurityConfig 白名单。
3. **协议与数据模型**：OperatorCurrent/OperatorRecord 实体 + 仓储 + 索引。
4. **导入**：请求 DTO + OperatorService.import（校验/排序/幂等/事务/快照语义）。
5. **查询与导出**：current/records/export + 响应 DTO。
6. **删除**：删除账号级联、删除记录重放。
7. **OpenAPI 扩展**：权限枚举、token kind、OpenApiOperatorController。
8. **测试**：单测 → 契约测试 → 冒烟脚本 → 全量回归。

## 13. 风险与未决点

| 项 | 说明 | 建议 |
| ---- | ---- | ---- |
| R1 | `operator/operators.json` 完整目录数据来源未锁定 | 第一步确认 MaaYuan 仓库 `agent/operators.json`；拿不到就先用 id/name 打底并明示 discs/starStones 校验暂不可信 |
| R2 | `OpenApiToken.kind` 字段对既有行无值 | 读取时按 null=INVENTORY 兜底，不写迁移脚本 |
| R3 | 同 `account_id` 字符串可能在库存与密探域各出现一次 | 账号 id 生成用随机 uuid，碰撞概率可忽略；删除账号时按域限定操作，文档化该边界 |
| R4 | 密探 `current` 文档大小（每账号每版本几十上百密探 + discs/starStones） | 6.0 §4.1 已评估足够；若将来超限再拆分，本期不做 |
| R5 | 前端 YuanHub 侧密探页与 token 页 UI | 不在本文范围；需要时另出前端集成指南（参照 guangling-ledger 03） |

---

*附：本规划对照阅读顺序：6.0 设计（协议语义）→ 6.1 v1（字段定义）→ 本文（v2 账号化 + 仓库落地）→
库存模块源码（实现镜像）。*