# 密探交换 v5 接入

完整备份推荐 `myshare-operator-exchange@5`；沿用v4独立化极，增加 `level_breakthrough_stage:0..9|null` 及观测快照字段、独立breakthrough分区。整十级缺失不猜，扫描未知不覆盖当前确认，旧观测不倒填。

完整规则：[等级突破与v5协议](../operator-growth-data-exchange-protocol-v5.md)。机器契约：[v5 Schema](../schemas/operator-growth-exchange-v5.schema.json)。v2/v3/v4继续支持；它们的导出无法完整表达突破，应向用户显示信息损失提示。
