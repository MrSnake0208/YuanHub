# 将 YuanHub 数据接入你的应用

为你的小程序、网站、App 或桌面软件接入 YuanHub 游戏数据。开发者负责选择能力、集成 API 和管理应用内连接；应用用户拥有数据并知情、自愿授权；YuanHub 校验 Token、Scope 和账号边界。

**开发者的测试 Token 只能访问绑定的测试账号。正式应用中，每位用户都需要分别连接，不能用开发者的一个 Token 读取所有用户的数据。**

## 从这里开始

1. 阅读[第三方应用接入指南](./guide.md)，先区分公开与私有数据并选择最小 Scope。
2. 接入个人数据时，用自己拥有的测试账号调通，再为应用用户实现独立连接与数据隔离；公共目录无需先创建 Token。
3. 接入密探时，参考[第三方应用密探数据接入指南](/developers/use-cases/operator-read)，查看服务端示例并复制完整需求给 Codex。
4. 在你的产品中引用[用户创建与撤销连接码说明](./guide.md#用户操作说明)，不要求用户提供站内登录密码或 JWT。

## 应用可以接入什么

| 应用场景 | 当前认证与能力 | 文档 |
|---|---|---|
| 使用公共游戏目录 | 无需授权；目录 ID 与名称不含个人养成或库存 | [公共目录](../exchange-specs/catalogs.md) |
| 读取用户密探养成 | 每位用户 Token + `operator:read`；当前档案 DTO，非完整 V5 备份 | [密探 API](./api-operator.md) |
| 读取用户背包库存 | 每位用户 Token + `inventory:read`；导出需独立 Scope | [库存 API](./api-inventory.md) |
| 接入活动日历 | OpenAPI 活动和订阅接口均需用户 Token + `calendar:read` | [日历 API](./api-calendar.md) |
| 读取用户每日历练 | 每位用户 Token；仅读取推荐 `operator:read` | [历练 API](./api-calendar.md#每日历练读取) |

尚未向第三方 Token 开放：完整密探 V5 备份、招募档案读写与备份、结构化星石背包等。站内 JWT 能力不等于第三方能力；不得让用户交出 JWT 补齐接口缺口。详见[缺口与后续任务](./gaps.md)。

## 当前接入限制

采用用户手动创建、绑定一个游戏子账号并提供 OpenAPI Token 的方式，未实现 OAuth 或一键账号授权。每子账号最多 5 个 Token，长期有效至用户撤销；创建、修改 Scope 和 API 访问受 Token 所有者的 Beta 资格限制。

为 500 名玩家开发小程序时，每位玩家都需要独立授权并满足当前资格；第三方后端按应用用户隔离保存凭据与数据。应用删除凭据只代表本应用断开，真正撤销需用户在 YuanHub 个人中心“停止连接”。详见[上线约束](./guide.md#5-多用户隔离与上线约束)。

## 协议与技术参考

保留[API 参考](./api.md)、[协议支持矩阵](./protocols.md)、JSON Schema、有效示例与下载；选择协议前先确认接口实际支持的版本。

| 数据 | 推荐协议 | 能力边界 |
|---|---|---|
| 库存、心纸、奖励 | [库存 V2](../exchange-specs/inventory-v2.md) | JWT 与 Token 支持导入、导出；Token 仍需对应 Scope |
| 完整密探备份 | [密探 V5](../operator-growth-data-exchange-protocol-v5.md) | 站内 JWT 完整备份；Token 仅受限扫描写入，export 仍 V2 |
| 招募档案 | [招募备份 V1](./recruitment-v1.md) | 站内 JWT 备份恢复，没有第三方 Token 接口 |
| 自动战斗作业 | [Work V1](../exchange-specs/work-v1.md) | 原生创作需 JWT，公开读取已实现，目标平台 Adapter 部分支持 |

## 维护状态

接口按 2026-10-18 工作区有效代码核实，表示当前代码支持，不代表这些修改已经部署到所有环境。协议改动见[协议更新记录](./changelog.md)，普通用户公告见[站点更新日志](/changelog)。历史 Swagger 快照不保证覆盖当前接口，管理员接口与内部规划不纳入本中心。
