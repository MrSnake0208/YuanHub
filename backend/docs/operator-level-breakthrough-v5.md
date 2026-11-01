# 密探等级突破与 v5

2026-10-17。完整备份推荐 `myshare-operator-exchange@5`，在v4独立化极基础上增加 `level_breakthrough_stage:0..9|null`，以及 `combat_stats.observed_inputs` 内的同名采集快照。

0～9阶对应上限10～100。10～90整十级有突破前后两种可能，缺失保持未知；非整十1～100级唯一推导 `floor((level-1)/10)`；等级0未知，100级9阶。合法显式阶段范围为 `floor((level-1)/10)..min(floor(level/10),9)`，仅适用等级1～100；非法组合422 `invalid_level_breakthrough`。

PATCH继续按字段出现性合并：同级缺失保留，整十级显式null清为未知；等级变化无突破字段时重新推导。当前、响应、修正审计／回放、升级幂等交易均保存阶段。本体／SP随等级修为一起同步，拥有和战斗资料独立；依据[2024-12-11公告归档](https://wiki.biligame.com/yuan/公告-2024年12月11日)，未做客户端实测。

浏览器导入／预览、现有OpenAPI扫描支持v3/v4/v5。v5新增独立 `section_status.breakthrough`；状态语义沿用其他分区。扫描null不覆盖当前已确认事实，扫描观测仍保留未知；人工null可明确清除。旧整十级观测无采集突破只能unverified，当前变化令旧观测stale，不能用今天的确认改写历史快照。无签名新观测只使用同一记录已包含、已确认分区的等级突破，绝不借用后来current确认。

浏览器 `/v1/operator/export?version=5` 完整输出当前突破和原观测快照，旧默认版本不变。旧v2/v3/v4导入缺失保留，旧导出提示信息损失（v2响应头；v3/v4条目warnings）。不得自动降级v5备份。Schema见[正式v5](../src/main/resources/schema/operator-growth-exchange-v5.schema.json)，样例见[历史突破未知](../src/test/resources/operator-growth-exchange-v5/boundary.valid.json)。

快捷升级已知突破优先，只免除起始已完成门槛的材料与铜钱展示，后续门槛照算；铜钱仍不扣库存。已知未突破与旧skip=true冲突422 `level_breakthrough_conflict`；未知兼容本次起点声明。到达整十目标不额外突破，89→90为8阶，9阶90→95只消耗经验书。执行响应和幂等交易保存突破；既有共享组CAS、预览token、库存幂等和事务保护不变。

先后端后前端发布。无新集合、索引或批量迁移；回滚须保留识别新字段的后端，防止旧实现整条覆盖entry。样本库仍不在本协议范围；后续自动面板接入见[服务端面板](./operator-panel-rules.md)，整数十级未知突破返回incomplete，不猜测是否突破。
