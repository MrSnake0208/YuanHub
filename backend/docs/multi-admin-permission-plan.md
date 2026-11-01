# 多管理员与权限体系规划

## 1. 文档目的

本文规划本项目从当前单一管理员判定，演进到支持多个管理员、模块管理员和超级管理员的权限体系。

规划范围包括：

- 公共密探图鉴管理；
- 反馈工单的查看、接收和处理；
- 管理员角色的授予、回收和审计；
- 管理员降权、禁用和 JWT 生命周期；
- 前后端权限展示和验收测试。

不改变个人子账号、库存、密探养成数据的归属模型。管理员默认不能跨用户访问这些个人数据。

## 2. 实施前基线

以下记录本方案制定时的权限模型，作为迁移和验收基线：

1. `maa_user.status == 0` 表示未激活，`status == 1` 通常表示普通用户，`status >= 2` 由
   `UserService.hasAdminPrivileges()` 判定为管理员，见
   [UserService.kt](../src/main/kotlin/com/lhs/share/service/UserService.kt)。
2. `/v1/admin/operator-catalog/**` 的增删改查和头像操作都要求 `status >= 2`，见
   [AdminOperatorCatalogController.kt](../src/main/kotlin/com/lhs/share/hub/controller/operator/AdminOperatorCatalogController.kt)。
3. `feedback_access_grants` 已支持按反馈模块配置 `receiveAreas` 和 `manageAreas`，但任何
   `status >= 2` 的账号都会被视为拥有全部反馈模块权限，并可以修改其他人的反馈授权，见
   [FeedbackAccessService.kt](../src/main/kotlin/com/lhs/share/hub/service/report/FeedbackAccessService.kt)。
4. 当前所谓“超级管理员”没有独立存储字段。`requireSuperAdmin()` 实际上仍然调用
   `hasAdminPrivileges()`，所以当前所有 `status >= 2` 账号权限相同。
5. `status` 来自 MaaBackend 的用户集合，本项目的 `MaaUser` 主要是只读消费。它适合作为登录状态或
   迁移依据，不适合作为长期的多管理员授权模型。

## 3. 目标与非目标

### 3.1 目标

- 支持多个管理员，各自拥有明确且可回收的权限；
- 将“管理公共图鉴”和“配置其他管理员权限”分开；
- 保留反馈模块的按区域授权能力；
- 权限检查集中在服务端，不能依赖前端隐藏按钮；
- 管理员角色变化可以较快生效，不依赖重新登录；
- 关键权限变更可追溯到操作者、目标用户、变更前后内容和时间；
- 至少保证一个可用的超级管理员，避免系统进入无人可管理状态。

### 3.2 非目标

- 不在本项目中复制或改造 MaaBackend 的用户主表；
- 不把管理员变成可以读取所有用户库存、密探养成或子账号的“数据管理员”；
- 不新增 `status = 3` 作为临时超级管理员方案；当前代码的 `status >= 2` 会把所有更高值视为同一权限。

## 4. 目标角色

角色是权限集合的业务别名，实际接口应检查权限，而不是到处比较角色字符串。

| 角色 | 适用对象 | 默认能力 |
| --- | --- | --- |
| 普通用户 | 所有已激活用户 | 管理自己的子账号、库存、密探养成和自己的反馈工单 |
| 反馈模块管理员 | 被授予反馈权限的普通用户 | 按 `receiveAreas` 接收通知，按 `manageAreas` 查看和处理对应模块工单 |
| 平台管理员 | 负责公共内容维护的管理员 | 管理公共密探图鉴及头像；不自动获得用户权限管理能力 |
| 超级管理员 | 极少数受信任账号 | 管理平台角色和反馈授权，查看审计记录，拥有全部反馈模块及平台管理能力 |

角色继承关系建议如下：

- 超级管理员包含平台管理员能力；
- 平台管理员不包含超级管理员能力；
- 反馈模块管理员不包含平台管理员能力；
- 一个用户可以同时拥有平台管理员和指定的反馈模块管理员能力；
- 超级管理员数量不设为一人，但系统必须始终保留至少一名可用超级管理员。

## 5. 权限矩阵

### 5.1 管理面权限

| 能力 | 普通用户 | 反馈模块管理员 | 平台管理员 | 超级管理员 |
| --- | ---: | ---: | ---: | ---: |
| 管理自己的子账号 | 是 | 是 | 是 | 是 |
| 访问自己的库存和密探养成 | 是 | 是 | 是 | 是 |
| 创建自己的反馈工单 | 是 | 是 | 是 | 是 |
| 查看自己的反馈工单 | 是 | 是 | 是 | 是 |
| 查看被授权模块的工单 | 否 | 按 `manageAreas` | 按明确授权 | 全部 |
| 回复/处理被授权模块工单 | 否 | 按 `manageAreas` | 按明确授权 | 全部 |
| 维护公共密探图鉴 | 否 | 否 | 是 | 是 |
| 修改其他用户反馈权限 | 否 | 否 | 否 | 是 |
| 授予或回收平台管理员 | 否 | 否 | 否 | 是 |
| 查看管理员审计记录 | 否 | 否 | 否 | 是 |

### 5.2 反馈权限语义

继续使用现有 `feedback_access_grants`，并明确两个字段的含义：

- `receiveAreas`：可以接收该模块新反馈通知；
- `manageAreas`：可以查询、查看详情、回复和修改该模块工单状态。

普通用户始终可以查看自己的工单，并只能将自己仍处于 `OPEN` 状态的工单设为 `RESOLVED`。
这不应因为用户被授予某个模块权限而改变。

超级管理员拥有所有 `FeedbackArea` 的隐含权限，但这个隐含权限应由显式的超级管理员角色检查产生，
不再由 `status >= 2` 产生。

## 6. 推荐数据模型

### 6.1 管理员角色绑定

在 HubBackend 所属数据库新增集合，例如 `admin_role_bindings`：

```text
AdminRoleBinding
- userId: String                  # MaaBackend 的用户 ID，唯一索引
- roles: Set<String>              # PLATFORM_ADMIN / SUPER_ADMIN
- grantedBy: String
- grantedAt: Instant
- updatedBy: String
- updatedAt: Instant
- version: Long                   # 可选的乐观并发版本
```

建议约束：

- `userId` 唯一；
- 只允许已激活用户成为平台管理员或超级管理员；
- `roles` 只保存平台级角色，不把反馈区域列表重复存入此集合；
- 禁止删除或降级最后一个可用超级管理员；
- 角色变更必须记录变更前后值。

### 6.2 反馈模块授权

保留现有 `feedback_access_grants` 集合，不迁移字段：

- `receiveAreas` 和 `manageAreas` 继续承担模块级授权；
- `updatedBy` 和 `updatedAt` 保留；
- 角色管理接口修改授权时，应同时写入审计记录；
- 超级管理员的全量反馈权限不需要把所有区域物化写入每个 grant。

### 6.3 审计记录

新增 `admin_audit_logs` 集合，至少记录：

```text
AdminAuditLog
- id: String
- actorUserId: String
- action: String                 # ROLE_GRANTED / ROLE_REVOKED / FEEDBACK_ACCESS_UPDATED 等
- targetUserId: String?
- targetResource: String?
- before: JSON?
- after: JSON?
- occurredAt: Instant
- requestId: String?
```

密码、JWT、Cookie 和其他凭据不得写入审计记录。审计记录建议只允许超级管理员读取，普通业务查询不应返回
整条审计正文。

## 7. 服务端改造方案

### 7.1 统一授权服务

新增一个集中授权服务，例如 `AdminAuthorizationService`，提供以下能力：

```text
hasRole(userId, role)
hasPermission(userId, permission)
requirePermission(userId, permission)
requireFeedbackManage(userId, area)
```

实现要求：

- 管理员接口统一经过此服务检查；
- 角色绑定从 HubBackend 数据库读取；
- `SUPER_ADMIN` 继承平台管理、角色管理和全量反馈权限；
- 平台管理员获得公共内容维护等平台权限；招募目录使用 `recruitment_catalog:write`，具体集合以 `AdminPermission` 为准；
- 反馈模块管理员继续通过 `feedback_access_grants` 判断区域权限；
- 未授权返回统一的 403；
- 不把权限判断交给前端，也不只检查 JWT 中签发时保存的 authority。

### 7.2 现有接口调整

保留现有 URL，替换内部授权判断：

| 现有接口 | 目标权限 |
| --- | --- |
| `/v1/admin/operator-catalog/**` | `operator_catalog:write`，超级管理员隐含拥有 |
| `/v1/admin/recruitment-catalog/**` | `recruitment_catalog:write`，平台管理员及超级管理员 |
| `/v1/admin/feedback-access` | `admin:feedback_access:manage`，仅超级管理员 |
| `/v1/reports/**` 的跨用户查询 | `feedback:<area>:read` 或超级管理员 |
| `/v1/reports/**` 的回复和状态处理 | `feedback:<area>:manage` 或超级管理员 |

建议新增管理接口：

| 方法 | 路径 | 权限 | 用途 |
| --- | --- | --- | --- |
| GET | `/v1/admin/access/me` | 已登录 | 返回当前用户的角色、反馈区域和前端可用能力 |
| GET | `/v1/admin/roles/users` | 超级管理员 | 查询已配置管理员和授权摘要 |
| PUT | `/v1/admin/roles/users/{userId}` | 超级管理员 | 覆盖目标用户的平台角色 |
| PUT | `/v1/admin/feedback-access/{userId}` | 超级管理员 | 保留现有接口，配置反馈区域权限 |
| GET | `/v1/admin/audit-logs` | 超级管理员 | 分页查询管理员操作记录 |

角色更新接口建议采用“完整替换”语义，避免 PATCH 中字段缺失导致误解；服务端应校验目标用户存在且已激活。

### 7.3 `status` 的过渡定位

- 登录和账号启用继续使用 `status`；
- 迁移期可以使用 `status >= 2` 发现旧管理员；
- 完成迁移后，管理员接口不再调用 `hasAdminPrivileges()`；
- `hasAdminPrivileges()` 应标记为过渡方法并最终删除或改名为明确的角色查询方法；
- 不使用 `status = 2/3/4` 表达不同管理员角色；
- 由于 `MaaUser` 来自外部用户系统，角色绑定以 `userId` 为外键，不在此项目复制密码和用户主数据。

## 8. JWT 与账号状态

当前 JWT 过滤器主要验证签名和时间，不重新读取用户状态。多管理员上线时必须明确以下行为：

1. 管理员接口的角色检查以数据库当前绑定为准，而不是只信任旧 JWT 中的 authority；这样角色回收可以立即阻断管理员操作。
2. 用户被禁用后，刷新 token 必须重新检查 `status > 0`；否则已禁用账号仍可能获得新 token。
3. 对普通业务接口，至少应在刷新 token 时检查账号状态；是否每次请求查用户表，按性能和部署规模决定。
4. 平台角色不建议写入长期 JWT。若未来需要缓存，必须有明确的失效策略，不能让角色回收等待 access token 自然过期。
5. 角色变更、用户禁用和最后超级管理员保护应有对应的集成测试。

## 9. 迁移与发布步骤

### 阶段 0：盘点和决策

- 列出当前所有 `status >= 2` 账号，按邮箱确认真实管理员身份；
- 选择至少一名、建议两名超级管理员；
- 确认哪些账号只需要公共图鉴权限，哪些账号需要反馈处理权限；
- 检查现有 `feedback_access_grants`，删除或修正无效用户授权。

### 阶段 1：新增模型和授权服务

- 创建 `admin_role_bindings` 和 `admin_audit_logs` 的实体、索引、仓储和服务；
- 实现 `AdminAuthorizationService`；
- 为角色和权限定义常量，避免散落字符串；
- 增加角色绑定、反馈授权和审计的服务层测试。

### 阶段 2：一次性迁移现有管理员

- 将确认过的旧管理员写入 `admin_role_bindings`；
- 指定的核心管理员授予 `SUPER_ADMIN`；
- 其他旧管理员默认迁移为 `PLATFORM_ADMIN`，只有明确需要时再授予反馈模块权限；
- 迁移结果记录操作者和来源，不把密码、token 或完整用户隐私写入日志；
- 在切换前核对超级管理员数量大于等于 1。

迁移期间必须明确一次性切换点。切换后管理员接口只使用新绑定，避免新旧规则并行造成“已经降权但仍可操作”的不确定行为。

### 阶段 3：切换现有管理员端点

- 将公共图鉴控制器从 `hasAdminPrivileges()` 切换为 `operator_catalog:write`；
- 将反馈权限管理切换为 `admin:feedback_access:manage`；
- 将反馈工单列表、详情、回复和状态变更继续交给区域权限服务；
- 增加普通用户、模块管理员、平台管理员、超级管理员四类端到端测试；
- 前端只使用 `/v1/admin/access/me` 控制菜单展示，后端仍执行最终校验。

### 阶段 4：收缩旧逻辑

- 删除业务代码中对 `status >= 2` 的管理员授权判断；
- 删除或重命名 `hasAdminPrivileges()`；
- 更新 README、OpenAPI 描述和部署手册；
- 保留 `status` 作为用户激活状态，不再作为管理员角色来源；
- 确认没有遗留接口绕过统一授权服务。

## 10. 必须防护的业务规则

- 不能删除、降级或禁用最后一名超级管理员；
- 超级管理员可以撤销其他管理员，但不能通过普通平台管理员接口修改角色；
- 角色变更必须记录审计，失败操作不应产生“成功”审计记录；
- 只能为已激活用户分配管理员角色或反馈权限；
- 被降权管理员的旧 JWT 不能继续访问管理员接口；
- 管理员不能因为拥有平台角色而访问其他用户的库存、密探养成或子账号；
- 反馈区域必须经过服务端白名单校验；
- 删除反馈授权后，旧页面再次请求必须立即得到 403；
- 权限缓存如果引入，缓存失效必须覆盖角色授予、回收和用户禁用三种事件。

## 11. 验收标准

### 角色和接口

- 普通用户访问公共图鉴管理接口返回 403；
- 反馈模块管理员只能查看和处理被授予的模块；
- 平台管理员可以维护公共图鉴，但不能修改管理员角色；
- 超级管理员可以维护公共图鉴、配置反馈权限、查询管理员和查看审计；
- 平台管理员不能通过篡改请求参数访问其他用户的个人数据；
- 未登录请求返回 401。

### 生命周期

- 回收管理员角色后，旧 access token 访问管理员接口立即返回 403；
- 禁用用户后不能刷新出新 token；
- 删除反馈模块授权后，原模块工单的详情、回复和状态操作立即失效；
- 尝试降级最后一名超级管理员返回明确的业务错误，数据库状态不改变。

### 审计和数据

- 每次授予、回收和覆盖角色都有操作者、目标用户、前后值和时间；
- 反馈权限变更同样进入审计；
- 审计记录不包含密码、JWT、Cookie 或其他凭据；
- 迁移前后的现有个人子账号、库存、密探养成和反馈工单数据保持不变。

## 12. 推荐落地顺序

推荐优先实现以下最小闭环：

1. `admin_role_bindings` + `SUPER_ADMIN` / `PLATFORM_ADMIN` 两个角色；
2. `AdminAuthorizationService`，先替换图鉴和反馈权限管理接口；
3. 迁移一个超级管理员和现有平台管理员；
4. 加入最后超级管理员保护、审计和旧 JWT 降权测试；
5. 再增加前端权限查询接口和管理员管理页面；
6. 最后删除 `status >= 2` 的长期授权逻辑。

这个顺序可以先解决多管理员的核心权限隔离，同时保持现有反馈模块授权和个人数据归属不变。
