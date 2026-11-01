# 密探独立化极与 operator exchange v4

状态：兼容旧版。当前完整备份推荐[v5（含等级突破与观测快照）](./operator-growth-data-exchange-protocol-v5.md)。
## 1. 权威事实与能力

当前 API、持久化和 v4 使用 `huaji:{owned:boolean,stage:0..25|null,awakened:boolean|null}`。`true` 确认已觉醒，`false` 确认未觉醒，`null` 待确认。`owned=true` 可以阶段未知；不能用共享等级/修为推导拥有。未拥有必须 stage=0，觉醒不得 true；拥有时 stage 不能为0。

普通密探 stage 1..6=一星0..5节点、7..12=二星、13..18=三星、19..24=四星、25=五星（没有第五颗星的小节点）。化极与觉醒是独立事实。隐密（catalog rarity=3）终点24、不能新确认已觉醒。SP 使用稳定 `spOf`，只允许0/1/7/13/19/25，分别表示未拥有和1..5星，不能写普通小节点；SP觉醒和材料暂未开放，升级继续422 `sp_huaji_upgrade_not_supported`。

catalog `huaji_capabilities` 公开 `max_stage`、`has_nodes`、`awakening_supported`、`awakening_upgrade_supported`。普通 rarity=4/5 的最后一项为true，支持独立快捷觉醒；隐密和SP为false。能力表示可调用动作，不表示已经觉醒。

本体/SP仅同步level/elite；拥有、stage、awakened、命盘、奇闻和战斗形态保持独立。缺失形态的共享占位是未拥有。规划同组共享level/elite需求取最大值并只计一次；形态目标独立。

## 2. 永久旧协议兼容

v2/v3 原字段和语义继续接收，不原地更名或改版本含义。

| 类型 | 旧值 | 归一化结果 |
|---|---|---|
| 普通绝密/机密 | 0 | 未拥有，stage0；缺失觉醒不确认false |
| 普通绝密/机密 | 1..24 | 对应stage；保留已确认觉醒 |
| 普通绝密/机密 | 25..30 | 全部stage25，永久接收30；保留已确认觉醒 |
| 普通绝密/机密 | 31 | 只确认awakened=true；保留已确认stage，否则null；不推25/26 |
| SP | 0/1..5 | 0/1/7/13/19/25；无awake字段不覆盖已确认值 |
| 隐密 | 0..24 | 正常适配 |
| 隐密 | 25/26..30/31 | 保留原值，stage/awake未知；warning/review隔离，不映射合法25/24/觉醒 |

`huaji_legacy:{raw,source}` 仅供来源追溯，不能作为第二个可写事实源。已有legacy值在首次校正时保留来源；历史标量未批量更新。来源`legacy_current`表示存量文档缺少明确生产者，不冒称已确认来源。

旧31与新huaji同时提供时，只允许不矛盾的明确事实；冲突返回 `huaji_conflict`。旧0与已确认觉醒冲突时不抹除确认值。v2/v3没有觉醒字段的扫描不能将true/false改为unknown。

相同record_id、同正文返回既有幂等结果；正文冲突拒绝。v2新增记录保存`effectiveAtPrecision`用于精确时间正文比较，避免Mongo毫秒截断导致同正文重试冲突；旧记录无该字段时保持历史比较规则，不改历史算法或批量补值。不同record_id语义相同不推进成长revision或stale。旧扫描早于current校正时进入复核，遵守section ready/partial/review/unavailable、账号归属与expected_revision；不无条件覆盖手工值。隐密异常项保留来源，合法同批项继续处理。

## 3. API与升级

`GET /v1/operator/current`兼容保留star_level并增加huaji/huaji_legacy。未存huaji时按catalog懒适配，仅返回，不写数据库。历史非法可读，材料/公式必须提示阶段不足，不猜测。

PATCH支持部分huaji；缺失对象/子字段保留，显式null将stage或awakened设为未知。例：

```json
{"expected_revision":7,"reason":"manual_correction","huaji":{"awakened":true}}
```

同值重试不增加revision。新增/校正完整事实例：

```json
{"expected_revision":7,"reason":"manual_correction","huaji":{"owned":true,"stage":19,"awakened":null}}
```

该请求不扣库存。新客户端不得用31作为新huaji target。快捷化极仅到catalog终点；普通24->25消耗最后一步80心纸、展示160000五铢钱估算（沿用现行协议，钱不扣库存），不收装金玻璃；25不升26..30。快捷觉醒使用独立 `dimension=awakening,target=1`，仅已拥有的普通紫/金五星且未确认已觉醒可执行；扣对应心纸100、装金玻璃1，30万五铢钱仅估算。沿用preview/execute事务、双版本和幂等，保留stage25并写入awakened=true。非法状态返回422 `awakening_not_available`。隐密24及SP拒绝路径不写库存、revision、升级事务或消耗流水，旧token重新校验能力。

`growth-targets`及custom规划targets支持独立huaji；与star_level不得同时提供。旧目标仍可读取，未知阶段不伪装已达成。共享level/elite目标不复制形态目标。

战斗signature和observed_inputs包含huaji。独立awakened变化使旧观测stale；已有旧签名缺少独立输入时不得包装成新已验证观测。新扫描可生成带完整输入的签名，旧备份的签名不能在导入时冒充新验证。

## 4. v4交换与信息损失

格式仍是`myshare-operator-exchange`，version=4，仅密探领域。沿用v3账号、记录、分区状态、鉴权和事务语义，客观entry以huaji替代star_level；huaji对象出现时三个字段均必填，可为null的仅stage/awakened。其余客观字段和独立annotation记录保持原结构；annotation targets可使用huaji。

浏览器 `/v1/operator/import/preview`、`/import` 接收v3/v4原始或映射包装体；`/export?version=4`无损导出独立事实和追溯字段。OpenAPI旧v2/v3端点继续兼容，没有改成多领域v4。前端完整备份默认v4。

v2输出继续camelCase `starLevel/subProf/starStones`；v3继续snake_case。二者单一标量不能同时表达任意stage+awakened、已确认未觉醒与未知、owned且stage未知。v3会在条目warnings明确提醒；v2以响应头`X-Operator-Exchange-Warning`提醒信息损失，接入端须展示此限制并优先选v4备份。不要将旧字段解释成无损备份；导入独立独立化极未知事实至少使用v4，完整备份使用v5。

Schema：[正式v4 JSON Schema](./schemas/operator-growth-exchange-v4.schema.json)。样例：[正常独立状态](./examples/operator-growth-exchange-v4/independent.valid.json)、[旧31未知stage](./examples/operator-growth-exchange-v4/legacy31.valid.json)、[非法未拥有五星](./examples/operator-growth-exchange-v4/unowned-stage.invalid.json)。catalog约束由服务端补充，Schema不能凭目录外信息证明SP可觉醒。
