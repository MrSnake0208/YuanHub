# 招募备份协议 V1

状态：正式支持（JWT）；第三方 Token 尚未实现。版本标识：`schema="yuanhub.recruitment.v1"`。用途：保存完整招募档案历史并通过预览恢复，不是任意抽卡工具的增量上传格式。

Schema：[recruitment-exchange-v1.schema.json](./schemas/recruitment-exchange-v1.schema.json)。有效最小示例：[空档案备份](./examples/recruitment-v1.json)。接口见[招募 API](./api-recruitment.md)。

## 顶层字段

| 字段 | 必填 | 说明 |
|---|---|---|
| schema | 是 | 固定 `yuanhub.recruitment.v1`，不使用 format/version |
| exported_at | 是 | UTC RFC3339，结尾 Z |
| source_account | 否 | null 或 `{account_id}` 来源元信息，不授予目标权限 |
| game | 是 | 如鸢 / 代号鸢，不能跨游戏恢复 |
| archive_revision | 是 | 来源档案版本，仅元数据，不覆盖目标 revision |
| baseline | 是 | 已知抽数基准，0..1000000000 |
| current_pool_id | 是 | 当前池 ID 或 null |
| pools | 是 | 最多500个池快照 |
| temporary_agents | 是 | 最多1000个历史临时密探；仅兼容旧记录 |
| events | 是 | 最多20000个事件，包含删除标记 |
| batches | 是 | 最多20000个计数批次，包含删除标记 |

紧凑 UTF-8 JSON 最大5MiB；未知字段、错误类型或超限整包拒绝，不导出截断备份。数据库内部ID、user_id 和认证凭据不进入文件。

## 嵌套对象

以下载 Schema 中 `$defs.pool/temporary_agent/event/batch` 的准确字段为准。池快照保存稳定池ID、目录引用、游戏、名称、进度及UP槽信息；未知进度必须显式 null。事件保存稳定事件ID、池和密探引用、抽数跨度、日期、顺序、source及删除事实。批次保存稳定批次ID、所属池、总抽数与删除事实。

所有引用必须自洽且同游戏；历史密探快照 rarity 显式为4或5。批次有效 span 总和不能超过 total，删除时间与版本需要成对满足约束。纯日期为 YYYY-MM-DD，时间戳 UTC；未知事实保留 null，不补零冒充已确认。

公共池即使停用、UP槽退役也能保留合法历史；不能借备份创建公共目录、伪造 catalog_pool_id 或新增旧临时池/密探。已有历史临时项允许导出、判重及冲突保留，不代表允许新建。

## 恢复与兼容

目标账号从已认证请求 `account_id` 决定，source_account 只说明来源。先 preview，再使用同一文件、选项、hash、target revision 和 preview token 提交；详情见[招募 API](./api-recruitment.md)。

按稳定 ID 和业务内容判重；相同记录不重复计数，不同内容冲突保留当前。目标已有 tombstone 不被复活，备份 tombstone 不删除当前 live，目标独有记录保留。默认 `keep_current` 保留当前基准、进度和偏好，`use_backup` 也不是整库覆盖删除。

当两个来源可能描述同一段抽卡历史，服务端不能自动证明它们独立。抽数风险需通过重新预览 `confirm_count_change=true` 并核对候选总抽数确认，不能只因 Schema 通过而提交。

此协议不保证普通增量导入 `yuanhub.recruitment.import.v1` 可当作完整备份使用；标识和目的不同。未知 schema 版本必须拒绝，不根据前端展示结构猜测兼容。
