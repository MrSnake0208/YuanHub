# 多管理员权限体系前端实施说明

## 1. 目的

后端已经从 `maa_user.status >= 2` 的单一管理员判断切换为显式角色与权限。前端需要同步调整权限状态、菜单、路由、管理页面和错误处理，确保：

- 页面展示以服务端当前权限为准；
- 角色或反馈授权被回收后，旧 JWT 不会让页面继续执行管理操作；
- 平台管理员、反馈模块管理员和超级管理员看到的入口与操作范围正确；
- 前端隐藏入口只是体验优化，所有请求仍接受后端最终鉴权。

本文只描述前端改造。后端模型与迁移背景见 [multi-admin-permission-plan.md](multi-admin-permission-plan.md)。

## 2. 必须遵守的权限原则

1. 不再读取或比较用户 `status` 来判断管理员。
2. 不使用 JWT 中旧的 authority 决定管理权限。
3. 功能入口优先检查 `permissions`，不要用角色字符串代替权限判断。
4. `roles` 用于展示身份和编辑角色；`permissions` 用于决定用户当前能做什么。
5. `SUPER_ADMIN` 会继承平台管理能力，但返回的 `roles` 不一定同时包含 `PLATFORM_ADMIN`。
6. `receive_areas` 只表示接收新反馈通知，不表示可以查看或处理该模块工单。
7. `manage_areas` 同时表示可以跨用户查询、查看详情、回复和修改对应模块工单状态。
8. 普通用户始终可以查看自己的反馈工单；这与管理员权限无关。

## 3. 权限状态初始化

### 3.1 新增全局权限请求

用户登录后、刷新页面恢复登录态后，请求：

```http
GET /v1/admin/access/me
Authorization: Bearer <access-token>
```

该接口只要求登录，普通用户也可以调用。成功响应示例：

```json
{
  "status_code": 200,
  "data": {
    "roles": ["PLATFORM_ADMIN"],
    "permissions": ["operator_catalog:write"],
    "receive_areas": ["INVENTORY"],
    "manage_areas": ["OPERATOR"],
    "super_admin": false
  }
}
```

建议在认证状态旁新增独立的 `adminAccess` 状态：

```ts
export type AdminRole = "PLATFORM_ADMIN" | "SUPER_ADMIN";

export type StaticAdminPermission =
  | "operator_catalog:write"
  | "recruitment_catalog:write"
  | "admin:role:manage"
  | "admin:feedback_access:manage"
  | "admin:audit:read";

export type FeedbackArea =
  | "INVENTORY"
  | "OPERATOR"
  | "LEDGER"
  | "PLAZA"
  | "ACCOUNT"
  | "UI"
  | "STAR"
  | "MAAYUAN"
  | "OTHER";

export type FeedbackPermission =
  | `feedback:${FeedbackArea}:read`
  | `feedback:${FeedbackArea}:manage`;

export type AdminPermission = StaticAdminPermission | FeedbackPermission;

export interface AdminAccess {
  roles: AdminRole[];
  permissions: AdminPermission[];
  receive_areas: FeedbackArea[];
  manage_areas: FeedbackArea[];
  super_admin: boolean;
}
```

### 3.2 状态生命周期

- 权限请求完成前，管理菜单和受保护页面应处于 loading 状态，不要短暂显示全部入口。
- 登录成功后获取一次权限。
- 页面刷新并恢复 JWT 后获取一次权限。
- 退出登录时清空权限状态。
- 当前用户的角色被修改后立即重新获取权限。
- 任意管理请求返回业务 403 时，重新获取权限并根据新结果关闭页面、隐藏操作或跳转。
- 不需要轮询权限；后端会在每次管理请求时读取当前绑定。

权限状态可以使用应用已有的状态库或请求缓存。若使用 Query/SWR 一类缓存，角色或反馈授权变更成功后应主动 invalidate 对应权限查询。

### 3.3 权限判断函数

建议集中提供以下 helper，禁止组件各自比较角色：

```ts
export function hasPermission(access: AdminAccess | undefined, permission: AdminPermission): boolean {
  return access?.permissions.includes(permission) ?? false;
}

export function canManageAnyFeedback(access: AdminAccess | undefined): boolean {
  return (access?.manage_areas.length ?? 0) > 0;
}
```

角色只用于显示“平台管理员”“超级管理员”等标签，不能用 `roles.includes("PLATFORM_ADMIN")` 判断图鉴入口，因为超级管理员可能只绑定 `SUPER_ADMIN`。

## 4. 菜单与路由改造

建议将现有管理入口拆分为独立权限：

| 前端功能 | 展示条件 |
| --- | --- |
| 公共密探图鉴管理 | `operator_catalog:write` |
| 招募卡池及 UP 占位管理（`/recruitment/admin`） | `recruitment_catalog:write` |
| 跨用户反馈工单 | `manage_areas.length > 0` |
| 管理员角色管理 | `admin:role:manage` |
| 反馈模块授权管理 | `admin:feedback_access:manage` |
| 管理员审计记录 | `admin:audit:read` |

每个管理路由需要同时具备：

- 菜单入口条件；
- 路由进入前的权限守卫；
- 页面内部按钮级权限判断；
- 请求失败后的 403 降权处理。

没有权限时显示统一的无权限页或返回上一可用页面，不要只渲染空白页面。

普通用户自己的反馈列表和详情不能放进管理员路由守卫。只有“查看全部/处理模块反馈”的视图才检查 `manage_areas`。

## 5. 管理员角色管理页面

### 5.1 管理员列表

```http
GET /v1/admin/roles/users
```

需要 `admin:role:manage`。返回 `data` 是非空角色绑定列表：

```ts
export interface AdminRoleUser {
  user_id: string;
  user_name: string;
  activated: boolean;
  roles: AdminRole[];
  granted_by: string;
  granted_at: string;
  updated_by: string;
  updated_at: string;
}
```

页面建议显示：用户、当前角色、账号是否激活、首次授予人与时间、最近修改人与时间。

未激活的历史绑定应显示明确状态。前端允许清空其角色，但不能给未激活用户保留或新增角色。

### 5.2 搜索待授权用户

当前没有单独的角色候选搜索接口。超级管理员可以复用现有已激活用户搜索：

```http
GET /v1/admin/feedback-access/users?q=<keyword>&page=1&size=10
```

```ts
export interface AdminUserCandidate {
  id: string;
  user_name: string;
  email: string;
  activated: boolean;
}
```

- `q` 必填，可输入用户名或完整邮箱；
- `page` 从 1 开始；
- `size` 只能为 1 到 10；
- 完整邮箱会优先精确匹配；
- 只返回已激活用户。

搜索应防抖，并在输入为空时不发送请求。

### 5.3 覆盖角色

```http
PUT /v1/admin/roles/users/{userId}
Content-Type: application/json

{
  "roles": ["PLATFORM_ADMIN"]
}
```

这是完整替换，不是增量修改：

- 必须始终显式发送 `roles`；
- `{"roles":[]}` 表示回收全部平台角色；
- 不要发送 `{}`，因为后端也会将缺失的 `roles` 解释为空集合；
- 合法值只有 `PLATFORM_ADMIN` 和 `SUPER_ADMIN`。

UI 应使用复选框或多选控件展示实际存储的角色。超级管理员会继承平台能力，但不要擅自在请求中自动添加或删除 `PLATFORM_ADMIN`；继承能力应显示在权限说明中。

以下操作需要二次确认：

- 清空全部角色；
- 回收 `SUPER_ADMIN`；
- 修改当前登录用户自己的角色。

若当前用户修改了自己的角色，请在成功后立即刷新 `/v1/admin/access/me` 并根据新权限跳转。

关键业务错误：

| `status_code` | 场景 | 前端行为 |
| ---: | --- | --- |
| 400 | 未激活用户被授予角色、未知角色 | 保留表单并显示后端 `message` |
| 403 | 当前用户已无角色管理权限 | 刷新权限并离开管理页 |
| 404 | 目标用户不存在 | 关闭编辑框并刷新列表 |
| 409 | 尝试降级最后一名可用超级管理员 | 保留原角色，显示明确阻止原因并刷新列表 |

## 6. 反馈模块授权页面

### 6.1 字段语义

页面必须把两类授权分开：

- `receive_categories`：接收该模块新反馈通知；
- `manage_categories`：查询、查看、回复和修改该模块工单状态。

不要把“接收通知”描述成“可查看”。一个用户可以只接收通知而没有工单读取权限。

模块值固定为：`INVENTORY`、`OPERATOR`、`LEDGER`、`PLAZA`、`ACCOUNT`、`UI`、`OTHER`。

模块显示名称可从以下接口的 `available_categories` 获取：

```http
GET /v1/reports/access
```

该接口仍可用于反馈页面自身的权限摘要，但全局菜单必须以 `/v1/admin/access/me` 为准。

### 6.2 授权列表与用户搜索

```http
GET /v1/admin/feedback-access
GET /v1/admin/feedback-access/users?q=<keyword>&page=1&size=10
```

授权列表每项包含：

```ts
export interface FeedbackAccessGrant {
  user_id: string;
  user_name: string;
  receive_areas: FeedbackArea[];
  manage_areas: FeedbackArea[];
  receive_categories: FeedbackArea[];
  manage_categories: FeedbackArea[];
  updated_by: string;
  updated_at: string;
}
```

响应同时保留 `areas` 与 `categories` 两套兼容字段。新前端统一读取和发送 `*_categories`，不要同时发送两套不同值。

### 6.3 覆盖与删除授权

```http
PUT /v1/admin/feedback-access/{userId}
Content-Type: application/json

{
  "receive_categories": ["INVENTORY"],
  "manage_categories": ["OPERATOR"]
}
```

两个字段都是完整替换。空数组表示清空对应类别。

```http
DELETE /v1/admin/feedback-access/{userId}
```

DELETE 会删除整条授权并立即失效。成功响应只有 `status_code: 200`，`data` 可能省略，前端不能要求 `data === true`。

授权更新或删除成功后应刷新：

- 反馈授权列表；
- 被修改用户是当前登录用户时的 `/v1/admin/access/me`；
- 当前页面正在展示跨用户反馈时的工单查询。

若旧页面随后收到业务 403，说明授权已被回收，应关闭详情或编辑区域，并跳回当前用户仍有权限的列表。

## 7. 跨用户反馈页面

现有反馈接口保持不变：

```http
GET /v1/reports?mine=true
GET /v1/reports?mine=false
GET /v1/reports/{id}
POST /v1/reports/{id}/messages
PATCH /v1/reports/{id}/status
```

前端对应修改：

- “我的反馈”始终可见，使用 `mine=true`；
- “模块反馈/全部反馈”仅在 `manage_areas` 非空时可见，使用 `mine=false`；
- 模块筛选只能提供当前 `manage_areas` 中的值；
- `receive_areas` 不能用于模块筛选或详情权限；
- 回复和状态按钮以详情响应的 `viewer_can_manage` 为最终展示依据；
- 权限回收后的详情、回复或状态请求若返回 403，应退出该工单管理视图。

超级管理员的 `manage_areas` 会返回全部模块，不需要在前端额外展开角色继承。

## 8. 审计记录页面

```http
GET /v1/admin/audit-logs?page=1&size=20
```

需要 `admin:audit:read`。页码从 1 开始，`size` 范围为 1 到 100。

```ts
export type AdminAuditAction =
  | "ROLE_GRANTED"
  | "ROLE_REVOKED"
  | "ROLE_REPLACED"
  | "FEEDBACK_ACCESS_UPDATED"
  | "FEEDBACK_ACCESS_DELETED";

export interface AdminAuditSnapshot {
  roles?: AdminRole[];
  receive_areas?: FeedbackArea[];
  manage_areas?: FeedbackArea[];
}

export interface AdminAuditLog {
  id: string;
  actor_user_id: string;
  action: AdminAuditAction;
  target_user_id?: string | null;
  target_resource?: string | null;
  before?: AdminAuditSnapshot | null;
  after?: AdminAuditSnapshot | null;
  occurred_at: string;
  request_id?: string | null;
}

export interface PagedData<T> {
  has_next: boolean;
  page: number;
  total: number;
  data: T[];
}
```

页面建议按时间倒序展示：动作、操作者、目标用户、变更前、变更后、发生时间。角色和反馈区域应转换为可读标签；没有 `before` 或 `after` 时显示“无”，不要把 null 当成加载失败。

审计页只读，不提供删除或编辑操作。

## 9. 公共图鉴管理页面

现有 `/v1/admin/operator-catalog/**` 请求路径和数据结构不变，主要改动是权限来源：

- 菜单、路由和所有编辑按钮改为检查 `operator_catalog:write`；
- 不再检查用户 `status`；
- `PLATFORM_ADMIN` 和 `SUPER_ADMIN` 都能使用；
- 角色回收后，下一次请求会返回真实 HTTP 403，此时刷新权限并离开页面。

头像上传继续使用：

```http
PUT /v1/admin/operator-catalog/{operatorId}/avatar
Content-Type: multipart/form-data
file=<webp-file>
```

使用 `FormData` 时不要手动设置 multipart boundary。当前后端会验证文件非空且具有 WebP 文件头；前端可以保留更严格的本地大小提示，但不能把本地校验当作服务端权限或格式校验。

图鉴接口的错误结构与通用 `ApiResult` 不同：

```json
{
  "error": {
    "code": "forbidden",
    "message": "Administrator privileges are required"
  }
}
```

API 客户端需要同时兼容两种错误结构。

## 10. API 客户端错误处理

### 10.1 通用响应

管理员角色、反馈授权、审计和普通反馈接口使用：

```ts
export interface ApiResult<T> {
  status_code: number;
  message?: string;
  data?: T;
}
```

当前部分业务异常会以 HTTP 200 返回，真实错误码位于 `status_code`。因此不能只依赖 `response.ok`：

```ts
export async function unwrapApiResult<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as ApiResult<T>;

  if (!response.ok || payload.status_code !== 200) {
    throw new ApiError(payload.status_code || response.status, payload.message ?? "请求失败");
  }

  return payload.data as T;
}
```

认证层的无效 JWT 通常返回真实 HTTP 401；禁用用户刷新 token 等业务异常可能返回 HTTP 200 + `status_code: 401`。两种情况都应清空登录态并进入登录流程。

业务 `status_code: 403` 不应直接退出登录：先刷新 `/v1/admin/access/me`，更新菜单和路由，再显示权限已变更提示。

### 10.2 图鉴错误

图鉴管理接口失败时使用 `error.code` / `error.message`，并可能返回真实 HTTP 403、404、409 或 422。建议在统一客户端中增加错误响应识别：

```ts
interface OperatorErrorResponse {
  error: {
    code: string;
    message: string;
  };
}
```

表单校验错误保留编辑内容并就近提示；401/403 按权限状态流程处理；404 后刷新列表；409 保留表单并提示冲突。

## 11. 推荐实施顺序

1. 新增 API 类型、统一 `ApiResult` 业务码处理和权限 store。
2. 登录态恢复后接入 `/v1/admin/access/me`。
3. 替换现有 `status` / JWT authority 管理员判断。
4. 增加菜单、路由和按钮级 permission guard。
5. 完成角色管理页。
6. 调整反馈授权页并明确 receive/manage 语义。
7. 增加审计页。
8. 补齐权限回收和错误响应测试。

## 12. 前端验收清单

### 普通用户

- 不显示公共图鉴管理、跨用户反馈、角色、授权和审计入口。
- 仍能创建和查看自己的反馈工单。
- 直接访问管理前端路由时显示无权限页。

### 仅有 `receive_areas` 的用户

- 可以收到对应模块通知。
- 不显示跨用户反馈入口。
- 不能打开其他用户工单详情或回复、修改状态。

### 反馈模块管理员

- 只显示 `manage_areas` 中的模块筛选。
- 可以查看、回复和处理授权模块工单。
- 授权删除后，旧页面下一次请求立即退出管理视图。

### 平台管理员

- 可以访问公共图鉴管理。
- 不显示角色管理、反馈授权和审计入口。
- 没有明确反馈授权时不显示跨用户反馈入口。

### 超级管理员

- 可以访问公共图鉴、角色管理、反馈授权和审计。
- 跨用户反馈模块包含全部区域。
- 尝试回收最后一名可用超级管理员时显示 409 业务错误，UI 保留原角色。

### 生命周期与错误处理

- 角色回收后无需重新登录，旧 JWT 的下一次管理请求即被拒绝。
- 当前用户自我降权后，菜单和路由立即刷新。
- HTTP 200 + `status_code: 403` 能正确进入降权流程。
- HTTP 401 或 `status_code: 401` 能正确退出登录。
- 图鉴接口的 `error` 响应和其他接口的 `ApiResult` 都能正确展示。
- 权限加载期间不闪现管理员菜单或敏感操作按钮。

## 13. 不需要修改的边界

- 不改变个人子账号、库存、密探养成数据的页面归属和请求范围。
- 不新增前端自定义角色或把反馈区域复制成平台角色。
- 不在 localStorage 中长期固化管理员权限；持久化 JWT 后仍需重新请求当前权限。
- 不通过隐藏按钮代替后端鉴权。
