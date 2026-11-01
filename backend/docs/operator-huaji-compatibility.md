# 密探独立化极与 operator exchange v4

等级突破、采集快照与当前推荐完整备份见[operator v5](./operator-level-breakthrough-v5.md)；旧版本继续兼容。
## 1. 权威事实与能力

当前 API、持久化和 v4 使用 `huaji:{owned:boolean,stage:0..25|null,awakened:boolean|null}`。`true` 确认已觉醒，`false` 确认未觉醒，`null` 未记录，计算与显示均按未觉醒处理，不强制确认。`owned=true` 可以阶段未知；不能用共享等级/修为推导拥有。未拥有必须 stage=0，觉醒不得 true；拥有时 stage 不能为0。

普通密探 stage 1..6=一星0..5节点、7..12=二星、13..18=三星、19..24=四星、25=五星（没有第五颗星的小节点）。字段分开保存，但觉醒是五星后的可选阶段；已确认觉醒的有效 stage 为25，新的低星+觉醒组合拒绝。隐密（catalog rarity=3）终点19，即满4星无后续节点、不能新确认已觉醒。SP 使用稳定 `spOf`，只允许0/1/7/13/19/25，分别表示未拥有和1..5星，不能写普通小节点；陈登·黍王、史子眇·赴烛允许在五星后记录觉醒，其余SP不自动开放；SP材料扣除继续禁止，升级继续422 `sp_huaji_upgrade_not_supported`。

catalog `huaji_capabilities` 公开 `max_stage`、`has_nodes`、`awakening_supported`、`awakening_upgrade_supported`。普通 rarity=4/5 的最后一项为true，支持独立快捷觉醒；隐密和SP的快捷扣料能力为false；上述两名SP的awakening_supported为true。能力表示可调用动作，不表示已经觉醒。

本体/SP仅同步level/elite；拥有、stage、awakened、命盘、奇闻和战斗形态保持独立。缺失形态的共享占位是未拥有。规划同组共享level/elite需求取最大值并只计一次；形态目标独立。

## 2. 永久旧协议兼容

v2/v3 原字段和语义继续接收，不原地更名或改版本含义。

| 类型 | 旧值 | 归一化结果 |
|---|---|---|
| 普通绝密/机密 | 0 | 未拥有，stage0；缺失觉醒不确认false |
| 普通绝密/机密 | 1..24 | 对应stage；已有确认觉醒时仍按五星觉醒保留 |
| 普通绝密/机密 | 25..30 | 全部stage25，永久接收30；保留已确认觉醒 |
| 普通绝密/机密 | 31 | stage25、awakened=true，表示五星之后已觉醒 |
| SP | 0/1..5 | 0/1/7/13/19/25；无awake字段不覆盖已确认值 |
| 隐密 | 0..19 | 正常适配 |
| 隐密 | 20..31 | 保留原值，stage/awake未知；warning/review隔离，不映射合法19/觉醒 |

`huaji_legacy:{raw,source}` 仅供来源追溯，不能作为第二个可写事实源。已有legacy值在首次校正时保留来源；历史标量未批量更新。来源`legacy_current`表示存量文档缺少明确生产者，不冒称已确认来源。历史显式huaji.stage超出三星上限时，读时stage返回null，`huaji_legacy`用`historical_invalid_stage`保留原阶段；无关字段更新不覆盖存储中的原值，v4/v5导出保留追溯。

旧31与新huaji同时提供时，只允许不矛盾的明确事实；冲突返回 `huaji_conflict`。旧0与已确认觉醒冲突时不抹除确认值。v2/v3没有觉醒字段的扫描不能将true/false改为unknown。

相同record_id、同正文返回既有幂等结果；正文冲突拒绝。v2新增记录保存`effectiveAtPrecision`用于精确时间正文比较，避免Mongo毫秒截断导致同正文重试冲突；旧记录无该字段时保持历史比较规则，不改历史算法或批量补值。不同record_id语义相同不推进成长revision或stale。旧扫描早于current校正时进入复核，遵守section ready/partial/review/unavailable、账号归属与expected_revision；不无条件覆盖手工值。隐密异常项保留来源，合法同批项继续处理。

## 3. API与升级

`GET /v1/operator/current`兼容保留star_level并增加huaji/huaji_legacy。未存huaji时按catalog懒适配，仅返回，不写数据库。历史非法可读，材料/公式必须提示阶段不足，不猜测。

PATCH支持部分huaji；缺失对象/子字段保留，显式null表示未记录；awakened=null 按未觉醒计算。已觉醒且 stage=null 时有效 stage 为25；低于五星的新 stage 与 awakened=true 组合返回 `awakening_requires_five_star`。降星需同时设置 awakened=false，省略 awakened 不会清除历史确认值。下面的觉醒 PATCH 要求当前已是五星：

```json
{"expected_revision":7,"reason":"manual_correction","huaji":{"awakened":true}}
```

同值重试不增加revision。新增/校正完整事实例：

```json
{"expected_revision":7,"reason":"manual_correction","huaji":{"owned":true,"stage":19,"awakened":null}}
```

该请求不扣库存。新客户端不得用31作为新huaji target。快捷化极仅到catalog终点；普通24->25消耗最后一步80心纸、展示160000五铢钱估算（沿用现行协议，钱不扣库存），不收装金玻璃；25不升26..30。快捷觉醒使用独立 `dimension=awakening,target=1`，仅已拥有的普通紫/金五星且未确认已觉醒可执行；扣对应心纸100、装金玻璃1，30万五铢钱仅估算。沿用preview/execute事务、双版本和幂等，保留stage25并写入awakened=true。非法状态返回422 `awakening_not_available`。隐密19及SP拒绝路径不写库存、revision、升级事务或消耗流水，旧token重新校验能力。

`growth-targets`及custom规划targets支持独立huaji；与star_level不得同时提供。旧目标仍可读取，未知阶段不伪装已达成。共享level/elite目标不复制形态目标。

战斗signature和observed_inputs包含huaji。独立awakened变化使旧观测stale；已有旧签名缺少独立输入时不得包装成新已验证观测。新扫描可生成带完整输入的签名，旧备份的签名不能在导入时冒充新验证。

## 4. v4交换与信息损失

格式仍是`myshare-operator-exchange`，version=4，仅密探领域。沿用v3账号、记录、分区状态、鉴权和事务语义，客观entry以huaji替代star_level；huaji对象出现时三个字段均必填，可为null的仅stage/awakened。其余客观字段和独立annotation记录保持原结构；annotation targets可使用huaji。

浏览器 `/v1/operator/import/preview`、`/import` 接收v3/v4/v5原始或映射包装体；`/export?version=4`无损导出独立事实和追溯字段。OpenAPI旧v2/v3端点继续兼容，没有改成多领域v4。前端完整备份默认v5。

v2输出继续camelCase `starLevel/subProf/starStones`；v3继续snake_case。二者单一标量不能同时表达任意stage+awakened、已确认未觉醒与未知、owned且stage未知。v3会在条目warnings明确提醒；v2以响应头`X-Operator-Exchange-Warning`提醒信息损失，接入端须展示此限制并优先选v4备份。不要将旧字段解释成无损备份；导入独立未知事实必须使用v4。

Schema：[正式v4 JSON Schema](../src/main/resources/schema/operator-growth-exchange-v4.schema.json)。样例：[正常独立状态](../src/test/resources/operator-growth-exchange-v4/independent.valid.json)、[旧31可空stage兼容输入](../src/test/resources/operator-growth-exchange-v4/legacy31.valid.json)、[非法未拥有五星](../src/test/resources/operator-growth-exchange-v4/unowned-stage.invalid.json)。catalog约束由服务端补充，Schema不能凭目录外信息证明SP可觉醒。

## 5. 懒迁移与显式迁移预案（不执行）

发布不会批量UPDATE/DELETE历史数据，读时适配、合法写入时保存新事实。历史隐密异常只复核，不清理、不猜到19/25。升级旧版本时不得回滚到只认识标量的业务代码再写新数据。

生产迁移必须另立任务、先取得用户授权，明确环境，再只读按rarity/spOf核对候选计数和来源；不输出用户标识。2026-10-12的2405条是待核实异常entry基线，不是用户数，也未由本专项复核。确认真实进度、备份和回滚方案后再决定逐条校正；旧raw/source和导入审计永久保留。

本专项未访问生产或共享开发数据库。27018测试转发不证明目标可用于本任务测试，事务测试仅用本进程owned disposable Mongo。

## 6. 历史规则证据及计算边界

2026-10-21 后续接入已改用成熟计算器的私有规则与服务端结果，详见[面板接口与维护](./operator-panel-rules.md)。三星终点19、两名SP觉醒支持以本页当前契约为准。2026-10-22 已修正为觉醒可选、缺省按未觉醒、已觉醒蕴含五星；下述2026-10-13记录只反映当时审查，不作为现在仍使用旧Wiki白值的声明。

2026-10-13读取Cal副本并实际核对`m_components.csv`（SHA-256 `3cd225accd05475cbab8b142eff06a91414f9a401d11f8cc9b9319acca3ae275`）：126密探、19994组件，124普通密探star1..25，史子眇·赴烛/陈登·黍王仅1/7/13/19/25；awake是独立组件。隐密的理论star25及SP的awake行不能证明游戏可达性或素材。

公开结合版§6与组件支持普通已完成觉醒独立增加生命/攻击10%，加入百分比总和，固定值不变。公开版末尾“按钮能点”不作为完成证据；已解锁不等于已完成。新公式仅在stage和觉醒已确认时计算；SP规则或stage未知保留观测并提示不足计算。原Wiki白值与Cal组件口径存在差异，未在本修复中换整套白值、宣称全部面板精度验证。

[BWIKI公共图鉴干吉](https://wiki.biligame.com/yuan/干吉)与[招募商店](https://wiki.biligame.com/yuan/招募商店)交叉支持普通五星25%、觉醒独立、隐密四星终点。普通觉醒表列100心纸/1素材/30万钱，与既有材料表及[装金玻璃目录](https://wiki.biligame.com/yuan/装金玻璃)交叉确认，开放普通紫/金五星快捷觉醒；不添加未经证实的等级前置条件。SP觉醒与素材仍未核实。
