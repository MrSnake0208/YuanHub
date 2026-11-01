# 独立开发目标

大饼中心使用 Hub 库 `development_goals` 集合，目标不是公开反馈的状态分组。每个目标有标题、说明、阶段、验收清单、可选目标版本/日期和最多 20 条关联公开反馈。目标可不关联反馈；目标阶段与工单状态互不自动同步。

公开读取 `GET /v1/development-goals?page=1&size=12&stage=PLANNED`。省略 stage 返回全部；page >= 1，size 为 1–50，按创建时间/ID 倒序分页。返回统一 ApiResult，data 为 `{data,total,page,has_next}`。

管理员接口：`GET /v1/admin/development-goals`、`GET /v1/admin/development-goals/{id}`、`POST /v1/admin/development-goals`、`PUT /v1/admin/development-goals/{id}`。需要 JWT 与 `development_goal:manage`。该能力由现有 PLATFORM_ADMIN/SUPER_ADMIN 角色获得；没有自动修改账号角色或授予反馈岗位。

公开和管理员接口均声明响应媒体类型为 `application/json`，OpenAPI 使用同一类型描述 ApiResult 与分页结构，客户端按 JSON 读取。

保存参数：`title`（1–120 字）、`description`（1–3000 字）、`stage`（PLANNED/IN_PROGRESS/COMPLETED/PAUSED）、`criteria`（1–20 项 `{title,completed}`，标题 1–200 字）、`feedback_ids`（最多 20 条）、可选 `target_version`（最多 80 字）和 `target_date`（YYYY-MM-DD）。更新还必须携带 `expected_version`。

保存后立即公开。只有全部验收项 completed=true 时可选择 COMPLETED。进度展示为已通过项目/总项目；不表示工时比例，也不承诺发布日期。新增关联必须是 PUBLIC 反馈。已有关联后续取消公开不阻止编辑，但公开响应实时过滤其标题和 ID；管理员保留关联 ID 以便清理，不暴露私人正文。

Mongo @Version 防止并发覆盖。旧版本和并发保存返回 HTTP 409；校验错误 400、缺失目标 404、权限错误 403。前端失败保留草稿，重新加载需确认放弃修改。

集合独立新增，读取不初始化或写入数据，不迁移旧反馈、不生成示例目标。首次启用需要部署后端代码；现有开发服务不得由 Agent 擅自重启。
