# BackEndV3-Share 用户接口契约（前端接入参考）

> 依据 `~/BackEndV3-Share` 源码整理，前端实现必须与之一一对应。

## 基础信息

- 后端地址（本地开发）：`http://localhost:8080`，无 context-path
- CORS：已全开（allowedOriginPatterns=*，allowCredentials=true），前端 Vite dev 5173 端口可直接调用
- 统一响应包装：`{ "status_code": number, "message": string|null, "data": T|null }`
  - 成功：status_code=200，data 为业务数据
  - 失败：status_code 对齐 HTTP 状态码，message 为中文提示（前端应直接展示 message）
  - 注意 Jackson 配置 `property-naming-strategy: SNAKE_CASE`：**请求/响应 JSON 字段均为 snake_case**
- 认证方式：请求头 `Authorization: Bearer <accessToken>`（后端 header 配置名即 Authorization）
- 时间字段：`Instant` 序列化为 ISO-8601 字符串（如 `2025-01-01T00:00:00Z`）
- 邮件验证码：600 秒（10 分钟）有效；发送间隔限制 = expire/10 = 60 秒（重复发送返回 403 "发送验证码的请求至少需要间隔 60 秒"）；本地调试 `debug.email.no-send: true` 时验证码打印在后端日志
- Swagger UI：`http://localhost:8080/swagger-ui/index.html`（可在线对照）

## 接口清单

### 1. 登录 POST /user/login（匿名白名单）
请求：`{"email": "xx@xx.com", "password": "..."}`（email 必填且格式校验，password 必填）
成功 data：
```json
{
  "token": "<accessToken>",
  "valid_before": "2025-...Z",
  "valid_after": "2025-...Z",
  "refresh_token": "<refreshToken>",
  "refresh_token_valid_before": "...",
  "refresh_token_valid_after": "...",
  "user_info": { "id": "...", "user_name": "...", "activated": true, "following_count": 0, "fans_count": 0 }
}
```
失败：
- 401 "用户不存在或者密码错误"
- 401 "用户未启用"（status==0 未激活）

### 2. 注册 POST /user/register（匿名白名单）
请求：`{"email": "...", "user_name": "...", "password": "...", "registration_token": "验证码"}`
- userName 4~24 位；password 8~32 位；registrationToken 邮箱验证码（可空串但注册必须真实有效）
成功 data：`MaaUserInfo`（同 user_info 结构）
失败：
- 400 "用户名已存在,请重新取个名字吧" / "用户已存在"
- 401 "验证码错误"（校验通过即消耗，防重放）

### 3. 发送注册验证码 POST /user/sendRegistrationToken（匿名白名单）
请求：`{"email": "..."}`
失败：
- 400 "用户已存在"
- 403 "发送验证码的请求至少需要间隔 60 秒"

### 4. 发送重置密码验证码 POST /user/password/reset_request（公开）
请求：`{"email": "..."}`
失败：404 "找不到用户"

### 5. 重置密码 POST /user/password/reset（公开）
请求：`{"email": "...", "active_code": "验证码", "password": "新密码"}`
失败：401 "验证码错误"；404 "找不到用户"

### 6. 刷新 token POST /user/refresh（公开）
请求：`{"refresh_token": "..."}`
成功 data：同登录（新的 access + refresh，refresh 5 分钟内复用原 token）
失败：401 "invalid token" 等

### 7. 用户公开信息 GET /user/info?userId=xxx（公开）
成功 data：MaaUserInfo；404 "用户不存在: xxx"

### 8. 修改密码 POST /user/update/password（需 JWT）
请求：`{"original_password": "...", "new_password": "8~32位"}`
失败：400 "请输入原密码" / "原密码错误" / "密码修改过于频繁"(10分钟内)

### 9. 更新信息 POST /user/update/info（需 JWT）
请求：`{"user_name": "4~24位"}`
失败：400 "用户名已存在,请重新取个名字吧" / "用户名长度应在4-24位之间"

### 10. 用户搜索 GET /user/search?userName=xx&page=1&size=10（公开，size≤50）

## Token 参数（application.yml）

- accessToken 有效期：21600 秒（6 小时）
- refreshToken 有效期：604800 秒（7 天）
- 普通用户接口认证失败（未带/无效 token / 过期）：401 JSON `{"status_code":401,"message":"未登录或登录已过期",...}`
- 库存接口认证失败：401 JSON `{"error":{"code":"unauthorized","message":"Authentication is required"}}`

## 前端建议架构（贴合现有 Vue3+Vite 项目，无 axios/pinia）

1. `src/api/request.js`：基于 `fetch` 的轻量封装 —— 统一 baseURL、JSON 序列化/反序列化、自动带 `Authorization: Bearer`、401 时用 refreshToken 静默刷新并重放原请求、刷新失败则清登录态跳转登录页、非 200 统一抛错（message 直接取自响应 message）
2. `src/api/user.js`：上述 10 个接口的函数
3. `src/store/auth.js`：Vue reactive 单例 —— userInfo / accessToken / refreshToken，localStorage 持久化（如 `yh_auth` key），登录/登出/初始化/静默刷新
4. 页面：`src/pages/user/login.vue`、`register.vue`、`forgot.vue`（或 reset.vue）
5. 路由：`src/router/routes.js` 注册，path 建议 `/login` `/register` `/forgot`，display:false；路由守卫（router.beforeEach）按需保护
6. 侧边栏 `src/components/IslandSidebar.vue`：底部"登录 / 注册"链接替换为真实路由跳转；已登录显示用户名 + 退出按钮

## 库存接口契约（/v1/inventory，交换协议 v2）

> 需登录（JWT），/v1/inventory/catalog 公开。库存为私有数据，userId 取自 JWT，查询均需携带 account_id（多子账号）。
> 统一响应：成功 {status_code:200, message, data}；库存端点出错返回 {error:{code,message,record_id?,entry_id?}}（非 ApiResult），HTTP 状态码对齐错误类型（401/403/404/409/422/500）。

### 库存子账号
- POST /v1/inventory/accounts  body {name} → {id,name,created_at,updated_at}（id 形如 acc_<32hex>，每用户 ≤10 个，重名 409）
- GET /v1/inventory/accounts → [{id,name,created_at,updated_at}]
- PATCH /v1/inventory/accounts/{accountId}  body {name} → 账号对象
- DELETE /v1/inventory/accounts/{accountId} → 级联删除该账号库存/流水/密探关注/token，返回 true

### 查询与导入导出
- GET /v1/inventory/current?account_id=&entity_type=item|agent → [{entity_type, entries:{"<id>":{count,listed_baseline_at}}}]
- GET /v1/inventory/acquired?account_id=&entity_type=&from=&to=（from/to 为 RFC 3339）→ {entity_type, from, to, acquired:{"<id>":count}}
- GET /v1/inventory/records?account_id=&entity_type=&from=&to=&cursor=&limit=（游标分页，limit 1..100 默认 50）→ {items:[...], next_cursor}
- DELETE /v1/inventory/records/{recordId}?account_id= → 删除单条并重放重建库存，返回 true
- POST /v1/inventory/import  body 为完整交换文档 v2（见下）→ {accepted,duplicates,history_only,superseded,warnings}
- GET /v1/inventory/export?account_id= 或 scope=all&include=current|current,rewards&from=&to= → 直接返回交换文档（无 ApiResult 包装）
- GET /v1/inventory/catalog（公开）→ {catalog_version, entities:[{entity_type,id,name}]}

### 密探特别关注（已实现，可联调）

> 完整前端接入要求见 [`frontend-handoff-agent-favorites.md`](./frontend-handoff-agent-favorites.md)，可复制的实施任务见 [`frontend-implementation-prompt-agent-favorites.md`](./frontend-implementation-prompt-agent-favorites.md)。

- GET /v1/inventory/agent-favorites?account_id= → `{account_id,agent_ids:[...]}`
- PUT /v1/inventory/agent-favorites/{agentId}?account_id= → `{account_id,agent_id,favorite:true}`
- DELETE /v1/inventory/agent-favorites/{agentId}?account_id= → `{account_id,agent_id,favorite:false}`
- 三个接口只接受普通登录 JWT，不接受 OpenAPI Token；PUT/DELETE 无请求体且均幂等。
- GET 的 `agent_ids` 去重并按完整 ID 字符串升序返回；这不是发布顺序。
- 所有读写按 JWT 当前用户与 `account_id` 校验，切换子账号必须清空旧列表并重新查询。
- 错误：未登录 `401 unauthorized`；账号不存在或不属于当前用户 `404 account_not_found`；缺少 `account_id` 为 `422 schema_validation_failed`；非法或未知密探分别为 `422 invalid_agent_id`、`422 unknown_agent`。
- 关注状态不进入 current/acquired/records/export，不生成库存流水，也不进入交换档案 v2。
- 本地真实 Mongo 已完成 64 次 PUT、并发度 16 的烟测：64 个 HTTP 200，数据库目标记录 1 行。

### 交换文档 v2（导入/导出一致）

```json
{
  "format": "myshare-inventory-exchange",
  "version": 2,
  "exported_at": "2026-08-16T08:25:00+08:00",
  "catalog_version": "2026-08-16",
  "producer": { "platform": "myshare", "version": "5" },
  "accounts": [ { "id": "acc_xxx", "name": "大号" } ],
  "records": [ {
    "account_id": "acc_xxx",
    "record_id": "myshare:xxx",
    "record_type": "reward_delta | stock_snapshot",
    "entity_type": "item | agent",
    "acquisition_channel": "派遣",
    "effective_at": "2026-08-16T07:19:46.833+08:00",
    "snapshot_scope": "full | listed",
    "entries": [ { "id": "char_029_xiuqiu", "name": "绣球", "count": 1 } ]
  } ]
}
```

密探心纸手动库存沿用上述 v2 文档：使用 `record_type=stock_snapshot`、`entity_type=agent`。
`full` 替换该子账号完整密探库存，`listed` 只覆盖列出的密探。库存业务只使用
`id` 和 `count`；`name` 是展示冗余，`rarity`、`prof`、`sub_prof` 等字段不能修改公共目录。

## OpenAPI Token 接口契约（/user/open-api）

> 生成/列举/删除需登录（JWT）；权限列表公开。Token 绑定库存子账号，每账号 ≤5 个。

- GET /user/open-api/permissions（公开）→ [{scope,description}]，scope 为字符串 key：inventory:read / inventory:write / inventory:export
- POST /user/open-api/token  body {account_id, scopes:[key...], remark} → {token_id, token, account_id, account_name, remark, scopes, created_at}（token 仅此一次返回）
- GET /user/open-api/tokens → [{token_id, account_id, account_name, remark, scopes, created_at}]（不含 token 明文）
- DELETE /user/open-api/tokens/{tokenId} → 删除（越权 403 / 不存在 404）

## 前端接入要点（本次适配）

- src/api/request.js 新增 raw=true（导出接口返回完整文档）；自动兼容库存 {error:{code,message}} 错误结构并提取 message。
- src/api/inventory.js：账号 CRUD + 全部查询带 account_id + 游标分页 + 导出 raw。
- src/api/openApi.js：生成传 account_id/scopes/remark，删除走 DELETE /tokens/{tokenId}。
- src/utils/openApiToken.js：scope 改为字符串 key 数组，时间字段为 ISO created_at。
- 密探特别关注和密探心纸手动编辑尚待前端接入；实现范围、竞态处理、视觉约束和验收用例见 `docs/frontend-handoff-agent-favorites.md`。

## 设计规范约束（MaaYuan Share v1.0）

- 骨架色：纸底 #F6EDD0 / 暖白卡 #FFFDF6 / 奶油 #FFF8EC / 暖棕 #493B2C / 茶棕 #5A4633
- 点缀：蜜黄 #EFD28E（选中/标签底）/ 金橙 #D78935（hover）/ 绛红 #A6514A（≤3处）/ 海盐蓝 #5B6A8C（只描边）
- 禁纯黑、禁大面积海盐蓝填充、禁黑底黄字
- 标题思源宋体 900 + 加宽字距；正文 PingFang/雅黑；数字 Archivo
- 现有全局样式 `src/styles/main.css` 已定义 CSS 变量（--paper/--surface/--cream/--ink/--tea/--yellow/--accent/--rouge/--brand-blue 等）与组件类（.chip/.tg/.btn-more 等），页面应直接复用变量，不新增色值
- 表单风格参考现有站点：奶油底、大圆角（16~22px）、细描边 --line、蜜黄主按钮
