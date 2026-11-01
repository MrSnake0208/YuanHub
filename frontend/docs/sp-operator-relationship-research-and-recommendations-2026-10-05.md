# YuanHub：SP / 电影密探与本体关系调研及数据模型建议

> 状态：调研与 Review 草案，不代表已授权实施  
> 调研日期：2026-10-05  
> 适用项目：YuanHub / BackEndV3-Share  
> 目标：为后续 Codex Review、数据模型修正、招募档案与密探计算器设计提供统一语义依据。

---

## 0. 结论摘要

本轮调研后的核心结论是：

> **《代号鸢 / 如鸢》的 SP 密探，官方语义更接近“同一密探的电影形态”，而不是一张与本体毫无关系的独立角色，也不是仅改变外观的皮肤。**

更准确地说，它同时具有两层语义：

1. **角色身份层共享**：本体与电影形态属于同一密探，官方通过“切换形态”进行切换，且不能同时出战；
2. **战斗形态层独立**：电影形态具有自己的属性、职业/定位、技能体系、命盘、化极/星级成长等。

目前能确认的养成共享关系：

| 维度 | 本体 / SP 关系 | 可靠性 |
|---|---|---|
| 等级 | 共享 | 高 |
| 突破 | 共享 | 高 |
| 修为 | 共享 | 高 |
| 信赖值 | 共享 | 中高，来自官方 FAQ 镜像/转载 |
| SP 星级 / 观影成长 | 独立 | 高 |
| 命盘 | 独立 | 高 |
| 漆园蝶 / 奇闻 | 独立 | 高 |
| 技能、属性、职业定位 | 独立 | 高 |
| 星石装备 | **本轮未找到足够权威的共享/独立说明** | 未确认 |
| SP 快捷化极具体材料 | **未确认，不能套普通心纸规则** | 未确认 |

对 YuanHub 而言，最重要的结论不是“推倒现有模型重做”，而是：

> **当前 YuanHub 的“每个形态一个稳定 operator_id + SP 通过 spOf 指向本体”的模型方向基本正确，应当在现有模型上补齐语义，而不是立即做破坏性 Character/Form 全量迁移。**

当前后端已经做对了几个关键点：

- 本体和 SP 有独立 `operator_id`；
- SP 通过 `spOf` 关联本体；
- 本体与 SP 的 `level / elite（修为）` 会同步；
- `starLevel` 独立保存；
- 普通密探与 SP 使用不同的化极标量语义；
- SP 的命盘、奇闻、战斗属性等继续按各自 operator entry 保存；
- `starLevel=0` 用于表示“未拥有”，避免共享等级/修为导致误判拥有。

本轮 Review 建议优先关注的真正问题是：

1. **公共目录把 SP 的官方“电影”品质压成了 `rarity=5`，容易在 UI、招募规则和未来数据中把“电影”误解释为“绝密”；**
2. **前端库存仍通过硬编码两个 SP ID 来隐藏 SP，不具备扩展性；**
3. **前端目录归一化会丢弃后端已经返回的 `spOf`；**
4. **同一次导入如果同时写入本体与 SP 且共享字段冲突，当前同步逻辑需要重点 Review，可能出现不一致；**
5. **未来同一密探如果出现多个电影形态，当前从一个 SP 写入共享字段时只同步本体，未必同步其他兄弟形态；**
6. **养成规划若同时加入本体和 SP，可能重复计算本应共享的等级/修为资源，需要 Codex 专门检查；**
7. **SP 快捷化极当前已有已知后端风险，真实材料确认前应该继续 fail-closed。**

---

# 1. 本文档的术语

## 1.1 “SP”与“电影密探”

玩家社区通常使用：

- SP 陈登
- SP 史子眇

但本轮找到的官方/公告口径主要使用：

- **电影密探**
- **电影形态**

因此本文档约定：

- **SP**：便于工程交流的简称；
- **电影形态**：更接近官方语义的名称；
- **本体**：该密探的原始/普通形态；
- **形态**：一个可以独立拥有战斗属性、技能、命盘、化极成长等数据的 combat form；
- **身份组**：同一密探的本体与所有电影形态组成的逻辑组。

---

# 2. 调研来源与证据等级

本轮没有找到一个长期稳定、完整覆盖全部机制的官方游戏官网说明页，因此主要依据：

1. BWIKI 保存/镜像的游戏更新公告；
2. 电影密探 FAQ 的社区转载；
3. BWIKI 当前密探页、招募商店页；
4. YuanHub 当前本地实现与已有设计文档。

需要注意：

> BWIKI 与 TapTap 转载属于二手归档/转载来源，不应被当作永远正确的第一方数据库。本文对关键机制尽量使用多个来源互相印证，并明确标记未确认项。

### 2.1 主要外部资料

#### A. 2024-12-11 版本更新公告（BWIKI 镜像）

可确认：

- 收集“陈登·黍王密探之影”“史子眇·赴烛密探之影”解锁电影形态；
- 在原密探角色页面通过“切换形态”进入电影形态；
- 电影形态继承原密探的等级、突破、修为；
- 队伍中的形态会随切换一起变化。

来源：

- https://wiki.biligame.com/yuan/%E5%85%AC%E5%91%8A-2024%E5%B9%B412%E6%9C%8811%E6%97%A5

#### B. “电影密探 FAQ”转载

可确认：

- 电影密探是密探的“全新形态”；
- 解锁后从原密探培养页面切换；
- 等级、修为阶段、信赖值共用；
- 观影状态、命盘、漆园蝶独立；
- 原形态与电影形态不可同时上阵。

来源：

- https://www.taptap.cn/moment/614922876142748286

#### C. BWIKI 当前密探页

陈登·黍王：

- 品质：电影；
- 属性：阳；
- 职业：神纪。

史子眇·赴烛：

- 品质：电影；
- 属性：混沌；
- 职业：岐黄。

来源：

- https://wiki.biligame.com/yuan/%E9%99%88%E7%99%BB%C2%B7%E9%BB%8D%E7%8E%8B
- https://wiki.biligame.com/yuan/%E5%8F%B2%E5%AD%90%E7%9C%87%C2%B7%E8%B5%B4%E7%83%9B

#### D. BWIKI 招募商店

可确认：

- “电影”与“绝密 / 机密”一样有自己的完整星级成长；
- 当前电影密探满星为 5 星；
- 电影密探碎片/密探之影具有独立的解锁和兑换逻辑；
- 电影形态不是把本体五星状态直接复制成 SP 五星。

来源：

- https://wiki.biligame.com/yuan/%E6%8B%9B%E5%8B%9F%E5%95%86%E5%BA%97

---

# 3. 电影形态与本体的真实关系

## 3.1 不是“完全独立的新角色”

如果它是完全独立的新角色，通常应该满足：

- 单独进入密探列表；
- 两者可同时编队；
- 等级/修为从零重新培养；
- 原本体的变化不影响 SP。

实际机制恰好相反：

- 从本体培养页进行形态切换；
- 两种形态不能同时上阵；
- 等级、突破、修为继承/共享；
- 队伍形态随切换一起变化。

因此：

> **“陈登”和“陈登·黍王”是一个角色身份下的两个战斗形态。**

---

## 3.2 也不是“皮肤”

如果只是皮肤，通常战斗数据不会变化。

但电影形态拥有自己的：

- 品质；
- 属性；
- 职业/定位；
- 技能；
- 天赋；
- 命盘；
- 化极成长；
- 密探之影 / 碎片获取；
- 相关故事内容。

例如：

```text
陈登
  原形态：普通陈登
  电影形态：陈登·黍王

史子眇
  原形态：普通史子眇
  电影形态：史子眇·赴烛
```

因此更合适的领域模型是：

```text
角色身份 Character Identity
└── 战斗形态 Combat Form
    ├── 本体
    └── 电影形态
```

而不是：

```text
角色 A
角色 B
```

也不是：

```text
角色 A
└── 皮肤
```

---

# 4. 共享数据与独立数据

## 4.1 已确认共享

### 等级

本体与电影形态共享/继承等级。

因此：

```text
普通陈登 100 级
→ 解锁陈登·黍王
→ 黍王不应该从 1 级重新练
```

YuanHub 当前同步 `level` 的方向是正确的。

---

### 突破

公告明确提到电影形态继承突破。

但 YuanHub 当前 `OperatorEntry` 并没有一个独立名为 `breakthrough` 的字段。

因此本文**不建议为了“概念完整”立刻新增字段**。

应先确认游戏里的“突破”目前在 YuanHub 数据中是否：

- 已被等级阶段隐式表达；
- 根本没有产品需求；
- 后续计算器需要单独建模。

只有真实产品需求出现后再建字段。

---

### 修为

本体与电影形态共享修为。

YuanHub 当前使用：

```text
elite
```

表达修为。

后端已经实现本体和 SP 的 `elite` 同步，这一点与游戏机制一致。

---

### 信赖

FAQ 说明密探信赖值共享。

但当前 YuanHub 的主要养成模型没有正式维护信赖值。

因此：

> 记录为领域事实即可，不建议现在为了 SP 专门增加信赖字段。

未来如果 YuanHub 增加信赖系统，应放在“身份组共享数据”而不是形态独立数据中。

---

## 4.2 已确认独立

### SP 星级 / 观影成长

这是最容易误解的一项。

本体五星：

```text
≠
SP 五星
```

一个合理状态完全可以是：

```text
陈登：五星/觉醒
陈登·黍王：二星
```

与此同时：

```text
等级：100
修为：17
```

仍然共享。

因此 YuanHub 当前把：

```text
base.starLevel
sp.starLevel
```

分别保存是正确的。

---

### 命盘

FAQ 明确电影形态命盘独立。

两种形态的命盘池本身也不同。

因此：

- `discLoadouts` 应继续按形态存储；
- 不能把本体命盘自动复制到 SP；
- 不能把本体命盘当作 SP 的默认盘。

当前 YuanHub 每个 `operator_id` 独立保存命盘，方向正确。

---

### 漆园蝶 / 奇闻

FAQ 明确漆园蝶独立。

YuanHub 当前的：

```text
combatStats.oddities
```

按 operator entry 独立存储，这与机制一致。

---

### 技能、天赋、属性、职业

电影形态是新的战斗形态，而不是外观变化，因此：

- 技能表独立；
- 天赋独立；
- 属性独立；
- 职业/从属独立；
- 战斗公式可能独立。

YuanHub 已经在本地资料中把 SP 面板规则标记为单独的：

```text
formula_family=sp
missing_rules / sp_research
```

这是合理的。

---

# 5. 本轮无法确认的项目

## 5.1 星石装备是否共享

本轮没有找到足够权威的资料说明：

> 切换电影形态时，当前已装备星石是否与本体完全共用、部分继承、还是各自独立。

因此当前最安全的工程策略是：

> **不要因为等级/修为共享，就推导星石也共享。**

YuanHub 当前 `starStones` 按每个 operator entry 存储。

在没有验证游戏真实行为以前，应保持现状。

未来如果通过游戏实测确认星石共享，再单独设计迁移。

---

## 5.2 SP 化极快捷提升具体材料

YuanHub 已有文档：

`YuanHub/docs/known-issues/backend-deferred-sp-huaji-upgrade.md`

已经明确记录：

- SP 化极消耗不能复用普通密探心纸规则；
- 后端当前通用规则存在误扣 SP 心纸的风险；
- 前端暂时隐藏 SP 快捷化极；
- 正式规则确认前应 fail-closed。

本轮外部调研只能确认：

- SP 有独立密探之影 / 碎片；
- SP 有独立星级成长；
- 不能因此推断 YuanHub 的“快捷化极”应该直接扣某一种现有库存对象。

所以：

> **不要因为 BWIKI 出现“电影密探碎片/密探之影”就擅自恢复快捷提升。**

需要真实确认：

1. 每一级的具体材料；
2. 材料稳定 ID；
3. 是否所有电影形态共用规则；
4. 是否按具体电影形态区分；
5. 跨级累计规则。

---

# 6. YuanHub 当前实现 Review

## 6.1 当前目录模型

后端：

`BackEndV3-Share/src/main/kotlin/com/lhs/share/hub/repository/entity/OperatorCatalogEntity.kt`

当前使用：

```kotlin
operatorId
name
rarity
prof
subProf
games
discs
starStones
spOf
```

其中：

```text
spOf = null
→ 普通/本体密探

spOf = 本体 operator_id
→ SP / 电影形态
```

例如：

```text
char_084_chendengsp
  spOf = char_013_chendeng

char_085_shizimiaosp
  spOf = 对应史子眇本体
```

这种关系方向本身是正确的。

---

## 6.2 当前后端已经有反向关系索引

`OperatorCatalogService.spFormsOf(baseId)`

负责：

```text
本体 ID
→ 所有 SP 形态 ID
```

这已经比“只支持固定两个 SP”更接近正确领域模型。

因此不建议为了理论上的 Character/Form 两层模型，立即替换现有 operator ID 系统。

---

## 6.3 当前共享等级 / 修为机制

`OperatorService.normalizeSpRelations(...)`

当前行为包括：

### 本体存在但 SP entry 不存在

会创建：

```text
SP:
  elite = 本体 elite
  level = 本体 level
  starLevel = 0
```

这是非常重要的正确行为。

它意味着：

> 即使用户没有 SP，YuanHub 仍然可以让该 SP 的共享等级/修为跟随本体，但用 `starLevel=0` 表示未拥有。

---

### SP 存在但本体 entry 不存在

同理会补出本体：

```text
本体:
  elite = SP elite
  level = SP level
  starLevel = 0
```

---

### 只修改其中一边

如果仅修改：

- 本体，或
- SP，

后端会把 `level / elite` 同步到关联形态。

当前 PATCH 逻辑也会对相关本体/SP执行同样同步。

因此：

> YuanHub 已经实际实现了“共享基础养成 + 独立形态成长”。

这与本轮外部调研结论高度一致。

---

## 6.4 当前拥有判定是正确的

前端：

`YuanHub/src/utils/operatorFilters.js`

已有注释：

> `starLevel=0` 是协议中的“未拥有”。等级、修为可能由 SP 本体同步，不能作为拥有依据。

并且：

```js
isOperatorOwned(entry)
→ starLevel > 0
```

这是正确且必须保留的领域不变量。

禁止未来改成：

```text
level > 0
→ 已拥有
```

否则所有共享等级产生的 SP stub 都会被误判成“已拥有”。

---

# 7. 当前数据模型最值得 Review 的问题

## P0-1：同一次导入同时出现本体与 SP 时，共享字段冲突

当前 `normalizeSpRelations` 的关键逻辑是：

```text
如果只写 SP → 同步本体
如果只写本体 → 同步 SP
```

但如果：

```text
本体和 SP 都在 writtenIds
```

则需要重点检查。

例如导入文件：

```json
[
  {
    "operator_id": "char_013_chendeng",
    "level": 100,
    "elite": 17
  },
  {
    "operator_id": "char_084_chendengsp",
    "level": 90,
    "elite": 15
  }
]
```

游戏语义上这是一个不可能同时成立的状态。

服务端应该：

### 推荐行为

在 preview / validation 阶段检测：

```text
shared_growth_conflict
```

并明确指出：

```text
同一密探身份组的 level / elite 不一致
```

而不是：

- 默默选择本体；
- 默默选择 SP；
- 依赖写入顺序；
- 两边分别保留不同值。

**这是本次 Codex Review 最重要的一项。**

---

## P0-2：SP 快捷化极必须继续 fail-closed

已有文档已经说明：

`YuanHub/docs/known-issues/backend-deferred-sp-huaji-upgrade.md`

当前后端通用规则可能：

```text
SP 化极
→ OperatorRequirementRules.huaji
→ heart
→ entity_type=agent
→ id=当前 SP operator_id
```

这会产生错误扣库语义。

因此本次 Review 应确认：

- 前端隐藏入口是否仍然存在；
- 后端是否已经真正拒绝 SP preview；
- execute 是否能绕过 preview；
- 是否还有测试在固化“SP 1→5 消耗 15 心纸”的错误规则。

这里应当把“前端隐藏”视作 UX 防护，而不是安全边界。

---

## P0-3：官方“电影”品质与内部 rarity=5 混在一起

当前资源目录中：

```text
陈登·黍王
rarity = 5

史子眇·赴烛
rarity = 5
```

但官方/BWIKI展示的品质是：

```text
电影
```

不是：

```text
绝密
```

当前 `rarity=5` 很可能实际上承担的是：

- 五星成长上限；
- 500/2600/15 奇闻上限；
- 旧 UI 稀有度筛选；
- 一些招募候选限制。

这在数值层面目前可能“刚好能用”，但语义上已经过载。

### 风险

未来代码出现：

```text
rarity == 5
→ 绝密
```

时，电影密探就会被错误展示为绝密。

更严重的是招募目录已有设计：

```text
up_agents 的真实映射只能来自同游戏 rarity=5 图鉴
```

这意味着：

> “五星数值层级”正在被当成“绝密招募身份类型”。

对电影形态未必成立。

### 推荐

保留旧字段兼容：

```json
"rarity": 5
```

但增加一个真正表达官方形态/品质语义的字段，例如：

```json
"form_kind": "movie",
"quality": "电影"
```

或：

```json
"quality_kind": "movie"
```

不要立刻重命名/删除 `rarity`，避免破坏：

- 奇闻上限；
- 过滤；
- exchange；
- 旧客户端。

---

# 8. 当前前端的扩展性问题

## P1-1：库存通过硬编码两个 SP ID 隐藏

当前：

`YuanHub/src/data/inventory/agentManifest.js`

存在：

```js
HIDDEN_AGENT_IDS = new Set([
  'char_084_chendengsp',
  'char_085_shizimiaosp'
])
```

这意味着下一位电影密探上线后：

- 后端目录可以添加；
- 但前端必须再提交代码才能隐藏；
- 测试也要继续追加 ID。

这是典型的“数据已经支持关系，UI 还在硬编码个例”。

### 推荐

让隐藏规则基于：

```text
entry.spOf != null
```

或更明确：

```text
entry.formKind == movie
```

具体是否“所有电影形态都隐藏”由库存产品语义决定，但判断不应基于固定 ID。

---

## P1-2：前端 normalizeOperatorCatalog 会丢掉 spOf

当前：

`normalizeOperatorCatalog(...)`

只保留：

```text
id
name
rarity
prof
subProf
games
```

后端公共图鉴明明已经返回：

```text
spOf
```

但经过归一化后被丢弃。

结果是：

- inventory 无法根据关系动态判断 SP；
- 未来任何前端功能想知道“这是电影形态吗”都要重新硬编码；
- 本地 fallback 与服务端目录产生语义落差。

### 推荐

至少保留：

```js
{
  id,
  name,
  rarity,
  prof,
  subProf,
  games,
  spOf
}
```

如果后端后续增加：

```text
formKind
quality
identityGroupId
```

也应一并保留。

---

## P1-3：生成的前端 fallback catalog 缺少 SP 关系

当前：

`YuanHub/src/data/inventory/catalog.js`

有：

```text
char_084_chendengsp
char_085_shizimiaosp
```

但生成结果里没有：

```text
spOf
```

而后端资源：

`BackEndV3-Share/src/main/resources/operator/operators.json`

已经有 `spOf`。

这会让：

```text
联网公共目录
```

和：

```text
前端本地 fallback 目录
```

对 SP 的理解不同。

### 推荐

Codex Review 生成链：

```text
上游 operators JSON
→ build-inventory-catalog
→ AGENT_CATALOG
→ normalizeOperatorCatalog
```

确认 `spOf` 能完整传播。

---

# 9. 面向未来多个电影形态的问题

当前两位本体都只有一个电影形态，所以很多问题暂时没有暴露。

但当前后端模型本身已经允许：

```text
base
→ List<SP>
```

因此应提前保证：

```text
一个本体
→ 多个电影形态
```

仍然正确。

---

## 9.1 当前从本体修改共享字段

本体 PATCH：

```text
spFormsOf(base)
→ 同步所有 SP
```

这对多形态是正确方向。

---

## 9.2 当前从一个 SP 修改共享字段

当前逻辑大意：

```text
SP
→ relatedIds = [base]
```

如果未来：

```text
本体 A
├── SP A1
└── SP A2
```

修改：

```text
SP A1.level
```

只同步本体后，是否会继续让：

```text
SP A2
```

同步，需要专门 Review。

### 推荐领域不变量

任何共享字段写入应该作用于整个身份组：

```text
Identity Group:
  base
  + all forms
```

而不是只作用于：

```text
当前形态 ↔ 本体
```

---

# 10. 推荐的目标领域模型

## 10.1 不建议立即进行破坏性 Character/Form 重构

理论上最标准的模型是：

```text
Character
└── Forms[]
```

但 YuanHub 目前：

- v2/v3 协议；
- current API；
- 招募；
- 库存；
- 收藏；
- 养成规划；
- 自动采集；
- 面板计算；
- 管理图鉴；

都已经广泛依赖稳定 `operator_id`。

因此不值得为了“模型漂亮”立即把数据库重构成两张全新实体表。

---

## 10.2 推荐：保留 operator_id，补上身份组语义

### 每个可战斗形态继续有自己的 ID

例如：

```text
char_013_chendeng
char_084_chendengsp
```

这两个 ID 继续作为：

> **Combat Form ID**

它们仍然可以被：

- 招募记录引用；
- 扫描引用；
- 命盘引用；
- 战斗公式引用；
- SP 星级引用。

---

## 10.3 继续保留 spOf

```json
{
  "id": "char_084_chendengsp",
  "sp_of": "char_013_chendeng"
}
```

这是兼容成本最低的做法。

但可以增加派生语义：

```json
{
  "id": "char_084_chendengsp",
  "sp_of": "char_013_chendeng",
  "identity_group_id": "char_013_chendeng",
  "form_kind": "movie",
  "quality": "电影"
}
```

本体：

```json
{
  "id": "char_013_chendeng",
  "sp_of": null,
  "identity_group_id": "char_013_chendeng",
  "form_kind": "base"
}
```

其中：

### identity_group_id

可以是**服务端派生字段**，不一定入库：

```text
如果 spOf != null
  identityGroupId = spOf
否则
  identityGroupId = id
```

这样无需新建 Character 表。

---

# 11. 推荐字段归属

## 11.1 身份组共享字段

```text
Identity Shared
├── level
├── elite / 修为
├── breakthrough（若未来正式建模）
└── trust（若未来正式建模）
```

当前实际只需要：

```text
level
elite
```

不要为了理论模型先加暂时不用的字段。

---

## 11.2 形态独立字段

```text
Form Local
├── owned / starLevel
├── prof
├── subProf
├── quality / form kind
├── skills
├── talents
├── discLoadouts
├── oddities
├── combatStats
├── SP/movie growth
└── formula family
```

星石目前先保留：

```text
Form Local（暂定）
```

并明确标记：

> 未经游戏机制确认，不得推导共享。

---

# 12. 当前“复制共享字段”的存储方式是否要改

当前数据库是：

```text
operator_current.entries[base]
  level
  elite

operator_current.entries[sp]
  level
  elite
```

也就是物理上复制，业务逻辑保持同步。

这不是最纯粹的范式化设计，但当前阶段**可以保留**。

原因：

1. 对旧 API 完全兼容；
2. v2/v3 export 很容易；
3. 前端无需理解身份组再组合；
4. 当前只有少量共享字段；
5. 修改成本远低于引入新的 identity current collection。

### 推荐

短中期：

> **继续保存镜像值，但加强不变量校验。**

只有未来共享字段显著增加，例如：

- 突破；
- 信赖；
- 共用装备；
- 多个电影形态大量出现；

再考虑独立：

```text
operator_identity_current
```

作为统一真相源。

---

# 13. 导入 / 导出的推荐语义

## 13.1 v3 不需要立即改 star_level

当前已经定义：

### 普通密探

```text
0 = 未拥有
1..30 = 五星 × 六节点编码
31 = 觉醒
```

### SP

```text
0 = 未拥有
1..5 = 直接表示星级
```

该设计与当前游戏机制相符。

不建议另建：

```text
sp_star
movie_star
```

等重复字段。

---

## 13.2 共享字段冲突必须有明确规则

推荐 v3 preview：

如果同一 identity group 的多个 entry 同时提供：

```text
level
elite
```

且数值相同：

```text
→ accepted
```

如果不同：

```text
→ review/rejected
→ shared_growth_conflict
```

不要由数组顺序决定。

---

## 13.3 导出可以继续冗余共享字段

为了兼容第三方：

```json
[
  {
    "operator_id": "base",
    "level": 100,
    "elite": 17
  },
  {
    "operator_id": "sp",
    "level": 100,
    "elite": 17
  }
]
```

完全可以接受。

关键不是“不重复”，而是：

> **服务端必须保证同一 identity group 的共享字段永远一致。**

---

# 14. 招募档案的影响

## 14.1 不应简单把“电影”视为绝密

当前招募目录设计中存在：

```text
up_agents 的 operator_id
必须来自同游戏 rarity=5 图鉴
```

这需要 Review。

因为：

```text
rarity=5
```

目前混合表达了：

- 绝密；
- 电影。

### 推荐

招募候选应考虑：

```text
acquisition kind / form kind / pool kind
```

而不是只有：

```text
rarity == 5
```

例如未来可以明确：

```text
standard_up
limited_up
movie_shadow
```

具体枚举必须依据实际卡池规则，不要现在凭空造完整系统。

本次至少要让 Codex 确认：

> 当前管理员映射规则会不会错误地把电影形态当成普通绝密 UP 候选。

---

## 14.2 抽取记录应以形态 operator_id 为单位

如果卡池直接产出：

```text
陈登·黍王密探之影
```

那么招募记录仍然应该指向：

```text
char_084_chendengsp
```

而不是只记录：

```text
char_013_chendeng
```

因为：

- 本体和 SP 的拥有状态不同；
- SP 星级独立；
- 后续统计需要区分获得了哪一种形态。

---

# 15. 库存 / 心纸系统的影响

当前前端隐藏 SP 是可以理解的：

> SP 的星级材料语义还没有完整进入普通心纸库存模型。

但当前实现：

```text
硬编码两个 SP ID
```

只适合作为临时措施。

### 推荐中期方案

公共目录提供：

```text
formKind=movie
```

库存目录根据：

```text
entity/acquisition semantics
```

决定是否展示。

不要继续维护：

```text
SP_ID_1
SP_ID_2
SP_ID_3
...
```

---

# 16. 养成规划的潜在重复计算问题

这是本轮本地 Review 后发现的另一个值得重点检查的点。

当前养成规划目标以：

```text
operator_id
→ level / elite / star_level
```

为单位。

如果用户同时把：

```text
陈登
陈登·黍王
```

加入计划，则：

### 星级目标

应该独立计算，没有问题。

但：

### 等级 / 修为

属于共享进度。

如果规划器分别计算：

```text
陈登 90→100
+
陈登·黍王 90→100
```

就可能把同一份等级/修为资源计算两遍。

### Codex 必须 Review

- `cultivationPlanner`
- training plan target
- 快捷提升 preview
- 资源 shortage 汇总

确认是否会：

> 对同一 identity group 的共享养成需求重复计费。

### 推荐语义

共享资源应按 identity group 计算一次：

```text
max(shared target across forms)
```

形态独立目标则分别计算：

```text
starLevel
```

如果产品层不允许同组多个形态同时加入计划，也必须显式限制，而不是靠偶然行为避免。

---

# 17. 战斗面板计算器的影响

目前 YuanHub 已经把两位 SP 归为：

```text
SP 独立研究项
formula_family=sp
missing_rules
```

这与本轮调研完全一致。

### 不要做

```text
本体公式
+
SP 星级
→ 猜 SP 面板
```

### 应该做

```text
共享输入：
  level
  elite

SP 独立输入：
  star level
  oddities
  discs
  SP-specific formula
  （星石在机制确认前继续按当前形态输入）
```

每个形态独立计算最终战斗面板。

这也是为什么：

> “共享养成”并不意味着“共享战斗面板”。

---

# 18. 推荐的公共目录响应

兼容现有字段的情况下，可以逐步演进到：

```json
{
  "id": "char_084_chendengsp",
  "name": "陈登·黍王",

  "rarity": 5,
  "quality": "电影",

  "form_kind": "movie",
  "sp_of": "char_013_chendeng",
  "identity_group_id": "char_013_chendeng",

  "prof": ["阳"],
  "sub_prof": ["神纪"],
  "games": ["如鸢", "代号鸢"]
}
```

注意：

- `rarity` 暂时保留，兼容旧系统；
- `quality` 负责用户/游戏语义；
- `form_kind` 负责工程规则；
- `identity_group_id` 可以派生，不必入库；
- `sp_of` 保留现有契约。

是否三个新字段都需要永久存在，应由 Codex Review 后按 KISS 决定。

最小充分实现可能只需要：

```text
spOf
+
derived formKind
+
quality
```

---

# 19. 建议实施优先级

## 阶段 0：只 Review 与补不变量测试

先不改模型。

检查：

1. 本体 → SP level/elite 同步；
2. SP → 本体 level/elite 同步；
3. 本体 + SP 同时导入且值一致；
4. 本体 + SP 同时导入且值冲突；
5. v2 import；
6. v3 preview / commit；
7. current PATCH；
8. starLevel=0 stub 是否被错误识别为 owned；
9. 同步共享字段后战斗观测是否正确 stale；
10. 删除 / replay 是否保持关系。

---

## 阶段 1：目录语义补全

优先解决：

- 前端保留 `spOf`；
- fallback catalog 保留 `spOf`；
- 移除固定两个 SP ID 的业务依赖；
- 增加“电影”与 `rarity=5` 的语义区分。

这是低迁移成本、高收益的一步。

---

## 阶段 2：共享进度不变量加固

实现：

- identity group helper；
- 冲突检测；
- 多 SP sibling 同步；
- training/cultivation 去重共享需求。

仍然不需要重建数据库。

---

## 阶段 3：SP 专属成长材料

只有当真实游戏规则确认后才做：

- SP 快捷化极；
- 对应库存材料；
- preview；
- execute；
- 消耗流水；
- exchange / backup 表达。

---

# 20. 建议的代码级不变量

后续实现最好把下面这些直接写成测试。

## Invariant A：共享字段一致

对任意 identity group：

```text
all forms.level are equal
all forms.elite are equal
```

---

## Invariant B：拥有状态独立

```text
base.starLevel > 0
```

不能推出：

```text
sp.starLevel > 0
```

反之亦然。

---

## Invariant C：形态成长独立

下面字段不能因共享同步自动覆盖：

```text
starLevel
discLoadouts
oddities
combatStats
```

星石是否列入该 invariant，等真实机制确认。

---

## Invariant D：共享字段变更使相关观测过期

如果战斗观测依赖：

```text
level
elite
```

那么任一形态修改这些值后：

```text
相关形态 combat observation
→ stale
```

需要检查目前是否所有兄弟形态都被正确 stale。

---

## Invariant E：未知 SP 材料不得扣库

在真实规则接入前：

```text
SP + huaji quick upgrade
→ reject
```

绝不能：

```text
→ generic heart paper deduction
```

---

# 21. Codex Review 清单

请本次 Codex 不要直接照本文改代码，先针对以下问题给出 Review 结论。

## A. 后端共享同步

- [ ] `normalizeSpRelations` 在同一次 record 同时包含 base + SP 时是否允许冲突 level/elite 落库？
- [ ] v2 full / listed import 是否存在上述问题？
- [ ] v3 preview/commit 同一文档多 entry 时最后写入顺序是否可能改变结果？
- [ ] current PATCH 从 SP 写 level/elite 时，未来存在 sibling SP 是否全部同步？
- [ ] materialize zero-star related entry 是否在所有入口一致？
- [ ] delete/replay 后共享字段是否仍保持一致？

## B. revision / stale

- [ ] 同步 related entry 是否一定增加其 revision？
- [ ] level/elite 变化是否让 base/SP 相关 combat observation 全部 stale？
- [ ] preview 的 revision 与同步产生的 related revision 是否有并发风险？

## C. catalog

- [ ] 后端公共 catalog 是否所有入口都返回 `spOf`？
- [ ] Admin create/update 是否阻止非法循环关系，而不只是 self-reference？
- [ ] 是否可能出现 SP → SP 的链式 `spOf`？
- [ ] 是否应该限制 `spOf` 必须指向 base，而不是另一个 SP？
- [ ] fallback catalog 的生成链为什么丢失 `spOf`？
- [ ] `normalizeOperatorCatalog` 为什么丢失 `spOf`？

## D. quality / rarity

- [ ] 全仓搜索所有 `rarity == 5` / “绝密”假设；
- [ ] 哪些地方实际上需要“数值 tier=5”？
- [ ] 哪些地方真正需要“官方品质=绝密”？
- [ ] 电影密探当前是否会在 UI 被错误显示为“绝密”？
- [ ] `OperatorOddityRules` 使用 rarity=5 给 SP 500/2600/15 是否只是数值 tier，是否应解耦展示品质？

## E. recruitment

- [ ] recruitment admin 的 “同游戏 rarity=5”候选约束是否错误包含电影形态？
- [ ] 已有电影形态是否进入普通卡池候选搜索？
- [ ] 未来“电影密探之影”卡池是否需要单独 acquisition/pool kind？
- [ ] 招募记录是否能稳定保存具体 SP operator_id？

## F. inventory

- [ ] `HIDDEN_AGENT_IDS` 是否可以改成数据驱动；
- [ ] 当前 SP 是否可能被错误生成普通心纸库存项；
- [ ] backend inventory catalog 与 frontend fallback 对 SP 的语义是否一致；
- [ ] 在 SP 材料规则未确认前是否应该继续不展示普通心纸编辑入口。

## G. cultivation / training

- [ ] 本体和 SP 同时加入养成规划时，level/elite 资源是否会重复计算；
- [ ] starLevel 是否仍应分别计算；
- [ ] shared stock 分配是否会把同一个共享需求当成两位密探；
- [ ] training targets 是否应该在 identity group 内合并 shared target；
- [ ] 如果不支持同组多形态同时规划，是否有显式产品约束。

## H. exchange / scan

- [ ] v3 SP 样例是否与当前 schema 和后端验证完全一致；
- [ ] scan 同时识别本体与 SP 时是否产生 shared conflict；
- [ ] `star_level 0..5` 是否所有边界统一；
- [ ] SP 的命盘/奇闻是否始终使用各自 catalog；
- [ ] 导出是否可能产生 base/SP 不一致的 level/elite。

---

# 22. 本次不建议做的事情

## 不建议 1：立即引入全新 Character 表并迁移全部 operator_id

成本过高，当前没有足够收益。

---

## 不建议 2：把 SP 当普通独立密探，删除 spOf

会破坏共享等级/修为的真实机制。

---

## 不建议 3：把 SP 当皮肤

会破坏：

- 星级；
- 命盘；
- 奇闻；
- 技能；
- 属性；
- 战斗公式。

---

## 不建议 4：把电影品质继续简单等同绝密

`rarity=5` 可以暂时保留为兼容数值 tier，但用户语义应有单独的“电影”。

---

## 不建议 5：在没有实测前改变星石共享关系

当前证据不足。

---

## 不建议 6：根据猜测恢复 SP 快捷化极

必须等真实材料规则确认。

---

# 23. 推荐最终模型示意

```text
Identity Group: 陈登
│
├── Shared Growth
│   ├── level = 100
│   ├── elite = 17
│   ├── breakthrough = （未来如需要）
│   └── trust = （未来如需要）
│
├── Form: char_013_chendeng
│   ├── formKind = base
│   ├── quality = 机密/原品质
│   ├── starLevel = 本体独立
│   ├── prof = 风
│   ├── discs = 本体命盘
│   ├── oddities = 本体漆园蝶
│   └── combatStats = 本体面板
│
└── Form: char_084_chendengsp
    ├── formKind = movie
    ├── quality = 电影
    ├── spOf = char_013_chendeng
    ├── starLevel = SP 独立
    ├── prof = 阳
    ├── discs = SP 命盘
    ├── oddities = SP 漆园蝶
    └── combatStats = SP 面板
```

数据库当前不需要真的拆成上述两层。

可以继续：

```text
entries[char_013_chendeng]
entries[char_084_chendengsp]
```

只要后端把 shared invariants 做牢。

---

# 24. 给本次 Codex 的建议任务说明

建议把本文直接交给 Codex，并使用类似指令：

```text
请先完整阅读：

YuanHub/docs/sp-operator-relationship-research-and-recommendations-2026-10-05.md

然后只进行 Review，不要直接实施。

请结合当前 YuanHub 与 BackEndV3-Share 实际代码，逐项验证文档第 21 节的 Review 清单，
重点确认：

1. base/SP 同时导入时是否存在共享 level/elite 冲突落库；
2. 多电影形态下共享字段传播是否完整；
3. rarity=5 是否被错误等同于“绝密”；
4. frontend catalog 的 spOf 是否在归一化/本地 fallback 中丢失；
5. recruitment 的 rarity=5 候选规则是否错误包含电影形态；
6. cultivation/training 是否会重复计算本体与 SP 的共享 level/elite 资源；
7. SP 快捷化极后端是否仍存在绕过前端隐藏入口的错误扣库风险。

请按严重度输出：
- 已确认问题；
- 非问题/已有保护；
- 需要产品确认；
- 需要外部游戏机制确认；
- 推荐的最小修改范围；
- 受影响文件与测试；
- 是否需要数据迁移。

不要因为文档建议而进行大规模 Character/Form 重构。
以当前代码和测试为准，优先最小兼容性修正。
```

---

# 25. 本地现有相关文件索引

### 核心目录与关系

- `BackEndV3-Share/src/main/kotlin/com/lhs/share/hub/repository/entity/OperatorCatalogEntity.kt`
- `BackEndV3-Share/src/main/kotlin/com/lhs/share/hub/service/operator/OperatorCatalogService.kt`
- `BackEndV3-Share/src/main/resources/operator/operators.json`

### 当前养成与共享同步

- `BackEndV3-Share/src/main/kotlin/com/lhs/share/hub/repository/entity/OperatorCurrent.kt`
- `BackEndV3-Share/src/main/kotlin/com/lhs/share/hub/service/operator/OperatorService.kt`
- `BackEndV3-Share/src/main/kotlin/com/lhs/share/hub/service/operator/OperatorV3ImportService.kt`

### 协议

- `YuanHub/docs/operator-growth-data-exchange-protocol-v3.md`
- `YuanHub/docs/exchange-specs/operator-v3.md`
- `YuanHub/docs/examples/operator-growth-exchange-v3/scan-sp.valid.json`

### 前端目录 / 过滤

- `YuanHub/src/data/inventory/catalog.js`
- `YuanHub/src/data/inventory/agentManifest.js`
- `YuanHub/src/utils/operatorFilters.js`
- `YuanHub/test/agentManifest.test.js`

### 已知 SP 问题

- `YuanHub/docs/known-issues/backend-deferred-sp-huaji-upgrade.md`

### 面板研究

- `YuanHub/docs/future-work/operator-combat-data-coverage-2026-08-23.md`

### 养成规划

- `YuanHub/src/data/cultivationPlanner.js`
- `YuanHub/docs/operator-training-plans.md`

### 招募目录

- `.trellis/tasks/10-01-recruitment-admin-catalog/design.md`

---

# 26. 最终建议

YuanHub 当前并不是“完全没考虑 SP”。

相反，目前后端已经有一个相当接近正确答案的雏形：

```text
operator_id = 形态 ID
spOf = 身份关系
level/elite = 同步共享
starLevel = 形态独立
命盘/奇闻/战斗数据 = 形态独立
```

因此下一步最值得做的不是大重构，而是：

1. **把现有隐含语义正式化；**
2. **补齐共享字段不变量；**
3. **把前端硬编码 SP 改成数据驱动；**
4. **把“电影品质”和数字 rarity tier 解耦；**
5. **检查招募与养成规划是否错误把 SP 当普通独立绝密；**
6. **对未确认机制继续保持 fail-closed。**

如果 Codex Review 证明现有同步已经覆盖大部分边界，那么最终修改量应该可以控制在：

> **目录语义 + 若干不变量校验 + 前端关系字段透传 + 针对性回归测试**

而不是一次跨前后端、协议、存储的大规模迁移。
