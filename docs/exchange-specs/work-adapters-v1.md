# YuanHub 作业协议 v1：目标平台 Adapter 契约

本文定义 `yuanhub-work@1` 到 MaaYuan 与 YuanAssist 的转换边界。

它不定义最终 HTTP API 路径；后端实现可以通过 `/export?to=...`、内部服务调用或其他稳定接口暴露 Adapter。

协议正文：[`work-v1.md`](./work-v1.md)

## 1. Adapter 的职责

Adapter 做三件事：

1. 检查目标平台是否能表达当前 Work Protocol 文档的全部执行语义。
2. 将公共语义编译成目标平台原生格式。
3. 对无法保持的语义明确返回问题，禁止静默丢弃。

推荐接口模型：

~~~text
check(work, target) -> compatibility
export(work, target) -> target-native document
~~~

兼容性状态：

- `exact`：核心执行语义完整保持。
- `partial`：可以生成结果，但存在明确降级；默认不应直接执行。
- `unsupported`：关键语义不能安全表示，禁止导出可执行结果。

建议问题结构：

~~~json
{
  "target": "YUANASSIST",
  "status": "partial",
  "issues": [
    {
      "code": "unsupported_action",
      "path": "$.rounds[1].actions[3]",
      "feature": "operator_action:switch_form",
      "message": "YuanAssist 当前没有等价执行指令"
    }
  ]
}
~~~

## 2. Source 与 Target 必须分开

MaaYuan-Share 目前的 `maa_copilot.content` 是 Legacy Source，不是 Work Protocol 本身。

推荐后端内部结构：

~~~text
MaaYuan-Share raw content
        │
        ▼
Legacy Parser
        │
        ├── raw source 保留
        ▼
YuanHub Work Protocol
        │
        ├── compatibility(MAAYUAN)
        └── compatibility(YUANASSIST)
~~~

无法转换的源节点必须保留在 raw source 中，同时把 Work 转换标记为 `partial/unsupported`。

不要通过 MaaYuan-Share 数据库实体中的简化 `actions` / `simingActions` 字段重建原始作业；完整执行源以 `content` 为准。

## 3. MAAYUAN Adapter

### 3.1 推荐编译链

优先复用 MaaYuan-SiMing 已经存在的语义：

~~~text
YuanHub Work Protocol
        ↓
normalized round_actions
        ↓
SiMing ConfigGenerator / 等价实现
        ↓
MaaFramework Pipeline actions
~~~

Work Protocol 中的 `rounds[].actions[]` 与 SiMing `round_actions` 都是“回合内有序动作”，因此这一层映射天然稳定。

### 3.2 基础动作

| Work v1 | SiMing 语义 | 兼容 |
|---|---|---|
| `attack(slot=2)` | `2普` | exact |
| `ultimate(slot=2)` | `2大` | exact |
| `defense(slot=2)` | `2下` | exact |
| `sp(slot=2)` | `2sp` / 对应 SP 节点 | exact |
| 同槽位连续基础动作 | 连续 token | exact |

“再次行动”不是 v1 独立概念。Adapter 只需按动作数组顺序连续输出 token。

### 3.3 流程动作

| Work v1 | MaaYuan/SiMing | 兼容 |
|---|---|---|
| `wait(duration_ms)` | `额外:等待:<ms>` / post_delay 节点 | exact |
| `pause` | 当前无稳定等价动作 | unsupported |
| `switch_target(left)` | `额外:左侧目标` | exact |
| `switch_target(right)` | `额外:右侧目标` | exact |
| `switch_target(..., count=N)` | 重复生成 N 次切换 | exact |
| `auto_battle(true)` | `额外:开自动` | exact |
| `auto_battle(false)` | 当前无稳定“关闭自动”语义 | unsupported |
| `interaction` | `额外:关卡内互动` | exact |
| `operator_action(switch_form)` | 当前吕布切形态能力 | 仅目标槽位确认为支持该行为时 exact，否则 unsupported |
| `restart` | 左上角重开链 | exact |

### 3.4 检测动作

#### 全灭

~~~json
{
  "type": "check",
  "condition": { "type": "party_survives" },
  "on_fail": "restart"
}
~~~

映射到 MaaYuan 的全灭重开语义。

仅 `on_fail=restart` 可视为 exact；其他失败行为需要目标实现明确支持。

#### 阵亡

~~~text
operator_alive(slot=N)
-> DownRestart(position=N)
~~~

exact。

#### 退场

~~~text
operator_present(slot=N)
-> RetreatRestart(position=N)
~~~

exact。

#### 庞统复制

~~~text
operator_copied(slot=N)
-> BirdRestart(position=N)
~~~

exact。

#### 龙气

当前 MaaYuan-SiMing 的业务能力是“指定槽位不足 2 龙气时重开”。

因此：

~~~json
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
~~~

可映射为 exact。

其他比较条件或无法确定 slot 时，不得假装等价，应返回 `partial` 或 `unsupported`。

#### 星检测

当前 SiMing 主要支持：

~~~text
橙星存在
紫星存在
蓝星存在
~~~

因此下列条件可 exact：

~~~text
star_count(color=X, operator=">=", value=1)
~~~

颜色 X 为 `orange/purple/blue`。

其他数量比较必须根据目标执行器真实能力判断，不得只因为底层是颜色识别就推断支持。

#### 暴击

当前标准 SiMing round-actions/Share 编辑链没有稳定的 v1 暴击检测编辑语义。

`check(crit)` 默认标记 `unsupported`，直到 MaaYuan Adapter 有明确可执行实现。

### 3.5 `exec.extensions.maayuan`

映射：

| Work 字段 | SiMing/MaaYuan |
|---|---|
| `level_type` | LevelConfig.level_type |
| `recognition_name` | level_recognition_name / OCR expected |
| `rec_target_offset` | OCR target_offset |
| `difficulty` | 活动分级 difficulty |
| `cave_type` | 洞窟左右入口 |
| `lantai_nav` | 兰台导航设置 |

这些属于 MAAYUAN namespace。导出到其他平台时可以忽略该 extension，但不能把其中字段误解释为公共语义。

### 3.6 动作延迟

`exec.delays_ms`：

~~~text
attack   -> 普攻 post_delay
ultimate -> 上拉 post_delay
defense  -> 下拉 post_delay
sp       -> SP post_delay
~~~

若当前 SiMing 版本把 SP 与 ultimate 共用延迟，Adapter 应：

- 值相同：exact。
- 值不同且可按节点覆盖：exact。
- 值不同且目标实现不能卝独设置：partial。

## 4. YUANASSIST Adapter

### 4.1 推荐编译结果

YuanAssist 当前执行层由两部分组成：

~~~text
scriptContent
+ instructions
+ config
~~~

Adapter 不需要让 YuanAssist 直接理解 Work Protocol；只需要输出 YuanAssist 原生导入结构。

### 4.2 基础动作

| Work v1 | YuanAssist | 兼容 |
|---|---|---|
| `attack(slot=N)` | 对应槽位 `A` | exact |
| `ultimate(slot=N)` | 对应槽位 `↑` | exact |
| `defense(slot=N)` | 对应槽位 `↓` | exact |
| `sp(slot=N)` | 对应槽位 `圈` | exact |

动作数组位置转换成 YuanAssist 的回合/step 顺序。

### 4.3 等待与暂停

`wait(duration_ms)` 可以转换为相邻 step 的延时指令：

~~~text
DELAY_ADD
~~~

Adapter 必须保持“等待发生在动作序列中的位置”。

`pause`：

~~~text
PAUSE
~~~

exact。

### 4.4 目标切换

~~~text
switch_target(left, count=N)
-> TARGET_SWITCH_LEFT(value=N)

switch_target(right, count=N)
-> TARGET_SWITCH_RIGHT(value=N)
~~~

exact。

### 4.5 检测

| Work v1 | YuanAssist | 当前兼容 |
|---|---|---|
| `party_survives` | `ALL_WIPE_CHECK` | exact |
| `operator_alive(slot=N)` | `DEATH_CHECK(value=N)` | exact |
| `operator_present(slot=N)` | 当前无等价退场检测 | unsupported |
| `operator_copied(slot=N)` | `PANG_TONG_COPY_CHECK(value=N)` | exact |
| `crit` | `CRIT_CHECK` | exact |
| 橙星 `>=1` | `ORANGE_STAR_CHECK` | exact |
| 紫星 `>=1` | `PURPLE_STAR_CHECK` | exact |
| 蓝星检测 | 当前无对应 InstructionType | unsupported |
| `dragon_qi` | `DRAGON_QI_CHECK` | 见下文 |

YuanAssist 当前龙气比较支持：

- `>=`
- `=`
- `<`

对于整数数量，可以做无损规范化：

~~~text
> N  -> >= N+1
<= N -> < N+1
~~~

因此这五种 Work 比较运算都可以转换为 YuanAssist 的三种内部比较形式。

但 YuanAssist 当前 `DRAGON_QI_CHECK` 不携带 slot。

所以：

- Work `dragon_qi` 不带 slot：可 exact。
- Work `dragon_qi` 带 slot 且该 slot 会影响业务含义：unsupported。
- 禁止直接丢掉 slot 后声明 exact。

#### 失败行为 `on_fail`

上表的 `exact` 只说明“检测条件本身”能够等价表达。YuanAssist 当前不少检测在失败后会先执行返回/恢复；只有在能够根据关卡上下文生成有效 `STAGE_AUTO_NAV`/恢复分支时，才能重新进入关卡并从第一回合继续。

因此：

- `party_survives + on_fail=restart`：当前 `ALL_WIPE_CHECK` 自带再次挑战恢复逻辑，可视为 exact。
- `operator_alive`、`operator_copied`、`crit`、橙/紫星、`dragon_qi` + `on_fail=restart`：只有 Adapter 能从 `level_id`/Level Catalog 上下文生成 YuanAssist 支持的关卡自动导航目标时才是 exact；否则应为 partial/unsupported，不能把“返回后停止”声明成“自动重开”。
- `on_fail=stop` 或 `on_fail=pause`：必须按 YuanAssist 实际指令行为单独判断，不能因为存在检测指令就默认支持。

### 4.6 当前不应静默转换的动作

以下 Work 动作当前没有稳定等价 YuanAssist 指令：

- `auto_battle`
- `interaction`
- `operator_action(switch_form)`
- 立即 `restart`
- `operator_present` 退场检测
- 蓝星检测

遇到它们时必须产生 compatibility issue。

### 4.7 动作延迟

YuanAssist 原生全局配置：

~~~text
intervalAttack
intervalSkill
waitTurn
~~~

其中 `waitTurn` 与 Work `exec.delays_ms` 无关；它来自：

~~~text
exec.extensions.yuanassist.enemy_turn_wait_ms
~~~

建议映射：

~~~text
attack   -> intervalAttack 基准
ultimate -> intervalSkill 基准
defense  -> 以 intervalAttack 为基准，通过 step DELAY_ADD/DELAY_SUBTRACT 校正
sp       -> 以当前 YuanAssist SP 的基础执行延迟为基准，通过 step delta 校正
~~~

这样即使 Work 的 `attack` 与 `defense` 不相同，也不必丢失差异。

## 5. Legacy MaaYuan-Share -> Work v1

Legacy Parser 应从完整 `maa_copilot.content` 解析，不从数据库的简化动作字段反推。

推荐优先级：

1. 可逆的 SiMing action graph。
2. `text_doc` / CustomAction 参数等明确语义。
3. MaaYuan-Share 已存的关卡冗余信息。
4. 最后才使用启发式匹配。

明确可迁移的 SiMing token：

| Legacy | Work v1 |
|---|---|
| `N普` | `attack(slot=N)` |
| `N大` | `ultimate(slot=N)` |
| `N下` | `defense(slot=N)` |
| `Nsp` / `NSP` | `sp(slot=N)` |
| `额外:N普/大/下/sp` | 再追加对应基础动作 |
| `额外:等待:X` | `wait(X)` |
| `额外:左侧目标` | `switch_target(left)` |
| `额外:右侧目标` | `switch_target(right)` |
| `额外:开自动` | `auto_battle(true)` |
| `额外:关卡内互动` | `interaction` |
| `额外:吕布` | 解析吕布槽位后 `operator_action(switch_form)` |
| `重开:全灭` | `check party_survives -> restart` |
| `重开:左上角` | `restart` |
| `重开:无X星` | `check star_count(X)>=1 -> restart` |
| `重开:检测N号位阵亡` | `check operator_alive(N) -> restart` |
| `重开:检测N号位退场` | `check operator_present(N) -> restart` |
| `重开:检测N号位鹦鹉` | `check operator_copied(N) -> restart` |
| `重开:检测N号位龙气` | 当前已知语义迁移为 `dragon_qi(slot=N)>=2` |

### 5.1 `额外:史子眇sp`

如果 `operators` 中能唯一找到史子眇对应槽位：

~~~text
额外:史子眇sp
-> sp(slot=N)
~~~

如果无法唯一定位，标记 `partial`，不要猜槽位。

### 5.2 未知 Pipeline 节点

下面这种情况不能“看起来像点击”就丢掉：

~~~text
未知 CustomAction
自定义 OCR 分支
非标准 next/on_error 图
用户手写 MaaFramework 节点
~~~

应保留 raw source，并返回：

~~~text
unsupported_source_node
~~~

## 6. Work v1 -> MAAYUAN 的回环要求

对能够解析为 Work v1 的标准 SiMing 作业，应建立 Golden Test：

~~~text
MaaYuan source
   ↓ parse
Work v1
   ↓ export MAAYUAN
MaaYuan target
~~~

验证重点不是 JSON 字节完全相同，而是执行语义相同：

- 回合顺序；
- 槽位动作；
- 等待；
- 目标切换；
- 检测时机；
- 重开条件；
- 动作延迟；
- 关卡导航 override。

## 7. Work v1 -> YUANASSIST 的回环要求

建议从当前 YuanAssist `JobStationAssetRepository` 的 MaaYuan 导入行为提炼 Golden Test：

~~~text
Work v1
   ↓
YuanAssist Adapter
   ↓
scriptContent + instructions + config
~~~

至少覆盖：

- `A / ↑ / ↓ / 圈`
- wait
- pause
- 左右目标切换 + count
- 全灭
- 阵亡
- 暴击
- 庞统复制
- 橙/紫星
- 龙气比较
- attack/ultimate/defense 延迟差异
- enemy_turn_wait_ms

## 8. 不属于 Adapter 的信息

Adapter 不处理 YuanHub 社区元数据，例如：

- 作者
- 上传时间
- 浏览量
- 点赞
- 评论
- 审核状态
- 来源平台展示信息

这些由 Work API 外层管理。

Adapter 的输入是：

~~~text
Work Protocol + 必要的 Level Catalog 上下文
~~~

输出是：

~~~text
目标平台原生可执行文档
~~~
