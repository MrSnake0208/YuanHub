# YuanHub 数据交换规范中心

更新时间：2026-10-18。公开入口：[站内开发者中心](/developers)。

本目录保留协议权威正文、兼容说明、Schema 和示例；统一接入指引及支持状态见[开发者协议矩阵](../developers/protocols.md)，HTTP 接入见[公开 API 参考](../developers/api.md)。内部完整接口契约仍为[api-contract.md](../api-contract.md)，不整体发布。

| 用途 | 推荐格式 | 权威正文 |
|---|---|---|
| 库存、心纸与奖励 | myshare-inventory-exchange@2 | [库存 V2](./inventory-v2.md) |
| 完整密探备份 | myshare-operator-exchange@5 | [密探 V5](../operator-growth-data-exchange-protocol-v5.md) |
| 招募备份恢复 | yuanhub.recruitment.v1 | [招募 V1](../developers/recruitment-v1.md) |
| 原生自动战斗作业 | yuanhub-work@1 | [Work V1](./work-v1.md) |

## 历史兼容

[密探 V2](./operator-v2.md)、[V3](../operator-growth-data-exchange-protocol-v3.md)、[V4](../operator-growth-data-exchange-protocol-v4.md)继续支持，不能无损表达 V5 全部事实。完整备份默认推荐 V5，不改变服务端 export 旧默认 V2。Token export 固定 V2，V3/V4/V5 Token 写入仅 scan+listed 单来源客观记录。

Work V1 协议和实际服务端接口已实现；[Adapter](./work-adapters-v1.md)部分支持，exact 才提供目标文档，不承诺通用 Pipeline 转换。

## 配套约定

[公共约定](./common-conventions.md)、[传输与鉴权](./transport.md)、[公共目录](./catalogs.md)、[Schema](./schemas/README.md)、[示例](./examples/README.md)。版本、权限、覆盖边界不能根据前端显示猜测。后续公开变化记录在[协议更新记录](../developers/changelog.md)。
