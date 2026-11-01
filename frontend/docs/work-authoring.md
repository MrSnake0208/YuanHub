# Work Protocol v1 前端创作

YuanHub 的新建作业页位于 `/work/new`，原生作业编辑页位于 `/work/:id/edit`。两条路由都要求登录；未登录访问时沿用全站登录跳转，并携带原始 redirect。

编辑器直接维护 `yuanhub-work@1`：基本信息、固定五槽、回合内有序动作、公共延迟以及 MaaYuan/YuanAssist 扩展。保存请求只提交 `WorkDocument`，不会把兼容性结果或目标平台文档写回基础协议。

操作约定：

- 使用“上移 / 下移”调整同回合动作顺序，不支持拖拽。
- 保存前运行本地基础校验；后端仍是信任边界与最终校验者。
- Adapter 预览是显式操作，同时请求 MaaYuan 与 YuanAssist 现有 Adapter。
- 更新、发布、取消发布和删除都携带当前 revision；409 时保留本地内容并禁止自动覆盖。
- 页面关闭或路由离开前，如有未保存内容会提示用户。
- 本期没有自动保存、多人协作、审核流或 YuanAssist 批量导入。
