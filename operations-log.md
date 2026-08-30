## 2026-08-30 00:01:45

- service: apply_patch
- params: `src/components/IslandSidebar.vue`
- result: 登录用户的桌面左侧导航新增“反馈中心”入口，指向 `/feedback` 并支持当前路径高亮
- status: success
- meta.locale: zh-CN
- meta.date: 2026-08-30 00:01:45

## 2026-08-30 13:38:17

- service: apply_patch
- params: `src/utils/authPermissions.js`, `src/api/admin.js`, `src/store/auth.js`, `src/api/request.js`
- result: 新增服务端管理权限模型与管理员 API；登录、恢复、刷新和退出接入权限生命周期；统一处理业务 401/403、图鉴错误结构与无 data 的成功响应
- status: success
- meta.locale: zh-CN
- meta.date: 2026-08-30 13:38:17

## 2026-08-30 13:47:22

- service: apply_patch
- params: 管理权限路由、个人中心入口、角色/反馈授权/审计/图鉴页面与相关契约测试
- result: 管理功能按具体权限显示和守卫；新增角色管理、审计、统一无权限页面；补齐自我降权和管理请求 403 的退出流程
- status: success
- meta.locale: zh-CN
- meta.date: 2026-08-30 13:47:22
