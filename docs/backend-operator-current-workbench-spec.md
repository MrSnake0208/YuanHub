# 密探「当前养成」工作台后端配合规格

状态：后端讨论稿，可进入接口评审  
适用服务：账号、密探养成、库存投影、导入导出  
更新时间：2026-08-21  
配套前端方案：[`operator-current-workbench-implementation-plan.md`](./operator-current-workbench-implementation-plan.md)  
自动采集接入：[`operator-auto-scan-integration-plan.md`](./operator-auto-scan-integration-plan.md)  
正式交换协议：[`operator-growth-data-exchange-protocol-v3.md`](./operator-growth-data-exchange-protocol-v3.md)
当前立即实施批次：[`backend-operator-current-foundation-spec.md`](./backend-operator-current-foundation-spec.md)

## 1. 后端配合范围

本规格支持六类能力：

1. 按子账号保存密探养成状态：养成中、已毕业、不养成；
2. 将当前仅保存在浏览器的双命盘、奇闻及攻生命校正数据同步到云端；
3. 由浏览器文件导入和自动采集 OpenAPI 接受同一份版本化扫描报告；
4. 同步并展示当前已装备星石，提供不丢失资产的快捷卸除和撤销；
5. 提供等级、修为、化极的服务端消耗预览和智能提升建议；
6. 在同一事务内更新密探状态、扣减库存并写入可审计流水。

明确不在本次范围：

- 星石替换、升级、推荐、无限方案和完整库存管理；但当前已装备星石必须同步、返回并参与攻生输入，也必须支持单槽/整套卸除；
- 当前命盘 / 当前装备概念；双命盘没有 active 状态；
- 五铢钱库存、校验或扣减；
- 公开委托分享链接；第一版委托 PNG 由前端本地生成；
- 一次操作同时提升多个维度或多个密探；第一版每次只执行一个密探的一个维度。

## 2. 当前约束与问题

现有能力：

- `GET /v1/operator/current` 已通过 `starLevel` 返回完整化极标量，并返回单一 `discs` 和当前装备 `starStones`；
- `starLevel` 已覆盖普通密探节点与觉醒，本体/SP 各自独立；SP 可结合公共图鉴 `spOf` 身份直接把标量解释为星级；
- `starStones` 已校验 `main1..main3 / assist1..assist3` 六槽，当前缺的是资产化卸除/恢复，不是展示数据字段；
- `POST /v1/operator/import` 通过 `operator_snapshot` 更新密探状态；
- `GET /v1/inventory/current` 可读取通用材料和密探心纸；
- `POST /v1/inventory/import` 可写库存快照；
- 特别关注已经使用独立的 `agent-favorites` API；
- 前端已经有等级、修为、化极固定需求规则和攻击 / 生命计算器。

现有问题：

- 密探更新和库存更新位于两个独立导入接口，无法保证原子性；
- 双命盘、奇闻和攻生命校正值没有可靠的跨设备真相源；
- 自动采集报告没有版本、幂等批次、覆盖范围和分区状态，不能安全地直接写入；
- 采集攻生与当前装备星石绑定；旧数据模型无法在装备变化后判断观测值是否仍有效；
- 当前没有独立字段表达已毕业和不养成；特别关注仍需保持为正交布尔状态；
- 旧 `discs` 被前端临时解释为当前装备，与最终产品语义不一致；
- 普通快照导入不应覆盖用户的主观养成状态。

## 3. 推荐领域模型

### 3.1 公共图鉴奇闻定义

第三项奇闻的展示名称属于管理员维护的密探公共图鉴，不属于任何用户养成记录。现有公共目录实体和管理写入 DTO 增加：

```text
operator_catalog
  ...
  rarity
  special_oddity_name nullable  # 迁移期允许空；新建密探要求填写
  catalog_version
```

管理员仍通过现有 `/v1/admin/operator-catalog` 新增或整条更新密探，写入字段使用 `special_oddity_name`。服务端校验去除首尾空格后长度 `1..32`；库存导入、养成导入、自动采集和普通用户接口都不得修改它。

现有 `GET /v1/operator/catalog` 在每位密探上返回服务端生成的只读定义：

```json
{
  "id": "char_012_yanliang",
  "rarity": 4,
  "special_oddity_name": "免伤值",
  "oddity_schema": {
    "attack": { "name": "攻击力", "max": 305 },
    "hp": { "name": "生命值", "max": 1820 },
    "special": { "name": "免伤值", "max": 11 }
  }
}
```

`attack / hp / special` 是不可编辑的稳定语义键；管理员只编辑 `special_oddity_name`，三个上限由 `rarity` 查表生成，禁止在每个密探上重复保存可漂移的 `max`。修改名称或稀有度后必须更新 `catalog_version` 并使公共目录缓存失效。纯名称修改不迁移用户 `combat_stats`，也不让既有攻生观测变成 stale。

迁移期间旧目录缺少名称时，公共接口返回 `special.name="第三属性（图鉴待维护）"` 和 `incomplete_fields=["special_oddity_name"]`；导入预览可继续校验 `special.current`，但返回 `catalog_oddity_name_missing` warning。后端不得按职业猜测并持久化正式名称。

### 3.2 客观养成状态

继续由密探当前投影维护，并复用已经上线的 `starLevel` 与 `starStones`：

```text
operator_current
  user_id
  account_id
  game
  operator_id
  level
  elite
  star_level           # 现有化极唯一持久化真相源
  disc_loadouts
  star_stones          # 现有六槽当前装备字段
  combat_stats
  listed_baseline_at
  revision
  updated_at
```

站内 current API 不再新增与 `star_stones` 同义的 `equipped_star_stones` 持久化字段。接口文档应明确现有 `star_stones` 表示“当前已装备星石”，未来的星石资产/方案使用独立资源。`star_stones` 参与攻生计算，但不作为等级、修为、化极的材料消耗项。

#### 化极状态

数据库、站内 current API 和 v3 交换协议统一以现有 `starLevel/star_level` 作为唯一真相源。普通密探沿用已经实现的编码：

```text
0      = 未拥有
1..30  = 6 × (星级 - 1) + 节点 + 1
31     = 已觉醒
```

SP 由公共图鉴 `spOf != null` 识别，`starLevel=1..5` 直接表示星级，不生成小节点；本体与 SP 的 `starLevel` 继续独立保存。

v3 JSON 直接使用 snake_case `star_level`，数值与站内 `starLevel` 完全相同，不做结构转换。Schema 校验公共范围 `0..31`；采集端负责按密探类型编码，服务端必须再依据公共图鉴校验普通密探 `0..31`、SP `0..5`。提升事务继续使用 `dimension=huaji`，目标直接提交标量。

#### 双命盘

建议结构：

```json
{
  "disc_loadouts": [
    {
      "id": "disc_1",
      "name": "命盘一",
      "discs": [
        { "ot_name": "技能增伤" },
        { "ot_name": "普攻强化" },
        { "ot_name": "初始能量" }
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

校验：

- 最多两套，不要求必须两套；
- 每套最多三个命盘；
- 组合名称长度 `1..64`，空名称可由服务端归一为「命盘一 / 命盘二」；
- 同一组合内命盘名称去重，并校验属于该密探的公共命盘目录；
- 不接受 `active`、`is_active` 或 `active_disc_loadout_id`；旧字段只做兼容读取。

旧 `discs` 兼容规则：

1. 只有 `discs` 时，将其读取为第一套「命盘一」；
2. 已存在 `disc_loadouts` 时，以新字段为准；
3. 若旧客户端仍需要 `discs`，导出时可以镜像第一套内容，但必须标注它是兼容字段，不代表当前装备；
4. 禁止通过旧 `discs` 写入覆盖已有第二套命盘。

#### 战斗属性输入

服务端保存计算输入和观测 / 校正值，不要求复制前端 Wiki 面板公式：

```json
{
  "combat_stats": {
    "observed_attack": 8186,
    "observed_hp": 28704,
    "manual_attack": null,
    "manual_hp": null,
    "display_mode": {
      "attack": "auto",
      "hp": "manual"
    },
    "source": "scan",
    "observed_at": "2026-08-20T12:00:00+08:00",
    "observed_status": "valid",
    "combat_input_signature": "sha256:...",
    "observed_inputs": {
      "level": 90,
      "elite": 16,
      "star_level": 22,
      "oddities_signature": "sha256:...",
      "equipped_star_stones_signature": "sha256:..."
    },
    "oddities": {
      "attack": { "current": 500, "max": 500 },
      "hp": { "current": 2600, "max": 2600 },
      "special": { "current": 15, "max": 15 }
    }
  }
}
```

校验：

- `oddities` 只接受 `attack / hp / special`，每项数值非负且 `current <= max`；名称不进入账号数据；
- `section_status.oddities=ready` 时三个键必须齐全；`partial` 只合并出现的稳定键；`unavailable` 保留旧值；空对象不具有清空语义；
- 奇闻上限由公共目录稀有度决定：3 星 `300/1560/9`、4 星 `305/1820/11`、5 星暂沿用 `500/2600/15`；请求中的 `max` 只作诊断，不能覆盖目录规则；
- `manual_attack` / `manual_hp` 允许 `null`，表示恢复自动计算；
- `display_mode.attack` / `display_mode.hp` 允许 `auto | manual | null`，只记忆用户上次保存时采用的显示结果；缺失保留，`null` 清除偏好，不改变任何攻生值或观测状态；
- `source` 使用稳定枚举，如 `scan | manual | imported`；
- `observed_status` 使用 `valid | stale | unverified | unavailable`；等级、修为、化极、奇闻或已装备星石变化后，旧扫描观测必须改为 `stale`；缺少旧输入签名但仍需保留的历史值使用 `unverified`；
- 观测值和手动校正值均不得因输入变化被静默删除；响应需要明确当前展示采用公式、扫描还是手动值；显示偏好通过 `combat_stats.display_mode` 跨设备保存，未提供该字段的旧数据由前端兼容回退；
- 自动计算结果不作为持久化真相源，避免规则更新后保存值与输入不一致。

#### 当前已装备星石

当前展示与攻生输入继续读取现有 `OperatorEntry.starStones`，槽位固定为 `main1..main3 / assist1..assist3`。本阶段不需要为了“已装备”语义重命名字段或复制数据。以下资产/装备关系模型只属于开放快捷卸除之前的后续阶段 C：

推荐将账号级星石实例与密探槽位关系分开：

```text
star_stone_instance
  account_id
  instance_id
  stone_id
  level
  source
  last_observed_at

operator_star_stone_equipment
  account_id
  operator_id
  slot
  instance_id
  revision
  equipped_at

unique(account_id, operator_id, slot)
unique(account_id, instance_id) where equipped
```

`GET /v1/operator/current` 可将关系聚合成：

```json
{
  "equipped_star_stones": [
    { "type": "main1", "instance_id": "ssinst_xxx", "stone_id": "stone_xxx", "name": "破军", "level": 60 },
    { "type": "assist1", "instance_id": "ssinst_yyy", "stone_id": "stone_yyy", "name": "天相", "level": 50 }
  ]
}
```

校验与持久化：

- 槽位固定为 `main1..main3`、`assist1..assist3`，同一槽位唯一；旧 `main/assist` 只迁移到第一槽，采集原文 `support` 归一为 `assist`；
- `stone_id` 是公共目录 ID，`instance_id` 是账号内星石实例 ID；名称/目录 ID 必须可映射到公共星石目录，等级按目录规则校验；
- 自动采集无法识别唯一实例时不要求提交 `instance_id`。后端按账号、当前槽位和既有装备安全复用实例，无法复用时创建本地实例；同一 `record_id` 重试不得生成重复资产；
- 扫描只证明这些实例当前已装备，不代表采集到了完整星石库存；自动导入不得把报告外的未装备资产删除；
- 星石资产与装备关系分离。卸除只解除装备并把资产保留在未装备集合，绝不删除星石实体；
- 如果当前后端尚无星石资产表，至少保留可重新装备所需的完整对象和原槽位，不能用删除 JSON 元素作为最终持久化语义；
- 双命盘不拥有各自的星石集合。自动采集在命盘 active slot 下读到的星石先归一为这一份密探级装备；
- current 响应提供 6 槽稳定顺序以及攻生签名状态，供列表和委托资料展示。

### 3.3 主观养成标注

养成状态必须独立于 `operator_snapshot`，也必须独立于特别关注：

```text
operator_annotation
  user_id
  account_id
  operator_id
  growth_state
  note nullable
  revision
  created_at
  updated_at

unique(user_id, account_id, operator_id)
```

养成目标建议独立持久化：

```text
operator_growth_target
  user_id
  account_id
  operator_id
  target_level nullable
  target_elite nullable
  target_star_level nullable
  target_heart_paper nullable
  revision
  created_at
  updated_at

unique(user_id, account_id, operator_id)
```

`growth_state` 枚举：

```text
active | graduated | skip
```

语义：

- `active`：养成中，也是没有特殊置后安排时的默认值；
- `graduated`：用户主观标记为已毕业；
- `skip`：不养成。

普通密探快照导入、删除或重放不得覆盖此表。删除整个子账号时需要级联删除。

特别关注继续由现有 `agent-favorites` 资源维护，同一个密探可以同时满足：

```text
growth_state = graduated
favorite = true
```

这是合法且重要的状态：用户可能已经完成等级、修为和命盘养成，但仍持续追踪心纸收集和化极记录。修改 `growth_state` 不得新增、删除或覆盖 favorite；修改 favorite 也不得改变 `growth_state`。

交换协议中的 `operator_annotation_snapshot` 是传输层聚合记录，不要求后端把三类主观数据合并存表。导入服务应在同一 record 事务中分别更新 `operator_annotation`、现有 favorites 和 `operator_growth_target`：

- `listed` 只修改 entry 中实际出现的字段；
- `note=null` 和 `targets=null` 分别表示明确清除；
- `full` 要求每条 entry 完整提供四类主观字段，报告外密探恢复默认值；
- 没有 annotation record 时，三类主观数据全部保持不变。

### 3.4 升级事务

一次快捷提升由一个业务事务表达：

```text
operator_upgrade_transaction
  transaction_id
  idempotency_key
  user_id
  account_id
  operator_id
  dimension
  from_value
  to_value
  requirements_snapshot
  consumption_records
  operator_revision_before
  operator_revision_after
  created_at
```

`dimension` 第一版仅接受：

```text
level | elite | huaji
```

同一数据库事务内必须：

1. 校验账号、密探及当前养成版本；
2. 根据服务端固定规则重新计算目标区间消耗；
3. 忽略五铢钱；
4. 锁定并校验相关库存余额；
5. 写入库存消耗流水；
6. 更新密探当前投影；
7. 写入升级审计记录；
8. 提交后返回新的密探状态、库存余额和版本。

任何步骤失败必须整体回滚。

## 4. 建议接口

公共图鉴沿用现有接口，不新增第二套目录：

```http
GET /v1/operator/catalog
GET /v1/admin/operator-catalog
POST /v1/admin/operator-catalog
PUT /v1/admin/operator-catalog/{operator_id}
```

管理端写入 DTO 增加 `special_oddity_name`；公开和管理端读取 DTO 增加 `special_oddity_name` 与服务端派生的 `oddity_schema`。旧客户端可忽略新增字段。新增/更新成功后返回新的 `catalog_version`，确保导入 preview、养成页和管理员页不会混用旧名称或旧上限。

接口名称可以按后端现有命名调整，但语义和事务边界需要保持。

### 4.1 养成状态

#### 批量读取

```http
GET /v1/operator/annotations?account_id=acc_xxx
```

响应：

```json
{
  "account_id": "acc_xxx",
  "items": [
    {
      "operator_id": "char_001_xxx",
      "growth_state": "graduated",
      "note": null,
      "revision": 3,
      "updated_at": "2026-08-20T12:00:00+08:00"
    }
  ]
}
```

#### 写入或重置

```http
PUT /v1/operator/annotations/{operatorId}?account_id=acc_xxx
```

```json
{
  "growth_state": "graduated",
  "note": null,
  "expected_revision": 2
}
```

`active` 可以保留一行记录或删除物理记录，但响应语义必须一致。重复写入同一状态应幂等。

#### 特别关注保持独立

- 继续使用现有 `GET / PUT / DELETE /v1/inventory/agent-favorites`；
- 养成追踪继续只依据 favorite 判断是否进入追踪名单；
- 已毕业且 favorite 的密探仍正常返回心纸、化极和追踪信息；
- 新养成状态 API 不替代、不兼容映射、也不安排废弃 favorite API；
- 如果未来提供聚合读取接口，可以在响应中附带 `favorite`，但其持久化真相源仍与 `growth_state` 分离。

### 4.2 当前养成扩展与局部校正

`GET /v1/operator/current` 的 entry 增加可选字段：

```text
disc_loadouts
combat_stats
revision
updated_at
```

已有 `star_level` 和 `star_stones` 继续原样返回，分别作为化极与当前六槽装备的站内权威字段；不增加同义持久化字段。

建议增加安全的局部校正接口：

```http
PATCH /v1/operator/current/{operatorId}?account_id=acc_xxx
```

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

规则：

- 只更新请求中出现的字段，不能把未出现字段归零；
- 指定游戏 current 与通用 current 合并读取时，PATCH 必须按 entry 选择实际来源：指定游戏 entry 优先，缺失时回退通用 entry；不能因指定游戏文档已存在而误报 `operator_not_found`；
- `star_stones` 出现时完整替换六槽当前装备，空数组表示清空，字段缺失表示保留；合法槽位为 `main1..main3`、`assist1..assist3`；
- `combat_stats.display_mode` 按出现字段局部合并；目标 entry 缺失时，`expected_revision=0` 表示创建默认 current entry 后应用 PATCH，非零 revision 不得创建；
- 校正不产生库存消耗；
- 星石更新必须直接走该 PATCH，不得通过旧 v2 import 构造补发记录；
- 服务端继续校验等级 `0..100`、修为 `0..17`、现有 `starLevel` 语义及修为等级上限；低等级修为关系必须使用已确认的版本化规则，不能用旧前端偏移公式拒绝采集到的合法 `Lv1/修为1`、`Lv10/修为2` 等状态；
- 内部可以继续追加 `listed operator_snapshot`，但接口必须保证局部字段合并；
- 返回合并后的完整 entry 和新 revision；
- `reason=manual_correction` 进入审计信息，便于和真实升级区分。

当前前端编辑器统一使用该 PATCH 保存等级、修为、化极、双命盘、六槽星石和战斗资料；v2 import 仅保留给显式交换文档导入，不作为星石编辑的兼容写入路径。

### 4.3 v3 交换文档预览与提交

浏览器 JWT 入口：

```http
POST /v1/operator/import/preview
POST /v1/operator/import
```

浏览器提交完整《密探养成数据交换协议 v3》文档和来源账号到目标账号的 mapping，可以同时导入 `operator_snapshot` 与可选的 `operator_annotation_snapshot`。

自动采集端的账号绑定 OpenAPI 入口：

```http
POST /open-api/operator/scan-import/preview
POST /open-api/operator/scan-import/commit
Authorization: Bearer <account-bound-token>
```

两组接口必须调用同一个 v3 Schema validator 和 import service。浏览器 JWT 可以处理完整 v3；OpenAPI 的 `operator:scan:write` 只允许单一来源账号、`operator_snapshot + source_kind=scan + snapshot_scope=listed`，并由 token 强制绑定目标账号。

preview 要求：

- 校验格式版本、每个 `record_id`、游戏、目录版本、覆盖范围和账号 mapping；
- 按密探和分区返回 `accepted | partial | review | rejected | unchanged`、字段差异、warning 和 blocking error；
- 以服务端公共目录重新校验身份、`attack / hp / special` 奇闻键与稀有度上限、普通/SP `star_level`、双命盘和已装备星石；第三项 OCR 名称只与目录做 warning 比对；
- 对 annotation record 分开展示养成状态、favorite、备注和目标的差异；没有 annotation record 时明确显示“主观数据不变”；
- 不写当前投影，返回有时效的 `preview_token`、目标账号 revision 摘要和允许提交的选择项；
- 自动扫描权限永远不接受 annotation record，因此不能修改 `growth_state`、favorites、养成目标或用户备注。

commit 请求建议只携带预览 token 和用户排除项：

```json
{
  "preview_token": "scan_preview_xxx",
  "exclude": [
    { "operator_id": "char_xxx", "sections": ["disc_loadouts"] }
  ]
}
```

commit 要求：

- 按 `(target_account_id, record_id)` 逐 record 幂等；相同内容重试返回首次结果，不重复追加投影；
- 重新校验账号权限、preview 有效期和相关 revision；
- `ready` 的明确空值才可清空，`partial/review/unavailable` 不得清空服务端现值；
- 客观和主观 `listed` 均不删除文档外数据；`full` 需要额外确认且按两个 record_type 分别覆盖；
- annotation record 在一个事务内协调 annotation、favorites 和 targets；任一失败则整条 annotation record 回滚；
- 返回批次 ID、逐条/逐分区结果、更新后的 operator revision 和 warning；
- 保存必要的审计摘要，避免持久化无上限的 OCR 调试数据或敏感截图。

扫描程序的 OpenAPI token 只授予 `operator:scan:write`，需要支持吊销、速率限制和最近使用审计。导出的 JSON 不包含 token，服务端日志不得记录 Authorization 内容。

### 4.4 已装备星石卸除与恢复

确认层可先请求只读预览：

```http
POST /v1/operator/current/{operatorId}/star-stones/unequip/preview?account_id=acc_xxx
```

```json
{
  "slots": ["main1"],
  "expected_operator_revision": 8
}
```

响应返回将卸除的完整星石、卸除前后公式攻生、扫描观测将变为 stale 的提示和预览有效期。规则数据不足时 `projected_attack/projected_hp` 为 `null`，并返回稳定提示 `combat_recollect_required`。

执行：

```http
POST /v1/operator/current/{operatorId}/star-stones/unequip?account_id=acc_xxx
Idempotency-Key: 6f8e...
```

请求与预览相同，可增加 `preview_token`。服务端必须在一个事务内：

1. 锁定密探当前装备与 revision；
2. 校验目标槽位仍装备预览中的星石；
3. 解除槽位关系但保留星石资产；
4. 更新 `combat_input_signature`，把旧扫描观测标为 `stale`；
5. 写入装备审计并返回更新后的完整密探 entry；
6. 生成即时 `undo_token`，并持久化可查询的最近卸除记录和 `restore_until`。

整套卸除可以提交当前六个已占用槽位或明确 `all=true`。空 `slots` 不得解释为全部卸除。卸除不写库存消耗流水，也不修改命盘、养成状态或 favorite。

撤销：

```http
POST /v1/operator/current/{operatorId}/star-stones/unequip/undo?account_id=acc_xxx
```

撤销使用一次性 `undo_token` 或最近卸除记录 ID，仍需校验账号、revision、目标槽位空闲和星石资产未被其他操作占用。current 响应需要给空槽返回仍可用的 `restorable_unequip`，使页面刷新后仍能执行「恢复上一颗」。撤销恢复装备输入；只有签名重新完全匹配原观测输入时，原扫描观测才可以恢复为 `valid`。

恢复窗口建议至少 24 小时，具体值由服务端配置；无论窗口多久，资产本身都永久保留。当前页没有通用重新装备能力，因此最近卸除恢复接口是开放卸除按钮的前置条件。

### 4.5 升级消耗预览

```http
POST /v1/operator/upgrades/preview
```

```json
{
  "account_id": "acc_xxx",
  "operator_id": "char_001_xxx",
  "dimension": "elite",
  "target": 17,
  "expected_operator_revision": 7,
  "expected_inventory_revision": 42
}
```

响应：

```json
{
  "available": true,
  "dimension": "elite",
  "from": 16,
  "to": 17,
  "requirements": [
    {
      "entity_type": "item",
      "id": "beihuifengshan",
      "required": 1200,
      "owned": 1380,
      "balance_after": 180
    }
  ],
  "blocking_reasons": [],
  "operator_revision": 7,
  "inventory_revision": 42,
  "expires_at": "2026-08-20T12:01:00+08:00"
}
```

要求：

- 预览不写任何状态；
- 不返回或校验五铢钱；
- `blocking_reasons` 使用稳定错误 key 和用户可读 message；
- 前端可以展示本地快速估算，但确认层必须使用服务端预览。

#### 等级经验书扣减策略

等级升级必须返回具体的经验书扣减组合，不能只返回总经验：

1. 优先满足目标所需经验；
2. 在可满足的组合中优先最小化溢出经验；
3. 溢出相同时使用稳定且有测试覆盖的消耗顺序；
4. 预览必须展示每种经验书数量和总溢出经验；
5. 执行接口必须复用同一算法，不得由前端自行选择后再传数量。

### 4.6 批量智能建议

```http
GET /v1/operator/upgrade-opportunities?account_id=acc_xxx&game=如鸢
```

响应按密探返回最多三个维度的建议：

```json
{
  "account_id": "acc_xxx",
  "inventory_revision": 42,
  "items": [
    {
      "operator_id": "char_001_xxx",
      "operator_revision": 7,
      "suggestions": [
        {
          "dimension": "level",
          "current": 85,
          "recommended_target": 95,
          "ready": true,
          "label_key": "materials_ready"
        },
        {
          "dimension": "huaji",
          "current": 20,
          "recommended_target": 22,
          "ready": false,
          "missing_count": 1
        }
      ]
    }
  ]
}
```

规则：

- `active / graduated / skip` 均可返回建议；养成状态只参与排序、筛选和展示层级，不改变可执行能力；
- `graduated` 尤其不能屏蔽 favorite 密探的心纸和化极追踪；
- favorite 可以作为建议排序信号，但不改变可支付计算结果；
- 建议按当前库存分别计算，不承诺所有建议可以同时执行；
- 每次成功执行后 inventory revision 变化，前端必须刷新整批建议；
- 若第一期不实现此接口，前端可以用现有静态规则生成按钮文案，但执行接口仍必须服务端权威校验。

### 4.7 原子执行

```http
POST /v1/operator/upgrades/execute
Idempotency-Key: 6f8e...
```

请求与预览相同，并增加可选的预览 token 或版本：

```json
{
  "account_id": "acc_xxx",
  "operator_id": "char_001_xxx",
  "dimension": "huaji",
  "target": 22,
  "expected_operator_revision": 7,
  "expected_inventory_revision": 42,
  "preview_token": "upgrade_preview_xxx"
}
```

成功响应：

```json
{
  "transaction_id": "upgrade_xxx",
  "operator": {
    "id": "char_001_xxx",
    "star_level": 22,
    "revision": 8
  },
  "consumed": [
    {
      "entity_type": "agent",
      "id": "char_001_xxx",
      "count": 40,
      "balance_after": 12
    }
  ],
  "inventory_revision": 43,
  "created_at": "2026-08-20T12:00:30+08:00"
}
```

要求：

- `Idempotency-Key` 在账号范围内唯一；相同 key 重试返回首次结果；
- 服务端必须重新读取并锁定当前状态，不能只信任 preview token；
- 不允许库存出现负数；
- 不允许越过等级、修为、化极的合法边界；
- 更新和扣减必须处于同一数据库事务；
- 成功响应直接提供前端刷新当前行所需的完整关键状态。

## 5. 库存消耗流水

现有 `reward_delta` 不应承载负数消耗语义。建议新增明确的消耗记录：

```text
record_type = consumption_delta
stock_effect = subtract
acquisition_channel = operator_upgrade
transaction_id = upgrade_xxx
```

`entries[].count` 使用正数表示消耗数量，由 `stock_effect=subtract` 决定方向。

一次升级可能同时消耗：

- `entity_type=item` 的经验书、突破材料、修为材料、觉醒材料；
- `entity_type=agent` 的该密探心纸。

如果现有库存记录要求单一 `entity_type`，可以在同一事务内写两条 consumption record，并通过同一个 `transaction_id` 关联。库存 current / records / export / replay 都必须理解新的 subtract 语义。

升级事务第一版不要求撤销。以后增加升级撤销时应创建反向补偿流水，不直接删除已发生的升级历史；星石卸除的短时撤销是装备关系恢复，按 4.4 单独处理。

## 6. 并发、幂等与错误

建议稳定错误码：

| HTTP | code | 含义 |
|---|---|---|
| 404 | `account_not_found` | 账号不存在或不属于当前用户 |
| 404 | `operator_not_found` | 密探不在公共目录或当前账号状态不存在 |
| 409 | `operator_state_stale` | 密探 revision 已变化 |
| 409 | `inventory_state_stale` | 库存 revision 已变化 |
| 409 | `insufficient_inventory` | 至少一种材料不足 |
| 409 | `idempotency_conflict` | 相同幂等 key 对应不同请求 |
| 409 | `stone_slot_changed` | 星石槽位与预览时不一致 |
| 409 | `undo_not_available` | 撤销已过期、槽位被占用或星石状态已变化 |
| 422 | `invalid_growth_state` | 养成状态非法 |
| 422 | `invalid_upgrade_target` | 目标越界、未前进或不满足前置关系 |
| 422 | `invalid_star_level` | 化极标量越界或与普通/SP 目录身份不符 |
| 422 | `invalid_disc_loadout` | 双命盘数量、名称或内容非法 |
| 422 | `invalid_equipped_star_stones` | 槽位、名称、等级或重复装备非法 |
| 422 | `invalid_combat_stats` | 奇闻或手动面板数值非法 |
| 422 | `invalid_scan_format` | 自动采集格式或版本不支持 |
| 422 | `scan_review_required` | 存在必须人工复核且未排除的分区 |

错误响应应包含：

```json
{
  "error": {
    "code": "insufficient_inventory",
    "message": "材料不足，无法完成本次提升",
    "operator_id": "char_001_xxx",
    "dimension": "elite",
    "missing": [
      { "entity_type": "item", "id": "beihuifengshan", "count": 20 }
    ]
  }
}
```

## 7. 导入导出与协议兼容

### 7.1 旧 v2 普通养成快照

- 继续支持旧 v2 `operator_snapshot`；
- v2 不再无版本扩展新字段；未提供的新字段不得清空服务器已有第二套命盘和战斗属性；
- 旧 `starLevel` 与 `starStones` 继续更新现有同名真相源；`discs` 只更新第一套并保留第二套；
- v3 只把 camelCase `starLevel` 规范为 snake_case `star_level`，数值不变，并按公共图鉴身份复核；
- 无法无损降级的第二套命盘和主观标注返回 warning。

### 7.2 密探养成数据交换协议 v3

- 正式格式为 `myshare-operator-exchange@3`，Schema 和完整字段见 [`operator-growth-data-exchange-protocol-v3.md`](./operator-growth-data-exchange-protocol-v3.md)；
- `operator_snapshot` 交换客观练度，`operator_annotation_snapshot` 可选交换养成状态、favorite、目标和备注；
- 浏览器完整文件导入与 OpenAPI 自动上报复用同一 Schema、校验器和 import service；扫描权限只接受客观 scan 子集；
- 奇闻值只使用 `attack / hp / special`；第三项名称由公共图鉴 `special_oddity_name` 提供，协议和用户投影不保存展示名称；
- 3 星奇闻固定校验 `300/1560/9`，4 星固定校验 `305/1820/11`，当前旧报告中的 `attack.max=350` 必须产生错误或 review；
- SP 继续以 `starLevel/star_level` 直接保存星级且无小节点；采集端编码、服务端按公共图鉴身份复核，普通密探公式不能用于 SP；
- 已装备星石和观测攻生同批写入，并保存输入签名；分区不完整时不清空旧装备；
- 详细交换结构与采集端行为见 [`operator-auto-scan-integration-plan.md`](./operator-auto-scan-integration-plan.md)。

### 7.3 养成标注

- `growth_state`、favorite、目标和备注不属于客观 `operator_snapshot`；
- v2 导入和没有 annotation record 的 v3 文档不得修改任何主观数据；
- v3 使用独立 `operator_annotation_snapshot`；`listed` 做字段级合并，`full` 做完整主观状态恢复；
- 删除、重放客观养成记录不得影响 annotation/favorites/targets 投影。

### 7.4 库存协议

- 旧客户端不认识 `consumption_delta` 时，至少不能把它当奖励加回库存；
- 在正式进入导出协议前需要升级 Schema 版本或提供 capability 字段；
- 服务端 current 投影和 replay 测试必须覆盖 reward、snapshot、consumption 混合顺序。

## 8. 迁移方案

### 8.1 养成状态初始化

1. 现有已拥有密探默认读取为 `growth_state=active`；
2. 只有用户主动标记后才写入 `graduated` 或 `skip`；
3. 现有 favorites 数据不迁移、不改写；
4. 初始化和后续状态切换均不得影响特别关注集合。

### 8.2 旧单命盘

1. 读取旧 `discs` 为「命盘一」；
2. 用户首次保存双命盘时写入 `disc_loadouts`；
3. 第二套为空不影响第一套；
4. 丢弃本地 active 标记，不上传为任何当前装备字段。

### 8.3 旧星石与扫描观测

1. 读取旧 `star_stones` 时将 `main/assist` 归一到 `main1/assist1`，已有 `main1..3/assist1..3` 保持槽位；
2. 站内 current 继续以 `star_stones` 表示当前装备；只有进入星石资产化与卸除阶段时，才把可确认记录迁移为资产与装备关系；
3. 从自动采集的命盘 active slot 抽取星石时，两套命盘结果一致才自动去重写入；不一致进入 review；
4. 没有完整输入签名的旧扫描攻生默认标记为 `stale` 或 `unverified`，不能继续显示为已验证当前值。

### 8.4 浏览器备用数据

后端无法直接读取浏览器缓存。新前端登录后：

1. 读取当前账号、版本、密探对应的本地双命盘、已装备星石、战斗属性和养成目标；旧名称型奇闻键按“攻击类 → `attack`、生命类 → `hp`、剩余唯一项 → `special`”归一，无法唯一归一时进入确认；
2. 与云端 revision / updated_at 比较；
3. 有差异时让用户选择「保留云端」或「上传本机数据」；
4. 客观备用数据写入 `operator_snapshot`，本地目标写入独立 `operator_annotation_snapshot`；上传成功后记录迁移完成标记；
5. 不允许后台静默覆盖。

## 9. 分阶段后端交付

### 后端阶段 0：公共图鉴奇闻定义

- 目录实体与管理写入 DTO 增加 `special_oddity_name`，新建密探要求填写，存量密探允许分批补齐；
- 公共和管理员目录响应增加 `oddity_schema`，上限只按 `rarity` 在服务端派生；
- 名称/稀有度修改更新 `catalog_version` 并清理目录缓存；
- 完成管理员写入、普通用户禁止写入、缺名降级、名称改动不迁移用户记录的测试。

这是 v3 preview 的前置交付；公共目录稳定键和展示定义未上线前，不开放正式 v3 写入。

### 后端阶段 A1：客观资料底座（当前立即实施）

- v2、v3、current 与持久化统一复用现有 `starLevel/star_level`；
- 复用现有六槽 `starStones`，不新增同义装备字段；
- 增加 `disc_loadouts`、`combat_stats`、entry revision 和 current 响应；
- 奇闻稳定键、稀有度上限表和 combat input signature；签名不包含第三项展示名称；
- 增加带 revision 的局部校正接口；
- v2 `discs` 只更新第一套，保留第二套和战斗属性；
- 账号隔离、SP 标量语义、v2 import/export/delete replay 不覆盖测试。

完整实施边界见 [`backend-operator-current-foundation-spec.md`](./backend-operator-current-foundation-spec.md)。

解锁前端完整只读资料、委托交接和局部校正。

### 后端阶段 A2：主观状态与目标

- `operator_annotation` 数据模型和 API；
- `operator_growth_target` 数据模型和 API；
- `growth_state` 存储和 API，且与现有 favorites 保持正交；

解锁养成状态排序、目标和备注跨设备同步；favorites 继续使用现有独立 API。

### 后端阶段 B：v3 交换协议与自动采集导入

- 发布 `myshare-operator-exchange@3` Schema 和客观/主观固定样例；
- 实现统一 preview/commit service、逐分区 merge、annotation record 原子聚合和 `(target_account_id, record_id)` 幂等；
- 开放浏览器 JWT 完整 v3 文件导入与导出；
- 实现 v3 `star_level` 的目录感知校验，并固定奇闻、SP、双命盘和星石冲突测试；
- 在浏览器导入稳定后开放账号绑定 OpenAPI、权限吊销和速率限制。

解锁前端自动采集 JSON 直导和采集端自动上报。

### 后端阶段 C：星石快捷卸除

- 星石资产与装备关系分离，完成旧 `star_stones` 安全迁移；
- 实现卸除 preview、幂等 execute、即时 undo、可查询的最近卸除恢复和装备审计；
- 卸除事务更新 revision 与观测值有效状态，失败时整体回滚；
- current 和委托读取返回稳定六槽摘要。

解锁前端星石快捷卸除；不等待完整星石管理页。

### 后端阶段 D：升级预览与建议

- 将等级、修为、化极需求规则落到服务端；
- 实现单次 preview；
- 实现经验书稳定扣减算法；
- 可选实现批量 opportunities；
- 与现有前端规则做固定样例对账。

解锁前端智能按钮展示和确认预览。

### 后端阶段 E：原子执行与库存流水

- consumption record 和库存重放支持；
- 升级事务表或等价审计模型；
- 幂等、revision、行锁和事务回滚；
- execute 接口；
- current、records、export 的一致性测试。

解锁前端阶段 4 的正式「提升并扣库存」。

### 后端阶段 F：协议扩展与长期能力

- 对 v3 的后续字段只做有版本或 capability 的兼容扩展；
- annotations、favorites、targets、统一 `star_level` 化极标量、双命盘、已装备星石、战斗属性、消耗流水的完整备份恢复；
- 可选撤销、私密分享链接和审计查询。

不阻塞核心工作台上线。

## 10. 后端验收清单

- [ ] 养成状态按用户和子账号隔离，普通快照导入不会覆盖；
- [ ] 修改养成状态不会改变 favorites，修改 favorites 也不会改变养成状态；
- [ ] 已毕业且特别关注的密探仍进入心纸、化极和养成追踪结果；
- [ ] 双命盘最多两套、每套最多三项，不存在 active 语义；
- [ ] 旧 `discs` 能读取为第一套且不会覆盖第二套；
- [ ] SP 化极在 v2、v3、current 与持久化中都直接使用 `starLevel/star_level` 星级，不生成小节点；
- [ ] 管理员可在公共图鉴维护 `special_oddity_name`，公开目录返回稳定键、展示名称和派生上限；普通导入不能修改目录；
- [ ] 第三项改名不迁移 `special.current`，也不因纯展示名变化把攻生观测标记为 stale；
- [ ] 养成与交换数据只接受 `attack / hp / special`；3 星按 `300/1560/9`、4 星按 `305/1820/11` 校验，4 星 `attack.max=350` 不会静默入库；
- [ ] 浏览器文件导入和 OpenAPI 对同一 `record_id`、同一内容产生一致客观结果并保持幂等；
- [ ] v3 完整备份可以恢复 growth_state、favorite、目标和备注；没有 annotation record 时这些数据完全不变；
- [ ] 身份不确定拒绝整条，分区不确定只保留该分区旧值，`listed` 不删除报告外密探；
- [ ] 已装备星石继续通过现有 `starStones` 按六槽跨设备读取，并与扫描攻生保存同一输入签名；
- [ ] 单槽/整套卸除不删除星石资产，失败整体回滚；即时撤销和刷新后「恢复上一颗」均遵守 revision 与槽位占用；
- [ ] 星石等输入变化后旧扫描攻生标记 stale，不继续伪装成当前值；
- [ ] 奇闻、观测值、手动校正值可跨设备读取；
- [ ] 局部校正不扣库存，也不清空未提交字段；
- [ ] 五铢钱完全不进入 preview、opportunities 或 execute；
- [ ] 等级经验书组合稳定、溢出最小并有边界测试；
- [ ] 修为等级前置、化极边界和觉醒特殊材料校验正确；
- [ ] 升级成功后密探与库存同时变化；任一失败时两者均不变化；
- [ ] 相同 Idempotency-Key 重试不会重复扣减；
- [ ] 并发升级共享材料时至多一个请求按旧余额成功；
- [ ] consumption 流水可正确 current、records、export 和 replay；
- [ ] 删除子账号能级联清理标注、升级事务和相关投影。
