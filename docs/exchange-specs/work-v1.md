# YuanHub 作业协议 v1

状态：Draft / 准备实现  
格式标识：`yuanhub-work@1`  
面向对象：YuanHub、MaaYuan、YuanAssist 以及其他自动战斗/跟打程序

机器可读 Schema：[`schemas/work-protocol-v1.schema.json`](./schemas/work-protocol-v1.schema.json)  
目标平台映射：[`work-adapters-v1.md`](./work-adapters-v1.md)  
最小完整示例：[`examples/work-v1.json`](./examples/work-v1.json)

## 1. 定位

YuanHub 作业协议描述的是：

> 一份自动战斗作业“想让执行器做什么”。

它是跨自动化程序的语义中间层，不等同于任何一个客户端的原生存储格式。

本协议明确不承担以下职责：

- 不替代 YuanHub 的 Level/关卡系统。
- 不保存点赞、浏览量、作者、评论、审核状态等社区元数据。
- 不保存 MaaFramework Pipeline 的 `Click`、`Swipe`、`next`、`on_error`、ROI、模板匹配等底层节点。
- 不要求 YuanAssist 使用本协议作为本地脚本格式。
- 不把 MaaYuan-Share 当前继承自 MAA Copilot 的数据库结构视为协议标准。

YuanHub 中两者关系是：

```text
Level Catalog
  “这是哪个关卡”
       ▲
       │ reference
       │
YuanHub Work Protocol
  “这个关卡怎么自动打”
```

目标平台通过 Adapter 将本协议编译为自己的原生格式：

```text
                  YuanHub Work Protocol
                         │
             ┌───────────┴───────────┐
             ▼                       ▼
        MAAYUAN Adapter        YUANASSIST Adapter
             │                       │
             ▼                       ▼
      SiMing / Pipeline       script + instructions
```

## 2. 版本识别

所有正式文档必须同时包含：

```json
{
  "format": "yuanhub-work",
  "version": 1
}
```

`format` 与 `version` 都是必填字段。

读取器遇到未知版本必须返回不支持，不得把未知版本当作 v1 猜测解析。

历史草稿中缺少 `format` 或 `version` 的文档，可以由专门的 Legacy Parser 尝试迁移，但迁移后的正式文档必须补齐二者。

## 3. 顶层结构

```json
{
  "format": "yuanhub-work",
  "version": 1,
  "game": "如鸢",
  "level_id": "lvl_example",
  "stage_name": "爬塔21",
  "doc": {
    "title": "六月白鹄",
    "details": "打法说明……"
  },
  "operators": [
    "王粲",
    "赵云",
    null,
    null,
    null
  ],
  "exec": {
    "delays_ms": {
      "attack": 3000,
      "ultimate": 5000,
      "defense": 3000,
      "sp": 5000
    }
  },
  "rounds": [
    {
      "round": 1,
      "actions": [
        { "slot": 2, "type": "attack" }
      ]
    }
  ]
}
```

### 3.1 `game`

必填。当前允许：

- `代号鸢`
- `如鸢`

它用于确定关卡、密探与目标平台的游戏语境。

### 3.2 `level_id`

可选。引用 YuanHub Level Catalog 的稳定关卡 ID。

规则：

- 有可靠匹配时应填写。
- 无可靠匹配时应省略，不得为了通过校验伪造。
- Work Protocol 不复制 Level Catalog 中的完整分类、开放时间、结束时间等信息。
- `level_id` 只负责建立引用关系，不改变作业执行语义。

### 3.3 `stage_name`

必填，非空字符串。

它是作业自身携带的关卡名称/执行 fallback，用于：

- 离开 YuanHub 后仍能识别作业面向哪个关卡；
- Legacy MaaYuan/MAA 数据迁移；
- 当 `level_id` 不可用时给 Adapter 提供回退信息。

`stage_name` 不是 YuanHub Level Catalog 的稳定主键。

### 3.4 `doc`

```json
{
  "title": "六月白鹄",
  "details": "打法说明……"
}
```

- `title`：必填，作业标题。
- `details`：必填，可以为空字符串。
- 标题和说明属于作业本身，因此留在协议内。
- 作者、点赞、浏览量、来源站点等属于 YuanHub Work API 外层元数据，不进入协议。

## 4. 阵容与槽位

### 4.1 `operators`

`operators` 固定包含 5 个位置，每项为密探名称或 `null`：

```json
"operators": [
  "王粲",
  "赵云",
  null,
  "郭嘉",
  null
]
```

对应关系固定为：

```text
operators[0] -> slot 1
operators[1] -> slot 2
operators[2] -> slot 3
operators[3] -> slot 4
operators[4] -> slot 5
```

协议内所有 `slot` 字段都是 **1-based**，合法值始终为 `1..5`。

`null` 在这里具有明确语义：“该槽位没有指定密探”。这是本协议显式允许 `null` 的位置。

v1 刻意只存密探名称，不把 YuanHub 密探目录 ID 作为执行协议的强依赖。自动化执行的核心身份是槽位；未来若需要稳定密探实体引用，应通过新版本扩展。

## 5. 执行配置 `exec`

`exec` 可选。省略时，由目标 Adapter 使用目标平台默认执行配置。

### 5.1 默认动作延迟 `delays_ms`

```json
{
  "exec": {
    "delays_ms": {
      "attack": 3000,
      "ultimate": 5000,
      "defense": 3000,
      "sp": 5000
    }
  }
}
```

单位均为毫秒。

字段含义：

- `attack`：普攻动作后的默认延迟。
- `ultimate`：大招动作后的默认延迟。
- `defense`：防御动作后的默认延迟。
- `sp`：SP/圈动作后的默认延迟。

字段可以部分出现。缺失项由目标 Adapter 使用目标平台自己的默认值。

本协议不把 YuanAssist 的 `waitTurn` 与 MaaYuan/司命的回合识别 `post_delay` 合并成同一个公共字段，因为二者不是同一语义。

### 5.2 目标平台扩展 `extensions`

只有无法自然归入公共语义、但目标平台确实需要的信息进入 `extensions`。

#### MaaYuan

```json
{
  "exec": {
    "extensions": {
      "maayuan": {
        "level_type": "活动",
        "recognition_name": "爬塔21跟打",
        "rec_target_offset": [0, 0, 0, 0],
        "difficulty": "困难",
        "cave_type": "左",
        "lantai_nav": true
      }
    }
  }
}
```

这些字段主要服务于 SiMing/MaaYuan 的关卡导航与 OCR 编译，不属于通用战斗动作语义。

#### YuanAssist

```json
{
  "exec": {
    "extensions": {
      "yuanassist": {
        "enemy_turn_wait_ms": 8000
      }
    }
  }
}
```

`enemy_turn_wait_ms` 对应 YuanAssist 的回合延迟 `waitTurn`。该字段名保留目标扩展的既有命名，不表示动作级延迟。

## 6. 回合

```json
{
  "round": 1,
  "remark": "",
  "actions": []
}
```

规则：

1. `round` 必填，范围 `1..50`。
2. 同一文档内 `round` 不得重复。
3. 建议按 `round` 升序存储。
4. 空回合直接省略，不应创建 `actions: []` 的回合。
5. `remark` 仅供人阅读，不影响执行结果。
6. `actions` 数组顺序就是真实执行顺序，不再引入 `seq`、`step` 等冗余排序字段。

“附加回合/扩展行”是 SiMing 编辑器 UI 概念，不进入协议。同一回合重复操作同一槽位，只需继续追加动作：

```json
{
  "round": 3,
  "actions": [
    { "slot": 2, "type": "attack" },
    { "slot": 2, "type": "ultimate" }
  ]
}
```

## 7. 基础战斗动作

UI 可以继续显示 `A / ↑ / ↓ / 圈`，协议使用稳定枚举。

### 7.1 普攻

```json
{ "slot": 2, "type": "attack" }
```

### 7.2 大招

```json
{ "slot": 3, "type": "ultimate" }
```

### 7.3 防御

```json
{ "slot": 4, "type": "defense" }
```

### 7.4 SP / 圈

```json
{ "slot": 1, "type": "sp" }
```

v1 不存在“再次行动”这种独立类型。再次行动直接重复对应基础动作。

## 8. 流程动作

### 8.1 等待

```json
{
  "type": "wait",
  "duration_ms": 1200
}
```

`duration_ms` 必须大于 0。

`wait` 表示经过指定时长后自动继续。

### 8.2 暂停

```json
{
  "type": "pause"
}
```

`pause` 表示暂停自动执行，等待人工恢复。

它与 `wait` 是完全不同的语义。不得用 `wait: 0` 代替 `pause`。

### 8.3 切换目标

```json
{
  "type": "switch_target",
  "direction": "right",
  "count": 2
}
```

- `direction`：`left` 或 `right`。
- `count`：可选，默认 1。

v1 不定义 `initial_target`，也不在普攻/大招动作上定义 `target: "3号怪"`。

原因是当前 MaaYuan-SiMing 与 YuanAssist 都以“显式切左/切右”作为真实执行语义。声明式敌人 ID 可以在未来版本中单独引入。

### 8.4 自动战斗开关

```json
{
  "type": "auto_battle",
  "enabled": true
}
```

当前 MaaYuan 主要使用 `enabled: true`。目标平台不支持关闭自动战斗时，应在兼容性检查阶段报告，而不是静默忽略。

### 8.5 关卡内互动

```json
{
  "type": "interaction"
}
```

表示触发当前作业定义的通用关卡内互动。

### 8.6 密探专属动作

```json
{
  "type": "operator_action",
  "slot": 3,
  "action": "switch_form"
}
```

v1 目前只标准化 `switch_form`，用于表达类似“吕布切换形态”的密探专属行为。

如果 Legacy 数据中的“史子眇 SP”能够根据 `operators` 唯一定位槽位，应迁移成普通 `sp` 动作，而不是继续保留“史子眇sp”字符串 token。

## 9. 检测与失败处理

检测统一使用：

```json
{
  "type": "check",
  "condition": {},
  "on_fail": "restart"
}
```

动作所在的数组位置就是检测时机：

- 放在回合第一个动作之前：回合开始时检测。
- 放在某个战斗动作之后：该动作完成后检测。
- 不再单独存 `turn + step`。

`on_fail` 当前允许：

- `restart`
- `stop`
- `pause`

目标平台不支持指定失败行为时必须报告兼容性问题。

### 9.1 全队未全灭

```json
{
  "type": "check",
  "condition": {
    "type": "party_survives"
  },
  "on_fail": "restart"
}
```

可由 MaaYuan Legacy 的“全灭重开”迁移得到。

### 9.2 指定槽位存活

```json
{
  "type": "check",
  "condition": {
    "type": "operator_alive",
    "slot": 2
  },
  "on_fail": "restart"
}
```

对应“检测 2 号位阵亡，阵亡则重开”。

### 9.3 指定槽位仍在场

```json
{
  "type": "check",
  "condition": {
    "type": "operator_present",
    "slot": 2
  },
  "on_fail": "restart"
}
```

用于区分“退场检测”和“阵亡检测”。

### 9.4 庞统复制成功

```json
{
  "type": "check",
  "condition": {
    "type": "operator_copied",
    "slot": 3
  },
  "on_fail": "restart"
}
```

协议保存业务语义，不保存 MaaYuan 的 `BirdRestart` 或 YuanAssist 的 `PANG_TONG_COPY_CHECK` 名称。

### 9.5 龙气

```json
{
  "type": "check",
  "condition": {
    "type": "dragon_qi",
    "slot": 3,
    "operator": ">=",
    "value": 2
  },
  "on_fail": "restart"
}
```

- `slot` 可选。部分执行器按指定槽位检测，部分执行器当前只支持全局龙气检测。
- `operator`：`<`、`<=`、`=`、`>=`、`>`。
- `value`：非负整数。

Adapter 必须检查目标平台是否能保持同样的 slot 语义；不能保持时不得悄悄丢弃 `slot`。

### 9.6 星

```json
{
  "type": "check",
  "condition": {
    "type": "star_count",
    "color": "orange",
    "operator": ">=",
    "value": 1
  },
  "on_fail": "restart"
}
```

颜色：

- `orange`
- `purple`
- `blue`

例如 Legacy 的“无橙星重开”应迁移为“要求橙星数量 >= 1，否则重开”，而不是把“无橙星”作为协议枚举。

### 9.7 暴击

```json
{
  "type": "check",
  "condition": {
    "type": "crit"
  },
  "on_fail": "restart"
}
```

表示前序动作需要命中暴击；检测失败时按 `on_fail` 处理。

## 10. 立即重开

当作业明确要求执行到此处后无条件重开时：

```json
{
  "type": "restart"
}
```

这与 `check + on_fail=restart` 不同：

- `restart`：执行到该动作就重开。
- `check`：条件不满足才重开。

Legacy SiMing 的“左上角重开”迁移为本动作。

## 11. v1 明确不包含的字段

以下字段不属于 Work Protocol v1 核心：

- `initial_target`
- 基础战斗动作的敌人 `target`
- `seq`
- MaaFramework 的 `action: Click/Swipe/Custom`
- `target` / `begin` / `end` 屏幕坐标
- `roi`
- `template`
- `recognition`
- `next`
- `on_error`
- `jump_back`
- `custom_action`
- `custom_action_param`
- 目标平台生成节点名称

这些字段如果目标平台需要，由 Adapter 编译生成。

## 12. Legacy MaaYuan / SiMing 迁移原则

MaaYuan-Share 源自 MAA 作业站，其数据库与 `content` 中存在大量历史 MAA Copilot/MAA Pipeline 字段。

迁移时必须区分：

```text
Legacy storage syntax
        ≠
YuanHub Work semantic model
```

典型映射：

| Legacy token/节点 | Work Protocol v1 |
|---|---|
| `2普` | `{slot:2,type:"attack"}` |
| `3大` | `{slot:3,type:"ultimate"}` |
| `4下` | `{slot:4,type:"defense"}` |
| `1sp` / `1SP` | `{slot:1,type:"sp"}` |
| `额外:2普` | 再追加一次 `slot=2, attack` |
| `额外:等待:1200` | `wait(1200)` |
| `额外:左侧目标` | `switch_target(left)` |
| `额外:右侧目标` | `switch_target(right)` |
| `额外:开自动` | `auto_battle(true)` |
| `额外:关卡内互动` | `interaction` |
| `额外:吕布` | 对应槽位的 `operator_action(switch_form)` |
| `重开:全灭` | `check party_survives / on_fail restart` |
| `重开:左上角` | `restart` |
| `重开:无橙星` | `check star_count orange >= 1` |
| `重开:检测X号位阵亡` | `check operator_alive(slot=X)` |
| `重开:检测X号位退场` | `check operator_present(slot=X)` |
| `重开:检测X号位鹦鹉` | `check operator_copied(slot=X)` |
| `重开:检测X号位龙气` | `check dragon_qi(...)` |

无法可靠还原语义的 Legacy Pipeline 节点不能静默丢弃。导入器应：

1. 保留原始 source content。
2. 报告该作业为 `partial` 或 `unsupported`。
3. 指出无法转换的节点路径/能力。
4. 只有在语义可确定时才写入 Work Protocol。

## 13. Adapter 的无损原则

目标 Adapter 必须先执行兼容性检查，再导出。

兼容性至少区分：

- `exact`：所有核心语义都能保持。
- `partial`：目标平台只支持其中一部分或需要降级。
- `unsupported`：关键执行语义无法安全表达。

禁止：

- 遇到未知动作直接跳过；
- 丢掉 `slot`、比较条件或失败行为后仍声明完全兼容；
- 把 `pause` 偷换成 `wait: 0`；
- 把无法表达的目标切换或检测规则当作普通备注。

目标平台具体映射见 [`work-adapters-v1.md`](./work-adapters-v1.md)。

## 14. Schema 之外的语义校验

JSON Schema 负责结构校验，下列规则由 YuanHub 后端/编辑器语义校验器负责：

1. `rounds[].round` 必须唯一。
2. `rounds` 建议升序；服务端可规范化排序。
3. `operator_action.slot` 对应的 `operators[slot-1]` 应非空。
4. Legacy 特定密探动作迁移时必须能唯一定位目标槽位。
5. `level_id` 存在时必须在 YuanHub Level Catalog 中存在，并与 `game` 匹配。
6. Adapter 必须逐动作生成兼容性结果，不允许静默降级。

## 15. 完整示例

```json
{
  "format": "yuanhub-work",
  "version": 1,
  "game": "如鸢",
  "level_id": "lvl_example",
  "stage_name": "爬塔21",
  "doc": {
    "title": "六月白鹄",
    "details": "示例作业"
  },
  "operators": [
    "王粲",
    "赵云",
    "郭嘉",
    "吕布",
    null
  ],
  "exec": {
    "delays_ms": {
      "attack": 3000,
      "ultimate": 5000,
      "defense": 3000,
      "sp": 5000
    },
    "extensions": {
      "maayuan": {
        "level_type": "活动",
        "recognition_name": "爬塔21跟打",
        "rec_target_offset": [0, 0, 0, 0]
      },
      "yuanassist": {
        "enemy_turn_wait_ms": 8000
      }
    }
  },
  "rounds": [
    {
      "round": 1,
      "remark": "",
      "actions": [
        { "slot": 2, "type": "defense" },
        { "slot": 3, "type": "attack" },
        { "type": "switch_target", "direction": "right" },
        { "slot": 4, "type": "ultimate" },
        { "type": "wait", "duration_ms": 1200 },
        {
          "type": "check",
          "condition": {
            "type": "operator_alive",
            "slot": 4
          },
          "on_fail": "restart"
        }
      ]
    },
    {
      "round": 2,
      "actions": [
        { "slot": 1, "type": "sp" },
        {
          "type": "check",
          "condition": {
            "type": "star_count",
            "color": "orange",
            "operator": ">=",
            "value": 1
          },
          "on_fail": "restart"
        },
        {
          "type": "operator_action",
          "slot": 4,
          "action": "switch_form"
        }
      ]
    }
  ]
}
```
