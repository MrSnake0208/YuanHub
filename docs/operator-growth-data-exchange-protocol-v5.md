# 密探等级突破与交换协议 v5

2026-10-17：完整密探备份推荐 `myshare-operator-exchange@5`。v5 在 v4 的独立化极之上增加等级突破；账号映射、分区、鉴权、幂等和事务沿用现有接口，旧 v2/v3/v4 继续支持。

## 为什么需要独立突破

`Cal/m_components.csv` 的张辽8阶（上限90级）基础生命1817、攻击544；9阶（上限100级）基础生命2156、攻击645。90级可以停留在突破前或突破后，仅等级无法区分。`Cal/最终版.txt` 中“90级、已突破”却使用544攻击的样例应理解为8阶／上限90级，不能据此证明已完成90→100突破。此处保留原始参考文件，在协议中澄清口径。

本体与电影密探形态共享突破：[2024-12-11公告归档](https://wiki.biligame.com/yuan/公告-2024年12月11日)明确说明继承等级、突破和修为。该结论依据公告，不代表本次进行了游戏客户端实测。拥有状态、化极、命盘、星石和战斗观测继续按形态保存。

## 字段与校验

`entry.level_breakthrough_stage` 和 `combat_stats.observed_inputs.level_breakthrough_stage` 均为 `0..9 | null`。阶数0～9对应等级上限10～100。

| 等级 | 合法阶段 | 缺失／未知的读适配 |
| --- | --- | --- |
| 0 | 仅null | 未知 |
| 1～9、11～19、…、91～99 | `floor((level-1)/10)` | 唯一推导 |
| 10、20、…、90 | `level/10-1` 或 `level/10`，也可null | 保持未知 |
| 100 | 9，也可省略／null | 唯一推导9 |

PATCH `/v1/operator/current/{operator_id}?account_id=…&game=…` 继续要求 `expected_revision` 和 `reason`。字段缺失且等级不变时保留确认事实；显式null在整十级清为未知。等级变化而未提交突破时重新推导，整十级回到未知。非法阶段或等级组合返回422 `invalid_level_breakthrough`，不写档案、不扣库存。

```json
{"level":90,"level_breakthrough_stage":9,"expected_revision":7,"reason":"manual_correction"}
```

这是记录游戏现状；快捷升级的材料扣除仍由独立预览／执行接口负责。

## 采集与历史

当前突破与采集快照各自独立。新观测在同一记录中给出等级和可靠突破时，才能在整十级建立可靠快照。历史整十级观测缺少突破，或采集突破分区待核时，保留数值并标记 `unverified`；后续确认当前突破不能倒填其采集条件。突破变化会使既有观测 `stale`，形态间也不复制观测值。

v5 支持独立 `section_status.breakthrough`，取值与原分区一致：`ready | partial | review | unavailable`。可保存可靠等级，同时保留突破待核。扫描的null不会清除当前已确认突破，但新观测快照依然未知；人工明确null可以清除当前确认。

## 导入导出

浏览器导入预览／提交和现有 OpenAPI 扫描入口支持 v3/v4/v5；浏览器 `/v1/operator/export?version=5&account_id=…` 输出完整突破事实和原观测快照。前端完整备份默认v5，服务端接口的旧默认v2不变。

v2/v3/v4没有突破字段，同级导入保留已有确认；它们的整十级旧观测不能升级成可靠突破样本。旧版导出会提示信息损失（v2响应头，v3/v4条目warnings）；不得把v5自动降级成旧版备份。

Schema：[v5](./schemas/operator-growth-exchange-v5.schema.json)。样例：[当前9阶但历史采集未知](./examples/operator-growth-exchange-v5/boundary.valid.json)。

## 快捷升级与发布

已确认突破只免除**起始整十节点**的材料和铜钱展示，后续跨越的门槛照常计算。铜钱延续现有仅展示、不扣库存的约定。已确认未突破与 `skip_breakthrough_materials=true` 矛盾时返回422 `level_breakthrough_conflict`；未知状态兼容旧选项对本次起点的声明，不因此偷偷更新当前确认。

升级到整十目标只完成到达该等级所需突破，不额外完成目标节点突破。例如89→90得到8阶；已9阶的90→95不重复计90节点。等级、修为、突破同步本体/SP；共享组revision、预览token、库存CAS和HTTP幂等继续生效，交易审计保存执行后的突破。

先发布支持v5的后端，再发布默认v5备份的前端。无需新集合、索引或批量迁移。已有新突破事实后，回滚必须保留识别该字段的后端，避免旧代码整条覆盖entry丢失事实。本次不新增样本统计后台，也不重新开启自动面板计算。
