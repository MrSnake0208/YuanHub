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

## 2026-08-30 16:30:51

- service: apply_patch, npm, Node
- params: 反馈中心、反馈工作台、反馈权限页、共享反馈组件、移动导航与反馈 API 契约测试
- result: 实现紧凑工作区、桌面主从详情、移动端全屏详情、稳定分页、准确总数、提交人字段归一化、消息附件展示及权限弹窗布局优化
- status: success
- meta.locale: zh-CN
- meta.date: 2026-08-30 16:30:51

## 2026-08-30 17:03:56

- service: apply_patch
- params: `src/api/request.js`, `docs/api-contract.md`
- result: 将 YuanHub 默认后端地址从 `https://hub.maayuan.fun:16666` 切换为 `http://192.168.31.55:8080`
- status: success
- meta.locale: zh-CN
- meta.date: 2026-08-30 17:03:56

## 2026-08-30 17:31:55

- service: apply_patch
- params: `.env.example` / `.env`、`src/api/request.js`、API 配置说明
- result: 移除源码中的固定后端地址，改由 Vite 环境变量 `VITE_API_BASE` 配置；未配置时使用当前站点
- status: success
- meta.locale: zh-CN
- meta.date: 2026-08-30 17:31:55

## 2026-08-30 21:00:06

- service: apply_patch
- params: `src/utils/feedbackMedia.js`
- result: 将反馈媒体 composable 的局部 refs 包装为响应式对象，修复新建反馈、用户回复和管理员回复中嵌套状态未解包导致的截图选择器与提交控件持续禁用问题
- status: success
- meta.locale: zh-CN
- meta.date: 2026-08-30 21:00:06
