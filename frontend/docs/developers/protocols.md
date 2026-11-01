# 数据交换协议

JSON 文件表示可交换的数据事实，HTTP API 表示某种凭据允许执行的动作。文件版本不能用于推断接口权限或导出能力。

## 正式格式

| 格式 | 版本 | 状态 | 权威正文 |
|---|---|---|---|
| `myshare-inventory-exchange` | 2 | 正式，推荐 | [库存 V2](../exchange-specs/inventory-v2.md) |
| `myshare-operator-exchange` | 5 | 正式，完整备份推荐 | [密探 V5](../operator-growth-data-exchange-protocol-v5.md) |
| `yuanhub.recruitment.v1`（schema 字段） | 1 | 正式，JWT 备份恢复 | [招募 V1](./recruitment-v1.md) |
| `yuanhub-work` | 1 | 正式，原生作业已实现 | [Work V1](../exchange-specs/work-v1.md) |

## 支持矩阵

“正式支持”仅指下列代码实现的路径；目标环境可能尚未部署对应版本。

| 能力 | 浏览器 / JWT | 第三方 / OpenAPI Token | 状态 |
|---|---|---|---|
| 库存 V2 导入/导出 | 支持，账号归属校验 | 支持，仅绑定账号 | 正式支持 |
| 密探 V5 完整备份导出 | 显式 `version=5`；前端默认 V5 | export 固定 V2 | Token 部分支持 |
| 密探 V3/V4/V5 客观、主观完整恢复 | preview + commit、账号映射 | 不接受完整备份、主观标注或 full | JWT 正式；Token 尚未实现 |
| 密探 V3/V4/V5 扫描写入 | 支持 | 单来源 `operator_snapshot + scan + listed` | 正式受限支持 |
| 密探 V2 导入/导出 | 保留 | `operator:write/export` | 兼容旧版 |
| 密探 V3/V4 导入/导出 | 保留；无法完整表达突破 | 扫描写入，不能导出这些版本 | 兼容旧版 |
| 招募 V1 导出/预览/提交 | 支持，需 JWT/Beta | 无接口或 Scope | JWT 正式；Token 尚未实现 |
| Work V1 原生创作 | JWT owner 接口 | 无作业 Scope | JWT 正式；Token 尚未实现 |
| Work 公开读取/兼容性预览 | 公共访问 | 不需要 Token | 正式；Adapter 部分支持 |
| 星石结构化完整背包交换 | 不在密探协议完整备份范围内 | 只有临时 PNG 上传 | 第三方尚未实现 |

## 旧版兼容和迁移

库存 V1 只保留为后端历史设计资料；当前服务端仅接受 V2，V1 返回422 unsupported_version，不列为仍支持的旧版。

[密探 V2](../exchange-specs/operator-v2.md)保留旧字段及其拼写；[V3](../operator-growth-data-exchange-protocol-v3.md)增加双命盘、主观标注、观测和分区状态；[V4](../operator-growth-data-exchange-protocol-v4.md)分离化极拥有、阶段和觉醒；[V5](../operator-growth-data-exchange-protocol-v5.md)增加等级突破及历史观测输入。

旧版继续读取不代表无损转换。V2/V3/V4 缺失的等级突破、V2/V3 无法表达的独立化极事实，不能从旧标量、当前 UI 或历史观测猜测。完整备份应向 V5 迁移，读取旧文件保留未知事实。服务端密探 export 的默认仍是 V2，新备份必须明确传 `version=5`。

招募通过 `schema` 字符串识别版本，不强行改造成库存的 `format/version` 结构。Work 的 `conversion.status`、目标 Adapter 支持度与协议版本独立；只有 `exact` 才有可用目标文档。草案或未来格式没有正式承诺，见[缺口](./gaps.md)。

## 校验与覆盖

Schema 验证字段结构、类型、枚举和一般范围；服务端还要验证最新目录、游戏、账号所有权、引用、幂等、时间与业务约束。使用下载的 Schema 在本地验证不能代替服务端 preview。

`listed` 更新已列出的条目或字段；`full` 声明整个领域完整快照，未列出内容可能归零或重置。密探客观快照与主观标注是两个覆盖领域；库存奖励是增量事件，不能当成绝对快照。完整恢复前必须展示覆盖范围并取得用户明确确认。

详细约定：[公共约定](../exchange-specs/common-conventions.md)、[传输与鉴权](../exchange-specs/transport.md)、[公共目录](../exchange-specs/catalogs.md)。各详情页提供原文、Schema 与示例下载；下载 JSON 中的示例账号和目录版本需要替换为当前环境的真实授权值。
