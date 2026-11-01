# 示例文档

库存 v2：

- [`inventory-reward-delta.json`](./inventory-reward-delta.json)：派遣奖励增量，展示条件必填的 `stamina_cost`。
- [`inventory-full-snapshot.json`](./inventory-full-snapshot.json)：物品全量库存快照。
- [`inventory-listed-agent-snapshot.json`](./inventory-listed-agent-snapshot.json)：密探心纸局部库存快照。
- [`../../../public/inventory-import-example.json`](../../../public/inventory-import-example.json)：站内下载入口使用的较完整库存导入样例。

密探 v2：

- [`operator-v2-listed-snapshot.json`](./operator-v2-listed-snapshot.json)：旧版局部养成快照，展示历史 camelCase 字段。

作业 v1：

- [`work-v1.json`](./work-v1.json)：包含基础动作、目标切换、等待、检测与密探专属动作的完整示例。

密探 v3 示例继续放在权威目录 [`../../examples/operator-growth-exchange-v3/`](../../examples/operator-growth-exchange-v3/) 中，避免复制后发生漂移。

密探完整备份新接入推荐 V5；兼容示例和招募示例入口：

- [密探 V4 示例目录](../../examples/operator-growth-exchange-v4/)：历史兼容格式。
- [密探 V5 完整快照](../../examples/operator-growth-exchange-v5/boundary.valid.json)与 [Token V5 扫描上报](../../developers/examples/operator-scan-v5.json)：用途与权限不同。
- [招募 V1 完整备份](../../developers/examples/recruitment-v1.json)：使用 JWT，当前没有第三方 Token Scope。

示例中的账号、时间、目录 ID 和生产者信息仅用于说明。实际请求必须替换为调用者拥有或已映射的目标账号，并确认 ID 存在于当前公共目录。
