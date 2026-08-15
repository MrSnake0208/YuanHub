# 认证功能 · 研究结论（researcher 交付）

> 来源：对照 /Users/mrsnake/Desktop/yituliu/BackEndV3-Share 源码一一核实。
> 完整契约见 docs/api-contract.md（已存在且与后端源码一致，无缺漏）。

## 1. 后端事实（从源码读出的硬约束）

- 统一响应包装 ApiResult{statusCode,message,data}：成功 statusCode=200；失败 statusCode 对齐 HTTP 状态码、message 为可直接给用户看的中文提示。
- Jackson property-naming-strategy=SNAKE_CASE：请求与响应字段全部 snake_case（user_name / refresh_token / registration_token / original_password / new_password / active_code / valid_before / user_info / following_count / fans_count）。前端直接发 snake_case。
- 认证头：Authorization: Bearer <accessToken>（SecurityConfig 中 header 配置名即 Authorization）。
- Base URL http://localhost:8080，无 context-path；CORS 全开，Vite 5173 可直接调。
- 时间字段为 Instant → ISO-8601 字符串。
- 匿名白名单：/user/login、/user/register、/user/sendRegistrationToken；公开(permitAll)另含 /user/password/reset_request、/user/password/reset、/user/refresh、/user/info、/user/search；/user/update/** 需 JWT。

## 2. 接口速查（10 个）

| 接口 | 请求体/参数 | 成功 data |
|---|---|---|
| POST /user/login | {email, password} | token, valid_before, valid_after, refresh_token, refresh_token_valid_before, refresh_token_valid_after, user_info |
| POST /user/register | {email, user_name(4-24), password(8-32), registration_token} | MaaUserInfo |
| POST /user/sendRegistrationToken | {email} | - |
| POST /user/password/reset_request | {email} | - |
| POST /user/password/reset | {email, active_code, password} | - |
| POST /user/refresh | {refresh_token} | 同 login |
| GET /user/info?userId=xxx | query | MaaUserInfo；404 用户不存在: xxx |
| POST /user/update/password | {original_password, new_password(8-32)} | -（需 JWT）|
| POST /user/update/info | {user_name(4-24)} | -（需 JWT）|
| GET /user/search?userName=&page=&size= | query（size<=50）| MaaUserInfo[] |

MaaUserInfo = { id, user_name, activated(=status==1), following_count, fans_count }。

验证码：6 位，存 Redis vCodeEmail:{email}，600s(10分钟)有效；发送间隔=60s（重复发返回 403 至少需要间隔 60 秒）；一次性（校验即删）；本地 debug.email.no-send:true 时验证码打印在后端日志。

关键失败分支（前端直接复用后端 message）：
- login：401 用户不存在或者密码错误 / 401 用户未启用(status=0)
- register：400 用户名已存在,请重新取个名字吧 / 用户已存在；401 验证码错误
- reset_request：404 找不到用户；reset：401 验证码错误 / 404 找不到用户

## 3. 前端现状盘点（已存在 / 待建）

已存在：
- src/store/auth.js：完整认证单例（reactive 状态、localStorage yh_auth 持久化、init 恢复+静默刷新、setSession/logout/isLoggedIn）。可直接用。
- docs/api-contract.md：完整契约。
- src/styles/main.css：设计 token 齐全（--paper/--surface/--cream/--ink/--tea/--yellow/--accent/--rouge/--brand-blue 等），复用变量勿新增色值。
- 路由表 src/router/routes.js：目前只有 plaza/detail/cart，无 auth 页。

待建（团队任务范围）：
1. API 层：src/api/request.js（fetch 封装：baseURL、JSON、自动带 Bearer、401 静默刷新+重放、非200 抛错用 message）+ src/api/user.js（10 个接口函数）。
2. 三个页面 src/pages/user/：login.vue、register.vue、forgot.vue（含验证码发送/60s 倒计时提示）。
3. 路由注册 + 路由守卫（router.beforeEach）。
4. 侧边栏 src/components/IslandSidebar.vue 登录入口集成（已登录显示用户名+退出）。

## 4. 各角色一句话要点

- eng-api：严格 snake_case；request.js 401 静默刷新可参照 auth.store 的 silentRefresh；失败统一 reject({message}) 由页面直接展示。
- eng-pages：视觉复用 main.css 变量；表单布局参考 .toolbar/.notice/.btn 风格；验证码按钮 60s 倒计时。
- eng-ui：侧边栏底部登录/注册入口路由跳转；已登录显示 user_name + 退出(auth.logout)。
- reviewer：对照 api-contract.md 与 main.css 设计约束（禁纯黑/禁大面积海盐蓝/禁黑底黄字）。