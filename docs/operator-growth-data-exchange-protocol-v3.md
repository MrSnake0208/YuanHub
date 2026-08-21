# 密探养成数据交换协议 v3

状态：协议草案，待前后端与自动采集端联调  
格式标识：`myshare-operator-exchange`  
协议版本：`3`  
更新时间：2026-08-21  
机器 Schema：[`schemas/operator-growth-exchange-v3.schema.json`](./schemas/operator-growth-exchange-v3.schema.json)  
有效样例：[`examples/operator-growth-exchange-v3/full-backup.valid.json`](./examples/operator-growth-exchange-v3/full-backup.valid.json)、[`examples/operator-growth-exchange-v3/scan-sp.valid.json`](./examples/operator-growth-exchange-v3/scan-sp.valid.json)

## 1. 定位和设计原则

本协议用于交换一个或多个子账号中的密探养成数据，覆盖：

- 客观养成：等级、修为、化极、奇闻、攻击力、生命力、双命盘和当前已装备星石；
- 主观养成：养成状态、特别关注、养成目标和备注；
- 数据来源：YuanHub 手动编辑、YuanHub 完整备份、旧协议迁移和自动采集程序。

主观数据是可选的，但不能和客观养成混成同一个覆盖边界。协议通过两种记录表达：

| `record_type` | 内容 | 典型生产者 |
|---|---|---|
| `operator_snapshot` | 客观养成数据 | 自动采集端、手动编辑、完整备份 |
| `operator_annotation_snapshot` | 养成状态、特别关注、目标、备注 | YuanHub 完整备份或用户显式导入 |

因此：

- 自动采集端只生成 `operator_snapshot`，不会因为采不到主观字段而清空用户标注；
- 完整备份可以在同一份文档中同时包含两种记录；
- 只交换某一部分时，不需要填充空对象占位；没有对应 record 就表示不交换该领域；
- v3 继续使用现有格式标识，后端同时保留对 v2 的兼容读取。

## 2. 顶层文档

```json
{
  "format": "myshare-operator-exchange",
  "version": 3,
  "exported_at": "2026-08-21T10:30:00+08:00",
  "catalog_version": "operators-2026-08-21",
  "producer": {
    "platform": "yuanhub",
    "version": "3"
  },
  "accounts": [
    {
      "id": "account_1",
      "name": "大号",
      "game_scope": "如鸢"
    }
  ],
  "records": []
}
```

字段：

| 字段 | 必填 | 说明 |
|---|---|---|
| `format` | 是 | 固定为 `myshare-operator-exchange` |
| `version` | 是 | 固定为 `3` |
| `exported_at` | 是 | RFC 3339 / ISO-8601 时间 |
| `catalog_version` | 否 | 生产文档时使用的公共密探目录版本 |
| `producer` | 是 | 生产程序和版本；自动采集端使用自己的 platform 名称 |
| `accounts` | 是 | 文档内的账号引用和展示名称，至少一项 |
| `records` | 是 | 客观快照或主观标注快照，至少一项 |

`accounts[].id` 是文档内引用，不应被导入端直接信任为目标数据库主键：

- YuanHub 自身导出时可以沿用真实 `acc_xxx`；
- 自动采集文件可以使用 `local_default` 等本地引用；
- 浏览器导入必须让用户把每个来源账号映射到自己有权访问的目标账号；
- 账号绑定 OpenAPI 只允许一个来源账号，并强制映射到 token 绑定账号，请求体不能改写目标。

## 3. Record 公共字段

两种 record 都包含：

| 字段 | 必填 | 说明 |
|---|---|---|
| `account_id` | 是 | 引用 `accounts[].id` |
| `record_id` | 是 | 生产者生成的稳定幂等 ID；同一批次重试保持不变 |
| `record_type` | 是 | `operator_snapshot` 或 `operator_annotation_snapshot` |
| `game` | 是 | `如鸢`、`代号鸢` 或 `universal` |
| `effective_at` | 是 | 该记录在业务上生效的时间 |
| `snapshot_scope` | 是 | `listed` 或 `full` |
| `source_kind` | 是 | `manual`、`scan`、`backup` 或 `migration` |
| `entries` | 是 | 本记录包含的密探条目 |

`record_id` 在用户和目标账号范围内幂等：

- 相同 ID、相同内容重复导入，返回 duplicate，不重复应用；
- 相同 ID、不同内容，返回 `idempotency_conflict`；
- 自动采集的 `record_id` 可以直接采用稳定 `scan_id`。

## 4. 客观养成记录 `operator_snapshot`

### 4.1 基本结构

```json
{
  "account_id": "account_1",
  "record_id": "scan:01J6YABC",
  "record_type": "operator_snapshot",
  "game": "如鸢",
  "effective_at": "2026-08-21T10:21:32+08:00",
  "snapshot_scope": "listed",
  "source_kind": "scan",
  "coverage": {
    "complete": false,
    "record_count": 116
  },
  "unmatched": [
    {
      "raw_name": "未确认名称",
      "candidates": []
    }
  ],
  "entries": []
}
```

`coverage` 主要供采集端说明遍历完整性。只有确认遍历全部已拥有密探、没有身份未匹配和采集中断时才可写 `complete=true`。无法确定 `operator_id` 的原始条目放入 record 级 `unmatched`，不伪造客观 entry。`source_kind=scan` 的第一版必须使用 `snapshot_scope=listed`，不能删除报告外密探。

### 4.2 客观 entry

```json
{
  "operator_id": "char_121_menghuo",
  "name": "孟获",
  "observed_at": "2026-08-21T10:21:32+08:00",
  "level": 93,
  "elite": 14,
  "star_level": 3,
  "disc_loadouts": [],
  "equipped_star_stones": [],
  "combat_stats": {},
  "section_status": {
    "basic": "ready",
    "huaji": "ready",
    "oddities": "ready",
    "combat_stats": "ready",
    "disc_loadouts": "ready",
    "equipment": "ready"
  }
}
```

允许字段：

| 字段 | 说明 |
|---|---|
| `operator_id` | 公共密探目录稳定 ID，必填 |
| `name` | 展示冗余，不能修改公共目录 |
| `observed_at` | 本密探实际采集/编辑时间 |
| `level` | `0..100` |
| `elite` | `0..17`，直接表示修为值，不做偏移 |
| `star_level` | 化极标量；普通密探使用节点编码，SP 直接使用星级，具体见 4.4 |
| `disc_loadouts` | 最多两套双命盘，每套最多三项 |
| `equipped_star_stones` | 当前装备六槽，不是星石方案或完整库存 |
| `combat_stats` | 奇闻、扫描观测、手动校正和输入签名 |
| `section_status` | 自动采集时各分区可信度；手动/备份可省略，出现的数据默认 ready |
| `match` | 自动采集的身份匹配证据 |
| `diagnostics` | 可选采集诊断，不进入当前养成投影 |
| `warnings` | 生产者发现的非阻塞问题 |

条目必须至少出现一个客观养成字段。只提供 `name`、诊断或 warning 的条目不产生写入。

### 4.3 分区合并

`section_status` 取值：

```text
ready | partial | review | unavailable
```

| 状态 | 导入行为 |
|---|---|
| `ready` | 完整采集；明确空数组/空对象可以清空该分区 |
| `partial` | 只合并明确出现且通过校验的字段；缺失字段保留服务端现值 |
| `review` | 默认不写该分区，进入预览人工确认 |
| `unavailable` | 本次没有采到，保留服务端现值 |

没有 `section_status` 时，文档中实际出现的字段按 `ready` 处理，未出现字段不处理。`null` 只有 Schema 明确允许时才表示清除；不能用 `null` 代替“本次未采到”。

### 4.4 化极

v3、v2、站内 current API 和后端持久化统一使用 `star_level`。JSON 使用 snake_case；Kotlin/前端内部对象可以命名为 `starLevel`。

普通密探编码：

```text
0      = 未拥有
1..30  = 6 × (星级 - 1) + 节点 + 1
31     = 已觉醒
```

普通密探正向示例：

```text
1 星 0 节点 -> 1
1 星 2 节点 -> 3
4 星 3 节点 -> 22
5 星 5 节点、待觉醒 -> 30
已觉醒 -> 31
```

普通密探在 `1..30` 范围内的反向公式：

```text
stars = floor((star_level - 1) / 6) + 1
node  = (star_level - 1) % 6
```

SP 密探由公共图鉴 `sp_of != null` 识别，没有小节点：

```text
0    = 未拥有
1..5 = 直接表示星级
```

JSON Schema 只校验通用范围 `0..31`。生产者必须先根据 `operator_id` 对应的公共图鉴身份完成编码；服务端必须再次依据公共图鉴校验：普通密探允许 `0..31`，SP 只允许 `0..5`。不能只信任采集端，也不能脱离 `operator_id` 单独解释 SP 数值。

### 4.5 奇闻和攻生

```json
{
  "combat_stats": {
    "observed_attack": 4001,
    "observed_hp": 20245,
    "manual_attack": null,
    "manual_hp": null,
    "display_mode": {
      "attack": "auto",
      "hp": "manual"
    },
    "source": "scan",
    "observed_at": "2026-08-21T10:21:32+08:00",
    "observed_status": "valid",
    "combat_input_signature": "sha256:...",
    "oddities": {
      "attack": { "current": 0 },
      "hp": { "current": 0 },
      "special": { "current": 15 }
    }
  }
}
```

`display_mode.attack` / `display_mode.hp` 为可选用户偏好，值为 `auto | manual | null`；它只记忆攻生展示选择，不改变观测值、手动校正值或 stale 语义。字段缺失表示未保存偏好。

奇闻值只使用三个稳定语义键：

| 键 | 语义 | 展示名称来源 |
|---|---|---|
| `attack` | 奇闻增加的攻击力 | 固定显示“攻击力” |
| `hp` | 奇闻增加的生命值 | 固定显示“生命值” |
| `special` | 密探专属的第三项奇闻 | 由密探公共图鉴维护 |

`special` 的展示名称不进入养成快照。管理员改名后，已有记录仍保持 `special.current`，不迁移用户数据、不改变幂等内容，也不会仅因文案变化使攻生观测失效。生产者不得把“增伤值”“免伤值”“治疗加成”等展示文案当作对象键。

当 `section_status.oddities=ready` 时必须同时提交三个键；`partial` 可以只提交本次可靠识别的键；`unavailable` 应省略 `oddities`。空对象不表示清空，确认三项均为零时应显式提交三个 `current=0`。

密探公共图鉴必须为每位密探维护 `special_oddity_name`，公共读取接口根据它和稀有度返回只读定义：

```json
{
  "id": "char_012_yanliang",
  "special_oddity_name": "免伤值",
  "oddity_schema": {
    "attack": { "name": "攻击力", "max": 305 },
    "hp": { "name": "生命值", "max": 1820 },
    "special": { "name": "免伤值", "max": 11 }
  }
}
```

其中只有 `special_oddity_name` 是密探级管理员配置；三个 `max` 由服务端按目录稀有度生成，不要求管理员重复录入。目录暂缺第三项名称时，前端降级显示“第三属性（图鉴待维护）”，导入预览给出 `catalog_oddity_name_missing` warning，不再按职业静默猜测正式名称。

奇闻权威上限由服务端根据公共目录稀有度补全：

| 稀有度 | 攻击力 | 生命值 | 第三属性 |
|---|---:|---:|---:|
| 3 星 | 300 | 1560 | 9 |
| 4 星 | 305 | 1820 | 11 |
| 5 星 | 500 | 2600 | 15 |

生产者可以携带 `max` 作为展示/诊断值，但不能覆盖服务端权威上限。4 星 `attack.max=350` 必须被后端判为语义异常。采集端识别到的原始第三项名称只能放在 `diagnostics.raw_oddity_labels.special`，它与公共图鉴不一致时产生 warning，不改写目录或快照键。

扫描攻生必须和等级、修为、化极、奇闻、已装备星石共同形成 `combat_input_signature`。奇闻部分只签入稳定键及其数值，不签入 `special_oddity_name`、`oddity_schema.*.name` 或纯目录文案版本；因此改名不影响签名。任一数值输入变化后，旧观测保留但转为 `stale`；缺少历史签名时使用 `unverified`。

### 4.6 双命盘

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

- 最多两套，每套最多三个命盘；
- 不接受 `active`、`is_active` 或“当前命盘”字段；
- 旧 v2 `discs` 迁移为第一套，不能覆盖已有第二套。

### 4.7 当前已装备星石

```json
{
  "equipped_star_stones": [
    { "type": "main1", "stone_id": "stone_tianfu", "name": "天府", "level": 60 },
    { "type": "assist1", "stone_id": "stone_hongluan", "name": "红鸾", "level": 50 }
  ]
}
```

- 槽位固定为 `main1..main3` 和 `assist1..assist3`；旧 `main/assist` 只在 v2 兼容层映射到第一槽；采集原文 `support` 转为 `assist`；
- 同一槽位最多一颗；名称/`stone_id` 必须能映射公共星石目录；
- `instance_id` 是 YuanHub 账号内实例 ID，自动采集端不能识别时省略，由后端安全创建或复用；
- 这里只交换当前装备，不声称包含完整星石库存；`listed` 扫描不得删除未被本次报告观察到的未装备资产；
- 双命盘中读取到的星石必须先去重为密探级的一份装备，不与某套命盘绑定。

## 5. 主观标注记录 `operator_annotation_snapshot`

### 5.1 结构

```json
{
  "account_id": "account_1",
  "record_id": "backup:annotations:20260821",
  "record_type": "operator_annotation_snapshot",
  "game": "如鸢",
  "effective_at": "2026-08-21T10:30:00+08:00",
  "snapshot_scope": "listed",
  "source_kind": "backup",
  "entries": [
    {
      "operator_id": "char_121_menghuo",
      "growth_state": "graduated",
      "favorite": true,
      "note": "等级修为毕业，继续收集心纸",
      "targets": {
        "level": 100,
        "elite": 17,
        "star_level": 31,
        "heart_paper": 180
      }
    }
  ]
}
```

字段均为可选更新项，但 entry 至少出现一个：

| 字段 | 值 | 说明 |
|---|---|---|
| `growth_state` | `active | graduated | skip` | 养成中、已毕业、不养成 |
| `favorite` | boolean | 特别关注；与 `growth_state` 正交 |
| `note` | string 或 `null` | 用户备注；`null` 表示明确清除 |
| `targets` | object 或 `null` | 养成目标；`null` 表示明确清除全部目标 |

`targets` 可以包含目标等级、目标修为、目标化极和目标心纸。目标是用户计划，不自动改变当前练度，也不自动改变特别关注。

合法组合包括：

```text
growth_state = graduated
favorite = true
```

这表示等级、修为或命盘已经毕业，但仍继续追踪心纸和化极。

### 5.2 主观数据覆盖规则

- `listed`：只更新列出的密探和 entry 中实际出现的字段；字段缺失表示保留现值；
- `note=null`：明确清除备注；`targets=null`：明确清除养成目标；
- `full`：表示目标账号/game 的完整主观状态备份。每个 entry 必须完整提供 `growth_state`、`favorite`、`note`、`targets`；文档未列出的密探恢复默认 `active / false / null / null`；
- 自动采集程序不得生成 annotation record；扫描文件没有 annotation record 时，现有主观数据完全不变；
- 删除客观养成记录不得连带删除 annotation，删除整个子账号除外。

## 6. `listed` 与 `full` 汇总语义

| record | `listed` | `full` |
|---|---|---|
| `operator_snapshot` | 仅合并列出的客观字段；报告外密探不变 | 替换账号/game 的完整客观养成投影；仅允许可信完整备份，扫描 v1 禁用 |
| `operator_annotation_snapshot` | 仅修改列出 entry 中实际出现的主观字段 | 完整恢复全部主观标注；省略密探恢复默认值 |

导入端必须在 preview 中明确显示 record 的覆盖范围。浏览器不得在没有额外确认的情况下提交 `full`；OpenAPI 自动采集权限拒绝全部 `full` record。

## 7. 导入、预览和自动上报

### 7.1 浏览器文件导入

```text
选择 JSON → Schema 校验 → 来源账号映射 → 服务端 preview
→ 查看逐 record / 逐密探 / 逐分区差异 → 排除或确认 → commit
```

浏览器 JWT 可以导入两种 record。preview 必须说明主观数据是否存在，不能把“未携带 annotation record”显示成“将清空标注”。

### 7.2 自动采集端

自动采集端输出本协议的受限子集：

- 一个来源账号；
- 一个或多个 `record_type=operator_snapshot`；
- `source_kind=scan`；
- `snapshot_scope=listed`；
- 不包含 `operator_annotation_snapshot`；
- 使用结构化 `match`、`section_status`、`coverage` 和 diagnostics 表达不确定性。

自动上报使用账号绑定的 `operator:scan:write`，服务端强制上述限制。完整导入/备份权限与扫描权限分开，避免采集程序修改用户主观数据。

### 7.3 幂等和部分失败

- 同一 document 可以包含多个 record；每个 record 独立判定 accepted、duplicate、partial、review 或 rejected；
- 某条客观 record 的命盘分区 review，不妨碍其 basic/huaji 等 ready 分区导入；
- annotation record 不做 OCR 推断，Schema 或语义错误时整条 annotation record 拒绝；
- commit 必须重新验证 preview token、record revision 和目标账号权限。

## 8. Schema 校验与语义校验

JSON Schema 负责：

- 必填字段、类型、枚举、格式和通用数值范围；
- `star_level` 的通用整数范围；
- 双命盘、星石槽位和 annotation full/listed 的形状；
- 禁止未知顶层和业务字段，`diagnostics` 除外。

服务端语义校验负责：

- `account_id` 是否存在于 `accounts`，账号映射和权限；
- `operator_id`、命盘、星石是否存在于指定目录版本；
- 同一密探/槽位重复、record ID 冲突和时间顺序；
- 修为等级前置，以及按公共图鉴身份校验普通/SP 的 `star_level` 语义；
- 奇闻只接受 `attack / hp / special`，按密探公共图鉴稀有度校验上限，并检查第三项展示名是否已维护；
- `full` 是否真的满足完整导入前提；
- combat input signature 和扫描观测有效性。

推荐稳定错误码：

```text
unsupported_exchange_version
schema_validation_failed
account_mapping_required
idempotency_conflict
unknown_operator
invalid_star_level
invalid_oddities
catalog_oddity_name_missing
oddity_label_mismatch
invalid_disc_loadout
invalid_equipped_star_stones
invalid_annotation_snapshot
scan_scope_not_allowed
review_required
```

## 9. v2 兼容与迁移

后端继续接受：

```text
format = myshare-operator-exchange
version = 2
record_type = operator_snapshot
```

v2 到 v3：

| v2 | v3 |
|---|---|
| `entries[].id` | `operator_id` |
| `level` / `elite` | 不变 |
| `starLevel` / `star_level` | 统一规范为 `star_level`，数值不变；服务端按公共图鉴身份校验 |
| `discs` | `disc_loadouts[0].discs` |
| `starStones` / `star_stones` | 规范化为 `equipped_star_stones` 六槽 |
| 无主观标注 | 没有 annotation record，保留服务器现值 |

旧浏览器备用数据或迁移文件若使用中文奇闻名作为键，兼容层只把“攻击力/攻击/攻击值”映射为 `attack`，把“生命值/生命/生命力/HP”映射为 `hp`，剩余唯一一项映射为 `special`。剩余项为零项或多项时不得猜测，进入人工复核。正式 v3 不接受中文键。

v3 导出统一写 snake_case `star_level`，不再写旧 camelCase `starLevel`；也不写旧 `discs`、`starStones` 或名称型奇闻键。旧客户端需要 v2 时由服务端显式导出 v2 兼容视图；第二套命盘、主观标注等不能无损降级的内容必须返回 warning。普通/SP 的化极数值在 v2/v3 间不需要转换，只需要规范字段名并依据 operator ID 校验。

## 10. 配套文件与验收

- Schema：[`schemas/operator-growth-exchange-v3.schema.json`](./schemas/operator-growth-exchange-v3.schema.json)
- 完整备份有效样例：[`examples/operator-growth-exchange-v3/full-backup.valid.json`](./examples/operator-growth-exchange-v3/full-backup.valid.json)
- 自动采集 SP 有效样例：[`examples/operator-growth-exchange-v3/scan-sp.valid.json`](./examples/operator-growth-exchange-v3/scan-sp.valid.json)
- Schema 非法样例：[`examples/operator-growth-exchange-v3/schema-invalid.json`](./examples/operator-growth-exchange-v3/schema-invalid.json)
- 语义 review 样例：[`examples/operator-growth-exchange-v3/semantic-review.json`](./examples/operator-growth-exchange-v3/semantic-review.json)

三端验收：

1. 有效样例同时通过采集端、前端和后端的同一 Schema；
2. 非法样例被 Schema 拒绝；
3. 语义 review 样例通过 Schema，但被后端识别为 4 星奇闻上限异常；
4. 只导入客观 scan record 不改变已有养成状态、favorite、目标和备注；
5. 完整备份导出再导入可以恢复客观与主观数据；
6. 同一 `record_id` 重试不会重复写入；
7. 修改公共图鉴第三项名称后，既有 `special.current` 不迁移，攻生签名不因纯展示名变化而失效。
