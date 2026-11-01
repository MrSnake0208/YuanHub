# 开放能力与文档责任（2026-10-18）

公开入口在现有前端 `/developers`。外部文档由前端仓库 `docs/developers/` 与既有正式协议组成，经精确文件白名单随其独立构建发布；不整体发布本仓库 docs、管理接口或 Swagger。本文是后端维护索引，不是第二份协议正文。

事实核对来源：`openapi/OpenApiPermission.kt` 与各控制器、SecurityConfig/BetaAccessPolicy、InventoryService、OperatorV3ImportService、OperatorController、RecruitmentExchangeController、WorkController。

| 能力 | 当前代码边界 |
|---|---|
| 库存 | 只接受交换 V2；JWT 与账号绑定 Token 导入/导出，V1 是历史文档，当前版本拒绝 |
| 密探完整备份 | 浏览器/JWT 支持 V3/V4/V5，完整备份推荐 V5；export 服务端默认仍 V2 |
| 密探第三方 | Token export 固定 V2；V3/V4/V5 scan 接口只允许单来源客观 scan+listed，不允许 annotation/full/manual |
| 日历/历练/星石 | calendar:read；operator:daily-tasks:write（读取亦接受 operator:read）；star:capture:write（临时 PNG，不是结构化背包） |
| 招募/Work | 招募 V1 JWT 恢复已实现；Work V1 公共读和JWT原生创作已实现、Adapter部分支持；没有二者的 OpenAPI Scope |

`ApiResult` 使用 snake_case 的 status_code/message/data，null 字段可省略。库存/密探 export 返回原始文档，招募 export 包装在 data。公共文档可读不取消 API 的账号所有权或 Beta 限制；Token 创建与 Scope 变更仍要求用户资格。

招募备份 Schema 的权威源为本仓库 `docs/schema/recruitment-exchange-v1.schema.json`。前端维护者通过其 `scripts/sync-developer-schema.mjs` 显式更新发布快照；前端构建不读取本仓库，快照不人工编辑。接口/Scope/协议变化时同时更新前端公开参考、支持矩阵和协议记录，并按必要范围核对 Schema。

内部库存 V1 设计资料继续保留，不能被当前接入说明推荐。历史 Swagger 快照的日期与覆盖范围不能替代当前代码审查；本次不重新生成或直接公开整份快照。

## Achievement catalog administration

Website-JWT administration is available under `/v1/admin/achievement-catalogs` with `achievement_catalog:write` (PLATFORM_ADMIN/SUPER_ADMIN). This is separate from player Beta/feature visibility and is not an external token scope. Draft saves, import preview/confirmation, atomic publication and rollback all require optimistic revisions. Public `GET /v1/achievements/catalog` retains its DTO and now reads Mongo published snapshots with no-store. See [catalog admin API](achievement-catalog-admin.md) for fields, import identity handling, history retention and progress compatibility limits.
