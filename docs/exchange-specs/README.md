# YuanHub 数据交换规范中心

更新时间：2026-08-24  
面向对象：YuanHub 前后端、自动采集器、备份工具与第三方集成开发者

本目录集中说明 YuanHub 当前可对外交换的 JSON 文档、公共目录和 HTTP 传输约定。接口的完整清单仍以 [`../api-contract.md`](../api-contract.md) 为准；本目录只关注跨程序交换时必须共同遵守的契约。

## 1. 应该使用哪一种格式

| 需求 | 格式标识与版本 | 建议 | 规范 |
|---|---|---|---|
| 导入/导出物品库存、心纸数量、奖励流水 | `myshare-inventory-exchange@2` | 当前正式版本 | [库存交换 v2](./inventory-v2.md) |
| 导入旧版密探养成快照 | `myshare-operator-exchange@2` | 仅兼容旧客户端；新接入不建议使用 | [密探交换 v2](./operator-v2.md) |
| 密探完整备份、双命盘、战斗数值、标注和目标 | `myshare-operator-exchange@3` | 新接入首选 | [密探交换 v3 接入指南](./operator-v3.md) |
| 获取合法物品/密探 ID 与元数据 | catalog v1 | 导入前先同步目录 | [公共目录](./catalogs.md) |
| 通过浏览器 JWT 或 OpenAPI Token 传输 | HTTP API | 按调用场景选认证方式 | [传输与鉴权](./transport.md) |

所有格式共同遵守 [公共约定](./common-conventions.md)。

## 2. 文件索引

- [`common-conventions.md`](./common-conventions.md)：命名、时间、账号、幂等、版本及错误约定。
- [`inventory-v2.md`](./inventory-v2.md)：库存记录、奖励增量、全量/局部快照和合并语义。
- [`operator-v2.md`](./operator-v2.md)：旧版密探快照及其字段命名兼容事项。
- [`operator-v3.md`](./operator-v3.md)：v3 使用场景、接入流程和自动采集限制。
- [`catalogs.md`](./catalogs.md)：实体目录 v1 与密探目录 v1。
- [`transport.md`](./transport.md)：JWT/OpenAPI 端点、scope、包装体及响应封装。
- [`schemas/`](./schemas/)：可用于开发期校验的 JSON Schema。
- [`examples/`](./examples/)：可复制的最小交换文档。

密探 v3 的完整规范、机器 Schema 和测试样例已经存在，继续作为权威正文使用：

- [密探养成数据交换协议 v3](../operator-growth-data-exchange-protocol-v3.md)
- [密探 v3 JSON Schema](../schemas/operator-growth-exchange-v3.schema.json)
- [密探 v3 示例目录](../examples/operator-growth-exchange-v3/)

## 3. 当前支持矩阵

| 能力 | 库存 v2 | 密探 v2 | 密探 v3 |
|---|---:|---:|---:|
| 浏览器 JWT 导入 | 是 | 是 | 是，支持 preview/commit |
| 浏览器 JWT 导出 | 是 | 是 | 是 |
| OpenAPI Token 导入 | 是 | 是 | 是，仅自动采集约束 |
| OpenAPI Token 导出 | 是 | 是 | 否 |
| 多来源账号文档 | 是 | 是 | 浏览器可映射；采集 OpenAPI 仅单来源 |
| 全量与局部快照 | 是 | 是 | 是；采集 OpenAPI 仅 `listed` |
| 主观标注/目标 | 否 | 否 | 是 |
| 独立 JSON Schema | 本目录提供 | 本目录提供导入 Schema | 已有正式 Schema |

## 4. 兼容性承诺

- 同一 `format` 的版本独立演进，调用方必须同时检查 `format` 与 `version`。
- v2 兼容读取暂时保留，但新的密探工具应直接生成 v3。
- `catalog_version` 用于记录生产文档时参考的目录版本，不代替服务端导入时的实时目录校验。
- 本目录不移动旧文件，以保证仓库内已有链接继续有效。

