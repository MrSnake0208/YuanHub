# 教程暂时软隐藏

教程统一由 `src/config/features.js` 的 `FEATURE_KEYS.TUTORIALS` 控制。普通开发和生产构建默认关闭；只有 `VITE_TUTORIALS_ENABLED` 的值严格为字符串 `true` 才开启，未设置、空值、`false`、`TRUE`、`1` 均关闭。

本地恢复：在前端仓库 `YuanHub/.env.development.local` 中加入一行 `VITE_TUTORIALS_ENABLED=true`，使开启值只属于普通开发模式。使用已有 tunnel 模式时，对应文件为 `.env.tunnel.local`。在下一次通过根工作区 `./dev.sh frontend` 启动时生效；已有服务需要先按 AGENTS.md 取得重启授权。移除此行即可恢复默认关闭。不要把开启值放进生产环境或通用 `.env.local`；构建时变量需要重新构建后才生效。

覆盖全站 Onboarding、Today、密探名册/快捷录入、库存、游戏账号、MaaYuan 连接、星石识别/背包、招募教学/隔离练习、PWA 安装教学。关闭时不挂载教程组件、不初始化 Onboarding 控制器/轮询、不注册星石教程 DOM 监听；教程历史记录原样保留，不补写完成、跳过或永久禁用。当前 `/recruitment` 没有专用练习路由，关闭教程后仍保留正常登录/权限提示与真实工作区。

普通空状态、字段说明、截图重点示例、错误恢复和权限说明继续可用。星石实际工作区与 OCR/云端保存、招募真实记录/保底保存、密探与库存编辑、账号管理、MaaYuan 连接码均保留。`/install` 提供直接安装按钮（浏览器提供真实安装事件时）、安装方法与故障排查；当前自动安装邀请包含教学流程，因此随教程一起暂时隐藏，原生安装事件监听仍保留。

恢复前验证：手动入口可达、旧进度依据真实业务重新核验、账号切换与迟到响应隔离、教程退出不丢业务草稿、MaaYuan 同步证据、星石 OCR 核对保存、招募保存回读、iOS/Android 真机安装与取消恢复。不要靠清除 localStorage 或捏造完成状态恢复教程。

最小定向检查：

```bash
npm run test:behavior -- behavior/tutorialFeatures.spec.js behavior/tutorialsDisabled.spec.js behavior/installTutorialsDisabled.spec.js
node --test test/features.test.js test/onboarding.test.js test/pwaInstall.test.js test/pwaInstallResponsive.test.js
```

原教程行为测试已显式开启开关继续覆盖。Node 教程测试通过 `test-support/enableTutorials.js` 注入同一 Vite 环境值，仅用于测试，不影响普通构建。
