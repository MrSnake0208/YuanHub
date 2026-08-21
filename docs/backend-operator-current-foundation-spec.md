# 密探当前养成后端下一批实施规格

状态：可直接实施  
目标批次：`operator_current` 客观资料底座  
目标仓库：`/home/syoius/BackEndV3-Share`  
更新时间：2026-08-21

## 1. 本批次结论

本批次不重做化极，也不重建已装备星石字段。

后端现有能力已经包括：

- `OperatorEntry.starLevel` 的存储、导入、导出和 current 响应；
- `starLevel=0` 表示未拥有，普通密探 `1..30` 表示星级与节点、`31` 表示觉醒；
- 本体与 SP 的 `starLevel` 独立保存；SP 可根据公共图鉴 `spOf` 身份把标量直接解释为星级，不生成小节点；
- `OperatorEntry.starStones` 及 `main1..main3 / assist1..assist3` 六槽校验；
- 账号 `game` 权威值与 `account_game_mismatch`；
- 公共图鉴 `special_oddity_name / oddity_schema / incomplete_fields`。

真正缺失并阻塞“当前养成”完整资料跨设备展示的能力是：

1. 最多两套、没有 active 语义的命盘组合；
2. `attack / hp / special` 三项奇闻当前值；
3. 扫描攻生观测、手动校正及其输入有效性；
4. entry 级 revision 和安全的局部校正接口；
5. v2 导入、删除记录重放时不得误删这些新增资料。

## 2. 现有字段的权威语义

### 2.1 化极继续使用 `starLevel`

数据库、站内 current API 和 v3 交换协议统一使用现有 `starLevel/star_level` 语义。

普通密探：

```text
0      = 未拥有
1..30  = 6 × (星级 - 1) + 节点 + 1
31     = 已觉醒
```

普通密探的反向适配：

```text
starLevel 1..30 -> stars = floor((starLevel - 1) / 6) + 1
starLevel 1..30 -> node  = (starLevel - 1) % 6
starLevel 30    -> 5 星 5 节点、待觉醒
starLevel 31    -> 5 星、已觉醒
```

SP 密探由公共图鉴 `spOf != null` 识别：

```text
0    = 未拥有
1..5 = 直接表示星级
```

SP 没有小节点。v3 JSON 直接输出 snake_case `star_level`，数值与站内 `starLevel` 相同；采集端按 SP 身份生成，服务端依据公共图鉴 `spOf` 再次复核。

### 2.2 `starStones` 继续表示当前已装备星石

本批次继续使用现有 `OperatorEntry.starStones`：

- 新数据只写 `main1..main3 / assist1..assist3`；
- 旧 `main / assist` 读取时归一为 `main1 / assist1`；
- 同一槽位最多一颗；
- current 响应继续返回稳定六槽摘要；
- 它表示当前装备，不表示完整星石库存或多套星石方案。

星石资产实例、快捷卸除、撤销和恢复属于后续独立批次。本批次不得为了字段改名提前引入不完整的资产模型。

## 3. 数据模型增量

在现有 `OperatorEntry` 上增量增加：

```kotlin
data class OperatorEntry(
    val elite: Int,
    val starLevel: Int,
    val level: Int,
    val discs: List<OperatorDisc> = emptyList(),          // v2 兼容镜像
    val starStones: List<OperatorStarStone> = emptyList(),
    val discLoadouts: List<OperatorDiscLoadout> = emptyList(),
    val combatStats: OperatorCombatStats? = null,
    val revision: Long = 0,
    val listedBaselineAt: Instant? = null,
    val updatedAt: Instant? = null,
)
```

实际 Kotlin 类型和空值策略应遵守后端仓库现有惯例，但需要保持以下 JSON 语义。

### 3.1 双命盘

```json
{
  "disc_loadouts": [
    {
      "id": "disc_1",
      "name": "命盘一",
      "discs": [
        { "ot_name": "技能增伤" },
        { "ot_name": "普攻强化" }
      ]
    },
    {
      "id": "disc_2",
      "name": "命盘二",
      "discs": []
    }
  ]
}
```

约束：

- 最多两套，不要求必须两套；
- 每套最多三个命盘；
- `id` 在同一密探内唯一，长度 `1..64`；
- `name` 去除首尾空格后长度 `1..64`，空值可按顺序归一为“命盘一 / 命盘二”；
- 同一套内 `ot_name` 不重复，且必须属于公共图鉴中该密探的命盘目录；
- 不接受、不保存、不返回 `active`、`is_active`、`active_disc_loadout_id` 或当前盘索引。

旧 `discs` 规则：

- 只有旧 `discs` 时，current 将其派生为第一套“命盘一”；
- 已有 `discLoadouts` 时，以它为完整真相源，`discs` 只镜像第一套供旧客户端读取；
- v2 导入更新 `discs` 时，只更新第一套，已有第二套必须保留；
- v2 的空 `discs` 可以清空第一套，但不能删除第二套；
- 删除 v2 历史记录并重放时，同样不得意外丢失第二套。

### 3.2 奇闻与攻生

奇闻保存在 `combatStats.oddities`，只接受稳定键：

```json
{
  "combat_stats": {
    "observed_attack": 8186,
    "observed_hp": 28704,
    "manual_attack": null,
    "manual_hp": null,
    "source": "scan",
    "observed_at": "2026-08-21T10:21:32+08:00",
    "observed_status": "valid",
    "combat_input_signature": "sha256:...",
    "oddities": {
      "attack": { "current": 500 },
      "hp": { "current": 2600 },
      "special": { "current": 15 }
    }
  }
}
```

规则：

- 用户数据不保存第三奇闻名称；名称和上限始终读取公共图鉴；
- 上限由服务端按目录 rarity 校验：3 星 `300/1560/9`、4 星 `305/1820/11`、5 星 `500/2600/15`；
- 请求即使携带 `max` 也只能用于诊断，不能覆盖服务端目录定义；
- 当前值必须为非负数且不超过目录上限；
- `manual_attack / manual_hp=null` 表示清除手动校正；
- `source` 至少接受 `scan | manual | imported`；
- `observed_status` 至少接受 `valid | stale | unverified | unavailable`；
- 攻生观测与等级、修为、`starLevel`、三项奇闻当前值、六槽 `starStones` 绑定；这些输入改变时，旧观测保留但必须转为 `stale`；
- 第三奇闻纯改名和 `catalog_version` 的纯文案变化不进入签名，也不使观测过期；
- 服务端不需要复制前端 Wiki 面板计算器，不持久化公式计算结果。

## 4. current 读取契约

沿用：

```http
GET /v1/operator/current?account_id={accountId}&game={game}
```

每个 entry 在现有字段基础上增加：

```json
{
  "elite": 16,
  "star_level": 27,
  "level": 90,
  "discs": [],
  "star_stones": [],
  "disc_loadouts": [],
  "combat_stats": null,
  "revision": 7,
  "listed_baseline_at": null,
  "updated_at": "2026-08-21T12:00:00Z"
}
```

兼容要求：

- 继续返回 `star_level`，v3 也使用同一标量；
- 继续返回 `star_stones`，不要求前端切换到另一个同义字段；
- `discs` 镜像第一套命盘；
- 旧 Mongo 行缺少新增字段时可直接读取并返回默认值；
- 不要求为此批次执行复杂存量迁移，可使用读取归一化或启动回填。

## 5. 安全局部校正接口

新增：

```http
PATCH /v1/operator/current/{operatorId}?account_id={accountId}&game={game}
```

请求示例：

```json
{
  "level": 90,
  "elite": 16,
  "star_level": 27,
  "disc_loadouts": [],
  "star_stones": [
    { "type": "main1", "name": "攻击力", "level": 60 },
    { "type": "assist1", "name": "生命值", "level": 50 }
  ],
  "combat_stats": {},
  "expected_revision": 7,
  "reason": "manual_correction"
}
```

契约：

- `account_id` 必须属于当前用户；`game` 必须与账号权威值一致；
- 当指定游戏记录存在但目标密探只存在于通用记录时，PATCH 必须像 GET current 的合并读取一样回退到通用记录；若两者都有该密探，优先写入指定游戏记录；不能因为指定游戏文档存在就直接返回 `operator_not_found`；
- 对历史 `game=universal` 数据，部署前可将其按账号当前权威 `game` 惰性/批量归属到具体游戏；具体游戏已有同一密探时以具体游戏记录为准，迁移必须保留 revision、双命盘、星石和 combat_stats；迁移完成前仍必须保留上述 PATCH 回退逻辑；
- 只修改请求中实际出现的顶层字段；未出现字段保持不变；
- `disc_loadouts=[]` 明确清空两套；`combat_stats` 内部字段同样按出现性合并；
- `star_stones` 出现时按六槽当前装备完整替换；传空数组明确卸除全部已装备星石，字段缺失则保留现值；
- `star_stones` 只保存装备关系与槽位，不扣库存、不写库存流水；合法槽位为 `main1..main3`、`assist1..assist3`，同一槽位最多一项；
- `manual_attack=null / manual_hp=null` 是明确清除；
- `expected_revision` 必填，冲突返回 HTTP 409 `operator_revision_conflict`；
- 校正不扣库存，不写库存流水；
- 成功返回合并后的完整 entry 和新 revision；
- `reason` 第一版只接受 `manual_correction | local_migration`；
- SP 的 `star_level` 校验按目录身份解释为直接星级；普通密探沿用现有 `0..31` 语义；
- 修改本体或 SP 的 `level / elite` 时继续沿用现有成对同步规则，双方各自的化极、命盘、星石和战斗属性保持独立；
- `star_stones` 变化与等级、修为、化极、奇闻变化一样，使已有攻生观测转为 `stale`；
- 输入改变后按第 3.2 节更新攻生观测状态。

本接口可以在内部追加审计记录，但不能通过构造旧 v2 全量 entry 来实现，因为那会清空请求中未出现的新字段。星石保存必须直接走本 PATCH，不得通过 v2 import 补发。

## 6. v2 导入与重放兼容

现有 `myshare-operator-exchange@2` 继续工作：

- `starLevel` 继续直接更新现有 `starLevel`；
- `starStones` 继续直接更新当前六槽装备；
- `discs` 只更新 `discLoadouts[0]` 的内容并镜像回兼容字段；
- 对同一密探已有的第二套命盘、`combatStats` 和 revision 不得归零；
- v2 `listed` 和 `full` 都不能因为 DTO 不含新增字段而清空新增资料；
- `full` 仍可按旧语义移除文档外密探；
- 删除历史 record 后的 replay 必须得到确定结果，并保护不属于 v2 record 的补充资料；
- `starLevel` 或星石变化后旧观测转为 `stale`；命盘不参与现有攻生公式，单独修改命盘不应使攻生观测过期。

如果现有 record 流水无法无损承载 PATCH 补充资料，应为局部校正增加独立审计记录或补充投影，而不是把扩展字段强塞进 version 2 的交换 DTO。

## 7. 本批次不做

- 不新增另一套结构化化极字段或转换层；
- 不重命名或复制 `starStones`；
- 不实现 v3 文件导入、preview/commit 或自动采集 OpenAPI；
- 不实现养成状态、特别关注聚合、目标和备注；
- 不实现星石资产库存、快捷卸除、撤销或重新装备；
- 不实现材料建议、升级预览、库存扣减或原子提升；
- 不修改公共图鉴已经完成的奇闻名称和上限语义；
- 不修改前端仓库。

## 8. 测试要求

至少覆盖：

1. 旧 current 行读取为默认 `disc_loadouts / combat_stats / revision`；
2. 双命盘数量、每套数量、重复命盘和非法目录项校验；
3. 不接受任何 active 命盘语义；
4. 旧 `discs` 派生第一套，v2 更新第一套时第二套保留；
5. PATCH 只合并出现字段，空数组和 `null` 具有明确语义；
6. revision 成功递增，旧 revision 返回 409；
7. 账号隔离、非法 `game` 和 `account_game_mismatch`；
8. SP `starLevel` 直接星级与本体独立，普通密探原有 `0..31` 测试继续通过；
9. 六槽 `starStones` 继续通过原有导入、current、export 测试；
10. 3/4/5 星奇闻上限与稳定键校验；
11. 第三奇闻改名不修改用户值、不使观测 stale；
12. 攻生输入变化使旧观测 stale，手动校正值保留；
13. v2 listed/full/import/export/delete replay 不误删新增资料；
14. 本体/SP 同步 level/elite 时，不互相覆盖化极、命盘、星石和战斗属性；
15. OpenAPI current 读取自动获得新增响应字段，但本批次没有 OpenAPI 写入扩权。

完成后运行定向测试及完整：

```bash
cd /home/syoius/BackEndV3-Share
./gradlew test
```

同时更新 Swagger/OpenAPI 和后端 README。

## 9. 完成定义

- 当前养成可从一个跨设备接口读取等级、修为、现有化极、六槽已装备星石、两套命盘、奇闻和攻生资料；
- 双命盘没有任何“当前盘”状态；
- 后端、current 和 v3 协议使用同一套 `starLevel/star_level` 编码；
- 后端没有出现 `starStones` 与同义装备字段两份互相漂移的数据；
- 局部校正不会扣库存、不会清空未提交字段，并有 revision 冲突保护；
- v2 客户端继续工作且不会误删新资料；
- 完整测试通过，README 与 OpenAPI 已同步。
