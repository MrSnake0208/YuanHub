# 开发者中心

在现有 YuanHub 账号体系中读取数据、上传采集结果、交换备份与自动战斗作业。文档公开可读；数据接口仍按各自认证、Scope 和账号规则执行。

## 从这里开始

1. 阅读[快速接入](./guide.md)，用公共目录和一次只读请求验证连接。
2. 按[API 参考](./api.md)选择接口，先确认它接受公共访问、JWT 还是 OpenAPI Token。
3. 生成文件前查看[协议与支持矩阵](./protocols.md)，下载对应 Schema 和有效示例。

## 当前推荐

| 数据 | 新接入使用 | 能力边界 |
|---|---|---|
| 库存、心纸、奖励 | [库存 V2](../exchange-specs/inventory-v2.md) | JWT 与 Token 均支持导入、导出 |
| 完整密探备份 | [密探 V5](../operator-growth-data-exchange-protocol-v5.md) | 浏览器 JWT 完整备份；Token 仅受限扫描写入，导出仍 V2 |
| 招募档案 | [招募备份 V1](./recruitment-v1.md) | JWT 备份恢复；没有第三方 Token 接口 |
| 自动战斗作业 | [Work V1](../exchange-specs/work-v1.md) | 原生创作与公开读取已实现；目标平台 Adapter 部分支持 |

## 维护状态

接口按 2026-10-18 工作区有效代码核实，表示当前代码支持，不代表这些修改已经部署到所有环境。协议改动见[协议更新记录](./changelog.md)，普通用户功能公告仍在[站点更新日志](/changelog)。

历史 Swagger 快照不是当前全部接口的保证；管理员接口与内部规划不纳入本中心。尚未实现的第三方能力见[缺口清单](./gaps.md)。
