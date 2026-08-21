# 密探自动采集数据接入与三端行动规划

状态：数据契约草案，可进入前后端与采集端联调  
适用范围：自动采集程序、YuanHub 前端文件导入、YuanHub 后端自动上报  
更新时间：2026-08-21  
配套前端方案：[`operator-current-workbench-implementation-plan.md`](./operator-current-workbench-implementation-plan.md)  
配套后端规格：[`backend-operator-current-workbench-spec.md`](./backend-operator-current-workbench-spec.md)  
正式交换协议：[`operator-growth-data-exchange-protocol-v3.md`](./operator-growth-data-exchange-protocol-v3.md)

## 1. 接入目标与统一原则

同一份自动采集结果必须支持两条入口：

1. 用户在前端选择 `.json` 文件，预览差异后导入指定子账号；
2. 自动采集程序使用账号绑定的 OpenAPI 凭证直接上报。

两条入口使用《密探养成数据交换协议 v3》的同一份 Schema、同一套后端校验和同一个导入服务。前端不得把文件自行拆成若干旧接口请求，采集端也不得拥有比浏览器导入更宽松的字段语义。

完整 v3 协议可以额外携带 `operator_annotation_snapshot`，交换养成状态、特别关注、目标和备注；自动采集端使用受限子集，只生成客观 `operator_snapshot`。因此“协议支持主观数据”和“采集程序不修改主观数据”可以同时成立。

本次同时确定以下口径：

- 3 星稀有度密探的奇闻上限为 `300 / 1560 / 9`；
- 4 星稀有度密探的奇闻上限为 `305 / 1820 / 11`；
- 5 星稀有度密探暂沿用现行目录口径 `500 / 2600 / 15`；
- 奇闻值固定使用 `attack / hp / special` 三个协议键；第三项展示名称由管理员可编辑的密探公共图鉴维护，不由采集端或养成快照命名；
- SP 化极没有小节点，直接采用采集到的星级；
- 已装备星石是攻击力、生命力的计算输入，必须随采集结果同步；
- 当前养成列表和委托资料展示已装备星石摘要，并支持快捷卸除，但星石替换、升级、方案管理仍由后续星石管理页面负责；
- 双命盘只表示两套组合，不采集、不导入、不推断“当前命盘”。

## 2. 对现有 `AgentInfoReport.json` 的审视结论

样本文件：[`AgentInfoReport.json`](./AgentInfoReport.json)

当前报告包含 116 条记录，已经具备等级、修为、攻生观测值、奇闻、双命盘、化极和已装备星石的主要原始信息，但还不适合作为稳定交换协议直接写库。

本次审视得到的关键质量基线：

| 项目 | 当前报告结果 | 接入判断 |
|---|---:|---|
| 总记录 | 116 | 可作为首批固定联调样本 |
| 已匹配公共目录 ID | 114 | 可继续做字段级校验 |
| 未确认身份 | 2 | `广厂`、`徐穉` 必须留在 unmatched/review，不能自动写入 |
| 命盘配置 | 232 | 其中 49 个二号配置不可用，只表示本次未采到，不表示清空 |
| 含任一已装备星石的密探 | 28 | 证明星石并非独立可忽略数据，而是部分攻生观测的必要输入 |
| 两套命盘均可用 | 67 | 这些记录中星石集合均在两套配置间一致，可安全去重为密探级装备 |
| SP 化极 | 1 | 已能读取星级与空节点，可直接写入 SP 的 `star_level` |
| 满星待觉醒 | 2 | `layout=pending_awaken` 映射为 `star_level=30` |
| 异常普通化极 | 2 | 星级/节点组合异常，必须进入 review |

### 2.1 可以映射的字段

| 当前字段 | 目标字段 | 处理规则 |
|---|---|---|
| `updated_at` | 顶层 `exported_at` / record `effective_at` | 作为整次报告生成时间；每位密探仍建议增加 `observed_at` |
| `records[].operator_id` | `records[].entries[].operator_id` | 必须存在于服务端公共密探目录；无法确认 ID 的条目移入 record 级 `unmatched` |
| `name / name_cleaned` | `name` | 仅供展示和复核，稳定主键仍是 `operator_id` |
| `operator_lookup` | `match.status` | 当前是布尔值；`true` 仍需结合 ID 和服务端目录校验后才成为 `ready` |
| `collection_debug.operator_match / operator_candidates` | `match.method / candidates` | 方法、候选与原始名称转为结构化匹配证据 |
| `stats.level` | `level` | 整数，按服务端等级范围校验 |
| `stats.cultivation` | `elite` | 直接表示修为值，不做 `+1/-1` 偏移 |
| `stats.attack` | `combat_stats.observed_attack` | 观测值，不作为永远有效的手动值 |
| `stats.life` | `combat_stats.observed_hp` | 观测值，不作为永远有效的手动值 |
| `oddities` | `combat_stats.oddities` | 归一为 `attack / hp / special`；当前值按稀有度对应上限校验，展示名和上限由服务端公共图鉴确定 |
| `huaji` | `star_level` | 采集端按普通/SP 身份完成标量编码，见 3.3 |
| `disc_configs` | `disc_loadouts` | 仅采纳 `state=active` 的命盘，最多两套、每套最多三项 |
| active slot 下的 `star_stones` | `equipped_star_stones` | 从命盘结构中抽出并去重；`support` 归一为 `assist` |
| `collection_debug` 的其余字段 | `diagnostics` | 只用于排错和人工复核，不进入当前养成投影 |

### 2.2 当前报告必须修正的问题

- 报告没有 `format`、`version`、`scan_id`、采集器版本、目录版本、覆盖范围和逐分区状态，后端无法可靠幂等或判断空数组是否代表“确认清空”；
- 当前 4 星记录采到了 `350 / 1820 / 11`，其中攻击奇闻上限应改为 `305`。采集端应按目录稀有度纠正显示识别或标记异常，后端不得静默接受 `350`；
- 当前报告可能携带“攻击力 / 生命值 / 增伤值 / 免伤值 / 治疗加成”等 OCR 名称；正式输出必须将数值归一为稳定键，原始文案只进入 `diagnostics.raw_oddity_labels`，不能成为 `oddities` 的动态对象键；
- 有未确认身份以及异常普通化极记录。身份未确认时整条记录不能自动写入；单一分区不确定时只能跳过该分区，不能把旧数据清空；
- SP 当前可以采到 `layout=sp, stars=N, nodes=[]`；采集端直接输出 `star_level=N`，后端再依据公共图鉴 `sp_of` 确认它应按 SP 星级而不是普通节点解释；
- 已装备星石嵌套在两套命盘的 active slot 中。样本里双命盘可用时两边的星石集合相同，应归一成密探级的一份当前装备；若两边不一致，必须标记 `equipment=review`，不能任选一套；
- 命盘 OCR 名称和星石名称需要按公共目录规范化。无法唯一匹配时保留原文和候选项，禁止用低置信结果覆盖云端准确值；
- `unavailable`、`locked`、`inactive`、位置和签名属于采集证据，不应当作已装备命盘写入。

现有无版本报告可以保留为迁移测试夹具。正式功能只接受符合 v3 Schema 的新版文件；旧报告需要由采集程序重新生成，避免长期维护猜测式兼容。

## 3. 自动采集使用的 v3 受限子集

字段的最终定义、覆盖语义和 Schema 以 [`operator-growth-data-exchange-protocol-v3.md`](./operator-growth-data-exchange-protocol-v3.md) 为准。本节只说明采集端如何封装客观 record。

### 3.1 顶层结构

```json
{
  "format": "myshare-operator-exchange",
  "version": 3,
  "exported_at": "2026-08-21T10:30:00+08:00",
  "catalog_version": "operators-2026-08-21",
  "producer": {
    "platform": "yuan-agent-collector",
    "version": "0.4.0"
  },
  "accounts": [
    { "id": "local_default", "name": "本次采集账号", "game_scope": "如鸢" }
  ],
  "records": [
    {
      "account_id": "local_default",
      "record_id": "scan:01J6Y...",
      "record_type": "operator_snapshot",
      "game": "如鸢",
      "effective_at": "2026-08-21T10:30:00+08:00",
      "snapshot_scope": "listed",
      "source_kind": "scan",
      "coverage": {
        "complete": false,
        "record_count": 116,
        "unmatched_count": 2,
        "interrupted": false
      },
      "unmatched": [],
      "entries": []
    }
  ]
}
```

规则：

- `record_id` 即稳定 scan ID，在一次采集重试中保持不变，新的采集批次生成新 ID；
- `accounts[].id` 是文档内本地引用，不是 YuanHub 目标账号 ID；浏览器导入时由用户映射子账号，自动上报时由账号绑定令牌决定目标；
- 自动采集固定使用 `record_type=operator_snapshot`、`source_kind=scan`、`snapshot_scope=listed`，不得生成 annotation record；
- 只有采集器确认遍历了全部已拥有密探、每条身份均已解析且没有中断，才允许 `coverage.complete=true`；
- `complete=false` 或分区非 `ready` 时，不得用“缺失”推断删除服务端数据。

### 3.2 单条密探记录

```json
{
  "operator_id": "char_121_menghuo",
  "name": "孟获",
  "observed_at": "2026-08-21T10:21:32+08:00",
  "match": {
    "status": "ready",
    "method": "name",
    "confidence": 1,
    "raw_name": "孟获",
    "candidates": []
  },
  "section_status": {
    "basic": "ready",
    "huaji": "ready",
    "oddities": "ready",
    "disc_loadouts": "ready",
    "equipment": "ready",
    "combat_stats": "ready"
  },
  "level": 93,
  "elite": 14,
  "star_level": 3,
  "combat_stats": {
    "observed_attack": 4001,
    "observed_hp": 20245,
    "source": "scan",
    "oddities": {
      "attack": { "current": 0 },
      "hp": { "current": 0 },
      "special": { "current": 15 }
    }
  },
  "disc_loadouts": [
    {
      "id": "disc_1",
      "name": "命盘一",
      "discs": [
        { "ot_name": "寄生" },
        { "ot_name": "山神丰佑" }
      ]
    }
  ],
  "equipped_star_stones": [],
  "diagnostics": {
    "raw_oddity_labels": {
      "attack": "攻击力",
      "hp": "生命值",
      "special": "治疗加成"
    }
  },
  "warnings": []
}
```

`section_status` 取值：

```text
ready | partial | review | unavailable
```

合并语义：

- `ready`：字段已完整采集，可以写入；明确的空数组可以清空该分区；
- `partial`：只合并明确出现且通过校验的字段，不清空缺失字段；
- `review`：进入预览中的人工确认区，默认不写入该分区；
- `unavailable`：本次未采到，保留服务端现值。

身份 `match.status != ready` 时整条记录默认不写入。身份可靠但某分区 `review` 时，其他 `ready` 分区仍可导入。

### 3.3 化极标量

采集端负责把识别结果直接转换为协议 `star_level`。

普通密探：

```text
0      = 未拥有
1..30  = 6 × (星级 - 1) + 最后一个连续小节点 + 1
31     = 已觉醒
```

示例：普通 1 星 2 节点输出 `3`，普通 4 星 3 节点输出 `22`，满星待觉醒输出 `30`，已觉醒输出 `31`。

SP 密探没有小节点：

```text
0    = 未拥有
1..5 = 直接采用采集到的星级
```

规则：

- 采集器必须先根据已匹配的 `operator_id` 和本地/服务端公共图鉴判断是否 SP；
- 普通密探小节点必须从 1 起连续点亮；断点、倒序、节点数量异常或身份未确认时，将 `section_status.huaji` 标记为 `review` 并省略 `star_level`；
- 报告中的 `layout=pending_awaken` 输出 `30`，已觉醒输出 `31`；
- SP 的 `layout=sp, stars=N, nodes=[]` 直接输出 `N`，不能套用普通公式；
- JSON Schema 校验公共范围 `0..31`；服务端仍必须按公共图鉴身份复核普通 `0..31`、SP `0..5`，不能只信任采集结果。

### 3.4 奇闻稳定键、目录名称与上限

采集协议只提交稳定键下的 `current`：`attack` 表示攻击奇闻、`hp` 表示生命奇闻、`special` 表示第三项奇闻。服务端根据密探公共图鉴补全展示名称，并根据目录稀有度补全 `max`：

采集器完整识别三项时输出三个键并标记 `section_status.oddities=ready`；只能确认部分数值时标记 `partial` 且只提交可靠键；完全不可读时标记 `unavailable` 并省略 `oddities`。不得用空对象表示三项归零。

| 稀有度 | 攻击力 | 生命值 | 第三属性 |
|---|---:|---:|---:|
| 3 星 | 300 | 1560 | 9 |
| 4 星 | 305 | 1820 | 11 |
| 5 星 | 500 | 2600 | 15 |

第三属性可以显示为增伤值、免伤值、治疗加成等。管理员通过公共图鉴的 `special_oddity_name` 按密探维护名称；公共读取接口返回包含三个稳定键、展示名称和派生上限的 `oddity_schema`。采集端不写该目录字段，也不把展示名称用作数据键。

采集端可附带识别到的名称和 `max` 作为诊断证据：名称放入 `diagnostics.raw_oddity_labels`。原始名称与公共图鉴不一致时产生 `oddity_label_mismatch` warning，识别上限与服务端表不一致时产生 warning 或 review；两者都不能覆盖公共图鉴。公共图鉴暂缺第三项名称时，数值仍可按 `special` 预览，但返回 `catalog_oddity_name_missing` 并由前端显示“第三属性（图鉴待维护）”。

### 3.5 已装备星石

规范化结构：

```json
{
  "equipped_star_stones": [
    { "type": "main1", "stone_id": "stone_pojun", "name": "破军", "level": 60 },
    { "type": "assist1", "stone_id": "stone_tianxiang", "name": "天相", "level": 50 },
    { "type": "main2", "stone_id": "stone_qisha", "name": "七杀", "level": 40 }
  ]
}
```

规则：

- 槽位固定为 `main1..main3`、`assist1..assist3`；原始 `support` 一律映射成 `assist`；
- 同一槽位最多一颗，星石名称必须能映射到公共星石目录，等级必须在目录允许范围内；
- `stone_id` 是公共目录 ID，不是账号内唯一实例 ID。采集端无法识别实例时不伪造实例 ID，由后端在首次接收时创建或复用账号内 `instance_id`；
- 采集端按命盘 active slot 的稳定阅读顺序分配 1、2、3 槽位，但输出后不再保留“星石属于哪套命盘”的错误关联；
- 双命盘读取到同一装备集合时只输出一份；不一致时 `section_status.equipment=review` 并保留双方原始证据；
- 星石集合、等级、修为、化极和奇闻数值共同形成 `combat_input_signature`。第三项展示名称不进入签名；数值输入变化后旧观测值立即变成 `stale`，公共图鉴纯改名不应使其失效；
- 当前养成只展示当前装备与卸除，不在这里提供替换、升级、推荐或多套方案管理。

## 4. 导入决策与冲突规则

### 4.1 预览结果

每条记录返回：

```text
accepted | partial | review | rejected | unchanged
```

预览至少展示：

- 匹配到的密探与匹配方法；
- 等级、修为、化极、奇闻、攻生、双命盘和已装备星石的前后差异；
- 每个分区将执行“覆盖 / 局部合并 / 保留现值 / 等待确认”中的哪一种；
- 星石装备数量 `N/6` 和名称等级摘要；
- 奇闻越界、SP 状态、命盘 OCR、星石冲突以及观测值签名不完整等 warning。

### 4.2 默认冲突策略

- 自动采集只更新客观数据，不包含也不修改 `growth_state`、特别关注、养成目标和用户备注；
- 已存在的 `manual_attack/manual_hp` 不被扫描静默删除。扫描观测值单独更新，页面继续明确显示手动覆盖状态；
- 星石、奇闻或其他输入改变时，旧观测值保留作审计但标记过期；新扫描同时带来匹配输入签名时才恢复为有效观测；
- 身份不确定拒绝整条；字段越界拒绝对应分区；其他可靠分区可以继续导入；
- `unavailable` 和缺字段不等于空；只有 `ready` 分区携带明确空值时才允许清空；
- `listed` 导入不删除报告外的密探；完整删除语义不对自动采集开放。

## 5. 三端行动规划

### 5.1 自动采集端

阶段 C0｜生成规范数据：

- 输出 `myshare-operator-exchange@3` 顶层元数据、单一来源账号和稳定 `record_id/scan_id`；
- 将现有字段按第 2 节映射为规范字段，把原始截图/OCR/签名收纳到 `diagnostics`；
- 把三项奇闻归一为 `attack / hp / special`；OCR 名称只写 `diagnostics.raw_oddity_labels`，不输出动态中文键；
- 输出逐条 `observed_at`、结构化 `match` 与 `section_status`；
- 抽取并去重密探级 `equipped_star_stones`，把 `support` 转成 `assist`。

阶段 C1｜采集质量门禁：

- 根据公共目录稀有度验证奇闻：3 星 `300/1560/9`、4 星 `305/1820/11`、5 星 `500/2600/15`；
- 修正当前报告中 4 星攻击上限 `350` 的识别/配置错误；
- 普通化极验证连续小节点并编码为标量，SP 直接输出星级标量，异常状态进入 review；
- 命盘、星石名称先规范化再输出；不能唯一匹配时保留候选，不伪造成功；
- 双命盘星石集合冲突、采集中断或二号命盘不可达时给出精确分区状态。

阶段 C2｜自动上报：

- 支持用户配置账号绑定的最小权限令牌，权限仅为 `operator:scan:write`；
- 调用后端 OpenAPI 预检/提交接口，使用稳定 `record_id` 幂等重试；
- 本地明确展示 accepted/partial/review/rejected 数量和服务端 warning；
- 不把用户凭证写进导出的 JSON，不在日志输出令牌或完整个人数据。

采集端验收：同一批次导出的文件和直接上报得到相同预览结论；重试不会重复写入；4 星奇闻和 SP 化极样例通过固定测试。

### 5.2 后端

阶段 B0｜Schema 与预览服务：

- 扩展密探公共图鉴：管理员写入 `special_oddity_name`，公共读取接口返回服务端生成的 `oddity_schema`，并在修改后更新 `catalog_version` 与缓存；
- 发布并校验 `myshare-operator-exchange@3` Schema；自动采集权限只接受其中的客观 scan 子集；
- 实现统一 v3 import service、身份匹配、分区状态和字段级 diff；扫描入口只是该服务的权限受限适配层；
- 服务端拒绝名称型奇闻键，以公共目录为准解析 `special` 展示名，并校验稀有度奇闻上限、SP/普通化极、命盘和星石；
- 以 `(target_account_id, record_id)` 幂等，保存原始批次摘要和逐条处理结果。

阶段 B1｜投影与一致性：

- 当前养成投影和 v3 协议统一使用现有 `starLevel/star_level` 语义，并复用六槽 `starStones`；增加双命盘、奇闻和攻生观测，v3 `equipped_star_stones` 只在协议边界适配到现有星石字段；
- 保存并比较 `combat_input_signature`，输入变化后将旧观测值标为 stale；
- 浏览器导入提供 preview/commit，提交时重新校验 revision；
- 扫描导入不触碰养成状态、特别关注、目标和备注。

阶段 B2｜装备操作与 OpenAPI：

- 提供单槽和整套星石卸除接口；卸除不删除星石资产，只解除槽位占用；
- 在同一事务内更新装备槽、密探 revision 和攻生有效状态，并返回重算所需的完整输入；
- 支持即时撤销令牌和服务端可查询的最近卸除记录，撤销时仍做 revision 与槽位占用校验；
- 提供账号绑定的 `POST /open-api/operator/scan-import/preview` 与 `/commit`，复用 B0 服务和错误码；
- 建立令牌吊销、速率限制、审计和最小化日志。

后端验收：浏览器 JWT 和 OpenAPI 对相同 JSON 产生相同结果；部分扫描不会误清数据；卸除后不会继续返回“有效”的旧扫描攻生；星石资产不会因卸除丢失。

### 5.3 前端

阶段 F0｜文件解析与预览：

- 在当前养成提供“导入自动采集报告”入口，只接受 `.json` 并检测 `format/version`；
- 选择目标子账号后把原文件提交给后端 preview，不在浏览器自行猜测字段；
- 从公共图鉴 `oddity_schema` 展示奇闻名称和上限；目录缺名时显示维护提示，不再按职业猜测正式名称；
- 展示批次摘要、分区差异、warning 和待人工复核记录，允许排除单条或单个分区；
- 明确提示自动采集不会改变已毕业/不养成、特别关注和养成目标。

阶段 F1｜提交与列表展示：

- 提交用户确认后的导入选择，处理 revision 过期并刷新当前养成、库存关联数据和建议；
- 在密探行显示 6 槽紧凑星石摘要：主星/辅星、名称、等级、空槽和数据来源时间；
- 攻生旁显示 `计算 / 扫描 / 手动 / 已过期` 来源；星石或其他输入改变时不继续把旧扫描值当当前值；
- 委托资料同步包含只读的已装备星石摘要，使攻生有可核对的装备上下文。

阶段 F2｜快捷卸除：

- 单颗星石通过槽位详情浮层执行“卸除”，整套卸除放在星石区次级菜单；
- 确认层展示将卸除的星石、槽位和预计攻生变化；如果无法计算则明确提示“卸除后需重新采集”；
- 成功后局部刷新该密探并显示可访问的成功提示；Toast 提供即时“撤销”，恢复窗口内的空槽继续提供“恢复上一颗”；
- 移动端触控目标不小于 `44×44px`、相邻目标至少 `8px`，图标按钮具有可访问名称；
- 前端不通过清空本地数组模拟卸除，必须等待服务端事务成功。

当前页不提供通用重新装备，因此“可恢复上一颗”是快捷卸除的上线门槛。后端尚未提供持久化恢复记录时，前端只能展示星石，不得先开放卸除。

前端验收：用户可以从文件导入并看懂每项变化；桌面端仍能同时阅读至少五位密探；卸除失败不产生乐观残留；键盘和触屏都可完成单槽卸除、确认与撤销。

## 6. 推荐接口轮廓

浏览器入口：

```http
POST /v1/operator/scan-import/preview?account_id=acc_xxx
POST /v1/operator/scan-import/commit?account_id=acc_xxx
```

自动采集端入口：

```http
POST /open-api/operator/scan-import/preview
POST /open-api/operator/scan-import/commit
Authorization: Bearer <account-bound-token>
```

星石卸除：

```http
POST /v1/operator/current/{operatorId}/star-stones/unequip?account_id=acc_xxx
Idempotency-Key: <uuid>

{
  "slots": ["main1"],
  "expected_operator_revision": 8
}
```

成功响应至少返回更新后的 `equipped_star_stones`、`combat_stats` 有效状态、密探 revision、即时 `undo_token` 和服务端 `restore_until`。current 响应应能返回仍可恢复的最近卸除记录，避免刷新页面后失去恢复入口。卸除是解除装备关系，不是删除星石；整套卸除使用六个现有槽位或明确的 `all=true`，不得把未解析的空请求解释为全部卸除。当前养成编辑器的六槽保存走 current PATCH 的 `star_stones` 完整替换，不再构造 v2 import 记录补发。

## 7. 联调发布顺序

1. 先完成公共图鉴 `special_oddity_name / oddity_schema` 和管理员编辑入口，再冻结目录版本；
2. 冻结密探养成交换协议 v3 Schema 和固定样例，确认只接受 `attack / hp / special`；
3. 采集端先生成新版文件，后端上线只读 preview；
4. 前端接入文件预览，使用现有报告和错误样例完成验收；
5. 开放浏览器 commit，验证跨设备当前养成投影；
6. 上线星石列表摘要、单槽/整套卸除和撤销；
7. 最后发放 OpenAPI 令牌并开放采集端自动上报。

在 preview 与固定样例未稳定前，不应直接开放无人值守自动写入。
